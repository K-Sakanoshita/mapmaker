// OSM layer=* を画面描画とSVG/PNG出力で共通の描画順に変換する。
// osmtogeojson(flatProperties) は通常 properties.layer に格納するが、
// 外部GeoJSONとの互換性のため properties.tags.layer も受け付ける。
function getMapMakerOsmLayer(feature) {
    const raw = feature?.properties?.layer ?? feature?.properties?.tags?.layer;
    if (raw === undefined || raw === null || String(raw).trim() === "") return 0;

    const value = Number(String(raw).trim());
    return Number.isFinite(value) ? value : 0;
}

// 同じOSM layer・カテゴリでは全ウェイのbase（輪郭）を先に、
// overstyle（内線）を後から描き、ウェイ境界に輪郭の継ぎ目を残さない。
function compareMapMakerDrawOrder(a, b) {
    return (a.osmLayer - b.osmLayer)
        || (a.styleOrder - b.styleOrder)
        || (a.passOrder - b.passOrder)
        || (a.featureOrder - b.featureOrder)
        || ((a.serial ?? 0) - (b.serial ?? 0));
}

// Leaflet Control

class LeafletCont {

    constructor() {
        this.Control = { "maps": "" };    // leaflet object
        this.BackupMap = {};
        this.Maps = {};
    }

    init() {
        let def = Conf.default, defMap;
        Object.keys(Conf.tile).forEach(key => {
            let tl = {}, tConf = Conf.tile[key];
            tl = { maxNativeZoom: tConf.maxNativeZoom, maxZoom: 21, attribution: tConf.copyright };
            if (tConf.filter !== undefined) {
                this.Maps[tConf.name] = L.tileLayer.colorFilter(tConf.url, Object.assign(tl, { filter: tConf.filter }));
            } else {
                this.Maps[tConf.name] = L.tileLayer(tConf.url, tl);
            }
            if (Conf.tile_select.default == key) defMap = this.Maps[tConf.name];
        });
        map = L.map('mapid', {
            center: def.DefaultCenter, zoom: def.DefaultZoom, zoomSnap: def.ZoomSnap,
            zoomControl: true, zoomDelta: def.ZoomSnap, layers: [defMap], renderer: L.svg()
        });
        this.Control["maps"] = L.control.layers(this.Maps, null, { position: 'bottomright' }).addTo(map);
        map.zoomControl.setPosition("bottomright");
        new L.Hash(map);
    }

    enable(flag) {
        if (flag) {
            map.scrollWheelZoom.enable();
            map.dragging.enable();
        } else {
            //map.scrollWheelZoom.disable();
            //map.dragging.disable();
        }
    }

    start() {
        ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom"].forEach(key => map[key].enable());
        MapCont.Control["maps"].addTo(map);
        if (Object.keys(MapCont.BackupMap).length !== 0) MapCont.BackupMap.addTo(map);
        map.zoomControl.addTo(map);
        if (map.tap) map.tap.enable();
        document.getElementById('mapid').style.cursor = 'grab';
    }

    stop() {
        ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom"].forEach(key => map[key].disable());
        MapCont.Control["maps"].remove(map);
        Object.keys(MapCont.Maps).forEach(key => {
            if (map.hasLayer(MapCont.Maps[key])) {
                MapCont.BackupMap = MapCont.Maps[key];
                map.removeLayer(MapCont.Maps[key])
            };
        });
        map.zoomControl.remove(map);
        if (map.tap) map.tap.disable();
        document.getElementById('mapid').style.cursor = 'default';
    }

    zoomSet(zoomlv) {
        map.flyTo(map.getCenter(), zoomlv, { animate: true, duration: 0.5 });
    }

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
    }

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
}
const MapCont = new LeafletCont();

