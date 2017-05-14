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
var L_Sel;
var Layers;
var contLayer = {};
var ways = {};				// 道路情報の保管庫
var nodes = {};				// ノード情報の保管庫

const MinZoomLevel = 15;	// これ以下のズームレベルでは地図は作らない
const ZoomErrMsg	= "地図を作るには、もう少しズームしてください。";
const LineWeight 	= 2;		// n倍

const allWays = {
	RIV: {name: "水路・川",color:"#66AAFF",width: 2},
	ALY: {name: "路地小道",color:"#AAAAAA",width: 1},
	COM: {name: "生活道路",color:"#CCCCCC",width: 2},
	STD: {name: "一般道路",color:"#FF9900",width: 2},
	PRI: {name: "主要道路",color:"#E06666",width: 3},
	RIL: {name: "レール類",color:"#444444",width: 3},
};

const allNodes = {
	SIG: {name: "信号関連",icon: "./image/signal.svg",size: [25,41]}
}

const OverPass ={
	RIV: ['relation["waterway"]'			,'way["waterway"]'],
	ALY: ['way["highway"="footway"]'		,'way["highway"="path"]'		,'way["highway"="track"]'],
	COM: ['way["highway"~"pedestrian"]'		,'way["highway"="service"]'],
	STD: ['way["highway"~"unclassified"]'	,'way["highway"~"residential"]'	,'way["highway"="living_street"]'],
	PRI: ['way["highway"~"motorway"]'		,'way["highway"~"trunk"]'		,'way["highway"~"primary"]'			,'way["highway"~"secondary"]','way["highway"~"tertiary"]'],
	RIL: ['relation["railway"]'				,'way["railway"]'				,'way["building"="train_station"]'],
	SIG: ['node["highway"="traffic_signals"]']
}

// initialize leaflet
$(function(){
	osm = L.tileLayer(
		'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
		maxZoom: 19
	});

	ort = L.tileLayer('http://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {
		minZoom: 5, maxZoom: 18, 
		attribution: "<a href='http://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
    });
	Layers = { 'OpenStreetMap': osm,'地理院タイル（写真）': ort };

	map = L.map('mapid', {center: [34.687367　, 135.525854], zoom: 12,layers: [osm]});
	map.locate({setView: true, maxZoom: 14});
	L_Sel = L.control.layers(Layers, null, {collapsed: false}).addTo(map);
	L.control.scale({imperial: false}).addTo(map);
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
		$("#" + key + "color").css("color",rgbcolor.toHex());
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
	let promises = [function(){
		return new Promise(function(resolve,reject){$("div#fadeLayer").show();resolve();});
	}];

	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

	for (let key in ways) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in ways[key].overpass){ passQuery += ways[key].overpass[ovpass] + maparea; }
			return getOSMdata(ways[key].category,key,passQuery,ways[key].name,ways[key].color,ways[key].width).then();
		});
	};

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
			url : 'https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(' + query + ');out body;>;out skel qt;',
			type : "get",
			async: true,
			error: function(error){
				alert("データ取得エラーです。時間を置いてやり直してください。");
				reject(error);
			},
			success : function(osmdata){
				let geojson = osmtogeojson(osmdata);
				console.log("success:" + category + " / " + name);
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
	console.log("makeSVGlayer");
	if (contLayer[name] !== undefined){ contLayer[name].remove(map) }
	let svglayer;
	let param = {
		style: function(feature){ return {color: color,weight: width} },
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
	/*
	let smallIcon = new L.Icon({
		iconUrl:	icon,
		iconSize:	size
	});
	*/
	
	let smallIcon = new L.DivIcon({
		html: '<svg><use xlink:href="./image/signal.svg#signal"/></svg>'
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
	$.map($('svg'), function(value){
	var svg = $("svg");
	var width = svg.width();
	var height = svg.height();
	var stb = svg.attr("style");
	var vbx = svg.attr("viewBox").split(" ");

	svg.attr("style","");
	svg.height(height - parseInt(vbx[1]) + 100);
	svg.width(width - parseInt(vbx[0]));
	$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='"
		+ $(value).svgToData() + "' download='OSM_AccessMap.svg'>Donload Image</a>");
	$("#image-file")[0].click();
	$("#image-file").remove();
	svg.attr("style",stb);
	});
}

$.fn.extend({
	svgToData : function(){
		var svg = this.filter('svg') || this.find('svg');
		svg.attr({"xmlns" : "http://www.w3.org/2000/svg" });
		return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.parent().html());
	}
});


function savePNG(){
	var svg = $("svg");
	var width = svg.width();
	var height = svg.height();
	var stb = svg.attr("style");
	var vbx = svg.attr("viewBox").split(" ");

	svg.attr("style","");
	svg.height(height - parseInt(vbx[1]) + 100);
	svg.width(width - parseInt(vbx[0]));

	$("body").append("<canvas id='canvas1' class='hidden' width=" + width + " height=" + height +"></canvas>");
	var canvas = $("#canvas1")[0];
	var ctx = canvas.getContext("2d");

	var data = new XMLSerializer().serializeToString(svg[0]);
	svg.attr("style",stb);

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
        
