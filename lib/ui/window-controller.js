// Window Control(progress&message)
class WinCont {
    constructor() {
        this.modalMode = false;
        this.modal;         // モーダルオブジェクト
        this.modalId = "";  // モーダルのID
        this.events = {}; // save EventsListners
    }

    prepareModal(modalElement) {
        modalElement.removeAttribute("inert");
        modalElement.addEventListener("hide.bs.modal", () => {
            if (modalElement.contains(document.activeElement)) document.activeElement.blur();
            modalElement.setAttribute("inert", "");
        }, { once: true });
    }

    domAdd(id, parent_id) {                         // 指定した親要素へDOMを追加する
        let dom = document.getElementById(id);
        if (dom == null) {
            dom = document.createElement("div");
            dom.id = id;
            document.getElementById(parent_id).appendChild(dom);
        }
        return document.getElementById(id);             // domを返す
    }

    menulist_make() {
        Object.keys(Conf.menu).forEach(key => {
            let link, confkey = Conf.menu[key];
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
        SiteLanguage.addMenuLinks(document.getElementById("temp_menu"));
    }


    playback(view) {
        let display = view ? "remove" : "add";
        list_playback_control.classList[display]("d-none");
    }

    download(view) {
        let display = view ? "remove" : "add";
        list_download.classList[display]("d-none");
    }

    splash(mode) {
        if (window == window.parent) {
            splash_image.setAttribute("src", Conf.etc.splashUrl);
            if (mode) {
                this.modalId = "modal_splash"
                this.modal = new bootstrap.Modal(modal_splash, { backdrop: "static", keyboard: false });
                this.modal.show()
            } else {
                this.modal.hide()
            }
        }
    }

    spinner(view) {
        try {
            let display = view ? "remove" : "add";
            global_spinner.classList[display]("d-none");
            list_spinner.classList[display]("d-none");
            image_spinner.classList[display]("d-none");
        } catch (error) {
            console.log("no spinner");
        }
    }

    scrollHint() {
        let img = document.querySelector("#scrollHand img");
        if (images.scrollWidth > images.clientWidth) {
            console.log("scrollHint: Start.");
            const rect = images.getBoundingClientRect();            // 対象要素の座標を取得
            scrollHand.style.top = `${rect.top + window.scrollY + rect.height / 2 - 8}px`;
            scrollHand.style.animation = "swing 0.8s infinite";
            img.style.display = "block";
            setTimeout(() => {
                img.style.display = "none";
                console.log("scrollHint: End.");
            }, 2000); // フェードアウト後の待機時間を追加
        }
    }

    // open modal window(p: title,message,mode(yes no close),callback_yes,callback_no,callback_close,append,openid)
    // append: append button(Conf.menu.modalButton)
    modal_open(p) {
        return new Promise((resolve, reject) => {
            let MW = "modal_window";
            if (winCont.modalMode) {    // 既に開いている場合はイベント削除
                let dom = document.getElementById(MW);
                dom.removeEventListener("hidden.bs.modal", winCont.events["close"]);
            }
            document.getElementById(MW + `_title`).innerHTML = p.title;
            document.getElementById(MW + `_message`).innerHTML = p.message;
            document.getElementById(MW + `_menu`).hidden = p.menu ? false : true;
            const addButton = function (keyn) {
                let dom = document.getElementById(MW + `_` + keyn);
                dom.classList.add("d-none");
                if (p.mode.indexOf(keyn) > -1) {
                    dom.innerHTML = glot.get(`button_` + keyn);
                    winCont.events[`callback_${keyn}`] = p[`callback_${keyn}`];
                    dom.removeEventListener("click", winCont.events[`callback_${keyn}`]);
                    dom.addEventListener("click", winCont.events[`callback_${keyn}`]);
                    dom.classList.remove("d-none");
                }
            };
            ["yes", "no", "close"].forEach((keyn) => addButton(keyn));
            winCont.modal_progress(0);
            this.modalId = MW
            let dom = document.getElementById(MW);
            const processing = p.mode === "";
            const dialog = dom.querySelector(".modal-dialog");
            dom.classList.toggle("processing-compact", Boolean(p.compact));
            dom.classList.toggle("fade", !p.compact);
            dialog?.classList.toggle("modal-lg", !p.compact);
            dialog?.classList.toggle("modal-sm", Boolean(p.compact));
            dom.querySelector(".modal-header")?.classList.toggle("d-none", Boolean(p.compact));
            dom.querySelector(".modal-footer")?.classList.toggle("d-none", Boolean(p.compact));
            dom.querySelector(".modal-header .btn-close")?.classList.toggle("d-none", processing);
            this.prepareModal(dom);
            this.modal = new bootstrap.Modal(dom, {
                backdrop: p.compact ? false : (processing ? "static" : true),
                keyboard: !processing
            });
            winCont.modalMode = true;
            winCont.events["setScroll"] = function (ev) {
                ev.currentTarget.removeEventListener(ev.type, winCont.events["setScroll"]);
                if (p.openid !== undefined) {
                    let act = document.getElementById(p.openid.replace("/", ""));
                    if (act !== null) act.scrollIntoView(); // 指定したidのactivityがあればスクロール
                }
                resolve();
            };
            dom.addEventListener("shown.bs.modal", winCont.events["setScroll"], false);
            winCont.events["close"] = function (ev) {
                console.log("close");
                ev.srcElement.removeEventListener(ev.type, winCont.events["close"]);
                ["yes", "no", "close"].forEach((keyn) => {
                    let dom = document.getElementById(MW + `_` + keyn);
                    dom.replaceWith(dom.cloneNode(true));
                });
                if (p.callback_close !== undefined) p.callback_close();
            };
            dom.addEventListener("hidden.bs.modal", winCont.events["close"], false);
            let chtml = "";
            if (p.append !== undefined) {
                // append button
                p.append.forEach((p) => {
                    if (p.editMode == Conf.etc.editMode || p.editMode == undefined) {
                        chtml += `<button class="${p.btn_class}" onclick="${p.code}"><i class="${p.icon_class}"></i>`;
                        chtml += ` <span>${glot.get(p.btn_glot_name)}</span></button>`;
                    }
                });
            }
            modal_footer.innerHTML = chtml;
            this.modal.show();
        })
    }

    modal_text(text, append) {
        const el = document.getElementById("modal_window_message");
        if (!el) return;
        el.textContent = append ? el.textContent + text + "\n" : text;
    }

    modal_progress(percent) {
        percent = percent == 0 ? 0.1 : percent;
        $(`#modal_window_progress`).css("width", parseInt(percent) + "%");
    }

    setupIconSize() {
        const size = document.getElementById('modal_select_size');
        const preset = document.getElementById('modal_select_size_preset');
        const details = document.getElementById('modal_select_size_details');
        const names = document.getElementById('modal_select_facility');
        const appearance = document.getElementById('modal_select_appearance');
        const image = document.getElementById('modal_select_preview_icon');
        const label = document.getElementById('modal_select_preview_name');
        const initial = Number(Conf.effect.text.size || Conf.default.text.size);
        if (![...size.options].some(option => Number(option.value) === initial)) {
            const option = document.createElement('option');
            option.value = initial;
            option.textContent = `${initial}px`;
            size.appendChild(option);
        }
        size.value = initial;
        names.checked = Conf.effect.text.view;
        appearance.value = Conf.effect.icon.preset || 'standard';
        const update = () => {
            const value = Number(size.value);
            preset.value = [12, 14, 18].includes(value) ? String(value) : 'custom';
            const style = Marker.iconStyle(Math.ceil(value * Conf.default.icon.scale), false, appearance.value);
            image.src = `${Conf.icon.path}/playground.png`;
            Object.assign(image.style, {width: `${style.size}px`, height: `${style.size}px`,
                padding: `${style.padding}px`, backgroundImage: style.framed
                    ? `url("data:image/svg+xml,${encodeURIComponent(Marker.iconFrameSVG(style))}")` : 'none'});
            label.textContent = glot.get('icon_size_sample');
            label.style.fontSize = `${value}px`;
            label.hidden = !names.checked;
            document.getElementById('modal_select_size_preview').setAttribute('aria-label',
                `${glot.get('icon_size_preview')}: ${value}px`);
        };
        preset.onchange = () => {
            if (preset.value === 'custom') { details.open = true; size.focus(); return; }
            size.value = preset.value;
            update();
        };
        size.onchange = update;
        names.onchange = update;
        appearance.onchange = update;
        details.open = ![12, 14, 18].includes(initial);
        update();
    }

    modal_select(target) { // View Poi Select List
        return new Promise((resolve, reject) => {
            const panel = document.getElementById("modal_select");
            const palette = document.getElementById("customMap");
            const controls = document.getElementById("controlMenu");
            const previousMode = mapMaker.basemenuWindowMode;
            palette.classList.add("d-none");
            controls.classList.add("d-none");
            panel.classList.remove("d-none");
            mapMaker.basemenuWindowMode = "expanded";
            mapMaker.applyBasemenuWindowSize?.();
            const finish = () => {
                panel.classList.add("d-none");
                palette.classList.remove("d-none");
                controls.classList.remove("d-none");
                mapMaker.basemenuWindowMode = previousMode === "minimized" && !mapMaker.mobileSheet?.enabled ? "normal" : previousMode;
                mapMaker.applyBasemenuWindowSize?.();
            };
            DataList.init();
            DataList.view_select(target);
            const search = document.getElementById("modal_select_keyword");
            search.placeholder = glot.get("icon_search");
            search.setAttribute("aria-label", glot.get("icon_search"));
            document.getElementById("modal_select_category").setAttribute("aria-label", glot.get("icon_all_categories"));
            modal_select_facilityname.textContent = glot.get("icon_show_names");
            this.setupIconSize();
            modal_select_all_select.title = glot.get("all_select");
            modal_select_all_select.setAttribute("aria-label", glot.get("all_select"));
            modal_select_all_deselect.title = glot.get("all_deselect");
            modal_select_all_deselect.setAttribute("aria-label", glot.get("all_deselect"));
            modal_select_error.textContent = "";
            modal_select_error.classList.add("d-none");
            modal_select_ok.innerHTML = glot.get("button_ok");
            modal_select_ok.onclick = () => {
                let pois = { geojson: [], targets: [], latlng: [], enable: [] };
                let alldata = DataList.table().rows().data().toArray();
                let selects = DataList.indexes();                   // 選択した行のリスト
                const selectedIds = new Set(selects.map(val => String(val.osmid)));
                const currentIds = new Set(alldata.map(val => String(val.osmid)));
                const enabledOutsideCount = poiCont.pois().geojson.reduce((count, geojson, idx) => {
                    const enabled = poiCont.pois().enable[idx];
                    return count + (enabled && !currentIds.has(String(geojson.id)) ? 1 : 0);
                }, 0);
                const iconCount = enabledOutsideCount + selectedIds.size;
                const maxIconCount = Number(Conf.icon.maxCount) || 100;
                if (iconCount > maxIconCount) {
                    modal_select_error.textContent = glot.get("icon_limit_message")
                        .replace("{limit}", maxIconCount)
                        .replace("{count}", iconCount);
                    modal_select_error.classList.remove("d-none");
                    return;
                };
                modal_select_error.textContent = "";
                modal_select_error.classList.add("d-none");
                Marker.set_size(modal_select_size.value, modal_select_facility.checked);    // set font size & view
                Marker.setAppearance(document.getElementById('modal_select_appearance').value);
                alldata.forEach((val) => {
                    let poi = poiCont.get_osmid(val.osmid);
                    let enable = selectedIds.has(String(val.osmid));
                    pois.geojson.push(poi.geojson);
                    pois.targets.push(poi.targets);
                    pois.latlng.push(poi.latlng);
                    pois.enable.push(enable);
                });
                finish();
                resolve(pois);
            };
            modal_select_cancel.innerHTML = glot.get("button_cancel");
            modal_select_cancel.onclick = () => {
                finish();
                reject();
            };
            DataList.table().columns.adjust();
        });
    }

    select_add(domid, text, value) {
        let option = document.createElement("option");
        option.text = text;
        option.value = value;
        document.getElementById(domid).appendChild(option);
    }

    select_clear(domid) {
        $('#' + domid + ' option').remove();
        $('#' + domid).append($('<option>').text(domid === "modal_select_category" ? glot.get("icon_all_categories") : "---").val("-"));
    }

    // close modal window(note: change this)
    closeModal() {
        return new Promise((resolve, reject) => {
            winCont.modalId = winCont.modalId == "" ? "modal_window" : winCont.modalId; // modalIdが空の時はmodal_windowを閉じる
            const myModalEl = document.getElementById(winCont.modalId)
            if (myModalEl !== null) {

                const evListner = function () {
                    myModalEl.removeEventListener('hidden.bs.modal', evListner);
                    let dom = document.getElementsByClassName("modal-backdrop")[0];
                    if (dom !== undefined) dom.remove(); // モーダルを閉じた時に操作できない場合へのアドホックな対処
                    resolve()
                }
                myModalEl.addEventListener('hidden.bs.modal', evListner)
                winCont.modalMode = false
                winCont.modalId = ""
                winCont.modal.hide()
            }
        })
    }

    a4_getsize(mode) {                     // A4サイズにするマスク値を取得
        let p = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
        let dom = document.getElementById("mapid");
        p.width = dom.clientWidth;              // 横
        p.height = dom.clientHeight;            // 縦
        switch (mode) {
            case "A4":
            case "A3":
                if (p.width >= (p.height / Math.SQRT2)) {   // 横広画面（左右をマスク）
                    p.left = Math.round(((p.width - (p.height / Math.SQRT2)) / 2));
                    p.right = p.left;
                } else {                                    // 縦長画面
                    p.top = Math.round(((p.height - (p.width * Math.SQRT2)) / 2));
                    p.bottom = p.top;
                };
                break;
            case "A4_landscape":
            case "A3_landscape":
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
    }

    osm_open(param_text) {
        // open osm window
        window.open(`https://osm.org/${param_text.replace(/[?&]*/, "", "")}`, "_blank");
    }

    menu_make(menulist, domid) {
        let dom = document.getElementById(domid);
        dom.innerHTML = Conf.menu_list.template;
        Object.keys(menulist).forEach((key) => {
            let link,
                confkey = menulist[key];
            if (confkey.linkto.indexOf("html:") > -1) {
                let span = dom.querySelector("span:first-child");
                span.innerHTML = confkey.linkto.substring(5);
                link = span.cloneNode(true);
            } else {
                let alink = dom.querySelector("a:first-child");
                alink.setAttribute("href", confkey.linkto);
                alink.setAttribute("target", confkey.linkto.indexOf("javascript:") == -1 ? "_blank" : "");
                alink.querySelector("span").innerHTML = glot.get(confkey["glot-model"]);
                link = alink.cloneNode(true);
            }
            dom.appendChild(link);
            if (confkey["divider"]) dom.insertAdjacentHTML("beforeend", Conf.menu_list.divider);
        });
        dom.querySelector("a:first-child").remove();
        dom.querySelector("span:first-child").remove();
    }

    // メニューにカテゴリ追加 / 既に存在する時はtrueを返す
    select_add(domid, text, value) {
        let dom = document.getElementById(domid);
        let newopt = document.createElement("option");
        var optlst = Array.prototype.slice.call(dom.options);
        let already = false;
        newopt.text = text;
        newopt.value = value;
        already = optlst.some((opt) => opt.value == value);
        if (!already) dom.appendChild(newopt);
        return already;
    }

    select_clear(domid) {
        $("#" + domid + " option").remove();
        $("#" + domid).append($("<option>").text(domid === "modal_select_category" ? glot.get("icon_all_categories") : "---").val("-"));
    }

    // 画像を表示させる
    // dom: 操作対象のDOM / acts: [{src: ImageURL,osmid: osmid}]
    setImages(dom, acts, loadingUrl) {
        dom.innerHTML = "";
        acts.forEach((act) => {
            act.src.forEach((src) => {
                if (src !== "" && typeof src !== "undefined") {
                    let image = document.createElement("img");
                    image.loading = "lazy";
                    image.className = "slide";
                    image.setAttribute("osmid", act.osmid);
                    image.setAttribute("title", act.title);
                    image.src = loadingUrl;
                    dom.append(image);
                    if (src.slice(0, 5) == "File:") {
                        basic.getWikiMediaImage(src, Conf.etc.slideThumbWidth, image); // Wikimedia Commons
                    } else {
                        image.src = src;
                    }
                }
            });
        });
    }

    // 指定したDOMを横スクロール対応にする
    mouseDragScroll(element, callback) {
        let target;
        element.addEventListener("mousedown", function (evt) {
            console.log("down");
            evt.preventDefault();
            target = element;
            target.dataset.down = "true";
            target.dataset.move = "false";
            target.dataset.x = evt.clientX;
            target.dataset.scrollleft = target.scrollLeft;
            evt.stopPropagation();
        });
        document.addEventListener("mousemove", function (evt) {
            if (target != null && target.dataset.down == "true") {
                evt.preventDefault();
                let move_x = parseInt(target.dataset.x) - evt.clientX;
                if (Math.abs(move_x) > 2) {
                    target.dataset.move = "true";
                } else {
                    return;
                }
                target.scrollLeft = parseInt(target.dataset.scrollleft) + move_x;
                evt.stopPropagation();
            }
        });
        document.addEventListener("mouseup", function (evt) {
            if (target != null && target.dataset.down == "true") {
                target.dataset.down = "false";
                if (target.dataset.move !== "true") callback(evt.target);
                evt.stopPropagation();
            }
        });
    }
}
const winCont = new WinCont();
