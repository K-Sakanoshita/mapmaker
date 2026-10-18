// Global Variable
var map;				// leaflet map object
var Layers = {};		// Layer Status,geojson,svglayer
var Conf = {};			// Config Praams
const LANG = document.documentElement.lang.toLowerCase() === "en" ? "en" : "ja";
const glot = new Glottologist();
glot.locale(LANG);

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
    static initDailyIntro() {
        const intro = document.getElementById("mapMakerIntro");
        const closeButton = document.getElementById("mapMakerIntroClose");
        if (!intro || !closeButton) return;

        const introConfig = Conf?.intro ?? {};
        if (introConfig.use === false) {
            intro.hidden = true;
            return;
        }

        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
        const storageKey = introConfig.storageKey || "mapmaker-intro-last-shown";

        try {
            if (window.localStorage.getItem(storageKey) === today) {
                intro.hidden = true;
                return;
            }
        } catch (error) {
            console.info("MapMaker: Could not read the introduction history.", error);
        }

        const positionIntro = () => {
            const menu = document.getElementById("basemenu");
            const article = document.getElementById("article");
            if (!menu || !article) return;

            const menuRect = menu.getBoundingClientRect();
            const articleRect = article.getBoundingClientRect();
            if (window.matchMedia("(min-width: 992px)").matches) {
                intro.style.setProperty("--mapmaker-intro-top", "12px");
                intro.style.setProperty("--mapmaker-intro-left", `${Math.max(12, Math.ceil(menuRect.right - articleRect.left + 12))}px`);
            } else {
                intro.style.setProperty("--mapmaker-intro-top", `${Math.max(12, Math.ceil(menuRect.bottom - articleRect.top + 12))}px`);
                intro.style.setProperty("--mapmaker-intro-left", "12px");
            }
        };
        const resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(positionIntro)
            : null;
        resizeObserver?.observe(document.getElementById("basemenu"));
        window.addEventListener("resize", positionIntro);
        const stopPositionTracking = () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", positionIntro);
        };

        closeButton.setAttribute("aria-label", glot.get("intro_close"));
        positionIntro();
        intro.hidden = false;
        window.requestAnimationFrame(positionIntro);
        try {
            window.localStorage.setItem(storageKey, today);
        } catch (error) {
            console.info("MapMaker: Could not save the introduction history.", error);
        }

        const dismissIntro = () => {
            intro.hidden = true;
            stopPositionTracking();
        };
        closeButton.addEventListener("click", dismissIntro, { once: true });
        document.querySelector("#makeMap button")?.addEventListener("click", dismissIntro, { once: true });
    }

    static showError(file, error) {
        console.error(`MapMaker startup failed: ${file}`, error);
        const panel = document.createElement("div");
        panel.setAttribute("role", "alert");
        panel.style.cssText = "position:fixed;inset:20px;z-index:10000;background:white;color:#222;padding:24px;overflow:auto";
        const message = document.createElement("p");
        message.textContent = LANG === "en"
            ? `Could not load ${file}. Check your connection and reload the page.`
            : `${file} を読み込めませんでした。接続を確認して、再読み込みしてください。`;
        const detail = document.createElement("p");
        detail.textContent = String(error?.message || error);
        const button = document.createElement("button");
        button.textContent = LANG === "en" ? "Reload" : "再読み込み";
        button.addEventListener("click", () => window.location.reload());
        panel.append(message, detail, button);
        document.body.appendChild(panel);
    }

    static async load() {
        const FILES = [
            "./basemenu.html", "./modals.html", "./data/config-system.jsonc", "./data/config-user.jsonc",
            `./data/category-${LANG}.jsonc`, "./data/marker.jsonc", "./data/overpass-system.jsonc", "./data/leyers.jsonc",
            `./data/datatables-${LANG}.jsonc`, "./data/marker-addtional.jsonc", "./data/prefecture.jsonc", "./data/prefecture-all.jsonc",
            "./data/glot.json"
        ];
        let currentFile = "initialization";
        try {
            const values = await Promise.all(FILES.map(async file => {
                try {
                    const response = await fetch(file, { signal: AbortSignal.timeout(30000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const text = await response.text();
                    return file.endsWith(".html") ? text
                        : file.endsWith(".jsonc") ? JSON5.parse(text) : JSON.parse(text);
                } catch (cause) {
                    throw Object.assign(new Error(`Failed to load ${file}`, { cause }), { file });
                }
            }));
            // Publish configuration only after every HTML/config/language file is valid.
            const config = Object.assign({}, ...values.slice(2, 12));
            config.category_keys = Object.keys(config.category);
            currentFile = "./data/glot.json";
            for (const [key, translations] of Object.entries(values[12])) glot.assign(key, translations);
            Conf = config;
            $("#modals").html(values[1]);
            currentFile = "initialization";
            LayerCont.init();
            mapMaker.init(values[0]);
            SVGCont.init();
            const analyticsHost = window.location.hostname;
            if (Conf.default.GoogleAnalytics !== "") {
                $('head').append('<script async src="https://www.googletagmanager.com/gtag/js?id=' + Conf.default.GoogleAnalytics + '"></script>');
                window.dataLayer = window.dataLayer || [];
                function gtag() { dataLayer.push(arguments); }
                gtag('js', new Date());
                const cookieDomain = Conf.default.GoogleAnalyticsCookieDomain || "";
                gtag('config', Conf.default.GoogleAnalytics, cookieDomain === analyticsHost ? { cookie_domain: cookieDomain } : {});
            }
            glot.render();
            initialize.initDailyIntro();
            return true;
        } catch (error) {
            initialize.showError(error.file || currentFile, error.cause || error);
            return false;
        }
    }

    static init() {
        const start = () => initialize.load();
        if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
        else start();
    }
}
