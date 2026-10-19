"use strict";

// Build requests from explicit configuration and bounds.
function planOsmAcquisition(definitions, mapDataConfig, targets, zoom) {
        const config = mapDataConfig || {};
        const low = zoom < (config.lowZoomBelow ?? 14);
        const osm = Object.fromEntries(targets.filter(key => definitions[key]).map(key => [key, {...definitions[key],tags:low && Array.isArray(definitions[key].tagsLowZoom)?definitions[key].tagsLowZoom:definitions[key].tags}]));
        const selectors = [...new Set(Object.values(osm).flatMap(rule => low && Array.isArray(rule.overpassLowZoom) ? rule.overpassLowZoom : rule.overpass))];
        return { config, osm, selectors };
    }


function overpassQueryURL(server, selectors, bounds) {
    const bbox = [bounds.SE.lat,bounds.NW.lng,bounds.NW.lat,bounds.SE.lng].join(',');
    const query = `[out:json][timeout:120][bbox:${bbox}];(${selectors.join(';')};);out body;>;out skel;`;
    return server + '?data=' + encodeURIComponent(query);
}
