const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const osm=JSON.parse(fs.readFileSync('data/overpass-system.jsonc')).osm;
const previous=require('./helpers/overpass-selectors-before-tightening.json');
const categories=Object.keys(previous);
// Evaluate only the documented selector subset used by these settings, independently
// of the acquisition planner. This lets the real conversion/classifier see query results.
function matches(selector,element){
 const type=selector.match(/^(nwr|nw|wr|node|way|relation|rel)/)?.[0];
 assert.ok(type,selector);
 const filters=[...selector.matchAll(/\[("(?:[^"\\]|\\.)*")(?:(=|!=|~|!~)("(?:[^"\\]|\\.)*"))?\]/g)];
 assert.equal(type+filters.map(match=>match[0]).join(''),selector,'unsupported test selector syntax');
 const types={nwr:['node','way','relation'],nw:['node','way'],wr:['way','relation'],node:['node'],way:['way'],rel:['relation'],relation:['relation']};
 if(!types[type].includes(element.type))return false;
 return filters.every(([,key,operator,value])=>{
  key=JSON.parse(key);const actual=element.tags?.[key];
  if(!operator)return actual!==undefined;
  value=JSON.parse(value);
  if(operator==='=')return actual===value;
  if(operator==='!=')return actual!==value;
  const hit=actual!==undefined&&new RegExp(value).test(actual);
  return operator==='~'?hit:!hit;
 });
}
const selected=(category,element)=>osm[category].overpass.some(selector=>matches(selector,element));
let covered=0;
for(const category of categories){
 for(const tag of osm[category].tags){
  const [key,value]=tag.replace(/&&(?:noarea|area)$/,'').split('=');
  // Existing entrance acquisition is intentionally node-only.
  for(const type of key==='entrance'?['node']:['node','way','relation']){
   assert.ok(selected(category,{type,tags:{[key]:value??'yes'}}),`${category} alone must fetch ${type} ${tag}`);covered++;
  }
 }
 for(const selector of osm[category].overpass){
  for(const [,pattern] of [...selector.matchAll(/~"([^"\\]*)"/g)]){
   if(pattern==='.*')continue;
   assert.ok(pattern.startsWith('^')&&pattern.endsWith('$'),'value lists must match whole values');
  }
 }
}
for(const [category,tags] of [['sea',{natural:'peak'}],['forest',{natural:'woodland'}],['site',{amenity:'cafe'}],['park',{man_made:'manhole'}],['building',{waterway:'stream'}],['barrier',{barrier:'gate'}],['station',{building:'house'}]]){
 assert.equal(selected(category,{type:'node',tags}),false,`${category} excludes unrelated values`);
}
for(const category of ['railway','station'])for(const tunnel of ['yes','no','building_passage']){
 assert.equal(selected(category,{type:'way',tags:{railway:category==='railway'?'rail':'platform',tunnel}}),false,'preserve the existing tunnel condition');
}
assert.ok(selected('park',{type:'way',tags:{landuse:'recreation_ground'}}));
assert.ok(selected('park',{type:'node',tags:{'tower:type':'bell_tower'}}));
assert.ok(selected('railway',{type:'way',tags:{service:'yard'}}));
assert.ok(selected('building',{type:'relation',tags:{type:'building'}}));
const box=vm.createContext({console:{log(){}}});
for(const file of ['lib/vendor/osmtogeojson.js','lib/osm/classifier.js','lib/geometry/simplify.js','lib/osm/map-data.js','lib/osm/query.js'])vm.runInContext(fs.readFileSync(file,'utf8'),box);
const fixture=require('./helpers/osm-fixture.cjs')([135,35]);
let nextId=100000;
for(const tags of [{natural:'peak'},{amenity:'waste_basket'},{man_made:'manhole'},{highway:'bus_stop'},{waterway:'waterfall'},{historic:'memorial'}])fixture.elements.push({type:'node',id:nextId++,lat:35,lon:135,tags});
// Complete multipolygon geometry must survive narrower root selection.
fixture.elements.push({type:'node',id:nextId++,lat:35.01,lon:135.01},{type:'node',id:nextId++,lat:35.01,lon:135.02},{type:'node',id:nextId++,lat:35.02,lon:135.02});
const ring=nextId++;fixture.elements.push({type:'way',id:ring,nodes:[ring-3,ring-2,ring-1,ring-3]});
fixture.elements.push({type:'relation',id:nextId++,tags:{type:'multipolygon',natural:'water'},members:[{type:'way',ref:ring,role:'outer'}]});
const byId=new Map(fixture.elements.map(e=>[`${e.type}/${e.id}`,e]));
function query(selectors){
 const roots=fixture.elements.filter(e=>selectors.some(selector=>matches(selector,e))),seen=new Set(roots.map(e=>`${e.type}/${e.id}`)),extra=[];
 function add(type,id){const key=`${type}/${id}`,e=byId.get(key);assert.ok(e,`missing ${key}`);if(seen.has(key))return;seen.add(key);const clone=structuredClone(e);delete clone.tags;extra.push(clone);if(type==='way')e.nodes.forEach(id=>add('node',id));}
 for(const e of roots){if(e.type==='way')e.nodes.forEach(id=>add('node',id));if(e.type==='relation')e.members.filter(m=>m.type!=='relation').forEach(m=>add(m.type,m.ref));}
 return {version:0.6,elements:[...roots,...extra]};
}
function convert(data,keys){
 box.request={osmxml:data,osm:Object.fromEntries(keys.map(k=>[k,osm[k]]))};
 const result=vm.runInContext('convertMapData(request)',box);
 return JSON.parse(JSON.stringify(result.geojson.map((feature,i)=>({feature,targets:[...new Set(result.targets[i])].sort()})).sort((a,b)=>a.feature.id.localeCompare(b.feature.id))));
}
for(const keys of [...categories.map(k=>[k]),['sea','building'],['park','barrier'],categories]){
 const before=query(keys.flatMap(k=>previous[k])),after=query(keys.flatMap(k=>osm[k].overpass));
 assert.deepEqual(convert(after,keys),convert(before,keys),`geometry/tags/classification preserved for ${keys.join(',')}`);
}
const before=query(categories.flatMap(k=>previous[k])),after=query(categories.flatMap(k=>osm[k].overpass));
assert.ok(after.elements.length<before.elements.length,'unneeded elements are removed before conversion');
console.log(`PASS ${covered} category/type/tag cases, standalone categories, tunnel rules, multipolygon/building dependencies and real conversion parity; fixture elements ${before.elements.length} -> ${after.elements.length}`);
