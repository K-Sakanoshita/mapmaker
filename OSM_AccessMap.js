/*	まち歩きマップメーカー Licence: MIT */
"use strict";

// Global Variable
var map;
var hash;
var L_Sel;
var BaseLayer;							// 背景地図一覧(地理院地図、OSMなど)
var MakeLayer = {};					// 作成した地図レイヤー
var Icons = {};							// アイコンSVG配列
var LL = {};								// 緯度(latitude)と経度(longitude)

const MinZoomLevel = 14;		// これ未満のズームレベルでは地図は作らない
const ZoomErrMsg		= "地図を作るには、もう少しズームしてください。";
const NoSvgMsg			= "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。";
const OvGetError		=	"サーバーからのデータ取得に失敗しました。やり直してください。";
const Mono_Filter = ['grayscale:90%','bright:85%','contrast:130%','sepia:15%']; ;
const Download_Filename = 'Walking_Town_Map'
const OvServer = 'https://overpass.kumi.systems/api/interpreter'	// or 'https://overpass-api.de/api/interpreter'
//const OvServer = 'https://overpass.nchc.org.tw/api/interpreter'
const OvServer_Org = 'https://overpass-api.de/api/interpreter'	// 本家(更新が早い)
const LeafContOpt = {collapsed: true};

const Sakura1 = "Cherry blossom";
const Sakura2 = "Cerasus itosakura";
const Sakura3 = "Cerasus × yedoensis";
const OverPass ={
	PRK: ['relation["leisure"="park"]',				'way["leisure"="playground"]',	'way["leisure"="park"]'	,					'way["leisure"="pitch"]'],
	GDN: ['way["leisure"="garden"]',					'way["landuse"="grass"]'],
	RIV: ['relation["waterway"]',							'way["waterway"]',							'way["landuse"="reservoir"]',			'way["natural"="water"]',				'way["natural"="coastline"]'],
	FRT: ['relation["landuse"="forest"]',			'relation["natural"="wood"]',		'way["landuse"="forest"]',				'way["natural"="wood"]'	,				'way["landuse"="farmland"]'	,	'way["landuse"="allotments"]'],
	RIL: ['way["railway"]'],
	ALY: ['way["highway"="footway"]',					'way["highway"="path"]',				'way["highway"="track"]',					'way["highway"="steps"]'],
	STD: ['way["highway"~"unclassified"]',		'way["highway"~"residential"]',	'way["highway"="living_street"]',	'way["highway"~"pedestrian"]'	,	'way["highway"="service"]'],
	PRI: ['way["highway"~"primary"]',					'way["highway"~"secondary"]',		'way["highway"~"tertiary"]'],
	HIW: ['way["highway"~"motorway"]',				'way["highway"~"trunk"]'],
	BLD: ['way["building"!="train_station"]["building"]',	'way["man_made"="bridge"]',			'relation["building"!="train_station"]["building"]'],
	STN: ['way["building"="train_station"]',	'relation["building"="train_station"]'],
	SIG: ['node["highway"="traffic_signals"]'],
	CFE: ['node["amenity"="cafe"]'],
	RST: ['node["amenity"="restaurant"]','node["shop"="deli"]'],
	FST: ['node["amenity"="fast_food"]','node["shop"="confectionery"]'],
	EXT: ['node["emergency"="fire_extinguisher"]'],
	HYD: ['node["emergency"="fire_hydrant"]'],
	LIB: ['node["amenity"="library"]','way["amenity"="library"]'],
	SKR: ['node["species"="' + Sakura1 + '"]','node["species:en"="' + Sakura1 + '"]','node["species"="' + Sakura2 + '"]','node["species:en"="' + Sakura2 + '"]','node["species"="' + Sakura3 + '"]','node["species:en"="' + Sakura3 + '"]']
};

const ExtDatas = {
	SHL: "./data/mapnavoskdat_hinanbiru.geojson"
}

