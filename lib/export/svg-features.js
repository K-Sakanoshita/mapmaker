"use strict";

// DOM-free SVG engine. All state arrives in a versioned export snapshot.
class SVGFeatureExporter {
    constructor(opts = {}, context = { config: {}, palette: 'color', season: 'normal' }) {
        this.context = context;
        this.layers = {};
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

            // 背景（layers.background.color を使う等、呼び出し側で指定）
            background: null, // 例: "#ffffff"
            backgroundOpacity: 1,

            // 線幅の扱い
            // スタイルのweight(px)を出力上のmmに換算する係数
            // 例: 1px相当を0.15mmにする、等
            pxToMm: 0.15,
            minStrokeMm: 0.10,

            // SVG座標（mm）への丸め（文字列長削減。形状簡略化ではない）
            coordDecimals: 3,

            // 穴あきポリゴン
            fillRule: "evenodd",

            // PointはSVGのcircleまたは多角形として描画する。
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
     * 南西・北東の取得メソッドを持つboundsからbboxLonLatを作る。
     * @param {{getSouthWest: function, getNorthEast: function}} bounds
     * @returns {[number,number,number,number]}
     */
    static boundsToBBoxLonLat(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return [sw.lng, sw.lat, ne.lng, ne.lat];
    }

    /**
     * Render data-only feature snapshots into editable SVG.
     * @param {object} snapshot バージョン付きの保存用スナップショット
     * @param {[number,number,number,number]} bboxLonLat [minLon,minLat,maxLon,maxLat]
     * @param {object} options 上書き
     * @returns {string} SVG text
     */
    render(snapshot, bboxLonLat, options = {}) {
        if (snapshot?.version !== 1) throw new Error('Unsupported export snapshot');
        this.flagDefinitions = new Map(); this.flagImageSerial = 0;
        this.context = snapshot.context;
        this.layers = snapshot.layers;
        const config = snapshot.context.config;
        const layers = snapshot.layers;
        const opt = { ...this.opts, ...options };
        const page = this._resolvePaper(opt.paper, opt);
        const palette = snapshot.context.palette || config.default?.Palette;
        if (!palette) throw new Error('Export palette is required');
        const layerKeys = snapshot.layerKeys;
        const allFeatures=layerKeys.flatMap(key=>Array.isArray(layers[key]?.features)?layers[key].features:[]);
        opt.buildingParts=MapMakerGeometry.buildingParts(this.context, allFeatures,opt.birdseye);
        const pathMeshes=opt.birdseye?MapMakerGeometry.elevatedPaths(this.context,allFeatures,opt.birdseye):new Map();
        const elevatedPaths=[];
        const tf=this._makeTransform(bboxLonLat,page,opt);
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
            const styleOrder = MapMakerDomain.styleDrawOrder(this.context, palette, key, styleIndex);
            if (key === "background") continue;
            if (!layers?.[key]?.features) continue;

            // skip hidden (layer-wide)
            const layerOpacity =
                (layers[key].opacity === "" || typeof layers[key].opacity === "undefined")
                    ? 1
                    : Number(layers[key].opacity);

            if (opt.skipHiddenLayers && layerOpacity <= 0) continue;

            const type = config.style?.[palette]?.[key]?.type;

            const baseStyle = snapshot.styles[key][0];
            const over = config.style?.[palette]?.[key]?.overstyle ? snapshot.styles[key][1] : null;

            // collect features/geoms
            const items = Array.isArray(layers[key].features) ? layers[key].features : [layers[key].features];

            // Plain edit records preserve individual visibility/style changes.
            const hasOver = !!over;
            const svgLayers = layers?.[key]?.edits || [];
            const svgByFeaturePass = new Map();
            svgLayers.forEach(svg => {
                const order = svg?.mapmaker?.drawOrder;
                if (order) svgByFeaturePass.set(`${order.featureOrder}:${order.passOrder}`, svg);
            });

            for (let i = 0; i < items.length; i++) {
                const feature = this._normalizeToFeature(items[i]);
                if (!feature?.geometry) continue;
                if (!MapMakerGeometry.shouldRenderBuilding(this.context, feature,!!opt.birdseye,opt.buildingParts,opt.birdseye)) continue;
                if (opt.birdseye && !opt.camera && !this._intersectsBBox(feature, bboxLonLat)) continue;
                const osmLayer = MapMakerDomain.osmLayer(feature);

                // ★ base の live options（クリックで変更された opacity/fillOpacity 等）
                const baseSvg = svgByFeaturePass.get(`${i}:0`);
                const baseInner = baseSvg?.getLayers ? baseSvg.getLayers()[0] : baseSvg;
                const baseOpt = baseInner?.options || {};
                const liveBase = MapMakerDomain.seasonStyle(this.context, feature,key,{ ...baseStyle, ...baseOpt });
                const editorWrap = svg => {
                    const id = baseSvg?.editorId ?? baseSvg?.id;
                    if (!opt.editorHitTargets || id === undefined || !(baseSvg?.editorClickable || typeof baseSvg?.click === 'function')) return svg;
                    const hitMode = /LineString$/.test(feature.geometry.type) && !(opt.birdseye && MapMakerGeometry.isExtrudedBarrier(this.context, feature)) ? 'stroke' : 'all';
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
                    const pointStyleName = MapMakerDomain.pointStyleName(this.context, feature);
                    if (!pointStyleName) continue;
                    const pointStyle = MapMakerDomain.pointStyle(this.context, pointStyleName, feature);
                    if (opt.birdseye && ['tree','flagpole'].includes(pointStyleName)) {
                        const centers = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                        for (const center of centers) {
                            const tree = feature.geometry.type === 'Point' ? feature : { ...feature, geometry: { type: 'Point', coordinates: center } };
                            const rendered = MapMakerGeometry.pointParts(this.context, tree).map(part => {
                                const style = { fill: part.color || (part.name === 'trunk' ? MapMakerDomain.treeTrunkColor(this.context) : pointStyle.fillColor),
                                    fillOpacity: featOpacity, stroke: 'none', strokeWidthMm: 0, strokeOpacity: 0 };
                                return this._buildingSVG({ ...tree, geometry: part.geometry }, tf, style, opt, part);
                            });
                            buildings.push({ depth: Math.max(...rendered.map(part => part.depth)),
                                svg: editorWrap(`<g data-${pointStyleName === 'tree' ? 'tree' : 'flagpole'}-id="${this._esc(feature.id ?? '')}">${rendered.map(part => part.svg).join('')}</g>`),
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

                    const pathMesh=pathMeshes.get(MapMakerGeometry.pathKey(feature));
                    if(pathMesh?.shape==='walkway') {
                        const rendered=this._elevatedWalkwaySVG(feature,pathMesh,tf,{...style,fill:'none',fillOpacity:0},opt,key,osmLayer);
                        elevatedPaths.push({...rendered,path:true,svg:editorWrap(rendered.svg),osmLayer,serial:pathSerial++});
                        continue;
                    }
                    if(pathMesh) {
                        const pathStyle={...style,fill:MapMakerDomain.stairFillColor(style.stroke,palette),fillOpacity:style.strokeOpacity,dashArrayMm:null,strokeWidthMm:style.strokeWidthMm*.55};
                        const rendered=this._buildingSVG(feature,tf,pathStyle,opt,{mesh:pathMesh});
                        elevatedPaths.push({...rendered,path:true,svg:editorWrap(rendered.svg),osmLayer,serial:pathSerial++});
                        continue;
                    }
                    if(MapMakerGeometry.isRetainingWall(this.context, feature)) {
                        const latitude=MapMakerGeometry.retainingWallLines(feature).coordinates[0]?.[0]?.[1] ?? 0;
                        const cos=Math.max(.01,Math.cos(latitude*Math.PI/180));
                        const mpp=opt.camera?40075016.68557849*cos/(512*2**opt.camera.zoom):cos*opt.pxToMm/tf.scale;
                        const lineStyle={...style,lineCap:'butt',dashArrayMm:[6,4].map(n=>n*Math.max(opt.pxToMm,style.strokeWidthMm))};
                        const line=this._pathElement(this._geomToPathD(MapMakerGeometry.retainingWallLines(feature),tf,lineStyle),lineStyle);
                        const symbolStyle={...style,fill:style.stroke,fillOpacity:style.strokeOpacity,stroke:'none',strokeWidthMm:0,dashArrayMm:null};
                        const triangles=this._geomToPathD(MapMakerGeometry.retainingWallSymbols(this.context, feature,mpp),tf,symbolStyle);
                        pathParts.push({svg:editorWrap(`<g data-retaining-wall-symbols="true">${line}${this._pathElement(triangles,symbolStyle)}</g>`),osmLayer,styleOrder,featureOrder:i,passOrder:0,serial:pathSerial++});
                        continue;
                    }
                    if (opt.birdseye && MapMakerGeometry.isMeshBarrier(this.context, feature)) {
                        const mesh = MapMakerGeometry.barrierMesh(this.context, feature, {...opt.birdseye,viewZoom:opt.camera?.zoom});
                        for (const panel of mesh.panels) {
                            const barrier = this._barrierMeshSVG(panel, mesh, tf, style, opt);
                            buildings.push({...barrier, svg:editorWrap(barrier.svg), osmLayer, serial:pathSerial++});
                        }
                        continue;
                    }
                    if (opt.birdseye && MapMakerGeometry.isExtrudedBarrier(this.context, feature)) {
                        // 折れ曲がった壁を一括で並べると、手前の端点に引かれて
                        // 奥の部分まで建物の上に重なる。線分ごとに奥行きを判定する。
                        for (const coordinates of MapMakerGeometry.barrierGeometry(this.context, feature).coordinates) {
                            const wallFeature = { ...feature, geometry: { type: 'Polygon', coordinates } };
                            const wall = this._buildingSVG(wallFeature, tf, { ...style, fill: style.stroke,
                                fillOpacity: style.strokeOpacity, strokeWidthMm: 0, dashArrayMm: null }, opt);
                            buildings.push({ ...wall, svg: editorWrap(wall.svg), osmLayer, serial: pathSerial++ });
                        }
                        continue;
                    }
                    if (opt.birdseye && isPoly && MapMakerDomain.isBuilding(feature)) {
                        const building = this._buildingSVG(feature, tf, style, opt);
                        buildings.push({ ...building, feature, svg: editorWrap(building.svg), osmLayer, serial: pathSerial++ });
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
            .sort(MapMakerDomain.compareDrawOrder)
            .map(part => part.svg);
        // 地面の道・面を先に、建物は画面奥から手前へ描く。
        // Compare projected surface depths inside compound buildings before painting.
        const buildingGroups=new Map(),partParents=new Set(opt.buildingParts.parents.values());
        for(const building of buildings) {
            const parent=building.feature && opt.buildingParts.parents.get(MapMakerGeometry.buildingKey(building.feature));
            const featureKey=building.feature && MapMakerGeometry.buildingKey(building.feature);
            const key=parent ?? (partParents.has(featureKey)?featureKey:building);
            if(!buildingGroups.has(key))buildingGroups.set(key,{depth:-Infinity,serial:building.serial,parts:[]});
            const group=buildingGroups.get(key);
            group.depth=Math.max(group.depth,building.depth);group.parts.push(building);
        }
        for(const group of buildingGroups.values())this._maskBuildingParts(group.parts,tf,opt);
        if(elevatedPaths.length)this._maskBuildingParts([...buildings,...elevatedPaths],tf,{...opt,pathTargetsOnly:true});
        const orderedBuildings=[...buildingGroups.values()].sort((a,b)=>a.depth-b.depth||a.serial-b.serial).flatMap(group=>
            group.parts.sort((a,b)=>a.depth-b.depth||a.serial-b.serial).map(b=>b.svg)).concat(elevatedPaths.sort((a,b)=>a.depth-b.depth||a.serial-b.serial).map(p=>p.svg));
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
  ${this.flagDefinitions.size ? `<defs>${[...this.flagDefinitions.values()].join('')}</defs>` : ''}${body}
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
                toPageMmXY: (ll, altitude) => toPage(homogeneous(ll, altitude)),
                depthAt: (ll, altitude) => { const p=homogeneous(ll,altitude);return p[2]/p[3]; }, clipPolygon, clipLine };

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
            for (const layer of Object.values(this.layers)) {
                if (opt.skipHiddenLayers && Number(layer?.opacity) === 0) continue;
                const features = layer?.features;
                for (const item of (Array.isArray(features) ? features : [features])) {
                    const f = this._normalizeToFeature(item);
                    if (f?.geometry && this._intersectsBBox(f, bboxLonLat) && (["tree","flagpole"].includes(MapMakerDomain.pointStyleName(this.context, f)) || MapMakerGeometry.isExtrudedBarrier(this.context, f) || MapMakerDomain.isBuilding(f))) {
                        if (!opt.buildingParts || MapMakerGeometry.shouldRenderBuilding(this.context, f,true,opt.buildingParts,bird)) maxHeight = Math.max(maxHeight, MapMakerGeometry.pointParts(this.context, f)?.at(-1)?.height ?? MapMakerGeometry.roofMesh(this.context, f, bird)?.height ?? MapMakerGeometry.buildingHeight(this.context, f, bird));
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
                depthAt: (ll,z) => {
                    const [x,y]=this._project3857(ll);
                    const v=(x-cx)*Math.sin(angle)+(cy-y)*Math.cos(angle);
                    return -v*Math.sin(tilt)-z/cosLat*Math.cos(tilt);
                },
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

        // fitModeがcoverなら出力範囲を埋め、containなら全体を収める。
        const cover = (opt.fitMode === "cover");
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

    _elevatedWalkwaySVG(feature, mesh, tf, style, opt, layerKey, osmLayer) {
        const project=p=>{if(tf.camera)return tf.toPageMmXY(p,p[2]);const q=tf.toPageMmXY(p);return [q[0],q[1]-tf.heightMm(p[2])];};
        const parts=[],surfaces=[];let depth=-Infinity;
        for(const line of mesh.lines) {
            const runs=tf.clipLine?tf.clipLine(line):[line.map(project)];
            const d=runs.filter(run=>run.length>=2).map(run=>run.map(([x,y],i)=>`${i?'L':'M'}${this._fmt(x,opt)} ${this._fmt(y,opt)}`).join('')).join(' ');
            if(!d)continue;
            for(const run of runs)for(const p of run)depth=Math.max(depth,p[1]);
            const casing=Number(style.strokeWidthMm)>0 ? `<g data-path-casing="true">${this._pathElement(d,{...style,stroke:'#ffffff',strokeWidthMm:style.strokeWidthMm+2*Number(opt.strokePxToMm ?? opt.pxToMm),dashArrayMm:null},layerKey,osmLayer)}</g>` : '';
            const svg=`<g data-building-surface="${surfaces.length}">${casing}${this._pathElement(d,style,layerKey,osmLayer)}</g>`;
            parts.push(svg);surfaces.push({svg,rings:[line],edge:true,opaque:false});
        }
        return {depth,surfaces,svg:`<g data-rough-preserve="building" data-elevated-path-id="${this._esc(feature.id ?? '')}" data-path-kind="walkway" data-source-height-m="${this._fmt(mesh.sourceHeight,opt)}" data-height-m="${this._fmt(mesh.height,opt)}">${parts.join('')}</g>`};
    }

    _barrierMeshSVG(panel, mesh, tf, style, opt) {
        const project = ([lon,lat,z]) => {
            if (tf.camera) return tf.toPageMmXY([lon,lat],z);
            const [x,y] = tf.toPageMmXY([lon,lat]); return [x,y-tf.heightMm(z)];
        };
        const paths = new Map(); let depth = -Infinity;
        for (const [index,edge] of panel.edges.entries()) {
            depth = Math.max(depth, ...edge.map(point=>project(point)[1]));
            const runs = tf.clipLine ? tf.clipLine(edge) : [edge.map(project)];
            const width = panel.edgeWidths[index];
            if (!paths.has(width)) paths.set(width,[]);
            for (const run of runs) if (run.length>=2) paths.get(width).push(run.map(([x,y],i)=>`${i?'L':'M'}${this._fmt(x,opt)} ${this._fmt(y,opt)}`).join(''));
        }
        const svg = [...paths].map(([width,lines])=>this._pathElement(lines.join(' '),{...style,
            fill:'none', fillOpacity:0, strokeWidthMm:style.strokeWidthMm*width*(mesh.strokeScale ?? 1), dashArrayMm:null})).join('');
        return {depth, surfaces:[], svg:`<g data-rough-preserve="building" data-${mesh.shape}-mesh="true" data-height-m="${this._fmt(mesh.height,opt)}" data-display-height-m="${this._fmt(mesh.displayHeight,opt)}">${svg}</g>`};
    }

    _buildingSVG(feature, tf, style, opt, extrusion = {}) {
        const roofMesh = extrusion.mesh ?? (extrusion.height === undefined ? MapMakerGeometry.roofMesh(this.context, feature, opt.birdseye) : null);
        const height = roofMesh?.wallHeight ?? extrusion.height ?? MapMakerGeometry.buildingHeight(this.context, feature, opt.birdseye);
        const base = roofMesh?.base ?? extrusion.base ?? (MapMakerDomain.isBuilding(feature)?MapMakerGeometry.buildingRange(this.context, feature,opt.birdseye).base:0);
        const rise = tf.camera ? 0 : tf.heightMm(height);
        // 色に含まれるalphaは壁の陰影にも反映し、透明な壁に黒だけ残さない。
        const fillAlpha = /^#[0-9a-f]{8}$/i.test(style.fill) ? parseInt(style.fill.slice(-2), 16) / 255 : 1;
        const polygons = extrusion.mesh ? [] : feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        const parts = [], edgeMap = new Map(), edgeScales = new Map(), surfaces=[];
        const record=(svg,rings,edge=false)=>{
            const wrapped=`<g data-building-surface="${surfaces.length}">${svg}</g>`;
            surfaces.push({svg:wrapped,rings,edge,opaque:!edge&&style.fill!=='none'&&style.fillOpacity*fillAlpha>0});
            return wrapped;
        };
        const addEdge = (a,b,scale=1) => {
            const key=[JSON.stringify(a),JSON.stringify(b)].sort().join('|');
            if (!edgeMap.has(key)) {edgeMap.set(key,[a,b]);edgeScales.set(key,scale);}
        };
        const project = ([lon,lat,z]) => {
            if (tf.camera) return tf.toPageMmXY([lon,lat],z);
            const [x,y]=tf.toPageMmXY([lon,lat]); return [x,y-tf.heightMm(z)];
        };
        let depth = extrusion.mesh ? Math.max(...roofMesh.faces.flatMap(face=>face.points.map(p=>project(p)[1]))) : -Infinity;
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
                    const wallStyle = { ...style, fill: style.fill, fillOpacity: style.fillOpacity, ...(roofMesh ? { stroke:'none' } : {}) };
                    if (roofMesh) {
                        const outline=[[...polygon[ringIndex][i],base],[...polygon[ringIndex][i+1],base],
                            [...polygon[ringIndex][i+1],height],[...polygon[ringIndex][i],height]];
                        outline.forEach((a,i)=>addEdge(a,outline[(i+1)%outline.length]));
                    }
                    walls.push({ depth: (a[1] + b[1]) / 2,
                        svg: record(`<g data-building-face="wall">${this._pathElement(path(wallPoints), wallStyle)}<path d="${path(wallPoints)}" fill="#000" fill-opacity="${0.18 * style.fillOpacity * fillAlpha}" stroke="none" /></g>`,[[[...polygon[ringIndex][i],base],[...polygon[ringIndex][i+1],base],[...polygon[ringIndex][i+1],height],[...polygon[ringIndex][i],height]]]) });
                }
            });
            parts.push(...walls.sort((a, b) => a.depth - b.depth).map(w => w.svg));
            const roofRings = tf.clipPolygon ? polygon.map(ring => tf.clipPolygon(ring.map(ll => [...ll, height]))) : roofs;
            const roof = roofRings.filter(ring => ring.length).map(ring => path(ring)).join(" ");
            if (roof && !roofMesh) parts.push(record(`<g data-building-face="roof">${this._pathElement(roof, style)}</g>`,polygon.map(ring=>ring.map(ll=>[...ll,height]))));
        }
        if (roofMesh) {
            const wireframe=style.fill==='none' || Number(style.fillOpacity)===0;
            const projected = roofMesh.faces.map(face => {
                const points=tf.clipPolygon ? tf.clipPolygon(face.points) : face.points.map(project);
                const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
                return { face, points, area, depth:points.reduce((n,p)=>n+p[1],0)/points.length };
            }).filter(face=>face.points.length>=3 && (wireframe || face.area < -1e-10)).sort((a,b)=>a.depth-b.depth);
            for (const {face,points} of projected) {
                const image=face.texture && this.context.config.flagImages?.[face.texture];
                const fill=image ? this._flagImageSVG(face,tf,style,opt,image) : this._pathElement(path(points),{...style,fill:MapMakerDomain.roofShadeColor(face.color || style.fill,face.shade),stroke:'none'});
                parts.push(record(`<g data-building-face="${face.kind}" data-roof-shade="${this._fmt(face.shade,opt)}">${fill}</g>`,[face.points]));
                if(!roofMesh.path)face.points.forEach((a,i)=>addEdge(a,face.points[(i+1)%face.points.length]));
            }
            if(roofMesh.path)roofMesh.edges.forEach((edge,i)=>addEdge(...edge,roofMesh.edgeWidths[i]));
            const lines=[];
            for(const [edgeKey,edge] of edgeMap) {
                const runs=tf.clipLine ? tf.clipLine(edge) : [edge.map(project)];
                for(const run of runs) if(run.length>=2) lines.push(record(this._pathElement(run.map(([x,y],i)=>`${i?'L':'M'}${this._fmt(x,opt)} ${this._fmt(y,opt)}`).join(''),{...style,fill:'none',fillOpacity:0,stroke:roofMesh.path?MapMakerDomain.roofShadeColor(style.stroke,.85):style.stroke,strokeWidthMm:style.strokeWidthMm*(edgeScales.get(edgeKey)??1)}),[edge],true));
            }
            if(lines.length) parts.push(`<g data-building-edges="roof">${lines.join('')}</g>`);
        }
        const id = feature.id ?? feature.properties?.id ?? "";
        return { depth, surfaces, svg: parts.length ? `<g data-rough-preserve="building" ${extrusion.mesh?.path ? `data-elevated-path-id="${this._esc(id)}" data-path-kind="${extrusion.mesh.shape}" data-source-height-m="${this._fmt(extrusion.mesh.sourceHeight,opt)}"` : `data-building-id="${this._esc(id)}"`} data-height-m="${roofMesh?.height ?? height}"${extrusion.mesh?.shape === "flag" ? ` data-flagpole-cloth="true"${extrusion.mesh.flagCode ? ` data-flag-country="${extrusion.mesh.flagCode}"` : ''}` : extrusion.mesh && !extrusion.mesh.path ? ` data-tree-crown="${extrusion.mesh.shape}" data-tree-tip="rounded"` : roofMesh ? ` data-roof-shape="${roofMesh.shape}"` : ''}>${parts.join("\n")}</g>` : "" };
    }

    _flagImageSVG(face, tf, style, opt, href) {
        this.flagDefinitions ||= new Map();
        const imageId=`mapmaker-flag-image-${face.texture}`;
        if (!this.flagDefinitions.has(imageId)) this.flagDefinitions.set(imageId,
            `<image id="${imageId}" width="1" height="1" preserveAspectRatio="none" href="${this._esc(href)}"/>`);
        const shadeId=`mapmaker-flag-shade-${Math.round(face.shade*100)}`;
        if(face.shade!==1 && !this.flagDefinitions.has(shadeId)) this.flagDefinitions.set(shadeId,
            `<filter id="${shadeId}" color-interpolation-filters="sRGB"><feComponentTransfer>${['R','G','B'].map(channel=>`<feFunc${channel} type="linear" slope="${face.shade}"/>`).join('')}</feComponentTransfer></filter>`);
        const parts=[];
        const outerId=`mapmaker-flag-outer-${++this.flagImageSerial}`;
        const outer=tf.clipPolygon ? tf.clipPolygon(face.points) : face.points.map(p=>{const xy=tf.toPageMmXY(p,p[2]);if(!tf.camera)xy[1]-=tf.heightMm(p[2]);return xy;});
        if(outer.length<3)return '';
        const outline=outer.map(([x,y],i)=>`${i?'L':'M'}${this._fmt(x,opt)} ${this._fmt(y,opt)}`).join('')+'Z';
        for(const indices of [[0,1,2],[0,2,3]]) {
            const world=indices.map(i=>face.points[i]),uv=indices.map(i=>face.uv[i]);
            const projected=world.map(p=>tf.toPageMmXY(p,p[2]));
            // The non-camera transform takes altitude through heightMm.
            if(!tf.camera)projected.forEach((p,i)=>p[1]-=tf.heightMm(world[i][2]));
            if(!projected.flat().every(Number.isFinite))continue;
            const clipped=tf.clipPolygon ? tf.clipPolygon(world) : projected;
            if(clipped.length<3)continue;
            const [u0,u1,u2]=uv,[p0,p1,p2]=projected;
            const du1=u1[0]-u0[0],dv1=u1[1]-u0[1],du2=u2[0]-u0[0],dv2=u2[1]-u0[1],det=du1*dv2-du2*dv1;
            if(Math.abs(det)<1e-12)continue;
            const a=((p1[0]-p0[0])*dv2-(p2[0]-p0[0])*dv1)/det,b=((p1[1]-p0[1])*dv2-(p2[1]-p0[1])*dv1)/det;
            const c=((p2[0]-p0[0])*du1-(p1[0]-p0[0])*du2)/det,d=((p2[1]-p0[1])*du1-(p1[1]-p0[1])*du2)/det;
            const matrix=[a,b,c,d,p0[0]-a*u0[0]-c*u0[1],p0[1]-b*u0[0]-d*u0[1]];
            const id=`mapmaker-flag-clip-${++this.flagImageSerial}`;
            // Slight overlap avoids antialias seams between the two image triangles.
            const center=clipped.reduce((p,q)=>[p[0]+q[0]/clipped.length,p[1]+q[1]/clipped.length],[0,0]);
            const pad=this._pxToMm(.25,opt);
            const bleed=clipped.map(([x,y])=>{const dx=x-center[0],dy=y-center[1],length=Math.hypot(dx,dy)||1;return [x+dx/length*pad,y+dy/length*pad];});
            const path=bleed.map(([x,y],i)=>`${i?'L':'M'}${this._fmt(x,opt)} ${this._fmt(y,opt)}`).join('')+'Z';
            parts.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${path}"/></clipPath><g clip-path="url(#${id})"><use href="#${imageId}" transform="matrix(${matrix.map(n=>this._fmt(n,opt)).join(' ')})" opacity="${style.fillOpacity ?? 1}"${face.shade!==1?` filter="url(#${shadeId})"`:''}/></g>`);
        }
        return `<clipPath id="${outerId}" clipPathUnits="userSpaceOnUse"><path d="${outline}"/></clipPath><g clip-path="url(#${outerId})">${parts.join('')}</g>`;
    }

    // Vector masks remove surfaces behind another part, including translucent
    // fills and strokes. Depth on a projected planar face is affine in x/y.
    _maskBuildingParts(buildings,tf,opt) {
        if(buildings.length<2 || !tf.depthAt)return;
        const project=p=>tf.camera?tf.toPageMmXY(p,p[2]):(()=>{const q=tf.toPageMmXY(p);return [q[0],q[1]-tf.heightMm(p[2])];})();
        const plane=surface=>{
            const points=surface.rings[0].map(p=>[...project(p),tf.depthAt(p,p[2])]);
            const a=points[0];
            for(let i=1;i<points.length-1;i++){
                const b=points[i],c=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-a[0],ey=c[1]-a[1],det=dx*ey-dy*ex;
                if(Math.abs(det)<1e-12)continue;
                const u=((b[2]-a[2])*ey-(c[2]-a[2])*dy)/det;
                const v=(dx*(c[2]-a[2])-ex*(b[2]-a[2]))/det;
                return [u,v,a[2]-u*a[0]-v*a[1]];
            }
            if(surface.edge&&points.length>=2){
                const b=points[1],dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
                if(n>1e-12){const u=(b[2]-a[2])*dx/n,v=(b[2]-a[2])*dy/n;return [u,v,a[2]-u*a[0]-v*a[1]];}
            }
        };
        const all=[];
        for(const building of buildings)for(const surface of building.surfaces||[]){
            const equation=plane(surface);if(!equation)continue;
            const rings=surface.rings.map(r=>surface.edge?r.map(project):tf.clipPolygon?tf.clipPolygon(r):r.map(project)).filter(r=>r.length);
            const points=rings.flat();if(!points.length)continue;
            const box=[Infinity,Infinity,-Infinity,-Infinity];for(const p of points){box[0]=Math.min(box[0],p[0]);box[1]=Math.min(box[1],p[1]);box[2]=Math.max(box[2],p[0]);box[3]=Math.max(box[3],p[1]);}
            all.push({...surface,building,equation,rings,box});
        }
        const path=rings=>rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${this._fmt(p[0],opt)} ${this._fmt(p[1],opt)}`).join('')+'Z').join(' ');
        let serial=0;
        for(const target of all){
            if(opt.pathTargetsOnly && !target.building.path)continue;
            const occluders=[];
            for(const other of all){
                if(other.building===target.building||!other.opaque || opt.pathTargetsOnly && other.building.path)continue;
                const a=target.box,b=other.box;if(a[0]>b[2]||b[0]>a[2]||a[1]>b[3]||b[1]>a[3])continue;
                const delta=target.equation.map((n,i)=>n-other.equation[i]);
                const evaluate=p=>delta[0]*p[0]+delta[1]*p[1]+delta[2]-1e-12;
                const clipped=other.rings.map(ring=>{
                    const result=[];let a=ring[ring.length-1],fa=evaluate(a);
                    for(const b of ring){const fb=evaluate(b);if((fa>0)!==(fb>0)){const t=fa/(fa-fb);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}if(fb>0)result.push(b);a=b;fa=fb;}
                    return result;
                }).map(ring=>{
                    // Clip every occluder to the affected surface. Repeating a
                    // whole roof and rasterizing page-sized masks for small
                    // building parts can stall high-resolution PNG exports.
                    for(const [axis,limit,sign] of [[0,target.box[0]-2,1],[0,target.box[2]+2,-1],[1,target.box[1]-2,1],[1,target.box[3]+2,-1]]) {
                        if(!ring.length)break;
                        const output=[];let a=ring[ring.length-1],fa=(a[axis]-limit)*sign;
                        for(const b of ring){const fb=(b[axis]-limit)*sign;if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);output.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}if(fb>=0)output.push(b);a=b;fa=fb;}
                        ring=output;
                    }
                    return ring;
                }).filter(r=>r.length>=3);
                if(clipped.length)occluders.push(`<path d="${path(clipped)}" fill="black" fill-rule="evenodd"/>`);
            }
            if(!occluders.length)continue;
            const id=`building-visibility-${target.building.serial}-${serial++}`;
            // Bound all visibility masks, including compound building parts.
            const box=[target.box[0]-2,target.box[1]-2,target.box[2]-target.box[0]+4,target.box[3]-target.box[1]+4];
            const bounds=`x="${this._fmt(box[0],opt)}" y="${this._fmt(box[1],opt)}" width="${this._fmt(box[2],opt)}" height="${this._fmt(box[3],opt)}"`;
            const mask=`<defs><mask id="${id}" maskUnits="userSpaceOnUse" ${bounds}><rect ${bounds} fill="white"/>${occluders.join('')}</mask></defs>`;
            target.building.svg=target.building.svg.replace(target.svg,`${mask}<g mask="url(#${id})">${target.svg}</g>`);
        }
    }

    _normalizeToFeature(obj) {
        if (!obj) return null;
        if (obj.type === "Feature") return obj;
        if (obj.type && obj.coordinates) return { type: "Feature", properties: {}, geometry: obj };
        if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
            // ここでは単一Featureとして扱えないので、呼び出し側で配列に展開すべき
            // ただし layers[key].features が FeatureCollectionを直接持つことは少ない前提
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
        // dashArrayは "4 2" などの文字列、または数値配列に対応する。
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

        // 地物スタイルの透明度とカテゴリの透明度を掛け合わせる。
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
