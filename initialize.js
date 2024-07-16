// Global Variable
var map;				// leaflet map object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const glot = new Glottologist();
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";

// initialize class object
const MapCont = new LeafletCont();
const PoiCont = new PoiControl();
const Marker = new MarkerControl();
const LayerCont = new LayerControl();
const SVGCont = new SVGControl();
const overPassCont = new OverPassControl();
const CoastLine = new GeoCoastline();
const GeoCont = new GeoControl();

// initialize MapMaker
window.addEventListener("DOMContentLoaded", function () {
	console.log("Welcome to MapMaker.");
	let jqXHRs = [];
	const FILES = [
		"./basemenu.html", "./modals.html", "./data/config-system.json", "./data/config-user.jsonc",
		`./data/category-${LANG}.jsonc`, `./data/marker.jsonc`, './data/overpass-system.json',
		`./data/datatables-${LANG}.json`, `./data/marker-addtional.json`];
	for (let key in FILES) { jqXHRs.push($.get(FILES[key])) };
	$.when.apply($, jqXHRs).always(function () {
		let menuhtml = arguments[0][0];								// Get Menu HTML
		$("#modals").html(arguments[1][0]);							// Make Modal HTML
		Conf = Object.assign(arguments[2][0], JSON5.parse(arguments[3][0]));
		Conf = Object.assign(Conf, JSON5.parse(arguments[4][0]));
		Conf = Object.assign(Conf, JSON5.parse(arguments[5][0]));
		for (let i = 6; i <= 8; i++) Conf = Object.assign(Conf, arguments[i][0]);	// Make Config Object

		glot.import("./data/glot.json").then(() => {	// Multi-language support
			// document.title = glot.get("title");		// Title(no change / Google検索で日本語表示させたいので)
			LayerCont.init();							// LayerCont Initialize
			Mapmaker.init(menuhtml);					// Mapmaker Initialize
			SVGCont.init();								// Marker Initialize
			// Google Analytics
			if (Conf.default.GoogleAnalytics !== "") {
				$('head').append('<script async src="https://www.googletagmanager.com/gtag/js?id=' + Conf.default.GoogleAnalytics + '"></script>');
				window.dataLayer = window.dataLayer || [];
				function gtag() { dataLayer.push(arguments); };
				gtag('js', new Date());
				gtag('config', Conf.default.GoogleAnalytics);
			};
			glot.render();
		});
	});
});
