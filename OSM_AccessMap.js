/*	まち歩きマップメーカー Licence: MIT */
"use strict";

// Global Variable
var map;
var L_Sel;
var BaseLayer;							// 背景地図一覧(地理院地図、OSMなど)
var MakeLayer = {};					// 作成した地図レイヤー
var checkd = {};						// レイヤーのチェックボックス状態の保管
var CoffeeCup;							// CoffeeCupのSVG

const MinZoomLevel = 15;		// これ以下のズームレベルでは地図は作らない
const ZoomErrMsg		= "地図を作るには、もう少しズームしてください。";
const NoSvgMsg			= "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。";
const OvGetError		=	"サーバーからのデータ取得に失敗しました。やり直してください。";
const Mono_Filter = ['grayscale:90%','bright:85%','contrast:130%','sepia:15%']; ; 
const Download_Filename = 'Walking_Town_Map'
const OvServer = 'https://overpass.kumi.systems/api/interpreter'	// or 'https://overpass-api.de/api/interpreter'
const OvServer_Org = 'https://overpass-api.de/api/interpreter'	// 本家(更新が早い)
const Htmls = ["basemenu.html","./image/CoffeeCup.svg"];
const LeafContOpt = {collapsed: false};

const OverPass ={
	GDN: ['way["leisure"="garden"]',				'relation["leisure"="park"]',		'way["leisure"="playground"]',			'way["leisure"="park"]'	,			'way["leisure"="pitch"]',			'way["landuse"="grass"]'],
	RIV: ['relation["waterway"]',						'way["waterway"]',							'way["landuse"="reservoir"]',				'way["natural"="water"]',			'way["natural"="coastline"]'],
	FRT: ['relation["landuse"="forest"]',		'relation["natural"="wood"]',		'way["landuse"="forest"]',					'way["natural"="wood"]'	,			'way["landuse"="farmland"]'	,	'way["landuse"="allotments"]'],
	BLD: ['way["building"]',								'way["man_made"="bridge"]',			'relation["building"]'],
	RIL: ['way["railway"]',									'way["building"="train_station"]'],
	PRI: ['way["highway"~"motorway"]',			'way["highway"~"trunk"]',				'way["highway"~"primary"]',					'way["highway"~"secondary"]',	'way["highway"~"tertiary"]'],
	STD: ['way["highway"~"unclassified"]',	'way["highway"~"residential"]',	'way["highway"="living_street"]'],
	COM: ['way["highway"~"pedestrian"]'	,		'way["highway"="service"]'],
	ALY: ['way["highway"="footway"]',				'way["highway"="path"]',				'way["highway"="track"]',						'way["highway"="steps"]'],
	SIG: ['node["highway"="traffic_signals"]'],
	CFE: ['node["amenity"="cafe"]','node["amenity"="restaurant"]','node["amenity"="fast_food"]']
};

var MakeDatas = {						// 制御情報の保管場所
	GDN: {init: "yes", type: "way",	name: "公園・庭",color:"#C8FACC",width: 0,	dashArray:null},
	RIV: {init: "yes", type: "way",	name: "水路・川",color:"#66AAFF",width: 1,	dashArray:null},
	FRT: {init: "yes", type: "way",	name: "森・田畑",color:"#ADD19E",width: 0,	dashArray:null},
	BLD: {init: "yes", type: "way",	name: "建物・家",color:"#EEEEEE",width: 0,	dashArray:null},
	RIL: {init: "yes", type: "way",	name: "レール類",color:"#404040",width: 1,	dashArray:null},
	PRI: {init: "yes", type: "way",	name: "主要道路",color:"#FF7777",width: 4,	dashArray:null},
	STD: {init: "yes", type: "way",	name: "一般道路",color:"#A0A0A0",width: 2,	dashArray:null},
	COM: {init: "yes", type: "way",	name: "生活道路",color:"#C0C0C0",width: 1,	dashArray:null},
	ALY: {init: "yes", type: "way",	name: "路地小道",color:"#F6B26B",width: 1,	dashArray:"10,2"},
	SIG: {init: "yes", type: "node",	name: "信号関連",icon: "./image/signal.svg",size: [18,34]},
	CFE: {init: "no" , type: "node",	name: "カフェ等",icon: "./image/CoffeeCup.svg",size: [28,28]}
};
const MakeDatasCount = Object.keys(MakeDatas).length;

