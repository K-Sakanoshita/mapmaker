// Worker entry point: no DOM, map engine, controllers or simulated UI globals.
importScripts('../domain/feature-tags.js?v=layout-1',
    '../domain/flags.js?v=flags-1',
    '../domain/model-rules.js?v=layout-3',
    '../domain/styles.js?v=layout-3',
    '../geometry/buildings.js?v=layout-4',
    '../geometry/roofs.js?v=layout-1',
    '../geometry/barriers.js?v=layout-6',
    '../geometry/trees.js?v=layout-1',
    '../geometry/point-models.js?v=layout-2',
    '../geometry/elevated-paths.js?v=paths-2',
    '../export/svg-features.js?v=layout-15');
self.onmessage = ({data}) => {
    const {id, revision, snapshot, exporterOptions, bbox, options} = data;
    try {
        const exporter = new SVGFeatureExporter(exporterOptions, snapshot?.context);
        const svgText = exporter.render(snapshot, bbox, options);
        self.postMessage({id, revision, svgText});
    } catch (error) { self.postMessage({id, revision, error:error.message}); }
};
