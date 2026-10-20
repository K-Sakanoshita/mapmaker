// Real Expo data regression: keep the ring when its upper details are separate building parts.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ja-JP',ignoreHTTPSErrors:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=route.request().url();if(u.includes('script.google.com')||u.includes('googletagmanager'))return route.fulfill({body:'{}'});return route.continue();});
 await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja&preset=expo2025#15.7/34.6487/135.38306/0/30');
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:90000});
 await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);Conf.default.Paper.dpi=72;});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:90000});
 const result=await page.evaluate(()=>{
 const models=[...map.features.values()];const oman=models.find(m=>m.feature.id==='relation/18047883');
 if(!oman)throw Error('Grand Ring model missing');
 return {building:getMapMakerFeatureTag(oman.feature,'building'),range:getMapMakerBuildingRange(oman.feature,Conf.default.birdseye),drawn:[...map.editorRenderer.data.values()].some(f=>f.properties.modelId===oman.id),source:Conf.dataSource.url};
 });
 assert.equal(result.building,'roof');assert.equal(result.range.height,20);assert.equal(result.drawn,true);assert.ok(result.source.includes('2026-10-19-4'));
 await page.screenshot({path:'/tmp/mapmaker-ring-fixed-editor.png'});
 await page.evaluate(async()=>{window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});mapMaker.area_select('');await mapMaker.save('svg');await mapMaker.save('png');});
 const files=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
 assert.equal(files.length,2);for(const f of files){const b=Buffer.from(f.data);await fs.writeFile(`/tmp/mapmaker-ring-fixed.${f.type}`,b);if(f.type==='svg')assert.match(b.toString(),/data-building-id="relation\/18047883"/);}
 assert.deepEqual(errors,[]);console.log('PASS actual updated Grand Ring in editor, 20m extrusion, SVG and PNG downloads',result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