// Geographic Control
class GeoControl {
    // csv(「”」で囲われたカンマ区切りテキスト)をConf.markerのcolumns、tagsをもとにgeojsonへ変換
    csv2geojson(csv, key) {
        let tag_key = [], columns = Conf.osm[key].columns;
        let texts = csv.split(/\r\n|\r|\n/).filter(val => val !== "");
        let cols = texts[0].split('","').map(col => col.replace(/^"|"$|/g, ''));
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
            })
            return geojson;
        })
        return geojsons;
    }

    // 2線の交差チェック 線分ab(x,y)とcd(x,y) true:交差 / false:非交差
    judgeIentersected(a, b, c, d) {
        let ta = (c[0] - d[0]) * (a[1] - c[1]) + (c[1] - d[1]) * (c[0] - a[0]);
        let tb = (c[0] - d[0]) * (b[1] - c[1]) + (c[1] - d[1]) * (c[0] - b[0]);
        let tc = (a[0] - b[0]) * (c[1] - a[1]) + (a[1] - b[1]) * (a[0] - c[0]);
        let td = (a[0] - b[0]) * (d[1] - a[1]) + (a[1] - b[1]) * (a[0] - d[0]);
        return tc * td <= 0 && ta * tb <= 0; // 端点を含む
    }

    bboxclip(cords, strict) { // geojsonは[経度lng,緯度lat]
        let LL = GeoCont[strict ? "get_LL" : "get_LLL"]();
        let new_cords = cords.filter((cord) => {
            return !((cord[0] < (LL.NW.lng)) || (cord[0] > (LL.SE.lng)) || (cord[1] < (LL.SE.lat)) || (cord[1] > (LL.NW.lat)))
        })
        return new_cords;
    }

    multi2flat(cords, type) {     // MultiPoylgon MultiString -> Polygon(broken) String
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
        }
        return flats;
    }

    // flat cordsの平均値(Poiの座標計算用)
    // 入力 cords は基本 [ [ [lng,lat], [lng,lat], ... ] ] の形（flat化後）を想定
    // 返り値は常に [lng, lat]
    flat2single(cords, type) {
        // type: "Point" | "LineString" | "Polygon" | "MultiPolygon" などを想定
        // cords は multi2flat() 後の形式を想定しているため、
        // Point以外は cords[0] が「座標配列」になっているケースが多い
        if (type === "Point") {
            // Point は [lng, lat]
            return [cords[0], cords[1]];
        }

        // Point以外： cords[0] が [ [lng,lat], [lng,lat], ... ] を想定
        const ring = cords[0];
        if (!Array.isArray(ring) || ring.length === 0) {
            // 異常系：とりあえず [0,0]
            return [0, 0];
        }

        let sumLng = 0;
        let sumLat = 0;
        const n = ring.length;

        for (let i = 0; i < n; i++) {
            sumLng += Number(ring[i][0]);
            sumLat += Number(ring[i][1]);
        }

        return [sumLng / n, sumLat / n];
    }

    // 指定した方位の衝突するcords内のidxを返す
    get_maxll(st_cord, cords, exc_idx, orient) {
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
        }
        return (found > -1) ? idx : false;
    }

    check_inner(latlng, LL) {          // latlngがLL(get_LL)範囲内であれば true
        return (LL.NW.lat > latlng[0] && LL.SE.lat < latlng[0] && LL.NW.lng < latlng[1] && LL.SE.lng > latlng[1]);
    }

    get_L() {			                // 
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

    ll2tile(ll, zoom) {
        const maxLat = 85.05112878;
        zoom = parseInt(zoom, 10);
        const lat = parseFloat(ll.lat);
        const lng = parseFloat(ll.lng);
        const pixelX = Math.pow(2, zoom + 7) * (lng / 180 + 1);
        const tileX = Math.floor(pixelX / 256);
        const pixelY = (Math.pow(2, zoom + 7) / Math.PI) *
            ((-1 * Math.atanh(Math.sin((Math.PI / 180) * lat))) +
                Math.atanh(Math.sin((Math.PI / 180) * maxLat)));
        const tileY = Math.floor(pixelY / 256);
        return { tileX, tileY };
    }


    tile2ll(tt, zoom, direction) {
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
    }

    get_maparea(mode) {	// OverPassクエリのエリア指定
        let LL;
        if (mode == "LLL") {
            LL = GeoCont.get_LLL();
        } else {
            LL = GeoCont.get_LL();
        }
        return `(${LL.SE.lat},${LL.NW.lng},${LL.NW.lat},${LL.SE.lng});`;
    }

    // Debug Code
    gcircle(geojson) { // view geojson in map
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
            })
        })

        function popup_icon(ev) {
            let popcont = JSON.stringify(ev.latlng);
            L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
            ev.target.openPopup();
            return false;
        }
    }

    ccircle(cords) {   // view cord in map
        let geojson = {
            features: [{
                geometry: { coordinates: cords },
                properties: {},
                type: "Feature"
            }]
        }
        GeoCont.gcircle(geojson);
    }

    box_write(NW, SE) {  // view box
        let bcords = [[NW.lat, NW.lng], [NW.lat, SE.lng], [SE.lat, SE.lng], [SE.lat, NW.lng], [NW.lat, NW.lng]];
        L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);
    }

    writeLL(LL) { // view maparea
        let bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
        L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);
    }

    polyline_write(cords) {
        let colors = ['red', 'blue', 'green', 'yellow'];
        let count = 0;
        for (let cord of cords) {
            let poly = [];
            for (let latlng of cord) {
                poly.push([latlng[1], latlng[0]]);
            }
            L.polyline(poly, { color: colors[count++ % colors.length], weight: 4 }).addTo(map);
        }
    }
};

