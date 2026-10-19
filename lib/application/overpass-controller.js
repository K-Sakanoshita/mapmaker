"use strict";
// 表示範囲の取得要求を組み立て、Workerへ渡し、取得結果のカテゴリ検索を提供する。
class OverPassControl {

    constructor() {
        this.UseServer = 0;
        this.LastData = {};
        this.targetIndexes = new WeakMap();
    }

    getRetryCount() {
        return Math.max(0, Conf.system.OverPassServer.length * 2 - 1);
    }

    acquisition(targets, zoom) { return planOsmAcquisition(Conf.osm, Conf.system.MapData, targets, zoom); }

    async get(targets, progress, zoom = map.getZoom()) {
        const LL = GeoCont.get_L();
        const request = this.acquisition(targets,zoom);
        if(!request.selectors.length)return this.LastData={geojson:[],targets:[]};
        const url = overpassQueryURL(Conf.system.OverPassServer[this.UseServer], request.selectors, LL);
        try {
            const size = map.getSize();
            this.LastData = await this.runDataWorker({url,osm:request.osm,config:request.config,zoom,
                viewport:[size.x ?? size.width,size.y ?? size.height]},progress);
            return this.LastData;
        } catch (error) {
            this.UseServer = (this.UseServer+1)%Conf.system.OverPassServer.length;
            throw error;
        }
    }

    convertData(osmxml) {
        return this.runDataWorker({osmxml,osm:Conf.osm});
    }

    runDataWorker(request, progress) {
        return MapDataWorkerClient.run(request, { progress,
            stage: () => winCont.modal_text(glot.get('processing_message'), false) });
    }

    classifier() {
        const osm = typeof Conf === 'undefined' ? {} : Conf.osm || {};
        if (!this.osmClassifier || this.osmClassifier.osm !== osm) this.osmClassifier = new OsmClassifier(osm);
        return this.osmClassifier;
    }
    attachBuildingRelations(features, osm) { return this.classifier().attachBuildingRelations(features, osm); }
    hasNegativeLevel(feature) { return this.classifier().hasNegativeLevel(feature); }
    isUnderground(feature) { return this.classifier().isUnderground(feature); }
    set_targets(features) { return this.classifier().set_targets(features); }

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
        this.LastData = {};
    }
}
