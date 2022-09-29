// Leaflet Control

// Global Variable
//var map;						// leaflet map object

class Leaflet {

    constructor() {
        this.Control = { "locate": "", "maps": "" };    // leaflet object
    };

    init() {

        return new Promise((resolve, reject) => {
            let def = Conf.default;
            let maps = {}, tiles = {};
            Object.keys(Conf.tile).forEach(key => {
                let params = { "attribution": Conf.tile[key].copyright, "maxZoom": def.maxZoom };
                if (Conf.tile[key].maxNativeZoom !== void 0) params.maxNativeZoom = Conf.tile[key].maxNativeZoom;
                if (Conf.tile[key].filter !== void 0) {             // color filter
                    params.filter = Conf.tile[key].filter;
                    tiles[key] = L.tileLayer.colorFilter(Conf.tile[key].url, params);
                } else if (Conf.tile[key].style !== void 0) {       // vector tile
                    params.style = Conf.tile[key].style;
                    params.accessToken = '';
                    tiles[key] = L.mapboxGL(params);
                } else {                                            // normal tile
                    tiles[key] = L.tileLayer(Conf.tile[key].url, params);
                }
                maps[Conf.tile[key].name] = tiles[key];
            });
            let deftile = navigator.userAgent.indexOf("FB") > 0 ? tiles[Conf.tile_select.Facebook_Builtin] : tiles[Conf.tile_select.default]; // facebook対策(内蔵ブラウザだとMaptilerが出ない)
            let params = {
                "maxZoom": def.maxZoom, "minZoom": (basic.isSmartPhone() ? def.phone_minZoom : def.pc_minZoom),
                doubleClickZoom: false, zoomSnap: def.zoomSnap, zoomDelta: def.zoomSnap, layers: [deftile],
                maxBounds: def.maxbounds
            };
            map = L.map('mapid', params);
            new L.Hash(map);
            this.Control["maps"] = L.control.layers(maps, null, { position: 'bottomright' }).addTo(map);
            map.zoomControl.setPosition("bottomright");
            map.on('load', resolve());
            let lhash = L.Hash.parseHash(location.hash);
            if (def.keep_view || lhash == false) {
                map.setView(def.default_view, def.initZoom);   // setView is the last
            } else {
                map.setView(lhash.center, lhash.zoom);
            }
        });

    };

    enable(flag) {
        if (flag) {
            map.scrollWheelZoom.enable();
            map.dragging.enable();
        } else {
            map.scrollWheelZoom.disable();
            map.dragging.disable();
        }
    };

    start() {
        ["dragging", "touchZoom", "touchZoom"].forEach(key => map[key].enable());
        this.Control["maps"].addTo(map);
        this.Control["locate"].addTo(map);
        map.zoomControl.addTo(map);
        if (map.tap) map.tap.enable();
        document.getElementById('mapid').style.cursor = 'grab';
    };

    stop() {
        ["dragging", "touchZoom", "touchZoom"].forEach(key => map[key].disable());
        this.Control["maps"].remove(map);
        this.Control["locate"].remove(map);
        map.zoomControl.remove(map);
        if (map.tap) map.tap.disable();
        document.getElementById('mapid').style.cursor = 'default';
    };

    zoomSet(zoomlv) {
        map.flyTo(map.getCenter(), zoomlv, { animate: true, duration: 0.5 });
    };

    controlAdd(position, domid, html, css) {     // add leaflet control
        let dom = L.control({ "position": position, "bubblingMouseEvents": false });
        dom.onAdd = function () {
            this.ele = L.DomUtil.create('div');
            this.ele.id = domid;
            this.ele.innerHTML = html;
            this.ele.className = css;
            return this.ele;
        };
        dom.addTo(map);
    };

    locateAdd() {                               // add location
        this.Control["locate"] = L.control.locate({
            position: 'bottomright', strings: { title: glot.get("location") },
            setView: "once", locateOptions: { maxZoom: 16 }
        }).addTo(map);
    };

    geojsonAdd(data) {
        L.geoJSON(data, {
            style: function (feature) {
                return {
                    color: feature.properties.stroke,
                    weight: feature.properties["stroke-width"]
                };
            }
        }).addTo(map);
    }

};

