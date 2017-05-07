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

const MinZoomLevel = 15;	// これ以下のズームレベルでは地図は作らない
const ZoomErrMsg	= "地図を作るには、もう少しズームしてください。";
const LineWeight 	= 2;		// n倍

const allWays = ["主要道路","一般道路","生活道路","路地小道","水路・川","レール類"];

const defColor = {
	"主要道路":	"#E06666",
	"一般道路":	"#FF9900",
	"生活道路":	"#CCCCCC",
	"路地小道":	"#AAAAAA",
	"水路・川":	"#66AAFF",
	"レール類":	"#444444"
};

const defWidth = {
	"主要道路":	"3",
	"一般道路":	"2",
	"生活道路":	"2",
	"路地小道":	"1",
	"水路・川":	"2",
	"レール類":	"3"
};

const OverPass ={
	"主要道路":	['way["highway"~"motorway"]'	,'way["highway"~"trunk"]'		,'way["highway"~"primary"]'		,'way["highway"~"secondary"]','way["highway"~"tertiary"]'],
	"一般道路":	['way["highway"~"unclassified"]','way["highway"~"residential"]'	,'way["highway"="living_street"]'],
	"生活道路":	['way["highway"~"pedestrian"]'	,'way["highway"="service"]'],
	"路地小道":	['way["highway"="footway"]'		,'way["highway"="path"]'		,'way["highway"="track"]'],
	"水路・川":	['relation["waterway"]'			,'way["waterway"]'],
	"レール類":	['relation["railway"]'			,'way["railway"]','way["building"="train_station"]']
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
	// initialize color change button
	let color;
	for(let i = 1; i < (allWays.length + 1);i++){
		$('select#line' + i).change(function(){
			ways[i]['width'] = $('select#line' + i).val();
			UpdateAccessMap();
		});
		$('select#line' + i).val(defWidth[allWays[i - 1]]);
		$('button#color' + i).simpleColorPicker({onChangeColor:	function(color){
			set_btncolor(color,i,true);
			UpdateAccessMap();
		}});
		ways[i] = {
			name:		allWays[i-1],
			color:		defColor[allWays[i - 1]],
			width:		defWidth[allWays[i - 1]],
			overpass:	OverPass[allWays[i - 1]],
			geojson:	[]
		}
		set_btncolor(defColor[allWays[i - 1]],i,false);
	}
});

// frontend: color set/change
// from: way_buttons
function set_btncolor(color,btnno,chgWay){
	let rgbcolor = new RGBColor(color);
	$("button#color" + btnno).css('background-color',color);
	if(rgbcolor.ok){
		if(chgWay){	ways[btnno]['color'] = color; }	// set Way color
		rgbcolor.r = (255 - rgbcolor.r);				// set button color
		rgbcolor.g = (255 - rgbcolor.g);
		rgbcolor.b = (255 - rgbcolor.b);
		$("button#color" + btnno).css("color",rgbcolor.toHex());
	}
}

// アクセスマップを作る
function makeAccessMap(){
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	let NorthWest = map.getBounds().getNorthWest();
	let SouthEast = map.getBounds().getSouthEast();
	let maparea = '(' + SouthEast.lat + ',' + NorthWest.lng + ',' + NorthWest.lat + ',' + SouthEast.lng + ');';
	let passQuery;
	let promises = [function(){
		return new Promise(function(resolve,reject){$("div#fadeLayer").show();resolve();});
	}];

	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

	for (let wno in ways) {
		promises.push(function(){
			passQuery = "";
			for (let ovpass in ways[wno].overpass){ passQuery += ways[wno].overpass[ovpass] + maparea; }
			return getOSMdata(wno,passQuery,ways[wno].name,ways[wno].color,ways[wno].width).then();
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
	for (let wno in ways) {
		makeSVGlayer(ways[wno].geojson,ways[wno].name,ways[wno].color,ways[wno].width * LineWeight);
	}
	makeContLayer();
}

// OverPass APIでOSMデータを取得
// 引数: クエリ
function getOSMdata(wno,query,name,color,weight){
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
				ways[wno].geojson = geojson;
				makeSVGlayer(geojson,name,color,weight * LineWeight);
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
function makeSVGlayer(geojson,name,color,weight){
	if (contLayer[name] !== undefined){ contLayer[name].remove(map) }
	let svglayer;
	let param = {
		style: function(feature){ return {color: color,weight: weight} },
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
        
