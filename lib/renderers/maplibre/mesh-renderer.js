"use strict";

// Roof/tree surfaces, building outlines and open fence/rope barriers in one depth-tested mesh.
class MapLibreMeshRenderer {
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
        const rows = [], fills = []; let count = 0;
        for (const model of models) {
            const tree=['tree','flagpole'].includes(model.mapmaker?.pointStyleName) ? model.mapmaker.sourceFeature : null;
            const openBarrier = isMapMakerMeshBarrier(model.feature);
            const geometry = model.feature.geometry;
            const polygons = tree || openBarrier?[]:geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
            const mesh = openBarrier?getMapMakerBarrierMesh(model.feature,{...Conf.default.birdseye,viewZoom:this.view.getZoom?.(),tilt:this.view.getPitch?.()}):tree?getMapMakerPointParts(tree).find(part=>part.mesh).mesh:getMapMakerRoofMesh(model.feature, Conf.default.birdseye);
            const range=tree?{base:mesh.base,wallHeight:mesh.height}:getMapMakerBuildingRange(model.feature,Conf.default.birdseye);
            const height=range.wallHeight+.02;
            const start = rows.length, style = this.style(model);
            style[4] *= mesh?.strokeScale ?? 1;
            const roofStart = fills.length;
            if (mesh) {
                for (const [index, [a,b]] of mesh.edges.entries()) {
                    const pa=maplibregl.MercatorCoordinate.fromLngLat(a,a[2]+.02),pb=maplibregl.MercatorCoordinate.fromLngLat(b,b[2]+.02);
                    rows.push(pa.x-this.origin.x,pa.y-this.origin.y,pa.z,pb.x-this.origin.x,pb.y-this.origin.y,pb.z,...style.slice(0,4),style[4]*(mesh.edgeWidths?.[index] ?? 1));
                }
                for (const face of mesh.faces) for(let i=1;i<face.points.length-1;i++) {
                    for(const ll of [face.points[0],face.points[i],face.points[i+1]]) {
                        const p=maplibregl.MercatorCoordinate.fromLngLat(ll,ll[2]);
                        const fill=this.fillStyle(model,face);
                        fills.push(p.x-this.origin.x,p.y-this.origin.y,p.z,...fill);
                    }
                }
            }
            if (!mesh) for (const polygon of polygons) for (const ring of polygon) {
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
                const base = ring.map(ll => maplibregl.MercatorCoordinate.fromLngLat(ll, range.base+.02));
                const top = ring.map(ll => maplibregl.MercatorCoordinate.fromLngLat(ll, height));
                const segment = (a, b) => rows.push(a.x - this.origin.x, a.y - this.origin.y, a.z,
                    b.x - this.origin.x, b.y - this.origin.y, b.z, ...wallStyle);
                for (let i = 1; i < base.length; i++) {
                    segment(base[i - 1], base[i]);
                    segment(base[i - 1], top[i - 1]);
                }
            }
            this.blocks.set(model.id, { start, wallStart, end: rows.length, roofStart, roofEnd: fills.length, mesh });
            if (++count % 300 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        this.data = new Float32Array(rows); this.count = rows.length / 11;
        this.fillData = new Float32Array(fills); this.fillCount = fills.length / 7;
    }
    fillStyle(model, face) {
        const fill=face.color || model.options.fillColor || model.options.color || '#000';
        const rgba=chroma(model.mapmaker?.pointStyleName==='tree'?getMapMakerSeasonColor(model.mapmaker.sourceFeature,'tree',fill):fill).rgba();
        return [...rgba.slice(0,3).map(n=>n/255*face.shade),
            LayerCont.palette==='coloring'&&!['tree','flagpole'].includes(model.mapmaker?.pointStyleName)?0:rgba[3]*Number(model.options.opacity ?? 1)*Number(Layers[model.mapmaker.key].opacity === ''?1:Layers[model.mapmaker.key].opacity ?? 1)];
    }
    uploadFills() {
        if (!this.gl || !this.fillBuffer) return;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.fillBuffer);
        this.gl.bufferSubData(this.gl.ARRAY_BUFFER,0,this.fillData);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null);
    }
    updateMany(models) {
        for (const model of models) this.update(model, false);
        if (this.gl) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.data);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
            this.uploadFills();
        }
    }
    update(model, upload = true) {
        const block = this.blocks.get(model.id);
        if (!block) return;
        const style = this.style(model);
        style[4] *= block.mesh?.strokeScale ?? 1;
        for (let i = block.start; i < block.end; i += 11) {
            this.data.set(style, i + 6);
            this.data[i + 10] *= block.mesh?.edgeWidths?.[(i-block.start)/11] ?? 1;
            if (i >= block.wallStart && LayerCont.palette !== 'coloring') this.data[i + 9] = 0;
        }
        let cursor=block.roofStart;
        for(const face of block.mesh?.faces || []) {
            const color=this.fillStyle(model,face);
            for(let i=0;i<(face.points.length-2)*3;i++,cursor+=7) this.fillData.set(color,cursor+3);
        }
        if (this.gl && upload) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, block.start * 4, this.data.subarray(block.start, block.end));
            this.uploadFills();
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
        const fillVertex=shader(gl.VERTEX_SHADER, `#version 300 es
            precision highp float; layout(location=0) in vec3 position; layout(location=1) in vec4 color;
            uniform mat4 matrix; out vec4 stroke;
            void main(){gl_Position=matrix*vec4(position,1.);stroke=color;}`);
        const fillFragment=shader(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float; in vec4 stroke; out vec4 result;
            void main(){if(stroke.a<=0.)discard;result=stroke;}`);
        this.fillProgram=gl.createProgram();gl.attachShader(this.fillProgram,fillVertex);gl.attachShader(this.fillProgram,fillFragment);gl.linkProgram(this.fillProgram);
        gl.deleteShader(fillVertex);gl.deleteShader(fillFragment);
        if(!gl.getProgramParameter(this.fillProgram,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.fillProgram));
        this.fillMatrix=gl.getUniformLocation(this.fillProgram,'matrix');
        this.fillVao=gl.createVertexArray();gl.bindVertexArray(this.fillVao);
        this.fillBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.fillBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.fillData,gl.DYNAMIC_DRAW);
        for(const [index,size,offset] of [[0,3,0],[1,4,3]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,28,offset*4);}
        gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    }
    render(gl, args) {
        const m = [...args.defaultProjectionData.mainMatrix];
        for (let row = 0; row < 4; row++) m[12 + row] += m[row] * this.origin.x + m[4 + row] * this.origin.y;
        const size = this.view.getSize();
        gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
        if(this.fillCount){
            gl.depthMask(true);gl.useProgram(this.fillProgram);gl.bindVertexArray(this.fillVao);
            gl.uniformMatrix4fv(this.fillMatrix,false,new Float32Array(m));gl.drawArrays(gl.TRIANGLES,0,this.fillCount);
        }
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.program); gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.matrixUniform, false, new Float32Array(m)); gl.uniform2f(this.viewportUniform, size.x, size.y);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
        gl.bindVertexArray(null); gl.depthMask(true);
    }
    onRemove(_map, gl) { gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); gl.deleteBuffer(this.fillBuffer);gl.deleteVertexArray(this.fillVao);gl.deleteProgram(this.fillProgram);this.gl = null; }
}