/**
 * LayerControl / Layers / Conf / SVGCont に合わせた
 * 「GeoJSON直 → SVG」出力クラス
 *
 * 目的:
 * - LeafletのSVGをcloneしない（ブラウザ倍率・CSS transform・簡略化の影響を回避）
 * - Layers[key].geojson（Feature/Geometry混在でも可）をそのままSVG化
 * - Conf.style[palette][key] / SVGCont.svg_style(key, overstyle) を利用して見た目を揃える
 *
 * 入力前提（あなたの layerlib.js の構造）:
 * - Layers[key].geojson は配列（各要素が Feature or Geometry）
 * - Conf.style[palette][key].type は "area" など
 * - SVGCont.svg_style(key, false/true) が {color, fillColor, weight, dashArray, lineCap, lineJoin...} を返す
 *
 * 参照: layerlib.js :contentReference[oaicite:0]{index=0}
 */
class PrintSVGExporter {
    constructor(opts = {}) {
        this.R = 6378137;

        this.paperPresets = {
            "": null, // 画面サイズ等で使う場合は呼び出し側で紙サイズを渡す
            A4: { widthMm: 210, heightMm: 297 },
            A4_landscape: { widthMm: 297, heightMm: 210 },
            A3: { widthMm: 297, heightMm: 420 },
            A3_landscape: { widthMm: 420, heightMm: 297 },
        };

        this.opts = {
            // 用紙
            fitMode: "contain",
            paper: "A4",
            marginMm: { top: 10, right: 10, bottom: 10, left: 10 },

            // 背景（Layers.background.color を使う等、呼び出し側で指定）
            background: null, // 例: "#ffffff"
            backgroundOpacity: 1,

            // 線幅の扱い
            // Leafletのweight(px)をmmに換算する係数（要調整）
            // 例: 1px相当を0.15mmにする、等
            pxToMm: 0.15,
            minStrokeMm: 0.10,

            // SVG座標（mm）への丸め（文字列長削減。形状簡略化ではない）
            coordDecimals: 3,

            // 穴あきポリゴン
            fillRule: "evenodd",

            // Point描画（Leaflet側で turf.circle していたが、印刷はSVG circle推奨）
            pointAs: "circle", // "circle" or "polygon"

            // Pointの半径。基本は現地距離(m)で指定し、SVG出力時にmmへ変換する。
            // pointRadiusMm を指定した場合だけ、従来どおりSVG上の固定mmとして扱う。
            pointRadiusM: 1.8,
            pointRadiusMm: null,
            pointSteps: 48, // polygon時

            // SVG root
            shapeRendering: "geometricPrecision",

            // レイヤの表示/非表示（opacity==0 をスキップするか）
            skipHiddenLayers: true,

            ...opts
        };

    }

