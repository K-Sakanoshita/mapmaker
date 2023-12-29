"use strict";

// SVG操作ライブラリ(PNG形式に変換して保存する処理も含む)
class SVGControl {
	constructor() {
		this.SvgIcon = {};
		this.ImgSrcs = [];
	};
	init() {
		Marker.set_size(Conf.default.text.size, Conf.default.text.view);
		let jqXHRs = [], keys = [];			// SVGファイルをSvgIconへ読み込む
		Object.keys(Conf.marker.tag).forEach(key1 => {					// main svg icon
			Object.keys(Conf.marker.tag[key1]).forEach((key2) => {
				let filename = Conf.marker.path + "/" + Conf.marker.tag[key1][key2];
				filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
				if (keys.indexOf(filename) == -1) keys.push(filename);
			});
		});
		Object.keys(Conf.marker.subtag).forEach(key1 => {				// sub svg icon
			Object.keys(Conf.marker.subtag[key1]).forEach((key2) => {
				Object.keys(Conf.marker.subtag[key1][key2]).forEach((key3) => {
					let filename = Conf.marker.path + "/" + Conf.marker.subtag[key1][key2][key3];
					filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
					if (keys.indexOf(filename) == -1) keys.push(filename);
				});
			});
		});
		Object.values(Conf.marker_append.files).forEach(filename => {	// append svg icon
			filename = filename.indexOf(",") > 0 ? filename.split(",")[0] : filename;
			if (keys.indexOf(filename) == -1) keys.push(`${Conf.marker_append.path}/${filename}`);
		});
		Object.values(keys).forEach(filename => jqXHRs.push($.get(filename)));

		keys.push(Conf.effect.icon.stack);
		jqXHRs.push($.get(Conf.effect.icon.stack));		// load icon bg

		$.when.apply($, jqXHRs).always(function () {
			let xs = new XMLSerializer();
			for (let key in keys) SVGCont.SvgIcon[keys[key]] = xs.serializeToString(arguments[key][0]);
		});
	}

