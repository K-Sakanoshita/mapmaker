"use strict";

var LayerCont = (function () {		// for line&area / nodeはMarker

	return {
		init: () => {
			let lamp = Layers.MAP == undefined ? "" : Layers.MAP;
			Layers = { "background": { "opacity": Conf.style.background.opacity }, "MAP": lamp };
			for (let key in Conf.style) {
				let color = typeof (Conf.style[key].color) == "undefined" ? "" : Conf.style[key].color;
				let opacity = typeof (Conf.style[key].opacity) == "undefined" ? "" : Conf.style[key].opacity;
				Layers[key] = {
					"color": color, "color_dark": color == "" ? "" : chroma(color).darken(Conf.default.ColorDarken).hex(),
					"width": typeof (Conf.style[key].width) == "undefined" ? 0 : Conf.style[key].width, "opacity": opacity
				};
			};
			WinCont.domAdd("a4_top", "article");			// make area_select
			WinCont.domAdd("a4_bottom", "article");
			WinCont.domAdd("a4_left", "article");
			WinCont.domAdd("a4_right", "article");
		},

		layer_make: (key, view) => {						// MakeData内 -> name:コントロール名 / color:SVG色 / width:SVG Line Weight / dashArray:破線
			let type = Conf.style[key].type, opacity;
			if (view !== undefined) Layers[key].opacity = view ? 1 : 0;
			let style = SVGCont.svg_style(key);
			if (Layers[key].svg) {							// already svg layers
				Layers[key].svg.forEach(way => {
					switch (view) {
						case undefined: opacity = { "fillOpacity": way.options.fillOpacity, "opacity": way.options.opacity }; break;
						case true: opacity = { "fillOpacity": 1, "opacity": 1 }; break;
						case false: opacity = { "fillOpacity": 0, "opacity": 0 }; break;
					};
					if (type !== "area") opacity.fillOpacity = 0; 					// LineがPolygon化された場合の対処
					way.setStyle(Object.assign(style, opacity));
					way.options = Object.assign(way.options, opacity);
				});
			} else if (Layers[key].geojson !== undefined) {		//already geojson
				let ways = [];
				opacity = { "fillOpacity": 1, "opacity": 1 };
				if (view == false) opacity = { "fillOpacity": 0, "opacity": 0 };	// false以外(trueとundefined)はopacity=1
				if (type !== "area") opacity.fillOpacity = 0; 	// LineがPolygon化された場合の対処
				style = Object.assign(style, opacity);
				Layers[key].geojson.forEach(way => {
					ways.push(L.geoJSON(way, style));			// geojsonからSVGレイヤーを作成
					ways[ways.length - 1].addTo(map).on('click', way_toggle);
					ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
				});
				Layers[key].svg = ways;
			};
			console.log(`layer make: ${key}: ok`);
		},

		// Aree select(A4)
		area_select: (mode) => {
			let dom, p = WinCont.a4_getsize(mode);
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
		},
		all_clear: () => {
			console.log("LayerCont: all clear... ");
			for (let key in Conf.style) if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
			LayerCont.init();
		}
	};

	function way_toggle(ev) {					// wayをクリックしたときのイベント（表示/非表示切り替え）
		let key = ev.target.mapmaker.key;
		let options = ev.target.options;
		if (options.opacity == 0) {
			options.fillOpacity = 1;
			options.opacity = 1;
			ev.target.options.opacity = 1;
			if (Conf.style[key].type !== "area") options.fillOpacity = 0; 	// LineがPolygon化された場合の対処
		} else {
			options.fillOpacity = 0;
			options.opacity = 0;
			ev.target.options.opacity = 0;
		};
		let style = SVGCont.svg_style(key);
		options.color = style.color;
		options.fillColor = style.fillColor;
		options.weight = style.weight;
		ev.target.setStyle(options);
	};
})();