    setOptions(patch = {}) {
        this.opts = { ...this.opts, ...patch };
    }

    /**
     * Leafletの bounds から bboxLonLat を作る（任意ヘルパ）
     * @param {L.LatLngBounds} bounds
     * @returns {[number,number,number,number]}
     */
    static boundsToBBoxLonLat(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return [sw.lng, sw.lat, ne.lng, ne.lat];
    }

    /**
     * Layers/Conf/SVGCont から全レイヤをSVG化
     * @param {[number,number,number,number]} bboxLonLat [minLon,minLat,maxLon,maxLat]
     * @param {object} options 上書き
     * @returns {string} SVG text
     */
    toSVGFromLayers(bboxLonLat, options = {}) {
        const opt = { ...this.opts, ...options };
        const page = this._resolvePaper(opt.paper, opt);
        const tf = this._makeTransform(bboxLonLat, page, opt);

        const palette =
            (typeof LayerCont !== "undefined" && LayerCont.palette)
                ? LayerCont.palette
                : (Conf?.default?.Palette);
        if (!palette) throw new Error("palette is not resolved (LayerCont.palette or Conf.default.Palette)");

        const layerKeys =
            (typeof LayerCont !== "undefined" && Array.isArray(LayerCont.styles))
                ? LayerCont.styles
                : Object.keys(Conf.style?.[palette] || {}).filter(k => k !== "background");

        const pathParts = [];
        const pointParts = [];
        let pathSerial = 0;

        // background rect
        const bg = (opt.background)
            ? `<rect x="0" y="0" width="${page.widthMm}" height="${page.heightMm}" fill="${this._esc(opt.background)}" fill-opacity="${this._esc(opt.backgroundOpacity)}" />`
            : "";

        for (let styleOrder = 0; styleOrder < layerKeys.length; styleOrder++) {
            const key = layerKeys[styleOrder];
            if (key === "background") continue;
            if (!Layers?.[key]?.geojson) continue;

            // skip hidden (layer-wide)
            const layerOpacity =
                (Layers[key].opacity === "" || typeof Layers[key].opacity === "undefined")
                    ? 1
                    : Number(Layers[key].opacity);

            if (opt.skipHiddenLayers && layerOpacity <= 0) continue;

            const type = Conf.style?.[palette]?.[key]?.type;

            const baseStyle = SVGCont.svg_style(key, false);
            const over = Conf.style?.[palette]?.[key]?.overstyle ? SVGCont.svg_style(key, true) : null;

            // collect features/geoms
            const items = Array.isArray(Layers[key].geojson) ? Layers[key].geojson : [Layers[key].geojson];

            // Leaflet live layers（クリック後の状態を反映するため）
            const hasOver = !!over;
            const step = hasOver ? 2 : 1;
            const svgLayers = Layers?.[key]?.svg || [];

            for (let i = 0; i < items.length; i++) {
                const feature = this._normalizeToFeature(items[i]);
                if (!feature?.geometry) continue;
                const osmLayer = getMapMakerOsmLayer(feature);

                // ★ base の live options（クリックで変更された opacity/fillOpacity 等）
                const baseSvg = svgLayers[i * step];
                const baseInner = baseSvg?.getLayers ? baseSvg.getLayers()[0] : baseSvg;
                const baseOpt = baseInner?.options || {};
                const liveBase = { ...baseStyle, ...baseOpt };

                // feature単位でOFFならスキップ
                const featOpacity = Number(liveBase.opacity ?? 1) * layerOpacity;
                if (opt.skipHiddenLayers && featOpacity <= 0) continue;

                // ★ over の live options
                let liveOver = over;
                if (hasOver) {
                    const overSvg = svgLayers[i * step + 1];
                    const overInner = overSvg?.getLayers ? overSvg.getLayers()[0] : overSvg;
                    const overOpt = overInner?.options || {};
                    liveOver = { ...over, ...overOpt };
                }

                // Point
                if (feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint") {
                    let tree = (feature.properties?.["natural"] || "") === "tree"; // adhocで樹木を判別（natural=tree）
                    const pts = this._geomToPointElements(feature.geometry, tf, {
                        ...opt,
                        stroke: liveBase.color,
                        fill: (type === "area")
                            ? (liveBase.fillColor ?? liveBase.color)
                            : (liveBase.fillColor ?? liveBase.color),
                        strokeWidthMm: this._pxToMm(liveBase.weight, opt),
                        opacity: featOpacity,
                        fillOpacity: (liveBase.fillOpacity ?? 1) * layerOpacity,
                        dashArrayMm: this._dashPxToMm(liveBase.dashArray, opt),
                        lineCap: liveBase.lineCap,
                        lineJoin: liveBase.lineJoin,
                        pointRadiusM: tree ? 1.8 : 0.9,
                    });
                    pointParts.push(...pts);

                    if (liveOver) {
                        const oOpacity = Number(liveOver.opacity ?? 1) * layerOpacity;
                        if (!(opt.skipHiddenLayers && oOpacity <= 0)) {
                            const pts2 = this._geomToPointElements(feature.geometry, tf, {
                                ...opt,
                                stroke: liveOver.color,
                                fill: (type === "area")
                                    ? (liveOver.fillColor ?? liveOver.color)
                                    : (liveOver.fillColor ?? liveOver.color),
                                strokeWidthMm: this._pxToMm(liveOver.weight, opt),
                                opacity: oOpacity,
                                fillOpacity: (liveOver.fillOpacity ?? 1) * layerOpacity,
                                dashArrayMm: this._dashPxToMm(liveOver.dashArray, opt),
                                lineCap: liveOver.lineCap,
                                lineJoin: liveOver.lineJoin,
                                pointRadiusM: tree ? 1.8 : 0.9,
                            });
                            pointParts.push(...pts2);
                        }
                    }
                    continue;
                }

                // Polygon?
                const isPoly = (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon");

                // base pass（liveBase + feature opacity）
                {
                    const style = this._makeStyleForLayer(liveBase, {
                        opt, type, isPoly, opacity: layerOpacity
                    });
                    // ★ featureで切り替えた値を優先
                    style.strokeOpacity = (liveBase.opacity ?? 1) * layerOpacity;
                    style.fillOpacity = (liveBase.fillOpacity ?? (style.fillOpacity ?? 1)) * layerOpacity;

                    const d = this._geomToPathD(feature.geometry, tf, style);
                    if (d) {
                        pathParts.push({
                            svg: this._pathElement(d, style, key, osmLayer),
                            osmLayer,
                            styleOrder,
                            featureOrder: i,
                            passOrder: 0,
                            serial: pathSerial++
                        });
                    }
                }

                // over pass（liveOver + feature opacity）
                if (liveOver) {
                    const style2 = this._makeStyleForLayer(liveOver, {
                        opt, type, isPoly, opacity: layerOpacity
                    });
                    style2.dashArrayMm = this._dashPxToMm(liveOver.dashArray, opt);
                    style2.strokeOpacity = (liveOver.opacity ?? 1) * layerOpacity;
                    style2.fillOpacity = (liveOver.fillOpacity ?? (style2.fillOpacity ?? 1)) * layerOpacity;

                    const d2 = this._geomToPathD(feature.geometry, tf, style2);
                    if (d2) {
                        pathParts.push({
                            svg: this._pathElement(d2, style2, key, osmLayer),
                            osmLayer,
                            styleOrder,
                            featureOrder: i,
                            passOrder: 1,
                            serial: pathSerial++
                        });
                    }
                }
            }
        }

        const orderedPaths = pathParts
            .sort(compareMapMakerDrawOrder)
            .map(part => part.svg);
        const body = [bg, ...orderedPaths, ...pointParts].filter(Boolean).join("\n  ");

        return (
            `<svg xmlns="http://www.w3.org/2000/svg"
     width="${page.widthMm}mm" height="${page.heightMm}mm"
     viewBox="0 0 ${page.widthMm} ${page.heightMm}"
     shape-rendering="${this._esc(opt.shapeRendering)}">
  ${body}
</svg>`
        );
    }

    // ---------------- internal ----------------

    _parseDashArray(dashArrayStr) {
        // "4 2" / "4,2" 両対応
        return String(dashArrayStr)
            .trim()
            .split(/[ ,]+/)
            .map(v => Number(v))
            .filter(v => Number.isFinite(v) && v >= 0);
    }

    _resolvePaper(paper, opt) {
        if (typeof paper === "object" && paper.widthMm && paper.heightMm) {
            return { widthMm: Number(paper.widthMm), heightMm: Number(paper.heightMm), marginMm: opt.marginMm };
        }
        const preset = this.paperPresets[paper];
        if (!preset) throw new Error(`Unknown paper preset: ${paper}`);
        return { ...preset, marginMm: opt.marginMm };
    }

    _project3857([lon, lat]) {
        const x = this.R * lon * Math.PI / 180;
        const y = this.R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
        return [x, y];
    }

    _makeTransform(bboxLonLat, page, opt) {
        console.log("bboxLonLat=", bboxLonLat);
        const [minLon, minLat, maxLon, maxLat] = bboxLonLat;
        const [minX, minY] = this._project3857([minLon, minLat]);
        const [maxX, maxY] = this._project3857([maxLon, maxLat]);

        const srcW = (maxX - minX);
        const srcH = (maxY - minY);
        console.log("srcW/srcH=", srcW, srcH);

        const dstW = page.widthMm - page.marginMm.left - page.marginMm.right;
        const dstH = page.heightMm - page.marginMm.top - page.marginMm.bottom;

        // mode=='' は Leaflet表示と同じ「画面を埋める」挙動に合わせる（cover）
        const cover = (opt.fitMode === "cover"); // 追加オプション
        const scale = cover
            ? Math.max(dstW / srcW, dstH / srcH)   // cover: 画面を埋める（はみ出た分は切れる）
            : Math.min(dstW / srcW, dstH / srcH);  // contain: 全体を入れる（余白が出る）

        const ox = page.marginMm.left + (dstW - srcW * scale) / 2;
        const oy = page.marginMm.top + (dstH - srcH * scale) / 2;

        const toPageMmXY = ([lon, lat]) => {
            const [x, y] = this._project3857([lon, lat]);
            const px = ox + (x - minX) * scale;
            const py = oy + (maxY - y) * scale; // Y flip
            return [px, py];
        };
        return { toPageMmXY, scale };
    }

    _normalizeToFeature(obj) {
        if (!obj) return null;
        if (obj.type === "Feature") return obj;
        if (obj.type && obj.coordinates) return { type: "Feature", properties: {}, geometry: obj };
        if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
            // ここでは単一Featureとして扱えないので、呼び出し側で配列に展開すべき
            // ただし Layers[key].geojson が FeatureCollectionを直接持つことは少ない前提
            return null;
        }
        return null;
    }

