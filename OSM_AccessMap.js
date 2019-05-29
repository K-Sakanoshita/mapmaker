/*	まち歩きマップメーカー Licence: MIT */
"use strict";

// Global Variable
var map;
var L_Sel;
var BaseLayer;							// 背景地図一覧(地理院地図、OSMなど)
var MakeLayer = {};					// 作成した地図レイヤー
var checkd = {};						// レイヤーのチェックボックス状態の保管
var Icons = {};							// アイコンSVG配列

const MinZoomLevel = 12;		// これ未満のズームレベルでは地図は作らない
const ZoomErrMsg		= "地図を作るには、もう少しズームしてください。";
const NoSvgMsg			= "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。";
const OvGetError		=	"サーバーからのデータ取得に失敗しました。やり直してください。";
const Mono_Filter = ['grayscale:90%','bright:85%','contrast:130%','sepia:15%']; ; 
const Download_Filename = 'Walking_Town_Map'
const OvServer = 'https://overpass.kumi.systems/api/interpreter'	// or 'https://overpass-api.de/api/interpreter'
const OvServer_Org = 'https://overpass-api.de/api/interpreter'	// 本家(更新が早い)
const LeafContOpt = {collapsed: false};

const Signal_Scale = 3;
const Signal_ofX = -16;
const Signal_ofY = -8;

const credit = {
	text : "Map data © OpenStreetMap contributors",
	size : 24,
	font : "Helvetica,Arial, Roboto, “Droid Sans”, “游ゴシック”, YuGothic,“ヒラギノ角ゴ ProN W3″,“Hiragino Kaku Gothic ProN”, “メイリオ”,Meiryo",
};

// initialize leaflet
$(document).ready(function() {
	console.log("Welcome to Walking Town Map Maker.");
	console.log("initialize leaflet.");

	let osm_mono = L.tileLayer.colorFilter(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxZoom: 19,	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',filter: Mono_Filter	});
	let osm = L.tileLayer(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxZoom: 19,	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>'	});
	let mierune = L.tileLayer(	'https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',{	maxZoom: 19,	attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.",	});
	let pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {	minZoom: 2, maxZoom: 18, 	attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});
	let ort = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {	minZoom: 5, maxZoom: 18, 	attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});

	BaseLayer = { 'OpenStreetMap（白黒）': osm_mono,'OpenStreetMap（標準）': osm,'MIERUNE(MONO)': mierune,'地理院タイル（基本）': pale,'地理院タイル（写真）': ort };
	map = L.map('mapid', {center: [38.290, 138.988], zoom: 6,layers: [ort]});
	map.zoomControl.setPosition("bottomright");
	// L_Sel = L.control.layers(BaseLayer, null, LeafContOpt).addTo(map);
});

