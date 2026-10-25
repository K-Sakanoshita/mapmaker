"use strict";

// SVG操作ライブラリ(PNG形式に変換して保存する処理も含む)
class SVGControl {
    constructor() {
        this.SvgIcon = {};
    };
    init() {
        Marker.set_size(Conf.default.text.size, Conf.default.text.view);
        const icons = new Map();			// 画面表示用パス => SVG書き出し用パス
        const addIcon = (filename, path = Conf.icon.path) => {
            filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
            const displayPath = `${path}/${filename}`;
            let svgPath = displayPath;
            if (path === Conf.icon.path && /\.png$/i.test(filename)) {
                svgPath = `${Conf.icon.svgPath}/${filename.replace(/\.png$/i, ".svg")}`;
            };
            if (!icons.has(displayPath)) icons.set(displayPath, svgPath);
        };

        Object.keys(Conf.marker.tag).forEach(key1 => {					// main svg icon
            Object.keys(Conf.marker.tag[key1]).forEach((key2) => {
                addIcon(Conf.marker.tag[key1][key2]);
            });
        });
        Object.keys(Conf.marker.subtag).forEach(key1 => {				// sub svg icon
            Object.keys(Conf.marker.subtag[key1]).forEach((key2) => {
                Object.keys(Conf.marker.subtag[key1][key2]).forEach((key3) => {
                    addIcon(Conf.marker.subtag[key1][key2][key3]);
                });
            });
        });
        Object.values(Conf.marker_append.files).forEach(filename => {	// append svg icon
            addIcon(filename, Conf.marker_append.path);
        });
        Object.keys(Conf.osm).forEach(key => {
            const filename = Conf.osm[key].marker;
            if (filename !== undefined && !icons.has(filename)) {
                const iconPrefix = `${Conf.icon.path}/`;
                const svgPath = filename.startsWith(iconPrefix) && /\.png$/i.test(filename)
                    ? `${Conf.icon.svgPath}/${filename.slice(iconPrefix.length).replace(/\.png$/i, ".svg")}`
                    : filename;
                icons.set(filename, svgPath);
            };
        });
        icons.set(Conf.effect.icon.stack, Conf.effect.icon.stack);		// load icon bg

        this.iconSources = new Map();
        for (const [displayPath, svgPath] of icons) {
            this.iconSources.set(new URL(displayPath, document.baseURI).href, {displayPath, svgPath});
        }
        this.iconLoads = new Map();
    }