    _pxToMm(weightPx, opt) {
        const mm = Number(weightPx || 0) * Number(opt.strokePxToMm ?? opt.pxToMm);
        return Math.max(Number(opt.minStrokeMm), mm);
    }

    _dashPxToMm(dashArray, opt) {
        if (!dashArray) return null;
        // Leaflet styleのdashArrayは "4 2" などの文字列で来る想定
        if (typeof dashArray === "string") {
            const parts = dashArray.trim().split(/\s+/).map(Number).filter(n => Number.isFinite(n));
            if (!parts.length) return null;
            return parts.map(px => Math.max(0, px * opt.pxToMm));
        }
        if (Array.isArray(dashArray)) {
            return dashArray.map(px => Math.max(0, Number(px) * opt.pxToMm));
        }
        return null;
    }

    _makeStyleForLayer(leafletStyle, { opt, type, isPoly, opacity }) {
        const stroke = leafletStyle.color ?? opt.stroke;

        const fillEnabled = (type === "area" || isPoly);
        const fill = fillEnabled ? (leafletStyle.fillColor ?? stroke) : "none";

        // Leafletのopacity/fillOpacityを尊重（無ければ妥当な既定値）
        const strokeOpacity = (leafletStyle.opacity ?? 1) * (opacity ?? 1);
        const fillOpacityBase =
            (leafletStyle.fillOpacity ?? (fillEnabled ? 1 : 0));
        const fillOpacity = fillOpacityBase * (opacity ?? 1);

        return {
            stroke,
            fill,
            strokeWidthMm: this._pxToMm(leafletStyle.weight, opt),
            lineCap: leafletStyle.lineCap || "round",
            lineJoin: leafletStyle.lineJoin || "round",
            fillRule: opt.fillRule,
            strokeOpacity,
            fillOpacity,
            // dashArrayMm をmm化して保持
            dashArrayMm: this._dashPxToMm(leafletStyle.dashArray, opt),
        };
    }

