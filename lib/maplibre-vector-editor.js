"use strict";

// Reuse the loaded vector source. OSM models remain the authority for saved geometry.
class MapLibreVectorEditor {
    constructor(view) {
        this.view = view;
        this.layers = [];
        this.targets = new Map();
        this.byTarget = new Map();
        this.hidden = new Set();
        this.hitIds = [];
        this.layerOrders = new Map();
    }
    static category(layer, properties = {}) {
        const source = layer['source-layer'], cls = properties.class;
        if (layer.type === 'background') return 'background';
        if (layer.type === 'symbol') return null;
        if (source === 'building') return 'building';
        if (source === 'water') return cls === 'ocean' ? 'sea' : 'waterArea';
        if (source === 'waterway') return 'waterLine';
        if (source === 'park') return 'park';
        if (source === 'landcover') {
            if (['wood','forest','tree','scrub'].includes(cls)) return 'forest';
            if (['crop','farmland'].includes(cls)) return 'farmland';
            if (['grass','wetland'].includes(cls)) return cls === 'wetland' ? 'wetland' : 'garden';
            return null;
        }
        if (source === 'landuse') {
            if (cls === 'parking') return 'parking';
            if (['playground','stadium','pitch','track'].includes(cls)) return 'park';
            if (['farmland','farmyard','orchard','vineyard'].includes(cls)) return 'farmland';
            if (['grass','meadow','garden','recreation_ground','village_green'].includes(cls)) return 'garden';
            return 'site';
        }
        if (source === 'transportation') {
            if (['rail','transit'].includes(cls)) return 'railway';
            if (cls === 'motorway') return 'highway_motorway';
            if (['trunk','primary'].includes(cls)) return 'highway_primary';
            if (['secondary','tertiary'].includes(cls)) return 'highway_standard';
            if (['minor','street','street_limited'].includes(cls)) return 'highway_substandard';
            if (properties.subclass === 'steps') return 'highway_step';
            if (layer.type === 'fill' && properties.subclass === 'pedestrian') return 'pedestrian';
            if (['path','service','track','pedestrian','pier','bridge'].includes(cls)) return 'highway_alley';
        }
        return null;
    }
    static osmKey(feature) {
        const raw = feature?.id ?? feature?.properties?.id;
        return /^(node|way|relation)\/\d+$/.test(String(raw)) ? String(raw) : null;
    }
    static bounds(geometry) {
        const bounds = [Infinity, Infinity, -Infinity, -Infinity];
        const visit = coordinates => {
            if (typeof coordinates?.[0] === 'number') {
                bounds[0] = Math.min(bounds[0],coordinates[0]); bounds[1] = Math.min(bounds[1],coordinates[1]);
                bounds[2] = Math.max(bounds[2],coordinates[0]); bounds[3] = Math.max(bounds[3],coordinates[1]);
            } else if (Array.isArray(coordinates)) coordinates.forEach(visit);
        };
        visit(geometry?.coordinates); return bounds;
    }
    static overlaps(a,b) {
        return a[2] >= b[0] && b[2] >= a[0] && a[3] >= b[1] && b[3] >= a[1];
    }
    targetKey(target) { return `${target.source}:${target.sourceLayer}:${target.id}`; }
    static matchesFilter(filter, feature) {
        if (!filter?.length) return true;
        const [op, field, ...values] = filter;
        if (op === 'all') return filter.slice(1).every(item => this.matchesFilter(item,feature));
        if (op === 'any') return filter.slice(1).some(item => this.matchesFilter(item,feature));
        if (op === 'none') return !filter.slice(1).some(item => this.matchesFilter(item,feature));
        const value = field === '$type' ? feature.geometry.type.replace('Multi','') : field === '$id' ? feature.id : feature.properties?.[field];
        if (op === 'has' || op === '!has') return op === 'has' ? value !== undefined : value === undefined;
        if (op === 'in' || op === '!in') return op === 'in' ? values.includes(value) : !values.includes(value);
        if (op === '==') return value === values[0];
        if (op === '!=') return value !== values[0];
        if (op === '>=') return value >= values[0];
        if (op === '>') return value > values[0];
        if (op === '<=') return value <= values[0];
        if (op === '<') return value < values[0];
        return false;
    }
    canRender(feature, sourceLayer, model) {
        // Tile geometry and current OSM geometry can overlap under different IDs.
        // Build all 3D buildings from the authoritative models, as the exporter does.
        if (sourceLayer === 'building' && this.view.threeD) return false;
        const zoom = this.view.getZoom?.() ?? 18;
        const polygon = /Polygon$/.test(feature.geometry.type);
        return (this.view.vectorBasemapStyleLayers || []).some(layer => {
            if (layer['source-layer'] !== sourceLayer || zoom < (layer.minzoom ?? 0) || zoom >= (layer.maxzoom ?? Infinity)) return false;
            if (polygon && Number(model.options.fillOpacity ?? 1) > 0) {
                if (sourceLayer === 'building' && this.view.threeD ? layer.type !== 'fill-extrusion' : layer.type !== 'fill') return false;
            } else if (layer.type !== 'line') return false;
            return MapLibreVectorEditor.matchesFilter(layer.filter,feature);
        });
    }
    match(feature, sourceLayer, index) {
        if (!Number.isSafeInteger(Number(feature.id))) return null;
        const id = Number(feature.id), candidates = new Set();
        const raw = Math.abs(id), divided = Math.floor(raw / 10), suffix = raw % 10;
        // OMT installations have both raw and base-10 IDs. Validate the candidate
        // against the actual OSM models and geometry rather than trusting a suffix.
        for (const type of ['way','relation','node']) {
            candidates.add(`${type}/${raw}`);
            if (suffix === 0 || {node:1,way:2,relation:3}[type] === suffix) candidates.add(`${type}/${divided}`);
        }
        const bounds = MapLibreVectorEditor.bounds(feature.geometry), matches = [];
        for (const candidate of candidates) {
            const models = index.get(candidate);
            if (!models) continue;
            const base = models.find(model => !model.overstyle);
            if (!base || base.mapmaker.pointStyleName || !MapLibreVectorEditor.overlaps(bounds, MapLibreVectorEditor.bounds(base.feature.geometry))) continue;
            const expected = MapLibreVectorEditor.category({ 'source-layer': sourceLayer, type: /Polygon$/.test(feature.geometry.type) ? 'fill' : 'line' },feature.properties);
            if (base.mapmaker.key !== expected || !this.canRender(feature,sourceLayer,base)) continue;
            matches.push({ models, base });
        }
        return matches.length === 1 ? matches[0] : null;
    }
    bind(models) {
        this.clear(false);
        const originals = this.view.vectorBasemapStyleLayers || [];
        const index = new Map();
        for (const model of models.values()) {
            const key = MapLibreVectorEditor.osmKey(model.mapmaker?.sourceFeature || model.feature);
            if (key) { if (!index.has(key)) index.set(key,[]); index.get(key).push(model); }
        }
        const sources = new Map();
        for (const layer of originals) if (layer.source && layer['source-layer']) {
            const key = `${layer.source}:${layer['source-layer']}`;
            if (!sources.has(key)) sources.set(key,layer);
        }
        for (const layer of sources.values()) {
            for (const feature of this.view.gl.querySourceFeatures(layer.source,{sourceLayer:layer['source-layer']})) {
                const match = this.match(feature,layer['source-layer'],index);
                if (!match) continue;
                const target = { source:layer.source, sourceLayer:layer['source-layer'], id:feature.id };
                const key = this.targetKey(target);
                this.byTarget.set(key,match.base);
                // Only geometry actually accepted by this native layer is an
                // ordering anchor; transportation layers contain many categories.
                for (const native of originals) {
                    if (native.source !== layer.source || native['source-layer'] !== layer['source-layer'] ||
                        !['fill','line'].includes(native.type) || !this.visible(native) ||
                        !MapLibreVectorEditor.matchesFilter(native.filter,feature)) continue;
                    const model = match.models.find(model => !!model.overstyle === this.isOverlay(native,match.base.mapmaker.key)) || match.base;
                    if (!model.mapmaker.drawOrder) continue;
                    const order = { ...model.mapmaker.drawOrder, featureOrder: 0, serial: 0 };
                    const previous = this.layerOrders.get(native.id);
                    if (!previous || compareMapMakerDrawOrder(order,previous) < 0) this.layerOrders.set(native.id,order);
                }
                for (const model of match.models) {
                    if (!this.targets.has(model.id)) this.targets.set(model.id,new Map());
                    this.targets.get(model.id).set(key,target);
                }
            }
        }
        this.layers = originals.filter(layer => this.view.gl.getLayer(layer.id));
        return this.targets;
    }
    beforeLayer(order) {
        const candidate = { ...order, featureOrder: 0, serial: 0 };
        return this.layers.find(layer => this.layerOrders.has(layer.id) &&
            this.view.gl.getLayer(layer.id) && compareMapMakerDrawOrder(candidate,this.layerOrders.get(layer.id)) < 0)?.id;
    }
    activate(models) {
        for (const layer of this.layers) {
            if (!this.view.gl.getLayer(layer.id)) continue;
            this.paint(layer);
            if (layer.type === 'fill-extrusion' && layer['source-layer'] === 'building') {
                const id = `${layer.id}-editor-hit`;
                this.view.gl.addLayer({ id, type:'fill-extrusion', source:layer.source, 'source-layer':layer['source-layer'],
                    filter:['in',['id'],['literal',[]]], paint:{'fill-extrusion-opacity':0,
                        'fill-extrusion-height':['coalesce',['feature-state','height'],['get','render_height'],3]} });
                this.hitIds.push(id);
            }
        }
        for (const [id, targets] of this.targets) {
            const model = models.get(id);
            if (model.overstyle) continue;
            if (model.mapmaker.key === 'building' || Number(model.options.opacity) === 0) this.update(model,false);
        }
        for (const layer of this.layers) if (layer.type === 'fill-extrusion') this.filter(layer);
    }
    expression(layer, property) {
        // Evaluate category defaults in JS, but select them per tile feature in GL.
        const cases = [], mapping = this.categoryCases(layer);
        for (const [condition,key] of mapping) {
            if (!Layers[key]) continue;
            const style = SVGCont.svg_style(key, this.isOverlay(layer,key));
            let value;
            if (property === 'fill') value = style.fillColor || style.color || '#000000';
            if (property === 'stroke') value = style.color || '#000000';
            if (property === 'width') value = Number(style.weight ?? 1);
            if (property === 'opacity') value = Number(Layers[key].opacity === '' ? 1 : Layers[key].opacity ?? 1);
            cases.push(condition,value);
        }
        return cases.length ? ['case',...cases, property === 'opacity' || property === 'width' ? 0 : '#000000'] :
            property === 'opacity' || property === 'width' ? 0 : '#000000';
    }
    isOverlay(layer,key) {
        return !!Conf.style[LayerCont.palette]?.[key]?.overstyle && !/casing|case/.test(layer.id) &&
            (key !== 'railway' || /hatching/.test(layer.id));
    }
    categoryCases(layer) {
        const source = layer['source-layer'];
        const match = (values,key) => [['in',['get','class'],['literal',values]],key];
        if (source === 'water') return [match(['ocean'],'sea'),[true,'waterArea']];
        if (source === 'landcover') return [match(['wood','forest','tree','scrub'],'forest'),match(['crop','farmland'],'farmland'),match(['wetland'],'wetland'),match(['grass'],'garden')];
        if (source === 'landuse') return [match(['parking'],'parking'),match(['playground','stadium','pitch','track'],'park'),match(['farmland','farmyard','orchard','vineyard'],'farmland'),match(['grass','meadow','garden','recreation_ground','village_green'],'garden'),[true,'site']];
        if (source === 'transportation') return [match(['rail','transit'],'railway'),match(['motorway'],'highway_motorway'),match(['trunk','primary'],'highway_primary'),match(['secondary','tertiary'],'highway_standard'),match(['minor','street','street_limited'],'highway_substandard'),[['==',['get','subclass'],'steps'],'highway_step'],...(layer.type === 'fill' ? [[['==',['get','subclass'],'pedestrian'],'pedestrian']] : []),match(['path','service','track','pedestrian','pier','bridge'],'highway_alley')];
        const key = MapLibreVectorEditor.category(layer);
        return key ? [[true,key]] : [];
    }
    visible(layer) {
        if (layer.type === 'symbol' || !this.categoryCases(layer).length) return false;
        if (layer['source-layer'] === 'building') return layer.type === 'fill-extrusion' ? this.view.threeD : !this.view.threeD;
        return true;
    }
    paint(layer) {
        const gl = this.view.gl;
        gl.setLayoutProperty(layer.id,'visibility',this.visible(layer) ? 'visible' : 'none');
        if (!this.categoryCases(layer).length) return;
        const value = name => ['coalesce',['feature-state',name],this.expression(layer,name)];
        const opacity = ['*',this.expression(layer,'opacity'),['coalesce',['feature-state','opacity'],1]];
        const paint = layer.type === 'background' ? {'background-color':Layers.background.color || '#fff','background-opacity': Number(Layers.background.opacity ?? 1)}
            : layer.type === 'line' ? {'line-color':value('stroke'),'line-width':value('width'),'line-opacity':opacity}
            : layer.type === 'fill' ? {'fill-color':value('fill'),'fill-opacity':opacity, 'fill-outline-color':LayerCont.palette === 'coloring' ? value('stroke') : null}
            : layer.type === 'fill-extrusion' ? {'fill-extrusion-color':value('fill'),
                'fill-extrusion-opacity':LayerCont.palette === 'coloring' ? 0 : Number(Layers.building.opacity === '' ? 1 : Layers.building.opacity ?? 1),
                'fill-extrusion-height':['coalesce',['feature-state','height'],['case',['>', ['coalesce',['get','render_height'],0],0],['get','render_height'],3]],
                'fill-extrusion-base':0,'fill-extrusion-vertical-gradient':false} : {};
        for (const [key,val] of Object.entries(paint)) {
            if (key !== 'fill-extrusion-vertical-gradient') gl.setPaintProperty(layer.id,`${key}-transition`,{duration:0,delay:0});
            gl.setPaintProperty(layer.id,key,val);
        }
        this.filter(layer);
    }
    static filterExpression(filter) {
        if (!filter?.length) return true;
        const [op, field, ...values] = filter;
        if (['all','any','none'].includes(op)) {
            const nested = filter.slice(1).map(item => MapLibreVectorEditor.filterExpression(item));
            return op === 'none' ? ['!', ['any',...nested]] : [op,...nested];
        }
        const get = field === '$type' ? ['geometry-type'] : field === '$id' ? ['id'] : ['get',field];
        if (op === 'has') return ['has',field];
        if (op === '!has') return ['!', ['has',field]];
        if (op === 'in' || op === '!in') {
            const expression = ['in',get,['literal',values]];
            return op === '!in' ? ['!',expression] : expression;
        }
        return [op,get,...values];
    }
    filter(layer) {
        if (!layer.source || !layer['source-layer']) return;
        const prefix = `${layer.source}:${layer['source-layer']}:`;
        const bound = [...this.byTarget.keys()].filter(key => key.startsWith(prefix)).map(key => Number(key.slice(key.lastIndexOf(':')+1)));
        const ids = [...this.hidden].filter(key => key.startsWith(`${layer.source}:${layer['source-layer']}:`)).map(key => Number(key.slice(key.lastIndexOf(':')+1)));
        const original = MapLibreVectorEditor.filterExpression(layer.filter);
        const filter = ['all',original,['in',['id'],['literal',bound]]];
        if (layer.type === 'fill-extrusion') filter.push(['!', ['in',['id'],['literal',ids]]]);
        this.view.gl.setFilter(layer.id,filter);
        const hitId = `${layer.id}-editor-hit`;
        if (layer.type === 'fill-extrusion' && this.view.gl.getLayer(hitId)) {
            this.view.gl.setFilter(hitId, ['all', original, ['in',['id'],['literal',ids]]]);
            this.view.gl.setLayoutProperty(hitId,'visibility',this.visible(layer) && Number(Layers.building.opacity === '' ? 1 : Layers.building.opacity ?? 1) > 0 ? 'visible' : 'none');
        }
    }
    update(model, refreshFilter = true) {
        const targets = this.targets.get(model.id);
        if (!targets) return false;
        const properties = { opacity:Number(model.options.opacity ?? 1), height:getMapMakerBuildingHeight(model.feature,Conf.default.birdseye) };
        for (const target of targets.values()) {
            const key = this.targetKey(target);
            if (properties.opacity === 0) this.hidden.add(key); else this.hidden.delete(key);
            this.view.gl.setFeatureState(target,properties);
        }
        if (refreshFilter && model.mapmaker.key === 'building') for (const layer of this.layers) if (layer['source-layer'] === 'building' && layer.type === 'fill-extrusion') this.filter(layer);
        return true;
    }
    refresh(key) {
        for (const layer of this.layers) if (!key || this.categoryCases(layer).some(([,category]) => category === key)) this.paint(layer);
        this.view.gl.triggerRepaint();
    }
    modelFor(feature) {
        return this.byTarget.get(this.targetKey({source:feature.source || feature.layer?.source,sourceLayer:feature.sourceLayer || feature.layer?.['source-layer'],id:feature.id}));
    }
    clear(restore = true) {
        const gl = this.view.gl;
        for (const [id,targets] of this.targets) for (const target of targets.values()) gl.removeFeatureState(target);
        for (const id of this.hitIds) if (gl.getLayer(id)) gl.removeLayer(id);
        for (const layer of this.layers) if (restore && gl.getLayer(layer.id)) {
            const current = gl.getLayer(layer.id);
            // Reset every overridden property, including properties absent in the original.
            const keys = layer.type === 'symbol' || !this.categoryCases(layer).length ? [] : layer.type === 'background' ? ['background-color','background-opacity'] : layer.type === 'line' ? ['line-color','line-width','line-opacity'] : layer.type === 'fill' ? ['fill-color','fill-opacity','fill-outline-color'] : ['fill-extrusion-color','fill-extrusion-opacity','fill-extrusion-height','fill-extrusion-base','fill-extrusion-vertical-gradient'];
            for (const key of keys) {
                if (key !== 'fill-extrusion-vertical-gradient') gl.setPaintProperty(layer.id,`${key}-transition`,{duration:0,delay:0});
                gl.setPaintProperty(layer.id,key,layer.paint?.[key] ?? null);
            }
            gl.setLayoutProperty(layer.id,'visibility',layer.layout?.visibility || 'visible');
            gl.setFilter(layer.id,layer.filter || null);
        }
        this.layers = []; this.targets.clear(); this.byTarget.clear(); this.hidden.clear(); this.hitIds = []; this.layerOrders.clear();
    }
}
