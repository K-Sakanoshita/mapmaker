"use strict";

/**
 * GeoCoastline.merge(features, bboxMode = "LL")
 *
 * ハイブリッド版
 *
 * 1) natural=coastline の Polygon / MultiPolygon しか無い場合
 *    - それを land とみなす
 *    - island 全体の bbox を広げた outer frame を作る
 *    - sea = outerFrame - land
 *
 * 2) natural=coastline の LineString / MultiLineString がある場合
 *    - BBOX-hole 方式で sea polygon を作る
 *
 * 注意:
 * - closed coastline polygon は「海」ではなく「陸地境界」として扱う
 * - bboxMode = "LLL" を渡すと GeoCont.get_LLL() を優先利用
 */
class GeoCoastline {
    merge(geojson_s, bboxMode = "LL") {
        const DBG = false;
        const log = (...a) => DBG && console.log("[GeoCoastline]", ...a);

        if (!Array.isArray(geojson_s) || geojson_s.length === 0) return geojson_s;
        if (typeof turf === "undefined") {
            console.error("GeoCoastline: turf is required");
            return geojson_s;
        }

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug = window.GeoCoastlineDebug || {
                lastExpandedBBox: null,
                lastExpandedBBoxFeature: null,
                lastViewBBoxFeature: null,
                lastKeepBBoxFeature: null,
                lastLandUnionFeature: null,
                lastSeaFC: null,
                lastCandidateFC: null,
                lastCandidates: []
            };
        }

        const getter = (bboxMode === "LLL" && typeof GeoCont.get_LLL === "function")
            ? "get_LLL"
            : "get_LL";

        const B = GeoCont[getter]();
        const BB = {
            minX: B.NW.lng,
            maxX: B.SE.lng,
            minY: B.SE.lat,
            maxY: B.NW.lat
        };

        const EPS = 1e-12;
        const BBOX_SCALE = Math.max(BB.maxX - BB.minX, BB.maxY - BB.minY);
        const JOIN_EPS = Math.max(BBOX_SCALE * 1e-9, 1e-10);

        const samePt = (a, b) =>
            !!a && !!b &&
            Math.abs(a[0] - b[0]) < EPS &&
            Math.abs(a[1] - b[1]) < EPS;

        // Overpass / GeoJSON conversion can introduce tiny rounding differences at
        // way boundaries. Use a bbox-relative tolerance only when joining ways;
        // polygon closure still uses the stricter samePt check above.
        const sameEndpoint = (a, b) =>
            !!a && !!b &&
            Math.abs(a[0] - b[0]) <= JOIN_EPS &&
            Math.abs(a[1] - b[1]) <= JOIN_EPS;

        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        const isInside = (p) =>
            p[0] >= BB.minX - EPS && p[0] <= BB.maxX + EPS &&
            p[1] >= BB.minY - EPS && p[1] <= BB.maxY + EPS;

        const snapToBBox = (p) => {
            const x = clamp(p[0], BB.minX, BB.maxX);
            const y = clamp(p[1], BB.minY, BB.maxY);
            const sx =
                Math.abs(x - BB.minX) < 1e-10 ? BB.minX :
                    Math.abs(x - BB.maxX) < 1e-10 ? BB.maxX : x;
            const sy =
                Math.abs(y - BB.minY) < 1e-10 ? BB.minY :
                    Math.abs(y - BB.maxY) < 1e-10 ? BB.maxY : y;
            return [sx, sy];
        };

        const closeRing = (ring) => {
            if (!Array.isArray(ring) || ring.length < 3) return ring;
            if (!samePt(ring[0], ring[ring.length - 1])) {
                ring.push(ring[0].slice());
            }
            return ring;
        };

        const ringArea = (ring) => {
            if (!ring || ring.length < 4) return 0;
            let a = 0;
            for (let i = 0; i < ring.length - 1; i++) {
                const [x1, y1] = ring[i];
                const [x2, y2] = ring[i + 1];
                a += (x1 * y2 - x2 * y1);
            }
            return a / 2;
        };

