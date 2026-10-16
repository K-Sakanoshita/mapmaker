// OSM layer=* を画面描画とSVG/PNG出力で共通の描画順に変換する。
// osmtogeojson(flatProperties) は通常 properties.layer に格納するが、
// 外部GeoJSONとの互換性のため properties.tags.layer も受け付ける。
function getMapMakerOsmLayer(feature) {
    const raw = feature?.properties?.layer ?? feature?.properties?.tags?.layer;
    if (raw === undefined || raw === null || String(raw).trim() === "") return 0;

    const value = Number(String(raw).trim());
    return Number.isFinite(value) ? value : 0;
}

// osmtogeojsonのflatProperties設定や外部GeoJSONの形式に関係なくタグを取得する。
function getMapMakerFeatureTag(feature, key) {
    return feature?.properties?.[key] ?? feature?.properties?.tags?.[key];
}

// OSMの高さ(m / ft)を解釈し、不明な建物は一階建て相当とする。
function getMapMakerBuildingHeight(feature, options = {}) {
    const positive = value => Number.isFinite(value) && value > 0;
    const raw = String(getMapMakerFeatureTag(feature, "height") ?? "").trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/i);
    if (match) {
        const height = Number(match[1]) * (match[2]?.toLowerCase() === "ft" ? 0.3048 : 1);
        if (positive(height)) return height;
    }
    if (isMapMakerWall(feature)) return 1.5;
    if (getMapMakerFeatureTag(feature, "natural") === "tree") return 4;
    const levelsRaw = String(getMapMakerFeatureTag(feature, "building:levels") ?? "").trim();
    const levels = /^\d+(?:\.\d+)?$/.test(levelsRaw) ? Number(levelsRaw) : NaN;
    const perFloor = positive(Number(options.floorHeight)) ? Number(options.floorHeight) : 3;
    if (positive(levels)) return levels * perFloor;
    return positive(Number(options.defaultHeight)) ? Number(options.defaultHeight) : 3;
}

// 壁の中心線を厚さ20cmの面にする。閉じた線も内部を塗り潰さない。
function isMapMakerWall(feature) {
    return getMapMakerFeatureTag(feature, 'barrier') === 'wall' &&
        ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
}

function getMapMakerWallGeometry(feature) {
    const geometry = feature.geometry;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.coordinates;
    const polygons = [];
    for (const line of lines) for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const metersY = 111319.49079327358;
        const metersX = metersY * Math.max(.01, Math.cos((a[1] + b[1]) / 2 * Math.PI / 180));
        const dx = (b[0] - a[0]) * metersX, dy = (b[1] - a[1]) * metersY;
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        const ox = -dy / length * .1 / metersX, oy = dx / length * .1 / metersY;
        const ring = [[a[0]+ox,a[1]+oy], [a[0]-ox,a[1]-oy],
            [b[0]-ox,b[1]-oy], [b[0]+ox,b[1]+oy], [a[0]+ox,a[1]+oy]];
        polygons.push([ring]);
    }
    return { type: 'MultiPolygon', coordinates: polygons };
}

// 樹木の元Pointから、画面と保存で共通の幹・樹冠を作る。
const mapMakerTreePartsCache = new WeakMap();
function getMapMakerTreeParts(feature) {
    const center = feature.geometry.coordinates;
    const height = getMapMakerBuildingHeight(feature);
    const radius = Math.max(.1, getMapMakerPointStyle('tree').radius);
    const signature = [center[0], center[1], height, radius].join(':');
    const cached = mapMakerTreePartsCache.get(feature);
    if (cached?.signature === signature) return cached.parts;
    const circle = radius => {
        const ring = [];
        const metersY = 111319.49079327358;
        const metersX = metersY * Math.max(.01, Math.cos(center[1] * Math.PI / 180));
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            ring.push([center[0] + radius * Math.cos(angle) / metersX,
                center[1] + radius * Math.sin(angle) / metersY]);
        }
        ring.push([...ring[0]]);
        return { type: 'Polygon', coordinates: [ring] };
    };
    const parts = [
        { name: 'trunk', geometry: circle(Math.min(.15, radius * .15)), base: 0, height: height * .35 },
        { name: 'crown', geometry: circle(radius), base: height * .3, height }
    ];
    mapMakerTreePartsCache.set(feature, { signature, parts });
    return parts;
}

