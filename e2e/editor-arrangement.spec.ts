// covers: src/components/editorFoundation/**, src/blocks/{baseEdits,editorAnimation,arrangementGeometry}.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SpxTemplate } from '../src/model/types';
import { holdKeyRepeats } from './_keys';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';

const ready = async (page: Page) => { await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); };
const source = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
async function open(page: Page, fixture = 'catalog') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async t => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true }), JSON.parse(readFileSync(`docs/research/editor-r1-foundation/fixture-${fixture}.json`, 'utf8')) as SpxTemplate);
  await ready(page);
}
async function create(page: Page) {
  const ids = await page.evaluate(async () => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const result = s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [
      { kind: 'layer.create', geometry: { shape: 'rectangle', x: 100, y: -400, width: 80, height: 50 } },
      { kind: 'layer.create', geometry: { shape: 'ellipse', x: 330, y: -320, width: 120, height: 70 } },
      { kind: 'layer.create', geometry: { shape: 'rectangle', x: 680, y: -200, width: 160, height: 100 } },
    ] }); return result.changedTargets;
  }); await ready(page); return ids;
}
async function select(page: Page, ids: string[]) {
  await page.evaluate(async ids => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSelectedParts(ids), ids); await ready(page);
}
async function rects(page: Page, ids: string[]) {
  const f = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  return Promise.all(ids.map(id => f.locator(id).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })));
}
async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }

test('baseline probe: current alignment and canvas arrow capability', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, [ids[0]]);
  const before = await source(page); await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('ArrowRight'); await ready(page);
  console.log({ align: await page.getByRole('button', { name: 'Align left', exact: true }).count(), distribute: await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).count(), arrowChangesSource: JSON.stringify(await source(page)) !== JSON.stringify(before) });
});

test('selection alignment uses rendered bounds, one undo and unchanged motion', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, ids); const before = await source(page);
  await page.getByRole('button', { name: 'Align left', exact: true }).click(); await ready(page);
  const r = await rects(page, ids); expect(Math.max(...r.map(r => r.x)) - Math.min(...r.map(r => r.x))).toBeLessThan(.1);
  expect((await source(page)).js).toBe(before.js); await undo(page); expect(await source(page)).toEqual(before);
});

test('distribution leaves endpoints fixed and equalizes gaps of unequal items', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, ids); const before = await source(page), initial = await rects(page, ids);
  await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).click(); await ready(page);
  const r = await rects(page, ids); expect(r[0]).toEqual(initial[0]); expect(r[2]).toEqual(initial[2]);
  expect(r[1].x - r[0].x - r[0].width).toBeCloseTo(r[2].x - r[1].x - r[1].width, 1);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('held canvas arrows preview then commit and undo as one gesture', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, [ids[0]]); const before = await source(page), initial = (await rects(page, [ids[0]]))[0];
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.down('ArrowRight'); await holdKeyRepeats(page, 4, 'ArrowRight', 'ArrowRight');
  expect(await source(page)).toEqual(before); expect((await rects(page, [ids[0]]))[0].x).toBeCloseTo(initial.x + 5, 1);
  await page.keyboard.up('ArrowRight'); await ready(page); expect((await rects(page, [ids[0]]))[0].x).toBeCloseTo(initial.x + 5, 1);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('keyboard resize changes local width about the pivot and cancels exactly', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, [ids[0]]); const before = await source(page), initial = (await rects(page, [ids[0]]))[0];
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Control+ArrowRight'); await ready(page);
  const r = (await rects(page, [ids[0]]))[0]; expect(r.width).toBeCloseTo(initial.width + 1, 1); expect(r.x + r.width / 2).toBeCloseTo(initial.x + initial.width / 2, 1);
  await undo(page); expect(await source(page)).toEqual(before);
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Control+Shift+ArrowDown'); await ready(page);
  const taller=(await rects(page,[ids[0]]))[0];expect(taller.height).toBeCloseTo(initial.height+10,1);expect(taller.y+taller.height/2).toBeCloseTo(initial.y+initial.height/2,1);await undo(page);expect(await source(page)).toEqual(before);
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.down('ArrowDown'); await page.keyboard.press('Escape'); await page.keyboard.up('ArrowDown'); await ready(page); expect(await source(page)).toEqual(before);
});

