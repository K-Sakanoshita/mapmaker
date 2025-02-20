/*	Main Process */
"use strict";

class MapMaker {
    constructor() {
        this.maps = []
        this.customMode = false
        this.initBasemenu
        this.initClearhtml
        this.viewLicense = false
        this.selectMode = ""
        this.copyrights = []
        this.colorPicker = []
    }
    // Initialize
    init(menuhtml) {
        MapCont.init();
        MapCont.controlAdd("bottomleft", "zoomlevel", "<div><.div>", "");
        Mapmaker.makemenu(menuhtml);										// Make edit menu
        winCont.menulist_make();
        Mapmaker.zoom_view();																// Zoom 
        map.on('zoomend', () => Mapmaker.zoom_view());										// ズーム終了時に表示更新
        document.getElementById("search_input").placeholder = glot.get("address")			// set placeholder
        document.getElementById("search_input").previousElementSibling.innerHTML = glot.get("search")	// set button name
        document.getElementById("search_input").addEventListener('change', (e) => { Mapmaker.searchPoi(e.target.value) });	// Address Search
    }

    // 利用しているデータセットをCopyrightに反映
    addCopyright(text) { this.copyrights = [...new Set([...this.copyrights, text])] }

    // 利用しているデータセットをCopyright表示用に返す
    getCopyright() { return this.copyrights.length > 0 ? " | " + this.copyrights.join(' ') : "" }

    // 基本メニューの作成 menuhtml:指定したHTMLで左上に作成 menuhtmlが空の時は過去のHTMLから復元
    makemenu(menuhtml) {
        console.log("Start: make menu.")
        if (menuhtml !== undefined) {
            let basemenu = L.control({ position: "topleft" });			// Add BaseMenu
            basemenu.onAdd = function () {
                this.ele = L.DomUtil.create('div');
                this.ele.id = "basemenu";
                return this.ele;
            };
            basemenu.addTo(map);
            document.getElementById("basemenu").innerHTML = menuhtml;
            this.initClearhtml = document.getElementById("clear_map").outerHTML;	// basemenuから切り離し
            document.getElementById("clear_map").remove();
            this.initBasemenu = document.getElementById("basemenu").outerHTML;

            let clearbtn = L.control({ position: "topright" });			// Add BaseMenu
            clearbtn.onAdd = function () {
                this.ele = L.DomUtil.create('div');
                this.ele.id = "clearmenu";
                this.ele.innerHTML = Mapmaker.initClearhtml;
                return this.ele;
            };
            clearbtn.addTo(map);
        } else {
            for (let key of LayerCont.styles) $(`[id^=${key}_]`).off();		// Delete Key_* events
            $("#basemenu").html(this.initBasemenu);
        };

        console.log("Start: make marker.")
        let keys = Object.keys(Conf.osm);							// マーカー追加メニュー作成
        keys.forEach(key => {
            if (Conf.osm[key].marker !== undefined) {
                let html = `<li class="d-inline-flex align-items-center ms-2">`;
                html += `<img class="me-1" src="./${Conf.osm[key].marker}" width="24px">`;
                html += `<span class="dropdown-item drop_button btn ps-1 me-1" onclick="Mapmaker.addPoi('${key}')">`;
                html += `${glot.get("marker_" + key)}</span></li>\n`;
                $("#menu_list").append(html);
            };
        });

        console.log("Start: make custom panel.")
        for (let key of Conf.styleOrder) {									// make style panel
            let key_layer = `#${key}_layer`;
            let key_line = `#${key}_line`;
            let copyobj = document.getElementById("AAA").cloneNode(true);
            copyobj.getElementsByClassName("custom_label")[0].innerHTML = glot.get("menu_" + key);
            copyobj.querySelector('#AAA_color').setAttribute('id', key + "_color");
            copyobj.querySelector('#AAA_line').setAttribute('value', Layers[key].width);
            copyobj.querySelector('#AAA_line').setAttribute('id', key + "_line");
            copyobj.querySelector('#AAA_layer').setAttribute('id', key + "_layer");
            if (key == "background") copyobj.querySelector(key_line).outerHTML = "<span class='input-hidden'></span>";
            copyobj.setAttribute('id', key);
            document.getElementById("custom_map").appendChild(copyobj);

            this.colorPicker[key] = new Alwan(`#${key}_color`, {
                preview: false,
                copy: false,
                inputs: { hex: false, rgb: true, hsl: false },
                color: Layers[key].color,
                classname: "colorPalette",
                swatches: Conf.default.swatches,
            });
            this.colorPicker[key].on('change', (ev) => {
                Layers[key].color = ev.hex;
                if (key_layer.indexOf("background") > -1) {
                    $("#mapid").css('background-color', ev.hex);
                    $("#mapid").removeClass("bg-clear");
                };
                $(`#${key}_color`).attr('value', ev.hex);
                $(`#${key}_color`).removeClass('bg-clear');
                Layers[key].opacity = 1;
                Layers[key].color = ev.hex;
                Layers[key].color_dark = chroma(ev.hex).darken(Conf.default.ColorDarken).hex();
                if (document.getElementById(key + "_line") !== null) Layers[key].width = document.getElementById(key + "_line").value; //width;
                LayerCont.updateLayer(key);
            });

            // 幅変更時のイベント定義
            $(key_line).on('change', (event) => {
                Layers[key].width = event.target.value;; //width;
                LayerCont.updateLayer(key);
            });
            // 表示変更時のイベント定義
            $(`#${key}_layer`).on('click', function () {
                if (key_layer.indexOf("background") > -1) {
                    $("#mapid").css('background-color', "");
                    $("#mapid").addClass("bg-clear");
                    $("#background_color").css('background-color', "");
                    $("#background_color").addClass("bg-clear");
                    Layers["background"].opacity = 0;
                } else {
                    let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;
                    $(key_layer).children().toggleClass("fa-trash-alt fa-undo");
                    LayerCont.makeLayer(key, view);
                }
            });
        };
        $("#AAA").remove();
        console.log("Start: make glot render.")
        glot.render();
    }


