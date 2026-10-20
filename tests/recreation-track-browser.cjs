const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const center=JSON.parse(process.env.COURSE_CENTER||'[135.432,34.665]'),output=process.env.COURSE_ARTIFACTS||'/tmp/mapmaker-recreation-track';
 const fixture=process.env.COURSE_OSM_FIXTURE?JSON.parse(await fs.readFile(process.env.COURSE_OSM_FIXTURE,'utf8')):{elements:[
  {type:'node',id:1,lon:135.429,lat:34.665},{type:'node',id:2,lon:135.431,lat:34.666},{type:'node',id:3,lon:135.433,lat:34.665},
  {type:'way',id:10,nodes:[1,2,3],tags:{roller_coaster:'track'}},
  {type:'node',id:4,lon:135.429,lat:34.664},{type:'node',id:5,lon:135.433,lat:34.664},
  {type:'way',id:11,nodes:[4,5],tags:{railway:'rail'}},
  {type:'node',id:6,lon:135.429,lat:34.6665},{type:'node',id:7,lon:135.433,lat:34.6665},
  {type:'way',id:12,nodes:[6,7],tags:{highway:'raceway',sport:'motor',name:'Kids circuit'}},
  {type:'node',id:8,lon:135.429,lat:34.6668},{type:'node',id:9,lon:135.433,lat:34.6668},
  {type:'way',id:13,nodes:[8,9],tags:{attraction:'water_slide',name:'Water slide'}}]};
 const hasRailway=fixture.elements.some(e=>e.tags?.railway==='rail');
 try{
 for(const [lang,width] of [['ja',390],['en',1280]]){
  const page=await browser.newPage({viewport:{width,height:900},ignoreHTTPSErrors:true}),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(/script.google.com|googletagmanager/.test(url))return route.fulfill({body:'{}'});
   if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:fixture});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#16/'+center[1]+'/'+center[0]+'/0/30');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  assert.equal(await page.locator('#recreation_track .layer-control-label').innerText(),lang==='ja'?'遊戯・競技コース':'Rides / race courses');
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Conf.default.Paper.dpi=72;Birdseye.setEnabled(true);mapMaker.make();});
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
  const summary=await page.evaluate(()=>{
   const models=[...map.features.values()],courses=models.filter(m=>m.mapmaker?.key==='recreation_track'),railways=models.filter(m=>m.mapmaker?.key==='railway');
   return {tracks:Layers.recreation_track.geojson.length,courses:courses.length,railways:railways.length,
    courseDashes:courses.map(m=>m.options.dashArray),coursePasses:courses.map(m=>m.mapmaker.drawOrder.passOrder),
    names:Layers.recreation_track.geojson.map(feature=>feature.properties?.name),
    racewayInMotorway:models.filter(m=>m.mapmaker?.key==='highway_motorway'&&m.feature.properties.highway==='raceway').length,
    railOver:railways.some(m=>m.mapmaker.drawOrder.passOrder===1)};
  });
  assert.ok(summary.tracks>0);assert.equal(summary.courses,summary.tracks);if(hasRailway)assert.ok(summary.railOver);
  assert.equal(summary.racewayInMotorway,0);
  if(process.env.COURSE_EXPECT_NAME)assert.ok(summary.names.includes(process.env.COURSE_EXPECT_NAME));
  assert.ok(summary.courseDashes.every(d=>d===null));assert.ok(summary.coursePasses.every(pass=>pass===0));
  await page.screenshot({path:output+'-'+width+'.png'});
  await page.evaluate(async()=>{
   window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});
   Layers.recreation_track.color='#e04b35';Layers.recreation_track.width=1.5;map.editorRenderer.refreshCategory('recreation_track');
   mapMaker.area_select('');await mapMaker.save('svg');await mapMaker.save('png');
  });
  assert.equal(await page.evaluate(()=>[...map.features.values()].filter(m=>m.mapmaker?.key==='recreation_track').every(m=>m.options.color==='#e04b35'&&Math.abs(m.options.weight-SVGCont.svg_style('recreation_track').weight)<1e-8)),true,'all course types share color and width');
  const saved=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,bytes:[...new Uint8Array(await blob.arrayBuffer())]}))));
  assert.equal(saved.length,2);
  for(const file of saved){
   const bytes=Buffer.from(file.bytes);await fs.writeFile(output+'-'+width+'-export.'+file.type,bytes);
   if(file.type==='svg'){
    const text=bytes.toString(),tracks=[...text.matchAll(/<path\b[^>]*stroke="#e04b35"[^>]*>/g)].map(m=>m[0]);
    assert.ok(tracks.length>0);assert.ok(tracks.every(path=>!path.includes('stroke-dasharray')));if(hasRailway)assert.match(text,/stroke-dasharray/);
   }else assert.equal(bytes.subarray(1,4).toString(),'PNG');
  }
  await page.evaluate(()=>mapMaker.toggleLayerVisibility('recreation_track',false));
  assert.equal(await page.evaluate(()=>Number(Layers.recreation_track.opacity)),0);
  await page.evaluate(()=>mapMaker.toggleLayerVisibility('recreation_track',true));
  assert.equal(await page.evaluate(()=>Number(Layers.recreation_track.opacity)),1);
  await page.evaluate(async()=>{Birdseye.setEnabled(false);await map.editorRenderer.sync();});
  assert.ok(await page.evaluate(()=>[...map.features.values()].filter(m=>m.mapmaker?.key==='recreation_track').every(m=>m.options.dashArray===null)));
  if(width<992)await page.locator('#mobileStylesTab').click();
  await page.locator('#recreation_track').scrollIntoViewIfNeeded();
  const label=await page.locator('#recreation_track .layer-control-label').evaluate(element=>({width:element.clientWidth,textWidth:element.scrollWidth}));
  assert.ok(label.textWidth<=label.width+1,'the combined label fits the control row');
  await page.screenshot({path:output+'-'+width+'-controls.png'});
  assert.deepEqual(errors,[]);console.log('PASS',lang,width,summary,'shared course controls, solid tracks, railway overlays, independent color/width, SVG/PNG, hide/restore and 2D');
  await page.close();
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
