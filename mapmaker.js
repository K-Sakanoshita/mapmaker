/*	Main Process */
"use strict";

class MapMaker {
    constructor() {
        this.maps = []
        this.customMode = false
        this.initClearhtml
        this.viewLicense = false
        this.selectMode = ""
        this.copyrights = []
        this.colorPicker = []
        this.roughPreviewTimer = null
        this.roughPreviewVersion = 0
        this.roughPreviewRendering = false
        this.roughPreviewPending = false
        this.exportInProgress = false
        this.basemenuResizeInitialized = false
        this.basemenuResizeFrame = null
    }
    // Initialize
    init(menuhtml) {
        MapCont.init();
        const roughPane = map.getPane("roughPreviewPane") || map.createPane("roughPreviewPane");
        roughPane.classList.add("leaflet-rough-preview-pane");
        roughPane.style.zIndex = "450";
        const resizeRoughPane = () => {
            const size = map.getSize();
            const mapPanePosition = L.DomUtil.getPosition(map.getPane("mapPane")) || L.point(0, 0);
            roughPane.style.width = `${size.x}px`;
            roughPane.style.height = `${size.y}px`;
            L.DomUtil.setPosition(roughPane, mapPanePosition.multiplyBy(-1));
        };
        resizeRoughPane();
        map.on("move resize", resizeRoughPane);
        const roughPreviewWindow = document.getElementById("roughPreviewWindow");
        if (roughPreviewWindow) roughPane.appendChild(roughPreviewWindow);
        MapCont.controlAdd("bottomleft", "zoomlevel", "<div><.div>", "");
        mapMaker.makemenu(menuhtml);										// Make edit menu
        mapMaker.initBasemenuResize();
        winCont.menulist_make();
        mapMaker.zoomMessage();																// Zoom 
        map.on('zoomend', () => mapMaker.zoomMessage());										// ズーム終了時に表示更新
        document.getElementById("search_input").placeholder = glot.get("address")			// set placeholder
        document.getElementById("search_input").previousElementSibling.innerHTML = glot.get("search")	// set button name
        document.getElementById("search_input").addEventListener('change', (e) => { mapMaker.searchPoi(e.target.value) });	// Address Search
    }

    rough_change() {
        const selected = document.getElementById("rough_enabled")?.checked === true;
        const enabled = selected && this.customMode;
        const previewWindow = document.getElementById("roughPreviewWindow");
        const preview = document.getElementById("roughPreview");
        const status = document.getElementById("roughPreviewStatus");
        document.getElementById("roughParameters")?.classList.toggle("d-none", !selected);
        for (const id of ["roughness", "bowing", "rough_fill_style"]) {
            const input = document.getElementById(id);
            if (input) input.disabled = !selected;
        }
        for (const id of ["roughness", "bowing"]) {
            const input = document.getElementById(id);
            const output = document.getElementById(`${id}_value`);
            if (input && output) output.value = Number(input.value).toFixed(1);
        }
        this.roughPreviewVersion++;
        clearTimeout(this.roughPreviewTimer);
        if (!enabled) {
            previewWindow?.classList.add("d-none");
            preview?.replaceChildren();
            status?.classList.add("d-none");
            this.roughPreviewPending = false;
            return;
        }
        previewWindow?.classList.remove("d-none");
        this.roughPreviewTimer = setTimeout(() => this.rough_preview(), 300);
    }

    rough_options() {
        const numberValue = (id, fallback) => {
            const value = Number(document.getElementById(id)?.value);
            if (!Number.isFinite(value)) return fallback;
            return Math.min(10, Math.max(0, value));
        };
        return {
            enabled: document.getElementById("rough_enabled")?.checked === true,
            roughness: numberValue("roughness", 1),
            bowing: numberValue("bowing", 1),
            fillStyle: ["hachure", "solid", "zigzag", "cross-hatch", "dots", "dashed", "zigzag-line"]
                .includes(document.getElementById("rough_fill_style")?.value)
                ? document.getElementById("rough_fill_style").value
                : "solid"
        };
    }