// PoiData Control
var PoiCont = (function () {
	var PoiData = { geojson: [], targets: [], enable: [] };	// OvPassの応答(features抜き)と対象Keyの保存
	var latlngs = {}, geoidx = {};							// 緯度経度  osmid: {lat,lng} / osmidからgeojsonのindexリスト

	return {
		pois: () => { return PoiData },
		latlngs: () => { return latlngs },
		all_clear: () => { PoiData = { geojson: [], targets: [], enable: [] } },
		add_geojson: (pois) => {		// add geojson pois / pois: {geojson: [],targets: []} enableが無いのは仕様
			if (pois.enable == undefined) pois.enable = [];
			pois.geojson.forEach((val1, idx1) => {		// 既存Poiに追加
				//if (pois.enable[idx1] == undefined) pois.enable[idx1] = false;
				let poi = { "geojson": pois.geojson[idx1], "targets": pois.targets[idx1], "enable": pois.enable[idx1] };
				PoiCont.set_geojson(poi);
			});
			PoiData.geojson.forEach((node, node_idx) => {
				if (latlngs[node.id] == undefined) {
					let ll = GeoCont.flat2single(node.geometry.coordinates, node.geometry.type);
					latlngs[node.id] = [ll[1], ll[0]];
					geoidx[node.id] = node_idx;
				};
			});
		},
		set_geojson(poi) {								// add_geojsonのサブ機能
			let cidx = PoiData.geojson.findIndex((val) => val.id == poi.geojson.id);
			if (cidx === -1) {       	                   	// 無い時は追加
				PoiData.geojson.push(poi.geojson);
				cidx = PoiData.geojson.length - 1;
			};
			if (PoiData.targets[cidx] == undefined) {  		// targetが無い時は追加
				PoiData.targets[cidx] = poi.targets;
			} else {
				PoiData.targets[cidx] = Object.assign(PoiData.targets[cidx], poi.targets);
			};
			if (PoiData.enable[cidx] == undefined && poi.enable == undefined) {
				PoiData.enable[cidx] = false;
			} else if(poi.enable !== undefined){
				PoiData.enable[cidx] = poi.enable;
			}
		},
		get_target: (targets) => { return poi_filter(targets) },	// 指定したtargetのgeojsonと緯度経度を返す
		get_osmid: (osmid) => {           							// osmidを元にgeojsonと緯度経度、targetを返す
			let idx = geoidx[osmid];
			return { geojson: PoiData.geojson[idx], latlng: latlngs[osmid], targets: PoiData.targets[idx], enable: PoiData.enable[idx] };
		},
		get_catname: (tags) => {          							// get Category Name from Conf.category(Global Variable)
			let categorys = Object.keys(Conf.category);
			let key1 = categorys.find(key => tags[key] !== undefined);
			let key2 = tags[key1] == undefined ? "" : tags[key1];
			let catname = (key2 !== "") ? Conf.category[key1][key2] : "";   // known tags
			return (catname == undefined) ? "" : catname;
		},
		get_wikiname: (tags) => {          							// get Wikipedia Name from tag
			let wikiname = tags["wikipedia"] ? tags["wikipedia"].split(':')[1] : "";	// value値の":"の右側を返す
			return wikiname;
		},
		list: function (targets) {              // DataTables向きのJsonデータリストを出力
			let pois = poi_filter(targets);     // targetsに指定されたpoiのみフィルター
			let datas = [];
			pois.geojson.forEach((node, idx) => {
				let tags = node.properties;
				let name = tags.name == undefined ? "-" : tags.name;
				let category = PoiCont.get_catname(tags);
				let enable = pois.enable[idx];
				datas.push({ "osmid": node.id, "name": name, "category": category, "enable": enable });
			});
			datas.sort((a, b) => { return (a.between > b.between) ? 1 : -1 });
			return datas;
		}
	};
	function poi_filter(targets) {
		let tars = [], enas = [], lls = [];
		let geojson = PoiData.geojson.filter(function (geojson_val, geojson_idx) {
			let found = false;
			for (let target_idx in PoiData.targets[geojson_idx]) {
				if (targets.includes(PoiData.targets[geojson_idx][target_idx])) {
					tars.push(PoiData.targets[geojson_idx])
					lls.push(latlngs[geojson_val.id]);
					enas.push(PoiData.enable[geojson_idx]);
					found = true;
					break;
				};
			};
			return found;
		});
		return { geojson: geojson, latlng: lls, targets: tars, enable: enas };
	};
})();

