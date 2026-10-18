"use strict";

// PoiData Control
class poiControl {

    constructor() {
        this.PoiData = { geojson: [], targets: [], enable: [] };	// OvPassの応答(features抜き)と対象Keyの保存
        this.latlngs = {};
        this.geoidx = {};							// 緯度経度  osmid: {lat,lng} / osmidからgeojsonのindexリスト
        this.cat_cache = {}
    };

    pois() { return poiCont.PoiData }
    latlngs() { return poiCont.latlngs }
    clearAll() { poiCont.PoiData = { geojson: [], targets: [], enable: [] } }

    addGeoJSON(pois) {		// add geojson pois / pois: {geojson: [],targets: []} enableが無いのは仕様
        if (pois.enable == undefined) pois.enable = [];
        pois.geojson.forEach((val1, idx1) => {		// 既存Poiに追加
            let poi = { "geojson": pois.geojson[idx1], "targets": pois.targets[idx1], "enable": pois.enable[idx1] };
            if (poi.geojson !== undefined) poiCont.setPoiData(poi);
        });
        poiCont.PoiData.geojson.forEach((node, node_idx) => {
            if (poiCont.latlngs[node.id] == undefined) {
                let ll = GeoCont.flat2single(node.geometry.coordinates, node.geometry.type);
                poiCont.latlngs[node.id] = [ll[1], ll[0]];
                poiCont.geoidx[node.id] = node_idx;
            };
        })
    }

    // 指定したpoiをPoiDataに追加/更新する
    setPoiData(poi) {
        let cidx = poiCont.PoiData.geojson.findIndex((val) => val.id == poi.geojson.id);	// osmidが同じものを探す
        if (cidx === -1) {       	                   			// 無い時は追加
            this.PoiData.geojson.push(poi.geojson);
            cidx = this.PoiData.geojson.length - 1;
        };
        if (this.PoiData.targets[cidx] == undefined) {  		// targetが無い時は追加
            this.PoiData.targets[cidx] = poi.targets;
        } else {
            this.PoiData.targets[cidx] = Object.assign(this.PoiData.targets[cidx], poi.targets);
        };
        if (this.PoiData.enable[cidx] == undefined && poi.enable == undefined) {
            this.PoiData.enable[cidx] = false;
        } else if (poi.enable !== undefined) {
            this.PoiData.enable[cidx] = poi.enable;
        }
    }
    get_target(targets) { return poiCont.poi_filter(targets) }		// 指定したtargetのgeojsonと緯度経度を返す
    get_osmid(osmid) {           						// osmidを元にgeojsonと緯度経度、targetを返す
        let idx = poiCont.geoidx[osmid];
        return { geojson: poiCont.PoiData.geojson[idx], latlng: poiCont.latlngs[osmid], targets: poiCont.PoiData.targets[idx], enable: poiCont.PoiData.enable[idx] };
    }

    getCatnames(tags) {		// get Category Name & subname & tag
        if (tags == null) return ["", "", ""];
        if (tags.id == null) return ["", "", ""];

        if (poiCont.cat_cache[tags.id] !== undefined) {
            return Array.from(poiCont.cat_cache[tags.id]);  // 配列をコピーして返す
        }

        let catname = "", mainkey = "", mainval = "";
        let mainkeys = Conf.category_keys.filter(key => (tags[key] != null) && key !== "*");	// search tags

        if (!mainkeys.length) {
            poiCont.cat_cache[tags.id] = ["", "", ""];
            return Array.from(poiCont.cat_cache[tags.id]);
        }

        for (mainkey of mainkeys) {
            mainval = (tags[mainkey] == null) ? "*" : tags[mainkey];
            catname = Conf.category?.[mainkey]?.[mainval] ?? "";
            if (catname !== "") break;		// if found catname then break
        }

        let subcatname = "";
        let subtag = Conf.category_sub?.[mainkey] ?? "";	// ex: {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}

        if (subtag !== "") {
            for (let subkey of Object.keys(subtag)) {		// subkey: ex: religion
                if (subcatname !== "") break;
                for (let subval of Object.keys(subtag[subkey])) {	// subval: ex: shinto
                    subcatname = (tags[subkey] == subval) ? (subtag[subkey][subval] ?? "") : "";
                    if (subcatname !== "") break;
                }
            }
        }

        if (catname === "") {
            console.log("poiMarker: getCatnames: no key: " + mainkey + "," + mainval + " / " + tags.id);
            catname = glot?.get?.("undefined") ?? "";
        }

        poiCont.cat_cache[tags.id] = [
            catname ?? "",
            subcatname ?? "",
            (mainkey && mainval) ? `${mainkey}=${mainval}` : ""
        ];

        return Array.from(poiCont.cat_cache[tags.id]);
    };

