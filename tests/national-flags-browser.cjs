const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const countries=['JP','CA','VN','US','FR','OM','BR','DE','GB','CN','NP','UA','NZ'];
 const elements=countries.map((country,i)=>({type:'node',id:i+1,lon:135.3837+(i%6)*.000045,lat:34.6474+Math.floor(i/6)*.00012,tags:{man_made:'flagpole',country,'flag:type':'national',height:'6'}}));
 elements.push({type:'node',id:100,lon:135.383745,lat:34.64764,tags:{man_made:'flagpole',country:'JP'}},{type:'node',id:101,lon:135.38379,lat:34.64764,tags:{man_made:'flagpole',country:'JP','flag:type':'organisation','flag:colour':'red'}});
 try{for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1,locale:'ja-JP',ignoreHTTPSErrors:true});
  const page=await context.newPage(),errors=[],requested=new Set();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('preview failed'))process.stderr.write(m.text()+'\n');});
  await page.route('**/*',route=>{const u=route.request().url();
   if(u.includes('script.google.com')||u.includes('googletagmanager'))return route.fulfill({body:'{}'});
   if(u.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(u.includes('/image/flags/')){requested.add(u.split('/').pop());if(u.endsWith('/nz.svg'))return route.fulfill({status:404,body:'missing'});}
   if(new URL(u).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:{version:.6,elements}});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja#19.9/34.64752/135.38381/0/40');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);Conf.default.Paper.dpi=100;});
  await page.locator('#makeMap button').first().click();await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
  const inspect=()=>page.evaluate(()=>{
   const renderer=map.editorRenderer,flags=[...map.features.values()].filter(m=>m.mapmaker?.pointStyleName==='flagpole');
   return {count:flags.length,atlas:Object.keys(renderer.outlines.flagAtlas?.rects||{}),plain:flags.filter(m=>!renderer.outlines.blocks.get(m.id).mesh.flagCode).length,images:renderer.outlines.fillUVs.some(n=>n>=0)};
  });
  const initial=await inspect();assert.equal(initial.count,15);assert.equal(initial.atlas.length,12);assert.equal(initial.plain,2);assert.equal(initial.images,true);assert.equal(requested.size,13);
  await page.screenshot({path:`/tmp/mapmaker-national-flags-${width}-editor.png`});
  await page.evaluate(async()=>{window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});mapMaker.area_select('');await mapMaker.save('svg');await mapMaker.save('png');});
  const files=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
  for(const f of files){const b=Buffer.from(f.data);await fs.writeFile(`/tmp/mapmaker-national-flags-${width}.${f.type}`,b);if(f.type==='svg'){for(const code of countries.filter(c=>c!=='NZ'))assert.match(b.toString(),new RegExp('id="mapmaker-flag-image-'+code+'"'));assert.doesNotMatch(b.toString(),/id="mapmaker-flag-image-NZ"/);assert.match(b.toString(),/data:image\/svg\+xml;base64/);}}
  if(width===390){
   await page.evaluate(async()=>{document.getElementById('rough_enabled').checked=true;RoughStylePanel.toggle();await mapMaker.queueExportPreview();await mapMaker.finishInitialRoughPreview();});
   assert.equal(await page.locator('#mapmakerRoughPreview').isVisible(),true);
   await page.evaluate(async()=>{window.__files=[];await mapMaker.save('svg');await mapMaker.save('png');});
   const rough=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
   for(const f of rough){const b=Buffer.from(f.data);await fs.writeFile(`/tmp/mapmaker-national-flags-${width}-rough.${f.type}`,b);if(f.type==='svg')assert.match(b.toString(),/mapmaker-flag-image-JP/);}
   await page.evaluate(async()=>{document.getElementById('rough_enabled').checked=false;RoughStylePanel.toggle();await mapMaker.queueExportPreview();});
  }
  for(const palette of ['mono','coloring','color']){await page.evaluate(p=>LayerCont.setStyle(p),palette);const current=await inspect();assert.equal(current.atlas.length,palette==='color'?12:0);}
  const hidden=await page.evaluate(()=>{const renderer=map.editorRenderer,m=[...map.features.values()].find(m=>m.mapmaker?.pointStyleName==='flagpole');m.options.opacity=0;renderer.update(m);const block=renderer.outlines.blocks.get(m.id);const zero=renderer.outlines.fillData.slice(block.roofStart,block.roofEnd).every((n,i)=>i%7!==6||n===0);m.options.opacity=1;renderer.update(m);return zero;});assert.equal(hidden,true);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS',width,'12 national patterns, folded GPU texture, embedded SVG/PNG, non-national/asset failure fallbacks, palette changes and visibility');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
