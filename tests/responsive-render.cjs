const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
    let ticks = 0, clock = 0;
    const box = vm.createContext({ console, performance: { now: () => ++clock },
        setTimeout: fn => setTimeout(() => { ticks++; fn(); }, 0), Layers: { building: { geojson: Array(1000) } } });
    vm.runInContext(fs.readFileSync('lib/layerlib.js', 'utf8'), box);
    const layers = vm.runInContext('new LayerControl()', box);
    let processed = 0;
    layers.layerSteps = function* () { for (let i = 0; i < 1000; i++) { processed++; yield i; } };
    let progress = 0;
    await layers.makeLayerAsync('building', undefined, false, () => progress++);
    assert.equal(processed, 1000, 'no feature limit is introduced');
    assert.ok(ticks > 50 && progress > 50, 'large creation yields to browser events and reports progress');
    let response;
    const worker = vm.createContext({ console: { log() {} }, self: { postMessage: data => response = data },
        importScripts: (...paths) => paths.forEach(path => vm.runInContext(fs.readFileSync('lib/' + path.replace('./', '').split('?')[0], 'utf8'), worker)) });
    worker.postMessage = data => response = data;
    worker.self = worker;
    vm.runInContext(fs.readFileSync('lib/map-data-worker.js', 'utf8'), worker);
    worker.self.onmessage({ data: { osm: { building: { tags: ['building='] } }, osmxml: { elements: [
        { type: 'node', id: 1, lat: 35, lon: 139, tags: { building: 'yes' } }
    ] } } });
    if (response.error) throw new Error(response.error);
    assert.equal(response.result.geojson.length, 1);
    assert.equal(response.result.targets[0][0], 'building', 'worker preserves OSM classification');
    worker.self.onmessage({ data: {} });
    assert.ok(response.error, 'worker errors are returned instead of leaving loading stuck');
    console.log('PASS complete data conversion, cooperative creation, progress and worker errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