const Signal_Icon = ''
	+ '<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 8 3" width="5" height="2">'
	+ '	<g name="signal" transform="scale(0.5,0.5)">'
	+ '		<path style="fill:#666666" d="M 8.2,3.6 H 1.8 C 0.8,3.6 0,2.8 0,1.8 v 0 C 0,0.8 0.8,0 1.8,0 h 6.4 c 1,0 1.8,0.8 1.8,1.8 v 0 c 0,1 -0.8,1.8 -1.8,1.8 z"/>'
	+ '		<g>'
	+ '			<circle style="fill:#eeeeee" cx="1.9" cy="1.8" r="1"/>'
	+ '			<circle style="fill:#eeeeef" cx="5" cy="1.8" r="1"/>'
	+ '			<circle style="fill:#eeeeef" cx="8.1000004" cy="1.8" r="1"/>'
	+ '		</g>'
	+ '</g>'
	+ '</svg>';

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

	let osm_mono = L.tileLayer.colorFilter(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxZoom: 19,
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',filter: Mono_Filter	});

	let osm = L.tileLayer(	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{	maxZoom: 19,
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>'	});

	let mierune = L.tileLayer(	'https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',{	maxZoom: 19,
		attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.",	});

	let pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {	minZoom: 2, maxZoom: 18, 
		attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});

	let ort = L.tileLayer('http://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {	minZoom: 5, maxZoom: 18, 
		attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"	});

	BaseLayer = { 'OpenStreetMap（白黒）': osm_mono,'OpenStreetMap（標準）': osm,'MIERUNE(MONO)': mierune,'地理院タイル（基本）': pale,'地理院タイル（写真）': ort };
	map = L.map('mapid', {center: [38.290, 138.988], zoom: 6,layers: [osm_mono]});
	map.zoomControl.setPosition("bottomright");
	L_Sel = L.control.layers(BaseLayer, null, LeafContOpt).addTo(map);
	let hash = new L.Hash(map);
	let lc = L.control.locate({	position: 'bottomright',	strings: { title: "現在地を表示" },locateOptions: { maxZoom: 16 }}).addTo(map);

	let basemenu = L.control({ position: "topleft" });			// 標準メニュー追加
	basemenu.onAdd = function (map) {
		this.ele = L.DomUtil.create('div', "basemenu");
		this.ele.id = "basemenu";
		return this.ele;
	};
	basemenu.addTo(map);
	L.control.scale({imperial: false,maxWidth: 200}).addTo(map);

	let jqXHRs = [];
	for (let file in Htmls) {
		jqXHRs.push($.get(Htmls[file]));
	};
	$.when.apply($, jqXHRs).done(function(){
		$("#basemenu").html(arguments[0][0]);																							// メニューHTML読み込み
		let xs = new XMLSerializer();
		CoffeeCup = xs.serializeToString(arguments[1][0]);																// アイコン読み込み

		console.log("initialize frontend.");																							// initialize frontend
		for (let key in MakeDatas) {
			switch (MakeDatas[key].type){
			case "way":
				$('#' + key + '_line').change(function(){																		// 太さ変更時のイベント定義
					MakeDatas[key].width = $('#' + key + '_line').val();
					UpdateAccessMap();
					return;
				});
				$('#'+ key + '_color').simpleColorPicker({onChangeColor: function(color){		// 色変更時のイベント定義
					set_btncolor(color,key,true);
					UpdateAccessMap();
					return;
				}});
				$('#'+ key + '_line').val(MakeDatas[key].width);															// [UI側]線の太さを設定
				set_btncolor(MakeDatas[key].color,key,false);																// [UI側]ボタンの色を設定
				console.log( key + ":" + MakeDatas[key].type + "(set event,set UI)");
				break;
			
			default:
				console.log(key + ":" + MakeDatas[key].type + "(skip)");
				break;
			}
		}

		console.log("set overlay add/remove event.");																			// add event(overlay add/remove) learn checkbox
		checkd["STOP"] = false;
		map.on('overlayadd overlayremove', function(e){
			if(checkd["STOP"] === false){
				checkd[e.name] = e.type
				console.log(e.name + ":" + e.type);
			}
		});
	});
});

// アクセスマップを作る
function makeWalkingTownMap(){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}
	let NorthWest = map.getBounds().getNorthWest();
	let SouthEast = map.getBounds().getSouthEast();
	let maparea = '(' + SouthEast.lat + ',' + NorthWest.lng + ',' + NorthWest.lat + ',' + SouthEast.lng + ');';
	let nowDT = new Date();
	let MakeDatasProgress = 0;
	$('#Progress_Bar').css('width',"0%");

	$('#Progress_Modal').modal({backdrop: "static",keyboard: false});
	console.log("makeWalkingTownMap: Start(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds() + ")");

	let jqXHRs = [];
	for (let key in OverPass) {
		if (MakeDatas[key].init == "yes"){
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
			if (MakeDatas[key].init == "yes"){
				if (arguments[i][1] == "success"){
					MakeDatas[key].geojson = osmtogeojson(arguments[i][0]);
				} else {
					alert(OvGetError);
				};
			}
			i++;
		}
		UpdateAccessMap();
		$(".leaflet-control-layers-overlays label input:checkbox:not(:checked)").trigger('click');
		$('#Progress_Modal').modal('hide');
		$("#make_map").hide();
		$("#custom_map").show();
		$("#save_map").show();
		$("#clear_map").show();
		nowDT = new Date();
		console.log("makeWalkingTownMap: end(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds()+ ")");
	}).fail(function(jqXHR, statusText, errorThrown){
			console.log(statusText);
	});
};

function AddWalkingTownMap(name){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}
	let NorthWest = map.getBounds().getNorthWest();
	let SouthEast = map.getBounds().getSouthEast();
	let maparea = '(' + SouthEast.lat + ',' + NorthWest.lng + ',' + NorthWest.lat + ',' + SouthEast.lng + ');';
	let nowDT = new Date();
	let MakeDatasProgress = 0;
	$('#Progress_Bar').css('width',"0%");

	$('#Progress_Modal').modal({backdrop: "static",keyboard: false});
	console.log("makeWalkingTownMap: Start(" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds() + ")");

	let jqXHRs = [];
	let query = "";
	for (let ovpass in OverPass[name]){ query += OverPass[name][ovpass] + maparea; }
	jqXHRs.push($.get(OvServer_Org + '?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',function(data){
		$('#Progress_Bar').css('width',Math.ceil(((++MakeDatasProgress+1)*100)/MakeDatasCount) + "%");
	}));

	$.when.apply($, jqXHRs).done(function(){
		if (arguments[1] == "success"){
			MakeDatas[name].geojson = osmtogeojson(arguments[0]);
			UpdateAccessMap();
			$(".leaflet-control-layers-overlays label input:checkbox:not(:checked)").trigger('click');
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
};

// Update Access Map(color/lime weight change)
function UpdateAccessMap(){
	for (let key in MakeDatas) {
		if (MakeDatas[key].geojson) makeSVGlayer(MakeDatas[key]);
	}
	if (L_Sel !== null){ L_Sel.remove(map) }																						// Leafletコントロールパネルがあれば削除
	L_Sel = L.control.layers(BaseLayer,MakeLayer,LeafContOpt);
	L_Sel.addTo(map);
	let checks = $(".leaflet-control-layers-overlays label input:checkbox");
	for(let i = 0; i < checks.length;i++){
		let key = $("+span",$(checks[i]))[0].innerText.trim();
		if(checkd[key] === "overlayremove"){
			console.log(key + "をけさんとね");
		}
	}
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
			MakeLayer[MakeDatas[key].name].remove(map);
		};
		if (L_Sel !== null){ 						 																						// Leafletコントロールパネルがあれば削除
			L_Sel.remove(map);
			L_Sel = L.control.layers(BaseLayer,null,LeafContOpt);
			L_Sel.addTo(map);
		 };
	});
}

