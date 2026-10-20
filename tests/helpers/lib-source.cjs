const fs = require('node:fs');
// Source groups only adapt existing VM fixtures; production uses the real split files.
const groups = {
    "@feature-core": [
        "lib/domain/feature-tags.js",
        "lib/domain/flags.js",
        "lib/domain/model-rules.js",
        "lib/domain/styles.js",
        "lib/geometry/buildings.js",
        "lib/geometry/roofs.js",
        "lib/geometry/barriers.js",
        "lib/geometry/trees.js",
        "lib/geometry/point-models.js",
        "lib/geometry/elevated-paths.js",
        "lib/export/svg-features.js",
        "lib/domain/layer-state.js",
        "lib/application/layer-render-registry.js",
        "lib/application/export-snapshot.js",
        "lib/application/feature-context.js",
        "lib/geometry/coordinates.js",
        "lib/application/map-controls.js",
        "lib/osm/csv.js"
    ],
    "@svg-document": [
        "lib/application/flag-assets.js",
        "lib/application/svg-worker-client.js",
        "lib/export/svg-text.js",
        "lib/export/png.js",
        "lib/export/svg-document.js"
    ],
    "@layer-controller": [
        "lib/domain/layer-state.js",
        "lib/application/layer-render-registry.js",
        "lib/ui/layer-panel.js",
        "lib/application/layer-controller.js"
    ],
    "@overpass-client": [
        "lib/osm/classifier.js",
        "lib/application/map-data-worker-client.js",
        "lib/osm/query.js",
        "lib/application/overpass-controller.js"
    ]
};
function read(file, options) {
    if (groups[file]) return groups[file].map(name => fs.readFileSync(name, 'utf8')).join('\n');
    return fs.readFileSync(file, options);
}
module.exports = {read, groups};
