const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
    for (const rough of [false,true]) {
        const events = []; let finishRendering, finishFrame, finishRough, scheduledRough = 0;
        const renderer = { pending:null, dirty:true, needsSync(){return this.dirty;}, sync(){
            this.pending=new Promise(resolve=>{finishRendering=resolve;}).finally(()=>{this.pending=null;this.dirty=false;});
            return this.pending;
        } };
        const box=vm.createContext({console,clearTimeout,setTimeout(fn,delay){if(delay===150)scheduledRough++;return setImmediate(fn);},
            requestAnimationFrame:fn=>setImmediate(fn),
            map:{ready:true,editorRenderer:renderer,getCenter:()=>({lng:135,lat:35}),setView(){},getZoom:()=>14,
                getContainer:()=>({setAttribute(){}}),gl:{once(_type,fn){finishFrame=fn;},triggerRepaint(){events.push('frame');}}},
            Conf:{default:{MinZoomLevel:11}},Layers:{},LayerCont:{styles:[],applyDrawOrder(){}},
            Basic:{getData(){},retry:fn=>Promise.resolve(fn())},overPassCont:{get:()=>({})},
            location:{href:'http://localhost/'},glot:{get:key=>key},
            winCont:{modalMode:true,modal_open(){events.push('open');},spinner(){},modal_text(){},closeModal(){events.push('close');return Promise.resolve();}},
            // Any attempt to create a second progress overlay during initial loading fails.
            document:{getElementById:()=>null,createElement(){assert.fail('initial loading must not create a second processing overlay');}},
        });
        vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
        const maker=vm.runInContext('mapMaker',box);
        Object.assign(maker,{rough_options:()=>({enabled:rough}),clearExportPreview(){},setRoughPreviewLock(){},
            custom(mode){this.customMode=mode;this.queueExportPreview();},
            renderRoughPreview(){assert.equal(this.loadingMap,true);events.push('rough');return new Promise(resolve=>{finishRough=resolve;});}});
        maker.make();
        assert.equal(maker.loadingMap,true);
        for(let i=0;i<15&&!finishRendering;i++)await new Promise(setImmediate);
        assert.ok(finishRendering);
        finishRendering();await new Promise(setImmediate);
        assert.ok(finishFrame);assert.ok(!events.includes('close'));
        assert.equal(scheduledRough,0,'rough preview does not schedule work after the loading modal');
        finishFrame();await new Promise(setImmediate);
        if(rough){
            assert.ok(finishRough,'rough preview runs inside the existing loading lifecycle');
            assert.ok(!events.includes('close'),'modal stays open until preview finishes');
            finishRough();await new Promise(setImmediate);
        }
        assert.equal(events.at(-1),'close');
        assert.equal(maker.loadingMap,false);
        assert.equal(scheduledRough,0);
    }
    console.log('PASS one loading modal covers native and optional rough rendering; no leftover overlay or deferred preview');
})().catch(error=>{console.error(error);process.exitCode=1;});
