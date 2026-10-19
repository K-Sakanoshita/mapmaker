"use strict";

MapMakerGeometry.barrierModel = function(context, feature) {
    const barrier = MapMakerDomain.featureTag(feature, 'barrier');
    if ((barrier == null || barrier === '' || barrier === 'no') &&
        MapMakerDomain.featureTag(feature, 'man_made') !== 'embankment') return 'flat';
    return MapMakerDomain.model3D(context, feature, 'barrier');
};

MapMakerGeometry.isWall = function(context, feature) {
    return MapMakerGeometry.barrierModel(context, feature) === 'wall' &&
        ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
};

MapMakerGeometry.isRetainingWall = function(context, feature) {
    return MapMakerDomain.featureTag(feature,'barrier')==='retaining_wall' && MapMakerGeometry.barrierModel(context, feature)==='flat' &&
        ['LineString','MultiLineString','Polygon','MultiPolygon'].includes(feature?.geometry?.type);
};

MapMakerGeometry.retainingWallLines = function(feature) {
    const g=feature.geometry;
    return {type:'MultiLineString',coordinates:g.type==='LineString'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates.flat():g.coordinates};
};

MapMakerGeometry.retainingWallSymbols = function(context, feature,metresPerPixel=1) {
    const polygons=[];
    if(!MapMakerGeometry.isRetainingWall(context, feature)||!(metresPerPixel>0))return {type:'MultiPolygon',coordinates:polygons};
    for(const line of MapMakerGeometry.retainingWallLines(feature).coordinates){
        if(line.length<2)continue;
        const my=111319.49079327358,mx=my*Math.max(.01,Math.cos(line[0][1]*Math.PI/180));
        const segments=[];let total=0;
        for(let i=1;i<line.length;i++){
            const a=line[i-1],b=line[i],dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my,length=Math.hypot(dx,dy);
            if(!Number.isFinite(length)||length<1e-6)continue;
            segments.push({a,dx,dy,length,start:total});total+=length;
        }
        if(total<6*metresPerPixel)continue;
        const spacing=Math.max(28*metresPerPixel,total/10000),first=Math.min(spacing/2,total/2);
        let index=0;
        for(let distance=first;distance<total;distance+=spacing){
            while(index<segments.length-1&&distance>segments[index].start+segments[index].length)index++;
            const segment=segments[index],{a,dx,dy,length,start}=segment,t=(distance-start)/length;
            const cx=a[0]+dx*t/mx,cy=a[1]+dy*t/my,ux=dx/length,uy=dy/length;
            const point=(along,right)=>[cx+(ux*along+uy*right)*metresPerPixel/mx,cy+(uy*along-ux*right)*metresPerPixel/my];
            const ring=[point(-3,2),point(3,2),point(0,5)];ring.push(ring[0]);polygons.push([ring]);
        }
    }
    return {type:'MultiPolygon',coordinates:polygons};
};

MapMakerGeometry.isExtrudedBarrier = function(context, feature) {
    return ['wall', 'hedge', 'fence', 'rope'].includes(MapMakerGeometry.barrierModel(context, feature)) &&
        ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
};

MapMakerGeometry.barrierGeometry = function(context, feature) {
    const geometry = feature.geometry;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.coordinates;
    const polygons = [];
    const halfWidth = MapMakerGeometry.barrierModel(context, feature) === 'hedge' ? .25 : .1;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const metersY = 111319.49079327358;
        const metersX = metersY * Math.max(.01, Math.cos((a[1] + b[1]) / 2 * Math.PI / 180));
        const dx = (b[0] - a[0]) * metersX, dy = (b[1] - a[1]) * metersY;
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        const ox = -dy / length * halfWidth / metersX, oy = dx / length * halfWidth / metersY;
        const ring = [[a[0]+ox,a[1]+oy], [a[0]-ox,a[1]-oy],
            [b[0]-ox,b[1]-oy], [b[0]+ox,b[1]+oy], [a[0]+ox,a[1]+oy]];
        polygons.push([ring]);
    }
    return { type: 'MultiPolygon', coordinates: polygons };
};

