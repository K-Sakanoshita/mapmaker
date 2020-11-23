// https://github.com/rachel-carvalho/simple-color-picker

$.fn.simpleColorPicker = function (options) {
	var defaults = {
		colorsPerLine: 9,
		colors: [
			// black > white
			'#000000', '#909090', '#b0b0b0', '#d0d0d0', '#e0e0e0', '#e8e8e8', '#f0f0f0', '#f8f8f8', '#ffffff',
			'#645346', '#7d6757', '#967c69', '#a79283', '#b9a89b', '#cabeb5', '#dcd3cd', "#e4deda", "#ede9e7",

			// basic color
			'#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ff99', '#00ffff', '#0000ff', '#9900ff', '#ff00ff',

			//red       orange     yellow     green1	 green2     blue1      blue2      purple      pink
			'#fffefe', '#fffee8', '#fffff8', '#f8ffe0', '#e0fff8', '#f0ffff', '#e0f8ff', '#f8f0ff', '#fff8ff',
			'#fff8f8', '#fff8e0', '#fffff0', '#f0ffd8', '#d8fff0', '#e8ffff', '#d8f0ff', '#f0e8ff', '#fff0ff',
			'#fff0f0', '#fff0d8', '#ffffe8', '#e8ffd0', '#d0ffe8', '#e0ffff', '#d0e8ff', '#e8e0ff', '#ffe8ff',
			'#ffe8e8', '#ffe8d0', '#ffffe0', '#e0ffc0', '#c0ffe0', '#d0ffff', '#c0e0ff', '#e0d0ff', '#f8e0f8',
			'#f8e0e0', '#f8e0c0', '#f8f8d8', '#d8ffb8', '#b8ffd8', '#c0f8f8', '#b0d0f8', '#d8c0f8', '#f0d0f0',
			'#f8d8d8', '#f8d8b0', '#f0f0d0', '#c0f8a0', '#a0f8c0', '#a0f0f0', '#a0c0f0', '#d0b0f0', '#e0c0e0',
			'#f8d0d0', '#f8d0a0', '#e8e8b8', '#b0f090', '#90f0b0', '#90e0e0', '#80b0e0', '#c8a0e8', '#d0b0d0',
			'#f0c0c0', '#f0c090', '#e0e0a0', '#a0e080', '#80e0a0', '#80c0c0', '#6090c8', '#c090e0', '#c0a0c0',
			'#e0b0b0', '#e0b080', '#d0d090', '#90d060', '#60d090', '#60a0a0', '#4070b0', '#b080d0', '#b080b0',
			'#c09090', '#c0a070', '#c0c080', '#80b050', '#50b080', '#5080a0', '#2050a0', '#a060c0', '#a060a0',
			'#a07070', '#a08060', '#a0a070', '#60a030', '#309060', '#306090', '#003090', '#8040a0', '#904090',
			'#805050', '#806040', '#808060', '#408010', '#108040', '#104080', '#001080', '#602080', '#802080',
			'#603030', '#604020', '#606040', '#206000', '#006020', '#002060', '#000060', '#400060', '#600060'
		],
		showEffect: '',
		hideEffect: '',
		onChangeColor: false,
		includeMargins: false,
	};

	var opts = $.extend(defaults, options);
	var now_color;			// custmize by saka 2020/02/09
	var now_width;

	return this.each(function () {
		var txt = $(this);
		var colorsMarkup = '';
		var prefix = txt.attr('id').replace(/-/g, '') + '_';

		for (var i = 0; i < opts.colors.length; i++) {
			var item = opts.colors[i];
			var breakLine = '';
			if (i % opts.colorsPerLine == 0)
				breakLine = 'clear: both; ';
			if (i > 0 && breakLine && $.browser && $.browser.msie && $.browser.version <= 7) {
				breakLine = '';
				colorsMarkup += '<li style="float: none; clear: both; overflow: hidden; background-color: #fff; display: block; height: 1px; line-height: 1px; font-size: 1px; margin-bottom: -2px;"></li>';
			}

			colorsMarkup += '<li id="' + prefix + 'color-' + i + '" class="color-box" style="' + breakLine + 'background-color: ' + item + '" title="' + item + '"></li>';
		}

		// 線の太さを追加&背景色の時は非表示(2020/06/22)
		let range = `<span class="d-inline-block" style="width: 110px; line-height:30 px">${glot.get("line_weight")}:</span>
		<input type="range" id="${prefix}color-width" style="width: 110px; line-height:30px" min="0" max="10" step="0.5"></input>
		<span class="d-inline-block ml-1" style="width: 24px; line-height:30px; height: 34px" id="${prefix}color-range"></span>`;
		let div = prefix.indexOf("background") == -1 ? `<div class="d-flex align-items-center" style="background-color: white">${range}</div>` : "";
		var box = $('<div id="' + prefix + 'color-picker" class="color-picker" style="position: absolute; left: 0px; top: 0px;">' + div + '<ul>' + colorsMarkup + '</ul><div style="clear: both;"></div></div>');
		$('#colors').append(box);
		box.hide();

		if (prefix.indexOf("background") == -1) {
			/*
			var elem = document.getElementById(`${prefix}color-width`);
			var target = document.getElementById(`${prefix}color-range`);
			var rangeValue = function (elem, target) {
				return function (evt) { target.innerHTML = elem.value };
			}
			elem.addEventListener('input', rangeValue(elem, target));
			*/
			$(`#${prefix}color-width`).off();
			$(`#${prefix}color-width`).on('input', () => {
				let width = $(`#${prefix}color-width`).val();
				$(`#${prefix}color-range`).text(width);
			});
		};

		box.find('li.color-box').click(function () {
			let prefix = txt.attr('id').replace(/-/g, '') + '_';
			if (txt.is('input')) {
				txt.val(opts.colors[this.id.substr(this.id.indexOf('-') + 1)]);
				txt.blur();
			}
			if ($.isFunction(defaults.onChangeColor)) {
				now_width = $(`#${prefix}color-width`).val();
				defaults.onChangeColor.call(txt, opts.colors[this.id.substr(this.id.indexOf('-') + 1)], now_width);
			}
			hideBox(box);
		});

		$('body').on('click', function () {
			hideBox(box);
		});

		box.click(function (event) {
			event.stopPropagation();
		});

		var positionAndShowBox = function (box) {
			var pos = txt.offset(), boxo = { "width": box.outerWidth(opts.includeMargins), "height": box.outerHeight()};
			var left = pos.left + txt.outerWidth(opts.includeMargins) - boxo.width;
			if (left < pos.left) left = pos.left;
			if (left + boxo.width > window.innerWidth) left = window.innerWidth - boxo.width;
			if (pos.top + boxo.height > window.innerHeight) pos.top = window.innerHeight - boxo.height;
			box.css({ left: left, top: (pos.top + txt.outerHeight(opts.includeMargins)) });
			showBox(box);
		};

		txt.click(function (event) {
			event.stopPropagation();
			if (!txt.is('input')) {
				// element is not an input so probably a link or div which requires the color box to be shown

				// customize by saka 2020/02/09
				// let key = box.attr('id').split("_")[0];
				let key = box.attr('id').replace(/_color_color-picker/,"");
				now_color = Layers[key].color;
				now_width = Layers[key].width;
				let css = { border: "4px solid #000000" };
				$("#" + box.attr('id') + " [title='" + now_color + "']").css(css);
				$("#" + key + "_color_color-width").val(now_width);
				$("#" + key + "_color_color-range").html(now_width);
				positionAndShowBox(box);
			}
		});

		txt.focus(function () {
			positionAndShowBox(box);
		});

		function hideBox(box) {
			// customize by saka 2020/02/09
			let css = { border: "1px solid #ffffff" };
			$("#" + box.attr('id') + " [title='" + now_color + "']").css(css)

			if (opts.hideEffect == 'fade')
				box.fadeOut();
			else if (opts.hideEffect == 'slide')
				box.slideUp();
			else
				box.hide();
		}

		function showBox(box) {
			if (opts.showEffect == 'fade')
				box.fadeIn();
			else if (opts.showEffect == 'slide')
				box.slideDown();
			else
				box.show();
		}
	});
};
