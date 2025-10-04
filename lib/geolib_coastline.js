"use strict";

/*
function clipLineToBbox(coordinates, bbox) {
    const { NW, SE } = bbox;
    const minLat = SE.lat;
    const maxLat = NW.lat;
    const maxLon = SE.lng;
    const minLon = NW.lng;
    let clippedCoordinates = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
        clippedCoordinates = coordinates.filter((cord) => {
            return !(cord[0] < minLon || cord[0] > maxLon || cord[1] < minLat || cord[1] > maxLat)
        })
    }
    return clippedCoordinates
}
*/

// 海岸線処理
// 複数の独立した海岸線がある時の処理が出来ていない
class GeoCoastline {
    merge(geojson_s) {
        let etcs = [], cords = [], cord = [], delnum = 0, coasts_len = 0;
        let bbox = GeoCont.get_L(), LL = GeoCont.get_LL(), LLL = GeoCont.get_LLL();
        var coasts = geojson_s.filter(geojson => {
            if (geojson.properties.natural == "coastline") return true;
            etcs.push(geojson);         // backup to etcs
            return false;
        });


        // debug code start
        /*
        const redIcon = L.icon({
            iconUrl: "https://esm.sh/leaflet@1.9.2/dist/images/marker-icon.png",
            iconRetinaUrl: "https://esm.sh/leaflet@1.9.2/dist/images/marker-icon-2x.png",
            shadowUrl: "https://esm.sh/leaflet@1.9.2/dist/images/marker-shadow.png",
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28],
            shadowSize: [41, 41], className: "icon-red", // <= ここでクラス名を指定
        });
        GeoCont.writeLL(bbox);
        GeoCont.writeLL(LL);
        */
        // debug code end

        if (coasts.length > 0) {
            // GeoJsonの連結（最初と最後が同一位置のLineStringを合成）
            do {
                let found = false;
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

            // 閉じていないGeoJsonを探してポリゴン化(concatは配列の複製)
            // 閉じる対象は陸地。海岸線を閉じることで陸地を島にする
            let new_cords = [];
            for (let idx = 0; idx < cords.length; idx++) {
                if (cords[idx] !== undefined) {
                    //cord = clipLineToBbox(cords[idx], LL);
                    cord = cords[idx]
                    let fcd = cord[0].concat(), fcd_d = "", lcd_d = ""           // fcd:First Cord, lcd:Last Cord
                    let lcd = cord[cord.length - 1].concat();                    // [0:経度lng(-180～180),1:緯度lat(-90～90)]
                    let fncd = cord[1], lpcd = cord[cord.length - 2];   // 2nd Cord, 2nd Last Cord
                    let fcdBbox = "", lcdBbox = "";
                    if (fcd[0] !== lcd[0] || fcd[1] !== lcd[1]) {       // no closed way(画面外側にCordを追加)

                        // fcdが何処にあるかを判定
                        if (fcd[0] > bbox["SE"].lng) fcdBbox += "E";
                        if (fcd[0] < bbox["NW"].lng) fcdBbox += "W";
                        if (fcd[1] < bbox["SE"].lat) fcdBbox += "S";
                        if (fcd[1] > bbox["NW"].lat) fcdBbox += "N";

                        // lcdが何処にあるかを判定
                        if (lcd[0] > bbox["SE"].lng) lcdBbox += "E";
                        if (lcd[0] < bbox["NW"].lng) lcdBbox += "W";
                        if (lcd[1] < bbox["SE"].lat) lcdBbox += "S";
                        if (lcd[1] > bbox["NW"].lat) lcdBbox += "N";

                        if (fcdBbox.indexOf("N") > -1) {        // fcdが北にある場合
                            if (lcdBbox.indexOf("N") == -1) {       // lcdが北に無い（南）場合、東が陸地
                                fcd_d += "E";
                            } else {
                                fcd_d += fcd[0] > fncd[0] ? "W" : "E";   // wayが西向きならW、他はE
                            }
                            fcd_d += "S";                           // 南へ
                        }
                        if (fcdBbox.indexOf("S") > -1) {        // fcdが南にある場合
                            if (lcdBbox.indexOf("S") == -1) {       // lcdが南に無い（北）場合、西が陸地
                                fcd_d += "W";
                            } else {
                                fcd_d += fcd[0] < fncd[0] ? "E" : "W";   // wayが西向きならE、他はW
                            }
                            fcd_d += "N";                           // 北へ
                        }
                        if (fcdBbox.indexOf("W") > -1) {        // fcdが西にある場合
                            if (lcdBbox.indexOf("W") == -1) {       // lcdが西に無い場合は北側が陸地
                                fcd_d += "N";
                            } else {
                                fcd_d += "S";
                            }
                        }
                        if (fcdBbox.indexOf("E") > -1) {    // fcdが東にある場合
                            if (lcdBbox.indexOf("E") == -1) {           // lcdが東に無い場合は南側が陸地
                                fcd_d += "S";
                            } else {
                                fcd_d += "N";
                            }
                        }

                        // lcd_設定
                        if (lcdBbox.indexOf("N") > -1) {        // lcdが北にある場合
                            if (fcdBbox.indexOf("N") == -1) {       // fcdが北に無い（南）場合、西が陸地
                                lcd_d += "W";
                            } else {
                                lcd_d += lcd[0] > lpcd[0] ? "W" : "E";   // wayが西向きならW、他はE
                            }
                        }
                        if (lcdBbox.indexOf("S") > -1) {        // lcdが南にある場合
                            if (fcdBbox.indexOf("S") == -1) {       // lcdが南に無い（北）場合、東が陸地
                                lcd_d += "E";
                            } else {
                                lcd_d += lcd[0] > lpcd[0] ? "W" : "E";   // wayが西向きならE、他はW
                            }
                        }
                        if (lcdBbox.indexOf("W") > -1) {        // lcdが西にある場合
                            if (fcdBbox.indexOf("W") == -1) {       // fcdが西に無い場合は南側が陸地
                                lcd_d += "S";
                            } else {
                                lcd_d += "N";
                            }
                        }
                        if (lcdBbox.indexOf("E") > -1) {        // lcdが東にある場合
                            if (fcdBbox.indexOf("E") == -1) {       // fcdが東に無い場合は北側が陸地
                                lcd_d += "N";
                            } else {
                                lcd_d += "S";
                            }
                        }

                        // debug code start
                        /*
                        let mf1 = L.marker([fcd[1], fcd[0]]).addTo(map)
                        mf1.bindPopup("fcd" + idx, { autoClose: false }).openPopup();
                        let mf2 = L.marker([fncd[1], fncd[0]]).addTo(map)
                        mf2.bindPopup("fcnd" + idx, { autoClose: false }).openPopup();

                        let ml1 = L.marker([lcd[1], lcd[0]], { icon: redIcon }).addTo(map)
                        ml1.bindPopup("lcd" + idx, { autoClose: false }).openPopup();
                        let ml2 = L.marker([lpcd[1], lpcd[0]], { icon: redIcon }).addTo(map)
                        ml2.bindPopup("lpcd" + idx, { autoClose: false }).openPopup();
                        console.log("fcd_d" + idx + ":" + fcd_d + " lcd_d" + idx + ":" + lcd_d);
                        */
                        // debug code end

                        let direction = fcd_d.split("");
                        direction.forEach((dir) => {
                            if (dir === "N") {
                                fcd[1] = LL["NW"].lat;                    // 緯度を北へ、経度はそのまま
                            }
                            if (dir === "S") {
                                fcd[1] = LL["SE"].lat;                    // 緯度を南へ、経度はそのまま
                            }
                            if (dir === "W") {
                                fcd[0] = LL["NW"].lng                     // 緯度はそのまま、経度を西へ
                            }
                            if (dir === "E") {
                                fcd[0] = LL["SE"].lng;                    // 緯度はそのまま、経度を東へ
                            }
                            console.log(dir + " / fcd_add: " + fcd.join());
                            cord.unshift(fcd.concat());
                            //L.marker([fcd[1], fcd[0]]).addTo(map).bindPopup(dir, { autoClose: false }).openPopup();
                        })

                        direction = lcd_d.split("");
                        direction.forEach((dir) => {
                            if (dir === "N") {
                                lcd[1] = LL["NW"].lat;                    // 緯度を北へ、経度はそのまま
                            }
                            if (dir === "S") {
                                lcd[1] = LL["SE"].lat;                    // 緯度を南へ、経度はそのまま
                            }
                            if (dir === "W") {
                                lcd[0] = LL["NW"].lng                     // 緯度はそのまま、経度を西へ
                            }
                            if (dir === "E") {
                                lcd[0] = LL["SE"].lng;                  // 緯度はそのまま、経度を東へ
                            }
                            console.log(dir + " / lcd_add: " + lcd.join());
                            cord.push(lcd.concat());
                            //L.marker([lcd[1], lcd[0]], { icon: redIcon }).addTo(map).bindPopup(dir, { autoClose: false }).openPopup();
                        })
                    };
                    new_cords.push(cord.concat());
                };
            }
            let coast = {
                "type": "FeatureCollection", "features": [{
                    "type": "Feature", "properties": { "natural": "coastline" },
                    "geometry": {
                        "type": "Polygon",
                        //"coordinates": []
                        "coordinates": [[[LL.NW.lng, LL.NW.lat], [LL.NW.lng, LL.SE.lat], [LL.SE.lng, LL.SE.lat], [LL.SE.lng, LL.NW.lat]]]
                    }
                }]
            };
            new_cords.forEach(cord => coast.features[0].geometry.coordinates.push(cord));
            //GeoCont.polyline_write(new_cords);	// test view
            return { features: Object.assign(etcs, [coast]) };
        } else {
            return { features: etcs };
        }
    }
}
