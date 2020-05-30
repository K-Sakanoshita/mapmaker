/*	Make Walking_Town_Map Licence: MIT */
"use strict";

// Global Variable
var map;
var hash;
var Layer_Base;												// list base layers
var Layer_Data;												// Layer Status,geojson,svglayer
var Icons = {};												// アイコンSVG配列
var LL = {};												// 緯度(latitude)と経度(longitude)
var MMK_Loads = [{ file: "./basemenu.html", icon: "" }];	// filenames(for filter function)

const glot = new Glottologist();
const MinZoomLevel = 14;		// これ未満のズームレベルでは地図は作らない
const ZoomErrMsg = "地図を作るには、もう少しズームしてください。";
const NoSvgMsg = "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。";
const OvGetError = "サーバーからのデータ取得に失敗しました。やり直してください。";
const Mono_Filter = ['grayscale:90%', 'bright:85%', 'contrast:130%', 'sepia:15%'];;
const Download_Filename = 'Walking_Town_Map';
const OvServer = 'https://overpass.kumi.systems/api/interpreter'	// or 'https://overpass-api.de/api/interpreter' or 'https://overpass.nchc.org.tw/api/interpreter'
//const OvServer = 'https://overpass.nchc.org.tw/api/interpreter';
const OvServer_Org = 'https://overpass-api.de/api/interpreter';	// 本家(更新が早い)
const LeafContOpt = { collapsed: true };
const darken_param = 0.5;

const Simplify_Options = {
	14: { tolerance: 0.0001, highQuality: true }, 15: { tolerance: 0.00001, highQuality: true }, 16: { tolerance: 0.000001, highQuality: true },
	17: { tolerance: 0, highQuality: true }, 18: { tolerance: 0, highQuality: true }, 19: { tolerance: 0, highQuality: true },
	20: { tolerance: 0, highQuality: true }, 21: { tolerance: 0, highQuality: true }
};
const Truncate_Options = {
	14: { precision: 5, coordinates: 3 }, 15: { precision: 6, coordinates: 3 }, 16: { precision: 7, coordinates: 3 },
	17: { precision: 8, coordinates: 3 }, 18: { precision: 9, coordinates: 3 }, 19: { precision: 10, coordinates: 3 },
	20: { precision: 11, coordinates: 3 }, 21: { precision: 12, coordinates: 3 }
};

const Sakura1 = "Cherry blossom";
const Sakura2 = "Cerasus itosakura";
const Sakura3 = "Cerasus × yedoensis";
const ExtDatas = { SHL: "./data/mapnavoskdat_hinanbiru.geojson" };

const OverPass = {
	PRK: ['relation["leisure"="park"]', 'way["leisure"="playground"]', 'way["leisure"="park"]', 'way["leisure"="pitch"]'],
	PED: ['way["highway"="pedestrian"]["area"]'],
	PKG: ['way["amenity"="parking"]', 'way["amenity"="bicycle_parking"]'],
	GDN: ['way["leisure"="garden"]', 'way["landuse"="grass"]'],
	RIV: ['relation["waterway"]', 'way["waterway"]', 'way["landuse"="reservoir"]', 'relation["natural"="water"]', 'way["natural"="water"]', 'way["natural"="coastline"]["place"!="island"]'],
	FRT: ['relation["landuse"="forest"]', 'relation["natural"="wood"]', 'way["landuse"="forest"]', 'way["natural"="wood"]', 'way["natural"="scrub"]', 'way["landuse"="farmland"]', 'way["landuse"="allotments"]'],
	RIL: ['way["railway"]'],
	ALY: ['way["highway"="footway"]', 'way["highway"="path"]', 'way["highway"="track"]', 'way["highway"="steps"]'],
	STD: ['way["highway"~"tertiary"]', 'way["highway"~"unclassified"]', 'way["highway"~"residential"]', 'way["highway"="living_street"]', 'way["highway"="pedestrian"][!"area"]', 'way["highway"="service"]'],
	PRI: ['way["highway"~"trunk"]', 'way["highway"~"primary"]', 'way["highway"~"secondary"]'],
	HIW: ['way["highway"~"motorway"]'],
	BLD: ['way["building"!="train_station"]["building"]', 'relation["building"!="train_station"]["building"]'],
	BRR: ['way["barrier"]["barrier"!="kerb"]["barrier"!="ditch"]'],
	STN: ['relation["building"="train_station"]', 'way["building"="train_station"]'],
	SIG: ['node["highway"="traffic_signals"]'],
	CFE: ['node["amenity"="cafe"]'],
	RST: ['node["amenity"="restaurant"]', 'node["shop"="deli"]'],
	FST: ['node["amenity"="fast_food"]', 'node["shop"="confectionery"]'],
	EXT: ['node["emergency"="fire_extinguisher"]'],
	HYD: ['node["emergency"="fire_hydrant"]'],
	BNC: ['node["amenity"="bench"]'],
	AED: ['node["emergency"="defibrillator"]'],
	LIB: ['node["amenity"="library"]', 'way["amenity"="library"]'],
	SKR: ['node["species"="' + Sakura1 + '"]', 'node["species:en"="' + Sakura1 + '"]', 'node["species"="' + Sakura2 + '"]', 'node["species:en"="' + Sakura2 + '"]', 'node["species"="' + Sakura3 + '"]', 'node["species:en"="' + Sakura3 + '"]']
};

