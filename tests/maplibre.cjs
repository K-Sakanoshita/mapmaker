const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const handler = () => ({ enable() {}, disable() {} });
class GLMap {
    constructor(options) { this.options = options; this.events = {}; this.sources = new Map(); this.layers = new Map(); this.dragPan = handler(); this.touchZoomRotate = handler(); this.doubleClickZoom = handler(); this.scrollZoom = handler(); }
    on(event, fn) { this.events[event] = fn; }
    addControl() {}
    getContainer() { return { querySelector: () => null }; }
    addLayer(layer) { this.layers.set(layer.id, layer); }
    getSource(id) { return this.sources.get(id); }
    addSource(id, options) { this.sources.set(id, { data: options.data, setData(data) { this.data = data; } }); }
    getZoom() { return this.options.zoom; }
    getMaxPitch() { return this.options.maxPitch; }
    setMaxPitch(value) { this.options.maxPitch = value; }
    getPitch() { return this.pitch || 0; }
    getStyle() { return { layers: [...this.layers.values()] }; }
    setLayoutProperty(id, property, value) { const layer = this.layers.get(id); layer.layout = { ...layer.layout, [property]: value }; }
    setProjection(projection) { this.projection = projection; }
    moveLayer() {}
    removeLayer(id) { this.layers.delete(id); }
    removeSource(id) { this.sources.delete(id); }
}
const frames = [];
let svgNodes = 0;
const box = vm.createContext({ console, LANG: 'ja', requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    document: { createElementNS: () => { svgNodes++; return { style: {}, setAttribute() {} }; } },
    maplibregl: { Map: GLMap, NavigationControl: class {}, GeolocateControl: class {} },
    chroma: color => ({ alpha: () => color.length === 9 ? Math.round(parseInt(color.slice(7), 16) / 255 * 100) / 100 : 1, hex: () => color.slice(0, 7) }),
    Conf: { tile: {}, default: { birdseye: { defaultHeight: 3 } } }, Layers: { building: { opacity: '' } }
});
vm.runInContext(fs.readFileSync('lib/geolib.js', 'utf8'), box);
vm.runInContext(fs.readFileSync('lib/maplibre-adapter.js', 'utf8'), box);
const api = vm.runInContext('MapEngine', box);
const map = api.map('mapid', { center: [35, 139], zoom: 17 });
map.gl.events.load();
const layers = [];
for (let i = 0; i < 1000; i++) {
    const feature = { type: 'Feature', properties: { building: 'yes', ...(i === 1 ? { 'building:levels': '2' } : {}) }, geometry: { type: 'Polygon', coordinates: [[[139,35],[139.001,35],[139.001,35.001],[139,35]]] } };
    const layer = api.geoJSON(feature, { style: () => ({ weight: .5, color: '#111111', fillColor: '#dddddd', opacity: 1, fillOpacity: 1 }) }).addTo(map);
    layer.mapmaker = { key: 'building', drawOrder: { osmLayer: 0, styleOrder: 100, featureOrder: i, passOrder: 0 } };
    layers.push(layer);
}
assert.equal(frames.length, 1, '1000 additions are coalesced into one render');
frames.shift()();
assert.equal(map.gl.layers.size, 1, 'only the camera reader remains; editor geometry is not drawn by MapLibre');
assert.equal(map.gl.sources.size, 0);
assert.equal(map.features.size, 1000);
assert.equal(svgNodes,0,'editable models never allocate SVG DOM on screen');
layers[0].setStyle({ fillColor: '#33669980', opacity: 0, weight: 3 }); map.flush();
assert.equal(layers[0].options.fillColor, '#33669980');
assert.equal(layers[0].options.opacity, 0);
assert.equal(layers[0].options.weight, 3);
assert.equal(map.gl.sources.size, 0, 'style edits remain in the SVG model');
assert.equal(map.gl.events.click, undefined, 'MapLibre is not used for editor hit testing');
for (const layer of layers) map.removeLayer(layer);
map.flush();
assert.equal(map.features.size, 0);
assert.equal(map.gl.layers.size, 1);
console.log('PASS 1000 editable models coalesce updates and allocate no SVG DOM');

// A local vector style is the initial MapLibre style; its layers hide during editing.
box.Conf.tile = { OSMFJ_POI: { style: './tiles/osmfj_poi.json' }, OSM: { url: 'https://a.example/{z}/{x}/{y}.png' } };
const vectorMap = api.map('mapid', { center: [35,139], zoom: 17 });
assert.equal(vectorMap.gl.options.style, './tiles/osmfj_poi.json');
vectorMap.gl.addLayer({id:'background',type:'background'});
vectorMap.gl.addLayer({id:'pois',type:'symbol'});
vectorMap.gl.addLayer({id:'building-3d',type:'fill-extrusion'});
vectorMap.setBasemap('OSMFJ_POI'); vectorMap.gl.events.load();
assert.equal(vectorMap.gl.layers.get('pois').layout.visibility, 'visible');
assert.equal(vectorMap.gl.layers.get('basemap-OSM').layout.visibility, 'none');
vectorMap.setBasemap(null);
assert.equal(vectorMap.gl.layers.get('background').layout.visibility, 'none');
assert.equal(vectorMap.gl.layers.get('pois').layout.visibility, 'none');
assert.equal(vectorMap.gl.projection.type, 'mercator');
vectorMap.setBasemap('OSM');
assert.equal(vectorMap.gl.layers.get('basemap-OSM').layout.visibility, 'visible');
vectorMap.setBasemap('OSMFJ_POI');
assert.equal(vectorMap.gl.layers.get('pois').layout.visibility, 'visible');
console.log('PASS initial local vector style, basemap switching and clean editor background');

assert.equal(vectorMap.gl.layers.get('building-3d').layout.visibility, 'none', 'flat position selection is 2D');
vectorMap.gl.pitch = 30; vectorMap.gl.events.pitchend();
assert.equal(vectorMap.gl.layers.get('building-3d').layout.visibility, 'visible');
vectorMap.gl.pitch = 0; vectorMap.gl.events.pitchend();
assert.equal(vectorMap.gl.layers.get('building-3d').layout.visibility, 'none');
console.log('PASS initial vector buildings follow the selected pitch');
