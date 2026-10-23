const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let zoom, targets, output;
let longitude = 135, viewUpdates = [];
const createButton = { disabled: false }, makeMapClasses = new Set();
const guidance = { classList: { toggle() {} }, textContent: '' };
const box = vm.createContext({
    map: { getZoom: () => zoom, getCenter: () => ({ lng: longitude, lat: 35 }), setView(center) { viewUpdates.push({ ...center }); } },
    location: { href: 'http://localhost/' },
    Conf: { default: { MinZoomLevel: 11, LimitZoomLevel: 15 }, style: { color: { building: { zoom: 14 } } } },
    LayerCont: { palette: 'color', styles: ['building'] },
    glot: { get: key => key }, winCont: { modal_open() {}, spinner() {} },
    Basic: { getData() {}, retry(fn) { fn(); return new Promise(() => {}); } },
    overPassCont: { getRetryCount:()=>5, get(value) { targets = [...value]; } },
    makeMap: { classList: { toggle(name, enabled) { if (enabled) makeMapClasses.add(name); else makeMapClasses.delete(name); } }, querySelector: () => createButton },
    document: { getElementById: () => guidance },
    $: () => ({ html: value => output = value })
});
vm.runInContext(fs.readFileSync('mapmaker.js', 'utf8'), box);
for (const [actual, displayed, included] of [[13.94,13.9,false],[13.98,14,true],[14,14,true],[14.04,14,true],[14.1,14.1,true]]) {
    zoom = actual;
    vm.runInContext('mapMaker.make(); mapMaker.zoomMessage();', box);
    assert.equal(targets.includes('building'), included, `building acquisition at actual zoom ${actual}`);
    assert.ok(output.includes(`zoomlevel${displayed} `), `display at actual zoom ${actual}`);
    assert.equal(guidance.textContent.includes('menu_building'), !included, 'guidance matches acquired features');
}
assert.doesNotMatch(output,/map-preset-status/,'regular maps have no preset status');
box.Conf.mapPreset={statusLabel:'expo2025_mode'};
vm.runInContext('mapMaker.zoomMessage()',box);
assert.match(output,/<span class="map-preset-status">expo2025_mode<\/span>/);
delete box.Conf.mapPreset;
vm.runInContext('mapMaker.zoomMessage()',box);
assert.doesNotMatch(output,/map-preset-status/);
console.log('PASS displayed zoom and building acquisition agree at 13.9/14.0/14.1, including rounded 13.98');

for (const [level, needsZoom] of [[10.9,true],[11,false],[11.1,false],[10,true]]) {
    zoom = level;
    vm.runInContext('mapMaker.zoomMessage()',box);
    assert.equal(createButton.disabled, needsZoom);
    assert.equal(makeMapClasses.has('needs-zoom'), needsZoom, 'near-button guidance follows the creation threshold in both directions');
}
console.log('PASS creation guidance follows the disabled button at the minimum zoom threshold');

zoom = 14;
for (const [input, expected] of [[135,null],[0,null],[179.9,null],[180,null],[-179.9,null],[181,-179],[-181,179],[540,180],[-540,180],[-180,180]]) {
    longitude = input;
    viewUpdates = [];
    vm.runInContext('mapMaker.make()', box);
    assert.deepEqual(viewUpdates, expected === null ? [] : [{ lng: expected, lat: 35 }], `only update the map when longitude ${input} needs correction`);
}
console.log('PASS unchanged centers skip setView; wrapped longitudes retain normalization and latitude');