    _fmt(n, opt) {
        const dec = Number.isFinite(opt.coordDecimals) ? opt.coordDecimals : 3;
        const p = Math.pow(10, dec);
        return String(Math.round(n * p) / p);
    }

    _lineToPathD(line, tf, style, opt) {
        if (!Array.isArray(line) || line.length < 2) return "";
        let d = "";
        for (let i = 0; i < line.length; i++) {
            const [x, y] = tf.toPageMmXY(line[i]);
            const sx = this._fmt(x, opt);
            const sy = this._fmt(y, opt);
            d += (i === 0) ? `M${sx} ${sy}` : `L${sx} ${sy}`;
        }
        return d;
    }

    _ringToPathD(ring, tf, style, opt) {
        if (!Array.isArray(ring) || ring.length < 3) return "";
        let d = "";
        for (let i = 0; i < ring.length; i++) {
            const [x, y] = tf.toPageMmXY(ring[i]);
            const sx = this._fmt(x, opt);
            const sy = this._fmt(y, opt);
            d += (i === 0) ? `M${sx} ${sy}` : `L${sx} ${sy}`;
        }
        d += "Z";
        return d;
    }

    _geomToPathD(geom, tf, opt) {
        if (!geom) return "";
        const t = geom.type;
        const c = geom.coordinates;

        if (t === "LineString") return this._lineToPathD(c, tf, opt, opt);
        if (t === "MultiLineString") return c.map(line => this._lineToPathD(line, tf, opt, opt)).filter(Boolean).join(" ");

        if (t === "Polygon") return c.map(ring => this._ringToPathD(ring, tf, opt, opt)).filter(Boolean).join(" ");
        if (t === "MultiPolygon") {
            return c
                .map(poly => poly.map(ring => this._ringToPathD(ring, tf, opt, opt)).filter(Boolean).join(" "))
                .filter(Boolean)
                .join(" ");
        }
        return "";
    }