// GeoJson Control
var GeoCont = (function () {

    return {

        // csv(「”」で囲われたカンマ区切りテキスト)をConf.markerのcolumns、tagsをもとにgeojsonへ変換
        csv2geojson: (csv, key) => {
            let tag_key = [], columns = Conf.osm[key].columns;
            let texts = csv.split(/\r\n|\r|\n/).filter(val => val !== "");
            cols = texts[0].split('","').map(col => col.replace(/^"|"$|/g, ''));
            for (let i = 0; i < cols.length; i++) {
                if (columns[cols[i]] !== undefined) tag_key[i] = columns[cols[i]];
            };
            texts.shift();
            let geojsons = texts.map((text, line) => {
                cols = text.split('","').map(col => col.replace(/^"|"$/g, ''));
                let geojson = { "type": "Feature", "geometry": { "type": "Point", "coordinates": [] }, "properties": {} };
                let tag_val = {};
                for (let i = 0; i < cols.length; i++) {
                    if (tag_key[i] !== undefined) {
                        tag_val[tag_key[i]] = tag_val[tag_key[i]] == undefined ? cols[i] : tag_val[tag_key[i]] + cols[i];
                    };
                };
                geojson.geometry.coordinates = [tag_val._lng, tag_val._lat];
                geojson.id = `${key}/${line}`;
                Object.keys(tag_val).forEach((idx) => {
                    if (idx.slice(0, 1) !== "_") geojson.properties[idx] = tag_val[idx];
                });
                Object.keys(Conf.osm[key].add_tag).forEach(tkey => {
                    geojson.properties[tkey] = Conf.osm[key].add_tag[tkey];
                });
                return geojson;
            });
            return geojsons;
        },

        // 2線の交差チェック 線分ab(x,y)とcd(x,y) true:交差 / false:非交差
        judgeIentersected: (a, b, c, d) => {
            let ta = (c[0] - d[0]) * (a[1] - c[1]) + (c[1] - d[1]) * (c[0] - a[0]);
            let tb = (c[0] - d[0]) * (b[1] - c[1]) + (c[1] - d[1]) * (c[0] - b[0]);
            let tc = (a[0] - b[0]) * (c[1] - a[1]) + (a[1] - b[1]) * (a[0] - c[0]);
            let td = (a[0] - b[0]) * (d[1] - a[1]) + (a[1] - b[1]) * (a[0] - d[0]);
            return tc * td <= 0 && ta * tb <= 0; // 端点を含む
        },

        bboxclip: (cords, strict) => { // geojsonは[経度lng,緯度lat]
            let LL = GeoCont[strict ? "get_LL" : "get_LLL"]();
            new_cords = cords.filter((cord) => {
                if (cord[0] < (LL.NW.lng)) return false;
                if (cord[0] > (LL.SE.lng)) return false;
                if (cord[1] < (LL.SE.lat)) return false;
                if (cord[1] > (LL.NW.lat)) return false;
                return true;
            });
            return new_cords;
        },

        multi2flat: (cords, type) => {     // MultiPoylgon MultiString -> Polygon(broken) String
            let flats;
            switch (type) {
                case "Point":
                    flats = cords;
                    break;
                case "LineString":
                    flats = [cords];
                    break;
                case "MultiPolygon":
                    flats = cords.flat();
                    break;
                default:
                    flats = [cords.flat()];
                    break;
            };
            return flats;
        },

        flat2single: (cords, type) => {  // flat cordsの平均値(Poiの座標計算用)
            let cord, lat = 0, lng = 0, counts;
            switch (type) {
                case "Point":
                    cord = [cords[0], cords[1]];
                    break;
                default:
                    counts = cords[0].length;
                    for (let idx in cords[0]) {
                        lat += cords[0][idx][0];
                        lng += cords[0][idx][1];
                    };
                    cord = [lat / counts, lng / counts];
                    break;
            };
            return cord;
        },

        // 指定した方位の衝突するcords内のidxを返す
        get_maxll: (st_cord, cords, exc_idx, orient) => {
            let LLL = GeoCont.get_LLL(), idx, ed_cord = [], found = -1;
            if (orient == "N") ed_cord = [st_cord[0], LLL.NW.lat]; // [経度lng,緯度lat]
            if (orient == "S") ed_cord = [st_cord[0], LLL.SE.lat];
            if (orient == "W") ed_cord = [LLL.NW.lng, st_cord[1]];
            if (orient == "E") ed_cord = [LLL.SE.lng, st_cord[1]];

            for (idx = 0; idx < cords.length; idx++) {  //
                if (cords[idx] !== undefined && exc_idx !== idx) {  //
                    found = cords[idx].findIndex((ck_cord, ck_id) => {
                        if (ck_id < cords[idx].length - 1) return GeoCont.judgeIentersected(st_cord, ed_cord, ck_cord, cords[idx][ck_id + 1]);
                        return false;
                    });
                };
                if (found > -1) break;
            };
            return (found > -1) ? idx : false;
        },

        check_inner: (latlng, LL) => {          // latlngがLL(get_LL)範囲内であれば true
            return (LL.NW.lat > latlng[0] && LL.SE.lat < latlng[0] && LL.NW.lng < latlng[1] && LL.SE.lng > latlng[1]);
        },

        get_LL: () => {			// LatLngエリアの設定 [経度lng,緯度lat]
            let LL = { "NW": map.getBounds().getNorthWest(), "SE": map.getBounds().getSouthEast() };
            LL.NW.lng = LL.NW.lng * 0.99998;
            LL.SE.lng = LL.SE.lng * 1.00002;
            LL.SE.lat = LL.SE.lat * 0.99998;
            LL.NW.lat = LL.NW.lat * 1.00002;
            return LL;
        },

        get_LLL: () => {		// 拡大LatLngエリアの設定 [経度lng,緯度lat]
            let LL = { "NW": map.getBounds().getNorthWest(), "SE": map.getBounds().getSouthEast() };
            LL.NW.lng = LL.NW.lng * 0.9998;
            LL.SE.lng = LL.SE.lng * 1.0003;
            LL.SE.lat = LL.SE.lat * 0.9992;
            LL.NW.lat = LL.NW.lat * 1.0008;
            return LL;
        },

        ll2tile: (ll, zoom) => {
            const maxLat = 85.05112878;     // 最大緯度
            zoom = parseInt(zoom);
            lat = parseFloat(ll.lat);       // 緯度
            lng = parseFloat(ll.lng);       // 経度
            let pixelX = parseInt(Math.pow(2, zoom + 7) * (lng / 180 + 1));
            let tileX = parseInt(pixelX / 256);
            let pixelY = parseInt((Math.pow(2, zoom + 7) / Math.PI) * ((-1 * Math.atanh(Math.sin((Math.PI / 180) * lat))) + Math.atanh(Math.sin((Math.PI / 180) * maxLat))));
            let tileY = parseInt(pixelY / 256);
            return { tileX, tileY };
        },

        tile2ll: (tt, zoom, direction) => {
            const maxLat = 85.05112878;     // 最大緯度
            zoom = parseInt(zoom);
            if (direction == "SE") {
                tt.tileX++;
                tt.tileY++;
            }
            let pixelX = parseInt(tt.tileX * 256); // タイル座標X→ピクセル座標Y
            let pixelY = parseInt(tt.tileY * 256); // タイル座標Y→ピクセル座標Y
            let lng = 180 * (pixelX / Math.pow(2, zoom + 7) - 1);
            let lat = (180 / Math.PI) * (Math.asin(Math.tanh((-1 * Math.PI / Math.pow(2, zoom + 7) * pixelY) + Math.atanh(Math.sin(Math.PI / 180 * maxLat)))));
            return { lat, lng };
        },

        get_maparea: (mode) => {	// OverPassクエリのエリア指定
            let LL;
            if (mode == "LLL") {
                LL = GeoCont.get_LLL();
            } else {
                LL = GeoCont.get_LL();
            };
            return `(${LL.SE.lat},${LL.NW.lng},${LL.NW.lat},${LL.SE.lng});`;
        },

        // Debug Code
        gcircle: (geojson) => { // view geojson in map
            let features = [], colors = ["#000000", "#800000", "#FF0080", "#008000", "#00FF00", "#000080", "#0000FF", "#800080", "#FF00FF", "#808000", "#FFFF00", "#008080", "#00FFFF", "#800080", "#FF00FF"];
            let timer = Conf.svg.circle.timer;
            if (!Array.isArray(geojson)) {
                if (geojson.features !== undefined) features = geojson.features;
            } else {
                features = geojson;
                if (features[0].geometry == undefined) features = { geometry: { coordinates: geojson } };
            };
            features.forEach((val, idx) => {
                let geo = val.geometry;
                let cords = geo.coordinates.length == 1 && geo.coordinates[0][0].length > 1 ? geo.coordinates[0] : geo.coordinates;
                cords.forEach((latlng) => {
                    Conf.svg.circle.radius = Math.pow(2, 21 - map.getZoom());
                    let style = Conf.svg.circle;
                    let color = idx % colors.length;
                    style.color = colors[color];
                    let circle = L.circle(L.latLng(latlng[1], latlng[0]), style).addTo(map);
                    circle.addTo(map).on('click', e => { popup_icon(e) });
                    // console.log(`feature[${idx}]: [${latlng[1]}, ${latlng[0]}`);
                    setTimeout(() => map.removeLayer(circle), timer);
                    timer += 100;
                });
            });

            function popup_icon(ev) {
                let popcont = JSON.stringify(ev.latlng);
                L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
                ev.target.openPopup();
                return false;
            };
        },

        ccircle: (cords) => {   // view cord in map
            let geojson = {
                features: [{
                    geometry: { coordinates: cords },
                    properties: {},
                    type: "Feature"
                }]
            };
            GeoCont.gcircle(geojson);
        },

        box_write: (NW, SE) => {  // view box
            let bcords = [[NW.lat, NW.lng], [NW.lat, SE.lng], [SE.lat, SE.lng], [SE.lat, NW.lng], [NW.lat, NW.lng]];
            L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);
        },

        bbox_write: () => { // view maparea
            let LL = GeoCont.get_LL();
            let bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
            L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);

            LL = GeoCont.get_LLL();
            bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
            L.polyline(bcords, { color: 'black', weight: 4 }).addTo(map);
        },

        polyline_write: (cords) => {
            let colors = ['red', 'blue', 'green', 'yellow'];
            let count = 0;
            for (cord of cords) {
                let poly = [];
                for (latlng of cord) {
                    poly.push([latlng[1], latlng[0]]);
                }
                L.polyline(poly, { color: colors[count++ % colors.length], weight: 4 }).addTo(map);
            }
        }
    }
})();