    async rough_preview() {
        const target = document.getElementById("roughPreview");
        const status = document.getElementById("roughPreviewStatus");
        if (!target || !this.rough_options().enabled) return;
        if (this.roughPreviewRendering) {
            this.roughPreviewPending = true;
            return;
        }

        const source = this.rough_preview_source();
        const version = this.roughPreviewVersion;
        const options = this.rough_options();
        this.roughPreviewRendering = true;
        this.roughPreviewPending = false;
        if (status) {
            status.textContent = `${glot.get("rough_preview")}...`;
            status.classList.remove("d-none");
        }

        const Svg2Roughjs = globalThis.svg2roughjs?.Svg2Roughjs;
        if (!Svg2Roughjs) {
            this.roughPreviewRendering = false;
            if (status) status.textContent = glot.get("rough_error");
            return;
        }

        const output = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const converter = new Svg2Roughjs(output, undefined, {
            roughness: options.roughness,
            bowing: options.bowing,
            fillStyle: options.fillStyle
        });
        converter.svg = source;
        converter.fontFamily = null;
        converter.randomize = false;
        converter.backgroundColor = Layers.background?.opacity === 0
            ? "transparent"
            : (Layers.background?.color || "#ffffff");

        try {
            const roughSvg = await converter.sketch(true);
            if (version !== this.roughPreviewVersion) return;
            target.replaceChildren(roughSvg instanceof SVGElement ? roughSvg : output);
            status?.classList.add("d-none");
        } catch (error) {
            console.error("rough preview failed", error);
            if (version === this.roughPreviewVersion && status) status.textContent = glot.get("rough_error");
        } finally {
            this.roughPreviewRendering = false;
            if (this.roughPreviewPending && this.rough_options().enabled) {
                this.roughPreviewPending = false;
                this.roughPreviewTimer = setTimeout(() => this.rough_preview(), 0);
            }
        }
    }

