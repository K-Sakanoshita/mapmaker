const assert=require('node:assert/strict');
module.exports=async (page,name='Chain-link fence')=>{
 const result=await page.evaluate(name=>{
  const fence=[...map.features.values()].find(model=>getMapMakerFeatureTag(model.feature,'name')===name);
  if(!fence)return null;
  const renderer=map.editorRenderer,block=renderer.outlines?.blocks.get(fence.id);
  const is3d=!!map.threeD;
  const before=JSON.stringify(fence.feature);
  if(is3d){
   const original=fence.options.opacity;fence.options.opacity=0;renderer.update(fence);
   const hidden=renderer.outlines.data.slice(block.start,block.end).every((value,index)=>index%11!==9 || value===0);
   fence.options.opacity=original;renderer.update(fence);
   return {is3d,mesh:!!block?.mesh,emptyFaces:block?.mesh?.faces.length===0,
    noFill:block?.roofStart===block?.roofEnd,hidden,restored:renderer.outlines.data[block.start+9]>0,
    height:block?.mesh?.height,noPanel:!renderer.entries.some(e=>e.group.openBarrier&&e.type==='fill-extrusion'),unchanged:before===JSON.stringify(fence.feature)};
  }
  return {is3d,line:[...renderer.data.values()].some(f=>f.properties.modelId===fence.id&&/LineString/.test(f.geometry.type))};
 },name);
 assert.ok(result,'fixture fence reaches the actual editor');
 if(result.is3d)for(const key of ['mesh','emptyFaces','noFill','hidden','restored','noPanel','unchanged'])assert.equal(result[key],true,key);
 else assert.equal(result.line,true);
 return result;
};
