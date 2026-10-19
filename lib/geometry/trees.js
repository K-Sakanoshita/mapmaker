"use strict";

const mapMakerTreePartsCache = new WeakMap();

MapMakerGeometry.treeShape = function(context, feature) {
    return MapMakerDomain.model3D(context, feature, 'tree');
};

MapMakerGeometry.treeParts = function(context, feature) {
    const center = feature.geometry.coordinates;
    const height = MapMakerGeometry.buildingHeight(context, feature);
    const shape = MapMakerGeometry.treeShape(context, feature);
    const radius = Math.max(.1, MapMakerDomain.pointStyle(context, 'tree').radius * (shape === 'cherry' ? 1.25 : shape === 'ginkgo' ? 1 : .85));
    const signature = [center[0], center[1], height, radius, shape].join(':');
    const cached = mapMakerTreePartsCache.get(feature);
    if (cached?.signature === signature) return cached.parts;
    const circle = radius => {
        const ring = [];
        const metersY = 111319.49079327358;
        const metersX = metersY * Math.max(.01, Math.cos(center[1] * Math.PI / 180));
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            ring.push([center[0] + radius * Math.cos(angle) / metersX,
                center[1] + radius * Math.sin(angle) / metersY]);
        }
        ring.push([...ring[0]]);
        return { type: 'Polygon', coordinates: [ring] };
    };
    const parts = [
        { name: 'trunk', geometry: circle(Math.min(.22, radius * .22)), base: 0, height: height * .5 }
    ];
    // A small spherical cap joins the conical side tangentially.
    const base=height*(shape === 'cherry' ? .42 : .45),apex=[center[0],center[1],height];
    const crownHeight=height-base,capRadius=Math.min(radius*.3,crownHeight*.2),capCentre=crownHeight-capRadius;
    const slope=(radius*capCentre-capRadius*Math.sqrt(radius*radius+capCentre*capCentre-capRadius*capRadius))/(capCentre*capCentre-capRadius*capRadius);
    const joinAngle=Math.atan(slope),profile=[];
    if (shape === 'cone') {
        profile.push({radius,height:base});
        for(let i=0;i<3;i++){
            const angle=joinAngle+(Math.PI/2-joinAngle)*i/3;
            profile.push({radius:capRadius*Math.cos(angle),height:base+capCentre+capRadius*Math.sin(angle)});
        }
    } else {
        // Revolved silhouettes: spreading cherry canopy and upright, fan-shaped ginkgo.
        const silhouette = shape === 'cherry'
            ? [[.32,0],[.76,.10],[.96,.28],[1,.48],[.90,.70],[.65,.88],[.30,.98]]
            : [[.28,0],[.53,.17],[.82,.40],[1,.65],[.94,.81],[.70,.94],[.32,.99]];
        for (const [width,altitude] of silhouette) profile.push({radius:radius*width,height:base+crownHeight*altitude});
    }
    const ring=circle(profile[0].radius).coordinates[0];
    const rings=profile.map(level=>circle(level.radius).coordinates[0].slice(0,-1).map(p=>[...p,level.height]));
    const faces=[],edges=[],my=111319.49079327358,mx=my*Math.max(.01,Math.cos(center[1]*Math.PI/180));
    const face=points=>{
        const [a,b,c]=points,u=[(b[0]-a[0])*mx,(b[1]-a[1])*my,b[2]-a[2]],v=[(c[0]-a[0])*mx,(c[1]-a[1])*my,c[2]-a[2]];
        let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length=Math.hypot(...normal);normal=normal.map(n=>n/length);
        const light=[-.5,.5,Math.SQRT1_2],illumination=Math.max(0,normal.reduce((n,v,j)=>n+v*light[j],0));
        faces.push({kind:'crown',points,normal,shade:.82+.18*illumination});
    };
    for(let level=0;level<rings.length;level++)for(let i=0;i<16;i++){
        const a=rings[level][i],b=rings[level][(i+1)%16],next=rings[level+1];
        face(next?[a,b,next[(i+1)%16],next[i]]:[a,b,apex]);
        if(level===0)edges.push([a,b]);
        if(i%4===0)edges.push([a,next?next[i]:apex]);
    }
    faces.push({kind:'base',points:ring.slice(0,-1).reverse().map(p=>[...p,base]),normal:[0,0,-1],shade:.82});
    const mesh={shape,rounded:true,height,wallHeight:height,base,faces,edges};
    parts.push({name:'crown',geometry:circle(radius),base,height,mesh});
    mapMakerTreePartsCache.set(feature, { signature, parts });
    return parts;
};
