module.exports=async(browser,base)=>{
 const assert=require('node:assert/strict');
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const lang of ['ja','en']){
  for(const failure of ['html','config','parse','language','network','ok']){
   await page.route('**/*',route=>{
    const url=route.request().url();
    if((failure==='html'&&url.endsWith('/basemenu.html'))||(failure==='config'&&url.endsWith('/data/config-user.jsonc'))||(failure==='language'&&url.endsWith('/data/glot.json')))return route.fulfill({status:404,body:'missing'});
    if(failure==='parse'&&url.endsWith('/data/config-user.jsonc'))return route.fulfill({body:'{broken'});
    if(failure==='network'&&url.endsWith('/data/marker.jsonc'))return route.abort('failed');
    if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
    if(url.includes('googletagmanager.com'))return route.fulfill({body:''});
    return route.continue();
   });
   await page.goto(base+(lang==='en'?'/en/':'/'),{waitUntil:'domcontentloaded'});
   if(failure==='ok')await page.waitForFunction(()=>typeof map!=='undefined'&&!!map?.gl,null,{timeout:60000});
   else {
    await page.locator('[role="alert"]').waitFor({timeout:60000});
    const text=await page.locator('[role="alert"]').innerText();
    assert.ok(text.includes(lang==='en'?'reload':'再読み込み'));
    assert.equal(await page.evaluate(()=>typeof map==='undefined'),true);
   }
   await page.unroute('**/*');
  }
 }
 assert.deepEqual(errors,[]);await context.close();console.log('PASS real-browser Japanese/English startup: HTML/config/language 404, malformed config, network failure and recovery');
};
