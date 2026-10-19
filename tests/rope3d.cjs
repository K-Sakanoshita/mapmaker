const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=require('./helpers/lib-source.cjs').read;
(async()=>{
 const Conf=JSON.parse(fs.readFileSync('data/leyers.jsonc','utf8'));Conf.default={birdseye:{}};
 Conf.osm=JSON.parse(fs.readFileSync('data/overpass-system.jsonc','utf8')).osm;
 const box=vm.createContext({Conf,LayerCont:{palette:'color',styles:['barrier']},Layers:{barrier:{opacity:1}},console:{log(){}},
  SVGCont:{svg_style:()=>({color:'#8a7860',weight:1,opacity:1,fillOpacity:0})}});
 vm.runInContext(read('@feature-core'),box);
 vm.runInContext(fs.readFileSync('lib/osm/classifier.js','utf8'),box);
 const run=code=>vm.runInContext(code,box);
 box.rope={type:'Feature',id:'rope',properties:{barrier:'rope'},geometry:{type:'LineString',coordinates:[[139,35],[139.0001,35]]}};
 const before=JSON.stringify(box.rope),mesh=run('getMapMakerBarrierMesh(rope)');
 assert.equal(mesh.shape,'rope');assert.equal(mesh.height,1);assert.equal(mesh.faces.length,0);
 const posts=mesh.edges.filter((edge,i)=>mesh.edgeWidths[i]===1.6),curves=mesh.edges.filter((edge,i)=>mesh.edgeWidths[i]===1.1);
 assert.ok(posts.length>=2);assert.equal(curves.length,(posts.length-1)*8);
 for(let i=0;i<curves.length;i+=8){
  const span=curves.slice(i,i+8);
  assert.equal(span[0][0][2],1);assert.equal(span[7][1][2],1);
  assert.ok(span[3][1][2]<1&&span[3][1][2]>.7,'middle sags while remaining above ground');
  for(let j=1;j<8;j++)assert.deepEqual(span[j-1][1],span[j][0]);
 }
 assert.equal(JSON.stringify(box.rope),before);
 assert.ok(run('new OsmClassifier(Conf.osm).set_targets([rope])[0]').includes('barrier'),'rope is classified into the acquired/editable barrier category');
 box.rope.properties={tags:{barrier:'rope',height:'6 ft'}};
 assert.equal(run('getMapMakerBarrierMesh(rope).height'),1.8288000000000002);
 box.rope.properties={barrier:'rope',height:'invalid'};assert.equal(run('getMapMakerBuildingHeight(rope)'),1);
 box.rope.properties={barrier:'rope',height:'1.2'};box.Layers.barrier.geojson=[box.rope];
 const exporter=run('new PrintSVGExporter({paper:"A4"})'),bbox=[138.9999,34.9999,139.0002,35.0002],options={birdseye:{tilt:45}};
 const svg=exporter.toSVGFromLayers(bbox,options);
 assert.match(svg,/data-rope-mesh="true"/);assert.match(svg,/data-height-m="1.2"/);
 assert.doesNotMatch(svg,/data-fence-mesh|data-building-face/);
 assert.doesNotMatch(exporter.toSVGFromLayers(bbox),/data-rope-mesh/);
 const worker=new(require('./helpers/svg-worker.cjs'))();
 const response=new Promise(resolve=>worker.onmessage=({data})=>resolve(data));
 worker.postMessage({id:1,snapshot:run('captureMapMakerExportSnapshot()'),exporterOptions:{paper:'A4'},bbox,options});
 assert.equal((await response).svgText,svg);
 box.Layers.barrier.opacity=0;assert.doesNotMatch(exporter.toSVGFromLayers(bbox,options),/data-rope-mesh/);
 box.rope.geometry={type:'MultiLineString',coordinates:[[[139,35],[139,35]],[[139,35],[139.0001,35],[139.0001,35.0001]]]};
 assert.ok(run('getMapMakerBarrierMesh(rope).edges').flat(2).every(Number.isFinite));
 delete Conf.model3D;assert.equal(run('getMapMaker3DModel(rope,"barrier")'),'rope');
 console.log('PASS rope acquisition classification, supports and sag continuity, tagged/default heights, immutable geometry, SVG/Worker parity, flat 2D, hidden categories and legacy rules');
})().catch(error=>{console.error(error);process.exitCode=1;});
