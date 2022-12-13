/*	Main Process */
"use strict";

// Global Variable
var map;				// leaflet map object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const glot = new Glottologist();
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";
const FILES = ["./basemenu.html", "./modals.html", "./data/config-system.json", "./data/config-user.jsonc", './data/overpass-system.json',
	`./data/category-${LANG}.json`, `data/datatables-${LANG}.json`, `./data/marker.json`, `./data/marker-addtional.json`];
const Mono_Filter = ['grayscale:90%', 'bright:85%', 'contrast:130%', 'sepia:15%'];;

// initialize leaflet
$(document).ready(function () {
	console.log("Welcome to MapMaker.");
	let jqXHRs = [];
	for (let key in FILES) { jqXHRs.push($.get(FILES[key])) };
	$.when.apply($, jqXHRs).always(function () {
		let menuhtml = arguments[0][0];								// Get Menu HTML
		$("#modals").html(arguments[1][0]);							// Make Modal HTML
		Conf = Object.assign(arguments[2][0], JSON5.parse(arguments[3][0]));
		for (let i = 4; i <= 8; i++) Conf = Object.assign(Conf, arguments[i][0]);	// Make Config Object

		glot.import("./data/glot.json").then(() => {	// Multi-language support
			// document.title = glot.get("title");		// Title(no change / Google検索で日本語表示させたいので)
			LayerCont.init();							// LayerCont Initialize
			Mapmaker.init(menuhtml);					// Mapmaker Initialize
			SVGCont.init();								// Marker Initialize
			// Google Analytics
			if (Conf.default.GoogleAnalytics !== "") {
				$('head').append('<script async src="https://www.googletagmanager.com/gtag/js?id=' + Conf.default.GoogleAnalytics + '"></script>');
				window.dataLayer = window.dataLayer || [];
				function gtag() { dataLayer.push(arguments); };
				gtag('js', new Date());
				gtag('config', Conf.default.GoogleAnalytics);
			};
			glot.render();
		});
	});
});

