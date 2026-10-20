const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 const context=vm.createContext({console:{log(){}},setTimeout,Conf:{default:{birdseye:{}},style:{color:{building:{type:'area'}}}},Layers:{building:{opacity:1}},LayerCont:{palette:'color',styles:['building']},SVGCont:{svg_style:()=>({fillColor:'#ddd',color:'#aaa',weight:1,fillOpacity:1,opacity:1})}});
 vm.runInContext(readSource('@feature-core','utf8'),context);
 const rect=(x,y,w,h)=>[[[135+x*.0001,35+y*.0001],[135+(x+w)*.0001,35+y*.0001],[135+(x+w)*.0001,35+(y+h)*.0001],[135+x*.0001,35+(y+h)*.0001],[135+x*.0001,35+y*.0001]]];
 const feature=(id,geometry,tags)=>({type:'Feature',id,properties:tags,geometry:{type:'Polygon',coordinates:geometry}});
 const parent=feature('way/1',rect(0,0,10,10),{building:'yes',height:'99'});
 const lower=feature('way/2',rect(0,0,5,10),{'building:part':'yes',height:'6'});
 const upper=feature('way/3',rect(5,0,5,10),{'building:part':'yes',height:'12',min_height:'3'});
 const orphan=feature('way/4',rect(12,0,2,2),{'building:part':'yes',height:'5',min_height:'2'});
 const run=(expression,params={})=>{Object.assign(context,params);return vm.runInContext(expression,context);};
 const range=tags=>run('getMapMakerBuildingRange(feature)',{feature:{properties:{'building:part':'yes',...tags}}});
 assert.equal(range({height:'13',min_height:'10'}).height,13);assert.equal(range({height:'13',min_height:'10'}).base,10);
 assert.equal(range({'building:levels':'6','building:min_level':'2'}).height,18);assert.equal(range({'building:levels':'6','building:min_level':'2'}).base,6);
 assert.equal(range({height:'40 ft',min_height:'10 ft'}).base,3.048);
 assert.equal(range({height:'10',min_height:'0','building:min_level':'2'}).base,0,'explicit zero wins');
 assert.equal(range({min_height:'10'}).height,13,'unknown thickness defaults to one floor above base');
 assert.equal(range({height:'3',min_height:'10'}).valid,false);
 assert.equal(range({height:'8',min_height:'bad','building:min_level':'1'}).base,3);
 for(const tags of [{height:'NaN',min_height:'-1'},{height:'Infinity',min_height:'oops'}])assert.equal(range(tags).valid,true);
 const data=[parent,lower,upper,orphan],before=JSON.stringify(data);
 const parts=run('getMapMakerBuildingParts(data)',{data});
 assert.deepEqual([...parts.outlines],['way/1']);assert.deepEqual([...parts.parts],['way/2','way/3']);assert.equal(JSON.stringify(data),before);
 assert.equal(run('shouldRenderMapMakerBuilding(parent,true,parts)',{parent,parts}),false);
 assert.equal(run('shouldRenderMapMakerBuilding(lower,false,parts)',{lower}),false);
 assert.equal(run('shouldRenderMapMakerBuilding(orphan,false,parts)',{orphan}),true);
 context.Layers.building.geojson=data;
 const exporter=run('new PrintSVGExporter({paper:"A4"})'),bbox=[134.999,34.999,135.003,35.002];
 const svg=exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45,bearing:30}});
 assert.ok(!svg.includes('data-building-id="way/1"'));for(const id of ['way/2','way/3','way/4'])assert.ok(svg.includes(`data-building-id="${id}"`));
 assert.doesNotMatch(svg,/NaN|Infinity/);const flat=exporter.toSVGFromLayers(bbox,{birdseye:null});assert.ok(flat.includes('<path'));
 // A wide low part must never paint over the tower/roof of the same outline.
 const broad=feature('broad',rect(0,0,10,10),{'building:part':'yes',height:'22'});
 const tower=feature('tower',rect(4,4,2,2),{'building:part':'yes',height:'63','roof:height':'14','roof:shape':'pyramidal'});
 const middle=feature('middle',rect(3,3,4,4),{'building:part':'yes',height:'47'});
 for(const bearing of [-103.4,0,90,180])for(const order of [[parent,tower,middle,broad],[broad,middle,tower,parent]]){
  context.Layers.building.geojson=order;
  const output=exporter.toSVGFromLayers(bbox,{birdseye:{tilt:30,bearing}});
  const at=id=>output.indexOf(`data-building-id="${id}"`);
  assert.ok(['broad','middle','tower'].every(id=>at(id)>=0));
  assert.match(output,/<mask id="building-visibility-/,'compound faces carry vector depth masks independently of bearing/input order');
  assert.match(output,/data-roof-shape="pyramidal"/);
 }
 context.Layers.building.geojson=data;
 // A rooftop tower supplements the supporting hotel instead of erasing it.
 const hotel=feature('hotel',rect(0,0,10,10),{building:'hotel',height:'30.8'});
 const mounted=feature('mounted',rect(4,4,2,2),{'building:part':'yes',height:'38',min_height:'30.8'});
 const antenna=feature('antenna',rect(4.5,4.5,1,1),{'building:part':'yes',height:'50',min_height:'38'});
 const mountedContext=run('getMapMakerBuildingParts(data)',{data:[hotel,mounted,antenna]});
 assert.equal(mountedContext.outlines.has('hotel'),false,'roof-mounted parts do not replace the supporting volume');
 assert.ok(mountedContext.parts.has('mounted'));
 assert.equal(run('shouldRenderMapMakerBuilding(feature,true,parts)',{feature:hotel,parts:mountedContext}),true);
 context.Layers.building.geojson=[hotel,mounted,antenna];
 const mountedSvg=exporter.toSVGFromLayers(bbox,{birdseye:{tilt:30,bearing:0}});
 for(const id of ['hotel','mounted','antenna'])assert.ok(mountedSvg.includes(`data-building-id="${id}"`));
 assert.match(mountedSvg,/<mask id="building-visibility-/,'support and rooftop parts share depth masks');
 assert.equal(run('getMapMakerBuildingParts(data)',{data:[hotel,{...mounted,properties:{...mounted.properties,min_height:'20'}}]}).outlines.has('hotel'),false,'elevated parts inside the height range still preserve the supporting volume');
 // An annular roof with small elevated parts must keep its full outline and courtyard.
 const ring=feature('annular-roof',[...rect(0,0,10,10),...rect(2,2,6,6)],{building:'roof',height:'20'});
 const roofPart=feature('raised-roof-part',rect(.2,.2,1,1),{'building:part':'yes',height:'20',min_height:'17.8'});
 const roofData=[ring,roofPart],roofBefore=JSON.stringify(roofData);
 const roofContext=run('getMapMakerBuildingParts(data)',{data:roofData});
 assert.equal(roofContext.outlines.has(ring.id),false,'upper details cannot erase an annular roof');
 assert.equal(roofContext.parents.get(roofPart.id),ring.id,'raised parts retain the parent association');
 assert.equal(run('shouldRenderMapMakerBuilding(feature,true,parts)',{feature:ring,parts:roofContext}),true);
 context.Layers.building.geojson=roofData;
 const roofSvg=exporter.toSVGFromLayers(bbox,{birdseye:{tilt:30,bearing:0}});
 assert.match(roofSvg,/data-building-id="annular-roof"/);assert.match(roofSvg,/data-building-id="raised-roof-part"/);
 assert.equal(JSON.stringify(roofData),roofBefore,'shared selection leaves geometry and heights untouched');
 const fullRoof={...roofPart,id:'full-roof-part',geometry:ring.geometry};
 assert.equal(run('getMapMakerBuildingParts(data)',{data:[ring,fullRoof]}).outlines.has(ring.id),true,'a full-footprint part still replaces the outline');
 context.Layers.building.geojson=data;
 // Intersecting projected planes hide only the region that is actually nearer.
 const maskExporter=run('new PrintSVGExporter({paper:"A4"})');
 const surface=(svg,rings,edge=false)=>({svg,rings,edge,opaque:!edge});
 const behind={serial:100,svg:'<g id="target"/>',surfaces:[surface('<g id="target"/>',[[[0,0,.5],[10,0,.5],[10,10,.5],[0,10,.5]]])]};
 const crossing={serial:101,svg:'<g id="crossing"/>',surfaces:[surface('<g id="crossing"/>',[[[0,0,.4],[10,0,.6],[10,10,.6],[0,10,.4]]])]};
 maskExporter._maskBuildingParts([behind,crossing],{camera:true,toPageMmXY:p=>p,depthAt:(_,z)=>z},maskExporter.opts);
 const black=behind.svg.match(/<path d="([^"]+)" fill="black"/)[1];
 const numbers=black.match(/-?\d+(?:\.\d+)?/g).map(Number);
 assert.ok(numbers.filter((_,i)=>i%2===0).every(x=>x<=5.00001),'only the near half of an intersecting face occludes');
 assert.match(crossing.svg,/M5 /,'the other half occludes the crossing face');
 assert.match(behind.svg,/<g id="target"\/>/,'original editable surface survives the mask');
 assert.doesNotMatch(behind.svg,/width="20000"/,'compound parts do not allocate giant PNG raster masks');
 assert.match(behind.svg,/<mask[^>]*width="14"[^>]*height="14"/,'mask bounds follow the projected surface plus stroke padding');
 const unfilled={serial:102,svg:'wire',surfaces:[{...crossing.surfaces[0],svg:'wire',opaque:false}]};
 const visible={...behind,svg:'<g id="target"/>'};
 maskExporter._maskBuildingParts([visible,unfilled],{camera:true,toPageMmXY:p=>p,depthAt:(_,z)=>z},maskExporter.opts);
 assert.equal(visible.svg,'<g id="target"/>','unfilled faces do not hide other surfaces');
 // Ensure the SVG volume starts above ground without changing the absolute top.
 const projected=[];
 exporter._buildingSVG(upper,{camera:true,toPageMmXY:(ll,z)=>{projected.push(z);return [ll[0],ll[1]-z];}}, {fill:'#ddd',fillOpacity:1,stroke:'#aaa'}, {...exporter.opts,birdseye:{tilt:45}});
 assert.ok(projected.includes(3));assert.ok(projected.includes(12));assert.ok(!projected.includes(0));
 const courtyard=feature('hole', [...rect(0,0,10,10),rect(3,3,4,4)[0]],{building:'yes'});
 for(const part of [feature('inside-hole',rect(4,4,1,1),{'building:part':'yes'}),feature('covers-hole',rect(0,0,10,10),{'building:part':'yes'})]){
  const match=run('getMapMakerBuildingParts(data)',{data:[courtyard,part]});assert.equal(match.outlines.size,0,'courtyard is not building volume');
 }
 const crossed=feature('crossed',rect(8,8,4,4),{'building:part':'yes'});
 assert.equal(run('getMapMakerBuildingParts(data)',{data:[parent,crossed]}).outlines.size,0,'partial bbox overlap is not membership');
 const small=feature('small',rect(0,0,5,10),{building:'yes'});
 assert.deepEqual([...run('getMapMakerBuildingParts(data)',{data:[parent,small,lower]}).outlines],['small'],'prefer the closest containing outline');
 const multiParent={...parent,id:'multi',geometry:{type:'MultiPolygon',coordinates:[rect(0,0,3,3),rect(7,7,3,3)]}};
 const multiPart={...lower,id:'multi-part',geometry:{type:'MultiPolygon',coordinates:[rect(1,1,1,1),rect(8,8,1,1)]}};
 assert.deepEqual([...run('getMapMakerBuildingParts(data)',{data:[multiParent,multiPart]}).outlines],['multi']);
 const badPart={...lower,id:'invalid',properties:{'building:part':'yes',height:'2',min_height:'5'}};
 assert.equal(run('getMapMakerBuildingParts(data)',{data:[parent,badPart]}).outlines.size,0,'invalid volumes cannot erase the outline');
 // Explicit building relations allow overhangs, and are preserved outside OSM tags.
 const relatedParent=structuredClone(parent),overhang=structuredClone(crossed);
 relatedParent.mapmakerBuildingRelations=[{id:'relation/5',role:'outline'}];overhang.mapmakerBuildingRelations=[{id:'relation/5',role:'part'}];
 assert.deepEqual([...run('getMapMakerBuildingParts(data)',{data:[relatedParent,overhang]}).outlines],['way/1']);
 // Exercise actual OSM conversion, relation annotation and classification in the data worker.
 const osm=require('./helpers/osm-fixture.cjs')([135,35]);
 const first=osm.elements.find(e=>e.type==='way'&&e.tags.building),part=osm.elements.find(e=>e.type==='way'&&e.tags['building:part']);
 osm.elements.push({type:'relation',id:900,members:[{type:'way',ref:first.id,role:'outline'},{type:'way',ref:part.id,role:'part'}],tags:{type:'building'}});
 let result;const worker=vm.createContext({console:{log(){}},postMessage:data=>{result=data;}});worker.self=worker;
 worker.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join('lib/workers',file.split('?')[0]),'utf8'),worker));
 vm.runInContext(fs.readFileSync('lib/workers/map-data.js','utf8'),worker);
 worker.self.onmessage({data:{osmxml:osm,osm:JSON.parse(fs.readFileSync('data/overpass-system.jsonc','utf8')).osm}});
 assert.ok(!result.error,result.error);const annotated=result.result.geojson.find(f=>f.id===`way/${part.id}`);
 assert.equal(annotated.mapmakerBuildingRelations[0].role,'part');assert.equal(annotated.properties['building:part'],'yes');
 console.log('PASS absolute top/base heights, skipped levels/units, invalid data, SVG lifted volumes, 2D/3D parent selection, orphan parts, courtyard/overlap guards, closest outline and actual-worker relation metadata');
})().catch(error=>{console.error(error);process.exitCode=1;});
