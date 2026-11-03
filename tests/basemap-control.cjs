const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.hidden = false; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    focus() { this.focused = true; }
}
const translations = JSON.parse(fs.readFileSync('data/glot.json'));
const config = JSON.parse(fs.readFileSync('data/config-system.jsonc'));
for (const lang of ['ja', 'en']) {
    const changes = [], controls = [], navigation = [], documentEvents = {};
    const view = { vectorBasemapKey: 'OSMFJ_POI', setBasemap: key => changes.push(key), addUIControl: (position, element) => controls.push({ position, element }), setNavigationEnabled: value => navigation.push(value), schedule() {} };
    const box = vm.createContext({ Conf: { ...config, default: {} }, map: null, MapEngine: { map: () => view }, glot: { get: key => translations[key][lang] }, Birdseye: { sync() {} }, document: { createElement: tag => new Element(tag), addEventListener: (key, fn) => { documentEvents[key] = fn; } } });
    vm.runInContext(fs.readFileSync('lib/application/map-controls.js', 'utf8') + ';globalThis.control = MapCont;', box);
    const control = box.control; control.init();
    assert.equal(controls[0].position, 'bottom-right');
    const [toggle, panel] = control.basemapControl.children;
    const radios = panel.children.map(label => label.children[0]);
    assert.deepEqual(radios.map(radio => radio.value), ['OSMFJ_POI', 'OSM_Standard', 'GSI_std', 'GSI_ort']);
    assert.ok(radios.every(radio => radio.attributes['aria-label']));
    for (const radio of radios) {
        radios.forEach(input => { input.checked = input === radio; });
        control.basemapControl.open = true;
        radio.events.change();
        assert.equal(changes.at(-1), radio.value);
        assert.equal(control.baseKey, radio.value);
        assert.equal(control.basemapControl.open, false);
    }
    control.stop(); assert.equal(control.basemapControl.hidden, true); assert.equal(changes.at(-1), 'OSMFJ_POI');
    control.start(); assert.equal(control.basemapControl.hidden, false); assert.equal(changes.at(-1), 'GSI_ort');
    assert.deepEqual(navigation, [false, true]);
    control.basemapControl.open = true; control.basemapControl.events.keydown({ key: 'Escape' }); assert.equal(control.basemapControl.open, false);
    control.basemapControl.open = true; documentEvents.pointerdown({ target: new Element('div') }); assert.equal(control.basemapControl.open, false);
}
assert.ok(config.tile.GSI_std.url.includes('/std/'));
assert.ok(config.tile.GSI_ort.url.includes('/seamlessphoto/'));
console.log('PASS basemap selection, bilingual labels, editor hiding, reselect restoration, Escape and outside dismissal');
