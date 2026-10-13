// covers: none - disposable independent checker execution; never land
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { open, source, selected, inspection, row, number, frame, ready, seek, select, undo, redo, scrub, draw, point, capture, saveReopen } from './_layerProperty';

async function checkWorkspace(page: Page, label: string) {
  const b = await page.evaluate(() => Object.fromEntries(['.ef-viewport','.ef-timeline','.ef-inspector'].map(s => { const r=document.querySelector(s)!.getBoundingClientRect(); return [s,{width:r.width,height:r.height}]; })));
  expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if(label==='actual-125') { expect(b['.ef-viewport'].height).toBeGreaterThanOrEqual(180); expect(b['.ef-timeline'].height).toBeCloseTo(180,0); }
  expect(b['.ef-inspector'].width).toBeCloseTo(280,0);
  for(const control of [page.getByTestId('open-home'),page.getByRole('button',{name:'Composition',exact:true}),page.getByRole('button',{name:'select tool',exact:true}),page.getByRole('slider',{name:'Playhead',exact:true})]) { await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport(); }
  const canvas=(await page.getByTestId('foundation-canvas').boundingBox())!;
  for(const selector of ['[data-handle="2"]','[data-rotate]','[data-anchor]']) {
    const h=page.locator('.ef-selection '+selector); await expect(h).toBeVisible(); const r=(await h.boundingBox())!;
    // Bound the full handle to the canvas, avoiding IntersectionObserver's SVG area rounding.
    expect(r.x).toBeGreaterThanOrEqual(canvas.x); expect(r.y).toBeGreaterThanOrEqual(canvas.y);
    expect(r.x+r.width).toBeLessThanOrEqual(canvas.x+canvas.width); expect(r.y+r.height).toBeLessThanOrEqual(canvas.y+canvas.height);
    expect(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-testid=foundation-canvas]'),{x:r.x+r.width/2,y:r.y+r.height/2})).toBe(true);
  }
}
async function journey(page: Page, label: string) {
  const errors: string[] = [], failed: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => failed.push(r.url() + ': ' + r.failure()?.errorText));
  await open(page);
  const initial = await source(page);
  await select(page, '.graphic');
  await row(page, '#f1').locator('.ef-layer').click({ modifiers: ['Shift'] });
  expect(await selected(page)).toEqual(['.graphic', '.graphic-box', '#f0', '#f1']);
  await select(page, '#f0');
  await row(page, '#f1').locator('.ef-layer').click({ modifiers: ['Control'] });
  expect(await selected(page)).toEqual(['#f0', '#f1']);
  await select(page, '#f0');
  await row(page, '#f0').locator('.ef-layer').press('Enter');
  const name = page.getByRole('textbox', { name: 'Layer name', exact: true });
  await name.fill('Independent presenter'); await name.press('Enter'); await ready(page);
  expect((await source(page)).fields).toEqual(initial.fields);
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Nadia Laurent');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await frame(page)).locator('#f0')).toHaveText('Nadia Laurent');
  const xText = number(page, 'Layout offset X');
  const baseline = await source(page), history = (await inspection(page)).history;
  await xText.fill(''); await xText.press('Delete'); await xText.press('Escape');
  expect(await source(page)).toEqual(baseline); expect((await inspection(page)).history).toEqual(history);
  for (const [modifier, delta] of [[undefined, 13], ['Shift', 130], ['Control', 1.3]] as const) {
    const before = await source(page), h = (await inspection(page)).history.undo;
    expect(Number(await scrub(page, xText, 26, modifier))).toBeCloseTo(delta, 5);
    expect((await inspection(page)).history.undo).toBe(h + 1);
    await undo(page); expect(await source(page)).toEqual(before);
  }
  await seek(page, 0);
  const shape = await draw(page, .42);
  await seek(page, 1);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();
  await select(page, shape); await row(page, shape).locator('.ef-layer').dblclick();
  await name.fill('Independent plate'); await name.press('Enter'); await ready(page);
  const beforeDisclosure = await source(page);
  await page.getByRole('button', { name: 'Properties of Independent plate', exact: true }).click();
  expect(await page.locator(`.ef-property-track[data-selector="${shape}"]`).count()).toBeGreaterThanOrEqual(5);
  const beforeKeys = await source(page);
  expect(beforeKeys).toEqual(beforeDisclosure);
  const x = number(page, 'Position X');
  await x.fill('137'); await x.press('Enter'); await ready(page);
  await number(page, 'Rotation').fill('8'); await number(page, 'Rotation').press('Enter'); await ready(page);
  await row(page, shape).locator('.ef-layer').press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click(); await ready(page);
  const duplicate = (await selected(page))[0]; expect(duplicate).not.toBe(shape);
  await row(page, duplicate).locator('.ef-layer').press('Delete'); await ready(page);
  await undo(page); await expect((await frame(page)).locator(duplicate)).toHaveCount(1);
  await redo(page); await expect((await frame(page)).locator(duplicate)).toHaveCount(0);
  await select(page, shape);
  await page.getByRole('button', { name: 'Hide Independent plate layer', exact: true }).click();
  await expect((await frame(page)).locator(shape)).toBeHidden();
  await undo(page); await expect((await frame(page)).locator(shape)).toBeVisible();
  await select(page, shape);
  await seek(page, .4); await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  await seek(page, .92); await scrub(page, x, 26);
  const keyed = await source(page), h = (await inspection(page)).history;
  const renderedX = async () => (await frame(page)).locator(shape).evaluate(el => el.getBoundingClientRect().x);
  const originalX = await renderedX();
  await scrub(page, x, 34, undefined, 'Escape', async () => {
    await expect.poll(renderedX).not.toBeCloseTo(originalX, 2);
    expect(await source(page)).toEqual(keyed); expect((await inspection(page)).history).toEqual(h);
  });
  await expect.poll(renderedX).toBeCloseTo(originalX, 2);
  expect(await source(page)).toEqual(keyed); expect((await inspection(page)).history).toEqual(h);
  await undo(page); await redo(page); expect(await source(page)).toEqual(keyed);
  const canvasForKeys = page.getByTestId('foundation-canvas');
  for (const [key, label] of [['a','Anchor X'],['p','Position X'],['s','Scale X %'],['r','Rotation'],['t','Opacity %']]) {
    await canvasForKeys.focus(); await page.keyboard.press(key);
    await expect(page.locator('.ef-inspector').getByRole(label==='Opacity %'?'spinbutton':'textbox',{name:label,exact:true})).toBeInViewport();
  }
  await canvasForKeys.focus(); await page.keyboard.press('u');
  await expect(page.locator(`.ef-property-track[data-selector="${shape}"][data-property="x"]`)).toBeVisible();
  await page.getByRole('button',{name:'Previous Position X key',exact:true}).click(); await ready(page);
  await expect(page.getByTestId('foundation-clock')).toHaveText('0.40 s');
  await page.getByRole('button',{name:'Next Position X key',exact:true}).click(); await ready(page);
  await expect(page.getByTestId('foundation-clock')).toHaveText('0.92 s');
  expect(await source(page)).toEqual(keyed); expect((await inspection(page)).history).toEqual(h);
  const pointer=await point(page,shape);
  await page.keyboard.down('Alt');await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();await page.mouse.move(pointer.x+24,pointer.y+9,{steps:8});
  await expect((await frame(page)).locator(shape+'-copy-1')).toHaveCount(1);expect(await source(page)).toEqual(keyed);
  await page.mouse.up();await page.keyboard.up('Alt');await ready(page);expect((await selected(page))[0]).not.toBe(shape);expect((await inspection(page)).history.undo).toBe(h.undo+1);
  await undo(page);expect(await source(page)).toEqual(keyed);
  await canvasForKeys.focus();await page.keyboard.press('Control+d');await ready(page);
  await canvasForKeys.focus();await page.keyboard.press('Shift+F10');await expect(page.getByRole('menu',{name:'Layer actions'})).toBeVisible();await page.keyboard.press('Escape');
  await undo(page);expect(await source(page)).toEqual(keyed);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0); await capture(page,test.info().outputPath(label+'-leave-dialog.png')); await page.getByTestId('switch-cancel').click();
  const saved = await saveReopen(page, 'Independent interaction check ' + label);
  expect(saved.fields).toEqual(keyed.fields); expect(saved.fields.map(f => f.field)).toEqual(initial.fields.map(f => f.field)); expect(saved.assets).toEqual(initial.assets);
  expect(saved.html.match(/<div class="graphic-mask">/g)).toEqual(initial.html.match(/<div class="graphic-mask">/g));
  await seek(page, 1); await select(page, shape); await number(page, 'Rotation').scrollIntoViewIfNeeded();
  await capture(page, test.info().outputPath(label + '.png'));
  if (label === 'actual-125') { const cdp = await page.context().newCDPSession(page); const native = await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}); writeFileSync(test.info().outputPath('native-125.png'),Buffer.from(native.data,'base64')); }
  await checkWorkspace(page, label);
  if (label === 'actual-125') {
    const documentBefore = await source(page), historyBefore = (await inspection(page)).history;
    await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('2');
    const canvas = (await page.getByTestId('foundation-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(canvas.x + canvas.width / 2 + 31, canvas.y + canvas.height / 2 - 13);
    await page.mouse.up({ button: 'middle' });
    const camera = () => page.locator('.ef-artboard').evaluate(el => (el as HTMLElement).style.transform.split(' translate(-50%')[0]);
    expect(await camera()).toBe('translate(31px, -13px)');
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    for (const bounds of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
      await cdp.send('Browser.setWindowBounds', { windowId, bounds });
      await expect.poll(() => page.evaluate(() => ({ width: outerWidth, height: outerHeight }))).toEqual(bounds);
      await expect(page.getByRole('combobox', { name: 'Canvas zoom' })).toHaveValue('2');
      expect(await camera()).toBe('translate(31px, -13px)');
      expect(await source(page)).toEqual(documentBefore); expect((await inspection(page)).history).toEqual(historyBefore);
    }
    await cdp.detach();
    writeFileSync(test.info().outputPath('native-camera.json'), JSON.stringify({ zoom: 2, pan: [31, -13], outerWindows: [[1920,1080],[1366,768]], sourceUnchanged: true, historyUnchanged: true }, null, 2));
    await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('1');
  }
  const bounds = await page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio, visualScale: visualViewport?.scale,
    html: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth },
    controls: Object.fromEntries(['.ef-shell', '.ef-viewport', '.ef-timeline', '.ef-inspector'].map(s => { const e = document.querySelector(s)!, r = e.getBoundingClientRect(); return [s, {x:r.x,y:r.y,width:r.width,height:r.height}]; })) }));
  await page.getByTestId('open-home').click(); await page.getByTestId('home-nav-graphics').click();
  const savedRow = page.locator('.lib-row', { hasText: 'Independent interaction check ' + label });
  await savedRow.getByTestId('row-menu').click(); await savedRow.getByTestId('export-graphic').click();
  const win = page.getByTestId('export-window'); await expect(win).toBeVisible();
  const outputs = [];
  for (const target of ['SPX export', 'CasparCG export', 'OGraf (EBU) export']) {
    await win.getByRole('radio', { name: target, exact: false }).check();
    const pending = page.waitForEvent('download'); await win.getByRole('button', { name: 'Validate & download (' + target + ')', exact: true }).click();
    const download = await pending; expect(await download.failure()).toBeNull();
    const zip = await JSZip.loadAsync(readFileSync((await download.path())!)), files: Record<string, Buffer> = {};
    for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) files[name.slice(name.indexOf('/') + 1)] = await zip.file(name)!.async('nodebuffer');
    const output = await page.context().newPage(), outputErrors: string[] = [];
    output.on('pageerror', e => outputErrors.push(e.message));
    await output.route('http://independent-output.local/**', route => { const name = new URL(route.request().url()).pathname.slice(1), body = files[name]; return route.fulfill({status:body?200:name?404:200,contentType:/\.m?js$/.test(name)?'application/javascript':/\.css$/.test(name)?'text/css':/\.svg$/.test(name)?'image/svg+xml':/\.png$/.test(name)?'image/png':/\.woff2$/.test(name)?'font/woff2':'text/html',body:body??'<html><body></body></html>'}); });
    if (target.startsWith('OGraf')) {
      await output.goto('http://independent-output.local/');
      await output.evaluate(async () => { const mod = await import('http://independent-output.local/graphic.mjs'); customElements.define('independent-graphic', mod.default); const el = document.createElement('independent-graphic') as HTMLElement & {load(p:unknown):Promise<unknown>;playAction(p:unknown):Promise<unknown>}; document.body.append(el); await el.load({data:{}}); await el.playAction({}); });
    } else { await output.goto('http://independent-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel'))); await output.evaluate(() => (window as unknown as {play:()=>void}).play()); }
    await expect(output.locator('#f0')).toHaveText('Nadia Laurent'); await expect(output.locator('#f0')).toHaveAttribute('data-noacg-label', 'Independent presenter');
    await expect(output.locator(shape)).toHaveAttribute('data-noacg-label', 'Independent plate');
    await expect.poll(() => output.locator('.graphic').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    expect(await output.locator('#festival-config').textContent()).toBe('{"slug":"riverlight","season":2026}');
    expect(await output.locator('#festival-mark').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(72);
    for (const asset of initial.assets) if (!target.startsWith('CasparCG')) expect(files[asset.path].toString('base64')).toBe(asset.data.split(',')[1]);
    expect(outputErrors).toEqual([]); outputs.push({target,errors:outputErrors,download:download.suggestedFilename()}); await output.close();
  }
  expect(errors).toEqual([]); expect(failed).toEqual([]);
  writeFileSync(test.info().outputPath(label + '.json'), JSON.stringify({label,shape,duplicate,fields:saved.fields.map(f=>f.field),assets:saved.assets.map(a=>a.path),bounds,outputs,errors,failed},null,2));
}
for (const [width,height] of [[1920,1080],[1366,768]]) test('phase cumulative task ' + width, async ({page}) => {
  test.setTimeout(240000); await page.setViewportSize({width,height}); await journey(page, width === 1920 ? 'desktop' : 'laptop');
});
test('phase actual 125 percent cumulative task', async () => {
  test.setTimeout(300000);
  const extension = resolve(test.info().outputPath('extension')); mkdirSync(extension,{recursive:true});
  writeFileSync(extension+'/manifest.json',JSON.stringify({manifest_version:3,name:'Qualification zoom measurement',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  writeFileSync(extension+'/worker.js','chrome.runtime.onInstalled.addListener(() => {});');
  const context = await chromium.launchPersistentContext(test.info().outputPath('profile'), {headless:false,channel:'chromium',viewport:null,deviceScaleFactor:undefined,baseURL:String(test.info().project.use.baseURL),args:['--window-size=1366,768','--disable-extensions-except='+extension,'--load-extension='+extension]});
  const page=context.pages()[0];
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    await page.goto(String(test.info().project.use.baseURL)+'/app?editor=foundation#/new');
    const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1/*'});const id=tabs.find(t=>t.url?.includes('/app'))!.id!;await chrome.tabs.setZoom(id,1.25);return chrome.tabs.getZoom(id);}); expect(zoom).toBe(1.25);
    await journey(page,'actual-125');
    const finalZoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1/*'});return chrome.tabs.getZoom(tabs.find(t=>t.url?.includes('/app'))!.id!);}); expect(finalZoom).toBe(1.25);
    writeFileSync(test.info().outputPath('zoom.json'),JSON.stringify({zoom,finalZoom,metrics:await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualScale:visualViewport?.scale}))},null,2));
  } finally {await context.close();}
});
