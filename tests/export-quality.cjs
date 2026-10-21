const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box=vm.createContext({Blob});
vm.runInContext(fs.readFileSync('lib/ui/export-settings.js','utf8')+'\n'+fs.readFileSync('lib/export/png.js','utf8'),box);
const settings=vm.runInContext('ExportSettings',box),rect={width:1280,height:900};
for(const [mode,expected] of [['A4',[[1240,1754],[2480,3508],[4961,7016]]],['A3',[[1754,2480],[3508,4961],[7016,9921]]]]){
 for(const [i,dpi] of [150,300,600].entries()){
  const a=settings.dimensions(mode,dpi,rect),b=settings.dimensions(mode+'_landscape',dpi,rect);
  assert.deepEqual([a.width,a.height],expected[i]);assert.deepEqual([b.width,b.height],expected[i].slice().reverse());
 }
}
for(const [dpi,scale] of [[150,2],[300,4],[600,8]]){const s=settings.dimensions('',dpi,rect);assert.deepEqual([s.width,s.height],[1280*scale,900*scale]);}
(async()=>{
 // Real one-pixel PNG: metadata insertion/replacement preserves compressed image bytes.
 const png=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=','base64')],{type:'image/png'});
 for(const dpi of [150,300,600]){
  const saved=await box.setPNGResolution(png,dpi),bytes=Buffer.from(await saved.arrayBuffer());
  assert.equal(bytes.subarray(37,41).toString(),'pHYs');assert.equal(bytes.readUInt32BE(41),Math.round(dpi/.0254));assert.equal(bytes[49],1);
  assert.equal(saved.size,png.size+21);assert.deepEqual(bytes.subarray(54),Buffer.from(await png.slice(33).arrayBuffer()));
  const replaced=await box.setPNGResolution(saved,300);assert.equal(replaced.size,saved.size,'replacement does not duplicate the resolution chunk');
 }
 console.log('PASS A4/A3 orientations and all precision levels, screen scaling, PNG resolution metadata insertion/replacement');
})().catch(e=>{console.error(e);process.exitCode=1;});
