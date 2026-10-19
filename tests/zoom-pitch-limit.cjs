const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('lib/renderers/maplibre/adapter.js', 'utf8');
const defaults = [{ zoom: 14, pitch: 20 }, { zoom: 16, pitch: 35 }, { zoom: 18, pitch: 50 }];
function create(stops, restored = { zoom: 18, pitch: 45 }) {
    class NativeMap {
        constructor(options) {
            this.zoom = restored.zoom; this.pitch = Math.min(restored.pitch, options.maxPitch);
            this.maxPitch = options.maxPitch; this.events = {}; this.changes = 0;
        }
        getZoom() { return this.zoom; }
        getPitch() { return this.pitch; }
        getMaxPitch() { return this.maxPitch; }
        setMaxPitch(value) { this.maxPitch = value; this.pitch = Math.min(this.pitch, value); this.changes++; }
        getContainer() { return { querySelector: () => null }; }
        addControl() {}
        on(event, fn) { this.events[event] = fn; }
        setZoom(value) { this.zoom = value; this.events.zoom(); }
    }
    const box = vm.createContext({ Conf: { default: { maxPitchByZoom: stops }, tile: {} }, LANG: 'en',
        maplibregl: { Map: NativeMap, NavigationControl: class {}, GeolocateControl: class {} } });
    vm.runInContext(source, box);
    return vm.runInContext('MapEngine.map("map", {center:[35,135],zoom:6})', box).gl;
}
const map = create(defaults);
assert.equal(map.getPitch(), 45, 'restored zoom is used instead of the default zoom');
for (const [zoom, limit] of [[19,50],[18,50],[17,42.5],[16,35],[15,27.5],[14,20],[6,20]]) {
    map.setZoom(zoom);
    assert.equal(map.getMaxPitch(), limit, `zoom ${zoom}`);
    assert.ok(map.getPitch() <= limit, 'zooming out clamps the current pitch');
}
assert.equal(map.getPitch(), 20);
map.setZoom(18);
assert.equal(map.getMaxPitch(), 50);
assert.equal(map.getPitch(), 20, 'zooming in does not increase the selected pitch');
const changes = map.changes;
map.setZoom(19);
assert.equal(map.changes, changes, 'unchanged limits do not trigger camera updates');
assert.equal(create(defaults, {zoom:14,pitch:50}).getPitch(), 20, 'restored high pitch is clamped');
const custom = create([{zoom:18,pitch:45},{zoom:14,pitch:10},{zoom:18,pitch:40}]);
custom.setZoom(16);
assert.equal(custom.getMaxPitch(), 25, 'custom, unordered and duplicate stops are supported');
for (const invalid of [undefined, null, {}, [], [null, {zoom:'14',pitch:20}, {zoom:14,pitch:200}, {zoom:15,pitch:-1}]]) {
    assert.equal(create(invalid).getMaxPitch(), 50, 'missing or invalid settings fall back to 50');
}
const flat = create([{zoom:14,pitch:0}]);
flat.setZoom(21);
assert.equal(flat.getMaxPitch(), 0, 'one stop sets a constant limit, including zero');
console.log('PASS zoom pitch limits: interpolation, endpoints, restore, clamping, configuration and fallback');
