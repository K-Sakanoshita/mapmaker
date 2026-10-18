"use strict";
// OverPass Server Control(no cache)
// 2022/09/27 mapMakerにキャッシュ機能は時期尚早と判断
class OverPassControl {

    constructor() {
        this.UseServer = 0;
        this.LastData = {};
        this.tags = {};
        this.targetIndexes = new WeakMap();
    }

    getRetryCount() {
        return Math.max(0, Conf.system.OverPassServer.length * 2 - 1);
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
            let url = Conf.system.OverPassServer[overPassCont.UseServer] + `?data=[out:json][timeout:120][bbox:${maparea}];(${query});out body;>;out skel;`;
            console.log("overPassCont: GET: " + url);
            $.ajax({
                "type": 'GET', "dataType": 'json', "url": url, "cache": false, "timeout": 150000, "xhr": () => {
                    var xhr = new window.XMLHttpRequest();
                    xhr.addEventListener("progress", (evt) => {
                        console.log("overPassCont: Progress: " + evt.loaded);
                        if (progress !== undefined) progress(evt.loaded);
                    }, false);
                    return xhr;
                }
            }).done(async function (osmxml) {
                console.log("overPassCont: done.");
                try {
                    if (!Array.isArray(osmxml?.elements)) throw new Error('Invalid Overpass response');
                    if (osmxml.elements.length === 0) {
                        overPassCont.LastData = { "geojson": [], "targets": [] };
                        resolve(overPassCont.LastData);
                        return;
                    }
                    winCont.modal_text(glot.get('processing_message'), false);
                    await new Promise(resolve => setTimeout(resolve, 0));
                    overPassCont.LastData = await overPassCont.convertData(osmxml);
                    resolve(overPassCont.LastData);
                } catch (error) { error.retryable = false; reject(error); }
            }).fail(function (jqXHR, statusText, errorThrown) {
                console.log("overPassCont: " + statusText);
                overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                const status = jqXHR.status;
                const retryable = statusText !== 'abort' && (status === 0 || status === 408 || status === 429 || status >= 500);
                reject({ jqXHR, statusText, errorThrown, retryable });
            });
        });
    };

    convertData(osmxml) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./lib/map-data-worker.js?v=23', document.baseURI));
            worker.onmessage = ({ data }) => {
                worker.terminate();
                if (data.error) reject(new Error(data.error));
                else resolve(data.result);
            };
            worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Map data conversion failed')); };
            worker.postMessage({ osmxml, osm: Conf.osm });
        });
    }

    hasNegativeLevel(feature) {
        const level = feature?.properties?.level ?? feature?.properties?.tags?.level;
        if (level === undefined || level === null || level === "") return false;
        return String(level).split(/[;,]/).some(value => {
            const parsed = Number(value.trim());
            return Number.isFinite(parsed) && parsed < 0;
        });
    }

    isUnderground(feature) {
        const tag = key => feature?.properties?.[key] ?? feature?.properties?.tags?.[key];
        const text = key => String(tag(key) ?? '').trim().toLowerCase();
        const numbers = key => String(tag(key) ?? '').split(/[;,]/).map(value => value.trim())
            .filter(value => value !== '').map(Number).filter(Number.isFinite);
        const negativeLevel = this.hasNegativeLevel(feature);
        const groundLevel = numbers('level').includes(0);
        const entrance = feature?.geometry?.type === 'Point'
            && ((text('entrance') !== '' && text('entrance') !== 'no') || text('railway') === 'subway_entrance');
        // Keep the surface connection, rather than treating a ground-to-basement
        // staircase or entrance as a wholly underground segment.
        if (groundLevel && (text('highway') === 'steps' || entrance)) return false;
        if (negativeLevel || text('location') === 'underground') return true;
        if (entrance) return false;
        const tunnel = text('tunnel');
        if (['', 'no', 'false', '0', 'building_passage', 'avalanche_protector'].includes(tunnel)) return false;
        if (['yes', 'culvert', 'flooded'].includes(tunnel)) return true;
        // Other tunnel types need explicit below-ground evidence. A negative
        // layer alone is only relative ordering, so retain ordinary surface roads.
        return numbers('layer').some(value => value < 0);
    }

    // tagを元にtargetを設定
    set_targets(geojsons) {
        console.log("overPassCont: set_targets: " + geojsons.length);
        if (Object.keys(overPassCont.tags).length == 0) {		// initialize
            let osmkeys = Object.keys(Conf.osm).filter(key => Conf.osm[key].file == undefined);
            osmkeys.forEach(target => {
                Conf.osm[target].tags.forEach(function (tag) {
                    let noarea = tag.indexOf("&&noarea") > -1 ? true : false;
                    let area = tag.indexOf("&&area") > -1 ? true : false;
                    if (area) {
                        console.log("overPassCont: set_targets: area: " + tag);
                    }

                    let tag_kv = tag.split("=").concat([""]);
                    tag_kv[1] = tag_kv[1].replace('&&noarea', '').replace('&&area', '');

                    let tag_not = tag_kv[0].slice(-1) == "!" ? true : false;
                    tag_kv[0] = tag_kv[0].replace(/!/, "");

                    if (overPassCont.tags[tag_kv[0]] == undefined) {
                        overPassCont.tags[tag_kv[0]] = {};
                    }
                    if (overPassCont.tags[tag_kv[0]][tag_kv[1]] == undefined) {
                        overPassCont.tags[tag_kv[0]][tag_kv[1]] = {
                            "noarea": [],
                            "area": [],
                            "tag_not": false,
                            "target": []
                        };
                    }

                    let at = [target].concat(overPassCont.tags[tag_kv[0]][tag_kv[1]].target).filter(Boolean);
                    let nn = overPassCont.tags[tag_kv[0]][tag_kv[1]].noarea;
                    let aa = overPassCont.tags[tag_kv[0]][tag_kv[1]].area;

                    let na = noarea ? [target].concat(nn).filter(Boolean) : nn;
                    let ar = area ? [target].concat(aa).filter(Boolean) : aa;

                    overPassCont.tags[tag_kv[0]][tag_kv[1]] = {
                        "noarea": na,
                        "area": ar,
                        "tag_not": tag_not,
                        "target": at
                    };
                });
            });
        }

        const common_arr = (arr1, arr2) => { return arr1.filter(element => arr2.includes(element)) };
        const remove_arr = (arr1, arr2) => { return arr1.filter(element => !arr2.includes(element)) };

        const check_target = (props, tag_key, tag_val) => {
            let rule = overPassCont.tags[tag_key][tag_val];
            let target = rule.target;
            let tag_not = rule.tag_not;
            let area_k = props.area !== undefined ? props.area == "yes" : false;

            const tagMatches = props[tag_key] == tag_val;
            if (((tagMatches !== tag_not) || tag_val == "") && (props[tag_key] !== "no")) {
                let noarea = rule.noarea;
                let area = rule.area;

                let naflag = common_arr(noarea, target).length > 0;
                let aflag = common_arr(area, target).length > 0;

                if (naflag && area_k) target = remove_arr(target, noarea);
                if (aflag && !area_k) target = remove_arr(target, area);
            } else {
                target = [];
            }

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
        if (!ovanswer || !Array.isArray(ovanswer.geojson) || !Array.isArray(ovanswer.targets)) return [];
        let index = this.targetIndexes.get(ovanswer);
        if (!index) {
            index = new Map();
            ovanswer.geojson.forEach((feature, i) => {
                if (this.isUnderground(feature)) return;
                for (const key of new Set((ovanswer.targets[i] || []).map(String))) {
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push(feature);
                }
            });
            this.targetIndexes.set(ovanswer, index);
        }
        // Keep the previous API: callers receive their own array, in source order.
        return (index.get(String(target)) || []).slice();
    }

    clear() {
        this.targetIndexes = new WeakMap();
        overPassCont.LastData = {};
    }
}
