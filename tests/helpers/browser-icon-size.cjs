const assert = require('node:assert/strict');
module.exports = async (page, screenshot) => {
    await page.evaluate(() => {
        window.__iconSizeOriginal = {text: {...Conf.effect.text}, icon: {...Conf.effect.icon}};
        Conf.effect.text.size = 14;
        Conf.effect.text.view = true;
        window.__iconSizeSelection = winCont.modal_select(['shop']).catch(() => {});
    });
    const preset = page.locator('#modal_select_size_preset');
    await preset.waitFor({state: 'visible'});
    assert.equal(await preset.inputValue(), '14');
    assert.equal(await page.locator('#modal_select_size_details').getAttribute('open'), null);
    const size = () => page.locator('#modal_select_preview_icon').evaluate(el => parseFloat(el.style.width));
    const standard = await size();
    await preset.selectOption('12'); assert.ok(await size() < standard);
    await preset.selectOption('18'); assert.ok(await size() > standard);
    await page.locator('#modal_select_facility').uncheck();
    assert.equal(await preset.isEnabled(), true);
    assert.equal(await page.locator('#modal_select_preview_name').isVisible(), false);
    await page.locator('#modal_select_appearance').selectOption('unframed');
    assert.equal(await page.locator('#modal_select_preview_icon').evaluate(el => el.style.backgroundImage), 'none');
    await preset.selectOption('custom');
    assert.equal(await page.locator('#modal_select_size').isVisible(), true);
    await page.locator('#modal_select_size').selectOption('16');
    assert.equal(await preset.inputValue(), 'custom');
    await page.locator('#modal_select_facility').check();
    assert.equal(await page.locator('#modal_select_preview_name').evaluate(el => el.style.fontSize), '16px');
    await page.locator('#modal_select_appearance').selectOption('standard');
    await preset.selectOption('14');
    await page.locator('#modal_select_size_details').evaluate(el => el.open = false);
    await page.locator('#modal_select_preview_icon').evaluate(el => el.decode());
    const layout = await page.locator('#modal_select').evaluate(el => {
        const preview = el.querySelector('.icon-size-preview').getBoundingClientRect();
        const control = el.querySelector('#modal_select_size_preset').getBoundingClientRect();
        const panel = el.getBoundingClientRect();
        return {inside: preview.right <= panel.right && control.left >= panel.left,
            noOverlap: control.right <= preview.left};
    });
    assert.deepEqual(layout, {inside:true, noOverlap:true});
    if (screenshot) await page.screenshot({path:screenshot});
    await preset.selectOption('18');
    await page.locator('#modal_select_ok').click();
    await page.evaluate(async () => { await window.__iconSizeSelection; });
    assert.equal(await page.evaluate(() => Number(Conf.effect.text.size)), 18);
    // Reopening retains the chosen size; cancelling another choice leaves it unchanged.
    await page.evaluate(() => { window.__iconSizeSelection = winCont.modal_select(['shop']).catch(() => {}); });
    assert.equal(await preset.inputValue(), '18');
    await preset.selectOption('12');
    await page.locator('#modal_select_cancel').click();
    assert.equal(await page.evaluate(() => Number(Conf.effect.text.size)), 18);
    await page.evaluate(async () => {
        await window.__iconSizeSelection;
        Object.assign(Conf.effect.text, window.__iconSizeOriginal.text);
        Object.assign(Conf.effect.icon, window.__iconSizeOriginal.icon);
        delete window.__iconSizeOriginal; delete window.__iconSizeSelection;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await new Promise(resolve=>{map.gl.once('idle',resolve);map.gl.triggerRepaint();});
    });
};
