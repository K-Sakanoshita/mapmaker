// Basic Closure
var Basic = (function () {
    return {
        getdate: () => {							                // Overpass Queryに付ける日付指定
            let seldate = $("#Select_Date").val();
            return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
        },
        dataURItoBlob: (dataURI) => {                               // DataURIからBlobへ変換（ファイルサイズ2MB超過対応）
            const b64 = atob(dataURI.split(',')[1]);
            const u8 = Uint8Array.from(b64.split(""), function (e) { return e.charCodeAt() });
            return new Blob([u8], { type: "image/png" });
        },
        concatTwoDimensionalArray: (array1, array2, axis) => {      // 2次元配列の合成
            if (axis != 1) axis = 0;
            var array3 = [];
            if (axis == 0) {    //　縦方向の結合
                array3 = array1.slice();
                for (var i = 0; i < array2.length; i++) {
                    array3.push(array2[i]);
                }
            }
            else {              //　横方向の結合
                for (var i = 0; i < array1.length; i++) {
                    array3[i] = array1[i].concat(array2[i]);
                }
            }
            return array3;
        },
        unicodeUnescape: (str) => {     // \uxxx形式→文字列変換
            let result = "", strs = str.match(/\\u.{4}/ig);
            if (!strs) return '';
            for (var i = 0, len = strs.length; i < len; i++) {
                result += String.fromCharCode(strs[i].replace('\\u', '0x'));
            };
            return result;
        },
        getWikipedia: (lang, url) => {      // get wikipedia contents
            return new Promise((resolve, reject) => {
                let encurl = encodeURI(url);
                encurl = "https://" + lang + "." + Conf.marker.wikipedia.api + encurl;
                $.get({ url: encurl, dataType: "jsonp" }, function (data) {
                    let key = Object.keys(data.query.pages);
                    let text = data.query.pages[key].extract;
                    console.log(text);
                    resolve(text);
                });
            });
        }
    };
})();

// Display Status(progress&message)
var WinCont = (function () {
    var modal_open = false, MW = "#modal_window", MS = "#modal_select";

    return {
        splash: (mode) => {
            $("#splash_image").attr("src", Conf.local.SplashImage);
            let act = mode ? { backdrop: 'static', keyboard: false } : 'hide';
            $('#Splash_Modal').modal(act);
        },
        modal_open: params => {   // open modal window(params: title,message,mode(yes no close),callback_yes,callback_no,callback_close)
            $(`${MW}_title`).html(params.title);
            $(`${MW}_message`).html(params.message);
            [`${MW}_yes`, `${MW}_no`, `${MW}_close`].forEach(id => $(id).hide());
            $(`${MW}_progress`).parent().hide();
            if (params.mode.indexOf("yes") > -1) $(`${MW}_yes`).html(glot.get("button_yes")).on('click', params.callback_yes).show();
            if (params.mode.indexOf("no") > -1) $(`${MW}_no`).html(glot.get("button_no")).on('click', params.callback_no).show();
            if (params.mode.indexOf("close") > -1) $(`${MW}_close`).html(glot.get("button_close")).on('click', params.callback_close).show();
            $(MW).modal({ backdrop: false, keyboard: true });
            modal_open = true;
            $(MW).on('shown.bs.modal', () => { if (!modal_open) $(MW).modal('hide') }); // Open中にCloseされた時の対応
        },
        modal_progress: percent => {
            percent = percent == 0 ? 0.1 : percent;
            $(`${MW}_progress`).parent().show();
            $(`${MW}_progress`).css('width', parseInt(percent) + "%");
        },
        modal_select: (target) => { // View Poi Select List
            return new Promise((resolve, reject) => {
                DataList.init();
                DataList.view(target);
                $(`${MS}_facilityname`).html(glot.get("facilityname"));
                $(`${MS}_size`).val(Conf.default.Text.size);
                $(`${MS}_facility`).prop("checked", Conf.default.Text.view);
                $(`${MS}_ok`).html(glot.get("button_ok")).one('click', () => {
                    let pois = { geojson: [], targets: [], latlng: [], enable: [] };
                    let alldata = DataList.table().rows().data().toArray();
                    let selects = DataList.indexes();                   // 選択した行のリスト
                    let sel_ids = selects.map(val => val.osmid).join("|");
                    Marker.set_size($(`${MS}_size`).val(), $(`${MS}_facility`).prop("checked"));    // set font size & view
                    alldata.forEach((val) => {
                        let poi = PoiCont.get_osmid(val.osmid);
                        let enable = sel_ids.indexOf(val.osmid) > -1 ? true : false;
                        pois.geojson.push(poi.geojson);
                        pois.targets.push(poi.targets);
                        pois.latlng.push(poi.latlng);
                        pois.enable.push(enable);
                    });
                    $(MS).modal('hide');
                    resolve(pois);
                });
                $(`${MS}_cancel`).html(glot.get("button_cancel")).one('click', () => {
                    $(MS).modal('hide');
                    reject();
                });
                $(MS).modal({ backdrop: false, keyboard: true });
            });
        },
        modal_close: () => {            // close modal window
            modal_open = false;
            WinCont.modal_progress(0);
            $(`${MW}`).modal('hide');
            [`${MW}_yes`, `${MW}_no`, `${MW}_close`].forEach(id => $(id).off('click'));
        },
        menu_make: () => {
            Object.keys(Conf.menu).forEach(key => {
                let confkey = Conf.menu[key];
                $("#temp_menu>a:first").attr("href", confkey.linkto);
                $("#temp_menu>a:first").attr("target", "");
                if (confkey.linkto.indexOf("javascript:") == -1) $("#temp_menu>a:first").attr("target", "_blank");
                $("#temp_menu>a>span:first").attr("glot-model", confkey["glot-model"]);
                let link = $("#temp_menu>a:first").clone();
                $("#temp_menu").append(link);
                if (confkey["divider"]) $("#temp_menu>div:first").clone().appendTo($("#temp_menu"));
            });
            $("#temp_menu>a:first").remove();
            $("#temp_menu>div:first").remove();
        },
        select_add: (domid, text, value) => {
            let option = document.createElement("option");
            option.text = text;
            option.value = value;
            document.getElementById(domid).appendChild(option);
        },
        select_clear: (domid) => {
            $('#' + domid + ' option').remove();
            $('#' + domid).append($('<option>').html("---").val("-"));
        },
        window_resize: () => {
            console.log("Window Width: " + window.innerWidth);
            let use_H, magni = window.innerWidth < 768 ? 0.7 : 1;
            switch (magni) {
                case 1: // 横画面
                    use_H = window.innerHeight - 40;
                    $("#mapid").css("height", Math.round(use_H * magni) + "px");
                    $("#dataid").css("height", (window.innerHeight - 90) + "px");
                    break;
                default: // 縦画面
                    use_H = window.innerHeight - 70;    // header + filtter height
                    let map_H = Math.round(use_H * magni);
                    let dat_H = use_H - map_H;
                    $("#mapid").css("height", map_H + "px");
                    $("#dataid").css("height", dat_H + "px");
                    break;
            };
        }
    };
})();