for (const reference of ['selection', 'canvas']) test('six alignment edges against ' + reference, async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, ids);
  await page.getByRole('combobox', { name: 'Align to', exact: true }).selectOption(reference);
  for (const [label, axis, fraction] of [['Align left', 'x', 0], ['Align horizontal center', 'x', .5], ['Align right', 'x', 1], ['Align top', 'y', 0], ['Align vertical center', 'y', .5], ['Align bottom', 'y', 1]] as const) {
    const before = await source(page), r = await rects(page, ids), size = axis === 'x' ? 'width' : 'height';
    const start = reference === 'canvas' ? 0 : Math.min(...r.map(r => r[axis])), end = reference === 'canvas' ? before.resolution[size] : Math.max(...r.map(r => r[axis] + r[size]));
    await page.getByRole('button', { name: label, exact: true }).click(); await ready(page);
    const after = await rects(page, ids);
    after.forEach(r => expect(Math.abs(r[axis] + fraction * r[size] - start - fraction * (end - start))).toBeLessThan(.12));
    await undo(page); expect(await source(page)).toEqual(before);
  }
  await select(page, [ids[0]]); await expect(page.getByRole('combobox', { name: 'Align to', exact: true })).toHaveValue('canvas');
  await expect(page.getByRole('button', { name: 'Distribute horizontally', exact: true })).toBeDisabled();
});

