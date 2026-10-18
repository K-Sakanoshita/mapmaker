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
        this.exportInProgress = false
        this.basemenuWindowInitialized = false
        this.basemenuWindowMode = "minimized"
    }
    // Initialize
    init(menuhtml) {
        MapCont.init();
        MapCont.controlAdd("bottomleft", "zoomlevel", `<div id="zoomlevelValue"></div>
            <div id="morezoom" class="small d-none" role="status">
                <span glot-model="morezoom"></span>
                <span id="morezoomFeatures" class="mt-1"></span>
            </div>`, "");
        mapMaker.makemenu(menuhtml);										// Make edit menu
        this.mobileSheet ||= new MobileEditorSheet(this);
        mapMaker.initBasemenuWindow();
        winCont.menulist_make();
        mapMaker.zoomMessage();																// Zoom 
        map.on('movestart', () => this.clearExportPreview());
        map.on('moveend resize', () => this.queueExportPreview());
        map.on('moveend', () => { if (this.customMode && this.rough_options().enabled) this.rough_change(); });
        map.on('pitchend', () => this.syncPositionView());
        this.syncPositionView();
        map.on('zoomend', () => mapMaker.zoomMessage());										// ズーム終了時に表示更新
        const searchInput = document.getElementById("search_input");
        const searchButton = searchInput.previousElementSibling;
        searchInput.placeholder = glot.get("address");
        searchButton.title = glot.get("search");
        searchButton.setAttribute("aria-label", glot.get("search"));
        searchInput.addEventListener('change', (e) => { mapMaker.searchPoi(e.target.value) });	// Address Search
    }

    layerGroupHeader(panel) {
        const header = document.createElement('div');
        header.id = panel.groupGlot;
        header.className = 'layer-control-columns layer-control-group col-12 d-none';
        for (const key of [panel.groupGlot, 'layer_column_visibility', 'layer_column_color', 'layer_column_width']) {
            const label = document.createElement('span');
            label.textContent = glot.get(key);
            if (key === panel.groupGlot) label.className = 'layer-control-group-title';
            header.appendChild(label);
        }
        return header;
    }

    previewBusy(busy) {
        // Initial download, native rendering and rough preview share the loading modal.
        const showOverlay = busy && !this.loadingMap;
        let status = document.getElementById('mapmakerRenderStatus');
        if (!status && showOverlay) {
            status = document.createElement('div');
            status.id = 'mapmakerRenderStatus';
            status.className = 'export-processing';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            const message = document.createElement('div');
            message.className = 'export-processing-message';
            const spinner = document.createElement('span');
            spinner.className = 'spinner-border spinner-border-sm';
            spinner.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = glot.get('processing_message');
            message.append(spinner, text); status.append(message);
            document.body.append(status);
        }
        status?.classList.toggle('d-none', !showOverlay);
        map.getContainer().setAttribute('aria-busy', String(busy));
    }

    clearExportPreview() {
        this.exportPreviewVersion = (this.exportPreviewVersion || 0) + 1;
        clearTimeout(this.exportPreviewTimer);
        this.previewBusy(false);
        document.getElementById('mapmakerExportPreview')?.classList.add('d-none');
        map.getContainer().classList.remove('mapmaker-export-preview');
    }

    queueExportPreview() {
        if (this.resetting) return;
        if (!map.ready) return;
        if (!this.customMode) {
            this.clearRoughPreview();
            map.editorRenderer?.clear();
            this.clearExportPreview();
            return;
        }
        map.editorRenderer ||= new MapLibreEditorRenderer(map);
        // Existing native layers already follow the camera. Resize/move events
        // do not require source reconstruction or another busy indicator.
        if (map.editorRenderer.pending) return map.editorRenderer.pending;
        if (!map.editorRenderer.needsSync()) {
            if (this.rough_options().enabled) this.queueRoughPreview();
            return;
        }
        this.clearExportPreview();
        document.getElementById('mapmakerExportPreview')?.remove();
        if (this.exportPreviewImageURL) URL.revokeObjectURL(this.exportPreviewImageURL);
        this.exportPreviewImageURL = null;
        this.previewBusy(true);
        const rendering = map.editorRenderer.sync();
        rendering.catch(error => {
            console.error('MapLibre editor failed', error);
            window.alert(glot.get('export_error'));
        }).finally(() => {
            if (!this.resetting) this.previewBusy(false);
            if (this.customMode && this.rough_options().enabled) this.queueRoughPreview();
        });
        return rendering;
    }

    setRoughPreviewLock(locked) {
        this.roughPreviewLocked = locked;
        if (locked) {
            if (!this.roughPreviewControls) {
                this.roughPreviewControls = new Map();
                const container = map.getContainer();
                this.roughPreviewControls.set(container, { disabled: container.disabled, inert: container.inert });
                map.closePopup();
            }
            for (const node of this.roughPreviewControls.keys()) {
                // Menu controls remain usable; manual pin placement also needs map input.
                node.inert = !(typeof ManualPins !== 'undefined' && ManualPins.active);
            }
        } else if (this.roughPreviewControls) {
            for (const [node, state] of this.roughPreviewControls) {
                node.inert = state.inert;
                if (state.disabled !== undefined) node.disabled = state.disabled;
            }
            this.roughPreviewControls = null;
        }
    }

    clearRoughPreview() {
        this.roughPreviewVersion = (this.roughPreviewVersion || 0) + 1;
        clearTimeout(this.roughPreviewTimer);
        this.roughPreviewNotBefore = 0;
        document.getElementById('mapmakerRoughPreview')?.remove();
        this.closeRoughPreviewModal();
        map.getContainer().classList.remove('mapmaker-rough-preview');
        map.getContainer().setAttribute('aria-busy', 'false');
        if (this.roughPreviewURL) URL.revokeObjectURL(this.roughPreviewURL);
        this.roughPreviewURL = null;
        this.setRoughPreviewLock(false);
    }

    closeRoughPreviewModal() {
        const modal = this.roughPreviewModal;
        this.roughPreviewModal = null;
        // A later dialog may have reused the shared modal; only close our own instance.
        if (modal && winCont.modal === modal && winCont.modalMode) return winCont.closeModal();
    }

    queueRoughPreview() {
        if (!this.customMode || !this.rough_options().enabled) return;
        this.setRoughPreviewLock(true);
        const version = this.roughPreviewVersion = (this.roughPreviewVersion || 0) + 1;
        clearTimeout(this.roughPreviewTimer);
        if (this.loadingMap) return;
        const delay = this.roughPreviewNotBefore ? Math.max(0, this.roughPreviewNotBefore - Date.now()) : 150;
        this.roughPreviewTimer = setTimeout(() => {
            this.roughPreviewNotBefore = 0;
            const previous = this.roughPreviewTask;
            // Only one SVG worker request may run at a time. Off/rapid changes
            // invalidate the result without letting an old image reappear.
            this.roughPreviewTask = Promise.resolve(previous).catch(() => {}).then(() => this.renderRoughPreview(version));
        }, delay);
    }

    async finishInitialRoughPreview() {
        let version;
        do {
            if (!this.customMode || !this.rough_options().enabled) return;
            clearTimeout(this.roughPreviewTimer);
            version = this.roughPreviewVersion;
            const previous = this.roughPreviewTask;
            this.roughPreviewTask = Promise.resolve(previous).catch(() => {}).then(() => this.renderRoughPreview(version));
            await this.roughPreviewTask;
        } while (version !== this.roughPreviewVersion);
    }

    async renderRoughPreview(version) {
        const current = () => version === this.roughPreviewVersion && this.customMode && this.rough_options().enabled;
        if (!current()) return;
        const container = map.getContainer();
        container.setAttribute('aria-busy', 'true');
        let url;
        try {
            if (!winCont.modalMode) {
                const message = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${glot.get('processing_message')}`;
                const opening = winCont.modal_open({ title: '', message, mode: '', compact: true });
                this.roughPreviewModal = winCont.modal;
                await opening;
            }
            if (!current()) return;
            // Preview and default downloads cover the same complete map.
            const exportRect = this.captureExportRect('');
            const { outText } = await SVGCont.buildSVG({ type: 'svg', mode: '', exportRect, preview: true });
            if (!current()) return;
            url = URL.createObjectURL(new Blob([outText], { type: 'image/svg+xml;charset=utf-8' }));
            const image = new Image(); image.alt = glot.get('rough_preview'); image.draggable = false; image.src = url;
            await image.decode();
            if (!current()) return;
            const overlay = document.createElement('div'); overlay.id = 'mapmakerRoughPreview';
            Object.assign(overlay.style, { left: `${exportRect.x1}px`, top: `${exportRect.y1}px`, width: `${exportRect.width}px`, height: `${exportRect.height}px` });
            overlay.appendChild(image);
            document.getElementById('mapmakerRoughPreview')?.remove();
            container.appendChild(overlay); container.classList.add('mapmaker-rough-preview');
            if (this.roughPreviewURL) URL.revokeObjectURL(this.roughPreviewURL);
            this.roughPreviewURL = url; url = null;
        } catch (error) {
            if (current()) {
                console.error('Hand-drawn preview failed', error);
                document.getElementById('rough_enabled').checked = false;
                this.clearRoughPreview(); this.rough_change();
                window.alert(glot.get('rough_preview_error'));
            }
        } finally {
            if (url) URL.revokeObjectURL(url);
            if (current()) {
                // Paint the decoded image before dismissing the processing message.
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                if (current()) {
                    container.setAttribute('aria-busy', 'false');
                    await this.closeRoughPreviewModal();
                }
            } else if (!this.customMode || !this.rough_options().enabled) {
                await this.closeRoughPreviewModal();
            }
        }
    }

    captureExportRect(mode) {
        // Inert suppresses DOM hit testing too; temporarily restore it only for
        // the synchronous visible-map rectangle measurement.
        const container = map.getContainer(), inert = container.inert;
        container.inert = false;
        try { return SVGCont._getExportRectPx(mode); }
        finally { container.inert = inert; }
    }

    async toggleLayerVisibility(key, visible) {
        if (map.editorRenderer?.active) {
            LayerCont.updateLayerVisibility(key, visible);
            return;
        }
        const message = `<div class="d-flex align-items-center gap-2"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${glot.get("processing_message")}</span></div>`;
        await winCont.modal_open({ title: "", message, mode: "", compact: true });
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        try {
            LayerCont.updateLayerVisibility(key, visible);
        } finally {
            await new Promise(resolve => requestAnimationFrame(resolve));
            await winCont.closeModal();
        }
    }

    rough_change(previewDelay = 0) {
        const selected = document.getElementById("rough_enabled")?.checked === true;
        if (previewDelay > 0 && selected && this.customMode) this.roughPreviewNotBefore = Date.now() + previewDelay;
        if (!selected || !this.customMode) this.clearRoughPreview();
        this.queueExportPreview();
        if (typeof RoughStylePanel !== 'undefined' && !selected) RoughStylePanel.close(false);
        document.getElementById("roughParameters")?.classList.toggle("d-none",
            !selected || typeof RoughStylePanel === 'undefined' || !RoughStylePanel.panel);
        for (const id of ["roughness", "bowing", "rough_fill_style"]) {
            const input = document.getElementById(id);
            if (input) input.disabled = !selected;
        }
        for (const id of ["roughness", "bowing"]) {
            const input = document.getElementById(id);
            const output = document.getElementById(`${id}_value`);
            if (input && output) output.value = Number(input.value).toFixed(1);
        }
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

    // 基本メニューの作成 menuhtml:指定したHTMLで左上に作成 menuhtmlが空の時は過去のHTMLから復元
    makemenu(menuhtml) {
        console.log("Start: make menu.")
        document.getElementById("basemenu").innerHTML = menuhtml;

        console.log("Start: make marker.")
        let html = `<button type="button" class="dropdown-item" onclick="ManualPins.start()"><span class="manual-pin-menu-icon" aria-hidden="true">${ManualPins.svg("location")}</span>${glot.get("manual_pin_add")}</button><div class="dropdown-divider"></div>`, keys = Object.keys(Conf.osm);							// マーカー追加メニュー作成
        keys.forEach(key => {
            if (Conf.osm[key].marker !== undefined) {
                html += `<span class="dropdown-item btn ps-1 me-1" onclick="mapMaker.addPoi('${key}')">`;
                html += `<img class="me-1" src="./${Conf.osm[key].marker}" width="24px">`;
                html += `${glot.get("marker_" + key)}</span>\n`;
            };
        });
        const iconMenu = document.getElementById("menu_list");
        iconMenu.innerHTML = html;
        const iconToggle = document.getElementById('dropdownMenuButton');
        const iconMenuSpace = () => {
            const viewport = window.visualViewport;
            const viewportTop = viewport?.offsetTop || 0;
            const top = Math.max(viewportTop, document.getElementById('editbar').getBoundingClientRect().top);
            const bottom = viewportTop + (viewport?.height || window.innerHeight);
            const rect = iconToggle.getBoundingClientRect();
            const above = Math.max(0, rect.top - top - 10);
            const below = Math.max(0, bottom - rect.bottom - 10);
            iconMenu.style.maxHeight = `${Math.max(above, below)}px`;
            return above > below ? 'top-start' : 'bottom-start';
        };
        new bootstrap.Dropdown(iconToggle, {
            popperConfig: config => ({
                ...config, strategy: 'fixed', placement: iconMenuSpace(),
                modifiers: [
                    ...config.modifiers,
                    { name: 'iconMenuHeight', enabled: true, phase: 'beforeRead', fn: () => { iconMenuSpace(); } },
                    { name: 'flip', options: { boundary: [], rootBoundary: 'viewport', padding: 8 } },
                    { name: 'preventOverflow', options: { boundary: [], rootBoundary: 'viewport', padding: 8 } }
                ]
            })
        });
        for (const type of ['wheel', 'touchmove']) {
            iconMenu.addEventListener(type, event => event.stopPropagation(), { passive: true });
        }

        console.log("Start: make custom panel.")
        for (let panel of Conf.editPanels) {									    // editPanelsに基づいて編集パネルを作成
            document.getElementById("customMap").appendChild(this.layerGroupHeader(panel));

            for (let key of panel.styles) {
                let key_layer = `#${key}_layer`;
                let key_line = `#${key}_line`;
                let copyobj = document.getElementById("AAA").cloneNode(true);
                copyobj.getElementsByClassName("layer-control-label")[0].innerHTML = glot.get("menu_" + key);
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
                    classname: "colorPalette", swatches: LayerCont.colorSwatches()
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
                    Layers[key].width = event.target.value; //width;
                    LayerCont.updateLayerWidth(key);
                });
                const widthButton = document.getElementById(key + "_line");
                if (widthButton) {
                    widthButton.setAttribute('aria-label', `${glot.get("menu_" + key)} — ${glot.get("layer_column_width")}`);
                    widthButton.addEventListener('click', () => LineWidthPanel.open(key, widthButton));
                }
                // 表示変更時のイベント定義
                $(`#${key}_layer`).on('click', async function () {
                    if (key_layer.indexOf("background") > -1) { // 地面の処理
                        $("#mapid").css('background-color', "");
                        $("#mapid").addClass("bg-clear");
                        $("#background_color").css('background-color', "");
                        $("#background_color").addClass("bg-clear");
                        Layers["background"].opacity = 0;
                    } else {    // その他レイヤの処理
                        let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;    // 現在の状態を判定
                        $(key_layer).children().toggleClass("fa-trash-alt fa-undo");
                        if (Layers[key].geojson) {
                            await mapMaker.toggleLayerVisibility(key, view);
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
        document.querySelector('.save-reset button').setAttribute('aria-label', glot.get('save_reset_label'));
        document.getElementById('mobilePaletteSelect').value = LayerCont.palette;

        mapMaker.custom(false);	// カスタムモードOFF
        console.log("End: make menu.")
    }

    initBasemenuWindow() {
        if (this.basemenuWindowInitialized) return;

        const editbar = document.getElementById("editbar");
        const minimizeButton = document.getElementById("basemenuMinimize");
        const resizeButton = document.getElementById("basemenuResize");
        if (!editbar || !minimizeButton || !resizeButton) return;
        const minimumSizes = new Map();

        const updateResizeButton = () => {
            const expanded = this.customMode && this.basemenuWindowMode == "expanded";
            resizeButton.disabled = !this.customMode;
            const label = glot.get(expanded ? "basemenu_restore" : "basemenu_expand");
            resizeButton.title = label;
            resizeButton.setAttribute("aria-label", label);
            resizeButton.classList.toggle("is-expanded", expanded);
            resizeButton.setAttribute("aria-expanded", String(expanded));
            const icon = resizeButton.querySelector('i');
            if (icon) icon.className = expanded ? 'far fa-window-restore' : 'far fa-window-maximize';
        };

        const applyWindowSize = () => {
            if (this.mobileSheet?.update()) return;
            document.getElementById("basemenu").classList.toggle("is-minimized", this.basemenuWindowMode === "minimized");
            const wideLayout = window.matchMedia("(min-width: 992px), (min-width: 768px) and (orientation: landscape)").matches;
            const portrait = window.matchMedia("(orientation: portrait)").matches;
            const rect = editbar.getBoundingClientRect();
            const total = wideLayout ? rect.width : rect.height;
            const menuMinimum = parseFloat(getComputedStyle(editbar).getPropertyValue("--basemenu-min-width")) || 260;
            const visibleControls = [makeMap, saveMap, controlMenu]
                .filter(element => element && !element.classList.contains("d-none"));
            const controlsBottom = visibleControls.reduce((bottom, element) => {
                return Math.max(bottom, element.getBoundingClientRect().bottom - rect.top);
            }, 0);
            const layoutKey = `${wideLayout ? `wide-${menuMinimum}` : portrait ? 'portrait' : 'landscape'}:${this.customMode ? 'edit' : 'position'}`;
            const measuredMinimum = wideLayout ? menuMinimum : Math.max(120, Math.ceil(controlsBottom + 4));
            const minimum = Math.max(minimumSizes.get(layoutKey) || 0, measuredMinimum);
            minimumSizes.set(layoutKey, minimum);
            const minimumMap = wideLayout ? 240 : 160;
            let size = minimum;

            if (!this.customMode) {
                size = minimum;
            } else if (this.basemenuWindowMode == "expanded") {
                size = portrait ? total - minimumMap : total / 3;
            } else if (this.basemenuWindowMode == "normal") {
                size = portrait ? total / 2 : minimum;
            }

            size = Math.max(minimum, Math.min(Math.round(size), total - minimumMap));
            const property = wideLayout ? "--basemenu-width" : "--basemenu-height";
            const unusedProperty = wideLayout ? "--basemenu-height" : "--basemenu-width";
            editbar.style.removeProperty(unusedProperty);
            editbar.style.setProperty(property, `${size}px`);
            updateResizeButton();
            requestAnimationFrame(() => map?.invalidateSize({ animate: false, pan: false }));
        };

        minimizeButton.title = glot.get("basemenu_minimize");
        minimizeButton.setAttribute("aria-label", glot.get("basemenu_minimize"));
        minimizeButton.addEventListener("click", () => {
            this.basemenuWindowMode = "minimized";
            applyWindowSize();
        });
        resizeButton.addEventListener("click", () => {
            this.basemenuWindowMode = this.basemenuWindowMode == "expanded" ? "normal" : "expanded";
            applyWindowSize();
        });
        window.addEventListener("resize", applyWindowSize);
        this.applyBasemenuWindowSize = applyWindowSize;
        applyWindowSize();
        this.basemenuWindowInitialized = true;
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

    positionView(threeD) {
        map.gl.easeTo({ pitch: threeD ? 30 : 0, duration: 300 });
    }

    syncPositionView() {
        const threeD = map.gl.getPitch() > 0;
        for (const [id, active] of [['position2D', !threeD], ['position3D', threeD]]) {
            const button = document.getElementById(id);
            button?.setAttribute('aria-pressed', String(active));
            button?.classList.toggle('active', active);
        }
    }

    // make custom map
    make(query_date) {
        const waitPaint = () => new Promise(resolve => { requestAnimationFrame(() => { setTimeout(resolve, 0); }); });
        let latlng = map.getCenter();
        while (latlng.lng >= 180) latlng.lng -= 360;
        while (latlng.lng <= -180) latlng.lng += 360;
        map.setView(latlng);    // 経度を-180～180に変換してからセット（OverpassAPIの仕様に合わせるため）
        let nowzoom = this.zoomLevel(), def_msg;
        if (nowzoom < Conf.default.MinZoomLevel) return false;
        if (typeof (query_date) == "undefined") query_date = "";
        this.loadingMap = true;
        def_msg = glot.get("loading_message");
        const loadingModal = winCont.modal_open({ "title": glot.get("loading_title"), "message": def_msg, "mode": "" });
        winCont.spinner(true);

        // URL logging
        let href = location.href.replaceAll("#", "%23");
        Basic.getData('https://script.google.com/macros/s/AKfycbyuuTCJ4qPcSFCRmSlrhwlHDK8uFYUzSkF5EPoklOtShPadnyHT28P1gj8awGeWKyISGQ/exec?URL=' + href);

        var targets = [];
        let lastProgressTenths = null;
        var progress = function (data_length) {
            const tenths = Math.floor(data_length / (1024 * 1024) * 10);
            if (tenths === lastProgressTenths) return;
            lastProgressTenths = tenths;
            def_msg = "Data Loading... " + (tenths / 10).toFixed(1) + "MB.";
            winCont.modal_text(def_msg, false);
        };
        for (let key of LayerCont.styles) if (Conf.style[LayerCont.palette][key].zoom <= nowzoom) targets.push(key);
        Basic.retry(() => overPassCont.get(targets, progress), overPassCont.getRetryCount()).then(async (ovanswer) => {
            winCont.modal_text("Data Loading Complete...", false);
            await waitPaint();
            for (const target of targets) {
                winCont.modal_text(`Layer Cliping... ${target}`, false);
                await waitPaint();

                let geojson = overPassCont.get_target(ovanswer, target);
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
                        // coastline merge は広めの bbox で解析
                        fil_geojson.features = CoastLine.merge(fil_geojson.features, "LLL");

                        // 解析後に、実際の表示 bbox で切り戻す
                        fil_geojson.features = clipFeatures(fil_geojson.features, bboxLonLat);
                    }

                    Layers[target].geojson = fil_geojson.features;
                };
            };

            for (let key of LayerCont.styles) {
                if (Layers[key].geojson) {
                    winCont.modal_text(`Map Writeing... ${key}`, false);
                    await waitPaint();
                    await LayerCont.makeLayerAsync(key, undefined, false, (done, total) => {
                        winCont.modal_text(`Map Writing... ${key} ${done}/${total}`, false);
                    });   // 指定したkeyレイヤーを作成
                };
            };
            winCont.modal_text("Map Ordering...", false);
            await waitPaint();
            LayerCont.applyDrawOrder();
            winCont.modal_text(glot.get("processing_message"), false);
            mapMaker.custom(true);
            await mapMaker.queueExportPreview();
            // sync後に有効化されるベクタースタイルも画面へ反映してから閉じる。
            await new Promise(resolve => {
                map.gl.once('idle', resolve);
                map.gl.triggerRepaint();
            });
            await this.finishInitialRoughPreview();
            await loadingModal;
            await winCont.closeModal();
            console.log("mapMaker: make: end");
        }).catch(async (error) => {
            console.error("mapMaker: make failed", error);
            winCont.spinner(false);
            // Bootstrap ignores hide() while the opening transition is running.
            await loadingModal;
            await winCont.closeModal();
            const modal = {
                "title": glot.get("sverror_title"),
                "message": glot.get("sverror_message"),
                "mode": "close",
                "callback_close": () => winCont.closeModal()
            };
            await winCont.modal_open(modal);
        }).finally(() => {
            winCont.spinner(false);
            this.loadingMap = false;
            if (!this.resetting) this.previewBusy(false);
        });
        return;
    }

    // Search Address(Japan Only)
    searchPoi(keyword) {
        const errorMsg = error => {
            if (error) console.error('mapMaker: address search failed', error);
            winCont.modal_open({ title: glot.get('addressnotfound_title'), message: glot.get('addressnotfound_body'),
                mode: 'close', callback_close: () => winCont.closeModal() });
        };
        if (keyword === '') return;
        try {
            getLatLng(keyword, async latlng => {
                try {
                    if (latlng.level === 0) { errorMsg(); return; }
                    if (latlng.level === 1) {
                        const position = Conf.prefecture[latlng.pref];
                        if (!position) { errorMsg(); return; }
                        map.setZoom(Conf.default.SearchZoom - 6);
                        map.panTo(position);
                    } else if (latlng.level === 2) {
                        const entry = Object.entries(Conf.allPrefecture).find(([, value]) =>
                            value?.prefecture === latlng.pref && (value.city === latlng.city ||
                                String(latlng.city || '').endsWith(`郡${value.city}`)));
                        if (!entry || !/^\d{5,6}$/.test(entry[0])) { errorMsg(); return; }
                        const code = entry[0].substring(0, 5);
                        const endpoint = `https://geolonia.github.io/japanese-admins/${code.substring(0, 2)}/${code}.json`;
                        const response = await fetch(endpoint);
                        if (!response.ok) throw new Error(`Municipality GeoJSON: HTTP ${response.status}`);
                        const data = await response.json();
                        const center = turf.centroid(data).geometry.coordinates;
                        if (!Array.isArray(center) || center.length < 2 || !center.every(Number.isFinite)) throw new Error('Invalid municipality centroid');
                        map.setZoom(Conf.default.SearchZoom - 3);
                        map.panTo([center[1], center[0]]);
                    } else {
                        map.setZoom(Conf.default.SearchZoom);
                        map.panTo(latlng);
                    }
                } catch (error) { errorMsg(error); }
            }, errorMsg);
        } catch (error) { errorMsg(error); }
    }

    // 情報（アイコンなど）を地図に追加
    async addPoi(key) {
        let answer;
        try {
            await winCont.modal_open({ title: glot.get("loading_title"), message: glot.get("loading_message"), mode: "" });
            winCont.spinner(true);
            if (Conf.osm[key].file !== undefined) {
                const csv = await new Promise((resolve, reject) => {
                    $.ajax({ url: Conf.osm[key].file, dataType: 'text', timeout: 30000 })
                        .done(resolve).fail((jqXHR, statusText, errorThrown) => reject({ jqXHR, statusText, errorThrown }));
                });
                const geojsons = GeoCont.csv2geojson(csv, key);
                answer = { geojson: geojsons, targets: geojsons.map(() => [key]) };
                mapMaker.addCopyright(Conf.osm[key].copyright);
            } else {
                answer = await Basic.retry(() => overPassCont.get([key]), overPassCont.getRetryCount());
            }
            if (!Array.isArray(answer?.geojson) || answer.geojson.length === 0) {
                throw Object.assign(new Error('No POI data'), { noData: true });
            }
        } catch (error) {
            console.error("mapMaker: addPoi failed", error);
            await winCont.closeModal();
            await winCont.modal_open({
                title: glot.get(error.noData ? "nodata_title" : "sverror_title"),
                message: glot.get(error.noData ? "nodata_message" : "sverror_message"),
                mode: "close", callback_close: () => winCont.closeModal()
            });
            return;
        } finally {
            winCont.spinner(false);
        }
        await winCont.closeModal();
        try { await poiset(key, answer); }
        catch (error) {
            console.error("mapMaker: POI processing failed", error);
            if (winCont.modalMode) await winCont.closeModal();
            await winCont.modal_open({ title: glot.get("sverror_title"), message: glot.get("sverror_message"),
                mode: "close", callback_close: () => winCont.closeModal() });
        }

        async function poiset(key, answer) {
            let geojsons = { geojson: [], targets: [] };
            answer.geojson.forEach((geojson, idx) => {
                // POI用のPoint化で描画・保存元のジオメトリを変えない。
                geojson = { ...geojson, geometry: { ...geojson.geometry } };
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
            let selected;
            try { selected = await winCont.modal_select(key); }
            catch (error) {
                if (error !== undefined) throw error;
                return; // Selection cancellation is an ordinary outcome.
            }
            poiCont.addGeoJSON(selected);
            Marker.set(key);
        }
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
            if (!/^[a-z][a-z0-9-]{0,31}$/.test(wiki[0])) return;
            wiki = [wiki[0], wiki.slice(1).join(':')];
            let url = `https://${wiki[0]}.wikipedia.org/wiki/${encodeURIComponent(wiki[1])}`;
            let pix = map.latLngToLayerPoint(marker.getLatLng());
            let ll2 = map.layerPointToLatLng(pix);
            return Basic.getWikipedia(wiki[0], wiki[1]).then(data => Marker.qr_add(target, osmid, url, ll2, data)).catch(error => {
                console.error('Wikipedia article failed', error);
                winCont.modal_open({ title: glot.get('sverror_title'), message: glot.get('sverror_message'), mode: 'close', callback_close: () => winCont.closeModal() });
            });
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
                        let disabled = zoom <= this.zoomLevel() ? "remove" : "add";
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
                saveMap.classList.remove("d-none");         // Show Save Button
                requestAnimationFrame(() => this.applyBasemenuWindowSize?.());
                //clearMap.classList.remove("d-none");           // Hide Clear Button
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
                $("#search_input").attr('disabled', 'disabled');
                MapCont.stop();
                Birdseye.setEnabled(map.gl.getPitch() > 0);
                Object.keys(this.maps).forEach(key => { if (map.hasLayer(this.maps[key])) { Layers["MAP"] = this.maps[key]; map.removeLayer(this.maps[key]) } });	// remove select layer
                if (Layers.background.opacity === 0) {		// set background
                    $("#mapid").addClass("bg-clear");
                } else {
                    $("#mapid").removeClass("bg-clear");
                    $("#mapid").css('background-color', Layers.background.color);
                    $("#background_color").css('background-color', Layers.background.color);
                };
                this.rough_change();
                mapMaker.zoomMessage();
                break;
            case false:
                if (typeof RoughStylePanel !== 'undefined') RoughStylePanel.close(false);
                if (typeof ManualPins !== "undefined") ManualPins.stop();
                if (typeof LineWidthPanel !== "undefined") LineWidthPanel.close(false);
                this.customMode = mode;
                makeMap.classList.remove("d-none");         // Show MakeMap button
                controlMenu.classList.add("d-none");        // Hide Control Menu
                roughControls.classList.add("d-none");      // Hide Rough.js controls
                this.rough_change();
                saveMap.classList.add("d-none");            // Hide Save Button
                //clearMap.classList.add("d-none");           // Hide Clear Button
                customMap.classList.add("d-none");          // Hide Custom Area
                requestAnimationFrame(() => this.applyBasemenuWindowSize?.());
                map.doubleClickZoom.enable();
                MapCont.start();
                ["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
                $("#search_input").attr('disabled', false);
                $("#mapid").removeClass("bg-clear");
                $("#mapid").css('background-color', "");
                $("#background_color").css('background-color', "");
                mapMaker.zoomMessage();
                this.copyrights = [];
                this.queueExportPreview();
                break;
        }
        return this.customMode;
    }

    // Area Select(A4)
    area_select(mode) {
        this.selectMode = mode;
        LayerCont.area_select(mode);
        if (this.customMode && this.rough_options().enabled) this.queueExportPreview();
        return mode;
    }

    // save layers&pois
    async save(type, birdseye = null) {
        if (this.exportInProgress) return;
        const downloadMenu = document.getElementById('saveDownloadMenu');
        if (downloadMenu && typeof bootstrap !== 'undefined') bootstrap.Dropdown.getInstance(downloadMenu)?.hide();

        // 保存中の全面オーバーレイが地図を覆う前に、地図・用紙の範囲を確定する。
        const exportRect = this.captureExportRect(this.selectMode);
        const processing = document.getElementById("exportProcessing");
        const saveButtons = document.querySelectorAll('#saveMap button, #controlMenu [onclick="Birdseye.open()"], #birdseyeModal button, #birdseyeModal input');
        const disabledBeforeSave = new Map([...saveButtons].map(button => [button, button.disabled]));
        this.exportInProgress = true;
        processing?.classList.remove("d-none");
        saveButtons.forEach(button => button.disabled = true);

        // オーバーレイを描画してから、重い書き出し処理を始める。
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            await SVGCont.save({ type: type, mode: this.selectMode, birdseye, exportRect });
        } catch (error) {
            console.error("save: export failed", error);
            window.alert(glot.get("export_error"));
        } finally {
            processing?.classList.add("d-none");
            saveButtons.forEach(button => button.disabled = disabledBeforeSave.get(button));
            if (this.roughPreviewLocked) this.setRoughPreviewLock(true);
            this.exportInProgress = false;
        }
    }

    // 表示と地物の取得・メニューの判定で同じ小数1桁のズーム値を使う。
    zoomLevel() { return Number(map.getZoom().toFixed(1)); }

    // View Zoom Level & Status Comment
    zoomMessage() {
        let nowzoom = this.zoomLevel();
        let message = `${glot.get("zoomlevel")}${nowzoom} `;
        const needsZoom = nowzoom < Conf.default.MinZoomLevel;
        makeMap.classList.toggle("d-none", mapMaker.custom());
        makeMap.querySelector("button").disabled = needsZoom;
        const zoomGuidance = document.getElementById("morezoom");
        zoomGuidance.classList.toggle("d-none", nowzoom >= Conf.default.LimitZoomLevel);
        const featureList = document.getElementById("morezoomFeatures");
        featureList.textContent = "";
        if (nowzoom < Conf.default.LimitZoomLevel) {
            const hiddenFeatures = LayerCont.styles
                .filter(key => {
                    const zoom = Conf.style[LayerCont.palette][key].zoom;
                    return zoom > nowzoom && zoom <= Conf.default.LimitZoomLevel;
                })
                .sort((a, b) => Conf.style[LayerCont.palette][a].zoom - Conf.style[LayerCont.palette][b].zoom);
            const examples = hiddenFeatures.slice(0, 3).map(key => glot.get(`menu_${key}`));
            if (hiddenFeatures.length > 3) examples.push(glot.get("morezoom_etc"));
            featureList.textContent = `${glot.get("morezoom_example")} ${examples.join(" ")}`;
        }
        if (mapMaker.custom() && !map.threeD) message += `<br>${glot.get("custommode")}`;
        $("#zoomlevelValue").html("<h2 class='zoom'>" + message + "</h2>");
    }

    // Try Again
    clearAll() {
        winCont.modal_open({
            title: glot.get("restart_title"),
            message: glot.get("restart_message"),
            mode: "yesno",
            callback_yes: () => this.resetMap(),
            callback_no: () => winCont.closeModal()
        });
    }

    async resetMap() {
        if (this.resetting) return;
        this.resetting = true;
        // Stop pending builds and suppress preview work requested by marker removals.
        this.customMode = false;
        try {
            const closing = winCont.closeModal();
            this.clearRoughPreview();
            this.clearExportPreview();
            this.previewBusy(true);
            await closing;
            // Paint feedback before starting bulk cleanup.
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            try { await map.editorRenderer?.pending; } catch (error) { console.error(error); }
            map.editorRenderer?.clear();
            this.custom(false);
            this.previewBusy(true);
            overPassCont.clear();
            LayerCont.clearAll();
            await Marker.clearAll();
            ManualPins.clear();
            poiCont.clearAll();
        } finally {
            this.resetting = false;
            this.previewBusy(false);
        }
    }

}
const mapMaker = new MapMaker();