    loadIcon(path) {
        const absolute = new URL(path, document.baseURI).href;
        if (this.SvgIcon[absolute]) return Promise.resolve(this.SvgIcon[absolute]);
        const entry = this.iconSources?.get(absolute);
        if (!entry) return Promise.resolve(null);
        if (!this.iconLoads.has(absolute)) {
            const task = fetch(entry.svgPath, {signal:AbortSignal.timeout(30000)}).then(async response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const source = await response.text();
                const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
                if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new Error('Invalid SVG icon');
                this.SvgIcon[entry.displayPath] = this.SvgIcon[absolute] = source;
                return source;
            }).catch(error => {
                this.iconLoads.delete(absolute);
                console.warn(`SVG icon not found: ${entry.svgPath}`, error);
                return null; // makeSVG retains its raster-image fallback.
            });
            this.iconLoads.set(absolute, task);
        }
        return this.iconLoads.get(absolute);
    }

    async ensureDisplayedIcons() {
        if (!this.iconSources) return;
        const images = [...document.querySelectorAll('#mapid .mapmaker-marker:not(.manual-pin-marker) img')];
        const paths = new Set(images.map(image => image.src));
        if (images.some(image => !image.hasAttribute('data-mapmaker-icon') && image.classList.contains('icon_normal')))
            paths.add(Conf.effect.icon.stack);
        await Promise.all([...paths].map(path => this.loadIcon(path)));
    }

    async makeSVG(svg, callback, opt = {}) {
        await this.ensureDisplayedIcons();

        const root = (svg instanceof SVGElement) ? svg : (svg && svg[0] instanceof SVGElement ? svg[0] : null);
        if (!root) throw new Error("makeSVG: svg root not found");

        const bbox = opt.bbox;
        const paperMm = opt.paperMm;
        const marginMm = opt.marginMm || { top: 0, right: 0, bottom: 0, left: 0 };
        const fitMode = opt.fitMode || "contain";
        if (!bbox || !paperMm) throw new Error("makeSVG: opt.bbox / opt.paperMm required");

        const innerW = paperMm.w - marginMm.left - marginMm.right;
        const innerH = paperMm.h - marginMm.top - marginMm.bottom;

        const CRS = map.options.crs;
        const sw = MapEngine.latLng(bbox[1], bbox[0]);
        const ne = MapEngine.latLng(bbox[3], bbox[2]);
        const pSW = CRS.project(sw);
        const pNE = CRS.project(ne);

        const minX = Math.min(pSW.x, pNE.x);
        const maxX = Math.max(pSW.x, pNE.x);
        const minY = Math.min(pSW.y, pNE.y);
        const maxY = Math.max(pSW.y, pNE.y);

        const spanX = (maxX - minX) || 1;
        const spanY = (maxY - minY) || 1;

        const sx = innerW / spanX;
        const sy = innerH / spanY;
        const s = (fitMode === "cover") ? Math.max(sx, sy) : Math.min(sx, sy);

        const drawW = spanX * s;
        const drawH = spanY * s;
        const offX = marginMm.left + (innerW - drawW) / 2;
        const offY = marginMm.top + (innerH - drawH) / 2;

        // 画面上の表示px -> 出力SVGユーザー座標
        const sourcePxSize = opt.sourcePxSize || map.getSize();
        const sourceW = sourcePxSize.width ?? sourcePxSize.x;
        const sourceH = sourcePxSize.height ?? sourcePxSize.y;
        const mmPerPxOnExport = opt.screenMmPerPx ?? Math.min(drawW / sourceW, drawH / sourceH);

        const poiRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
        poiRoot.setAttribute("data-rough-preserve", "poi");
        root.appendChild(poiRoot);

        if (typeof ManualPins !== "undefined") ManualPins.appendToSVG(poiRoot, ll => {
            if (opt.transform) return opt.transform.toPageMmXY([ll.lng, ll.lat]);
            const p = CRS.project(ll);
            return [offX + (p.x - minX) * s, offY + (maxY - p.y) * s];
        }, mmPerPxOnExport);
        const marker = $("#mapid .mapmaker-marker:not(.manual-pin-marker)");
        const parser = new DOMParser();
        let text, imageque = [];

        for (let i = 0; i < marker.length; i++) {
            const $m = marker.eq(i);

            const tr = getTranslatePx($m[0]);
            const txPx = tr.x;
            const tyPx = tr.y;

            let offset = [0, 0, 0, 0];
            const mt = parseFloat($m.css("margin-top")) || 0;
            const mr = parseFloat($m.css("margin-right")) || 0;
            const mb = parseFloat($m.css("margin-bottom")) || 0;
            const ml = parseFloat($m.css("margin-left")) || 0;
            offset = [mt, mr, mb, ml];

            const iconLeftPx = txPx + offset[3];
            const iconTopPx = tyPx + offset[0];

            const $img = $m.find("img").first();
            const imgW = $img.length ? ($img.outerWidth() || $img.width() || 0) : 0;
            const imgH = $img.length ? ($img.outerHeight() || $img.height() || 0) : 0;

            const centerPx = MapEngine.point(iconLeftPx + imgW / 2, iconTopPx + imgH / 2);
            const ll = $m[0].mapmakerMarker?.getLatLng() || map.layerPointToLatLng(centerPx);
            const p = CRS.project(ll);

            const [xMm, yMm] = opt.transform
                ? opt.transform.toPageMmXY([ll.lng, ll.lat])
                : [offX + (p.x - minX) * s, offY + (maxY - p.y) * s];

            const pathname = $m.find('.qr_code').length ? undefined : $img.attr('src');

            if (pathname === undefined) {
                this.appendWikipediaArticle(poiRoot, $m[0], xMm, yMm, mmPerPxOnExport, imageque);

            } else {
                const filename = pathname;
                const img = $img[0];
                const appearance = img?.hasAttribute('data-mapmaker-icon')
                    ? Marker.iconStyle(img.dataset.iconBaseSize, img.dataset.iconNoframe === 'true', img.dataset.iconPreset) : null;
                const noframe = appearance ? !appearance.framed : img?.className?.indexOf("icon_normal") < 0;
                const padding = appearance?.padding || 0;
                const iconWmm = (imgW - padding * 2) * mmPerPxOnExport;
                const iconHmm = (imgH - padding * 2) * mmPerPxOnExport;

                if (!noframe) {
                    const source = appearance ? Marker.iconFrameSVG(appearance) : this.SvgIcon[Conf.effect.icon.stack];
                    const bg = $(parser.parseFromString(source, "text/xml")).children();
                    svg_append_svg(poiRoot, bg, xMm, yMm, (imgW + (appearance ? 0 : 4)) * mmPerPxOnExport, (imgH + (appearance ? 0 : 4)) * mmPerPxOnExport);
                }

                if (this.SvgIcon[filename] !== undefined) {
                    const fg = $(parser.parseFromString(this.SvgIcon[filename], "text/xml")).children();
                    svg_append_svg(poiRoot, fg, xMm, yMm, iconWmm, iconHmm);
                } else {
                    imageque.push({ src: img.src, x: xMm - iconWmm / 2, y: yMm - iconHmm / 2, width: iconWmm, height: iconHmm });
                }

                text = $img.attr("icon-name");
                if (text && Conf.effect.text.view) {
                    this.textWrite(poiRoot, {
                        text,
                        anchor: "start",
                        x: xMm + (imgW / 2 + 4) * mmPerPxOnExport,
                        y: yMm,
                        sizePx: Conf.effect.text.size,
                        mmPerPx: mmPerPxOnExport,
                        color: Conf.default.text.color,
                        font: Conf.default.text.font,
                        padMm: 2,
                        maxWidthMm: 50
                    });
                }
            }
        }

        if (imageque.length > 0) {
            let loadque = imageque.length;
            imageque.forEach(param => {
                Basic.ImageToBase64(param.src, (data) => {
                    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
                    image.setAttribute("x", param.x);
                    image.setAttribute("y", param.y);
                    image.setAttribute("width", param.width);
                    image.setAttribute("height", param.height);
                    image.setAttribute("href", data);
                    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", data);
                    poiRoot.appendChild(image);

                    loadque--;
                    if (loadque <= 0) callback();
                });
            });
        } else {
            callback();
        }

        function getTranslatePx(el) {
            const tr = getComputedStyle(el).transform;
            if (!tr || tr === "none") return { x: 0, y: 0 };

            const m2 = tr.match(/^matrix\(([^)]+)\)$/);
            if (m2) {
                const v = m2[1].split(",").map(s => parseFloat(s.trim()));
                return { x: v[4] || 0, y: v[5] || 0 };
            }

            const m3 = tr.match(/^matrix3d\(([^)]+)\)$/);
            if (m3) {
                const v = m3[1].split(",").map(s => parseFloat(s.trim()));
                return { x: v[12] || 0, y: v[13] || 0 };
            }

            return { x: 0, y: 0 };
        }

        function svg_append_svg(rootSvg, svgicon, cxMm, cyMm, targetWmm, targetHmm) {
            const NS = "http://www.w3.org/2000/svg";
            const vbStr = $(svgicon).attr("viewBox");
            let vbX = 0, vbY = 0, vbW = targetWmm, vbH = targetHmm;
            if (vbStr) {
                const a = vbStr.trim().split(/[\s,]+/).map(Number);
                if (a.length === 4 && a.every(Number.isFinite) && a[2] !== 0 && a[3] !== 0) {
                    [vbX, vbY, vbW, vbH] = a;
                }
            }

            const sx = targetWmm / vbW;
            const sy = targetHmm / vbH;
            const ss = Math.min(sx, sy);

            const extraX = (targetWmm / ss - vbW) / 2;
            const extraY = (targetHmm / ss - vbH) / 2;

            const g = document.createElementNS(NS, "g");
            for (const n of Array.from(svgicon[0].childNodes)) {
                const nn = n.nodeName;
                if (nn === "path" || nn === "g" || nn === "defs" || nn === "rect" || nn === "ellipse" || nn === "style") {
                    g.appendChild(n.cloneNode(true));
                }
            }

            const left = cxMm - targetWmm / 2;
            const top = cyMm - targetHmm / 2;

            g.setAttribute(
                "transform",
                `translate(${left} ${top}) scale(${ss}) translate(${-(vbX) + extraX} ${-(vbY) + extraY})`
            );
            rootSvg.appendChild(g);
        }
    }

    appendWikipediaArticle(root, marker, xMm, yMm, scale, images) {
        const card = marker.querySelector('.qr_code');
        if (!card) return;
        const NS = "http://www.w3.org/2000/svg";
        const origin = marker.getBoundingClientRect();
        const position = rect => [xMm + (rect.left - origin.left) * scale, yMm + (rect.top - origin.top) * scale];
        const rect = card.getBoundingClientRect();
        const [x, y] = position(rect);
        this.writeRect(root, { x, y, width: rect.width * scale, height: rect.height * scale,
            opacity: 1, strokeWidth: (parseFloat(getComputedStyle(card).borderTopWidth) || 0) * scale });

        const qr = card.querySelector('svg');
        if (qr) {
            const bounds = qr.getBoundingClientRect();
            const [left, top] = position(bounds);
            const clone = qr.cloneNode(true);
            clone.setAttribute('x', left);
            clone.setAttribute('y', top);
            clone.setAttribute('width', bounds.width * scale);
            clone.setAttribute('height', bounds.height * scale);
            // Preserve the original coordinate system when resizing the nested SVG.
            if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${qr.width.baseVal.value} ${qr.height.baseVal.value}`);
            root.appendChild(clone);
        }

        // Use the browser's actual line breaks, rather than wrapping the article again.
        const span = card.querySelector('div.p-2.bg-light > span');
        if (span) {
            const style = getComputedStyle(span);
            const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
            const range = document.createRange();
            const lines = [];
            let node;
            while ((node = walker.nextNode())) {
                let offset = 0;
                for (const character of node.textContent) {
                    range.setStart(node, offset);
                    offset += character.length;
                    range.setEnd(node, offset);
                    const bounds = range.getBoundingClientRect();
                    if (!bounds.width || !bounds.height) continue;
                    let line = lines[lines.length - 1];
                    if (!line || Math.abs(line.bounds.top - bounds.top) > 0.5) {
                        line = { bounds, text: '' };
                        lines.push(line);
                    }
                    line.text += character;
                }
            }
            for (const line of lines) {
                const text = document.createElementNS(NS, 'text');
                const [left, top] = position(line.bounds);
                text.setAttribute('x', left);
                text.setAttribute('y', top);
                text.setAttribute('dominant-baseline', 'text-before-edge');
                text.setAttribute('font-family', style.fontFamily);
                text.setAttribute('font-size', parseFloat(style.fontSize) * scale);
                text.setAttribute('font-weight', style.fontWeight);
                text.setAttribute('font-style', style.fontStyle);
                text.setAttribute('fill', style.color);
                text.setAttribute('xml:space', 'preserve');
                text.textContent = line.text;
                root.appendChild(text);
            }
        }
        const image = card.querySelector('img');
        if (image) {
            const bounds = image.getBoundingClientRect();
            const [left, top] = position(bounds);
            images.push({ src: image.src, x: left, y: top, width: bounds.width * scale, height: bounds.height * scale });
        }
        // Only article content is copied; the close button remains screen-only.
    }

    async applyRoughEffect(svgEl, { editorHitTargets = false } = {}) {
        const options = mapMaker.rough_options();
        if (!options.enabled) return svgEl;

        if (typeof MapMakerResources !== 'undefined') await MapMakerResources.script('rough');
        const Svg2Roughjs = globalThis.svg2roughjs?.Svg2Roughjs;
        if (!Svg2Roughjs) throw new Error("svg2roughjs is not available");

        const source = svgEl.cloneNode(true);
        // Keep text/icons intact, but process the ordered building faces too.
        // Excluding every 3D building made the dominant part of the map unchanged.
        const preserved = Array.from(source.querySelectorAll('[data-rough-preserve]:not([data-rough-preserve="building"]), [data-rough-preserve="building"]:has(mask[id^="building-visibility-"]), [data-flagpole-cloth][data-flag-country]'), element => {
            const clone = element.cloneNode(true);
            element.remove();
            return clone;
        });

        // Flag artwork must remain recognizable, including stars and emblems.
        const flagDefinitions=Array.from(source.querySelectorAll('defs > image[id^="mapmaker-flag-image-"], defs > filter[id^="mapmaker-flag-shade-"]'));
        if(flagDefinitions.length) {
            const defs=document.createElementNS(source.namespaceURI,'defs');
            defs.append(...flagDefinitions);
            preserved.unshift(defs);
        }

        // Convert compound surfaces individually: svg2roughjs drops masks,
        // so leave their vector visibility masks outside the conversion.
        for (const building of preserved.filter(element => element.matches('[data-rough-preserve="building"]:not([data-flag-country])'))) {
            for (const surface of building.querySelectorAll('[data-building-surface]')) {
                const input = svgEl.cloneNode(false);
                input.appendChild(surface.cloneNode(true));
                const output = document.createElementNS(source.namespaceURI, 'svg');
                const converter = new Svg2Roughjs(output, undefined, {
                    roughness: options.roughness, bowing: options.bowing, fillStyle: options.fillStyle
                });
                converter.svg = input;
                converter.fontFamily = null;
                converter.randomize = false;
                converter.backgroundColor = 'transparent';
                const converted = await converter.sketch(true);
                const drawing = converted instanceof SVGElement ? converted : output;
                const view = input.viewBox.baseVal;
                const width = view.width || input.width.baseVal.value;
                const height = view.height || input.height.baseVal.value;
                const group = document.createElementNS(source.namespaceURI, 'g');
                group.setAttribute('transform', `translate(${view.x || 0} ${view.y || 0}) scale(${width / drawing.width.baseVal.value} ${height / drawing.height.baseVal.value})`);
                group.append(...Array.from(drawing.childNodes));
                surface.replaceChildren(group);
            }
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

        const roughSvg = await converter.sketch(true);
        const result = roughSvg instanceof SVGElement ? roughSvg : output;
        this.appendPreservedElements(result, svgEl, preserved);
        if (editorHitTargets) {
            const hits = Array.from(svgEl.querySelectorAll('[data-editor-id]'), element => {
                const clone = element.cloneNode(true);
                clone.style.opacity = '0';
                return clone;
            });
            this.appendPreservedElements(result, svgEl, hits);
        }
        this._ensureSvgNamespaces(result);
        return result;
    }

    appendPreservedElements(result, source, preserved) {
        if (preserved.length === 0) return;

        const sourceViewBox = source.viewBox?.baseVal;
        const viewBoxWidth = sourceViewBox?.width || source.width?.baseVal?.value || 1;
        const viewBoxHeight = sourceViewBox?.height || source.height?.baseVal?.value || 1;
        const outputWidth = result.width?.baseVal?.value || Number.parseFloat(result.getAttribute("width")) || viewBoxWidth;
        const outputHeight = result.height?.baseVal?.value || Number.parseFloat(result.getAttribute("height")) || viewBoxHeight;
        const scaleX = outputWidth / viewBoxWidth;
        const scaleY = outputHeight / viewBoxHeight;
        const offsetX = -(sourceViewBox?.x || 0) * scaleX;
        const offsetY = -(sourceViewBox?.y || 0) * scaleY;

        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
        overlay.setAttribute("data-rough-preserved-overlay", "true");
        overlay.setAttribute("transform", `translate(${offsetX} ${offsetY}) scale(${scaleX} ${scaleY})`);
        preserved.forEach(element => overlay.appendChild(element));
        result.appendChild(overlay);
    }

    // プレビュー用Workerを解放する。
    releasePreviewWorker() { this.exportWorkerClient?.release(); }

    async previewState(options = {}) {
        const snapshot=await captureMapMakerExportSnapshotAsync((key, over) => this.svg_style(key, over));
        if (snapshot.context.palette==='color' && options.birdseye) snapshot.context.config.flagImages=await MapMakerFlagAssets.forFeatures(
            Object.values(snapshot.layers).flatMap(layer=>layer.features || []));
        return snapshot;
    }

    previewSVGText(exporterOptions, bbox, options) {
        this.exportWorkerClient ||= new SVGExportWorkerClient();
        return this.exportWorkerClient.enqueue(() => this.previewState(options), exporterOptions, bbox, options);
    }

    // 保存・プレビュー用SVGを組み立てる。地物はWorkerで生成し、文字・アイコンをメインスレッドで合成する。
    async buildSVG(params) {
        console.log("save: start (GeoJSON -> SVG DOM)");

        const mode = params.mode ?? "";
        const isScreen = (mode === "");

        const exportRect = params.exportRect ?? this._getExportRectPx(mode);
        console.log("export rect(px):", mode || "screen", exportRect);
        const b = this._rectToLLBounds(exportRect);
        const sw = b.SW;
        const ne = b.NE;
        const bbox = [sw.lng, sw.lat, ne.lng, ne.lat];

        // Precision changes raster pixels only. Keep SVG styles and previews stable.
        const referenceDpi = isScreen ? 300 : 150;
        const dpi = params.type === 'png' && !params.preview ? (params.dpi ?? Conf.default.Paper.dpi) : referenceDpi;
        const size = ExportSettings.dimensions(mode, dpi, exportRect);
        const referenceSize = ExportSettings.dimensions(mode, referenceDpi, exportRect);
        const paperMm = size.paper;
        const paperOpt = isScreen ? { widthMm: paperMm.w, heightMm: paperMm.h } : mode;
        const canvas_width = size.width, canvas_height = size.height;

        const bgOn = (Layers.background?.opacity !== 0);
        const bgColor = bgOn ? (Layers["background"].color || "#ffffff") : null;

        const mmPerPx = paperMm.w / referenceSize.width;
        // 線幅は出力解像度ではなく、画面の地図範囲から用紙への拡大率で換算する。
        const strokeMmPerPx = Math.min(
            paperMm.w / exportRect.width,
            paperMm.h / exportRect.height
        );
        const dashExportScale = Math.min(
            referenceSize.width / exportRect.width,
            referenceSize.height / exportRect.height
        );

        // 選択した地図範囲を余白なしで用紙に収める。
        const exportMarginMm = { top: 0, right: 0, bottom: 0, left: 0 };
        const exportFitMode = "contain";

        const exporter = new PrintSVGExporter({
            paper: paperOpt,
            marginMm: exportMarginMm,
            background: bgColor,
            backgroundOpacity: 1,
            pxToMm: mmPerPx,
            strokePxToMm: strokeMmPerPx,
            dashScaleByLayerKey: {
                railway: 3,
                highway_alley: dashExportScale,
                highway_standard: dashExportScale,
                highway_primary: dashExportScale,
                highway_motorway: dashExportScale
            },
            minStrokeMm: 0,
            shapeRendering: "geometricPrecision",
            skipHiddenLayers: true,
        });

        const opts = { paper: paperOpt, fitMode: "contain", skipHiddenLayers: !params.screenPreview, editorHitTargets: !!params.screenPreview,
            ...Birdseye.exportOptions(exportRect), ...(params.birdseye ? { birdseye: params.birdseye, camera: null } : {}) };
        const transform = exporter._makeTransform(bbox, exporter._resolvePaper(paperOpt, exporter.opts), { ...exporter.opts, ...opts });

        const svgText = await this.previewSVGText(exporter.opts, bbox, opts);
        // 通常のPNG保存・プレビューでは地図本体をDOMへ展開せず、
        // Workerの文字列を保持し、文字・アイコンだけをDOMで組み立てる。
        const compactDocument = (params.preview || params.compactDocument) && !mapMaker.rough_options().enabled;
        let svgEl = this._svgTextToDom(compactDocument
            ? svgText.slice(0, svgText.indexOf(">") + 1) + "</svg>"
            : svgText);

        const credit = Conf.default.credit;
        const textAttr = credit.text + mapMaker.getCopyright();
        const sizePt = credit.size;
        const creditRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
        creditRoot.setAttribute("data-rough-preserve", "credit");
        if (!params.screenPreview) svgEl.appendChild(creditRoot);
        this.textWrite(creditRoot, {
            text: textAttr,
            anchor: "end",
            x: paperMm.w - 3,
            y: paperMm.h - 3.5,
            sizePt: sizePt,
            color: Conf.default.text?.color || "#000",
            font: credit.font,
            padMm: 1
        });

        await new Promise((resolve, reject) => {
            try {
                if (params.screenPreview) { resolve(); return; }
                Promise.resolve(SVGCont.makeSVG(svgEl, resolve, {
                    bbox,
                    paperMm: paperMm,
                    marginMm: exportMarginMm,
                    fitMode: exportFitMode,
                    screenMmPerPx: strokeMmPerPx,
                    transform: transform
                })).catch(reject);
            } catch (error) {
                reject(error);
            }
        });

        let outputSvg = svgEl;
        try {
            outputSvg = await SVGCont.applyRoughEffect(svgEl, { editorHitTargets: !!params.screenPreview });
        } catch (error) {
            if (params.preview) throw error;
            console.error("save: rough conversion failed", error);
            window.alert(glot.get("rough_error"));
        }
        const overlayText = SVGCont._svgDomToText(outputSvg);
        // Keep namespace declarations introduced by icons on the overlay root.
        const outText = compactDocument
            ? overlayText.slice(0, overlayText.indexOf(">") + 1) +
                svgText.slice(svgText.indexOf(">") + 1, svgText.lastIndexOf("</svg>")) +
                overlayText.slice(overlayText.indexOf(">") + 1, overlayText.lastIndexOf("</svg>")) + "</svg>"
            : overlayText;

        return { svg: outputSvg, outText, canvas_width, canvas_height };
    }

    // Ground coordinates at the image corners, in the same millimetre viewBox as SVG.
    exportMetadata({ mode = "", exportRect = this._getExportRectPx(mode) } = {}) {
        const { paper } = ExportSettings.dimensions(mode, mode ? 150 : 300, exportRect);
        const ratio = Math.min(paper.w / exportRect.width, paper.h / exportRect.height);
        const ox = (paper.w - exportRect.width * ratio) / 2;
        const oy = (paper.h - exportRect.height * ratio) / 2;
        const corner = (x, y) => {
            const ll = map.containerPointToLatLng([x, y]);
            if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) throw new Error("Invalid ground coordinate");
            return { geographic: { latitude: ll.lat, longitude: ll.lng },
                svg: { x: ox + (x - exportRect.x1) * ratio, y: oy + (y - exportRect.y1) * ratio } };
        };
        const corners = {
            topLeft: corner(exportRect.x1, exportRect.y1),
            topRight: corner(exportRect.x2, exportRect.y1),
            bottomRight: corner(exportRect.x2, exportRect.y2),
            bottomLeft: corner(exportRect.x1, exportRect.y2)
        };
        const a = corners.topLeft.geographic, b = corners.bottomRight.geographic;
        const rad = degrees => degrees * Math.PI / 180;
        const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
            Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
        return {
            schemaVersion: 1,
            geographic: { crs: "EPSG:4326", unit: "degrees", reference: "ground" },
            svg: { unit: "mm", origin: "top-left", xDirection: "right", yDirection: "down",
                viewBox: [0, 0, paper.w, paper.h] },
            paperSize: mode || "screen",
            camera: { bearing: map.getBearing(), pitch: map.getPitch() },
            corners,
            diagonal: { from: "topLeft", to: "bottomRight", distanceMeters: 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))),
                method: "haversine", earthRadiusMeters: 6371008.8 }
        };
    }

    async save(params) {
        const { outText, canvas_width, canvas_height } = await this.buildSVG({ ...params, compactDocument: params.type === "png" });
        if (params.type === "svg") {
            const blob = new Blob([outText], { type: "image/svg+xml;charset=utf-8" });
            SVGCont._saveBlob(blob, "svg");
            return;
        }

        const pngBlob = await svgDocumentToPNG(outText, canvas_width, canvas_height, params.mode ? (params.dpi ?? Conf.default.Paper.dpi) : undefined);
        SVGCont._saveBlob(pngBlob, "png");
    }

    // --- private helpers（クラス内） ---
    _ensureSvgNamespaces(svgEl) {
        // SVG本体の名前空間
        if (!svgEl.getAttribute("xmlns")) {
            svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }

        // xlink:href を使っている場合だけ xlink 名前空間を付与
        // ※ querySelector のエスケープが必要
        const hasXlinkHref =
            svgEl.querySelector("[xlink\\:href]") ||
            // 念のため attributes を総当たり（ブラウザ差異対策）
            (() => {
                const it = svgEl.querySelectorAll("*");
                for (const el of it) {
                    for (const a of el.attributes) {
                        if (a.name === "xlink:href") return true;
                    }
                }
                return false;
            })();

        if (hasXlinkHref && !svgEl.getAttribute("xmlns:xlink")) {
            svgEl.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        }
    }

    _svgTextToDom(svgText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const err = doc.querySelector("parsererror");
        if (err) throw new Error("Invalid SVG: " + err.textContent.trim());

        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== "svg") {
            throw new Error("Root <svg> not found");
        }

        const imported = document.importNode(svg, true);
        this._ensureSvgNamespaces(imported);
        return imported;
    }

    _svgDomToText(svgEl) {
        if (!(svgEl instanceof SVGElement)) throw new TypeError("svgEl must be SVGElement");

        const clone = svgEl.cloneNode(true);
        this._ensureSvgNamespaces(clone);

        return new XMLSerializer().serializeToString(clone);
    }

    _saveBlob(blob, ext) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.setAttribute("type", "hidden");
        a.download = Conf.default.FileName + "." + ext;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
            console.log(`save: end (${ext})`);
        }, 1500);
    }

    // svg引数が jQuery でも SVGElement でもルートSVGを返す
    _getSvgRoot(svg) {
        if (!svg) return null;
        if (svg instanceof SVGElement) return svg;
        if (svg[0] instanceof SVGElement) return svg[0]; // jQuery
        return null;
    }

    _intersectRect(a, b) {
        const x1 = Math.max(a.x1, b.x1);
        const y1 = Math.max(a.y1, b.y1);
        const x2 = Math.min(a.x2, b.x2);
        const y2 = Math.min(a.y2, b.y2);

        if (!(x2 > x1 && y2 > y1)) return null;

        return {
            x1, y1, x2, y2,
            width: x2 - x1,
            height: y2 - y1
        };
    }

    _rectToLLBounds(rect) {
        const corners = [[rect.x1, rect.y1], [rect.x2, rect.y1], [rect.x2, rect.y2], [rect.x1, rect.y2]].map(p => map.containerPointToLatLng(p));
        const west = Math.min(...corners.map(p => p.lng)), east = Math.max(...corners.map(p => p.lng));
        const south = Math.min(...corners.map(p => p.lat)), north = Math.max(...corners.map(p => p.lat));
        return { NW: { lat: north, lng: west }, SE: { lat: south, lng: east }, SW: { lat: south, lng: west }, NE: { lat: north, lng: east } };
    }

    _getA4MaskRectPx(mode) {
        const p = winCont.a4_getsize(mode);

        const x1 = Math.max(0, p.left);
        const y1 = Math.max(0, p.top);
        const x2 = Math.max(0, p.width - p.right);
        const y2 = Math.max(0, p.height - p.bottom);

        if (!(x2 > x1 && y2 > y1)) return null;

        return {
            x1, y1, x2, y2,
            width: x2 - x1,
            height: y2 - y1
        };
    }

    _getExportRectPx(mode) {
        const size = map.getSize();
        const mapRect = { x1: 0, y1: 0, x2: size.x, y2: size.y, width: size.x, height: size.y };

        // Menus overlay the map; they must not remove map content from downloads.
        if (!mode) return mapRect;

        // A4/A3 保存は選択矩形を優先
        const paperRect = this._getA4MaskRectPx(mode);
        if (!paperRect) return mapRect;

        // Clip the selected paper area to the map, without excluding menus.
        const rect = this._intersectRect(mapRect, paperRect);

        // 交差できなければ paperRect を使う
        return rect || paperRect;
    }

    // SVGの矩形を生成する。
    writeRect(...args) { return SVGTextLayout.writeRect.apply(this, args); }

    // WriteText svg, params:text,size,font,color,anchor
    textWrite(...args) { return SVGTextLayout.textWrite.apply(this, args); }

    measureWrappedText(...args) { return SVGTextLayout.measureWrappedText.apply(this, args); }

    // set svg style(no set opacity) overstyle:true時はそちらを返す
    svg_style(key, overstyle) {
        return MapMakerDomain.layerStyle(mapMakerFeatureContext(), Layers[key], key, overstyle, map.getZoom());
    }

    // 文字列のサイズを計算
    // params {text:対象の文字列,font:CSSフォント指定}
    getTextSize(...args) { return SVGTextLayout.getTextSize.apply(this, args); }

}
