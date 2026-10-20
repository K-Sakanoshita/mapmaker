const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 for(const [lang,viewport] of [['ja',{width:390,height:844}],['en',{width:1280,height:900}]]){
  const page=await browser.newPage({viewport,ignoreHTTPSErrors:true}),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  const osm=fixture([135.432,34.665]);osm.elements.push({type:'node',id:990001,lon:135.4315,lat:34.665},{type:'node',id:990002,lon:135.4325,lat:34.665},{type:'way',id:990003,nodes:[990001,990002],tags:{waterway:'stream',name:'Viewport stream'}});
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(/script.google.com|googletagmanager/.test(url))return route.fulfill({body:'{}'});
   if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:osm});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#16/34.665/135.432/0/0');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();window.__requests=[];
   const run=overPassCont.runDataWorker.bind(overPassCont);overPassCont.runDataWorker=(data,...args)=>{__requests.push({zoom:data.zoom,viewport:data.viewport,keys:Object.keys(data.osm),streams:data.osm.waterLine?.tags.includes('waterway=stream')});return run(data,...args);};
  });
  await page.evaluate(()=>{window.__messages=[];const original=winCont.modal_text.bind(winCont);winCont.modal_text=(text,...args)=>{__messages.push(text);return original(text,...args);};});
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
  if(viewport.width<992)await page.locator('#mobileStylesTab').click();
  assert.equal(await page.locator('#roughControls').evaluate(e=>e.tagName),'DETAILS');
  assert.equal(await page.locator('#roughControls #paperSizeSelect').count(),0);
  await page.locator('#roughControls > summary').click();
  assert.equal(await page.locator('#mapSeason').isVisible(),true);
  await page.locator('#roughControls > summary').click();
  assert.equal(await page.locator('#mapSeason').isVisible(),false);
  if(viewport.width<992){await page.locator('#exportSettings > summary').click();assert.equal(await page.locator('#paperSizeSelect').isVisible(),true);await page.locator('#exportSettings > summary').click();}
  await page.screenshot({path:'/tmp/mapmaker-settings-groups-'+lang+'.png'});
  assert.equal(await page.locator('#mobileStylesTab span').innerText(),lang==='ja'?'調整':'Adjust');
  assert.equal(await page.locator('.palette-preview > span').count(),15);
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.palette-preview')].every(preview=>[...preview.children].every((chip,i)=>{
    const color=Conf.style[preview.dataset.palette][['background','park','waterArea','highway_primary','building'][i]].color;
    const expected=document.createElement('span');expected.style.backgroundColor=color;
    return chip.style.backgroundColor===expected.style.backgroundColor;
  }))),true,'previews use actual palette colors');
  await page.locator('#ColorSelect').click();
  await page.screenshot({path:'/tmp/mapmaker-palette-previews-'+lang+'.png'});
  await page.locator('#ColorSelect').click();
  assert.ok((await page.locator('#roughControls summary small').innerText()).length>0);
  await page.locator('#panelLands > summary').click();
  assert.equal(await page.locator('#park_layer').isVisible(),false);
  await page.locator('#panelLands > summary').press('Enter');
  assert.equal(await page.locator('#park_layer').isVisible(),true);
  const key='park';
  const button=page.locator('#'+key+'_layer');
  await button.scrollIntoViewIfNeeded();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  await button.click();
  await page.waitForFunction(key=>Number(Layers[key].opacity)===0,key);
  assert.equal(await button.getAttribute('aria-pressed'),'false');
  assert.ok(await button.locator('i').evaluate(e=>e.classList.contains('fa-eye-slash')));
  assert.ok(await page.locator('#'+key).evaluate(e=>e.classList.contains('is-layer-hidden')));
  await button.click();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  const background=page.locator('#background_layer');await background.scrollIntoViewIfNeeded();
  await background.click();assert.equal(await background.getAttribute('aria-pressed'),'false');
  await background.click();assert.equal(await background.getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>Number(Layers.background.opacity)),1);
  const reset=page.locator('.save-reset button');
  assert.equal(await reset.evaluate(e=>getComputedStyle(e).fontSize),await page.locator('#saveDownloadMenu').evaluate(e=>getComputedStyle(e).fontSize),'same font size as Save');
  assert.equal(await reset.locator('.fa-vector-square').count(),1);
  assert.equal(await page.locator('#AreaSelect1 .fa-file').count(),1);
  assert.match(await reset.innerText(),lang==='ja'?/再選択/:/Reselect area/);
  assert.ok(await reset.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'reset label fits');
  if(viewport.width>=992)assert.ok(await page.evaluate(()=>document.getElementById('saveMap').getBoundingClientRect().bottom<=document.getElementById('controlMenu').getBoundingClientRect().top+1),'save controls do not overlap the editor tabs');
  for(const width of [320,390,1280]) {
   await page.setViewportSize({width,height:844});
   await page.waitForFunction(mobile=>document.getElementById('editbar').classList.contains('mobile-editor')===mobile,width<992);
   const spacing=await page.evaluate(()=>{
    const left=document.querySelector('.save-reset button').getBoundingClientRect(),right=document.getElementById('saveDownloadMenu').getBoundingClientRect();
    return {gap:right.left-left.right,left:left.left,right:right.right,width:innerWidth,sameRow:Math.abs(left.top-right.top)<1,heightDifference:Math.abs(left.height-right.height)};
   });
   if(width<992){
    const zoom=await page.locator('#zoomlevel').evaluate(e=>({left:e.getBoundingClientRect().left,bottom:getComputedStyle(e).marginBottom}));
    assert.ok(zoom.left<=5,JSON.stringify(zoom));assert.ok(['8px','40px'].includes(zoom.bottom),JSON.stringify(zoom));
   }
   assert.ok(spacing.heightDifference<1,JSON.stringify(spacing));
   assert.ok(spacing.gap>=7.5,JSON.stringify(spacing));
   assert.ok(spacing.left>=0&&spacing.right<=spacing.width&&spacing.sameRow,JSON.stringify(spacing));
  }
  await page.setViewportSize(viewport);
  if(viewport.width>=992)assert.ok(await page.evaluate(()=>document.querySelector('.basemenu-window-controls').getBoundingClientRect().bottom<=document.getElementById('saveMap').getBoundingClientRect().top+1),'window controls have a separate row');
  await reset.scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/mapmaker-reset-button-'+lang+'.png'});
  await reset.click();
  assert.match(await page.locator('#modal_window').innerText(),lang==='ja'?/編集中の内容を破棄/:/Discard your edits/);
  await page.locator('#modal_window_no').click();await page.waitForFunction(()=>!winCont.modalMode);
  assert.equal(await page.evaluate(()=>mapMaker.customMode),true,'cancel keeps editing');
  assert.ok(await page.evaluate(()=>__messages.some(t=>t.includes(glot.get('loading_draw')))));
  assert.ok(await page.evaluate(()=>__messages.every(t=>!/Cliping|Writeing|Data Loading|Map Ordering/.test(t))));
  await page.screenshot({path:'/tmp/mapmaker-ui-clarity-'+lang+'.png'});
  await page.locator('.save-reset button').click();await page.locator('#modal_window_yes').click();
  await page.waitForFunction(()=>!mapMaker.customMode&&!mapMaker.resetting&&!winCont.modalMode);
  assert.deepEqual(errors,[]);console.log('PASS',lang,viewport,'visibility hide/restore, background, reset cancel/confirm, translated progress');
  await page.close();
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
