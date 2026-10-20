const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=require('./helpers/lib-source.cjs').read;
(async()=>{
 const config={...JSON.parse(fs.readFileSync('data/leyers.jsonc')),default:{Palette:'color'}},osm=JSON.parse(fs.readFileSync('data/overpass-system.jsonc')).osm;
 const box=vm.createContext({console:{log(){}},Conf:config,LayerCont:{palette:'color',styles:['railway','recreation_track']},Layers:{}});
 vm.runInContext(read('@feature-core')+'\n'+fs.readFileSync('lib/osm/classifier.js','utf8'),box);
 const domain=vm.runInContext('MapMakerDomain',box),classifier=vm.runInContext('new OsmClassifier()',box);classifier.osm=osm;
 const feature=(id,properties)=>({type:'Feature',id,properties,geometry:{type:'LineString',coordinates:[[135.43,34.665],[135.431,34.665],[135.431,34.666]]}});
 const features=[feature('track',{roller_coaster:'track'}),feature('legacy',{roller_coaster:'track',railway:'rail'}),feature('train',{railway:'rail'}),feature('miniature',{railway:'miniature'}),feature('support',{roller_coaster:'support'}),feature('station',{roller_coaster:'station'})];
 const routes=[
  {highway:'raceway',sport:'motor'}, {highway:'raceway'}, {highway:'raceway',sport:'karting'},
  {leisure:'track',sport:'karting'}, ...['alpine_coaster','summer_toboggan','water_slide','log_flume','dark_ride'].map(attraction=>({attraction}))
 ].map((tags,index)=>feature('course'+index,tags));
 const area={...feature('ride-site',{attraction:'dark_ride'}),geometry:{type:'Polygon',coordinates:[[[135.43,34.665],[135.431,34.665],[135.431,34.666],[135.43,34.665]]]}};
 const cases=[...features,...routes,
  {...area}, {...area,id:'kart-site',properties:{leisure:'sports_centre',sport:'karting'}},
  {...feature('point',{attraction:'water_slide'}),geometry:{type:'Point',coordinates:[135.43,34.665]}},
  feature('running',{leisure:'track',sport:'running'}),feature('cycling',{leisure:'track',sport:'cycling'}),
  feature('motorway',{highway:'motorway'}),feature('area-line',{attraction:'water_slide',area:'yes'})
 ];
 const targets=classifier.set_targets(cases);
 for(const index of [0,1]){assert.ok(targets[index].includes('recreation_track'));assert.equal(targets[index].includes('railway'),false);}
 for(const index of [2,3]){assert.ok(targets[index].includes('railway'));assert.equal(targets[index].includes('recreation_track'),false);}
 for(const index of [4,5])assert.equal(targets[index]?.includes('recreation_track')??false,false);
 for(let index=6;index<6+routes.length;index++){
  assert.ok(targets[index].includes('recreation_track'),'ride/competition routes share the new category');
  assert.equal(targets[index].includes('highway_motorway'),false);assert.equal(targets[index].includes('park'),false);
 }
 for(let index=6+routes.length;index<cases.length;index++)assert.equal(targets[index]?.includes('recreation_track')??false,false,'sites, POIs, athletics and ordinary roads remain separate');
 for(const index of [cases.length-4,cases.length-3])assert.ok(targets[index].includes('park'));
 assert.ok(targets[cases.length-2].includes('highway_motorway'));
 assert.ok(config.editPanels.some(panel=>panel.styles.includes('recreation_track')));
 assert.equal(config.editPanels.some(panel=>panel.styles.includes('roller_coaster')),false);
 const multi={...feature('multi',{attraction:'water_slide'}),geometry:{type:'MultiLineString',coordinates:[feature('',{}).geometry.coordinates]}};
 assert.ok(classifier.set_targets([multi])[0].includes('recreation_track'));
 const before=JSON.stringify(features),worker=new(require('./helpers/svg-worker.cjs'))();
 for(const palette of ['color','mono','coloring']){
  box.LayerCont.palette=palette;
  for(const key of box.LayerCont.styles){const style=config.style[palette][key];box.Layers[key]={color:style.color,color_dark:style.color,width:style.width,opacity:1,geojson:key==='railway'?[features[2]]:[features[0],...routes]};}
  box.SVGCont={svg_style:(key,over=false)=>domain.layerStyle({config,palette},box.Layers[key],key,over,17)};
  const coaster=box.SVGCont.svg_style('recreation_track');assert.equal(coaster.dashArray,null);assert.equal(config.style[palette].recreation_track.overstyle,undefined);
  assert.ok(coaster.weight>0);assert.match(box.SVGCont.svg_style('railway',true).dashArray,/ /);
  const snapshot=vm.runInContext('captureMapMakerExportSnapshot()',box),exporter=vm.runInContext('new PrintSVGExporter({paper:"A4"})',box);
  for(const options of [{},{birdseye:{tilt:45,bearing:15}}]){
   const bbox=[135.429,34.664,135.432,34.667],svg=exporter.render(snapshot,bbox,options);
   const trackSvg=exporter.render({...snapshot,layerKeys:['recreation_track']},bbox,options);
   assert.match(trackSvg,/<path /);assert.doesNotMatch(trackSvg,/stroke-dasharray/);
   assert.match(exporter.render({...snapshot,layerKeys:['railway']},bbox,options),/stroke-dasharray/);
   const response=new Promise(resolve=>worker.onmessage=event=>resolve(event.data));
   worker.postMessage({id:1,revision:1,snapshot,exporterOptions:exporter.opts,bbox,options});
   const result=await response;assert.equal(result.svgText,svg);
  }
 }
 assert.equal(JSON.stringify(features),before);
 console.log('PASS recreation courses: coasters, raceways, kart tracks and slides; line-only rides; no road/park duplicate; athletics and miniature rail unchanged; three palettes, 2D/3D SVG and worker parity');
})().catch(error=>{console.error(error);process.exitCode=1;});
