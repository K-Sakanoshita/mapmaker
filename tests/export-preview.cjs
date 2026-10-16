const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    let syncs=0, needs=true, previews=0;
    const renderer={needsSync:()=>needs,sync:async()=>{syncs++;needs=false;},clear(){}};
    const box=vm.createContext({console,document:{getElementById:()=>null},map:{ready:true,editorRenderer:renderer},
        SVGCont:{buildSVG:()=>assert.fail('screen editing must not generate SVG')},MapLibreEditorRenderer:class{},URL:{revokeObjectURL(){}}});
    vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
    box.recordPreview=()=>previews++;
    vm.runInContext('mapMaker.queueRoughPreview=recordPreview;mapMaker.customMode=true; mapMaker.previewBusy=()=>{}; mapMaker.clearExportPreview=()=>{};',box);
    for(const rough of [false,true]){
        needs=true;box.rough=rough;
        vm.runInContext('mapMaker.rough_options=()=>({enabled:rough});mapMaker.queueExportPreview()',box);
        await new Promise(setImmediate);
    }
    assert.equal(syncs,2,'native rendering remains the underlying editor');
    assert.equal(previews,1,'only enabled hand-drawn mode requests an image preview');
    assert.equal(vm.runInContext('typeof mapMaker.renderExportPreview',box),'undefined');
    assert.equal(vm.runInContext('typeof mapMaker.nativeEditorEnabled',box),'undefined','no trial renderer selector remains');
    console.log('PASS normal editing uses MapLibre; only hand-drawn On requests an image preview; no trial mode');
})().catch(e=>{console.error(e);process.exitCode=1;});
