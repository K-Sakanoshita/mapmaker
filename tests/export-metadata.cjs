const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const box = vm.createContext({
    map: {
        containerPointToLatLng: ([x, y]) => ({lng: (x - 20) / 100, lat: 1 - (y - 40) / 100}),
        getBearing: () => 35, getPitch: () => 45
    }
});
for (const file of ['lib/ui/export-settings.js', 'lib/export/svg-document.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), box);
const control = vm.runInContext('new SVGControl()', box);
const rect = {x1:20, y1:40, x2:120, y2:140, width:100, height:100};
const data = JSON.parse(JSON.stringify(control.exportMetadata({exportRect:rect})));
assert.deepEqual(data.corners.topLeft, {geographic:{latitude:1, longitude:0}, svg:{x:0, y:0}});
assert.deepEqual(data.corners.bottomRight, {geographic:{latitude:0, longitude:1}, svg:{x:210, y:210}});
assert.ok(Math.abs(data.diagonal.distanceMeters - 157249.598) < 0.01, 'known one-degree diagonal great-circle distance');
assert.deepEqual(data.camera, {bearing:35, pitch:45});
for (const mode of ['A4','A4_landscape','A3','A3_landscape']) {
    const result = control.exportMetadata({mode, exportRect:rect});
    const [,,w,h] = result.svg.viewBox;
    assert.equal(result.corners.topLeft.svg.x, (w-Math.min(w,h))/2);
    assert.equal(result.corners.topLeft.svg.y, (h-Math.min(w,h))/2);
    assert.equal(result.diagonal.distanceMeters, data.diagonal.distanceMeters);
}
box.map.containerPointToLatLng = () => ({lat:NaN, lng:0});
assert.throws(() => control.exportMetadata({exportRect:rect}), /Invalid ground coordinate/);
console.log('PASS metadata corner coordinates, SVG units/paper margins, ground distance and invalid-coordinate handling');
