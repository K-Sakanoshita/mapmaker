"use strict";

// Shared computation namespaces. No DOM, map engine or application state.
const MapMakerDomain = {};
const MapMakerGeometry = {};

MapMakerDomain.osmLayer = function(feature) {
    const raw = feature?.properties?.layer ?? feature?.properties?.tags?.layer;
    if (raw === undefined || raw === null || String(raw).trim() === "") return 0;

    const value = Number(String(raw).trim());
    return Number.isFinite(value) ? value : 0;
};

MapMakerDomain.featureTag = function(feature, key) {
    return feature?.properties?.[key] ?? feature?.properties?.tags?.[key];
};

MapMakerDomain.metres = function(value) {
    const match=String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/i);
    return match ? Number(match[1])*(match[2]?.toLowerCase()==='ft'?.3048:1) : NaN;
};

MapMakerDomain.isBuildingPart = function(feature) {
    const tag=MapMakerDomain.featureTag(feature,'building:part');
    return tag != null && tag!=='' && tag!=='no';
};

MapMakerDomain.buildingBase = function(feature,options={}) {
    options ||= {};
    const explicit=MapMakerDomain.metres(MapMakerDomain.featureTag(feature,'min_height'));
    if(Number.isFinite(explicit)) return explicit;
    const levels=String(MapMakerDomain.featureTag(feature,'building:min_level') ?? '').trim();
    const floor=Number(options.floorHeight);
    return /^\d+(?:\.\d+)?$/.test(levels) ? Number(levels)*(Number.isFinite(floor)&&floor>0?floor:3) : 0;
};

MapMakerDomain.isBuilding = function(feature) {
    return ['building', 'building:part'].some(key => {
        const value = MapMakerDomain.featureTag(feature, key);
        return value != null && value !== '' && value !== 'no';
    });
};
