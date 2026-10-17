"use strict";

// 編集モデルの座標順(lat,lng)を保ち、描画・操作はMapLibreへ渡す。
const MapEngine = (() => {
    const ll = value => Array.isArray(value) ? { lat: Number(value[0]), lng: Number(value[1]) } : value;
    const lnglat = value => { const p = ll(value); return [p.lng, p.lat]; };
    let serial = 0;
    class FeatureLayer {
        constructor(feature, options = {}) {
            this.feature = feature;
            this.options = { ...(typeof options.style === 'function' ? options.style(feature) : options) };
            this.id = ++serial;
            // Lightweight edit model; no SVG DOM is created on screen.
            this.element = { style: {}, setAttribute() {} };
        }
        addTo(map) { this.map = map; map.features.set(this.id, this); map.schedule(); return this; }
        on(type, fn) { this[type] = fn; return this; }
        getLayers() { return [this]; }
        eachLayer(fn) { fn(this); }
        getElement() { return this.element; }
        setStyle(style) { Object.assign(this.options, style); if (!this.map?.editorRenderer?.update(this)) this.map?.schedule(); return this; }
        bringToFront() { this.map?.schedule(); return this; }
        remove() { this.map?.features.delete(this.id); this.map?.schedule(); }
    }
    class MarkerLayer {
        constructor(position, options) { this.position = ll(position); this.options = options; }
        addTo(map) {
            this.map = map;
            const icon = this.options.icon;
            const element = document.createElement('div');
            element.className = `mapmaker-marker ${icon.className || ''}`;
            element.innerHTML = icon.html;
            if (icon.iconSize) { element.style.width = `${icon.iconSize[0]}px`; element.style.height = `${icon.iconSize[1]}px`; }
            const anchor = icon.iconAnchor || [0, 0];
            // MapLibre translate位置とアイコンのアンカー位置を分離する。
            const inner = document.createElement('div');
            while (element.firstChild) inner.appendChild(element.firstChild);
            inner.style.cssText = `position:relative;left:${-anchor[0]}px;top:${-anchor[1]}px`;
            element.appendChild(inner);
            element.mapmakerMarker = this;
            this.element = element;
            this.marker = new maplibregl.Marker({ element, anchor: 'top-left', draggable: this.options.draggable, pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
                .setLngLat(lnglat(this.position)).addTo(map.gl);
            this.marker.on('dragend', () => { if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview?.(); });
            if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview?.();
            return this;
        }
        on(type, fn) {
            if (type === 'click') this.element.addEventListener('click', e => { e.stopPropagation(); fn({ target: this, latlng: this.getLatLng(), originalEvent: e }); });
            else this.marker.on(type, e => fn({ ...e, target: this, latlng: this.getLatLng() }));
            return this;
        }
        getLatLng() { return this.marker?.getLngLat() || this.position; }
        setLatLng(value) { this.marker.setLngLat(lnglat(value)); return this; }
        getElement() { return this.element; }
        openPopup() { return this; }
        remove() { this.marker?.remove(); if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview?.(); }
    }
    class PopupLayer {
        setContent(content) { this.content = content; return this; }
        setLatLng(value) { this.position = lnglat(value); return this; }
        openOn(map) { map.closePopup(); map.popup = new maplibregl.Popup({ maxWidth: '420px' }).setLngLat(this.position).setHTML(this.content).addTo(map.gl); return this; }
    }
    class MapView {
        constructor(container, options) {
            this.features = new Map(); this.panes = {};
            this.vectorBasemapKey = Object.keys(Conf.tile).find(key => Conf.tile[key].style);
            // Ignore malformed stops; later entries win when a zoom is repeated.
            const configuredStops = Conf.default?.maxPitchByZoom;
            const stops = Array.isArray(configuredStops) ? configuredStops : [];
            this.maxPitchStops = [...new Map(stops.filter(stop =>
                Number.isFinite(stop?.zoom) && Number.isFinite(stop?.pitch) && stop.pitch >= 0 && stop.pitch <= 180
            ).map(stop => [stop.zoom, stop.pitch])).entries()].sort((a, b) => a[0] - b[0]);
            // Allow URL restoration first, then constrain using its actual zoom.
            const maxPitch = this.maxPitchStops.length ? Math.max(...this.maxPitchStops.map(stop => stop[1])) : 50;
            this.gl = new maplibregl.Map({ container, style: Conf.tile[this.vectorBasemapKey]?.style || { version: 8, sources: {}, layers: [] }, center: lnglat(options.center), zoom: options.zoom, maxZoom: 21, maxPitch, hash: true, locale: LANG === 'ja' ? {
                'Map.Title': '地図', 'NavigationControl.ZoomIn': '拡大', 'NavigationControl.ZoomOut': '縮小',
                'NavigationControl.ResetBearing': 'ドラッグして回転・傾斜、クリックで北向きに戻す',
                'GeolocateControl.FindMyLocation': '現在地を表示', 'GeolocateControl.LocationNotAvailable': '現在地を取得できません',
                'AttributionControl.ToggleAttribution': '出典を表示', 'Popup.Close': '閉じる'
            } : {}, attributionControl: { compact: true }, renderWorldCopies: false });
            this.updateMaxPitch();
            this.gl.on('zoom', () => this.updateMaxPitch());
            this.gl.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
            this.options = { crs: { project: p => {
                const lat = Math.max(-85.051129, Math.min(85.051129, p.lat));
                return { x: p.lng * Math.PI / 180 * 6378137, y: Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137 };
            } } };
            this.dragging = this.gl.dragPan;
            this.touchZoom = this.gl.touchZoomRotate;
            this.doubleClickZoom = this.gl.doubleClickZoom;
            this.scrollWheelZoom = this.gl.scrollZoom;
            this.zoomControl = { enable() {}, disable() {}, addTo() {}, remove() {}, setPosition() {} };
            this.gl.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
            this.gl.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right');
            this.gl.on('load', () => {
                const style = this.gl.getStyle();
                this.vectorBasemapStyleLayers = JSON.parse(JSON.stringify(style.layers));
                this.vectorBasemapLayers = style.layers.map(layer => ({ id: layer.id, type: layer.type, visibility: layer.layout?.visibility || 'visible' }));
                this.vectorBasemapProjection = style.projection || { type: 'mercator' };
                this.gl.addLayer({ id: 'mapmaker-camera', type: 'custom', renderingMode: '3d', render: (_gl, args) => { this.cameraMatrix = Array.from(args.defaultProjectionData.mainMatrix); } });
                this.ready = true; this.setBasemap(this.baseKey); this.schedule();
            });
            this.gl.on('pitchend', () => { if (this.ready) this.updateVectorBasemapVisibility(); });

        }
        updateMaxPitch() {
            const stops = this.maxPitchStops;
            let limit = stops.length ? stops[0][1] : 50;
            const zoom = this.gl.getZoom();
            for (let i = 1; i < stops.length; i++) {
                const [startZoom, startPitch] = stops[i - 1];
                const [endZoom, endPitch] = stops[i];
                if (zoom <= startZoom) break;
                const fraction = Math.min(1, (zoom - startZoom) / (endZoom - startZoom));
                limit = startPitch + (endPitch - startPitch) * fraction;
                if (zoom <= endZoom) break;
            }
            // setMaxPitch also lowers the current pitch if it exceeds the limit.
            if (this.gl.getMaxPitch() !== limit) this.gl.setMaxPitch(limit);
        }
        on(names, fn) { names.split(' ').forEach(name => this.gl.on(name, fn)); return this; }
        invalidateSize() { this.gl.resize(); }
        getZoom() { return this.gl.getZoom(); }
        getCenter() { return this.gl.getCenter(); }
        getBounds() { return this.gl.getBounds(); }
        getContainer() { return this.gl.getContainer(); }
        getSize() { const c = this.gl.getContainer(); return { x: c.clientWidth, y: c.clientHeight }; }
        setView(value, zoom) { this.gl.jumpTo({ center: lnglat(value), ...(zoom === undefined ? {} : { zoom }) }); }
        setZoom(zoom) { this.gl.setZoom(zoom); }
        panTo(value) { this.gl.panTo(lnglat(value)); }
        flyTo(value, zoom) { this.gl.flyTo({ center: lnglat(value), zoom, duration: 500 }); }
        latLngToLayerPoint(value) { return this.gl.project(lnglat(value)); }
        layerPointToLatLng(value) { return this.gl.unproject([value.x, value.y]); }
        containerPointToLatLng(value) { return this.layerPointToLatLng(Array.isArray(value) ? { x: value[0], y: value[1] } : value); }
        getPane(name) { return this.panes[name]; }
        createPane(name) { const node = document.createElement('div'); node.style.cssText = 'position:absolute;inset:0;pointer-events:none'; this.gl.getContainer().appendChild(node); return this.panes[name] = node; }
        closePopup() { this.popup?.remove(); this.popup = null; }
        highlightLocation(value, style) {
            const id = 'mapmaker-location-highlight';
            const data = turf.circle(lnglat(value), style.radius, { units: 'meters' });
            clearTimeout(this.highlightTimer);
            if (!this.gl.getSource(id)) {
                this.gl.addSource(id, { type: 'geojson', data });
                this.gl.addLayer({ id: `${id}-fill`, type: 'fill', source: id,
                    paint: { 'fill-color': style.fillColor || style.color, 'fill-opacity': Number(style.fillOpacity ?? .1) } });
                this.gl.addLayer({ id: `${id}-line`, type: 'line', source: id,
                    paint: { 'line-color': style.color, 'line-width': Number(style.weight ?? 3), 'line-opacity': Number(style.opacity ?? 1) } });
            } else {
                this.gl.getSource(id).setData(data);
                this.gl.moveLayer(`${id}-fill`);
                this.gl.moveLayer(`${id}-line`);
            }
            this.highlightTimer = setTimeout(() => {
                this.gl.getSource(id)?.setData({ type: 'FeatureCollection', features: [] });
            }, style.timer);
        }
        removeLayer(layer) { layer?.remove?.(); }
        hasLayer(layer) { return layer?.active === true || this.features.has(layer?.id); }
        schedule() { if (!this.ready || this.frame) return; this.frame = requestAnimationFrame(() => { this.frame = null; this.flush(); }); }
        updateVectorBasemapVisibility() {
            for (const layer of this.vectorBasemapLayers) {
                if (this.editorRenderer?.active && typeof mapMaker !== 'undefined' && mapMaker.customMode) continue;
                const visible = this.baseKey === this.vectorBasemapKey && (layer.type !== 'fill-extrusion' || this.gl.getPitch() > 0);
                this.gl.setLayoutProperty(layer.id, 'visibility', visible ? layer.visibility : 'none');
            }
        }
        setBasemap(key) {
            this.baseKey = key;
            if (!this.ready) return;
            this.updateVectorBasemapVisibility();
            // 編集用のSVG投影はメルカトル座標を使う。位置決めのベクトル地図は元の投影を保つ。
            this.gl.setProjection(key === this.vectorBasemapKey && !(typeof mapMaker !== 'undefined' && mapMaker.customMode) ? this.vectorBasemapProjection : { type: 'mercator' });
            for (const [name, conf] of Object.entries(Conf.tile)) {
                if (conf.style) continue;
                const id = `basemap-${name}`;
                if (!this.gl.getSource(id)) {
                    this.gl.addSource(id, { type: 'raster', tiles: [conf.url.replace('{s}', 'a')], tileSize: 256, maxzoom: conf.maxNativeZoom, attribution: conf.copyright });
                    this.gl.addLayer({ id, type: 'raster', source: id, paint: conf.filter ? { 'raster-saturation': -0.9, 'raster-contrast': 0.3, 'raster-brightness-max': 0.8 } : {} }, this.gl.getStyle().layers[0]?.id);
                }
                this.gl.setLayoutProperty(id, 'visibility', key === name ? 'visible' : 'none');
            }
        }
        flush() {
            // Coalesce model changes into a native renderer synchronization.
            if (typeof mapMaker !== 'undefined') mapMaker.queueExportPreview?.();
        }

    }
    return {
        map: (id, options) => new MapView(id, options),
        geoJSON: (feature, options) => new FeatureLayer(feature, options),
        divIcon: options => options,
        marker: (position, options) => new MarkerLayer(position, options),
        LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
        latLng: (lat, lng) => ({ lat, lng }), point: (x, y) => ({ x, y }),
        responsivePopup: () => new PopupLayer(),
        circle: (value, style) => new FeatureLayer(turf.circle(lnglat(value), style.radius, { units: 'meters' }), style),
        polyline: (values, style) => new FeatureLayer({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: values.map(lnglat) } }, style)
    };
})();
