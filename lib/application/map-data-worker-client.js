"use strict";

// A data acquisition owns one Worker; finishing or cancelling terminates it.
const MapDataWorkerClient = {
    run(request, {progress, stage, signal} = {}) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) { reject(new Error('Map data cancelled')); return; }
            const worker = new Worker(new URL('./lib/workers/map-data.js?v=layout-6', document.baseURI));
            let settled = false;
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', cancel);
                worker.terminate();
                error ? reject(error) : resolve(result);
            };
            const cancel = () => finish(Object.assign(new Error('Map data cancelled'), {retryable:false}));
            const timer = setTimeout(() => finish(Object.assign(new Error('Map data timeout'), {retryable:true})),
                (request.config?.timeoutMs ?? 150000) + 15000);
            signal?.addEventListener('abort', cancel, {once:true});
            worker.onmessage = ({data}) => {
                if (data.progress !== undefined) { progress?.(data.progress); return; }
                if (data.stage) { stage?.(data.stage); return; }
                if (data.error) {
                    const error = Object.assign(new Error(data.error), {retryable:data.retryable ?? false, code:data.code});
                    if (data.retryAfter) error.jqXHR = {getResponseHeader:() => data.retryAfter};
                    finish(error);
                } else finish(null, data.result);
            };
            worker.onerror = event => finish(Object.assign(new Error(event.message || 'Map data conversion failed'), {retryable:false}));
            try { worker.postMessage(request); } catch (error) { finish(error); }
        });
    }
};
