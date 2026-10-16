"use strict";

const LineWidthPanel = {
    min: 0,
    max: 60,
    open(key, anchor) {
        if (this.anchor === anchor) { this.close(); return; }
        this.close();
        this.anchor = anchor;
        const panel = document.createElement('div');
        panel.id = 'lineWidthPanel'; panel.className = 'line-width-panel';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'lineWidthTitle');
        const title = document.createElement('div'); title.id = 'lineWidthTitle'; title.className = 'line-width-title';
        title.textContent = `${glot.get(`menu_${key}`)} — ${glot.get('layer_column_width')}`;
        panel.appendChild(title);
        const controls = document.createElement('div'); controls.className = 'line-width-controls';
        const button = (text, label) => {
            const node = document.createElement('button'); node.type = 'button'; node.className = 'btn btn-light';
            node.textContent = text; node.setAttribute('aria-label', glot.get(label)); controls.appendChild(node); return node;
        };
        this.minus = button('−', 'line_width_decrease');
        const input = document.createElement('input'); this.input = input;
        input.type = 'text'; input.inputMode = 'decimal'; input.className = 'form-control';
        input.setAttribute('aria-label', glot.get('layer_column_width'));
        input.setAttribute('aria-describedby', 'lineWidthError');
        input.addEventListener('focus', () => input.select());
        input.addEventListener('click', () => input.select());
        input.addEventListener('input', () => {
            const value = this.parse(input.value);
            this.error.hidden = value !== null;
            input.setAttribute('aria-invalid', String(value === null));
            if (value !== null) this.apply(value, false);
        });
        input.addEventListener('change', () => this.refresh());
        controls.appendChild(input);
        this.plus = button('+', 'line_width_increase'); panel.appendChild(controls);
        const error = document.createElement('div'); this.error = error; error.id = 'lineWidthError';
        error.className = 'line-width-error'; error.hidden = true; error.setAttribute('role', 'status');
        error.textContent = glot.get('line_width_range'); panel.appendChild(error);
        const done = document.createElement('button'); done.type = 'button'; done.className = 'btn btn-primary w-100';
        done.textContent = glot.get('button_ok'); done.addEventListener('click', () => this.close()); panel.appendChild(done);
        this.panel = panel; document.body.appendChild(panel);
        anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', panel.id);
        this.refresh(); this.position();
        for (const [node, direction] of [[this.minus, -1], [this.plus, 1]]) {
            node.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault(); this.stopRepeat(); this.step(direction);
                this.repeatDelay = setTimeout(() => {
                    this.repeatTimer = setInterval(() => this.step(direction), 100);
                }, 350);
            });
            // Pointer input changes on pointerdown; keyboard activation changes on click.
            node.addEventListener('click', event => { if (event.detail === 0) this.step(direction); });
        }
        this.onRelease = () => this.stopRepeat();
        this.onOutside = event => { if (!panel.contains(event.target) && event.target !== anchor) this.close(false); };
        this.onKey = event => {
            if (event.key === 'Escape') { event.preventDefault(); this.close(); }
            if (event.key === 'Enter' && event.target === input) { event.preventDefault(); this.close(); }
        };
        this.onResize = () => this.position();
        this.onScroll = event => { if (!panel.contains(event.target)) this.close(false); };
        document.addEventListener('pointerdown', this.onOutside);
        document.addEventListener('pointerup', this.onRelease);
        document.addEventListener('pointercancel', this.onRelease);
        document.addEventListener('keydown', this.onKey);
        document.addEventListener('scroll', this.onScroll, true);
        window.addEventListener('resize', this.onResize);
        window.addEventListener('blur', this.onRelease);
        (this.minus.disabled ? this.plus : this.minus).focus({ preventScroll: true });
    },
    parse(text) {
        const normalized = String(text).trim().replace(',', '.');
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
        const value = Number(normalized);
        return Number.isFinite(value) && value >= this.min && value <= this.max ? value : null;
    },
    apply(value, normalize = true) {
        if (!this.anchor) return;
        if (Number(this.anchor.value) !== value) {
            this.anchor.value = String(value);
            this.anchor.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (normalize) this.refresh();
        else this.updateButtons(value);
    },
    step(direction) {
        if (!this.anchor) return;
        const value = Math.round((Number(this.anchor.value) + direction * .1) * 10) / 10;
        this.apply(Math.max(this.min, Math.min(this.max, value)));
    },
    updateButtons(value) {
        this.minus.disabled = value <= this.min; this.plus.disabled = value >= this.max;
        if (this.minus.disabled || this.plus.disabled) this.stopRepeat();
    },
    refresh() {
        this.input.value = this.anchor.value; this.input.setAttribute('aria-invalid', 'false');
        this.error.hidden = true; this.updateButtons(Number(this.anchor.value));
    },
    position() {
        if (!this.anchor?.isConnected) { this.close(false); return; }
        const rect = this.anchor.getBoundingClientRect(), size = this.panel.getBoundingClientRect();
        this.panel.style.left = `${Math.max(12, Math.min(rect.right - size.width, innerWidth - size.width - 12))}px`;
        const below = rect.bottom + 8;
        this.panel.style.top = `${Math.max(12, below + size.height <= innerHeight - 12 ? below : rect.top - size.height - 8)}px`;
    },
    stopRepeat() { clearTimeout(this.repeatDelay); clearInterval(this.repeatTimer); },
    close(restoreFocus = true) {
        this.stopRepeat();
        if (!this.panel) return;
        const anchor = this.anchor;
        document.removeEventListener('pointerdown', this.onOutside);
        document.removeEventListener('pointerup', this.onRelease);
        document.removeEventListener('pointercancel', this.onRelease);
        document.removeEventListener('keydown', this.onKey);
        document.removeEventListener('scroll', this.onScroll, true);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('blur', this.onRelease);
        anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-controls');
        this.panel.remove(); this.panel = null; this.anchor = null;
        if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    }
};
