"use strict";

MapMakerGeometry.roofMesh = function(context, feature, options = {}) {
    options ||= {};
    const tag = key => MapMakerDomain.featureTag(feature, key);
    const shape = MapMakerDomain.model3D(context, feature, 'roof');
    if (!['gabled', 'hipped', 'pyramidal'].includes(shape) || !MapMakerDomain.isBuilding(feature)) return null;
    const metres = raw => {
        const m = String(raw ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/i);
        return m ? Number(m[1]) * (m[2]?.toLowerCase() === 'ft' ? .3048 : 1) : NaN;
    };
    const floor = Number(options.floorHeight) > 0 ? Number(options.floorHeight) : 3;
    let roofHeight = metres(tag('roof:height'));
    if (!(roofHeight > 0)) {
        const levels = Number(tag('roof:levels'));
        roofHeight = Number.isFinite(levels) && levels > 0 ? levels * floor : 3;
    }
    const explicit = metres(tag('height'));
    const total = explicit > 0 ? explicit : MapMakerGeometry.buildingHeight(context, feature, options) + roofHeight;
    const wallHeight = total - roofHeight;
    const base = tag('building:part') === 'roof' ? wallHeight : MapMakerDomain.buildingBase(feature,options);
    if (!Number.isFinite(total) || !Number.isFinite(wallHeight) || wallHeight < base) return null;
    const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates]
        : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    if (!polygons.length) return null;
    const faces = [], edges = [];
    const mid = (a,b) => [(a[0]+b[0])/2,(a[1]+b[1])/2];
    const interpolate = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    for (const polygon of polygons) {
        // Holes, concave and irregular footprints keep the existing flat roof.
        if (polygon.length !== 1) return null;
        let p = polygon[0].slice();
        if (p.length !== 5 || p[0][0] !== p[4][0] || p[0][1] !== p[4][1]) return null;
        p.pop();
        if (p.some(a => !a.slice(0,2).every(Number.isFinite))) return null;
        const cos = Math.cos(p[0][1]*Math.PI/180);
        const vector = (a,b) => [(b[0]-a[0])*cos,b[1]-a[1]];
        const vectors = p.map((a,i)=>vector(a,p[(i+1)%4]));
        const length = vectors.map(v=>Math.hypot(...v));
        if (length.some(n=>n<1e-8)) return null;
        const cross = vectors.map((v,i)=>v[0]*vectors[(i+1)%4][1]-v[1]*vectors[(i+1)%4][0]);
        if (!cross.every(n=>n*cross[0]>0)) return null;
        for(let i=0;i<4;i++) {
            const v=vectors[i],w=vectors[(i+1)%4];
            if(Math.abs(v[0]*w[0]+v[1]*w[1])/(length[i]*length[(i+1)%4])>.1) return null;
        }
        // Start along the long side; orientation describes the ridge, direction the slope.
        if(length[1]>length[0]) p=[p[1],p[2],p[3],p[0]];
        let across = tag('roof:orientation') === 'across';
        const compass=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        const direction=String(tag('roof:direction') ?? '').trim().toUpperCase();
        const degrees=compass.includes(direction)?compass.indexOf(direction)*22.5:direction===''?NaN:Number(direction);
        if(Number.isFinite(degrees) && degrees>=0 && degrees<=360) {
            const slope=[Math.sin(degrees*Math.PI/180),Math.cos(degrees*Math.PI/180)],axis=vector(p[0],p[1]);
            across=Math.abs(slope[0]*axis[0]+slope[1]*axis[1])/Math.hypot(...axis)>Math.SQRT1_2;
        }
        if(across) p=[p[1],p[2],p[3],p[0]];
        const e=p.map(a=>[...a,wallHeight]);
        let r0=mid(p[0],p[3]),r1=mid(p[1],p[2]);
        const span=Math.hypot(...vector(r0,r1)),width=Math.hypot(...vector(p[0],p[3]));
        const inset=shape==='hipped'?Math.min(.5,width/(2*span)):0;
        const start=r0;r0=interpolate(start,r1,inset);r1=interpolate(start,r1,1-inset);
        r0=[...r0,total];r1=[...r1,total];
        const add = (kind, points) => {
            // Use outward normals and consistent winding in east/north/up metres.
            const centre = mid(mid(p[0], p[1]), mid(p[2], p[3]));
            const origin = points[0], metres = 111319.49079327358;
            let normal = [0, 0, 0];
            const delta = point => [(point[0]-origin[0])*cos*metres, (point[1]-origin[1])*metres, point[2]-origin[2]];
            for (let i=1; i<points.length-1; i++) {
                const a=delta(points[i]), b=delta(points[i+1]);
                normal=[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
                if (Math.hypot(...normal)>1e-8) break;
            }
            const size=Math.hypot(...normal);
            if (size<1e-8) return;
            const faceCentre=points.reduce((sum,a)=>[sum[0]+a[0]/points.length,sum[1]+a[1]/points.length],[0,0]);
            const facing=kind==='roof' ? normal[2] : normal[0]*(faceCentre[0]-centre[0])*cos+normal[1]*(faceCentre[1]-centre[1]);
            if (facing<0) { points=points.slice().reverse(); normal=normal.map(n=>-n); }
            normal=normal.map(n=>n/size);
            // Keep roofs close to the flat-roof base color, with subtle north-west lighting.
            const light=[-.5,.5,Math.SQRT1_2];
            const illumination=Math.max(0,normal.reduce((sum,n,i)=>sum+n*light[i],0));
            const shade=kind==='wall' ? .82 : .96+.04*Math.min(1,illumination/Math.SQRT1_2);
            faces.push({kind,points,normal,shade});
        };
        if(shape==='pyramidal') {
            const top=[...mid(mid(p[0],p[1]),mid(p[2],p[3])),total];
            for(let i=0;i<4;i++) add('roof',[e[i],e[(i+1)%4],top]);
        } else {
            add('roof',[e[0],e[1],r1,r0]);add('roof',[e[3],r0,r1,e[2]]);
            add(shape==='gabled'?'wall':'roof',[e[0],r0,e[3]]);
            add(shape==='gabled'?'wall':'roof',[e[1],e[2],r1]);
        }
    }
    // Deduplicate shared ridges/eaves so alpha and stroke width remain consistent.
    const seen=new Set();
    for(const face of faces) for(let i=0;i<face.points.length;i++) {
        const a=face.points[i],b=face.points[(i+1)%face.points.length];
        const key=[JSON.stringify(a),JSON.stringify(b)].sort().join('|');
        if(!seen.has(key)){seen.add(key);edges.push([a,b]);}
    }
    return {shape,height:total,wallHeight,base,faces,edges};
};