    _pathElement(d, style, layerKey = "", osmLayer = 0) {
        const attrs = [
            `d="${this._esc(d)}"`,
            `data-osm-layer="${this._esc(String(osmLayer))}"`,
            `stroke="${this._esc(style.stroke)}"`,
            `stroke-width="${this._esc(String(style.strokeWidthMm))}"`,
            `stroke-linecap="${this._esc(style.lineCap)}"`,
            `stroke-linejoin="${this._esc(style.lineJoin)}"`,
            `stroke-opacity="${this._esc(String(style.strokeOpacity ?? style.opacity ?? 1))}"`,
            `fill="${this._esc(style.fill)}"`,
            `fill-opacity="${this._esc(String(style.fillOpacity ?? style.opacity ?? 1))}"`,
            `fill-rule="${this._esc(style.fillRule)}"`
        ];

        if (Array.isArray(style.dashArrayMm) && style.dashArrayMm.length) {
            const dashScale =
                (this.opts.dashScaleByLayerKey && this.opts.dashScaleByLayerKey[layerKey])
                    ? this.opts.dashScaleByLayerKey[layerKey]
                    : 1;

            const arr = style.dashArrayMm.map(v => Number(v) * dashScale);
            attrs.push(`stroke-dasharray="${arr.map(v => this._esc(String(v))).join(" ")}"`);
        }

        return `<path ${attrs.join(" ")} />`;
    }


