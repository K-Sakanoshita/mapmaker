const assert=require('node:assert/strict'),vm=require('node:vm');
const {setup,models,digest}=require('./mesh-buffer-allocation.cjs');
(async()=>{
 const {renderer,box}=setup();
 const geometry=vm.runInContext('MapMakerGeometry',box);
 const batch=models(6);
 ['gabled','hipped','pyramidal','flat','dome','gabled'].forEach((shape,i)=>Object.assign(batch[i].feature.properties,{'roof:shape':shape,'roof:height':'3',height:'12',min_height:'2'}));
 // Complex footprints and unsupported shapes must also reuse a known null result.
 batch[5].feature.geometry.coordinates.push([[139.0002,35.0002],[139.0004,35.0002],[139.0004,35.0004],[139.0002,35.0002]]);
 const original=geometry.roofMesh;let calls=0;
 geometry.roofMesh=(...args)=>{calls++;return original(...args);};
 await renderer.prepare(batch);
 assert.equal(calls,batch.length,'each model computes its roof or flat fallback once in mesh preparation');
 // Recorded from the previous renderer, covering slopes, flat and complex fallbacks.
 assert.equal(digest(renderer),'626efa23cb3918cceea5bb832662c7ae74a4686e0a75b7f16c00970ce4942a0a');
 const context=vm.runInContext('mapMakerFeatureContext()',box);
 const feature=batch[0].feature,options={floorHeight:3};
 const roof=geometry.roofMesh(context,feature,options);calls=0;
 assert.equal(geometry.buildingRange(context,feature,options,roof).wallHeight,9);
 assert.equal(calls,0,'height lookup reuses an existing roof');
 const flat=batch[3].feature;
 assert.equal(geometry.buildingRange(context,flat,options,null).wallHeight,12);
 assert.equal(calls,0,'a known flat fallback does not repeat roof work');
 geometry.buildingRange(context,feature,options);
 assert.equal(calls,1,'callers without a roof retain the original calculation');
 feature.properties.height='18';calls=0;await renderer.prepare([batch[0]]);
 assert.equal(calls,1);assert.equal(renderer.blocks.get(batch[0].id).mesh.height,18,'a later prepare uses current tags without a stale cache');
 const actual=geometry.buildingRange(context,feature,{floorHeight:4});
 assert.equal(actual.height,18);assert.equal(actual.base,2);
 console.log('PASS roofs and flat fallbacks computed once per mesh model; legacy arrays, height defaults and changed tags preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
