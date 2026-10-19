const assert=require('node:assert/strict');
module.exports=async page=>{
 const result=await page.evaluate(async()=>{
  const element=document.getElementById('processingDialog');
  const toggle=document.getElementById('rough_enabled'),enabled=toggle.checked;
  const build=SVGCont.buildSVG,save=SVGCont.save;
  let releaseRough,releaseSave,roughTask,saveTask;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  try{
   toggle.checked=true;mapMaker.setRoughPreviewLock(true);
   SVGCont.buildSVG=()=>new Promise(resolve=>releaseRough=resolve);
   SVGCont.save=()=>new Promise(resolve=>releaseSave=resolve);
   roughTask=mapMaker.renderRoughPreview(mapMaker.roughPreviewVersion=(mapMaker.roughPreviewVersion||0)+1);
   while(!releaseRough)await frame();
   const roughVisible=!element.classList.contains('d-none');
   saveTask=mapMaker.save('svg');while(!releaseSave)await frame();
   const same=document.querySelectorAll('#processingDialog').length===1&&document.getElementById('processingDialog')===element;
   const count=mapMaker.processingRequests.size;
   const box=element.querySelector('.processing-overlay-message').getBoundingClientRect();
   const text=element.querySelector('#processingDialogMessage');
   const textBox=text.getBoundingClientRect();
   const fits=box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight&&textBox.right<=innerWidth&&text.scrollWidth<=text.clientWidth;
   releaseRough({outText:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'});await roughTask;
   const kept=!element.classList.contains('d-none')&&mapMaker.processingRequests.size===1;
   releaseSave();await saveTask;
   return {roughVisible,same,count,fits,kept,hidden:element.classList.contains('d-none'),busy:element.getAttribute('aria-busy'),legacy:!!document.querySelector('#exportProcessing,#mapmakerRenderStatus')};
  }finally{
   releaseRough?.({outText:'<svg xmlns="http://www.w3.org/2000/svg"/>'});releaseSave?.();
   await Promise.allSettled([roughTask,saveTask]);SVGCont.buildSVG=build;SVGCont.save=save;
   toggle.checked=enabled;mapMaker.clearRoughPreview();
  }
 });
 assert.deepEqual(result,{roughVisible:true,same:true,count:2,fits:true,kept:true,hidden:true,busy:'false',legacy:false});
};
