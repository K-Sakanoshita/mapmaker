"use strict";

// SVG jobs share a persistent Worker and run serially. Cancellation invalidates queued work.
class SVGExportWorkerClient {
    constructor() { this.generation = 0; this.serial = 0; this.queue = Promise.resolve(); }
    release(error = new Error('Preview cancelled')) {
        this.generation++;
        this.worker?.terminate(); this.worker = null;
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(error); this.pending = null;
        }
    }
    enqueue(capture, exporterOptions, bbox, options) {
        const generation = this.generation;
        const task = this.queue.then(async () => {
            if (generation !== this.generation) throw new Error('Preview cancelled');
            const snapshot = await capture();
            if (generation !== this.generation) throw new Error('Preview cancelled');
            return this.render(snapshot, exporterOptions, bbox, options);
        });
        this.queue = task.catch(() => {});
        return task;
    }
    render(snapshot, exporterOptions, bbox, options) {
        if (!this.worker) {
            this.worker = new Worker(new URL('./lib/workers/svg-export.js?v=layout-8', document.baseURI));
            this.worker.onmessage = ({data}) => {
                const pending = this.pending;
                if (!pending || pending.id !== data.id || pending.revision !== data.revision) return;
                clearTimeout(pending.timer); this.pending = null;
                data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.svgText);
            };
            this.worker.onerror = event => this.release(new Error(event.message || 'SVG worker failed'));
        }
        return new Promise((resolve, reject) => {
            const id = ++this.serial, revision = this.generation;
            const timer = setTimeout(() => this.release(new Error('SVG worker timeout')), 150000);
            this.pending = {id, revision, resolve, reject, timer};
            try { this.worker.postMessage({id, revision, snapshot, exporterOptions, bbox, options}); }
            catch (error) { this.release(error); }
        });
    }
}
