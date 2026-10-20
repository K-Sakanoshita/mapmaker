const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fixture=require('./helpers/osm-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
 for(const [lang,width] of [['ja',390],['en',1280]]){
  const page=await browser.newPage({viewport:{width,height:900},ignoreHTTPSErrors:true}),errors=[],urls=[];
  page.setDefaultTimeout(15000);
  let failColor=true,failAddress=true;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>urls.push(r.url()));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(/alwan.*\.js$/.test(url)&&failColor){failColor=false;return route.fulfill({status:503,body:''});}
   if(url.endsWith('/prefecture-all.jsonc')&&failAddress){failAddress=false;return route.fulfill({status:503,body:''});}
   if(/script.google.com|googletagmanager/.test(url))return route.fulfill({body:'{}'});
   if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[]}});
   if(new URL(url).searchParams.get('data')?.includes('[out:json]'))return route.fulfill({json:fixture([135.3832,34.6489])});
   return route.continue();
  });
  await page.goto((process.env.MAPMAKER_URL||'http://127.0.0.1:8765')+(lang==='en'?'/en/':'/')+'?lang='+lang+'#17/34.6489/135.3832/0/0');
  await page.waitForFunction(()=>typeof map!=='undefined'&&map?.gl?.isStyleLoaded(),null,{timeout:60000});
  const initial=await page.evaluate(()=>({icons:Object.keys(SVGCont.SvgIcon).length,pickers:Object.keys(mapMaker.colorPicker).length,turf:typeof turf,geocoder:typeof getLatLng,rough:typeof svg2roughjs,qr:typeof QRCode,table:typeof $.fn.DataTable}));
  assert.equal(initial.icons,0);assert.equal(initial.pickers,0);
  for(const key of ['turf','geocoder','rough','qr','table'])assert.equal(initial[key],'undefined',key+' must be deferred');
  assert.deepEqual(urls.filter(url=>/prefecture.*jsonc|popper.*\.js|\/icon\/.*\.svg/.test(url)),[]);
  await page.evaluate(()=>{document.getElementById('mapMakerIntroClose')?.click();mapMaker.make();});
  await page.waitForFunction(()=>mapMaker.customMode&&!mapMaker.loadingMap&&!winCont.modalMode,null,{timeout:60000});
  if(width<992)await page.locator('#mobileStylesTab').click();
  const key=await page.evaluate(()=>LayerCont.styles.find(key=>key!=='background'));
  const button=page.locator('#'+key+'_color');
  const originalBox=await button.boundingBox();assert.ok(originalBox.width>=20&&originalBox.height>=18);
  await button.click();
  await page.waitForFunction(()=>winCont.modalMode===true);
  await page.waitForFunction(()=>winCont.modal?._isShown&&!winCont.modal?._isTransitioning);
  await page.evaluate(()=>winCont.closeModal());
  await page.waitForFunction(()=>!winCont.modalMode);
  assert.equal(await button.isDisabled(),false);
  await button.click();
  await page.waitForFunction(key=>mapMaker.colorPicker[key]?.isOpen(),key);
  assert.equal(await page.evaluate(()=>Object.keys(mapMaker.colorPicker).length),1);
  await page.evaluate(key=>mapMaker.colorPicker[key].addSwatches('#123456'),key);
  await page.locator('.alwan__swatch[title="#123456"]').click();
  await page.waitForFunction(key=>Layers[key].color==='#123456',key);
  await page.evaluate(key=>mapMaker.colorPicker[key].close(),key);
  await page.evaluate(()=>LayerCont.setStyle('mono'));
  const reflected=await page.evaluate(()=>{
   const key=LayerCont.styles.find(key=>!mapMaker.colorPicker[key]),sample=document.createElement('span');
   sample.style.backgroundColor=Layers[key].color;
   return {expected:sample.style.backgroundColor,actual:document.getElementById(key+'_color').style.backgroundColor};
  });
  assert.equal(reflected.actual,reflected.expected,'unopened color controls reflect the new palette');
  const opened=await page.evaluate(key=>({actual:getComputedStyle(document.getElementById(key+'_color'),'::before').backgroundColor,color:mapMaker.colorPicker[key].getColor().rgb}),key);
  assert.equal(opened.actual.replaceAll(' ',''),opened.color.replaceAll(' ',''),'opened color controls also reflect the new palette');
  await page.screenshot({path:'/tmp/mapmaker-lazy-colors-'+width+'.png'});
  await page.evaluate(()=>{window.getLatLng=(_keyword,done)=>done({level:3,lat:35.1,lng:139.1});return mapMaker.searchPoi('test');});
  await page.waitForFunction(()=>winCont.modalMode===true);
  assert.equal(await page.evaluate(()=>Conf.allPrefecture===undefined),true);
  await page.waitForFunction(()=>winCont.modal?._isShown&&!winCont.modal?._isTransitioning);
  await page.evaluate(()=>winCont.closeModal());await page.waitForFunction(()=>!winCont.modalMode);
  await page.evaluate(()=>mapMaker.searchPoi('test'));
  await page.waitForFunction(()=>Conf.allPrefecture&&Math.abs(map.getCenter().lng-139.1)<.00001);
  assert.equal(urls.filter(url=>url.endsWith('/prefecture-all.jsonc')).length,2);
  assert.deepEqual(errors,[]);
  console.log('PASS',lang,width,'deferred startup, first color click/failure/retry/change, unopened palette controls, address failure/retry');
  await page.close();
 }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
