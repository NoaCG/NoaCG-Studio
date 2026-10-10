// covers: src/components/editorFoundation/**, src/blocks/{artworkEdits,artworkLayers,editorGroups}.ts, src/model/structure.ts, src/export/**
import { test, expect } from '@playwright/test';
import { finishIntoNewEditor } from './_create';
import { writeFileSync } from 'node:fs';
import { source, selected, inspection, row, number, frame, ready, open, seek, select, undo, redo, scrub, draw, point, capture, saveReopen } from './_layerProperty';

for (const [width, height] of [[1920,1080],[1366,768]]) test(`ordinary layer selection rename eye and history ${width}`, async ({ page }) => {
  await page.setViewportSize({width,height}); await open(page); const initial = await source(page);
  await select(page,'.graphic'); await row(page,'#f0').locator('.ef-layer').click({modifiers:['Shift']});
  expect(await selected(page)).toEqual(['.graphic','.graphic-box','#f0']); expect(await source(page)).toEqual(initial);
  await select(page,'#f0'); await row(page,'#f1').locator('.ef-layer').click({modifiers:['Control']}); expect(await selected(page)).toEqual(['#f0','#f1']);
  await select(page,'#f0'); await row(page,'#f0').locator('.ef-layer').dblclick();
  const name = page.getByRole('textbox',{name:'Layer name',exact:true}); await name.fill('Presenter'); await name.press('Enter'); await ready(page);
  const renamed = await source(page); expect(renamed.fields).toEqual(initial.fields); expect(renamed.assets).toEqual(initial.assets); expect(renamed.js).toBe(initial.js); expect(renamed.css).toBe(initial.css);
  expect(renamed.html).toContain('data-noacg-label="Presenter"'); await expect((await frame(page)).locator('#f0')).toHaveText('Amira Solano');
  expect(await selected(page)).toEqual(['#f0']); await undo(page); expect(await source(page)).toEqual(initial); await redo(page); expect(await source(page)).toEqual(renamed);
  await row(page,'#f0').locator('.ef-layer').press('Enter'); await name.fill('Cancelled'); await name.press('Escape'); expect(await source(page)).toEqual(renamed);
  await page.getByRole('button',{name:'Hide Presenter layer',exact:true}).click(); await expect((await frame(page)).locator('#f0')).toBeHidden();
  await expect(row(page,'#f0')).toBeVisible(); const hidden=await source(page); expect(hidden.js).toBe(initial.js); expect(hidden.fields).toEqual(initial.fields); expect(hidden.assets).toEqual(initial.assets);
  await undo(page); expect(await source(page)).toEqual(renamed); await expect((await frame(page)).locator('#f0')).toBeVisible(); await redo(page); await expect((await frame(page)).locator('#f0')).toBeHidden();
  await page.getByRole('button',{name:'Show Presenter layer',exact:true}).click(); await expect((await frame(page)).locator('#f0')).toBeVisible();
  await row(page,'#f0').locator('.ef-layer').click({button:'right'}); await expect(page.getByRole('menu',{name:'Layer actions'})).toBeVisible();
  const menu=(await page.getByRole('menu',{name:'Layer actions'}).boundingBox())!; expect(menu.x+menu.width).toBeLessThanOrEqual(width); expect(menu.y+menu.height).toBeLessThanOrEqual(height);
  await page.keyboard.press('Escape');
  const beforeDelete=await source(page); await row(page,'#f0').locator('.ef-layer').press('Delete'); await expect((await frame(page)).locator('#f0')).toHaveCount(0);
  expect((await source(page)).fields.some(f=>f.field==='f0')).toBe(false); await undo(page); expect(await source(page)).toEqual(beforeDelete);
  await row(page,'#f0').locator('.ef-layer').press('Control+Shift+z'); await expect((await frame(page)).locator('#f0')).toHaveCount(0);
  await undo(page); await select(page,'#f0');
  await page.getByRole('button',{name:'Properties of Presenter',exact:true}).click();
  for(const property of ['x','y','scaleX','scaleY','rotation']) await expect(page.locator(`.ef-property-track[data-selector="#f0"][data-property="${property}"]`)).toHaveCount(1);
  await expect(page.locator('.ef-document-tab')).toHaveText('Riverlight festival'); await expect(page.getByRole('button',{name:'Composition',exact:true})).toBeVisible();
  await number(page,'Rotation').scrollIntoViewIfNeeded(); await capture(page,test.info().outputPath(`layers-${width}.png`));
});

