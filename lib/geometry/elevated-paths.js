"use strict";

// Walking decks and connecting stairs. Relative levels select a network; they
// are not metre heights. Source features/tags are never changed.
MapMakerGeometry.pathKey = feature => feature?.id ?? feature;
MapMakerGeometry.elevatedPaths = function(context, features, options = {}) {
    const tag = MapMakerDomain.featureTag, metres = MapMakerDomain.metres;
    const pointKey = p => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
    const distance = (a,b) => Math.hypot((b[0]-a[0])*111319.49079327358*Math.cos((a[1]+b[1])*Math.PI/360),(b[1]-a[1])*111319.49079327358);
    const unique = [...new Map(features.filter(Boolean).map(f => [MapMakerGeometry.pathKey(f),f])).values()];
    const roofs = unique.filter(f => MapMakerDomain.isBuilding(f) && !MapMakerDomain.isBuildingPart(f)).map(feature => {
        const polygons = MapMakerGeometry.buildingPolygons(feature), range = MapMakerGeometry.buildingRange(context,feature,options);
        const box=[Infinity,Infinity,-Infinity,-Infinity];
        for(const polygon of polygons)for(const p of polygon[0] || []) {box[0]=Math.min(box[0],p[0]);box[1]=Math.min(box[1],p[1]);box[2]=Math.max(box[2],p[0]);box[3]=Math.max(box[3],p[1]);}
        return {feature,polygons,box,height:range.height};
    }).filter(r => r.height>0 && r.polygons.length);
    const inRing=(p,ring)=>{
        let inside=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
            const a=ring[i],b=ring[j];
            if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        }
        return inside;
    };
    const supportCache=new Map();
    const support=p=>{
        const key=pointKey(p);if(supportCache.has(key))return supportCache.get(key);
        let height=0;
        for(const r of roofs)if(p[0]>=r.box[0]&&p[1]>=r.box[1]&&p[0]<=r.box[2]&&p[1]<=r.box[3]&&
            r.polygons.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(hole=>inRing(p,hole))))height=Math.max(height,r.height);
        supportCache.set(key,height);return height;
    };
    const records=[];
    for(const feature of unique) {
        if(!['footway','path','pedestrian','cycleway','steps'].includes(tag(feature,'highway')))continue;
        if(!['LineString','MultiLineString'].includes(feature.geometry?.type))continue;
        const levels=String(tag(feature,'level') ?? '').split(';').map(s=>s.trim()).filter(s=>/^-?\d+(?:\.\d+)?$/.test(s)).map(Number);
        if(tag(feature,'location')==='underground' || (levels.length && Math.max(...levels)<0) || MapMakerDomain.osmLayer(feature)<0 ||
            ['yes','building_passage'].includes(tag(feature,'tunnel')))continue;
        const stairs=tag(feature,'highway')==='steps';
        const explicit=[metres(tag(feature,'min_height')),metres(tag(feature,'height'))].find(h=>Number.isFinite(h)&&h>0);
        const elevated=!stairs && (explicit>0 || levels.length===1&&levels[0]>0 || tag(feature,'bridge') && tag(feature,'bridge')!=='no');
        const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates;
        for(const line of lines) {
            if(line.length<2 || !line.every(p=>p.length>=2&&p.slice(0,2).every(Number.isFinite)))continue;
            records.push({feature,line,stairs,levels,explicit,elevated,level:levels[0] ?? MapMakerDomain.osmLayer(feature),keys:line.map(pointKey)});
        }
    }
    // Connected flat decks inherit measured height from the same level. A roof
    // may be simplified as a solid higher than that measurement: lift only the
    // display surface slightly above it, keeping sourceHeight in the mesh.
    const adjacency=new Map(), elevated=records.filter(r=>r.elevated);
    for(const r of elevated)for(const key of r.keys) {
        const k=`${r.level}:${key}`;if(!adjacency.has(k))adjacency.set(k,[]);adjacency.get(k).push(r);
    }
    const visited=new Set();
    for(const seed of elevated) {
        if(visited.has(seed))continue;
        const component=[],queue=[seed];visited.add(seed);
        for(let at=0;at<queue.length;at++) {
            const r=queue[at];component.push(r);
            for(const key of r.keys)for(const next of adjacency.get(`${r.level}:${key}`)||[])if(!visited.has(next)){visited.add(next);queue.push(next);}
        }
        const measured=component.map(r=>r.explicit).filter(h=>h>0);
        const roofHeight=Math.max(0,...component.flatMap(r=>r.line.map(support)));
        const inferred=measured.length?Math.max(...measured):roofHeight || Math.max(1,seed.level)*(Number(options.floorHeight)||3);
        for(const r of component) {
            r.sourceHeight=r.explicit ?? inferred;
            r.heights=r.line.map(()=>Math.max(r.sourceHeight,roofHeight)+.08);
        }
    }
    // Stairs are solved as a connected metric graph. Anchored walkway ends win
    // over incline hints (some real data has opposite incline directions).
    const anchors=new Map(),nodes=new Map();
    for(const r of records.filter(r=>!r.stairs))for(let i=0;i<r.keys.length;i++) {
        const height=r.heights?.[i] ?? 0,key=r.keys[i];
        anchors.set(key,Math.max(anchors.get(key) ?? 0,height));
    }
    for(const r of records.filter(r=>r.stairs))for(let i=0;i<r.keys.length;i++) {
        const key=r.keys[i];if(!nodes.has(key))nodes.set(key,{key,point:r.line[i],edges:new Map(),records:new Set()});
        const node=nodes.get(key);node.records.add(r);
        if(i) {
            const previous=nodes.get(r.keys[i-1]),length=distance(previous.point,node.point);
            if(length>1e-6){previous.edges.set(key,length);node.edges.set(previous.key,length);}
        }
    }
    const seen=new Set();
    for(const seed of nodes.values()) {
        if(seen.has(seed.key))continue;
        const component=[],queue=[seed];seen.add(seed.key);
        for(let at=0;at<queue.length;at++) {
            const node=queue[at];component.push(node);
            for(const key of node.edges.keys())if(!seen.has(key)){seen.add(key);queue.push(nodes.get(key));}
        }
        const stairs=[...new Set(component.flatMap(n=>[...n.records]))];
        const pins=new Map(component.filter(n=>anchors.has(n.key)).map(n=>[n.key,anchors.get(n.key)]));
        const high=Math.max(0,...pins.values());
        const hasLevels=stairs.some(r=>r.levels.length>1&&Math.max(...r.levels)>0);
        if(!high && !hasLevels && !stairs.some(r=>r.explicit>0))continue;
        const leaves=component.filter(n=>n.edges.size===1), free=leaves.filter(n=>!pins.has(n.key));
        const rise=high || Math.max(0,...stairs.map(r=>r.explicit||0),...component.map(n=>support(n.point))) || Math.max(1,...stairs.flatMap(r=>r.levels))*(Number(options.floorHeight)||3);
        if(free.length) {
            // With a single known upper landing the far free end is ground.
            // With ground anchors only, incline is used solely to select an end.
            if(high) for(const node of free)pins.set(node.key,0);
            else {
                const hint=stairs[0],down=String(tag(hint.feature,'incline')).toLowerCase()==='down';
                const preferred=down?hint.keys[0]:hint.keys[hint.keys.length-1];
                const upper=free.find(n=>n.key===preferred)||free[free.length-1];
                for(const node of free)pins.set(node.key,node===upper?rise+.08:0);
            }
        }
        if(!pins.size)continue;
        const values=new Map(component.map(n=>[n.key,pins.get(n.key) ?? rise/2]));
        for(let pass=0;pass<1000;pass++) {
            let delta=0;
            for(const node of component)if(!pins.has(node.key)&&node.edges.size) {
                let sum=0,weight=0;
                for(const [key,length] of node.edges){sum+=values.get(key)/length;weight+=1/length;}
                const value=sum/weight;delta=Math.max(delta,Math.abs(value-values.get(node.key)));values.set(node.key,value);
            }
            if(delta<1e-6)break;
        }
        for(const r of stairs){r.heights=r.keys.map(key=>values.get(key));r.sourceHeight=Math.max(...r.heights);}
    }
    const result=new Map();
    for(const r of records) {
        if(!r.heights || Math.max(...r.heights)<.01)continue;
        const key=MapMakerGeometry.pathKey(r.feature);
        if(!result.has(key))result.set(key,{shape:r.stairs?'stairs':'walkway',path:true,base:0,height:0,sourceHeight:r.sourceHeight,
            faces:[],edges:[],edgeWidths:[],lines:[],strokeScale:.55});
        const mesh=result.get(key),width=metres(tag(r.feature,'width')) || (r.stairs?2:3), half=Math.min(50,width)/2;
        mesh.height=Math.max(mesh.height,...r.heights);
        mesh.lines.push(r.line.map((p,i)=>[p[0],p[1],r.heights[i]]));
        const total=r.line.slice(1).reduce((s,p,i)=>s+distance(r.line[i],p),0);
        const count=Number(tag(r.feature,'step_count'));
        const spacing=Math.max(1,total/(Number.isFinite(count)&&count>0?Math.min(96,count):64));
        let travelled=0,nextStep=spacing/2;
        const edge=(a,b,scale=1)=>{mesh.edges.push([a,b]);mesh.edgeWidths.push(scale);};
        for(let i=1;i<r.line.length;i++) {
            const a=r.line[i-1],b=r.line[i],length=distance(a,b);if(length<1e-6)continue;
            const mx=111319.49079327358*Math.cos((a[1]+b[1])*Math.PI/360),my=111319.49079327358;
            const dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my,ox=-dy/length*half/mx,oy=dx/length*half/my;
            const point=(p,z,side)=>[p[0]+ox*side,p[1]+oy*side,z];
            const al=point(a,r.heights[i-1],1),ar=point(a,r.heights[i-1],-1),bl=point(b,r.heights[i],1),br=point(b,r.heights[i],-1);
            // Counterclockwise in east/north/up, like the existing roof meshes.
            mesh.faces.push({kind:r.stairs?'stairs':'deck',points:[al,ar,br,bl],shade:1});
            edge(al,bl);edge(ar,br);
            if(r.stairs)while(nextStep<travelled+length) {
                const t=(nextStep-travelled)/length,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],z=r.heights[i-1]+(r.heights[i]-r.heights[i-1])*t+.015;
                edge(point(p,z,1),point(p,z,-1),.8);nextStep+=spacing;
            }
            travelled+=length;
        }
        if(!mesh.faces.length)result.delete(key);
    }
    return result;
};

