const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
    let clock = 0, yields = 0, frames = 0, removed = 0, scheduled = 0, initialized = 0, clears = 0, closing;
    const busy = [], order = [];
    const features = new Map(Array.from({length:100000}, (_,id) => [id,{id}]));
    const box = vm.createContext({ console, performance:{now:()=>clock},
        setTimeout(callback) { yields++; setImmediate(callback); },
        requestAnimationFrame(callback) { frames++; setImmediate(callback); },
        winCont:{closeModal:()=>new Promise(resolve=>{closing=resolve;})},
        overPassCont:{clear(){order.push('overpass');}},
        ManualPins:{clear(){order.push('pins');}}, poiCont:{clearAll(){order.push('poi');}},
        map:{ready:true,features,schedule(){scheduled++;},closePopup(){},
            removeLayer(marker){removed++;clock++;box.maker.queueExportPreview();},
            editorRenderer:{clear(){clears++;}},},
    });
    for (const file of ['mapmaker.js','lib/layerlib.js','lib/poislib.js']) vm.runInContext(fs.readFileSync(file,'utf8'),box);
    box.maker = vm.runInContext('mapMaker',box);
    box.LayerCont = vm.runInContext('new LayerControl()',box);
    box.LayerCont.init = () => {initialized++;};
    box.Marker = vm.runInContext('new MarkerControl()',box);
    box.Marker.markers.wikipedia = Array.from({length:2000}, (_,id) => ({id}));
    box.Marker.markers.wikipedia.push([{id:'original'},{id:'article'}]);
    Object.assign(box.maker, {
        customMode:true,clearRoughPreview(){order.push('rough');},clearExportPreview(){order.push('export');},
        previewBusy(value){busy.push(value);},custom(mode){assert.equal(mode,false);order.push('position');this.queueExportPreview();}
    });
    const reset = box.maker.resetMap();
    assert.equal(box.maker.resetting,true);
    assert.equal(box.maker.customMode,false);
    assert.deepEqual(busy,[true]);
    assert.equal(removed,0,'confirmation closes and feedback paints before cleanup');
    await box.maker.resetMap();
    assert.equal(clears,0,'duplicate confirmations cannot start a second reset');
    closing();
    await reset;
    assert.equal(features.size,0);
    assert.equal(scheduled,1,'100,000 geometry models are cleared with one redraw request');
    assert.equal(initialized,1);
    assert.equal(clears,1,'marker removals do not repeatedly clear the renderer');
    assert.equal(removed,2002,'Wikipedia article pairs and regular POIs are all removed');
    assert.ok(yields>=250,'expensive native marker removal yields in 8 ms batches');
    assert.equal(frames,2,'processing feedback has a paint opportunity');
    assert.equal(box.Marker.markers.wikipedia.length,0);
    assert.equal(box.maker.resetting,false);
    assert.equal(busy.at(-1),false);
    assert.ok(order.indexOf('pins')<order.indexOf('poi'));
    console.log(`PASS reset: 100,000 geometry models / ${removed} markers, one renderer clear and redraw, ${yields} cooperative yields`);
})();
