/*
	OSM AccessMap
	* copyright by K.Sakanoshita
	* Licence: MIT
*/
"use strict";

// Global Variable
var map;
var osm;					// OMS地図
var ort;					// オルソ化航空写真
var pale;					// 電子国土基本図
var mierune;				// MIERUNE地図
var L_Sel;
var Layers;					// レイヤーの一覧(地理院地図、OSMなど)
var contLayer = {};			// 
var ways = {};				// 道路情報の保管庫
var nodes = {};				// ノード情報の保管庫
var checkd = {};			// レイヤーのチェックボックス状態の保管

const MinZoomLevel = 14;	// これ以下のズームレベルでは地図は作らない
const ZoomErrMsg	= "地図を作るには、もう少しズームしてください。";
const NoSvgMsg		= "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。"
const LineWeight 	= 1.5;	// n倍

const allWays = {
	GDN: {name: "公園・庭",color:"#C8FACC",width: 0  ,dashArray:null},
	FRT: {name: "森・田畑",color:"#ADD19E",width: 0  ,dashArray:null},
	RIV: {name: "水路・川",color:"#66AAFF",width: 1  ,dashArray:null},
	PRI: {name: "主要道路",color:"#FF7777",width: 2  ,dashArray:null},
	STD: {name: "一般道路",color:"#A0A0A0",width: 1  ,dashArray:null},
	COM: {name: "生活道路",color:"#C0C0C0",width: 1  ,dashArray:null},
	ALY: {name: "路地小道",color:"#C0C0C0",width: 0.8,dashArray:"1,2"},
	BLD: {name: "建物・家",color:"#D0D0D0",width: 0  ,dashArray:null},
	RIL: {name: "レール類",color:"#404040",width: 1  ,dashArray:null}
};

const allNodes = {
	SIG: {name: "信号関連",icon: "./image/signal.svg",size: [25,41]}
}

const OverPass ={
	GDN: ['way["leisure"="garden"]'			,'relation["leisure"="park"]'	,'way["leisure"="park"]'		,'way["leisure"="playground"]',
		  'way["leisure"="pitch"]'			,'way["landuse"="grass"]'],
	FRT: ['relation["landuse"="forest"]'	,'relation["natural"="wood"]'	,'way["landuse"="forest"]'		,'way["natural"="wood"]'	,
		  'way["landuse"="farmland"]'		,'way["landuse"="allotments"]'],
	RIV: ['relation["waterway"]'			,'way["waterway"]'				,'way["landuse"="reservoir"]'	,'way["natural"="water"]'	,'way["natural"="coastline"]'],
	PRI: ['way["highway"~"motorway"]'		,'way["highway"~"trunk"]'		,'way["highway"~"primary"]'		,'way["highway"~"secondary"]','way["highway"~"tertiary"]'],
	STD: ['way["highway"~"unclassified"]'	,'way["highway"~"residential"]'	,'way["highway"="living_street"]'],
	COM: ['way["highway"~"pedestrian"]'		,'way["highway"="service"]'],
	ALY: ['way["highway"="footway"]'		,'way["highway"="path"]'		,'way["highway"="track"]'		,'way["highway"="steps"]'],
	BLD: ['way["building"]'],
	RIL: ['relation["railway"]'				,'way["railway"]'				,'way["building"="train_station"]'],
	SIG: ['node["highway"="traffic_signals"]']
}

const Signal_Icon = ''
	+ '<svg xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;enable-background:new 0 0 10 3.6;">'
	+ '	<g name="signal">'
	+ '		<path style="fill:#666666;" d="M8.2,3.6H1.8C0.8,3.6,0,2.8,0,1.8v0C0,0.8,0.8,0,1.8,0h6.4c1,0,1.8,0.8,1.8,1.8v0C10,2.8,9.2,3.6,8.2,3.6z"/>'
	+ '		<g>'
	+ '			<circle style="fill:#EEEEEE;" cx="1.9" cy="1.8" r="1"/>'
	+ '			<circle style="fill:#EEEEEE;" cx="5" cy="1.8" r="1"/>'
	+ '			<circle style="fill:#EEEEEE;" cx="8.1" cy="1.8" r="1"/>'
	+ '		</g>'
	+ '</g>'
	+ '</svg>';

const Signal_Scale = 3
const Signal_ofX = -16
const Signal_ofY = -8

const credit = {
	text : "Map data © OpenStreetMap",
	size : 35,
	font : "Helvetica,Arial, Roboto, “Droid Sans”, “游ゴシック”, YuGothic,“ヒラギノ角ゴ ProN W3″,“Hiragino Kaku Gothic ProN”, “メイリオ”,Meiryo",
}

// initialize leaflet
$(function(){
	mierune = L.tileLayer(
		'https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',{
		attribution: "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL.",
		maxZoom: 19
	});

	osm = L.tileLayer(
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
		maxZoom: 19
	});

	pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
		minZoom: 2, maxZoom: 18, 
		attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
    });

	ort = L.tileLayer('http://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {
		minZoom: 5, maxZoom: 18, 
		attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
    });

	Layers = { 'OpenStreetMap': osm,'MIERUNE(MONO)': mierune,'地理院タイル（基本）': pale,'地理院タイル（写真）': ort };
	map = L.map('mapid', {center: [38.290, 138.988], zoom: 6,layers: [osm]});
	// map.locate({setView: true, maxZoom: 14});
	L_Sel = L.control.layers(Layers, null, {collapsed: false}).addTo(map);
	L.control.scale({imperial: false}).addTo(map);
	var hash = new L.Hash(map);
});

