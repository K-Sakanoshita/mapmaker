const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try {
 for(const [lang,width,height=900] of [['ja',1280],['ja',390],['en',390],['ja',844,390]]){
  if(process.env.LANDSCAPE_ONLY&&width!==844)continue;
  const page=await browser.newPage({viewport:{width,height},ignoreHTTPSErrors:true}),errors=[];page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();if(/script.google.com|googletagmanager/.test(url))return route.fulfill({json:{}});
   if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:fixture([135.432,34.665])});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#18/34.665/135.432/0/0');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded());
  await page.evaluate(()=>document.getElementById('mapMakerIntroClose')?.click());
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active);
  await page.locator('#saveDownloadMenu').click();
  assert.equal(await page.locator('#exportQuality').inputValue(),'300');
  await page.locator('#exportPaperSize').selectOption('A4');
  assert.equal(await page.locator('#exportSaveMenu').isVisible(),true,'selecting paper keeps save menu open');
  assert.equal(await page.evaluate(()=>mapMaker.selectMode),'A4');
  assert.equal(await page.locator('#AreaSelect1, #paperSizeSelect').count(),0,'paper selection lives only in the save menu');
  assert.match(await page.locator('#exportPixelSize').innerText(),/2,480 × 3,508/);
  await page.locator('#exportQuality').selectOption('600');
  await page.locator('#exportPaperSize').selectOption('A3_landscape');
  assert.equal(await page.locator('#exportQuality').inputValue(),'600','paper change retains quality');
  assert.match(await page.locator('#exportPixelSize').innerText(),/9,921 × 7,016/);
  assert.equal(await page.locator('#exportQualityNote').isVisible(),true);
  await page.evaluate(()=>mapMaker.area_select('A4_landscape'));
  assert.equal(await page.locator('#exportPaperSize').inputValue(),'A4_landscape');
  assert.equal(await page.locator('#exportQuality').inputValue(),'600');
  // Menu must stay within the viewport, including on narrow/tall mobile screens.
  const bounds=await page.locator('#exportSaveMenu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height);
  await page.screenshot({path:`/tmp/mapmaker-export-settings-${lang}-${width}.png`});
  const cases=process.env.UI_ONLY?[]:width===1280?[['A4',150,1240,1754],['A4',300,2480,3508],['A4',600,4961,7016],['A3_landscape',300,4961,3508],['A3_landscape',600,9921,7016]]:[['A4',300,2480,3508],['',150,width*2,1800]];
  for(const [mode,dpi,expectedWidth,expectedHeight] of cases){
   const [w,h]=mode?[expectedWidth,expectedHeight]:await page.evaluate(()=>{const r=mapMaker.captureExportRect('');return [Math.round(r.width*2),Math.round(r.height*2)];});
   await page.locator('#exportPaperSize').selectOption(mode);
   await page.locator('#exportQuality').selectOption(String(dpi));
   const output=await page.evaluate(async()=>{
    window.__exportBlob=null;SVGCont._saveBlob=(blob,type)=>{window.__exportBlob=blob;};
    await mapMaker.save('png');
    if(!__exportBlob)throw Error('No PNG saved');
    const bytes=new Uint8Array(await __exportBlob.slice(0,256).arrayBuffer()),v=new DataView(bytes.buffer);
    let dpi=null;for(let i=8;i+12<=bytes.length;){const length=v.getUint32(i),type=String.fromCharCode(...bytes.slice(i+4,i+8));if(type==='pHYs'){dpi=Math.round(v.getUint32(i+8)*.0254);break;}i+=length+12;}
    const image=await createImageBitmap(__exportBlob),decoded=[image.width,image.height];image.close();
    const result={width:v.getUint32(16),height:v.getUint32(20),dpi,decoded,size:__exportBlob.size};window.__exportBlob=null;return result;
   });
   assert.deepEqual([output.width,output.height],[w,h]);assert.deepEqual(output.decoded,[w,h]);if(mode)assert.equal(output.dpi,dpi);
   assert.equal(await page.locator('#exportSaveMenu').isVisible(),false,'save closes the menu');
   assert.equal(await page.locator('#exportQuality').isEnabled(),true,'save restores settings controls');
   console.log('PASS PNG',lang,width,mode||'screen',dpi,output);
   await page.locator('#saveDownloadMenu').click();
  }
  if(width===844){
   await page.locator('#exportQuality').selectOption('300');
   await page.evaluate(()=>{window.__clickedExport=0;SVGCont._saveBlob=blob=>window.__clickedExport=blob.size;});
   await page.locator('#exportSaveMenu [glot-model="save_png"]').click();
   await page.waitForFunction(()=>__clickedExport>0&&!mapMaker.exportInProgress);
   assert.equal(await page.locator('#exportSaveMenu').isVisible(),false,'a scrolled save action is clickable in short viewports');
   await page.locator('#saveDownloadMenu').click();
  }
  // The vector document and physical visual sizes must be independent of PNG quality.
  const svg=await page.evaluate(async()=>{
   mapMaker.area_select('A4');const outputs=[];
   for(const dpi of [150,600]){Conf.default.Paper.dpi=dpi;const result=await SVGCont.buildSVG({mode:'A4',type:'svg'});outputs.push(result.outText);}
   return outputs;
  });assert.equal(svg[0],svg[1],'SVG output is identical across PNG precision levels');
  await page.locator('#exportPaperSize').selectOption('');
  assert.doesNotMatch(await page.locator('#exportQuality option:checked').innerText(),/dpi/);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS save UI synchronization, retained quality, screen labels, viewport fit and stable SVG',lang,width);
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
