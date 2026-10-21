const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 const osm=JSON.parse(fs.readFileSync('data/overpass-system.jsonc')).osm,system=JSON.parse(fs.readFileSync('data/config-system.jsonc')).system;
 const box=vm.createContext({Conf:{osm,system},URLSearchParams});vm.runInContext(readSource('@overpass-client','utf8'),box);
 const control=vm.runInContext('new OverPassControl()',box),keys=['sea','waterArea','waterLine','wetland','forest','railway','highway_primary','highway_motorway'];
 const low=control.acquisition(keys,13.99),normal=control.acquisition(keys,14);
 for(const broad of ['nwr["highway"]','nwr["natural"]','nwr["landuse"]']){assert.ok(!low.selectors.includes(broad));assert.ok(normal.selectors.includes(broad));}
 assert.deepEqual(Array.from(low.osm.waterLine.tags),['waterway=river','waterway=canal']);assert.deepEqual(Array.from(low.osm.wetland.tags),[]);
 assert.ok(osm.waterLine.tags.includes('waterway=stream'),'normal tags stay intact');
 const fixture=require('./helpers/osm-fixture.cjs')([135,35]);
 async function run(response,config={limits:{responseBytes:1e7,elements:10000,coordinates:100000,outputCoordinates:100000}}){
  const messages=[];let done;
  const result=new Promise(resolve=>done=resolve);
  const worker=vm.createContext({console:{log(){}},fetch:async(url,opts)=>typeof response==='function'?response(opts):response,AbortController,TextDecoder,setTimeout,clearTimeout});worker.self=worker;
  worker.postMessage=data=>{messages.push(data);if(data.result||data.error)done(data);};
  worker.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join('lib/workers',file.split('?')[0]),'utf8'),worker));
  vm.runInContext(fs.readFileSync('lib/workers/map-data.js','utf8'),worker);
  worker.onmessage({data:{url:'https://example.test',osm,config,zoom:14,viewport:[1000,800]}});
  return {message:await result,messages};
 }
 const ok=await run(new Response(JSON.stringify(fixture)));assert.ok(ok.message.result.geojson.length);assert.ok(ok.messages.some(m=>m.stage==='converting'));assert.ok(ok.messages.some(m=>m.progress>0));
 assert.deepEqual(ok.messages.filter(m=>m.stage).map(m=>m.stage),['parsing','converting','classifying','simplifying'],'worker reports actual conversion phases in order');
 const noCaps=vm.runInContext('mapDataConfigForDevice({...Conf.system.MapData, limits:{responseBytes:1,elements:1,coordinates:1,outputCoordinates:1}}, false, "?dataLimits=off")',box);
 const unlimited=await run(new Response(JSON.stringify(fixture)),structuredClone(noCaps));
 assert.ok(unlimited.message.result.geojson.length,'URL override bypasses byte, element, reference and output-coordinate checks in the real Worker');
 // Exercise the streamed boundary at a small explicit cap, without allocating
 // 100MiB of padding for each device profile.
 const json=JSON.stringify(fixture),cap=Buffer.byteLength(json)+4096;
 const boundary=json+' '.repeat(cap-Buffer.byteLength(json));
 const boundaryConfig={...system.MapData,limits:{...system.MapData.limits,responseBytes:cap}};
 const exact=await run(new Response(boundary),boundaryConfig);assert.ok(exact.message.result);
 const extra=await run(new Response(boundary+' '),boundaryConfig);
 assert.equal(extra.message.code,'MAP_DATA_LIMIT');assert.equal(extra.message.retryable,false);
 assert.ok(!extra.messages.some(m=>m.stage==='converting'));
 // Declared-size checks cover both configured device caps and the worker fallback.
 const mobile={...system.MapData,limits:{...system.MapData.limits,...system.MapData.mobileLimits}};
 for(const config of [system.MapData,mobile,{}]){
  const size=config.limits?.responseBytes ?? system.MapData.limits.responseBytes;
  const exact=await run(new Response(json,{headers:{'Content-Length':String(size)}}),config);
  assert.ok(exact.message.result);
  const extra=await run(new Response(json,{headers:{'Content-Length':String(size+1)}}),config);
  assert.equal(extra.message.code,'MAP_DATA_LIMIT');assert.equal(extra.message.retryable,false);
 }
 for(const [limits,response] of [[{responseBytes:2},new Response(JSON.stringify(fixture))],[{elements:1},new Response(JSON.stringify(fixture))],[{coordinates:1},new Response(JSON.stringify(fixture))],[{outputCoordinates:1},new Response(JSON.stringify(fixture))],[{responseBytes:2},new Response('{}',{headers:{'Content-Length':'30'}})]]){
  const r=await run(response,{limits});assert.equal(r.message.code,'MAP_DATA_LIMIT');assert.equal(r.message.retryable,false);
 }
 // A real fetch stream errors when its signal is aborted. Cancelling that
 // already-aborted reader must not replace the limit with a retryable AbortError.
 const abortedLimit=await run(({signal})=>new Response(new ReadableStream({start(controller){
  controller.enqueue(new TextEncoder().encode('too large'));
  signal.addEventListener('abort',()=>controller.error(Object.assign(new Error('aborted'),{name:'AbortError'})));
 }})),{limits:{responseBytes:2}});
 assert.equal(abortedLimit.message.code,'MAP_DATA_LIMIT');assert.equal(abortedLimit.message.retryable,false);
 for(const status of [404,429,503]){const r=await run(new Response('',{status,headers:{'Retry-After':'120'}}));assert.equal(r.message.retryable,status!==404);assert.equal(r.message.retryAfter,'120');}
 const timeout=await run(({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'})))),{timeoutMs:1});assert.equal(timeout.message.retryable,true);
 const malformed=await run(new Response('not json'));assert.ok(malformed.message.error);assert.equal(malformed.message.retryable,false);
 console.log('PASS low-zoom selectors/tags and exact 14 boundary, streamed worker fetch/progress, byte/element/coordinate caps, no retry on limits and HTTP retry metadata');
})().catch(e=>{console.error(e);process.exitCode=1;});
