const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const feature={type:'Feature',id:'way/1',properties:{building:'yes',height:'8'},geometry:{type:'Polygon',coordinates:[[[139,35],[139.001,35],[139.001,35.001],[139,35]]]}};
 const box=vm.createContext({console,setTimeout,URL,Worker:require('./helpers/svg-worker.cjs'),document:{baseURI:'http://localhost/index.html'},
 Conf:{default:{Palette:'color'},style:{color:{building:{type:'area'}}}},LayerCont:{palette:'color',styles:['building']},
 Layers:{building:{geojson:[feature],opacity:1,svg:[{options:{opacity:1,fillColor:'#abc'},mapmaker:{drawOrder:{featureOrder:0,passOrder:0}}}]}}});
 for(const f of ['lib/geolib.js','lib/svglib.js'])vm.runInContext(fs.readFileSync(f,'utf8'),box);
 const control=vm.runInContext('new SVGControl()',box);control.svg_style=()=>({fillColor:'#ddd',color:'#777',weight:1});box.SVGCont=control;
 const Exporter=vm.runInContext('PrintSVGExporter',box),exporter=new Exporter({paper:{widthMm:100,heightMm:100}}),bbox=[138.99,34.99,139.01,35.01],options={birdseye:{tilt:45,bearing:10}};
 const expected=exporter.toSVGFromLayers(bbox,options);
 const outputs=await Promise.all([control.previewSVGText(exporter.opts,bbox,options),control.previewSVGText(exporter.opts,bbox,options)]);
 assert.equal(outputs[0],expected);assert.equal(outputs[1],expected);
 box.Layers.building.svg[0].options.opacity=0;
 assert.equal(await control.previewSVGText(exporter.opts,bbox,options),exporter.toSVGFromLayers(bbox,options),'worker sees the latest individual visibility');
 // Force a worker-side data error and ensure later exports still complete.
 await assert.rejects(control.previewSVGText(exporter.opts,null,options));
 assert.equal(await control.previewSVGText(exporter.opts,bbox,options),exporter.toSVGFromLayers(bbox,options));
 console.log('PASS actual SVG worker output parity, serialized concurrent requests, live visibility and recovery after worker error');
})().catch(e=>{console.error(e);process.exitCode=1;});