        const bboxOuterRing = () => ([
            [BB.minX, BB.minY],
            [BB.maxX, BB.minY],
            [BB.maxX, BB.maxY],
            [BB.minX, BB.maxY],
            [BB.minX, BB.minY]
        ]);

        const bboxToRing = (bbox) => {
            const [minX, minY, maxX, maxY] = bbox;
            return [
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY],
                [minX, minY]
            ];
        };

        const expandBBox = (bbox, ratio = 0.5, minMargin = 0.001) => {
            const [minX, minY, maxX, maxY] = bbox;
            const w = maxX - minX;
            const h = maxY - minY;
            const mx = Math.max(w * ratio, minMargin);
            const my = Math.max(h * ratio, minMargin);
            return [
                minX - mx,
                minY - my,
                maxX + mx,
                maxY + my
            ];
        };

        const mergeBBoxes = (a, b) => ([
            Math.min(a[0], b[0]),
            Math.min(a[1], b[1]),
            Math.max(a[2], b[2]),
            Math.max(a[3], b[3])
        ]);

        const cleanupRingRaw = (ring) => {
            const out = [];
            for (let i = 0; i < ring.length; i++) {
                const p = ring[i].slice();
                if (out.length === 0 || !samePt(out[out.length - 1], p)) out.push(p);
            }
            return closeRing(out);
        };

        const asPolygonFeatureRaw = (ring, props = {}) => {
            const r = cleanupRingRaw(ring);
            if (!r || r.length < 4) return null;
            if (Math.abs(ringArea(r)) < 1e-20) return null;
            return turf.polygon([r], props);
        };

        const asPolygonWithHolesRaw = (rings, props = {}) => {
            if (!Array.isArray(rings) || rings.length === 0) return null;
            const outer = cleanupRingRaw(rings[0]);
            if (!outer || outer.length < 4 || Math.abs(ringArea(outer)) < 1e-20) return null;
            const cleaned = [outer];
            for (const ring of rings.slice(1)) {
                const hole = cleanupRingRaw(ring);
                if (hole && hole.length >= 4 && Math.abs(ringArea(hole)) >= 1e-20) {
                    cleaned.push(hole);
                }
            }
            return turf.polygon(cleaned, props);
        };

        const flattenPolygons = (feature) => {
            if (!feature || !feature.geometry) return [];
            const g = feature.geometry;
            const p = feature.properties || {};
            if (g.type === "Polygon") return [turf.feature(g, p)];
            if (g.type === "MultiPolygon") return g.coordinates.map(coords => turf.polygon(coords, p));
            return [];
        };

        const union2 = (a, b) => {
            if (!a) return b || null;
            if (!b) return a || null;
            try {
                return turf.union(turf.featureCollection([a, b]));
            } catch (e1) {
                try {
                    return turf.union(a, b);
                } catch (e2) {
                    console.error("GeoCoastline union failed", e1, e2);
                    return a || b || null;
                }
            }
        };

        const featureArrayUnion = (arr) => {
            let acc = null;
            for (const f of arr) acc = union2(acc, f);
            return acc;
        };

        const difference2 = (a, b) => {
            if (!a) return null;
            if (!b) return a;
            try {
                return turf.difference(turf.featureCollection([a, b]));
            } catch (e1) {
                try {
                    return turf.difference(a, b);
                } catch (e2) {
                    console.error("GeoCoastline difference failed", e1, e2);
                    return a;
                }
            }
        };

        const buildSeaFromClosedCoastline = (landUnion) => {
            const landBBox = turf.bbox(landUnion);
            const viewBBox = [BB.minX, BB.minY, BB.maxX, BB.maxY];
            const expandedBBox = mergeBBoxes(
                expandBBox(landBBox, 0.5, 0.001),
                viewBBox
            );

            const expandedBBoxFeature = turf.polygon(
                [bboxToRing(expandedBBox)],
                { _gen: "debugExpandedBBox" }
            );

            const seaGeom = difference2(expandedBBoxFeature, landUnion);

            return {
                seaGeom,
                expandedBBox,
                expandedBBoxFeature,
                viewBBoxFeature: turf.polygon([bboxOuterRing()], { _gen: "debugViewBBox" })
            };
        };

        // Liang-Barsky
        const clipSegment = (a, b) => {
            let x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1];
            const dx = x1 - x0, dy = y1 - y0;

            let t0 = 0, t1 = 1;
            const p = [-dx, dx, -dy, dy];
            const q = [x0 - BB.minX, BB.maxX - x0, y0 - BB.minY, BB.maxY - y0];

            for (let i = 0; i < 4; i++) {
                if (Math.abs(p[i]) < EPS) {
                    if (q[i] < 0) return null;
                } else {
                    const r = q[i] / p[i];
                    if (p[i] < 0) {
                        if (r > t1) return null;
                        if (r > t0) t0 = r;
                    } else {
                        if (r < t0) return null;
                        if (r < t1) t1 = r;
                    }
                }
            }

            const A = snapToBBox([x0 + t0 * dx, y0 + t0 * dy]);
            const Bp = snapToBBox([x0 + t1 * dx, y0 + t1 * dy]);
            if (samePt(A, Bp)) return null;
            return [A, Bp];
        };

        const clipLineString = (coords) => {
            const segs = [];
            let cur = [];

            const pushCur = () => {
                if (cur.length >= 2) segs.push(cur);
                cur = [];
            };

            for (let i = 0; i < coords.length - 1; i++) {
                const a0 = coords[i];
                const b0 = coords[i + 1];
                const inA = isInside(a0);
                const inB = isInside(b0);

                const clipped = clipSegment(a0, b0);
                if (!clipped) {
                    pushCur();
                    continue;
                }

                const [A, Bp] = clipped;

                if (cur.length === 0) {
                    cur.push(A);
                    cur.push(Bp);
                } else {
                    if (samePt(cur[cur.length - 1], A)) {
                        cur.push(Bp);
                    } else {
                        pushCur();
                        cur.push(A);
                        cur.push(Bp);
                    }
                }

                if (!inB) {
                    pushCur();
                }
            }

            pushCur();
            return segs;
        };
        const edgeOf = (p) => {
            const x = p[0], y = p[1];
            if (Math.abs(y - BB.maxY) < 1e-10) return "N";
            if (Math.abs(x - BB.maxX) < 1e-10) return "E";
            if (Math.abs(y - BB.minY) < 1e-10) return "S";
            if (Math.abs(x - BB.minX) < 1e-10) return "W";
            return null;
        };

        // ----------------------------
        // 1) classify
        // ----------------------------
        const coastLines = [];
        const coastPolys = [];
        const etcs = [];

        for (const f of geojson_s) {
            const g = f && f.geometry;
            const props = f && f.properties ? f.properties : {};
            const isCoast = g && (props.natural === "coastline" || props._coastline === true);

            if (!isCoast) {
                etcs.push(f);
                continue;
            }

            if (g.type === "LineString") {
                coastLines.push(f);
            } else if (g.type === "MultiLineString") {
                for (const line of g.coordinates) {
                    coastLines.push({
                        type: "Feature",
                        properties: props,
                        geometry: { type: "LineString", coordinates: line }
                    });
                }
            } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
                coastPolys.push(f);
            } else {
                etcs.push(f);
            }
        }

        log("coastLines", coastLines.length, "coastPolys", coastPolys.length, "etcs", etcs.length);

        if (coastLines.length === 0 && coastPolys.length === 0) {
            return geojson_s;
        }

        // ----------------------------
        // 2) polygon-only coastline
        // ----------------------------
        if (coastLines.length === 0 && coastPolys.length > 0) {
            const landPolys = [];

            for (const f of coastPolys) {
                const g = f.geometry;

                if (g.type === "Polygon") {
                    const p = asPolygonWithHolesRaw(g.coordinates, { _gen: "landFromPolygonCoastRaw" });
                    if (p) landPolys.push(p);
                } else if (g.type === "MultiPolygon") {
                    for (const poly of g.coordinates) {
                        const p = asPolygonWithHolesRaw(poly, { _gen: "landFromMultiPolygonCoastRaw" });
                        if (p) landPolys.push(p);
                    }
                }
            }

            const landUnion = featureArrayUnion(landPolys);
            if (!landUnion) {
                log("polygon coastline only, but landUnion empty => return as-is");
                return geojson_s;
            }

            const built = buildSeaFromClosedCoastline(landUnion);
            if (!built || !built.seaGeom) {
                log("buildSeaFromClosedCoastline failed => return as-is");
                return geojson_s;
            }

            const seaFeatures = flattenPolygons(built.seaGeom)
                .filter(poly => turf.area(poly) > 0)
                .map(f => {
                    f.properties = Object.assign({}, f.properties || {}, {
                        natural: "water",
                        water: "sea",
                        _gen: "seaFromClosedCoastlineOuterFrame"
                    });
                    return f;
                });

            if (typeof window !== "undefined") {
                window.GeoCoastlineDebug.lastKeepBBoxFeature = null;
                window.GeoCoastlineDebug.lastExpandedBBox = built.expandedBBox;
                window.GeoCoastlineDebug.lastExpandedBBoxFeature = built.expandedBBoxFeature;
                window.GeoCoastlineDebug.lastViewBBoxFeature = built.viewBBoxFeature;
                window.GeoCoastlineDebug.lastLandUnionFeature = landUnion;
                window.GeoCoastlineDebug.lastSeaFC = turf.featureCollection(seaFeatures);
                window.GeoCoastlineDebug.lastCandidateFC = turf.featureCollection(seaFeatures);
                window.GeoCoastlineDebug.lastCandidates = seaFeatures.map((f, idx) => ({
                    idx,
                    area: turf.area(f),
                    mode: "closed-coastline-outer-frame"
                }));
            }

            return seaFeatures.concat(etcs);
        }

        // ----------------------------
        // 3) line-based coastline / mixed coastline
        // ----------------------------
        const lines = coastLines.map(f => f.geometry.coordinates.map(p => p.slice()));
        const take = (arr, i) => arr.splice(i, 1)[0];
        const pool = lines.slice();
        const cords = [];

        while (pool.length > 0) {
            let cord = pool.shift();
            if (!cord || cord.length < 2) continue;

            let changed = true;
            while (changed) {
                changed = false;

                const head = cord[0];
                const tail = cord[cord.length - 1];

                for (let i = 0; i < pool.length; i++) {
                    const seg = pool[i];
                    if (!seg || seg.length < 2) continue;

                    const s0 = seg[0];
                    const s1 = seg[seg.length - 1];

                    if (sameEndpoint(tail, s0)) {
                        take(pool, i);
                        cord = cord.concat(seg.slice(1));
                        changed = true;
                        break;
                    }
                    if (sameEndpoint(head, s1)) {
                        take(pool, i);
                        cord = seg.slice(0, -1).concat(cord);
                        changed = true;
                        break;
                    }
                    // Do not reverse coastline ways to force a connection. OSM
                    // coastline direction is semantic: land must remain on the
                    // left side. A reversed join can flood the land.
                }
            }
            cords.push(cord);
        }
        const rawClosedLandPolys = [];
        const openLines = [];

        const pushRawClosedRing = (ring, gen = "landFromClosedCoastRaw") => {
            const p = asPolygonFeatureRaw(ring, { _gen: gen });
            if (p) rawClosedLandPolys.push(p);
        };

        for (const c of cords) {
            if (!c || c.length < 2) continue;
            if (c.length >= 4 && samePt(c[0], c[c.length - 1])) {
                pushRawClosedRing(c, "landFromClosedLineCoastRaw");
            } else {
                openLines.push(c);
            }
        }

        // Polygon / MultiPolygon coastline は bbox に潰さず raw のまま陸として扱う
        for (const f of coastPolys) {
            const g = f.geometry;
            if (g.type === "Polygon") {
                const p = asPolygonWithHolesRaw(g.coordinates, { _gen: "landFromPolygonCoastRawMixed" });
                if (p) rawClosedLandPolys.push(p);
            } else if (g.type === "MultiPolygon") {
                for (const poly of g.coordinates) {
                    const p = asPolygonWithHolesRaw(poly, { _gen: "landFromMultiPolygonCoastRawMixed" });
                    if (p) rawClosedLandPolys.push(p);
                }
            }
        }

        const sampleSidePoints = (seg, side) => {
            if (!seg || seg.length < 2) return [];
            const probes = [];
            for (let i = 0; i < seg.length - 1; i++) {
                const a = snapToBBox(seg[i]);
                const b = snapToBBox(seg[i + 1]);
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const len = Math.hypot(dx, dy);
                if (len <= EPS) continue;
                const off = Math.min(
                    len * 0.1,
                    Math.max(BBOX_SCALE * 1e-5, 1e-8)
                );
                const probe = [
                    (a[0] + b[0]) / 2 - side * (dy / len) * off,
                    (a[1] + b[1]) / 2 + side * (dx / len) * off
                ];
                if (isInside(probe)) probes.push(probe);
            }
            return probes;
        };

        const edgeParam = (edge, p) => {
            if (edge === "N" || edge === "S") return p[0] - BB.minX;
            return p[1] - BB.minY;
        };

        const splitBBoxEdges = (endpoints) => {
            const edgeCorners = {
                N: [[BB.minX, BB.maxY], [BB.maxX, BB.maxY]],
                E: [[BB.maxX, BB.minY], [BB.maxX, BB.maxY]],
                S: [[BB.minX, BB.minY], [BB.maxX, BB.minY]],
                W: [[BB.minX, BB.minY], [BB.minX, BB.maxY]]
            };
            const result = [];
            for (const edge of ["N", "E", "S", "W"]) {
                const points = edgeCorners[edge].map(p => p.slice());
                for (const endpoint of endpoints) {
                    const p = snapToBBox(endpoint);
                    if (edgeOf(p) === edge && !points.some(q => sameEndpoint(p, q))) points.push(p);
                }
                points.sort((a, b) => edgeParam(edge, a) - edgeParam(edge, b));
                for (let i = 0; i < points.length - 1; i++) {
                    if (!sameEndpoint(points[i], points[i + 1])) {
                        result.push(turf.lineString([points[i], points[i + 1]], {
                            _gen: "bboxEdgeSplit",
                            edge
                        }));
                    }
                }
            }
            return result;
        };

        const openSegments = [];
        for (const line of openLines) {
            const segs = clipLineString(line);
            for (const seg of segs) {
                if (!seg || seg.length < 2) continue;
                const start = snapToBBox(seg[0]);
                const end = snapToBBox(seg[seg.length - 1]);
                // An incomplete coastline whose endpoint is inside the bbox cannot
                // form a reliable face, so fail closed instead of drawing a flood.
                if (!edgeOf(start) || !edgeOf(end)) continue;
                openSegments.push(seg.map(snapToBBox));
            }
        }

        const viewBBox = [BB.minX, BB.minY, BB.maxX, BB.maxY];

        // 表示 bbox の少し外までを有効範囲とする
        const keepBBox = expandBBox(viewBBox, 0.15, 0.0005);
        const keepBBoxFeature = turf.polygon(
            [bboxToRing(keepBBox)],
            { _gen: "debugKeepBBox" }
        );

        // 広い解析 bbox(LLL) に入った「遠方の closed land」を除外する
        const filteredRawClosedLandPolys = rawClosedLandPolys.filter(f => {
            try {
                return turf.booleanIntersects(f, keepBBoxFeature);
            } catch (e) {
                return false;
            }
        });

        const closedLandUnion = featureArrayUnion(filteredRawClosedLandPolys);

        // A closed LineString is land just like a Polygon coastline. When no open
        // coastline crosses the viewport, returning it as-is makes the area layer
        // paint land as sea. Build sea as the outer frame minus the closed land.
        if (openSegments.length === 0) {
            if (!closedLandUnion) {
                log("no open coastline and no closed land => return as-is");
                return geojson_s;
            }
            const built = buildSeaFromClosedCoastline(closedLandUnion);
            if (!built || !built.seaGeom) return geojson_s;

            const seaFeatures = flattenPolygons(built.seaGeom)
                .filter(poly => turf.area(poly) > 0)
                .map(poly => {
                    poly.properties = Object.assign({}, poly.properties || {}, {
                        natural: "water",
                        water: "sea",
                        _gen: "seaFromClosedLineCoastlineOuterFrame"
                    });
                    return poly;
                });

            if (typeof window !== "undefined") {
                window.GeoCoastlineDebug.lastKeepBBoxFeature = keepBBoxFeature;
                window.GeoCoastlineDebug.lastExpandedBBox = built.expandedBBox;
                window.GeoCoastlineDebug.lastExpandedBBoxFeature = built.expandedBBoxFeature;
                window.GeoCoastlineDebug.lastViewBBoxFeature = built.viewBBoxFeature;
                window.GeoCoastlineDebug.lastLandUnionFeature = closedLandUnion;
                window.GeoCoastlineDebug.lastSeaFC = turf.featureCollection(seaFeatures);
                window.GeoCoastlineDebug.lastCandidateFC = turf.featureCollection(seaFeatures);
                window.GeoCoastlineDebug.lastCandidates = seaFeatures.map((f, idx) => ({
                    idx,
                    area: turf.area(f),
                    mode: "closed-line-coastline-outer-frame"
                }));
            }

            return seaFeatures.concat(etcs);
        }

        if (typeof turf.polygonize !== "function") {
            log("turf.polygonize unavailable => return as-is");
            return geojson_s;
        }

        const polygonizeLines = openSegments.map(seg =>
            turf.lineString(seg, { _gen: "coastlineOpen" }));
        const endpoints = openSegments.flatMap(seg => [seg[0], seg[seg.length - 1]]);
        polygonizeLines.push(...splitBBoxEdges(endpoints));

        let faces;
        try {
            faces = turf.polygonize(turf.featureCollection(polygonizeLines));
        } catch (e) {
            console.error("GeoCoastline polygonize failed", e);
            return geojson_s;
        }
        if (!faces || !Array.isArray(faces.features) || faces.features.length === 0) {
            log("polygonize produced no faces => return as-is");
            return geojson_s;
        }

        const leftProbes = openSegments.flatMap(seg => sampleSidePoints(seg, 1));
        const rightProbes = openSegments.flatMap(seg => sampleSidePoints(seg, -1));
        const probeHits = (poly, probes) => probes.reduce((count, probe) => {
            try {
                return count + (turf.booleanPointInPolygon(
                    turf.point(probe), poly, { ignoreBoundary: true }) ? 1 : 0);
            } catch (e) {
                return count;
            }
        }, 0);

        const candidateMeta = [];
        const acceptedSeaFaces = [];
        faces.features.forEach((face, idx) => {
            const leftHits = probeHits(face, leftProbes);
            const rightHits = probeHits(face, rightProbes);
            candidateMeta.push({ idx, area: turf.area(face), leftHits, rightHits });
            if (rightHits > leftHits && rightHits > 0) acceptedSeaFaces.push(face);
        });
        if (acceptedSeaFaces.length === 0) {
            log("no sea faces matched right-side probes => return as-is");
            return geojson_s;
        }

        const seaFeatures = [];
        for (const face of acceptedSeaFaces) {
            const withoutClosedLand = difference2(face, closedLandUnion);
            for (const poly of flattenPolygons(withoutClosedLand)) {
                if (turf.area(poly) <= 0) continue;
                poly.properties = Object.assign({}, poly.properties || {}, {
                    natural: "water",
                    water: "sea",
                    _gen: "seaFromPolygonizedCoastline"
                });
                seaFeatures.push(poly);
            }
        }

        if (typeof window !== "undefined") {
            window.GeoCoastlineDebug.lastExpandedBBox = null;
            window.GeoCoastlineDebug.lastExpandedBBoxFeature = null;
            window.GeoCoastlineDebug.lastViewBBoxFeature = turf.polygon([bboxOuterRing()], { _gen: "debugViewBBox" });
            window.GeoCoastlineDebug.lastLandUnionFeature = closedLandUnion;
            window.GeoCoastlineDebug.lastSeaFC = turf.featureCollection(seaFeatures);
            window.GeoCoastlineDebug.lastCandidateFC = faces;
            window.GeoCoastlineDebug.lastCandidates = candidateMeta;
        }

        return seaFeatures.concat(etcs);
    }
}
