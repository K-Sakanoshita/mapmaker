"use strict";

// Optional features share in-flight loads; failed loads may be retried.
const MapMakerResources = (() => {
    const pending = new Map();
    const scripts = {
        turf: ['https://unpkg.com/@turf/turf@7.4.0/turf.min.js', () => !!globalThis.turf],
        geocoder: ['https://community-geocoder.geolonia.com/api.js', () => typeof globalThis.getLatLng === 'function'],
        rough: ['https://unpkg.com/svg2roughjs@3.2.3/dist/svg2roughjs.umd.min.js', () => !!globalThis.svg2roughjs?.Svg2Roughjs],
        datatables: ['https://cdn.datatables.net/v/bs5/dt-3.0.3/sl-4.0.1/datatables.min.js', () => !!globalThis.jQuery?.fn?.DataTable],
        alwan: ['https://cdn.jsdelivr.net/npm/alwan@2.2.0/dist/js/alwan.min.js', () => !!globalThis.Alwan],
        qrcode: ['https://cdn.jsdelivr.net/npm/qrcode-svg@1.1.0/lib/qrcode.min.js', () => !!globalThis.QRCode]
    };
    function once(key, load) {
        if (!pending.has(key)) {
            const task = Promise.resolve().then(load).catch(error => { pending.delete(key); throw error; });
            pending.set(key, task);
        }
        return pending.get(key);
    }
    function script(name) {
        const entry = scripts[name];
        if (!entry) return Promise.reject(new Error(`Unknown resource: ${name}`));
        const [url, ready] = entry;
        if (ready()) return Promise.resolve();
        return once(name, () => new Promise((resolve, reject) => {
            const element = document.createElement('script');
            const finish = error => {
                clearTimeout(timer); element.onload = element.onerror = null;
                if (error) { element.remove(); reject(error); } else resolve();
            };
            const timer = setTimeout(() => finish(new Error(`Timed out loading ${name}`)), 30000);
            element.async = true; element.src = url;
            element.onload = () => finish(ready() ? null : new Error(`Invalid resource: ${name}`));
            element.onerror = () => finish(new Error(`Could not load ${name}`));
            document.head.appendChild(element);
        }));
    }
    function json(path) {
        return once(path, async () => {
            const response = await fetch(path, {cache:'no-cache', signal:AbortSignal.timeout(30000)});
            if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
            return JSON5.parse(await response.text());
        });
    }
    function address() {
        return once('address', async () => {
            const [,prefecture,municipalities] = await Promise.all([
                script('geocoder'), json('./data/prefecture.jsonc'), json('./data/prefecture-all.jsonc')
            ]);
            Object.assign(Conf, prefecture, municipalities);
        });
    }
    return {script, address};
})();
