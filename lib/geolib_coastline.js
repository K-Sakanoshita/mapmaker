"use strict";

// 海岸線処理
class GeoCoastline {
	merge(geojson_s) {
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
			let new_cords = [];
			for (let idx = 0; idx < cords.length; idx++) {
				if (cords[idx] !== undefined) {
					cord = cords[idx];
					//if (cord !== undefined) GeoCont.polyline_write([cord]);	// test view
					let fcd = cord[0], fcd_d = "", lcd_d = ""
					let lcd = cord[cord.length - 1];                    // [0:経度lng,1:緯度lat]
					if (fcd[0] !== lcd[0] || fcd[1] !== lcd[1]) {       // no closed way(画面外側にCordを追加)
						//GeoCont.ccircle([fcd]);
						//GeoCont.ccircle([lcd]);
						fcd_d = (LL.SE.lat < fcd[1]) ? "N" : "S";       // 画面の南端より南なら南へ。それ以外は北へ
						lcd_d = (LL.SE.lat < lcd[1]) ? "N" : "S";       // 画面の南端より北なら北へ。それ以外は南へ

						if (fcd[0] < lcd[0]) {	// lcdの方が大きい = 後のノードが東側にある = 西へ延ばせ
							fcd_d += "W";
							lcd_d += "E";
						} else {
							fcd_d += "E";
							lcd_d += "W";
						}
						let all_d = [fcd_d, lcd_d];
						let all_fl = [fcd, lcd];

						let dcord = all_d[0];
						let acord = all_fl[0].concat();					// 始点はfcd

						acord[1] = LLL[dcord.indexOf("N") > -1 ? "NW" : "SE"].lat;
						cord.unshift(acord.concat());
						//GeoCont.ccircle([acord]);
						acord[0] = LLL[dcord.indexOf("W") > -1 ? "NW" : "SE"].lng;
						cord.unshift(acord.concat());
						//GeoCont.ccircle([acord]);

						dcord = all_d[1];
						acord = all_fl[1].concat();					// 始点はfcd
						acord[1] = LLL[dcord.indexOf("N") > -1 ? "NW" : "SE"].lat;
						cord.push(acord.concat());
						//GeoCont.ccircle([acord]);
						acord[0] = LLL[dcord.indexOf("W") > -1 ? "NW" : "SE"].lng;
						cord.push(acord.concat());
						//GeoCont.ccircle([acord]);

						console.log("coastline: " + all_d);
						switch (all_d.join("")) {
							case "SWNE":		// lcdがNWなのでSWにPoint追加
								acord[1] = LLL.SE.lat;
								acord[0] = LLL.NW.lng;
								cord.unshift(acord.concat());
								//GeoCont.ccircle([acord]);
								break;
							case "NWSE":
								acord[1] = LLL.NW.lat;
								acord[0] = LLL.SE.lng;
								cord.unshift(acord.concat());
								//GeoCont.ccircle([acord]);
								break;
							case "NESW":
								acord[1] = LLL.SE.lat;
								acord[0] = LLL.SE.lng;
								cord.unshift(acord.concat());
								//GeoCont.ccircle([acord]);
								break;
							case "SENW":
								acord[1] = LLL.SE.lat;
								acord[0] = LLL.NW.lng;
								cord.unshift(acord.concat());
								//GeoCont.ccircle([acord]);
								break;
							case "SWNE":
								acord[1] = LLL.NW.lat;
								acord[0] = LLL.NW.lng;
								cord.unshift(acord.concat());
								//GeoCont.ccircle([acord]);
								break;
							default:
								console.log("coastline: NOT: " + all_d);
								break;
						}
					};
					new_cords.push(cord.concat());
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
	}
}

