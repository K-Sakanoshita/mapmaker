const assert=require('node:assert/strict');
module.exports=async page=>{
 const result=await page.evaluate(async()=>{
  const dialog=document.getElementById('processingDialog'),apply=LayerCont.applyPalette;
  const toggle=document.getElementById('rough_enabled'),wasRough=toggle.checked,old=LayerCont.palette;
  const visible=()=>!dialog.classList.contains('d-none');const observed=[];
  LayerCont.applyPalette=function(palette){observed.push(visible());return apply.call(this,palette);};
  try{
   for(const palette of ['mono','coloring','color']){
    const task=LayerCont.setStyle(palette);
    if(!visible())throw Error('palette processing message is missing');
    await task;
    if(visible()||LayerCont.palette!==palette)throw Error('palette processing did not finish');
   }
   toggle.checked=true;await LayerCont.setStyle('mono');
   const rough=!!document.getElementById('mapmakerRoughPreview')&&!visible();
   toggle.checked=false;mapMaker.clearRoughPreview();await LayerCont.setStyle(old);
   return {observed,rough,hidden:!visible(),dialogs:document.querySelectorAll('#processingDialog').length};
  }finally{LayerCont.applyPalette=apply;toggle.checked=wasRough;}
 });
 assert.ok(result.observed.every(Boolean),'message is visible during each synchronous palette update');
 assert.equal(result.rough,true);assert.equal(result.hidden,true);assert.equal(result.dialogs,1);
};
