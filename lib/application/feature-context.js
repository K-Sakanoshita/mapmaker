"use strict";

// Legacy callers are adapted here; shared computation never reads these globals.
function mapMakerFeatureContext() {
    return { config: typeof Conf === 'undefined' ? {} : Conf,
        palette: typeof LayerCont === 'undefined' ? 'color' : LayerCont.palette,
        season: typeof LayerCont === 'undefined' ? 'normal' : LayerCont.season || 'normal' };
}

function getMapMakerOsmLayer(...args) { return MapMakerDomain.osmLayer(...args); }
function getMapMakerFeatureTag(...args) { return MapMakerDomain.featureTag(...args); }
function getMapMakerMetres(...args) { return MapMakerDomain.metres(...args); }
function isMapMakerBuildingPart(...args) { return MapMakerDomain.isBuildingPart(...args); }
function getMapMakerBuildingBase(...args) { return MapMakerDomain.buildingBase(...args); }
function isMapMakerBuilding(...args) { return MapMakerDomain.isBuilding(...args); }
function matchesMapMaker3DCondition(...args) { return MapMakerDomain.matches3DCondition(...args); }
function matchesMapMaker3DConditionValid(...args) { return MapMakerDomain.matches3DConditionValid(...args); }
function getMapMaker3DModel(...args) { return MapMakerDomain.model3D(mapMakerFeatureContext(), ...args); }
function getMapMakerRoofShadeColor(...args) { return MapMakerDomain.roofShadeColor(...args); }
function getMapMakerSeason(...args) { return MapMakerDomain.season(mapMakerFeatureContext(), ...args); }
function getMapMakerSeasonColor(...args) { return MapMakerDomain.seasonColor(mapMakerFeatureContext(), ...args); }
function getMapMakerSeasonStyle(...args) { return MapMakerDomain.seasonStyle(mapMakerFeatureContext(), ...args); }
function getMapMakerTreeTrunkColor(...args) { return MapMakerDomain.treeTrunkColor(mapMakerFeatureContext(), ...args); }
function getMapMakerPointStyle(...args) { return MapMakerDomain.pointStyle(mapMakerFeatureContext(), ...args); }
function getMapMakerPointStyleName(...args) { return MapMakerDomain.pointStyleName(mapMakerFeatureContext(), ...args); }
function getMapMakerStyleDrawOrder(...args) { return MapMakerDomain.styleDrawOrder(mapMakerFeatureContext(), ...args); }
function compareMapMakerDrawOrder(...args) { return MapMakerDomain.compareDrawOrder(...args); }
function getMapMakerBuildingHeight(...args) { return MapMakerGeometry.buildingHeight(mapMakerFeatureContext(), ...args); }
function getMapMakerBuildingRange(...args) { return MapMakerGeometry.buildingRange(mapMakerFeatureContext(), ...args); }
function getMapMakerBuildingKey(...args) { return MapMakerGeometry.buildingKey(...args); }
function getMapMakerBuildingPolygons(...args) { return MapMakerGeometry.buildingPolygons(...args); }
function getMapMakerBuildingParts(...args) { return MapMakerGeometry.buildingParts(mapMakerFeatureContext(), ...args); }
function shouldRenderMapMakerBuilding(...args) { return MapMakerGeometry.shouldRenderBuilding(mapMakerFeatureContext(), ...args); }
function getMapMakerRoofMesh(...args) { return MapMakerGeometry.roofMesh(mapMakerFeatureContext(), ...args); }
function getMapMakerBarrierModel(...args) { return MapMakerGeometry.barrierModel(mapMakerFeatureContext(), ...args); }
function isMapMakerMeshBarrier(...args) { return MapMakerGeometry.isMeshBarrier(mapMakerFeatureContext(), ...args); }
function getMapMakerBarrierMesh(...args) { return MapMakerGeometry.barrierMesh(mapMakerFeatureContext(), ...args); }
function isMapMakerFence(...args) { return MapMakerGeometry.isFence(mapMakerFeatureContext(), ...args); }
function getMapMakerFenceMesh(...args) { return MapMakerGeometry.fenceMesh(mapMakerFeatureContext(), ...args); }
function isMapMakerWall(...args) { return MapMakerGeometry.isWall(mapMakerFeatureContext(), ...args); }
function isMapMakerRetainingWall(...args) { return MapMakerGeometry.isRetainingWall(mapMakerFeatureContext(), ...args); }
function getMapMakerRetainingWallLines(...args) { return MapMakerGeometry.retainingWallLines(...args); }
function getMapMakerRetainingWallSymbols(...args) { return MapMakerGeometry.retainingWallSymbols(mapMakerFeatureContext(), ...args); }
function isMapMakerExtrudedBarrier(...args) { return MapMakerGeometry.isExtrudedBarrier(mapMakerFeatureContext(), ...args); }
function getMapMakerBarrierGeometry(...args) { return MapMakerGeometry.barrierGeometry(mapMakerFeatureContext(), ...args); }
function getMapMakerTreeShape(...args) { return MapMakerGeometry.treeShape(mapMakerFeatureContext(), ...args); }
function getMapMakerPointParts(...args) { return MapMakerGeometry.pointParts(mapMakerFeatureContext(), ...args); }
function getMapMakerTreeParts(...args) { return MapMakerGeometry.treeParts(mapMakerFeatureContext(), ...args); }

class PrintSVGExporter extends SVGFeatureExporter {
    constructor(options = {}) {
        super(options, mapMakerFeatureContext());
        this.layers = Object.fromEntries(Object.entries(typeof Layers === 'undefined' ? {} : Layers).map(([key, layer]) => [key, {features:layer.geojson}]));
    }
    toSVGFromLayers(bbox, options = {}) {
        return this.render(captureMapMakerExportSnapshot(), bbox, options);
    }
}