test('numeric scrub previews one undo exact cancellation modifiers and armed routing', async ({page})=>{
  await page.setViewportSize({width:1920,height:1080}); await open(page); await select(page,'#f0'); const initial=await source(page), count=(await inspection(page)).history.undo;
  const x=number(page,'Layout offset X'); await expect(x).toHaveValue('0');
  for(const [modifier,delta] of [[undefined,10],['Shift',100],['Control',1]] as const){
    const before=await source(page), previous=Number(await x.inputValue()), h=(await inspection(page)).history.undo;
    expect(Number(await scrub(page,x,20,modifier))).toBe(previous+delta); await expect(x).toHaveValue(String(previous+delta));
    expect((await inspection(page)).history.undo).toBe(h+1); expect((await source(page)).js).toBe(before.js);
    await undo(page); expect(await source(page)).toEqual(before); await expect(x).toHaveValue(String(previous));
  }
  for(const cancel of ['Escape','pointercancel'] as const){
    const before=await source(page), h=(await inspection(page)).history;
    expect(Number(await scrub(page,x,20,undefined,cancel))).toBe(10); await expect(x).toHaveValue('0'); expect(await source(page)).toEqual(before); expect((await inspection(page)).history).toEqual(h);
  }
  await x.fill('123'); await x.press('Escape'); expect(await source(page)).toEqual(initial); expect((await inspection(page)).history.undo).toBe(count);
  await page.getByRole('button',{name:'Enable Layout offset X animation',exact:true}).click(); await ready(page); const armed=await source(page);
  await seek(page,.8); await scrub(page,x,20); const changed=await source(page); expect(changed.js).not.toBe(armed.js); expect(changed.css).toBe(armed.css);
  await undo(page); expect(await source(page)).toEqual(armed); await redo(page); expect(await source(page)).toEqual(changed);
  for(const button of await page.locator('.ef-animation-properties .ef-key-controls button').all()) { await expect(button).toHaveAttribute('aria-label',/.+/); await expect(button).toHaveAttribute('title',/.+/); }
  await number(page,'Rotation').scrollIntoViewIfNeeded();
  const columns=await page.locator('.ef-animation-properties input').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().x)); expect(Math.max(...columns)-Math.min(...columns)).toBeLessThan(1);
  await capture(page,test.info().outputPath('properties.png'));
});

