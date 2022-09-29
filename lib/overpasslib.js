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
			var LL = GeoCont.get_LL();
			let maparea = LL.SE.lat + ',' + LL.NW.lng + ',' + LL.NW.lat + ',' + LL.SE.lng;
			let query = "";
			targets.forEach(key => {
				if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => query += val + ";");
			});
			let url = Conf.system.OverPassServer[OvPassCnt.UseServer] + `?data=[out:json][timeout:90][bbox:${maparea}];(${query});out body meta;>;out skel;`;
			console.log("OvPassCnt: GET: " + url);
			$.ajax({
				"type": 'GET', "dataType": 'json', "url": url, "cache": false, "xhr": () => {
					var xhr = new window.XMLHttpRequest();
					xhr.addEventListener("progress", (evt) => {
						console.log("OvPassCnt: Progress: " + evt.loaded);
						if (progress !== undefined) progress(evt.loaded);
					}, false);
					return xhr;
				}
			}).done(function (data) {
				console.log("OvPassCnt: done.");
				if (data.elements.length == 0) { resolve(); return };
				let osmxml = data;
				let geojson = osmtogeojson(osmxml, { flatProperties: true });
				OvPassCnt.LastData = { "geojson": geojson.features, "targets": OvPassCnt.set_targets(geojson.features) };
				resolve(OvPassCnt.LastData);
			}).fail(function (jqXHR, statusText, errorThrown) {
				console.log("OvPassCnt: " + statusText);
				OvPassCnt.UseServer = (OvPassCnt.UseServer + 1) % Conf.system.OverPassServer.length;
				reject(jqXHR, statusText, errorThrown);
			});
		});
	};

	// tagを元にtargetを設定
	set_targets(geojson) {
		console.log("OvPassCnt: set_targets: " + geojson.length);
		if (Object.keys(OvPassCnt.tags).length == 0) {		// initialize
			let osmkeys = Object.keys(Conf.osm).filter(key => Conf.osm[key].file == undefined);
			osmkeys.forEach(target => {
				Conf.osm[target].tags.forEach(function (tag) {
					let tag_kv = tag.split("=").concat([""]);
					let tag_not = tag_kv[0].slice(-1) == "!" ? true : false;
					tag_kv[0] = tag_kv[0].replace(/!/, "");
					if (OvPassCnt.tags[tag_kv[0]] == undefined) {
						OvPassCnt.tags[tag_kv[0]] = {};	// Key作成
					}
					if (OvPassCnt.tags[tag_kv[0]][tag_kv[1]] == undefined) {
						OvPassCnt.tags[tag_kv[0]][tag_kv[1]] = { "target": "" };	// val作成
					}
					let at = [target].concat(OvPassCnt.tags[tag_kv[0]][tag_kv[1]].target).filter(Boolean);
					OvPassCnt.tags[tag_kv[0]][tag_kv[1]] = { "tag_not": tag_not, "target": at };
				});
			});
		}

		let targets = [];
		geojson.forEach((val, idx) => {
			Object.keys(OvPassCnt.tags).forEach(tag_key => {
				if (val.properties[tag_key] !== undefined) { // タグがある場合
					Object.keys(OvPassCnt.tags[tag_key]).forEach(tag_val => {
						let tag_not = OvPassCnt.tags[tag_key][tag_val].tag_not;
						if ((val.properties[tag_key] == tag_val ^ tag_not) || tag_val == "") {
							if (val.properties[tag_key] !== "no") {	// no velueは無視
								let target = OvPassCnt.tags[tag_key][tag_val].target;
								if (targets[idx] == undefined) { // 
									targets[idx] = target;
								} else {
									targets[idx] = target.concat(targets[idx]);
								};
							};
						};
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
		OvPassCnt.LastData = {};
	}
}
var OvPassCnt = new OverPassControl();