    get_wikiname(tags) {          							// get Wikipedia Name from tag
        let wikiname = tags["wikipedia"] ? tags["wikipedia"].split(':')[1] : "";	// value値の":"の右側を返す
        return wikiname;
    }
    list(targets) {              // DataTables向きのJsonデータリストを出力
        const bounds = GeoCont.get_L();
        let pois = poiCont.poi_filter(targets);     // targetsに指定されたpoiのみフィルター
        let datas = [];
        pois.geojson.forEach((node, idx) => {
            // Cached POIs remain available for existing markers, but only current-area
            // candidates belong in the selection list. Use the marker's actual position.
            const [lat, lng] = pois.latlng[idx] || [];
            if (!Number.isFinite(lat) || !Number.isFinite(lng)
                || lat < bounds.SE.lat || lat > bounds.NW.lat
                || lng < bounds.NW.lng || lng > bounds.SE.lng) return;
            let tags = node.properties;
            let name = tags.name == undefined ? "-" : tags.name;
            let category = poiCont.getCatnames(tags);
            category = `${category[0]}${category[1] !== "" ? "(" + category[1] + ")" : ""}`;
            category = category == "" ? "-" : category;
            let enable = pois.enable[idx];
            datas.push({ "osmid": node.id, "name": name, "category": category, "enable": enable });
        });
        datas.sort((a, b) => { return (a.between > b.between) ? 1 : -1 });
        return datas;
    }

    poi_filter(targets) {
        let tars = [], enas = [], lls = [];
        let geojson = poiCont.PoiData.geojson.filter(function (geojson_val, geojson_idx) {
            let found = false;
            for (let target_idx in poiCont.PoiData.targets[geojson_idx]) {
                if (targets.includes(poiCont.PoiData.targets[geojson_idx][target_idx])) {
                    tars.push(poiCont.PoiData.targets[geojson_idx])
                    lls.push(poiCont.latlngs[geojson_val.id]);
                    enas.push(poiCont.PoiData.enable[geojson_idx]);
                    found = true;
                    break;
                };
            };
            return found;
        });
        return { geojson: geojson, latlng: lls, targets: tars, enable: enas };
    };
};

class MarkerControl {
    constructor() {
        this.markers = {};			// SVGアイコン連想配列(filename,svg text)
    };

    iconStyle(baseSize, noframe = false, preset = Conf.effect.icon.preset || 'standard') {
        const subtle = preset === 'subtle';
        const glyphSize = Math.max(4, Math.round(Math.max(4, Number(baseSize) - (noframe ? 0 : 8)) * (subtle ? .8 : 1)));
        const framed = !noframe && preset !== 'unframed';
        const padding = framed ? (subtle ? 2 : 4) : 0;
        return { preset, glyphSize, framed, padding, size: glyphSize + padding * 2,
            stroke: subtle ? .6 : 1, strokeColor: subtle ? '#b5b5b5' : '#787878', radius: subtle ? 2 : 3 };
    }

