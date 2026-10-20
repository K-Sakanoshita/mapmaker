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
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#13.8/34.665/135.432/0/0');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();window.__requests=[];
   const run=overPassCont.runDataWorker.bind(overPassCont);overPassCont.runDataWorker=(data,...args)=>{__requests.push({zoom:data.zoom,viewport:data.viewport,keys:Object.keys(data.osm),streams:data.osm.waterLine?.tags.includes('waterway=stream')});return run(data,...args);};
  });
  const initial=await page.evaluate(()=>({real:mapMaker.zoomLevel(),detail:mapMaker.acquisitionZoom(),building:Conf.style[LayerCont.palette].building.zoom,guidance:document.getElementById('morezoomFeatures').textContent,exampleName:glot.get('menu_farmland'),display:document.getElementById('zoomlevelValue').textContent}));
  const includesBuilding=initial.detail>=initial.building;
  assert.equal(includesBuilding,viewport.width<992);assert.ok(initial.display.includes('13.8'));
  assert.equal(initial.guidance.includes(initial.exampleName),!includesBuilding,JSON.stringify(initial));
  await page.evaluate(()=>map.gl.jumpTo({bearing:45,pitch:25}));
  const tilted=await page.evaluate(()=>mapMaker.acquisitionZoom());assert.ok(tilted<=initial.detail);
  await page.evaluate(()=>map.gl.jumpTo({bearing:0,pitch:0}));
  await page.locator('#makeMap button').first().click();
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
  const made=await page.evaluate(()=>({real:mapMaker.zoomLevel(),detail:mapMaker.acquisitionZoom(),stored:mapMaker.acquiredZoom,request:__requests[0],buildings:Layers.building.geojson?.length||0,row:!document.getElementById('building').classList.contains('d-none'),streams:Layers.waterLine.geojson?.some(f=>f.properties.name==='Viewport stream')||false}));
  assert.equal(made.detail,initial.detail);assert.equal(made.stored,initial.detail);assert.equal(made.request.zoom,13.8);
  assert.equal(made.request.keys.includes('building'),includesBuilding);assert.equal(made.buildings>0,includesBuilding);assert.equal(made.row,includesBuilding);assert.equal(made.streams,includesBuilding);
  assert.equal(made.request.streams,includesBuilding);
  if(viewport.width<992)await page.locator('#mobileStylesTab').click();
  assert.equal(await page.evaluate(()=>mapMaker.acquisitionZoom()),made.detail,'opening the sheet preserves acquired detail');
  await page.setViewportSize(viewport.width<992?{width:1280,height:900}:{width:390,height:844});
  await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(()=>({detail:mapMaker.acquisitionZoom(),row:!document.getElementById('building').classList.contains('d-none')})),{detail:made.detail,row:includesBuilding});
  await page.screenshot({path:'/tmp/mapmaker-viewport-'+lang+'.png'});
  await page.locator('.save-reset button').click();await page.locator('#modal_window_yes').click();
  await page.waitForFunction(()=>!mapMaker.customMode&&!mapMaker.resetting&&!winCont.modalMode);
  const reset=await page.evaluate(()=>({detail:mapMaker.acquisitionZoom(),stored:mapMaker.acquiredZoom}));
  assert.equal(reset.stored,undefined);assert.notEqual(reset.detail,made.detail,'reset resumes calculation for the resized map');
  await page.evaluate(()=>{Conf.system.MapData.viewportZoom.enabled=false;mapMaker.zoomMessage();});
  assert.equal(await page.evaluate(()=>mapMaker.acquisitionZoom()),13.8);
  assert.deepEqual(errors,[]);console.log('PASS',lang,viewport,initial,{tilted,made,reset},'actual request/guidance/menu, pitch/bearing, frozen sheet/resize, reset and disabled config');
  await page.close();
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
