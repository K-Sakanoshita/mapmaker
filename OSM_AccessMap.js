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
var L_Sel;
var Layers;
var contLayer = {};
var ways = {};				// 道路情報の保管庫
var nodes = {};				// ノード情報の保管庫

const MinZoomLevel = 14;	// これ以下のズームレベルでは地図は作らない
const ZoomErrMsg	= "地図を作るには、もう少しズームしてください。";
const NoSvgMsg		= "保存するマップがありません。\nまず、左側の「以下の範囲でマップを作る」ボタンを押してください。"
const LineWeight 	= 1.5;		// n倍

const allWays = {
	RIV: {name: "水路・川",color:"#66AAFF",width: 2},
	ALY: {name: "路地小道",color:"#808090",width: 1},
	COM: {name: "生活道路",color:"#707070",width: 1},
	STD: {name: "一般道路",color:"#606060",width: 1},
	PRI: {name: "主要道路",color:"#FF7777",width: 2},
	BLD: {name: "建物・家",color:"#B0B0B0",width: 1},
	RIL: {name: "レール類",color:"#404040",width: 2}
};

const allNodes = {
	SIG: {name: "信号関連",icon: "./image/signal.svg",size: [25,41]}
}

const OverPass ={
	RIV: ['relation["waterway"]'			,'way["waterway"]'				,'way["landuse"="reservoir"]'	,'way["natural"="water"]'	,'way["natural"="coastline"]'],
	ALY: ['way["highway"="footway"]'		,'way["highway"="path"]'		,'way["highway"="track"]'],
	COM: ['way["highway"~"pedestrian"]'		,'way["highway"="service"]'],
	STD: ['way["highway"~"unclassified"]'	,'way["highway"~"residential"]'	,'way["highway"="living_street"]'],
	PRI: ['way["highway"~"motorway"]'		,'way["highway"~"trunk"]'		,'way["highway"~"primary"]'			,'way["highway"~"secondary"]','way["highway"~"tertiary"]'],
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

// initialize leaflet
$(function(){
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

	Layers = { 'OpenStreetMap': osm,'地理院タイル（基本）': pale,'地理院タイル（写真）': ort };
	map = L.map('mapid', {center: [34.687367　, 135.525854], zoom: 12,layers: [osm]});
	map.locate({setView: true, maxZoom: 14});
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

	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

	// get way information(road,footway,river...)
	for (let key in ways) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in ways[key].overpass){ passQuery += ways[key].overpass[ovpass] + maparea; }
			return getOSMdata(ways[key].category,key,passQuery,ways[key].name,ways[key].color,ways[key].width).then();
		});
	};

	// node information(signal)
	for (let key in nodes) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in nodes[key].overpass){ passQuery += nodes[key].overpass[ovpass] + maparea; }
			return getOSMdata(nodes[key].category,key,passQuery,nodes[key].name,nodes[key].icon,nodes[key].size).then();
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
		makeSVGlayer(ways[key].geojson,ways[key].name,ways[key].color,ways[key].width * LineWeight);
	}
	makeContLayer();
}

// OverPass APIでOSMデータを取得
// 引数: クエリ
function getOSMdata(category,key,query,name,opt1,opt2){
	return new Promise(function(resolve,reject){
		$.ajax({
			url : 'https://overpass-api.de/api/interpreter?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;',
			type : "get",
			async: true,
			error: function(error){
				alert("データ取得エラーです。時間を置いてやり直してください。");
				reject(error);
			},
			success : function(osmdata){
				let geojson = osmtogeojson(osmdata);
				if(category == "way"){
					let color = opt1;
					let width = opt2;
					ways[key].geojson = geojson;
					makeSVGlayer(geojson,name,color,width * LineWeight);
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
}

// make leaflet SVG Layer
function makeSVGlayer(geojson,name,color,width){
	if (contLayer[name] !== undefined){ contLayer[name].remove(map) }
	let svglayer;
	let param = {
		style: function(feature){ return {color: color,weight: width,fillOpacity: 1.0,} },
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

function saveSVG(){
	var svg = $("svg");
	if (svg.length == 0){ alert(NoSvgMsg);return; }

	var width = svg.width();
	var height = svg.height();
	var stb = svg.attr("style");
	var vbx = svg.attr("viewBox").split(" ");
	let marker = $("div.leaflet-marker-pane").children();
	svg.AddIcons(marker);
	
	svg.attr("style","");
	svg.height(height - parseInt(vbx[1]) + 100);
	svg.width(width - parseInt(vbx[0]));

	$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='"
		+ svg.ToData() + "' download='OSM_AccessMap.svg'>Donload Image</a>");
	$("#image-file")[0].click();
	$("#image-file").remove();
	let signals = svg.find("[name=signal]")
	signals.remove();
	svg.attr("style",stb);

}

function savePNG(){
	var svg = $("svg");
	if (svg.length == 0){ alert(NoSvgMsg);return; }
	
	var width = svg.width();
	var height = svg.height();
	var stb = svg.attr("style");
	var vbx = svg.attr("viewBox").split(" ");
	let marker = $("div.leaflet-marker-pane").children();
	svg.AddIcons(marker);

	svg.attr("style","");
	svg.height(height - parseInt(vbx[1]) + 100);
	svg.width(width - parseInt(vbx[0]));

	$("body").append("<canvas id='canvas1' class='hidden' width=" + width + " height=" + height +"></canvas>");
	var canvas = $("#canvas1")[0];
	var ctx = canvas.getContext("2d");

	var data = new XMLSerializer().serializeToString(svg[0]);
	svg.attr("style",stb);
	let signals = svg.find("[name=signal]")
	signals.remove();

	var imgsrc = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
	var image = new Image();

	image.onload = function(){
		ctx.drawImage(image, 0, 0);
		$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='"
			+ canvas.toDataURL("image/png") + "' download='OSM_AccessMap.png'>Donload Image</a>");
		$("#image-file")[0].click();
		$("#canvas1").remove();
		$("#image-file").remove();
	}
	image.src = imgsrc;
}		

$.fn.extend({
	// SVG convert Text Data
	ToData : function(){
		var svg = this.filter('svg') || this.find('svg');
		svg.attr({"xmlns" : "http://www.w3.org/2000/svg" });
		return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.parent().html());
	}
});

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