    // Clear Menu
    clearMenu() {
        for (let key of LayerCont.styles) {
            this.colorPicker[key].setColor(Layers[key].color);
            if (key !== "background") {
                document.getElementById(`${key}_line`).value = Layers[key].width;
            }
        }
    }

    // About Street Map Maker's license
    licence(once) {
        if ((once == 'once' && this.viewLicense == false) || once == undefined) {
            let msg = { msg: glot.get("licence_message") + glot.get("more_message"), ttl: glot.get("licence_title") };
            winCont.modal_open({ "title": msg.ttl, "message": msg.msg, "mode": "close", callback_close: winCont.closeModal });
            this.viewLicense = true;
        };
    }

    // make custom map
    make(query_date) {
        let latlng = map.getCenter();
        while (latlng.lng >= 180) latlng.lng -= 360;
        while (latlng.lng <= -180) latlng.lng += 360;
        map.setView(latlng);
        let nowzoom = map.getZoom(), def_msg;
        if (nowzoom < Conf.default.MinZoomLevel) return false;
        if (typeof (query_date) == "undefined") query_date = "";
        def_msg = glot.get("loading_message");
        winCont.modal_open({ "title": glot.get("loading_title"), "message": def_msg, "mode": "" });
        winCont.spinner(true);

        // URL logging
        let href = location.href.replaceAll("#", "%23");
        Basic.getData('https://script.google.com/macros/s/AKfycbyuuTCJ4qPcSFCRmSlrhwlHDK8uFYUzSkF5EPoklOtShPadnyHT28P1gj8awGeWKyISGQ/exec?URL=' + href);

        var targets = [];
        var progress = function (data_length) {
            def_msg += "<br>Data Loading... " + Math.trunc(data_length / 1024).toLocaleString() + "KBytes."
            winCont.modal_text(def_msg, false)
        };
        for (let key of LayerCont.styles) if (Conf.style[LayerCont.palette][key].zoom <= nowzoom) targets.push(key);
        Basic.retry(() => overPassCont.get(targets, progress), 5).then((ovasnswer) => {
            winCont.modal_text("<br>Data Loading Complate... ", true);
            targets.forEach(target => {
                let geojson = overPassCont.get_target(ovasnswer, target);
                if (geojson.length > 0) {
                    let fil_geojson = {	// node以外なのにPoint以外だとfalse(削除)
                        /*
                        "features": geojson.filter((val) => {
                            return (Conf.style[LayerCont.palette][target].type !== "node") ? val.geometry.type !== "Point" : true;
                        })
                        */
                        "features": geojson
                    };
                    if (target == "river") fil_geojson = CoastLine.merge(fil_geojson.features);
                    Layers[target].geojson = fil_geojson.features;
                };
            });
            for (let key of LayerCont.styles) {
                if (Layers[key].geojson) { winCont.modal_text(`<br>Map Writeing... ${key}`, true); LayerCont.makeLayer(key); };
            };
            Mapmaker.custom(true);
            winCont.closeModal().then(() => {
                console.log("Mapmaker: make: end");
            })
        })/*.catch(() => {
				let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.clearAll() };
				winCont.modal_open(modal);
			});*/
        return;
    }

