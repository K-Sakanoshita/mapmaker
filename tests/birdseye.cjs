const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('lib/geolib.js', 'utf8');
const polygon = (id, x, tags = {}) => ({ type: 'Feature', id, properties: {building:"yes", ...tags},
    geometry: { type: 'Polygon', coordinates: [[[x,35],[x+.0003,35],[x+.0003,35.0003],[x,35.0003],[x,35]]] } });
const fixtures = [polygon('unknown',139), polygon('levels',139.0004,{'building:levels':'2'}), polygon('height',139.0008,{height:'12 m','building:levels': '2'})];
function context(code) {
    const box = vm.createContext({ console: { log() {} },
        Conf: { default: { Palette: 'color' }, style: { color: { building: { type: 'area' }, road: { type: 'line' } } } },
        LayerCont: { palette: 'color', styles: ['road', 'building'] },
        SVGCont: { svg_style: () => ({ color:'#ccc', fillColor:'#ddd', opacity:1, fillOpacity:1, weight:1 }) },
        Layers: { building: { geojson: fixtures, opacity:1 }, road: { opacity:1, geojson:[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[139,35],[139.001,35.001]]}}] } }
    });
    vm.runInContext(code, box);
    vm.runInContext('globalThis.exporter = new PrintSVGExporter({paper:"A4",marginMm:{top:0,left:0,right:0,bottom:0}})',box);
    return box;
}
const box = context(source);
const height = (tags, options={}) => { box.feature = { properties:tags }; box.options = options; return vm.runInContext('getMapMakerBuildingHeight(feature,options)',box); };
assert.equal(height({}),3);
assert.equal(height({'building:levels':'2'}),6);
assert.equal(height({height:'12 m','building:levels':'2'}),12);
assert.equal(height({tags:{height:'10 ft'}}),3.048);
assert.equal(height({height:'bad','building:levels':'4'}),12);
for (const value of ['0','-1','NaN','Infinity','3;6','5 bananas','']) assert.equal(height({height:value}),3);
assert.equal(height({}, {defaultHeight:4}),4);
assert.equal(height({'building:levels':'2'}, {floorHeight:3.5}),7);
const bbox = [138.9998,34.9998,139.0015,35.001];
const output = box.exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45,bearing:0}});
assert.match(output,/data-height-m="3"/);
assert.match(output,/data-height-m="6"/);
assert.match(output,/data-height-m="12"/);
assert.match(output,/data-building-face="wall"/);
assert.match(output,/data-building-face="roof"/);
assert.doesNotMatch(output,/NaN|Infinity|<image/);
assert.equal((output.match(/data-building-id=/g)||[]).length,3);
for(const bearing of [0,90,180,270,360]) {
    const opt = {...box.exporter.opts,birdseye:{tilt:45,bearing}};
    const page = box.exporter._resolvePaper('A4',opt);
    const tf = box.exporter._makeTransform(bbox,page,opt);
    for(const feature of fixtures) for(const ll of feature.geometry.coordinates[0]) {
        const [x,y] = tf.toPageMmXY(ll);
        const roofY = y-tf.heightMm(height(feature.properties));
        assert.ok(x>=0 && x<=210 && roofY>=0 && y<=297);
    }
}
box.Layers.building.opacity=0;
assert.doesNotMatch(box.exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45}}),/data-building-id/);
box.Layers.building.opacity=1;
const courtyard = polygon('courtyard',139);
courtyard.geometry.coordinates.push([[139.0001,35.0001],[139.0001,35.0002],[139.0002,35.0002],[139.0002,35.0001],[139.0001,35.0001]]);
const multi = polygon('multi',139.0004);
multi.geometry = {type:'MultiPolygon',coordinates:[multi.geometry.coordinates,polygon('part',139.0008).geometry.coordinates]};
box.Layers.building.geojson=[courtyard,multi];
const holes = box.exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45}});
assert.match(holes,/fill-rule="evenodd"/);
assert.equal((holes.match(/data-building-face="roof"/g)||[]).length,3);
// 建物と同じカテゴリにある防波堤などは立ち上げない。
box.Layers.building.geojson=[polygon('dam',139,{building:'no',waterway:'dam'}),polygon('outside',140,{height:'100'})];
assert.doesNotMatch(box.exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45}}), /data-building-id/);
// 一棟だけ非表示にした場合も屋根・側面を出力しない。
box.Layers.building.geojson=[fixtures[0]];
box.Layers.building.svg=[{mapmaker:{drawOrder:{featureOrder:0,passOrder:0}},options:{opacity:0,fillOpacity:0}}];
assert.doesNotMatch(box.exporter.toSVGFromLayers(bbox,{birdseye:{tilt:45}}), /data-building-id/);
box.Layers.building.svg=[];
// 通常の2D出力は変更前と同一であること。
box.Layers.building.geojson=fixtures;
assert.doesNotMatch(box.exporter.toSVGFromLayers(bbox), /data-building-face/);
if (process.env.BIRDSEYE_BASELINE) {
    const previous = context(fs.readFileSync(process.env.BIRDSEYE_BASELINE,'utf8'));
    assert.equal(box.exporter.toSVGFromLayers(bbox),previous.exporter.toSVGFromLayers(bbox));
}
// Workerと通常の書き出しで同じSVGを生成すること。
const options = {birdseye:{tilt:45,bearing:30}};
const expectedWorkerSVG = box.exporter.toSVGFromLayers(bbox,options);
const messages = [];
const workerState = {Conf:box.Conf,Layers:box.Layers,LayerCont:box.LayerCont,
    styles:{road:[box.SVGCont.svg_style(),null],building:[box.SVGCont.svg_style(),null]}};
