// GeoJson Control
var GeoCont = (function () {

    return {
        set: (key, osmxml) => {
            let org_geojson = osmtogeojson(osmxml, { flatProperties: true });
            let fil_geojson = {	// node以外なのにPoint以外だとfalse(削除)
                "features": org_geojson.features.filter((val) => { return (Conf.style[key].type !== "node") ? val.geometry.type !== "Point" : true; })
            };
            if (key == "river") fil_geojson = GeoCont.coastline_merge(fil_geojson.features);
            Layers[key].geojson = fil_geojson.features;
        },
        coastline_merge: (geojson_s) => {
            let etcs = [], cords = [], cord = [], delnum = 0, coasts_len = 0;
            let LL = GeoCont.get_LL(), LLL = GeoCont.get_LLL();
            var coasts = geojson_s.filter(geojson => {
                if (geojson.properties.natural == "coastline") return true;
                etcs.push(geojson);         // backup to etcs
                return false;
            });
            if (coasts.length > 0) {
                // GeoJsonの連結（最初と最後が同一位置のLineStringを合成）
                do {
                    found = false;
                    coasts_len = coasts.length;
                    for (let i = 0; i < coasts_len; i++) {
                        if (coasts[i] !== undefined) {
                            if (cord.length == 0) {
                                cord = coasts[i].geometry.coordinates.length == 1 ? coasts[i].geometry.coordinates[0] : coasts[i].geometry.coordinates;
                                delete coasts[i];
                                delnum++;
                            } else {
                                let first_crd = cord[0];
                                let last_crd = cord[cord.length - 1];
                                let first_cst = coasts[i].geometry.coordinates[0];
                                let last_cst = coasts[i].geometry.coordinates[coasts[i].geometry.coordinates.length - 1];
                                if (first_crd[0] == last_cst[0] && first_crd[1] == last_cst[1]) {           // cordの前方
                                    found = true;
                                    cord = Basic.concatTwoDimensionalArray(coasts[i].geometry.coordinates, cord);   // 同位置がある時は結合
                                    delete coasts[i];
                                    delnum++;
                                } else if (last_crd[0] == first_cst[0] && last_crd[1] == first_cst[1]) {    // cordの後方
                                    found = true;
                                    cord = Basic.concatTwoDimensionalArray(cord, coasts[i].geometry.coordinates);   // 同位置がある時は結合
                                    delete coasts[i];
                                    delnum++;
                                };
                            };
                        };
                    };
                    if (found == false) {
                        let clip_cord = GeoCont.bboxclip(cord, false);
                        clip_cord = (clip_cord.length > 3) ? clip_cord : cord;  // 削りすぎた場合は元のデータを利用
                        cords.push(clip_cord);
                        cord = [];
                    };
                } while (delnum < coasts.length);
                if (cord.length > 0) {
                    let clip_cord = GeoCont.bboxclip(cord, false);
                    clip_cord = (clip_cord.length > 3) ? clip_cord : cord;      // 削りすぎた場合は元のデータを利用
                    cords.push(clip_cord);
                };

                // 東西南北の線上にあるGeoJsonを探索、結合する
                for (let idx = 0; idx < cords.length; idx++) {
                    if (cords[idx] !== undefined) {
                        cord = cords[idx];
                        let fcd = cord[0].concat(), fcd_d = "";
                        let lcd = cord[cord.length - 1];                        // [0:経度lng,1:緯度lat]
                        if (fcd[0] !== lcd[0] || fcd[1] !== lcd[1]) {           // no closed way(画面外側にCordを追加)
                            fcd_d += (fcd[0] > LL.SE.lng) ? "S," : "";              // 東に居る→西方面(陸地は南) // fcdの位置から向かう方向を決定(左手の法則)
                            fcd_d += (fcd[0] < LL.NW.lng) ? "N," : "";              // 西に居る→東方面(陸地は北)
                            fcd_d += (fcd[1] > LL.NW.lat) ? "E," : "";              // 北に居る→南方面(陸地は東)
                            fcd_d += (fcd[1] < LL.SE.lat) ? "W," : "";              // 南に居る→北方面(陸地は西)
                            fcd_d = fcd_d.slice(0, -1).split(',');
                            do {
                                let near_idx;
                                do {
                                    near_idx = GeoCont.get_maxll(cord[0], cords, idx, fcd_d[0]);
                                    if (near_idx !== false) {       // 海岸線にぶつかった
                                        cord = Basic.concatTwoDimensionalArray(cord, cords[near_idx]);   // 取り込む
                                        cords[idx] = cord;
                                        delete cords[near_idx];
                                        delnum++;
                                    };
                                } while (near_idx !== false);
                                fcd_d = fcd_d.slice(1);
                            } while (fcd_d.length > 0);
                        }
                    };
                };

                // 閉じていないGeoJsonを探してポリゴン化
                let new_cords = [];
                for (let idx = 0; idx < cords.length; idx++) {
                    if (cords[idx] !== undefined) {
                        cord = cords[idx];
                        let fcd = cord[0].concat(), fcd_t = "", fcd_d = "", lcd_t = "", lcd_d = "", add_d = "";
                        let lcd = cord[cord.length - 1];                    // [0:経度lng,1:緯度lat]
                        if (fcd[0] !== lcd[0] || fcd[1] !== lcd[1]) {       // no closed way(画面外側にCordを追加)
                            fcd_d += (fcd[1] > LL.NW.lat) ? "N" : "";
                            fcd_d += (fcd[1] < LL.SE.lat) ? "S" : "";
                            fcd_d += (fcd[0] < LL.NW.lng) ? "W" : "";
                            fcd_d += (fcd[0] > LL.SE.lng) ? "E" : "";      // fcddが何処にあるか確認

                            lcd_d += (lcd[1] > LL.NW.lat) ? "N" : "";
                            lcd_d += (lcd[1] < LL.SE.lat) ? "S" : "";
                            lcd_d += (lcd[0] < LL.NW.lng) ? "W" : "";
                            lcd_d += (lcd[0] > LL.SE.lng) ? "E" : "";      // lcdが何処にあるか確認

                            add_d += (fcd[0] < lcd[0]) ? "N" : "S";       // 左手の法則で東に向かうなら陸地は北側、それ以外は南側を追加
                            add_d += (fcd[1] < lcd[1]) ? "W" : "E";       // 左手の法則で北に向かうなら陸地は西側、それ以外は東側を追加
                            if (fcd_d !== lcd_d) {                        // fcdとlcdが別の領域にある場合
                                let all_d = [fcd_d, lcd_d];
                                if (fcd_d.indexOf("W") > -1 && lcd_d.indexOf("S") > -1) {
                                    all_d.splice(1, 0, "N");
                                } else if (fcd_d.indexOf("S") > -1 && lcd_d.indexOf("E") > -1) {
                                    all_d.splice(1, 0, "N");
                                } else if (fcd_d.indexOf("E") > -1 && lcd_d.indexOf("N") > -1) {
                                    all_d.splice(1, 0, "S");
                                } else if (fcd_d.indexOf("N") > -1 && lcd_d.indexOf("W") > -1) {
                                    all_d.splice(1, 0, "S");
                                };
                                do {
                                    let acord = fcd.concat();                                   // 始点はfcd
                                    switch (all_d[0]) {
                                        case "NW":
                                            acord[0] = LLL.NW.lng;
                                        case "N":
                                            acord[1] = LLL.NW.lat;
                                            if (add_d.indexOf("W") > -1) acord[0] = LLL.NW.lng;
                                            if (add_d.indexOf("E") > -1) acord[0] = LLL.SE.lng;
                                            break;
                                        case "SE":
                                            acord[0] = LLL.SE.lng;
                                        case "S":
                                            acord[1] = LLL.SE.lat;
                                            if (add_d.indexOf("W") > -1) acord[0] = LLL.NW.lng;
                                            if (add_d.indexOf("E") > -1) acord[0] = LLL.SE.lng;
                                            break;
                                        case "SW":
                                            acord[1] = LLL.SE.lat;
                                        case "W":
                                            acord[0] = LLL.NW.lng;
                                            if (add_d.indexOf("N") > -1) acord[1] = LLL.NW.lat;
                                            if (add_d.indexOf("S") > -1) acord[1] = LLL.SE.lat;
                                            break;
                                        case "NE":
                                            acord[1] = LLL.NW.lat;
                                        case "E":
                                            acord[0] = LLL.SE.lng;
                                            if (add_d.indexOf("N") > -1) acord[1] = LLL.NW.lat;
                                            if (add_d.indexOf("S") > -1) acord[1] = LLL.SE.lat;
                                            break;
                                    }
                                    console.log("acord: unshift:" + acord);
                                    cord.unshift(acord);
                                    all_d = all_d.slice(1);
                                } while (all_d.length > 0)
                            };
                        };
                        cord.push(cord[0].concat());
                        new_cords.push(cord);
                    };
                };

                let coast = {
                    "type": "FeatureCollection", "features": [{
                        "type": "Feature", "properties": { "natural": "coastline" },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[LLL.NW.lng, LLL.NW.lat], [LLL.NW.lng, LLL.SE.lat], [LLL.SE.lng, LLL.SE.lat], [LLL.SE.lng, LLL.NW.lat]]]
                        }
                    }]
                };
                new_cords.forEach(cord => coast.features[0].geometry.coordinates.push(cord));
                return { features: Object.assign(etcs, [coast]) };
            }
            return { features: etcs };
        },

        // csv(「”」で囲われたカンマ区切りテキスト)をConf.markerのcolumns、tagsをもとにgeojsonへ変換
        csv2geojson: (csv, key) => {
            let tag_key = [], columns = Conf.target[key].columns;
            let texts = csv.split(/\r\n|\r|\n/).filter(val => val !== "");
            cols = texts[0].split('","').map(col => col.replace(/^"|"$|/g, ''));
            for (let i = 0; i < cols.length; i++) {
                if (columns[cols[i]] !== undefined) tag_key[i] = columns[cols[i]];
            };
            texts.shift();
            let geojsons = texts.map((text, line) => {
                cols = text.split('","').map(col => col.replace(/^"|"$/g, ''));
                let geojson = { "type": "Feature", "geometry": { "type": "Point", "coordinates": [] }, "properties": {} };
                let tag_val = {};
                for (let i = 0; i < cols.length; i++) {
                    if (tag_key[i] !== undefined) {
                        tag_val[tag_key[i]] = tag_val[tag_key[i]] == undefined ? cols[i] : tag_val[tag_key[i]] + cols[i];
                    };
                };
                geojson.geometry.coordinates = [tag_val._lng, tag_val._lat];
                geojson.id = `${key}/${line}`;
                Object.keys(tag_val).forEach((idx) => {
                    if (idx.slice(0, 1) !== "_") geojson.properties[idx] = tag_val[idx];
                });
                Object.keys(Conf.target[key].add_tag).forEach(tkey => {
                    geojson.properties[tkey] = Conf.target[key].add_tag[tkey];
                });
                return geojson;
            });
            return geojsons;
        },

        // 2線の交差チェック 線分ab(x,y)とcd(x,y) true:交差 / false:非交差
        judgeIentersected: (a, b, c, d) => {
            let ta = (c[0] - d[0]) * (a[1] - c[1]) + (c[1] - d[1]) * (c[0] - a[0]);
            let tb = (c[0] - d[0]) * (b[1] - c[1]) + (c[1] - d[1]) * (c[0] - b[0]);
            let tc = (a[0] - b[0]) * (c[1] - a[1]) + (a[1] - b[1]) * (a[0] - c[0]);
            let td = (a[0] - b[0]) * (d[1] - a[1]) + (a[1] - b[1]) * (a[0] - d[0]);
            return tc * td <= 0 && ta * tb <= 0; // 端点を含む
        },

        bboxclip: (cords, strict) => { // geojsonは[経度lng,緯度lat]
            let LL = GeoCont[strict ? "get_LL" : "get_LLL"]();
            new_cords = cords.filter((cord) => {
                if (cord[0] < (LL.NW.lng)) return false;
                if (cord[0] > (LL.SE.lng)) return false;
                if (cord[1] < (LL.SE.lat)) return false;
                if (cord[1] > (LL.NW.lat)) return false;
                return true;
            });
            return new_cords;
        },

        multi2flat: (cords, type) => {     // MultiPoylgon MultiString -> Polygon(broken) String
            let flats;
            switch (type) {
                case "Point":
                    flats = cords;
                    break;
                case "LineString":
                    flats = [cords];
                    break;
                case "MultiPolygon":
                    flats = cords.flat();
                    break;
                default:
                    flats = [cords.flat()];
                    break;
            };
            return flats;
        },

        flat2single: (cords, type) => {  // flat cordsの平均値(Poiの座標計算用)
            let cord, lat = 0, lng = 0, counts;
            switch (type) {
                case "Point":
                    cord = [cords[0], cords[1]];
                    break;
                default:
                    counts = cords[0].length;
                    for (let idx in cords[0]) {
                        lat += cords[0][idx][0];
                        lng += cords[0][idx][1];
                    };
                    cord = [lat / counts, lng / counts];
                    break;
            };
            return cord;
        },

        // 指定した方位の衝突するcords内のidxを返す
        get_maxll: (st_cord, cords, exc_idx, orient) => {
            let LLL = GeoCont.get_LLL(), idx, ed_cord = [], found = -1;
            if (orient == "N") ed_cord = [st_cord[0], LLL.NW.lat]; // [経度lng,緯度lat]
            if (orient == "S") ed_cord = [st_cord[0], LLL.SE.lat];
            if (orient == "W") ed_cord = [LLL.NW.lng, st_cord[1]];
            if (orient == "E") ed_cord = [LLL.SE.lng, st_cord[1]];

            for (idx = 0; idx < cords.length; idx++) {  //
                if (cords[idx] !== undefined && exc_idx !== idx) {  //
                    found = cords[idx].findIndex((ck_cord, ck_id) => {
                        if (ck_id < cords[idx].length - 1) return GeoCont.judgeIentersected(st_cord, ed_cord, ck_cord, cords[idx][ck_id + 1]);
                        return false;
                    });
                };
                if (found > -1) break;
            };
            return (found > -1) ? idx : false;
        },

        get_LL: () => {			// LatLngエリアの設定 [経度lng,緯度lat]
            return { "NW": map.getBounds().getNorthWest(), "SE": map.getBounds().getSouthEast() };
        },

        get_LLL: () => {		// 拡大LatLngエリアの設定 [経度lng,緯度lat]
            let LL = GeoCont.get_LL();
            LL.NW.lng = LL.NW.lng * 0.99997;
            LL.SE.lng = LL.SE.lng * 1.00003;
            LL.SE.lat = LL.SE.lat * 0.99992;
            LL.NW.lat = LL.NW.lat * 1.00008;
            return LL;
        },

        get_maparea: (mode) => {	// OverPassクエリのエリア指定
            let LL;
            if (mode == "LLL") {
                LL = GeoCont.get_LLL();
            } else {
                LL = GeoCont.get_LL();
            };
            return `(${LL.SE.lat},${LL.NW.lng},${LL.NW.lat},${LL.SE.lng});`;
        },


        // Debug Code

        gcircle: (geojson) => { // view geojson in map
            let features = [], colors = ["#000000", "#800000", "#FF0080", "#008000", "#00FF00", "#000080", "#0000FF", "#800080", "#FF00FF", "#808000", "#FFFF00", "#008080", "#00FFFF", "#800080", "#FF00FF"];
            let timer = Conf.default.Circle.timer;
            if (!Array.isArray(geojson)) {
                if (geojson.features !== undefined) features = geojson.features;
            } else {
                features = geojson;
                if (features[0].geometry == undefined) features = { geometry: { coordinates: geojson } };
            };
            features.forEach((val, idx) => {
                let geo = val.geometry;
                let cords = geo.coordinates.length == 1 && geo.coordinates[0][0].length > 1 ? geo.coordinates[0] : geo.coordinates;
                cords.forEach((latlng) => {
                    Conf.default.Circle.radius = Math.pow(2, 21 - map.getZoom());
                    let style = Conf.default.Circle;
                    let color = idx % colors.length;
                    style.color = colors[color];
                    let circle = L.circle(L.latLng(latlng[1], latlng[0]), style).addTo(map);
                    circle.addTo(map).on('click', e => { popup_icon(e) });
                    // console.log(`feature[${idx}]: [${latlng[1]}, ${latlng[0]}`);
                    setTimeout(() => map.removeLayer(circle), timer);
                    timer += 100;
                });
            });

            function popup_icon(ev) {
                let popcont = JSON.stringify(ev.latlng);
                L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
                ev.target.openPopup();
                return false;
            };
        },

        ccircle: (cords) => {   // view cord in map
            let geojson = {
                features: [{
                    geometry: { coordinates: cords },
                    properties: {},
                    type: "Feature"
                }]
            };
            GeoCont.gcircle(geojson);
        },

        bbox_write: () => { // view maparea
            let LL = GeoCont.get_LL();
            let bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
            L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);

            LL = GeoCont.get_LLL();
            bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
            L.polyline(bcords, { color: 'black', weight: 4 }).addTo(map);
        },

        cord_search: (target) => {    // search leyers
            Object.keys(Conf.style).forEach(key => {
                if (Layers[key].geojson !== undefined) {
                    console.log("Search: " + key);
                    Layers[key].geojson.forEach((geojson, gidx) => {
                        let cords;
                        if (geojson.features !== undefined) {
                            geojson.features.forEach((feature, fidx) => {
                                cords = feature.geometry.coordinates[0];
                                check(cords, target, key, gidx, fidx);
                            });
                        } else {
                            cords = geojson.geometry.coordinates[0];
                            check(cords, target, key, gidx);
                        };
                    });
                }
            });

            function check(cords, target, key, gidx, fidx) {
                cords.forEach((cord, cidx) => {
                    console.log(`check: [${cord[0]},${cord[1]}]`);
                    if (target[0] == cord[0] && target[1] == cord[1]) {
                        console.log(`found: Leyers[${key}].geojson[${gidx}]: ${fidx == undefined ? "" : "features[" + fidx + "]"}.geometry.coordinates[${cidx}]`);
                    };
                })
            };
        }
    };
})();