    // Search Address(Japan Only)
    searchPoi(keyword) {
        const errorMsg = function () {
            winCont.modal_open({
                title: glot.get("addressnotfound_title"), message: glot.get("addressnotfound_body"),
                mode: "close", callback_close: () => { winCont.closeModal() }
            });
        }
        getLatLng(keyword, (latlng) => {
            console.log(latlng);
            if (latlng.level === 0) {                   // 見つからず
                errorMsg();
            } else if (latlng.level === 1) {            // 都道府県
                map.setZoom(Conf.default.SearchZoom - 6);
                map.panTo(Conf.prefecture[latlng.pref]);
            } else if (latlng.level === 2) {            // 市区町村
                const keys = Object.keys(Conf.allPrefecture)
                const values = Object.values(Conf.allPrefecture)
                const index = values.findIndex(value =>
                    value.prefecture === latlng.pref && (
                        value.city === latlng.city ||
                        latlng.city.endsWith(`郡${value.city}`) // 郡名が含まれていないため
                    )
                )
                const code = keys[index].substring(0, 5)
                const endpoint = `https://geolonia.github.io/japanese-admins/${code.substring(0, 2)}/${code}.json`
                fetch(endpoint).then(res => {
                    return res.json()
                }).then(data => {
                    const center = turf.centroid(data).geometry.coordinates;    // turfで中心を探す
                    map.setZoom(Conf.default.SearchZoom - 3);
                    map.panTo([center[1], center[0]]);
                })
            } else {                                    // 町名
                map.setZoom(Conf.default.SearchZoom);
                map.panTo(latlng);
            }
        }, e => {
            errorMsg();
        })
    }

    // 情報（アイコンなど）を地図に追加
    addPoi(key) {
        winCont.modal_open({ "title": glot.get("loading_title"), "message": glot.get("loading_message"), "mode": "" }).then(() => {
            winCont.spinner(true);
            if (Conf.osm[key].file !== undefined) {		// "file"がある場合(CSVなど)
                $.get(Conf.osm[key].file).then((csv) => {
                    let geojsons = GeoCont.csv2geojson(csv, key);
                    let targets = geojsons.map(() => [key]);
                    let copyright = Conf.osm[key].copyright;
                    Mapmaker.addCopyright(copyright);
                    winCont.closeModal().then(() => {
                        poiset(key, { "geojson": geojsons, "targets": targets });
                    })
                });
            } else {
                overPassCont.get([key])
                    .then((ovasnswer) => {
                        if (ovasnswer == undefined) {
                            let modal = {
                                "title": glot.get("nodata_title"), "message": glot.get("nodata_message"),
                                "mode": "close", "callback_close": () => winCont.closeModal()
                            };
                            winCont.modal_open(modal);
                        } else {
                            winCont.closeModal().then(() => {
                                poiset(key, ovasnswer);
                            })
                        };
                    })/*.catch(() => {
						let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.clearAll() };
						winCont.modal_open(modal);
					})*/
            };

            function poiset(key, answer) {
                let geojsons = { geojson: [], targets: [] };
                answer.geojson.forEach((geojson, idx) => {
                    let geo = geojson.geometry;
                    let cords; // = geo.coordinates;
                    cords = GeoCont.multi2flat(geo.coordinates, geo.type);	// ネスト構造のデータをフラット化
                    cords = GeoCont.flat2single(cords, geo.type);			// エリア/ライン => ポイント
                    cords = GeoCont.bboxclip([cords], true);				// 画面外のPOIは無視したgeojsonを作成
                    if (cords.length > 0) {
                        geojson.geometry.type = "Point";
                        if (cords[0][0] == NaN) console.log("NAN");
                        geojson.geometry.coordinates = cords[0];
                        geojsons.geojson.push(geojson);
                        geojsons.targets.push(answer.targets[idx]);
                    };
                });
                poiCont.addGeoJSON(geojsons);
                winCont.modal_select(key).then((slanswer) => {
                    poiCont.addGeoJSON(slanswer);
                    Marker.set(key);
                    winCont.closeModal().then(() => { console.log(`Mapmaker: Add: ${key} end`) })
                }).catch(() => console.log("addPoi: cancel"));
            };
        })
    }

    // delete poi
    poi_del(target, osmid) {
        let poi = poiCont.get_osmid(osmid);
        if (poi !== undefined) {
            poi.enable = false;
            poiCont.setPoiData(poi);
            Marker.delete(target, osmid);
        };
    }

