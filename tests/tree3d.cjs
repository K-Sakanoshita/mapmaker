const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const tree = { type: 'Feature', id: 'node/1', properties: { natural: 'tree' }, geometry: { type: 'Point', coordinates: [139,35] } };
const box = vm.createContext({ console: { log() {} },
    Conf: { default: { Palette: 'color' }, pointStyle: { tree: { radius: 1.2, palette: { color: { lineColor: '#75a873', fillColor: '#9fc89d', width: 0 } } } },
        style: { color: { garden: { type: 'area' } } } },
    LayerCont: { palette: 'color', styles: ['garden'] },
    Layers: { garden: { opacity: 1, geojson: [tree] } },
    SVGCont: { svg_style: () => ({ color: '#75a873', fillColor: '#9fc89d', opacity: 1, fillOpacity: 1, weight: 0 }) }
});
vm.runInContext(fs.readFileSync('lib/geolib.js', 'utf8'), box);
const Exporter = vm.runInContext('PrintSVGExporter', box), partsFor = vm.runInContext('getMapMakerTreeParts', box);
const exporter = new Exporter({ paper: { widthMm: 120, heightMm: 100 }, marginMm: { top: 5, left: 5, right: 5, bottom: 5 } });
const bbox = [138.99996,34.99996,139.00004,35.00004];
const options = { birdseye: { tilt: 50, bearing: 25 } };
const flat = exporter.toSVGFromLayers(bbox), output = exporter.toSVGFromLayers(bbox, options);
assert.match(output, /data-tree-id="node\/1"/);
assert.match(output, /data-height-m="4"/);
assert.match(output, /fill="#8b6b4a"/); assert.match(output, /fill="#9fc89d"/);
assert.doesNotMatch(output, /NaN|Infinity/);
assert.doesNotMatch(flat, /data-tree-id|data-building-face/);
const parts = partsFor(tree);
assert.equal(parts.length, 5); assert.equal(parts[1].base, 1.2); assert.equal(parts.at(-1).height, 4);
for (let i = 2; i < parts.length; i++) {
    const radius = part => part.geometry.coordinates[0][0][0] - tree.geometry.coordinates[0];
    assert.ok(radius(parts[i]) < radius(parts[i-1]), 'upper crown bands become narrower');
    assert.equal(parts[i].base, parts[i-1].height, 'crown bands meet without gaps');
}
assert.deepEqual(parts[0].geometry.coordinates[0][0], parts[0].geometry.coordinates[0].at(-1));
for (const [height, expected] of [['10 ft',3.048], ['6 m',6], ['bad',4], ['-2',4]]) {
    tree.properties.height = height; assert.equal(partsFor(tree).at(-1).height, expected);
}
delete tree.properties.height;
// A raised crown uses its base altitude for both projection and frustum clipping.
const part = parts[1], polygon = { ...tree, geometry: part.geometry };
const clipped = [];
const tf = { camera: true, toPageMmXY: ([x,y], z=0) => [x,y-z], clipPolygon(points) { clipped.push(points); return points.map(([x,y,z=0]) => [x,y-z]); } };
exporter._buildingSVG(polygon,tf,{fill:'#9fc89d',fillOpacity:1},exporter.opts,part);
assert.ok(clipped.some(points => points.some(p => p[2] === 1.2)), 'crown walls start above ground');
assert.ok(clipped.some(points => points.every(p => p[2] === part.height)), 'crown band roof uses its own height');
box.Layers.garden.opacity = 0;
assert.doesNotMatch(exporter.toSVGFromLayers(bbox, options), /data-tree-id/);
box.Layers.garden.opacity = 1;
box.Layers.garden.svg = [{ id: 1, click() {}, options: { opacity: 0, fillOpacity: 0 }, mapmaker: { drawOrder: { featureOrder: 0, passOrder: 0 } } }];
assert.doesNotMatch(exporter.toSVGFromLayers(bbox, options), /data-tree-id/);
assert.match(exporter.toSVGFromLayers(bbox, { ...options, editorHitTargets: true, skipHiddenLayers: false }), /data-editor-id="1"/);
box.Layers.garden.svg = [];
const messages = [];
box.self = { postMessage: message => messages.push(message) }; box.importScripts = () => {};
vm.runInContext(fs.readFileSync('lib/svg-export-worker.js', 'utf8'), box);
box.self.onmessage({ data: { id: 1, state: { Conf: box.Conf, Layers: box.Layers, LayerCont: box.LayerCont,
    styles: { garden: [box.SVGCont.svg_style(), null] } }, exporterOptions: exporter.opts, bbox, options } });
assert.equal(messages[0].svgText, output, 'worker and normal export match');
assert.equal(exporter.toSVGFromLayers(bbox), flat, '2D export is unchanged after 3D');
if (process.env.TREE_FIXTURE) fs.writeFileSync(process.env.TREE_FIXTURE, output);
console.log('PASS tree export shape, height/units/fallback, raised crown, visibility, editable hit target, worker parity and 2D');
