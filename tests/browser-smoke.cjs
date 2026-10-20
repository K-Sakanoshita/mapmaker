// NODE_PATH=/path/to/node_modules node tests/browser-smoke.cjs
// Serve the repository first. External JS/CSS CDNs must be reachable.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const cases=require('./fixtures/browser-cases.json'),fixture=require('./helpers/osm-fixture.cjs');
const base=process.env.MAPMAKER_URL||'http://127.0.0.1:8765';
const output=process.env.MAPMAKER_ARTIFACTS||'/tmp/mapmaker-regression';
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 if(process.argv.includes('--language')) { try { await require('./helpers/browser-language.cjs')(browser,base); } finally { await browser.close(); } return; }
 if(process.argv.includes('--startup')) { try { await require('./helpers/browser-startup.cjs')(browser,base); } finally { await browser.close(); } return; }
 const log=[],results=[];let activePage;
 try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 const context=await browser.newContext({viewport,locale:'ja-JP',ignoreHTTPSErrors:true});
 const page=await context.newPage();activePage=page;
 page.on('requestfailed',r=>log.push({type:'requestfailed',text:r.url()+': '+r.failure()?.errorText}));
 let current=cases[0],fail=false;const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);log.push({type:'pageerror',text:e.stack});});page.on('console',msg=>log.push({viewport:viewport.width,type:msg.type(),text:msg.text()}));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('script.google.com')||url.includes('googletagmanager.com'))return route.fulfill({status:200,body:'{}'});
  if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#fff'}}]}});
  if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return fail?route.fulfill({status:503,body:'unavailable'}):route.fulfill({json:fixture(current.center)});
  return route.continue();
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
 await page.evaluate(()=>{Conf.system.MapData.viewportZoom.enabled=false;Conf.default.Paper.dpi=72;document.getElementById('mapMakerIntroClose')?.click();Basic.retry=Basic.retry.bind(Basic);window.__alerts=[];window.alert=text=>__alerts.push(text);});
 await require('./helpers/browser-icon-export.cjs')(page,path.join(output,`${viewport.width}-icons`));
 await require('./helpers/browser-security.cjs')(page);
 await require('./helpers/browser-building-occlusion.cjs')(page);
 await page.evaluate(c=>{map.gl.jumpTo({center:c.center,zoom:c.zoom});},current);
 for(current of (process.argv.includes('--recovery')?[]:cases)){
 const id=`${viewport.width}-${current.id}`;
 await page.evaluate(c=>{Birdseye.setEnabled(c.mode!=='2d');map.gl.jumpTo({center:c.center,zoom:c.zoom,bearing:c.bearing,pitch:c.pitch});},current);
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
 await require('./helpers/browser-fence.cjs')(page);
 await require('./helpers/browser-fence.cjs')(page,'Rope barrier');
 const partCheck=await page.evaluate(()=>{
  const models=[...map.features.values()],find=name=>models.find(m=>getMapMakerFeatureTag(m.feature,'name')===name);
  const outline=find('Parts outline'),lower=find('Lower part'),raised=find('Raised part');
  const data=[...map.editorRenderer.data.values()];
  const live=model=>data.find(f=>f.properties.modelId===model?.id);
  return {outline:!!live(outline),lower:!!live(lower),raised:!!live(raised),base:live(raised)?.properties.base,height:live(raised)?.properties.height};
 });
 assert.equal(partCheck.outline,current.mode==='2d');assert.equal(partCheck.raised,current.mode!=='2d');assert.equal(partCheck.lower,current.mode!=='2d');
 if(current.mode!=='2d'){assert.equal(partCheck.base,4);assert.equal(partCheck.height,14);}
 if(current===cases[0]){await require('./helpers/browser-processing-dialog.cjs')(page);await require('./helpers/browser-palette-processing.cjs')(page);}
 if(current===cases[0]) await require('./helpers/browser-icon-size.cjs')(page,path.join(output,`${viewport.width}-icon-size.png`));
 // Editing uses the production model update and rendering path.
 await page.evaluate(async c=>{
  Layers.building.color='#c83248';Layers.building.width=2;LayerCont.updateLayer('building');
  if(c.mode==='rough'){
   document.getElementById('rough_enabled').checked=true;
   RoughStylePanel.toggle();
  }
  await mapMaker.queueExportPreview();
  window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});
 },current);
 for(const paper of ['A4','A4_landscape','A3','A3_landscape']){
  await page.evaluate(mode=>mapMaker.area_select(mode),paper);
  await page.evaluate(async()=>{await mapMaker.save('svg');await mapMaker.save('png');});
  const files=await page.evaluate(async()=>Promise.all(__files.splice(0).map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
  assert.equal(files.length,2,`${id}/${paper}: both downloads`);
  for(const file of files){
   const bytes=Buffer.from(file.data);await fs.writeFile(path.join(output,`${id}-${paper}.${file.type}`),bytes);
   if(file.type==='svg'){
    const text=bytes.toString();if(current.mode==='3d'){assert.match(text,/data-fence-mesh="true"/);assert.match(text,/data-rope-mesh="true"/);assert.match(text,/data-tree-crown="cone"/);assert.match(text,/data-tree-tip="rounded"/);}if(current.mode==='3d')for(const shape of ['gabled','hipped','pyramidal'])assert.ok(text.includes(`data-roof-shape="${shape}"`),`${id}: ${shape} roof survives export`);if(current.mode!=='rough')assert.match(text,/data-retaining-wall-symbols="true"/);assert.match(text,/<svg/);assert.ok(!text.includes('NaN'));assert.match(text,/<path/);assert.match(text,/#c83248/i);
    assert.ok(await page.evaluate(text=>!new DOMParser().parseFromString(text,'image/svg+xml').querySelector('parsererror'),text));
   }else{
    assert.equal(bytes.subarray(1,4).toString(),'PNG');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    const dimensions=paper.startsWith('A4')?[210,297]:[297,420];if(paper.endsWith('landscape'))dimensions.reverse();
    assert.equal(w,Math.round(dimensions[0]/25.4*72));assert.equal(h,Math.round(dimensions[1]/25.4*72));
   }
  }
  assert.equal(await page.evaluate(()=>mapMaker.exportInProgress||!document.getElementById('processingDialog').classList.contains('d-none')),false);
 }
 await page.keyboard.press('Escape'); // Close modeless style controls before reset.
 await page.screenshot({path:path.join(output,`${id}-editor.png`)});
 // Reset through the actual confirmation dialog and recreate on the next case.
 await page.locator('[onclick="mapMaker.clearAll()"]').first().click();
 await page.locator('#modal_window_yes').click();
 await page.waitForFunction(()=>!mapMaker.resetting&&!mapMaker.customMode&&!winCont.modalMode);
 console.log(`PASS ${id}`);
 results.push({id,url:await page.url(),case:current,viewport,status:'passed'});
 }
 // Exhaust all servers quickly using the real final-error path, then retry normally.
 fail=true;await page.evaluate(()=>{overPassCont.getRetryCount=()=>0;});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>!mapMaker.loadingMap&&document.getElementById('modal_window_close')?.offsetParent!==null);
 await page.locator('#modal_window_close').click();
 await page.waitForFunction(()=>!mapMaker.resetting&&!winCont.modalMode);
 fail=false;
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode);
 // A failed export restores controls and permits the next save.
 await page.evaluate(async()=>{
  const save=SVGCont.save;SVGCont.save=async()=>{throw new Error('injected save failure');};
  await mapMaker.save('png');SVGCont.save=save;
 });
 assert.equal(await page.evaluate(()=>mapMaker.exportInProgress),false);
 assert.equal(await page.evaluate(()=>__alerts.length),1);
 await page.evaluate(async()=>{__alerts=[];await mapMaker.save('svg');});
 assert.deepEqual(errors,[],'no unhandled JS exceptions');assert.deepEqual(await page.evaluate(()=>__alerts),[],'no export error alerts');
 await context.close();
 }
 }catch(error){log.push({type:'failure',text:error.stack,url:activePage?.url()});await activePage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify({browser:browser.version(),base,results,log},null,2));await browser.close();}
 console.log(process.argv.includes('--recovery') ? 'PASS desktop/mobile request and export failure recovery' : `PASS ${results.length} desktop/mobile cases with 24 SVG/PNG paper pairs; artifacts: ${output}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
