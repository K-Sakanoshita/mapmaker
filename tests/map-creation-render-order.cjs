const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    const events = []; let finishRendering, finishFrame, dirty = true;
    const renderer = {
        pending: null, needsSync: () => dirty,
        sync() {
            events.push('sync');
            this.pending = new Promise(resolve => { finishRendering = resolve; }).finally(() => {
                this.pending = null; dirty = false; events.push('styles-applied');
            });
            return this.pending;
        }
    };
    const box = vm.createContext({ console, setTimeout: fn => setImmediate(fn), requestAnimationFrame: fn => setImmediate(fn),
        map: { ready: true, editorRenderer: renderer, getCenter: () => ({ lng: 135, lat: 35 }), setView() {}, getZoom: () => 14,
            gl: { once(type, fn) { assert.equal(type, 'idle'); finishFrame = fn; }, triggerRepaint() { events.push('repaint'); } } },
        location: { href: 'http://localhost/' }, Conf: { default: { MinZoomLevel: 11 } },
        LayerCont: { styles: [], applyDrawOrder() {} }, Layers: {},
        Basic: { getData() {}, retry: fn => Promise.resolve(fn()) }, overPassCont: { getRetryCount: () => 5, get: () => ({}) },
        winCont: { modal_open() {}, spinner() {}, modal_text() {}, async closeModal() { events.push('close'); } },
        glot: { get: key => key }, document: { getElementById: () => null }
    });
    vm.runInContext(fs.readFileSync('mapmaker.js', 'utf8'), box);
    vm.runInContext(`mapMaker.custom = function(mode) { this.customMode = mode; this.queueExportPreview(); };
        mapMaker.clearExportPreview = () => {}; mapMaker.previewBusy = () => {};
        mapMaker.rough_options = () => ({ enabled: false }); mapMaker.make();`, box);
    for (let turn = 0; turn < 15 && !finishRendering; turn++) await new Promise(setImmediate);
    assert.ok(finishRendering, 'map creation starts native rendering');
    assert.deepEqual(events, ['sync'], 'modal remains open during rendering; pending sync is reused');
    finishRendering();
    await new Promise(setImmediate);
    assert.deepEqual(events, ['sync', 'styles-applied', 'repaint'], 'style activation still waits for a visible frame');
    assert.ok(finishFrame);
    finishFrame();
    await new Promise(setImmediate);
    assert.deepEqual(events, ['sync', 'styles-applied', 'repaint', 'close'], 'modal closes only after final styles are rendered');
    console.log('PASS map creation keeps modal open until native styles and final frame complete');
})().catch(error => { console.error(error); process.exitCode = 1; });
