"use strict";

// カテゴリの編集状態と描画モデルを管理する。
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
        LayerPanel.createMasks((id, tag) => winCont.domAdd(id, tag));
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
        if (typeof mapMaker === 'undefined' || !mapMaker.customMode) return this.applyPalette(palette);
        const processing = mapMaker.beginProcessing();
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        const previous = this.paletteTask || Promise.resolve();
        const task = previous.catch(() => {}).then(async () => {
            try {
                // Let the shared processing message paint before synchronous style work.
                await frame(); await frame();
                this.applyPalette(palette);
                await mapMaker.queueExportPreview();
                if (mapMaker.rough_options().enabled) await mapMaker.finishInitialRoughPreview();
                await frame(); await frame();
            } finally {
                mapMaker.endProcessing(processing);
            }
        });
        this.paletteTask = task;
        return task;
    }

    applyPalette(palette) {
        this.palette = palette;
        LayerState.applyPalette(Layers, Conf.style[palette], color => chroma(color).darken(Conf.default.ColorDarken).hex());
        const changed = LayerPanel.reflectPalette(palette, Layers, this.colorSwatches(palette));
        if (changed) this.updateLayer();
    }

    // OSM layer=* を第一キー、従来のカテゴリ順を第二キーとして並べる。
    // 再描画や個別スタイル更新の後でも addTo(map) の時系列に依存させない。
    applyDrawOrder() {
        const orderedLayers = [];

        this.styles.forEach((key, styleIndex) => {
            const styleOrder = getMapMakerStyleDrawOrder(this.palette, key, styleIndex);
            LayerRenderRegistry.get(Layers[key]).forEach((svg, serial) => {
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
        // イベントまたは描画モデルからジオメトリ型を取得する。
        const getGeomType = (obj) => {
            // 直接のモデル参照と、互換イベントのlayer/target参照に対応する。
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

            // 表示復帰後もポリゴンの穴を保持する。
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

            if (LayerRenderRegistry.get(Layers[key])[nextid] !== undefined) {
                if (LayerRenderRegistry.get(Layers[key])[nextid].overstyle !== undefined) {
                    LayerRenderRegistry.get(Layers[key])[nextid].options = Object.assign({}, options);
                    LayerRenderRegistry.get(Layers[key])[nextid].setStyle(LayerRenderRegistry.get(Layers[key])[nextid].options);
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
            if (LayerRenderRegistry.get(Layers[key])) LayerRenderRegistry.get(Layers[key]).forEach(svg => map.removeLayer(svg));
            LayerRenderRegistry.set(Layers[key], []);
            console.log(`layer make: ${key}: no geojson`);
            return;
        }

        // 既存レイヤ削除
        if (LayerRenderRegistry.get(Layers[key])) LayerRenderRegistry.get(Layers[key]).forEach(svg => map.removeLayer(svg));

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

                // DOMを返す互換描画経路向けのフィルター設定。
                let svgdom = ways[ways.length - 1].getLayers()[0].getElement();
                let filter = Conf.style[this.palette][key].filter;
                if (filter !== undefined) if (map.getZoom() >= filter.zoom) svgdom.style.filter = filter.value;

                // DOMを返す互換描画経路にも穴とOSM layerの情報を渡す。
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
            LayerRenderRegistry.set(Layers[key], ways);
            if (updateDrawOrder) this.applyDrawOrder();
        }
    }

    // Update layers(color/lime weight change)
    updateLayer(target) {
        if (map.editorRenderer?.active) {
            const keys = target ? [target] : this.styles;
            for (const key of keys) map.editorRenderer.refreshCategory(key);
            if (typeof mapMaker !== "undefined" && mapMaker.rough_options().enabled) mapMaker.rough_change();
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

    // MapLibre描画を更新し、互換描画経路では既存モデルの線幅を変更する。
    updateLayerWidth(target) {
        if (map.editorRenderer?.active) {
            map.editorRenderer.refreshCategoryWidth(target);
            if (typeof mapMaker !== "undefined" && mapMaker.rough_options().enabled) mapMaker.rough_change();
            return;
        }
        const svgs = LayerRenderRegistry.get(Layers[target]);

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

    // カテゴリの表示状態を編集状態と描画へ反映する。
    updateLayerVisibility(target, visible) {
        LayerState.setVisibility(Layers[target], visible);
        if (map.editorRenderer?.active) {
            map.editorRenderer.setCategoryVisibility(target);
            if (typeof mapMaker !== "undefined" && mapMaker.rough_options().enabled) mapMaker.rough_change();
            return;
        }
        const svgs = LayerRenderRegistry.get(Layers[target]);

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

    // 用紙サイズに応じた選択範囲を表示する。
    area_select(mode) { LayerPanel.selectPaper(winCont.a4_getsize(mode)); }

    clearAll() {
        console.log("LayerCont: all clear... ");
        // Geometry layers are lightweight models in one MapLibre renderer.
        // Drop them together instead of scheduling one redraw per feature.
        map.features.clear();
        map.schedule();
        LayerCont.init();
    }
}
