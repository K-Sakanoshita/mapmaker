const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// VM sandbox for MapMaker.searchPoi(): mocked geocoder, fetch, turf, map and modal.
function makeContext(opts = {}) {
    const state = { modals: [], closed: 0, moves: [], endpoints: [] };
    const box = vm.createContext({
        console: { log() {}, error() {} },
        glot: { get: k => k === 'addressnotfound_title' ? 'notfound_title' : k === 'addressnotfound_body' ? 'notfound_body' : k },
        winCont: {
            modal_open(modal) { state.modals.push(modal); return Promise.resolve(); },
            closeModal() { state.closed++; return Promise.resolve(); }
        },
        map: {
            setZoom(zoom) { state.moves.push({ zoom }); },
            panTo(ll) { state.moves.push({ ll }); }
        },
        Conf: {
            default: { SearchZoom: 15 },
            prefecture: { '北海道': { lat: 43, lng: 141 }, '岩手県': { lat: 39.7, lng: 141.15 } },
            allPrefecture: {
                '011002': { prefecture: '北海道', city: '札幌市' },
                '011011': { prefecture: '北海道', city: '札幌市中央区' },
                '011013': { prefecture: '北海道', city: '日高町' },
                '032016': { prefecture: '岩手県', city: '盛岡市' }
            }
        },
        turf: {
            centroid(data) {
                const ring = data && data.features && data.features[0] && data.features[0].geometry && data.features[0].geometry.coordinates[0];
                if (!Array.isArray(ring) || ring.length < 3) throw new Error('invalid GeoJSON for centroid');
                let lng = 0, lat = 0;
                ring.slice(0,-1).forEach(c => { lng += c[0]; lat += c[1]; });
                return { geometry: { coordinates: [lng / (ring.length-1), lat / (ring.length-1)] } };
            }
        },
        getLatLng: opts.getLatLng || (() => {}),
        fetch: opts.fetch || (() => Promise.reject(new Error('fetch not configured')))
    });
    vm.runInContext(fs.readFileSync('mapmaker.js', 'utf8'), box);
    return { box, state };
}

const polygon = (lng, lat) => ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[lng - 0.1, lat - 0.1], [lng + 0.1, lat - 0.1], [lng + 0.1, lat + 0.1], [lng - 0.1, lat + 0.1], [lng - 0.1, lat - 0.1]]] } }]
});
const okJson = (data, status = 200) => ({ ok: true, status, json: () => Promise.resolve(data) });
const tick = () => new Promise(r => setTimeout(r, 0));
const notfound = modals => modals.some(m => m.title === 'notfound_title' && m.message === 'notfound_body' && m.mode === 'close');

