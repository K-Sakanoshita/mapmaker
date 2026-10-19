const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const frames=[],tokens=new Set(),events=[];
 let releaseRender,releaseRough,fail=false;
 const maker={customMode:true,beginProcessing(){const token={};tokens.add(token);events.push('show');return token;},endProcessing(token){tokens.delete(token);events.push('hide');},
 queueExportPreview:()=>new Promise(resolve=>releaseRender=resolve),rough_options:()=>({enabled:true}),finishInitialRoughPreview:()=>new Promise(resolve=>releaseRough=resolve)};
 const box=vm.createContext({console,mapMaker:maker,requestAnimationFrame:fn=>frames.push(fn)});
 vm.runInContext(readSource('@layer-controller','utf8'),box);
 const control=vm.runInContext('new LayerControl()',box);
 control.applyPalette=palette=>{events.push(palette);if(fail)throw Error('test failure');};
 const tick=async()=>{await Promise.resolve();await Promise.resolve();};
 const next=async()=>{assert.ok(frames.length);frames.shift()();await tick();};
 const task=control.setStyle('mono');assert.equal(tokens.size,1);assert.deepEqual(events,['show']);await tick();
 await next();assert.deepEqual(events,['show']);await next();assert.ok(events.includes('mono'));assert.equal(tokens.size,1);
 releaseRender();await tick();assert.equal(tokens.size,1);releaseRough();await tick();await next();await next();await task;assert.equal(tokens.size,0);
 fail=true;const failing=control.setStyle('color');const rejected=assert.rejects(failing,/test failure/);await tick();await next();await next();await rejected;assert.equal(tokens.size,0,'failure releases only its token');
 fail=false;maker.customMode=false;control.setStyle('coloring');assert.equal(events.at(-1),'coloring');assert.equal(tokens.size,0,'startup stays synchronous');
 console.log('PASS palette message paints before work, remains through renderer/rough preview, closes after paint and on failure, and leaves startup synchronous');
})().catch(error=>{console.error(error);process.exitCode=1;});
