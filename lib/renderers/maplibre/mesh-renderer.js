"use strict";

// Roof/tree surfaces, building outlines and open fence/rope barriers in one depth-tested mesh.
class MapLibreMeshRenderer {
    constructor(view) {
        this.id = 'mapmaker-editor-building-outlines';
        this.type = 'custom'; this.renderingMode = '3d'; this.view = view;
        this.blocks = new Map();
        this.walkways = new Map(); this.walkwayRevision = 0;
        this.origin = maplibregl.MercatorCoordinate.fromLngLat(view.getCenter());
    }
    style(model) {
        const color = chroma(model.options.color || '#000').rgba();
        const layerOpacity = Layers[model.mapmaker.key].opacity;
        return [...color.slice(0, 3).map(n => n / 255), color[3] * Number(model.options.opacity ?? 1) * Number(layerOpacity === '' ? 1 : layerOpacity ?? 1), Number(model.options.weight ?? 1)];
    }
    async prepare(models, pathMeshes = new Map()) {
        // Plan once, then write directly into exact-size GPU buffers. Keeping
        // full Number[] staging arrays here doubled large meshes during upload.
        const plans = []; let rowSize = 0, fillVertices = 0;
        const codes=models.map(model=>MapMakerDomain.nationalFlagCode(model.mapmaker?.sourceFeature)).filter(Boolean);
        this.flagAtlas=LayerCont.palette==='color' && codes.length ? await MapMakerFlagAssets.atlas(codes) : null;
        // Share one time budget across planning and writing; check before the
        // next model so completion never adds an unnecessary trailing pause.
        let sliceStart = performance.now();
        for (const model of models) {
            if (performance.now() - sliceStart >= 12) {
                await new Promise(resolve => setTimeout(resolve, 0));
                sliceStart = performance.now();
            }
            const tree=['tree','flagpole'].includes(model.mapmaker?.pointStyleName) ? model.mapmaker.sourceFeature : null;
            const openBarrier = isMapMakerMeshBarrier(model.feature);
            const pathMesh = pathMeshes.get(MapMakerGeometry.pathKey(model.feature));
            if(pathMesh?.shape==='walkway') {
                const lines=pathMesh.lines.map(line=>line.map(ll=>{const p=maplibregl.MercatorCoordinate.fromLngLat(ll,ll[2]+.02);return [p.x-this.origin.x,p.y-this.origin.y,p.z];}));
                this.walkways.set(model.id,{model,lines});
                this.blocks.set(model.id,{mesh:pathMesh});
                continue;
            }
            const geometry = model.feature.geometry;
            const polygons = pathMesh || tree || openBarrier?[]:geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
            const roof = pathMesh || tree || openBarrier ? undefined : getMapMakerRoofMesh(model.feature, Conf.default.birdseye);
            const mesh = pathMesh || (openBarrier?getMapMakerBarrierMesh(model.feature,{...Conf.default.birdseye,viewZoom:this.view.getZoom?.(),tilt:this.view.getPitch?.()}):tree?getMapMakerPointParts(tree).find(part=>part.mesh).mesh:roof);
            const range=tree?{base:mesh.base,wallHeight:mesh.height}:getMapMakerBuildingRange(model.feature,Conf.default.birdseye,roof);
            let segments = 0;
            for (const polygon of polygons) for (const ring of polygon) segments += Math.max(0, ring.length - 1);
            rowSize += (mesh ? mesh.edges.length : segments) * 11 + segments * 22;
            for (const face of mesh?.faces || []) fillVertices += Math.max(0, face.points.length - 2) * 3;
            plans.push({ model, polygons, mesh, range, pathMesh });
        }
        this.data = new Float32Array(rowSize);
        this.fillData = new Float32Array(fillVertices * 7);
        this.fillUVs = new Float32Array(fillVertices * 2);
        // Keep per-model offsets in scalar units, as used by update()/bufferSubData.
        const writer = data => ({ length: 0, push(...values) { data.set(values, this.length); this.length += values.length; } });
        const rows = writer(this.data), fills = writer(this.fillData), uvs = writer(this.fillUVs);
        for (const { model, polygons, mesh, range, pathMesh } of plans) {
            if (performance.now() - sliceStart >= 12) {
                await new Promise(resolve => setTimeout(resolve, 0));
                sliceStart = performance.now();
            }
            const height=range.wallHeight+.02;
            const start = rows.length, style = this.style(model);
            style[4] *= mesh?.strokeScale ?? 1;
            if(pathMesh) for(let i=0;i<3;i++)style[i]*=.85;
            const roofStart = fills.length;
            if (mesh) {
                for (const [index, [a,b]] of mesh.edges.entries()) {
                    const pa=maplibregl.MercatorCoordinate.fromLngLat(a,a[2]+.02),pb=maplibregl.MercatorCoordinate.fromLngLat(b,b[2]+.02);
                    rows.push(pa.x-this.origin.x,pa.y-this.origin.y,pa.z,pb.x-this.origin.x,pb.y-this.origin.y,pb.z,...style.slice(0,4),style[4]*(mesh.edgeWidths?.[index] ?? 1));
                }
                for (const face of mesh.faces) for(let i=1;i<face.points.length-1;i++) {
                    for(const index of [0,i,i+1]) {
                        const ll=face.points[index],rect=this.flagAtlas?.rects[face.texture],uv=face.uv?.[index];
                        uvs.push(...(rect && uv ? [rect[0]+uv[0]*rect[2],rect[1]+uv[1]*rect[3]] : [-1,-1]));
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
        }
        this.count = rows.length / 11;
        this.fillCount = fills.length / 7;
    }
    fillStyle(model, face) {
        const path = this.blocks.get(model.id)?.mesh?.path || ['deck','stairs'].includes(face.kind);
        let fill=face.color || (path ? model.options.color : model.options.fillColor) || model.options.color || '#000';
        if(face.kind==='stairs')fill=MapMakerDomain.stairFillColor(fill,LayerCont.palette);
        if(model.mapmaker?.pointStyleName==='flagpole') {
            const style=getMapMakerPointStyle('flagpole');
            if(face.kind==='pole') fill=style.lineColor;
            else if(LayerCont.palette!=='color') fill=style.fillColor;
            else if(face.texture && this.flagAtlas?.rects[face.texture]) fill='#ffffff';
        }
        const rgba=chroma(model.mapmaker?.pointStyleName==='tree'?getMapMakerSeasonColor(model.mapmaker.sourceFeature,'tree',fill):fill).rgba();
        return [...rgba.slice(0,3).map(n=>n/255*face.shade),
            rgba[3]*Number(model.options.opacity ?? 1)*Number(Layers[model.mapmaker.key].opacity === ''?1:Layers[model.mapmaker.key].opacity ?? 1)];
    }
    uploadFills(start = 0, end = this.fillData.length) {
        if (!this.gl || !this.fillBuffer || end <= start) return;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.fillBuffer);
        this.gl.bufferSubData(this.gl.ARRAY_BUFFER,start * 4,this.fillData.subarray(start,end));
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null);
    }
    updateWidths(models) {
        let start = Infinity, end = 0;
        for (const model of models) {
            const block = this.blocks.get(model.id);
            if (!block) continue;
            if (block.mesh?.shape === 'walkway') { this.walkwayRevision++; continue; }
            const width = Number(model.options.weight ?? 1) * (block.mesh?.strokeScale ?? 1);
            let changed = false;
            for (let i = block.start; i < block.end; i += 11) {
                const value = Math.fround(width * (block.mesh?.edgeWidths?.[(i-block.start)/11] ?? 1));
                if (this.data[i+10] !== value) { this.data[i+10] = value; changed = true; }
            }
            if (changed) { start = Math.min(start,block.start); end = Math.max(end,block.end); }
        }
        if (this.gl && end > start) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER,start * 4,this.data.subarray(start,end));
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER,null);
        }
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
        if(block.mesh?.shape==='walkway'){this.walkwayRevision++;return;}
        const style = this.style(model);
        style[4] *= block.mesh?.strokeScale ?? 1;
        if(block.mesh?.path)for(let i=0;i<3;i++)style[i]*=.85;
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
            this.uploadFills(block.roofStart,block.roofEnd);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
    }
    walkwayRows(matrix, size) {
        const project=p=>{
            const clip=[0,0,0,0];
            for(let row=0;row<4;row++)clip[row]=matrix[row]*p[0]+matrix[row+4]*p[1]+matrix[row+8]*p[2]+matrix[row+12];
            return [(clip[0]/clip[3]+1)*size.x/2,(1-clip[1]/clip[3])*size.y/2,clip[3]];
        };
        const rows=[],casings=[];
        for(const {model,lines} of this.walkways.values()) {
            const style=this.style(model),width=style[4];
            if(style[3]<=0 || width<=0)continue;
            // A continuous white casing separates the raised dashed path from
            // its supporting roof. Draw all casings before all coloured strokes.
            const casingWidth=width+2;
            const casingEdges=MapMakerGeometry.pathStrokeSegments(lines,project,[],[-casingWidth,-casingWidth,size.x+casingWidth,size.y+casingWidth]);
            for(const [a,b] of casingEdges)casings.push(...a,...b,1,1,1,style[3],casingWidth);
            const raw=model.options.dashArray;
            const pattern=(Array.isArray(raw)?raw:typeof raw==='string'?raw.trim().split(/[ ,]+/):[]).map(n=>Number(n)*width);
            const edges=MapMakerGeometry.pathStrokeSegments(lines,project,pattern,[-width,-width,size.x+width,size.y+width]);
            for(const [a,b] of edges)rows.push(...a,...b,...style);
        }
        this.walkwayCasingRows=casings.length/11;
        return new Float32Array(casings.concat(rows));
    }
    uploadWalkways(gl, matrix, size) {
        if(!this.walkways.size)return;
        const key=`${matrix.join(',')}:${size.x}:${size.y}:${this.walkwayRevision}`;
        if(key===this.walkwayViewKey)return;
        this.walkwayViewKey=key;
        this.walkwayData=this.walkwayRows(matrix,size);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.walkwayBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,this.walkwayData,gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER,null);
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
        this.walkwayVao=gl.createVertexArray();gl.bindVertexArray(this.walkwayVao);
        this.walkwayBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.walkwayBuffer);
        for(const [index,size,offset] of [[0,3,0],[1,3,3],[2,4,6],[3,1,10]]) {
            gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,44,offset*4);gl.vertexAttribDivisor(index,1);
        }
        gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
        const fillVertex=shader(gl.VERTEX_SHADER, `#version 300 es
            precision highp float; layout(location=0) in vec3 position; layout(location=1) in vec4 color;
            layout(location=2) in vec2 textureUV;
            uniform mat4 matrix; out vec4 stroke; out vec2 uv;
            void main(){gl_Position=matrix*vec4(position,1.);stroke=color;uv=textureUV;}`);
        const fillFragment=shader(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float; in vec4 stroke; in vec2 uv; out vec4 result;
            uniform sampler2D flagAtlas; uniform bool useFlags;
            void main(){result=stroke*((useFlags && uv.x>=0.)?texture(flagAtlas,uv):vec4(1.));if(result.a<=0.)discard;}`);
        this.fillProgram=gl.createProgram();gl.attachShader(this.fillProgram,fillVertex);gl.attachShader(this.fillProgram,fillFragment);gl.linkProgram(this.fillProgram);
        gl.deleteShader(fillVertex);gl.deleteShader(fillFragment);
        if(!gl.getProgramParameter(this.fillProgram,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.fillProgram));
        this.fillMatrix=gl.getUniformLocation(this.fillProgram,'matrix');
        this.flagSampler=gl.getUniformLocation(this.fillProgram,'flagAtlas');
        this.useFlags=gl.getUniformLocation(this.fillProgram,'useFlags');
        this.fillVao=gl.createVertexArray();gl.bindVertexArray(this.fillVao);
        this.fillBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.fillBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.fillData,gl.DYNAMIC_DRAW);
        for(const [index,size,offset] of [[0,3,0],[1,4,3]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,28,offset*4);}
        this.uvBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,this.fillUVs,gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,8,0);
        gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
        this.flagTexture=gl.createTexture();
        const previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        gl.bindTexture(gl.TEXTURE_2D,this.flagTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        if(this.flagAtlas)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.flagAtlas.canvas);
        else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D,previousTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);
    }
    render(gl, args) {
        const m = [...args.defaultProjectionData.mainMatrix];
        for (let row = 0; row < 4; row++) m[12 + row] += m[row] * this.origin.x + m[4 + row] * this.origin.y;
        const size = this.view.getSize();
        this.uploadWalkways(gl,m,size);
        gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
        if(this.fillCount){
            gl.depthMask(true);gl.useProgram(this.fillProgram);gl.bindVertexArray(this.fillVao);
            const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);
            const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,this.flagTexture);
            gl.uniform1i(this.flagSampler,0);gl.uniform1i(this.useFlags,LayerCont.palette==='color'?1:0);
            gl.uniformMatrix4fv(this.fillMatrix,false,new Float32Array(m));gl.drawArrays(gl.TRIANGLES,0,this.fillCount);
            gl.bindTexture(gl.TEXTURE_2D,texture);gl.activeTexture(active);
        }
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.program); gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.matrixUniform, false, new Float32Array(m)); gl.uniform2f(this.viewportUniform, size.x, size.y);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
        if(this.walkwayData?.length){gl.bindVertexArray(this.walkwayVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.walkwayData.length/11);}
        gl.bindVertexArray(null); gl.depthMask(true);
    }
    onRemove(_map, gl) { gl.deleteBuffer(this.walkwayBuffer);gl.deleteVertexArray(this.walkwayVao);gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); gl.deleteBuffer(this.fillBuffer);gl.deleteBuffer(this.uvBuffer);gl.deleteTexture(this.flagTexture);gl.deleteVertexArray(this.fillVao);gl.deleteProgram(this.fillProgram);this.gl = null; }
}
