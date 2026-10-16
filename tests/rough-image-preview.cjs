const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const ids=new Map(),revoked=[],alerts=[],builds=[],modals=[];let releaseBuild,delay=false,fail=false;
 class Element {
  constructor(id){this.id=id;this.style={};this.inert=false;this.disabled=false;this.children=[];this.attrs={};const names=new Set();this.classList={add:x=>names.add(x),remove:x=>names.delete(x),contains:x=>names.has(x),toggle(x,on){on?names.add(x):names.delete(x);}};if(id)ids.set(id,this);}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]||null;}
  closest(sel){return sel==='#roughControls'&&this.rough?this:null;}
  appendChild(node){this.children.push(node);node.parent=this;if(node.id)ids.set(node.id,node);}
  remove(){ids.delete(this.id);if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 }
 const menu=new Element('basemenu');
 const container=new Element('mapid'),toggle=new Element('rough_enabled');toggle.checked=true;toggle.rough=true;
 const color=new Element('color'),reset=new Element('reset'),save=new Element('save'),threeD=new Element('3d'),disabled=new Element('already-disabled');
 disabled.disabled=true;save.attrs.onclick="mapMaker.save('png')";
 const controls=[color,reset,save,threeD,disabled,toggle],saveButtons=[reset,save,threeD];
 const box=vm.createContext({console:{log:console.log,error(){}},setTimeout,clearTimeout,Blob,Image:class extends Element{async decode(){}},
  URL:{createObjectURL:()=>`blob:${builds.length}`,revokeObjectURL:u=>revoked.push(u)},
  document:{getElementById:id=>ids.get(id),createElement:()=>new Element(),querySelectorAll:s=>s.startsWith('header')?controls:saveButtons},
  map:{getContainer:()=>container,getSize:()=>({x:920,y:700}),closePopup(){},ready:true},glot:{get:k=>k},window:{alert:x=>alerts.push(x)},
  winCont:{modalMode:false,modal:null,async modal_open(options){this.modalMode=true;this.modal={};modals.push(['open',options]);},async closeModal(){this.modalMode=false;modals.push(['close']);}},
  requestAnimationFrame:fn=>fn(),SVGCont:{_getExportRectPx:()=>{assert.equal(container.inert,false,'measurement must allow DOM hit testing');return{x1:0,y1:0,x2:920,y2:700,width:920,height:700};},
   async buildSVG(params){builds.push(params);if(delay)await new Promise(r=>releaseBuild=r);if(fail)throw new Error('expected test failure');return{outText:'<svg/>'};},async save(){} }
 });
 vm.runInContext(fs.readFileSync('mapmaker.js','utf8'),box);
 const maker=vm.runInContext('mapMaker',box);maker.customMode=true;maker.queueExportPreview=()=>{};
 const render=async()=>{maker.setRoughPreviewLock(true);await maker.renderRoughPreview(maker.roughPreviewVersion=(maker.roughPreviewVersion||0)+1);};
 await render();
 assert.equal(modals[0][1].compact,true);assert.equal(modals[0][1].mode,'');assert.match(modals[0][1].message,/processing_message/);
 assert.equal(modals.at(-1)[0],'close');assert.equal(box.winCont.modalMode,false);
 assert.equal(ids.has('mapmakerRoughStatus'),false,'processing uses shared modal instead of a status element');
 assert.ok(menu.classList.contains('rough-preview-mode'));
 assert.equal(container.inert,true);assert.equal(color.disabled,true);assert.equal(reset.disabled,true);assert.equal(threeD.disabled,true);assert.equal(toggle.disabled,false);assert.equal(save.disabled,false);
 assert.equal(builds[0].preview,true);assert.equal(builds[0].screenPreview,undefined,'preview uses save geometry and marker composition without hit targets');
 assert.equal(ids.get('mapmakerRoughPreview').style.left,'0px');assert.equal(ids.get('mapmakerRoughPreview').style.width,'920px');assert.equal(ids.get('mapmakerRoughPreview').children.length,1);
 assert.equal(ids.get('mapmakerRoughPreview').style.top,'0px');assert.equal(ids.get('mapmakerRoughPreview').style.height,'700px','preview covers the area behind mobile menus as well');
 assert.equal(builds[0].exportRect.height,700);
 assert.ok(container.classList.contains('mapmaker-rough-preview'));
 // Save must preserve the lock, rather than re-enable reset and 3D controls.
 await maker.save('png');assert.equal(reset.disabled,true);assert.equal(threeD.disabled,true);assert.equal(save.disabled,false);
 maker.clearRoughPreview();assert.equal(menu.classList.contains('rough-preview-mode'),false);assert.equal(container.inert,false);assert.equal(color.disabled,false);assert.equal(disabled.disabled,true);assert.equal(ids.has('mapmakerRoughPreview'),false);assert.ok(revoked.length);
 // Off during generation must never resurrect the stale image.
 delay=true;const pending=render();await new Promise(setImmediate);maker.clearRoughPreview();releaseBuild();await pending;
 assert.equal(ids.has('mapmakerRoughPreview'),false);assert.equal(container.inert,false);assert.equal(box.winCont.modalMode,false,'Off closes its processing modal');
 // Consecutive versions keep the shared processing modal open until the latest image is ready.
 const first=render();await new Promise(setImmediate);const staleRelease=releaseBuild;
 const secondVersion=++maker.roughPreviewVersion;staleRelease();await first;
 assert.equal(box.winCont.modalMode,true,'stale completion cannot dismiss a newer pending render');
 delay=false;await maker.renderRoughPreview(secondVersion);assert.equal(box.winCont.modalMode,false);
 // Existing dialogs are neither replaced nor dismissed by the preview.
 const external={};box.winCont.modal=external;box.winCont.modalMode=true;const count=modals.length;
 await render();assert.equal(box.winCont.modal,external);assert.equal(box.winCont.modalMode,true);assert.equal(modals.length,count);
 box.winCont.modalMode=false;
 delay=false;fail=true;await render();assert.equal(toggle.checked,false);assert.equal(container.inert,false);assert.equal(ids.has('mapmakerRoughPreview'),false);assert.deepEqual(alerts,['rough_preview_error']);assert.equal(box.winCont.modalMode,false,'failed rendering closes its processing modal');
 console.log('PASS hand-drawn image alignment, save-compatible composition, edit lock, Off/cancellation, save lock preservation, shared-modal ownership, rapid updates, cancellation, cleanup and failure recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
