"use strict";

// Fetch/convert routines can be called in a Worker or directly in tests.
function dataLimit(){return Object.assign(new Error('Map data limit exceeded'),{code:'MAP_DATA_LIMIT',retryable:false});}
function overpassFailure(message, status) {
    const memory = /out of memory|memory limit|maxsize|allocation failed/i.test(message);
    const timeout = /timed? out|timeout/i.test(message);
    const rate = status === 429 || /rate.?limit|too many requests/i.test(message);
    const access = status === 403 || status === 406;
    const code = rate ? 'OVERPASS_RATE_LIMIT' : memory ? 'OVERPASS_MEMORY_LIMIT' :
        access ? 'OVERPASS_ACCESS' : status === 504 ? 'OVERPASS_BUSY' :
        timeout || status === 408 ? 'OVERPASS_TIMEOUT' : 'OVERPASS_FAILED';
    return Object.assign(new Error(message), {code, status,
        retryable:!memory && !access && (rate || timeout || status === 408 || status >= 500)});
}
function convertMapData(data, report = () => {}){
    const osmxml=data.osmxml,limits=data.config?.limits || {};
    if(osmxml?.remark)throw overpassFailure(String(osmxml.remark));
    if(!Array.isArray(osmxml?.elements))throw new Error('Invalid Overpass response');
    if(osmxml.elements.length>(limits.elements ?? Infinity))throw dataLimit();
    let references=0;
    for(const e of osmxml.elements){references+=(e.nodes?.length||0)+(e.members?.length||0);if(references>(limits.coordinates ?? Infinity))throw dataLimit();}
    report({stage:'converting'});
    const classifier = new OsmClassifier(data.osm);
    const geojson=osmtogeojson(osmxml,{flatProperties:true}).features;
    report({stage:'classifying'});
    classifier.attachBuildingRelations(geojson,osmxml);
    const targets=classifier.set_targets(geojson),kept=[],keptTargets=[];
    for(let i=0;i<geojson.length;i++)if(targets[i]?.length){kept.push(geojson[i]);keptTargets.push(targets[i]);}
    let coordinates=0;
    const count=c=>{if(typeof c?.[0]==='number'){if(++coordinates>(limits.coordinates ?? Infinity))throw dataLimit();}else if(Array.isArray(c))c.forEach(count);};
    kept.forEach(f=>count(f.geometry.coordinates));
    report({stage:'simplifying'});
    const stats=simplifyMapData(kept,data.zoom,data.viewport || [1,1],data.config?.simplify);
    coordinates=0;const cap=limits.outputCoordinates ?? Infinity;
    const outputCount=c=>{if(typeof c?.[0]==='number'){if(++coordinates>cap)throw dataLimit();}else if(Array.isArray(c))c.forEach(outputCount);};
    kept.forEach(f=>outputCount(f.geometry.coordinates));
    return {geojson:kept,targets:keptTargets,stats};
}
async function fetchMapData(data, report = () => {}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),data.config?.timeoutMs ?? 150000);
    try{
        const response=await fetch(data.url,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw Object.assign(overpassFailure('Overpass HTTP '+response.status,response.status),{retryAfter:response.headers.get('Retry-After')});
        const cap=data.config?.limits?.responseBytes ?? 104857600;
        if(Number(response.headers.get('Content-Length'))>cap)throw dataLimit();
        const reader=response.body.getReader(),decoder=new TextDecoder(),chunks=[];let bytes=0,last=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
            // Aborting fetch also errors its reader; cancelling it afterwards
            // rejects with AbortError and would turn this limit into a retry.
            if(bytes>cap){controller.abort();throw dataLimit();}
            chunks.push(decoder.decode(value,{stream:true}));if(bytes-last>=262144){last=bytes;report({progress:bytes});}
        }}finally{reader.releaseLock();}
        chunks.push(decoder.decode());report({progress:bytes});report({stage:'parsing'});
        data.osmxml=JSON.parse(chunks.join(''));chunks.length=0;
        const result=convertMapData(data, report);data.osmxml=null;return result;
    }catch(error){if(error.name==='AbortError'||error instanceof TypeError)error.retryable=true;throw error;}
    finally{clearTimeout(timer);controller.abort();}
}