test('vertical gaps, nested parent mapping and rotated artwork retain source and pose on undo', async ({ page }) => {
  await open(page); const ids = await create(page);
  await page.evaluate(async ids => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const html = s.template.html.replace('<div id="' + ids[0].slice(1) + '" data-gfx></div>', '<div class="arrangement-parent"><div id="' + ids[0].slice(1) + '" data-gfx></div></div>');
    s.applyTemplate({ ...s.template, html, css: s.template.css + '\n.arrangement-parent {position:absolute;transform-origin:0 0;transform:translate(100px,80px) rotate(30deg) scale(2,.75)}' });
  }, ids); await ready(page);
  await page.evaluate(async id => { const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(); s.execute({ documentId:s.documentId, expected:s.version(), transactionId:crypto.randomUUID(), operations:[{kind:'base.set',selector:id,values:{rotation:25,scaleX:1.3,scaleY:.8}}] }); }, ids[1]); await ready(page);
  await select(page, [ids[0]]); const beforeNudge = await source(page), r = (await rects(page, [ids[0]]))[0];
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Shift+ArrowRight'); await ready(page);
  const moved = (await rects(page, [ids[0]]))[0]; expect(Math.abs(moved.x-r.x-10)).toBeLessThan(.01); expect(Math.abs(moved.y-r.y)).toBeLessThan(.01);
  await undo(page); expect(await source(page)).toEqual(beforeNudge);
  await select(page, ids); const before = await source(page);
  await page.getByRole('button', {name:'Align left',exact:true}).click(); await ready(page);
  const left = await rects(page, ids); expect(Math.max(...left.map(r=>r.x))-Math.min(...left.map(r=>r.x))).toBeLessThan(.12);
  await undo(page); expect(await source(page)).toEqual(before);
  const initial = await rects(page, ids);
  await page.getByRole('button', {name:'Distribute vertically',exact:true}).click(); await ready(page);
  const vertical = await rects(page,ids), sorted = vertical.toSorted((a,b)=>a.y-b.y), originals = initial.toSorted((a,b)=>a.y-b.y);
  expect(Math.abs(sorted[1].y-sorted[0].y-sorted[0].height-(sorted[2].y-sorted[1].y-sorted[1].height))).toBeLessThan(.12);
  expect(sorted[0]).toEqual(originals[0]); expect(sorted[2]).toEqual(originals[2]);
  expect((await source(page)).js).toBe(before.js); expect((await source(page)).assets).toEqual(before.assets);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('imported SVG and Pen geometry align as artwork, with identity and sibling preservation', async ({ page }) => {
  await open(page,'svg');
  await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<g transform="translate(210 90) rotate(25) scale(1.4 .7)"><rect id="arrange-a" x="0" y="0" width="90" height="60" fill="orange"/><path id="arrange-b" d="M180 80 L260 80 L240 140 Z" fill="red"/></g></svg>')});
  }); await ready(page); await select(page,['#arrange-a','#arrange-b']); const before = await source(page);
  await page.getByRole('button',{name:'Align top',exact:true}).click(); await ready(page);
  const r = await rects(page,['#arrange-a','#arrange-b']); expect(Math.abs(r[0].y-r[1].y)).toBeLessThan(.12);
  expect((await source(page)).html).toBe(before.html); expect((await source(page)).js).toBe(before.js);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('mixed animated and base movement keys only its armed channel at the playhead', async ({ page }) => {
  await open(page); const ids = await create(page);
  await page.evaluate(async id => {
    const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'animation.key',selector:id,property:'x',step:0,time:0,value:0,action:'set'}]});
  },ids[0]); await ready(page);
  const ruler=page.getByTestId('foundation-ruler'); await ruler.focus(); await ruler.press('Home'); await ready(page); await ruler.press('Shift+ArrowRight'); await ready(page);
  await select(page,ids.slice(0,2)); const before=await source(page), initial=await rects(page,ids.slice(0,2));
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Shift+ArrowRight'); await ready(page);
  const after=await source(page), r=await rects(page,ids.slice(0,2)); r.forEach((r,i)=>expect(r.x-initial[i].x).toBeCloseTo(10,1));
  const motion=await page.evaluate(async ({before,after,id})=>{
    const {parseAnimData}=await import('/src/blocks/animData.ts');
    return {before:parseAnimData(before.js)!.steps[0].layers[id],after:parseAnimData(after.js)!.steps[0].layers[id]};
  },{before,after,id:ids[0]});
  expect(motion.after.x).toHaveLength(2); expect(motion.after.x[0]).toEqual(motion.before.x[0]); expect(motion.after.y).toBeUndefined();
  expect(motion.after.x[1].time).toBeGreaterThan(0); expect(after.css).not.toBe(before.css);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('keyboard text-box resizing reflows without scaling type or moving the pivot', async ({ page }) => {
  await open(page);
  const id=await page.evaluate(async ()=>{
    const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'layer.create',geometry:{shape:'text',x:300,y:-450,width:300,height:120,box:true}}]}).changedTargets[0];
  }); await ready(page); await select(page,[id]); const before=await source(page);
  const properties=await page.evaluate(async ({id,before})=>{
    const {baseValues}=await import('/src/blocks/baseEdits.ts'); return baseValues(before,id).target;
  },{id,before});
  const f=(await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const style=await f.locator(id).evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontSize,scale:s.scale};});
  const r=(await rects(page,[properties]))[0], pivot=await page.locator('[data-anchor]').getAttribute('transform');
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Control+Shift+ArrowLeft'); await ready(page);
  const resized=(await rects(page,[properties]))[0]; expect(resized.width).toBeCloseTo(r.width-10,1); expect(await page.locator('[data-anchor]').getAttribute('transform')).toBe(pivot);
  expect(await f.locator(id).evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontSize,scale:s.scale};})).toEqual(style);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('focus guards preserve input editing, timeline arrows and Pen drafting', async ({ page }) => {
  await open(page); const ids=await create(page); await select(page,[ids[0]]); const before=await source(page);
  const input=page.locator('.ef-animation-properties').getByRole('textbox',{name:'Position X',exact:true});
  await input.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Control+ArrowLeft'); expect(await source(page)).toEqual(before);
  const ruler=page.getByTestId('foundation-ruler'); await ruler.focus(); const t=Number(await ruler.getAttribute('aria-valuenow')); await ruler.press('ArrowRight'); await ready(page);
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(t); expect(await source(page)).toEqual(before);
  await select(page,['#f0']);
  const textBounds=(await page.locator('.ef-selection rect').boundingBox())!;
  await page.mouse.dblclick(textBounds.x+textBounds.width/2,textBounds.y+textBounds.height/2);
  const inline=page.locator('.ef-inline-text textarea'); await expect(inline).toBeFocused();
  await inline.fill('Keyboard ownership');await inline.press('Home');await inline.press('ArrowRight');
  expect(await inline.evaluate(el=>(el as HTMLTextAreaElement).selectionStart)).toBe(1);expect(await source(page)).toEqual(before);
  await inline.press('Control+ArrowRight');expect(await source(page)).toEqual(before);await inline.press('Escape');
  await select(page,[ids[0]]);await page.getByRole('button',{name:'pen tool',exact:true}).click();
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');
  expect(await source(page)).toEqual(before);await expect(page.locator('.ef-arrangement-error')).toHaveCount(0);
  const b=(await page.getByTestId('foundation-canvas').boundingBox())!; await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
  await expect(page.locator('[data-pen-point]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Control+ArrowDown'); expect(await source(page)).toEqual(before); await expect(page.locator('.ef-arrangement-error')).toHaveCount(0); await expect(page.locator('[data-pen-point]')).toHaveCount(1);
  await page.keyboard.press('Escape'); expect(await source(page)).toEqual(before);
});

test('Escape, blur and stale source cancel a held key and later repeats stay quiet', async ({ page }) => {
  await open(page); const ids=await create(page); await select(page,[ids[0]]);
  for(const exit of ['Escape','blur','window','source','asset','sample','selection','playhead']){
    await select(page,[ids[0]]); const before=await source(page);
    await page.getByTestId('foundation-canvas').focus(); await page.keyboard.down('ArrowRight'); await holdKeyRepeats(page,2,'ArrowRight','ArrowRight');
    if(exit==='Escape') await page.keyboard.press('Escape');
    else if(exit==='blur') await page.getByRole('button',{name:'Align left',exact:true}).focus();
    else if(exit==='window') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else if(exit==='asset') await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,assets:[...s.template.assets,{path:'notes.txt',data:'data:text/plain;base64,YQ=='}]});});
    else if(exit==='sample') await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSampleValue('f0','Sample changed while held'));
    else if(exit==='source') await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,css:s.template.css+'\n/* external edit */'});});
    else if(exit==='selection') await select(page,[ids[1]]);
    else { const ruler=page.getByTestId('foundation-ruler'); await ruler.focus(); await ruler.press('ArrowRight'); }
    if(exit==='source') await expect(page.locator('.ef-arrangement-error')).toContainText('Release the arrows');
    const changed=await source(page); await page.getByTestId('foundation-canvas').focus(); await holdKeyRepeats(page,2,'ArrowRight','ArrowRight'); await page.keyboard.up('ArrowRight'); await ready(page);
    expect(await source(page)).toEqual(changed);
    if(!['source','asset'].includes(exit)) expect(changed).toEqual(before);
  }
});

