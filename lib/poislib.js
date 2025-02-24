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
        if (poiCont.cat_cache[tags.id] !== undefined) return Array.from(poiCont.cat_cache[tags.id]);  // 配列をコピーして返す(参照返しだと値が壊れる)
        let catname = "", mainkey = "", mainval = "";
        let mainkeys = Conf.category_keys.filter(key => (tags[key] !== undefined) && key !== "*");	// srarch tags
        if (mainkeys == undefined) return Conf.category.tag['*']['*'];
        for (mainkey of mainkeys) {
            mainval = tags[mainkey] == undefined ? "*" : tags[mainkey];
            catname = Conf.category[mainkey][mainval];
            catname = (catname !== undefined) ? catname : "";
            if (catname !== "") break;		// if found catname then break
        }

        let subcatname = "";
        if (mainkey == "healthcare") {
            console.log("found")
        }
        let subtag = Conf.category_sub[mainkey]										// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
        if (subtag !== undefined) {
            for (let subkey of Object.keys(subtag)) {								// subkey: ex: religion
                if (subcatname !== "") break
                for (let subval of Object.keys(subtag[subkey])) { 					// subval: ex: shinto
                    subcatname = (tags[subkey] == subval) ? subtag[subkey][subval] : ""
                    if (subcatname !== "") break
                }
            }
        }
        if (catname == "") {
            console.log("poiMarker: getCatnames: no key: " + mainkey + "," + mainval + " / " + tags.id);
            catname = glot.get("undefined");
        };
        poiCont.cat_cache[tags.id] = [catname, subcatname, mainkey + "=" + mainval];
        return poiCont.cat_cache[tags.id];
    };

    get_wikiname(tags) {          							// get Wikipedia Name from tag
        let wikiname = tags["wikipedia"] ? tags["wikipedia"].split(':')[1] : "";	// value値の":"の右側を返す
        return wikiname;
    }
    list(targets) {              // DataTables向きのJsonデータリストを出力
        let pois = poiCont.poi_filter(targets);     // targetsに指定されたpoiのみフィルター
        let datas = [];
        pois.geojson.forEach((node, idx) => {
            let tags = node.properties;
            let name = tags.name == undefined ? "-" : tags.name;
            let category = poiCont.getCatnames(tags);
            category = `${category[0]}${category[1] !== "" ? "(" + category[1] + ")" : ""}`;
            let enable = pois.enable[idx];
            if (category !== "") datas.push({ "osmid": node.id, "name": name, "category": category, "enable": enable });
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
        let icon = L.divIcon({
            "className": "icon", "iconSize": [asize, hsize],
            "html":
                `<div class="d-flex qr_code">
					<div class="p-1 bg-light flex-row">${svg}</div>
					<div class="p-2 bg-light">
						<span>${data[0]}${glot.get("source_wikipedia")}</span>
					</div>
					<div class="p-2 bg-light">
						${data[1] == undefined ? "" : `<img height="${hsize}px" src="${data[1].source}">`}
					</div>
				</div>`
        });
        let qr_marker = L.marker(new L.LatLng(latlng.lat, latlng.lng), { icon: icon, draggable: true, autoPanOnFocus: false });
        qr_marker.addTo(map);
        qr_marker.mapmaker_id = osmid + "-qr";
        qr_marker.mapmaker_key = target;
        qr_marker.mapmaker_svg = qrcode.svg;
        Marker.markers[target][idx] = [Marker.markers[target][idx], qr_marker];
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
        let name = geojson.properties[lang] == undefined ? "" : geojson.properties[lang];
        if (name == "") {
            winCont.modal_open({
                "title": glot.get("change_lang_error_title"), "message": glot.get("change_lang_error_message"),
                "mode": "close", "callback_close": () => winCont.closeModal()
            });
        } else {
            map.closePopup();
            marker.off('click');
            marker.removeFrom(map);
            Marker.#make_popup({ target: target, poi: poi, langname: lang }).then(marker => { Marker.markers[target][idx] = marker[0] });
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
        Marker.#make_popup({ target: target, poi: poi, filename: filename }).then(marker => { Marker.markers[target][idx] = marker[0] });
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
        let circle = L.circle(latlng, Conf.default.Circle).addTo(map);
        setTimeout(() => map.removeLayer(circle), Conf.default.Circle.timer);
    }

    clearAll() { Object.keys(Marker.markers).forEach((target) => Marker.delete(target)) }	// all delete

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
                    name = tags[Conf.osm.wikipedia.tag].split(':')[1];
                    let html = `<div class="d-flex"><img style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" class="icon_normal" src="${filename}" icon-name="${name}">`;
                    if (name !== "" && Conf.effect.text.view) html = `${html}<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
                    let icon = L.divIcon({ "className": "", "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
                    let marker = L.marker(new L.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true, autoPanOnFocus: false });
                    marker.addTo(map).on('click', e => { this.#popup_icon(e) });
                    marker.mapmaker_id = params.poi.geojson.id;
                    marker.mapmaker_key = params.target;
                    marker.mapmaker_lang = tags[Conf.osm.wikipedia.tag];
                    marker.mapmaker_icon = filename;
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
                            filename = Conf.marker.path + "/" + Conf.marker.tag[keyn][tags[keyn]];
                            // get sub marker icon(神社とお寺など)
                            let subtag = Conf.marker.subtag[tags[keyn]];		// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
                            if (subtag !== undefined) {		// サブタグが存在する場合
                                Object.keys(subtag).forEach((sval1) => {		// sval1: ex: religion
                                    Object.keys(subtag[sval1]).forEach((sval2) => {			// sval2: ex: shinto
                                        if (tags[sval1] == sval2) filename = Conf.marker.path + "/" + subtag[sval1][sval2];
                                    });
                                });
                            };
                        } else {
                            filename = params.filename;	// icon change
                        };
                        noframe = filename.indexOf(",") > 0 ? true : false;
                        filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                        let html = `<div class="d-flex"><img class="${noframe ? "" : "icon_normal"}" style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" src="${filename}" icon-name="${name}">`;
                        let span = `<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
                        if (name !== "" && Conf.effect.text.view) html += span;
                        let span_width = name !== "" ? name.length * Conf.effect.text.size : 0;
                        let icon = L.divIcon({ "className": "", "iconSize": [Conf.effect.icon.x + span_width, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
                        let marker = L.marker(new L.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true, autoPanOnFocus: false });
                        marker.addTo(map).on('click', e => { this.#popup_icon(e) });
                        marker.mapmaker_id = params.poi.geojson.id;
                        marker.mapmaker_key = params.target;
                        marker.mapmaker_lang = params.langname;
                        marker.mapmaker_icon = filename;
                        resolve([marker]);
                    };
                    break;
            };
        });
    };

    #popup_icon(ev) {	// PopUpを表示するイベント
        let popcont;
        let id = ev.target.mapmaker_id;
        let key = ev.target.mapmaker_key;
        let lang = ev.target.mapmaker_lang;
        let tags = poiCont.get_osmid(id).geojson.properties;
        let chg_mkr = `<button class='btn btn-sm m-2' onclick='Mapmaker.poi_marker_change("${key}","${id}")'>${glot.get("marker_change")}</button>`;
        let del_btn = `<button class='btn btn-sm m-2' onclick='Mapmaker.poi_del("${key}","${id}")'>${glot.get("marker_delete")}</button>`;
        if (key == Conf.osm.wikipedia.tag) {		// Wikipedia時のPopUp
            let qr_btn = `<button class='btn btn-sm m-2' onclick='Mapmaker.qr_add("wikipedia","${id}")'>${glot.get("qrcode_make")}</button>`;
            popcont = tags[Conf.osm.wikipedia.tag] + "<br>" + chg_mkr + del_btn + "<br>" + qr_btn;
        } else {									// その他
            let name = tags.name == undefined ? "" : tags.name;
            let chg_eng = `<button class='btn btn-sm m-2' onclick='Marker.change_lang("${key}","${id}","name:en")'>${glot.get("marker_to_en")}</button>`;
            let chg_jpn = `<button class='btn btn-sm m-2' onclick='Marker.change_lang("${key}","${id}","name")'>${glot.get("marker_to_ja")}</button>`;
            popcont = (name == '' ? glot.get("marker_noname") : name) + "<br>" + chg_mkr + del_btn + "<br>" + (lang == "name" ? chg_eng : chg_jpn);
        };
        L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
        ev.target.openPopup();
        return false;
    };
}
