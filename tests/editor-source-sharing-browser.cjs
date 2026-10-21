// Run with Playwright available in NODE_PATH and the project served on port 8765.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try {
 const results=[];
 for(const width of (process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[1280,390])) {
  const page=await browser.newPage({viewport:{width,height:900},ignoreHTTPSErrors:true}),errors=[];
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(/script.google.com|googletagmanager/.test(url))return route.fulfill({json:{}});
   if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:fixture([135.432,34.665])});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja#18/34.665/135.432/20/40');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded());
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);});
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active);
  const transfer=await page.evaluate(width=>{
   const r=map.editorRenderer,m=r.outlines;
   const sources=Object.keys(map.gl.getStyle().sources).filter(id=>id.startsWith('mapmaker-editor-'));
   if(sources.length!==1||map.gl.getLayer(r.hitLayerId).source!==r.sourceId)throw Error('Expected shared source');
   const uploads=[],gl=m.gl,original=gl.bufferSubData;
   gl.bufferSubData=function(target,offset,data,...args){uploads.push(data.byteLength);return original.call(this,target,offset,data,...args);};
   try {
    const model=[...r.models.values()].find(model=>{const b=m.blocks.get(model.id);return model.mapmaker.key==='building'&&b?.roofEnd>b?.roofStart;});
    const block=m.blocks.get(model.id),lineBefore=m.data.slice(),fillBefore=m.fillData.slice();
    const oldWeight=model.options.weight;model.options.weight=oldWeight+1;m.updateWidths([model]);
    const widthBytes=uploads.reduce((a,b)=>a+b,0);uploads.length=0;
    if(m.fillData.some((v,i)=>v!==fillBefore[i]))throw Error('Width changed faces');
    if(m.data.some((v,i)=>i%11!==10&&v!==lineBefore[i]))throw Error('Width changed geometry/color');
    model.options.weight=oldWeight;m.updateWidths([model]);uploads.length=0;
    model.options.opacity=0;r.update(model);
    const hideBytes=uploads.reduce((a,b)=>a+b,0);uploads.length=0;
    model.options.opacity=1;r.update(model);
    const restored=m.fillData.every((v,i)=>v===fillBefore[i]);
    return {width,sources:sources.length,features:r.data.size,buildings:r.buildings.size,widthBytes,hideBytes,fullLineBytes:m.data.byteLength,fullFillBytes:m.fillData.byteLength,restored};
   }finally{gl.bufferSubData=original;}
  },width);
  assert.ok(transfer.widthBytes<transfer.fullLineBytes);assert.ok(transfer.hideBytes<transfer.fullLineBytes+transfer.fullFillBytes);assert.ok(transfer.restored);
  await page.evaluate(async()=>{Birdseye.setEnabled(false);await map.editorRenderer.sync();map.gl.jumpTo({bearing:0,pitch:0});});
  await page.waitForFunction(()=>map.gl.loaded());
  // A real canvas click must hide a visible roof, then restore it at the same point.
  const target=await page.evaluate(()=>{
   const r=map.editorRenderer,model=[...r.models.values()].find(m=>m.mapmaker.key==='building'&&m.feature.properties.name==='建物0');
   if(!model)throw Error('Missing fixture building');window.__sharingTarget=model;
   const ring=model.feature.geometry.coordinates[0],ll=[(ring[0][0]+ring[2][0])/2,(ring[0][1]+ring[2][1])/2];
   map.gl.jumpTo({center:ll});
   const p=map.gl.project(ll),rect=map.gl.getCanvas().getBoundingClientRect();
   return {x:p.x+rect.left,y:p.y+rect.top};
  });
  await page.waitForFunction(()=>map.gl.loaded());
  await page.mouse.click(target.x,target.y);
  await page.waitForFunction(()=>__sharingTarget.options.opacity===0);
  await page.waitForFunction(()=>map.gl.loaded());
  const hit=await page.evaluate(({x,y})=>{const rect=map.gl.getCanvas().getBoundingClientRect();return map.gl.queryRenderedFeatures([x-rect.left,y-rect.top],{layers:[map.editorRenderer.hitLayerId]}).some(f=>f.properties.modelId===__sharingTarget.id);},target);
  assert.ok(hit,'hidden building is hit-testable through shared geometry');
  await page.mouse.click(target.x,target.y);
  await page.waitForFunction(()=>__sharingTarget.options.opacity===1);
  await page.evaluate(async()=>{Birdseye.setEnabled(true);await map.editorRenderer.sync();await LayerCont.setStyle('coloring');await map.editorRenderer.sync();});
  await page.waitForFunction(()=>map.gl.loaded());
  await page.screenshot({path:`/tmp/mapmaker-source-sharing-${width}.png`});
  assert.deepEqual(errors,[]);results.push(transfer);console.log('PASS shared source, actual hide/restore clicks, width-only/partial uploads, 2D/3D and palette',transfer);
  await page.close();
 }
 fs.writeFileSync('/tmp/mapmaker-source-sharing-browser.json',JSON.stringify(results,null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