	conv_svg(svg) {							// MakerをSVGに追加 理由：leafletがアイコンをIMG扱いするため
		let marker = $("div.leaflet-marker-pane").children();
		let parser = new DOMParser(), thumbnail, svgicon, svgtext, text, textsize, svgstl;
		SVGCont.ImgSrcs = [];
		for (let i = 0; i < marker.length; i++) {
			let pathname = $(marker.eq(i)[0].children).children().attr('src');	// 最初の要素にsrcがあればpathnameへ
			svgstl = marker.eq(i).css("transform").slice(7, -1).split(",");
			let offset = [];	// top,right.bottom,leftの順(実際に使っているのはtopとleftのみ)
			switch (marker.eq(i).css("margin")) {
				case "":
					offset[0] = parseInt(marker.eq(i).css("margin-top"), 10);
					offset[3] = parseInt(marker.eq(i).css("margin-left"), 10);
					break;
				default:
					marker.eq(i).css("margin").split(" ").forEach((val) => offset.push(parseInt(val, 10)));	// オフセット値を取得
					break;
			}
			svgtext = $(marker.eq(i)[0].children).find("span");
			switch (pathname) {
				case undefined:					// not icon(qr etc...)
					svgicon = $(marker.eq(i)[0].children).find("svg");
					svgtext = $(marker.eq(i)[0]).find("div.p-2.bg-light");
					let x = Number(svgstl[4]) + offset[3];
					let y = Number(svgstl[5]) + offset[0];
					SVGCont.rect_write(svg, { x: x - 4, y: y - 4, width: 640, height: $(svgicon).height() + 22 });	// add p-1
					svg_append(svg, svgicon, marker.eq(i), { x: $(svgicon).width() / 2, y: $(svgicon).height() / 2 }, offset);
					text = svgtext.text();
					if (text !== undefined) {	// QRCode Text
						x += $(svgicon).width();
						SVGCont.text_write(svg, {
							"text": text, "anchor": 'start', "x": x, "y": y, "no": i,
							"width": svgtext.width(), "height": $(svgicon).height(),
							"size": parseInt(svgtext.css("font-size")), "color": Conf.effect.text.color, "font": "Helvetica"
						});
						thumbnail = $(marker.eq(i)[0].children).find("img");
						if (thumbnail !== undefined) {
							x = x + svgtext.width();
							SVGCont.ImgSrcs.push([
								thumbnail.attr('src'), x, y,
								thumbnail.outerWidth(), thumbnail.outerHeight(), thumbnail]);	// png保存時にcanvasへロードさせる情報
							//SVGCont.image_write(svg, { href: thumbnail.attr('src'), height: thumbnail.outerHeight(), "x": x, "y": y + 2 });
						}
					};
					break;
				default:
					let filename = pathname; //.match(".+/(.+?)([\?#;].*)?$")[1];
					svgicon = $(marker.eq(i)[0].children).find("img");
					let noframe = svgicon[0].className.indexOf("icon_normal") > -1 ? false : true;
					let svgsize = { x: svgicon.width(), y: svgicon.height() };
					let svgsize_circle = { x: svgicon.width() + 4, y: svgicon.height() + 4 };
					text = $(marker.eq(i)[0].children).children().attr('icon-name');
					let textAttr = SVGCont.getTextSize({ "text": text, "font": Conf.effect.text.size + "px " + Conf.default.font });
					if (!noframe) {
						svgicon = $(parser.parseFromString(SVGCont.SvgIcon[Conf.effect.icon.stack], "text/xml")).children();	// 枠追加
						svg_append(svg, svgicon, marker.eq(i), svgsize_circle, [-4, 0, 0, -4]);
					}
					svgicon = $(parser.parseFromString(SVGCont.SvgIcon[filename], "text/xml")).children();					// アイコン追加
					svg_append(svg, svgicon, marker.eq(i), svgsize, [-2, 0, 0, -2]);
					if (text !== undefined && text !== "" && Conf.effect.text.view) {					// Marker Text
						SVGCont.text_write(svg, {
							"text": text, "anchor": 'start', "no": i,
							"x": Number(svgstl[4]) + svgsize.x + 4,
							"y": Number(svgstl[5]) + (textAttr.height * ((Conf.effect.text.size - 12) / 42)),
							"width": textAttr.width + 2, "height": textAttr.height,
							"size": Conf.effect.text.size,
							"color": Conf.default.text.color, "font": Conf.default.text.font
						});
					};
					break;
			};
		};

		// SVGにアイコンを追加
		//offset: [0]top / [3]left
		function svg_append(svg, svgicon, marker, size, offset) {
			let svgvbox;
			if ($(svgicon).attr('viewBox') == undefined) {
				svgvbox = [0, 0, size.x, size.y];
			} else {
				svgvbox = $(svgicon).attr('viewBox').split(' ');
			};
			let scale = Math.ceil((size.x / (svgvbox[2] - svgvbox[0])) * 1000) / 1000;
			let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			for (let key in svgicon[0].childNodes) {
				let nodeName = svgicon[0].childNodes[key].nodeName;
				if (nodeName == "path" || nodeName == "g" || nodeName == "defs" || nodeName == "rect" || nodeName == "ellipse" || nodeName == "style") {
					group.append(svgicon[0].childNodes[key].cloneNode(true));
				};
			};
			let svgstl = marker.css("transform").slice(7, -1).split(",")						// transformのstyleから配列でXとY座標を取得(4と5)
			$(group).attr("transform", "matrix(1,0,0,1," + (Number(svgstl[4]) + offset[3]) + "," + (Number(svgstl[5]) + offset[0]) + ") scale(" + scale + ")");
			svg.append(group);
		};
	}