(async () => {
    // Empty keyword is ignored.
    {
        const { box, state } = makeContext({ getLatLng: () => assert.fail('getLatLng must not be called for an empty keyword') });
        vm.runInContext("mapMaker.searchPoi('')", box);
        await tick();
        assert.deepEqual(state, { modals: [], closed: 0, moves: [], endpoints: [] });
    }

    // Geocoder failure and level 0 (not found) reuse the existing error modal.
    for (const [name, getLatLng] of [
        ['geocoder error callback', (kw, ok, err) => err(new Error('geocoder error'))],
        ['level 0 not found', (kw, ok) => ok({ level: 0 })]
    ]) {
        const { box, state } = makeContext({ getLatLng });
        vm.runInContext("mapMaker.searchPoi('存在しない住所')", box);
        await tick();
        assert.equal(notfound(state.modals), true, `${name} must open the existing errorMsg modal`);
        assert.equal(state.moves.length, 0);
    }

    // level 1: prefecture.
    {
        const { box, state } = makeContext({ getLatLng: (kw, ok) => ok({ level: 1, pref: '北海道' }) });
        vm.runInContext("mapMaker.searchPoi('北海道')", box);
        await tick();
        assert.deepEqual(state.moves, [{ zoom: 9 }, { ll: { lat: 43, lng: 141 } }]);
        assert.equal(state.modals.length, 0);
    }
    {   // Unknown prefecture key must not throw.
        const { box, state } = makeContext({ getLatLng: (kw, ok) => ok({ level: 1, pref: 'unknown' }) });
        vm.runInContext("mapMaker.searchPoi('unknown')", box);
        await tick();
        assert.equal(notfound(state.modals), true);
        assert.equal(state.moves.length, 0);
    }

    // level 2: municipality fetched from japanese-admins GeoJSON.
    {
        const { box, state } = makeContext({
            getLatLng: (kw, ok) => ok({ level: 2, pref: '北海道', city: '札幌市' }),
            fetch: ep => { state.endpoints.push(ep); return Promise.resolve(okJson(polygon(141.35, 43.06))); }
        });
        vm.runInContext("mapMaker.searchPoi('札幌市')", box);
        await tick();
        assert.deepEqual(state.endpoints, ['https://geolonia.github.io/japanese-admins/01/01100.json']);
        assert.equal(state.moves[0].zoom,12);assert.ok(Math.abs(state.moves[1].ll[0]-43.06)<1e-9);assert.ok(Math.abs(state.moves[1].ll[1]-141.35)<1e-9);
        assert.equal(state.modals.length, 0);
    }
    {   // 郡名 variation: the geocoder omits the 郡 prefix.
        const { box, state } = makeContext({
            getLatLng: (kw, ok) => ok({ level: 2, pref: '北海道', city: '上郡日高町' }),
            fetch: ep => { state.endpoints.push(ep); return Promise.resolve(okJson(polygon(140.9, 42.5))); }
        });
        vm.runInContext("mapMaker.searchPoi('上郡日高町')", box);
        await tick();
        assert.deepEqual(state.endpoints, ['https://geolonia.github.io/japanese-admins/01/01101.json']);
        assert.equal(state.moves[0].zoom,12);assert.ok(Math.abs(state.moves[1].ll[0]-42.5)<1e-9);assert.ok(Math.abs(state.moves[1].ll[1]-140.9)<1e-9);
    }
    {   // 政令指定都市 ward: the full "札幌市中央区" name matches a code directly.
        const { box, state } = makeContext({
            getLatLng: (kw, ok) => ok({ level: 2, pref: '北海道', city: '札幌市中央区' }),
            fetch: ep => { state.endpoints.push(ep); return Promise.resolve(okJson(polygon(141.36, 43.07))); }
        });
        vm.runInContext("mapMaker.searchPoi('札幌市中央区')", box);
        await tick();
        assert.deepEqual(state.endpoints, ['https://geolonia.github.io/japanese-admins/01/01101.json']);
        assert.equal(state.moves[0].zoom,12);assert.ok(Math.abs(state.moves[1].ll[0]-43.07)<1e-9);assert.ok(Math.abs(state.moves[1].ll[1]-141.36)<1e-9);
    }
    {   // Municipality code not present in Conf.allPrefecture: no exception, errorMsg.
        const { box, state } = makeContext({
            getLatLng: (kw, ok) => ok({ level: 2, pref: '北海道', city: '存在しない町' }),
            fetch: ep => { state.endpoints.push(ep); return Promise.resolve(okJson(polygon(1, 1))); }
        });
        vm.runInContext("mapMaker.searchPoi('存在しない町')", box);
        await tick();
        assert.equal(notfound(state.modals), true, 'unknown municipality key must show the existing errorMsg');
        assert.equal(state.moves.length, 0);
        assert.equal(state.endpoints.length, 0, 'no GeoJSON must be fetched for an unknown municipality');
    }

    for (const code of ['invalid', '', '1234']) {
        const { box, state } = makeContext({ getLatLng: (kw, ok) => ok({ level: 2, pref: '北海道', city: '不正市' }) });
        box.Conf.allPrefecture = { [code]: { prefecture: '北海道', city: '不正市' } };
        vm.runInContext("mapMaker.searchPoi('不正市')", box);
        await tick();
        assert.equal(notfound(state.modals), true);
        assert.equal(state.moves.length, 0);
    }
    // level 2 fetch failures all fall back to the error modal without throwing.
    const failures = [
        ['404', () => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('no body')) })],
        ['network error', () => Promise.reject(new TypeError('fetch failed'))],
        ['invalid JSON', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) })],
        ['invalid GeoJSON', () => Promise.resolve(okJson({ type: 'FeatureCollection', features: [] }))]
    ];
    for (const [name, fetchImpl] of failures) {
        const { box, state } = makeContext({
            getLatLng: (kw, ok) => ok({ level: 2, pref: '岩手県', city: '盛岡市' }),
            fetch: fetchImpl
        });
        vm.runInContext("mapMaker.searchPoi('盛岡市')", box);
        await tick();
        assert.equal(notfound(state.modals), true, `${name} must open the existing errorMsg modal`);
        assert.equal(state.moves.length, 0);
        assert.equal(state.closed, 0, 'the error modal close callback must not fire by itself');
    }

    // level 3: town/latlng pans at the default search zoom.
    {
        const { box, state } = makeContext({ getLatLng: (kw, ok) => ok({ level: 3, lat: 35.2, lng: 136.9 }) });
        vm.runInContext("mapMaker.searchPoi('某町某町')", box);
        await tick();
        assert.deepEqual(state.moves, [{ zoom: 15 }, { ll: { level: 3, lat: 35.2, lng: 136.9 } }]);
        assert.equal(state.modals.length, 0);
    }

    console.log('PASS address search: prefecture/municipality/ordinance-city/town success, gun-name variation, and not-found/invalid-key/HTTP/JSON/centroid failures via errorMsg');
})().catch(e => { console.error(e); process.exitCode = 1; });
