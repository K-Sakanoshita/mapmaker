const assert = require('node:assert/strict');
module.exports = async (browser, base) => {
    for (const {locale,width,path,expected,manual} of [
        {locale:'en-US',width:390,path:'/',expected:'en',manual:true},
        {locale:'ja-JP',width:1280,path:'/',expected:'ja',manual:true},
        {locale:'ja-JP',width:1280,path:'/en/',expected:'en',manual:false}
    ]) {
        const context = await browser.newContext({locale,viewport:{width,height:900},ignoreHTTPSErrors:true});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url=route.request().url();
            if(url.includes('script.google.com')||url.includes('googletagmanager.com'))return route.fulfill({status:200,body:'{}'});
            if(url.includes('/tiles/osmfj_poi.json'))return route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#fff'}}]}});
            return route.continue();
        });
        const ready = async language => {
            await page.waitForFunction(language => document.documentElement.lang === language && typeof map !== 'undefined' && map?.gl?.isStyleLoaded(),language,{timeout:60000});
            await page.evaluate(() => document.getElementById('mapMakerIntroClose')?.click());
        };
        await page.goto(base+path+'?source=sns#18/35/139',{waitUntil:'domcontentloaded'});
        await ready(expected);
        assert.equal(new URL(page.url()).searchParams.get('source'),'sns');
        assert.equal(await page.evaluate(()=>localStorage.getItem('mapmaker-language')),null,'automatic detection must not become a manual preference');
        if(manual) {
            for(const target of [expected==='en'?'ja':'en',expected]) {
                await page.evaluate(()=>map.gl.jumpTo({center:[139.1,35.1],zoom:17,bearing:20,pitch:30}));
                await page.waitForFunction(()=>location.hash.startsWith('#17/35.1/139.1'));
                const hash = new URL(page.url()).hash;
                await page.locator('header button[data-bs-toggle="dropdown"]').click();
                await page.locator(`[data-site-language="${target}"]`).click();
                await ready(target);
                assert.equal(new URL(page.url()).hash,hash,'manual switch retains the latest map camera');
                assert.equal(new URL(page.url()).searchParams.get('source'),'sns');
                assert.equal(await page.evaluate(()=>localStorage.getItem('mapmaker-language')),target);
                await page.goto(base+'/?source=sns#18/35/139');
                await ready(target);
                assert.equal(new URL(page.url()).pathname,target==='en'?'/en/':'/');
            }
            await page.locator('header button[data-bs-toggle="dropdown"]').click();
            await page.screenshot({path:`/tmp/mapmaker-language-${locale}-${width}.png`});
        }
        assert.deepEqual(errors,[]);
        await context.close();
        console.log(`PASS language ${locale} ${width}: initial ${expected}, manual=${manual}`);
    }
};
