"use strict";

// The sheet changes menu geometry only; the map camera and export bounds stay intact.
class MobileEditorSheet {
    constructor(maker) {
        this.maker = maker;
        this.editbar = document.getElementById('editbar');
        this.menu = document.getElementById('basemenu');
        this.save = document.getElementById('saveMap');
        this.placeholder = document.createComment('save controls return here on desktop');
        this.save.before(this.placeholder);
        this.topbar = document.createElement('div'); this.topbar.id = 'mobileSaveBar';
        this.topbar.className = 'mobile-save-bar'; this.editbar.appendChild(this.topbar);
        this.handle = document.getElementById('mobileSheetHandle');
        this.handle.addEventListener('click', () => {
            if (this.suppressClick) { this.suppressClick = false; return; }
            this.setMode(this.maker.basemenuWindowMode === 'minimized' ? 'normal' : 'minimized');
        });
        this.handle.addEventListener('pointerdown', event => this.startDrag(event));
        document.getElementById('mobileSheetClose').addEventListener('click', () => this.setMode('minimized'));
        document.getElementById('mobileSheetExpand').addEventListener('click', () =>
            this.setMode(this.maker.basemenuWindowMode === 'expanded' ? 'normal' : 'expanded'));
        document.getElementById('mobileStylesTab').addEventListener('click', () =>
            this.setMode(this.maker.basemenuWindowMode === 'minimized' ? 'normal' : 'minimized'));
        this.handle.addEventListener('keydown', event => {
            const next = { ArrowUp: 'expanded', ArrowDown: 'minimized', Escape: 'minimized', Home: 'minimized', End: 'expanded' }[event.key];
            if (next) { event.preventDefault(); this.setMode(next); }
        });
    }
    movePaletteControls(enabled) {
        if (!this.paletteControls) {
            const sizeButton = document.getElementById('AreaSelect1');
            const paletteButton = document.getElementById('ColorSelect');
            const paletteSelect = document.getElementById('mobilePaletteSelect');
            if (!sizeButton || !paletteButton || !paletteSelect) return;
            const placeholder = document.createComment('desktop palette controls');
            paletteButton.before(placeholder);
            this.paletteControls = { sizeButton, sizeMenu: sizeButton.nextElementSibling,
                sizeTab: sizeButton.parentNode, paletteButton, paletteMenu: paletteButton.nextElementSibling,
                paletteRow: paletteSelect.parentNode, label: paletteSelect.previousElementSibling, placeholder };
        }
        const c = this.paletteControls;
        if (enabled && c.sizeButton.parentNode !== c.paletteRow) {
            c.paletteRow.append(c.sizeButton, c.sizeMenu);
            c.sizeTab.append(c.paletteButton, c.paletteMenu);
        } else if (!enabled && c.sizeButton.parentNode !== c.sizeTab) {
            c.placeholder.after(c.paletteButton, c.paletteMenu);
            c.sizeTab.append(c.sizeButton, c.sizeMenu);
        }
        const labelKey = enabled ? 'select_size' : 'select_color';
        c.label.setAttribute('glot-model', labelKey);
        c.label.setAttribute('for', enabled ? 'AreaSelect1' : 'mobilePaletteSelect');
        c.label.textContent = glot.get(labelKey);
        const buttonLabel = c.paletteButton.querySelector('.menu-button-label');
        const paletteKey = enabled ? 'select_palette' : 'select_color';
        buttonLabel.setAttribute('glot-model', paletteKey);
        buttonLabel.textContent = glot.get(paletteKey);
    }
    isMobile() {
        return !window.matchMedia('(min-width: 992px), (min-width: 768px) and (orientation: landscape)').matches;
    }
    sizes() {
        const total = this.editbar.getBoundingClientRect().height;
        const collapsed = document.getElementById('mobileSheetHeader').offsetHeight +
            (document.getElementById('controlMenu').classList.contains('d-none') ? 0 : document.getElementById('controlMenu').offsetHeight) +
            8 + (parseFloat(getComputedStyle(this.menu).paddingBottom) || 0);
        const expanded = Math.max(collapsed, total - this.topbar.offsetHeight - 100);
        return { minimized: collapsed, normal: Math.max(collapsed, Math.min(Math.round(total * .5), expanded)), expanded };
    }
    setMode(mode) {
        if (!this.enabled) return;
        this.maker.basemenuWindowMode = mode;
        this.maker.applyBasemenuWindowSize?.();
    }
    update() {
        this.enabled = this.maker.customMode && this.isMobile();
        this.movePaletteControls(this.enabled);
        this.editbar.classList.toggle('mobile-editor', this.enabled);
        if (!this.enabled) {
            this.finishDrag(true);
            this.placeholder.after(this.save);
            return false;
        }
        if (this.save.parentNode !== this.topbar) this.topbar.appendChild(this.save);
        const mode = this.maker.basemenuWindowMode;
        this.menu.classList.toggle('is-minimized', mode === 'minimized');
        this.menu.classList.toggle('sheet-expanded', mode === 'expanded');
        this.editbar.style.removeProperty('--basemenu-width');
        this.editbar.style.setProperty('--basemenu-height', `${this.sizes()[mode] || this.sizes().minimized}px`);
        const selection = !document.getElementById('modal_select').classList.contains('d-none');
        document.getElementById('mobileSheetTitle').textContent = glot.get(selection ? 'sheet_facilities' : 'sheet_styles');
        this.handle.setAttribute('aria-expanded', String(mode !== 'minimized'));
        this.handle.setAttribute('aria-label', glot.get(mode === 'minimized' ? 'sheet_open' : 'sheet_collapse'));
        const expand = document.getElementById('mobileSheetExpand');
        const expanded = mode === 'expanded';
        const expandLabel = glot.get(expanded ? 'basemenu_restore' : 'basemenu_expand');
        expand.innerHTML = `<i class="far ${expanded ? 'fa-window-restore' : 'fa-window-maximize'}" aria-hidden="true"></i>`;
        expand.title = expandLabel; expand.setAttribute('aria-label', expandLabel);
        expand.setAttribute('aria-expanded', String(expanded));
        const minimize = document.getElementById('mobileSheetClose');
        minimize.title = glot.get('basemenu_minimize');
        minimize.setAttribute('aria-label', minimize.title);
        document.getElementById('mobileStylesTab').setAttribute('aria-expanded', String(mode !== 'minimized'));
        return true;
    }
    startDrag(event) {
        if (this.drag || !this.enabled || event.button !== 0) return;
        this.suppressClick = false;
        this.drag = { id: event.pointerId, y: event.clientY, height: this.menu.getBoundingClientRect().height, moved: false };
        this.onMove = event => {
            if (event.pointerId !== this.drag?.id) return;
            const delta = this.drag.y - event.clientY;
            if (Math.abs(delta) > 6) this.drag.moved = true;
            if (!this.drag.moved) return;
            event.preventDefault(); this.menu.classList.add('sheet-dragging');
            const sizes = this.sizes();
            // Reveal the body as soon as the sheet is dragged above the collapsed state.
            this.menu.classList.remove('is-minimized');
            const height = Math.max(sizes.minimized, Math.min(this.drag.height + delta, sizes.expanded));
            this.editbar.style.setProperty('--basemenu-height', `${height}px`);
        };
        this.onUp = event => { if (event.pointerId === this.drag?.id) this.finishDrag(event.type === 'pointercancel'); };
        window.addEventListener('pointermove', this.onMove, { passive: false });
        window.addEventListener('pointerup', this.onUp); window.addEventListener('pointercancel', this.onUp);
    }
    finishDrag(cancel = false) {
        if (!this.drag) return;
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp); window.removeEventListener('pointercancel', this.onUp);
        const moved = this.drag.moved, height = this.menu.getBoundingClientRect().height;
        this.drag = null; this.menu.classList.remove('sheet-dragging');
        if (moved) {
            this.suppressClick = true;
            const sizes = this.sizes();
            const mode = Object.keys(sizes).reduce((best, key) => Math.abs(sizes[key] - height) < Math.abs(sizes[best] - height) ? key : best, 'minimized');
            if (!cancel) this.maker.basemenuWindowMode = mode;
            if (this.enabled) this.maker.applyBasemenuWindowSize?.();
        }
    }
}
