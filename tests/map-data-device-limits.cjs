const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const settings=JSON.parse(fs.readFileSync('data/config-system.jsonc')).system.MapData;
 const original=JSON.stringify(settings),box=vm.createContext({});
 vm.runInContext(fs.readFileSync('lib/osm/query.js','utf8'),box);
 const detect=vm.runInContext('isMapDataMobileDevice',box),resolve=vm.runInContext('mapDataConfigForDevice',box);
 const cases=[
  ['Android Chrome',{userAgent:'Mozilla/5.0 (Linux; Android 14; motorola edge 50 pro) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'},true],
  ['iPhone',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'},true],
  ['Android tablet',{userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0',userAgentData:{mobile:false}},true],
  ['iPad desktop agent',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',platform:'MacIntel',maxTouchPoints:5},true],
  ['UA client hints',{userAgent:'',userAgentData:{mobile:true}},true],
  ['touch Windows PC',{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',maxTouchPoints:10},false],
  ['Mac PC',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/130.0',platform:'MacIntel',maxTouchPoints:0},false],
  ['Linux PC',{userAgent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0'},false],
  ['no browser',null,false]
 ];
 for(const [name,device,mobile] of cases){
  assert.equal(detect(device),mobile,name);
  const config=resolve(settings,detect(device));
  assert.equal(config.limits.responseBytes,(mobile?50:100)*1048576,name);
  assert.equal(config.timeoutMs,settings.timeoutMs);
  assert.equal(config.limits.elements,mobile?625000:1250000);
  assert.equal(config.limits.coordinates,mobile?750000:1500000);
  assert.equal(config.limits.outputCoordinates,mobile?562500:1125000);
 }
 assert.equal(JSON.stringify(settings),original,'selection must not mutate shared configuration');
 assert.equal(resolve({limits:{responseBytes:10}},true).limits.responseBytes,10,'legacy config without mobile overrides');
 assert.equal(resolve({limits:{responseBytes:10,elements:20},mobileLimits:{responseBytes:5}},true).limits.elements,20,'partial mobile overrides retain other caps');
 // Verify that the actual acquisition path passes the selected caps to the Worker.
 let width=390,height=844,payload;
 box.Conf={osm:{building:{overpass:['nwr["building"]'],tags:['building=*']}},system:{MapData:settings,OverPassServer:['http://localhost/api']}};
 box.GeoCont={get_L:()=>({NW:{lat:35,lng:135},SE:{lat:34,lng:136}})};
 box.map={getSize:()=>({x:width,y:height})};
 vm.runInContext(fs.readFileSync('lib/application/overpass-controller.js','utf8'),box);
 const control=vm.runInContext('new OverPassControl()',box);control.runDataWorker=async request=>(payload=request,{geojson:[],targets:[]});
 for(const [name,device,mobile] of cases){
  box.navigator=device;
  for(const size of [[390,844],[1280,720]]){
   [width,height]=size;await control.get(['building'],null,15,15);
   assert.equal(payload.config.limits.responseBytes,(mobile?50:100)*1048576,`${name} at ${width}x${height}`);
  }
 }
 assert.equal(JSON.stringify(settings),original);
 console.log('PASS device-specific 50/100MiB caps, mobile/tablet/touch-PC detection, viewport-independent selection, legacy/partial config and actual Worker payload');
})().catch(error=>{console.error(error);process.exitCode=1;});