test('create canvas selection context actions and input keyboard ownership', async({page})=>{
  await open(page); const a=await draw(page,.35),b=await draw(page,.6); await expect(page.getByRole('button',{name:'rectangle tool'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'select tool',exact:true}).click(); const p=await point(page,a), q=await point(page,b);
  await page.mouse.click(p.x,p.y); expect(await selected(page)).toEqual([a]); await page.keyboard.down('Control'); await page.mouse.click(q.x,q.y); await page.keyboard.up('Control'); expect(new Set(await selected(page))).toEqual(new Set([a,b]));
  const before=await source(page); await page.mouse.click(p.x,p.y,{button:'right'}); await expect(page.getByRole('menu',{name:'Layer actions'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Duplicate',exact:true}).click(); expect(await source(page)).not.toEqual(before); await undo(page); expect(await source(page)).toEqual(before);
  await select(page,a); await row(page,a).locator('.ef-layer').press('Shift+F10'); await page.getByRole('menuitem',{name:'Bring forward',exact:true}).click(); await ready(page);
  const reordered=await source(page); expect(reordered).not.toEqual(before); await undo(page); expect(await source(page)).toEqual(before);
  await select(page,a); await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Delete'); await expect((await frame(page)).locator(a)).toHaveCount(0); await undo(page); expect(await source(page)).toEqual(before);
  await select(page,'#f0'); const text=page.getByRole('textbox',{name:'Artwork text',exact:true}); await text.focus(); await text.press('Control+a'); await text.press('Delete');
  const h=(await inspection(page)).history; expect(await source(page)).toEqual(before); await text.press('Control+z'); expect(await source(page)).toEqual(before); expect((await inspection(page)).history).toEqual(h);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await select(page,a); const held=await source(page); await row(page,a).locator('.ef-layer').press('Enter'); const name=page.getByRole('textbox',{name:'Layer name'}); await name.press('Control+a'); await name.press('Delete'); await name.press('Escape'); expect(await source(page)).toEqual(held);
  await select(page,a); await row(page,b).locator('.ef-layer').click({modifiers:['Control']}); await page.getByRole('button',{name:'Group selection',exact:true}).click(); await ready(page);
  await page.getByRole('button',{name:'Enter group',exact:true}).click(); await expect(page.getByRole('button',{name:'Back to Composition',exact:true})).toBeVisible(); await page.getByRole('button',{name:'Back to Composition',exact:true}).click();
  await expect(page.getByRole('button',{name:'Composition',exact:true})).toHaveAttribute('aria-current','location');
});

test('cumulative import text artwork animation cancel save reopen executable outputs',async({page})=>{
  test.setTimeout(180000); await page.setViewportSize({width:1920,height:1080}); await open(page); const initial=await source(page); await select(page,'#f0');
  await page.getByRole('textbox',{name:'Artwork text',exact:true}).fill('Elena Marquez'); await page.getByRole('button',{name:'Apply text',exact:true}).click(); await expect((await frame(page)).locator('#f0')).toHaveText('Elena Marquez');
  const shape=await draw(page,.45); await page.getByRole('button',{name:'select tool',exact:true}).click(); await select(page,shape); await row(page,shape).locator('.ef-layer').dblclick(); await page.getByRole('textbox',{name:'Layer name'}).fill('Live plate'); await page.getByRole('textbox',{name:'Layer name'}).press('Enter');
  const x=number(page,'Position X'); await page.getByRole('button',{name:'Enable Position X animation',exact:true}).click(); await seek(page,.8); await scrub(page,x,20);
  const edited=await source(page); await undo(page); await redo(page); expect(await source(page)).toEqual(edited); const h=(await inspection(page)).history;
  await scrub(page,x,30,undefined,'Escape'); expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(h);
  await page.getByRole('button',{name:'Hide Live plate layer',exact:true}).click(); await expect((await frame(page)).locator(shape)).toBeHidden();
  const saved=await saveReopen(page,'Layer property qualification'); expect(saved.assets).toEqual(initial.assets); expect(saved.html.match(/<div class="graphic-mask">/g)).toEqual(initial.html.match(/<div class="graphic-mask">/g)); expect(saved.html).toContain('id="festival-config"');
  await seek(page,0); const receipts=[];
  for(const target of ['spx','casparcg','ograf']){
    const files=await page.evaluate(async target=>{
      const template=(await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip=await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(item=>item.id===target)!.build(template);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(name=>!zip.files[name].dir).map(async name=>[name.slice(name.indexOf('/')+1),await zip.file(name)!.async('base64')])));
    },target);
    const output=await page.context().newPage(); const errors:string[]=[]; output.on('pageerror',e=>errors.push(e.message));
    await output.route('http://layer-output.local/**',route=>{const name=new URL(route.request().url()).pathname.slice(1),body=files[name];return route.fulfill({status:body?200:name?404:200,contentType:/\.m?js$/.test(name)?'application/javascript':/\.css$/.test(name)?'text/css':/\.svg$/.test(name)?'image/svg+xml':/\.woff2$/.test(name)?'font/woff2':'text/html',body:body?Buffer.from(body,'base64'):'<html><body></body></html>'});});
    if(target==='ograf'){
      await output.goto('http://layer-output.local/');await output.evaluate(async()=>{const mod=await import('http://layer-output.local/graphic.mjs');customElements.define('qualification-graphic',mod.default);const el=document.createElement('qualification-graphic') as HTMLElement&{load(p:unknown):Promise<unknown>;playAction(p:unknown):Promise<unknown>};document.body.append(el);await el.load({data:{}});await el.playAction({});});
    }else{await output.goto('http://layer-output.local/'+Object.keys(files).find(name=>name.endsWith('.html')&&!name.includes('controlpanel')));await output.evaluate(()=> (window as unknown as {play:()=>void}).play());}
    await expect(output.locator('#f0')).toHaveText('Elena Marquez'); await expect.poll(()=>output.locator('.graphic').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    await expect(output.locator(shape)).toBeHidden(); await expect(output.locator(shape)).toHaveAttribute('data-noacg-label','Live plate'); expect(await output.locator('#festival-config').textContent()).toBe('{"slug":"riverlight","season":2026}'); expect(await output.locator('#festival-mark').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(72); expect(errors).toEqual([]);
    for(const asset of initial.assets) if(target!=='casparcg') expect(files[asset.path]).toBe(asset.data.split(',')[1]);
    receipts.push({target,hidden:true,text:'Elena Marquez',errors});await output.close();
  }
  writeFileSync(test.info().outputPath('journey.json'),JSON.stringify({receipts,fields:saved.fields.map(f=>f.field),assets:saved.assets.map(a=>a.path)},null,2));
});


test('ordinary nested SVG label and eye retain definitions masks references and identity', async ({page})=>{
  await page.goto('/app?editor=foundation#/new'); await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type=file]').setInputFiles('e2e/fixtures/fidelity-nested.svg'); await page.locator('.wz-next').click();
  await finishIntoNewEditor(page); await ready(page); await seek(page,1);
  const card=page.locator('.ef-track:not(.ef-property-track)').filter({has:page.locator('.ef-layer-label',{hasText:'Clipped card'})});
  await expect(card).toHaveCount(1); const selector=(await card.getAttribute('data-selector'))!; await select(page,selector);
  const initial=await source(page); await card.locator('.ef-layer').dblclick(); await page.getByRole('textbox',{name:'Layer name'}).fill('Masked plate'); await page.getByRole('textbox',{name:'Layer name'}).press('Enter');
  const renamed=await source(page); expect(renamed.html.replace(' data-noacg-label="Masked plate"','')).toBe(initial.html); expect(renamed.fields).toEqual(initial.fields); expect(renamed.assets).toEqual(initial.assets); expect(renamed.js).toBe(initial.js); expect(renamed.css).toBe(initial.css);
  await page.getByRole('button',{name:'Hide Masked plate layer',exact:true}).click(); await expect((await frame(page)).locator(selector)).toBeHidden(); await expect(row(page,selector)).toBeVisible();
  const hidden=await source(page); expect(hidden.html.replace(' data-noacg-hidden="true"','')).toBe(renamed.html); expect(hidden.html.match(/<defs>[\s\S]*?<\/defs>/)?.[0]).toBe(initial.html.match(/<defs>[\s\S]*?<\/defs>/)?.[0]); expect(hidden.js).toBe(initial.js); expect(hidden.fields).toEqual(initial.fields); expect(hidden.assets).toEqual(initial.assets);
  await undo(page); expect(await source(page)).toEqual(renamed); await expect((await frame(page)).locator(selector)).toBeVisible(); await undo(page); expect(await source(page)).toEqual(initial);
});
