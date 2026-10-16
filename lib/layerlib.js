"use strict";

// Layersをグローバル変数として利用(要見直し)
//let gray = Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
class LayerControl {		// for line&area / nodeはMarker

    constructor() {
        this.palette = "";
        this.styles = [];
    }

    // 初期化処理
    init() {
        console.log("layerCont init.");
        this.palette = Conf.default.Palette;
        let lamp = Layers.MAP == undefined ? "" : Layers.MAP;
        Layers = { "background": { "opacity": Conf.style[this.palette].background.opacity }, "MAP": lamp };
        // clearAll() から再初期化されても、同じレイヤーを重複登録しない。
        this.styles = Object.keys(Conf.style[this.palette]);
        this.setStyle(this.palette);
        winCont.domAdd("a4_top", "article");			// make area_select
        winCont.domAdd("a4_bottom", "article");
        winCont.domAdd("a4_left", "article");
        winCont.domAdd("a4_right", "article");
        winCont.domAdd("a3_top", "article");			// make area_select
        winCont.domAdd("a3_bottom", "article");
        winCont.domAdd("a3_left", "article");
        winCont.domAdd("a3_right", "article");
    }

    colorSwatches(palette = this.palette) {
        if (palette !== 'mono') return Conf.default.swatches;
        return Array.from({ length: 17 }, (_, i) => {
            const gray = Math.round(255 * (16 - i) / 16).toString(16).padStart(2, '0');
            return `#${gray.repeat(3)}`;
        });
    }

    // 指定したパレットで色と線を設定する
    setStyle(palette) {
        console.log("layerCont SetStyle.");
        this.palette = palette;
        const mobilePalette = document.getElementById('mobilePaletteSelect');
        if (mobilePalette) mobilePalette.value = palette;
        let updateFlag = false;
        for (let key in Conf.style[palette]) {
            let nstyle = Conf.style[palette][key];
            let opacity = typeof (nstyle.opacity) == "undefined" ? "" : nstyle.opacity;
            let dColor = nstyle.color == "" ? "" : chroma(nstyle.color).darken(Conf.default.ColorDarken).hex();
            if (Layers[key] == undefined) Layers[key] = {};
            Layers[key]["color"] = nstyle.color;
            Layers[key]["color_dark"] = dColor;
            Layers[key]["width"] = nstyle.width;
            Layers[key]["opacity"] = opacity;
            let domColor = document.getElementById(key + "_color");
            let domLine = document.getElementById(key + "_Line");
            if (domColor) {
                domColor.setAttribute("value", nstyle.color);
                const picker = typeof mapMaker !== 'undefined' ? mapMaker.colorPicker?.[key] : null;
                picker?.setOptions({ swatches: this.colorSwatches(palette) });
                picker?.setColor(nstyle.color);
                if (domLine) domLine.setAttribute("value", nstyle.width);
                updateFlag = true;
            }
        }
        if (Layers.background.opacity === 0) {
            $("#mapid, #background_color").css('background-color', "").addClass("bg-clear");
        } else {
            $("#mapid, #background_color").css('background-color', Layers.background.color).removeClass("bg-clear");
        }
        if (updateFlag) this.updateLayer();
    }

    // OSM layer=* を第一キー、従来のカテゴリ順を第二キーとして並べる。
    // 再描画や個別スタイル更新の後でも addTo(map) の時系列に依存させない。
    applyDrawOrder() {
        const orderedLayers = [];

        this.styles.forEach((key, styleIndex) => {
            const styleOrder = getMapMakerStyleDrawOrder(this.palette, key, styleIndex);
            (Layers[key]?.svg || []).forEach((svg, serial) => {
                const order = svg?.mapmaker?.drawOrder;
                if (!order) return;
                orderedLayers.push({ svg, ...order, styleOrder, serial });
            });
        });

        orderedLayers.sort(compareMapMakerDrawOrder).forEach(({ svg }) => {
            if (typeof svg.bringToFront === "function") {
                svg.bringToFront();
                return;
            }
            if (typeof svg.eachLayer === "function") {
                svg.eachLayer(layer => layer?.bringToFront?.());
            }
        });
    }

