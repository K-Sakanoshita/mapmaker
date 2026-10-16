const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
// Run the actual browser worker in its own global scope and clone both messages.
module.exports = class SVGWorker {
    constructor() {
        this.box = vm.createContext({ console, self: { postMessage: data => queueMicrotask(() => this.onmessage?.({data: structuredClone(data)})) } });
        this.box.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join('lib', file.split('?')[0]), 'utf8'), this.box));
        vm.runInContext(fs.readFileSync('lib/svg-export-worker.js', 'utf8'), this.box);
    }
    postMessage(data) { const copy = structuredClone(data); queueMicrotask(() => this.box.self.onmessage({data: copy})); }
    terminate() {}
};
