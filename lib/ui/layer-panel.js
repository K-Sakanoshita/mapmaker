"use strict";

// Layer controls and paper-mask DOM updates; no feature generation.
const LayerPanel = {
    reflectVisibility(key, visible) {
        const button = document.getElementById(key + '_layer');
        if (!button) return;
        const label = `${glot.get('menu_' + key)} — ${glot.get(visible ? 'layer_hide' : 'layer_show')}`;
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(visible));
        button.querySelector('i').className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
        document.getElementById(key)?.classList.toggle('is-layer-hidden', !visible);
    },
    createMasks(add) {
        for (const paper of ['a4','a3']) for (const side of ['top','bottom','left','right']) add(`${paper}_${side}`, 'article');
    },
    reflectPalette(palette, categories, swatches) {
        const mobilePalette = document.getElementById('mobilePaletteSelect');
        if (mobilePalette) mobilePalette.value = palette;
        let changed = false;
        for (const [key, category] of Object.entries(categories)) {
            const color = document.getElementById(key + '_color');
            const line = document.getElementById(key + '_Line');
            if (!color) continue;
            this.reflectVisibility(key, LayerState.visible(category));
            color.setAttribute('value', category.color);
            const picker = typeof mapMaker === 'undefined' ? null : mapMaker.colorPicker?.[key];
            if (!picker) color.style.backgroundColor = category.color;
            picker?.setOptions({swatches}); picker?.setColor(category.color);
            if (line) line.setAttribute('value', category.width);
            changed = true;
        }
        if (categories.background.opacity === 0) $('#mapid, #background_color').css('background-color', '').addClass('bg-clear');
        else $('#mapid, #background_color').css('background-color', categories.background.color).removeClass('bg-clear');
        return changed;
    },
    selectPaper(p) {
        let dom;
        if (p.top > 0) {
            dom = document.getElementById("a4_top");
            dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.top}px; top: 0px; left: 0px;"></div>`;
            dom = document.getElementById("a4_bottom");
            dom.innerHTML = `<div class="area_mask" style="width: 100%; height: ${p.bottom}px; top:  ${p.height - p.bottom}px; left: 0px;"></div>`;
        } else {
            dom = document.getElementById("a4_top");
            if (dom !== null) { dom.innerHTML = `` };
            dom = document.getElementById("a4_bottom");
            if (dom !== null) { dom.innerHTML = `` };
        };
        if (p.left > 0) {
            dom = document.getElementById("a4_left");
            dom.innerHTML = `<div class="area_mask" style="width: ${p.left}px; height: 100%; top: 0px; left: 0px;"></div>`;
            dom = document.getElementById("a4_right");
            dom.innerHTML = `<div class="area_mask" style="width: ${p.right}px; height: 100%; top: 0px; left: ${p.width - p.right}px;"></div>`;
        } else {
            dom = document.getElementById("a4_left");
            if (dom !== null) { dom.innerHTML = `` };
            dom = document.getElementById("a4_right");
            if (dom !== null) { dom.innerHTML = `` };
        };
    }
};
