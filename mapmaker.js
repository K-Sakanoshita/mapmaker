/*	Main Process */
"use strict";

// Global Variable
var map;				// leaflet map object
var area;				// leafley areaselect object
var Locate;				// leaflet locate object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";
const FILES = ["./basemenu.html", "./modals.html", "./data/config.json", `./data/category-${LANG}.json`, `data/datatables-${LANG}.json`, `./data/icon.json`];
const glot = new Glottologist();

// initialize leaflet
$(document).ready(function () {
	console.log("Welcome to MapMaker.");

	let jqXHRs = [];
	for (let key in FILES) { jqXHRs.push($.get(FILES[key])) };
	$.when.apply($, jqXHRs).always(function () {
		let arg = {}, menuhtml = arguments[0][0];								// Get Menu HTML
		$("#modals").html(arguments[1][0]);										// Make Modal HTML
		for (let i = 2; i <= 5; i++) arg = Object.assign(arg, arguments[i][0]);	// Make Config Object
		Object.keys(arg).forEach(key1 => {
			Conf[key1] = {};
			Object.keys(arg[key1]).forEach((key2) => Conf[key1][key2] = arg[key1][key2]);
		});

		glot.import("./data/glot.json").then(() => {	// Multi-language support
			document.title = glot.get("title");			// Title
			LayerCont.init();							// LayerCont Initialize
			Mapmaker.init(menuhtml);					// Mapmaker Initialize
			Marker.init();								// Marker Initialize

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
	var custom_mode = false, init_basemenu, Locate, view_license = false, select_mode = "";

	return {
		// Initialize
		init: (menuhtml) => {

			// leaflet panel
			let def = Conf.default;
			map = L.map('mapid', {
				center: def.DefaultCenter, zoom: def.DefaultZoom, doubleClickZoom: false,
				zoomSnap: def.ZoomSnap, zoomDelta: def.ZoomSnap, maxZoom: def.maxZoomLevel
			});
			map.zoomControl.setPosition("bottomright");
			new L.Hash(map);
			Layers["MAP"] = L.mapboxGL({ attribution: def.Attribution, accessToken: '', style: def.MapStyle }).addTo(map);

			let zoomlevel = L.control({ position: "topright" });
			zoomlevel.onAdd = function (map) {
				this.ele = L.DomUtil.create('div');
				this.ele.id = "zoomlevel";
				return this.ele;
			};
			zoomlevel.addTo(map);

			Mapmaker.makemenu(menuhtml);								// Make edit menu

			L.control.scale({ imperial: false, maxWidth: 200 }).addTo(map);		// Add Scale
			Locate = L.control.locate({ position: 'bottomright', strings: { title: glot.get("location") }, locateOptions: { maxZoom: 16 } }).addTo(map);
			WinCont.menu_make();
			Mapmaker.zoom_view();										// Zoom 
			map.on('zoomend', () => Mapmaker.zoom_view());				// ズーム終了時に表示更新
			$("#search_input").attr('placeholder', glot.get("address"))	// set placeholder
			$("#search_input").on('change', Mapmaker.search_address);	// Address Search
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
			if (menuhtml !== undefined) {
				init_basemenu = menuhtml;
				let basemenu = L.control({ position: "topleft" });			// Add BaseMenu
				basemenu.onAdd = function (map) {
					this.ele = L.DomUtil.create('div');
					this.ele.id = "basemenu";
					return this.ele;
				};
				basemenu.addTo(map);
				$("#basemenu").html(menuhtml);
			} else {
				for (let key in Conf.Style) $(`[id^=${key}_]`).off();		// Delete Key_* events
				$("#basemenu").html(init_basemenu);
				$("#colors").html("");
			};

			let icon_keys = Object.keys(Conf.marker);
			icon_keys.forEach(key => {
				let html = `<a class="dropdown-item drop_button btn mr-1" style="background-image: url('${Conf.marker[key].icon}')" onclick="Mapmaker.poi_add('${key}')">${glot.get("icon_" + key)}</a>`
				$("#menu_list").append(html);
			});

			for (let key in Conf.Style) {
				let key_layer = `#${key}_layer`;
				let key_color = `#${key}_color`;
				let copyobj = $("#AAA").clone();
				if (Layers[key].opacity === 0) copyobj.find('#AAA_color').addClass("bg-clear");
				copyobj.attr('id', key);
				copyobj.find('#AAA_color').css('background-color', Conf.Style[key].color);
				copyobj.find('#AAA_color').attr('id', key + "_color");
				copyobj.find('#AAA_layer').attr('id', key + "_layer");
				copyobj.find('label[for="AAA_layer"]').attr('for', key + "_layer");
				copyobj.find('.custom_label').html(glot.get("menu_" + key));
				copyobj.appendTo($('#custom_map'));

				$(key_color).simpleColorPicker({
					onChangeColor: function (color, width) {															// 色変更時のイベント定義
						if (key_layer.indexOf("BAK") > -1) {
							$("#mapid").css('background-color', color);
							$("#mapid").removeClass("bg-clear");
						};
						$(`#${key}_color`).css('background-color', color);
						$(`#${key}_color`).removeClass('bg-clear');
						Layers[key].opacity = 1;
						Layers[key].color = color;
						Layers[key].color_dark = chroma(color).darken(Conf.default.ColorDarken).hex();
						Layers[key].width = width;
						Mapmaker.update(key);
					}
				});
				$(key_layer).on('click', function () {																	// 表示変更時のイベント定義
					if (key_layer.indexOf("BAK") > -1) {
						$("#mapid").css('background-color', "");
						$("#mapid").addClass("bg-clear");
						$("#BAK_color").css('background-color', "");
						$("#BAK_color").addClass("bg-clear");
						Layers["BAK"].opacity = 0;
					} else {
						let view = $(key_layer).children().attr("class").indexOf("fa-trash-alt") > 0 ? false : true;
						$(key_layer).children().toggleClass("fa-trash-alt fa-undo");
						LayerCont.layer_make(key, view);
					}
				});
			};
			$("#AAA").remove();
			glot.render();
		},

		// make custom map
		make: query_date => {
			let layercnt = Object.keys(Conf.Style).length;;
			let nowzoom = map.getZoom();
			if (nowzoom < Conf.default.MinZoomLevel) return false;
			if (typeof (query_date) == "undefined") query_date = "";
			let maparea = GeoCont.get_maparea('LLL');
			WinCont.modal_open({ "title": glot.get("loading_title"), "message": glot.get("loading_message"), "mode": "" });

			let Progress = 0, jqXHRs = [];
			for (let key in Conf.Style) {
				if (Conf.Style[key].zoom <= nowzoom) {
					let query = "";
					for (let ovpass in Conf.overpass[key]) { query += Conf.overpass[key][ovpass] + maparea; };
					let url = `${Conf.default.OverPassServer}${Conf.default.OverPassParams}${query_date};(${query});out body;>;out skel qt;`;
					console.log("GET: " + url);
					jqXHRs.push($.get(url, () => WinCont.modal_progress(Math.ceil(((++Progress + 1) * 100) / layercnt))));
				};
			};
			if (jqXHRs.length == 0) {
				WinCont.modal_close();
				console.log("Make Mapmaker: no data");
				return;
			};

			$.when.apply($, jqXHRs).done(function () {
				let i = 0;
				for (let key in Conf.Style) {
					if (Conf.Style[key].zoom <= nowzoom) {
						if (arguments[i][1] !== "success") {
							let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.all_clear() };
							WinCont.modal_open(modal);
						};
						GeoCont.set(key, arguments[i++][0]);
					};
				};
				Mapmaker.update();
				WinCont.modal_close();
				Mapmaker.custom(true);
				console.log("Mapmaker: make: end");
			}).fail((jqXHR, statusText) => {
				let modal = { "title": glot.get("sverror_title"), "message": glot.get("sverror_message"), "mode": "close", "callback_close": () => Mapmaker.all_clear() };
				WinCont.modal_open(modal);
			});
		},

		// 情報（アイコンなど）を地図に追加
		poi_add: key => {
			if (Conf.marker[key].file !== undefined) {
				$.get(Conf.marker[key].file).then((csv) => {
					let geojsons = GeoCont.csv2geojson(csv, key);
					let targets = geojsons.map(() => [key]);
					poiset(key, { "geojson": geojsons, "targets": targets });
				});
			} else {
				OvPassCnt.get([key]).then((ovasnswer) => poiset(key, ovasnswer));
			};

			function poiset(key, answer) {
				let geojsons = { geojson: [], targets: [] };
				answer.geojson.forEach((geojson, idx) => {
					let geo = geojson.geometry;
					let cords = geo.coordinates;
					//					let cords = geo.coordinates.length == 1 && geo.coordinates[0][0].length > 1 ? geo.coordinates[0] : ;
					cords = GeoCont.multi2flat(cords, geo.type);
					cords = GeoCont.flat2single(cords, geo.type);
					cords = GeoCont.bboxclip(cords, true);
					if (cords.length > 0) {
						geojson.geometry.type = "Point";
						geojson.geometry.coordinates = cords;
						geojsons.geojson.push(geojson);
						geojsons.targets.push(answer.targets[idx]);
					};
				});
				PoiCont.add(geojsons);
				WinCont.modal_select(key).then((slanswer) => {
					PoiCont.add(slanswer);
					Marker.set(key);
					WinCont.modal_close();
					console.log(`Mapmaker: Add: ${key} end`);
				}); // .catch(() => console.log("poi_add: cancel"));
			};
		},

		// delete poi
		poi_del: (target, osmid) => {
			let poi = PoiCont.get_osmid(osmid);
			if (poi !== undefined) {
				poi.enable = false;
				PoiCont.set(poi);
				Marker.delete(target, osmid);
			};
		},

		qr_add: (osmid) => {
			let marker = Marker.get(osmid);
			if (marker !== undefined) {
				console.log(marker);
//				Marker.qr_add();
			};
		},

		// Show/Hide Custom Panel(mode change)
		custom: (mode) => {
			switch (mode) {
				case true:
					for (let key in Conf.Style) {		// Show control if key is present
						$('#' + key).hide();
						let zoom = Conf.Style[key].zoom == undefined ? 0 : Conf.Style[key].zoom;
						if (zoom <= map.getZoom()) $('#' + key).show();
					};
					$("#make_map").hide();
					["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).show());
					["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].disable());
					$("#search_input").attr('disabled', 'disabled');
					Locate.remove(map);
					Layers.MAP.remove(map);
					if (Layers.BAK.opacity === 0) {		// set background
						$("#mapid").addClass("bg-clear");
					} else {
						$("#mapid").removeClass("bg-clear");
						$("#BAK_color").css('background-color', Layers.BAK.color);
					};
					custom_mode = mode;
					Mapmaker.zoom_view();
					break;
				case false:
					$("#make_map").show();
					["#accordion", "#custom_map", "#save_map", "#clear_map"].forEach(key => $(key).hide());
					["dragging", "zoomControl", "scrollWheelZoom", "touchZoom"].forEach(key => map[key].enable());
					$("#search_input").attr('disabled', false);
					Locate.addTo(map);
					Layers.MAP.addTo(map);
					$("#mapid").removeClass("bg-clear");
					$("#BAK_color").css('background-color', "");
					custom_mode = mode;
					Mapmaker.zoom_view();
					break;
			}
			return custom_mode;
		},

		// Area Selevct(A4)
		select_area: (mode) => {
			let dragging = false;
			switch (mode) {
				case "":
					dragging = true;
				case "A4":
				case "A4_landscape":
					select_mode = mode;
					LayerCont.select(mode, dragging);
					break;
				default:
					return select_mode;
			};
		},

		// Search Address(Japan Only)
		search_address: (e) => {
			getLatLng(e.target.value, (latnng) => {
				map.setZoom(Conf.default.SearchZoom);
				map.panTo(latnng);
			}, (e) => {
				WinCont.modal_open({
					title: glot.get("addressnotfound_title"), message: glot.get("addressnotfound_body"),
					mode: "close", callback_close: () => { WinCont.modal_close() }
				});
			})
		},

		// Update layers(color/lime weight change)
		update: targetkey => {
			if (targetkey == "" || typeof (targetkey) == "undefined") {		// no targetkey then update all layer
				for (let key in Conf.Style) if (Layers[key].geojson) LayerCont.layer_make(key);
			} else {
				if (Layers[targetkey].geojson) LayerCont.layer_make(targetkey);
			};
			console.log("Mapmaker: update... end ");
		},

		// save layers&pois
		save: (type) => {
			LayerCont.save({ type: type, mode: select_mode });
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
					LayerCont.all_clear();
					Marker.all_clear();
					Mapmaker.makemenu();
					PoiCont.all_clear();
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
		make_select: result => {    // 店舗種別リストを作成
			WinCont.select_clear(`${MS}_category`);
			let pois = result.map(data => { return data.category });
			pois = pois.filter((x, i, self) => { return self.indexOf(x) === i });
			pois.map(poi => WinCont.select_add(`${MS}_category`, poi, poi));
		},
		view: function (targets) {  // PoiDataのリスト表示
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