box.self = {postMessage:message=>messages.push(message)};
box.importScripts = () => {};
vm.runInContext(fs.readFileSync('lib/svg-export-worker.js','utf8'),box);
box.self.onmessage({data:{id:1,state:workerState,exporterOptions:box.exporter.opts,bbox,options}});
assert.equal(messages[0].svgText,expectedWorkerSVG);
box.self.onmessage({data:{id:2,exporterOptions:box.exporter.opts,bbox,options:{...options,birdseye:{tilt:45,bearing:90}}}});
assert.equal(messages[1].svgText,box.exporter.toSVGFromLayers(bbox,{...options,birdseye:{tilt:45,bearing:90}}));
assert.equal(messages[1].id,2);
if(process.env.BIRDSEYE_FIXTURE) fs.writeFileSync(process.env.BIRDSEYE_FIXTURE,output);
console.log('PASS height fallback, units, projection/rotation bounds, editable faces, hidden buildings, courtyard, MultiPolygon, unchanged 2D output, worker output parity');

// MapLibre's public custom-layer matrix projects roofs independently from footprints.
box.Layers.building.geojson = [courtyard];
box.Layers.building.svg = [];
box.Layers.building.opacity = 1;
const worldX = (139 + 180) / 360;
const worldY = (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + 35 * Math.PI / 360))) / 360;
const matrix = [10000,0,0,0, 0,-10000,0,0, 20000,30000,1,100, -10000*worldX,10000*worldY,0,1];
const camera = { matrix, width: 1000, height: 600, zoom: 17, rect: { x1: 100, y1: 50, width: 800, height: 500 } };
const cameraOptions = { ...box.exporter.opts, camera, birdseye: { defaultHeight: 3 } };
const cameraPage = box.exporter._resolvePaper('A4', cameraOptions);
const cameraTF = box.exporter._makeTransform(bbox, cameraPage, cameraOptions);
const groundPoint = cameraTF.toPageMmXY([139,35]);
const roofPoint = cameraTF.toPageMmXY([139,35],3);
assert.notEqual(roofPoint[0],groundPoint[0], 'camera perspective changes roof x');
assert.ok(roofPoint[1] < groundPoint[1], 'roof projects upward');
const cameraSVG = box.exporter.toSVGFromLayers(bbox,cameraOptions);
assert.match(cameraSVG,/mapmaker-camera-clip/);
assert.match(cameraSVG,/data-building-face="roof"/);
assert.match(cameraSVG,/data-building-face="wall"/);
assert.doesNotMatch(cameraSVG,/NaN|Infinity|<image/);
const flatCameraSVG = box.exporter.toSVGFromLayers(bbox,{ ...cameraOptions, birdseye: null });
assert.doesNotMatch(flatCameraSVG,/data-building-face/);
console.log('PASS native camera perspective, editable roofs/walls/courtyard, viewport clip and flat export');

// 水面の遠方の頂点がカメラ後方に回り込んでも、反転して用紙全体を覆わない。
const frustumMatrix = [4,0,0,0, 0,1,0,-1, 0,0,1,0, -2,0,0,0.5];
const frustumCamera = { matrix: frustumMatrix, width: 1000, height: 600, zoom: 16,
    rect: { x1: 0, y1: 0, width: 1000, height: 600 } };
