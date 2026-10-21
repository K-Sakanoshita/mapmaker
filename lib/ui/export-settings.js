"use strict";

// One size calculation for the save menu and PNG rasterization.
const ExportSettings = {
    paperSizes: {
        A4: { w: 210, h: 297 }, A4_landscape: { w: 297, h: 210 },
        A3: { w: 297, h: 420 }, A3_landscape: { w: 420, h: 297 }
    },
    dimensions(mode, dpi, rect) {
        const paper = this.paperSizes[mode];
        dpi = Number(dpi);
        if (!(Number.isFinite(dpi) && dpi > 0)) dpi = 300;
        if (paper) return { width: Math.round(paper.w / 25.4 * dpi), height: Math.round(paper.h / 25.4 * dpi), paper };
        // Screen exports have no physical paper size: 2x / 4x / 8x pixels.
        return { width: Math.round(rect.width * dpi / 75), height: Math.round(rect.height * dpi / 75),
            paper: { w: 210, h: 210 * rect.height / rect.width } };
    },
    init(maker) {
        this.maker = maker;
        document.getElementById('exportPaperSize').addEventListener('change', event => maker.area_select(event.target.value));
        document.getElementById('exportQuality').addEventListener('change', event => {
            Conf.default.Paper.dpi = Number(event.target.value);
            this.update();
        });
        document.getElementById('saveDownloadMenu').addEventListener('show.bs.dropdown', () => this.update());
        window.addEventListener('resize', () => {
            if (document.getElementById('exportSaveMenu').classList.contains('show')) this.update();
        });
        this.update();
    },
    update() {
        if (!this.maker) return;
        const mode = this.maker.selectMode, dpi = Number(Conf.default.Paper.dpi);
        document.getElementById('exportPaperSize').value = mode;
        document.getElementById('exportQuality').value = String(dpi);
        const keys = {150:'export_quality_standard',300:'export_quality_high',600:'export_quality_highest'};
        for (const option of document.getElementById('exportQuality').options) {
            option.textContent = glot.get(keys[option.value]) + (mode ? ` (${option.value} dpi)` : '');
        }
        const {width,height} = this.dimensions(mode, dpi, this.maker.captureExportRect(mode));
        document.getElementById('exportPixelSize').textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`;
        document.getElementById('exportQualityNote').classList.toggle('d-none', dpi !== 600);
        const button = document.getElementById('saveDownloadMenu');
        const rect = button.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        document.getElementById('exportSaveMenu').style.maxHeight = `${Math.max(100, Math.max(rect.top, viewportHeight - rect.bottom) - 16)}px`;
        // Popper must reconsider placement when the high-resolution note appears.
        if (typeof bootstrap !== 'undefined') bootstrap.Dropdown.getInstance(document.getElementById('saveDownloadMenu'))?.update();
    }
};