var MakeDatas = {						// 制御情報の保管場所
	PRK: {init: "yes"	,zoom: 14, type: "way",		name: "公園・運動場",color:"#ffffdd",width: 0,	dashArray:null},
	GDN: {init: "yes"	,zoom: 14, type: "way",		name: "庭・草原",color:"#b6d7a8",width: 0,	dashArray:null},
	RIV: {init: "yes"	,zoom: 14, type: "way",		name: "水路・川",color:"#6fa8dc",width: 1,	dashArray:null},
	FRT: {init: "yes"	,zoom: 14, type: "way",		name: "森・田畑",color:"#93c47d",width: 0,	dashArray:null},
	RIL: {init: "yes"	,zoom: 12, type: "way",		name: "レール類",color:"#041c31",width: 1,	dashArray:"8,4"},
	ALY: {init: "yes"	,zoom: 16, type: "way",		name: "路地小道",color:"#e8e8e8",width: 0.8,	dashArray:"4,3"},
	STD: {init: "yes"	,zoom: 15, type: "way",		name: "一般道路",color:"#ffffff",width: 2,	dashArray:null},
	PRI: {init: "yes"	,zoom: 12, type: "way",		name: "主要道路",color:"#cccccc",width: 4,	dashArray:null},
	HIW: {init: "yes"	,zoom: 13, type: "way",		name: "高速道路",color:"#f9cb9c",width: 5,	dashArray:null},
	BLD: {init: "yes"	,zoom: 15, type: "way",		name: "建物・家",color:"#e8e8e8",width: 0,	dashArray:null},
	STN: {init: "yes"	,zoom: 15, type: "way",		name: "駅施設等",color:"#fad4d4",width: 0,	dashArray:null},
	SIG: {init: "no"	,zoom: 14, type: "node",	name: "信号関連",icon: "./image/signal.svg",	size: [18,34]},
	CFE: {init: "no"	,zoom: 14, type: "node",	name: "カフェ等",icon: "./image/cafe.svg",		size: [28,28]},
	RST: {init: "no"	,zoom: 14, type: "node",	name: "飲食店等"		,icon: "./image/restaurant.svg",	size: [28,28]},
	FST: {init: "no"	,zoom: 14, type: "node",	name: "ファストフード"	,icon: "./image/fastfood.svg",	size: [28,28]},
	EXT: {init: "no"	,zoom: 14, type: "node",	name: "消火器"			,icon: "./image/fire_extinguisher.svg",	size: [28,28]},
	HYD: {init: "no"	,zoom: 14, type: "node",	name: "消火栓"			,icon: "./image/fire_hydrant.svg",	size: [28,28]},
	SKR: {init: "no"	,zoom: 14, type: "node",	name: "木（さくら）"			,icon: "./image/sakura.svg",	size: [28,28]},
	LIB: {init: "no"	,zoom: 14, type: "node",	name: "図書館"			,icon: "./image/library.svg",	size: [28,28]},
	SHL: {init: "no"	,zoom: 14, type: "node",	name: "避難所(大阪市)"	,icon: "./image/shelter.svg",	size: [28,28]}
};

var MMK_Loads = [{file: "./basemenu.html",icon: ""},
	{file: MakeDatas.SIG.icon,icon: "SIG"},{file: MakeDatas.CFE.icon,icon: "CFE"},
	{file: MakeDatas.RST.icon,icon: "RST"},{file: MakeDatas.FST.icon,icon: "FST"},
	{file: MakeDatas.EXT.icon,icon: "EXT"},{file: MakeDatas.HYD.icon,icon: "HYD"},
	{file: MakeDatas.SHL.icon,icon: "SHL"},{file: MakeDatas.SKR.icon,icon: "SKR"},
	{file: MakeDatas.LIB.icon,icon: "LIB"}
];

const MakeDatasCount = Object.keys(MakeDatas).length;
const MarkerParams = {icon_x: 18, icon_y: 18, text_size: 18, text_color: "black"};
const credit = {
	text : "© OpenStreetMap contributors",
	size : 20,
	font : "Helvetica,Arial, Roboto, “Droid Sans”, “游ゴシック”, YuGothic,“ヒラギノ角ゴ ProN W3″,“Hiragino Kaku Gothic ProN”, “メイリオ”,Meiryo",
};

