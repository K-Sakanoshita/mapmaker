const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const query=fs.readFileSync('lib/osm/query.js','utf8'),pure=vm.createContext({});vm.runInContext(query,pure);
 const effective=vm.runInContext('mapDataAcquisitionZoom',pure),settings={enabled:true,referenceWidth:1024,referenceHeight:768,maxAdjustment:1};
 for(const [size,expected] of [[[1024,768],14],[[512,384],15],[[2048,1536],13],[[256,192],15],[[4096,3072],13]])assert.equal(effective(14,size,settings),expected);
 assert.equal(effective(13.98,[1024,768],{enabled:false}),14);
 assert.equal(effective(14,[512,384],{...settings,maxAdjustment:.5}),14.5);
 for(const bad of [{...settings,referenceWidth:0},{...settings,maxAdjustment:-1},{}])assert.equal(effective(14,[512,384],bad),14);
 for(const size of [[0,768],[-10,768],[NaN,768],[Infinity,768]])assert.equal(effective(14,size,settings),14);
 const bounds=(zoom,width,height)=>{
  const world=512*2**zoom,y=(1-Math.log(Math.tan(Math.PI/4+35*Math.PI/360))/Math.PI)/2;
  const latitude=v=>Math.atan(Math.sinh(Math.PI*(1-2*v)))*180/Math.PI;
  return {west:135-width/world*180,east:135+width/world*180,north:latitude(y-height/world/2),south:latitude(y+height/world/2)};
 };
 assert.equal(effective(14,[1024,768],settings,bounds(14,1024,768)),14);
 assert.equal(effective(14,[1024,768],settings,bounds(14,2048,1536)),13,'larger pitched/rotated request footprint lowers detail');
 assert.equal(effective(14,[1024,768],settings,bounds(14,512,384)),15);
 assert.equal(effective(14,[512,384],settings,{west:NaN,east:135,north:35,south:34}),15);
 assert.equal(effective(14,[512,384],settings,{west:135,east:135,north:35,south:35}),15);
 assert.equal(effective(10,[1024,768],settings,{west:179.5,east:-179.5,north:1,south:-1}),effective(10,[1024,768],settings,{west:179.5,east:180.5,north:1,south:-1}));
 assert.ok(Number.isFinite(effective(14,[1024,768],settings,{west:134,east:136,north:90,south:89})));
 let zoom=13.4,size=[512,384],selected,display,request;
 const guidance={classList:{toggle(){}},textContent:''},button={disabled:false};
 const config=JSON.parse(fs.readFileSync('data/config-system.jsonc')).system.MapData;
 const box=vm.createContext({console:{log(){}},map:{getZoom:()=>zoom,getSize:()=>({x:size[0],y:size[1]}),getCenter:()=>({lng:135,lat:35}),setView(){}},
  location:{href:'http://localhost/'},Conf:{default:{MinZoomLevel:11,LimitZoomLevel:15},system:{MapData:config},style:{color:{building:{zoom:14}}}},
  LayerCont:{palette:'color',styles:['building']},glot:{get:key=>key},winCont:{modal_open(){},spinner(){}},
  Basic:{getData(){},retry(fn){fn();return new Promise(()=>{});}},
  overPassCont:{getRetryCount:()=>0,get(targets,_progress,real,detail){selected=[...targets];request={real,detail};}},
  makeMap:{classList:{toggle(){}},querySelector:()=>button},document:{getElementById:()=>guidance},$:()=>({html:value=>display=value})});
 vm.runInContext(query+'\n'+fs.readFileSync('mapmaker.js','utf8'),box);
 const run=code=>vm.runInContext(code,box);
 run('mapMaker.make(); mapMaker.zoomMessage()');
 assert.ok(selected.includes('building'));assert.deepEqual(request,{real:13.4,detail:14.4});assert.ok(display.includes('zoomlevel13.4 '));assert.equal(guidance.textContent.includes('menu_building'),false);
 size=[2048,1536];run('mapMaker.make(); mapMaker.zoomMessage()');assert.equal(selected.includes('building'),false);assert.equal(guidance.textContent.includes('menu_building'),true);
 run('mapMaker.acquiredZoom=14.4;mapMaker.customMode=true');assert.equal(run('mapMaker.acquisitionZoom()'),14.4,'editing keeps the acquisition decision across panel/window changes');
 run('mapMaker.customMode=false');assert.equal(run('mapMaker.acquisitionZoom()'),12.4);
 zoom=10.4;size=[512,384];run('mapMaker.zoomMessage()');assert.equal(button.disabled,false);
 size=[2048,1536];run('mapMaker.zoomMessage()');assert.equal(button.disabled,true,'minimum acquisition zoom uses the same footprint correction');
 box.Conf.system.MapData.viewportZoom={...settings,enabled:false};zoom=13.98;run('mapMaker.make();mapMaker.zoomMessage()');assert.ok(selected.includes('building'));assert.equal(request.detail,14);
 // Query selection uses corrected zoom; the worker still simplifies at the real zoom.
 const transport=vm.createContext({console:{log(){}},Conf:{osm:JSON.parse(fs.readFileSync('data/overpass-system.jsonc')).osm,system:{MapData:config,OverPassServer:['http://localhost/overpass']}},
  GeoCont:{get_L:()=>({NW:{lat:36,lng:134},SE:{lat:34,lng:136}})},map:{getSize:()=>({x:512,y:384})}});
 vm.runInContext(query+'\n'+fs.readFileSync('lib/application/overpass-controller.js','utf8'),transport);
 const control=vm.runInContext('new OverPassControl()',transport);let payload;control.runDataWorker=async data=>(payload=data,{geojson:[],targets:[]});
 await control.get(['waterLine'],null,13.4,14.4);assert.ok(payload.osm.waterLine.tags.includes('waterway=stream'));assert.equal(payload.zoom,13.4);assert.deepEqual(Array.from(payload.viewport),[512,384]);
 await control.get(['waterLine'],null,14.4,13.4);assert.equal(payload.osm.waterLine.tags.includes('waterway=stream'),false);assert.equal(payload.zoom,14.4);
 console.log('PASS viewport acquisition zoom: size/footprint correction, caps/config/fallback/dateline, display/guidance/request agreement, frozen edit decision and unchanged worker drawing zoom');
})().catch(error=>{console.error(error);process.exitCode=1;});
