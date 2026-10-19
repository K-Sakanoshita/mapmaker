const readSource = require('./helpers/lib-source.cjs').read;
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    const geometry = { type:'LineString',coordinates:[[135.509,34.703],[135.510,34.703]] };
    const native = [
        {id:'background',type:'background'},
        {id:'road-primary',type:'line',source:'vector','source-layer':'transportation',filter:['==','class','primary']},
        {id:'road-motorway',type:'line',source:'vector','source-layer':'transportation',filter:['==','class','motorway']},
        {id:'labels',type:'symbol',source:'vector','source-layer':'transportation'}
    ];
    let stack = [...native]; const sources = new Map();
    const gl = { on(){}, once(_,fn){queueMicrotask(fn);}, setLight(){}, triggerRepaint(){},
        getLayer:id=>stack.find(l=>l.id===id),
        addLayer(layer,before){const i=before?stack.findIndex(l=>l.id===before):-1; if(before)assert.ok(i>=0); stack.splice(i<0?stack.length:i,0,layer);},
        removeLayer(id){stack=stack.filter(l=>l.id!==id);},
        addSource(id,source){sources.set(id,source);},getSource:id=>sources.get(id),removeSource(id){sources.delete(id);},
        setFilter(){},setPaintProperty(){},setLayoutProperty(){},setFeatureState(){},removeFeatureState(){},
        querySourceFeatures:()=>[ {id:100,geometry,properties:{class:'primary'}},{id:200,geometry,properties:{class:'motorway'}},{id:600,geometry,properties:{class:'primary'}} ] };
    const order=(styleOrder,osmLayer=0,passOrder=0)=>({osmLayer,styleOrder,passOrder,featureOrder:0});
    const model=(id,key,drawOrder,shape=geometry)=>({id,feature:{type:'Feature',id:`way/${id}`,properties:{},geometry:shape},
        mapmaker:{id:0,key,drawOrder},options:{opacity:1,fillOpacity:1,fillColor:'#aabbcc',color:'#112233',weight:1}});
    const primary=model(100,'highway_primary',order(180)), motorway=model(200,'highway_motorway',order(190));
    const park=model(300,'park',order(20),{type:'Polygon',coordinates:[[[135.509,34.703],[135.510,34.703],[135.510,34.704],[135.509,34.703]]]});
    const path=model(400,'highway_alley',order(160)), bridge=model(500,'highway_alley',order(160,1));
    const raisedRoad=model(600,'highway_primary',order(180,2));raisedRoad.feature.properties={highway:'primary',bridge:'yes',layer:'2'};
    const deck=model(700,'pedestrian',order(70,2),park.feature.geometry);deck.feature.properties={man_made:'bridge',layer:'2'};
    const view={gl,threeD:false,vectorBasemapStyleLayers:native,features:new Map([primary,motorway,park,path,bridge,raisedRoad,deck].map(m=>[m.id,m]))};
    const keys=['background','pedestrian','park','highway_alley','highway_primary','highway_motorway'];
    const box=vm.createContext({console,queueMicrotask,setTimeout,MapLibreMeshRenderer:class {async prepare(){}},mapMaker:{customMode:true},
        Conf:{default:{birdseye:{}},style:{color:Object.fromEntries(keys.map(k=>[k,{}]))}},LayerCont:{palette:'color'},
        Layers:Object.fromEntries(keys.map(k=>[k,{opacity:'',svg:[]}])),
        SVGCont:{svg_style:()=>({color:'#112233',fillColor:'#aabbcc',weight:1})},
        chroma:value=>({hex:()=>value,css:()=>value,alpha:()=>1})});
    for(const file of ['@feature-core','lib/renderers/maplibre/vector-editor.js','lib/renderers/maplibre/editor.js'])vm.runInContext(readSource(file,'utf8'),box);
    const renderer=new (vm.runInContext('MapLibreEditorRenderer',box))(view);
    const check=()=>{
        const index=id=>stack.findIndex(l=>l.id===id);
        for(const entry of renderer.entries.filter(e=>['park','highway_alley'].includes(e.group.key)&&e.group.order.osmLayer===0))
            assert.ok(index(entry.id)<index('road-primary'),'supplemental ground areas/paths precede native roads');
        const elevated=renderer.entries.find(e=>e.group.order.osmLayer===1);
        assert.ok(index(elevated.id)>index('road-motorway'),'elevated supplemental geometry stays above ground roads');
        assert.equal(renderer.vector.targets.has(600),false,'a native layer mixing ground and bridge roads cannot retain the elevated road');
        const deckLayers=renderer.entries.filter(e=>e.group.model===deck),roadLayers=renderer.entries.filter(e=>e.group.model===raisedRoad);
        assert.ok(deckLayers.length&&roadLayers.length);
        assert.ok(Math.max(...deckLayers.map(e=>index(e.id)))<Math.min(...roadLayers.map(e=>index(e.id))),'both bridge deck fill and outline precede the road on it');
        assert.equal(renderer.vector.layerOrders.get('road-primary').styleOrder,180,'anchor uses only features matching the layer filter');
        assert.equal(renderer.vector.layerOrders.get('road-motorway').styleOrder,190);
    };
    await renderer.sync(); check();
    // Exercise replacement and the 3D build path without retaining stale anchors.
    view.threeD=true; await renderer.sync(); check();
    renderer.clear();
    assert.deepEqual(stack.map(l=>l.id),native.map(l=>l.id));
    assert.equal(renderer.vector.layerOrders.size,0);
    console.log('PASS supplemental park/path below native roads, filtered category anchors, elevated geometry, 2D/3D rebuild and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
