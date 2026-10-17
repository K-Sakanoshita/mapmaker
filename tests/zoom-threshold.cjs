const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let zoom, targets, output;
const guidance = { classList: { toggle() {} }, textContent: '' };
const box = vm.createContext({
    map: { getZoom: () => zoom, getCenter: () => ({ lng: 135, lat: 35 }), setView() {} },
    location: { href: 'http://localhost/' },
    Conf: { default: { MinZoomLevel: 11, LimitZoomLevel: 15 }, style: { color: { building: { zoom: 14 } } } },
    LayerCont: { palette: 'color', styles: ['building'] },
    glot: { get: key => key }, winCont: { modal_open() {}, spinner() {} },
    Basic: { getData() {}, retry(fn) { fn(); return new Promise(() => {}); } },
    overPassCont: { get(value) { targets = [...value]; } },
    makeMap: { classList: { toggle() {} }, querySelector: () => ({ disabled: false }) },
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
console.log('PASS displayed zoom and building acquisition agree at 13.9/14.0/14.1, including rounded 13.98');
