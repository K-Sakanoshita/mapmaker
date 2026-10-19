'use strict';
// Simplify derived display geometry, preserving shared vertices and polygon holes.
function simplifyMapData(features, zoom, viewport, config = {}) {
    const paths=[];
    const collect=g=>{
        if(g.type==='LineString')paths.push(g.coordinates);
        if(g.type==='MultiLineString'||g.type==='Polygon')paths.push(...g.coordinates);
        if(g.type==='MultiPolygon')for(const p of g.coordinates)paths.push(...p);
    };
    features.forEach(f=>collect(f.geometry));
    const before=paths.reduce((n,p)=>n+p.length,0);
    if(!Number.isFinite(zoom) || !(zoom < (config.belowZoom ?? 14)) || !(config.tolerancePx>0))return {before,after:before,tolerancePx:0};
    // A3 / 300 dpi by default: the error stays small in both the screen and exports.
    const exportPixels=(config.maxPaperLongMm ?? 420)/25.4*(config.maxExportDpi ?? 300);
    const scale=Math.max(1,exportPixels/Math.max(1,Math.min(...viewport.map(n=>Number.isFinite(n)&&n>0?n:1024))));
    const tolerance=Math.min(1,config.tolerancePx)/scale;
    const world=512*2**zoom, project=p=>[world*(p[0]+180)/360,world*(1-Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,p[1]))*Math.PI/360))/Math.PI)/2];
    const key=p=>p[0]+','+p[1],same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
    const occurrences=new Map();
    for(const path of paths){const end=path.length>1&&same(path[0],path.at(-1))?path.length-1:path.length;for(let i=0;i<end;i++){const k=key(path[i]);occurrences.set(k,(occurrences.get(k)||0)+1);}}
    let budget=config.topologyChecks ?? 300000;
    const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;};
    const simplify=path=>{
        if(path.length<3||budget<=0)return path;
        const points=path.map(project),keep=new Set([0,path.length-1]);
        for(let i=0;i<path.length;i++){if(occurrences.get(key(path[i]))>1)keep.add(i);if(i&&Math.abs(points[i][0]-points[i-1][0])>world/2)return path;}
        const anchors=[...keep].sort((a,b)=>a-b),stack=[];
        for(let i=1;i<anchors.length;i++)stack.push([anchors[i-1],anchors[i]]);
        while(stack.length){const [a,b]=stack.pop();let max=tolerance*tolerance,index=-1;
            for(let i=a+1;i<b;i++){if(--budget<0)return path;const d=distance(points[i],points[a],points[b]);if(d>max){max=d;index=i;}}
            if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
        }
        const result=[...keep].sort((a,b)=>a-b).map(i=>path[i]);
        return same(path[0],path.at(-1))&&result.length<4?path:result;
    };
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const intersects=(a,b,c,d)=>{
        if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
        return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
    };
    const area=ring=>ring.slice(1).reduce((n,p,i)=>n+ring[i][0]*p[1]-p[0]*ring[i][1],0);
    const inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-2;i<ring.length-1;j=i++)if((ring[i][1]>p[1])!==(ring[j][1]>p[1])&&p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;};
    const polygon=rings=>{
        const outer=simplify(rings[0]);if(outer.length===rings[0].length)return rings;
        // Keep holes exact. Reject degenerate, inverted, self-crossing or hole-crossing candidates.
        if(outer.length<4||area(outer)*area(rings[0])<=0)return rings;
        for(let i=1;i<outer.length;i++)for(let j=i+2;j<outer.length;j++){
            if(i===1&&j===outer.length-1)continue;if(--budget<0)return rings;
            if(intersects(outer[i-1],outer[i],outer[j-1],outer[j]))return rings;
        }
        for(const hole of rings.slice(1)){
            if(!inside(hole[0],outer))return rings;
            for(let i=1;i<outer.length;i++)for(let j=1;j<hole.length;j++){
                if(--budget<0)return rings;if(intersects(outer[i-1],outer[i],hole[j-1],hole[j]))return rings;
            }
        }
        return [outer,...rings.slice(1)];
    };
    for(const f of features){const g=f.geometry;
        if(g.type==='LineString')g.coordinates=simplify(g.coordinates);
        if(g.type==='MultiLineString')g.coordinates=g.coordinates.map(simplify);
        if(g.type==='Polygon')g.coordinates=polygon(g.coordinates);
        // Different members can be close without sharing vertices; retain multipolygon topology.
        // Only exactly collinear vertices can be removed here without changing member boundaries.
        if(g.type==='MultiPolygon')g.coordinates=g.coordinates.map(rings=>rings.map(ring=>{const result=ring.filter((p,i)=>i===0||i===ring.length-1||occurrences.get(key(p))>1||cross(ring[i-1],p,ring[i+1])!==0);return result.length>=4?result:ring;}));
    }
    paths.length=0;features.forEach(f=>collect(f.geometry));
    return {before,after:paths.reduce((n,p)=>n+p.length,0),tolerancePx:tolerance};
}