test('mixed unsupported selection and collapsed parent refuse without partial source changes', async ({ page })=>{
  await open(page); const ids=await create(page);
  await page.evaluate(async id=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,css:s.template.css+'\n'+id+' { translate:20px 0; }'});},ids[1]);await ready(page);await select(page,ids);
  const before=await source(page);await page.getByRole('button',{name:'Align left',exact:true}).click();
  await expect(page.locator('.ef-arrangement-error')).toContainText('CSS translate');expect(await source(page)).toEqual(before);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');expect(await source(page)).toEqual(before);
  await expect(page.locator('.ef-arrangement-error')).toContainText('CSS translate');
  await page.evaluate(async id=>{
    const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),node='<div id="'+id.slice(1)+'" data-gfx></div>';
    s.applyTemplate({...s.template,html:s.template.html.replace(node,'<div style="position:absolute;scale:0">'+node+'</div>')});
  },ids[0]);await ready(page);await select(page,[ids[0]]);const collapsed=await source(page);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ef-arrangement-error')).toContainText('singular');expect(await source(page)).toEqual(collapsed);
});

test('template search, UI-created artwork, save/reopen and executed exports at desktop and laptop sizes', async ({ page })=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1920,height:1080});await page.goto('/app#/new');await page.locator('[data-entry="template"]').click();await pickDesign(page,'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();await page.getByTestId('wz-finish-edit-artwork').click();await ready(page);
  const ids:string[]=[];
  const screen=async(x:number,y:number)=>{const t=await source(page),b=(await page.locator('.ef-artboard').boundingBox())!;return{x:b.x+x/t.resolution.width*b.width,y:b.y+y/t.resolution.height*b.height};};
  const point=async(x:number,y:number)=>{const p=await screen(x,y);await page.mouse.click(p.x,p.y);};
  for(const [x,y,w,h] of [[320,280,100,70],[650,400,150,90]]){
    await page.getByRole('button',{name:'rectangle tool',exact:true}).click();
    const a=await screen(x,y),b=await screen(x+w,y+h);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();await ready(page);
    ids.push((await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts))[0]);
  }
  await page.getByRole('button',{name:'pen tool',exact:true}).click();await point(950,550);await point(1070,550);await point(1010,630);await point(950,550);await ready(page);
  ids.push((await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts))[0]);
  for(const [i,id] of ids.entries())await page.locator('.ef-track[data-selector="'+id+'"] .ef-layer').click(i?{modifiers:['Control']}:{});
  await page.getByRole('button',{name:'Align left',exact:true}).click();await ready(page);
  await page.getByRole('button',{name:'Distribute vertically',exact:true}).click();await ready(page);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await ready(page);
  const beforeSave=await source(page);
  await page.screenshot({path:'docs/research/editor-r1-2b-5/desktop.png',fullPage:true});
  for(const [width,height,label] of [[1366,768,'laptop'],[1093,614,'laptop-125']] as const){
    await page.setViewportSize({width,height});await expect(page.getByRole('button',{name:'Distribute vertically',exact:true})).toBeVisible();
    expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(100);
    await page.screenshot({path:'docs/research/editor-r1-2b-5/'+label+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.getByTestId('save-graphic').click();await page.getByTestId('save-name').fill('Arranged Hairline');await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');await settleDurableWrites(page);await page.reload();await ready(page);
  const reopened=await source(page);expect(reopened.html).toBe(beforeSave.html);expect(reopened.css).toBe(beforeSave.css);
  const motions=await page.evaluate(async js=>{const {parseAnimData}=await import('/src/blocks/animData.ts');return js.map(parseAnimData);},[beforeSave.js,reopened.js]);expect(motions[1]).toEqual(motions[0]);
  const authored=await rects(page,ids);
  for(const target of ['spx','casparcg','ograf']){
    const files=await page.evaluate(async target=>{
      const t=(await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip=await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t=>t.id===target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n=>!zip.files[n].dir).map(async n=>[n.slice(n.indexOf('/')+1),await zip.file(n)!.async('base64')])));
    },target);
    const output=await page.context().newPage(),exportErrors:string[]=[];output.on('pageerror',e=>exportErrors.push(e.message));await output.setViewportSize({width:1920,height:1080});
    await output.route('http://arrangement-output.local/**',route=>{
      const name=new URL(route.request().url()).pathname.slice(1),content=files[name];
      return content?route.fulfill({status:200,contentType:/\.m?js$/.test(name)?'application/javascript':/\.html$/.test(name)?'text/html':/\.css$/.test(name)?'text/css':'application/octet-stream',body:Buffer.from(content,'base64')}):route.fulfill({status:name?404:200,contentType:'text/html',body:'<html><body></body></html>'});
    });
    if(target==='ograf'){
      await output.goto('http://arrangement-output.local/');
      await output.evaluate(async()=>{document.body.style.margin='0'; const mod=await import('http://arrangement-output.local/graphic.mjs');customElements.define('arranged-graphic',mod.default);const el=document.createElement('arranged-graphic') as HTMLElement & {load(p:unknown):Promise<unknown>;playAction(p:unknown):Promise<unknown>};document.body.appendChild(el);await el.load({data:{}});await el.playAction({});});
    }else{await output.goto('http://arrangement-output.local/'+Object.keys(files).find(n=>n.endsWith('.html')&&!n.includes('controlpanel')));await output.evaluate(()=>(window as unknown as {play():void}).play());}
    await expect.poll(()=>output.locator(ids[0]).evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    // Wait for the entrance to settle at its authored hold before comparing exported world coordinates.
    for(const [i,id] of ids.entries())await expect.poll(()=>output.locator(id).evaluate(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,r.width,r.height];})).toEqual([authored[i].x,authored[i].y,authored[i].width,authored[i].height]);
    expect(exportErrors).toEqual([]);await output.close();
  }
  expect(errors).toEqual([]);
});

