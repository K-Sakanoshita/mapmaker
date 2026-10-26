"use strict";

// Each URL has a fixed language: / is Japanese and /en/ is English.
// Do not redirect based on browser locale or saved settings; crawlers must
// be able to index each language URL without a client-side redirect.
const SiteLanguage = (() => {
    const root = new URL('../../', document.currentScript.src);
    const urlFor = language => {
        const url = new URL(language === 'en' ? 'en/' : './', root);
        url.search = window.location.search;
        // Drop legacy ?lang=... when making an explicit language switch.
        url.searchParams.delete('lang');
        url.hash = window.location.hash;
        return url;
    };
    return {
        addMenuLinks(menu) {
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            menu.appendChild(divider);
            for (const [language, label] of [['ja', '日本語'], ['en', 'English']]) {
                const link = document.createElement('a');
                link.href = urlFor(language).href;
                link.className = 'dropdown-item';
                link.lang = language;
                link.hreflang = language;
                link.dataset.siteLanguage = language;
                link.textContent = label;
                if (document.documentElement.lang === language) link.setAttribute('aria-current', 'page');
                // Preserve the latest map camera, even if the menu was opened earlier.
                link.addEventListener('click', () => {
                    link.href = urlFor(language).href;
                });
                menu.appendChild(link);
            }
        }
    };
})();
