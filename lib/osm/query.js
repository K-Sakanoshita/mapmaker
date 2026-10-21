"use strict";

// Use device identity, not window size: rotating a phone or narrowing a PC
// window must not change the acquisition budget. Tablets use the mobile budget.
function isMapDataMobileDevice(device = globalThis.navigator) {
    if (!device) return false;
    const agent = device.userAgent || '';
    return device.userAgentData?.mobile === true ||
        /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini/i.test(agent) ||
        (/Macintosh|MacIntel/.test(agent + ' ' + (device.platform || '')) && device.maxTouchPoints > 1);
}

function mapDataConfigForDevice(config, mobile, search = globalThis.location?.search || '') {
    const base = config || {};
    const limits = {...base.limits, ...(mobile ? base.mobileLimits : {})};
    if (search && new URLSearchParams(search).get('dataLimits') === 'off') {
        // Structured cloning into the Worker preserves Infinity. Keep timeout,
        // category selection and simplification settings unchanged.
        for (const key of ['responseBytes', 'elements', 'coordinates', 'outputCoordinates']) limits[key] = Infinity;
    }
    return {...base, limits};
}

// Compare the requested Mercator footprint with a reference map in CSS pixels.
// The real zoom stays unchanged for drawing and geometry simplification.
function mapDataAcquisitionZoom(zoom, viewport, config = {}, bounds = null) {
    const round = value => Number(value.toFixed(1));
    if (!Number.isFinite(zoom)) return zoom;
    if (config.enabled !== true) return round(zoom);
    const width = Number(config.referenceWidth), height = Number(config.referenceHeight);
    const limit = Number(config.maxAdjustment);
    if (!(width > 0 && height > 0 && Number.isFinite(width * height)) || !(limit >= 0 && Number.isFinite(limit))) return round(zoom);
    let area = Number(viewport?.[0]) * Number(viewport?.[1]);
    if (!(Number(viewport?.[0]) > 0 && Number(viewport?.[1]) > 0 && Number.isFinite(area))) return round(zoom);
    if (bounds && ['west','east','north','south'].every(key => Number.isFinite(bounds[key]))) {
        let longitude = bounds.east - bounds.west;
        if (longitude < 0) longitude += 360;
        const mercatorY = latitude => {
            const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
            return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
        };
        const spanY = mercatorY(bounds.south) - mercatorY(bounds.north);
        const world = 512 * 2 ** zoom;
        const footprint = Math.min(360, longitude) / 360 * spanY * world * world;
        if (footprint > 0 && Number.isFinite(footprint)) area = footprint;
    }
    const adjustment = Math.max(-limit, Math.min(limit, .5 * Math.log2(width * height / area)));
    return round(zoom + adjustment);
}

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
