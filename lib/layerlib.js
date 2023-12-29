"use strict";

// Layersをグローバル変数として利用(要見直し)
//let gray = Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
class LayerControl {		// for line&area / nodeはMarker

	constructor() {
		this.palette = "";
		this.styles = [];
	}

	// 初期化処理
	init() {
		console.log("layerCont init.");
		this.palette = Conf.default.Palette;
		let lamp = Layers.MAP == undefined ? "" : Layers.MAP;
		Layers = { "background": { "opacity": Conf.style[this.palette].background.opacity }, "MAP": lamp };
		for (let key in Conf.style[this.palette]) {
			this.styles.push(key);
		}
		this.setStyle(this.palette);
		WinCont.domAdd("a4_top", "article");			// make area_select
		WinCont.domAdd("a4_bottom", "article");
		WinCont.domAdd("a4_left", "article");
		WinCont.domAdd("a4_right", "article");
	}

	// 指定したパレットで色と線を設定する
	setStyle(palette) {
		console.log("layerCont SetStyle.");
		this.palette = palette;
		let updateFlag = false;
		for (let key in Conf.style[palette]) {
			let nstyle = Conf.style[palette][key];
			let opacity = typeof (nstyle.opacity) == "undefined" ? "" : nstyle.opacity;
			let dColor = nstyle.color == "" ? "" : chroma(nstyle.color).darken(Conf.default.ColorDarken).hex();
			if (Layers[key] == undefined) Layers[key] = {};
			Layers[key]["color"] = nstyle.color;
			Layers[key]["color_dark"] = dColor;
			Layers[key]["width"] = nstyle.width;
			Layers[key]["opacity"] = opacity;
			let domColor = document.getElementById(key + "_color");
			let domLine = document.getElementById(key + "_Line");
			if (domColor) {
				domColor.setAttribute("value", nstyle.color);
				if (domLine) domLine.setAttribute("value", nstyle.width);
				updateFlag = true;
			}
		}
		if (updateFlag) this.updateLayer();
	}

	makeLayer(key, view) {
		let way_toggle = function (ev) {					// wayをクリックしたときのイベント（表示/非表示切り替え）
			let key = ev.target.mapmaker.key;
			let nextid = ev.target.mapmaker.id + 1;
			let options = ev.target.options;
			if (options.opacity == 0) {
				options.fillOpacity = 1;
				options.opacity = 1;
				ev.target.options.opacity = 1;
				if (Conf.style[this.palette][key].type !== "area") options.fillOpacity = 0; 	// LineがPolygon化された場合の対処
			} else {
				options.fillOpacity = 0;
				options.opacity = 0;
				ev.target.options.opacity = 0;
			}
			let style = SVGCont.svg_style(key, false);
			options.color = style.color;
			options.fillColor = style.fillColor;
			options.weight = style.weight;
			ev.target.setStyle(options);
			if (Layers[key].svg[nextid] !== undefined) {
				if (Layers[key].svg[nextid].overstyle !== undefined) {
					Layers[key].svg[nextid].options = Object.assign({}, options);
					Layers[key].svg[nextid].setStyle(Layers[key].svg[nextid].options);
				}
			}
		}
		let type = Conf.style[this.palette][key].type, opacity;
		if (view !== undefined) Layers[key].opacity = view ? 1 : 0;
		let style = SVGCont.svg_style(key, false);
		if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
		if (Layers[key].geojson !== undefined) {		//already geojson
			let ways = [];
			opacity = { "fillOpacity": 1, "opacity": 1 };
			if (view == false) opacity = { "fillOpacity": 0, "opacity": 0 };	// false以外(trueとundefined)はopacity=1
			if (type !== "area") opacity.fillOpacity = 0; 	// LineがPolygon化された場合の対処
			style = Object.assign(style, opacity);
			Layers[key].geojson.forEach(way => {
				ways.push(L.geoJSON(way, style));			// geojsonからSVGレイヤーを作成
				ways[ways.length - 1].addTo(map).on('click', way_toggle.bind(this));
				ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
				let svgdom = ways[ways.length - 1].getLayers()[0].getElement();
				let filter = Conf.style[this.palette][key].filter;
				if (filter !== undefined) if (map.getZoom() >= filter.zoom) svgdom.style.filter = filter.value;
				if (Conf.style[this.palette][key].overstyle !== undefined) {	// overstyleがある場合
					let tstyle = SVGCont.svg_style(key, true);
					tstyle = Object.assign(tstyle, opacity);
					ways.push(L.geoJSON(way, tstyle));			// geojsonからSVGレイヤーを作成
					ways[ways.length - 1].addTo(map);
					ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
					ways[ways.length - 1].overstyle = true;
				}
			});
			Layers[key].svg = ways;
		}
		console.log(`layer make: ${key}: ok`);
	}

	// Update layers(color/lime weight change)
	updateLayer(target) {
		if (target == "" || typeof (target) == "undefined") {		// no targetkey then update all layer
			for (let key of LayerCont.styles) if (Layers[key].geojson) LayerCont.makeLayer(key);
		} else {
			if (Layers[target].geojson) LayerCont.makeLayer(target);
		};
		console.log("Mapmaker: update... end ");
	}

	// Aree select(A4)
	area_select(mode) {
		let dom, p = WinCont.a4_getsize(mode);
		if (p.top > 0) {
			dom = document.getElementById("a4_top");
			dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.top}px; top: 0px; left: 0px;"></div>`;
			dom = document.getElementById("a4_bottom");
			dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.bottom}px; top:  ${p.height - p.bottom}px; left: 0px;"></div>`;
		} else {
			dom = document.getElementById("a4_top");
			if (dom !== null) { dom.innerHTML = `` };
			dom = document.getElementById("a4_bottom");
			if (dom !== null) { dom.innerHTML = `` };
		};
		if (p.left > 0) {
			dom = document.getElementById("a4_left");
			dom.innerHTML = `<div class="area_mask" style="width: ${p.left}px; height: 100%; top: 0px; left: 0px;"></div>`;
			dom = document.getElementById("a4_right");
			dom.innerHTML = `<div class="area_mask" style="width: ${p.right}px; height: 100%; top: 0px; left: ${p.width - p.right}px;"></div>`;
		} else {
			dom = document.getElementById("a4_left");
			if (dom !== null) { dom.innerHTML = `` };
			dom = document.getElementById("a4_right");
			if (dom !== null) { dom.innerHTML = `` };
		};
	}
	clearAll() {
		console.log("LayerCont: all clear... ");
		for (let key of LayerCont.styles) if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
		LayerCont.init();
	}
}