function getMapMakerTreeTrunkColor() {
    return LayerCont.palette === 'mono' ? '#777775' : '#8b6b4a';
}

// Point固有の描画設定を現在のパレットから取得する。
function getMapMakerPointStyle(name) {
    const conf = Conf.pointStyle?.[name] || {};
    const palette = conf.palette?.[LayerCont.palette] || {};
    return {
        radius: Number.isFinite(Number(conf.radius)) ? Number(conf.radius) : 0.9,
        width: Number.isFinite(Number(palette.width)) ? Number(palette.width) : 0,
        lineColor: palette.lineColor || "#000000",
        fillColor: palette.fillColor || palette.lineColor || "#000000"
    };
}

// Pointを図形として描画する対象をpointStyleの定義へ限定する。
function getMapMakerPointStyleName(feature) {
    if (getMapMakerFeatureTag(feature, "natural") === "tree" && Conf.pointStyle?.tree) return "tree";
    if (getMapMakerFeatureTag(feature, "entrance") !== undefined && Conf.pointStyle?.entrance) return "entrance";
    return null;
}

// 設定がない既存レイヤーはJSON内の並び順を維持する。
function getMapMakerStyleDrawOrder(palette, key, fallbackIndex) {
    const configured = Number(Conf.style?.[palette]?.[key]?.drawOrder);
    return Number.isFinite(configured) ? configured : fallbackIndex * 10;
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

// MapLibre Control
class MapLibreControl {
    constructor() { this.Control = {}; this.Maps = {}; }
    init() {
        map = MapEngine.map('mapid', { center: Conf.default.DefaultCenter, zoom: Conf.default.DefaultZoom });
        this.baseKey = Conf.tile_select.default;
        map.setBasemap(this.baseKey);
    }
    enable(flag) { if (flag) { map.dragging.enable(); map.scrollWheelZoom.enable(); } }
    start() {
        for (const key of ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom']) map[key].enable();
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-in').closest('.maplibregl-ctrl-group').classList.remove('d-none');
        map.gl.keyboard.enable(); map.gl.dragRotate.enable(); map.gl.touchPitch.enable();
        map.gl.getContainer().querySelector('.maplibregl-ctrl-compass').disabled = false;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-geolocate').disabled = false;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-in').disabled = false;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-out').disabled = false;
        map.setBasemap(this.baseKey);
        map.threeD = false;
        map.schedule();
        Birdseye.sync();
    }
    stop() {
        for (const key of ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom']) map[key].disable();
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-in').closest('.maplibregl-ctrl-group').classList.add('d-none');
        map.setBasemap(map.vectorBasemapKey);
        map.gl.dragRotate.disable(); map.gl.touchPitch.disable(); map.gl.keyboard.disable();
        map.gl.getContainer().querySelector('.maplibregl-ctrl-compass').disabled = true;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-geolocate').disabled = true;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-in').disabled = true;
        map.gl.getContainer().querySelector('.maplibregl-ctrl-zoom-out').disabled = true;
    }
    zoomSet(zoom) { map.flyTo(map.getCenter(), zoom); }
    addControl(position, element) {
        element.addEventListener('pointerdown', e => e.stopPropagation());
        element.addEventListener('dblclick', e => e.stopPropagation());
        element.addEventListener('wheel', e => e.stopPropagation());
        map.gl.addControl({ onAdd: () => { element.classList.add('maplibregl-ctrl'); return element; }, onRemove: () => element.remove() }, position);
    }
    controlAdd(position, id, html, css) {
        const element = document.createElement('div'); element.id = id; element.innerHTML = html; element.className = css;
        this.addControl(position.replace('bottomleft', 'bottom-left').replace('bottomright', 'bottom-right'), element);
    }
    geojsonAdd(data) {
        const features = data.type === 'FeatureCollection' ? data.features : [data];
        for (const feature of features) MapEngine.geoJSON(feature, { color: feature.properties.stroke, weight: feature.properties['stroke-width'] }).addTo(map);
    }
}
const MapCont = new MapLibreControl();

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
                let circle = MapEngine.circle(MapEngine.latLng(latlng[1], latlng[0]), style).addTo(map);
                circle.addTo(map).on('click', e => { popup_icon(e) });
                // console.log(`feature[${idx}]: [${latlng[1]}, ${latlng[0]}`);
                setTimeout(() => map.removeLayer(circle), timer);
                timer += 100;
            })
        })

        function popup_icon(ev) {
            let popcont = JSON.stringify(ev.latlng);
            MapEngine.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
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
        MapEngine.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);
    }

    writeLL(LL) { // view maparea
        let bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
        MapEngine.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);
    }

    polyline_write(cords) {
        let colors = ['red', 'blue', 'green', 'yellow'];
        let count = 0;
        for (let cord of cords) {
            let poly = [];
            for (let latlng of cord) {
                poly.push([latlng[1], latlng[0]]);
            }
            MapEngine.polyline(poly, { color: colors[count++ % colors.length], weight: 4 }).addTo(map);
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
     * @param {MapEngine.LatLngBounds} bounds
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
        const buildings = [];
        let pathSerial = 0;

        // background rect
        const bg = (opt.background)
            ? `<rect x="0" y="0" width="${page.widthMm}" height="${page.heightMm}" fill="${this._esc(opt.background)}" fill-opacity="${this._esc(opt.backgroundOpacity)}" />`
            : "";

        for (let styleIndex = 0; styleIndex < layerKeys.length; styleIndex++) {
            const key = layerKeys[styleIndex];
            const styleOrder = getMapMakerStyleDrawOrder(palette, key, styleIndex);
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
            const svgLayers = Layers?.[key]?.svg || [];
            const svgByFeaturePass = new Map();
            svgLayers.forEach(svg => {
                const order = svg?.mapmaker?.drawOrder;
                if (order) svgByFeaturePass.set(`${order.featureOrder}:${order.passOrder}`, svg);
            });

            for (let i = 0; i < items.length; i++) {
                const feature = this._normalizeToFeature(items[i]);
                if (!feature?.geometry) continue;
                if (opt.birdseye && !opt.camera && !this._intersectsBBox(feature, bboxLonLat)) continue;
                const osmLayer = getMapMakerOsmLayer(feature);

                // ★ base の live options（クリックで変更された opacity/fillOpacity 等）
                const baseSvg = svgByFeaturePass.get(`${i}:0`);
                const baseInner = baseSvg?.getLayers ? baseSvg.getLayers()[0] : baseSvg;
                const baseOpt = baseInner?.options || {};
                const liveBase = { ...baseStyle, ...baseOpt };
                const editorWrap = svg => {
                    const id = baseSvg?.editorId ?? baseSvg?.id;
                    if (!opt.editorHitTargets || id === undefined || !(baseSvg?.editorClickable || typeof baseSvg?.click === 'function')) return svg;
                    const hitMode = /LineString$/.test(feature.geometry.type) && !(opt.birdseye && isMapMakerWall(feature)) ? 'stroke' : 'all';
                    return `<g data-editor-id="${this._esc(id)}" style="pointer-events:${layerOpacity > 0 ? hitMode : 'none'}">${svg}</g>`;
                };

                // feature単位でOFFならスキップ
                const featOpacity = Number(liveBase.opacity ?? 1) * layerOpacity;
                if (opt.skipHiddenLayers && featOpacity <= 0) continue;

                // ★ over の live options
                let liveOver = over;
                if (hasOver) {
                    const overSvg = svgByFeaturePass.get(`${i}:1`);
                    const overInner = overSvg?.getLayers ? overSvg.getLayers()[0] : overSvg;
                    const overOpt = overInner?.options || {};
                    liveOver = { ...over, ...overOpt };
                }

                // Point
                if (feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint") {
                    const pointStyleName = getMapMakerPointStyleName(feature);
                    if (!pointStyleName) continue;
                    const pointStyle = getMapMakerPointStyle(pointStyleName);
                    if (opt.birdseye && pointStyleName === 'tree') {
                        const centers = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                        for (const center of centers) {
                            const tree = feature.geometry.type === 'Point' ? feature : { ...feature, geometry: { type: 'Point', coordinates: center } };
                            const rendered = getMapMakerTreeParts(tree).map(part => {
                                const style = { fill: part.name === 'trunk' ? getMapMakerTreeTrunkColor() : pointStyle.fillColor,
                                    fillOpacity: featOpacity, stroke: 'none', strokeWidthMm: 0, strokeOpacity: 0 };
                                return this._buildingSVG({ ...tree, geometry: part.geometry }, tf, style, opt, part);
                            });
                            buildings.push({ depth: Math.max(...rendered.map(part => part.depth)),
                                svg: editorWrap(`<g data-tree-id="${this._esc(feature.id ?? '')}">${rendered.map(part => part.svg).join('')}</g>`),
                                osmLayer, serial: pathSerial++ });
                        }
                        continue;
                    }
                    const pts = this._geomToPointElements(feature.geometry, tf, {
                        ...opt,
                        stroke: pointStyle.lineColor,
                        fill: pointStyle.fillColor,
                        strokeWidthMm: this._pxToMm(pointStyle.width, opt),
                        opacity: featOpacity,
                        fillOpacity: (liveBase.fillOpacity ?? 1) * layerOpacity,
                        dashArrayMm: this._dashPxToMm(liveBase.dashArray, opt),
                        lineCap: liveBase.lineCap,
                        lineJoin: liveBase.lineJoin,
                        pointRadiusM: pointStyle.radius,
                    });
                    pointParts.push(...pts.map(editorWrap));

                    if (liveOver && !pointStyleName) {
                        const oOpacity = Number(liveOver.opacity ?? 1) * layerOpacity;
                        if (!(opt.skipHiddenLayers && oOpacity <= 0)) {
                            const pts2 = this._geomToPointElements(feature.geometry, tf, {
                                ...opt,
                                stroke: pointStyle.lineColor,
                                fill: pointStyle.fillColor,
                                strokeWidthMm: this._pxToMm(pointStyle.width, opt),
                                opacity: oOpacity,
                                fillOpacity: (liveOver.fillOpacity ?? 1) * layerOpacity,
                                dashArrayMm: this._dashPxToMm(liveOver.dashArray, opt),
                                lineCap: liveOver.lineCap,
                                lineJoin: liveOver.lineJoin,
                                pointRadiusM: pointStyle.radius,
                            });
                            pointParts.push(...pts2.map(editorWrap));
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

                    if (opt.birdseye && isMapMakerWall(feature)) {
                        // 折れ曲がった壁を一括で並べると、手前の端点に引かれて
                        // 奥の部分まで建物の上に重なる。線分ごとに奥行きを判定する。
                        for (const coordinates of getMapMakerWallGeometry(feature).coordinates) {
                            const wallFeature = { ...feature, geometry: { type: 'Polygon', coordinates } };
                            const wall = this._buildingSVG(wallFeature, tf, { ...style, fill: style.stroke,
                                fillOpacity: style.strokeOpacity, strokeWidthMm: 0, dashArrayMm: null }, opt);
                            buildings.push({ ...wall, svg: editorWrap(wall.svg), osmLayer, serial: pathSerial++ });
                        }
                        continue;
                    }
                    if (opt.birdseye && isPoly && getMapMakerFeatureTag(feature, "building") && getMapMakerFeatureTag(feature, "building") !== "no") {
                        const building = this._buildingSVG(feature, tf, style, opt);
                        buildings.push({ ...building, svg: editorWrap(building.svg), osmLayer, serial: pathSerial++ });
                        continue;
                    }
                    const d = this._geomToPathD(feature.geometry, tf, style);
                    if (d) {
                        pathParts.push({
                            svg: editorWrap(this._pathElement(d, style, key, osmLayer)),
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
                            svg: editorWrap(this._pathElement(d2, style2, key, osmLayer)),
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
        // 地面の道・面を先に、建物は画面奥から手前へ描く。
        const orderedBuildings = buildings.sort((a, b) => a.depth - b.depth || a.serial - b.serial).map(b => b.svg);
        let body;
        if (opt.camera) {
            const clip = `<defs><clipPath id="mapmaker-camera-clip"><rect width="${page.widthMm}" height="${page.heightMm}" /></clipPath></defs>`;
            body = [bg, clip, `<g clip-path="url(#mapmaker-camera-clip)">${[...orderedPaths, ...orderedBuildings, ...pointParts].join("\n")}</g>`].filter(Boolean).join("\n");
        } else if (opt.birdseye) {
            // 回転しても元の選択範囲の外にある道路や地面が余白へ漏れないようにする。
            const [west, south, east, north] = bboxLonLat;
            const boundary = [[west, south], [east, south], [east, north], [west, north]]
                .map(ll => tf.toPageMmXY(ll).map(n => this._fmt(n, opt)).join(",")).join(" ");
            const clip = `<defs><clipPath id="mapmaker-ground-clip"><polygon points="${boundary}" /></clipPath></defs>`;
            body = [bg, clip, `<g clip-path="url(#mapmaker-ground-clip)">${orderedPaths.join("\n")}</g>`,
                ...orderedBuildings, `<g clip-path="url(#mapmaker-ground-clip)">${pointParts.join("\n")}</g>`].filter(Boolean).join("\n  ");
        } else {
            body = [bg, ...orderedPaths, ...pointParts].filter(Boolean).join("\n  ");
        }

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
        if (opt.camera) {
            const { matrix: m, width, height, rect } = opt.camera;
            const ratio = Math.min(page.widthMm / rect.width, page.heightMm / rect.height);
            const ox = (page.widthMm - rect.width * ratio) / 2;
            const oy = (page.heightMm - rect.height * ratio) / 2;
            const homogeneous = ([lon, lat, elevation = 0], altitude = elevation) => {
                const latitude = Math.max(-85.051129, Math.min(85.051129, lat));
                const x = (lon + 180) / 360;
                const y = (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))) / 360;
                const z = altitude / (40030228.88407185 * Math.cos(latitude * Math.PI / 180));
                return [0, 1, 2, 3].map(row => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row]);
            };
            const toPage = ([x, y, z, w]) => {
                const px = (x / w + 1) * width / 2;
                const py = (1 - y / w) * height / 2;
                return [ox + (px - rect.x1) * ratio, oy + (py - rect.y1) * ratio];
            };
            // SVGのclipPathは投影後に働くため、カメラ後方の反転した面を除去できない。
            // 遠近除算の前に、MapLibreと同じ同次座標で視錐台に切り取る。
            // 画面外に余白を置き、切断辺のストロークが用紙内に現れないようにする。
            const pad = 32;
            const left = (rect.x1 - pad) / width * 2 - 1;
            const right = (rect.x1 + rect.width + pad) / width * 2 - 1;
            const top = 1 - (rect.y1 - pad) / height * 2;
            const bottom = 1 - (rect.y1 + rect.height + pad) / height * 2;
            const planes = [
                p => p[3] - 1e-10,
                p => p[0] - left * p[3], p => right * p[3] - p[0],
                p => p[1] - bottom * p[3], p => top * p[3] - p[1],
                p => p[2] + p[3], p => p[3] - p[2]
            ];
            const lerp = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
            const clipPolygon = coordinates => {
                let points = coordinates.map(ll => homogeneous(ll));
                for (const plane of planes) {
                    if (!points.length) break;
                    const result = [];
                    let a = points[points.length - 1], fa = plane(a);
                    for (const b of points) {
                        const fb = plane(b);
                        if ((fa >= 0) !== (fb >= 0)) result.push(lerp(a, b, fa / (fa - fb)));
                        if (fb >= 0) result.push(b);
                        a = b; fa = fb;
                    }
                    points = result;
                }
                return points.length >= 3 ? points.map(toPage) : [];
            };
            const clipLine = coordinates => {
                const points = coordinates.map(ll => homogeneous(ll));
                const runs = [];
                let run = null;
                for (let i = 1; i < points.length; i++) {
                    const a = points[i - 1], b = points[i];
                    let lo = 0, hi = 1;
                    for (const plane of planes) {
                        const fa = plane(a), fb = plane(b);
                        if (fa < 0 && fb < 0) { lo = 1; hi = 0; break; }
                        if (fa < 0) lo = Math.max(lo, fa / (fa - fb));
                        else if (fb < 0) hi = Math.min(hi, fa / (fa - fb));
                    }
                    if (lo > hi) { run = null; continue; }
                    const start = toPage(lerp(a, b, lo)), end = toPage(lerp(a, b, hi));
                    const last = run?.[run.length - 1];
                    if (!last || Math.abs(last[0] - start[0]) > 1e-8 || Math.abs(last[1] - start[1]) > 1e-8) {
                        run = [start]; runs.push(run);
                    }
                    run.push(end);
                }
                return runs;
            };
            return { camera: true, scale: ratio * 512 * 2 ** opt.camera.zoom / 40075016.68557849,
                toPageMmXY: (ll, altitude) => toPage(homogeneous(ll, altitude)), clipPolygon, clipLine };

        }
        console.log("bboxLonLat=", bboxLonLat);
        const [minLon, minLat, maxLon, maxLat] = bboxLonLat;
        const [minX, minY] = this._project3857([minLon, minLat]);
        const [maxX, maxY] = this._project3857([maxLon, maxLat]);

        if (opt.birdseye) {
            const bird = opt.birdseye;
            const angle = (Number(bird.bearing) || 0) * Math.PI / 180;
            const tilt = Math.max(10, Math.min(70, Number(bird.tilt) || 45)) * Math.PI / 180;
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            const cosLat = Math.max(0.01, Math.cos((minLat + maxLat) / 2 * Math.PI / 180));
            const rotate = (x, y) => [x * Math.cos(angle) - y * Math.sin(angle),
                (x * Math.sin(angle) + y * Math.cos(angle)) * Math.cos(tilt)];
            const corners = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]]
                .map(([x, y]) => rotate(x - cx, cy - y));
            const x0 = Math.min(...corners.map(p => p[0])), x1 = Math.max(...corners.map(p => p[0]));
            const y0 = Math.min(...corners.map(p => p[1])), y1 = Math.max(...corners.map(p => p[1]));
            let maxHeight = 0;
            for (const layer of Object.values(Layers)) {
                if (opt.skipHiddenLayers && Number(layer?.opacity) === 0) continue;
                const features = layer?.geojson;
                for (const item of (Array.isArray(features) ? features : [features])) {
                    const f = this._normalizeToFeature(item);
                    if (f?.geometry && this._intersectsBBox(f, bboxLonLat) && (getMapMakerPointStyleName(f) === "tree" || isMapMakerWall(f) || getMapMakerFeatureTag(f, "building") && getMapMakerFeatureTag(f, "building") !== "no")) {
                        maxHeight = Math.max(maxHeight, getMapMakerBuildingHeight(f, bird));
                    }
                }
            }
            const headroom = maxHeight / cosLat * Math.sin(tilt);
            const width = page.widthMm - page.marginMm.left - page.marginMm.right;
            const height = page.heightMm - page.marginMm.top - page.marginMm.bottom;
            const scale = Math.min(width / Math.max(1, x1 - x0), height / Math.max(1, y1 - y0 + headroom));
            const ox = page.marginMm.left + (width - (x1 - x0) * scale) / 2;
            const oy = page.marginMm.top + (height - (y1 - y0 + headroom) * scale) / 2;
            return {
                scale,
                heightMm: h => h / cosLat * scale * Math.sin(tilt),
                toPageMmXY: ll => {
                    const [x, y] = this._project3857(ll);
                    const [rx, ry] = rotate(x - cx, cy - y);
                    return [ox + (rx - x0) * scale, oy + (ry - y0 + headroom) * scale];
                }
            };
        }

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

    _intersectsBBox(feature, bbox) {
        let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
        const visit = coordinates => {
            if (!Array.isArray(coordinates)) return;
            if (typeof coordinates[0] === "number") {
                west = Math.min(west, coordinates[0]); east = Math.max(east, coordinates[0]);
                south = Math.min(south, coordinates[1]); north = Math.max(north, coordinates[1]);
            } else coordinates.forEach(visit);
        };
        visit(feature.geometry.coordinates);
        return east >= bbox[0] && west <= bbox[2] && north >= bbox[1] && south <= bbox[3];
    }

    _buildingSVG(feature, tf, style, opt, extrusion = {}) {
        const height = extrusion.height ?? getMapMakerBuildingHeight(feature, opt.birdseye);
        const base = extrusion.base ?? 0;
        const rise = tf.camera ? 0 : tf.heightMm(height);
        // 色に含まれるalphaは壁の陰影にも反映し、透明な壁に黒だけ残さない。
        const fillAlpha = /^#[0-9a-f]{8}$/i.test(style.fill) ? parseInt(style.fill.slice(-2), 16) / 255 : 1;
        const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        const parts = [];
        let depth = -Infinity;
        const path = points => points.map(([x, y], i) => `${i ? "L" : "M"}${this._fmt(x, opt)} ${this._fmt(y, opt)}`).join("") + "Z";
        for (const polygon of polygons) {
            const rings = polygon.map(ring => ring.map(ll => tf.camera ? tf.toPageMmXY(ll, base) : (() => { const [x, y] = tf.toPageMmXY(ll); return [x, y - tf.heightMm(base)]; })()));
            const roofs = polygon.map(ring => ring.map(ll => tf.camera ? tf.toPageMmXY(ll, height) : (() => { const [x, y] = tf.toPageMmXY(ll); return [x, y - rise]; })()));
            const walls = [];
            rings.forEach((ring, ringIndex) => {
                const area = ring.reduce((sum, a, i) => {
                    const b = ring[(i + 1) % ring.length];
                    return sum + a[0] * b[1] - b[0] * a[1];
                }, 0);
                for (let i = 0; i < ring.length - 1; i++) {
                    const a = ring[i], b = ring[i + 1];
                    depth = Math.max(depth, a[1], b[1]);
                    // 外壁と中庭の壁で外向き法線が反転する。
                    const topA = roofs[ringIndex][i], topB = roofs[ringIndex][i + 1];
                    const facing = (b[0] - a[0]) * (topA[1] - a[1]) - (b[1] - a[1]) * (topA[0] - a[0]);
                    if (facing * Math.sign(area) * (ringIndex ? -1 : 1) <= 0) continue;
                    const wallPoints = tf.clipPolygon ? tf.clipPolygon([
                        [...polygon[ringIndex][i], base], [...polygon[ringIndex][i + 1], base],
                        [...polygon[ringIndex][i + 1], height], [...polygon[ringIndex][i], height]
                    ]) : [a, b, topB, topA];
                    if (!wallPoints.length) continue;
                    const wallStyle = { ...style, fill: style.fill, fillOpacity: style.fillOpacity };
                    walls.push({ depth: (a[1] + b[1]) / 2,
                        svg: `<g data-building-face="wall">${this._pathElement(path(wallPoints), wallStyle)}<path d="${path(wallPoints)}" fill="#000" fill-opacity="${0.18 * style.fillOpacity * fillAlpha}" stroke="none" /></g>` });
                }
            });
            parts.push(...walls.sort((a, b) => a.depth - b.depth).map(w => w.svg));
            const roofRings = tf.clipPolygon ? polygon.map(ring => tf.clipPolygon(ring.map(ll => [...ll, height]))) : roofs;
            const roof = roofRings.filter(ring => ring.length).map(ring => path(ring)).join(" ");
            if (roof) parts.push(`<g data-building-face="roof">${this._pathElement(roof, style)}</g>`);
        }
        const id = feature.id ?? feature.properties?.id ?? "";
        return { depth, svg: parts.length ? `<g data-rough-preserve="building" data-building-id="${this._esc(id)}" data-height-m="${height}">${parts.join("\n")}</g>` : "" };
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
        if (tf.clipLine) return tf.clipLine(line).map(run => run.map(([x, y], i) => `${i ? "L" : "M"}${this._fmt(x, opt)} ${this._fmt(y, opt)}`).join("")).join(" ");
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
        if (tf.clipPolygon) {
            const points = tf.clipPolygon(ring);
            return points.length ? points.map(([x, y], i) => `${i ? "L" : "M"}${this._fmt(x, opt)} ${this._fmt(y, opt)}`).join("") + "Z" : "";
        }
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
            if (tf.camera && style.pointRadiusM > 0) {
                // 地面上の円もカメラで投影し、傾斜・遠近によるつぶれを保持する。
                const angular = style.pointRadiusM / 6371008.8;
                const latitude = p[1] * Math.PI / 180, longitude = p[0] * Math.PI / 180;
                const ring = [];
                for (let i = 0; i <= 32; i++) {
                    const bearing = i / 32 * Math.PI * 2;
                    const lat = Math.asin(Math.sin(latitude) * Math.cos(angular) + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
                    const lon = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude), Math.cos(angular) - Math.sin(latitude) * Math.sin(lat));
                    ring.push([lon * 180 / Math.PI, lat * 180 / Math.PI]);
                }
                out.push(this._pathElement(this._geomToPathD({ type: 'Polygon', coordinates: [ring] }, tf, style), style));
                continue;
            }
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