const frustumOptions = { ...box.exporter.opts, camera: frustumCamera, birdseye: null };
const frustumPage = box.exporter._resolvePaper({ widthMm: 210, heightMm: 126 }, frustumOptions);
const frustumTF = box.exporter._makeTransform(bbox,frustumPage,frustumOptions);
const fromWorld = (x,y) => [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
const rearWater = [[.48,.6],[.52,.6],[.52,.9],[.48,.9],[.48,.6]].map(p=>fromWorld(...p));
assert.equal(box.exporter._geomToPathD({type:'Polygon',coordinates:[rearWater]},frustumTF,{}),'', 'water wholly behind the camera is discarded');
const crossingWater = [[.49,.1],[.51,.1],[.51,.9],[.49,.9],[.49,.1]].map(p=>fromWorld(...p));
const clippedWater = frustumTF.clipPolygon(crossingWater);
assert.ok(clippedWater.length>=3, 'water crossing a clipping plane is retained as a clipped polygon');
for(const [x,y] of clippedWater) { assert.ok(Number.isFinite(x)&&Number.isFinite(y)); assert.ok(x>=-7 && x<=217 && y>=-7 && y<=133); }
const rearLine = [fromWorld(.48,.6),fromWorld(.52,.9)];
assert.equal(box.exporter._lineToPathD(rearLine,frustumTF,{},{}),'');
const frontLine = [fromWorld(.49,.1),fromWorld(.5,.15),fromWorld(.51,.2)];
assert.equal((box.exporter._lineToPathD(frontLine,frustumTF,{},{}).match(/M/g)||[]).length,1,'connected lines preserve their dash continuity');
const crossingLine = frustumTF.clipLine([fromWorld(.49,.1),fromWorld(.51,.9)]);
assert.ok(crossingLine.length);
for(const run of crossingLine) for(const [x,y] of run) assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<220&&Math.abs(y)<135);
const rearBuilding = {type:'Feature',id:'rear-building',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[rearWater]}};
assert.equal(box.exporter._buildingSVG(rearBuilding,frustumTF,{fill:'#ccc',fillOpacity:1},{...frustumOptions,birdseye:{defaultHeight:3}}).svg,'');
console.log('PASS behind-camera water/buildings/lines are discarded, crossing geometry is clipped before projection, and line continuity is preserved');

const translucentStyle = { fill: '#e5dfdad9', fillOpacity: 1, stroke: '#ddd', strokeOpacity: 1, strokeWidth: 0 };
const translucent = box.exporter._buildingSVG(fixtures[0], cameraTF, translucentStyle, cameraOptions).svg;
assert.match(translucent, /fill="#e5dfdad9"/);
const shade = 0.18 * 217 / 255;
assert.ok(translucent.includes(`fill-opacity="${shade}"`), 'wall shading follows the color alpha');
const transparent = box.exporter._buildingSVG(fixtures[0], cameraTF, { ...translucentStyle, fill: '#e5dfda00' }, cameraOptions).svg;
assert.match(transparent, /fill="#000" fill-opacity="0"/, 'fully transparent walls leave no black shading');
console.log('PASS SVG wall shading respects building color transparency');
const editorBox = context(source);
editorBox.Layers.building.svg = fixtures.map((feature, i) => ({ id: 10 + i, click() {}, options: { opacity: i === 1 ? 0 : 1, fillOpacity: i === 1 ? 0 : 1 }, mapmaker: { drawOrder: { featureOrder: i, passOrder: 0 } } }));
const interactive = editorBox.exporter.toSVGFromLayers(bbox, { birdseye: { tilt: 30 }, editorHitTargets: true, skipHiddenLayers: false });
assert.match(interactive, /data-editor-id="10"/);
assert.match(interactive, /data-editor-id="11"/, 'an individually hidden building retains a transparent SVG hit target for restoration');
assert.doesNotMatch(editorBox.exporter.toSVGFromLayers(bbox, { birdseye: { tilt: 30 } }), /data-editor-id/, 'saved SVG contains no editor hit targets');
editorBox.Layers.building.opacity = 0;
assert.match(editorBox.exporter.toSVGFromLayers(bbox, { editorHitTargets: true, skipHiddenLayers: false }), /pointer-events:none/, 'disabled categories do not intercept clicks');
console.log('PASS SVG editor has clickable geometry, hidden-feature restoration and no hit metadata in saved output');