// initialize leaflet
$(document).ready(function() {
	console.log("Welcome to Walking Town Map Maker.");
	console.log("initialize leaflet.");

	let osm_mono = L.tileLayer.colorFilter(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxNativeZoom: 19,	maxZoom: 21,	attribution: '<a href="http://openstreetmap.org">&copy OpenStreetMap contributors</a>',filter: Mono_Filter	});
	let osm = L.tileLayer(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxNativeZoom: 19,maxZoom: 21,	attribution: '<a href="http://openstreetmap.org">&copy OpenStreetMap contributors</a>'	});
	let mierune = L.tileLayer(	'https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',{	maxZoom: 19,	attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.",	});
	let pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {	minZoom: 2, maxZoom: 18, 	attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});
	let ort = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {	minZoom: 5, maxZoom: 18, 	attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});

	BaseLayer = { 'OpenStreetMap（白黒）': osm_mono,'OpenStreetMap（標準）': osm,'MIERUNE(MONO)': mierune,'地理院タイル（基本）': pale,'地理院タイル（写真）': ort };
	map = L.map('mapid', {center: [38.290, 138.988], zoom: 6,layers: [osm_mono],doubleClickZoom: false});
	map.zoomControl.setPosition("bottomright");
	L_Sel = L.control.layers(BaseLayer, null, LeafContOpt).addTo(map);
	hash = new L.Hash(map);
	let lc = L.control.locate({	position: 'bottomright',	strings: { title: "現在地を表示" },locateOptions: { maxZoom: 16 }}).addTo(map);

	console.log("initialize Basemenu.");

	let basemenu = L.control({ position: "topleft" });			// 標準メニュー追加
	basemenu.onAdd = function (map) {
		this.ele = L.DomUtil.create('div', "basemenu");
		this.ele.id = "basemenu";
		return this.ele;
	};
	basemenu.addTo(map);
	L.control.scale({imperial: false,maxWidth: 200}).addTo(map);

	console.log("initialize frontend.");																							// initialize frontend
	let jqXHRs = [];
	for (let key in MMK_Loads) {
		jqXHRs.push($.get(MMK_Loads[key].file));
	};
	$.when.apply($, jqXHRs).always(function(){
		$("#basemenu").html(arguments[0][0]);																							// メニューHTML読み込み
		let key,xs = new XMLSerializer();
		for (let i = 0; i < MMK_Loads.length; i++){
			if (MMK_Loads[i].icon != "")	Icons[MMK_Loads[i].icon] = xs.serializeToString(arguments[i][0]);
		};

		for (let key in MakeDatas) {
			switch (MakeDatas[key].type){
			case "way":
				$('#' + key + '_layer').change(function(){																		// 太さ変更時のイベント定義
					var r = $(this).prop('checked');
			 		console.log(key + ":" + r);
					if (r){
						MakeLayer[key].addTo(map);
					}else{
						map.removeLayer(MakeLayer[key]);
					}
					return;
				});
				$('#' + key + '_line').change(function(){																		// 太さ変更時のイベント定義
					MakeDatas[key].width = $('#' + key + '_line').val();
					$('#' + key + '_layer').prop('checked',true);																// 色変更時はチェックON
					UpdateAccessMap();
					return;
				});
				$('#' + key + '_color').simpleColorPicker({onChangeColor: function(color){		// 色変更時のイベント定義
					set_btncolor(color,key,true);
					$('#' + key + '_layer').prop('checked',true);																// 色変更時はチェックON
					UpdateAccessMap();
					return;
				}});

				$('#' + key + '_line').val(MakeDatas[key].width);														// [UI側]線の太さを設定
				set_btncolor(MakeDatas[key].color,key,false);																// [UI側]ボタンの色を設定
				console.log( key + ":" + MakeDatas[key].type + "(set event,set UI)");
				break;

			default:
				console.log(key + ":" + MakeDatas[key].type + "(skip)");
				break;
			}
		}
	});
});

// アクセスマップを作る
function makeWalkingTownMap(){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}
	LL.NW = map.getBounds().getNorthWest();
	LL.SE = map.getBounds().getSouthEast();
	let maparea = '(' + LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng + ');';
	let nowDT = new Date();
	let MakeDatasProgress = 0;
	$('#Progress_Bar').css('width',"0%");
	$('#Progress_Modal').modal({backdrop: "static",keyboard: false});
	console.log("makeWalkingTownMap: Start(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds() + ")");

	let jqXHRs = [];
	for (let key in MakeDatas) {
		if (MakeDatas[key].init == "yes" && MakeDatas[key].zoom <= ZoomLevel){
			let query = "";
			for (let ovpass in OverPass[key]){ query += OverPass[key][ovpass] + maparea; }
				jqXHRs.push($.get(OvServer + '?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',function(data){
				$('#Progress_Bar').css('width',Math.ceil(((++MakeDatasProgress+1)*100)/MakeDatasCount) + "%");
			}));
		}
	};
	$.when.apply($, jqXHRs).done(function(){
		let i = 0;
		for (let key in MakeDatas) {
			if (MakeDatas[key].init == "yes" && MakeDatas[key].zoom <= ZoomLevel){
				if (arguments[i][1] == "success"){
					MakeDatas[key].geojson = osmtogeojson(arguments[i++][0]);
				} else {
					alert(OvGetError);
				};
			}
		}
		UpdateAccessMap();
		$('#Progress_Modal').modal('hide');
		$("#make_map").hide();
		for (let key in MakeDatas) {	// Show control if key is present
			if (MakeLayer[key]){
				$('#'+key).show();
			}else{
				$('#'+key).hide();
			}
		};
		$("#custom_map").show();
		$("#save_map").show();
		$("#clear_map").show();
		nowDT = new Date();
		console.log("makeWalkingTownMap: end(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds()+ ")");
	}).fail(function(jqXHR, statusText, errorThrown){
			console.log(statusText);
	});
};

