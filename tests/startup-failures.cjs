const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {document:dom}=require('./helpers/dom.cjs');
(async()=>{
for(const lang of ['ja','en'])for(const failure of ['html404','config404','network','parse','language','ok']){
 let initialized=0,errors=[],panel;
 const box=vm.createContext({console:{error:(...e)=>errors.push(e)},AbortSignal,document:{...dom,documentElement:{lang},body:{appendChild:p=>panel=p}},window:{location:{hostname:'localhost'}},
 Glottologist:class {locale(){} assign(){} render(){}},poiControl:class{},MarkerControl:class{},LayerControl:class {init(){initialized++;}},SVGControl:class {init(){}},OverPassControl:class{},GeoCoastline:class{},GeoControl:class{},
 JSON5:JSON,$:()=>({html(){},append(){}}),mapMaker:{init(){initialized++;}},fetch:async file=>{
 if(failure==='network'&&file.includes('marker.jsonc'))throw new Error('offline');
 return {ok:!((failure==='html404'&&file.endsWith('basemenu.html'))||(failure==='config404'&&file.includes('config-system'))||(failure==='language'&&file.endsWith('glot.json'))),status:404,text:async()=>failure==='parse'&&file.includes('config-user')?'broken':file.endsWith('.html')?'<div>menu</div>':file.includes('config-system')?JSON.stringify({category:{},default:{GoogleAnalytics:''}}):'{}'};
 }});
 vm.runInContext(fs.readFileSync('initialize.js','utf8'),box);
 vm.runInContext('initialize.initDailyIntro=()=>{}',box);
 const result=await vm.runInContext('initialize.load()',box);
 assert.equal(result,failure==='ok');assert.equal(initialized,failure==='ok'?2:0);
 if(failure!=='ok'){assert.equal(errors.length,1);assert.ok(panel.textContent.includes(lang==='en'?'reload':'再読み込み'));assert.equal(vm.runInContext('Object.keys(Conf).length',box),0);}
}
console.log('PASS startup HTML/config/language HTTP errors, network and parse errors, atomic config, Japanese/English recovery, normal startup');
})().catch(e=>{console.error(e);process.exitCode=1;});
