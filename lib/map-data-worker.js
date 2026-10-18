// Convert and classify the complete OSM response away from the UI thread.
var Conf, overPassCont;
importScripts('./osmtogeojson.js', './overpasslib.js?v=maplibre-24');
self.onmessage = ({ data }) => {
    try {
        Conf = { osm: data.osm };
        overPassCont = new OverPassControl();
        const geojson = osmtogeojson(data.osmxml, { flatProperties: true }).features;
        self.postMessage({ result: { geojson, targets: overPassCont.set_targets(geojson) } });
    } catch (error) { self.postMessage({ error: error.message }); }
};
