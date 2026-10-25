const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try { for(const [lang,width,height] of [['ja',390,780],['en',320,568],['ja',844,390],['ja',1280,900]]) {
  const page=await browser.newPage({viewport:{width,height},ignoreHTTPSErrors:true});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  await page.route('**/*',r=>{
   const u=r.request().url();
   if(/script.google.com|googletagmanager/.test(u))return r.fulfill({json:{}});
   if(u.includes('/tiles/osmfj_poi.json'))return r.fulfill({json:{version:8,sources:{},layers:[]}});
   if(new URL(u).searchParams.get('data')?.includes('[out:json]'))return r.fulfill({json:fixture([135.432,34.665])});
   return r.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#18/34.665/135.432/0/0');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map.gl?.isStyleLoaded());
  await page.evaluate(()=>document.getElementById('mapMakerIntroClose')?.click());
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active);
  await page.evaluate(()=>{
   const ll=map.containerPointToLatLng([2,map.getSize().y*.55]);
   poiCont.addGeoJSON({geojson:[{type:'Feature',id:'node/popup-test',properties:{shop:'electronics',name:'画面端の目印テスト','name:en':'Marker at the edge'},geometry:{type:'Point',coordinates:[ll.lng,ll.lat]}}],targets:[['shop']],enable:[true]});
   Marker.set('shop');
  });
  await page.waitForFunction(()=>Marker.markers.shop?.length===1);
  const open=()=>page.evaluate(()=>Marker.markers.shop[0].getElement().click());
  await open();console.log('Opened',lang,width);
  if(width<992) {
   const dialog=page.locator('.mapmaker-popup-dialog');await dialog.waitFor({state:'visible'});
   const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
   assert.equal(await page.evaluate(()=>document.querySelector('dialog').matches(':modal')),true);
   const selects=dialog.locator('select');await selects.nth(0).selectOption('subtle');await selects.nth(1).selectOption('1.5');
   assert.deepEqual(await page.evaluate(()=>[Marker.markers.shop[0].mapmaker_appearance,Marker.markers.shop[0].mapmaker_icon_scale]),['subtle',1.5]);
   await page.screenshot({path:`/tmp/mapmaker-marker-dialog-${lang}-${width}.png`});
   await dialog.locator('.btn-close').click();assert.equal(await dialog.count(),0);
   await open();await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
   await open();await dialog.locator('.mapmaker-popup-body button').first().click();
   console.log('Picker',lang,width);await page.waitForFunction(()=>winCont.modalMode);assert.equal(await dialog.count(),0,'close marker dialog before icon picker');
   await page.waitForFunction(()=>!winCont.modal._isTransitioning);console.log('Select icon',lang,width);await page.locator('#modal_window_message a img').first().click();console.log('Selected icon',lang,width);await page.locator('#modal_window').waitFor({state:'hidden'});
   await open();await dialog.locator('.mapmaker-popup-body button').nth(2).click();
   await page.waitForFunction(()=>Marker.markers.shop[0].mapmaker_lang==='name:en');assert.equal(await dialog.count(),0);
   await open();await dialog.locator('.mapmaker-popup-body button').nth(1).click();assert.equal(await dialog.count(),0);
   assert.equal(await page.evaluate(()=>poiCont.get_osmid('node/popup-test').enable),false);
   await page.evaluate(()=>{ManualPins.active=true;window.testPin=ManualPins.place(map.getCenter());ManualPins.active=false;ManualPins.popup(testPin,map.getCenter());});
   await dialog.locator('[data-pin-kind="pushpin"]').click();
   await dialog.locator('input[name="label"]').fill('集合場所');await dialog.locator('button[type="submit"]').click();
   assert.deepEqual(await page.evaluate(()=>{const p=ManualPins.pins.get(testPin);return [p.kind,p.label];}),['pushpin','集合場所']);assert.equal(await dialog.count(),0);
  } else {assert.equal(await page.locator('.maplibregl-popup').count(),1);assert.equal(await page.locator('dialog.mapmaker-popup-dialog').count(),0);}
  assert.deepEqual(errors,[]);console.log('PASS marker editor',lang,width,height,'viewport, actions, close, icon-picker transition and manual pin');await page.close();
 }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