test('animated resize preserves its earlier scale key and refuses shared-axis conflicts', async ({page})=>{
  await open(page);const ids=await create(page);
  await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'animation.key',selector:id,step:0,property:'scaleX',time:0,value:1,action:'set'}]});},ids[0]);await ready(page);
  const ruler=page.getByTestId('foundation-ruler');await ruler.focus();await ruler.press('Home');await ready(page);await ruler.press('Shift+ArrowRight');await ready(page);await select(page,[ids[0]]);
  const before=await source(page),r=(await rects(page,[ids[0]]))[0];
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+Shift+ArrowRight');await ready(page);
  const next=await source(page),resized=(await rects(page,[ids[0]]))[0];expect(Math.abs(resized.width-r.width-10)).toBeLessThan(.12);
  const keys=await page.evaluate(async({id,js})=>(await import('/src/blocks/animData.ts')).parseAnimData(js)!.steps[0].layers[id].scaleX,{id:ids[0],js:next.js});expect(keys).toHaveLength(2);expect(keys[0]).toEqual({time:0,value:1});
  await undo(page);expect(await source(page)).toEqual(before);
  await page.evaluate(async id=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();const {parseAnimData,spliceAnimData}=await import('/src/blocks/animData.ts');const data=parseAnimData(s.template.js)!;data.steps[0].layers[id]={scale:[{time:0,value:1}]};s.applyTemplate({...s.template,js:spliceAnimData(s.template.js,data)!});},ids[0]);await ready(page);await select(page,[ids[0]]);const shared=await source(page);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+ArrowRight');
  await expect(page.locator('.ef-arrangement-error')).toContainText('share one scale track');expect(await source(page)).toEqual(shared);
});

