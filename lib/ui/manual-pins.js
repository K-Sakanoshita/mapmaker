"use strict";

// User annotations stay separate from OSM features and share the export projection.
const ManualPins = {
    active: false,
    kind: 'location',
    label: '',
    labelSize: 16,
    labelGap: 4,
    pins: new Map(),
    serial: 0,
    size: 32,
    svg(kind) {
        const shape = kind === 'pushpin'
            ? '<path d="M12 2h12v4l-3 2v9l5 5v3H10v-3l5-5V8l-3-2Z" fill="#e74747" stroke="#fff" stroke-width="1.5"/><path d="M18 25v7" stroke="#555" stroke-width="2"/>'
            : '<path d="M16 32C13 26 4 19 4 12a12 12 0 0 1 24 0c0 7-9 14-12 20Z" fill="#e74747" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="12" r="4" fill="#fff"/>';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 34">${shape}</svg>`;
    },
    start() {
        if (!mapMaker.customMode || this.active) return;
        this.active = true;
        if (mapMaker.roughPreviewLocked) mapMaker.setRoughPreviewLock(true);
        mapMaker.mobileSheet?.setMode('minimized');
        map.closePopup();
        const toolbar = document.createElement('div');
        toolbar.id = 'manualPinToolbar'; toolbar.className = 'manual-pin-toolbar';
        toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', glot.get('manual_pin_add'));
        for (const kind of ['location', 'pushpin']) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn btn-light manual-pin-choice';
            button.innerHTML = `<span aria-hidden="true">${this.svg(kind)}</span>`; button.dataset.pinKind = kind;
            button.setAttribute('aria-label', glot.get(`manual_pin_${kind}`));
            button.addEventListener('click', () => this.select(kind)); toolbar.appendChild(button);
        }
        const field = document.createElement('label');
        field.className = 'manual-pin-text-field'; field.textContent = glot.get('manual_pin_text');
        const input = document.createElement('input');
        input.id = 'manualPinText'; input.type = 'text'; input.className = 'form-control form-control-sm';
        input.value = this.label; input.placeholder = glot.get('manual_pin_text_placeholder');
        input.addEventListener('input', () => { this.label = input.value; });
        field.appendChild(input); toolbar.appendChild(field);
        const hint = document.createElement('span'); hint.textContent = glot.get('manual_pin_hint');
        hint.setAttribute('role', 'status'); toolbar.appendChild(hint);
        const done = document.createElement('button'); done.type = 'button'; done.className = 'btn btn-primary';
        done.textContent = glot.get('manual_pin_done'); done.addEventListener('click', () => this.stop()); toolbar.appendChild(done);
        // Keep toolbar interactions from placing pins on the map beneath it.
        for (const type of ['click', 'pointerdown', 'dblclick']) toolbar.addEventListener(type, event => event.stopPropagation());
        const container = map.getContainer(); container.appendChild(toolbar); container.classList.add('manual-pin-placement');
        this.clickHandler = event => { if (this.active) this.place(event.lngLat); };
        this.keyHandler = event => { if (event.key === 'Escape') this.stop(); };
        this.resizeHandler = () => this.positionToolbar();
        map.on('click', this.clickHandler); map.on('resize', this.resizeHandler);
        document.addEventListener('keydown', this.keyHandler);
        this.select(this.kind); this.positionToolbar();
    },
    positionToolbar() {
        const toolbar = document.getElementById('manualPinToolbar');
        const menu = document.getElementById('basemenu');
        if (!toolbar || !menu) return;
        const mapRect = map.getContainer().getBoundingClientRect(), menuRect = menu.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        const overlapsMenu = menuRect.right > toolbarRect.left && menuRect.left < toolbarRect.right;
        const topbar = document.getElementById('mobileSaveBar')?.getBoundingClientRect();
        const bottomSheet = menuRect.top > mapRect.top + mapRect.height / 4;
        const top = bottomSheet ? Math.max(10, (topbar?.bottom || mapRect.top) - mapRect.top + 10)
            : overlapsMenu ? Math.max(10, menuRect.bottom - mapRect.top + 10) : 10;
        toolbar.style.top = `${top}px`;
    },
    select(kind) {
        if (!['location', 'pushpin'].includes(kind)) return;
        this.kind = kind;
        document.querySelectorAll('#manualPinToolbar [data-pin-kind]').forEach(button => {
            const selected = button.dataset.pinKind === kind;
            button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('active', selected);
        });
    },
    stop() {
        if (!this.active) return;
        this.active = false;
        if (mapMaker.roughPreviewLocked) mapMaker.setRoughPreviewLock(true);
        map.off('click', this.clickHandler); map.off('resize', this.resizeHandler); document.removeEventListener('keydown', this.keyHandler);
        document.getElementById('manualPinToolbar')?.remove();
        map.getContainer().classList.remove('manual-pin-placement');
    },
    place(lngLat) {
        if (!this.active || !mapMaker.customMode || !Number.isFinite(lngLat?.lng) || !Number.isFinite(lngLat?.lat)) return;
        const id = ++this.serial, kind = this.kind, svg = this.svg(kind);
        const icon = MapEngine.divIcon({ className: 'manual-pin-marker', iconSize: [this.size, this.size],
            iconAnchor: [this.size / 2, this.size], html: `<div class="manual-pin-content"><div class="manual-pin-glyph" style="width:${this.size}px;height:${this.size}px">${svg}</div><span class="manual-pin-label"></span></div>` });
        const marker = MapEngine.marker({ lng: lngLat.lng, lat: lngLat.lat }, { icon, draggable: true, autoPanOnFocus: false }).addTo(map);
        const pin = { marker, kind, label: this.label.trim() };
        this.pins.set(id, pin); this.renderLabel(pin);
        marker.on('click', event => this.popup(id, event.latlng));
        // AddTo schedules a preview before registration; request again with the pin registered.
        mapMaker.queueExportPreview();
        return id;
    },
    renderLabel(pin) {
        const label = pin.marker.getElement?.()?.querySelector('.manual-pin-label');
        if (!label) return;
        label.textContent = pin.label;
        label.style.fontSize = `${this.labelSize}px`;
        label.hidden = !pin.label;
    },
    escapeText(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    },
    updateLabel(id, value) {
        const pin = this.pins.get(id);
        if (!pin || typeof value !== 'string') return;
        pin.label = value.trim(); this.renderLabel(pin);
        map.closePopup(); mapMaker.queueExportPreview();
    },
    changeKind(id, kind, button) {
        const pin = this.pins.get(id);
        if (!pin || !['location', 'pushpin'].includes(kind)) return;
        pin.kind = kind;
        button?.closest('.manual-pin-kind-choices')?.querySelectorAll('[data-pin-kind]').forEach(choice => {
            const selected = choice.dataset.pinKind === kind;
            choice.setAttribute('aria-pressed', String(selected)); choice.classList.toggle('active', selected);
        });
        const glyph = pin.marker.getElement?.()?.querySelector('.manual-pin-glyph');
        if (glyph) glyph.innerHTML = this.svg(kind);
        mapMaker.queueExportPreview();
    },
    popup(id, lngLat) {
        if (!this.pins.has(id)) return;
        const pin = this.pins.get(id);
        const choices = ['location', 'pushpin'].map(kind =>
            `<button type="button" class="btn btn-light manual-pin-choice${kind === pin.kind ? ' active' : ''}" data-pin-kind="${kind}" aria-label="${glot.get('manual_pin_' + kind)}" aria-pressed="${kind === pin.kind}" onclick="ManualPins.changeKind(${id},'${kind}',this)"><span aria-hidden="true">${this.svg(kind)}</span></button>`).join('');
        const html = `<form class="manual-pin-label-form" onsubmit="ManualPins.updateLabel(${id},this.elements.label.value);return false"><div class="mb-2"><div class="mb-1">${glot.get('manual_pin_kind')}</div><div class="manual-pin-kind-choices" role="group" aria-label="${glot.get('manual_pin_kind')}">${choices}</div></div><label class="d-block mb-2">${glot.get('manual_pin_text')}<input type="text" name="label" class="form-control mt-1" value="${this.escapeText(pin.label)}" placeholder="${glot.get('manual_pin_text_placeholder')}"></label><div class="manual-pin-actions"><button type="submit" class="btn btn-primary btn-sm">${glot.get('manual_pin_text_save')}</button><button type="button" class="btn btn-sm btn-danger" onclick="ManualPins.remove(${id})">${glot.get('manual_pin_delete')}</button></div></form>`;
        MapEngine.responsivePopup().setContent(html).setLatLng(lngLat).openOn(map);
    },
    remove(id) {
        const pin = this.pins.get(id);
        if (!pin) return;
        this.pins.delete(id); pin.marker.remove(); map.closePopup(); mapMaker.queueExportPreview();
    },
    clear() {
        this.stop(); this.label = '';
        for (const id of [...this.pins.keys()]) this.remove(id);
    },
    appendToSVG(root, project, mmPerPx) {
        const parser = new DOMParser(), ns = 'http://www.w3.org/2000/svg';
        for (const [id, { marker, kind, label }] of this.pins) {
            const ll = marker.getLatLng(), [x, y] = project(ll);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const size = this.size * mmPerPx;
            const group = document.createElementNS(ns, 'g'); group.setAttribute('data-manual-pin', String(id));
            // Both screen and export use the bottom centre as the geographical anchor.
            group.setAttribute('transform', `translate(${x - size / 2} ${y - size}) scale(${size / 32} ${size / 34})`);
            const svg = parser.parseFromString(this.svg(kind), 'image/svg+xml').documentElement;
            for (const child of [...svg.children]) group.appendChild(document.importNode(child, true));
            root.appendChild(group);
            if (label) {
                const text = document.createElementNS(ns, 'text');
                text.setAttribute('data-manual-pin-label', String(id));
                text.setAttribute('x', String(x + size / 2 + this.labelGap * mmPerPx));
                text.setAttribute('y', String(y - size / 2));
                text.setAttribute('font-family', 'system-ui, sans-serif');
                text.setAttribute('font-size', String(this.labelSize * mmPerPx));
                text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('fill', '#212529');
                text.setAttribute('xml:space', 'preserve');
                text.textContent = label; root.appendChild(text);
            }
        }
    }
};
