const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('lib/application/language-router.js', 'utf8');
function run({path='/', language='ja', languages=['en-US'], saved=null, blocked=false, root='/'} = {}) {
    let redirected;
    const values = new Map(saved ? [['mapmaker-language', saved]] : []);
    const url = new URL(path, 'https://example.test');
    const location = {href:url.href, search:url.search, hash:url.hash, replace:value=>redirected=value};
    const nodes = [];
    const document = {currentScript:{src:'https://example.test'+root+'lib/application/language-router.js?v=language-1'},
        documentElement:{lang:language}, createElement:() => ({dataset:{}, setAttribute(){}, addEventListener(type, listener){this[type]=listener;}})};
    const context = vm.createContext({URL, document, window:{location}, navigator:{languages},
        localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}}});
    vm.runInContext(source,context);
    return {redirected, values, location, nodes, addLinks:()=>vm.runInContext('SiteLanguage',context).addMenuLinks({appendChild:node=>nodes.push(node)})};
}
for (const languages of [['en-US'], ['ja-JP','en-US'], ['fr-FR','en-GB'], ['fr-FR']]) {
    assert.equal(run({languages}).redirected, undefined, 'Japanese root must not redirect');
    assert.equal(run({path:'/en/',language:'en',languages}).redirected, undefined, 'English URL must not redirect');
}
for (const saved of ['ja','en','invalid']) {
    assert.equal(run({saved}).redirected, undefined, 'Saved preference cannot override Japanese URL');
    assert.equal(run({path:'/en/',language:'en',saved}).redirected, undefined, 'Saved preference cannot override English URL');
}
assert.equal(run({path:'/?lang=en&demo=1#18/35/139',saved:'en'}).redirected, undefined);
assert.equal(run({path:'/index.html?demo=1#18/35/139'}).redirected, undefined);
assert.equal(run({root:'/maps/',path:'/maps/?demo=1#18/35/139'}).redirected, undefined);
assert.equal(run({blocked:true}).redirected, undefined);
const menu=run({languages:['en-US'],saved:'en'}); menu.addLinks();
menu.location.hash='#19/35/139/45/30';
menu.location.search='?demo=1&lang=en';
const english=menu.nodes.find(node=>node.dataset.siteLanguage==='en');
english.click();
assert.equal(english.href,'https://example.test/en/?demo=1#19/35/139/45/30');
assert.equal(menu.values.get('mapmaker-language'),'en', 'No preference written by menu');
assert.equal(menu.nodes.find(node=>node.dataset.siteLanguage==='ja').textContent,'日本語');
const japanese=menu.nodes.find(node=>node.dataset.siteLanguage==='ja'); japanese.click();
assert.equal(japanese.href,'https://example.test/?demo=1#19/35/139/45/30');
const subpath=run({root:'/maps/',path:'/maps/en/?demo=2#14/35/139',language:'en'});
subpath.addLinks();
assert.equal(subpath.nodes.find(node=>node.dataset.siteLanguage==='ja').href,'https://example.test/maps/?demo=2#14/35/139');
for (const [file,lang,title] of [
    ['index.html','ja','まち歩きマップメーカー'],
    ['en/index.html','en','Walking Map Maker']
]) {
    const html=fs.readFileSync(file,'utf8');
    assert.ok(html.includes('<html lang="'+lang+'">'));
    assert.ok(html.includes('<title>'+title));
    assert.ok(html.includes('language-router.js?v=language-2'));
    assert.ok(html.indexOf('language-router.js') < html.indexOf('cdn.jsdelivr.net'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('hreflang="ja"') && html.includes('hreflang="en"'));
}
console.log('PASS fixed URL languages, no auto redirects, explicit manual switch, map camera and query preservation, SEO metadata');