	// Save PNG/SVG {type : 'PNG' or 'SVG' mode: '' or 'A4' or 'A4_landscape'}
	save(params) {
		console.log("save: start");
		let data, canvas_width, canvas_height, svg = $("svg").clone();
		let base = svg[0].viewBox.baseVal;
		let box = WinCont.a4_getsize(params.mode);
		console.log("save: set canvas size");
		base = {
			width: box.width - (box.left + box.right),
			height: box.height - (box.top + box.bottom),
			x: base.x + box.left, y: base.y + box.top
		};

		if (Basic.isSmartPhone()) {
			base.x += 36;
			base.y += Conf.default.HeaderSize;
		} else {
			base.x += Basic.getBrowserName() == "Chrome" ? 132 : 120;
			base.y += Conf.default.HeaderSize * 2.2;
		};

		switch (params.mode) {
			case "":
				canvas_width = base.width * 2;
				canvas_height = base.height * 2;
				break;
			case "A4":
				svg.attr("width", "210mm");
				svg.attr("height", "297mm");
				canvas_width = Conf.default.Paper.dpi * 8.27;
				canvas_height = Conf.default.Paper.dpi * 11.69;
				break;
			case "A4_landscape":
				svg.attr("width", "297mm");
				svg.attr("height", "210mm");
				canvas_width = Conf.default.Paper.dpi * 11.69;
				canvas_height = Conf.default.Paper.dpi * 8.27;
				break;
		};

		svg.attr("id", "saveSVG");
		svg.attr("xmlns:xlink", "http://www.w3.org/1999/xlink");
		svg.attr("viewBox", [base.x, base.y, base.width, base.height].join(" "));

		if (Layers.background.opacity !== 0) {
			let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			rect.setAttribute("x", base.x);
			rect.setAttribute("y", base.y);
			rect.setAttribute("width", base.width);
			rect.setAttribute("height", base.height);
			rect.setAttribute("fill", Layers["background"].color);
			svg[0].insertBefore(rect, svg[0].firstChild);
		}
		$("body").append(svg);

		// add Copyrigt
		console.log("save: write OSM Copyright");
		let credit = Conf.default.credit, textAttr = credit.text + Mapmaker.getCopyright();
		let textSize = SVGCont.getTextSize({ "text": textAttr, "font": credit.size + "px " + credit.font });
		SVGCont.text_write(svg, {
			"text": textAttr, "font": credit.font, "size": credit.size, "no": "copyright",
			"x": base.width + base.x - textSize.width - 6, "y": base.height + base.y - textSize.height - 6,
			"type": params.type, "anchor": credit.anchor
		});

		svg.attr("style", "");
		console.log("save: HTML to SVG");
		SVGCont.conv_svg(svg, params.type);

		switch (params.type) {
			case 'png':
				console.log("save: make PNG Image");
				let canvas = document.createElement("canvas");
				canvas.setAttribute('id', 'download');
				canvas.setAttribute('class', 'hidden');
				canvas.setAttribute('width', canvas_width);
				canvas.setAttribute('height', canvas_height);
				const ctx = canvas.getContext('2d');
				let scale = canvas_width / base.width;
				data = new XMLSerializer().serializeToString(svg[0]);
				let imgsrc = ["data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data))), 0, 0, base.width * scale, base.height * scale, undefined];
				SVGCont.ImgSrcs.unshift(imgsrc);
				let jqXHRs = [];
				for (let img of SVGCont.ImgSrcs) { jqXHRs.push(SVGCont.image_load(img[0])) };
				$.when.apply($, jqXHRs).always(function () {
					for (let idx in arguments) {
						let marker = SVGCont.ImgSrcs[idx][5];
						let src = SVGCont.ImgSrcs[idx];
						if (marker !== undefined) {
							if (idx > 0) {
								for (let i = 1; i < 5; i++) src[i] = src[i] * scale;
							};
							let offset = marker.offset();
							src[1] = (offset.left * scale) - 72;
							src[2] = (offset.top * scale) - 134;
						}
						ctx.drawImage(arguments[idx], 0, 0, arguments[idx].width, arguments[idx].height, src[1], src[2], src[3], src[4]);
					};
					save_common(svg, canvas.toDataURL("image/png"), 'png');
				});
				break;
			case 'svg':
				console.log("save: make SVG Image");
				data = new XMLSerializer().serializeToString(svg[0])
				save_common(svg, "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(data))), 'svg');
				break;
		};
		function save_common(svg, dataURI, ext) {	// save処理のファイル作成&保存部分
			let blob = Basic.dataURItoBlob(dataURI, Conf.header[ext]);
			let url = URL.createObjectURL(blob);
			let a = document.createElement("a");
			a.setAttribute("type", "hidden");
			a.setAttribute("id", "download-link");
			a.download = Conf.default.FileName + '.' + ext;
			a.href = url;
			$('body').append(a);
			a.click();
			setTimeout(function () {
				URL.revokeObjectURL(url);
				$("#download").remove();
				$("#download-link").remove();
				svg.remove();
				map.setView(map.getCenter());
				console.log("save: end");
			}, Math.max(3000, dataURI.length / 512));
		}
	}

	// rect weite
	rect_write(svg, params) {
		let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", params.x);
		rect.setAttribute("y", params.y);
		rect.setAttribute("width", params.width);
		rect.setAttribute("height", params.height);
		rect.setAttribute("fill", "white");
		rect.setAttribute("fill-opacity", 0.6);
		rect.setAttribute("stroke", "black");
		rect.setAttribute("stroke-width", 1);
		svg[0].appendChild(rect);
	}

	// WriteText params .svg,text,size,font,color,anchor
	text_write(svg, params) {
		console.log("[SVGCont] writeText: x:" + params.x + " y:" + params.y);
		let width, height;
		let svgtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		let textpath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
		svgtext.setAttribute('text-anchor', params.anchor);
		svgtext.setAttribute('font-size', params.size + "px");
		svgtext.setAttribute('font-family', params.font);
		svgtext.setAttribute('fill', params.color);
		svgtext.setAttribute('dominant-baseline', 'middle');	// middleだとブラウザ依存が減るみたい
		textpath.textContent = params.text;
		textpath.setAttribute('xlink:href', "#textpath" + params.no);
		svgtext.appendChild(textpath);
		svg[0].appendChild(svgtext);

		if (params.width == undefined) {
			let textAttr = SVGCont.getTextSize({ text: params.text, font: params.size + "px " + params.font });
			width = textAttr.width;
			height = textAttr.height;
		} else {
			width = params.width;
			height = params.height;
		}
		let svgpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		svgpath.setAttribute('transform', `matrix(1,0,0,1,${params.x},${params.y + 9})`);
		svgpath.setAttribute('id', "textpath" + params.no);
		let adjust = "", safari = L.Browser.safari ? 9 : 0;
		for (let i = 0; i < 8; i++) { adjust += `M0,${i * 17 + safari} H${width} ` };
		svgpath.setAttribute('d', adjust);
		svg[0].insertBefore(svgpath, svgtext);

		let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", params.x - 3);
		rect.setAttribute("y", params.y - (params.size - 12) * 0.55);
		rect.setAttribute('rx', "4");
		rect.setAttribute('ry', "4");
		rect.setAttribute("width", width + 6);
		rect.setAttribute("height", height + 4);
		rect.setAttribute("fill", "white");
		rect.setAttribute("fill-opacity", 0.6);
		svg[0].insertBefore(rect, svgtext);
	}

	image_write(svg, params) {
		console.log("[SVGCont] writeImage: x:" + params.x + " y:" + params.y);
		let svgimage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
		//svgimage.setAttribute("x", params.x + 4);
		//svgimage.setAttribute("y", params.y + 4);
		svgimage.setAttribute('href', params.href);
		svgimage.setAttribute('height', params.height);
		//svg[0].appendChild(svgimage);
		return svgimage;
	}

	svg_style(key, overstyle) {	// set svg style(no set opacity) overstyle:true時はそちらを返す
		let common, style, weight = 1, nowzoom = map.getZoom();
		if (nowzoom < 15) {
			weight = 1 / (15 - nowzoom);
		} else if (nowzoom > 15) {
			weight = (nowzoom - 15) * 0.6;
		};
		// color:SVG色 / width:SVG Line Weight / dashArray:破線 / linecap:終端の形状
		switch (overstyle) {
			case true:
				let dashs = Conf.style[LayerCont.palette][key].overstyle.dashArray.split(" ");
				dashs = dashs.map(dash => dash * weight);
				common = {
					"stroke": true, "dashArray": `${dashs[0]} ${dashs[1]}`,
					"lineJoin": Conf.style[LayerCont.palette][key].overstyle.linecap, "lineCap": Conf.style[LayerCont.palette][key].overstyle.linecap,
					"bubblingMouseEvents": false, "weight": Conf.style[LayerCont.palette][key].overstyle.width * weight,
					"color": Conf.style[LayerCont.palette][key].overstyle.color
				};
				break;
			default:
				common = {
					"stroke": true, "dashArray": Conf.style[LayerCont.palette][key].dashArray,
					"lineJoin": Conf.style[LayerCont.palette][key].linecap, "lineCap": Conf.style[LayerCont.palette][key].linecap,
					"bubblingMouseEvents": false, "weight": Layers[key].width * weight
				};
		}
		if (overstyle) {
			style = common;
		} else if (Conf.style[LayerCont.palette][key].type == "area") {	// overstyle時は枠指定しない
			style = Object.assign(common, { "color": Layers[key].color_dark, "fillColor": Layers[key].color });
		} else {
			style = Object.assign(common, { "color": Layers[key].color, "fillColor": Layers[key].color_dark });
		};
		return style;
	}

	// 文字列のサイズを計算
	// params {text:対象の文字列,font:CSSフォント指定}
	getTextSize(params) {
		let canvas = document.createElement('canvas');
		let context = canvas.getContext('2d');
		context.font = params.font;
		var metrics = context.measureText(params.text);
		return { width: metrics.width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
	}

	// 画像読み込みのPromise化
	image_load(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => resolve(img);
			img.onerror = (e) => reject(e);
			img.src = src;
		});
	}
}
