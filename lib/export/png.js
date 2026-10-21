"use strict";

// Rasterize an SVG document; downloading is owned by the caller.
async function svgDocumentToPNG(outText, canvas_width, canvas_height, dpi) {
        const svgBlob = new Blob([outText], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);

        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = "anonymous";
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("PNG image load failed"));
                image.src = svgUrl;
            });

            const canvas = document.createElement("canvas");
            canvas.width = canvas_width;
            canvas.height = canvas_height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D context is not available");
            ctx.drawImage(img, 0, 0, canvas_width, canvas_height);

            const pngBlob = await new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error("Canvas PNG conversion failed"));
                }, "image/png");
            });
            return dpi ? setPNGResolution(pngBlob, dpi) : pngBlob;
        } finally {
            URL.revokeObjectURL(svgUrl);
        }
}

// Replace/add the small pHYs chunk without copying the full high-resolution image.
async function setPNGResolution(blob, dpi) {
    const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
    view.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4); // pHYs
    const pixelsPerMetre = Math.round(Number(dpi) / 0.0254);
    view.setUint32(8, pixelsPerMetre); view.setUint32(12, pixelsPerMetre); chunk[16] = 1;
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 17)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
    let start = 33, end = 33;
    for (let offset = 8; offset + 12 <= blob.size;) {
        const header = new Uint8Array(await blob.slice(offset, offset + 8).arrayBuffer());
        const length = new DataView(header.buffer).getUint32(0), type = String.fromCharCode(...header.subarray(4));
        if (type === 'pHYs') { start = offset; end = offset + length + 12; break; }
        if (type === 'IDAT' || type === 'IEND') break;
        offset += length + 12;
    }
    return new Blob([blob.slice(0, start), chunk, blob.slice(end)], {type:'image/png'});
}
