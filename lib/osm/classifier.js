"use strict";

// Data-only OSM classification. No application globals or browser APIs.
class OsmClassifier {
    constructor(osm = {}) { this.osm = osm; this.tags = {}; }
    attachBuildingRelations(geojson,osmxml) {
        const byId=new Map(geojson.map(feature=>[feature.id,feature]));
        for(const element of osmxml.elements || []) {
            if(element.type!=='relation' || element.tags?.type!=='building')continue;
            for(const member of element.members || []) {
                if(!['outline','part'].includes(member.role))continue;
                const feature=byId.get(`${member.type}/${member.ref}`);
                if(!feature)continue;
                feature.mapmakerBuildingRelations ||= [];
                feature.mapmakerBuildingRelations.push({id:`relation/${element.id}`,role:member.role});
            }
        }
        return geojson;
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
        if (Object.keys(this.tags).length == 0) {		// initialize
            let osmkeys = Object.keys(this.osm).filter(key => this.osm[key].file == undefined);
            osmkeys.forEach(target => {
                this.osm[target].tags.forEach(tag => {
                    let noarea = tag.indexOf("&&noarea") > -1 ? true : false;
                    let area = tag.indexOf("&&area") > -1 ? true : false;
                    if (area) {
                        console.log("overPassCont: set_targets: area: " + tag);
                    }

                    let tag_kv = tag.split("=").concat([""]);
                    tag_kv[1] = tag_kv[1].replace('&&noarea', '').replace('&&area', '');

                    let tag_not = tag_kv[0].slice(-1) == "!" ? true : false;
                    tag_kv[0] = tag_kv[0].replace(/!/, "");

                    if (this.tags[tag_kv[0]] == undefined) {
                        this.tags[tag_kv[0]] = {};
                    }
                    if (this.tags[tag_kv[0]][tag_kv[1]] == undefined) {
                        this.tags[tag_kv[0]][tag_kv[1]] = {
                            "noarea": [],
                            "area": [],
                            "tag_not": false,
                            "target": []
                        };
                    }

                    let at = [target].concat(this.tags[tag_kv[0]][tag_kv[1]].target).filter(Boolean);
                    let nn = this.tags[tag_kv[0]][tag_kv[1]].noarea;
                    let aa = this.tags[tag_kv[0]][tag_kv[1]].area;

                    let na = noarea ? [target].concat(nn).filter(Boolean) : nn;
                    let ar = area ? [target].concat(aa).filter(Boolean) : aa;

                    this.tags[tag_kv[0]][tag_kv[1]] = {
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
            let rule = this.tags[tag_key][tag_val];
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
            Object.keys(this.tags).forEach(tag_key => {					// overpass tagsだけ繰り返す(key)
                if (val.properties[tag_key] !== undefined) { 					// タグ(key)がある場合
                    Object.keys(this.tags[tag_key]).forEach(tag_val => {	// タグ(value)だけ繰り返す
                        let target = check_target(val.properties, tag_key, tag_val);
                        if (target !== "") targets[idx] = targets[idx] == undefined ? target : target.concat(targets[idx]);
                    });
                };
            });
        });
        return targets;
    }

}
