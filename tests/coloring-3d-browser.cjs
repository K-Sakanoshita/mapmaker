// Coloring must use opaque roof/wall surfaces in the live editor, as SVG/PNG do.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const deadline=setTimeout(()=>browser.close(),180000);
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ja-JP',ignoreHTTPSErrors:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('script.google.com')||url.includes('googletagmanager'))return route.fulfill({body:'{}'});
  if(process.env.EXPO_OSM_FIXTURE&&url.includes('/2026-10-19-4/expo2025.osm.json'))return route.fulfill({contentType:'application/json',body:await fs.readFile(process.env.EXPO_OSM_FIXTURE,'utf8')});
  return route.continue();
 });
 await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja&preset=expo2025#16.72/34.648954/135.382371/42.7/40');
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:90000});
 await page.evaluate(async()=>{document.getElementById('mapMakerIntroClose')?.click();await LayerCont.setStyle('coloring');Birdseye.setEnabled(true);});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active,null,{timeout:120000});
 const inspect=()=>page.evaluate(()=>{
  const r=map.editorRenderer,building=[...r.models.values()].find(m=>m.feature?.id==='relation/18047883');
  const entries=r.entries.filter(e=>e.type==='fill-extrusion'&&e.group.key==='building');
  const roof=[...(r.outlines?.blocks.values() || [])].find(b=>b.mesh&&!b.mesh.path&&b.roofEnd>b.roofStart);
  return {palette:LayerCont.palette,threeD:map.threeD,ring:building?.feature?.id,solidBuildingGroups:entries.length,
   transparentBuildingGroups:entries.filter(e=>map.gl.getPaintProperty(e.id,'fill-extrusion-opacity')===0).length,
   roofAlpha:roof?r.outlines.fillData[roof.roofStart+6]:null,fill:SVGCont.svg_style('building',false).fillColor,
   visibility:entries.map(e=>map.gl.getLayoutProperty(e.id,'visibility'))};
 });
 const initial=await inspect();assert.equal(initial.palette,'coloring');assert.equal(initial.ring,'relation/18047883');assert.ok(initial.solidBuildingGroups>0);assert.equal(initial.transparentBuildingGroups,0);assert.equal(initial.roofAlpha,1);assert.equal(initial.fill,'#ffffff');
 await page.screenshot({path:'/tmp/mapmaker-coloring-3d-editor.png'});console.log('Opaque live coloring',initial);
 await page.evaluate(async()=>{window.__coloringFile=null;SVGCont._saveBlob=blob=>__coloringFile=blob;mapMaker.area_select('');await mapMaker.save('png');});
 const data=await page.evaluate(()=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(__coloringFile);}));
 await fs.writeFile('/tmp/mapmaker-coloring-3d.png',Buffer.from(data,'base64'));
 await page.evaluate(()=>{Layers.building.opacity=0;map.editorRenderer.setCategoryVisibility('building');});
 assert.ok((await inspect()).visibility.every(v=>v==='none'));
 await page.evaluate(()=>{Layers.building.opacity=1;map.editorRenderer.setCategoryVisibility('building');});
 assert.ok((await inspect()).visibility.every(v=>v==='visible'));
 for(const palette of ['color','coloring']) {
  await page.evaluate(async p=>{await LayerCont.setStyle(p);await map.editorRenderer.sync();},palette);
  const state=await inspect();assert.equal(state.palette,palette);assert.equal(state.transparentBuildingGroups,0);assert.ok(state.roofAlpha>0);
 }
 await page.evaluate(async()=>{Birdseye.setEnabled(false);await map.editorRenderer.sync();});
 assert.equal((await inspect()).threeD,false);assert.deepEqual(errors,[]);
 console.log('PASS opaque coloring editor roofs/walls, PNG save, hide/restore, palette roundtrip and 2D restoration');
 }finally{clearTimeout(deadline);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
