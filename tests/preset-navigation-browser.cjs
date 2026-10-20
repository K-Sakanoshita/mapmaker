const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const base=process.env.MAPMAKER_URL||'http://127.0.0.1:8765';
 try{for(const [lang,width] of [['ja',390],['en',1280]]){
  const context=await browser.newContext({viewport:{width,height:844},locale:lang,ignoreHTTPSErrors:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();
   if(url.includes('script.google.com')||url.includes('googletagmanager'))return route.fulfill({body:'{}'});
   if(/\/tiles\/(osmfj_poi|japan-20251013)\.json/.test(url))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   return route.continue();
  });
  const ready=()=>page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  const menu=async()=>{
   await page.evaluate(()=>document.getElementById('mapMakerIntroClose')?.click());
   await page.locator('.app-main-menu > .menu').click();
   const links=await page.locator('#temp_menu a').allTextContents();
   assert.deepEqual(links.slice(0,2).map(t=>t.replace(/^✓\s*/, '').trim()),lang==='ja'?['通常の地図','EXPO2025 万博の地図']:['Regular map','EXPO2025 map']);
   const expo=new URL(page.url()).searchParams.get('preset')==='expo2025';
   const keys=await page.locator('#temp_menu a > [glot-model]').evaluateAll(items=>items.map(item=>item.getAttribute('glot-model')));
   assert.deepEqual(keys,['menu_normal_map','menu_expo2025','about','licence_title','openstreetmap',...(expo?['menu_preset_source']:[]),'owner']);
   assert.equal(await page.locator('#temp_menu > .dropdown-divider').count(),2);
   assert.equal(await page.locator('#temp_menu a[aria-current="page"]').count(),1);
   assert.equal(await page.locator('#temp_menu a[aria-current="page"] > [glot-model]').getAttribute('glot-model'),expo?'menu_expo2025':'menu_normal_map');
   assert.match(await page.locator('#temp_menu a[aria-current="page"]').innerText(),/^✓/);
   assert.equal(await page.locator('#temp_menu a:has([glot-model="owner"])').getAttribute('href'),'https://github.com/K-Sakanoshita/mapmaker');
   const box=await page.locator('#temp_menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'menu stays within viewport');
  };
  await page.goto(base+(lang==='en'?'/en/':'/')+'?lang='+lang);await ready();await menu();
  assert.equal(await page.locator('#zoomlevelValue .map-preset-status').count(),0);
  assert.equal(await page.evaluate(()=>map.gl.getMaxBounds()),null);
  await page.locator('a[href="javascript:MapPresets.open(\'expo2025\')"]').click();await page.waitForURL(/preset=expo2025/);await ready();
  const bounds=await page.evaluate(()=>map.gl.getMaxBounds().toArray());assert.deepEqual(bounds,[[135.36,34.625],[135.42,34.68]]);
  assert.equal(await page.locator('#zoomlevelValue .map-preset-status').innerText(),lang==='ja'?'EXPO2025 万博マップモード中':'EXPO2025 map mode');
  await menu();await page.screenshot({path:`/tmp/mapmaker-preset-navigation-${lang}-${width}.png`});await page.locator('.app-main-menu > .menu').click();
  const constrained=await page.evaluate(()=>{
   const inside=()=>{const p=map.getCenter();return p.lng>=135.36&&p.lng<=135.42&&p.lat>=34.625&&p.lat<=34.68;};
   map.gl.jumpTo({center:[139,35],zoom:18});const jump=inside();
   map.gl.jumpTo({center:[135.39,34.65],zoom:0});
   return {jump,zoom:map.getZoom(),inside:inside()};
  });assert.equal(constrained.jump,true);assert.equal(constrained.inside,true);assert.ok(constrained.zoom>0);
  await page.mouse.move(width/2,450);await page.mouse.down();await page.mouse.move(width/2-1500,600,{steps:12});await page.mouse.up();
  assert.equal(await page.evaluate(()=>{const p=map.getCenter();return p.lng>=135.36&&p.lng<=135.42&&p.lat>=34.625&&p.lat<=34.68;}),true);
  const offsite=new URL(page.url());offsite.hash='18/35/139/0/0';await page.goto(offsite.href);await ready();
  assert.equal(await page.evaluate(()=>{const p=map.getCenter();return p.lng>=135.36&&p.lng<=135.42&&p.lat>=34.625&&p.lat<=34.68;}),true);
  await page.locator('.app-main-menu > .menu').click();await page.locator('a[href="javascript:MapPresets.open()"]').click();
  await page.waitForURL(url=>!url.searchParams.has('preset'));await ready();
  assert.equal(await page.locator('#zoomlevelValue .map-preset-status').count(),0);
  assert.equal(await page.evaluate(()=>map.gl.getMaxBounds()),null);
  assert.equal(await page.evaluate(()=>{map.gl.jumpTo({center:[139,35],zoom:15});return Math.abs(map.getCenter().lng-139)<1e-6;}),true);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS',lang,width,'menu labels/order, preset-only bounds, drag/zoom/URL constraints and unrestricted normal map');
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