const Defaults = {	// 制御情報の保管場所
	PRK: { init: true, zoom: 15, type: "area", name: "各種公園", color: "#e8ffd0", width: 0.3, dashArray: null },
	PED: { init: true, zoom: 15, type: "area", name: "各種広場", color: "#ffffe8", width: 0.3, dashArray: null },
	PKG: { init: true, zoom: 15, type: "area", name: "駐車場", color: "#f0f0f0", width: 0.3, dashArray: null },
	GDN: { init: true, zoom: 16, type: "area", name: "庭・草原", color: "#d8ffb8", width: 0.3, dashArray: null },
	RIV: { init: true, zoom: 15, type: "area", name: "水路・川", color: "#b0d0f8", width: 0.3, dashArray: null },
	FRT: { init: true, zoom: 15, type: "area", name: "森・田畑", color: "#b0f090", width: 0.3, dashArray: null },
	RIL: { init: true, zoom: 13, type: "line", name: "レール類", color: "#909090", width: 1.2, dashArray: "12,4" },
	ALY: { init: true, zoom: 16, type: "line", name: "路地小道", color: "#e8e8e8", width: 0.8, dashArray: "4,2" },
	STD: { init: true, zoom: 14, type: "line", name: "一般道路", color: "#ffffe8", width: 3.0, dashArray: null },
	PRI: { init: true, zoom: 13, type: "line", name: "主要道路", color: "#ffe8d0", width: 4.0, dashArray: null },
	HIW: { init: true, zoom: 13, type: "line", name: "高速道路", color: "#f8d0a0", width: 5.0, dashArray: null },
	BLD: { init: true, zoom: 16, type: "area", name: "建物・家", color: "#e8e8e8", width: 0.5, dashArray: null },
	BRR: { init: true, zoom: 16, type: "line", name: "壁・擁壁", color: "#b0b0b0", width: 0.6, dashArray: null },
	STN: { init: true, zoom: 15, type: "area", name: "駅施設等", color: "#f8d8d8", width: 0.5, dashArray: null },
	SIG: { init: false, zoom: 16, type: "node", name: "信号関連", icon: "./image/signal.svg", size: [18, 34] },
	CFE: { init: false, zoom: 16, type: "node", name: "カフェ等", icon: "./image/cafe.svg", size: [28, 28] },
	RST: { init: false, zoom: 16, type: "node", name: "飲食店等", icon: "./image/restaurant.svg", size: [28, 28] },
	FST: { init: false, zoom: 16, type: "node", name: "ファストフード", icon: "./image/fastfood.svg", size: [28, 28] },
	EXT: { init: false, zoom: 15, type: "node", name: "消火器", icon: "./image/fire_extinguisher.svg", size: [28, 28] },
	HYD: { init: false, zoom: 15, type: "node", name: "消火栓", icon: "./image/fire_hydrant.svg", size: [28, 28] },
	BNC: { init: false, zoom: 15, type: "node", name: "ベンチ", icon: "./image/bench.svg", size: [28, 28] },
	AED: { init: false, zoom: 15, type: "node", name: "AED", icon: "./image/aed.svg", size: [48, 48] },
	LIB: { init: false, zoom: 14, type: "node", name: "図書館", icon: "./image/library.svg", size: [28, 28] },
	SKR: { init: false, zoom: 15, type: "node", name: "木（さくら）", icon: "./image/sakura.svg", size: [28, 28] },
	SHL: { init: false, zoom: 14, type: "node", name: "避難所(大阪市)", icon: "./image/shelter.svg", size: [28, 28] }
};

