"use strict";

// Roof strokes plus transparent-building edges for the coloring palette.
class MapLibreBuildingOutlines {
    constructor(view) {
        this.id = 'mapmaker-editor-building-outlines';
        this.type = 'custom'; this.renderingMode = '3d'; this.view = view;
        this.blocks = new Map();
        this.origin = maplibregl.MercatorCoordinate.fromLngLat(view.getCenter());
    }
    style(model) {
        const color = chroma(model.options.color || '#000').rgba();
        const layerOpacity = Layers[model.mapmaker.key].opacity;
        return [...color.slice(0, 3).map(n => n / 255), color[3] * Number(model.options.opacity ?? 1) * Number(layerOpacity === '' ? 1 : layerOpacity ?? 1), Number(model.options.weight ?? 1)];
    }
    async prepare(models) {
        const rows = []; let count = 0;
        for (const model of models) {
            const geometry = model.feature.geometry;
            const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
            const height = getMapMakerBuildingHeight(model.feature, Conf.default.birdseye) + .02;
            const start = rows.length, style = this.style(model);
            for (const polygon of polygons) for (const ring of polygon) {
                const points = ring.map(ll => maplibregl.MercatorCoordinate.fromLngLat(ll, height));
                for (let i = 1; i < points.length; i++) {
                    const a = points[i - 1], b = points[i];
                    rows.push(a.x - this.origin.x, a.y - this.origin.y, a.z,
                        b.x - this.origin.x, b.y - this.origin.y, b.z, ...style);
                }
            }
            const wallStart = rows.length;
            const wallStyle = [...style];
            if (LayerCont.palette !== 'coloring') wallStyle[3] = 0;
            for (const polygon of polygons) for (const ring of polygon) {
                const base = ring.map(ll => maplibregl.MercatorCoordinate.fromLngLat(ll, .02));
                const top = ring.map(ll => maplibregl.MercatorCoordinate.fromLngLat(ll, height));
                const segment = (a, b) => rows.push(a.x - this.origin.x, a.y - this.origin.y, a.z,
                    b.x - this.origin.x, b.y - this.origin.y, b.z, ...wallStyle);
                for (let i = 1; i < base.length; i++) {
                    segment(base[i - 1], base[i]);
                    segment(base[i - 1], top[i - 1]);
                }
            }
            this.blocks.set(model.id, { start, wallStart, end: rows.length });
            if (++count % 300 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        this.data = new Float32Array(rows); this.count = rows.length / 11;
    }
    updateMany(models) {
        for (const model of models) this.update(model, false);
        if (this.gl) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.data);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
    }
    update(model, upload = true) {
        const block = this.blocks.get(model.id);
        if (!block) return;
        const style = this.style(model);
        for (let i = block.start; i < block.end; i += 11) {
            this.data.set(style, i + 6);
            if (i >= block.wallStart && LayerCont.palette !== 'coloring') this.data[i + 9] = 0;
        }
        if (this.gl && upload) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, block.start * 4, this.data.subarray(block.start, block.end));
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
    }
    onAdd(_map, gl) {
        this.gl = gl;
        const shader = (type, source) => {
            const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        };
        const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
            precision highp float;
            layout(location=0) in vec3 a; layout(location=1) in vec3 b;
            layout(location=2) in vec4 color; layout(location=3) in float width;
            uniform mat4 matrix; uniform vec2 viewport;
            out vec4 stroke;
            void main() {
                vec4 pa=matrix*vec4(a,1.), pb=matrix*vec4(b,1.);
                vec2 delta=(pb.xy/pb.w-pa.xy/pa.w)*viewport;
                vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),.001);
                bool endPoint=gl_VertexID==1 || gl_VertexID==2 || gl_VertexID==4;
                float side=(gl_VertexID==0 || gl_VertexID==1 || gl_VertexID==3) ? -1. : 1.;
                vec4 position=endPoint ? pb : pa;
                position.xy+=normal*side*width/viewport*position.w;
                gl_Position=position; stroke=color;
            }`);
        const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float; in vec4 stroke; out vec4 result;
            void main(){ if(stroke.a<=0.)discard; result=stroke; }`);
        this.program = gl.createProgram(); gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
        gl.deleteShader(vertex); gl.deleteShader(fragment);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
        this.matrixUniform = gl.getUniformLocation(this.program, 'matrix'); this.viewportUniform = gl.getUniformLocation(this.program, 'viewport');
        this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
        this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
        for (const [index, size, offset] of [[0,3,0],[1,3,3],[2,4,6],[3,1,10]]) {
            gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, size, gl.FLOAT, false, 44, offset * 4); gl.vertexAttribDivisor(index, 1);
        }
        gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    render(gl, args) {
        const m = [...args.defaultProjectionData.mainMatrix];
        for (let row = 0; row < 4; row++) m[12 + row] += m[row] * this.origin.x + m[4 + row] * this.origin.y;
        const size = this.view.getSize();
        gl.useProgram(this.program); gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.matrixUniform, false, new Float32Array(m)); gl.uniform2f(this.viewportUniform, size.x, size.y);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
        gl.bindVertexArray(null); gl.depthMask(true);
    }
    onRemove(_map, gl) { gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); this.gl = null; }
}