test('parent-child selection refuses and no-op alignment adds no history', async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<g id="arrangement-group"><rect id="arrangement-child" width="70" height="40" fill="orange"/></g></svg>')});});await ready(page);
  await select(page,['#arrangement-group','#arrangement-child']);const before=await source(page);await page.getByRole('button',{name:'Align left',exact:true}).click();await expect(page.locator('.ef-arrangement-error')).toContainText('contains');expect(await source(page)).toEqual(before);
  await select(page,['#arrangement-child']);await page.getByRole('button',{name:'Align left',exact:true}).click();await ready(page);const aligned=await source(page);
  await page.getByRole('button',{name:'Align left',exact:true}).click();await ready(page);expect(await source(page)).toEqual(aligned);
  await undo(page);expect(await source(page)).toEqual(before);
});

test('keyboard resize refuses collapsing any member of a mixed selection', async({page})=>{
  await open(page);const ids=await create(page);await select(page,ids.slice(0,2));
  for(let i=0;i<7;i++){await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+Shift+ArrowLeft');await ready(page);}
  const before=await source(page);await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+Shift+ArrowLeft');
  await expect(page.locator('.ef-arrangement-error')).toContainText('collapse');expect(await source(page)).toEqual(before);
});

test('one-pixel keyboard resize remains precise on a wide layer', async({page})=>{
  await open(page);const id=await page.evaluate(async()=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();return s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'layer.create',geometry:{shape:'rectangle',x:100,y:-300,width:1600,height:100}}]}).changedTargets[0];});await ready(page);await select(page,[id]);
  const before=await source(page),r=(await rects(page,[id]))[0];await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+ArrowRight');await ready(page);
  const resized=(await rects(page,[id]))[0];expect(Math.abs(resized.width-r.width-1)).toBeLessThan(.05);
  await undo(page);expect(await source(page)).toEqual(before);
});

test('an anonymous imported path gains identity only on committed alignment', async({page})=>{
  await open(page,'svg');const anonymous=await page.evaluate(async()=>{
    const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();const html=s.template.html.replace('</svg>','<path data-arrangement="anonymous" d="M600 60 L680 60 L640 120 Z" fill="orange"/><rect id="named-arrangement" x="450" y="200" width="80" height="40" fill="red"/></svg>');
    s.applyTemplate({...s.template,html});const doc=new DOMParser().parseFromString(html,'text/html');return (await import('/src/model/structure.ts')).getTemplateParts(html,s.template.fields,true).find(p=>doc.querySelector(p.selector)?.getAttribute('data-arrangement')==='anonymous')!.selector;
  });await ready(page);expect(anonymous).toContain('body:nth-of-type(');await select(page,[anonymous,'#named-arrangement']);const before=await source(page);
  await page.getByRole('button',{name:'Align left',exact:true}).click();await ready(page);
  const selected=await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);expect(selected[0]).toMatch(/^#/);
  const r=await rects(page,selected);expect(Math.abs(r[0].x-r[1].x)).toBeLessThan(.12);const edited=await source(page);expect(edited.fields).toEqual(before.fields);expect(edited.assets).toEqual(before.assets);expect(edited.js).toBe(before.js);
  await undo(page);expect(await source(page)).toEqual(before);await page.getByRole('button',{name:'Redo',exact:true}).click();await ready(page);expect(await source(page)).toEqual(edited);
});
test('imported image keyboard transforms preserve its asset and siblings',async({page})=>{
  await open(page,'svg');await select(page,['#Crest']);const before=await source(page),r=(await rects(page,['#Crest']))[0];
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page);
  expect((await rects(page,['#Crest']))[0].x-r.x).toBeCloseTo(1,1);await undo(page);expect(await source(page)).toEqual(before);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+ArrowRight');await ready(page);
  expect((await rects(page,['#Crest']))[0].width-r.width).toBeCloseTo(1,1);expect((await source(page)).assets).toEqual(before.assets);expect((await source(page)).js).toBe(before.js);await undo(page);expect(await source(page)).toEqual(before);
});

