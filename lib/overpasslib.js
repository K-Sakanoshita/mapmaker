"use strict";
// OverPass Server Control(no cache)
// 2022/09/27 Mapmakerにキャッシュ機能は時期尚早と判断
class OverPassControl {

    constructor() {
        this.UseServer = 0;
        this.LastData = {};
        this.tags = {};
    }

    get(targets, progress) {
        return new Promise((resolve, reject) => {
            var LL = GeoCont.get_L();	// 画面表示座標
            let maparea = LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng;
            let query = "", ques = [];
            targets.forEach(key => {
                if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => ques.push(val));
            });
            query = Array.from(new Set(ques)).join(';') + ";";	// uniqにしてからjoin
            let url = Conf.system.OverPassServer[overPassCont.UseServer] + `?data=[out:json][timeout:120][bbox:${maparea}];(${query});out body meta;>;out skel;`;
            console.log("overPassCont: GET: " + url);
            $.ajax({
                "type": 'GET', "dataType": 'json', "url": url, "cache": false, "xhr": () => {
                    var xhr = new window.XMLHttpRequest();
                    xhr.addEventListener("progress", (evt) => {
                        console.log("overPassCont: Progress: " + evt.loaded);
                        if (progress !== undefined) progress(evt.loaded);
                    }, false);
                    return xhr;
                }
            }).done(function (osmxml) {
                console.log("overPassCont: done.");
                if (osmxml.elements.length == 0) { resolve(); return };
                let geojsons = osmtogeojson(osmxml, { flatProperties: true });
                overPassCont.LastData = { "geojson": geojsons.features, "targets": overPassCont.set_targets(geojsons.features) };
                resolve(overPassCont.LastData);
            }).fail(function (jqXHR, statusText, errorThrown) {
                console.log("overPassCont: " + statusText);
                overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                reject(jqXHR, statusText, errorThrown);
            });
        });
    };

    // tagを元にtargetを設定
    set_targets(geojsons) {
        console.log("overPassCont: set_targets: " + geojsons.length);
        if (Object.keys(overPassCont.tags).length == 0) {		// initialize
            let osmkeys = Object.keys(Conf.osm).filter(key => Conf.osm[key].file == undefined);
            osmkeys.forEach(target => {
                Conf.osm[target].tags.forEach(function (tag) {
                    let noarea = tag.indexOf("&&noarea") > -1 ? true : false;		// noarea flag確認
                    let tag_kv = tag.split("=").concat([""]);
                    tag_kv[1] = tag_kv[1].replace('&&noarea', '');				// noarea flag削除
                    let tag_not = tag_kv[0].slice(-1) == "!" ? true : false;
                    tag_kv[0] = tag_kv[0].replace(/!/, "");
                    if (overPassCont.tags[tag_kv[0]] == undefined) {
                        overPassCont.tags[tag_kv[0]] = {};	// Key作成
                    }
                    if (overPassCont.tags[tag_kv[0]][tag_kv[1]] == undefined) {
                        overPassCont.tags[tag_kv[0]][tag_kv[1]] = { "noarea": [], "tag_not": false, "target": [] };	// val作成
                    }
                    let at = [target].concat(overPassCont.tags[tag_kv[0]][tag_kv[1]].target).filter(Boolean);
                    let nn = overPassCont.tags[tag_kv[0]][tag_kv[1]].noarea;			// 現在のnoarea
                    let na = noarea ? [target].concat(nn).filter(Boolean) : nn;		// noareaがあれば追加
                    overPassCont.tags[tag_kv[0]][tag_kv[1]] = { "noarea": na, "tag_not": tag_not, "target": at };
                });
            });
        }

        const common_arr = (arr1, arr2) => { return arr1.filter(element => arr2.includes(element)) };
        const remove_arr = (arr1, arr2) => { return arr1.filter(element => !arr2.includes(element)) };
        const check_target = (props, tag_key, tag_val) => {
            let target = overPassCont.tags[tag_key][tag_val].target;					// 先にtargetを取得
            let tag_not = overPassCont.tags[tag_key][tag_val].tag_not;					// notか判断
            let area_k = props.area !== undefined ? props.area == "yes" : false;	// areaか判断
            //if (area_k) console.log("area!");
            if (((props[tag_key] == tag_val ^ tag_not) || tag_val == "") && (props[tag_key] !== "no")) {
                let noarea = overPassCont.tags[tag_key][tag_val].noarea;
                let naflag = common_arr(noarea, target).length > 0 ? true : false;
                if (naflag && area_k) target = remove_arr(target, noarea);
            } else {
                target = [];
            };
            //if (tag_val == "pedestrian") console.log("area!");
            return target;
        };
        let targets = [];
        geojsons.forEach((val, idx) => {										// geojsonsだけ繰り返す
            Object.keys(overPassCont.tags).forEach(tag_key => {					// overpass tagsだけ繰り返す(key)
                if (val.properties[tag_key] !== undefined) { 					// タグ(key)がある場合
                    Object.keys(overPassCont.tags[tag_key]).forEach(tag_val => {	// タグ(value)だけ繰り返す
                        let target = check_target(val.properties, tag_key, tag_val);
                        if (target !== "") targets[idx] = targets[idx] == undefined ? target : target.concat(targets[idx]);
                    });
                };
            });
        });
        return targets;
    }

    get_target(ovanswer, target) {
        let geojson = ovanswer.geojson.filter(function (val, gidx) {
            let found = false;
            for (let tidx in ovanswer.targets[gidx]) {
                if (ovanswer.targets[gidx][tidx] == target) { found = true; break };
            };
            return found;
        });
        return geojson;
    }

    clear() {
        overPassCont.LastData = {};
    }
}