    rough_preview_source() {
        const mapSvg = document.querySelector(".leaflet-overlay-pane svg");
        const mapSize = map.getSize();
        if (!mapSvg?.viewBox?.baseVal) {
            return new DOMParser().parseFromString(`
                <svg xmlns="http://www.w3.org/2000/svg" width="${mapSize.x}" height="${mapSize.y}"
                    viewBox="0 0 ${mapSize.x} ${mapSize.y}">
                    <rect width="${mapSize.x}" height="${mapSize.y}" fill="${Layers.background?.color || "#ffffff"}"/>
                </svg>`, "image/svg+xml").documentElement;
        }

        const viewBox = mapSvg.viewBox.baseVal;
        const cropWidth = Math.min(mapSize.x, viewBox.width);
        const cropHeight = Math.min(mapSize.y, viewBox.height);
        const cropX = viewBox.x + (viewBox.width - cropWidth) / 2;
        const cropY = viewBox.y + (viewBox.height - cropHeight) / 2;

        const source = mapSvg.cloneNode(true);
        source.removeAttribute("style");
        source.removeAttribute("class");
        source.setAttribute("width", String(mapSize.x));
        source.setAttribute("height", String(mapSize.y));
        source.setAttribute("viewBox", `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
        source.setAttribute("preserveAspectRatio", "xMidYMid slice");

        if (Layers.background?.opacity !== 0) {
            const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            background.setAttribute("x", String(cropX));
            background.setAttribute("y", String(cropY));
            background.setAttribute("width", String(cropWidth));
            background.setAttribute("height", String(cropHeight));
            background.setAttribute("fill", Layers.background?.color || "#ffffff");
            source.insertBefore(background, source.firstChild);
        }
        return source;
    }

    // 基本メニューの作成 menuhtml:指定したHTMLで左上に作成 menuhtmlが空の時は過去のHTMLから復元
    makemenu(menuhtml) {
        console.log("Start: make menu.")
        document.getElementById("basemenu").innerHTML = menuhtml;

        console.log("Start: make marker.")
        let html = "", keys = Object.keys(Conf.osm);							// マーカー追加メニュー作成
        keys.forEach(key => {
            if (Conf.osm[key].marker !== undefined) {
                html += `<span class="dropdown-item btn ps-1 me-1" onclick="mapMaker.addPoi('${key}')">`;
                html += `<img class="me-1" src="./${Conf.osm[key].marker}" width="24px">`;
                html += `${glot.get("marker_" + key)}</span>\n`;
            };
        });
        document.getElementById("menu_list").innerHTML = html

        console.log("Start: make custom panel.")
        for (let panel of Conf.editPanels) {									    // editPanelsに基づいて編集パネルを作成
            // パネルタイトルの追加
            let title = glot.get(panel.groupGlot);
            let div = document.createElement("div");
            div.setAttribute("id", panel.groupGlot);
            div.className = "col ps-1 mt-1 fw-medium text-start border-0 border-bottom bg-light bg-gradient d-none";
            let span = document.createElement("span");
            span.innerHTML = title;
            div.appendChild(span);
            document.getElementById("customMap").appendChild(div);

            for (let key of panel.styles) {
                let key_layer = `#${key}_layer`;
                let key_line = `#${key}_line`;
                let copyobj = document.getElementById("AAA").cloneNode(true);
                copyobj.getElementsByClassName("customName")[0].innerHTML = glot.get("menu_" + key);
                copyobj.querySelector('#AAA_color').setAttribute('id', key + "_color");
                copyobj.querySelector('#AAA_line').setAttribute('value', Layers[key].width);
                copyobj.querySelector('#AAA_line').setAttribute('id', key + "_line");
                copyobj.querySelector('#AAA_layer').setAttribute('id', key + "_layer");
                if (key == "background") copyobj.querySelector(key_line).outerHTML = "<span class='input-hidden'></span>";
                copyobj.setAttribute('id', key);
                document.getElementById("customMap").appendChild(copyobj);

                // カラーピッカー追加
                this.colorPicker[key] = new Alwan(`#${key}_color`, {
                    preview: false, copy: false,
                    inputs: { hex: false, rgb: true, hsl: false }, color: Layers[key].color,
                    classname: "colorPalette", swatches: Conf.default.swatches
                });

                // 色変更時のイベント定義
                this.colorPicker[key].on('change', (ev) => {
                    Layers[key].color = ev.hex;
                    if (key_layer.indexOf("background") > -1) {
                        document.getElementById("mapid").style.backgroundColor = ev.hex;
                        document.getElementById("mapid").classList.remove("bg-clear");
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
                    if (key_layer.indexOf("background") > -1) { // 地面の処理
                        $("#mapid").css('background-color', "");
                        $("#mapid").addClass("bg-clear");
                        $("#background_color").css('background-color', "");
                        $("#background_color").addClass("bg-clear");
                        Layers["background"].opacity = 0;
                    } else {    // その他レイヤの処理
                        let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;    // 現在の状態を判定
                        $(key_layer).children().toggleClass("fa-trash-alt fa-undo");
                        for (let eKey of LayerCont.styles) {
                            if (Layers[eKey].geojson) {
                                winCont.modal_text(`Map Writeing... ${eKey}`, true);
                                LayerCont.makeLayer(eKey, eKey == key ? view : undefined);   // 指定したkeyレイヤーを作成
                            };
                        };
                    }
                    // 削除・復活後の表示状態を手書きプレビューにも反映する。
                    if (mapMaker.rough_options().enabled) mapMaker.rough_change();
                });
            };
        };
        $("#AAA").remove();

        console.log("Start: make glot render.")
        glot.render();

        mapMaker.custom(false);	// カスタムモードOFF
        console.log("End: make menu.")
    }

