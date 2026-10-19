"use strict";

MapMakerDomain.roofShadeColor = function(color, factor) {
    let hex=String(color).match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
    if (hex) {
        if (hex.length<5) hex=hex.split('').map(c=>c+c).join('');
        return '#'+[0,2,4].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*factor).toString(16).padStart(2,'0')).join('')+hex.slice(6);
    }
    const rgb=String(color).match(/^rgba?\(([^)]+)\)$/i);
    if (!rgb) return color;
    const channels=rgb[1].trim().split(/[,/\s]+/);
    const values=channels.slice(0,3).map(v=>parseFloat(v)*(v.endsWith('%')?2.55:1));
    if (values.length!==3 || values.some(n=>!Number.isFinite(n))) return color;
    const alpha=channels[3] ?? '1';
    return `rgba(${values.map(n=>Math.round(n*factor)).join(',')},${alpha})`;
};

MapMakerDomain.season = function(context) { return context.season || 'normal'; };

MapMakerDomain.seasonColor = function(context, feature, key, color) {
    if (context.palette !== 'color') return color;
    const season = context.config.seasons?.[MapMakerDomain.season(context)];
    if (!season) return color;
    if (key === 'tree') return MapMakerDomain.featureTag(feature,'leaf_cycle') === 'evergreen' ? color : season.trees?.[MapMakerDomain.model3D(context, feature, 'tree')] || color;
    if (key !== 'forest' || !season.forest) return color;
    if (MapMakerDomain.featureTag(feature,'landuse') !== 'forest' && MapMakerDomain.featureTag(feature,'natural') !== 'wood') return color;
    const cycle = String(MapMakerDomain.featureTag(feature,'leaf_cycle') ?? 'unknown').toLowerCase();
    const amount = Math.min(1,Math.max(0,Number(season.forest.amount?.[cycle] ?? season.forest.amount?.unknown ?? 0)));
    const base = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color || '');
    const target = /^#([0-9a-f]{6})$/i.exec(season.forest.color || '');
    if (!amount || !base || !target) return color;
    const rgb = [0,2,4].map(i=>Math.round(parseInt(base[1].slice(i,i+2),16)*(1-amount)+parseInt(target[1].slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');
    return '#'+rgb+(base[2] || '');
};

MapMakerDomain.seasonStyle = function(context, feature,key,style) {
    return {...style,fillColor:MapMakerDomain.seasonColor(context, feature,key,style.fillColor)};
};

MapMakerDomain.treeTrunkColor = function(context) {
    return context.palette === 'mono' ? '#777775' : '#8b6b4a';
};

MapMakerDomain.pointStyle = function(context, name, feature = null) {
    const conf = context.config.pointStyle?.[name] || {};
    const palette = conf.palette?.[context.palette] || {};
    return {
        radius: Number.isFinite(Number(conf.radius)) ? Number(conf.radius) : 0.9,
        width: Number.isFinite(Number(palette.width)) ? Number(palette.width) : 0,
        lineColor: palette.lineColor || "#000000",
        fillColor: feature ? MapMakerDomain.seasonColor(context, feature,name,palette.fillColor || palette.lineColor || "#000000") : palette.fillColor || palette.lineColor || "#000000"
    };
};

MapMakerDomain.pointStyleName = function(context, feature) {
    if (MapMakerDomain.featureTag(feature, "man_made") === "flagpole" && context.config.pointStyle?.flagpole) return "flagpole";
    if (MapMakerDomain.featureTag(feature, "natural") === "tree" && context.config.pointStyle?.tree) return "tree";
    if (MapMakerDomain.featureTag(feature, "entrance") !== undefined && context.config.pointStyle?.entrance) return "entrance";
    return null;
};

MapMakerDomain.styleDrawOrder = function(context, palette, key, fallbackIndex) {
    const configured = Number(context.config.style?.[palette]?.[key]?.drawOrder);
    return Number.isFinite(configured) ? configured : fallbackIndex * 10;
};

MapMakerDomain.compareDrawOrder = function(a, b) {
    return (a.osmLayer - b.osmLayer)
        || (a.styleOrder - b.styleOrder)
        || (a.passOrder - b.passOrder)
        || (a.featureOrder - b.featureOrder)
        || ((a.serial ?? 0) - (b.serial ?? 0));
};


// Resolve category paint without a map engine or DOM.
MapMakerDomain.layerStyle = function(context, category, key, overstyle, zoom) {
        // ウェイの線の太さを計算
        let common, style, weight = 1, nowzoom = zoom;
        if (nowzoom < 15) {
            //weight = 1 / (15 - nowzoom);
            weight = 1 - ((Math.pow(2, 15 - nowzoom) - 1) / 10);
        } else if (nowzoom > 15) {
            weight = 1 + (nowzoom - 15) * 0.6;
        };
        // color:SVG色 / width:SVG Line Weight / dashArray:破線 / linecap:終端の形状
        switch (overstyle) {
            case true:
                let overstyleConf = context.config.style[context.palette][key].overstyle;
                let dashs = overstyleConf.dashArray.split(" ");
                dashs = dashs.map(dash => dash * weight);
                let widthWeight = weight;
                if (nowzoom > 15 && Number.isFinite(overstyleConf.zoomWidthStep)) {
                    widthWeight = 1 + (nowzoom - 15) * overstyleConf.zoomWidthStep;
                }
                const defaultWidth = Number(context.config.style[context.palette][key].width);
                const currentWidth = Number(category.width);
                const customWidthScale = Number.isFinite(defaultWidth) && defaultWidth > 0 && Number.isFinite(currentWidth)
                    ? currentWidth / defaultWidth
                    : 1;
                common = {
                    "stroke": true, "dashArray": `${dashs[0]} ${dashs[1]}`,
                    "lineJoin": overstyleConf.linecap, "lineCap": overstyleConf.linecap,
                    "bubblingMouseEvents": false, "weight": overstyleConf.width * customWidthScale * widthWeight,
                    "color": overstyleConf.color
                };
                break;
            default:
                common = {
                    "stroke": true, "dashArray": context.config.style[context.palette][key].dashArray,
                    "lineJoin": context.config.style[context.palette][key].linecap, "lineCap": context.config.style[context.palette][key].linecap,
                    "bubblingMouseEvents": false, "weight": category.width * weight
                };
        }
        if (context.palette === 'coloring') common.fillOpacity = context.config.style[context.palette][key].type === 'area' ? 1 : 0;
        if (overstyle) {
            style = common;
        } else if (context.config.style[context.palette][key].type == "area") {	// overstyle時は枠指定しない
            style = Object.assign(common, { "color": context.config.style[context.palette][key].lineColor || category.color_dark, "fillColor": category.color });
        } else {
            style = Object.assign(common, { "color": category.color, "fillColor": category.color_dark });
        };
        return style;
};
