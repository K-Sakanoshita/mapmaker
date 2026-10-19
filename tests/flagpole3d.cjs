const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=require('./helpers/lib-source.cjs').read;
(async()=>{
 const config=JSON.parse(fs.readFileSync('data/leyers.jsonc','utf8'));
 const flag={type:'Feature',id:'node/1',properties:{man_made:'flagpole',country:'JP'},geometry:{type:'Point',coordinates:[139,35]}};
 const box=vm.createContext({console,Conf:{...config,default:{Palette:'color'}},LayerCont:{palette:'color',styles:['park']},Layers:{park:{opacity:1,geojson:[flag]}},SVGCont:{svg_style:()=>({opacity:1,fillOpacity:1})}});
 vm.runInContext(read('@feature-core'),box);
 const parts=vm.runInContext('getMapMakerPointParts',box);
 const snapshot=JSON.stringify(flag);
 assert.equal(vm.runInContext('getMapMakerPointStyleName',box)(flag),'flagpole');
 for(const [height,expected] of [[undefined,6],['12 m',12],['20 ft',6.096],['bad',6],['-3',6]]){
  const f={...flag,properties:{tags:{man_made:'flagpole',height}}};
  const p=parts(f);assert.equal(p[0].height,expected);assert.equal(p[0].mesh.height,expected);
  assert.ok(p[0].mesh.faces.flatMap(f=>f.points).flat().every(Number.isFinite));
  assert.ok(p[0].mesh.faces.flatMap(f=>f.points).every(p=>p[2]>=0&&p[2]<=expected));
 }
 assert.equal(parts({...flag,geometry:{type:'Polygon',coordinates:[]}}),null);
 assert.equal(parts({...flag,properties:{amenity:'bench'}}),null);
 assert.equal(parts({...flag,properties:{man_made:'flagpole','flag:colour':'red'}})[0].color,'#d64040');
 const Exporter=vm.runInContext('PrintSVGExporter',box),exporter=new Exporter();
 const bbox=[138.9999,34.9999,139.0001,35.0001],options={birdseye:{tilt:50,bearing:25}};
 const svg=exporter.toSVGFromLayers(bbox,options);
 assert.match(svg,/data-flagpole-id="node\/1"/);assert.match(svg,/data-flagpole-cloth="true"/);assert.match(svg,/data-height-m="6"/);
 assert.doesNotMatch(svg,/NaN|Infinity|data-tree-tip/);
 assert.doesNotMatch(exporter.toSVGFromLayers(bbox),/data-flagpole-id/);
 const Worker=require('./helpers/svg-worker.cjs'),worker=new Worker();
 const state=vm.runInContext('captureMapMakerExportSnapshot()',box);
 const result=await new Promise(resolve=>{worker.onmessage=event=>resolve(event.data);worker.postMessage({id:1,snapshot:JSON.parse(JSON.stringify(state)),exporterOptions:exporter.opts,bbox,options});});
 assert.equal(result.svgText ?? result,svg,'actual Worker uses same point components');
 box.LayerCont.palette='mono';assert.equal(parts(flag)[0].color,'#dddddd');
 box.LayerCont.palette='color';box.Layers.park.opacity=0;assert.doesNotMatch(exporter.toSVGFromLayers(bbox,options),/data-flagpole-id/);box.Layers.park.opacity=1;
 assert.equal(JSON.stringify(flag),snapshot,'original position and tags unchanged');
 const osm=JSON.parse(fs.readFileSync('data/overpass-system.jsonc','utf8')).osm;
 assert.ok(osm.park.tags.includes('man_made=flagpole'));assert.ok(osm.park.overpass.includes('nwr["man_made"]'));
 console.log('PASS automatic flagpole selection, units/default, shared geometry, flat/3D export, worker parity, palettes, visibility and immutable source');
})().catch(e=>{console.error(e);process.exitCode=1;});