// initialize frontend
$(document).ready(function() {
	for(let key in allWays){
		// change line
		$('#' + key + '_line').change(function(){
			console.log("Line Change:" + key);
			ways[key]['width'] = $('#' + key + '_line').val();
			UpdateAccessMap();
			return;
		});

		// change color
		$('#'+ key + '_color').simpleColorPicker({onChangeColor: function(color){
			console.log("Color Change:" + key);
			set_btncolor(color,key,true);
			UpdateAccessMap();
			return;
		}});

		$('#'+ key + '_line').val(allWays[key].width);
		set_btncolor(allWays[key].color,key,false);

		ways[key] = {
			category:	"way",
			name:		allWays[key].name,
			color:		allWays[key].color,
			width:		allWays[key].width,
			dashArray:	allWays[key].dashArray,
			overpass:	OverPass[key],
			geojson:	[]
		}
	}

	for(let key in allNodes){
		nodes[key] = {
			category:	"node",
			name:		allNodes[key].name,
			icon:		allNodes[key].icon,
			size:		allNodes[key].size,
			overpass:	OverPass[key],
			geojson:	[]
		}
	}

	// add event(overlay add/remove) learn checkbox
	checkd["STOP"] = false;
	map.on('overlayadd overlayremove', function(e){
		if(checkd["STOP"] === false){
			checkd[e.name] = e.type
			console.log(e.name + ":" + e.type);
		}
	});

});


// frontend: color set/change
// from: way_buttons
function set_btncolor(color,key,chgWay){
	let rgbcolor = new RGBColor(color);
	$("#" + key + "_color").css('background-color',color);
	if(rgbcolor.ok){
		if(chgWay){	ways[key]['color'] = color; }	// set Way color
		rgbcolor.r = (255 - rgbcolor.r);				// set button color
		rgbcolor.g = (255 - rgbcolor.g);
		rgbcolor.b = (255 - rgbcolor.b);
		$("#" + key + "_color").css("color",rgbcolor.toHex());
	}
}

// アクセスマップを作る
function makeAccessMap(){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	let NorthWest = map.getBounds().getNorthWest();
	let SouthEast = map.getBounds().getSouthEast();
	let maparea = '(' + SouthEast.lat + ',' + NorthWest.lng + ',' + NorthWest.lat + ',' + SouthEast.lng + ');';
	let ovpass;
	let passQuery;
	let promises = [function(){return new Promise(function(resolve,reject){$("div#fadeLayer").show();resolve();});}];	// 終了時に暗転解除
	let nowDT = new Date();
	console.log("[makeAccessMap:Start]" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds());

	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

	// get way information(road,footway,river...)
	for (let key in ways) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in ways[key].overpass){ passQuery += ways[key].overpass[ovpass] + maparea; }
			return getOSMdata(ways[key].category,key,passQuery,ways[key].name,ways[key].color,ways[key].width,ways[key].dashArray).then();
		});
	};

	// node information(signal)
	for (let key in nodes) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in nodes[key].overpass){ passQuery += nodes[key].overpass[ovpass] + maparea; }
			return getOSMdata(nodes[key].category,key,passQuery,nodes[key].name,nodes[key].icon,nodes[key].size,null).then();
		});
	};
	
	promises.push(
		function(){ return new Promise(function(resolve,reject){
			makeContLayer();
			$(".leaflet-control-layers-overlays label input:checkbox:not(:checked)").trigger('click');
			$("div#fadeLayer").hide();
			resolve();
		})}
	);
	promises.reduce(function(promise,curr,index,array){ return promise.then(curr); },Promise.resolve());

};

// Update Access Map(color/lime weight change)
function UpdateAccessMap(){
	for (let key in ways) {
		makeSVGlayer(ways[key].geojson,ways[key].name,ways[key].color,ways[key].width * LineWeight,ways[key].dashArray);
	}
	makeContLayer();
}

// OverPass APIでOSMデータを取得
// 引数: クエリ
// url : 'https://overpass-api.de/api/interpreter?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',
// url : 'https://overpass.kumi.systems/api/interpreter?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',

function getOSMdata(category,key,query,name,opt1,opt2,opt3){
	return new Promise(function(resolve,reject){
		$.ajax({
			url : 'https://overpass.kumi.systems/api/interpreter?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',
			type : "get",
			async: true,
			error: function(error){
				alert("データ取得エラーです。時間を置いてやり直してください。");
				reject(error);
			},
			success : function(osmdata){
				let nowDT = new Date();
				console.log("[getOSMdata End]" + nowDT.getHours() + ":" + nowDT.getMinutes() + ":" + nowDT.getSeconds());
				let geojson = osmtogeojson(osmdata);
				if(category == "way"){
					let color = opt1;
					let width = opt2;
					let dashArray = opt3;
					ways[key].geojson = geojson;
					makeSVGlayer(geojson,name,color,width * LineWeight, dashArray);
				}else{
					let icon = opt1;
					let size = opt2;
					nodes[key].geojson = geojson;
					makeSignalIcon(geojson,name,icon,size);
				}
				resolve();
			}
		});
	});
}

