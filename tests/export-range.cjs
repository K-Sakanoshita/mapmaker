const readSource = require('./helpers/lib-source.cjs').read;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
    let covered = false;
    const rect = { x1: 0, y1: 0, x2: 1920, y2: 966, width: 1920, height: 966 };
    const button = { disabled: false };
    const box = vm.createContext({ console: { log() {}, error: console.error },
        Worker: require('./helpers/svg-worker.cjs'), URL, setTimeout, clearTimeout,
        document: { baseURI: 'http://localhost/index.html',
            getElementById: id => id==='processingDialog'?{classList:{toggle:(_name,hidden)=>{covered=!hidden;}},setAttribute(){}}:id==='processingDialogMessage'?{setAttribute(){}}:null,
            querySelectorAll: () => [button], createElementNS: () => ({ appendChild() {}, setAttribute() {} })
        },
        glot: { get: key => key }, requestAnimationFrame: fn => fn(),
        map: { getContainer: () => ({inert:false}), getSize: () => ({ x: 1920, y: 966 }), containerPointToLatLng: ([x, y]) => ({ lng: 135 + x / 100000, lat: 35 - y / 100000 }) },
        Conf: { default: { Paper: { dpi: 300 }, credit: { text: '', size: 8, font: 'sans-serif' } }, style: { color: {} } },
        Layers: { background: { opacity: 1, color: '#ffffff' } }, LayerCont: { palette: 'color', styles: [] },
        Birdseye: { exportOptions: () => ({}) },
        window: { alert: () => assert.fail('export should succeed') }
    });
    for (const file of ['@feature-core', '@svg-document', 'mapmaker.js']) vm.runInContext(readSource(file, 'utf8'), box);
    box.rect = rect;
    box.getRect = () => {
        assert.equal(covered, false, 'capture must precede the processing overlay');
        return rect;
    };
    vm.runInContext(`
        const SVGCont = new SVGControl();
        const actualExportRect = SVGCont._getExportRectPx.bind(SVGCont);
        SVGCont._getA4MaskRectPx = () => null;
        SVGCont._getExportRectPx = mode => { getRect(); return actualExportRect(mode); };
        SVGCont._svgTextToDom = text => ({ text, appendChild() {} });
        SVGCont._svgDomToText = svg => svg.text;
        SVGCont.textWrite = () => {};
        SVGCont.makeSVG = (_svg, done) => done();
        SVGCont.applyRoughEffect = async svg => svg;
        globalThis.results = [];
        SVGCont.save = async params => { results.push({ params, ...await SVGCont.buildSVG(params) }); };
    `, box);
    await vm.runInContext("mapMaker.save('png')", box);
    await vm.runInContext("mapMaker.save('svg')", box);
    for (const result of box.results) {
        assert.deepEqual(JSON.parse(JSON.stringify(result.params.exportRect)),rect);
        assert.equal(result.canvas_width, 1920 * 4);
        assert.equal(result.canvas_height, 966 * 4);
        const viewBox = result.outText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
        assert.ok(Math.abs(Number(viewBox[2]) / Number(viewBox[1]) - 966 / 1920) < 1e-12, 'page aspect ratio includes the map behind the menu');
    }
    assert.equal(covered, false);
    assert.equal(button.disabled, false);
    vm.runInContext("mapMaker.selectMode = 'A4_landscape'", box);
    await vm.runInContext("mapMaker.save('svg')", box);
    assert.match(box.results[2].outText, /viewBox="0 0 297 210"/, 'paper export keeps selected paper dimensions');
    assert.equal(box.results[2].canvas_width, Math.round(300 * 297 / 25.4));
    console.log('PASS PNG/SVG export the entire map behind menus, capture before overlay, and preserve paper dimensions');
})().catch(error => { console.error(error); process.exitCode = 1; });
