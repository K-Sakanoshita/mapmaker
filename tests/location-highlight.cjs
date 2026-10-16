const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const sources = new Map(), layers = new Map(), timers = new Map();
let timerId = 0, schedules = 0;
const box = vm.createContext({
    turf: { circle(coordinates, radius, options) { return { type: 'Feature', geometry: { type: 'Polygon', coordinates }, radius, options }; } },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }
});
vm.runInContext(fs.readFileSync('lib/maplibre-adapter.js', 'utf8').replace(
    '    return {\n        map:', '    globalThis.View = MapView;\n    return {\n        map:'), box);
const view = Object.create(box.View.prototype);
view.features = new Map([[1, { mapmaker: {} }]]);
view.schedule = () => schedules++;
view.gl = {
    getSource: id => sources.get(id),
    addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data; } }); },
    addLayer(layer) { layers.set(layer.id, layer); }, moveLayer(id) { assert(layers.has(id)); }
};
const style = { radius: 8, color: '#000080', fillColor: '#0000a0', fillOpacity: .1, timer: 2000 };
view.highlightLocation([35, 139], style);
assert.equal(sources.size, 1); assert.equal(layers.size, 2);
assert.equal(view.features.size, 1); assert.equal(schedules, 0);
view.highlightLocation([36, 140], style);
assert.equal(sources.size, 1); assert.equal(layers.size, 2); assert.equal(timers.size, 1);
assert.deepEqual(Array.from(Array.from(sources.values())[0].data.geometry.coordinates), [140, 36]);
Array.from(timers.values())[0]();
assert.equal(Array.from(sources.values())[0].data.features.length, 0);
assert.equal(view.features.size, 1); assert.equal(schedules, 0);
box.Conf = { default: { Circle: { ...style } } };
box.map = view; view.getZoom = () => 18;
box.poiCont = { get_osmid: () => ({ latlng: [35, 139] }) };
vm.runInContext(fs.readFileSync('lib/poislib.js', 'utf8') + '\nnew MarkerControl().center("node/1");', box);
assert.equal(view.features.size, 1); assert.equal(schedules, 0);
console.log('PASS dedicated location layers, source reuse, timer replacement, cleanup, Marker.center and no editor reconstruction');
