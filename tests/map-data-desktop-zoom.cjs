const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const definitions=JSON.parse(fs.readFileSync('data/leyers.jsonc')).style;
const settings=JSON.parse(fs.readFileSync('data/config-system.jsonc')).system.MapData;
const mobile={userAgent:'Mozilla/5.0 (Linux; Android 14) Mobile'},desktop={userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0'};
let zoom=14,size=[1024,768],request;
const box=vm.createContext({console:{log(){},error(){}},navigator:desktop,
 Conf:{system:{MapData:structuredClone(settings)},default:{MinZoomLevel:11,LimitZoomLevel:15},style:definitions},
 map:{getZoom:()=>zoom,getSize:()=>({x:size[0],y:size[1]}),getCenter:()=>({lat:35,lng:135}),setView(){}},
 location:{href:'http://localhost/'},LayerCont:{styles:[],palette:'color'},glot:{get:key=>key},
 winCont:{modal_open(){},spinner(){}},Basic:{getData(){},retry(fn){fn();return new Promise(()=>{});}},
 overPassCont:{getRetryCount:()=>0,get(targets,progress,real,detail){request={targets:[...targets],real,detail};}}
});
vm.runInContext(fs.readFileSync('lib/osm/query.js','utf8')+'\n'+fs.readFileSync('mapmaker.js','utf8'),box);
const maker=vm.runInContext('mapMaker',box),original=JSON.stringify(definitions);
function acquire(device,level){box.navigator=device;zoom=level;request=null;maker.make();return request;}
for(const palette of Object.keys(definitions)){
 box.LayerCont.palette=palette;box.LayerCont.styles=Object.keys(definitions[palette]);
 for(let level=11;level<=17;level+=.5){
  const phone=acquire(mobile,level),pc=acquire(desktop,level-1);
  assert.deepEqual(pc.targets,phone.targets,`${palette}: PC at ${level-1} must fetch the same categories as mobile at ${level}`);
  assert.equal(pc.real,level-1);assert.equal(pc.detail,phone.detail,'decision detail is shifted once; drawing zoom is unchanged');
 }
 const threshold=definitions[palette].building.zoom;
 assert.ok(acquire(desktop,threshold-1).targets.includes('building'));
 assert.ok(!acquire(desktop,threshold-1.1).targets.includes('building'));
 assert.ok(!acquire(mobile,threshold-1).targets.includes('building'));
}
assert.equal(JSON.stringify(definitions),original,'palette zoom definitions must remain unchanged');
// The user's 15 -> 14 example also holds for any future category definition.
box.LayerCont.palette='color';box.LayerCont.styles=['future'];box.Conf.style={color:{future:{zoom:15}}};
assert.ok(acquire(desktop,14).targets.includes('future'));assert.ok(!acquire(mobile,14).targets.includes('future'));
for(const viewportEnabled of [true,false]){
 box.Conf.system.MapData.viewportZoom.enabled=viewportEnabled;
 for(const viewport of [[390,804],[1880,1064]]){
  size=viewport;zoom=14;box.navigator=mobile;const before=maker.acquisitionZoom();box.navigator=desktop;
  assert.equal(maker.acquisitionZoom(),Number((before+1).toFixed(1)),'PC shift must compose with or without footprint correction');
 }
}
box.Conf.system.MapData.desktopZoomOffset=0;box.navigator=mobile;const phone=maker.acquisitionZoom();box.navigator=desktop;assert.equal(maker.acquisitionZoom(),phone,'config can disable the desktop shift');
for(const invalid of [undefined,'bad',Infinity]){box.Conf.system.MapData.desktopZoomOffset=invalid;assert.equal(maker.acquisitionZoom(),phone);}
box.Conf.system.MapData.desktopZoomOffset=1;maker.customMode=true;maker.acquiredZoom=14.7;zoom=12;size=[2000,1500];assert.equal(maker.acquisitionZoom(),14.7,'edit mode freezes the acquired detail including desktop shift');
console.log('PASS all palettes/categories start one zoom earlier on PC, exact/fractional boundaries, unchanged mobile/drawing zoom, footprint composition, config fallback and frozen edit detail');
