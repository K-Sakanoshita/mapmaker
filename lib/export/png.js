"use strict";

// Rasterize an SVG document; downloading is owned by the caller.
async function svgDocumentToPNG(outText, canvas_width, canvas_height) {
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
            return pngBlob;
        } finally {
            URL.revokeObjectURL(svgUrl);
        }
}
