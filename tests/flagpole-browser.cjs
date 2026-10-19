const {chromium}=require('playwright'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900},locale:'ja-JP',deviceScaleFactor:width===390?2.5:1,ignoreHTTPSErrors:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.includes('script.google.com')||url.includes('googletagmanager.com'))return route.fulfill({status:200,body:'{}'});
 if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#fff'}}]}});
 if(new URL(url).searchParams.get('data')?.includes('[out:json]')){const data=fixture([135,35]);data.elements.push({type:'node',id:99001,lon:135.00012,lat:35.00025,tags:{man_made:'flagpole',name:'Test flagpole',height:'8','flag:colour':'red'}});return route.fulfill({json:data});}
 return route.continue();
 });
 await page.goto(process.env.MAPMAKER_TEST_URL || 'http://127.0.0.1:8765/');
 await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
 await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();Birdseye.setEnabled(true);map.gl.jumpTo({center:[135.00012,35.00025],zoom:19.1,pitch:25,bearing:0});Conf.default.Paper.dpi=100;});
 await page.locator('#makeMap button').first().click();
 await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
 const flag=await page.evaluate(()=>{
 const model=[...map.features.values()].find(m=>m.mapmaker?.pointStyleName==='flagpole');
 if(!model)throw Error('flagpole not automatically loaded');
 const renderer=map.editorRenderer,mesh=renderer.outlines.blocks.get(model.id).mesh;
 const source=JSON.stringify(model.mapmaker.sourceFeature);
 model.options.opacity=0;renderer.update(model);
 const block=renderer.outlines.blocks.get(model.id);
 const hidden=renderer.outlines.fillData.slice(block.roofStart,block.roofEnd).every((v,i)=>i%7!==6||v===0);
 model.options.opacity=1;renderer.update(model);
 return {height:mesh.height,faces:mesh.faces.length,hidden,restored:renderer.outlines.fillData[block.roofStart+6]>0,
 pole:mesh.faces.some(f=>f.kind==='pole'),
 noClothExtrusion:!renderer.entries.some(e=>e.group.treePart==='flag'&&e.type==='fill-extrusion'),
 unchanged:source===JSON.stringify(model.mapmaker.sourceFeature)};
 });
 assert.equal(flag.height,8);assert.equal(flag.faces,19);
 for(const k of ['hidden','restored','pole','noClothExtrusion','unchanged'])assert.equal(flag[k],true,k);

 await page.evaluate(async()=>{await mapMaker.queueExportPreview();});
 await page.screenshot({path:`/tmp/mapmaker-flagpole-${width}-editor.png`});
 const clip=await page.evaluate(()=>{const p=map.gl.project([135.00012,35.00025]),r=map.getContainer().getBoundingClientRect();return{x:r.x+p.x-70,y:r.y+p.y-70,width:140,height:140};});
 await page.screenshot({path:`/tmp/mapmaker-flagpole-${width}-detail.png`,clip});
 await page.evaluate(async()=>{window.__files=[];SVGCont._saveBlob=(blob,type)=>__files.push({blob,type});mapMaker.area_select('');await mapMaker.save('svg');await mapMaker.save('png');});
 const files=await page.evaluate(async()=>Promise.all(__files.map(async({blob,type})=>({type,data:Array.from(new Uint8Array(await blob.arrayBuffer()))}))));
 assert.equal(files.length,2);
 for(const file of files){const data=Buffer.from(file.data);await fs.writeFile(`/tmp/mapmaker-flagpole-${width}.${file.type}`,data);if(file.type==='svg')assert.match(data.toString(),/data-flagpole-cloth="true"/);}
 await page.evaluate(async()=>{Birdseye.setEnabled(false);await mapMaker.queueExportPreview();});
 assert.equal(await page.evaluate(()=>!!map.editorRenderer.outlines),false,'2D disables flagpole mesh');
 assert.deepEqual(errors,[]);console.log('PASS',width,'automatic flagpole, live pole/cloth, hide/restore and SVG/PNG downloads');
 await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
