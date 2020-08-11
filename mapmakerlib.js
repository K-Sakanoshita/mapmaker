"use strict";

var LayerCont = (function () {		// for line&area / nodeはMarker

	return {
		init: () => {
			let lamp = Layers.MAP == undefined ? "" : Layers.MAP;
			Layers = { "BAK": { "opacity": Conf.Style.BAK.opacity }, "MAP": lamp };
			for (let key in Conf.Style) {
				let color = typeof (Conf.Style[key].color) == "undefined" ? "" : Conf.Style[key].color;
				let opacity = typeof (Conf.Style[key].opacity) == "undefined" ? "" : Conf.Style[key].opacity;
				Layers[key] = {
					"color": color, "color_dark": color == "" ? "" : chroma(color).darken(Conf.default.ColorDarken).hex(),
					"width": typeof (Conf.Style[key].width) == "undefined" ? 0 : Conf.Style[key].width, "opacity": opacity
				};
			};
		},

		layer_make: (key, view) => {						// MakeData内 -> name:コントロール名 / color:SVG色 / width:SVG Line Weight / dashArray:破線
			let type = Conf.Style[key].type, ways = [], opacity;
			if (view !== undefined) Layers[key].opacity = view ? 1 : 0;
			let style = svg_style(key);
			if (Layers[key].svg) {							// already svg layers
				Layers[key].svg.forEach(ways => {
					switch (view) {
						case undefined: opacity = { "fillOpacity": ways.options.fillOpacity, "opacity": ways.options.opacity }; break;
						case true: opacity = { "fillOpacity": 1, "opacity": 1 }; break;
						case false: opacity = { "fillOpacity": 0, "opacity": 0 }; break;
					};
					if (type !== "area") opacity.fillOpacity = 0; 					// LineがPolygon化された場合の対処
					ways.setStyle(Object.assign(style, opacity));
					ways.options = Object.assign(ways.options, opacity);
				});
			} else if (Layers[key].geojson !== undefined) {	//already geojson
				opacity = { "fillOpacity": 1, "opacity": 1 };
				if (view == false) opacity = { "fillOpacity": 0, "opacity": 0 };	// false以外(trueとundefined)はopacity=1
				if (type !== "area") opacity.fillOpacity = 0; 	// LineがPolygon化された場合の対処
				style = Object.assign(style, opacity);
				Layers[key].geojson.forEach(way => {
					ways.push(L.geoJSON(way, style));		// geojsonからSVGレイヤーを作成
					ways[ways.length - 1].addTo(map).on('click', way_toggle);
					ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
				});
				Layers[key].svg = ways;
			};
			console.log(`layer make: ${key}: ok`);
		},

		// Aree select(A4)
		select: (mode, dragging) => {
			let p = Conf.default.Paper, params = {};
			if (area !== undefined) { area.off(); area.remove(); };
			area = undefined;
			switch (mode) {
				case "free": params = { width: p.x, height: p.y, keepAspectRatio: false }; break;
				case "A4": params = { width: p.x, height: p.y, keepAspectRatio: true }; break;
				case "A4_landscape": params = { width: p.y, height: p.x, keepAspectRatio: true }; break;
			};
			if (params.width !== undefined) { area = L.areaSelect(params); area.addTo(map) };
			if (dragging) map.dragging.enable();
			if (area !== undefined && !dragging) {
				map.dragging.disable();
				area.on("change", () => map.dragging.disable());
			};
		},

		// WriteText params .svg,text,size,font,color,type,anchor
		text_write: (svg, params) => {
			let svgtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			let textpath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
//			svgtext.setAttribute('x', params.x);
//			svgtext.setAttribute('y', params.y + offset[params.type]);
			svgtext.setAttribute('width', params.width + 6);
			svgtext.setAttribute('height', params.height + 3);
			svgtext.setAttribute('text-anchor', params.anchor);
			svgtext.setAttribute('font-size', params.size + "px");
			svgtext.setAttribute('font-family', params.font);
			svgtext.setAttribute('fill', params.color);
			svgtext.setAttribute('dominant-baseline', 'middle');
			textpath.textContent = params.text;
			textpath.setAttribute('xlink:href', "#textpath" + params.no);
			svgtext.appendChild(textpath);
			svg[0].appendChild(svgtext);

			let svgpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			svgpath.setAttribute('transform', `translate(${params.x},${params.y})`);
			svgpath.setAttribute('id', "textpath" + params.no);
			svgpath.setAttribute('d', "M0,20 H300 M0,40 H300 M0,60 H300 M0,80 H300");
			svg[0].insertBefore(svgpath, svgtext);

			let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			rect.setAttribute("x", params.x - 2);
			rect.setAttribute("y", params.y - 1);
			rect.setAttribute("width", params.width + 6);
			rect.setAttribute("height", params.height + 3);
			rect.setAttribute("fill", "white");
			rect.setAttribute("fill-opacity", 0.9);
			svg[0].insertBefore(rect, svgtext);
		},

		// Save PNG/SVG {type : 'PNG' or 'SVG' mode: '' or 'A4' or 'A4_landscape'}
		save: (params) => {
			let data, canvas_width, canvas_height, svg = $("svg").clone();
			let base = svg[0].viewBox.baseVal;

			switch (params.mode) {
				case "":
					base = { x: base.x + 100, y: base.y + 100, width: base.width - 200, height: base.height - 200 };
					break;
				default:
					let LL = area.getBBoxCoordinates();
					let nw = map.latLngToContainerPoint(LL[1].nw);
					let se = map.latLngToContainerPoint(LL[3].se);
					base = { x: base.x + 100 + nw.x, y: base.y + 100 + nw.y, width: (se.x - nw.x), height: (se.y - nw.y) };
					break;
			}
			switch (params.mode) {
				case "":
					canvas_width = base.width * 2;
					canvas_height = base.height * 2;
					break;
				case "A4":
					svg.attr("width", "210mm");
					svg.attr("height", "297mm");
					canvas_width = Conf.default.Paper.dpi * 8.27;
					canvas_height = Conf.default.Paper.dpi * 11.69;
					break;
				case "A4_landscape":
					svg.attr("width", "297mm");
					svg.attr("height", "210mm");
					canvas_width = Conf.default.Paper.dpi * 11.69;
					canvas_height = Conf.default.Paper.dpi * 8.27;
					break;
			};

			svg.attr("id", "saveSVG");
			svg.attr("xmlns:xlink", "http://www.w3.org/1999/xlink");
			svg.attr("viewBox", [base.x, base.y, base.width, base.height].join(" "));

			if (Layers.BAK.opacity !== 0) {
				let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				rect.setAttribute("x", base.x);
				rect.setAttribute("y", base.y);
				rect.setAttribute("width", base.width);
				rect.setAttribute("height", base.height);
				rect.setAttribute("fill", Layers["BAK"].color);
				svg[0].insertBefore(rect, svg[0].firstChild);
			}
			$("body").append(svg);

			LayerCont.text_write(svg, Object.assign(Conf.default.Credit, {
				"x": base.width + base.x - 2, "y": base.height + base.y - Conf.default.Credit.size,"no": "copyright",
				"width": 128, "height": 12, "type": params.type, "color": Conf.default.Text.color
			})); // add Copyrigt

			svg.attr("style", "");
			Marker.conv_svg(svg, params.type);
			switch (params.type) {
				case 'png':
					$("body").append(`<canvas id='download' class='hidden' width="${canvas_width}" height="${canvas_height}"></canvas>`);
					let canvas = $("#download")[0];
					var ctx = canvas.getContext('2d');
					data = new XMLSerializer().serializeToString(svg[0]);
					let imgsrc = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
					let image = new Image();
					image.onload = () => {
						let scale = canvas_width / base.width;
						ctx.drawImage(image, 0, 0, base.width * scale, base.height * scale);
						save_common(svg, canvas.toDataURL("image/png"), 'png');
					}
					image.src = imgsrc;
					break;
				case 'svg':
					data = new XMLSerializer().serializeToString(svg[0])
					save_common(svg, "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data))), 'svg');
					break;
			};
		},

		all_clear: () => {
			console.log("LayerCont: all clear... ");
			for (let key in Conf.Style) if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
			LayerCont.init();
		}
	};

	function svg_style(key) {	// set svg style(no set opacity)
		let style, weight = 1, nowzoom = map.getZoom();
		if (nowzoom < 15) {
			weight = 1 / (15 - nowzoom);
		} else if (nowzoom > 15) {
			weight = (nowzoom - 15) * 0.6;
		};
		let common = {
			"stroke": true, "dashArray": Conf.Style[key].dashArray, "bubblingMouseEvents": false, "lineJoin": 'round',
			"bubblingMouseEvents": false, "weight": Layers[key].width * weight
		};
		if (Conf.Style[key].type == "area") {
			style = Object.assign(common, { "color": Layers[key].color_dark, "fillColor": Layers[key].color });
		} else {
			style = Object.assign(common, { "color": Layers[key].color, "fillColor": Layers[key].color_dark });
		};
		return style;
	};

	function way_toggle(ev) {					// wayをクリックしたときのイベント（表示/非表示切り替え）
		let key = ev.target.mapmaker.key;
		let options = ev.target.options;
		if (options.opacity == 0) {
			options.fillOpacity = 1;
			options.opacity = 1;
			ev.target.options.opacity = 1;
			if (Conf.Style[key].type !== "area") options.fillOpacity = 0; 	// LineがPolygon化された場合の対処
		} else {
			options.fillOpacity = 0;
			options.opacity = 0;
			ev.target.options.opacity = 0;
		};
		let style = svg_style(key);
		options.color = style.color;
		options.fillColor = style.fillColor;
		options.weight = style.weight;
		ev.target.setStyle(options);
	};

	function save_common(svg, dataURI, ext) {	// save処理のファイル作成&保存部分
		let blob = Basic.dataURItoBlob(dataURI);
		let url = URL.createObjectURL(blob);
		let a = document.createElement("a");
		a.setAttribute("type", "hidden");
		a.setAttribute("id", "download-link");
		a.download = Conf.default.FileName + '.' + ext;
		a.href = url;
		$('body').append(a);
		a.click();
		setTimeout(function () {
			URL.revokeObjectURL(url);
			$("#download").remove();
			$("#download-link").remove();
			svg.remove();
			map.setView(map.getCenter());
		}, Math.max(3000, dataURI.length / 512));
	};
})();

// PoiData Control
var PoiCont = (function () {
	var PoiData = { geojson: [], targets: [], enable: [] };	// OvPassの応答(features抜き)と対象Keyの保存
	var latlngs = {}, geoidx = {};							// 緯度経度  osmid: {lat,lng} / osmidからgeojsonのindexリスト

	return {
		pois: () => { return PoiData },
		all_clear: () => { PoiData = { geojson: [], targets: [], enable: [] } },
		add: (pois) => {      // pois: {geojson: [],targets: []}
			if (pois.enable == undefined) pois.enable = [];
			pois.geojson.forEach((val1, idx1) => {	// 既存Poiに追加
				let poi = { "geojson": pois.geojson[idx1], "targets": pois.targets[idx1], "enable": pois.enable[idx1] };
				PoiCont.set(poi);
			});

			PoiData.geojson.forEach((node, node_idx) => {
				if (node.geometry.type !== "Point") {
					console.log(node.geometry.coordinates);
					let lat = 0, lng = 0, counts = node.geometry.coordinates[0].length;
					for (let key in node.geometry.coordinates[0]) {
						lat += node.geometry.coordinates[0][key][1];
						lng += node.geometry.coordinates[0][key][0];
					};
					latlngs[node.id] = { "lat": lat / counts, "lng": lng / counts };
				} else {
					latlngs[node.id] = { "lat": node.geometry.coordinates[1], "lng": node.geometry.coordinates[0] };
				};
				geoidx[node.id] = node_idx;
			});
		},
		set: (poi) => {
			let cidx = PoiData.geojson.findIndex((val) => val.id == poi.geojson.id);
			if (cidx === -1) {                          // 無い時は追加
				PoiData.geojson.push(poi.geojson);
				cidx = PoiData.geojson.length - 1;
			};
			if (PoiData.targets[cidx] == undefined) {  	// targetが無い時は追加
				PoiData.targets[cidx] = poi.targets;
			} else {
				PoiData.targets[cidx] = Object.assign(PoiData.targets[cidx], poi.targets);
			};
			if (poi.enable !== undefined) PoiData.enable[cidx] = poi.enable;
		},
		get_target: (targets) => { return poi_filter(targets) },	// 指定したtargetのgeojsonと緯度経度を返す
		get_osmid: (osmid) => {           							// osmidを元にgeojsonと緯度経度、targetを返す
			let idx = geoidx[osmid];
			return { geojson: PoiData.geojson[idx], latlng: latlngs[osmid], targets: PoiData.targets[idx], enable: PoiData.enable[idx] };
		},
		get_catname: (tags) => {          							// get Category Name from Conf.category(Global Variable)
			let categorys = Object.keys(Conf.category);
			let catname = "";
			let key1 = categorys.find(key => tags[key] !== undefined);
			let key2 = tags[key1] == undefined ? "" : tags[key1];
			if (key2 !== "") {                  // known tags
				catname = Conf.category[key1][key2];
				if (catname == undefined) catname = "";
			} else if (tags["wikipedia"]) {							// wikipediaの時は:の右側を返す
				catname = tags["wikipedia"].split(':')[1];
			};
			return catname;
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
	}
})();

var Marker = (function () {		// Marker closure
	var markers = {}, SvgIcon = {};	// SVGアイコン連想配列(filename,svg text)

	return {
		init: () => {
			let jqXHRs = [], keys = [];			// SVGテキストをSvgIconへ保存
			Object.keys(Conf.icon).forEach(key1 => {
				Object.keys(Conf.icon[key1]).forEach((key2) => {
					let filename = Conf.icon[key1][key2];
					if (keys.indexOf(filename) == -1) {
						keys.push(filename);
						jqXHRs.push($.get(`./image/${filename}`));
					}
				});
			});
			$.when.apply($, jqXHRs).always(function () {
				let xs = new XMLSerializer();
				for (let key in keys) SvgIcon[keys[key]] = xs.serializeToString(arguments[key][0]);
			});
		},
		have: (target) => {					// Markerか確認(true: marker)
			return Object.keys(Conf.marker).some(key => key == target);
		},
		set: (target) => {					// Poi表示
			Marker.delete(target);
			markers[target] = [];
			let pois = PoiCont.get_target(target);
			if (pois.geojson !== undefined) {
				pois.geojson.forEach(function (geojson, idx) {
					let poi = { "geojson": pois.geojson[idx], "targets": pois.targets[idx], "latlng": pois.latlng[idx], "enable": pois.enable[idx] };
					if (poi.enable) {
						make_popup(target, poi, 'name').then(marker => {
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

		qr_add: (url, latlng, text) => {
			var qrcode = new QRCode({ content: url, join: true, container: "svg", width: 128, height: 128 });
			let data = qrcode.svg();
			let icon = L.divIcon({ "className": "icon", "iconSize": [512, 128], "html": `<div class="d-flex"><div class="flex-row">${data}</div><div class="p-2 bg-light"><span>${text}</span></div></div>` });
			let marker = L.marker(new L.LatLng(latlng.lat, latlng.lng), { icon: icon, draggable: true });
			marker.addTo(map);
			return { marker: marker, svg: data };
		},

		chglng: (target, osmid, lang) => {
			let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
			let marker = markers[target][idx];
			let poi = PoiCont.get_osmid(marker.mapmaker_id);
			let geojson = poi.geojson;
			let name = geojson.properties[lang];
			name = name == undefined ? "" : name;
			if (name == "") {
				WinCont.modal_open({
					"title": glot.get("chglng_error_title"), "message": glot.get("chglng_error_message"),
					"mode": "close", "callback_close": () => WinCont.modal_close()
				});
			} else {
				map.closePopup();
				marker.off('click');
				marker.removeFrom(map);
				make_popup(target, poi, lang).then(marker => {
					markers[target][idx] = marker[0];
				});
			}
		},
		conv_svg: (svg, type) => {					// MakerをSVGに追加 理由：leafletがアイコンをIMG扱いするため
			let marker = $("div.leaflet-marker-pane").children();
			let parser = new DOMParser(), svgicon, svgtext, svgstl, text;
			for (let i = 0; i < marker.length; i++) {
				let pathname = $(marker.eq(i)[0].children).children().attr('src');
				svgtext = $(marker.eq(i)[0].children).find("span");
				switch (pathname) {
					case undefined:					// not icon(qr etc...)
						svgicon = $(marker.eq(i)[0].children).find("svg");
						svg_append(svg, svgicon, marker.eq(i), { x: $(svgicon).width() / 2, y: $(svgicon).height() / 2 });
						text = svgtext.text();
						svgstl = svgicon.offset();
						if (text !== undefined) {	// QRCode Text
							LayerCont.text_write(svg, {
								"text": text, "anchor": 'start', "x": Number(svgstl.left) + Math.ceil($(svgicon).width() / 2) + 4, "y": Number(svgstl.top), "no": i,
								"width": svgtext.width(), "height": svgtext.height(), "size": Conf.default.Text.size, "color": Conf.default.Text.color, "font": "Helvetica", "type": type
							});
						};
						break;
					default:
						let filename = pathname.match(".+/(.+?)([\?#;].*)?$")[1];
						svgicon = $(parser.parseFromString(SvgIcon[filename], "text/xml")).children();
						svg_append(svg, svgicon, marker.eq(i), Conf.default.Icon);
						text = $(marker.eq(i)[0].children).children().attr('icon-name');
						svgstl = marker.eq(i).css("transform").slice(7, -1).split(",")		// transformのstyleから配列でXとY座標を取得(4と5)
						if (text !== undefined && Conf.default.Text.view) {					// Marker Text
							LayerCont.text_write(svg, {
								"text": text, "anchor": 'start', "x": Number(svgstl[4]) + Math.ceil(Conf.default.Icon.x / 2) + 4, "y": Number(svgstl[5]), "no": i,
								"width": svgtext.width(), "height": svgtext.height(), "size": Conf.default.Text.size, "color": Conf.default.Text.color, "font": "Helvetica", "type": type
							});
						};
						break;
				};
			};

			function svg_append(svg, svgicon, marker, size) {
				let svgvbox;
				if ($(svgicon).attr('viewBox') == undefined) {
					//svgvbox = $(svgicon)[0].attr('viewBox').split(' ');
					svgvbox = [0, 0, size.x, size.y];
				} else {
					svgvbox = $(svgicon).attr('viewBox').split(' ');
				};
				let scale = Math.ceil((size.x / (svgvbox[2] - svgvbox[0])) * 1000) / 1000;
				let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
				for (let key in svgicon[0].childNodes) {
					let nodeName = svgicon[0].childNodes[key].nodeName;
					if (nodeName == "path" || nodeName == "g" || nodeName == "defs" || nodeName == "rect" || nodeName == "ellipse" || nodeName == "style") {
						group.append(svgicon[0].childNodes[key].cloneNode(true));
					};
				}
				let svgstl = marker.css("transform").slice(7, -1).split(",")	// transformのstyleから配列でXとY座標を取得(4と5)
				$(group).attr("transform", "matrix(1,0,0,1," + (Number(svgstl[4]) - size.x / 2) + "," + (Number(svgstl[5]) - size.y / 2) + ") scale(" + scale + ")");
				svg.append(group);
			};
		},

		set_size: (size, view) => {
			let icon_xy = Math.ceil(size * Conf.default.Icon.scale);
			Conf.default.Text.size = size;		// set font size 
			Conf.default.Text.view = view;
			Conf.default.Icon.x = icon_xy;		// set icon size
			Conf.default.Icon.y = icon_xy;
		},

		center: (osmid) => {
			Conf.default.Circle.radius = Math.pow(2, 21 - map.getZoom());
			let latlng = PoiCont.get_osmid(osmid).latlng;
			if (latlng.lat.length == undefined) {		// latlngが複数ある場合はcircleなし
				let circle = L.circle(latlng, Conf.default.Circle).addTo(map);
				setTimeout(() => map.removeLayer(circle), Conf.default.Circle.timer);
			};
		},

		all_clear: () => Object.keys(markers).forEach((target) => Marker.delete(target)),	// all delete

		delete: (target, osmid) => {														// Marker delete * don't set PoiData
			if (osmid == undefined || osmid == "") {	// all osmid
				if (markers[target] !== undefined) {
					markers[target].forEach(marker => map.removeLayer(marker));
					markers[target] = [];
				};
			} else {									// delete osmid
				let idx = markers[target].findIndex(val => val.mapmaker_id == osmid);
				let marker = markers[target][idx];
				map.removeLayer(marker);
			};
			map.closePopup();
		}
	};

	function make_popup(target, poi, lang) {	// markerは複数返す時がある
		return new Promise((resolve, reject) => {
			let categorys = Object.keys(Conf.category), icon;
			let tags = poi.geojson.properties.tags == undefined ? poi.geojson.properties : poi.geojson.properties.tags;
			let name = tags[lang] == undefined ? tags.name : tags[lang];
			name = (name == "" || name == undefined) ? "" : name;
			let keyn = categorys.find(key => tags[key] !== undefined);
			if (keyn !== undefined) {	// in category
				icon = Conf.icon[keyn][tags[keyn]];
				icon = "./image/" + (icon !== undefined ? icon : Conf.icon.default);
				let html = `<div class="d-flex"><img class="icon flex-row" src="${icon}" icon-name="${name}">`;
				if (name !== "" && Conf.default.Text.view) html = `${html}<span class="icon flex-row">${name}</span>`;
				icon = L.divIcon({ "className": "icon", "iconSize": [200, 20], "iconAnchor": [Conf.default.Icon.x / 2, Conf.default.Icon.y / 2], "html": html + "</div>" });
				let marker = L.marker(new L.LatLng(poi.latlng.lat, poi.latlng.lng), { icon: icon, draggable: true });
				marker.addTo(map).on('click', e => { popup_icon(e) });
				marker.mapmaker_id = poi.geojson.id;
				marker.mapmaker_key = target;
				marker.mapmaker_lang = lang;
				resolve([marker]);
			} else {		// undefined(no category)
				switch (target) {
					case "wikipedia":
						icon = "./image/" + Conf.icon.wikipedia["*"];
						name = tags[Conf.marker.wikipedia.tag].split(':')[1];
						let html = `<div class="d-flex"><img class="icon flex-row" src="${icon}" icon-name="${name}">`;
						if (name !== "" && Conf.default.Text.view) html = `${html}<span class="icon flex-row">${name}</span>`;
						icon = L.divIcon({ "className": "icon", "iconSize": [200, 20], "iconAnchor": [Conf.default.Icon.x / 2, Conf.default.Icon.y / 2], "html": html + "</div>" });
						let marker = L.marker(new L.LatLng(poi.latlng.lat, poi.latlng.lng), { icon: icon, draggable: true });
						marker.addTo(map).on('click', e => { popup_icon(e) });
						marker.mapmaker_id = poi.geojson.id;
						marker.mapmaker_key = target;
						marker.mapmaker_lang = Conf.marker.wikipedia.tag;
						let wiki = tags[Conf.marker.wikipedia.tag].split(':')[0];
						let url = encodeURI(`https://${wiki}.${Conf.marker.wikipedia.domain}/wiki/${name}`);
						let ll1 = new L.LatLng(poi.latlng.lat, poi.latlng.lng);
						let pix = map.latLngToLayerPoint(ll1);
						//	pix.y += 20;
						let ll2 = map.layerPointToLatLng(pix);
						Basic.getWikipedia(wiki, name).then(text => {
							let qrcode = Marker.qr_add(url, ll2, text);
							qrcode.marker.mapmaker_id = poi.geojson.id + "-qr";
							qrcode.marker.mapmaker_key = target;
							qrcode.marker.mapmaker_svg = qrcode.svg;
							resolve([marker, qrcode.marker]);
						});
				};
			};
		});

	};

	function popup_icon(ev) {
		let popcont;
		let id = ev.target.mapmaker_id;
		let key = ev.target.mapmaker_key;
		let lang = ev.target.mapmaker_lang;
		let tags = PoiCont.get_osmid(id).geojson.properties;
		if (lang == Conf.marker.wikipedia.tag) {
			let qr_btn = `<button onclick='Mapmaker.qr_add("${id}")'>${glot.get("qrcode_make")}</button>`;
			popcont = tags[Conf.marker.wikipedia.tag] + "<br>" + qr_btn;
		} else {
			let name = tags.name == undefined ? "" : tags.name;
			let del_btn = `<button onclick='Mapmaker.poi_del("${key}","${id}")'>${glot.get("marker_delete")}</button>`;
			let chg_eng = `<button onclick='Marker.chglng("${key}","${id}","name:en")'>${glot.get("marker_to_en")}</button>`;
			let chg_jpn = `<button onclick='Marker.chglng("${key}","${id}","name")'>${glot.get("marker_to_ja")}</button>`;
			popcont = (name == '' ? glot.get("marker_noname") : name) + "<br>" + del_btn + "<br>" + (lang == "name" ? chg_eng : chg_jpn);
		};
		L.responsivePopup({ "keepInView": true }).setContent(popcont).setLatLng(ev.latlng).openOn(map);
		ev.target.openPopup();
		return false;
	};
})();

// OverPass Server Control
var OvPassCnt = (function () {
	return {
		get: function (targets) {
			return new Promise((resolve, reject) => {
				WinCont.modal_open({ "title": glot.get("loading_title"), "message": glot.get("loading_message"), "mode": "" });
				WinCont.modal_progress(0);
				let sverror = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.all_clear() };
				let maparea = GeoCont.get_maparea('LL');

				let jqXHRs = [], Progress = 0, query_date = "";
				targets.forEach(target => {
					let query = "";
					for (let idx in Conf.overpass[target]) { query += Conf.overpass[target][idx] + maparea };
					let url = `${Conf.default.OverPassServer}${Conf.default.OverPassParams}${query_date};(${query});out body;>;out skel qt;`;
					console.log("GET: " + url);
					jqXHRs.push($.get(url, () => { WinCont.modal_progress(Math.ceil(((++Progress + 1) * 100) / targets.length)) }));
				});
				$.when.apply($, jqXHRs).done(function () {
					let i = 0, ovanswer = { geojson: [], targets: [] };
					targets.forEach(target => {
						let arg = arguments[i][1] == undefined ? arguments[1] : arguments[i][1];
						if (arg !== "success") {
							WinCont.modal_open(sverror);
							reject();
						};
						let osmxml = arguments[i][0] == undefined ? arguments[0] : arguments[i][0];
						i++;
						let geojson = osmtogeojson(osmxml, { flatProperties: true });
						geojson = geojson.features.filter(node => {
							let tags = node.properties;
							if (PoiCont.get_catname(tags) !== "") {	// 対象種別であるか
								let result = false;
								switch (target) {
									case "takeaway":
										let take1 = tags.takeaway == undefined ? "" : tags.takeaway;                        // どれか一つにYesがあればOK
										let take2 = tags["takeaway:covid19"] == undefined ? "" : tags["takeaway:covid19"];
										if ([take1, take2].includes("yes")) result = true;
										if ([take1, take2].includes("only")) result = true;
										break;
									case "delivery":
										let deli1 = tags.delivery == undefined ? "" : tags.delivery;
										let deli2 = tags["delivery:covid19"] == undefined ? "" : tags["delivery:covid19"];
										if ([deli1, deli2].includes("yes")) result = true;
										if ([deli1, deli2].includes("only")) result = true;
										break;
									case "takeaway_shop":
									default:
										result = true
										break;
								};
								if (result) return node;
							};
						});
						geojson.forEach(function (val1) {	// 既にデータがあるか確認
							let cidx = ovanswer.geojson.findIndex(val2 => val2.id == val1.id);
							if (cidx === -1) {                          // データが無い時は更新
								ovanswer.geojson.push(val1);
								cidx = ovanswer.geojson.length - 1;
							};
							if (ovanswer.targets[cidx] == undefined) {  // 
								ovanswer.targets[cidx] = [target];
							} else if (ovanswer.targets[cidx].indexOf(target) === -1) {
								ovanswer.targets[cidx].push(target);
							};
						});
					});
					console.log("OvPassCnt: get: end.");
					WinCont.modal_close();
					resolve(ovanswer);
				}).fail((jqXHR, statusText) => {
					WinCont.modal_open(sverror);
				});
			});
		}
	};
})();
