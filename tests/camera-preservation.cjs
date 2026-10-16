const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const camera = { center: [135.484772, 34.718685], zoom: 17.4, bearing: -32.5, pitch: 54 };
const before = JSON.stringify(camera);
const handler = () => ({ enabled: true, enable() { this.enabled = true; }, disable() { this.enabled = false; } });
const controls = new Map();
const navigationClasses = new Set();
const navigationGroup = { classList: { add: name => navigationClasses.add(name), remove: name => navigationClasses.delete(name) } };
const container = { querySelector: selector => { if (!controls.has(selector)) controls.set(selector, { disabled: true, closest: () => navigationGroup }); return controls.get(selector); } };
const box = vm.createContext({
    map: { threeD: false, schedule() {}, setBasemap() {},
        dragging: handler(), touchZoom: handler(), doubleClickZoom: handler(), scrollWheelZoom: handler(),
        gl: { keyboard: handler(), dragRotate: handler(), touchPitch: handler(), getContainer: () => container,
            // Any automatic camera change in either lifecycle must fail this regression.
            easeTo: () => assert.fail('toggle must preserve the selected camera'),
            jumpTo: () => assert.fail('return to position selection must preserve the selected camera') }
    }, mapMaker: { customMode: true, zoomMessage() {}, rough_options: () => ({ enabled: false }) }
});
vm.runInContext(fs.readFileSync('lib/geolib.js', 'utf8'), box);
vm.runInContext(fs.readFileSync('lib/birdseye.js', 'utf8'), box);
vm.runInContext('Birdseye.sync = () => {}; Birdseye.open();', box);
assert.equal(box.map.threeD, true);
assert.equal(container.querySelector('.maplibregl-ctrl-compass').disabled, true);
vm.runInContext('Birdseye.open()', box);
assert.equal(box.map.threeD, false);
vm.runInContext('MapCont.start()', box);
assert.equal(container.querySelector('.maplibregl-ctrl-compass').disabled, false);
assert.equal(JSON.stringify(camera), before);
console.log('PASS 3D on/off and position-selection startup do not reset center, zoom, bearing or pitch');
// Editing begins in the mode selected by the camera, with no extra tilt.
const panel = { classList: { add() {}, remove() {}, toggle() {} } };
Object.assign(box, { Conf: { style: { color: {} }, editPanels: [] }, LayerCont: { palette: 'color' }, Layers: { background: { opacity: 1, color: '#fff' } },
    document: { getElementById: () => panel }, customMap: panel, makeMap: panel, controlMenu: panel, roughControls: panel, saveMap: panel,
    requestAnimationFrame: () => {}, $: () => ({ attr() {}, removeClass() {}, addClass() {}, css() {} }) });
box.map.zoomControl = handler();
box.map.gl.getPitch = () => camera.pitch;
box.map.getZoom = () => camera.zoom;
vm.runInContext(fs.readFileSync('mapmaker.js', 'utf8'), box);
const initialModes = [];
box.recordMode = () => initialModes.push(box.map.threeD);
vm.runInContext('mapMaker.rough_change = recordMode; mapMaker.zoomMessage = () => {};', box);
camera.pitch = 0;
vm.runInContext('mapMaker.custom(true)', box);
assert.equal(box.map.threeD, false);
camera.pitch = 54;
vm.runInContext('mapMaker.custom(true)', box);
assert.equal(box.map.threeD, true);
assert.equal(camera.pitch, 54);
assert.deepEqual(initialModes, [false,true], 'initial preview starts only after choosing the final 2D/3D state');
box.map.gl.easeTo = ({ pitch }) => { camera.pitch = pitch; };
vm.runInContext('mapMaker.positionView(false)', box);
assert.equal(camera.pitch, 0);
assert.equal(camera.bearing, -32.5);
vm.runInContext('mapMaker.positionView(true)', box);
assert.equal(camera.pitch, 30);
assert.equal(camera.bearing, -32.5);
console.log('PASS editor auto-selects 2D/3D from pitch; position buttons choose 0/30 degrees without changing bearing');

vm.runInContext('MapCont.stop()', box);
assert.equal(navigationClasses.has('d-none'), true, 'editing hides zoom and compass as a group');
vm.runInContext('Birdseye.open(); Birdseye.open();', box);
assert.equal(navigationClasses.has('d-none'), true, '3D toggles keep navigation controls hidden');
vm.runInContext('MapCont.start()', box);
assert.equal(navigationClasses.has('d-none'), false, 'position selection restores navigation controls');
console.log('PASS edit mode hides zoom/tilt controls through 3D toggles and restores them for position selection');

vm.runInContext('mapMaker.customMode = true; Birdseye.setEnabled(true)', box);
const navigationHandlers = [box.map.dragging, box.map.scrollWheelZoom, box.map.touchZoom, box.map.doubleClickZoom, box.map.gl.dragRotate, box.map.gl.touchPitch, box.map.gl.keyboard];
assert.ok(navigationHandlers.every(handler => !handler.enabled), '3D editing locks all mouse, touch and keyboard camera input');
vm.runInContext('Birdseye.open(); Birdseye.open()', box);
assert.ok(navigationHandlers.every(handler => !handler.enabled), 'repeated 3D toggles cannot unlock the camera');
vm.runInContext('MapCont.start()', box);
assert.ok(navigationHandlers.every(handler => handler.enabled), 'returning to position selection restores camera input');
console.log('PASS editing remains locked through 3D toggles; position selection restores navigation');