var Marker = (function () {		// Marker closure
	var markers = {};			// SVGアイコン連想配列(filename,svg text)

	return {
		have: (target) => {						// Markerか確認(true: marker)
			let keys = Object.keys(Conf.osm);
			let markers = keys.filter(key => Conf.osm[key].marker !== undefined);
			return markers.some(key => key == target);
		},
		set: (target) => {						// Poi表示
			console.log("Marker.set: " + target);
			Marker.delete(target);
			markers[target] = [];
			let pois = PoiCont.get_target(target);
			if (pois.geojson !== undefined) {
				pois.geojson.forEach(function (geojson, idx) {
					let poi = { "geojson": pois.geojson[idx], "targets": pois.targets[idx], "latlng": pois.latlng[idx], "enable": pois.enable[idx] };
					if (poi.enable) {
						make_popup({ target: target, poi: poi, langname: 'name' }).then(marker => {
							if (marker !== undefined) marker.forEach(val => markers[target].push(val));
						});
					};
				});
			};
		},

		get: (target, osmid) => {				// Poi取得
			let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
			let marker = markers[target][idx];
			return marker;
		},

		qr_add: (target, osmid, url, latlng, data) => {
			let wsize = 128, hsize = 128, asize = 640;
			let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
			let qrcode = new QRCode({ content: url, join: true, container: "svg", width: wsize, height: hsize });
			let svg = qrcode.svg();
			let icon = L.divIcon({
				"className": "icon", "iconSize": [asize, hsize],
				"html":
					`<div class="d-flex qr_code">
						<div class="p-1 bg-light flex-row">${svg}</div>
						<div class="p-2 bg-light">
							<span>${data[0]}${glot.get("source_wikipedia")}</span>
						</div>
						<div class="p-2 bg-light">
							${data[1] == undefined ? "" : `<img height="${hsize}px" src="${data[1].source}">`}
						</div>
					</div>`
			});
			let qr_marker = L.marker(new L.LatLng(latlng.lat, latlng.lng), { icon: icon, draggable: true });
			qr_marker.addTo(map);
			qr_marker.mapmaker_id = osmid + "-qr";
			qr_marker.mapmaker_key = target;
			qr_marker.mapmaker_svg = qrcode.svg;
			markers[target][idx] = [markers[target][idx], qr_marker];
			map.closePopup();
		},

		change_lang: (target, osmid, lang) => {
			let idx = markers[target].findIndex(vals => {
				let val = vals.length == undefined ? vals : vals[0];
				return val.mapmaker_id == osmid;
			});
			let marker = markers[target][idx];
			if (marker.length > 1) marker = marker[0];		// markerが複数の時への対応（qr_codeなど）
			let poi = PoiCont.get_osmid(marker.mapmaker_id);
			let geojson = poi.geojson;
			let name = geojson.properties[lang] == undefined ? "" : geojson.properties[lang];
			if (name == "") {
				WinCont.modal_open({
					"title": glot.get("change_lang_error_title"), "message": glot.get("change_lang_error_message"),
					"mode": "close", "callback_close": () => WinCont.modal_close()
				});
			} else {
				map.closePopup();
				marker.off('click');
				marker.removeFrom(map);
				make_popup({ target: target, poi: poi, langname: lang }).then(marker => { markers[target][idx] = marker[0] });
			}
		},

		change_icon: (target, osmid, filename) => {
			let idx = markers[target].findIndex(vals => {
				let val = vals.length == undefined ? vals : vals[0];
				return val.mapmaker_id == osmid;
			});
			let marker = markers[target][idx];
			if (marker.length > 1) marker = marker[0];		// markerが複数の時への対応（qr_codeなど）
			let poi = PoiCont.get_osmid(marker.mapmaker_id);
			map.closePopup();
			marker.off('click');
			marker.removeFrom(map);
			make_popup({ target: target, poi: poi, filename: filename }).then(marker => { markers[target][idx] = marker[0] });
		},

		set_size: (size, view) => {
			let icon_xy = Math.ceil(size * Conf.default.Icon.scale);
			Conf.effect.text.size = size;		// set font size 
			Conf.effect.text.view = view;
			Conf.effect.icon.x = icon_xy;		// set icon size
			Conf.effect.icon.y = icon_xy;
		},

		center: (osmid) => {
			Conf.default.Circle.radius = Math.pow(2, 21 - map.getZoom());
			let latlng = PoiCont.get_osmid(osmid).latlng;
			let circle = L.circle(latlng, Conf.default.Circle).addTo(map);
			setTimeout(() => map.removeLayer(circle), Conf.default.Circle.timer);
		},

		all_clear: () => Object.keys(markers).forEach((target) => Marker.delete(target)),	// all delete

		delete: (target, osmid) => {														// Marker delete * don't set PoiData
			if (osmid == undefined || osmid == "") {	// all osmid
				if (markers[target] !== undefined) {
					markers[target].forEach(marker => delmaker(marker));
					markers[target] = [];
				};
			} else {									// delete osmid
				let idx = markers[target].findIndex(vals => {
					let val = vals.length == undefined ? vals : vals[0];
					return val.mapmaker_id == osmid;
				});
				let marker = markers[target][idx];
				delmaker(marker);
			};
			map.closePopup();

			function delmaker(marker) {	// 実際にマーカーを消す処理
				if (marker.length == undefined) { map.removeLayer(marker); return };
				marker.forEach(m => map.removeLayer(m));								// qr_code で markerが複数ある場合
			};
		}
	};

	function make_popup(params) {	// markerは複数返す時がある
		return new Promise((resolve, reject) => {
			let categorys = Object.keys(Conf.category), filename;
			let tags = params.poi.geojson.properties.tags == undefined ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
			let name = tags[params.langname] == undefined ? tags.name : tags[params.langname];
			let step = tags.step_count !== undefined ? tags.step_count + glot.get("step_count") : "";	// step count
			name = (name == "" || name == undefined) ? "" : name;
			name = (step !== "" && name !== "") ? name + "(" + step + ")" : (step !== "" ? step : name);
			switch (params.target) {
				case "wikipedia":		// wikipedia
					filename = params.filename == undefined ? Conf.osm.wikipedia.marker : params.filename;
					name = tags[Conf.osm.wikipedia.tag].split(':')[1];
					let html = `<div class="d-flex"><img style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" class="icon_normal" src="${filename}" icon-name="${name}">`;
					if (name !== "" && Conf.effect.text.view) html = `${html}<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
					//let icon = L.divIcon({ "className": "", "iconSize": [200 * Conf.default.Icon.scale, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
					let icon = L.divIcon({ "className": "", "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
					let marker = L.marker(new L.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true });
					marker.addTo(map).on('click', e => { popup_icon(e) });
					marker.mapmaker_id = params.poi.geojson.id;
					marker.mapmaker_key = params.target;
					marker.mapmaker_lang = tags[Conf.osm.wikipedia.tag];
					marker.mapmaker_icon = filename;
					resolve([marker]);
					break;
				default:
					// get marker icon filename
					let keyn = categorys.find(key => tags[key] !== undefined);
					let keyv = (keyn !== undefined) ? Conf.marker.tag[keyn][tags[keyn]] : undefined;
					if (keyn !== undefined && keyv !== undefined) {	// in category
						if (params.filename == undefined) {
							filename = Conf.marker.path + "/" + Conf.marker.tag[keyn][tags[keyn]];
							// get sub marker icon(神社とお寺など)
							let subtag = Conf.marker.subtag[tags[keyn]];		// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
							if (subtag !== undefined) {		// サブタグが存在する場合
								Object.keys(subtag).forEach((sval1) => {		// sval1: ex: religion
									Object.keys(subtag[sval1]).forEach((sval2) => {			// sval2: ex: shinto
										if (tags[sval1] == sval2) filename = Conf.marker.path + "/" + subtag[sval1][sval2];
									});
								});
							};
						} else {
							filename = params.filename;;
						};
						let html = `<div class="d-flex"><img class="icon_normal" style="width: ${Conf.effect.icon.x}px; height: ${Conf.effect.icon.y}px;" src="${filename}" icon-name="${name}">`;
						let span = `<span class="icon" style="font-size: ${Conf.effect.text.size}px">${name}</span>`;
						if (name !== "" && Conf.effect.text.view) html += span;
						let span_width = name !== "" ? name.length * Conf.effect.text.size : 0;
						let icon = L.divIcon({ "className": "", "iconSize": [Conf.effect.icon.x + span_width, Conf.effect.icon.y], "iconAnchor": [Conf.effect.icon.x / 2, Conf.effect.icon.y / 2], "html": html + "</div>" });
						let marker = L.marker(new L.LatLng(params.poi.latlng[0], params.poi.latlng[1]), { icon: icon, draggable: true });
						marker.addTo(map).on('click', e => { popup_icon(e) });
						marker.mapmaker_id = params.poi.geojson.id;
						marker.mapmaker_key = params.target;
						marker.mapmaker_lang = params.langname;
						marker.mapmaker_icon = filename;
						resolve([marker]);
					};
					break;
			};
		});
	};

	function popup_icon(ev) {	// PopUpを表示するイベント
		let popcont;
		let id = ev.target.mapmaker_id;
		let key = ev.target.mapmaker_key;
		let lang = ev.target.mapmaker_lang;
		let tags = PoiCont.get_osmid(id).geojson.properties;
		let chg_mkr = `<button class='btn btn-sm m-2' onclick='Mapmaker.poi_marker_change("${key}","${id}")'>${glot.get("marker_change")}</button>`;
		let del_btn = `<button class='btn btn-sm m-2' onclick='Mapmaker.poi_del("${key}","${id}")'>${glot.get("marker_delete")}</button>`;
		if (key == Conf.osm.wikipedia.tag) {		// Wikipedia時のPopUp
			let qr_btn = `<button class='btn btn-sm m-2' onclick='Mapmaker.qr_add("wikipedia","${id}")'>${glot.get("qrcode_make")}</button>`;
			popcont = tags[Conf.osm.wikipedia.tag] + "<br>" + chg_mkr + del_btn + "<br>" + qr_btn;
		} else {									// その他
			let name = tags.name == undefined ? "" : tags.name;
			let chg_eng = `<button class='btn btn-sm m-2' onclick='Marker.change_lang("${key}","${id}","name:en")'>${glot.get("marker_to_en")}</button>`;
			let chg_jpn = `<button class='btn btn-sm m-2' onclick='Marker.change_lang("${key}","${id}","name")'>${glot.get("marker_to_ja")}</button>`;
			popcont = (name == '' ? glot.get("marker_noname") : name) + "<br>" + chg_mkr + del_btn + "<br>" + (lang == "name" ? chg_eng : chg_jpn);
		};
		L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
		ev.target.openPopup();
		return false;
	};
})();
