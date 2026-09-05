// Global Variable
var map;				// leaflet map object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const glot = new Glottologist();
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";

// initialize class object
const poiCont = new poiControl();
const Marker = new MarkerControl();
const LayerCont = new LayerControl();
const SVGCont = new SVGControl();
const overPassCont = new OverPassControl();
const CoastLine = new GeoCoastline();
const GeoCont = new GeoControl();

// initialize MapMaker
class initialize {
    static init() {
        window.addEventListener("DOMContentLoaded", function () {
            console.log("Welcome to MapMaker.");
            let jqXHRs = [];
            const FILES = [
                "./basemenu.html", "./modals.html", "./data/config-system.jsonc", "./data/config-user.jsonc",
                `./data/category-${LANG}.jsonc`, `./data/marker.jsonc`, './data/overpass-system.jsonc', "./data/leyers.jsonc",
                `./data/datatables-${LANG}.jsonc`, `./data/marker-addtional.jsonc`, `./data/prefecture.jsonc`, `./data/prefecture-all.jsonc`];
            for (let key in FILES) { jqXHRs.push($.get(FILES[key])) };
            $.when.apply($, jqXHRs).always(function () {
                let menuhtml = arguments[0][0];								// Get Menu HTML
                $("#modals").html(arguments[1][0]);							// Make Modal HTML
                for (let i = 2; i <= 11; i++) Conf = Object.assign(Conf, JSON5.parse(arguments[i][0]));	// Make Config Object
                Conf.category_keys = Object.keys(Conf.category); // Make Conf.category_keys

                glot.import("./data/glot.json").then(() => {	// Multi-language support
                    // document.title = glot.get("title");		// Title(no change / Google検索で日本語表示させたいので)
                    LayerCont.init();							// LayerCont Initialize
                    mapMaker.init(menuhtml);					// mapMaker Initialize
                    SVGCont.init();								// Marker Initialize
                    // Google Analytics
                    const analyticsHost = window.location.hostname;
                    if (Conf.default.GoogleAnalytics !== "") {
                        $('head').append('<script async src="https://www.googletagmanager.com/gtag/js?id=' + Conf.default.GoogleAnalytics + '"></script>');
                        window.dataLayer = window.dataLayer || [];
                        function gtag() { dataLayer.push(arguments); };
                        gtag('js', new Date());
                        const cookieDomain = Conf.default.GoogleAnalyticsCookieDomain || "";
                        const analyticsConfig = cookieDomain === analyticsHost
                            ? { cookie_domain: cookieDomain }
                            : {};
                        gtag('config', Conf.default.GoogleAnalytics, analyticsConfig);
                    };
                    glot.render();
                });
            });
        });
    }
}

