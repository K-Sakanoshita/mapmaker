const assert=require('node:assert/strict');
module.exports=async page=>{
 const result=await page.evaluate(async()=>{
  const previous=mapMaker.rough_options;
  try{
   mapMaker.rough_options=()=>({enabled:true,roughness:0,bowing:0,fillStyle:'solid'});
   const source=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g data-rough-preserve="building"><defs><mask id="building-visibility-test" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/><path d="M40 0H60V100H40Z" fill="black"/></mask></defs><g mask="url(#building-visibility-test)"><g data-building-surface="0"><rect width="100" height="100" fill="#f00"/></g></g></g></svg>','image/svg+xml').documentElement;
   const output=await SVGCont.applyRoughEffect(source);
   const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(output)],{type:'image/svg+xml'}));
   try{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixel=x=>Array.from(ctx.getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height/2),1,1).data);
    return {left:pixel(.2),hidden:pixel(.5),right:pixel(.8),masks:output.querySelectorAll('mask[id^="building-visibility-"]').length,roughPaths:output.querySelectorAll('[data-building-surface] path').length};
   }finally{URL.revokeObjectURL(url);}
  }finally{mapMaker.rough_options=previous;}
 });
 assert.ok(result.masks>0&&result.roughPaths>0,'rough conversion retains depth masks while converting the surface');
 for(const pixel of [result.left,result.right])assert.ok(pixel[0]>200&&pixel[1]<50&&pixel[2]<50,'visible surface remains red');
 assert.ok(result.hidden.slice(0,3).every(n=>n>240),'hidden surface is removed in rasterized rough SVG');
};