    iconFrameSVG(style) {
        const { size, stroke, strokeColor, radius } = style;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect data-mapmaker-icon-frame="${style.preset}" x="${stroke / 2}" y="${stroke / 2}" width="${size - stroke}" height="${size - stroke}" rx="${radius}" fill="#ffffff" stroke="${strokeColor}" stroke-width="${stroke}"/></svg>`;
    }

    applyAppearance(marker) {
        const root = marker.getElement?.();
        const image = root?.querySelector('img[data-mapmaker-icon]');
        if (!image) return;
        image.dataset.iconOriginalSize ||= image.dataset.iconBaseSize;
        image.dataset.iconBaseSize = String(Number(image.dataset.iconOriginalSize) * (marker.mapmaker_icon_scale || 1));
        const style = this.iconStyle(image.dataset.iconBaseSize, image.dataset.iconNoframe === 'true', marker.mapmaker_appearance);
        image.dataset.iconPreset = style.preset;
        image.classList.toggle('icon_normal', style.framed);
        Object.assign(image.style, { width: `${style.size}px`, height: `${style.size}px`, padding: `${style.padding}px`,
            boxSizing: 'border-box', objectFit: 'contain', flexShrink: '0',
            backgroundImage: style.framed ? `url("data:image/svg+xml,${encodeURIComponent(this.iconFrameSVG(style))}")` : 'none',
            backgroundSize: '100% 100%' });
        // Adjust the anchor, not the geographical position or dragged position.
        const inner = root.firstElementChild;
        inner.style.left = `${-style.size / 2}px`;
        inner.style.top = `${-style.size / 2}px`;
        const label = root.querySelector('span.icon');
        root.style.width = `${style.size + (label?.getBoundingClientRect().width || 0)}px`;
        root.style.height = `${style.size}px`;
    }

    setAppearance(preset) {
        if (!['standard', 'unframed', 'subtle'].includes(preset)) return;
        Conf.effect.icon.preset = preset;
        document.querySelectorAll('#mapid .mapmaker-marker').forEach(root => {
            if (root.mapmakerMarker) {
                delete root.mapmakerMarker.mapmaker_appearance;
                this.applyAppearance(root.mapmakerMarker);
            }
        });
        if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview();
    }

    changeAppearance(target, osmid, preset) {
        if (!['standard', 'unframed', 'subtle'].includes(preset)) return;
        let marker = this.markers[target]?.find(value => (Array.isArray(value) ? value[0] : value).mapmaker_id === osmid);
        if (Array.isArray(marker)) marker = marker[0];
        if (!marker) return;
        marker.mapmaker_appearance = preset;
        this.applyAppearance(marker);
        if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview();
    }

    changeSize(target, osmid, value) {
        const scale = Number(value);
        if (![0.75, 1, 1.5].includes(scale)) return;
        let marker = this.markers[target]?.find(value => (Array.isArray(value) ? value[0] : value).mapmaker_id === osmid);
        if (Array.isArray(marker)) marker = marker[0];
        if (!marker) return;
        marker.mapmaker_icon_scale = scale;
        this.applyAppearance(marker);
        if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview();
    }

    have(target) {						// Markerか確認(true: marker)
        let keys = Object.keys(Conf.osm);
        let markers = keys.filter(key => Conf.osm[key].marker !== undefined);
        return markers.some(key => key == target);
    }

    set(target) {						// Poi表示
        console.log("Marker.set: " + target);
        Marker.delete(target);
        Marker.markers[target] = [];
        let pois = poiCont.get_target(target);
        if (pois.geojson !== undefined) {
            pois.geojson.forEach(function (geojson, idx) {
                let poi = { "geojson": pois.geojson[idx], "targets": pois.targets[idx], "latlng": pois.latlng[idx], "enable": pois.enable[idx] };
                if (poi.enable) {
                    Marker.#make_popup({ target: target, poi: poi, langname: 'name' }).then(marker => {
                        if (marker !== undefined) marker.forEach(val => Marker.markers[target].push(val));
                    });
                };
            });
        };
    }

    get(target, osmid) {				// Poi取得
        let idx = Marker.markers[target].findIndex(val => val.mapmaker_id == osmid);
        let marker = Marker.markers[target][idx];
        return marker;
    }

    qr_add(target, osmid, url, latlng, data) {
        let wsize = 128, hsize = 128, asize = 640;
        let idx = Marker.markers[target].findIndex(val => val.mapmaker_id == osmid);
        let qrcode = new QRCode({ content: url, join: true, container: "svg", width: wsize, height: hsize });
        let svg = qrcode.svg();
        const content = document.createElement('div');
        content.className = 'd-flex qr_code';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'wiki-article-close';
        close.setAttribute('aria-label', glot.get('button_close'));
        close.textContent = '✕';
        const qr = document.createElement('div');
        qr.className = 'p-1 bg-light flex-row';
        // QRCode generates the SVG from a validated Wikipedia URL.
        qr.innerHTML = svg;
        const article = document.createElement('div');
        article.className = 'p-2 bg-light';
        const text = document.createElement('span');
        text.textContent = String(data[0] || '') + glot.get('source_wikipedia');
        article.appendChild(text);
        const thumbnail = document.createElement('div');
        thumbnail.className = 'p-2 bg-light';
        const source = this.safeImageURL(data[1]?.source, true);
        if (source) {
            const image = document.createElement('img');
            image.height = hsize;
            image.src = source;
            thumbnail.appendChild(image);
        }
        content.append(close, qr, article, thumbnail);
        let icon = MapEngine.divIcon({ className: 'icon', iconSize: [asize, hsize], html: content });
        let qr_marker = MapEngine.marker(new MapEngine.LatLng(latlng.lat, latlng.lng), { icon: icon, draggable: true, autoPanOnFocus: false });
        qr_marker.addTo(map);
        qr_marker.mapmaker_id = osmid + "-qr";
        qr_marker.mapmaker_key = target;
        qr_marker.mapmaker_svg = qrcode.svg;
        Marker.markers[target][idx] = [Marker.markers[target][idx], qr_marker];
        // Export rebuilds QR, article text and image separately; this DOM button is not exported.
        const closeButton = qr_marker.getElement().querySelector('.wiki-article-close');
        for (const event of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) {
            closeButton.addEventListener(event, event => event.stopPropagation());
        }
        closeButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const index = Marker.markers[target].findIndex(entry => Array.isArray(entry) && entry.includes(qr_marker));
            if (index < 0) return;
            const remaining = Marker.markers[target][index].filter(marker => marker !== qr_marker);
            Marker.markers[target][index] = remaining.length === 1 ? remaining[0] : remaining;
            map.removeLayer(qr_marker);
        });
        map.closePopup();
    }

    change_lang(target, osmid, lang) {
        let idx = Marker.markers[target].findIndex(vals => {
            let val = vals.length == undefined ? vals : vals[0];
            return val.mapmaker_id == osmid;
        });
        let marker = Marker.markers[target][idx];
        if (marker.length > 1) marker = marker[0];		// markerが複数の時への対応（qr_codeなど）
        let poi = poiCont.get_osmid(marker.mapmaker_id);
        let geojson = poi.geojson;
        const tags = geojson.properties.tags || geojson.properties;
        let name = tags[lang] == undefined ? "" : tags[lang];
        if (name == "") {
            winCont.modal_open({
                "title": glot.get("change_lang_error_title"), "message": glot.get("change_lang_error_message"),
                "mode": "close", "callback_close": () => winCont.closeModal()
            });
        } else {
            map.closePopup();
            marker.off('click');
            marker.removeFrom(map);
            Marker.#make_popup({ target: target, poi: poi, langname: lang, filename: marker.mapmaker_icon, appearance: marker.mapmaker_appearance, iconScale: marker.mapmaker_icon_scale }).then(marker => { Marker.markers[target][idx] = marker[0] });
        }
    }

    change_icon(target, osmid, filename) {
        let idx = Marker.markers[target].findIndex(vals => {
            let val = vals.length == undefined ? vals : vals[0];
            return val.mapmaker_id == osmid;
        });
        let marker = Marker.markers[target][idx];
        if (marker.length > 1) marker = marker[0];		// markerが複数の時への対応（qr_codeなど）
        let poi = poiCont.get_osmid(marker.mapmaker_id);
        map.closePopup();
        marker.off('click');
        marker.removeFrom(map);
        Marker.#make_popup({ target: target, poi: poi, filename: filename, langname: marker.mapmaker_lang, appearance: marker.mapmaker_appearance, iconScale: marker.mapmaker_icon_scale }).then(marker => { Marker.markers[target][idx] = marker[0] });
    }

    set_size(size, view) {
        let icon_xy = Math.ceil(size * Conf.default.icon.scale);
        Conf.effect.text.size = size;		// set font size 
        Conf.effect.text.view = view;
        Conf.effect.icon.x = icon_xy;		// set icon size
        Conf.effect.icon.y = icon_xy;
    }

    center(osmid) {
        Conf.default.Circle.radius = Math.pow(2, 21 - map.getZoom());
        let latlng = poiCont.get_osmid(osmid).latlng;
        map.highlightLocation(latlng, Conf.default.Circle);
    }

    async clearAll() {
        // Native marker removal touches DOM and MapLibre state; keep each task short.
        let deadline = performance.now() + 8;
        for (const target of Object.keys(this.markers)) {
            const entries = this.markers[target];
            this.markers[target] = [];
            for (const entry of entries) for (const marker of (Array.isArray(entry) ? entry : [entry])) {
                map.removeLayer(marker);
                if (performance.now() >= deadline) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    deadline = performance.now() + 8;
                }
            }
        }
        map.closePopup();
    }

    delete(target, osmid) {														// Marker delete * don't set PoiData
        if (osmid == undefined || osmid == "") {	// all osmid
            if (Marker.markers[target] !== undefined) {
                Marker.markers[target].forEach(marker => delmaker(marker));
                Marker.markers[target] = [];
            };
        } else {									// delete osmid
            let idx = Marker.markers[target].findIndex(vals => {
                let val = vals.length == undefined ? vals : vals[0];
                return val.mapmaker_id == osmid;
            });
            let marker = Marker.markers[target][idx];
            delmaker(marker);
        };
        map.closePopup();

        function delmaker(marker) {	// 実際にマーカーを消す処理
            if (marker.length == undefined) { map.removeLayer(marker); return };
            marker.forEach(m => map.removeLayer(m));								// qr_code で markerが複数ある場合
        };
    }

    safeImageURL(value, wikipedia = false) {
        try {
            const url = new URL(value, document.baseURI);
            if (url.username || url.password) return "";
            if (wikipedia) return url.protocol === 'https:' && url.hostname === 'upload.wikimedia.org' ? url.href : "";
            return url.origin === new URL(document.baseURI).origin && ['http:', 'https:'].includes(url.protocol) ? url.href : "";
        } catch { return ""; }
    }

    markerContent(name, filename, noframe = false) {
        const content = document.createElement('div');
        content.className = 'd-flex align-items-center';
        const image = document.createElement('img');
        image.setAttribute('data-mapmaker-icon', '');
        image.setAttribute('data-icon-base-size', Conf.effect.icon.x);
        image.setAttribute('data-icon-noframe', String(noframe));
        image.className = noframe ? '' : 'icon_normal';
        image.style.width = `${Conf.effect.icon.x}px`;
        image.style.height = `${Conf.effect.icon.y}px`;
        const source = this.safeImageURL(filename);
        if (source) image.src = source;
        image.setAttribute('icon-name', String(name));
        content.appendChild(image);
        if (name !== '' && Conf.effect.text.view) {
            const label = document.createElement('span');
            label.className = 'icon';
            label.style.fontSize = `${Conf.effect.text.size}px`;
            label.textContent = String(name);
            content.appendChild(label);
        }
        return content;
    }

    #make_popup(params) {	// markerは複数返す時がある
        return new Promise((resolve, reject) => {
            let categorys = Object.keys(Conf.category), filename, noframe = false;
            let tags = params.poi.geojson.properties.tags == undefined ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
            let name = tags[params.langname] == undefined ? tags.name : tags[params.langname];
            let step = tags.step_count !== undefined ? tags.step_count + glot.get("step_count") : "";	// step count
            name = (name == "" || name == undefined) ? "" : name;
            name = (step !== "" && name !== "") ? name + "(" + step + ")" : (step !== "" ? step : name);
            switch (params.target) {
                case "wikipedia":		// wikipedia
                    filename = params.filename == undefined ? Conf.osm.wikipedia.marker : params.filename;
                    name = String(tags[Conf.osm.wikipedia.tag] || '').split(':').slice(1).join(':');
                    let icon = MapEngine.divIcon({ className: '', iconAnchor: [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], html: this.markerContent(name, filename) });
                    let marker = MapEngine.marker(new MapEngine.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true, autoPanOnFocus: false });
                    marker.addTo(map).on('click', e => { this.#popup_icon(e) });
                    marker.mapmaker_id = params.poi.geojson.id;
                    marker.mapmaker_key = params.target;
                    marker.mapmaker_lang = tags[Conf.osm.wikipedia.tag];
                    marker.mapmaker_icon = filename;
                    marker.mapmaker_appearance = params.appearance;
                    marker.mapmaker_icon_scale = params.iconScale;
                    this.applyAppearance(marker);
                    resolve([marker]);
                    break;
                default:
                    // get marker icon filename
                    let keyn, keyv;
                    let keyns = categorys.filter(key => tags[key] !== undefined);
                    for (const key of keyns) {
                        if (Conf.marker.tag[key] !== undefined) {		// マーカーがある場合
                            keyn = key;
                            keyv = Conf.marker.tag[keyn][tags[keyn]];
                            break;
                        }
                    };
                    if (keyn !== undefined && keyv !== undefined) {	// in category
                        if (params.filename == undefined) {
                            filename = Conf.icon.path + "/" + Conf.marker.tag[keyn][tags[keyn]];
                            // get sub marker icon(神社とお寺など)
                            let subtag = Conf.marker.subtag[tags[keyn]];		// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
                            if (subtag !== undefined) {		// サブタグが存在する場合
                                Object.keys(subtag).forEach((sval1) => {		// sval1: ex: religion
                                    Object.keys(subtag[sval1]).forEach((sval2) => {			// sval2: ex: shinto
                                        if (tags[sval1] == sval2) filename = Conf.icon.path + "/" + subtag[sval1][sval2];
                                    });
                                });
                            };
                        } else {
                            filename = params.filename;	// icon change
                        };
                        noframe = filename.indexOf(",") > 0 ? true : false;
                        filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                        let span_width = name !== "" ? String(name).length * Conf.effect.text.size : 0;
                        let icon = MapEngine.divIcon({ className: '', iconSize: [Conf.effect.icon.x + span_width, Conf.effect.icon.y], iconAnchor: [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], html: this.markerContent(name, filename, noframe) });
                        let marker = MapEngine.marker(new MapEngine.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true, autoPanOnFocus: false });
                        marker.addTo(map).on('click', e => { this.#popup_icon(e) });
                        marker.mapmaker_id = params.poi.geojson.id;
                        marker.mapmaker_key = params.target;
                        marker.mapmaker_lang = params.langname;
                        marker.mapmaker_icon = filename;
                        marker.mapmaker_appearance = params.appearance;
                        marker.mapmaker_icon_scale = params.iconScale;
                        this.applyAppearance(marker);
                        resolve([marker]);
                    };
                    break;
            };
        });
    };

    #popup_icon(ev) {
        const id = ev.target.mapmaker_id, key = ev.target.mapmaker_key, lang = ev.target.mapmaker_lang;
        const properties = poiCont.get_osmid(id).geojson.properties;
        const tags = properties.tags || properties;
        const content = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = key === Conf.osm.wikipedia.tag ? String(tags[Conf.osm.wikipedia.tag] || '') : String(tags.name || glot.get('marker_noname'));
        content.append(label, document.createElement('br'));
        const button = (text, callback) => {
            const element = document.createElement('button');
            element.className = 'btn btn-sm m-2';
            element.textContent = glot.get(text);
            element.addEventListener('click', callback);
            content.appendChild(element);
        };
        button('marker_change', () => mapMaker.poi_marker_change(key, id));
        button('marker_delete', () => mapMaker.poi_del(key, id));
        if (key === Conf.osm.wikipedia.tag) button('qrcode_make', () => mapMaker.qr_add(key, id));
        else {
            const next = lang === 'name' ? 'name:en' : 'name';
            if (typeof tags[next] === 'string' && tags[next].trim()) {
                button(next === 'name:en' ? 'marker_to_en' : 'marker_to_ja', () => Marker.change_lang(key, id, next));
            }
        }
        const select = (text, choices, selected, callback) => {
            const label = document.createElement('label');
            label.className = 'd-block m-2';
            label.textContent = glot.get(text);
            const menu = document.createElement('select');
            menu.className = 'form-select form-select-sm mt-1';
            for (const [value, text] of choices) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = glot.get(text);
                option.selected = value === selected;
                menu.appendChild(option);
            }
            menu.addEventListener('change', () => callback(menu.value));
            label.appendChild(menu);
            content.appendChild(label);
        };
        select('marker_appearance', ['standard', 'unframed', 'subtle'].map(value => [value, 'icon_appearance_' + value]),
            ev.target.mapmaker_appearance || Conf.effect.icon.preset || 'standard', value => Marker.changeAppearance(key, id, value));
        select('marker_size', [[0.75, 'small'], [1, 'standard'], [1.5, 'large']].map(([value, text]) => [value, 'marker_size_' + text]),
            ev.target.mapmaker_icon_scale || 1, value => Marker.changeSize(key, id, value));
        MapEngine.responsivePopup({ keepInView: true }).setContent(content).setLatLng(ev.latlng).openOn(map);
        ev.target.openPopup();
        return false;
    }
}
