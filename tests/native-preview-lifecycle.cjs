const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    const busy = []; let dirty = true, syncs = 0, finish;
    const renderer = { needsSync: () => dirty, pending: null, sync() {
        syncs++; this.pending = new Promise(resolve => { finish = resolve; });
        return this.pending.finally(() => { this.pending = null; dirty = false; });
    } };
    const box = vm.createContext({ console, URLSearchParams, location: { search: '?editor=maplibre' },
        document: { getElementById: () => null },
        map: { ready: true, editorRenderer: renderer }, SVGCont: { buildSVG: () => assert.fail('native lifecycle must not build SVG') }
    });
    vm.runInContext(fs.readFileSync('mapmaker.js','utf8'), box);
    box.recordBusy = value => busy.push(value);
    vm.runInContext('mapMaker.customMode = true; mapMaker.rough_options = () => ({enabled:false}); mapMaker.clearExportPreview = () => {}; mapMaker.previewBusy = recordBusy;', box);
    vm.runInContext('mapMaker.queueExportPreview()', box);
    assert.deepEqual(busy, [true]); assert.equal(syncs, 1);
    // Resize/layout requests while the first build runs reuse that build and its indicator.
    for (let i = 0; i < 3; i++) vm.runInContext('mapMaker.queueExportPreview()', box);
    assert.deepEqual(busy, [true]); assert.equal(syncs, 1);
    finish();
    await renderer.pending;
    await new Promise(setImmediate);
    assert.deepEqual(busy, [true,false]);
    // Once complete, camera/layout changes do not start rendering or flash the overlay.
    for (let i = 0; i < 3; i++) vm.runInContext('mapMaker.queueExportPreview()', box);
    assert.deepEqual(busy, [true,false]); assert.equal(syncs, 1);
    console.log('PASS native initial build has one indicator; pending and unchanged resize requests neither rebuild nor flash busy');
})().catch(error => { console.error(error); process.exitCode = 1; });
