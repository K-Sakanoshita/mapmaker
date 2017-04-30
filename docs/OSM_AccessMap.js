/*
	OSM AccessMap
	* copyright by K.Sakanoshita
*/

// Global Variable
var map;
var osm;
var svglayer;
var L_Sel;
var contMap = {};
var contLayer = {};

// initialize
$(function(){
	map = L.map('mapid').setView([34.687367　, 135.525854], 15);
	map.locate({setView: true, maxZoom: 14});
		osm = L.tileLayer(
		'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
			attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
			maxZoom: 19
		});
	osm.addTo(map);
	L.control.scale({imperial: false}).addTo(map);
});


	// アクセスマップを作る
	function makeAccessMap(){
		// マップ範囲を探す
		let NorthWest = map.getBounds().getNorthWest();
		let SouthEast = map.getBounds().getSouthEast();
		let maparea = SouthEast.lat + ',' + NorthWest.lng + ',' + NorthWest.lat + ',' + SouthEast.lng;

		getOSMdata(	'way["highway"~"motorway"](' + maparea + ');'
		+		'way["highway"~"trunk"]('     + maparea + ');'
		+		'way["highway"~"primary"]('   + maparea + ');'
		+		'way["highway"~"secondary"](' + maparea + ');'
		+		'way["highway"~"tertiary"]('  + maparea + ')',"主要道路","#00AA00",3)
		.then(function(){
			return getOSMdata('way["highway"~"unclassified"](' + maparea + ')',"一般道路","#0000AA",2);
		}).then(function(){
			return getOSMdata('way["highway"~"residential"](' + maparea + ');way["highway"="service"](' + maparea + ')',"生活道路","#AAAAAA",1);
		}).then(function(){
			return getOSMdata('way["highway"~"pedestrian"](' + maparea + ');way["highway"="footway"](' + maparea + ');way["highway"="path"](' + maparea + ');way["highway"="track"](' + maparea + ')',"路地・広場","#886666",1);
		}).then(function(){
			var $checked = $(":checked");
			for(var i=0;i<$checked.length;i++){
				$checked[i].checked = true
			}
			
		});

	};

	// OverPass APIでOSMデータを取得
	// 引数: クエリ
	function getOSMdata(query,title,color,weight){
		return new Promise(function(resolve,reject){
			$.ajax({
				url : 'https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(' + query + ';);out body;>;out skel qt;',
				type : "get",
				async: true,
				error: function(error){
					alert("データ取得エラーです。時間を置いてやり直してください。");
					reject(error);
				},
				success : function(osmdata){
					makeSVGlayer(osmdata,title,color,weight);
					resolve();
				}
			});
		});
	}

	function makeSVGlayer(osmdata,title,color,weight){ 
		let geojson = osmtogeojson(osmdata);					// OverPass APIで取得したデータをgeojsonへ
		if (svglayer !== undefined){ svglayer.remove();	}		// SVGレイヤーがあれば削除
		svglayer = L.geoJSON(geojson, {							// geojsonからSVGレイヤーを作成
			style: function(feature){ return {color: color,weight: weight } },
			filter:
			function (feature, layer) {
				if (feature.properties) {
					return feature.properties.underConstruction !== undefined ? !feature.properties.underConstruction : true;
				}
				return false;
			},onEachFeature: onEachFeature
		});

		contMap["OSM"] = osm;
		contLayer[title] = svglayer;
		if (L_Sel == null){
			L_Sel = L.control.layers(contMap,contLayer, {collapsed: false});
			L_Sel.addTo(map);
			svglayer.addTo(map);
		}else{
			L_Sel.remove(map);
			L_Sel = L.control.layers(contMap,contLayer, {collapsed: false});
			let LC = L_Sel.addTo(map);
			svglayer.addTo(map);
		}
	}

	function onEachFeature(feature, layer) {
		var popupContent = "<p>I started out as a GeoJSON " +
			feature.geometry.type + ", but now I'm a Leaflet vector!</p>";
		if (feature.properties && feature.properties.popupContent) {
			popupContent += feature.properties.popupContent;
		}
		layer.bindPopup(popupContent);
	}

	function svgexport(){
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


	function svg2png(){
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
			// Optional: 自動でダウンロードさせる場合
			$("body").append("<a id='image-file' class='hidden' type='application/octet-stream' href='"
                       + canvas.toDataURL("image/png") + "' download='graph.png'>Donload Image</a>");
			$("#image-file")[0].click();

			// 後処理
			$("#canvas1").remove();
			$("#image-file").remove();

		}
		image.src = imgsrc;
	}		
        
