const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const geometry = {type:'Polygon',coordinates:[[[139,35],[139.001,35],[139.001,35.001],[139,35]]]};
const original = [
    {id:'background',type:'background',paint:{'background-color':'#fafafa'}},
    {id:'building',type:'fill',source:'vector','source-layer':'building',paint:{'fill-color':'#ccc'}},
    {id:'building-3d',type:'fill-extrusion',source:'vector','source-layer':'building',filter:['all',['!has','hide_3d']],paint:{'fill-extrusion-color':'#ccc'}},
    {id:'labels',type:'symbol',source:'vector','source-layer':'building',layout:{visibility:'visible'},paint:{'text-color':'#444'}}
];
const layers = new Map(original.map(layer => [layer.id,structuredClone(layer)])), states = new Map(); let sourceAdds = 0;
const gl = { getLayer:id=>layers.get(id), addLayer:l=>layers.set(l.id,structuredClone(l)), removeLayer:id=>layers.delete(id),
    setLayoutProperty(id,key,val){(layers.get(id).layout ||= {})[key]=val;},
    setPaintProperty(id,key,val){assert.ok(!key.startsWith('fill-') || layers.get(id).type !== 'symbol'); (layers.get(id).paint ||= {})[key]=val;},
    setFilter(id,f){layers.get(id).filter=f;}, setFeatureState(target,state){states.set(`${target.sourceLayer}:${target.id}`,state);},
    removeFeatureState(target){states.delete(`${target.sourceLayer}:${target.id}`);}, triggerRepaint(){},
    querySourceFeatures:()=>[{id:1232,geometry,properties:{}},{id:1240,geometry,properties:{}}], addSource(){sourceAdds++;}
};
const models = new Map([123,124,125].map(id=>[id,{id,feature:{type:'Feature',id:`way/${id}`,geometry,properties:{building:'yes',height:'6'}},
    mapmaker:{key:'building'},options:{opacity:1}}]));
const box = vm.createContext({ console, Layers:{background:{color:'#fff',opacity:1},building:{opacity:''}},
    Conf:{default:{birdseye:{defaultHeight:3}},style:{color:{building:{}}}},LayerCont:{palette:'color'},
    SVGCont:{svg_style:()=>({color:'#999',fillColor:'#abc',weight:.5})}
});
vm.runInContext(fs.readFileSync('lib/geolib.js','utf8'),box);
vm.runInContext(fs.readFileSync('lib/maplibre-vector-editor.js','utf8'),box);
const Vector = vm.runInContext('MapLibreVectorEditor',box), view={gl,threeD:false,vectorBasemapStyleLayers:original}, vector=new Vector(view);
const bindings=vector.bind(models);
assert.equal(layers.get('labels').layout.visibility,'visible','existing map stays visible until supplemental data is ready');
vector.activate(models);
assert.equal(bindings.has(123),true,'typed base-10 ID is verified against OSM geometry');
assert.equal(bindings.has(124),true,'legacy base-10 ID is verified against OSM geometry');
assert.equal(bindings.has(125),false,'unmatched OSM model must be rendered in supplemental data');
assert.equal(sourceAdds,0,'base vector source is never recreated');
assert.equal(layers.get('building').layout.visibility,'visible');
assert.equal(layers.get('building-3d').layout.visibility,'none');
assert.equal(layers.get('labels').layout.visibility,'none');
assert.equal(states.get('building:1232').height,6,'OSM height is shared with the tile renderer');
assert.equal(layers.get('building-3d-editor-hit').paint['fill-extrusion-opacity'],0,'hit layer cannot write GPU depth');
assert.deepEqual(Array.from(layers.get('building-3d-editor-hit').filter[2][2][1]),[],'visible tile buildings are excluded from hit layer');
const hidden=models.get(123);hidden.options.opacity=0;vector.update(hidden);
assert.equal(states.get('building:1232').opacity,0);
assert.deepEqual(Array.from(layers.get('building-3d-editor-hit').filter[2][2][1]),[1232]);
assert.ok(JSON.stringify(layers.get('building-3d').filter).includes('1232'));
assert.equal(vector.modelFor({id:1232,source:'vector',sourceLayer:'building'}),hidden,'click resolves to the exact export model');
hidden.options.opacity=1;vector.update(hidden);
assert.deepEqual(JSON.parse(JSON.stringify(layers.get('building-3d').filter.at(-1)[1][2][1])),[],'restore clears only the hidden IDs while retaining validated tile IDs');
box.Layers.building.opacity=0;vector.refresh('building');
assert.equal(layers.get('building-3d').paint['fill-extrusion-opacity'],0);
box.Layers.building.opacity=1;view.threeD=false;vector.refresh();
assert.equal(layers.get('building').layout.visibility,'visible');
assert.equal(layers.get('building-3d').layout.visibility,'none');
view.threeD=true;
assert.equal(vector.bind(models).size,0,'3D buildings use the same authoritative source as export, avoiding coplanar tile/model faces');
vector.activate(models);
assert.deepEqual(Array.from(layers.get('building-3d').filter[2][2][1]),[],'tile buildings are excluded when supplemental 3D buildings are drawn');
view.threeD=false;
const ambiguous = new Map([['way/123',[models.get(123)]],['relation/123',[{...models.get(123),feature:{...models.get(123).feature,id:'relation/123'}}]]]);
assert.equal(vector.match({id:1230,geometry,properties:{}},'building',ambiguous),null,'ambiguous IDs are not bound to a different OSM object');
const distant={type:'Polygon',coordinates:[[[140,36],[140.001,36],[140.001,36.001],[140,36]]]};
assert.equal(vector.match({id:1232,geometry:distant,properties:{}},'building',new Map([['way/123',[models.get(123)]]])),null,'same ID at a different location is rejected');
assert.deepEqual(JSON.parse(JSON.stringify(Vector.filterExpression(['all',['!has','hide_3d'],['in','class','primary','trunk']]))),
    ['all',['!',['has','hide_3d']],['in',['get','class'],['literal',['primary','trunk']]]]);
vector.clear();
assert.equal(states.size,0);assert.equal(layers.size,original.length);
assert.equal(layers.get('building-3d').paint['fill-extrusion-color'],'#ccc');
assert.equal(layers.get('labels').layout.visibility,'visible');
console.log('PASS existing vector source reuse, conservative OSM ID/geometry matching, category styles, hide/restore/export identity, 2D/3D and style restoration');