    _geomToPointElements(geom, tf, style) {
        const t = geom.type;
        const c = geom.coordinates;
        const points = (t === "Point") ? [c] : (Array.isArray(c) ? c : []);
        const out = [];

        for (const p of points) {
            const [x, y] = tf.toPageMmXY(p);
            const sx = this._fmt(x, style);
            const sy = this._fmt(y, style);
            const r = this._pointRadiusToPageMm(p, tf, style);

            if ((style.pointAs || this.opts.pointAs) === "polygon") {
                const steps = Math.max(8, Number(style.pointSteps || this.opts.pointSteps));
                const d = this._circlePolygonPathD([Number(sx), Number(sy)], r, steps, style);
                out.push(this._pathElement(d, {
                    ...style,
                    fill: (style.fill && style.fill !== "none") ? style.fill : style.stroke
                }));
            } else {
                out.push(this._circleElement(sx, sy, r, style));
            }
        }
        return out;
    }

    /**
     * 現地距離(m)のPoint半径を、SVG座標上のmmへ変換する。
     *
     * _makeTransform() の tf.scale は「Webメルカトル投影上の1mあたり何mmか」。
     * Webメルカトルは緯度が高いほど sec(lat) 倍に拡大されるため、
     * 地上距離mを投影上の距離へ直すには 1 / cos(lat) を掛ける。
     */
    _pointRadiusToPageMm(pointLonLat, tf, style) {
        // 明示的に pointRadiusMm が指定された場合は、従来互換としてSVG上の固定mmを優先する
        const radiusMm = style.pointRadiusMm ?? this.opts.pointRadiusMm;
        if (radiusMm !== null && radiusMm !== undefined && radiusMm !== "") {
            const n = Number(radiusMm);
            if (Number.isFinite(n) && n >= 0) return n;
        }

        const radiusM = Number(style.pointRadiusM ?? this.opts.pointRadiusM ?? 0);
        if (!Number.isFinite(radiusM) || radiusM <= 0) return 0;

        const lat = Number(pointLonLat?.[1] ?? 0);
        const cosLat = Math.cos(lat * Math.PI / 180);

        // 極域付近で無限大化しないための保険。通常の日本地図ではほぼ影響しない。
        const safeCosLat = Math.max(0.01, Math.abs(cosLat));

        return radiusM * (1 / safeCosLat) * tf.scale;
    }

    _circleElement(cx, cy, rMm, style) {
        const fill = (style.fill && style.fill !== "none") ? style.fill : style.stroke;
        return `<circle cx="${this._esc(cx)}" cy="${this._esc(cy)}" r="${this._esc(String(rMm))}"
      stroke="${this._esc(style.stroke)}"
      stroke-width="${this._esc(String(style.strokeWidthMm))}mm"
      stroke-opacity="${this._esc(String(style.opacity))}"
      fill="${this._esc(fill)}"
      fill-opacity="${this._esc(String(style.opacity))}" />`.replace(/\s+\n\s+/g, " ");
    }

    _circlePolygonPathD([cx, cy], rMm, steps, opt) {
        let d = "";
        for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const x = cx + Math.cos(a) * rMm;
            const y = cy + Math.sin(a) * rMm;
            const sx = this._fmt(x, opt);
            const sy = this._fmt(y, opt);
            d += (i === 0) ? `M${sx} ${sy}` : `L${sx} ${sy}`;
        }
        d += "Z";
        return d;
    }

    _esc(s) {
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }
}
