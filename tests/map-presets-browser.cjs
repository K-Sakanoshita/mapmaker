// Real network integration: archived PMTiles and the pinned public Expo dataset.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{for(const [lang,width] of [['ja',390],['en',1280]]){
  const context=await browser.newContext({viewport:{width,height:900},locale:lang,ignoreHTTPSErrors:true});const page=await context.newPage();const errors=[];let sourceRequests=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/2026-10-19-4/expo2025.osm.json'))sourceRequests++;});
  await page.route('**/*',route=>{const u=route.request().url();if(u.includes('script.google.com')||u.includes('googletagmanager'))return route.fulfill({body:'{}'});if(u.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});return route.continue();});
  await page.goto(`${process.env.MAPMAKER_URL||'http://127.0.0.1:8765'}/${lang==='en'?'en/':''}?lang=${lang}&keep=1`);
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  await page.locator('.app-main-menu > .menu').click();await page.locator('a[href="javascript:MapPresets.open(\'expo2025\')"]').click();
  await page.waitForURL(/preset=expo2025/);
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:90000});
  await page.evaluate(()=>{window.__mapErrors=[];map.gl.on('error',e=>__mapErrors.push(e.error?.message));document.getElementById('mapMakerIntroClose')?.click();});
  const initial=await page.evaluate(()=>({custom:mapMaker.customMode,loading:!!mapMaker.loadingMap,center:map.getCenter(),zoom:map.getZoom(),style:Conf.tile[map.vectorBasemapKey].style,source:Conf.dataSource.url,lang:document.documentElement.lang}));
  assert.equal(initial.custom,false);assert.equal(initial.loading,false);assert.equal(sourceRequests,0);assert.equal(initial.zoom,15);assert.ok(Math.abs(initial.center.lat-34.64973)<1e-6);assert.equal(initial.lang,lang);assert.equal(initial.style,'./tiles/japan-20251013.json?v=expo-3');
  await page.screenshot({path:`/tmp/mapmaker-expo-${lang}-${width}-initial.png`});
  await page.evaluate(()=>{map.gl.jumpTo({center:[135.38172,34.64908],zoom:18.4,pitch:30});Birdseye.setEnabled(true);Conf.default.Paper.dpi=72;});
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:90000});
  const made=await page.evaluate(()=>({roads:Layers.highway_alley.geojson.length,flags:[...map.features.values()].filter(m=>m.mapmaker?.pointStyleName==='flagpole').length,source:mapMaker.getCopyright(),errors:__mapErrors}));
  assert.ok(made.roads>0);assert.ok(made.flags>0);assert.equal(made.source,'');assert.equal(sourceRequests,1);assert.deepEqual(made.errors,[]);
  await page.screenshot({path:`/tmp/mapmaker-expo-${lang}-${width}-made.png`});
  await page.evaluate(async()=>{window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});mapMaker.area_select('');await mapMaker.save('svg');await mapMaker.save('png');});
  const files=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
  for(const f of files){const b=Buffer.from(f.data);await fs.writeFile(`/tmp/mapmaker-expo-${lang}-${width}.${f.type}`,b);if(f.type==='svg'){assert.match(b.toString(),/data-flagpole-id/);assert.match(b.toString(),/data-building-id="way\/1380324416"/);assert.doesNotMatch(b.toString(),/EXPO2025 万博マニアックマップ/);assert.match(b.toString(),/OpenStreetMap/);}}
  await page.locator('.app-main-menu > .menu').click();await page.locator('a[href="javascript:MapPresets.open()"]').click();
  await page.waitForURL(url=>!url.searchParams.has('preset'));
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>!!Conf.dataSource),false);assert.equal(new URL(page.url()).searchParams.get('keep'),'1');assert.equal(await page.evaluate(()=>document.documentElement.lang),lang);
  assert.deepEqual(errors,[]);console.log('PASS',lang,width,'real archived PMTiles; move only, real roads/flags, SVG/PNG and normal return',made.roads,made.flags);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
