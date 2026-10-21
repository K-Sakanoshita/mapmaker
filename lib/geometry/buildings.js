"use strict";

MapMakerGeometry.buildingHeight = function(context, feature, options = {}) {
    options ||= {};
    const positive = value => Number.isFinite(value) && value > 0;
    const raw = String(MapMakerDomain.featureTag(feature, "height") ?? "").trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/i);
    if (match) {
        const height = Number(match[1]) * (match[2]?.toLowerCase() === "ft" ? 0.3048 : 1);
        if (positive(height)) return height;
    }
    if (MapMakerGeometry.isWall(context, feature) || MapMakerGeometry.isFence(context, feature)) return 1.5;
    if (MapMakerGeometry.isExtrudedBarrier(context, feature)) return 1.0;
    if (MapMakerDomain.featureTag(feature, "natural") === "tree") return 4;
    const levelsRaw = String(MapMakerDomain.featureTag(feature, "building:levels") ?? "").trim();
    const levels = /^\d+(?:\.\d+)?$/.test(levelsRaw) ? Number(levelsRaw) : NaN;
    const perFloor = positive(Number(options.floorHeight)) ? Number(options.floorHeight) : 3;
    if (positive(levels)) return levels * perFloor;
    const fallback=positive(Number(options.defaultHeight)) ? Number(options.defaultHeight) : 3;
    return (MapMakerDomain.isBuilding(feature)?MapMakerDomain.buildingBase(feature,options):0)+fallback;
};

MapMakerGeometry.buildingRange = function(context, feature,options={},roof) {
    options ||= {};
    // Reuse a roof computed by the caller, including null for a flat fallback.
    if (roof === undefined) roof=MapMakerGeometry.roofMesh(context, feature,options);
    const height=roof?.height ?? MapMakerGeometry.buildingHeight(context, feature,options);
    const base=roof?.base ?? (MapMakerDomain.featureTag(feature,'building:part')==='roof'?height:MapMakerDomain.buildingBase(feature,options));
    const wallHeight=roof?.wallHeight ?? height;
    return {height,base,wallHeight,valid:Number.isFinite(height)&&Number.isFinite(base)&&wallHeight>=base&&height>0};
};

MapMakerGeometry.buildingKey = function(feature) { return feature.id ?? feature; };

MapMakerGeometry.buildingPolygons = function(feature) {
    return feature.geometry?.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiPolygon'?feature.geometry.coordinates:[];
};

MapMakerGeometry.buildingParts = function(context, features,options={}) {
    options ||= {};
    const unique=[...new Map(features.filter(MapMakerDomain.isBuilding).map(f=>[MapMakerGeometry.buildingKey(f),f])).values()];
    const polygons=feature=>MapMakerGeometry.buildingPolygons(feature).filter(p=>p[0]?.length>=4);
    const outlines=unique.filter(f=>!MapMakerDomain.isBuildingPart(f)&&polygons(f).length);
    const parts=unique.filter(f=>MapMakerDomain.isBuildingPart(f)&&polygons(f).length&&MapMakerGeometry.buildingRange(context, f,options).valid);
    const result={outlines:new Set(),parts:new Set(),parents:new Map()};
    if(!parts.length || !outlines.length) return result;
    const relations=new Map(),grid=new Map(),large=[];
    const bounds=feature=> {
        const b=[Infinity,Infinity,-Infinity,-Infinity];
        for(const poly of polygons(feature))for(const p of poly[0]){
            b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);
        }
        return b;
    };
    const boxCache=new Map(outlines.map(f=>[f,bounds(f)])),step=.002;
    for(const outline of outlines) {
        for(const relation of outline.mapmakerBuildingRelations || []) if(relation.role==='outline') {
            if(!relations.has(relation.id))relations.set(relation.id,[]);
            relations.get(relation.id).push(outline);
        }
        const b=boxCache.get(outline),x0=Math.floor(b[0]/step),x1=Math.floor(b[2]/step),y0=Math.floor(b[1]/step),y1=Math.floor(b[3]/step);
        if((x1-x0+1)*(y1-y0+1)>64) {large.push(outline);continue;}
        for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
            const key=`${x}:${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(outline);
        }
    }
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const inRing=(point,ring,boundary=true)=>{
        let inside=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
            const a=ring[j],b=ring[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
            if(length>0 && Math.abs(cross(a,b,point))<=length*1e-10 && point[0]>=Math.min(a[0],b[0])-1e-10 && point[0]<=Math.max(a[0],b[0])+1e-10 && point[1]>=Math.min(a[1],b[1])-1e-10 && point[1]<=Math.max(a[1],b[1])+1e-10)return boundary;
            if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        }
        return inside;
    };
    const inPoly=(point,poly)=>inRing(point,poly[0])&&!poly.slice(1).some(h=>inRing(point,h,false));
    const contained=(part,parent)=>polygons(part).every(poly=>polygons(parent).some(container=>{
        for(const ring of poly) for(let i=1;i<ring.length;i++){
            const a=ring[i-1],b=ring[i],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
            if(!inPoly(a,container)||!inPoly(b,container)||!inPoly(mid,container))return false;
            for(const edge of container)for(let j=1;j<edge.length;j++){
                const c=edge[j-1],d=edge[j];
                if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)return false;
            }
        }
        // Do not assign a part which covers a courtyard hole in its entirety.
        return !container.slice(1).some(hole=>hole.some(p=>inRing(p,poly[0],false)&&!poly.slice(1).some(h=>inRing(p,h))));
    }));
    const link=(part,outline)=>{
        const key=MapMakerGeometry.buildingKey(outline);
        result.parts.add(MapMakerGeometry.buildingKey(part));result.parents.set(MapMakerGeometry.buildingKey(part),key);
        // Small elevated parts supplement the supporting volume. They replace
        // the outline only from its base, or when covering its whole footprint.
        const partRange=MapMakerGeometry.buildingRange(context, part,options),outlineRange=MapMakerGeometry.buildingRange(context, outline,options);
        if(partRange.base<outlineRange.height-1e-6 && partRange.height>outlineRange.base+1e-6 &&
            (partRange.base<=outlineRange.base+1e-6 || contained(outline,part)))result.outlines.add(key);
    };
    for(const part of parts) {
        const explicit=(part.mapmakerBuildingRelations || []).filter(r=>r.role==='part');
        if(explicit.length){for(const r of explicit)for(const outline of relations.get(r.id)||[])link(part,outline);continue;}
        const p=polygons(part)[0][0][0],b=bounds(part);
        const candidates=[...(grid.get(`${Math.floor(p[0]/step)}:${Math.floor(p[1]/step)}`)||[]),...large];
        const area=parent=>{const a=boxCache.get(parent);return (a[2]-a[0])*(a[3]-a[1]);};
        for(const parent of candidates.sort((a,b)=>area(a)-area(b))){
            const a=boxCache.get(parent);
            if(b[0]<a[0]-1e-10||b[1]<a[1]-1e-10||b[2]>a[2]+1e-10||b[3]>a[3]+1e-10)continue;
            if(contained(part,parent)){link(part,parent);break;}
        }
    }
    return result;
};

MapMakerGeometry.shouldRenderBuilding = function(context, feature,threeD,parts,options={}) {
    if(!MapMakerDomain.isBuilding(feature)||!MapMakerGeometry.buildingPolygons(feature).length)return true;
    const key=MapMakerGeometry.buildingKey(feature);
    return threeD ? !parts.outlines.has(key)&&MapMakerGeometry.buildingRange(context, feature,options).valid : !parts.parts.has(key);
};
