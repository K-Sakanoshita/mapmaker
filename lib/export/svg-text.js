"use strict";

// Browser SVG text/measurement helpers, shared by labels and document overlays.
const SVGTextLayout = {
    writeRect(svg, param) {
        const root = this._getSvgRoot(svg);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", param.x);
        rect.setAttribute("y", param.y);
        rect.setAttribute("width", param.width);
        rect.setAttribute("height", param.height);
        rect.setAttribute("fill", "white");
        rect.setAttribute("fill-opacity", param.opacity ?? 1);
        rect.setAttribute("stroke", "black");
        rect.setAttribute("stroke-width", param.strokeWidth ?? 0.25);
        root.appendChild(rect);
    },

    textWrite(svg, params) {
        const root = this._getSvgRoot(svg);
        if (!root) throw new Error("textWrite: svg root not found");

        const NS = "http://www.w3.org/2000/svg";
        const pad = params.padMm ?? 2;
        const lineHeightEm = params.lineHeightEm ?? 1.2;
        const maxWidthMm = params.maxWidthMm ?? 60;
        const background = params.background !== false;

        // 1行ラベルだけは背景を少しタイトにする
        // 既存出力例の 7.1989... -> 6.6658... に合わせるなら 5/6 がちょうどよい
        const singleLineHeightScale = params.singleLineHeightScale ?? (5 / 6);

        let measureFont;
        let fontSizeUser;
        let pxToUser;

        if (params.sizePx != null && params.mmPerPx != null) {
            measureFont = `${params.sizePx}px ${params.font}`;
            fontSizeUser = params.sizePx * params.mmPerPx;
            pxToUser = params.mmPerPx;
        } else if (params.sizePt != null) {
            const ptToUser = 25.4 / 72;
            measureFont = `${params.sizePt}pt ${params.font}`;
            fontSizeUser = params.sizePt * ptToUser;
            pxToUser = 25.4 / 96;
        } else {
            throw new Error("textWrite: sizePx+mmPerPx or sizePt required");
        }

        const maxWidthPx = maxWidthMm / pxToUser;

        const wrapLines = (text, maxWidthPx) => {
            const out = [];
            const paragraphs = String(text ?? "").split(/\r?\n/);

            for (const para of paragraphs) {
                if (para === "") {
                    out.push("");
                    continue;
                }

                let line = "";
                for (const ch of para) {
                    const test = line + ch;
                    const m = this.getTextSize({ text: test, font: measureFont });
                    if (line !== "" && m.width > maxWidthPx) {
                        out.push(line);
                        line = ch;
                    } else {
                        line = test;
                    }
                }
                if (line !== "") out.push(line);
            }

            return out.length ? out : [""];
        };

        const lines = wrapLines(params.text, maxWidthPx);

        let textWidthPx = 0;
        for (const line of lines) {
            const m = this.getTextSize({ text: line || " ", font: measureFont });
            textWidthPx = Math.max(textWidthPx, m.width);
        }

        const oneLine = this.getTextSize({ text: "あ", font: measureFont });
        const lineHeightPx = oneLine.height * lineHeightEm;
        const isSingleLine = lines.length === 1;

        const textHeightPx = isSingleLine
            ? oneLine.height * singleLineHeightScale
            : lineHeightPx * lines.length;

        const wUser = textWidthPx * pxToUser;
        const hUser = textHeightPx * pxToUser;

        let x0 = params.x;
        if (params.anchor === "middle") x0 = params.x - wUser / 2;
        if (params.anchor === "end") x0 = params.x - wUser;

        if (background) {
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", String(x0));
            rect.setAttribute("y", String(params.y - hUser / 2 - pad));
            rect.setAttribute("rx", "1.5");
            rect.setAttribute("ry", "1.5");
            rect.setAttribute("width", String(wUser + pad * 2));
            rect.setAttribute("height", String(hUser + pad * 2));
            rect.setAttribute("fill", "white");
            rect.setAttribute("fill-opacity", "0.6");
            root.appendChild(rect);
        }

        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", String(x0 + pad));
        t.setAttribute("text-anchor", "start");
        t.setAttribute("font-family", params.font);
        t.setAttribute("font-size", String(fontSizeUser));
        t.setAttribute("fill", params.color);

        if (isSingleLine) {
            // 1行時はラベル中心に文字を置く
            t.setAttribute("y", String(params.y));
            t.setAttribute("dominant-baseline", "middle");
        } else {
            // 複数行時は従来通り上から積む
            t.setAttribute("y", String(params.y - hUser / 2 + (oneLine.height * pxToUser) / 2));
        }

        lines.forEach((line, i) => {
            const span = document.createElementNS(NS, "tspan");
            span.setAttribute("x", String(x0 + pad));
            span.setAttribute("dy", i === 0 ? "0" : `${lineHeightEm}em`);
            span.textContent = line || " ";
            t.appendChild(span);
        });

        root.appendChild(t);

        return {
            width: wUser,
            height: hUser,
            lines
        };
    },

    measureWrappedText(params) {
        const lineHeightEm = params.lineHeightEm ?? 1.2;
        const wrapTighten = params.wrapTightenPx ?? 6;
        const maxWidthPx = (params.maxWidthMm / params.pxToUser) - wrapTighten;
        const measureFont = params.font;

        const wrapLines = (text, maxWidthPx) => {
            const out = [];
            const paragraphs = String(text ?? "").split(/\r?\n/);

            for (const para of paragraphs) {
                if (para === "") {
                    out.push("");
                    continue;
                }

                let line = "";
                for (const ch of para) {
                    const test = line + ch;
                    const m = this.getTextSize({ text: test, font: measureFont });
                    if (line !== "" && m.width > maxWidthPx) {
                        out.push(line);
                        line = ch;
                    } else {
                        line = test;
                    }
                }
                if (line !== "") out.push(line);
            }

            return out.length ? out : [""];
        };

        const lines = wrapLines(params.text, maxWidthPx);

        let textWidthPx = 0;
        for (const line of lines) {
            const m = this.getTextSize({ text: line || " ", font: measureFont });
            textWidthPx = Math.max(textWidthPx, m.width);
        }

        const oneLine = this.getTextSize({ text: "あ", font: measureFont });
        const lineHeightPx = oneLine.height * lineHeightEm;
        const isSingleLine = lines.length === 1;
        const textHeightPx = isSingleLine ? oneLine.height : (lineHeightPx * lines.length);

        return {
            width: textWidthPx * params.pxToUser,
            height: textHeightPx * params.pxToUser,
            lines
        };
    },

    getTextSize(params) {
        let canvas = document.createElement('canvas');
        let context = canvas.getContext('2d');
        context.font = params.font;
        var metrics = context.measureText(params.text);
        return { width: metrics.width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
    }
};
