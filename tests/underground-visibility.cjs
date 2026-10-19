const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const box=vm.createContext({console:{log(){}}});
vm.runInContext(readSource('@overpass-client','utf8'),box);
const controller=vm.runInContext('new OverPassControl()',box);
const cases=[
 ['surface road',{highway:'tertiary'},false],
 ['road below a bridge',{highway:'tertiary',layer:'-1'},false],
 ['cutting',{highway:'tertiary',cutting:'yes',layer:'-1'},false],
 ['covered surface road',{highway:'service',covered:'yes'},false],
 ['tunnel disabled',{highway:'tertiary',tunnel:'no',layer:'-1'},false],
 ['Ogimachi underpass tags',{highway:'unclassified',tunnel:'yes',layer:'-1'},true],
 ['tunnel without layer',{highway:'tertiary',tunnel:'yes'},true],
 ['tunnel at positive relative layer',{highway:'tertiary',tunnel:'yes',layer:'1'},true],
 ['underground location',{highway:'footway',location:'underground'},true],
 ['normalized tags',{tunnel:' YES ',location:' UNDERGROUND '},true],
 ['basement level',{highway:'footway',level:'-1'},true],
 ['nested negative level',{level:'-2'},true],
 ['underground culvert',{waterway:'ditch',tunnel:'culvert',layer:'-1'},true],
 ['flooded tunnel',{waterway:'canal',tunnel:'flooded'},true],
 ['building passage',{highway:'footway',tunnel:'building_passage'},false],
 ['building passage relative layer',{highway:'footway',tunnel:'building_passage',layer:'-1'},false],
 ['underground building passage',{highway:'footway',tunnel:'building_passage',level:'-1'},true],
 ['snow shelter',{highway:'primary',tunnel:'avalanche_protector'},false],
 ['underground stairs',{highway:'steps',tunnel:'yes',level:'-2;-1'},true],
 ['ground-connected stairs',{highway:'steps',tunnel:'yes',layer:'-1',level:'0;-1'},false],
 ['ground-connected stairs comma levels',{highway:'steps',tunnel:'yes',level:'-1,0'},false],
 ['ground steps',{highway:'steps',level:'0'},false],
 ['surface entrance',{entrance:'yes',tunnel:'yes',layer:'-1'},false,'Point'],
 ['surface subway entrance',{railway:'subway_entrance'},false,'Point'],
 ['surface entrance with connected levels',{entrance:'yes',level:'-1;0',tunnel:'yes'},false,'Point'],
 ['underground entrance',{entrance:'yes',level:'-1'},true,'Point'],
 ['explicit underground entrance',{entrance:'yes',location:'underground'},true,'Point'],
 ['unknown tunnel above ground',{tunnel:'unknown'},false],
 ['unknown tunnel below ground',{tunnel:'unknown',layer:'-2'},true],
 ['invalid values',{level:'invalid',layer:'invalid',tunnel:''},false],
];
let checked=0;
for(const [label,tags,hidden,geometry='LineString'] of cases){
 for(const nested of [false,true]){
  const feature={type:'Feature',id:label,properties:nested?{tags:{...tags}}:{...tags},geometry:{type:geometry,coordinates:geometry==='Point'?[135,35]:[[135,35],[135.001,35.001]]}};
  const before=JSON.stringify(feature);assert.equal(controller.isUnderground(feature),hidden,label+(nested?' nested':''));assert.equal(JSON.stringify(feature),before,'visibility must not rewrite OSM tags or geometry');checked++;
 }
}
const features=cases.map(([id,tags,,geometry='LineString'])=>({type:'Feature',id,properties:tags,geometry:{type:geometry,coordinates:geometry==='Point'?[135,35]:[[135,35],[135.001,35.001]]}}));
const answer={geojson:features,targets:features.map(()=>['road','export','road'])};
const expected=cases.filter(c=>!c[2]).map(c=>c[0]);
assert.deepEqual(Array.from(controller.get_target(answer,'road'),f=>f.id),expected);
assert.deepEqual(Array.from(controller.get_target(answer,'export'),f=>f.id),expected,'all render categories must use the same underground decision');
const first=controller.get_target(answer,'road');first.pop();assert.equal(controller.get_target(answer,'road').length,expected.length,'cached lists remain isolated');
console.log(`PASS ${checked} flat/nested visibility cases, ground connections, surface passages, negative layers, source retention and shared category filtering.`);
