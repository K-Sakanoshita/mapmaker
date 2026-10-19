const readSource = require('./helpers/lib-source.cjs').read;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const config=JSON.parse(fs.readFileSync('data/leyers.jsonc','utf8'));
 assert.deepEqual(Object.keys(config.style.coloring),Object.keys(config.style.color));
 const dom={css(){return this;},addClass(){return this;},removeClass(){return this;}};
 let flatCalls=0;
 const box=vm.createContext({console:{log(){}},Conf:{...config,default:{ColorDarken:1,Palette:'color'}},Layers:{background:{}},
 map:{threeD:true,getZoom:()=>17},document:{getElementById:()=>null},$:()=>dom,
 Birdseye:{setEnabled(enabled){flatCalls++;box.map.threeD=enabled;}},
 chroma:()=>({darken:()=>({hex:()=> '#999999'})}),setTimeout,clearTimeout,URL,
 Worker:require('./helpers/svg-worker.cjs')});
 for(const file of ['@feature-core','@layer-controller','@svg-document'])vm.runInContext(readSource(file,'utf8'),box);
 box.LayerCont=vm.runInContext('new LayerControl()',box);box.SVGCont=vm.runInContext('new SVGControl()',box);
 box.document.baseURI='http://localhost/index.html';box.LayerCont.styles=Object.keys(config.style.color);
 box.LayerCont.setStyle('coloring');assert.equal(flatCalls,0);assert.equal(box.map.threeD,true);
 assert.equal(box.Layers.background.color,'#ffffff');
 for(const key of ['building','forest','garden','park','waterArea','sea','station','parking']){
  const style=box.SVGCont.svg_style(key,false);
  assert.equal(style.fillColor,'#ffffff',key);assert.equal(style.color,'#444444',key);assert.equal(style.fillOpacity,1,key);
 }
 for(const key of ['tree','entrance']){
  const style=vm.runInContext(`getMapMakerPointStyle('${key}')`,box);
  assert.equal(style.fillColor,'#ffffff');assert.equal(style.lineColor,'#444444');
 }
 const polygon={type:'Feature',id:'way/1',properties:{building:'yes'},geometry:{type:'Polygon',coordinates:[[[139,35],[139.001,35],[139.001,35.001],[139,35]]]}};
 box.Layers.building.geojson=[polygon];box.Layers.building.svg=[];
 const Exporter=vm.runInContext('PrintSVGExporter',box),exporter=new Exporter({paper:{widthMm:100,heightMm:100}}),bbox=[138.99,34.99,139.01,35.01];
 const svg=exporter.toSVGFromLayers(bbox);
 assert.match(svg,/fill="#ffffff"/);assert.match(svg,/stroke="#444444"/);
 assert.equal(await box.SVGCont.previewSVGText(exporter.opts,bbox,{}),svg,'saved worker SVG matches the white-fill/outline export');
 box.LayerCont.setStyle('mono');assert.equal(box.LayerCont.palette,'mono');assert.equal(flatCalls,0);
 box.LayerCont.setStyle('color');assert.equal(box.LayerCont.palette,'color');assert.equal(flatCalls,0);
 console.log('PASS coloring palette category coverage, white areas/points, dark outlines, 3D preservation, worker export parity and return to existing palettes');
})().catch(e=>{console.error(e);process.exitCode=1;});
