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
assert.equal(run().redirected, 'https://example.test/en/');
assert.equal(run({languages:['ja-JP','en-US']}).redirected, undefined);
assert.equal(run({languages:['fr-FR','en-GB']}).redirected, 'https://example.test/en/');
assert.equal(run({languages:['fr-FR']}).redirected, 'https://example.test/en/');
assert.equal(run({languages:['en-US'],saved:'ja'}).redirected, undefined);
assert.equal(run({languages:['ja-JP'],saved:'en'}).redirected, 'https://example.test/en/');
assert.equal(run({path:'/en/',language:'en',languages:['ja-JP']}).redirected, undefined);
assert.equal(run({path:'/en/',language:'en',saved:'ja'}).redirected, 'https://example.test/');
assert.equal(run({saved:'invalid'}).redirected, 'https://example.test/en/');
const explicit=run({path:'/?lang=ja&demo=1#18/35/139',saved:'en'});
assert.equal(explicit.redirected, undefined);assert.equal(explicit.values.get('mapmaker-language'),'ja');
assert.equal(run({path:'/index.html?demo=1#18/35/139'}).redirected,'https://example.test/en/?demo=1#18/35/139');
assert.equal(run({root:'/maps/',path:'/maps/?demo=1#18/35/139'}).redirected,'https://example.test/maps/en/?demo=1#18/35/139');
assert.equal(run({path:'/?lang=ja',blocked:true}).redirected,undefined);
assert.equal(run({blocked:true}).redirected,'https://example.test/en/');
const menu=run({languages:['ja-JP']});menu.addLinks();
menu.location.hash='#19/35/139/45/30';menu.location.search='?demo=1';
const link=menu.nodes.find(node=>node.dataset.siteLanguage==='en');link.click();
assert.equal(link.href,'https://example.test/en/?demo=1&lang=en#19/35/139/45/30');
assert.equal(menu.values.get('mapmaker-language'),'en');
assert.equal(menu.nodes.find(node=>node.dataset.siteLanguage==='ja').textContent,'日本語');
for (const file of ['index.html','en/index.html']) {
    const html=fs.readFileSync(file,'utf8');
    assert.ok(html.indexOf('language-router.js') < html.indexOf('cdn.jsdelivr.net'));
}
console.log('PASS browser language selection, saved/explicit choices, English direct entry, unsupported languages, blocked storage, base paths and live map URL preservation');