/* 情報（アイコンなど）を地図に追加 */
function AddWalkingTownMap(key){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}
	LL.NW = map.getBounds().getNorthWest();
	LL.SE = map.getBounds().getSouthEast();
	let maparea = '(' + LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng + ');';
	let nowDT = new Date();
	$('#Progress_Bar').css('width',"0%");
	$('#Progress_Modal').modal({backdrop: "static",keyboard: false});
	console.log("makeWalkingTownMap: Start(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds() + ")");

	$('#Progress_Modal').on('shown.bs.modal', function (event) {
		location.replace(hash.formatHash(map));
		switch (OverPass[key]) {
			case undefined:
				$.get({url: ExtDatas[key],dataType: "json"},function(geojson){
					let maped_geojson = geojson.features.filter( function(value) {
						let geoll = value.geometry.coordinates;
 						if (geoll[0] > LL.NW.lng && geoll[0] < LL.SE.lng && geoll[1] < LL.NW.lat && geoll[1] > LL.SE.lat) return true;
					});
					if (maped_geojson.length > 0){
						geojson.features = maped_geojson;
						MakeDatas[key].geojson = geojson;
						UpdateAccessMap();
					}
					$('#Progress_Bar').css('width',"100%");
					$('#Progress_Modal').off();
					$('#Progress_Modal').modal('hide');
					$("#make_map").hide();
					$("#custom_map").show();
					$("#save_map").show();
					$("#clear_map").show();
					nowDT = new Date();
					console.log("makeWalkingTownMap: end(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds()+ ")");
				});
				break;

			default:	'use overpass'
				let jqXHRs = [],query = "",MakeDatasProgress = 0;
				for (let ovpass in OverPass[key]){ query += OverPass[key][ovpass] + maparea; }
				jqXHRs.push($.get(OvServer + '?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',function(data){
					$('#Progress_Bar').css('width',Math.ceil(((++MakeDatasProgress+1)*100)/MakeDatasCount) + "%");
				}));
				$.when.apply($, jqXHRs).done(function(){
					if (arguments[1] == "success"){
						MakeDatas[key].geojson = osmtogeojson(arguments[0]);
						UpdateAccessMap();
						$('#Progress_Bar').css('width',"100%");
						$('#Progress_Modal').modal('hide');
						$("#make_map").hide();
						$("#custom_map").show();
						$("#save_map").show();
						$("#clear_map").show();
						nowDT = new Date();
						console.log("makeWalkingTownMap: end(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds()+ ")");
					};
				}).fail(function(jqXHR, statusText, errorThrown){
						console.log(statusText);
				});
				break;
		}
	});
};

// Update Access Map(color/lime weight change)
function UpdateAccessMap(){
	for (let key in MakeDatas) {
		if (MakeDatas[key].geojson) makeSVGlayer(key);
	}
	if (L_Sel !== null){ L_Sel.remove(map) }																						// Leafletコントロールパネルがあれば削除
	L_Sel = L.control.layers(BaseLayer,null,LeafContOpt);
	L_Sel.addTo(map);
}

// Try Again
function clearWalkingTownMap(){
	$('#Clear_Modal').modal('show');
	$("#Clear_Modal_Submit").click(function(){
		$('#Clear_Modal').modal('hide');
		$("#make_map").show();
		$("#custom_map").hide();
		$("#save_map").hide();
		$("#clear_map").hide();
		for (let key in MakeDatas) {
			switch (MakeDatas[key].type) {
				case "way":
					if (MakeLayer[key]) map.removeLayer(MakeLayer[key]);	// レイヤーがあれば削除
					break;
				case "node":
					if (MakeLayer[key]){
						MakeLayer[key].forEach(function (icons){
							map.removeLayer(icons);	// レイヤーがあれば削除
						});
					}
					break;
			}
		};

		if (L_Sel !== null){ 						 																						// Leafletコントロールパネルがあれば削除
			L_Sel.remove(map);
			L_Sel = L.control.layers(BaseLayer,null,LeafContOpt);
			L_Sel.addTo(map);
		 };
	});
}