// Split a raised centreline into screen-space dashes. Perspective-correct
// interpolation keeps the result at its original 3D height. Clip before
// splitting so distant/off-screen geometry never creates unbounded dash work.
MapMakerGeometry.pathStrokeSegments = function(lines, project, pattern, bounds) {
    let dash=(Array.isArray(pattern)?pattern:[]).map(Number);
    if(!dash.length || dash.some(n=>!Number.isFinite(n)||n<0) || !dash.some(n=>n>0))dash=[];
    if(dash.length%2)dash=dash.concat(dash);
    const period=dash.reduce((sum,n)=>sum+n,0),edges=[];
    for(const line of lines) {
        let phase=0;
        for(let i=1;i<line.length;i++) {
            const a=line[i-1],b=line[i],pa=project(a),pb=project(b);
            if(!pa || !pb || pa[2]<=1e-6 || pb[2]<=1e-6 || ![...pa,...pb].every(Number.isFinite)){phase=0;continue;}
            const dx=pb[0]-pa[0],dy=pb[1]-pa[1],length=Math.hypot(dx,dy);
            if(length<1e-6)continue;
            let lo=0,hi=1;
            if(bounds)for(const [p,q] of [[-dx,pa[0]-bounds[0]],[dx,bounds[2]-pa[0]],[-dy,pa[1]-bounds[1]],[dy,bounds[3]-pa[1]]]) {
                if(Math.abs(p)<1e-12){if(q<0){hi=-1;break;}continue;}
                const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
            }
            const point=distance=>{
                const s=distance/length,t=s*pa[2]/((1-s)*pb[2]+s*pa[2]);
                return a.map((v,j)=>v+(b[j]-v)*t);
            };
            if(lo<=hi) {
                const end=hi*length;let at=lo*length;
                if(!period)edges.push([point(at),point(end)]);
                else {
                    let offset=(phase+at)%period,index=0;
                    while(index<dash.length-1&&offset>=dash[index]){offset-=dash[index];index++;}
                    let remaining=dash[index]-offset;
                    while(at<end-1e-6) {
                        if(remaining<=1e-6){index=(index+1)%dash.length;remaining=dash[index];continue;}
                        const next=Math.min(end,at+remaining);
                        if(index%2===0)edges.push([point(at),point(next)]);
                        remaining-=next-at;at=next;
                    }
                }
            }
            if(period)phase=(phase+length)%period;
        }
    }
    return edges;
};