const LayerCounts = Object.keys(Defaults).length;
const MarkerParams = { icon_x: 18, icon_y: 18, text_size: 18, text_color: "black" };
const credit = {
	text: "© OpenStreetMap contributors",
	size: 20,
	font: "Helvetica,Arial, Roboto, “Droid Sans”, “游ゴシック”, YuGothic,“ヒラギノ角ゴ ProN W3″,“Hiragino Kaku Gothic ProN”, “メイリオ”,Meiryo",
};

// initialize leaflet
$(document).ready(function () {
	console.log("Welcome to Walking Town Map Maker.");
	TownMap.init();

	console.log("initialize leaflet.");
	let osm_mono = L.tileLayer.colorFilter('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '<a href="http://openstreetmap.org">&copy OpenStreetMap contributors</a>', filter: Mono_Filter });
	let osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '<a href="http://openstreetmap.org">&copy OpenStreetMap contributors</a>' });
	let mierune = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 21, attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.", });
	let pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 21, attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>" });
	let ort = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', { maxNativeZoom: 18, maxZoom: 21, attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>" });

	Layer_Base = { 'OpenStreetMap（白黒）': osm_mono, 'OpenStreetMap（標準）': osm, 'MIERUNE(MONO)': mierune, '地理院タイル（基本）': pale, '地理院タイル（写真）': ort };
	//map = L.map('mapid', { center: [38.290, 138.988], zoom: 6, layers: [osm_mono], doubleClickZoom: false });
	map = L.map('mapid', { center: [38.290, 138.988], zoom: 6, doubleClickZoom: false });
	map.zoomControl.setPosition("bottomright");
	let L_Sel = L.control.layers(Layer_Base, null, LeafContOpt).addTo(map);
	hash = new L.Hash(map);
	let lc = L.control.locate({ position: 'bottomright', strings: { title: "現在地を表示" }, locateOptions: { maxZoom: 16 } }).addTo(map);

	var gl = L.mapboxGL({
		attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
		accessToken: 'no-token',
		style: 'https://api.maptiler.com/maps/371812ac-52d8-4ace-a720-a027cec01eac/style.json?key=Eq2IyrHsOEGFU1W1fvd7'
	}).addTo(map);

	console.log("initialize Basemenu.");
	let search = L.control({ position: "topleft" });			// 検索欄追加
	search.onAdd = function (map) {
		this.ele = L.DomUtil.create('div', "search");
		this.ele.id = "search";
		return this.ele;
	};
	search.addTo(map);
	$("#search").html("<span class='search'>住所：<input type='search' id='search_input' class='form-control'></input></span>");
	$("#search_input").on('change', function (e) {
		console.log(e.target.value);
		getLatLng(e.target.value, (latnng) => {
			console.log(latnng);
			map.panTo(latnng);
		}, (e) => {
			$("#AddressNotFound_Modal").modal({ backdrop: "static", keyboard: false });
		})
	});

	let basemenu = L.control({ position: "topleft" });			// 標準メニュー追加
	basemenu.onAdd = function (map) {
		this.ele = L.DomUtil.create('div', "basemenu");
		this.ele.id = "basemenu";
		return this.ele;
	};
	basemenu.addTo(map);
	L.control.scale({ imperial: false, maxWidth: 200 }).addTo(map);
	map.on('zoomend', function (e) {
		Control.viewzoom();
	});

	console.log("initialize frontend.");
	let jqXHRs = [];
	for (let key in MMK_Loads) { jqXHRs.push($.get(MMK_Loads[key].file)) };
	$.when.apply($, jqXHRs).always(function () {
		$("#basemenu").html(arguments[0][0]);																						// メニューHTML読み込み
		let xs = new XMLSerializer();
		for (let i = 0; i < MMK_Loads.length; i++) {
			if (MMK_Loads[i].icon != "") Icons[MMK_Loads[i].icon] = xs.serializeToString(arguments[i][0]);
		};
		Control.makemenu();
		glot.import("./data/glot.json").then(() => { glot.render() });																// translation
	});
});

