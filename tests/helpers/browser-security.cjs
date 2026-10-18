// Uses the actual Marker/Popup adapter and the browser DOM, including event dispatch.
module.exports=async page=>{
 const result=await page.evaluate(async()=>{
  const payload='<img src=x onerror="window.__injected=1">\'" & <svg onload="window.__injected=1">';
  const center=map.getCenter();
  const feature={type:'Feature',id:'node/security',properties:{wikipedia:'ja:'+payload,name:payload,'name:en':payload},geometry:{type:'Point',coordinates:[center.lng,center.lat]}};
  poiCont.addGeoJSON({geojson:[feature],targets:[['wikipedia']],enable:[true]});
  Marker.set('wikipedia');await Promise.resolve();
  const marker=Marker.markers.wikipedia[0];
  const element=marker.getElement();
  const literal=element.querySelector('img').getAttribute('icon-name')===payload&&element.querySelector('span').textContent===payload;
  element.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const popup=document.querySelector('.maplibregl-popup-content');
  const popupLiteral=popup.querySelector('span').textContent==='ja:'+payload&&!popup.querySelector('img,svg,[onclick],[onchange]');
  Marker.qr_add('wikipedia',feature.id,'https://ja.wikipedia.org/wiki/Test',{lat:center.lat,lng:center.lng},[payload,{source:'javascript:window.__injected=1'}]);
  const qr=Marker.markers.wikipedia[0][1].getElement();
  const articleLiteral=qr.querySelector('span').textContent.startsWith(payload)&&qr.querySelectorAll('img').length===0;
  qr.querySelector('.wiki-article-close').click();
  await Marker.clearAll();poiCont.clearAll();
  const safe=Marker.safeImageURL('https://upload.wikimedia.org/wikipedia/commons/a/a0/Test.jpg',true);
  return {literal,popupLiteral,articleLiteral,injected:!!window.__injected,safe,blocked:Marker.safeImageURL('https://evil.test/image.svg')};
 });
 const assert=require('node:assert/strict');
 assert.equal(result.literal,true);assert.equal(result.popupLiteral,true);assert.equal(result.articleLiteral,true);assert.equal(result.injected,false);assert.ok(result.safe);assert.equal(result.blocked,'');
};