editorBox.Layers.road.svg = [{ id: 99, click() {}, options: {}, mapmaker: { drawOrder: { featureOrder: 0, passOrder: 0 } } }];
assert.match(editorBox.exporter.toSVGFromLayers(bbox, { editorHitTargets: true }), /data-editor-id="99" style="pointer-events:stroke"/, 'roads hit their stroke rather than the interior of an open path');

// 壁は線から薄い面を生成し、保存時も同じ高さと色で立ち上げる。
const wallBox = context(source);
const wallLine = { type: 'Feature', id: 'wall', properties: { barrier: 'wall' },
    geometry: { type: 'LineString', coordinates: [[139,35],[139.0003,35],[139.0003,35.0003]] } };
wallBox.LayerCont.styles = ['barrier'];
wallBox.Conf.style.color.barrier = { type: 'line' };
wallBox.Layers.barrier = { opacity: 1, geojson: [wallLine] };
wallBox.SVGCont.svg_style = () => ({ color: '#aaa09a', opacity: 1, fillOpacity: 0, weight: .5 });
const wallOutput = () => wallBox.exporter.toSVGFromLayers(bbox, { birdseye: { tilt: 45 } });
assert.match(wallOutput(), /data-height-m="1.5"/);
assert.match(wallOutput(), /fill="#aaa09a"/);
assert.match(wallOutput(), /data-building-face="wall"/);
wallLine.properties.height = '2.4 m';
assert.match(wallOutput(), /data-height-m="2.4"/);
wallLine.properties = { tags: { barrier: 'wall', height: '10 ft' } };
assert.match(wallOutput(), /data-height-m="3.048"/);
wallLine.properties = { barrier: 'wall', height: 'invalid', 'building:levels': '8' };
assert.match(wallOutput(), /data-height-m="1.5"/);
assert.doesNotMatch(wallBox.exporter.toSVGFromLayers(bbox), /data-height-m/);
for (const barrier of ['fence','kerb','hedge','retaining_wall']) {
    wallLine.properties = { barrier };
    assert.doesNotMatch(wallOutput(), /data-height-m/);
}
wallLine.properties = { barrier: 'wall' };
wallLine.geometry = { type: 'MultiLineString', coordinates: [wallLine.geometry.coordinates, [[139,35],[139,35]]] };
assert.doesNotMatch(wallOutput(), /NaN|Infinity/);
wallBox.Layers.barrier.opacity = 0;
assert.doesNotMatch(wallOutput(), /data-height-m/);
console.log('PASS wall SVG height/units/fallback, color, multiline/duplicate points, hidden category and unchanged fences/2D');

// A wall bending towards the camera must not bring its far segment above a building.
const occlusionBox = context(source);
const bentWall = { type: 'Feature', id: 'bent-wall', properties: { barrier: 'wall' },
    geometry: { type: 'LineString', coordinates: [[138.9999,34.9998],[138.9999,35.00031],[139.0005,35.00031]] } };
occlusionBox.LayerCont.styles = ['building', 'barrier'];
occlusionBox.Conf.style.color.barrier = { type: 'line' };
occlusionBox.Layers.building.geojson = [polygon('foreground-building',139)];
occlusionBox.Layers.barrier = { opacity: 1, geojson: [bentWall] };
occlusionBox.SVGCont.svg_style = key => key === 'barrier'
    ? { color: '#aaa09a', opacity: 1, fillOpacity: 0, weight: .5 }
    : { color: '#bbb', fillColor: '#e5dfdad9', opacity: 1, fillOpacity: 1, weight: .8 };
for (const cameraMode of [false, true]) {
    const options = { birdseye: { tilt: 45, bearing: 0 }, ...(cameraMode ? { camera } : {}) };
    const svg = occlusionBox.exporter.toSVGFromLayers(bbox, options);
    const walls = [...svg.matchAll(/data-building-id="bent-wall"/g)].map(match => match.index);
    const buildingIndex = svg.indexOf('data-building-id="foreground-building"');
    assert.equal(walls.length, 2, 'both wall segments remain editable vector geometry');
    assert.ok(walls[0] < buildingIndex && buildingIndex < walls[1],
        `${cameraMode ? 'camera' : 'birdseye'}: far wall is behind building, near segment remains in front`);
    assert.doesNotMatch(svg, /NaN|Infinity|<image/);
    if (process.env.WALL_OCCLUSION_FIXTURE && !cameraMode) fs.writeFileSync(process.env.WALL_OCCLUSION_FIXTURE, svg);
}
console.log('PASS bent wall segments sort independently around foreground buildings in birdseye/camera exports');
