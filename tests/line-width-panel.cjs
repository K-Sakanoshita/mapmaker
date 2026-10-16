const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const listeners = new Map(), timers = new Map(); let timerId = 0, changes = 0;
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this.value = ''; this.isConnected = true; }
    appendChild(child) { this.children.push(child); }
    setAttribute(key,value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type,fn) { this.events[type] = fn; }
    dispatchEvent(event) { assert.equal(event.type, 'change'); changes++; }
    contains(target) { return target === this || this.children.some(child=>child.contains(target)); }
    getBoundingClientRect() { return this.tag === 'anchor' ? {top:350,right:300,bottom:394} : {width:260,height:180}; }
    remove() { this.isConnected = false; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
}
const target = { addEventListener: (type,fn)=>listeners.set(type,fn), removeEventListener: type=>listeners.delete(type) };
const box = vm.createContext({ document: {...target,body:new Element('body'),createElement:tag=>new Element(tag)},window:target,
    innerWidth:390,innerHeight:844,Event,glot:{get:key=>key},
    setTimeout(fn) { timers.set(++timerId,fn); return timerId; },setInterval(fn) { timers.set(++timerId,fn); return timerId; },
    clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id) });
vm.runInContext(fs.readFileSync('lib/line-width-panel.js','utf8'),box);
const panel = vm.runInContext('LineWidthPanel',box), anchor = new Element('anchor'); anchor.value = '.8';
panel.open('building',anchor);
assert.equal(panel.input.value,'.8'); assert.equal(panel.input.selected,undefined,'opening panel does not focus numeric input or summon keyboard');
assert.equal(anchor.attrs['aria-expanded'],'true'); assert.equal(panel.panel.style.left,'40px');
panel.plus.events.pointerdown({button:0,preventDefault(){}}); assert.equal(anchor.value,'0.9');
panel.plus.events.click({detail:1}); assert.equal(anchor.value,'0.9','tap is not counted twice');
timers.get(panel.repeatDelay)(); timers.get(panel.repeatTimer)(); assert.equal(anchor.value,'1');
listeners.get('pointerup')(); assert.equal(timers.size,0,'release stops long-press repeat');
panel.minus.events.click({detail:0}); assert.equal(anchor.value,'0.9','keyboard activation adjusts once');
panel.input.events.focus(); assert.equal(panel.input.selected,true,'direct entry selects existing number');
for (const value of ['', '-1', '61', 'abc', 'Infinity']) {
    panel.input.value=value;panel.input.events.input();assert.equal(anchor.value,'0.9');assert.equal(panel.input.attrs['aria-invalid'],'true');
}
panel.input.value='1,2';panel.input.events.input();assert.equal(anchor.value,'1.2','decimal comma works with mobile keyboard');
panel.apply(0);assert.equal(panel.minus.disabled,true);panel.step(-1);assert.equal(anchor.value,'0');
panel.apply(60);assert.equal(panel.plus.disabled,true);panel.step(1);assert.equal(anchor.value,'60');
panel.apply(.8);panel.step(1);assert.equal(anchor.value,'0.9','no binary floating point artifacts');
listeners.get('keydown')({key:'Escape',preventDefault(){}});assert.equal(panel.panel,null);assert.equal(anchor.attrs['aria-expanded'],'false');assert.equal(anchor.focused,true);assert.equal(listeners.size,0);
panel.open('building',anchor);panel.plus.events.pointerdown({button:0,preventDefault(){}});
listeners.get('pointerdown')({target:new Element('outside')});assert.equal(panel.panel,null);assert.equal(timers.size,0);assert.equal(listeners.size,0);
assert.ok(changes>0,'adjustments notify existing style-change handlers');
console.log('PASS width panel tap/keyboard/hold, release cleanup, select-all, decimal input, validation, bounds, focus and outside dismissal');