// make leaflet SVG Layer
// MakeData内 -> name:コントロール名 / color:SVG色 / width:SVG Line Weight / dashArray:破線
function makeSVGlayer(data){
	let param = {};
	let svglayer;
	if (MakeLayer[data.name] !== undefined){		// 既に存在するレイヤーは一旦削除する
		checkd["STOP"] = true;
		MakeLayer[data.name].remove(map);
		checkd["STOP"] = false;
	}

	switch (data.type){
	case "way":
		param = {
			style: function(feature){
				 return {color: data.color,weight: data.width * (map.getZoom() / 12),fillOpacity: 1.0,dashArray: data.dashArray} },
			filter: function (feature, layer) {
				if (feature.properties) {	return feature.properties.underConstruction !== undefined ? !feature.properties.underConstruction : true;	}
				return false;
			}
		};
		svglayer = L.geoJSON(data.geojson,param);					// geojsonからSVGレイヤーを作成
		svglayer.addTo(map);
		break;

	case "node":
		let smallIcon = new L.Icon({	iconUrl:	data.icon,	iconSize:	data.size	});
		param =	{	pointToLayer: function(feature, latlng) {	return L.marker(latlng, { icon: smallIcon });}	}
		svglayer = L.geoJSON(data.geojson,param);					// geojsonからSVGレイヤーを作成
		svglayer.addTo(map);
		for (let key in svglayer["_layers"]){
			svglayer["_layers"][key].bindPopup("<input type='button' value='アイコンを削除' onclick='DeleteMarker("+ key + ");'/>");
		};
		break;

	default:
		console.log("makeSVGlayer: mode error -> " + mode);
		break;
	}
	MakeLayer[data.name] = svglayer;
}

