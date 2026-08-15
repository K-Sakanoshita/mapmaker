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

        const serializer = new XMLSerializer();
        icons.forEach((svgPath, displayPath) => {
            $.get(svgPath).done(data => {
                const xml = typeof data === "string"
                    ? new DOMParser().parseFromString(data, "image/svg+xml")
                    : data;
                SVGCont.SvgIcon[displayPath] = serializer.serializeToString(xml.documentElement || xml);
            }).fail(() => console.warn(`SVG icon not found: ${svgPath}`));
        });
    }

    makeSVG(svg, callback, opt = {}) {

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
        const sw = L.latLng(bbox[1], bbox[0]);
        const ne = L.latLng(bbox[3], bbox[2]);
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
        const mmPerPxOnExport = Math.min(drawW / sourceW, drawH / sourceH);

        const poiRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
        poiRoot.setAttribute("data-rough-preserve", "poi");
        root.appendChild(poiRoot);

        const marker = $("div.leaflet-marker-pane").children();
        const parser = new DOMParser();
        let thumbnail, svgicon, svgtext, text, imageque = [];

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

            const centerPx = L.point(iconLeftPx + imgW / 2, iconTopPx + imgH / 2);
            const ll = map.layerPointToLatLng(centerPx);
            const p = CRS.project(ll);

            const xMm = offX + (p.x - minX) * s;
            const yMm = offY + (maxY - p.y) * s;

            const pathname = $m.children().children().attr("src");

            if (pathname === undefined) {
                svgicon = $m.find("svg").first();
                svgtext = $m.find("div.p-2.bg-light");

                const qrWmm = (svgicon.outerWidth() || svgicon.width() || 0) * mmPerPxOnExport;
                const qrHmm = (svgicon.outerHeight() || svgicon.height() || 0) * mmPerPxOnExport;
                const pad = 2;
                const gap = 2;

                text = svgtext.children("span")[0]?.textContent;

                const style = svgtext[0] ? getComputedStyle(svgtext[0]) : null;
                const fontPx = style ? (parseFloat(style.fontSize) || 12) : 12;
                const fontFamily = style?.fontFamily || "sans-serif";
                const lineHeightPx =
                    style && style.lineHeight !== "normal"
                        ? parseFloat(style.lineHeight)
                        : fontPx * 1.2;
                const lineHeightEm = lineHeightPx / fontPx;

                // スクリーンショット側の実テキスト幅を使う
                const textBlockPx = svgtext.width() || svgtext.outerWidth() || 0;
                const textMaxWidthMm = textBlockPx * mmPerPxOnExport;

                let textMeasure = { width: 0, height: 0, lines: [] };
                if (text !== undefined && text !== "") {
                    textMeasure = this.measureWrappedText({
                        text,
                        font: `${fontPx}px ${fontFamily}`,
                        maxWidthMm: textMaxWidthMm,
                        pxToUser: mmPerPxOnExport,
                        lineHeightEm,
                        wrapTightenPx: 6
                    });
                }

                thumbnail = $m.find("img");
                const thumbEl = (thumbnail && thumbnail[0]) ? thumbnail[0] : null;
                const thumbWmm = thumbEl ? (thumbnail.outerWidth() * mmPerPxOnExport) : 0;
                const thumbHmm = thumbEl ? (thumbnail.outerHeight() * mmPerPxOnExport) : 0;

                const boxW = pad + qrWmm + (text ? gap + textMeasure.width : 0) + (thumbEl ? gap + thumbWmm : 0) + pad;
                const boxH = Math.max(qrHmm, textMeasure.height, thumbHmm) + pad * 2;

                const leftExtra = 6;   // まずは 3mm で試す
                const boxX = xMm - qrWmm / 2 - pad - leftExtra;
                const boxY = yMm - boxH / 2;

                this.writeRect(poiRoot, {
                    x: boxX,
                    y: boxY,
                    width: boxW,
                    height: boxH,
                    opacity: 1
                });

                svg_append_icon(
                    poiRoot,
                    svgicon,
                    boxX + pad + qrWmm / 2,
                    boxY + boxH / 2,
                    svgicon.outerWidth() || svgicon.width() || 0,
                    svgicon.outerHeight() || svgicon.height() || 0,
                    mmPerPxOnExport
                );

                if (text !== undefined && text !== "") {
                    const textShiftLeft = 3;   // まずは 3mm
                    const textX = boxX + pad + qrWmm + gap - textShiftLeft;
                    const textY = boxY + boxH / 2;

                    this.textWrite(poiRoot, {
                        text,
                        anchor: "start",
                        x: textX,
                        y: textY,
                        sizePx: fontPx,
                        mmPerPx: mmPerPxOnExport,
                        color: Conf.effect.text.color,
                        font: "Helvetica",
                        padMm: 2,
                        maxWidthMm: textMaxWidthMm
                    });

                    if (thumbEl) {
                        const thumbShiftRight = 3;   // まずは 3mm
                        imageque.push({
                            src: thumbEl.src,
                            x: textX + textMeasure.width + gap + thumbShiftRight,
                            y: boxY + (boxH - thumbHmm) / 2,
                            width: thumbWmm,
                            height: thumbHmm
                        });
                    }
                }

            } else {
                const filename = pathname;
                const noframe = $img[0]?.className?.indexOf("icon_normal") > -1 ? false : true;

                const iconWmm = imgW * mmPerPxOnExport;
                const iconHmm = imgH * mmPerPxOnExport;

                if (!noframe) {
                    const bg = $(parser.parseFromString(this.SvgIcon[Conf.effect.icon.stack], "text/xml")).children();
                    svg_append_svg(poiRoot, bg, xMm, yMm, (imgW + 4) * mmPerPxOnExport, (imgH + 4) * mmPerPxOnExport);
                }

                if (this.SvgIcon[filename] !== undefined) {
                    const fg = $(parser.parseFromString(this.SvgIcon[filename], "text/xml")).children();
                    svg_append_svg(poiRoot, fg, xMm, yMm, iconWmm, iconHmm);
                } else {
                    imageque.push({ src: $img[0].src, x: xMm - iconWmm / 2, y: yMm - iconHmm / 2, width: iconWmm, height: iconHmm });
                };

                text = $m.children().children().attr("icon-name");
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

        function svg_append_icon(rootSvg, svgDom, cxMm, cyMm, wPx, hPx, mmPerPx) {
            const NS = "http://www.w3.org/2000/svg";
            const targetWmm = wPx * mmPerPx;
            const targetHmm = hPx * mmPerPx;

            const g = document.createElementNS(NS, "g");
            for (const n of Array.from(svgDom[0].childNodes)) g.appendChild(n.cloneNode(true));

            const left = cxMm - targetWmm / 2;
            const top = cyMm - targetHmm / 2;
            g.setAttribute("transform", `translate(${left} ${top}) scale(${mmPerPx})`);
            rootSvg.appendChild(g);
        }
    }

    getMaskedLL(mode) {
        const rect = this._getExportRectPx(mode);

        console.log("export rect(px):", mode || "screen", rect);

        return this._rectToLLBounds(rect);
    }

    async applyRoughEffect(svgEl) {
        const options = mapMaker.rough_options();
        if (!options.enabled) return svgEl;

        const Svg2Roughjs = globalThis.svg2roughjs?.Svg2Roughjs;
        if (!Svg2Roughjs) throw new Error("svg2roughjs is not available");

        const source = svgEl.cloneNode(true);
        const preserved = Array.from(source.querySelectorAll("[data-rough-preserve]"), element => {
            const clone = element.cloneNode(true);
            element.remove();
            return clone;
        });

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

    // Save PNG/SVG {type : 'PNG' or 'SVG' mode: '' or 'A4' or 'A4_landscape'}
    // GeoJSON -> SVG DOMで処理
    save(params) {
        console.log("save: start (GeoJSON -> SVG DOM)");

        const dpi = Conf.default.Paper.dpi;
        const mode = params.mode ?? "";
        const isScreen = (mode === "");

        const b = this.getMaskedLL(mode);
        const sw = b.SW;
        const ne = b.NE;
        const bbox = [sw.lng, sw.lat, ne.lng, ne.lat];

        let paperOpt;
        let paperMm;
        let canvas_width, canvas_height;

        if (isScreen) {
            const sz = map.getSize();
            const scale = 4;
            canvas_width = Math.round(sz.x * scale);
            canvas_height = Math.round(sz.y * scale);

            const w = 210;
            const h = w * (sz.y / sz.x);
            paperOpt = { widthMm: w, heightMm: h };
            paperMm = { w, h };
        } else {
            paperOpt = mode;

            const sizeMap = {
                A4: { w: 210, h: 297 },
                A4_landscape: { w: 297, h: 210 },
                A3: { w: 297, h: 420 },
                A3_landscape: { w: 420, h: 297 },
            };
            const ph = sizeMap[mode] || sizeMap.A4;
            paperMm = ph;

            const inchW = ph.w / 25.4;
            const inchH = ph.h / 25.4;
            canvas_width = Math.round(dpi * inchW);
            canvas_height = Math.round(dpi * inchH);
        }

        const bgOn = (Layers.background?.opacity !== 0);
        const bgColor = bgOn ? (Layers["background"].color || "#ffffff") : null;

        const mmPerPx = paperMm.w / canvas_width;

        // ここを固定
        const exportMarginMm = { top: 0, right: 0, bottom: 0, left: 0 };
        const exportFitMode = "contain";

        const exporter = new PrintSVGExporter({
            paper: paperOpt,
            marginMm: exportMarginMm,
            background: bgColor,
            backgroundOpacity: 1,
            pxToMm: mmPerPx,
            dashScaleByLayerKey: { railway: 3 },
            minStrokeMm: 0,
            shapeRendering: "geometricPrecision",
            skipHiddenLayers: true,
        });

        const opts = { paper: paperOpt, fitMode: "contain", skipHiddenLayers: true };

        const svgText = exporter.toSVGFromLayers(bbox, opts);
        let svgEl = this._svgTextToDom(svgText);

        const credit = Conf.default.credit;
        const textAttr = credit.text + mapMaker.getCopyright();
        const sizePt = credit.size;
        const creditRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
        creditRoot.setAttribute("data-rough-preserve", "credit");
        svgEl.appendChild(creditRoot);
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

        SVGCont.makeSVG(svgEl, async () => {
            let outputSvg = svgEl;
            try {
                outputSvg = await SVGCont.applyRoughEffect(svgEl);
            } catch (error) {
                console.error("save: rough conversion failed", error);
                window.alert(glot.get("rough_error"));
            }
            const outText = SVGCont._svgDomToText(outputSvg);

            if (params.type === "svg") {
                const blob = new Blob([outText], { type: "image/svg+xml;charset=utf-8" });
                SVGCont._saveBlob(blob, "svg");
                return;
            }

            const svgBlob = new Blob([outText], { type: "image/svg+xml;charset=utf-8" });
            const svgUrl = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = canvas_width;
                canvas.height = canvas_height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas_width, canvas_height);

                URL.revokeObjectURL(svgUrl);

                canvas.toBlob((pngBlob) => {
                    if (!pngBlob) {
                        console.error("save: canvas.toBlob failed");
                        return;
                    }
                    SVGCont._saveBlob(pngBlob, "png");
                }, "image/png");
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(svgUrl);
                console.error("save: png image load error", e);
            };
            img.src = svgUrl;
        }, {
            bbox,
            paperMm: paperMm,
            marginMm: exportMarginMm,
            fitMode: exportFitMode
        });
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

    _injectCopyright(svgEl, paperMm, mmPerPx) {
        try {
            const credit = Conf.default.credit;
            const textAttr = credit.text + mapMaker.getCopyright();

            const x = paperMm.w - 12;
            const y = paperMm.h - 12;

            const NS = "http://www.w3.org/2000/svg";
            const t = document.createElementNS(NS, "text");
            t.setAttribute("x", String(x));
            t.setAttribute("y", String(y));
            t.setAttribute("text-anchor", "end");
            t.setAttribute("font-family", credit.font);
            t.setAttribute("font-size", `${Math.max(1.0, credit.size * mmPerPx)}mm`);
            t.setAttribute("fill", Conf.default.text?.color || "#000");
            t.textContent = textAttr;

            svgEl.appendChild(t);
        } catch (e) {
            console.warn("save: copyright inject skipped:", e);
        }
        return svgEl;
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
        const nw = map.containerPointToLatLng([rect.x1, rect.y1]);
        const se = map.containerPointToLatLng([rect.x2, rect.y2]);

        return {
            NW: { lat: nw.lat, lng: nw.lng },
            SE: { lat: se.lat, lng: se.lng },
            SW: { lat: se.lat, lng: nw.lng },
            NE: { lat: nw.lat, lng: se.lng },
        };
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

    _getVisibleScreenRectPx() {
        const mapEl = map.getContainer();
        const r = mapEl.getBoundingClientRect();

        const isMapVisibleAt = (clientX, clientY) => {
            const el = document.elementFromPoint(clientX, clientY);
            if (!el) return false;

            // 左メニューや各種UIを除外
            if (el.closest("#basemenu")) return false;
            if (el.closest(".leaflet-control-container")) return false;
            if (el.closest(".modal")) return false;
            if (el.closest(".alwan")) return false;

            // 地図本体なら可
            return !!(
                el === mapEl ||
                el.closest(".leaflet-map-pane") ||
                el.closest(".leaflet-pane") ||
                el.closest("#mapid")
            );
        };

        const scanLeft = (clientY) => {
            for (let x = Math.ceil(r.left); x < Math.floor(r.right); x++) {
                if (isMapVisibleAt(x, clientY)) return x - r.left;
            }
            return 0;
        };

        const scanRight = (clientY) => {
            for (let x = Math.floor(r.right) - 1; x >= Math.ceil(r.left); x--) {
                if (isMapVisibleAt(x, clientY)) return (x - r.left) + 1;
            }
            return r.width;
        };

        const scanTop = (clientX) => {
            for (let y = Math.ceil(r.top); y < Math.floor(r.bottom); y++) {
                if (isMapVisibleAt(clientX, y)) return y - r.top;
            }
            return 0;
        };

        const scanBottom = (clientX) => {
            for (let y = Math.floor(r.bottom) - 1; y >= Math.ceil(r.top); y--) {
                if (isMapVisibleAt(clientX, y)) return (y - r.top) + 1;
            }
            return r.height;
        };

        const sampleYs = [
            Math.round(r.top + r.height * 0.25),
            Math.round(r.top + r.height * 0.50),
            Math.round(r.top + r.height * 0.75),
        ].filter(y => y > r.top && y < r.bottom);

        const sampleXs = [
            Math.round(r.left + r.width * 0.25),
            Math.round(r.left + r.width * 0.50),
            Math.round(r.left + r.width * 0.75),
        ].filter(x => x > r.left && x < r.right);

        const lefts = sampleYs.map(scanLeft);
        const rights = sampleYs.map(scanRight);
        const tops = sampleXs.map(scanTop);
        const bottoms = sampleXs.map(scanBottom);

        let x1 = Math.max(0, ...lefts);
        let y1 = Math.max(0, ...tops);
        let x2 = Math.min(r.width, ...rights);
        let y2 = Math.min(r.height, ...bottoms);

        if (!(x2 > x1 && y2 > y1)) {
            x1 = 0;
            y1 = 0;
            x2 = r.width;
            y2 = r.height;
        }

        return {
            x1: Math.round(x1),
            y1: Math.round(y1),
            x2: Math.round(x2),
            y2: Math.round(y2),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1)
        };
    }

    _getExportRectPx(mode) {
        const visibleRect = this._getVisibleScreenRectPx();

        // 通常保存は「見えている範囲」
        if (!mode) return visibleRect;

        // A4/A3 保存は選択矩形を優先
        const paperRect = this._getA4MaskRectPx(mode);
        if (!paperRect) return visibleRect;

        // 念のため、画面上で実際に見えている範囲と交差を取る
        const rect = this._intersectRect(visibleRect, paperRect);

        // 交差できなければ paperRect を使う
        return rect || paperRect;
    }

    // rect weite
    writeRect(svg, param) {
        const root = this._getSvgRoot(svg);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", param.x);
        rect.setAttribute("y", param.y);
        rect.setAttribute("width", param.width);
        rect.setAttribute("height", param.height);
        rect.setAttribute("fill", "white");
        rect.setAttribute("fill-opacity", param.opacity ?? 1);
        rect.setAttribute("stroke", "black");
        rect.setAttribute("stroke-width", param.strokeWidth ?? 0.25);
        root.appendChild(rect);
    }

    // WriteText svg, params:text,size,font,color,anchor
    textWrite(svg, params) {
        const root = this._getSvgRoot(svg);
        if (!root) throw new Error("textWrite: svg root not found");

        const NS = "http://www.w3.org/2000/svg";
        const pad = params.padMm ?? 2;
        const lineHeightEm = params.lineHeightEm ?? 1.2;
        const maxWidthMm = params.maxWidthMm ?? 60;
        const background = params.background !== false;

        // 1行ラベルだけは背景を少しタイトにする
        // 既存出力例の 7.1989... -> 6.6658... に合わせるなら 5/6 がちょうどよい
        const singleLineHeightScale = params.singleLineHeightScale ?? (5 / 6);

        let measureFont;
        let fontSizeUser;
        let pxToUser;

        if (params.sizePx != null && params.mmPerPx != null) {
            measureFont = `${params.sizePx}px ${params.font}`;
            fontSizeUser = params.sizePx * params.mmPerPx;
            pxToUser = params.mmPerPx;
        } else if (params.sizePt != null) {
            const ptToUser = 25.4 / 72;
            measureFont = `${params.sizePt}pt ${params.font}`;
            fontSizeUser = params.sizePt * ptToUser;
            pxToUser = 25.4 / 96;
        } else {
            throw new Error("textWrite: sizePx+mmPerPx or sizePt required");
        }

        const maxWidthPx = maxWidthMm / pxToUser;

        const wrapLines = (text, maxWidthPx) => {
            const out = [];
            const paragraphs = String(text ?? "").split(/\r?\n/);

            for (const para of paragraphs) {
                if (para === "") {
                    out.push("");
                    continue;
                }

                let line = "";
                for (const ch of para) {
                    const test = line + ch;
                    const m = this.getTextSize({ text: test, font: measureFont });
                    if (line !== "" && m.width > maxWidthPx) {
                        out.push(line);
                        line = ch;
                    } else {
                        line = test;
                    }
                }
                if (line !== "") out.push(line);
            }

            return out.length ? out : [""];
        };

        const lines = wrapLines(params.text, maxWidthPx);

        let textWidthPx = 0;
        for (const line of lines) {
            const m = this.getTextSize({ text: line || " ", font: measureFont });
            textWidthPx = Math.max(textWidthPx, m.width);
        }

        const oneLine = this.getTextSize({ text: "あ", font: measureFont });
        const lineHeightPx = oneLine.height * lineHeightEm;
        const isSingleLine = lines.length === 1;

        const textHeightPx = isSingleLine
            ? oneLine.height * singleLineHeightScale
            : lineHeightPx * lines.length;

        const wUser = textWidthPx * pxToUser;
        const hUser = textHeightPx * pxToUser;

        let x0 = params.x;
        if (params.anchor === "middle") x0 = params.x - wUser / 2;
        if (params.anchor === "end") x0 = params.x - wUser;

        if (background) {
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", String(x0));
            rect.setAttribute("y", String(params.y - hUser / 2 - pad));
            rect.setAttribute("rx", "1.5");
            rect.setAttribute("ry", "1.5");
            rect.setAttribute("width", String(wUser + pad * 2));
            rect.setAttribute("height", String(hUser + pad * 2));
            rect.setAttribute("fill", "white");
            rect.setAttribute("fill-opacity", "0.6");
            root.appendChild(rect);
        }

        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", String(x0 + pad));
        t.setAttribute("text-anchor", "start");
        t.setAttribute("font-family", params.font);
        t.setAttribute("font-size", String(fontSizeUser));
        t.setAttribute("fill", params.color);

        if (isSingleLine) {
            // 1行時はラベル中心に文字を置く
            t.setAttribute("y", String(params.y));
            t.setAttribute("dominant-baseline", "middle");
        } else {
            // 複数行時は従来通り上から積む
            t.setAttribute("y", String(params.y - hUser / 2 + (oneLine.height * pxToUser) / 2));
        }

        lines.forEach((line, i) => {
            const span = document.createElementNS(NS, "tspan");
            span.setAttribute("x", String(x0 + pad));
            span.setAttribute("dy", i === 0 ? "0" : `${lineHeightEm}em`);
            span.textContent = line || " ";
            t.appendChild(span);
        });

        root.appendChild(t);

        return {
            width: wUser,
            height: hUser,
            lines
        };
    }

    measureWrappedText(params) {
        const lineHeightEm = params.lineHeightEm ?? 1.2;
        const wrapTighten = params.wrapTightenPx ?? 6;
        const maxWidthPx = (params.maxWidthMm / params.pxToUser) - wrapTighten;
        const measureFont = params.font;

        const wrapLines = (text, maxWidthPx) => {
            const out = [];
            const paragraphs = String(text ?? "").split(/\r?\n/);

            for (const para of paragraphs) {
                if (para === "") {
                    out.push("");
                    continue;
                }

                let line = "";
                for (const ch of para) {
                    const test = line + ch;
                    const m = this.getTextSize({ text: test, font: measureFont });
                    if (line !== "" && m.width > maxWidthPx) {
                        out.push(line);
                        line = ch;
                    } else {
                        line = test;
                    }
                }
                if (line !== "") out.push(line);
            }

            return out.length ? out : [""];
        };

        const lines = wrapLines(params.text, maxWidthPx);

        let textWidthPx = 0;
        for (const line of lines) {
            const m = this.getTextSize({ text: line || " ", font: measureFont });
            textWidthPx = Math.max(textWidthPx, m.width);
        }

        const oneLine = this.getTextSize({ text: "あ", font: measureFont });
        const lineHeightPx = oneLine.height * lineHeightEm;
        const isSingleLine = lines.length === 1;
        const textHeightPx = isSingleLine ? oneLine.height : (lineHeightPx * lines.length);

        return {
            width: textWidthPx * params.pxToUser,
            height: textHeightPx * params.pxToUser,
            lines
        };
    }

    // set svg style(no set opacity) overstyle:true時はそちらを返す
    svg_style(key, overstyle) {
        // ウェイの線の太さを計算
        let common, style, weight = 1, nowzoom = map.getZoom();
        if (nowzoom < 15) {
            //weight = 1 / (15 - nowzoom);
            weight = 1 - ((Math.pow(2, 15 - nowzoom) - 1) / 10);
        } else if (nowzoom > 15) {
            weight = 1 + (nowzoom - 15) * 0.6;
        };
        // color:SVG色 / width:SVG Line Weight / dashArray:破線 / linecap:終端の形状
        switch (overstyle) {
            case true:
                let dashs = Conf.style[LayerCont.palette][key].overstyle.dashArray.split(" ");
                dashs = dashs.map(dash => dash * weight);
                common = {
                    "stroke": true, "dashArray": `${dashs[0]} ${dashs[1]}`,
                    "lineJoin": Conf.style[LayerCont.palette][key].overstyle.linecap, "lineCap": Conf.style[LayerCont.palette][key].overstyle.linecap,
                    "bubblingMouseEvents": false, "weight": Conf.style[LayerCont.palette][key].overstyle.width * weight,
                    "color": Conf.style[LayerCont.palette][key].overstyle.color
                };
                break;
            default:
                common = {
                    "stroke": true, "dashArray": Conf.style[LayerCont.palette][key].dashArray,
                    "lineJoin": Conf.style[LayerCont.palette][key].linecap, "lineCap": Conf.style[LayerCont.palette][key].linecap,
                    "bubblingMouseEvents": false, "weight": Layers[key].width * weight
                };
        }
        if (overstyle) {
            style = common;
        } else if (Conf.style[LayerCont.palette][key].type == "area") {	// overstyle時は枠指定しない
            style = Object.assign(common, { "color": Layers[key].color_dark, "fillColor": Layers[key].color });
        } else {
            style = Object.assign(common, { "color": Layers[key].color, "fillColor": Layers[key].color_dark });
        };
        return style;
    }

    // 文字列のサイズを計算
    // params {text:対象の文字列,font:CSSフォント指定}
    getTextSize(params) {
        let canvas = document.createElement('canvas');
        let context = canvas.getContext('2d');
        context.font = params.font;
        var metrics = context.measureText(params.text);
        return { width: metrics.width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
    }

    /**
     * 2つのSVGの座標系(viewBox)を揃える（BをAの座標系に変換して重ねる）
    * - svgA, svgB: SVGElement（それぞれ viewBox を持つこと）
    * - mode:
    *   - "stretch" : 縦横比を無視してA全体に引き伸ばし
    *   - "contain" : 縦横比維持でA内に全体が入る（余白あり）
    *   - "cover"   : 縦横比維持でAを埋める（はみ出し＝トリミング）
    *
    * 返り値: { svg: SVGElement, groupB: SVGGElement } （統合SVGと、変換済みBグループ）
    */
    alignTwoSvgs(svgA, svgB, mode = "contain") {
        if (!(svgA instanceof SVGElement) || !(svgB instanceof SVGElement)) {
            throw new TypeError("svgA/svgB must be SVGElement");
        }

        const parseViewBox = (svg) => {
            const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
            if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) {
                throw new Error("viewBox is missing or invalid: " + svg.outerHTML.slice(0, 80) + "...");
            }
            return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
        };

        const vbA = parseViewBox(svgA);
        const vbB = parseViewBox(svgB);

        // 親SVG（Aの座標系を採用）
        const NS = "http://www.w3.org/2000/svg";
        const out = document.createElementNS(NS, "svg");
        out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        out.setAttribute("viewBox", `${vbA.x} ${vbA.y} ${vbA.w} ${vbA.h}`);

        // Aの中身（<svg>自体は入れず、中身だけ）
        const gA = document.createElementNS(NS, "g");
        for (const n of Array.from(svgA.childNodes)) gA.appendChild(n.cloneNode(true));
        out.appendChild(gA);

        // Bの中身を入れるグループ
        const gB = document.createElementNS(NS, "g");
        for (const n of Array.from(svgB.childNodes)) gB.appendChild(n.cloneNode(true));
        out.appendChild(gB);

        // A領域全体にBを載せる（dest = AのviewBox領域）
        const destX = vbA.x, destY = vbA.y, destW = vbA.w, destH = vbA.h;

        const sx0 = destW / vbB.w;
        const sy0 = destH / vbB.h;

        let sx, sy, tx, ty;

        if (mode === "stretch") {
            sx = sx0; sy = sy0;
            tx = destX - vbB.x * sx;
            ty = destY - vbB.y * sy;
        } else {
            const s = (mode === "cover") ? Math.max(sx0, sy0) : Math.min(sx0, sy0);
            sx = s; sy = s;

            // Bをスケールした後のサイズ
            const scaledW = vbB.w * s;
            const scaledH = vbB.h * s;

            // 中央寄せ
            const offsetX = (destW - scaledW) / 2;
            const offsetY = (destH - scaledH) / 2;

            tx = (destX + offsetX) - vbB.x * s;
            ty = (destY + offsetY) - vbB.y * s;
        }

        // transform（順序が重要：translate→scale）
        // SVGの transform は右から適用されるので、"translate(...) scale(...)" は
        // 「まずscaleして、その後translate」になる点に注意。
        // ここでは計算を scale前提で作っているのでこの順序でOK。
        gB.setAttribute("transform", `translate(${tx} ${ty}) scale(${sx} ${sy})`);

        return { svg: out, groupB: gB };
    }


}
