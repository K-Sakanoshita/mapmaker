const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let time=0,serial=0;const timers=new Map(),renders=[];
 const inputs={rough_enabled:{checked:true},roughness:{value:'1'},bowing:{value:'1'},rough_fill_style:{value:'solid'},roughness_value:{},bowing_value:{}};
 const box=vm.createContext({Date:{now:()=>time},console,
  setTimeout(fn,delay){timers.set(++serial,{fn,at:time+delay});return serial;},clearTimeout:id=>timers.delete(id),
  map:{getContainer:()=>({classList:{remove(){}},setAttribute(){}})},document:{getElementById:id=>inputs[id]},});
 vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
 const maker=vm.runInContext('mapMaker',box);maker.customMode=true;
 maker.setRoughPreviewLock=()=>{};maker.queueExportPreview=()=>maker.queueRoughPreview();
 maker.renderRoughPreview=async version=>{if(version===maker.roughPreviewVersion)renders.push(maker.rough_options());};
 const tick=async milliseconds=>{time+=milliseconds;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await Promise.resolve();await Promise.resolve();await Promise.resolve();};
 inputs.roughness.value='2.4';maker.rough_change(1000);
 assert.equal(inputs.roughness_value.value,'2.4','numeric feedback is immediate');
 await tick(600);assert.equal(renders.length,0);
 inputs.bowing.value='3.1';maker.rough_change(1000);
 assert.equal(inputs.bowing_value.value,'3.1');
 await tick(900);assert.equal(renders.length,0,'changing either slider restarts the shared one-second wait');
 maker.queueRoughPreview(); // A render-completion/layout callback must not shorten the wait.
 await tick(99);assert.equal(renders.length,0);
 await tick(1);assert.equal(renders.length,1);assert.equal(renders[0].roughness,2.4);assert.equal(renders[0].bowing,3.1);
 maker.queueRoughPreview();await tick(149);assert.equal(renders.length,1);await tick(1);assert.equal(renders.length,2,'other changes retain the normal short delay');
 inputs.roughness.value='4';maker.rough_change(1000);
 inputs.rough_enabled.checked=false;maker.closeRoughPreviewModal=()=>{};
 maker.rough_change();await tick(1000);assert.equal(renders.length,2,'Off cancels the delayed update');
 console.log('PASS slider feedback is immediate; preview waits one second after the last change, including intervening render callbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