function DeleteMarker(key){
	map.removeLayer(map["_layers"][key]);
}

function saveImage(type) {
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

	let svg = $("svg");
	let width = svg.width();
	let height = svg.height();
	let vbx = svg.attr("viewBox").split(" ");
	let marker = $("div.leaflet-marker-pane").children();
	svg.AddIcons(marker);

	let options = {	vbx: vbx,	width: width,	height: height,	stb: svg.attr("style")};
	svg.attr("style","");

	switch (type){
		case 'png':
			svg.height(height - parseInt(vbx[1]) + 100);
			svg.width(width - parseInt(vbx[0]));
			savePNG(svg, options);
			break;
		case 'svg':
			saveSVG(svg, options);
			break;
	}
}

function saveSVG(svg, options){
	let downloadSVG = svg.clone().attr('id', 'download').appendTo('body');
	let viewBoxAttr = svg[0].attributes.viewBox.value;
	let viewBoxArray =  viewBoxAttr.split(' ');
	viewBoxArray[viewBoxArray.length - 1] = Number(viewBoxArray[viewBoxArray.length - 1]) + credit.size + 5;
	downloadSVG[0].attributes.viewBox.value = viewBoxArray.join(' ');
	const viewBox = downloadSVG[0].viewBox;
	const text_x = viewBox.baseVal.x + viewBox.baseVal.width;
	const text_y = viewBox.baseVal.height - Math.abs(viewBox.baseVal.y) - 5;
	
	const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	textElement.setAttributeNS(null, 'x', text_x);
	textElement.setAttributeNS(null, 'y', text_y);
	textElement.setAttributeNS(null, 'text-anchor', 'end');
	textElement.setAttributeNS(null, 'font-size', credit.size);
	textElement.setAttributeNS(null, 'font-family', credit.font);
	textElement.textContent = credit.text;

	downloadSVG.height(options.height - Number(options.vbx[1]));
	downloadSVG.width(options.width - Number(options.vbx[0]));
	downloadSVG[0].appendChild(textElement);

	// SVG convert Text Data
	let data = new XMLSerializer().serializeToString(downloadSVG[0])
	svg.attr("style", options.stb);
	svg.find("[name=signal]").remove();
	svg.find("[name=CoffeeCup]").remove();

	let dataURI = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
	let blob = dataURItoBlob(dataURI)
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a");
	a.setAttribute("type", "hidden")
	a.setAttribute("id", "download-link")
	a.download = Download_Filename + '.svg';
	a.href = url;
	$('body').append(a);
	a.click();
	setTimeout(function(){
		URL.revokeObjectURL(url);
		$("#download").remove();
		downloadSVG.remove();
	}, Math.max(3000, dataURI.length / 512));
}

