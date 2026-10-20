"use strict";

// Select the initial map and data source before constructing the map view.
const MapPresets = {
    apply(config, href = window.location.href) {
        const id = new URL(href).searchParams.get('preset');
        const preset = id && Object.hasOwn(config.mapPresets || {},id) ? config.mapPresets[id] : null;
        if (!preset) return;
        const vectorKey = Object.keys(config.tile).find(key => config.tile[key].style);
        config.mapPreset = preset;
        config.dataSource = preset.dataSource;
        config.default.DefaultCenter = [...preset.center];
        config.default.DefaultZoom = preset.zoom;
        config.tile[vectorKey] = {...config.tile[vectorKey], style:preset.style};
        config.tile_select.default = vectorKey;
        config.menu.push({ 'glot-model':'menu_preset_source', linkto:preset.dataSource.documentation, divider:false });
    },
    url(id, config = Conf, href = window.location.href) {
        const url = new URL(href);
        if (id == null) url.searchParams.delete('preset');
        else {
            if (!Object.hasOwn(config.mapPresets || {},id)) throw new Error('Unknown map preset');
            const preset = config.mapPresets[id];
            url.searchParams.set('preset',id);
            url.hash = [preset.zoom,...preset.center,0,0].join('/');
        }
        return url;
    },
    open(id) { window.location.assign(this.url(id).href); }
};
