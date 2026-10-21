const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const refreshed=[],previews=[];
let rough=true;
const box=vm.createContext({console,Layers:{road:{}},map:{editorRenderer:{active:true,refreshCategoryWidth:key=>refreshed.push(key),refreshCategory:key=>refreshed.push(key),setCategoryVisibility:key=>refreshed.push(key)}},
 mapMaker:{rough_options:()=>({enabled:rough}),rough_change:()=>previews.push([...refreshed])}});
vm.runInContext(readSource('@layer-controller','utf8'),box);
const control=vm.runInContext('new LayerControl()',box);control.styles=['building','road'];
control.updateLayer('building');
assert.deepEqual(refreshed,['building']);assert.equal(previews.length,1);
control.updateLayer();
assert.deepEqual(refreshed,['building','building','road']);assert.equal(previews.length,2,'palette change queues one preview after all categories refresh');
control.updateLayerWidth('road');assert.equal(previews.length,3,'line width changes refresh the preview');
control.updateLayerVisibility('road',false);assert.equal(previews.length,4,'visibility changes refresh the preview');
rough=false;control.updateLayer('road');assert.equal(previews.length,4,'normal editing does not generate a rough preview');
console.log('PASS color, palette, line width and visibility changes refresh native styles and then regenerate the rough preview');
