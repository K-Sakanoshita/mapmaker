/*	まち歩きマップメーカー Licence: MIT */
"use strict";

// make leaflet SVG Layer
// MakeData内 -> name:コントロール名 / color:SVG色 / width:SVG Line Weight / dashArray:破線
function makeSVGlayer(key){
	let data = MakeDatas[key];

	switch (data.type){
	case "way":
		if (MakeLayer[key] !== undefined){	MakeLayer[key].remove(map)	}	// Delete an existing layer
		let param = {
			style: function(feature){
				 return {
					 stroke: true, color: data.color,	 weight: data.width * ((map.getZoom() - MinZoomLevel) * 0.5),
					 fillOpacity: 1.0, dashArray: data.dashArray,	 bubblingMouseEvents: false,
					}
			 },
			filter: function (feature, layer) {
				if (feature.properties) {	return feature.properties.underConstruction !== undefined ? !feature.properties.underConstruction : true;	}
				return false;
			}
		};
		let svglayer = L.geoJSON(data.geojson,param);					// geojsonからSVGレイヤーを作成
		svglayer.addTo(map);
		MakeLayer[key] = svglayer;
		break;

	case "node":
		let markers = [];
		if (MakeLayer[key] !== undefined){
			MakeLayer[key].forEach( function(marker){ marker.remove(map) });
		}	// Delete an existing layer

		data.geojson.features.forEach(function(node){
			let tagname = node.properties.tags.name == undefined ? "" : node.properties.tags.name;
			let icon = L.divIcon({
				className: 'icon',
				html: '<img class="icon" src="' + data.icon + '" icon-name="' + tagname + '"><span class="icon" style="color: black;">' + tagname + '</span>',
				popupAnchor: [0, -10]
			});
			markers.push(L.marker(new L.LatLng(node.geometry.coordinates[1],node.geometry.coordinates[0]), {icon: icon,draggable: true}));
			let popcont = (tagname == '' ? '（名称不明）' : tagname) + "<br><input type='button' value='アイコンを削除' onclick='DeleteMarker(\"" + key + "\"," + (markers.length - 1) + ")'></input>";
			markers[markers.length - 1].addTo(map).bindPopup(popcont);
		});
		MakeLayer[key] = markers;
		$('#' +key + "_layer").prop('checked', true);
		break;

	default:
		console.log("makeSVGlayer: mode error -> " + mode);
		break;
	}
}

function DeleteMarker(keyname,keyno){
	map.removeLayer(MakeLayer[keyname][keyno]);
}

function saveImage(type) {
	let ZoomLevel = map.getZoom();					// マップ範囲を探す
	if( ZoomLevel < MinZoomLevel ){	alert(ZoomErrMsg);return false;}

 	let svg = $("svg") //.clone();
	let width = svg.width();
	let height = svg.height();
	let vbx = svg.attr("viewBox").split(" ");
	let marker = $("div.leaflet-marker-pane").children();
	svg.AddIcons(marker);

	let options = {	vbx: vbx,	width: width,	height: height,	stb: svg.attr("style")};
	svg.attr("style","");

	// add Copyrigt
	let viewBoxArray =  svg[0].attributes.viewBox.value.split(' ');
	viewBoxArray[viewBoxArray.length - 1] = Number(viewBoxArray[viewBoxArray.length - 1]) + credit.size + 5;
	svg[0].attributes.viewBox.value = viewBoxArray.join(' ');
	let viewBox = svg[0].viewBox;
	SVG_WriteText({
		"svg": svg,"text": credit.text,	"size":credit.size,"color":"black",anchor: 'end',
		"x": viewBox.baseVal.x + viewBox.baseVal.width,
		"y": viewBox.baseVal.height - Math.abs(viewBox.baseVal.y)
	});

	// add Icon Name
	let parser = new DOMParser();
	for(let i = 0; i < marker.length; i++) {
		let svgstl = marker.eq(i).css("transform").slice(7,-1).split(",")	// transformのstyleから配列でXとY座標を取得(4と5)
		let text = $(marker.eq(i)[0].children).attr('icon-name');
		if (text != undefined){
			SVG_WriteText({
				"svg": svg,	"text": text,"anchor": 'start',
				"x": Number(svgstl[4]) + 4,			"y": Number(svgstl[5]),
				"size": MarkerParams.text_size,"color": MarkerParams.text_color,
			});
		}
	}

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
	// SVG convert Text Data
	let data = new XMLSerializer().serializeToString(svg[0])
	svg.attr("style", options.stb);
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
		svg.find("[name=tempsvg]").remove();
	}, Math.max(3000, dataURI.length / 512));
}

