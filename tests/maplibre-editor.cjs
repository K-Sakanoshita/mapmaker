const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    const layers = new Map(), states = new Map(), sources = new Map(), filterCalls = []; let sourceAdds = 0, clicked = 0, diffs = [], holdIdle = false, releaseIdle;
    const gl = { on() {}, once(type, fn) { if (holdIdle) releaseIdle = fn; else queueMicrotask(fn); }, setLight() {}, triggerRepaint() {},
        setFilter(id, filter) { filterCalls.push(id); layers.get(id).filter = filter; },
        setPaintProperty(id, key, value) { layers.get(id).paint[key] = value; },
        setLayoutProperty(id, key, value) { (layers.get(id).layout ||= {})[key] = value; }, getLayer: id => layers.get(id),
        addLayer: layer => layers.set(layer.id, layer), removeLayer: id => layers.delete(id),
        getSource: id => sources.get(id), addSource(id, source) { sourceAdds++; sources.set(id, { ...source, updateData(diff) { diffs.push(diff); } }); },
        removeSource: id => sources.delete(id), setFeatureState: (target, state) => states.set(target.id, state),
        queryRenderedFeatures: () => [{ properties: { clickId: 7 } }] };
    const model = { id: 7, feature: { type: 'Feature', properties: { building: 'yes' }, geometry: { type: 'Polygon', coordinates: [[[139,35],[139.001,35],[139,35.001],[139,35]]] } },
        options: { fillColor: '#e5dfdad9', color: '#bbb', opacity: 1, fillOpacity: 1, weight: .8 },
        mapmaker: { key: 'building', id: 0, drawOrder: { osmLayer: 0, styleOrder: 5, passOrder: 0, featureOrder: 0 } }, click() { clicked++; } };
    const view = { gl, features: new Map([[7,model]]), threeD: true };
    const box = vm.createContext({ console, queueMicrotask, setTimeout, MapLibreBuildingOutlines: class { constructor() { this.id = 'test-outline'; } async prepare() {} update() {} updateMany() {} }, mapMaker: { customMode: true, nativeEditorEnabled: () => true },
        SVGCont: { svg_style: () => ({ fillColor: '#eeeeee', color: '#cccccc', weight: 2 }) },
        LayerCont: { palette: 'color' }, Conf: { default: { birdseye: { defaultHeight: 3 } } }, Layers: { building: { opacity: '', svg: [model] } },
        chroma: value => ({ hex: () => value.slice(0,7), css: () => value, alpha: () => .85 }) });
    vm.runInContext(fs.readFileSync('lib/geolib.js','utf8'), box);
    vm.runInContext(fs.readFileSync('lib/maplibre-vector-editor.js','utf8'), box);
    vm.runInContext(fs.readFileSync('lib/maplibre-editor.js','utf8'), box);
    const Renderer = vm.runInContext('MapLibreEditorRenderer', box), renderer = new Renderer(view);
    await renderer.sync();
    assert.equal(sources.get(renderer.sourceId).data.features[0].properties.height, 3);
    assert.ok([...layers.values()].some(layer => layer.type === 'fill-extrusion'));
    assert.ok([...layers.values()].some(layer => layer.source === renderer.hitSourceId && layer.paint['fill-extrusion-opacity'] === 0), 'hidden roofs remain selectable at their original height');
    assert.deepEqual(Array.from(layers.get(renderer.hitLayerId).filter[2][1]), [], 'visible roofs never enter the restoration layer');
    model.options.opacity = 0; model.options.fillOpacity = 0;
    assert.equal(renderer.update(model), true);
    assert.equal(sourceAdds, 2, 'one feature edit does not regenerate or replace GeoJSON source');
    assert.equal(states.get(7).opacity, 0);
    assert.deepEqual(Array.from(layers.get(renderer.hitLayerId).filter[2][1]), [7], 'restoration targets only the hidden roof');
    assert.equal(diffs.length, 0, 'hide does not mutate GeoJSON');
    assert.ok(JSON.stringify([...layers.values()].find(l => l.source === renderer.sourceId).filter).includes('[7]'));
    model.options.opacity = 1; model.options.fillOpacity = 1; renderer.update(model);
    assert.equal(diffs.length, 0, 'restore does not mutate GeoJSON');
    assert.deepEqual(Array.from(layers.get(renderer.hitLayerId).filter[2][1]), [], 'restored roofs leave the hit layer');
    const source = sources.get(renderer.sourceId), originalModel = view.features.get(7);
    await renderer.sync();
    assert.equal(sourceAdds, 2, 'no-op sync preserves sources');
    renderer.refreshCategory('building');
    assert.equal(sources.get(renderer.sourceId), source);
    assert.equal(view.features.get(7), originalModel, 'category change preserves editable models');
    assert.equal(model.options.fillColor, '#eeeeee', 'export model receives new color');
    const extrusion = [...layers.values()].find(l => l.source === renderer.sourceId && l.type === 'fill-extrusion');
    assert.equal(extrusion.paint['fill-extrusion-color'], '#eeeeee');
    box.LayerCont.palette = 'coloring'; renderer.refreshCategory('building');
    assert.equal(extrusion.paint['fill-extrusion-opacity'], 0, 'coloring hides roofs and sides');
    box.LayerCont.palette = 'color'; renderer.refreshCategory('building');
    assert.ok(extrusion.paint['fill-extrusion-opacity'] > 0, 'other palettes restore building fill');

    box.Layers.building.opacity = 0; renderer.refreshCategory('building');
    assert.equal(extrusion.layout.visibility, 'none');
    box.Layers.building.opacity = 1; renderer.refreshCategory('building');
    assert.equal(extrusion.layout.visibility, 'visible');
    assert.equal(sourceAdds, 2); assert.equal(diffs.length, 0);
    box.Layers.building.opacity = 0;
    const originalPaint = JSON.stringify(extrusion.paint);
    renderer.setCategoryVisibility('building');
    assert.equal(extrusion.layout.visibility, 'none');
    assert.equal(JSON.stringify(extrusion.paint), originalPaint, 'category visibility only changes layout');
    assert.equal(sources.get(renderer.sourceId), source, 'category toggle retains source and model geometry');
    box.Layers.building.opacity = 1; renderer.setCategoryVisibility('building');
    assert.equal(extrusion.layout.visibility, 'visible');
    const originalQuery = gl.queryRenderedFeatures;
    gl.queryRenderedFeatures = () => { throw new Error('3D must not perform hit testing'); };
    renderer.click({ point: { x: 20, y: 30 }, lngLat: { lat: 35, lng: 139 } });
    assert.equal(clicked, 0, '3D does not invoke feature click handlers');
    view.threeD = false; box.ManualPins = { active: true };
    renderer.click({ point: { x: 20, y: 30 }, lngLat: { lat: 35, lng: 139 } });
    assert.equal(clicked, 0, 'pin placement must not toggle map features beneath the pin');
    box.ManualPins.active = false;
    gl.queryRenderedFeatures = originalQuery; view.threeD = false;
    renderer.click({ point: { x: 20, y: 30 }, lngLat: { lat: 35, lng: 139 } });
    assert.equal(clicked, 1);
    const query = gl.queryRenderedFeatures;
    view.features.set(8, { ...model, id: 8, click() { throw new Error('selected building beneath hidden roof'); } });
    model.options.opacity = 0;
    gl.queryRenderedFeatures = () => [
        { properties: { clickId: 8 } },
        { layer: { source: renderer.hitSourceId }, properties: { clickId: 7 } }
    ];
    renderer.click({ point: { x: 20, y: 30 }, lngLat: { lat: 35, lng: 139 } });
    assert.equal(clicked, 2, 'hidden roof restoration takes priority over geometry beneath it');
    model.options.opacity = 1; view.features.delete(8); gl.queryRenderedFeatures = query;
    view.threeD = true;
    const oldSourceId = renderer.sourceId, oldLayerIds = [...renderer.layerIds];
    holdIdle = true; view.threeD = false;
    const switching = renderer.sync();
    await new Promise(setImmediate);
    assert.ok(sources.has(oldSourceId), 'old supplemental data stays on screen while the new source is loading');
    assert.ok(oldLayerIds.every(id => layers.has(id)), 'old rendered geometry is not cleared before the new render');
    assert.equal(sources.size, 4, 'two source generations coexist during replacement');
    holdIdle = false; releaseIdle(); await switching;
    assert.equal(sources.has(oldSourceId), false, 'old source is retired only after new rendering completes');
    assert.equal([...layers.values()].some(layer => layer.type === 'fill-extrusion' && layer.source === renderer.sourceId), false);
    assert.equal(sources.size, 2);
    const rail = { ...model, id: 8, feature: { type:'Feature', properties:{railway:'rail'},
        geometry:{type:'LineString',coordinates:[[139,35],[139.001,35.001]]} },
        mapmaker:{...model.mapmaker,key:'railway'}, options:{color:'#686866',weight:2.68,opacity:1,fillOpacity:0,dashArray:'0'} };
    box.Layers.railway = {opacity:'',svg:[rail]};
    view.features = new Map([[8,rail]]);
    await renderer.sync();
    const railLayer = [...layers.values()].find(l=>l.type==='line');
    assert.ok(railLayer, 'railway has a line layer');
    assert.equal('line-dasharray' in railLayer.paint,false,'SVG zero dash becomes a solid native railway base');
    rail.options.dashArray='6 5'; renderer.refreshCategory('railway');
    assert.equal(railLayer.paint['line-dasharray'].length,2,'white overlay keeps its nonzero dashes');
    rail.options.dashArray='0'; renderer.refreshCategory('railway');
    assert.equal(railLayer.paint['line-dasharray'],null,'style updates reset a zero dash to solid');
    for (const dashArray of [null,'',0,'0 0',[0,0]]) assert.equal(renderer.dashArray({options:{dashArray}}),null);
    const wall = { ...rail, id: 9, feature: { ...rail.feature, properties: { barrier: 'wall' } },
        mapmaker: { ...rail.mapmaker, key: 'barrier' }, options: { color: '#aaa09a', weight: .5, opacity: 1, fillOpacity: 0 } };
    box.Layers.barrier = { opacity: '', svg: [wall] };
    view.features = new Map([[9, wall]]); view.threeD = true;
    await renderer.sync();
    let wallData = sources.get(renderer.sourceId).data.features[0];
    assert.equal(wallData.geometry.type, 'MultiPolygon');
    assert.equal(wallData.properties.height, 1.5);
    assert.equal(wallData.properties.solidFill, '#aaa09a');
    assert.ok([...layers.values()].some(l => l.source === renderer.sourceId && l.type === 'fill-extrusion'));
    wall.options.opacity = 0; renderer.update(wall);
    assert.ok(JSON.stringify([...layers.values()].find(l => l.source === renderer.sourceId).filter).includes('[9]'));
    wall.options.opacity = 1; renderer.update(wall);
    view.threeD = false; await renderer.sync();
    assert.equal(sources.get(renderer.sourceId).data.features[0].geometry.type, 'LineString');
    assert.ok([...layers.values()].some(l => l.type === 'line'));
    wall.feature.properties.height = '2.4';
    view.threeD = true; await renderer.sync();
    assert.equal(sources.get(renderer.sourceId).data.features[0].properties.height, 2.4);
    const retainingWall = { ...wall, feature: { ...wall.feature, properties: { barrier: 'retaining_wall', height: '4' } } };
    view.features = new Map([[9, retainingWall]]);
    await renderer.sync();
    assert.equal(sources.get(renderer.sourceId).data.features[0].geometry.type, 'LineString');
    assert.ok([...layers.values()].some(l => l.source === renderer.sourceId && l.type === 'line'));
    assert.equal([...layers.values()].some(l => l.source === renderer.sourceId && l.type === 'fill-extrusion'), false,
        'retaining walls stay flat even with a height tag in 3D mode');
    console.log('PASS wall extrusion, default/explicit heights, brown color, hide/restore and original 2D line');
    view.features = new Map([[9, wall], [8, rail]]);
    await renderer.sync();
    const unrelatedRail = renderer.entries.find(entry => entry.group.key === 'railway');
    const railFilter = JSON.stringify(layers.get(unrelatedRail.id).filter);
    filterCalls.length = 0;
    wall.options.opacity = 0; renderer.update(wall);
    assert.ok(filterCalls.length > 0);
    assert.equal(filterCalls.includes(unrelatedRail.id), false, 'individual wall hide leaves railway filters untouched');
    assert.equal(JSON.stringify(layers.get(unrelatedRail.id).filter), railFilter);
    wall.options.opacity = 1; renderer.update(wall);
    box.Layers.barrier.opacity = 0;
    view.features = new Map([[9, wall]]);
    await renderer.sync();
    const initiallyHiddenWall = [...layers.values()].find(l => l.source === renderer.sourceId && l.type === 'fill-extrusion');
    assert.equal(initiallyHiddenWall.layout.visibility, 'none');
    assert.ok(initiallyHiddenWall.paint['fill-extrusion-opacity'] > 0, 'hidden category keeps its visible paint for restoration');
    box.Layers.barrier.opacity = 1; renderer.setCategoryVisibility('barrier');
    assert.equal(initiallyHiddenWall.layout.visibility, 'visible');
    const treePoint = { type: 'Feature', id: 'node/1', properties: { natural: 'tree', height: '6 m' },
        geometry: { type: 'Point', coordinates: [139,35] } };
    box.Conf.pointStyle = { tree: { radius: 1.2, palette: { color: { fillColor: '#9fc89d', lineColor: '#75a873', width: 0 },
        mono: { fillColor: '#b8b8b5', lineColor: '#777775', width: .3 } } } };
    box.Conf.palette = { color: {}, mono: {} }; box.LayerCont = { palette: 'color' };
    const tree = { ...model, id: 10, mapmaker: { ...model.mapmaker, key: 'garden', pointStyleName: 'tree', sourceFeature: treePoint },
        options: { color: '#75a873', fillColor: '#9fc89d', opacity: 1, fillOpacity: 1, weight: 0 } };
    box.Layers.garden = { opacity: '', svg: [tree] }; view.features = new Map([[10, tree]]);
    await renderer.sync();
    const treeFeatures = sources.get(renderer.sourceId).data.features;
    assert.equal(treeFeatures.length, 2, 'one tree produces a trunk and crown');
    const crown = treeFeatures.find(f => f.id === 10), trunk = treeFeatures.find(f => f.id === '10-trunk');
    assert.equal(crown.properties.height, 6); assert.ok(Math.abs(crown.properties.base - 1.8) < 1e-12);
    assert.equal(trunk.properties.base, 0); assert.ok(Math.abs(trunk.properties.height - 2.1) < 1e-12);
    assert.equal(trunk.properties.solidFill, '#8b6b4a'); assert.equal(crown.properties.solidFill, '#9fc89d');
    assert.ok(treeFeatures.every(f => f.properties.clickId === 10));
    tree.options.opacity = 0; renderer.update(tree);
    assert.equal(states.get('10-trunk').opacity, 0); assert.equal(states.get(10).opacity, 0);
    for (const entry of renderer.entries) assert.ok(JSON.stringify(layers.get(entry.id).filter).includes('[10]'));
    tree.options.opacity = 1; renderer.update(tree);
    assert.equal(states.get('10-trunk').opacity, 1);
    box.LayerCont.palette = 'mono'; renderer.refreshCategory('garden');
    const trunkEntry = renderer.entries.find(entry => entry.group.treePart === 'trunk');
    assert.equal(layers.get(trunkEntry.id).paint['fill-extrusion-color'], '#777775');
    view.threeD = false; await renderer.sync();
    assert.equal(sources.get(renderer.sourceId).data.features.length, 1, '2D uses the original tree circle only');
    assert.equal([...layers.values()].some(l => l.source === renderer.sourceId && l.type === 'fill-extrusion'), false);
    assert.equal(treePoint.properties.height, '6 m', 'source tags are unchanged');
    console.log('PASS tree trunk/crown, tagged height, edit identity, hide/restore, mono palette and 2D switch');
    renderer.clear();
    assert.equal(sources.size, 0); assert.equal(layers.size, 0);
    console.log('PASS persistent renderer shares heights, uses feature-state updates, supports 2D/3D, hit testing and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
