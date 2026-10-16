// GeoJSONからのSVG生成をUIスレッドの外で実行する。
var Conf, Layers, LayerCont, SVGCont;
importScripts('./geolib.js?v=maplibre-21');
self.onmessage = ({ data }) => {
    try {
        if (data.state) {
            ({ Conf, Layers, LayerCont } = data.state);
            const styles = data.state.styles;
            SVGCont = { svg_style: (key, over) => styles[key][over ? 1 : 0] };
        }
        const exporter = new PrintSVGExporter(data.exporterOptions);
        const svgText = exporter.toSVGFromLayers(data.bbox, data.options);
        self.postMessage({ id: data.id, svgText });
    } catch (error) {
        self.postMessage({ id: data.id, error: error.message });
    }
};
