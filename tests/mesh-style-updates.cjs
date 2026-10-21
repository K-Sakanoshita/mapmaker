const assert=require('node:assert/strict');
const {setup,models}=require('./mesh-buffer-allocation.cjs');
(async()=>{
 const {renderer:r}=setup(),batch=models(3);batch.forEach(m=>Object.assign(m.feature.properties,{'roof:shape':'gabled','roof:height':'3',height:'12'}));await r.prepare(batch);
 const uploads=[];r.buffer={};r.fillBuffer={};r.gl={ARRAY_BUFFER:1,bindBuffer(){},bufferSubData(_target,offset,data){uploads.push({offset,data});}};
 const model=batch[1],block=r.blocks.get(model.id);
 model.options.opacity=0;r.update(model);
 assert.equal(uploads.length,2);assert.equal(uploads[1].offset,block.roofStart*4);
 assert.equal(uploads[1].data.length,block.roofEnd-block.roofStart);
 assert.ok(uploads[1].data.byteLength<r.fillData.byteLength);
 const line=r.data.slice(),fill=r.fillData.slice(),uv=r.fillUVs.slice();uploads.length=0;
 block.mesh.strokeScale=2;block.mesh.edgeWidths=Array.from({length:(block.end-block.start)/11},(_,i)=>i%2?.5:1);
 model.options.weight=1.3;r.updateWidths([model]);
 assert.equal(uploads.length,1);assert.equal(uploads[0].offset,block.start*4);
 for(let i=0;i<r.data.length;i++){
  if(i>=block.start&&i<block.end&&(i-block.start)%11===10) assert.equal(r.data[i],Math.fround(2.6*block.mesh.edgeWidths[(i-block.start-10)/11]));
  else assert.equal(r.data[i],line[i],'width edits preserve positions, colors and hidden alpha');
 }
 assert.deepEqual(r.fillData,fill);assert.deepEqual(r.fillUVs,uv);
 uploads.length=0;r.updateWidths([model]);assert.equal(uploads.length,0,'unchanged widths do not upload');
 r.updateMany(batch);assert.equal(uploads.length,2,'broad style edits retain one full batch');
 const plain=setup().renderer,flat=models(1);await plain.prepare(flat);
 const flatUploads=[];plain.buffer={};plain.fillBuffer={};plain.gl={ARRAY_BUFFER:1,bindBuffer(){},bufferSubData(_target,offset,data){flatUploads.push(data);}};
 plain.update(flat[0]);assert.equal(flatUploads.length,1,'models without faces do not upload fill data');
 plain.blocks.set(99,{mesh:{shape:'walkway'}});const revision=plain.walkwayRevision;
 plain.updateWidths([{id:99}]);assert.equal(plain.walkwayRevision,revision+1,'walkway widths invalidate screen geometry');
 console.log('PASS width-only updates preserve geometry/colors/visibility and avoid fill/no-op uploads; individual face uploads use the model range');
})().catch(e=>{console.error(e);process.exitCode=1;});
