const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const translations=JSON.parse(fs.readFileSync('data/glot.json','utf8'));
(async()=>{
 for(const language of ['ja','en']){
  const messages=[];
  const box=vm.createContext({console,requestAnimationFrame:fn=>setTimeout(fn,0),setTimeout,clearTimeout,
   map:{getCenter:()=>({lat:35,lng:139}),setView(){},getZoom:()=>17,once:(_event,fn)=>setTimeout(fn,0),repaint(){}},
   Conf:{default:{MinZoomLevel:15},style:{color:{waterLine:{zoom:0}}}},Layers:{waterLine:{geojson:[]}},
   LayerCont:{styles:['waterLine'],palette:'color',makeLayerAsync:async(_key,_mode,_update,report)=>report(1,1),applyDrawOrder(){}},
   glot:{get:key=>translations[key]?.[language]||key},location:{href:'http://localhost/#17/35/139'},
   winCont:{modal_open:async()=>{},spinner(){},modal_text:text=>messages.push(text),closeModal:async()=>{}},
   Basic:{getData(){},retry:task=>task()},
   overPassCont:{getRetryCount:()=>0,get:async()=>({}),get_target:()=>[]},document:{getElementById:()=>null}
  });
  vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
  const maker=vm.runInContext('mapMaker',box);
  maker.custom=()=>{};maker.queueExportPreview=async()=>{};maker.finishInitialRoughPreview=async()=>{};maker.previewBusy=()=>{};
  for(const rough of [false,true]){
   messages.length=0;maker.rough_options=()=>({enabled:rough});maker.make();
   for(let i=0;maker.loadingMap&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
   assert.equal(maker.loadingMap,false,'generation completes');
   for(const key of ['loading_prepare','loading_order','loading_editor','loading_display'])assert.ok(messages.includes(translations[key][language]),key);
   assert.equal(messages.includes(translations.loading_rough[language]),rough);
   assert.ok(messages.some(text=>text.startsWith(translations.loading_draw[language])));
   assert.ok(!messages.includes(translations.processing_message[language]),'generation never falls back to generic processing text');
   assert.ok(messages.indexOf(translations.loading_editor[language])<messages.indexOf(translations.loading_display[language]));
  }
  vm.runInContext(fs.readFileSync('lib/application/overpass-controller.js','utf8'),box);
  box.MapDataWorkerClient={run(_request,callbacks){for(const stage of ['parsing','converting','classifying','simplifying'])callbacks.stage(stage);}};
  messages.length=0;vm.runInContext('new OverPassControl().runDataWorker({})',box);
  assert.deepEqual(messages,['loading_parse','loading_convert','loading_classify','loading_simplify'].map(key=>translations[key][language]));
  console.log('PASS '+language+' worker stage translations, ordered editor/display stages and optional rough stage');
 }
})();