var Control = (function () {
	return {
		getdate: function () {
			let seldate = $("#Select_Date").val();
			return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
		},
		viewzoom: function () {
			$("#zoomlevel").html(map.getZoom());
		},
		makemenu: function () {
			for (let key in Defaults) {
				if (Defaults[key].init) {			// make menu html
					let copyobj = $("#AAA").clone();
					copyobj.attr('id', key);
					copyobj.find('#AAA_color').attr('id', key + "_color");
					copyobj.find('#AAA_line').attr('id', key + "_line");
					copyobj.find('#AAA_layer').attr('id', key + "_layer");
					copyobj.find('label[for="AAA_layer"]').attr('for', key + "_layer");
					copyobj.find('.custom_label').html(Defaults[key].name);
					copyobj.appendTo($('#custom_map'));
					$("#" + key + "_line").append('<option value="0">無</option>');
					$("#" + key + "_line").append('<option value="' + Defaults[key].width / 2 + '">細</option>');
					$("#" + key + "_line").append('<option value="' + Defaults[key].width * 1 + '" selected>中</option>');
					$("#" + key + "_line").append('<option value="' + Defaults[key].width * 2 + '">太</option>');
				};

				switch (Defaults[key].type) {
					case "line":
					case "area":
						$('#' + key + '_layer').change(function () {																	// 表示変更時のイベント定義
							Layer_Data[key].view = $(this).prop('checked');
							TownMap.update(key);
							return;
						});
						$('#' + key + '_line').change(function () {																		// 太さ変更時のイベント定義
							Layer_Data[key].width = $('#' + key + '_line').val();
							Layer_Data[key].view = true
							$('#' + key + '_layer').prop('checked', true);																// 色変更時はチェックON
							TownMap.update(key);
							return;
						});
						$('#' + key + '_color').simpleColorPicker({
							onChangeColor: function (color) {																			// 色変更時のイベント定義
								$("#" + key + "_color").css('background-color', color);
								$('#' + key + '_layer').prop('checked', true);															// 色変更時はチェックON
								Layer_Data[key].color = color;
								Layer_Data[key].color_dark = chroma(color).darken(darken_param).hex();
								Layer_Data[key].view = true;
								TownMap.update(key);
								return;
							}
						});
						$('#' + key + '_line').val(Defaults[key].width);																// [UI側]線の太さを設定
						$("#" + key + "_color").css('background-color', Defaults[key].color);											// [UI側]ボタンの色を設定
						break;
				}
			};
			$("#AAA").remove();
		}
	}
})();

