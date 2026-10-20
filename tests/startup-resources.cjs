const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
 const elements=[], requests=[];
 let failScript=true, failJson=true;
 const box=vm.createContext({console, setTimeout, clearTimeout, AbortSignal, JSON5:JSON, Conf:{}, document:{
  createElement(){return {remove(){this.removed=true;}};},
  head:{appendChild(element){elements.push(element);queueMicrotask(()=>{
   if(failScript){element.onerror();return;}
   if(element.src.includes('geolonia'))box.getLatLng=()=>{};
   else if(element.src.includes('alwan'))box.Alwan=class {};
   element.onload();
  });}}
 },fetch:async(path,options)=>{
  requests.push(path);assert.equal(options.cache,'no-cache');
  return {ok:!failJson,status:503,text:async()=>JSON.stringify(path.includes('all')?{allPrefecture:{city:1}}:{prefecture:{pref:1}})};
 }});
 vm.runInContext(fs.readFileSync('lib/application/resource-loader.js','utf8'),box);
 const run=code=>vm.runInContext(code,box);
 await assert.rejects(run("Promise.all([MapMakerResources.script('alwan'),MapMakerResources.script('alwan')])"),/Could not load/);
 assert.equal(elements.length,1);assert.equal(elements[0].removed,true);
 failScript=false;
 await run("Promise.all([MapMakerResources.script('alwan'),MapMakerResources.script('alwan')])");
 assert.equal(elements.length,2);
 await run("MapMakerResources.script('alwan')");assert.equal(elements.length,2);
 await assert.rejects(run("MapMakerResources.address()"),/HTTP 503/);
 assert.deepEqual(Object.keys(box.Conf),[],'configuration remains atomic on failed address load');
 failJson=false;
 await run("Promise.all([MapMakerResources.address(),MapMakerResources.address()])");
 assert.equal(requests.length,4,'two initial failed JSON loads and two retried loads');
 assert.equal(box.Conf.prefecture.pref,1);assert.equal(box.Conf.allPrefecture.city,1);
 await run("MapMakerResources.address()");assert.equal(requests.length,4);
 await assert.rejects(run("MapMakerResources.script('unknown')"),/Unknown resource/);
 let iconRequests=0, failIcon=true;
 const svgBox=vm.createContext({console:{warn(){}},URL,AbortSignal,
  document:{baseURI:'http://localhost/',querySelectorAll:()=>['http://localhost/icon/a.png','http://localhost/icon/a.png'].map(src=>({src,hasAttribute:()=>true}))},
  DOMParser:class {parseFromString(){return {querySelector:()=>null,documentElement:{localName:'svg'}};}},
  fetch:async()=>{iconRequests++;return {ok:!failIcon,status:503,text:async()=>'<svg/>'};}
 });
 vm.runInContext(fs.readFileSync('lib/export/svg-document.js','utf8'),svgBox);
 vm.runInContext(`var svg=new SVGControl();svg.iconLoads=new Map();svg.iconSources=new Map([['http://localhost/icon/a.png',{displayPath:'icon/a.png',svgPath:'svg/a.svg'}]]);`,svgBox);
 await vm.runInContext('svg.ensureDisplayedIcons()',svgBox);
 assert.equal(iconRequests,1,'duplicate displayed icons share failed lookup');
 assert.equal(vm.runInContext('Object.keys(svg.SvgIcon).length',svgBox),0,'failure leaves raster fallback available');
 failIcon=false;
 await vm.runInContext('Promise.all([svg.ensureDisplayedIcons(),svg.ensureDisplayedIcons()])',svgBox);
 assert.equal(iconRequests,2,'failed icon is retried and concurrent exports share the retry');
 assert.equal(vm.runInContext("svg.SvgIcon['icon/a.png']===svg.SvgIcon['http://localhost/icon/a.png']",svgBox),true);
 await vm.runInContext('svg.ensureDisplayedIcons()',svgBox);assert.equal(iconRequests,2);
 console.log('PASS icon exports: displayed-only loads, duplicate sharing, raster fallback and retry');
 console.log('PASS optional resources: shared concurrent loads, cached success, failed script/JSON retry, atomic address configuration');
})().catch(error=>{console.error(error);process.exitCode=1;});
