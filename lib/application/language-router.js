"use strict";

// Runs before application startup so the chosen HTML and its language data agree.
const SiteLanguage = (() => {
    const storageKey = 'mapmaker-language';
    const root = new URL('../../', document.currentScript.src);
    const current = new URL(window.location.href);
    const valid = value => value === 'ja' || value === 'en';
    const read = () => {
        try { return localStorage.getItem(storageKey); } catch { return null; }
    };
    const save = language => {
        try { localStorage.setItem(storageKey, language); } catch { /* URL choice still works without storage. */ }
    };
    const urlFor = language => {
        const url = new URL(language === 'en' ? 'en/' : './', root);
        url.search = window.location.search;
        url.hash = window.location.hash;
        return url;
    };
    const path = current.pathname.slice(root.pathname.length);
    if (current.pathname.startsWith(root.pathname) && ['', 'index.html', 'en/', 'en/index.html'].includes(path)) {
        const requested = current.searchParams.get('lang');
        const saved = read();
        const browser = (navigator.languages?.length ? navigator.languages : [navigator.language])
            .map(language => String(language || '').toLowerCase().split('-')[0]).find(valid) || 'en';
        const language = valid(requested) ? requested : valid(saved) ? saved : path.startsWith('en/') ? 'en' : browser;
        if (valid(requested)) save(requested);
        if (document.documentElement.lang !== language) window.location.replace(urlFor(language).href);
    }
    return {
        addMenuLinks(menu) {
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            menu.appendChild(divider);
            for (const [language, label] of [['ja', '日本語'], ['en', 'English']]) {
                const link = document.createElement('a');
                const url = urlFor(language);
                url.searchParams.set('lang', language);
                link.href = url.href;
                link.className = 'dropdown-item';
                link.lang = language;
                link.hreflang = language;
                link.dataset.siteLanguage = language;
                link.textContent = label;
                if (document.documentElement.lang === language) link.setAttribute('aria-current', 'page');
                // Resolve the current map hash at click time, after any map movement.
                link.addEventListener('click', () => {
                    const target = urlFor(language);
                    target.searchParams.set('lang', language);
                    link.href = target.href;
                    save(language);
                });
                menu.appendChild(link);
            }
        }
    };
})();
