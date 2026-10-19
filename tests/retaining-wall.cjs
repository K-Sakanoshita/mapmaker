const readSource = require('./helpers/lib-source.cjs').read;
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box=vm.createContext({console:{log(){}},Conf:{default:{birdseye:{}},style:{color:{barrier:{type:'line'}}}},LayerCont:{palette:'color',styles:['barrier']},Layers:{barrier:{opacity:1}},SVGCont:{svg_style:()=>({color:'#64321480',weight:1,opacity:1})}});
vm.runInContext(readSource('@feature-core','utf8'),box);
const feature={type:'Feature',id:'wall',properties:{barrier:'retaining_wall',height:'20'},geometry:{type:'LineString',coordinates:[[135,35],[135.001,35]]}};
const before=JSON.stringify(feature),run=(code,params={})=>{Object.assign(box,params);return vm.runInContext(code,box);};
const symbols=run('getMapMakerRetainingWallSymbols(feature,1)',{feature});
assert.ok(symbols.coordinates.length>=3);
for(const [ring] of symbols.coordinates){assert.ok(ring.every(p=>p[1]<35),'eastward way symbols lie on the right/south side');assert.ok(ring[2][1]<ring[0][1],'tip points farther toward the low side');}
const reversed=run('getMapMakerRetainingWallSymbols(feature,1)',{feature:{...feature,geometry:{type:'LineString',coordinates:feature.geometry.coordinates.slice().reverse()}}});
assert.ok(reversed.coordinates.every(([r])=>r.every(p=>p[1]>35)),'reversed way points north');
assert.ok(run('getMapMakerRetainingWallSymbols(feature,.5)',{feature}).coordinates.length>symbols.coordinates.length,'zoom adjusts spacing to display size');
const bent={...feature,geometry:{type:'LineString',coordinates:[[135,35],[135.0001,35],[135.0001,35],[135.0001,35.001]]}};
const b=run('getMapMakerRetainingWallSymbols(feature,1)',{feature:bent});assert.ok(b.coordinates.flat(2).flat().every(Number.isFinite));
assert.ok(b.coordinates.some(([r])=>r[2][0]>135.0001),'northward segment points east');
assert.deepEqual(JSON.parse(JSON.stringify(run('getMapMakerRetainingWallSymbols(feature,1)',{feature:{...feature,properties:{barrier:'retaining_wall',height:'1'}}}))),JSON.parse(JSON.stringify(symbols)),'height does not change flat symbols');
assert.equal(run('isMapMakerExtrudedBarrier(feature)',{feature}),false);
box.Layers.barrier.geojson=[feature];const exporter=run('new PrintSVGExporter({paper:"A4"})'),bbox=[134.999,34.999,135.002,35.001];
for(const options of [{},{birdseye:{tilt:45,bearing:0}}]){
 const svg=exporter.toSVGFromLayers(bbox,options);assert.match(svg,/data-retaining-wall-symbols="true"/);assert.match(svg,/stroke-dasharray/);assert.doesNotMatch(svg,/NaN|Infinity|data-height-m|data-building-face/);
}
box.Layers.barrier.opacity=0;assert.doesNotMatch(exporter.toSVGFromLayers(bbox),/data-retaining-wall-symbols/);
assert.equal(JSON.stringify(feature),before,'original way order and tags are preserved');
console.log('PASS retaining-wall flat low-side symbols, reversed/bent/duplicate ways, zoom spacing, height independence, dashed 2D/3D SVG, hide and immutable source');
