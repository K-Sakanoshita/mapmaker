const readSource = require('./helpers/lib-source.cjs').read;
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async()=>{
const tree = { type: 'Feature', id: 'node/1', properties: { natural: 'tree' }, geometry: { type: 'Point', coordinates: [139,35] } };
const box = vm.createContext({ performance, setTimeout, console: { log() {} },
    Conf: { default: { Palette: 'color' }, pointStyle: { tree: { radius: 1.2, palette: { color: { lineColor: '#75a873', fillColor: '#9fc89d', width: 0 } } } },
        style: { color: { garden: { type: 'area' } } } },
    LayerCont: { palette: 'color', styles: ['garden'] },
    Layers: { garden: { opacity: 1, geojson: [tree] } },
    SVGCont: { svg_style: () => ({ color: '#75a873', fillColor: '#9fc89d', opacity: 1, fillOpacity: 1, weight: 0 }) }
});
const config=JSON.parse(fs.readFileSync('data/leyers.jsonc','utf8'));
box.Conf.pointStyle.tree=config.pointStyle.tree;
box.Conf.model3D=config.model3D;
vm.runInContext(readSource('@feature-core', 'utf8'), box);
const Exporter = vm.runInContext('PrintSVGExporter', box), partsFor = vm.runInContext('getMapMakerTreeParts', box);
const exporter = new Exporter({ paper: { widthMm: 120, heightMm: 100 }, marginMm: { top: 5, left: 5, right: 5, bottom: 5 } });
const bbox = [138.99996,34.99996,139.00004,35.00004];
const options = { birdseye: { tilt: 50, bearing: 25 } };
const flat = exporter.toSVGFromLayers(bbox), output = exporter.toSVGFromLayers(bbox, options);
assert.match(output, /data-tree-id="node\/1"/);
assert.match(output, /data-height-m="4"/);
assert.match(output, /fill="#8b6b4a"/); assert.match(output, /data-tree-crown="cone"/);
assert.doesNotMatch(output, /NaN|Infinity/);
assert.doesNotMatch(flat, /data-tree-id|data-building-face/);
const shapeFor=vm.runInContext('getMapMakerTreeShape',box);
for(const [tag,value,expected] of [['species','Cerasus × yedoensis','cherry'],['species','Prunus serrulata','cherry'],['species:ja','ソメイヨシノ','cherry'],['genus','Ginkgo','ginkgo'],['species','Ginkgo biloba','ginkgo'],['species','Prunus mume','cone'],['name','桜','cone']]){
 const variant={...tree,properties:{natural:'tree',[tag]:value}};
 assert.equal(shapeFor(variant),expected);
 const snapshot=JSON.stringify(variant),crown=partsFor(variant)[1];
 assert.equal(crown.mesh.shape,expected);
 assert.equal(crown.height,4);
 for(const face of crown.mesh.faces){assert.ok(face.points.flat().every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...face.normal)-1)<1e-8);}
 assert.equal(JSON.stringify(variant),snapshot,'source tags and coordinates stay untouched');
 if(expected!=='cone'){
  box.Layers.garden.geojson=[variant];
  assert.match(exporter.toSVGFromLayers(bbox,options),new RegExp('data-tree-crown="'+expected+'"'));
  variant.properties[tag]='unknown';assert.equal(partsFor(variant)[1].mesh.shape,'cone','cache follows changed tags');
 }
}
const savedRules=box.Conf.model3D.tree.rules;
box.Conf.model3D.tree.rules=[{model:'unsupported',when:{tag:'test:tree',values:['custom']}},{model:'ginkgo',when:{tag:'test:tree',values:['custom'],patterns:['[']}}];
assert.equal(shapeFor({...tree,properties:{'test:tree':' CUSTOM '}}),'ginkgo','configured tag and value determine the shape');
assert.equal(shapeFor({...tree,properties:{species:'Ginkgo biloba'}}),'cone','removed rules do not survive in JavaScript');
box.Conf.model3D.tree.rules=savedRules;
box.Layers.garden.geojson=[tree];
const parts = partsFor(tree);
assert.equal(parts.length, 2); assert.equal(parts[1].base, 1.8); assert.equal(parts[1].height, 4);
assert.equal(parts[0].height,2);
const metres=111319.49079327358*Math.cos(35*Math.PI/180);
assert.ok(Math.abs((parts[0].geometry.coordinates[0][0][0]-139)*metres-.22)<1e-6,'thicker trunk');
assert.ok(Math.abs((parts[1].geometry.coordinates[0][0][0]-139)*metres-1.02)<1e-6,'crown base is fifteen percent narrower');
const mesh=parts[1].mesh,slopes=mesh.faces.filter(face=>face.kind==='crown');
assert.equal(slopes.length,64);assert.equal(mesh.rounded,true);
assert.match(output,/data-tree-tip="rounded"/);
for(const face of slopes){
 assert.ok(face.points.length===3||face.points.length===4);
 assert.ok(face.points.every(p=>p[2]>=1.8&&p[2]<=4&&p.every(Number.isFinite)));
 assert.ok(face.normal[2]>0&&Math.abs(Math.hypot(...face.normal)-1)<1e-8);
 const midpoint=face.points.slice(0,2).reduce((n,p)=>[n[0]+(p[0]-139)/2,n[1]+(p[1]-35)/2],[0,0]);
 assert.ok(face.normal[0]*midpoint[0]+face.normal[1]*midpoint[1]>0,'slopes face outward');
}
const tips=slopes.filter(face=>face.points.length===3);
assert.equal(tips.length,16);assert.ok(tips.every(face=>face.normal[2]>.97),'tip flattens into a rounded cap');
assert.ok(tips.every(face=>face.points[2][2]===4),'rounding preserves the original total height');
const levels=[...new Set(slopes.flatMap(face=>face.points.map(p=>p[2])))].sort((a,b)=>a-b);
assert.equal(levels.length,5);assert.equal(levels[0],1.8);assert.equal(levels.at(-1),4);
assert.ok(slopes.every(face=>new Set(face.points.map(p=>p[2])).size===2),'continuous sloped faces have no horizontal ledges');
box.chroma=()=>({rgba:()=>[159,200,157,1]});
box.maplibregl={MercatorCoordinate:{fromLngLat:(ll,z=0)=>({x:ll.lng??ll[0],y:ll.lat??ll[1],z})}};
vm.runInContext(fs.readFileSync('lib/renderers/maplibre/mesh-renderer.js','utf8'),box);
const outlines=vm.runInContext('new MapLibreMeshRenderer({getCenter:()=>({lng:139,lat:35})})',box);
const model={id:1,feature:{...tree,geometry:parts[1].geometry},mapmaker:{key:'garden',pointStyleName:'tree',sourceFeature:tree},options:{color:'#75a873',fillColor:'#9fc89d',opacity:1,weight:0}};
await outlines.prepare([model]);assert.equal(outlines.fillCount,378);
for(let i=2;i<outlines.fillData.length;i+=7)assert.ok(levels.some(height=>Math.abs(outlines.fillData[i]-height)<1e-6),'GPU matches the shared rounded mesh altitudes');
for(const species of ['Cerasus × yedoensis','Ginkgo biloba']){
 const variant={...tree,properties:{natural:'tree',species}},crown=partsFor(variant)[1];
 const variantModel={...model,feature:{...variant,geometry:crown.geometry},mapmaker:{...model.mapmaker,sourceFeature:variant}};
 await outlines.prepare([variantModel]);
 assert.equal(outlines.fillCount,666,'all seven profile bands reach GPU triangles');
 assert.ok(Array.from(outlines.fillData).every(Number.isFinite));
 const radiusAt=altitude=>Math.max(...crown.mesh.faces.flatMap(f=>f.points).filter(p=>Math.abs(p[2]-altitude)<1e-8).map(p=>Math.hypot((p[0]-139)*metres,(p[1]-35)*111319.49079327358)));
 assert.ok(radiusAt(crown.base)<radiusAt(crown.base+(4-crown.base)*(species.startsWith('Cerasus')?.48:.65)),'crown spreads above its narrow underside');
}
await outlines.prepare([model]);
model.options.opacity=0;outlines.update(model);for(let i=6;i<outlines.fillData.length;i+=7)assert.equal(outlines.fillData[i],0);
model.options.opacity=1;outlines.update(model);assert.equal(outlines.fillData[6],1);
assert.deepEqual(parts[0].geometry.coordinates[0][0], parts[0].geometry.coordinates[0].at(-1));
for (const [height, expected] of [['10 ft',3.048], ['6 m',6], ['bad',4], ['-2',4]]) {
    tree.properties.height = height; assert.equal(partsFor(tree).at(-1).height, expected);
}
delete tree.properties.height;
// A raised crown uses its base altitude for both projection and frustum clipping.
const part = parts[1], polygon = { ...tree, geometry: part.geometry };
const clipped = [];
const tf = { camera: true, toPageMmXY: ([x,y], z=0) => [x,y-z], clipPolygon(points) { clipped.push(points); return points.map(([x,y,z=0]) => [x,y-z]); } };
exporter._buildingSVG(polygon,tf,{fill:'#9fc89d',fillOpacity:1},exporter.opts,part);
assert.ok(clipped.some(points => points.some(p => p[2] === 1.8)), 'crown walls start above ground');
assert.ok(clipped.some(points => points.length===3&&points.some(p=>p[2]===part.height)), 'cone slopes reach the shared apex');
box.Layers.garden.opacity = 0;
assert.doesNotMatch(exporter.toSVGFromLayers(bbox, options), /data-tree-id/);
box.Layers.garden.opacity = 1;
box.Layers.garden.svg = [{ id: 1, click() {}, options: { opacity: 0, fillOpacity: 0 }, mapmaker: { drawOrder: { featureOrder: 0, passOrder: 0 } } }];
assert.doesNotMatch(exporter.toSVGFromLayers(bbox, options), /data-tree-id/);
assert.match(exporter.toSVGFromLayers(bbox, { ...options, editorHitTargets: true, skipHiddenLayers: false }), /data-editor-id="1"/);
box.Layers.garden.svg = [];
const messages = [];
box.self = { postMessage: message => messages.push(message) }; box.importScripts = () => {};
vm.runInContext(fs.readFileSync('lib/workers/svg-export.js', 'utf8'), box);
box.self.onmessage({ data: { id: 1, snapshot: vm.runInContext('captureMapMakerExportSnapshot()',box), exporterOptions: exporter.opts, bbox, options } });
assert.equal(messages[0].svgText, output, 'worker and normal export match');
assert.equal(exporter.toSVGFromLayers(bbox), flat, '2D export is unchanged after 3D');
for(const species of ['Cerasus × yedoensis','Ginkgo biloba']){
 box.Layers.garden.geojson=[{...tree,properties:{natural:'tree',species}}];
 const expected=exporter.toSVGFromLayers(bbox,options);
 box.self.onmessage({data:{id:2,snapshot: vm.runInContext('captureMapMakerExportSnapshot()',box), exporterOptions:exporter.opts,bbox,options}});
 assert.equal(messages.at(-1).svgText,expected,'worker keeps configured species rules');
}
box.Layers.garden.geojson=[tree];
if (process.env.TREE_FIXTURE) fs.writeFileSync(process.env.TREE_FIXTURE, output);
console.log('PASS tree export shape, height/units/fallback, raised crown, visibility, editable hit target, worker parity and 2D');

})().catch(error=>{console.error(error);process.exitCode=1;});
