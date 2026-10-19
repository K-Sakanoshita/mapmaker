// Browser map controls, using the engine-neutral view API.
class MapControl {
    init() {
        map = MapEngine.map('mapid', { center: Conf.default.DefaultCenter, zoom: Conf.default.DefaultZoom });
        this.baseKey = Conf.tile_select.default;
        map.setBasemap(this.baseKey);
    }
    start() {
        map.setNavigationEnabled(true);
        map.setBasemap(this.baseKey);
        map.threeD = false;
        map.schedule();
        Birdseye.sync();
    }
    stop() {
        map.setNavigationEnabled(false);
        map.setBasemap(map.vectorBasemapKey);
    }
    addControl(position, element) { map.addUIControl(position, element); }
    controlAdd(position, id, html, css) {
        const element = document.createElement('div'); element.id = id; element.innerHTML = html; element.className = css;
        this.addControl(position.replace('bottomleft', 'bottom-left').replace('bottomright', 'bottom-right'), element);
    }
}
const MapCont = new MapControl();

// Geographic Control
class GeoControl {
    // 二重引用符で囲われたCSVをConf.osm[key]のcolumns、add_tagをもとにGeoJSONへ変換
    csv2geojson(csv, key) { return osmCSVToGeoJSON(csv, {...Conf.osm[key], key}); }

    bboxclip(cords, strict) { return CoordinateGeometry.bboxclip(cords, GeoCont[strict ? "get_LL" : "get_LLL"]()); }

    multi2flat(...args) { return CoordinateGeometry.multi2flat(...args); }

    // flat cordsの平均値(Poiの座標計算用)
    // 入力 cords は基本 [ [ [lng,lat], [lng,lat], ... ] ] の形（flat化後）を想定
    // 返り値は常に [lng, lat]
    flat2single(...args) { return CoordinateGeometry.flat2single(...args); }

    get_L() {
        let LL = { "NW": map.getBounds().getNorthWest(), "SE": map.getBounds().getSouthEast(), "SW": [], "NE": [] };
        LL.SW.lng = LL.NW.lng;
        LL.SW.lat = LL.SE.lat;
        LL.NE.lng = LL.SE.lng;
        LL.NE.lat = LL.NW.lat;
        return LL
    }

    get_LL() {
        const b = map.getBounds();
        const NW0 = b.getNorthWest();
        const SE0 = b.getSouthEast();

        // 画面幅・高さに対する割合で余白（例：0.003%）
        const dLng = (SE0.lng - NW0.lng) * 0.00003;
        const dLat = (NW0.lat - SE0.lat) * 0.00003;

        const LL = {
            NW: { lat: NW0.lat + dLat, lng: NW0.lng - dLng },
            SE: { lat: SE0.lat - dLat, lng: SE0.lng + dLng },
            SW: {}, NE: {}
        };
        LL.SW = { lat: LL.SE.lat, lng: LL.NW.lng };
        LL.NE = { lat: LL.NW.lat, lng: LL.SE.lng };
        return LL;
    }

    get_LLL() {
        const b = map.getBounds();
        const NW0 = b.getNorthWest();
        const SE0 = b.getSouthEast();

        const dLng = (SE0.lng - NW0.lng) * 0.0003;
        const dLat = (NW0.lat - SE0.lat) * 0.0008;

        const LL = {
            NW: { lat: NW0.lat + dLat, lng: NW0.lng - dLng },
            SE: { lat: SE0.lat - dLat, lng: SE0.lng + dLng },
            SW: {}, NE: {}
        };
        LL.SW = { lat: LL.SE.lat, lng: LL.NW.lng };
        LL.NE = { lat: LL.NW.lat, lng: LL.SE.lng };
        return LL;
    }

};

// Browser bounds/debug adapters stay outside the coastline geometry algorithm.
class CoastlineController {
    constructor() { this.debug = {}; }
    merge(features, mode = 'LL') {
        const bounds = mode === 'LLL' ? GeoCont.get_LLL() : GeoCont.get_LL();
        window.GeoCoastlineDebug = this.debug;
        return new GeoCoastline(turf).merge(features, bounds, this.debug);
    }
}
