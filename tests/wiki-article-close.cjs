const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let button, html, removed = [];
const box = vm.createContext({
    console, glot: { get: () => '閉じる' }, map: { closePopup() {}, removeLayer(marker) { removed.push(marker); } },
    QRCode: class { svg() { return '<svg></svg>'; } },
    MapEngine: {
        LatLng: class {}, divIcon(options) { html = options.html; return options; },
        marker() {
            button = { events: {}, addEventListener(name, handler) { this.events[name] = handler; } };
            return { addTo() {}, getElement: () => ({ querySelector: () => button }) };
        }
    }
});
vm.runInContext(fs.readFileSync('lib/poislib.js', 'utf8'), box);
const marker = box.Marker = vm.runInContext('new MarkerControl()', box);
const original = { mapmaker_id: 'node/1' };
marker.markers.wikipedia = [original];
const add = () => marker.qr_add('wikipedia', 'node/1', 'https://example.org', {lat:35,lng:135}, ['Article']);
add();
assert.match(html, /class="wiki-article-close" aria-label="閉じる">✕<\/button>/);
const article = marker.markers.wikipedia[0][1];
assert.equal(marker.markers.wikipedia[0][0], original);
for (const name of ['pointerdown','mousedown','touchstart','dblclick']) {
    let stopped = false;
    button.events[name]({ stopPropagation() { stopped = true; } });
    assert.ok(stopped, `${name} does not start map/marker interaction`);
}
let prevented = false, stopped = false;
button.events.click({preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }});
assert.ok(prevented && stopped);
assert.equal(removed[0], article);
assert.equal(marker.get('wikipedia', 'node/1'), original, 'original marker remains usable');
add();
assert.equal(marker.markers.wikipedia[0][0], original, 'article can be added again after closing');
console.log('PASS article close preserves original marker, prevents dragging and permits reopening');
