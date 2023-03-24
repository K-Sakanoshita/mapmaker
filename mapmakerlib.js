"use strict";

var LayerCont = (function () {		// for line&area / nodeはMarker

	return {
		init: () => {
			let lamp = Layers.MAP == undefined ? "" : Layers.MAP;
			Layers = { "background": { "opacity": Conf.style.background.opacity }, "MAP": lamp };
			for (let key in Conf.style) {
				let color = typeof (Conf.style[key].color) == "undefined" ? "" : Conf.style[key].color;
				let opacity = typeof (Conf.style[key].opacity) == "undefined" ? "" : Conf.style[key].opacity;
				Layers[key] = {
					"color": color, "color_dark": color == "" ? "" : chroma(color).darken(Conf.default.ColorDarken).hex(),
					"width": typeof (Conf.style[key].width) == "undefined" ? 0 : Conf.style[key].width, "opacity": opacity
				};
			};
			WinCont.domAdd("a4_top", "article");			// make area_select
			WinCont.domAdd("a4_bottom", "article");
			WinCont.domAdd("a4_left", "article");
			WinCont.domAdd("a4_right", "article");
		},

		layer_make: (key, view) => {
			let type = Conf.style[key].type, opacity;
			if (view !== undefined) Layers[key].opacity = view ? 1 : 0;
			let style = SVGCont.svg_style(key, false);
			if (Layers[key].svg) {							// already svg layers
				Layers[key].svg.forEach(way => {
					switch (view) {
						case undefined: opacity = { "fillOpacity": way.options.fillOpacity, "opacity": way.options.opacity }; break;
						case true: opacity = { "fillOpacity": 1, "opacity": 1 }; break;
						case false: opacity = { "fillOpacity": 0, "opacity": 0 }; break;
					};
					if (type !== "area") opacity.fillOpacity = 0; 					// LineがPolygon化された場合の対処
					if (way.overstyle !== undefined) {	// overstyleの再描画時
						let tstyle = SVGCont.svg_style(key, true);
						way.setStyle(Object.assign(tstyle, opacity));
					} else {
						way.setStyle(Object.assign(style, opacity));
					}
					way.options = Object.assign(way.options, opacity);
				});
			} else if (Layers[key].geojson !== undefined) {		//already geojson
				let ways = [];
				opacity = { "fillOpacity": 1, "opacity": 1 };
				if (view == false) opacity = { "fillOpacity": 0, "opacity": 0 };	// false以外(trueとundefined)はopacity=1
				if (type !== "area") opacity.fillOpacity = 0; 	// LineがPolygon化された場合の対処
				style = Object.assign(style, opacity);
				Layers[key].geojson.forEach(way => {
					ways.push(L.geoJSON(way, style));			// geojsonからSVGレイヤーを作成
					ways[ways.length - 1].addTo(map).on('click', way_toggle);
					ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
					let svgdom = ways[ways.length - 1].getLayers()[0].getElement();
					let filter = Conf.style[key].filter;
					if (filter !== undefined) if (map.getZoom() >= filter.zoom) svgdom.style.filter = filter.value;
					if (Conf.style[key].overstyle !== undefined) {	// overstyleがある場合
						let tstyle = SVGCont.svg_style(key, true);
						tstyle = Object.assign(tstyle, opacity);
						ways.push(L.geoJSON(way, tstyle));			// geojsonからSVGレイヤーを作成

						ways[ways.length - 1].addTo(map);
						ways[ways.length - 1].mapmaker = { id: ways.length - 1, "key": key };
						ways[ways.length - 1].overstyle = true;
					}
				});
				Layers[key].svg = ways;
			};
			console.log(`layer make: ${key}: ok`);
		},

		// Aree select(A4)
		area_select: (mode) => {
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
		},
		all_clear: () => {
			console.log("LayerCont: all clear... ");
			for (let key in Conf.style) if (Layers[key].svg) Layers[key].svg.forEach(svg => map.removeLayer(svg));
			LayerCont.init();
		}
	};

	function way_toggle(ev) {					// wayをクリックしたときのイベント（表示/非表示切り替え）
		let key = ev.target.mapmaker.key;
		let nextid = ev.target.mapmaker.id + 1;
		let options = ev.target.options;
		if (options.opacity == 0) {
			options.fillOpacity = 1;
			options.opacity = 1;
			ev.target.options.opacity = 1;
			if (Conf.style[key].type !== "area") options.fillOpacity = 0; 	// LineがPolygon化された場合の対処
		} else {
			options.fillOpacity = 0;
			options.opacity = 0;
			ev.target.options.opacity = 0;
		};
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
	};
})();