function savePNG(svg, options){
	$("body").append("<canvas id='download' class='hidden' width=" + options.width + " height=" + (options.height + 45) +"></canvas>");
	var canvas = $("#download")[0];
	var ctx = canvas.getContext("2d");
	var data = new XMLSerializer().serializeToString(svg[0]);
	svg.attr("style", options.stb);
	svg.find("[name=signal]").remove();
	svg.find("[name=CoffeeCup]").remove();
	var imgsrc = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
	var image = new Image();

	image.onload = function(){
		ctx.drawImage(image, 0, 0);
		ctx.font = credit.size + "px " + credit.font;
		ctx.fillStyle = "black";
		ctx.textAlign = "right";
		ctx.fillText(credit.text, options.width, options.height + credit.size, options.width);

		let dataURI = canvas.toDataURL("image/png");
		let blob = dataURItoBlob(dataURI)
		let url = URL.createObjectURL(blob)
		let a = document.createElement("a");
		a.setAttribute("type", "hidden")
		a.setAttribute("id", "download-link")
		a.download = Download_Filename + '.png';
		a.href = url;
		$('body').append(a);
		a.click();
		setTimeout(function(){
			URL.revokeObjectURL(url);
			$("#download").remove();
			$("#download-link").remove();
		}, Math.max(3000, dataURI.length / 512 ));
	}
	image.src = imgsrc;
}

/* Library & Subroutine */

// frontend: color set/change
function set_btncolor(color,key,chgWay){
	let rgbcolor = new RGBColor(color);
	$("#" + key + "_color").css('background-color',color);
	if(rgbcolor.ok){
		if(chgWay){	MakeDatas[key].color = color; }		// set Way color
		rgbcolor.r = (255 - rgbcolor.r);							// set button color
		rgbcolor.g = (255 - rgbcolor.g);
		rgbcolor.b = (255 - rgbcolor.b);
		$("#" + key + "_color").css("color",rgbcolor.toHex());
	}
}

$.fn.extend({
	// MakerをSVGに追加
	// 理由：leafletがアイコンをIMG扱いするため
	AddIcons : function(marker){
		var svg = this.filter('svg') || this.find('svg');
		let parser = new DOMParser();
		let svgDoc;
		for(let i = 0; i < marker.length; i++) {
			switch (marker.eq(i).attr('src')){
			case Htmls[1]:
				svgDoc = parser.parseFromString(CoffeeCup, "text/xml");
				break;
			default:
				svgDoc = parser.parseFromString(Signal_Icon, "text/xml");
				break;
			}
			let signal = $(svgDoc.getElementsByTagName("g")[0]);
			let sigstl = marker.eq(i).css("transform").slice(7,-1).split(",")	// transformのstyleから配列でXとY座標を取得(4と5)
			signal.attr("transform",
				"matrix(1,0,0,1," + (Number(sigstl[4]) + Signal_ofX) + "," + (Number(sigstl[5]) + Signal_ofY) + ") scale(" + Signal_Scale + ")"
			);
			svg.append(signal);
		}
		return;
	}
});

// DataURIからBlobへ変換（ファイルサイズ2MB超過対応）
function dataURItoBlob(dataURI) {
	const b64 = atob(dataURI.split(',')[1])
	const u8 = Uint8Array.from(b64.split(""), e => e.charCodeAt())
	return new Blob([u8], {type: "image/png"})
}
	
