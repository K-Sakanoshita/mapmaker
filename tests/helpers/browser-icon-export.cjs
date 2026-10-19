const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');

// Exercise the real icon cache, marker DOM, SVG composition and PNG save path.
module.exports = async (page, output) => {
    await page.waitForFunction(() => ['sandbox','slide','playground'].every(name => SVGCont.SvgIcon['icon/'+name+'.png']), null, {timeout:60000});
    const results = await page.evaluate(async () => {
        const results = [], originalBuild = SVGCont.buildSVG, originalSave = SVGCont._saveBlob;
        const originalSize = [Conf.effect.icon.x,Conf.effect.icon.y];
        Conf.effect.icon.x = Conf.effect.icon.y = 20;
        let marker;
        const pixels = async blob => {
            const image = await createImageBitmap(blob), canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image,0,0); image.close();
            return {context, width:canvas.width, height:canvas.height};
        };
        try {
            for (const name of ['sandbox','slide','playground']) for (const fallback of [false,true]) {
                const filename = 'icon/'+name+'.png', absolute = new URL(filename,document.baseURI).href;
                const savedCache = [SVGCont.SvgIcon[filename],SVGCont.SvgIcon[absolute]];
                if (fallback) { delete SVGCont.SvgIcon[filename]; delete SVGCont.SvgIcon[absolute]; }
                try {
                    const content = Marker.markerContent('',filename);
                    content.querySelector('img').dataset.iconPreset = 'standard';
                    marker = MapEngine.marker(map.getCenter(),{icon:MapEngine.divIcon({html:content})}).addTo(map);
                    await content.querySelector('img').decode();
                    const root = document.createElementNS('http://www.w3.org/2000/svg','svg');
                    root.setAttribute('width','1000');root.setAttribute('height','500');root.setAttribute('viewBox','0 0 100 50');
                    await new Promise(resolve => SVGCont.makeSVG(root,resolve,{bbox:[134,34,136,36],paperMm:{w:100,h:50},screenMmPerPx:1,transform:{toPageMmXY:()=>[30,25]}}));
                    const text = SVGCont._svgDomToText(root);
                    let saved;
                    SVGCont.buildSVG = async () => ({outText:text,canvas_width:1000,canvas_height:500});
                    SVGCont._saveBlob = (blob,type) => { if(type==='png')saved=blob; };
                    await SVGCont.save({type:'png'});
                    const raster = await pixels(saved), data = raster.context.getImageData(240,190,120,120).data;
                    let black = 0, white = 0;
                    for(let i=0;i<data.length;i+=4) {
                        if(data[i+3]>240&&data[i]<64&&data[i+1]<64&&data[i+2]<64)black++;
                        if(data[i+3]>240&&data[i]>240&&data[i+1]>240&&data[i+2]>240)white++;
                    }
                    const embedded = root.querySelector('image');let transparent = 0;
                    if(embedded) {
                        const source = await pixels(await (await fetch(embedded.getAttribute('href'))).blob());
                        const rgba = source.context.getImageData(0,0,source.width,source.height).data;
                        for(let i=3;i<rgba.length;i+=4)if(rgba[i]===0)transparent++;
                    }
                    results.push({name,fallback,black:black/14400,white:white/14400,transparent,
                        vector:!!root.querySelector('path'),embedded:embedded?.getAttribute('href').split(';')[0],
                        svg:text,png:Array.from(new Uint8Array(await saved.arrayBuffer()))});
                } finally {
                    marker?.remove(); marker=null;
                    for(const [i,key] of [filename,absolute].entries()) {
                        if(savedCache[i]===undefined)delete SVGCont.SvgIcon[key];else SVGCont.SvgIcon[key]=savedCache[i];
                    }
                }
            }
        } finally {
            marker?.remove();SVGCont.buildSVG=originalBuild;SVGCont._saveBlob=originalSave;
            [Conf.effect.icon.x,Conf.effect.icon.y]=originalSize;
        }
        return results;
    });
    if(output)await fs.mkdir(output,{recursive:true});
    for(const result of results) {
        const label=result.name+(result.fallback?'-fallback':'-vector');
        if(output) {
            await fs.writeFile(path.join(output,label+'.svg'),result.svg);
            await fs.writeFile(path.join(output,label+'.png'),Buffer.from(result.png));
        }
        assert.ok(result.black>.05&&result.black<.8,label+' retains the glyph instead of a black square');
        assert.ok(result.white>.15,label+' retains white gaps within the glyph bounds');
        if(result.fallback) {
            assert.equal(result.embedded,'data:image/png',label+' uses a lossless alpha-capable image');
            assert.ok(result.transparent>0,label+' retains source transparency');
        } else {
            assert.equal(result.vector,true,label+' matches absolute marker URLs to cached SVG');
            assert.equal(result.embedded,undefined,label+' remains editable vector geometry');
        }
    }
    return results.map(({name,fallback,black,white})=>({name,fallback,black,white}));
};
