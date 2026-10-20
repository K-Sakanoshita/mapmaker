// Real Expo source: roof decks/stairs must be visible in the editor and exports.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const deadline=setTimeout(()=>browser.close(),180000);
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ja-JP',ignoreHTTPSErrors:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.text().startsWith('PATH_TEST'))console.log(msg.text());});
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('script.google.com')||url.includes('googletagmanager'))return route.fulfill({body:'{}'});
  if(process.env.EXPO_OSM_FIXTURE && url.includes('/2026-10-19-4/expo2025.osm.json'))return route.fulfill({contentType:'application/json',body:await fs.readFile(process.env.EXPO_OSM_FIXTURE,'utf8')});
  return route.continue();
 });
 await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+'/?lang=ja&preset=expo2025#16.3/34.6489/135.3832/0/40');
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:90000});
 await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);Conf.default.Paper.dpi=72;});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode&&map.editorRenderer?.active,null,{timeout:120000});
 const made=await page.evaluate(()=>{
  const renderer=map.editorRenderer,meshes=[...renderer.pathMeshes],walk=renderer.pathMeshes.get('way/1378858734');
  const pathIds=new Set(meshes.map(([id])=>id));
  return {walk:walk && {height:walk.height,source:walk.sourceHeight},walkways:meshes.filter(([,m])=>m.shape==='walkway').length,stairs:meshes.filter(([,m])=>m.shape==='stairs').length,
   rendered:[...renderer.outlines.blocks.values()].filter(b=>b.mesh?.path).length,
   groundDuplicates:[...renderer.data.values()].filter(f=>pathIds.has(f.id)).length,
   modelDuplicates:[...map.features.values()].filter(m=>pathIds.has(m.feature?.id)&&renderer.data.has(m.id)).length};
 });
 assert.ok(made.walk);assert.equal(made.walk.source,17.8);assert.equal(made.walk.height,20.08);assert.ok(made.stairs>10);assert.ok(made.rendered>=made.stairs+made.walkways);assert.equal(made.modelDuplicates,0);
 await page.evaluate(()=>{window.__pathOriginalColor=Layers.highway_alley.color;Layers.highway_alley.color='#ff0000';Layers.highway_alley.width=1;map.editorRenderer.refreshCategory('highway_alley');map.gl.triggerRepaint();});
 await page.waitForFunction(()=>{const r=map.editorRenderer.outlines,i=r.walkwayCasingRows*11;return r.walkwayData?.length>i&&r.walkwayData[i+6]===1&&r.walkwayData[i+7]===0;});
 const lines=await page.evaluate(()=>{const r=map.editorRenderer.outlines,w=[...r.walkways.values()][0],block=r.blocks.get(w.model.id),data=r.walkwayData,i=r.walkwayCasingRows*11;return {casings:r.walkwayCasingRows,casingWidth:data[10],casingGreen:data[7],width:w.model.options.weight,dash:w.model.options.dashArray,sourceHeight:block.mesh.sourceHeight,paintedRows:data.length/11,filled:!!block.roofEnd,red:data[i+6],green:data[i+7],blue:data[i+8]};});
 assert.ok(lines.casings>0);assert.equal(lines.casingGreen,1);assert.ok(Math.abs(lines.casingWidth-lines.width-2)<1e-6);assert.equal(lines.filled,false);assert.equal(lines.red,1);assert.equal(lines.green,0);assert.equal(lines.blue,0);assert.equal(lines.dash,'4 2');assert.ok(lines.width<3);assert.ok(lines.paintedRows>0);
 await page.screenshot({path:'/tmp/mapmaker-elevated-paths-editor.png'});console.log('Editor',made,lines);
 await page.evaluate(async()=>{window.__pathCamera={center:map.gl.getCenter(),zoom:map.gl.getZoom(),pitch:map.gl.getPitch(),bearing:map.gl.getBearing()};await new Promise(resolve=>{map.gl.once('idle',resolve);map.gl.jumpTo({center:[135.38355,34.65202],zoom:19,pitch:55});});});
 await page.screenshot({path:'/tmp/mapmaker-elevated-paths-stairs.png'});
 await page.evaluate(()=>{Layers.highway_alley.color=__pathOriginalColor;map.editorRenderer.refreshCategory('highway_alley');});
 await page.waitForFunction(()=>{const r=map.editorRenderer.outlines;return r.walkwayData[r.walkwayCasingRows*11+7]>0;});
 await page.screenshot({path:'/tmp/mapmaker-elevated-paths-casing.png'});
 await page.evaluate(()=>{Layers.highway_alley.color='#ff0000';map.editorRenderer.refreshCategory('highway_alley');});
 await page.evaluate(()=>new Promise(resolve=>{map.gl.once('idle',resolve);map.gl.jumpTo(__pathCamera);}));
 await page.evaluate(async()=>{window.__files=[];SVGCont._saveBlob=(blob,type)=>{__files.push({blob,type});console.log('PATH_TEST saved',type,blob.size);};mapMaker.area_select('');await mapMaker.save('svg');});
 console.log('SVG save completed');
 await page.evaluate(()=>mapMaker.save('png'));
 const files=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);})}))));
 assert.equal(files.length,2);
 for(const file of files){const bytes=Buffer.from(file.data,'base64');await fs.writeFile(`/tmp/mapmaker-elevated-paths.${file.type}`,bytes);if(file.type==='svg'){assert.match(bytes.toString(),/data-elevated-path-id="way\/1378858734"/);assert.match(bytes.toString(),/data-path-kind="stairs"/);const upper=bytes.toString().match(/data-elevated-path-id="way\/1378858734"[^>]*>([\s\S]*?)(?=<g data-rough-preserve|<\/svg>)/)?.[1];assert.ok(upper);assert.match(upper,/data-path-casing="true"/);assert.match(upper,/stroke="#ffffff"/);assert.match(upper,/stroke="#ff0000"/);assert.match(upper,/stroke-dasharray=/);assert.match(upper,/fill="none"/);assert.doesNotMatch(bytes.toString(),/NaN|Infinity/);}}
 // Geometry and source OSM tags survive mode changes; no 3D deck remains in 2D.
 await page.evaluate(async()=>{Birdseye.setEnabled(false);await map.editorRenderer.sync();});
 await page.waitForFunction(()=>!map.threeD&&map.editorRenderer.pathMeshes.size===0);
 await page.screenshot({path:'/tmp/mapmaker-elevated-paths-2d.png'});
 assert.deepEqual(errors,[]);console.log('PASS real rooftop walkways/connected stairs in 3D editor, SVG/PNG download and flat 2D restoration');
 }finally{clearTimeout(deadline);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