function savePNG(svg, options){
	$("body").append("<canvas id='download' class='hidden' width=" + options.width + " height=" + (options.height + 45) +"></canvas>");
	var canvas = $("#download")[0];
	var ctx = canvas.getContext("2d");
	var data = new XMLSerializer().serializeToString(svg[0]);
	svg.attr("style", options.stb);
	var imgsrc = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data)));
	var image = new Image();

	image.onload = function(){
		ctx.drawImage(image, 0, 0);
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
			svg.find("[name=tempsvg]").remove();
		}, Math.max(3000, dataURI.length / 512 ));
	}
	image.src = imgsrc;
}

/* Library & Subroutine */

// WriteText
//params .svg:svg .text:text .size:font size  .color:color .background:background color
function SVG_WriteText(params){
	let svgtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	svgtext.setAttributeNS(null, 'x', params.x);
	svgtext.setAttributeNS(null, 'y', params.y + 6);
	svgtext.setAttributeNS(null, 'text-anchor', params.anchor);
	svgtext.setAttributeNS(null, 'font-size', params.size);
	svgtext.setAttributeNS(null, 'font-family', params.font);
	svgtext.setAttributeNS(null, 'fill', params.color);
	svgtext.setAttributeNS(null, 'name', 'tempsvg');
	svgtext.setAttributeNS(null, 'dominant-baseline', 'text-after-edge');
	svgtext.textContent = params.text;
	params.svg[0].appendChild(svgtext);

	let SVGRect = svgtext.getBBox();
	let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", SVGRect.x);
    rect.setAttribute("y", SVGRect.y);
    rect.setAttribute("width", SVGRect.width);
    rect.setAttribute("height", SVGRect.height);
    rect.setAttribute("fill", "white");
		rect.setAttribute("fill-opacity", 0.5);
		rect.setAttributeNS(null, 'name', 'tempsvg');
    params.svg[0].insertBefore(rect, svgtext);
}


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
			let marker_src = $(marker.eq(i)[0].children).attr('src');
			if (marker_src !== undefined){
				let matched = MMK_Loads.filter(function(obj) {
					 return obj.file.match(marker_src);
				});
				if (matched != ""){
					svgDoc = parser.parseFromString(Icons[matched[0].icon], "text/xml");
					let svgicon = $(svgDoc).children();
					let svgvbox = $(svgicon).attr('viewBox').split(' ');
					let scale = Math.ceil((MarkerParams.icon_x / (svgvbox[2] - svgvbox[0])) * 1000)/1000;
					let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
					for(let key in svgicon[0].childNodes){
						let nodeName = svgicon[0].childNodes[key].nodeName;
						if (nodeName == "path" || nodeName == "g" || nodeName == "defs" || nodeName == "rect" || nodeName == "ellipse"){
							group.append(svgicon[0].childNodes[key].cloneNode(true));
						}
					}
					let svgstl = marker.eq(i).css("transform").slice(7,-1).split(",")	// transformのstyleから配列でXとY座標を取得(4と5)
					$(group).attr("transform","matrix(1,0,0,1," + (Number(svgstl[4]) - MarkerParams.icon_x) + "," + (Number(svgstl[5]) - MarkerParams.icon_y) + ") scale(" + scale + ")");
					$(group).attr("name","tempsvg");
					svg.append(group);
				}
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