test('own SVG transform resizes in local axes or specifically refuses without changing source',async({page})=>{
  await open(page,'svg');await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="turned-import" x="400" y="150" width="140" height="70" transform="rotate(25 470 185)" fill="orange"/></svg>')});});await ready(page);await select(page,['#turned-import']);
  const before=await source(page),f=(await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const sides=()=>f.locator('#turned-import').evaluate(el=>{const m=(el as SVGGraphicsElement).getScreenCTM()!,b=(el as SVGGraphicsElement).getBBox();return {width:Math.hypot(m.a,m.b)*b.width,height:Math.hypot(m.c,m.d)*b.height};});
  const initial=await sides();await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+ArrowRight');await ready(page);
  if(await page.locator('.ef-arrangement-error').count()){
    await expect(page.locator('.ef-arrangement-error')).toContainText('local axes');expect(await source(page)).toEqual(before);
  }else{
    const changed=await sides();expect(Math.abs(changed.width-initial.width-1)).toBeLessThan(.05);expect(Math.abs(changed.height-initial.height)).toBeLessThan(.05);await undo(page);expect(await source(page)).toEqual(before);
  }
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page);expect((await source(page)).html).toBe(before.html);await undo(page);expect(await source(page)).toEqual(before);
});

for(const transform of ['rotate(25deg)','translate(20px,10px)']) test('own CSS transform resizes in local axes or specifically refuses without changing source: '+transform,async({page})=>{
  await open(page);const id=(await create(page))[0];await page.evaluate(async ({id,transform})=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,css:s.template.css+'\n'+id+' {transform:'+transform+'}'});},{id,transform});await ready(page);await select(page,[id]);const before=await source(page);
  const f=(await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const sides=()=>f.locator(id).evaluate(el=>{const s=getComputedStyle(el),scale=s.scale==='none'?[1,1]:s.scale.split(' ').map(Number),m=new DOMMatrix().scale(scale[0],scale[1]??scale[0]).multiply(new DOMMatrix(s.transform==='none'?undefined:s.transform));return {width:Math.hypot(m.a,m.b)*parseFloat(s.width),height:Math.hypot(m.c,m.d)*parseFloat(s.height)};});
  const initial=await sides(),pivot=await page.locator('[data-anchor]').getAttribute('transform');await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Control+ArrowRight');await ready(page);
  if(await page.locator('.ef-arrangement-error').count()){
    await expect(page.locator('.ef-arrangement-error')).toContainText('local axes');expect(await source(page)).toEqual(before);
  }else{
    const changed=await sides();expect(Math.abs(changed.width-initial.width-1)).toBeLessThan(.05);expect(Math.abs(changed.height-initial.height)).toBeLessThan(.05);expect(await page.locator('[data-anchor]').getAttribute('transform')).toBe(pivot);await undo(page);expect(await source(page)).toEqual(before);
  }
});

test('one composition pixel remains exact with normalized SVG coordinates',async({page})=>{
  await open(page,'svg');await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<g transform="translate(400 150) scale(2000)"><rect id="normalized-art" x=".001" y=".001" width=".04" height=".04" fill="orange"/></g></svg>')});});await ready(page);await select(page,['#normalized-art']);const before=await source(page),initial=(await rects(page,['#normalized-art']))[0];
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page);
  const moved=(await rects(page,['#normalized-art']))[0];expect(Math.abs(moved.x-initial.x-1)).toBeLessThan(.01);expect(Math.abs(moved.y-initial.y)).toBeLessThan(.01);await undo(page);expect(await source(page)).toEqual(before);
});
