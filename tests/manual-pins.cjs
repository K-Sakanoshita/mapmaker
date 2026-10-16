const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const nodes = new Map(), events = new Map(); let previews = 0, popup;
class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = {}; this.classes = new Set();
        this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name,on) => on ? this.classes.add(name) : this.classes.delete(name) }; }
    appendChild(child) { this.children.push(child); if(child.id) nodes.set(child.id, child); return child; }
    setAttribute(key,value) { this.attributes[key] = value; }
    addEventListener(type,fn) { this.listeners[type] = fn; }
    remove() { nodes.delete(this.id); }
}
const container = new Element('div');
const document = { createElement: tag => new Element(tag), createElementNS: (_ns,tag) => new Element(tag), importNode: node => node,
    getElementById: id => nodes.get(id), querySelectorAll: () => (nodes.get('manualPinToolbar')?.children || []).filter(b=>b.dataset.pinKind),
    addEventListener: (type,fn) => events.set(type,fn), removeEventListener: type => events.delete(type) };
const box = vm.createContext({ document, DOMParser: class { parseFromString(svg) { return { documentElement: { children: [{svg}] } }; } },
    glot: { get: key => key }, SVGCont: {}, mapMaker: { customMode: true, queueExportPreview() { previews++; } },
    map: { getContainer: () => container, closePopup() {}, gl: { on: (type,fn) => events.set('map:'+type,fn), off: type => events.delete('map:'+type) } },
    MapEngine: { divIcon: value => value, marker: (position,options) => ({ position: {...position}, options, removed:false,
        addTo() { return this; }, on(type,fn) { this.click = fn; return this; }, getLatLng() { return this.position; }, remove() { this.removed = true; } }),
        responsivePopup: () => ({ setContent(value) { popup=value; return this; }, setLatLng() { return this; }, openOn() {} }) }
});
vm.runInContext(fs.readFileSync('lib/manual-pins.js','utf8'), box);
const pins = vm.runInContext('ManualPins',box);
pins.start(); pins.start();
assert.equal(container.children.length,1,'repeated start adds neither toolbar nor handlers');
events.get('map:click')({lngLat:{lng:135,lat:35}});
pins.select('pushpin'); events.get('map:click')({lngLat:{lng:136,lat:36}});
assert.equal(pins.pins.size,2,'mode supports repeated placement');
const first=pins.pins.get(1), second=pins.pins.get(2);
assert.equal(first.kind,'location'); assert.equal(second.kind,'pushpin');
assert.equal(first.marker.options.draggable,true); assert.deepEqual([...first.marker.options.icon.iconAnchor],[16,32]);
pins.select('invalid'); assert.equal(pins.kind,'pushpin');
pins.place({lng:NaN,lat:35}); assert.equal(pins.pins.size,2);
// Export reads the current dragged position and preserves vector paths plus bottom anchor.
first.marker.position={lng:137,lat:37}; const root=new Element('g');
pins.appendToSVG(root,ll=>[ll.lng,ll.lat],.5);
assert.equal(root.children.length,2); assert.equal(root.children[0].attributes.transform,'translate(129 21) scale(0.5 0.47058823529411764)');
assert.match(root.children[0].children[0].svg,/<path/); assert.doesNotMatch(root.children[0].children[0].svg,/<image|<text/);
const input=nodes.get('manualPinText');
input.value='集合場所';input.listeners.input();
const thirdId=pins.place({lng:135.5,lat:35.5});
assert.equal(pins.pins.get(thirdId).label,'集合場所','placement captures the toolbar text');
input.value='次の場所';input.listeners.input();
assert.equal(pins.pins.get(thirdId).label,'集合場所','later toolbar edits do not change existing pins');
pins.remove(thirdId);
const labelElement=new Element('span');
const glyphElement=new Element('div');
first.marker.getElement=()=>({querySelector:selector=>selector==='.manual-pin-glyph'?glyphElement:labelElement});
const label='集合場所 <img src=x onerror="alert(1)"> & "入口"';
pins.updateLabel(1,label);
assert.equal(first.label,label);assert.equal(labelElement.textContent,label);assert.equal(labelElement.hidden,false);
assert.equal(labelElement.style.fontSize,'16px');
const labeledRoot=new Element('g');pins.appendToSVG(labeledRoot,ll=>[ll.lng,ll.lat],.5);
assert.equal(labeledRoot.children.length,3);
const svgText=labeledRoot.children[1];assert.equal(svgText.tagName,'text');assert.equal(svgText.textContent,label);
assert.equal(svgText.attributes.x,'147');assert.equal(svgText.attributes.y,'29');assert.equal(svgText.attributes['font-size'],'8');
first.marker.click({latlng:first.marker.position}); assert.match(popup,/ManualPins.remove\(1\)/);
assert.match(popup,/ManualPins.updateLabel\(1,/);assert.match(popup,/&lt;img/);assert.doesNotMatch(popup,/<img/);
const originalMarker=first.marker, originalPosition={...first.marker.position}, placementKind=pins.kind;
pins.changeKind(1,'pushpin');assert.equal(first.kind,'pushpin');assert.equal(glyphElement.innerHTML,pins.svg('pushpin'));
assert.equal(first.marker,originalMarker);assert.deepEqual(first.marker.position,originalPosition);assert.equal(first.label,label);
assert.equal(second.kind,'pushpin');assert.equal(pins.kind,placementKind,'individual change must not alter placement mode');
const changedRoot=new Element('g');pins.appendToSVG(changedRoot,ll=>[ll.lng,ll.lat],.5);
assert.equal(changedRoot.children[0].children[0].svg,pins.svg('pushpin'));
first.marker.click({latlng:first.marker.position});assert.match(popup,/data-pin-kind="pushpin" aria-label="[^"]*" aria-pressed="true"/);
assert.match(popup,/ManualPins.changeKind\(1,'pushpin',this\)/);
assert.doesNotMatch(popup,/<select/);
assert.match(popup,/class="manual-pin-actions"><button type="submit"[\s\S]*ManualPins.remove\(1\)[\s\S]*<\/div><\/form>/);
const previewsBeforeInvalid=previews;pins.changeKind(1,'invalid');pins.changeKind(999,'location');assert.equal(previews,previewsBeforeInvalid);
pins.changeKind(1,'location');assert.equal(first.kind,'location');assert.equal(glyphElement.innerHTML,pins.svg('location'));
const countBefore=previews;pins.updateLabel(999,'missing');assert.equal(previews,countBefore);
pins.updateLabel(1,'   ');assert.equal(first.label,'');assert.equal(labelElement.hidden,true);
const blankRoot=new Element('g');pins.appendToSVG(blankRoot,ll=>[ll.lng,ll.lat],.5);assert.equal(blankRoot.children.length,2,'empty labels add no SVG text');

pins.remove(1); assert.equal(first.marker.removed,true); assert.equal(pins.pins.size,1);
events.get('keydown')({key:'Escape'}); assert.equal(pins.active,false); assert.equal(events.size,0);
pins.place({lng:135,lat:35}); assert.equal(pins.pins.size,1,'leaving mode prevents placement');
pins.start(); pins.clear(); assert.equal(pins.label,''); assert.equal(second.marker.removed,true); assert.equal(pins.pins.size,0); assert.equal(pins.active,false);
box.mapMaker.customMode=false; pins.start(); assert.equal(pins.active,false,'position-selection mode cannot place annotations');
assert.ok(previews>0);
console.log('PASS pin selection, repeated placement, drag/export anchor, vector output, deletion, Escape, reset and edit-mode guard');
