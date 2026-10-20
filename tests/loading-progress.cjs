const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const translations = JSON.parse(fs.readFileSync('data/glot.json', 'utf8'));
const prefix = translations.loading_bytes.ja;
let progress;
const messages = [];
const box = vm.createContext({
    map: { getCenter: () => ({ lat: 35, lng: 139 }), setView() {}, getZoom: () => 17 },
    Conf: { default: { MinZoomLevel: 15 } }, LayerCont: { styles: [] },
    glot: { get: key => translations[key]?.ja || key }, location: { href: 'http://localhost/#17/35/139' },
    winCont: { modal_open() {}, spinner() {}, modal_text: text => messages.push(text) },
    Basic: { getData() {}, retry: task => task() },
    overPassCont: { getRetryCount: () => 5, get: (_targets, callback) => { progress = callback; return new Promise(() => {}); } }
});
vm.runInContext(fs.readFileSync('mapmaker.js', 'utf8'), box);
vm.runInContext("mapMaker.make('')", box);
const mb = 1024 * 1024;
for (const bytes of [0, 16 * 1024, .09 * mb, Math.ceil(.1 * mb), .15 * mb, .19 * mb, Math.ceil(.2 * mb), .25 * mb, mb]) progress(bytes);
assert.deepEqual(messages, [prefix + '0.0MB.', prefix + '0.1MB.', prefix + '0.2MB.', prefix + '1.0MB.']);
progress(0); // A restarted download should report the new value.
assert.equal(messages.at(-1), prefix + '0.0MB.');
messages.length = 0;
vm.runInContext("mapMaker.make('')", box);
progress(0);
assert.deepEqual(messages, [prefix + '0.0MB.'], 'a new map generation resets the progress state');
console.log('PASS loading progress uses one decimal MB, suppresses duplicate tenths and resets for retries/new maps');
