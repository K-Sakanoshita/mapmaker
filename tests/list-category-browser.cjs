const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
        headless: true, args: ['--no-sandbox']
    });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('http://mapmaker.test/**', async route => {
            if (new URL(route.request().url()).pathname === '/list-table.js') {
                return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(__dirname, '../lib/ui/list-table.js'), 'utf8') });
            }
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja"><meta charset="utf-8">
                <select id="modal_select_category"></select><input id="modal_select_keyword">
                <table id="modal_select_table"></table>
                <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
                <script src="https://cdn.datatables.net/v/bs5/dt-3.0.3/sl-4.0.1/datatables.min.js"></script>
                <script src="/list-table.js"></script></html>` });
        });
        await page.goto('http://mapmaker.test/');
        await page.waitForFunction(() => typeof DataList !== 'undefined' && !!window.jQuery?.fn.DataTable);
        await page.evaluate(() => {
            window.Conf = { datatables_columns: [{ data: 'name' }, { data: 'category' }, { data: 'osmid' }], datatables_lang: {} };
            window.poiCont = { list: () => [
                { name: 'カタールパビリオン', category: '案内(案内板)', osmid: '1', enable: false },
                { name: 'おやつパビリオン', category: 'おみやげ屋', osmid: '2', enable: false },
                { name: 'カタール', category: 'パビリオン', osmid: '3', enable: false },
                { name: 'ウガンダ', category: 'パビリオン', osmid: '4', enable: false },
                { name: '別館', category: 'パビリオン別館', osmid: '5', enable: false },
                { name: '案内所', category: '案内(案内板)', osmid: '6', enable: false }
            ] };
            window.winCont = {
                select_clear: id => document.getElementById(id).replaceChildren(new Option('すべての種類', '-')),
                select_add: (id, label, value) => document.getElementById(id).add(new Option(label, value))
            };
            window.Marker = { center() {} };
            DataList.init(); DataList.view_select([]);
        });
        const ids = () => page.evaluate(() => DataList.filtered().map(row => row.osmid));
        await page.selectOption('#modal_select_category', 'パビリオン');
        assert.deepEqual(await ids(), ['3', '4']);
        assert.equal(await page.inputValue('#modal_select_keyword'), '');
        await page.fill('#modal_select_keyword', 'カタール');
        await page.locator('#modal_select_keyword').dispatchEvent('change');
        await page.waitForFunction(() => DataList.filtered().length === 1);
        assert.deepEqual(await ids(), ['3']);
        await page.evaluate(() => DataList.filtered_select());
        assert.deepEqual(await page.evaluate(() => DataList.indexes().map(row => row.osmid)), ['3']);
        await page.selectOption('#modal_select_category', '-');
        assert.deepEqual(await ids(), ['1', '3']); // clearing type retains the keyword
        await page.fill('#modal_select_keyword', '');
        await page.locator('#modal_select_keyword').dispatchEvent('change');
        await page.waitForFunction(() => DataList.filtered().length === 6);
        await page.selectOption('#modal_select_category', '案内(案内板)');
        assert.deepEqual(await ids(), ['1', '6']); // punctuation is literal
        await page.selectOption('#modal_select_category', '-');
        assert.equal((await ids()).length, 6);
        await page.screenshot({ path: '/tmp/mapmaker-list-category.png' });
        assert.deepEqual(errors, []);
        console.log('PASS exact category filtering, independent keyword intersection, clearing filters and filtered selection');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
