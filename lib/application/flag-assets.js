"use strict";

// Only flags used in the current scene are fetched; SVGs are embedded for export.
const MapMakerFlagAssets = {
    entries: new Map(),
    async load(codes) {
        const queue=[...new Set(codes)].filter(code=>/^[A-Z]{2}$/.test(code));
        const load=async code=>{
            if (!this.entries.has(code)) this.entries.set(code,(async()=>{
                const response=await fetch(new URL(`./image/flags/${code.toLowerCase()}.svg`,document.baseURI),{signal:AbortSignal.timeout(15000)});
                if (!response.ok) throw new Error(`Flag ${code}: HTTP ${response.status}`);
                const svg=await response.text();
                const href='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));
                const image=new Image();image.src=href;await image.decode();
                // Retain a small bitmap, rather than every SVG's full-size decode.
                const bitmap=document.createElement('canvas');bitmap.width=124;bitmap.height=92;
                bitmap.getContext('2d').drawImage(image,0,0,124,92);
                return {href,image:bitmap};
            })().catch(error=>{console.warn('Flag image unavailable; using a plain flag',code,error);return null;}));
            await this.entries.get(code);
        };
        await Promise.all(Array.from({length:Math.min(8,queue.length)},async()=>{while(queue.length)await load(queue.shift());}));
    },
    async atlas(codes) {
        const keys=[...new Set(codes)].sort();await this.load(keys);
        const entries=(await Promise.all(keys.map(async code=>[code,await this.entries.get(code)]))).filter(([,entry])=>entry);
        const key=entries.map(([code])=>code).join(':');
        if (this.cached?.key===key) return this.cached;
        if (!entries.length) return null;
        const canvas=document.createElement('canvas'),columns=Math.min(16,entries.length);
        canvas.width=columns*128;canvas.height=Math.ceil(entries.length/columns)*96;
        const context=canvas.getContext('2d'),rects={};
        entries.forEach(([code,entry],i)=>{
            const x=(i%columns)*128+2,y=Math.floor(i/columns)*96+2;
            context.drawImage(entry.image,x,y,124,92);
            rects[code]=[x/canvas.width,y/canvas.height,124/canvas.width,92/canvas.height];
        });
        this.cached={key,canvas,rects};return this.cached;
    },
    async forFeatures(features) {
        const codes=features.map(MapMakerDomain.nationalFlagCode).filter(Boolean);
        await this.load(codes);
        const result={};
        for(const code of new Set(codes)){const entry=await this.entries.get(code);if(entry)result[code]=entry.href;}
        return result;
    }
};
