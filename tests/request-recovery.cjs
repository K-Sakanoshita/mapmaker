const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const translations=JSON.parse(fs.readFileSync('data/glot.json','utf8'));
function setup(language){
 const messages=[],modals=[],delays=[];let spinning=false;
 const box=vm.createContext({URL,console:{log(){},error(){}},setTimeout:(fn,ms)=>{delays.push(ms);queueMicrotask(fn);},
  glot:{get:key=>translations[key]?.[language]||key},
  winCont:{modal_text:text=>messages.push(text),modal_open:async options=>{modals.push(options);},closeModal:async()=>{},spinner:on=>{spinning=on;}},
  Conf:{osm:{wikipedia:{api:'wikipedia.org/api/rest_v1/page/summary/'}}},
  map:{getZoom:()=>15,latLngToLayerPoint:x=>x,layerPointToLatLng:x=>x},
  Marker:{get:()=>({mapmaker_lang:'ja:記事:見出し',getLatLng:()=>({lat:35,lng:135})}),qr_add(){},set(){}},
  MapMakerResources:{script:async()=>{}},
  GeoCont:{get_L:()=>({NW:{lat:36,lng:134},SE:{lat:34,lng:136}}),multi2flat:x=>x,flat2single:x=>x,bboxclip:x=>x},poiCont:{addGeoJSON(){}}
 });
 vm.runInContext(fs.readFileSync('lib/application/browser-services.js','utf8'),box);
 vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
 return {box,api:vm.runInContext('Basic',box),maker:vm.runInContext('mapMaker',box),messages,modals,delays,spinning:()=>spinning};
}
(async()=>{
 for(const language of ['ja','en']){
  const {box,api,maker,messages,modals,delays,spinning}=setup(language);
  let attempts=0;
  assert.equal(await maker.retryRequest(()=>{if(++attempts<3)throw new Error('offline');return 'ok';},'request_stage_poi'), 'ok');
  assert.equal(attempts,3);assert.deepEqual(delays,[1000,2000]);
  assert.ok(messages.some(text=>text.includes(translations.request_retry_wait[language].replace('{seconds}',1).replace('{attempt}',1).replace('{total}',2))));
  assert.ok(messages.some(text=>text.includes(translations.request_retrying[language].replace('{attempt}',2).replace('{total}',2))));
  // Exercise real server rotation: both retry notices name the upcoming endpoint.
  vm.runInContext(fs.readFileSync('lib/application/overpass-controller.js','utf8'),box);
  box.Conf.system=JSON.parse(fs.readFileSync('data/config-system.jsonc','utf8')).system;
  assert.equal(box.Conf.system.OverPassServer.length,4);
  assert.equal(box.Conf.system.OverPassServer.at(-1),'https://maps.mail.ru/osm/tools/overpass/api/interpreter');
  box.map.getSize=()=>({x:400,y:800});
  box.overpassQueryURL=server=>server;
  box.mapDataConfigForDevice=()=>({});box.isMapDataMobileDevice=()=>true;
  box.planOsmAcquisition=()=>({selectors:['node'],osm:{},config:{}});
  const controller=vm.runInContext('new OverPassControl()',box),requested=[];
  controller.runDataWorker=async request=>{
   requested.push(new URL(request.url).hostname);
   if(requested.length<4)throw Object.assign(new Error('offline'),{retryable:true});
   return 'downloaded';
  };
  for(const stage of ['request_stage_map','request_stage_poi']){
   requested.length=0;messages.length=0;controller.UseServer=0;
   assert.equal(await maker.retryRequest(()=>controller.get([]),stage,controller.getRetryCount()),'downloaded');
   assert.equal(controller.getRetryCount(),3);
   assert.deepEqual(requested,['armd-01.sakura.ne.jp','overpass-api.de','overpass.private.coffee','maps.mail.ru']);
   const notices=messages.filter(text=>text.includes('\n'));
   assert.equal(notices.length,6);
   requested.slice(1).forEach((host,i)=>{
    const label=translations.request_retry_server[language].replace('{server}',host);
    assert.ok(notices[i*2].endsWith(label),'waiting notice names next server');
    assert.ok(notices[i*2+1].endsWith(label),'connecting notice names actual server');
   });
  }
  // Server-specific refusal must not stop the other hosts; never retry the refused host.
  const existingWorker=controller.runDataWorker;
  for(const status of [403,406,429]){
   requested.length=0;controller.UseServer=0;delays.length=0;
   controller.runDataWorker=async request=>{
    const host=new URL(request.url).hostname;requested.push(host);
    if(requested.length===1)throw {status,code:status===429?'OVERPASS_RATE_LIMIT':'OVERPASS_ACCESS',retryable:false,jqXHR:{getResponseHeader:()=> '120'}};
    return 'recovered';
   };
   assert.equal(await maker.retryRequest(()=>controller.get([]),'request_stage_map',controller.getRetryCount()),'recovered');
   assert.deepEqual(requested,['armd-01.sakura.ne.jp','overpass-api.de']);
   assert.deepEqual(delays,[1000],'Retry-After for the refused server does not delay another host');
  }
  // A long Retry-After is still honored if the next URL uses the same host.
  const servers=box.Conf.system.OverPassServer;
  box.Conf.system.OverPassServer=['https://same.test/a','https://same.test/b'];controller.UseServer=0;requested.length=0;
  controller.runDataWorker=async request=>{requested.push(request.url);throw {status:429,retryable:true,jqXHR:{getResponseHeader:()=> '120'}};};
  await assert.rejects(maker.retryRequest(()=>controller.get([]),'request_stage_map',controller.getRetryCount()));
  assert.equal(requested.length,1);
  box.Conf.system.OverPassServer=servers;controller.runDataWorker=existingWorker;
  // All failures, including the final attempt, belong to this request only.
  controller.UseServer=0;requested.length=0;
  controller.runDataWorker=async request=>{
   requested.push(new URL(request.url).hostname);
   throw Object.assign(new Error('network failure'),{status:requested.length===1?500:undefined,
    serverMessage:requested.length===1?'Internal server error':undefined,retryable:true});
  };
  let failed;
  try { await maker.retryRequest(()=>controller.get([]),'request_stage_map',controller.getRetryCount()); } catch(error) { failed=error; }
  assert.equal(failed.requestAttempts.length,4);
  assert.deepEqual(Array.from(failed.requestAttempts,entry=>entry.server),requested);
  const report=maker.requestErrorReport(failed);
  assert.ok(report.includes('HTTP: 500'));assert.ok(report.includes('HTTP: unavailable'));
  assert.ok(report.includes('Internal server error'));assert.ok(report.includes('network failure'));
  assert.equal((report.match(/Server: maps.mail.ru/g)||[]).length,1);
  controller.UseServer=0;
  let fresh;
  try { await maker.retryRequest(()=>controller.get([]),'request_stage_poi',0); } catch(error) { fresh=error; }
  assert.equal(fresh.requestAttempts.length,1,'a new request does not retain previous failures');
  assert.equal(maker.requestErrorReport(new Error('unrelated')),undefined);
  messages.length=0;
  let unsafeAttempts=0;
  await maker.retryRequest(()=>{if(!unsafeAttempts++)throw {retryServer:'<img src=x>',retryable:true};return true;},'request_stage_map');
  assert.ok(messages.some(text=>text.includes('<img src=x>')),'progress is plain text for modal_text/textContent');
  assert.ok(messages.every(text=>!text.includes('<br>')&&!text.includes('<span')));
  delays.length=0;messages.length=0;attempts=0;
  const limited={code:'OVERPASS_RATE_LIMIT',status:429,retryable:true};
  await assert.rejects(maker.retryRequest(()=>{attempts++;throw limited;},'request_stage_poi',5));
  assert.equal(attempts,1);assert.deepEqual(delays,[]);assert.equal(messages.length,1,'no retry notice when rate-limited request is stopped');
  assert.ok(maker.requestErrorMessage(limited,'request_stage_poi').includes(translations.request_overpass_rate[language]));
  assert.ok(maker.requestErrorMessage(limited,'request_stage_poi').includes(translations.request_try_after[language].replace('{seconds}',30)));
  attempts=0;
  const later={retryable:true,jqXHR:{getResponseHeader:()=> '120'}};
  await assert.rejects(maker.retryRequest(()=>{attempts++;throw later;},'request_stage_list'));
  assert.equal(attempts,1);assert.ok(maker.requestErrorMessage(later,'request_stage_list').includes('120'));
  let tries=0;delays.length=0;
  assert.equal(await api.retry(()=>{if(!tries++)throw {status:429,jqXHR:{getResponseHeader:()=> '2'}};return 1;},2),1);
  assert.deepEqual(delays,[2000],'short Retry-After is respected');
  const future=new Date(Date.now()+60000).toUTCString();assert.ok(api.retryAfterMs({jqXHR:{getResponseHeader:()=>future}})>50000);
  const serverError={code:'OVERPASS_MEMORY_LIMIT',message:'<img src=x onerror=alert(1)>',status:200};
  assert.ok(!maker.requestErrorMessage(serverError,'request_stage_poi').includes('<img'));
  assert.ok(maker.requestErrorMessage(serverError,'request_stage_poi').includes(translations.request_try_later[language]));
  const detailed={status:503,serverMessage:'backend <img src=x onerror=alert(1)> & unavailable'};
  const finalMessage=maker.requestErrorMessage(detailed,'request_stage_map');
  assert.ok(finalMessage.includes('HTTP 503'));assert.ok(finalMessage.includes(translations.request_server_error[language]));
  assert.ok(finalMessage.includes('&lt;img'));assert.ok(finalMessage.includes('&amp;'));assert.ok(!finalMessage.includes('<img'));
  assert.ok(!maker.requestErrorMessage(new Error('offline'),'request_stage_map').includes(translations.request_server_error[language]));
  messages.length=0;let detailedCalls=0;
  await maker.retryRequest(()=>{if(!detailedCalls++)throw {...detailed,retryServer:'maps.mail.ru',retryable:true};return true;},'request_stage_map');
  const detailNotices=messages.filter(text=>text.includes(translations.request_previous_server_error[language]));
  assert.equal(detailNotices.length,2);assert.ok(detailNotices.every(text=>text.includes('maps.mail.ru')&&text.includes('<img')&&!text.includes('<span')));
  // A failed list library retries without fetching already received POIs again.
  let downloads=0,listLoads=0,selections=0;
  box.overPassCont={getRetryCount:()=>2,get:async()=>{downloads++;return {geojson:[{geometry:{type:'Point',coordinates:[135,35]}}],targets:[['wikipedia']]};}};
  box.MapMakerResources.script=async name=>{if(name==='datatables'&&++listLoads===1)throw new Error('offline');};
  box.winCont.modal_select=async()=>{selections++;return {};};
  messages.length=0;modals.length=0;
  await maker.addPoi('wikipedia');assert.equal(downloads,1);assert.equal(listLoads,2);assert.equal(selections,1);assert.equal(spinning(),false);
  assert.equal(modals[0].title,translations.request_stage_poi[language]);
  assert.ok(messages.some(text=>text.startsWith(translations.request_stage_list[language])&&text.includes(translations.request_retrying[language].replace('{attempt}',1).replace('{total}',2))));
  listLoads=0;downloads=0;modals.length=0;maker.poiCache=null;
  box.MapMakerResources.script=async name=>{if(name==='datatables'){listLoads++;throw new Error('offline');}};
  await maker.addPoi('wikipedia');assert.equal(downloads,1);assert.equal(listLoads,3);
  assert.ok(modals.at(-1).message.startsWith(translations.request_stage_list[language]));assert.ok(modals.at(-1).message.includes(translations.request_try_later[language]));assert.equal(spinning(),false);
  // Article timeouts retry; 404 and long server-requested waits do not.
  box.MapMakerResources.script=async()=>{};
  for(const mode of ['recover','timeout','notfound','rate']){
   let calls=0,placed=0;modals.length=0;messages.length=0;
   box.Marker.qr_add=()=>{placed++;};
   box.$={ajax:options=>{
    assert.equal(options.timeout,30000);assert.ok(options.url.includes('%3A'),'article titles retain colons');calls++;
    let done;return {done(fn){done=fn;return this;},fail(fn){queueMicrotask(()=>{
     if(mode==='recover'&&calls===2)done({extract:'article'});
     else fn({status:mode==='notfound'?404:mode==='rate'?429:0,getResponseHeader:()=>mode==='rate'?'120':null},mode==='notfound'||mode==='rate'?'error':'timeout','failed');
    });return this;}};
   }};
   const first=maker.qr_add('wikipedia','node/1'),duplicate=maker.qr_add('wikipedia','node/1');await Promise.all([first,duplicate]);
   assert.equal(maker.wikipediaRequestPending,false);assert.equal(spinning(),false);
   assert.equal(calls,mode==='recover'?2:mode==='timeout'?3:1);assert.equal(placed,mode==='recover'?1:0);
   if(mode!=='recover')assert.ok(modals.at(-1).message.includes(translations[mode==='rate'?'request_try_after':'request_try_later'][language].replace('{seconds}',120)));
   if(mode==='notfound')assert.ok(modals.at(-1).message.includes(translations.request_not_found[language]));
  }
  // The POI final error dialog receives all attempted endpoints for its copy button.
  box.overPassCont=controller;controller.UseServer=0;maker.poiCache=null;requested.length=0;modals.length=0;
  box.MapMakerResources.script=async()=>{};
  await maker.addPoi('wikipedia');
  assert.ok(modals.at(-1).copyText.startsWith('Mapmaker Overpass errors'));
  assert.equal((modals.at(-1).copyText.match(/Attempt /g)||[]).length,4);
  assert.equal((modals.at(-1).copyText.match(/Server: maps.mail.ru/g)||[]).length,1);
  console.log('PASS',language,'retry notices/counts, Retry-After, rate-limit stop, preserved POI data, stage errors, article recovery and busy cleanup');
 }
 // HTTP status and Retry-After must survive the Worker boundary for the above policy.
 let terminated=false;
 const box=vm.createContext({URL,setTimeout,clearTimeout,document:{baseURI:'https://example.test/'},Worker:class{
  postMessage(){queueMicrotask(()=>this.onmessage({data:{error:'Overpass HTTP 429',code:'OVERPASS_RATE_LIMIT',status:429,retryable:true,retryAfter:'120',serverMessage:'Too many requests'}}));}
  terminate(){terminated=true;}
 }});
 vm.runInContext(fs.readFileSync('lib/application/map-data-worker-client.js','utf8'),box);
 await assert.rejects(vm.runInContext('MapDataWorkerClient.run({})',box),error=>error.serverMessage==='Too many requests'&&error.status===429&&error.code==='OVERPASS_RATE_LIMIT'&&error.jqXHR.getResponseHeader('Retry-After')==='120');
 assert.ok(terminated);console.log('PASS Worker status and Retry-After transport');
})().catch(error=>{console.error(error);process.exitCode=1;});
