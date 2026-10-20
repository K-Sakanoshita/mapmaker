const readSource = require('./helpers/lib-source.cjs').read;
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
(async () => {
    const core = ['domain/feature-tags.js','domain/flags.js','domain/model-rules.js','domain/styles.js',
        'geometry/buildings.js','geometry/roofs.js','geometry/barriers.js','geometry/trees.js','geometry/point-models.js','geometry/elevated-paths.js','export/svg-features.js'];
    const isolated = vm.createContext({});
    for (const file of core) vm.runInContext(fs.readFileSync('lib/' + file, 'utf8'), isolated, {filename:file});
    const config = JSON.parse(fs.readFileSync('data/leyers.jsonc', 'utf8'));
    const context = {config, palette:'color', season:'spring'};
    const tree = {type:'Feature',id:'node/1',properties:{natural:'tree',species:'Cerasus × yedoensis'},geometry:{type:'Point',coordinates:[139,35]}};
    const domain = vm.runInContext('MapMakerDomain', isolated), geometry = vm.runInContext('MapMakerGeometry', isolated);
    assert.equal(domain.model3D(context, tree, 'tree'), 'cherry');
    assert.equal(geometry.treeParts(context, tree)[1].mesh.shape, 'cherry');
    assert.equal(domain.seasonColor(context, tree, 'tree', '#123456'), config.seasons.spring.trees.cherry);
    assert.equal(domain.seasonColor({...context,palette:'mono'}, tree, 'tree', '#123456'), '#123456');
    const road = domain.layerStyle(context,{color:'#c9c6c1',color_dark:'#888',width:8},'highway_standard',true,17);
    assert.ok(Math.abs(road.weight - 2.24) < 1e-10, 'road overlay respects edited width and zoom');
    assert.equal(road.color, config.style.color.highway_standard.overstyle.color);
    const railway = domain.layerStyle(context,{width:1},'railway',true,17);
    assert.ok(Math.abs(railway.weight - 1.76) < 1e-10, 'railway overlay keeps its original zoom scaling');
    const worker = new (require('./helpers/svg-worker.cjs'))();
    for (const name of ['Conf','Layers','LayerCont','SVGCont','document','window','maplibregl','MapEngine'])
        assert.equal(vm.runInContext('typeof ' + name, worker.box), 'undefined', 'SVG worker has no ' + name);

    const box = vm.createContext({console:{log(){}},Conf:{...config,default:{Palette:'color'}},LayerCont:{palette:'color',styles:['barrier']},
        Layers:{barrier:{opacity:1}},SVGCont:{svg_style:() => ({color:'#aaa',weight:1,opacity:1,fillOpacity:0})}});
    vm.runInContext(readSource('@feature-core'), box);
    const feature = {type:'Feature',id:'way/2',properties:{barrier:'wall'},geometry:{type:'LineString',coordinates:[[139,35],[139.0001,35.0001]]}};
    box.Layers.barrier.geojson = [feature];
    const model = {id:7,feature,options:{opacity:1,color:'#aaa'},click(){},mapmaker:{drawOrder:{featureOrder:0,passOrder:0}}};
    const registry = vm.runInContext('LayerRenderRegistry', box);
    registry.set(box.Layers.barrier, [model]);
    assert.equal(box.Layers.barrier.svg, undefined, 'category state has no render handles');
    assert.equal(registry.get(box.Layers.barrier)[0], model);
    const capture = vm.runInContext('captureMapMakerExportSnapshot', box), snapshot = capture();
    const clone = structuredClone(snapshot);
    assert.equal(clone.layers.barrier.edits[0].featureId, 'way/2');
    assert.equal(clone.layers.barrier.edits[0].editorId, 7);
    assert.equal(clone.context.config.model3D.barrier.defaultModel, 'flat');
    model.options.opacity = 0;
    assert.equal(box.Layers.barrier.edits[0].options.opacity, 0, 'render API edits the plain record');
    assert.equal(snapshot.layers.barrier.edits[0].options.opacity, 1, 'captured edits do not follow later UI changes');
    model.options = {...model.options,opacity:1};
    assert.equal(box.Layers.barrier.edits[0].options.opacity, 1, 'style replacement retains state ownership');
    const treeModel = {id:8,feature:{type:'Feature',geometry:{type:'Polygon',coordinates:[]}},options:{},mapmaker:{sourceFeature:tree}};
    const treeCategory = {};
    registry.set(treeCategory,[treeModel]);
    assert.equal(treeCategory.edits[0].featureId,'node/1','point-to-circle conversion retains the source OSM ID');
    const exporter = vm.runInContext('new SVGFeatureExporter({paper:"A4"})', isolated);
    const bbox = [138.9999,34.9999,139.0003,35.0003], options = {birdseye:{tilt:45}};
    const expected = exporter.render(clone,bbox,options);
    assert.match(expected,/data-height-m="1.5"/);
    const response = new Promise(resolve => worker.onmessage = event => resolve(event.data));
    worker.postMessage({id:1,revision:4,snapshot:clone,exporterOptions:exporter.opts,bbox,options});
    const result = await response;
    assert.equal(result.svgText, expected); assert.equal(result.revision, 4);

    const workers = [];
    const transport = vm.createContext({URL,setTimeout,clearTimeout,document:{baseURI:'http://localhost/'},Worker:class {
        constructor() { workers.push(this); }
        postMessage(message) { this.message = message; }
        terminate() { this.terminated = true; }
    }});
    vm.runInContext(fs.readFileSync('lib/application/svg-worker-client.js','utf8'), transport);
    const client = vm.runInContext('new SVGExportWorkerClient()', transport);
    const first = client.enqueue(async() => clone,{},bbox,options);
    await new Promise(resolve => setImmediate(resolve));
    const current = workers.at(-1), packet = current.message;
    current.onmessage({data:{id:packet.id,revision:packet.revision+1,svgText:'stale'}});
    assert.ok(client.pending, 'stale result cannot finish current export');
    current.onmessage({data:{id:packet.id,revision:packet.revision,svgText:'current'}});
    assert.equal(await first,'current');
    const active = client.enqueue(async() => clone,{},bbox,options);
    const queued = client.enqueue(async() => clone,{},bbox,options);
    const rejected = Promise.all([assert.rejects(active,/cancelled/),assert.rejects(queued,/cancelled/)]);
    await new Promise(resolve => setImmediate(resolve));
    client.release(); await rejected;
    assert.ok(current.terminated);

    const scripts = file => [...fs.readFileSync(file,'utf8').matchAll(/<script src="\.\/([^"?]+)\?v=([^"]+)" defer>/g)].map(match => match[1]+'?v='+match[2]);
    assert.deepEqual(scripts('index.html'),scripts('en/index.html'),'Japanese/English script paths and versions agree');
    for (const script of scripts('index.html')) assert.ok(fs.existsSync(script.split('?')[0]),script);
    for (const directory of ['lib/domain','lib/geometry','lib/osm']) for (const file of fs.readdirSync(directory)) {
        const source = fs.readFileSync(path.join(directory,file),'utf8');
        assert.doesNotMatch(source,/\b(?:document|window|Conf|Layers|LayerCont|SVGCont|maplibregl|MapEngine)\b/,directory+'/'+file+' must accept explicit inputs');
    }
    for (const directory of ['lib/application','lib/ui','lib/export']) for (const file of fs.readdirSync(directory))
        assert.doesNotMatch(fs.readFileSync(path.join(directory,file),'utf8'),/\bmaplibregl\b|\.gl\b/,directory+'/'+file+' must use the map view API');
    console.log('PASS isolated shared computation, data-only layer edits/snapshots, DOM-free actual Worker parity, stale/cancelled jobs and bilingual script paths');
})().catch(error => { console.error(error); process.exitCode=1; });
