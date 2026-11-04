const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const translations=JSON.parse(fs.readFileSync('data/glot.json','utf8'));
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.events={};this.textContent='';}
 setAttribute(key,value){this[key]=value;}
 appendChild(child){child.parent=this;this.children.push(child);}
 addEventListener(name,callback){this.events[name]=callback;}
 focus(){this.focused=true;}
 select(){this.selected=true;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
(async()=>{
 for(const language of ['ja','en']){
  const message=new Element('div'),container=new Element('div');
  let copied;
  const box=vm.createContext({document:{createElement:tag=>new Element(tag),getElementById:()=>message},
   navigator:{clipboard:{writeText:async text=>{copied=text;}}},glot:{get:key=>translations[key]?.[language]||key}});
  vm.runInContext(fs.readFileSync('lib/ui/window-controller.js','utf8'),box);
  const win=vm.runInContext('winCont',box);
  const report='Attempt 1\nServer: maps.mail.ru\nHTTP: 502\nMessage: <img src=x> & unavailable';
  win.addErrorCopyButton(container,report);
  const button=container.children[0];
  assert.equal(button.textContent,translations.request_copy_errors[language]);
  await button.events.click();
  assert.equal(copied,report,'copy preserves the entire plain-text report');
  assert.equal(button.textContent,translations.request_errors_copied[language]);
  box.navigator.clipboard.writeText=async()=>{throw new Error('permission denied');};
  await button.events.click();
  assert.equal(button.textContent,translations.request_errors_copy_failed[language]);
  const manual=container.children[1];
  assert.equal(manual.tagName,'textarea');assert.equal(manual.value,report);
  assert.ok(manual.readOnly&&manual.focused&&manual.selected);
  await button.events.click();assert.equal(container.children.length,2,'denial does not duplicate the manual field');
  box.navigator.clipboard={writeText:async text=>{copied=text;}};
  await button.events.click();assert.equal(container.children.length,1,'successful retry removes the fallback field');
  win.modal_text('Retry 2/7\nServer: maps.mail.ru\nPrevious response: <img src=x>',false);
  assert.equal(message.textContent,'Retry 2/7\nServer: maps.mail.ru\nPrevious response: <img src=x>');
  assert.equal(message.children.length,0,'real progress renderer treats response markup as text');
  console.log('PASS',language,'copy success, clipboard denial/manual fallback, retry and plain-text progress rendering');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
