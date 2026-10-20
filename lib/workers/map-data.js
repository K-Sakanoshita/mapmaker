// Worker entry point: runtime transport only.
importScripts('../vendor/osmtogeojson.js', '../osm/classifier.js?v=layout-3',
    '../geometry/simplify.js?v=layout-1', '../osm/map-data.js?v=layout-3');
function reportMapError(error) {
    self.postMessage({error:error.message,code:error.code,retryable:error.retryable ?? false,retryAfter:error.retryAfter});
}
self.onmessage = ({data}) => {
    if (data.url) {
        fetchMapData(data, message => self.postMessage(message)).then(result => self.postMessage({result})).catch(reportMapError);
        return;
    }
    try { self.postMessage({result:convertMapData(data)}); } catch (error) { reportMapError(error); }
};
