
	// Global Variable
	var map;
	var osm;
	var svglayer;
	var isFF;
	var L_Sel;
	var contMap = {};
	var contLayer = {};

	// initialize
	$(function(){
		var data;
		var isFF = /firefox/i.test(navigator.userAgent);
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

		getOSMdata('way["highway"~"motorway"](' + maparea + ')',"高速道路")
			.then(function(){
				return getOSMdata('way["highway"~"trunk"](' + maparea + ')',"主要道路1");
			}).then(function(){
				return getOSMdata('way["highway"~"primary"](' + maparea + ')',"主要道路2");
			}).then(function(){
				return getOSMdata('way["highway"~"secondary"](' + maparea + ')',"主要道路3");
			}).then(function(){
				return getOSMdata('way["highway"~"tertiary"](' + maparea + ')',"主要道路4");
			}).then(function(){
				return getOSMdata('way["highway"~"unclassified"](' + maparea + ')',"主要道路5");
			}).then(function(){
				return getOSMdata('way["highway"~"residential"](' + maparea + ');way["highway"="service"](' + maparea + ')',"生活道路");
			}).then(function(){
				return getOSMdata('way["highway"~"pedestrian"](' + maparea + ');way["highway"="footway"](' + maparea + ');way["highway"="path"](' + maparea + ');way["highway"="track"](' + maparea + ')',"路地・広場");
			});

	};

	// OverPass APIでOSMデータを取得
	// 引数: クエリ
	function getOSMdata(query,title){
		return new Promise(function(resolve,reject){
			$.ajax({
				url : 'https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(' + query + ';);out body;>;out skel qt;',
				type : "get",
				async: true,
				error: function(error){
					alert("データ取得エラーです。時間を置いてやり直してください。");
					reject(err);
				},
				success : function(osmdata){
					makeSVGlayer(osmdata,title);
					resolve();
				}
			});
		});
	}

	function makeSVGlayer(osmdata,title){ 
		let geojson = osmtogeojson(osmdata);					// OverPass APIで取得したデータをgeojsonへ
		if (svglayer !== undefined){ svglayer.remove();	}		// SVGレイヤーがあれば削除
		svglayer = L.geoJSON(geojson, {							// geojsonからSVGレイヤーを作成
			style: function(feature){ return {color: '#AA0000'} },
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
//			LC.addOverlay(svglayer,"案内地図");
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

	$.fn.extend({
		svgToData : function(){
			var svg = this.filter('svg') || this.find('svg');
			svg.attr({"xmlns" : "http://www.w3.org/2000/svg" });
			return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.parent().html());
		}
	});


	function svgexport(){
		$.map($('svg'), function(value){
			$('#out').attr("href", $(value).svgToData());
		});
	}