// make Leaflet Controll Panel
function makeContLayer(){
	if (L_Sel !== null){ L_Sel.remove(map) }
	L_Sel = L.control.layers(Layers,contLayer, {collapsed: false});
	L_Sel.addTo(map);
	let checks = $(".leaflet-control-layers-overlays label input:checkbox");
	for(let i = 0; i < checks.length;i++){
		let key2 = $("+span",$(checks[i]))[0].innerText.trim();
		console.log(key2 + ":" + checkd[key2]);
		if(checkd[key2] === "overlayremove"){
			console.log(key2 + "をけさんとね");
		}
	}
}

// make leaflet SVG Layer
// name:コントロール名 / color:SVG色 / width:SVG Line Weight / dashArray:破線
function makeSVGlayer(geojson,name,color,width,dashArray){
	if (contLayer[name] !== undefined){		// 既に存在するレイヤーは一旦削除する
		checkd["STOP"] = true;
		contLayer[name].remove(map)
		checkd["STOP"] = false;
	}
	let svglayer;
	let param = {
		style: function(feature){ return {color: color,weight: width,fillOpacity: 1.0,dashArray: dashArray} },
		filter: function (feature, layer) {
			if (feature.properties) {
				return feature.properties.underConstruction !== undefined ? !feature.properties.underConstruction : true;
			}
			return false;
		}
	};
	svglayer = L.geoJSON(geojson,param);					// geojsonからSVGレイヤーを作成
	svglayer.addTo(map);
	contLayer[name] = svglayer;
}

// getJSONを元にアイコン追加
function makeSignalIcon(geojson,name,icon,size){
	let smallIcon = new L.Icon({
		iconUrl:	icon,
		iconSize:	size
	});

	let param =	{
		pointToLayer: function(feature, latlng) {
			console.log(latlng, feature);
			return L.marker(latlng, { icon: smallIcon });
		}
	}
	let svglayer = L.geoJson(geojson,param);
    svglayer.addTo(map);
	contLayer[name] = svglayer;
};

function saveImage(type) {
	let svg = $("svg");
	if (svg.length == 0){ alert(NoSvgMsg);return; }
	
	const width = svg.width();
	const height = svg.height();
	const vbx = svg.attr("viewBox").split(" ");
	let marker = $("div.leaflet-marker-pane").children();
	svg.AddIcons(marker);

	let options = {};
	options.vbx = vbx;
	options.width = width;
	options.height = height;
	options.stb = svg.attr("style");

	svg.attr("style","");

	if (type === 'png') {
		svg.height(height - parseInt(vbx[1]) + 100);
		svg.width(width - parseInt(vbx[0]));
		savePNG(svg, options);
	}
	else if(type === 'svg') {
		saveSVG(svg, options);
	}
}

function saveSVG(svg, options){
	let downloadSVG = svg.clone().attr('id', 'download-SVG').appendTo('body');
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
	const encodedSVG = encodeURIComponent(new XMLSerializer().serializeToString(downloadSVG[0]));

	$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='data:image/svg+xml;utf8,"
		+ encodedSVG + "' download='OSM_AccessMap.svg'>Download Image</a>");
	$("#image-file")[0].click();
	$("#image-file").remove();
	let signals = svg.find("[name=signal]")
	signals.remove();
	svg.attr("style", options.stb);
	downloadSVG.remove();
}

function savePNG(svg, options){
	$("body").append("<canvas id='canvas1' class='hidden' width=" + options.width + " height=" + (options.height + 45) +"></canvas>");
	var canvas = $("#canvas1")[0];
	var ctx = canvas.getContext("2d");

	var data = new XMLSerializer().serializeToString(svg[0]);
	svg.attr("style", options.stb);
	let signals = svg.find("[name=signal]")
	signals.remove();

	var imgsrc = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
	var image = new Image();

	image.onload = function(){
		ctx.drawImage(image, 0, 0);
		ctx.font = credit.size + "px " + credit.font;
		ctx.fillStyle = "black";
		ctx.textAlign = "right";
		ctx.fillText(credit.text, options.width, options.height + credit.size, options.width);
		$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='"
			+ canvas.toDataURL("image/png") + "' download='OSM_AccessMap.png'>Download Image</a>");
		$("#image-file")[0].click();
		$("#canvas1").remove();
		$("#image-file").remove();
	}
	image.src = imgsrc;
}

$.fn.extend({
	// MakerをSVGに追加
	// 理由：leafletがアイコンをIMG扱いするため
	AddIcons : function(marker){
		var svg = this.filter('svg') || this.find('svg');
		let parser = new DOMParser();
		for(let i = 0; i < marker.length; i++) {
			let svgDoc = parser.parseFromString(Signal_Icon, "text/xml");
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