// Open barriers consist of wires, ropes and posts; there is no solid panel.
MapMakerGeometry.isFence = function(context, feature) {
    return MapMakerGeometry.barrierModel(context, feature) === 'fence' &&
        ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
};
MapMakerGeometry.isMeshBarrier = function(context, feature) {
    return ['fence', 'rope'].includes(MapMakerGeometry.barrierModel(context, feature)) &&
        ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
};
MapMakerGeometry.barrierMesh = function(context, feature, options = {}) {
    if (!MapMakerGeometry.isMeshBarrier(context, feature)) return null;
    const shape = MapMakerGeometry.barrierModel(context, feature);
    const actualHeight = MapMakerGeometry.buildingHeight(context, feature, options);
    let height = actualHeight;
    const segments = [], panels = [], edges = [], edgeWidths = [];
    let total = 0;
    for (const line of MapMakerGeometry.retainingWallLines(feature).coordinates) for (let i = 1; i < line.length; i++) {
        const a = line[i-1], b = line[i];
        if (![...a.slice(0,2), ...b.slice(0,2)].every(Number.isFinite)) continue;
        const mx = 111319.49079327358 * Math.max(.01, Math.cos((a[1]+b[1])/2*Math.PI/180));
        const length = Math.hypot((b[0]-a[0])*mx, (b[1]-a[1])*111319.49079327358);
        if (length < 1e-6) continue;
        segments.push({a,b,length}); total += length;
    }
    let metresPerPixel = 0;
    if (shape === 'fence' && segments.length && Number.isFinite(options.viewZoom) && Number.isFinite(options.tilt)) {
        const latitude = segments[0].a[1];
        metresPerPixel = 40075016.68557849 * Math.cos(latitude*Math.PI/180) / (512*2**options.viewZoom);
        // Cartographic emphasis keeps a small mesh legible; tagged height stays unchanged.
        const projectedHeight = 12*metresPerPixel / Math.max(.25, Math.sin(options.tilt*Math.PI/180));
        height = Math.max(actualHeight, Math.min(actualHeight*2.5, projectedHeight));
    }
    // Bound work for unusually long or tall OSM features without changing source geometry.
    const meshSpacing = Math.max(1, height/1.5, 6*metresPerPixel, total/2500), postSpacing = Math.max(2.5, total/(shape === 'rope' ? 800 : 1500));
    const seen = new Set(), bottom = Math.min(.08, height/10);
    for (const {a,b,length} of segments) {
        if (edges.length >= 12000) break;
        const panel = {edges:[], edgeWidths:[]};
        const point = (x,z) => [a[0]+(b[0]-a[0])*x/length, a[1]+(b[1]-a[1])*x/length, z];
        const add = (x1,z1,x2,z2,width) => {
            const edge = [point(x1,z1),point(x2,z2)];
            const key = edge.map(p=>p.map(n=>n.toFixed(10)).join(',')).sort().join('|');
            if (seen.has(key) || edges.length >= 12000) return;
            seen.add(key); panel.edges.push(edge); panel.edgeWidths.push(width); edges.push(edge); edgeWidths.push(width);
        };
        if (shape === 'fence') { add(0,height,length,height,.65); add(0,bottom,length,bottom,.65); }
        const posts = Math.max(1, Math.ceil(length/postSpacing));
        for (let i=0;i<=posts && edges.length<12000;i++) add(length*i/posts,0,length*i/posts,height,shape === 'fence' ? .9 : 1.6);
        if (shape === 'rope') {
            for (let i=0;i<posts && edges.length<12000;i++) {
                const span = length/posts, start = span*i;
                const sag = Math.min(.22, span*.08, height*.25);
                const z = t => height - 4*sag*t*(1-t);
                for (let step=1;step<=8 && edges.length<12000;step++) {
                    const t0=(step-1)/8, t1=step/8;
                    add(start+span*t0,z(t0),start+span*t1,z(t1),1.1);
                }
            }
            panels.push(panel);
            continue;
        }
        for (let k=-height;k<=length && edges.length<12000;k+=meshSpacing) {
            const lo=Math.max(0,k+bottom), hi=Math.min(length,k+height);
            if (hi-lo>1e-6) add(lo,lo-k,hi,hi-k,.6);
        }
        for (let k=bottom;k<=length+height && edges.length<12000;k+=meshSpacing) {
            const lo=Math.max(0,k-height), hi=Math.min(length,k-bottom);
            if (hi-lo>1e-6) add(lo,k-lo,hi,k-hi,.6);
        }
        panels.push(panel);
    }
    // Category strokes grow with zoom; fine mesh wires must not inherit that amplification.
    const strokeScale = shape === 'fence' && Number.isFinite(options.viewZoom) && options.viewZoom>15
        ? 3/(1+(options.viewZoom-15)*.6) : 1;
    return {shape, height:actualHeight, displayHeight:height, strokeScale, base:0, faces:[], edges, edgeWidths, panels};
};

// Compatibility entry for callers specifically requesting the chain-link fence model.
MapMakerGeometry.fenceMesh = function(context, feature, options = {}) {
    return MapMakerGeometry.isFence(context, feature) ? MapMakerGeometry.barrierMesh(context, feature, options) : null;
};