    initBasemenuResize() {
        if (this.basemenuResizeInitialized) return;

        const editbar = document.getElementById("editbar");
        const handle = document.getElementById("basemenuResizeHandle");
        if (!editbar || !handle) return;

        let dragging = false;
        let isWide = false;
        let requestedSize = 0;

        const applyDrag = () => {
            this.basemenuResizeFrame = null;
            const rect = editbar.getBoundingClientRect();
            const total = isWide ? rect.width : rect.height;
            const minMenuSize = isWide ? 180 : 120;
            const minMapSize = isWide ? 240 : 160;
            const size = Math.max(minMenuSize, Math.min(requestedSize, total - minMapSize));
            const property = isWide ? "--basemenu-width" : "--basemenu-height";
            editbar.style.setProperty(property, `${size}px`);
            map?.invalidateSize({ animate: false, pan: false, debounceMoveend: true });
        };

        const finishDrag = () => {
            if (!dragging) return;
            dragging = false;
            if (this.basemenuResizeFrame !== null) {
                cancelAnimationFrame(this.basemenuResizeFrame);
                applyDrag();
            }
            document.body.classList.remove("is-resizing-basemenu");
            document.body.style.removeProperty("cursor");
            map?.invalidateSize({ animate: false, pan: false });
        };

        handle.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            dragging = true;
            isWide = window.matchMedia("(min-width: 992px)").matches;
            const rect = editbar.getBoundingClientRect();
            requestedSize = isWide ? event.clientX - rect.left : event.clientY - rect.top;
            document.body.classList.add("is-resizing-basemenu");
            document.body.style.cursor = isWide ? "col-resize" : "row-resize";
        });

        window.addEventListener("pointermove", (event) => {
            if (!dragging) return;
            event.preventDefault();
            const rect = editbar.getBoundingClientRect();
            requestedSize = isWide ? event.clientX - rect.left : event.clientY - rect.top;
            if (this.basemenuResizeFrame === null) {
                this.basemenuResizeFrame = requestAnimationFrame(applyDrag);
            }
        });

        window.addEventListener("pointerup", finishDrag);
        window.addEventListener("pointercancel", finishDrag);
        this.basemenuResizeInitialized = true;
    }

    // 利用しているデータセットをCopyrightに反映
    addCopyright(text) { this.copyrights = [...new Set([...this.copyrights, text])] }

    // 利用しているデータセットをCopyright表示用に返す
    getCopyright() { return this.copyrights.length > 0 ? " | " + this.copyrights.join(' ') : "" }

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
        const waitPaint = () => new Promise(resolve => { requestAnimationFrame(() => { setTimeout(resolve, 0); }); });
        let latlng = map.getCenter();
        while (latlng.lng >= 180) latlng.lng -= 360;
        while (latlng.lng <= -180) latlng.lng += 360;
        map.setView(latlng);    // 経度を-180～180に変換してからセット（OverpassAPIの仕様に合わせるため）
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
            def_msg = "Data Loading... " + Math.trunc(data_length / 1024).toLocaleString() + "KBytes."
            winCont.modal_text(def_msg, true)
        };
        for (let key of LayerCont.styles) if (Conf.style[LayerCont.palette][key].zoom <= nowzoom) targets.push(key);
        Basic.retry(() => overPassCont.get(targets, progress), 5).then(async (ovasnswer) => {
            winCont.modal_text("Data Loading Complate... ", true);
            await waitPaint();
            for (const target of targets) {
                winCont.modal_text(`Layer Cliping... ${target}`, true);
                await waitPaint();

                let tmpcnt = 0;
                //console.log(`Start: process ${target} data.`)
                let geojson = overPassCont.get_target(ovasnswer, target);
                if (geojson.length > 0) {

                    // === 追加: 画面bboxで clip してから Layers に入れる ===
                    // bboxLonLat = [minLon, minLat, maxLon, maxLat]
                    const b = map.getBounds();
                    const bboxLonLat = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
                    const clipFeatures = (featuresLike, bbox) => {
                        if (typeof turf === "undefined" || typeof turf.bboxClip !== "function") return featuresLike;    // turf が無い/使えないならそのまま返す

                        // --- 正規化：Feature配列へ ---
                        let features = featuresLike;
                        // FeatureCollection {type:"FeatureCollection", features:[...]}
                        if (features && features.type === "FeatureCollection" && Array.isArray(features.features)) { features = features.features; }
                        // 単一Feature
                        if (features && features.type === "Feature") { features = [features]; }
                        if (!Array.isArray(features)) return [];

                        const out = [];
                        for (const f of features) {
                            if (!f?.geometry) continue;

                            const gt = f.geometry.type;

                            // Point系は bboxClip 対象外なので必要なら bounds 判定で落とす
                            if (gt === "Point") {
                                const c = f.geometry.coordinates; // [lon,lat]
                                if (c && c.length >= 2 &&
                                    c[0] >= bbox[0] && c[0] <= bbox[2] &&
                                    c[1] >= bbox[1] && c[1] <= bbox[3]) {
                                    out.push(f);
                                }
                                continue;
                            }
                            if (gt === "MultiPoint") { out.push(f); continue; }

                            try {
                                const clipped = turf.bboxClip(f, bbox);
                                if (clipped?.geometry?.coordinates && clipped.geometry.coordinates.length) {
                                    out.push(clipped);
                                }
                            } catch (e) {
                                // 交差しない/不正形状は捨てる
                            }
                        }
                        return out;
                    };

                    // ============================================

                    let fil_geojson = { "features": geojson };

                    if (target == "sea") {
                        console.log(`Processing sea data...${tmpcnt++}`);
                        console.log("SEA RAW FEATURES", fil_geojson.features);

                        // coastline merge は広めの bbox で解析
                        fil_geojson.features = CoastLine.merge(fil_geojson.features, "LLL");

                        // 解析後に、実際の表示 bbox で切り戻す
                        fil_geojson.features = clipFeatures(fil_geojson.features, bboxLonLat);
                    } else {
                        // sea 以外も必要なら clip
                        // fil_geojson.features = clipFeatures(fil_geojson.features, bboxLonLat);
                    }

                    Layers[target].geojson = fil_geojson.features;
                };
            };

            for (let key of LayerCont.styles) {
                if (Layers[key].geojson) {
                    winCont.modal_text(`Map Writeing... ${key}`, true);
                    LayerCont.makeLayer(key);   // 指定したkeyレイヤーを作成
                };
            };
            mapMaker.custom(true);
            winCont.closeModal().then(() => {
                console.log("mapMaker: make: end");
            })
        })/*.catch(() => {
				let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => mapMaker.clearAll() };
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
                    mapMaker.addCopyright(copyright);
                    winCont.closeModal().then(() => {
                        poiset(key, { "geojson": geojsons, "targets": targets });
                    })
                });
            } else {
                Basic.retry(() => overPassCont.get([key]), 5).then((ovasnswer) => {
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
                });
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
                        geojson.geometry.coordinates = cords[0];
                        geojsons.geojson.push(geojson);
                        geojsons.targets.push(answer.targets[idx]);
                    };
                });
                poiCont.addGeoJSON(geojsons);
                winCont.modal_select(key).then((slanswer) => {
                    poiCont.addGeoJSON(slanswer);
                    Marker.set(key);
                    winCont.closeModal().then(() => { console.log(`mapMaker: Add: ${key} end`) })
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
                let html = "";
                const imageSet = new Set();
                const addImages = (value, path) => {
                    if (typeof value === "string") {
                        const filename = value.indexOf(",") > 0 ? value.split(",")[0] : value;
                        imageSet.add(`${path}/${filename}`);
                    } else if (value !== null && typeof value === "object") {
                        Object.values(value).forEach(child => addImages(child, path));
                    };
                };
                addImages(Conf.marker.tag, Conf.icon.path);
                addImages(Conf.marker.subtag, Conf.icon.path);
                addImages(Conf.marker_append.files, Conf.marker_append.path);
                const images = Array.from(imageSet);
                images.sort();
                Object.keys(images).forEach(fidx => { html += `<a href="#" onclick="mapMaker.poi_marker_change('${target}','${osmid}','${images[fidx]}')"><img class="iconx2" src="${images[fidx]}"></a>` });
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
                this.customMode = mode;
                map.doubleClickZoom.disable();
                let palette = Conf.style[LayerCont.palette];
                for (let panel of Conf.editPanels) {									    // editPanelsに基づいて編集パネルを作成
                    let rems = false;
                    for (let key of panel.styles) {
                        let zoom = palette[key].zoom == undefined ? 0 : palette[key].zoom;
                        let disabled = zoom <= map.getZoom() ? "remove" : "add";
                        rems = rems || disabled == "remove";    // どれか一つでも表示可能なレイヤーがあればパネルを表示
                        document.getElementById(key).classList[disabled]("d-none");
                    }
                    if (rems) {
                        document.getElementById(panel.groupGlot).classList.remove("d-none");
                    } else {
                        document.getElementById(panel.groupGlot).classList.add("d-none");
                    }
                }
                customMap.classList.remove("d-none");          // Hide Custom Area
                makeMap.classList.add("d-none");            // Hide MakeMap button
                controlMenu.classList.remove("d-none");     // Show Control Menu
                roughControls.classList.remove("d-none");  // Show Rough.js controls
                this.rough_change();
                saveMap.classList.remove("d-none");         // Show Save Button
                clearMap.classList.remove("d-none");           // Hide Clear Button
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
                $("#search_input").attr('disabled', 'disabled');
                MapCont.stop();
                Object.keys(this.maps).forEach(key => { if (map.hasLayer(this.maps[key])) { Layers["MAP"] = this.maps[key]; map.removeLayer(this.maps[key]) } });	// remove select layer
                if (Layers.background.opacity === 0) {		// set background
                    $("#mapid").addClass("bg-clear");
                } else {
                    $("#mapid").removeClass("bg-clear");
                    $("#mapid").css('background-color', Layers.background.color);
                    $("#background_color").css('background-color', Layers.background.color);
                };
                mapMaker.zoomMessage();
                break;
            case false:
                this.customMode = mode;
                makeMap.classList.remove("d-none");         // Show MakeMap button
                controlMenu.classList.add("d-none");        // Hide Control Menu
                roughControls.classList.add("d-none");      // Hide Rough.js controls
                this.rough_change();
                saveMap.classList.add("d-none");            // Hide Save Button
                clearMap.classList.add("d-none");           // Hide Clear Button
                customMap.classList.add("d-none");          // Hide Custom Area
                map.doubleClickZoom.enable();
                MapCont.start();
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
                $("#search_input").attr('disabled', false);
                $("#mapid").removeClass("bg-clear");
                $("#mapid").css('background-color', "");
                $("#background_color").css('background-color', "");
                mapMaker.zoomMessage();
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
    async save(type) {
        if (this.exportInProgress) return;

        const processing = document.getElementById("exportProcessing");
        const saveButtons = document.querySelectorAll("#saveMap button");
        this.exportInProgress = true;
        processing?.classList.remove("d-none");
        saveButtons.forEach(button => button.disabled = true);

        // オーバーレイを描画してから、重い書き出し処理を始める。
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            await SVGCont.save({ type: type, mode: this.selectMode });
        } catch (error) {
            console.error("save: export failed", error);
            window.alert(glot.get("export_error"));
        } finally {
            processing?.classList.add("d-none");
            saveButtons.forEach(button => button.disabled = false);
            this.exportInProgress = false;
        }
    }

    // View Zoom Level & Status Comment
    zoomMessage() {
        let nowzoom = map.getZoom();
        let message = `${glot.get("zoomlevel")}${map.getZoom()} `;
        if (nowzoom < Conf.default.MinZoomLevel) {
            message += `<br>${glot.get("morezoom")}`;
            makeMap.classList.add("d-none");
        } else {
            if (nowzoom < Conf.default.LimitZoomLevel) message += `<br>${glot.get("morezoom2")}`;
            if (!mapMaker.custom()) makeMap.classList.remove("d-none");
        };
        if (mapMaker.custom()) message += `<br>${glot.get("custommode")}`;
        $("#zoomlevel").html("<h2 class='zoom'>" + message + "</h2>");
    }

    // Try Again
    clearAll() {
        winCont.modal_open({
            title: glot.get("restart_title"),
            message: glot.get("restart_message"),
            mode: "yesno",
            callback_yes: () => {
                mapMaker.custom(false);
                overPassCont.clear();
                LayerCont.clearAll();
                Marker.clearAll();
                poiCont.clearAll();
                winCont.closeModal();
            },
            callback_no: () => winCont.closeModal()
        });
    }
}
const mapMaker = new MapMaker();
