const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const nodes = new Map(), listeners = new Map(); let wide = false;
class Node {
    constructor(id) { this.id=id; this.attrs={}; this.events={}; this.children=[]; this.offsetHeight=44;
        const values=new Set();this.classList={add:n=>values.add(n),remove:n=>values.delete(n),contains:n=>values.has(n),toggle:(n,on)=>on?values.add(n):values.delete(n)};
        const styles=new Map();this.style={setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)}; }
    appendChild(node) { node.parentNode=this;this.children.push(node); }
    before(node) { node.parentNode=this.parentNode; }
    after(node) { node.parentNode=this.parentNode; }
    addEventListener(type,fn) { this.events[type]=fn; }
    setAttribute(key,value) { this.attrs[key]=value; }
    getBoundingClientRect() { return {height:this.id==='editbar'?804:this.id==='basemenu'?parseFloat(nodes.get('editbar').style.getPropertyValue('--basemenu-height'))||92:52}; }
}
for(const id of ['editbar','basemenu','saveMap','mobileSheetHandle','mobileSheetHeader','mobileSheetExpand','mobileSheetClose','mobileStylesTab','controlMenu','modal_select','mobileSheetTitle'])nodes.set(id,new Node(id));
nodes.get('saveMap').parentNode=nodes.get('basemenu');nodes.get('modal_select').classList.add('d-none');nodes.get('controlMenu').offsetHeight=60;nodes.get('mobileSheetHeader').offsetHeight=24;
const box=vm.createContext({document:{getElementById:id=>nodes.get(id),createComment:()=>new Node('placeholder'),createElement:()=>new Node('mobileSaveBar')},
    window:{matchMedia:()=>({matches:wide}),addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)},
    getComputedStyle:()=>({paddingBottom:'0px'}),glot:{get:key=>key}});
vm.runInContext(fs.readFileSync('lib/ui/mobile-editor-sheet.js','utf8'),box);
const Sheet=vm.runInContext('MobileEditorSheet',box);
const maker={customMode:true,basemenuWindowMode:'minimized',applyBasemenuWindowSize(){sheet.update();}};
const sheet=new Sheet(maker);assert.equal(sheet.update(),true);
assert.equal(nodes.get('saveMap').parentNode,sheet.topbar,'same save controls move to upper bar');
assert.equal(nodes.get('mobileSheetHandle').attrs['aria-expanded'],'false');
sheet.setMode('normal');assert.equal(nodes.get('editbar').style.getPropertyValue('--basemenu-height'),'402px');
assert.match(nodes.get('mobileSheetExpand').innerHTML,/fa-window-maximize/);
assert.equal(nodes.get('mobileSheetClose').attrs['aria-label'],'basemenu_minimize');
sheet.startDrag({button:0,pointerId:1,clientY:440});
listeners.get('pointermove')({pointerId:1,clientY:190,preventDefault(){}});listeners.get('pointerup')({pointerId:1,type:'pointerup'});
assert.equal(maker.basemenuWindowMode,'expanded','upward drag snaps to expanded');assert.match(nodes.get('mobileSheetExpand').innerHTML,/fa-window-restore/);assert.equal(nodes.get('mobileSheetExpand').attrs['aria-expanded'],'true');assert.equal(listeners.size,0,'drag handlers are removed');
sheet.startDrag({button:0,pointerId:2,clientY:200});listeners.get('pointermove')({pointerId:2,clientY:700,preventDefault(){}});listeners.get('pointercancel')({pointerId:2,type:'pointercancel'});
assert.equal(maker.basemenuWindowMode,'expanded','canceled gesture restores its original state');assert.equal(listeners.size,0);
sheet.handle.events.keydown({key:'ArrowDown',preventDefault(){}});assert.equal(maker.basemenuWindowMode,'minimized');
maker.roughPreviewLocked=true;sheet.setMode('normal');assert.equal(maker.basemenuWindowMode,'normal','rough preview keeps menu resizing available');maker.roughPreviewLocked=false;
wide=true;assert.equal(sheet.update(),false);assert.equal(nodes.get('saveMap').parentNode,nodes.get('basemenu'),'desktop restores original left-pane save controls');
wide=false;maker.customMode=false;assert.equal(sheet.update(),false,'position-selection mode retains original layout');
console.log('PASS mobile sheet snap states, drag/cancel/keyboard, save-node preservation, rough preview resizing, desktop and position-mode restoration');
