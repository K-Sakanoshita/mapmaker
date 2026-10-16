const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const model={id:5,mapmaker:{key:'building'},options:{color:'#aaaaaa',opacity:1,weight:.8},feature:{properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[[[139,35],[139.001,35],[139.001,35.001],[139,35.001],[139,35]]]}}};
 const box=vm.createContext({setTimeout,Conf:{default:{birdseye:{defaultHeight:3}}},Layers:{building:{opacity:''}},LayerCont:{palette:'color'},
  chroma:()=>({rgba:()=>[170,170,170,.85]}),maplibregl:{MercatorCoordinate:{fromLngLat(ll,height=0){if(!Array.isArray(ll))ll=[ll.lng,ll.lat];return{x:ll[0]/360,y:ll[1]/360,z:height/40030228.884};}}}});
 vm.runInContext(fs.readFileSync('lib/geolib.js','utf8'),box);
 vm.runInContext(fs.readFileSync('lib/maplibre-building-outlines.js','utf8'),box);
 const Roof=vm.runInContext('MapLibreBuildingOutlines',box),roof=new Roof({getCenter:()=>({lng:139,lat:35})});
 await roof.prepare([model]);assert.equal(roof.count,12);assert.equal(roof.data.length,132);
 assert.ok(Math.abs(roof.data[2]-3.02/40030228.884)<1e-12,'shared 3m height plus small depth offset');
 model.options.opacity=0;roof.update(model);for(let i=0;i<4;i++)assert.equal(roof.data[i*11+9],0);
 model.options.opacity=1;model.options.weight=3;roof.update(model);assert.equal(roof.data[10],3);
 for(let i=4;i<12;i++)assert.equal(roof.data[i*11+9],0,'wall edges hidden in color palette');
 box.LayerCont.palette='coloring';roof.update(model);
 for(let i=0;i<12;i++)assert.ok(roof.data[i*11+9]>0,'all edges visible in coloring palette');
 box.LayerCont.palette='color';roof.update(model);
 for(let i=4;i<12;i++)assert.equal(roof.data[i*11+9],0,'wall edges restored to hidden');
 console.log('PASS GPU roof geometry preserves heights, stroke width and individual hide/restore without rebuilding geometry');
})().catch(e=>{console.error(e);process.exitCode=1;});
