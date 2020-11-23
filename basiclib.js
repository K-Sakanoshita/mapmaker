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
                encurl = "https://" + lang + "." + Conf.target.wikipedia.api + encurl;
                $.get({ url: encurl, dataType: "jsonp" }, function (data) {
                    let key = Object.keys(data.query.pages);
                    let text = data.query.pages[key].extract;
                    console.log(text);
                    resolve(text);
                });
            });
        },
        isSmartPhone: () => {
            if (window.matchMedia && window.matchMedia('(max-device-width: 640px)').matches) {
                return true;
            } else {
                return false;
            }
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
        modal_open: p => {   // open modal window(p: title,message,mode(yes no close),callback_yes,callback_no,callback_close)
            $(`${MW}_spinner`).hide();
            $(`${MW}_title`).html(p.title);
            $(`${MW}_message`).html(p.message);
            [`${MW}_yes`, `${MW}_no`, `${MW}_close`].forEach(id => $(id).hide());
            $(`${MW}_progress`).parent().hide();
            if (p.mode.indexOf("yes") > -1) $(`${MW}_yes`).html(glot.get("button_yes")).on('click', p.callback_yes).show();
            if (p.mode.indexOf("no") > -1) $(`${MW}_no`).html(glot.get("button_no")).on('click', p.callback_no).show();
            if (p.mode.indexOf("close") > -1) $(`${MW}_close`).html(glot.get("button_close")).on('click', p.callback_close).show();

            $(MW).modal({ backdrop: false, keyboard: true });
            modal_open = true;
            $(MW).on('shown.bs.modal', () => { if (!modal_open) $(MW).modal('hide') }); // Open中にCloseされた時の対応
        },
        modal_text: (text, append) => {
            let newtext = append ? $(`${MW}_message`).html() + text : text;
            $(`${MW}_message`).html(newtext);
        },
        modal_spinner: view => {
            if (view) {
                $(`${MW}_spinner`).show();
            } else {
                $(`${MW}_spinner`).hide();
            };
        },
        modal_progress: percent => {
            percent = percent == 0 ? 0.1 : percent;
            $(`${MW}_progress`).parent().show();
            $(`${MW}_progress`).css('width', parseInt(percent) + "%");
        },
        modal_select: (target) => { // View Poi Select List
            return new Promise((resolve, reject) => {
                DataList.init();
                DataList.view_select(target);
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
        menulist_make: () => {
            Object.keys(Conf.menu).forEach(key => {
                let link,confkey = Conf.menu[key];
                if (confkey.linkto.indexOf("html:") > -1) {
                    $("#temp_menu>span:first").html(confkey.linkto.substring(5));
                    link = $("#temp_menu>span:first").clone();
                } else {
                    $("#temp_menu>a:first").attr("href", confkey.linkto);
                    $("#temp_menu>a:first").attr("target", "");
                    if (confkey.linkto.indexOf("javascript:") == -1) $("#temp_menu>a:first").attr("target", "_blank");
                    $("#temp_menu>a>span:first").attr("glot-model", confkey["glot-model"]);
                    link = $("#temp_menu>a:first").clone();
                };
                $("#temp_menu").append(link);
                if (confkey["divider"]) $("#temp_menu>div:first").clone().appendTo($("#temp_menu"));
            });
            $("#temp_menu>a:first").remove();
            $("#temp_menu>span:first").remove();
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
        a4_getsize: (mode) => {                     // A4サイズにするマスク値を取得
            let p = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
            let dom = document.getElementById("mapid");
            p.width = dom.clientWidth;              // 横
            p.height = dom.clientHeight;            // 縦
            switch (mode) {
                case "A4":
                    if (p.width >= (p.height / Math.SQRT2)) {   // 横広画面（左右をマスク）
                        p.left = Math.round(((p.width - (p.height / Math.SQRT2)) / 2));
                        p.right = p.left;
                    } else {                                    // 縦長画面
                        p.top = Math.round(((p.height - (p.width * Math.SQRT2)) / 2));
                        p.bottom = p.top;
                    };
                    break;
                case "A4_landscape":
                    if (p.width >= (p.height * Math.SQRT2)) {   // 横広画面（左右をマスク）
                        p.left = Math.round(((p.width - (p.height * Math.SQRT2)) / 2));
                        p.right = p.left;
                    } else {                                    // 縦長画面
                        p.top = Math.round(((p.height - (p.width / Math.SQRT2)) / 2));
                        p.bottom = p.top;
                    };
                    break;
                default:                                        // その他(全て0)
                    break;
            };
            return p;
        },
        domAdd: (id, parent_id) => {                         // leafletにcontrollを追加
            let dom = document.getElementById(id);
            if (dom == null) {
                dom = document.createElement("div");
                dom.id = id;
                document.getElementById(parent_id).appendChild(dom);
            };
            return document.getElementById(id);             // domを返す
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
