"use strict";

// Persistent MapLibre editor. SVG is generated only when saving.
class MapLibreEditorRenderer {
    constructor(view) {
        this.view = view;
        this.vector = new MapLibreVectorEditor(view);
        this.originalLight = view.gl.getLight?.();
        this.sourceId = 'mapmaker-editor-data';
        this.hitSourceId = 'mapmaker-editor-hit-data';
        this.generation = 0;
        this.hitLayerId = null;
        this.buildings = new Set();
        this.hidden = new Set();
        this.data = new Map();
        this.layerIds = [];
        this.models = new Map();
        this.active = false;
        view.gl.on('click', event => this.click(event));
    }
    color(value, opaque = false) {
        const color = value || '#000';
        const key = typeof color === 'string' ? `${opaque}:${color}` : null;
        this.colorCache ||= new Map();
        if (key !== null && this.colorCache.has(key)) return this.colorCache.get(key);
        let result;
        try { result = opaque ? chroma(color).hex('rgb') : chroma(color).css(); }
        catch { result = '#000000'; }
        if (key !== null) {
            if (this.colorCache.size >= 256) this.colorCache.delete(this.colorCache.keys().next().value);
            this.colorCache.set(key, result);
        }
        return result;
    }
    treeFeature(model) {
        const feature = model.mapmaker?.sourceFeature;
        return model.mapmaker?.pointStyleName === 'tree' && feature?.geometry?.type === 'Point' ? feature : null;
    }
    properties(model, treePart = null) {
        const opt = model.options;
        const tree = treePart ? getMapMakerTreeParts(this.treeFeature(model)).find(part => part.name === treePart) : null;
        const fill = treePart === 'trunk' ? getMapMakerTreeTrunkColor() : isMapMakerWall(model.feature) ? opt.color : opt.fillColor || opt.color;
        return { fill: this.color(fill), solidFill: this.color(fill, true),
            stroke: this.color(opt.color), width: Number(opt.weight ?? 1),
            fillOpacity: Number(opt.fillOpacity ?? 1), opacity: Number(opt.opacity ?? 1),
            base: tree?.base ?? 0,
            height: tree?.height ?? getMapMakerBuildingHeight(model.feature, Conf.default.birdseye) };
    }
    value(name) { return ['coalesce', ['feature-state', name], ['get', name]]; }
    dashArray(model) {
        const dash = model.options.dashArray;
        if (dash == null || dash === '') return null;
        const parts = (Array.isArray(dash) ? dash : String(dash).trim().split(/[ ,]+/)).map(Number);
        // SVG treats an all-zero dash pattern as a solid stroke. MapLibre must
        // omit/reset line-dasharray, otherwise the railway's base disappears.
        if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0) || !parts.some(n => n > 0)) return null;
        return parts.map(n => n / Math.max(.01, Number(model.options.weight) || 1));
    }
    update(model) {
        if (!this.active || !this.models.has(model.id)) return false;
        if (this.vector.update(model)) return true;
        const tree = this.view.threeD && this.treeFeature(model);
        const properties = this.properties(model, tree ? 'crown' : null);
        if (this.buildings.has(model.id)) {
            const changed = properties.opacity === 0 ? !this.hidden.has(model.id) : this.hidden.has(model.id);
            if (properties.opacity === 0) this.hidden.add(model.id); else this.hidden.delete(model.id);
            if (changed) {
                const groupIds = new Set([this.data.get(model.id)?.properties.group,
                    this.data.get(`${model.id}-trunk`)?.properties.group]);
                for (const entry of this.entries) if (groupIds.has(entry.group.id)) this.applyFilter(entry);
                this.applyHitFilter();
            }
        }
        this.view.gl.setFeatureState({ source: this.sourceId, id: model.id }, properties);
        if (tree) this.view.gl.setFeatureState({ source: this.sourceId, id: `${model.id}-trunk` }, this.properties(model, 'trunk'));
        this.outlines?.update(model);
        return true;
    }
    applyFilter(entry) {
        const hidden = [...this.hidden].filter(id => this.data.get(id)?.properties.group === entry.group.id ||
            this.data.get(`${id}-trunk`)?.properties.group === entry.group.id);
        this.view.gl.setFilter(entry.id, ['all', ['==', ['get', 'group'], entry.group.id],
            ['!', ['in', ['get', 'modelId'], ['literal', hidden]]]]);
    }
    setCategoryVisibility(key) {
        if (!this.active) return false;
        this.vector.refresh(key);
        const visible = Layers[key].opacity === '' || Number(Layers[key].opacity ?? 1) > 0;
        for (const entry of this.entries) if (entry.group.key === key) {
            this.view.gl.setLayoutProperty(entry.id, 'visibility', visible ? 'visible' : 'none');
        }
        this.applyHitFilter();
        this.outlines?.updateMany([...this.models.values()].filter(model => model.mapmaker.key === key));
        this.view.gl.triggerRepaint();
        return true;
    }
    applyHitFilter() {
        if (!this.hitLayerId || !this.view.gl.getLayer(this.hitLayerId)) return;
        const ids = [...this.hidden].filter(id => {
            const key = this.models.get(id)?.mapmaker.key || this.view.features.get(id)?.mapmaker.key;
            return key && (Layers[key].opacity === '' || Number(Layers[key].opacity ?? 1) > 0);
        });
        // Even near-transparent extrusions write depth. Never overlap visible roofs.
        this.view.gl.setFilter(this.hitLayerId, ['in', ['get', 'modelId'], ['literal', ids]]);
    }
    refreshCategory(key) {
        if (!this.active) return false;
        const models = [...this.models.values()].filter(model => model.mapmaker.key === key);
        const styles = new Map();
        for (const model of models) {
            const point = model.mapmaker.pointStyleName;
            const cacheKey = point || String(!!model.overstyle);
            if (!styles.has(cacheKey)) {
                const style = point ? getMapMakerPointStyle(point) : SVGCont.svg_style(key, !!model.overstyle);
                styles.set(cacheKey, point ? { color: style.lineColor, fillColor: style.fillColor, weight: style.width } : style);
            }
            Object.assign(model.options, styles.get(cacheKey));
        }
        for (const entry of this.entries.filter(entry => entry.group.key === key)) {
            const p = this.properties(entry.group.model, entry.group.treePart), type = entry.type;
            const categoryAlpha = Number(Layers[key].opacity === '' ? 1 : Layers[key].opacity ?? 1);
            const alpha = categoryAlpha === 0 ? 1 : categoryAlpha;
            this.view.gl.setLayoutProperty(entry.id, 'visibility', categoryAlpha === 0 ? 'none' : 'visible');
            const paint = type === 'fill-extrusion' ? {
                'fill-extrusion-color': p.solidFill,
                'fill-extrusion-opacity': LayerCont.palette === 'coloring' && !entry.group.treePart && !entry.group.wall ? 0 : alpha * (entry.group.treePart === 'trunk' ? 1 : chroma(entry.group.wall ? entry.group.model.options.color : entry.group.model.options.fillColor || entry.group.model.options.color).alpha())
            } : type === 'fill' ? { 'fill-color': p.fill, 'fill-opacity': ['*', alpha, this.value('fillOpacity')] }
                : { 'line-color': p.stroke, 'line-width': p.width, 'line-opacity': ['*', alpha, this.value('opacity')] };
            if (type === 'line') paint['line-dasharray'] = this.dashArray(entry.group.model);
            for (const [name, value] of Object.entries(paint)) this.view.gl.setPaintProperty(entry.id, name, value);
        }
        this.vector.refresh(key);
        this.applyHitFilter();
        this.outlines?.updateMany(models);
        this.view.gl.triggerRepaint();
        return true;
    }
    clear(preserveVector = false) {
        if (!preserveVector) this.vector.clear();
        this.active = false;
        this.entries = [];
        if (this.originalLight) this.view.gl.setLight(this.originalLight);
        for (const id of this.layerIds) if (this.view.gl.getLayer(id)) this.view.gl.removeLayer(id);
        this.layerIds = []; this.outlines = null;
        if (this.view.gl.getSource(this.sourceId)) this.view.gl.removeSource(this.sourceId);
        if (this.view.gl.getSource(this.hitSourceId)) this.view.gl.removeSource(this.hitSourceId);
        this.models.clear(); this.buildings.clear(); this.hidden.clear(); this.data.clear();
    }
    needsSync() {
        return !this.active || this.builtThreeD !== this.view.threeD ||
            this.models.size !== this.view.features.size ||
            [...this.models].some(([id, model]) => this.view.features.get(id) !== model);
    }
    async sync() {
        if (this.pending) return this.pending;
        if (!this.needsSync()) return;
        this.pending = this.build();
        try { await this.pending; } finally { this.pending = null; }
    }
    async build() {
        const gl = this.view.gl, groups = new Map(), features = [], hits = [], nextModels = new Map();
        if (gl.loaded && !gl.loaded()) await new Promise(resolve => gl.once('idle',resolve));
        if (!mapMaker.customMode) return;
        const vectorTargets = this.vector.bind(this.view.features);
        let count = 0;
        for (const model of this.view.features.values()) {
            if (!model.mapmaker || !model.feature?.geometry) continue;
            if (vectorTargets.has(model.id)) { nextModels.set(model.id, model); continue; }
            const order = model.mapmaker.drawOrder;
            const treeFeature = this.view.threeD && this.treeFeature(model);
            const parts = treeFeature ? getMapMakerTreeParts(treeFeature) : [{ geometry: model.feature.geometry }];
            for (const part of parts) {
                const treePart = part.name || null;
                const polygon = /Polygon$/.test(part.geometry.type);
                const wall = this.view.threeD && isMapMakerWall(model.feature);
                const building = !!treePart || wall || polygon && getMapMakerFeatureTag(model.feature, 'building') && getMapMakerFeatureTag(model.feature, 'building') !== 'no';
                const groupKey = [model.mapmaker.key, order.osmLayer, order.passOrder, model.mapmaker.pointStyleName || '', polygon, !!building, !!wall, treePart].join(':');
                let group = groups.get(groupKey);
                if (!group) {
                    group = { id: groups.size, key: model.mapmaker.key, order, polygon, building, wall, treePart, model };
                    groups.set(groupKey, group);
                }
                const base = model.overstyle ? Layers[group.key].svg[model.mapmaker.id - 1] : model;
                features.push({ type: 'Feature', id: treePart === 'trunk' ? `${model.id}-trunk` : model.id,
                    geometry: wall ? getMapMakerWallGeometry(model.feature) : part.geometry,
                    properties: { ...this.properties(model, treePart), group: group.id, modelId: model.id, clickId: base?.id || model.id } });
                if (building) hits.push({ ...features[features.length - 1] });
            }
            nextModels.set(model.id, model);
            if (++count % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!mapMaker.customMode) return;
        // Double-buffer supplemental geometry: the old layers stay visible until
        // the new sources have loaded and rendered. The vector source is reused.
        const previous = { layers: this.layerIds, source: this.sourceId, hitSource: this.hitSourceId };
        const removePrevious = () => {
            for (const id of previous.layers) if (gl.getLayer(id)) gl.removeLayer(id);
            for (const id of [previous.source, previous.hitSource]) if (gl.getSource(id)) gl.removeSource(id);
        };
        const generation = ++this.generation;
        this.sourceId = `mapmaker-editor-data-${generation}`;
        this.hitSourceId = `mapmaker-editor-hit-data-${generation}`;
        this.layerIds = []; this.entries = []; this.outlines = null;
        this.models.clear(); this.buildings.clear(); this.hidden.clear(); this.data.clear();
        for (const f of features) this.data.set(f.id, f);
        for (const f of hits) { this.buildings.add(f.properties.modelId); if (f.properties.opacity === 0) this.hidden.add(f.properties.modelId); }
        gl.addSource(this.sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features },
            maxzoom: 21, tolerance: 0, buffer: 128 });
        gl.addSource(this.hitSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: hits }, maxzoom: 21, tolerance: 0, buffer: 128 });
        // SVG keeps roofs at their base color and shades every wall by 18%.
        // Zenith lighting gives all walls the same shade; neutral light also
        // compensates for MapLibre's small ambient color addition.
        gl.setLight({ anchor: 'viewport', color: '#f7f7f7', intensity: 0.18, position: [1.15, 0, 0] });
        const add = (group, type, paint, layout = {}) => {
            const id = `mapmaker-editor-${generation}-${group.id}-${type}`;
            gl.addLayer({ id, type, source: this.sourceId, filter: ['==', ['get', 'group'], group.id],
                layout: { ...layout, visibility: Number(Layers[group.key].opacity) === 0 && Layers[group.key].opacity !== '' ? 'none' : 'visible' }, paint },
                type === 'fill-extrusion' ? undefined : this.vector.beforeLayer(group.order));
            this.layerIds.push(id);
            this.entries.push({ id, group, type });
        };
        const opacity = group => Number(Layers[group.key].opacity === '' ? 1 : Layers[group.key].opacity ?? 1) || 1;
        const fillPaint = group => ({ 'fill-color': this.value('fill'), 'fill-opacity': ['*', opacity(group), this.value('fillOpacity')], 'fill-opacity-transition': { duration: 0 } });
        const sorted = [...groups.values()].sort((a, b) => compareMapMakerDrawOrder(a.order, b.order));
        for (const group of sorted) {
            if (group.polygon && !(group.building && this.view.threeD)) add(group, 'fill', fillPaint(group));
            const paint = { 'line-color': this.value('stroke'), 'line-width': this.value('width'),
                'line-opacity': ['*', opacity(group), this.value('opacity')], 'line-opacity-transition': { duration: 0 } };
            const dash = this.dashArray(group.model);
            if (dash) paint['line-dasharray'] = dash;
            if (!(group.building && this.view.threeD)) add(group, 'line', paint, {
                'line-cap': ['butt', 'round', 'square'].includes(group.model.options.lineCap) ? group.model.options.lineCap : 'round',
                'line-join': ['bevel', 'round', 'miter'].includes(group.model.options.lineJoin) ? group.model.options.lineJoin : 'round' });
        }
        for (const group of sorted.filter(g => g.building && this.view.threeD)) {
            const alpha = group.treePart === 'trunk' ? 1 : chroma(group.wall ? group.model.options.color : group.model.options.fillColor || group.model.options.color).alpha();
            add(group, 'fill-extrusion', { 'fill-extrusion-color': this.value('solidFill'),
                'fill-extrusion-opacity': LayerCont.palette === 'coloring' && !group.treePart && !group.wall ? 0 : opacity(group) * alpha,
                'fill-extrusion-base': ['case', ['>', this.value('opacity'), 0], this.value('base'), 0],
                'fill-extrusion-base-transition': { duration: 0 },
                'fill-extrusion-height': ['case', ['>', this.value('opacity'), 0], this.value('height'), 0],
                'fill-extrusion-height-transition': { duration: 0 }, 'fill-extrusion-vertical-gradient': false });
        }
        // Zero opacity skips all GPU depth writes; geometry remains available to hit testing.
        const hitId = `mapmaker-editor-hidden-building-hit-${generation}`;
        this.hitLayerId = hitId;
        gl.addLayer({ id: hitId, type: 'fill-extrusion', source: this.hitSourceId,
            filter: ['in', ['get', 'modelId'], ['literal', []]],
            paint: { 'fill-extrusion-opacity': 0, 'fill-extrusion-base': this.view.threeD ? ['get', 'base'] : 0, 'fill-extrusion-height': this.view.threeD ? ['get', 'height'] : 0 } });
        this.layerIds.push(hitId);
        if (this.view.threeD) {
            this.outlines = new MapLibreBuildingOutlines(this.view);
            this.outlines.id = `mapmaker-editor-building-outlines-${generation}`;
            await this.outlines.prepare([...nextModels.values()].filter(model => this.buildings.has(model.id) && !isMapMakerWall(model.feature) && !this.treeFeature(model)));
            if (!mapMaker.customMode) { this.clear(); removePrevious(); return; }
            gl.addLayer(this.outlines); this.layerIds.push(this.outlines.id);
        }
        for (const entry of this.entries) this.applyFilter(entry);
        this.builtThreeD = this.view.threeD;
        this.models = nextModels;
        this.applyHitFilter();
        this.active = true;
        await new Promise(resolve => gl.once('idle', resolve));
        if (!mapMaker.customMode) { this.clear(); removePrevious(); return; }
        this.vector.activate(nextModels);
        removePrevious();
        const container = this.view.getContainer?.();
        container?.setAttribute('data-mapmaker-renderer','maplibre');
        container?.setAttribute('data-vector-model-count',String(vectorTargets.size));
        container?.setAttribute('data-additional-feature-count',String(features.length));
    }
    click(event) {
        if (!this.active || !mapMaker.customMode || this.view.threeD || mapMaker.roughPreviewLocked ||
            typeof ManualPins !== 'undefined' && ManualPins.active) return;
        const ids = [...this.entries.map(entry => entry.id), this.hitLayerId,
            ...this.vector.layers.filter(layer => layer.type !== 'symbol').map(layer => layer.id), ...this.vector.hitIds];
        // Restore a hidden roof before considering visible geometry beneath it.
        const isHit = feature => feature.layer?.source === this.hitSourceId || this.vector.hitIds.includes(feature.layer?.id);
        const features = this.view.gl.queryRenderedFeatures(event.point, { layers: ids });
        features.sort((a, b) => Number(isHit(b)) - Number(isHit(a)));
        for (const feature of features) {
            const model = this.vector.modelFor(feature) || this.view.features.get(Number(feature.properties.clickId));
            if ((feature.layer?.source === this.hitSourceId || this.vector.hitIds.includes(feature.layer?.id)) && Number(model?.options.opacity) !== 0) continue;
            if (!model?.click || Layers[model.mapmaker.key].opacity !== '' && Number(Layers[model.mapmaker.key].opacity) === 0) continue;
            model.click({ target: model, originalEvent: event.originalEvent, latlng: event.lngLat });
            break;
        }
    }
}
