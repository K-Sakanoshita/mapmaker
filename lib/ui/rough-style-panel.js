"use strict";

const RoughStylePanel = {
    selectFill() {
        document.getElementById('rough_enabled').checked = document.getElementById('rough_fill_style').value !== 'none';
        this.toggle();
    },
    toggle() {
        mapMaker.rough_change();
        if (document.getElementById('rough_enabled').checked) this.open();
        else this.close(false);
    },
    open() {
        if (this.panel || !document.getElementById('rough_enabled').checked) return;
        LineWidthPanel.close(false);
        const anchor = document.getElementById('roughDetailsButton');
        const parameters = document.getElementById('roughParameters');
        this.anchor = anchor;
        this.home = parameters.parentNode;
        this.next = parameters.nextSibling;
        const panel = document.createElement('div');
        panel.id = 'roughStylePanel'; panel.className = 'line-width-panel rough-style-panel';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'roughStyleTitle');
        const title = document.createElement('div');
        title.id = 'roughStyleTitle'; title.className = 'line-width-title'; title.textContent = glot.get('rough_style');
        const header = document.createElement('div'); header.className = 'd-flex justify-content-between align-items-start';
        const close = document.createElement('button'); close.type = 'button'; close.className = 'btn-close';
        close.setAttribute('aria-label', glot.get('button_close')); close.addEventListener('click', () => this.close());
        header.append(title, close); panel.append(header, parameters); parameters.classList.remove('d-none');
        this.panel = panel; document.body.appendChild(panel);
        anchor.setAttribute('aria-controls', panel.id);
        anchor.setAttribute('aria-expanded', 'true');
        this.position();
        this.onOutside = event => { if (!panel.contains(event.target) && !anchor.contains(event.target)) this.close(false); };
        this.onKey = event => { if (event.key === 'Escape') { event.preventDefault(); this.close(); } };
        this.onResize = () => this.position();
        this.onScroll = event => { if (!panel.contains(event.target)) this.close(false); };
        document.addEventListener('pointerdown', this.onOutside);
        document.addEventListener('keydown', this.onKey);
        document.addEventListener('scroll', this.onScroll, true);
        window.addEventListener('resize', this.onResize);
        parameters.querySelector('input')?.focus({ preventScroll: true });
    },
    // Use the same viewport-aware placement as the line-width dialog.
    position() { LineWidthPanel.position.call(this); },
    close(restoreFocus = true) {
        if (!this.panel) return;
        const parameters = document.getElementById('roughParameters'), anchor = this.anchor;
        parameters.classList.add('d-none');
        this.home.insertBefore(parameters, this.next);
        document.removeEventListener('pointerdown', this.onOutside);
        document.removeEventListener('keydown', this.onKey);
        document.removeEventListener('scroll', this.onScroll, true);
        window.removeEventListener('resize', this.onResize);
        anchor.removeAttribute('aria-controls');
        anchor.setAttribute('aria-expanded', 'false');
        this.panel.remove(); this.panel = null; this.anchor = null; this.home = null; this.next = null;
        if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    }
};