    makeLayer(key, view, updateDrawOrder = true) {
        for (const step of this.layerSteps(key, view, updateDrawOrder)) { }
    }

    async makeLayerAsync(key, view, updateDrawOrder = true, progress = () => {}) {
        let started = performance.now();
        for (const count of this.layerSteps(key, view, updateDrawOrder)) {
            if (performance.now() - started < 12) continue;
            progress(count, Layers[key].geojson.length);
            await new Promise(resolve => setTimeout(resolve, 0));
            started = performance.now();
        }
    }

    *layerSteps(key, view, updateDrawOrder = true) {
        // --- debug helpers ---
        const getGeomType = (obj) => {
            // Leafletの参照揺れ: layer.feature / layer._layers[x].feature など
            try {
                const f =
                    obj?.feature ||
                    obj?.layer?.feature ||
                    obj?.target?.feature ||
                    obj?.sourceTarget?.feature ||
                    obj?.layer?._layers && Object.values(obj.layer._layers)[0]?.feature ||
                    obj?.target?._layers && Object.values(obj.target._layers)[0]?.feature;
                return f?.geometry?.type;
            } catch (e) {
                return undefined;
            }
        };
        const isPolygonType = (gtype) => (gtype === "Polygon" || gtype === "MultiPolygon");
        // ----------------------

        let way_toggle = function (ev) {					// wayをクリックしたときのイベント（表示/非表示切り替え）
            let key = ev.target.mapmaker.key;
            let nextid = ev.target.mapmaker.id + 1;
            let options = ev.target.options;

            // fillRule は options ではなく SVG の attribute に効くこともあるが、念のため保持
            options.fillRule = "evenodd";

            if (options.opacity == 0) {
                options.fillOpacity = 1;
                options.opacity = 1;
                ev.target.options.opacity = 1;

                // line レイヤでも Polygon/MultiPolygon は塗る（coast merge の結果を表示するため）
                const gtype = getGeomType(ev);
                const isPoly = isPolygonType(gtype);
                if (!isPoly && Conf.style[this.palette][key].type !== "area") options.fillOpacity = 0;

            } else {
                options.fillOpacity = 0;
                options.opacity = 0;
                ev.target.options.opacity = 0;
            }

            const pointStyleName = ev.target.mapmaker.pointStyleName;
            const style = pointStyleName ? getMapMakerPointStyle(pointStyleName) : SVGCont.svg_style(key, false);
            options.color = pointStyleName ? style.lineColor : style.color;
            options.fillColor = style.fillColor;
            options.weight = style.width ?? style.weight;

            ev.target.setStyle(options);

            if (Layers[key].svg[nextid] !== undefined) {
                if (Layers[key].svg[nextid].overstyle !== undefined) {
                    Layers[key].svg[nextid].options = Object.assign({}, options);
                    Layers[key].svg[nextid].setStyle(Layers[key].svg[nextid].options);
                }
            }
        };

        let type = Conf.style[this.palette][key].type;

        // view 指定がある場合は先に反映（ログにも載せたいのでここで）
        if (view !== undefined) Layers[key].opacity = view ? 1 : 0;

        // base style
        let style = SVGCont.svg_style(key, false);

        // geojsonが無いなら既存があれば消して終了（従来通り）
        if (Layers[key].geojson === undefined) {
            if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
            Layers[key].svg = [];
            console.log(`layer make: ${key}: no geojson`);
            return;
        }

        // 既存レイヤ削除
        if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));

        if (Layers[key].geojson !== undefined) {		// already geojson
            let ways = [];
            const storedOpacity = Layers[key].opacity;
            const visible = view !== undefined
                ? view
                : (storedOpacity === "" || storedOpacity === undefined || Number(storedOpacity) > 0);
            // Category visibility is separate from individual feature visibility.
            let opacity = { "fillOpacity": 1, "opacity": 1 };

            // style は way ごとに geometry を見て決める（lineレイヤでもPolygonは塗る）
            const styleIndex = this.styles.indexOf(key);
            const styleOrder = getMapMakerStyleDrawOrder(this.palette, key, styleIndex);
            for (let featureOrder = 0; featureOrder < Layers[key].geojson.length; featureOrder++) {
                const way0 = Layers[key].geojson[featureOrder];
                yield featureOrder;
                let way = way0; // turf.circle で差し替えるのでローカル変数化
                const osmLayer = getMapMakerOsmLayer(way0);
                let pointStyleName = null;

                // 変換前の type
                const gtype0 = way?.geometry?.type;
                const isPoly0 = isPolygonType(gtype0);

                // base style + opacity を複製
                let style1 = Object.assign({}, style, opacity, { fillRule: "evenodd", smoothFactor: 0 });
                style1.fillRule = "evenodd";

                // lineレイヤは原則 fill しない。ただし例外レイヤだけ許可する
                const allowFillEvenIfLine = new Set(["sea"]);
                if (type !== "area") {
                    style1.fillOpacity = 0; // Polygonでも塗らない（原則）
                    if (isPoly0 && allowFillEvenIfLine.has(key)) {
                        style1.fillOpacity = opacity.fillOpacity; // 例外は従来通り塗る
                    }
                }

                // lineレイヤで、かつ Polygon ではない場合だけ fill を 0 にする
                if (!isPoly0 && type !== "area") style1.fillOpacity = 0;

                // Point→circle（Polygon化）
                if (way?.geometry?.type === "Point") {
                    pointStyleName = getMapMakerPointStyleName(way);
                    if (!pointStyleName) continue;
                    const pointStyle = getMapMakerPointStyle(pointStyleName);
                    let center = way.geometry.coordinates;
                    let options = { steps: 32, units: "meters", properties: { foo: "bar" } };
                    let radius = pointStyle.radius;
                    way = turf.circle(center, radius, options);
                    style1.color = pointStyle.lineColor;
                    style1.fillColor = pointStyle.fillColor;
                    style1.weight = pointStyle.width;
                    // circleはPolygonになるので塗る（fillOpacityはそのまま）
                    // もし「樹木は塗りたくない」ならここで style1.fillOpacity=0 にする
                }

                // 地物ごとのスタイルは編集モデルとMapLibre描画で共有する。
                ways.push(MapEngine.geoJSON(way, { style: () => ({ ...style1 }) }));

                ways[ways.length - 1].addTo(map).on('click', way_toggle.bind(this));
                ways[ways.length - 1].mapmaker = {
                    id: ways.length - 1,
                    key,
                    drawOrder: { osmLayer, styleOrder, featureOrder, passOrder: 0 },
                    pointStyleName,
                    sourceFeature: pointStyleName ? way0 : undefined
                };

                // SVG要素に filter を当てる
                let svgdom = ways[ways.length - 1].getLayers()[0].getElement();
                let filter = Conf.style[this.palette][key].filter;
                if (filter !== undefined) if (map.getZoom() >= filter.zoom) svgdom.style.filter = filter.value;

                // fill-rule は options.fillRule だけでは効かないことがあるので SVG にも付与
                //（Polygon/MultiPolygonで穴あき等を扱う想定）
                try {
                    svgdom?.setAttribute("fill-rule", "evenodd");
                    svgdom?.setAttribute("data-osm-layer", String(osmLayer));
                } catch (e) { }

                if (Conf.style[this.palette][key].overstyle !== undefined && !pointStyleName) {	// overstyleがある場合
                    let tstyle = SVGCont.svg_style(key, true);
                    tstyle = Object.assign({}, tstyle, opacity, { fillRule: "evenodd" });
                    tstyle.fillRule = "evenodd";

                    // lineレイヤでも Polygon/MultiPolygon は塗る
                    const gtype1 = way?.geometry?.type;
                    const isPoly1 = isPolygonType(gtype1);
                    if (!isPoly1 && type !== "area") tstyle.fillOpacity = 0;

                    ways.push(MapEngine.geoJSON(way, { style: () => tstyle }));
                    ways[ways.length - 1].addTo(map);
                    ways[ways.length - 1].mapmaker = {
                        id: ways.length - 1,
                        key,
                        drawOrder: { osmLayer, styleOrder, featureOrder, passOrder: 1 }
                    };
                    ways[ways.length - 1].overstyle = true;

                    // overstyle側にも fill-rule
                    try {
                        const svg2 = ways[ways.length - 1].getLayers()[0].getElement();
                        svg2?.setAttribute("fill-rule", "evenodd");
                        svg2?.setAttribute("data-osm-layer", String(osmLayer));
                    } catch (e) { }
                }
            }
            Layers[key].svg = ways;
            if (updateDrawOrder) this.applyDrawOrder();
        }
        //console.log(`layer make: ${key}: ok`);
    }

    // Update layers(color/lime weight change)
    updateLayer(target) {
        if (map.editorRenderer?.active) {
            const keys = target ? [target] : this.styles;
            for (const key of keys) map.editorRenderer.refreshCategory(key);
            return;
        }
        if (target == "" || typeof (target) == "undefined") {		// no targetkey then update all layer
            for (let key of LayerCont.styles) if (Layers[key].geojson) LayerCont.makeLayer(key);
        } else {
            if (Layers[target].geojson) LayerCont.makeLayer(target);
        };
        // 手書きプレビューは通常レイヤーの複製なので、パレット変更後に作り直す。
        if (typeof mapMaker !== "undefined" && mapMaker.rough_options().enabled) mapMaker.rough_change();
        console.log("mapMaker: update... end ");
    }

    // 線幅だけを既存のLeafletレイヤーへ反映し、地物の再生成を避ける。
    updateLayerWidth(target) {
        if (map.editorRenderer?.active) { map.editorRenderer.refreshCategory(target); return; }
        const svgs = Layers[target]?.svg;

        if (!svgs?.length) {
            if (Layers[target]?.geojson) this.makeLayer(target);
        } else {
            svgs.forEach(svg => {
                const pointStyleName = svg.mapmaker?.pointStyleName;
                const style = pointStyleName
                    ? getMapMakerPointStyle(pointStyleName)
                    : SVGCont.svg_style(target, svg.overstyle !== undefined);
                svg.setStyle({ weight: pointStyleName ? style.width : style.weight });
            });
        }

        if (typeof mapMaker !== "undefined" && mapMaker.rough_options().enabled) mapMaker.rough_change();
        console.log("mapMaker: line width update... end ");
    }

    // 表示状態だけを既存のSVG要素へ反映し、地物の再生成を避ける。
    updateLayerVisibility(target, visible) {
        Layers[target].opacity = visible ? 1 : 0;
        if (map.editorRenderer?.active) { map.editorRenderer.setCategoryVisibility(target); return; }
        const svgs = Layers[target]?.svg;

        if (!svgs?.length) {
            if (Layers[target]?.geojson) this.makeLayer(target, visible);
        } else {
            svgs.forEach(svg => {
                svg.eachLayer(layer => {
                    const element = layer.getElement?.();
                    if (element) element.style.display = visible ? "" : "none";
                });
            });
        }

        map.schedule();
        console.log("mapMaker: visibility update... end ");
    }

    // Aree select(A4)
    area_select(mode) {
        let dom, p = winCont.a4_getsize(mode);
        if (p.top > 0) {
            dom = document.getElementById("a4_top");
            dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.top}px; top: 0px; left: 0px;"></div>`;
            dom = document.getElementById("a4_bottom");
            dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.bottom}px; top:  ${p.height - p.bottom}px; left: 0px;"></div>`;
        } else {
            dom = document.getElementById("a4_top");
            if (dom !== null) { dom.innerHTML = `` };
            dom = document.getElementById("a4_bottom");
            if (dom !== null) { dom.innerHTML = `` };
        };
        if (p.left > 0) {
            dom = document.getElementById("a4_left");
            dom.innerHTML = `<div class="area_mask" style="width: ${p.left}px; height: 100%; top: 0px; left: 0px;"></div>`;
            dom = document.getElementById("a4_right");
            dom.innerHTML = `<div class="area_mask" style="width: ${p.right}px; height: 100%; top: 0px; left: ${p.width - p.right}px;"></div>`;
        } else {
            dom = document.getElementById("a4_left");
            if (dom !== null) { dom.innerHTML = `` };
            dom = document.getElementById("a4_right");
            if (dom !== null) { dom.innerHTML = `` };
        };
    }

    clearAll() {
        console.log("LayerCont: all clear... ");
        for (let key of LayerCont.styles) if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
        LayerCont.init();
    }
}
