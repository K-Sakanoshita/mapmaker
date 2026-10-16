const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
(async () => {
    const calls = [];
    const box = vm.createContext({ console, URLSearchParams, location: { search: '?editor=maplibre' },
        map: { editorRenderer: { active: true } },
        LayerCont: { updateLayerVisibility: (key, visible) => calls.push(['visibility', key, visible]) },
        winCont: { modal_open: async () => calls.push(['open']), closeModal: async () => calls.push(['close']) },
        glot: { get: () => 'processing' }, requestAnimationFrame: fn => fn(), setTimeout: fn => fn()
    });
    vm.runInContext(fs.readFileSync('mapmaker.js','utf8'), box);
    vm.runInContext('mapMaker.rough_options = () => ({ enabled: false })', box);
    await vm.runInContext("mapMaker.toggleLayerVisibility('building', false)", box);
    await vm.runInContext("mapMaker.toggleLayerVisibility('building', true)", box);
    assert.deepEqual(calls, [['visibility','building',false],['visibility','building',true]], 'native category toggles never open processing modal');
    calls.length = 0;
    box.location.search = '';
    await vm.runInContext("mapMaker.toggleLayerVisibility('building', false)", box);
    assert.deepEqual(calls, [['visibility','building',false]], 'normal URL uses the same native visibility update');
    calls.length = 0;
    box.location.search = '?editor=maplibre';
    vm.runInContext('mapMaker.rough_options = () => ({ enabled: true })', box);
    await vm.runInContext("mapMaker.toggleLayerVisibility('building', true)", box);
    assert.deepEqual(calls, [['visibility','building',true]], 'rough export settings do not change screen rendering');
    console.log('PASS normal URL, old query URL and rough export settings all hide/restore without processing modal');
})().catch(error => { console.error(error); process.exitCode = 1; });
