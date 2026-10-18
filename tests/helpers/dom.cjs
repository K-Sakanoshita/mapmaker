// Small DOM model for control-flow tests; browser smoke verifies actual HTML parsing.
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class Element {
    constructor(tag) { this.tagName=tag; this.children=[]; this.attributes={}; this.style={}; this.events={}; this.text=''; }
    setAttribute(k,v) { this.attributes[k]=String(v); }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    addEventListener(k,f) { this.events[k]=f; }
    set textContent(v) { this.text=String(v); this.children=[]; }
    get textContent() { return this.text+this.children.map(c=>c.textContent).join(''); }
    set innerHTML(v) { this.html=v; }
    get innerHTML() { return this.html ?? escape(this.text)+this.children.map(c=>c.outerHTML).join(''); }
    get outerHTML() { const attrs={...this.attributes}; if(this.className)attrs.class=this.className; if(this.value!==undefined)attrs.value=this.value; if(this.src)attrs.src=this.src; if(this.selected)attrs.selected=''; return `<${this.tagName}${Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${this.innerHTML}</${this.tagName}>`; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) { return this.children.flatMap(c=>[...(selector.startsWith('.') ? (c.className||'').split(' ').includes(selector.slice(1)) : c.tagName===selector) ? [c] : [],...c.querySelectorAll(selector)]); }
}
module.exports={Element, document:{baseURI:'http://localhost/index.html',createElement:tag=>new Element(tag)}};
