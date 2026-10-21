const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {read} = require('./helpers/lib-source.cjs');

function setup(source = fs.readFileSync('lib/renderers/maplibre/mesh-renderer.js', 'utf8'), observe = () => {}, timing = {}) {
    const allocations = [];
    class TrackedFloat32Array extends Float32Array {
        constructor(value, ...args) {
            observe();
            super(value, ...args);
            allocations.push({size:this.length, direct:typeof value === 'number'});
            observe();
        }
    }
    const box = vm.createContext({performance:timing.performance || performance, setTimeout:(callback, delay) => { observe(); return (timing.setTimeout || setTimeout)(callback, delay); },
        Float32Array:TrackedFloat32Array, Conf:{default:{birdseye:{defaultHeight:3}}},
        Layers:{building:{opacity:1}}, LayerCont:{palette:'color'}, chroma:() => ({rgba:() => [170,187,204,.85]}),
        maplibregl:{MercatorCoordinate:{fromLngLat(ll, z = 0) {
            return {x:(ll.lng ?? ll[0])/360, y:(ll.lat ?? ll[1])/360, z:z/40030228.884};
        }}}});
    vm.runInContext(read('@feature-core'), box);
    vm.runInContext(source, box);
    const Renderer = vm.runInContext('MapLibreMeshRenderer', box);
    return {box, allocations, renderer:new Renderer({getCenter:() => [139,35]})};
}
function models(count = 1) {
    const ring = [[139,35],[139.001,35],[139.001,35.001],[139,35.001],[139,35]];
    return Array.from({length:count}, (_,i) => ({id:i+1, mapmaker:{key:'building'},
        options:{color:'#aabbcc',fillColor:'#aabbcc',opacity:1,weight:.8},
        feature:{type:'Feature',id:'way/'+(i+1),properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[ring]}}}));
}
function digest(renderer) {
    const hash = crypto.createHash('sha256');
    for (const data of [renderer.data,renderer.fillData,renderer.fillUVs]) hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength));
    return hash.digest('hex');
}
async function test() {
    const {renderer,allocations} = setup();
    const batch = models(603); // Includes a partial final group and enough geometry to span slices.
    const hole = [[139.0002,35.0002],[139.0002,35.0004],[139.0004,35.0004],[139.0004,35.0002],[139.0002,35.0002]];
    batch[0].feature.geometry.coordinates.push(hole);
    batch[1].feature.geometry = {type:'MultiPolygon',coordinates:[batch[1].feature.geometry.coordinates,[hole]]};
    for (const [i,shape] of ['gabled','hipped','pyramidal'].entries()) {
        batch[i+2].feature.properties = {building:'yes',height:'12','roof:height':'3','roof:shape':shape};
    }
    batch[5].feature.geometry.coordinates = [];
    await renderer.prepare(batch);
    assert.ok(allocations.every(a => a.direct), 'large mesh buffers allocate by size without Number[] staging');
    assert.equal(allocations.length,3);
    assert.equal(renderer.data.length,renderer.count*11);
    assert.equal(renderer.fillData.length,renderer.fillCount*7);
    assert.equal(renderer.fillUVs.length,renderer.fillCount*2);
    assert.equal(renderer.blocks.size,batch.length);
    for (const data of [renderer.data,renderer.fillData,renderer.fillUVs]) assert.ok(data.every(Number.isFinite));
    // Recorded from the previous renderer, including holes, roofs and empty geometry.
    assert.equal(digest(renderer),'04713f059dbb23186b81b5d5b45e814b1d89eba41f172535d5fa2833858a44bd');
    const first = renderer.blocks.get(batch[0].id), next = renderer.blocks.get(batch[1].id);
    const unchanged = renderer.data.slice(next.start,next.end);
    batch[0].options.opacity = 0;
    renderer.update(batch[0]);
    for(let i=first.start+9;i<first.end;i+=11) assert.equal(renderer.data[i],0);
    assert.deepEqual(renderer.data.slice(next.start,next.end),unchanged,'editing one model does not modify its neighbour');
    const empty = setup();
    await empty.renderer.prepare([]);
    assert.equal(empty.renderer.data.length+empty.renderer.fillData.length+empty.renderer.fillUVs.length,0);
    // Simulate work and expensive UI painting during a pause. Only actual
    // processing should consume the next slice's budget.
    let time = 0;
    const pauses = [];
    const timed = setup(undefined, undefined, {performance:{now:() => time}, setTimeout:callback => {
        pauses.push(time); time += 100; callback();
    }});
    const range = timed.box.getMapMakerBuildingRange;
    timed.box.getMapMakerBuildingRange = (...args) => { time += 5; return range(...args); };
    const style = timed.renderer.style.bind(timed.renderer);
    timed.renderer.style = model => { time += 5; return style(model); };
    await timed.renderer.prepare(models(2));
    assert.deepEqual(pauses,[15], 'planning and writing share a budget, reset after yielding, with no trailing pause');
    const quick = setup(undefined, undefined, {performance:{now:() => 0},setTimeout:() => assert.fail('cheap work must not yield by feature count')});
    await quick.renderer.prepare(models(603));
    assert.equal(quick.renderer.count,603*12);
    // Walkway-only planning must also release the main thread; it has no
    // ordinary mesh writing pass to provide another chance to pause.
    time = 0; pauses.length = 0;
    const walkway = models(4), paths = new Map(walkway.map(m => [m.feature.id,{shape:'walkway',lines:[[[139,35,3],[139.001,35,3]]]}]));
    const project = timed.box.maplibregl.MercatorCoordinate.fromLngLat;
    timed.box.maplibregl.MercatorCoordinate.fromLngLat = (...args) => { time += 4; return project(...args); };
    await timed.renderer.prepare(walkway,paths);
    assert.deepEqual(pauses,[16], 'walkway planning yields when its time budget expires');
    console.log('PASS exact-size mesh buffers, legacy vertex parity, visibility edits, shared time slices, no count-based/trailing pauses and walkway responsiveness');
}
module.exports = {setup,models,digest};
if(require.main===module) test().catch(error => {console.error(error);process.exitCode=1;});
