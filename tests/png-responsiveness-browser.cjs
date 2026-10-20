// Large real-data PNG export: preserve full resolution without multi-second UI stalls.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const deadline=setTimeout(()=>browser.close(),180000);
 try{
 const page=await browser.newPage({viewport:{width:1920,height:1062},locale:'ja-JP',ignoreHTTPSErrors:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('script.google.com')||url.includes('googletagmanager'))return route.fulfill({body:'{}'});
  if(process.env.EXPO_OSM_FIXTURE&&url.includes('/2026-10-19-4/expo2025.osm.json'))return route.fulfill({contentType:'application/json',body:await fs.readFile(process.env.EXPO_OSM_FIXTURE,'utf8')});
  return route.continue();
 });
 await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja&preset=expo2025#16.3/34.6489/135.3832/0/40');
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:90000});
 await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  let last=performance.now(),maxGap=0,parsed=[],documentInfo;
  const parse=SVGCont._svgTextToDom,build=SVGCont.buildSVG;
  SVGCont._svgTextToDom=function(text){parsed.push(text.length);return parse.call(this,text);};
  SVGCont.buildSVG=async function(params){const value=await build.call(this,params);documentInfo={width:value.canvas_width,height:value.canvas_height,bytes:value.outText.length,giantMasks:/<mask[^>]*width="20000"/.test(value.outText)};return value;};
  let png;const save=SVGCont._saveBlob,alerts=[],alert=window.alert;SVGCont._saveBlob=blob=>png=blob;window.alert=text=>alerts.push(text);
  const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;},25),start=performance.now();
  try{
   mapMaker.area_select('');await mapMaker.save('png');await new Promise(resolve=>setTimeout(resolve,50));
   const ms=performance.now()-start;clearInterval(interval);
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(png);});
   return {ms,maxGap,parsed,documentInfo,alerts,data};
  }finally{clearInterval(interval);SVGCont._svgTextToDom=parse;SVGCont.buildSVG=build;SVGCont._saveBlob=save;window.alert=alert;}
 });
 const png=Buffer.from(result.data,'base64');delete result.data;
 assert.equal(png.readUInt32BE(16),7680);assert.equal(png.readUInt32BE(20),4088,'full 4x output is preserved');
 assert.ok(result.documentInfo.bytes>1000000,'exercise a detailed OSM scene');assert.equal(result.documentInfo.giantMasks,false);
 assert.ok(result.parsed.every(size=>size<1024),'PNG assembly does not expand the map into main-thread DOM');
 assert.ok(result.maxGap<5000,`UI stall ${result.maxGap} ms during PNG export`);assert.deepEqual(result.alerts,[]);
 await fs.writeFile('/tmp/mapmaker-responsive-png.png',png);console.log('Export responsiveness',result);
 // Compact assembly must retain map geometry and namespaces added by overlays.
 const assembly=await page.evaluate(async()=>{
  const preview=SVGCont.previewSVGText,make=SVGCont.makeSVG;
  try{
   SVGCont.previewSVGText=async()=>'<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="100mm" viewBox="0 0 210 100"><path id="map-body-test" d="M0 0L1 1"/></svg>';
   SVGCont.makeSVG=(svg,done)=>{const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','data:image/png;base64,iVBORw0KGgo=');svg.appendChild(image);done();};
   const compact=await SVGCont.buildSVG({type:'png',mode:'',compactDocument:true}),doc=new DOMParser().parseFromString(compact.outText,'image/svg+xml');
   return {valid:!doc.querySelector('parsererror'),body:!!doc.querySelector('#map-body-test'),image:doc.querySelector('image')?.getAttributeNS('http://www.w3.org/1999/xlink','href')};
  }finally{SVGCont.previewSVGText=preview;SVGCont.makeSVG=make;}
 });
 assert.equal(assembly.valid,true);assert.equal(assembly.body,true);assert.ok(assembly.image.startsWith('data:image/png'));
 await require('./helpers/browser-building-occlusion.cjs')(page);
 assert.deepEqual(errors,[]);console.log('PASS full-resolution real-data PNG responsiveness, bounded masks, compact assembly, overlay namespaces and rough mask pixels');
 }finally{clearTimeout(deadline);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
