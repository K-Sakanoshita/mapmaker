"use strict";

// Main-thread bridge: resolve application state and copy data-only edit records.
function* mapMakerExportSnapshotSteps(resolveStyle) {
    const layers = {}, styles = {}, layerKeys = [...LayerCont.styles];
    for (const key of layerKeys) {
        const category = Layers[key];
        if (!category?.geojson) continue;
        const edits = [];
        const records = category.edits || LayerRenderRegistry.get(category).map(model => {
            const inner = model.getLayers ? model.getLayers()[0] : model;
            return LayerState.editRecord({id:inner?.id, featureId:model.mapmaker?.sourceFeature?.id ?? inner?.feature?.id,
                clickable:typeof inner?.click === 'function', drawOrder:model.mapmaker?.drawOrder, options:inner?.options});
        });
        for (const edit of records) { edits.push(LayerState.exportEdit(edit)); yield; }
        layers[key] = { features:category.geojson, opacity:category.opacity, edits };
        styles[key] = [resolveStyle(key, false), Conf.style?.[LayerCont.palette]?.[key]?.overstyle ? resolveStyle(key, true) : null];
    }
    return {version:1, context:{config:{default:{Palette:Conf.default.Palette}, style:Conf.style,
        flagImages:Conf.flagImages, pointStyle:Conf.pointStyle, model3D:Conf.model3D, seasons:Conf.seasons},
        palette:LayerCont.palette, season:LayerCont.season || 'normal'}, layerKeys, layers, styles};
}
function captureMapMakerExportSnapshot(resolveStyle = (key, over) => SVGCont.svg_style(key, over)) {
    const steps = mapMakerExportSnapshotSteps(resolveStyle);
    let step;
    do { step = steps.next(); } while (!step.done);
    return step.value;
}
async function captureMapMakerExportSnapshotAsync(resolveStyle) {
    const steps = mapMakerExportSnapshotSteps(resolveStyle);
    let step, count = 0;
    while (!(step = steps.next()).done) if (++count % 200 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    return step.value;
}
