const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const delays=[];
 const box=vm.createContext({console:{log(){},error(){}},setTimeout:(fn,ms)=>{delays.push(ms);queueMicrotask(fn);},Conf:{system:{OverPassServer:['a','b']},osm:{test:{overpass:['nwr;']}}},map:{getZoom:()=>13,getSize:()=>({x:1000,y:800})},GeoCont:{get_L:()=>({SE:{lat:1,lng:2},NW:{lat:3,lng:4}})},glot:{get:k=>k},winCont:{modal_text(){}}});
 vm.runInContext(fs.readFileSync('lib/application/browser-services.js','utf8'),box);vm.runInContext(readSource('@overpass-client','utf8'),box);
 const control=box.overPassCont=vm.runInContext('new OverPassControl()',box);let attempts=0;
 for(const status of [0,429,503,404]){
 control.runDataWorker=async request=>{attempts++;assert.ok(request.url.includes('data='));throw {retryable:status!==404};};
 attempts=0;await assert.rejects(vm.runInContext('Basic.retry(()=>overPassCont.get(["test"]),overPassCont.getRetryCount())',box));assert.equal(attempts,status===404?1:4);
 }
 let calls=0;const api=vm.runInContext('Basic',box);await assert.rejects(api.retry(()=>{calls++;throw new Error('sync');},2));assert.equal(calls,3);
 delays.length=0;calls=0;
 await assert.rejects(api.retry(()=>{calls++;throw {jqXHR:{getResponseHeader:()=> '120'}};},3));assert.equal(calls,1);assert.equal(delays.length,0);
 calls=0;delays.length=0;
 await assert.rejects(api.retry(()=>{calls++;throw new Error('retry');},3));assert.deepEqual(delays,[1000,2000,4000]);
 vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);const maker=vm.runInContext('mapMaker',box);
 for(const source of ['overpass','csv'])for(const failure of ['timeout','http','parse','ok','cancel']){
 let spinning=false,processing=false,selected=0;
 box.Conf.osm.test=source==='csv'?{file:'test.csv'}:{};
 box.winCont={modal_open:async p=>{processing=p.mode==='';},closeModal:async()=>{processing=false;},spinner:on=>{spinning=on;},modal_select:async()=>{selected++;if(failure==='cancel')throw undefined;return {};}};
 control.get=async()=>{if(['timeout','http'].includes(failure))throw {statusText:failure,retryable:false};return {geojson:[{geometry:{type:'Point',coordinates:[1,2]}}],targets:[['test']]};};
 box.$={ajax:()=>({done(fn){if(['ok','cancel','parse'].includes(failure))queueMicrotask(()=>fn('csv'));return this;},fail(fn){if(['timeout','http'].includes(failure))queueMicrotask(()=>fn({},failure,'failure'));return this;}})};
 box.GeoCont={csv2geojson:()=>{if(failure==='parse')throw new Error('bad csv');return [{geometry:{type:'Point',coordinates:[1,2]}}];},multi2flat:x=>x,flat2single:x=>x,bboxclip:x=>x};
 box.poiCont={addGeoJSON(){}};box.Marker={set(){}};maker.addCopyright=()=>{};
 await maker.addPoi('test');assert.equal(processing,false);assert.equal(spinning,false);assert.equal(selected,['ok','cancel'].includes(failure)||source==='overpass'&&failure==='parse'?1:0);
 }
 // make() must restore busy state on every final request failure.
 box.map={getCenter:()=>({lat:35,lng:139}),setView(){},getZoom:()=>17};box.location={href:'http://localhost'};box.Conf.default={MinZoomLevel:15};box.LayerCont={styles:[]};box.Basic.getData=()=>{};maker.previewBusy=()=>{};
 control.get=async()=>{throw {retryable:false,statusText:'timeout'};};maker.make();await new Promise(resolve=>setImmediate(resolve));assert.equal(maker.loadingMap,false);
 let shown,closes=0;
 box.winCont={modal_open:()=>new Promise(resolve=>{shown=resolve;}),spinner(){},closeModal:async()=>{closes++;}};
 maker.make();await new Promise(resolve=>setImmediate(resolve));assert.equal(closes,0,'fast failure waits for Bootstrap opening transition');
 const release=shown;release();await new Promise(resolve=>setImmediate(resolve));assert.equal(closes,1);shown();await new Promise(resolve=>setImmediate(resolve));assert.equal(maker.loadingMap,false);
 console.log('PASS bounded server rounds, 429/HTTP/client timeout, sync throws, POI CSV/network/parse/cancel recovery and make failure cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