    // Image List and select
    poi_marker_change(target, osmid, filename) {
        switch (filename) {
            case "":
            case undefined:
                let html = "", images = [];
                Object.keys(Conf.marker.tag).forEach(key1 => {
                    Object.keys(Conf.marker.tag[key1]).forEach((key2) => {
                        let filename = Conf.marker.path + "/" + Conf.marker.tag[key1][key2];
                        filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                        if (images.indexOf(filename) == -1) { images.push(filename) };
                    });
                });
                Object.values(Conf.marker_append.files).forEach(key1 => {
                    let filename = Conf.marker_append.path + "/" + key1;
                    filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
                    if (images.indexOf(filename) == -1) { images.push(filename) };
                });
                images = images.filter((x, i, self) => { return self.indexOf(x) === i });	//重複削除
                images.sort();
                Object.keys(images).forEach(fidx => { html += `<a href="#" onclick="Mapmaker.poi_marker_change('${target}','${osmid}','${images[fidx]}')"><img class="iconx2" src="${images[fidx]}"></a>` });
                winCont.modal_open({ "title": "", "message": html, "mode": "close", callback_close: winCont.closeModal });
                break;
            default:
                Marker.change_icon(target, osmid, filename);
                winCont.closeModal();
                break;
        };
    }

    qr_add(target, osmid) {
        let marker = Marker.get(target, osmid);
        if (marker !== undefined) {
            let wiki = marker.mapmaker_lang.split(':');
            let url = encodeURI(`https://${wiki[0]}.${Conf.osm.wikipedia.domain}/wiki/${wiki[1]}`);
            let pix = map.latLngToLayerPoint(marker.getLatLng());
            let ll2 = map.layerPointToLatLng(pix);
            Basic.getWikipedia(wiki[0], wiki[1]).then(data => Marker.qr_add(target, osmid, url, ll2, data));
        };
    }

    // Show/Hide Custom Panel(mode change)
    custom(mode) {
        switch (mode) {
            case true:
                map.doubleClickZoom.disable();
                for (let key of LayerCont.styles) {		// Show control if key is present
                    $('#' + key).hide();
                    let zoom = Conf.style[LayerCont.palette][key].zoom == undefined ? 0 : Conf.style[LayerCont.palette][key].zoom;
                    if (zoom <= map.getZoom()) $('#' + key).show();
                };
                $("#make_map").hide();
                ["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).show());
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
                $("#search_input").attr('disabled', 'disabled');
                MapCont.stop();
                Object.keys(this.maps).forEach(key => { if (map.hasLayer(this.maps[key])) { Layers["MAP"] = this.maps[key]; map.removeLayer(this.maps[key]) } });	// remove select layer
                if (Layers.background.opacity === 0) {		// set background
                    $("#mapid").addClass("bg-clear");
                } else {
                    $("#mapid").removeClass("bg-clear");
                    $("#background_color").css('background-color', Layers.background.color);
                };
                this.customMode = mode;
                Mapmaker.zoom_view();
                break;
            case false:
                map.doubleClickZoom.enable();
                $("#make_map").show();
                MapCont.start();
                ["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).hide());
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
                $("#search_input").attr('disabled', false);
                $("#mapid").removeClass("bg-clear");
                $("#background_color").css('background-color', "");
                this.customMode = mode;
                Mapmaker.zoom_view();
                this.copyrights = [];
                break;
        }
        return this.customMode;
    }

    // Area Select(A4)
    area_select(mode) {
        this.selectMode = mode;
        LayerCont.area_select(mode);
        return mode;
    }

    // save layers&pois
    save(type) {
        SVGCont.save({ type: type, mode: this.selectMode });
    }

    // View Zoom Level & Status Comment
    zoom_view() {
        let nowzoom = map.getZoom();
        let message = `${glot.get("zoomlevel")}${map.getZoom()} `;
        if (nowzoom < Conf.default.MinZoomLevel) {
            message += `<br>${glot.get("morezoom")}`;
            $("#make_map").hide();
        } else {
            if (nowzoom < Conf.default.LimitZoomLevel) message += `<br>${glot.get("morezoom2")}`;
            if (!Mapmaker.custom()) $("#make_map").show();
        };
        if (Mapmaker.custom()) message += `<br>${glot.get("custommode")}`;
        $("#zoomlevel").html("<h2 class='zoom'>" + message + "</h2>");
    }

    // Try Again
    clearAll() {
        winCont.modal_open({
            title: glot.get("restart_title"),
            message: glot.get("restart_message"),
            mode: "yesno",
            callback_yes: () => {
                Mapmaker.custom(false);
                overPassCont.clear();
                LayerCont.clearAll();
                Marker.clearAll();
                poiCont.clearAll();
                Mapmaker.clearMenu();
                winCont.closeModal();
            },
            callback_no: () => winCont.closeModal()
        });
    }
}
const Mapmaker = new MapMaker();
