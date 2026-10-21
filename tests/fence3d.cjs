const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const read=require('./helpers/lib-source.cjs').read;
(async()=>{
 const Conf=JSON.parse(fs.readFileSync('data/leyers.jsonc','utf8'));Conf.default={birdseye:{}};
 const box=vm.createContext({performance,Conf,console:{log(){}},setTimeout,LayerCont:{palette:'color',styles:['barrier']},
  Layers:{barrier:{opacity:1}},SVGCont:{svg_style:()=>({color:'#597569',weight:1,opacity:1,fillOpacity:0})},
  chroma:()=>({rgba:()=>[89,117,105,1]}),maplibregl:{MercatorCoordinate:{fromLngLat(ll,height=0){return{x:ll[0]/360,y:ll[1]/360,z:height/40030228.884};}}}});
 vm.runInContext(read('@feature-core'),box);
 vm.runInContext(fs.readFileSync('lib/renderers/maplibre/mesh-renderer.js','utf8'),box);
 const run=code=>vm.runInContext(code,box);
 box.feature={type:'Feature',id:'fence',properties:{barrier:'fence'},geometry:{type:'LineString',coordinates:[[139,35],[139.0002,35],[139.0002,35.0001]]}};
 const before=JSON.stringify(box.feature);
 let mesh=run('getMapMakerFenceMesh(feature)');
 assert.equal(mesh.height,1.5);assert.equal(mesh.faces.length,0);assert.equal(mesh.panels.length,2);
 assert.ok(mesh.edges.length>30);assert.equal(mesh.edges.length,mesh.edgeWidths.length);
 for(const edge of mesh.edges)for(const point of edge){assert.ok(point.every(Number.isFinite));assert.ok(point[2]>=0&&point[2]<=1.5+1e-10);}
 const diagonal=mesh.edges.filter((edge,i)=>mesh.edgeWidths[i]===.6);
 assert.ok(diagonal.some(([a,b])=>(b[0]-a[0])*(b[2]-a[2])>0));
 assert.ok(diagonal.some(([a,b])=>(b[0]-a[0])*(b[2]-a[2])<0));
 assert.equal(JSON.stringify(box.feature),before);
 const emphasis=run('getMapMakerFenceMesh(feature,{viewZoom:19.1,tilt:25})');
 assert.ok(Math.abs(emphasis.strokeScale-3/3.46)<1e-10);
 assert.equal(emphasis.height,1.5);assert.ok(emphasis.displayHeight>emphasis.height);
 assert.ok(emphasis.displayHeight<=emphasis.height*2.5);
 const detailed=run('getMapMakerFenceMesh(feature,{viewZoom:21,tilt:45})');
 assert.equal(detailed.displayHeight,1.5);
 assert.ok(emphasis.edges.length<100,'coarser mesh avoids a dense gray band on a short fence');
 box.feature.properties={tags:{barrier:'fence',height:'8 ft'}};
 assert.equal(run('getMapMakerFenceMesh(feature).height'),2.4384);
 box.feature.properties={barrier:'fence',height:'2.4'};
 box.Layers.barrier.geojson=[box.feature];
 const bbox=[138.9999,34.9999,139.0003,35.0002];
 const exporter=run('new PrintSVGExporter({paper:"A4"})');
 const svg=exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45}});
 assert.match(svg,/data-fence-mesh="true"/);assert.match(svg,/data-height-m="2.4"/);
 assert.doesNotMatch(svg,/data-building-face|fill="(?!none)[^"]+"/);
 assert.doesNotMatch(exporter.toSVGFromLayers(bbox),/data-fence-mesh/);
 const worker=new(require('./helpers/svg-worker.cjs'))();
 const response=new Promise(resolve=>worker.onmessage=({data})=>resolve(data));
 worker.postMessage({id:1,snapshot:run('captureMapMakerExportSnapshot()'),exporterOptions:{paper:'A4'},bbox,options:{birdseye:{tilt:45}}});
 assert.equal((await response).svgText,svg,'actual Worker and main exporter share wire geometry');
 const model={id:1,mapmaker:{key:'barrier'},feature:box.feature,options:{color:'#597569',weight:1,opacity:1}};
 const Mesh=run('MapLibreMeshRenderer'),renderer=new Mesh({getCenter:()=>[139,35]});
 await renderer.prepare([model]);
 assert.equal(renderer.fillCount,0);assert.equal(renderer.count,run('getMapMakerFenceMesh(feature).edges.length'));
 assert.ok(renderer.data.every(Number.isFinite));
 model.options.opacity=0;renderer.update(model);
 for(let i=0;i<renderer.count;i++)assert.equal(renderer.data[i*11+9],0);
 model.options.opacity=1;model.options.weight=2;renderer.update(model);
 const first=run('getMapMakerFenceMesh(feature).edgeWidths[0]');assert.ok(Math.abs(renderer.data[10]-first*2)<1e-6);
 box.Layers.barrier.opacity=0;renderer.update(model);assert.equal(renderer.data[9],0);
 const original=box.feature;
 for(const type of ['MultiLineString','Polygon','MultiPolygon']){
  box.feature={...original,geometry:{type,coordinates:type==='MultiPolygon'?[[original.geometry.coordinates]]:[original.geometry.coordinates]}};
  assert.ok(run('getMapMakerFenceMesh(feature).edges.length')>0);
 }
 box.feature={...original,geometry:{type:'LineString',coordinates:[[139,35],[139,35],[NaN,35]]}};
 assert.equal(run('getMapMakerFenceMesh(feature).edges.length'),0);
 box.feature={...original,geometry:{type:'LineString',coordinates:[[0,0],[100,0]]}};
 assert.ok(run('getMapMakerFenceMesh(feature).edges.length')<=12000);
 console.log('PASS open diamond mesh, posts/rails, heights/feet, source preservation, geometry variants, bounded long fences, transparent SVG/Worker parity, GPU wires and visibility/width updates');
})().catch(error=>{console.error(error);process.exitCode=1;});
