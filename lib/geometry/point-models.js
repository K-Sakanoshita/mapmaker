"use strict";

// Shared 3D point components for the map renderer and SVG/PNG export.
MapMakerGeometry.pointParts = function(context, feature) {
    if (feature?.geometry?.type !== 'Point') return null;
    const name = MapMakerDomain.pointStyleName(context, feature);
    if (name === 'tree') return MapMakerGeometry.treeParts(context, feature);
    if (name !== 'flagpole') return null;
    const style = MapMakerDomain.pointStyle(context, name, feature);
    const configured = Number(context.config.pointStyle.flagpole.height);
    const tagged = MapMakerDomain.metres(MapMakerDomain.featureTag(feature, 'height'));
    const height = Number.isFinite(tagged) && tagged > 0 ? tagged : Number.isFinite(configured) && configured > 0 ? configured : 6;
    const [lng, lat] = feature.geometry.coordinates;
    const my = 111319.49079327358, mx = my * Math.max(.01, Math.cos(lat * Math.PI / 180));
    const point = (x,y,z) => [lng+x/mx,lat+y/my,z];
    const ring = [];
    const radius = Math.max(.04, Math.min(.16, height*.02));
    for (let i=0;i<12;i++) ring.push(point(radius*Math.cos(i*Math.PI/6),radius*Math.sin(i*Math.PI/6),0).slice(0,2));
    ring.push([...ring[0]]);
    const width = Math.min(2.4,height*.32), clothHeight = width*.65;
    const top = height*.96, base = top-clothHeight;
    const faces=[],edges=[];
    // A shallow fold gives the cloth a visible silhouette from different bearings.
    for(let i=0;i<3;i++) {
        const x0=width*i/3,x1=width*(i+1)/3;
        const y0=i%2 ? width*.09 : 0,y1=(i+1)%2 ? width*.09 : 0;
        const points=[point(x0,y0,base),point(x1,y1,base),point(x1,y1,top),point(x0,y0,top)];
        faces.push({kind:'flag',points,shade:i===1?.88:1});
        faces.push({kind:'flag',points:[...points].reverse(),shade:i===1?.88:1});
        edges.push([points[0],points[1]],[points[2],points[3]]);
        if(i===2)edges.push([points[1],points[2]]);
    }
    const colors={white:'#ffffff',red:'#d64040',blue:'#3668aa',green:'#459064',yellow:'#e7c56a',black:'#333333',orange:'#df8b36'};
    const tag=String(MapMakerDomain.featureTag(feature,'flag:colour') || '').trim().toLowerCase();
    const color=context.palette==='color' ? colors[tag] || (/^#[0-9a-f]{6}$/i.test(tag)?tag:style.fillColor) : style.fillColor;
    for(const face of faces)face.color=color;
    for(let i=0;i<12;i++) {
        const a=ring[i],b=ring[i+1];
        faces.push({kind:'pole',points:[[...a,0],[...b,0],[...b,height],[...a,height]],shade:.82,color:style.lineColor});
    }
    faces.push({kind:'pole',points:ring.slice(0,-1).map(p=>[...p,height]),shade:1,color:style.lineColor});
    return [{name:'flag',geometry:{type:'Polygon',coordinates:[ring]},base:0,height,color,
        mesh:{shape:'flag',height,wallHeight:height,base:0,faces,edges}}];
};
