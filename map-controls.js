/*	まち歩きマップメーカー Licence: MIT */
"use strict";

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
				 return {
					 stroke: true,
					 color: data.color,
					 weight: data.width * ((map.getZoom() - MinZoomLevel) * 0.5),
					 fillOpacity: 1.0,
					 dashArray: data.dashArray,
					 bubblingMouseEvents: false,
					}
			 },
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
		let nodeName;
		param =	{	pointToLayer: function(feature, latlng) {	return L.marker(latlng, { icon: smallIcon });}	}
		svglayer = L.geoJSON(data.geojson,param);					// geojsonからSVGレイヤーを作成
		svglayer.addTo(map);
		for (let key in svglayer["_layers"]){
			nodeName = map["_layers"][key].feature.properties.tags.name;
			nodeName = nodeName == undefined ? '(名前不明)' : nodeName;
			svglayer["_layers"][key].bindPopup(nodeName + "<br><input type='button' value='アイコンを削除' onclick='DeleteMarker("+ key + ");'/>");
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
	svg.find("[name=svgicons]").remove();

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
	svg.find("[name=svgicons]").remove();
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
			let marker_src = marker.eq(i).attr('src');
			let matched = MMK_Loads.filter(function(obj) {
				 return obj.file.match(marker_src);
				 });
			if (matched != ""){
				svgDoc = parser.parseFromString(Icons[matched[0].icon], "text/xml");
				let svgicon = $(svgDoc).children()[0] //.children[0];
				let svgstl = marker.eq(i).css("transform").slice(7,-1).split(",")	// transformのstyleから配列でXとY座標を取得(4と5)
				$(svgicon).attr("transform",
					"matrix(1,0,0,1," + (Number(svgstl[4]) + Signal_ofX) + "," + (Number(svgstl[5]) + Signal_ofY) + ") scale(" + Signal_Scale + ")"
				);
				$(svgicon).attr("name","svgicons");
				svg.append(svgicon);
			}
		}
		return;
	}
});

// DataURIからBlobへ変換（ファイルサイズ2MB超過対応）
function dataURItoBlob(dataURI) {
	const b64 = atob(dataURI.split(',')[1]);
//	const u8 = Uint8Array.from(b64.split(""), e => e.charCodeAt());
	const u8 = Uint8Array.from(b64.split(""), function(e){ return e.charCodeAt()});
	return new Blob([u8], {type: "image/png"})
}
	