var TownMap = (function () {

	function MakeCancel() {
		$("#MakeCancel_Modal").modal({ backdrop: "static", keyboard: false });
	};
	function SetGeoJson(key, osmxml) {
		let geojson = osmtogeojson(osmxml, { flatProperties: true });
		geojson.features.forEach(function (val) { delete val.id; }); // delete Unnecessary osmid
		if (geojson.features.length > 0) {
			try {
				let simple_geojson = turf.simplify(geojson, Simplify_Options[map.getZoom()]);
				geojson = turf.truncate(simple_geojson, Truncate_Options[map.getZoom()]);
			} catch (e) {
				console.log("turf.js: error... / no simplify / " + e);
			}
		}
		Layer_Data[key].geojson = geojson;
		Layer_Data[key].view = true;														// view when there is a target
	};

	return {
		init: function () {
			console.log("initialize variable.");
			Layer_Data = {};
			for (let key in Defaults) {
				let color = typeof (Defaults[key].color) == "undefined" ? "" : Defaults[key].color;
				Layer_Data[key] = {
					"color": color,
					"color_dark": color == "" ? "" : chroma(color).darken(darken_param).hex(),
					"width": typeof (Defaults[key].width) == "undefined" ? 0 : Defaults[key].width,
					"view": Defaults[key].init
				};
				if (typeof (Defaults[key].icon) !== "undefined") MMK_Loads.push({ file: Defaults[key].icon, icon: key })
			};
		},

		// アクセスマップを作る
		make: function (query_date) {
			console.log("Make TownMap: Start");
			let ZoomLevel = map.getZoom();					// マップ範囲を探す
			if (ZoomLevel < MinZoomLevel) { MakeCancel(); return false; }
			if (typeof (query_date) == "undefined") query_date = "";
			LL.NW = map.getBounds().getNorthWest();
			LL.SE = map.getBounds().getSouthEast();
			let maparea = '(' + LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng + ');';
			let Progress = 0;
			ProgressBar.show(0);

			let jqXHRs = [];
			for (let key in Defaults) {
				if (Defaults[key].init && Defaults[key].zoom <= ZoomLevel) {
					let query = "";
					for (let ovpass in OverPass[key]) { query += OverPass[key][ovpass] + maparea; }
					let url = OvServer + '?data=[out:json][timeout:30]' + query_date + ';(' + query + ');out body;>;out skel qt;';
					console.log("GET: " + url);
					jqXHRs.push($.get(url, function () {
						ProgressBar.show(Math.ceil(((++Progress + 1) * 100) / LayerCounts));
					}));
				}
			};
			$.when.apply($, jqXHRs).done(function () {
				let i = 0;
				for (let key in Defaults) {
					if (Defaults[key].init && Defaults[key].zoom <= ZoomLevel) {
						if (arguments[i][1] !== "success") { alert(OvGetError); return };
						SetGeoJson(key, arguments[i++][0]);
					}
				}
				TownMap.update();
				ProgressBar.hide();
				TownMap.control('show');
				console.log("Make TownMap: end");
			});
		},
		/* 情報（アイコンなど）を地図に追加 */
		add: function (key) {
			console.log("TownMap: add start..." + key);
			let ZoomLevel = map.getZoom();					// マップ範囲を探す
			if (ZoomLevel < MinZoomLevel) { MakeCancel(); return false; }
			LL.NW = map.getBounds().getNorthWest();
			LL.SE = map.getBounds().getSouthEast();
			let maparea = '(' + LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng + ');';
			ProgressBar.show(0);

			switch (OverPass[key]) {
				case undefined:
					console.log(ExtDatas[key]);
					$.get({ url: ExtDatas[key], dataType: "json" }, function (geojson) {
						let maped_geojson = geojson.features.filter(function (value) {
							let geoll = value.geometry.coordinates;
							if (geoll[0] > LL.NW.lng && geoll[0] < LL.SE.lng && geoll[1] < LL.NW.lat && geoll[1] > LL.SE.lat) return true;
						});
						if (maped_geojson.length > 0) {
							geojson.features = maped_geojson;
							Layer_Data[key].geojson = geojson;
							Layer_Data[key].view = true;														// view when there is a target
							TownMap.update(key);
						}
						ProgressBar.hide();
						TownMap.control('show');
						console.log("Add TownMap: end");
					});
					break;

				default: 																								//use overpass
					let jqXHRs = [], query = "", Progress = 0;
					for (let ovpass in OverPass[key]) { query += OverPass[key][ovpass] + maparea; }
					jqXHRs.push($.get(OvServer + '?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;', function (data) {
						ProgressBar.show(Math.ceil(((++Progress + 1) * 100) / LayerCounts));
					}));
					$.when.apply($, jqXHRs).done(function () {
						if (arguments[1] == "success") {
							SetGeoJson(key, arguments[0]);
							TownMap.update(key);
						};
						ProgressBar.hide();
						TownMap.control('show');
						console.log("Add TownMap: end");
					}).fail(function (jqXHR, statusText, errorThrown) {
						console.log(statusText);
					});
					break;
			}
		},

		control: function (mode) {
			location.replace(hash.formatHash(map));
			switch (mode) {
				case "show":
					for (let key in Defaults) {			// Show control if key is present
						$('#' + key).hide();
						if (Defaults[key].zoom <= map.getZoom()) $('#' + key).show();
					};
					$("#make_map").hide();
					$("#accordion").show();
					$("#custom_map").show();
					$("#save_map").show();
					$("#clear_map").show();
					break;
				case "hide":
					$("#make_map").show();
					$("#accordion").hide();
					$("#custom_map").hide();
					$("#save_map").hide();
					$("#clear_map").hide();
					break
			}
		},

		// Update Access Map(color/lime weight change)
		update: function (targetkey) {
			console.log("TownMap: update... ");
			if (targetkey == "" || typeof (targetkey) == "undefined") {											// no targetkey then update all layer
				for (let key in Defaults) {
					if (Layer_Data[key].svg) map.removeLayer(Layer_Data[key].svg);
					if (Layer_Data[key].view) MakeLayer(key);
				}
			} else {
				if (Layer_Data[targetkey].svg) map.removeLayer(Layer_Data[targetkey].svg);
				if (Layer_Data[targetkey].view) MakeLayer(targetkey);
			}
			console.log("TownMap: update... end ");

		},
		// Try Again
		clear: function () {
			console.log("TownMap: clear... ");
			$('#Clear_Modal').modal('show');
			$("#Clear_Modal_Submit").on("click", function () {
				$("#Clear_Modal_Submit").off('click');
				$('#Clear_Modal').modal('hide');
				TownMap.control('hide');
				for (let key in Defaults) {
					if (Layer_Data[key].svg) {
						if (Defaults[key].type !== "node") {
							map.removeLayer(Layer_Data[key].svg);
						} else {
							Layer_Data[key].svg.forEach(function (icons) { map.removeLayer(icons) });
						}
					};
				};
				TownMap.init();
			});
		}
	}
})();

