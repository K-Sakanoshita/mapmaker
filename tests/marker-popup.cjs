const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
let tags,popup='',previews=0;
const box=vm.createContext({console:{log(){}},Conf:{category:{shop:{}},marker:{tag:{shop:{electronics:'shop.svg'}},subtag:{}},icon:{path:'icon'},osm:{shops:{marker:'shop.svg'},wikipedia:{tag:'wikipedia',marker:'wiki.svg'}},effect:{icon:{x:20,y:20,preset:'standard'},text:{size:16,view:true}}},glot:{get:k=>k},map:{closePopup(){},removeLayer(){}},mapMaker:{queueExportPreview(){previews++;}},poiCont:{get_target:()=>({geojson:[{id:'node/1',properties:tags}],latlng:[[35,135]],targets:[['shops']],enable:[true]}),get_osmid:()=>({geojson:{id:'node/1',properties:tags},latlng:[35,135]})},MapEngine:{LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}},divIcon:o=>o,marker:(position,options)=>({position,options,events:{},addTo(){return this;},on(k,f){this.events[k]=f;return this;},off(){},removeFrom(){},getElement:()=>null,openPopup(){}}),responsivePopup:()=>({setContent(s){popup=s;return this;},setLatLng(){return this;},openOn(){return this;}})}});
vm.runInContext(fs.readFileSync('lib/poislib.js','utf8'),box);
const marker=box.Marker=vm.runInContext('new MarkerControl()',box);
for(const english of [undefined,'','  ',null,false,'Nikkori Electronics']){
 tags={name:'にっこり電器 千里店',shop:'electronics'};if(english!==undefined)tags['name:en']=english;
 marker.set('shops');await Promise.resolve();const m=marker.markers.shops[0];m.events.click({target:m,latlng:m.position});
 assert.equal(popup.includes('marker_to_en'),english==='Nikkori Electronics');
 assert.match(popup,/marker_appearance/);assert.equal((popup.match(/<option/g)||[]).length,6);assert.match(popup,/marker_size/);
}
marker.changeAppearance('shops','node/1','subtle');assert.equal(marker.markers.shops[0].mapmaker_appearance,'subtle');assert.equal(box.Conf.effect.icon.preset,'standard');
marker.changeAppearance('shops','node/1','invalid');assert.equal(marker.markers.shops[0].mapmaker_appearance,'subtle');
marker.changeSize('shops','node/1','1.5');
marker.change_icon('shops','node/1','icon/custom.svg');await Promise.resolve();
assert.equal(marker.markers.shops[0].mapmaker_appearance,'subtle');assert.equal(marker.markers.shops[0].mapmaker_lang,'name');
marker.change_lang('shops','node/1','name:en');await Promise.resolve();
const changed=marker.markers.shops[0];assert.equal(changed.mapmaker_appearance,'subtle');assert.equal(changed.mapmaker_icon_scale,1.5);assert.equal(changed.mapmaker_icon,'icon/custom.svg');assert.equal(changed.mapmaker_lang,'name:en');changed.events.click({target:changed,latlng:changed.position});assert.ok(popup.includes('marker_to_ja'));assert.ok(!popup.includes('marker_to_en'));assert.match(popup,/<option value="subtle" selected>/);
assert.match(popup,/<option value="1.5" selected>/);assert.equal(previews,2);
JSON.parse(fs.readFileSync('data/glot.json','utf8'));
console.log('PASS popup English-name guards, three style options, local-only style, invalid preset rejection, preservation across icon/language changes and selected preset.');
})().catch(e=>{console.error(e);process.exitCode=1;});