var Mapmaker = (function () {
	var maps, custom_mode = false, init_basemenu, init_clearhtml, view_license = false, select_mode = "";
	var Control = { "locate": "", "maps": "" };		// leaflet control object

	return {
		// Initialize
		init: (menuhtml) => {

			// set map layer
			let osm_mono = L.tileLayer.colorFilter('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors', filter: Mono_Filter });
			let osm_std = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors' });
			let osm_tiler = L.mapboxGL({ attribution: Conf.default.Attribution, accessToken: '', style: Conf.default.MapStyle });
			let t_pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { attribution: "<a href='https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html' target='_blank'>国土地理院</a>" });
			let t_ort = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', { attribution: "<a href='https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html' target='_blank'>国土地理院</a>" });

			let def = Conf.default;
			map = L.map('mapid', { center: def.DefaultCenter, zoom: def.DefaultZoom, zoomSnap: def.ZoomSnap, zoomDelta: def.ZoomSnap, maxZoom: def.maxZoomLevel, layers: [osm_mono] });
			maps = {
				"OpenStreetMap Mono": osm_mono,
				"OpenStreetMap Standard": osm_std,
				"OpenStreetMap Maptiler": osm_tiler,
				"地理院地図 オルソ": t_ort,
				"地理院地図 淡色": t_pale
			};
			Control["maps"] = L.control.layers(maps, null, null).addTo(map);

			// leaflet panel
			map.zoomControl.setPosition("bottomright");
			new L.Hash(map);

			let zoomlevel = L.control({ position: "bottomleft" });				// make: zoom level
			zoomlevel.onAdd = function () {
				this.ele = L.DomUtil.create('div');
				this.ele.id = "zoomlevel";
				return this.ele;
			};
			zoomlevel.addTo(map);

			Mapmaker.makemenu(menuhtml);										// Make edit menu

			Control["locate"] = L.control.locate({ position: 'bottomright', strings: { title: glot.get("location") }, locateOptions: { maxZoom: 16 } }).addTo(map);
			WinCont.menulist_make();
			Mapmaker.zoom_view();																// Zoom 
			map.on('zoomend', () => Mapmaker.zoom_view());										// ズーム終了時に表示更新
			$("#search_input").attr('placeholder', glot.get("address"))							// set placeholder
			$("#search_input").next().html(glot.get("search"))									// set button name
			$("#search_input").on('change', (e) => { Mapmaker.poi_search(e.target.value) });	// Address Search
		},

		// About Street Map Maker's license
		licence: (once) => {
			if ((once == 'once' && view_license == false) || once == undefined) {
				let msg = { msg: glot.get("licence_message") + glot.get("more_message"), ttl: glot.get("licence_title") };
				WinCont.modal_open({ "title": msg.ttl, "message": msg.msg, "mode": "close", callback_close: WinCont.modal_close });
				view_license = true;
			};
		},

		// 基本メニューの作成 menuhtml:指定したHTMLで左上に作成 menuhtmlが空の時は過去のHTMLから復元
		makemenu: (menuhtml) => {
			console.log("Start: make menu.")
			if (menuhtml !== undefined) {
				let basemenu = L.control({ position: "topleft" });			// Add BaseMenu
				basemenu.onAdd = function () {
					this.ele = L.DomUtil.create('div');
					this.ele.id = "basemenu";
					return this.ele;
				};
				basemenu.addTo(map);
				document.getElementById("basemenu").innerHTML = menuhtml;
				init_clearhtml = document.getElementById("clear_map").outerHTML;	// basemenuから切り離し
				document.getElementById("clear_map").remove();
				init_basemenu = document.getElementById("basemenu").outerHTML;

				let clearbtn = L.control({ position: "topright" });			// Add BaseMenu
				clearbtn.onAdd = function () {
					this.ele = L.DomUtil.create('div');
					this.ele.id = "clearmenu";
					this.ele.innerHTML = init_clearhtml;
					return this.ele;
				};
				clearbtn.addTo(map);
			} else {
				for (let key in Conf.style) $(`[id^=${key}_]`).off();		// Delete Key_* events
				$("#basemenu").html(init_basemenu);
			};

			console.log("Start: make marker.")
			let keys = Object.keys(Conf.osm);							// マーカー追加メニュー作成
			keys.forEach(key => {
				if (Conf.osm[key].marker !== undefined) {
					let html = `<a class="dropdown-item drop_button btn mr-1" style="background-image: url('./${Conf.osm[key].marker}')" onclick="Mapmaker.poi_add('${key}')">`;
					html += `${glot.get("marker_" + key)}</a>\n`;
					$("#menu_list").append(html);
				};
			});

			console.log("Start: make custom panel.")
			for (let key in Conf.style) {									// make style panel
				let key_layer = `#${key}_layer`;
				let key_line = `#${key}_line`;
				let copyobj = document.getElementById("AAA").cloneNode(true);

				copyobj.getElementsByClassName("custom_label")[0].innerHTML = glot.get("menu_" + key);
				copyobj.querySelector('#AAA_color').setAttribute('value', Conf.style[key].color);
				copyobj.querySelector('#AAA_color').setAttribute('id', key + "_color");
				copyobj.querySelector('#AAA_layer').setAttribute('id', key + "_layer");
				copyobj.querySelector('#AAA_line').setAttribute('value', Conf.style[key].width);
				copyobj.querySelector('#AAA_line').setAttribute('id', key + "_line");
				if (key == "background") copyobj.querySelector(key_line).outerHTML = "<span class='input-hidden'></span>";
				copyobj.setAttribute('id', key);
				document.getElementById("custom_map").appendChild(copyobj);

				// 色変更時のイベント定義
				$(`#${key}_color`).on('change', (event) => {
					if (key_layer.indexOf("background") > -1) {
						$("#mapid").css('background-color', event.target.value);
						$("#mapid").removeClass("bg-clear");
					};
					$(`#${key}_color`).attr('value', event.target.value);
					$(`#${key}_color`).removeClass('bg-clear');
					Layers[key].opacity = 1;
					Layers[key].color = event.target.value;
					Layers[key].color_dark = chroma(event.target.value).darken(Conf.default.ColorDarken).hex();
					Layers[key].width = 1; //width;
					Mapmaker.update(key);
				});

				// 幅変更時のイベント定義
				$(key_line).on('change', (event) => {
					Layers[key].width = event.target.value;; //width;
					Mapmaker.update(key);
				});
				// 表示変更時のイベント定義
				$(`#${key}_layer`).on('click', function () {
					if (key_layer.indexOf("background") > -1) {
						$("#mapid").css('background-color', "");
						$("#mapid").addClass("bg-clear");
						$("#background_color").css('background-color', "");
						$("#background_color").addClass("bg-clear");
						Layers["background"].opacity = 0;
					} else {
						let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;
						$(key_layer).children().toggleClass("fa-trash-alt fa-undo");
						LayerCont.layer_make(key, view);
					}
				});
			};
			$("#AAA").remove();
			console.log("Start: make glot render.")
			glot.render();
		},

		// make custom map
		make: query_date => {
			let nowzoom = map.getZoom(), def_msg;
			if (nowzoom < Conf.default.MinZoomLevel) return false;
			if (typeof (query_date) == "undefined") query_date = "";
			def_msg = glot.get("loading_message");
			WinCont.modal_open({ "title": glot.get("loading_title"), "message": def_msg, "mode": "" });
			WinCont.modal_spinner(true);

			var targets = [];
			var progress = function (data_length) { WinCont.modal_text(def_msg + "<br>Data Loading... " + data_length + "Bytes.", false) };
			for (let key in Conf.style) if (Conf.style[key].zoom <= nowzoom) targets.push(key);
			OvPassCnt.get(targets, progress).then((ovasnswer) => {
				WinCont.modal_text("<br>Data Loading Complate... ", true);
				targets.forEach(target => {
					let geojson = OvPassCnt.get_target(ovasnswer, target);
					if (geojson.length > 0) {
						let fil_geojson = {	// node以外なのにPoint以外だとfalse(削除)
							"features": geojson.filter((val) => { return (Conf.style[target].type !== "node") ? val.geometry.type !== "Point" : true; })
						};
						if (target == "river") fil_geojson = CoastLine.merge(fil_geojson.features);
						Layers[target].geojson = fil_geojson.features;
					};
				});
				for (let key in Conf.style) {
					if (Layers[key].geojson) { WinCont.modal_text(`<br>Map Writeing... ${key}`, true); LayerCont.layer_make(key); };
				};
				Mapmaker.custom(true);
				WinCont.modal_close();
				console.log("Mapmaker: make: end");
			}).catch(() => {
				let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.all_clear() };
				WinCont.modal_open(modal);
			});
			return;
		},

		// Update layers(color/lime weight change)
		update: targetkey => {
			if (targetkey == "" || typeof (targetkey) == "undefined") {		// no targetkey then update all layer
				for (let key in Conf.style) if (Layers[key].geojson) LayerCont.layer_make(key);
			} else {
				if (Layers[targetkey].geojson) LayerCont.layer_make(targetkey);
			};
			console.log("Mapmaker: update... end ");
		},

		// Search Address(Japan Only)
		poi_search: (keyword) => {
			getLatLng(keyword, (latnng) => {
				map.setZoom(Conf.default.SearchZoom);
				map.panTo(latnng);
			}, () => {
				WinCont.modal_open({
					title: glot.get("addressnotfound_title"), message: glot.get("addressnotfound_body"),
					mode: "close", callback_close: () => { WinCont.modal_close() }
				});
			})
		},

		// 情報（アイコンなど）を地図に追加
		poi_add: key => {
			WinCont.modal_open({ "title": glot.get("loading_title"), "message": glot.get("loading_message"), "mode": "" });
			WinCont.modal_spinner(true);
			if (Conf.osm[key].file !== undefined) {		// "file"がある場合
				$.get(Conf.osm[key].file).then((csv) => {
					let geojsons = GeoCont.csv2geojson(csv, key);
					let targets = geojsons.map(() => [key]);
					poiset(key, { "geojson": geojsons, "targets": targets });
				});
			} else {
				OvPassCnt.get([key])
					.then((ovasnswer) => {
						if (ovasnswer == undefined) {
							let modal = { "title": glot.get("nodata_title"), "message": glot.get("nodata_message"), "mode": "close", "callback_close": () => WinCont.modal_close() };
							WinCont.modal_open(modal);
						} else {
							poiset(key, ovasnswer);
						};
					}).catch(() => {
						let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.all_clear() };
						WinCont.modal_open(modal);
					})
			};

			function poiset(key, answer) {
				let geojsons = { geojson: [], targets: [] };
				answer.geojson.forEach((geojson, idx) => {
					let geo = geojson.geometry;
					let cords; // = geo.coordinates;
					cords = GeoCont.multi2flat(geo.coordinates, geo.type);	// ネスト構造のデータをフラット化
					cords = GeoCont.flat2single(cords, geo.type);			// エリア/ライン => ポイント
					cords = GeoCont.bboxclip([cords], true);				// 画面外のPOIは無視したgeojsonを作成
					if (cords.length > 0) {
						geojson.geometry.type = "Point";
						if (cords[0][0] == NaN) console.log("NAN");
						geojson.geometry.coordinates = cords[0];
						geojsons.geojson.push(geojson);
						geojsons.targets.push(answer.targets[idx]);
					};
				});
				PoiCont.add_geojson(geojsons);
				WinCont.modal_close();
				WinCont.modal_select(key).then((slanswer) => {
					PoiCont.add_geojson(slanswer);
					Marker.set(key);
					WinCont.modal_close();
					console.log(`Mapmaker: Add: ${key} end`);
				}).catch(() => console.log("poi_add: cancel"));
			};
		},

		// delete poi
		poi_del: (target, osmid) => {
			let poi = PoiCont.get_osmid(osmid);
			if (poi !== undefined) {
				poi.enable = false;
				PoiCont.set_geojson(poi);
				Marker.delete(target, osmid);
			};
		},

		// Image List and select
		poi_marker_change: (target, osmid, filename) => {
			switch (filename) {
				case "":
				case undefined:
					let html = "", images = [];
					Object.keys(Conf.marker.tag).forEach(key1 => {
						Object.keys(Conf.marker.tag[key1]).forEach((key2) => {
							let filename = Conf.marker.path + "/" + Conf.marker.tag[key1][key2];
							if (images.indexOf(filename) == -1) { images.push(filename) };
						});
					});
					Object.values(Conf.marker_append.files).forEach(key1 => {
						let filename = Conf.marker_append.path + "/" + key1;
						if (images.indexOf(filename) == -1) { images.push(filename) };
					});
					images = images.filter((x, i, self) => { return self.indexOf(x) === i });	//重複削除
					images.sort();
					Object.keys(images).forEach(fidx => { html += `<a href="#" onclick="Mapmaker.poi_marker_change('${target}','${osmid}','${images[fidx]}')"><img class="iconx2" src="${images[fidx]}"></a>` });
					WinCont.modal_open({ "title": "", "message": html, "mode": "close", callback_close: WinCont.modal_close });
					break;
				default:
					Marker.change_icon(target, osmid, filename);
					WinCont.modal_close();
					break;
			};
		},

		qr_add: (target, osmid) => {
			let marker = Marker.get(target, osmid);
			if (marker !== undefined) {
				let wiki = marker.mapmaker_lang.split(':');
				let url = encodeURI(`https://${wiki[0]}.${Conf.osm.wikipedia.domain}/wiki/${wiki[1]}`);
				let pix = map.latLngToLayerPoint(marker.getLatLng());
				let ll2 = map.layerPointToLatLng(pix);
				Basic.getWikipedia(wiki[0], wiki[1]).then(data => Marker.qr_add(target, osmid, url, ll2, data));
			};
		},

		// Show/Hide Custom Panel(mode change)
		custom: (mode) => {
			switch (mode) {
				case true:
					map.doubleClickZoom.disable();
					for (let key in Conf.style) {		// Show control if key is present
						$('#' + key).hide();
						let zoom = Conf.style[key].zoom == undefined ? 0 : Conf.style[key].zoom;
						if (zoom <= map.getZoom()) $('#' + key).show();
					};
					$("#make_map").hide();
					["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).show());
					["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
					$("#search_input").attr('disabled', 'disabled');
					Control["locate"].remove(map);
					Control["maps"].remove(map);
					Object.keys(maps).forEach(key => { if (map.hasLayer(maps[key])) { Layers["MAP"] = maps[key]; map.removeLayer(maps[key]) } });	// remove select layer
					if (Layers.background.opacity === 0) {		// set background
						$("#mapid").addClass("bg-clear");
					} else {
						$("#mapid").removeClass("bg-clear");
						$("#background_color").css('background-color', Layers.background.color);
					};
					custom_mode = mode;
					Mapmaker.zoom_view();
					break;
				case false:
					map.doubleClickZoom.enable();
					$("#make_map").show();
					["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).hide());
					["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
					$("#search_input").attr('disabled', false);
					Control["locate"].addTo(map);
					Control["maps"].addTo(map);
					Layers.MAP.addTo(map);
					$("#mapid").removeClass("bg-clear");
					$("#background_color").css('background-color', "");
					custom_mode = mode;
					Mapmaker.zoom_view();
					break;
			}
			return custom_mode;
		},

		// Area Select(A4)
		area_select: (mode) => {
			select_mode = mode;
			LayerCont.area_select(mode);
			return mode;
		},

		// save layers&pois
		save: (type) => {
			SVGCont.save({ type: type, mode: select_mode });
		},

		// View Zoom Level & Status Comment
		zoom_view: () => {
			let nowzoom = map.getZoom();
			let message = `${glot.get("zoomlevel")}${map.getZoom()} `;
			if (nowzoom < Conf.default.MinZoomLevel) {
				message += `<br>${glot.get("morezoom")}`;
				$("#make_map").hide();
			} else {
				if (nowzoom < Conf.default.LimitZoomLevel) message += `<br>${glot.get("morezoom2")}`;
				if (!Mapmaker.custom()) $("#make_map").show();
			};
			if (Mapmaker.custom()) message += `<br>${glot.get("custommode")}`;
			$("#zoomlevel").html("<h2 class='zoom'>" + message + "</h2>");
		},

		// Try Again
		all_clear: () => {
			WinCont.modal_open({
				title: glot.get("restart_title"),
				message: glot.get("restart_message"),
				mode: "yesno",
				callback_yes: () => {
					Mapmaker.custom(false);
					OvPassCnt.clear();
					LayerCont.all_clear();
					Marker.all_clear();
					PoiCont.all_clear();
					Mapmaker.makemenu();
					WinCont.modal_close();
				},
				callback_no: () => WinCont.modal_close()
			});
		}
	}
})();

// PoiDatalist管理
var DataList = (function () {
	var table, _status = "", _lock = false, timeout = 0, MS = "modal_select";

	return {
		status: () => { return _status },   // statusを返す
		table: () => { return table },      // tableを返す
		lock: mode => { _lock = mode },     // DataListをロック(true) or 解除(false)とする
		init: () => { // DataListに必要な初期化
			$(`#${MS}_keyword`).off();
			$(`#${MS}_keyword`).on('change', () => {        // キーワード検索
				if (timeout > 0) {
					window.clearTimeout(timeout);
					timeout = 0;
				};
				timeout = window.setTimeout(() => DataList.filter($(`#${MS}_keyword`).val(), 500));
			});

			$(`#${MS}_category`).off();
			$(`#${MS}_category`).on('change', () => {        // カテゴリ名でキーワード検索
				let category = $(`#${MS}_category`).val();
				DataList.filter(category == "-" ? "" : category);
			});
		},
		make_select: result => {    		// 店舗種別リストを作成
			WinCont.select_clear(`${MS}_category`);
			let pois = result.map(data => { return data.category });
			pois = pois.filter((x, i, self) => { return self.indexOf(x) === i });
			pois.sort((x, y) => x.localeCompare(y, 'ja'));
			pois.map(poi => WinCont.select_add(`${MS}_category`, poi, poi));
		},
		view_select: function (targets) {  	// PoiDataのリスト表示
			DataList.lock(true);
			if (table !== undefined) table.destroy();
			let result = PoiCont.list(targets);
			table = $('#modal_select_table').DataTable({
				"columns": Object.keys(Conf.datatables_columns).map(function (key) { return Conf.datatables_columns[key] }),
				"data": result,
				"processing": true,
				"filter": true,
				"destroy": true,
				"deferRender": true,
				"dom": 't',
				"language": Conf.datatables_lang,
				"order": [],    // ソート禁止(行選択時にズレが生じる)
				"ordering": true,
				"orderClasses": false,
				"paging": true,
				"processing": false,
				"pageLength": 100000,
				"select": 'multi',
				"scrollCollapse": true,
			});
			$('#modal_select_table').css("width", "");
			DataList.make_select(result);
			let osmids = result.filter(val => val.enable).map(val => val.osmid);
			DataList.one_select(osmids);		
			table.draw();
			table.off('select');
			table.on('select', (e, dt, type, indexes) => {
				if (type === 'row') {
					var data = table.rows(indexes).data().pluck('osmid');
					Marker.center(data[0]);
				}
			});
			DataList.lock(false);
		},
		one_select: osmids => {
			let alldata = table.rows().data().toArray();
			let join_ids = osmids.join('|');
			alldata.forEach((val, idx) => { if (join_ids.indexOf(val.osmid) > -1) table.row(idx).select() });
		},
		indexes: () => { // アイコンをクリックした時にデータを選択
			let selects = table.rows('.selected').indexes();
			selects = table.rows(selects).data();
			return selects.toArray();
		},
		filter: keyword => { table.search(keyword).draw() },                // キーワード検索
		filtered: () => table.rows({ filter: 'applied' }).data().toArray(), // 現在の検索結果リスト
		filtered_select: () => table.rows({ filter: 'applied' }).select(),
		filtered_deselect: () => table.rows({ filter: 'applied' }).deselect()
	}
})();
