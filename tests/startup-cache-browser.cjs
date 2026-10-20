// Real HTTP cache regression: warm an obsolete menu, then open the current app.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=process.cwd(),menu=fs.readFileSync('basemenu.html','utf8');
 let menuRequests=0;
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__warmup'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ja"></html>');return;}
  if(pathname==='/basemenu.html'){
   res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','public,max-age=3600');
   res.end(++menuRequests===1?menu.replace('id="modal_select_size_preset"','id="obsolete_size_preset"'):menu);return;
  }
  if(pathname==='/tiles/osmfj_poi.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:8,sources:{},layers:[]}));return;}
  const filename=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.jsonc':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  fs.readFile(filename,(error,body)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');res.end(body);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  for(const width of [390,1280]){
   menuRequests=0;
   const context=await browser.newContext({viewport:{width,height:844},locale:'ja-JP',ignoreHTTPSErrors:true});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&m.text().includes('POI'))errors.push(m.text());});
   const base='http://127.0.0.1:'+server.address().port;
   await page.goto(base+'/__warmup');
   assert.equal(await page.evaluate(async()=>{const text=await(await fetch('/basemenu.html')).text();return text.includes('id="obsolete_size_preset"');}),true);
   await page.goto(base+'/?lang=ja#17.66/34.724002/135.484338/-21.4/30');
   await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
   assert.equal(menuRequests,2,'current startup must revalidate the previously fresh cached menu');
   await page.evaluate(()=>{
    document.getElementById('mapMakerIntroClose')?.click();
    overPassCont.get=async()=>({geojson:[{type:'Feature',id:'node/1',properties:{id:'node/1',amenity:'vending_machine',vending:'drinks',name:'コカ・コーラ'},geometry:{type:'Point',coordinates:[135.484338,34.724002]}}],targets:[['shop']]});
    window.__iconAttempt=mapMaker.addPoi('shop');
   });
   await page.locator('#modal_select_size_preset').waitFor({state:'visible'});
   assert.equal(await page.locator('#modal_select_size_preset').inputValue(),'14');
   assert.ok((await page.locator('#modal_select_table').innerText()).includes('コカ・コーラ'));
   await page.locator('#modal_select_cancel').click();await page.evaluate(()=>window.__iconAttempt);
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS',width,'cached old menu revalidated; real addPoi list, size selector and cancel work');
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
