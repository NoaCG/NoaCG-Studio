// covers: src/components/AssetsPanel.tsx, src/components/editorFoundation/**, src/blocks/{editorGroups,baseEdits,editorAnimation,artworkLayers}.ts, src/model/structure.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SpxTemplate } from '../src/model/types';
import {holdKeyRepeats} from './_keys';
import {pickDesign} from './_browse';
import {settleDurableWrites} from './_durable';

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
    return s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [
      { kind: 'layer.create', geometry: { shape: 'rectangle', x: 220, y: -390, width: 100, height: 80 } },
      { kind: 'layer.create', geometry: { shape: 'ellipse', x: 370, y: -340, width: 130, height: 60 } },
      { kind: 'layer.create', geometry: { shape: 'rectangle', x: 600, y: -240, width: 70, height: 100 } },
    ] }).changedTargets;
  }); await ready(page); return ids;
}
async function select(page: Page, ids: string[]) {
  await page.evaluate(async ids => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSelectedParts(ids), ids); await ready(page);
}
async function rects(page: Page, ids: string[]) {
  const f = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  return Promise.all(ids.map(id => f.locator(id).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })));
}
async function group(page: Page, ids: string[]) {
  await select(page, ids); await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts[0]);
}
async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }

test('baseline probe: imported hierarchy and missing group controls', async ({ page }) => {
  await open(page, 'svg');
  const before = await source(page);
  const parts = await page.evaluate(async t => (await import('/src/model/structure.ts')).getTemplateParts(t.html, t.fields, true), before);
  expect(parts.length).toBeGreaterThan(4);
  await select(page, [parts[parts.length - 1].selector]);
  console.log({ nestedParts: parts.length, group: await page.getByRole('button', { name: 'Group selection', exact: true }).count(), breadcrumbs: await page.getByRole('navigation', { name: 'Group breadcrumbs' }).count() });
  expect(await source(page)).toEqual(before);
});

test('group and ungroup preserve child pose, identities, fields and one undo', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, ids.slice(0, 2));
  const before = await source(page), initial = await rects(page, ids);
  const id = await group(page, ids.slice(0, 2));
  expect(id).not.toBe(ids[0]); expect(await rects(page, ids)).toEqual(initial);
  const grouped = await source(page); expect(grouped.fields).toEqual(before.fields); expect(grouped.assets).toEqual(before.assets); expect(grouped.js).toBe(before.js);
  await undo(page); expect(await source(page)).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(grouped);
  await page.getByRole('button', { name: 'Ungroup selection', exact: true }).click(); await ready(page);
  expect(await rects(page, ids)).toEqual(initial);
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual(ids.slice(0, 2));
  await undo(page); expect(await source(page)).toEqual(grouped);
});

test('a selected group moves every member by composition pixels and cancels as one gesture', async ({ page }) => {
  await open(page); const ids = await create(page); const id = await group(page, ids.slice(0, 2));
  const before = await source(page), initial = await rects(page, ids);
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Shift+ArrowRight'); await ready(page);
  const moved = await rects(page, ids); expect(moved[0].x - initial[0].x).toBeCloseTo(10, 2); expect(moved[1].x - initial[1].x).toBeCloseTo(10, 2); expect(moved[2]).toEqual(initial[2]);
  await undo(page); expect(await source(page)).toEqual(before);
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.down('ArrowDown'); await page.keyboard.press('Escape'); await page.keyboard.up('ArrowDown'); await ready(page);
  expect(await source(page)).toEqual(before); await select(page, [id]);
});

test('group editing exposes parent bar, local ruler and breadcrumb without hiding canvas', async ({ page }) => {
  await open(page); const ids = await create(page); const id = await group(page, ids.slice(0, 2));
  const before = await source(page);
  await page.getByRole('button', { name: 'Enter group', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Group breadcrumbs' })).toBeVisible();
  await expect(page.getByTestId('foundation-local-ruler')).toBeVisible();
  await expect(page.getByTestId('foundation-parent-bar')).toHaveAttribute('data-selector', id);
  await expect(page.getByTestId('foundation-canvas')).toBeVisible();
  await expect(page.locator(`.ef-track[data-selector="${ids[2]}"]`)).toHaveCount(0);
  await expect(page.locator(`.ef-track[data-selector="${ids[0]}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await expect(page.getByTestId('foundation-local-ruler')).toHaveCount(0); expect(await source(page)).toEqual(before);
});

test('noncontiguous selection refuses with source and history unchanged', async ({ page }) => {
  await open(page); const ids = await create(page); await select(page, [ids[0], ids[2]]);
  const before = await source(page);
  await page.getByRole('button', { name: 'Group selection', exact: true }).click();
  await expect(page.locator('.ef-group-error')).toContainText('contiguous'); expect(await source(page)).toEqual(before);
});


async function seek(page: Page, time: number) {
  const ruler = page.getByTestId('foundation-ruler'), extent = Number(await ruler.getAttribute('data-extent'));
  const r = (await ruler.boundingBox())!; await page.mouse.click(r.x + time / extent * r.width, r.y + 10); await ready(page);
}
async function key(page: Page, selector: string, property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', time: number, value: number) {
  await page.evaluate(async ({selector,property,time,value}) => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'animation.key',selector,property,step:0,time,value,action:'set'}]});
  },{selector,property,time,value}); await ready(page);
}
function nearRects(actual: Awaited<ReturnType<typeof rects>>, expected: Awaited<ReturnType<typeof rects>>, tolerance = .03) {
  actual.forEach((r,index) => { for (const axis of ['x','y','width','height'] as const) expect(Math.abs(r[axis]-expected[index][axis]),axis+' member '+index).toBeLessThan(tolerance); });
}

test('group transform and centered pivot preserve child offsets and ungrouped appearance', async ({page}) => {
  await open(page); const ids=await create(page), id=await group(page,ids.slice(0,2)), before=await source(page);
  const anchor=page.getByRole('textbox',{name:'Anchor X',exact:true}); await expect(anchor).toHaveValue('140');
  await expect(page.getByRole('textbox',{name:'Anchor Y',exact:true})).toHaveValue('55');
  for(const [label,value] of [['Rotation','27'],['Scale X %','125']] as const){
    const input=page.getByRole('textbox',{name:label,exact:true}); await input.fill(value); await input.press('Enter'); await ready(page);
  }
  const transformed=await source(page), pose=await rects(page,ids);
  expect(transformed.html).toBe(before.html);expect(transformed.js).toBe(before.js);
  const base=await page.evaluate(async({t,id}) => (await import('/src/blocks/baseEdits.ts')).baseValues(t,id),{t:transformed,id});
  expect(base.groupFrame!.x).toBeCloseTo(220,5);expect(base.groupFrame!.y).toBeCloseTo(-390,5);
  await anchor.fill('100');await anchor.press('Enter');await ready(page);
  const next=await page.evaluate(async({t,id}) => (await import('/src/blocks/baseEdits.ts')).baseValues(t,id),{t:await source(page),id});
  expect(next.x).toBe(base.x);expect(next.y).toBe(base.y);await undo(page);expect(await source(page)).toEqual(transformed);
  await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);nearRects(await rects(page,ids),pose);
  const ungrouped=await source(page);expect(ungrouped.html).toContain('data-noacg-carrier');
  expect(ungrouped.fields).toEqual(before.fields);expect(ungrouped.assets).toEqual(before.assets);
  await select(page,[ids[0]]);await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await ready(page);
  const moved=await rects(page,ids);expect(moved[0].x-pose[0].x).toBeCloseTo(10,2);nearRects(moved.slice(1),pose.slice(1));
});

test('independent child and group motion survive ungroup and repeated cue seeks',async({page})=>{
  await open(page);const ids=await create(page);
  await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);await key(page,ids[1],'rotation',0,0);await key(page,ids[1],'rotation',.4,30);
  const prior=await source(page),initial=await rects(page,ids);const id=await group(page,ids.slice(0,2));nearRects(await rects(page,ids),initial);
  expect((await source(page)).js).toBe(prior.js);
  await key(page,id,'x',0,0);await key(page,id,'x',.4,80);await key(page,id,'scaleX',0,1);await key(page,id,'scaleX',.4,1.4);
  const times=[0,.2,.4,.1,0], poses=[];
  for(const time of times){await seek(page,time);poses.push(await rects(page,ids));}
  await select(page,[id]);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);
  for(let i=0;i<times.length;i++){await seek(page,times[i]);nearRects(await rects(page,ids),poses[i]);}
  const motion=await page.evaluate(async t=>(await import('/src/blocks/animData.ts')).parseAnimData(t.js),await source(page));
  const original=await page.evaluate(async t=>(await import('/src/blocks/animData.ts')).parseAnimData(t.js),prior);
  expect(motion!.steps[0].layers[ids[0]]).toEqual(original!.steps[0].layers[ids[0]]);expect(motion!.steps[0].layers[ids[1]]).toEqual(original!.steps[0].layers[ids[1]]);
});

test('nested group navigation and transformed-parent nudge preserve fine world geometry',async({page})=>{
  await open(page);const ids=await create(page),inner=await group(page,ids.slice(0,2));
  const outer=await group(page,[inner,ids[2]]);
  await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'base.set',selector:id,values:{rotation:31,scaleX:2.718281828,scaleY:.713957371}}]});},outer);await ready(page);
  await page.getByRole('button',{name:'Enter group',exact:true}).click();await select(page,[inner]);
  const before=await source(page),pose=await rects(page,ids);await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await ready(page);
  const moved=await rects(page,ids);for(const i of[0,1]){expect(Math.abs(moved[i].x-pose[i].x-10)).toBeLessThan(.01);expect(Math.abs(moved[i].y-pose[i].y)).toBeLessThan(.01);}nearRects(moved.slice(2),pose.slice(2));
  await undo(page);expect(await source(page)).toEqual(before);
  await page.getByRole('button',{name:'Enter group',exact:true}).click();await expect(page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button')).toHaveCount(3);
  await expect(page.getByTestId('foundation-parent-bar')).toHaveAttribute('data-selector',inner);
  await expect(page.locator(`.ef-track[data-selector="${ids[2]}"]`)).toHaveCount(0);
  await page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button',{name:'Group 2',exact:true}).click();await expect(page.getByTestId('foundation-parent-bar')).toHaveAttribute('data-selector',outer);
});

test('SVG members under a rotated scaled parent group and ungroup without jumps',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<g id="source-parent" transform="translate(210 90) rotate(25) scale(1.4 .7)"><rect id="group-a" x="0" y="0" width="90" height="60" fill="orange"/><path id="group-b" d="M180 80 L260 80 L240 140 Z" fill="red"/></g></svg>')});});await ready(page);
  const ids=['#group-a','#group-b'],before=await source(page),pose=await rects(page,ids),id=await group(page,ids);nearRects(await rects(page,ids),pose);
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await ready(page);
  const moved=await rects(page,ids);moved.forEach((r,i)=>{expect(Math.abs(r.x-pose[i].x-10)).toBeLessThan(.01);expect(Math.abs(r.y-pose[i].y)).toBeLessThan(.01);});
  await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);nearRects(await rects(page,ids),moved);
  await undo(page);await select(page,[id]);await undo(page);await undo(page);expect(await source(page)).toEqual(before);
});

test('group parent bar moves child keys atomically and local time follows its visibility start',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));await key(page,ids[0],'x',.1,0);await key(page,ids[0],'x',.3,40);
  await page.evaluate(async({id,ids})=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();const operations=[id,...ids.slice(0,2)].flatMap(selector=>[{kind:'layer.trim' as const,selector,step:0,interval:0,edge:'start' as const,time:.1},{kind:'layer.trim' as const,selector,step:0,interval:0,edge:'end' as const,time:.4}]);s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations});},{id,ids});await ready(page);
  await select(page,[id]);await page.getByRole('button',{name:'Enter group',exact:true}).click();const before=await source(page);
  const bar=page.getByTestId('foundation-parent-bar').getByRole('button',{name:'Move Group 1 span',exact:true}).first();await bar.focus();await bar.press('ArrowRight');await ready(page);
  const data=await page.evaluate(async t=>(await import('/src/blocks/animData.ts')).parseAnimData(t.js),await source(page));
  expect(data!.steps[0].layers[ids[0]].x[0].time).toBeCloseTo(.1+1/(await source(page)).fps,3);expect(data!.steps[0].layers[ids[0]].x[1].time-data!.steps[0].layers[ids[0]].x[0].time).toBeCloseTo(.2,3);
  const ruler=page.getByTestId('foundation-ruler');await ruler.press('Home');await ready(page);expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(0,5);
  expect(await source(page)).not.toEqual(before);await undo(page);expect(await source(page)).toEqual(before);
  await expect(page.getByRole('button',{name:'Add Step at playhead',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Set Out at playhead',exact:true})).toHaveCount(0);
});

test('stale group requests and unsupported batches leave source, selection and history unchanged',async({page})=>{
  await open(page);const ids=await create(page);await select(page,ids.slice(0,2));
  const result=await page.evaluate(async ids=>{
    const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(),expected=s.version();
    s.execute({documentId:s.documentId,expected,transactionId:crypto.randomUUID(),operations:[{kind:'base.set',selector:ids[2],values:{x:630}}]});
    const before=s.port.read(),selection=s.port.view().selectedParts,history=s.canUndo();let message='';
    try{s.execute({documentId:s.documentId,expected,transactionId:crypto.randomUUID(),operations:[{kind:'group.create',selectors:ids.slice(0,2),box:{x:220,y:-390,width:280,height:110}}]});}catch(cause){message=String(cause);}
    return{message,same:s.port.read()===before,selectionSame:JSON.stringify(s.port.view().selectedParts)===JSON.stringify(selection),historySame:s.canUndo()===history};
  },ids);expect(result.message).toContain('document changed');expect(result.same).toBe(true);expect(result.selectionSame).toBe(true);expect(result.historySame).toBe(true);
  const id=await group(page,ids.slice(0,2));
  await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'style.set',selector:id,values:{opacity:.5}}]});},id);await ready(page);
  const before=await source(page);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await expect(page.locator('.ef-group-error')).toContainText('composites opacity');expect(await source(page)).toEqual(before);
  await undo(page);expect((await source(page)).css).not.toBe(before.css);
});

test('structural selectors refuse grouping and mixed parents have no partial source write',async({page})=>{
  await open(page);const ids=await create(page);
  await page.evaluate(async id=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,css:s.template.css+'\n.lower-third > '+id+' { outline: 1px solid red; }'});},ids[0]);await ready(page);
  await select(page,ids.slice(0,2));const before=await source(page);await page.getByRole('button',{name:'Group selection',exact:true}).click();await expect(page.locator('.ef-group-error')).toContainText('structural selector');expect(await source(page)).toEqual(before);
});


test('text mask, field bindings and asset bytes survive transformed grouping and undo',async({page})=>{
  await open(page);
  const ids=await page.evaluate(async()=>{
    const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[
      {kind:'layer.create',geometry:{shape:'rectangle',x:180,y:-390,width:90,height:70}},
      {kind:'layer.create',geometry:{shape:'text',x:330,y:-340,width:250,height:70,box:true}},
    ]}).changedTargets;
  });await ready(page);
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,assets:[...s.template.assets,{path:'logo.svg',data:'data:image/svg+xml;base64,PHN2Zy8+'}]});});await ready(page);
  const before=await source(page),pose=await rects(page,ids),id=await group(page,ids);nearRects(await rects(page,ids),pose);
  await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'base.set',selector:id,values:{rotation:23,scaleX:1.4}}]});},id);await ready(page);
  const transformed=await source(page),moved=await rects(page,ids);
  await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);nearRects(await rects(page,ids),moved);
  const next=await source(page);expect(next.fields).toEqual(before.fields);expect(next.assets).toEqual(before.assets);expect(next.js).toBe(before.js);
  const f=(await(await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  expect(await f.locator(ids[1]).evaluate(el=>el.parentElement?.className)).toContain('mask');
  await undo(page);expect(await source(page)).toEqual(transformed);
});

test('group arrow gestures cancel on focus, source and assets; local ruler owns its arrows',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  for(const exit of ['Escape','blur','source','asset','selection']){
    await select(page,[id]);const before=await source(page);
    await page.getByTestId('foundation-canvas').focus();await page.keyboard.down('ArrowRight');await holdKeyRepeats(page,2,'ArrowRight','ArrowRight');
    if(exit==='Escape')await page.keyboard.press('Escape');
    else if(exit==='blur')await page.getByRole('button',{name:'Align left',exact:true}).focus();
    else if(exit==='selection')await select(page,[ids[2]]);
    else await page.evaluate(async exit=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate(exit==='source'?{...s.template,css:s.template.css+'\n/* changed while held */'}:{...s.template,assets:[...s.template.assets,{path:'notes.txt',data:'data:text/plain;base64,YQ=='}]});},exit);
    const changed=await source(page);await page.getByTestId('foundation-canvas').focus();await holdKeyRepeats(page,2,'ArrowRight','ArrowRight');await page.keyboard.up('ArrowRight');await ready(page);expect(await source(page)).toEqual(changed);
    if(!['source','asset'].includes(exit))expect(changed).toEqual(before);
  }
  await select(page,[id]);await page.getByRole('button',{name:'Enter group',exact:true}).click();await select(page,[ids[0]]);
  const before=await source(page),input=page.locator('.ef-animation-properties').getByRole('textbox',{name:'Position X',exact:true});
  await input.focus();await input.press('ArrowRight');expect(await source(page)).toEqual(before);
  const ruler=page.getByTestId('foundation-ruler');const time=Number(await ruler.getAttribute('aria-valuenow'));await ruler.press('ArrowRight');await ready(page);expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(time);expect(await source(page)).toEqual(before);
});

test('mixed parents and parent/member selection refuse the complete operation batch',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  for(const selected of [[ids[0],ids[2]],[id,ids[0]]]){
    await select(page,selected);const before=await source(page);
    await page.getByRole('button',{name:'Group selection',exact:true}).click();await expect(page.locator('.ef-group-error')).toContainText(/same parent|selected parent|coordinate space/);expect(await source(page)).toEqual(before);
  }
});

test('template search, UI-created shapes and Pen, group and member motion, save/reopen and executed exports at desktop and laptop sizes', async ({ page })=>{
  test.setTimeout(120_000);
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
  await page.getByRole('button',{name:'pen tool',exact:true}).click();await point(950,550);await point(1070,550);await point(1010,630);await point(950,550);await page.keyboard.press('Enter');await ready(page);
  ids.push((await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts))[0]);
  for(const [i,id] of ids.entries())await page.locator('.ef-track[data-selector="'+id+'"] .ef-layer').click(i?{modifiers:['Control']}:{});

  await page.getByRole('button',{name:'Group selection',exact:true}).click();await ready(page);
  const groupId=(await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts))[0];
  await page.getByTestId('foundation-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await ready(page);
  await page.getByRole('button',{name:'Enter group',exact:true}).click();
  await page.locator('.ef-track[data-selector="'+ids[0]+'"] .ef-layer').click();
  const rotation=page.getByRole('textbox',{name:'Rotation',exact:true});await rotation.fill('27');await rotation.press('Enter');await ready(page);
  await page.getByRole('button',{name:'Enable Rotation animation',exact:true}).click();await ready(page);
  await page.getByTestId('foundation-ruler').press('Home');await ready(page);await rotation.fill('0');await rotation.press('Enter');await ready(page);
  await page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button',{name:'Composition',exact:true}).click();await select(page,[groupId]);
  await page.getByTestId('foundation-ruler').press('End');await ready(page);
  const scaleInput=page.getByRole('textbox',{name:'Scale X %',exact:true});await scaleInput.fill('115');await scaleInput.press('Enter');await ready(page);
  await page.getByRole('button',{name:'Enable Position X animation',exact:true}).click();await ready(page);
  await page.getByTestId('foundation-ruler').press('Home');await ready(page);
  const position=page.getByRole('textbox',{name:'Position X',exact:true});await position.fill('-40');await position.press('Enter');await ready(page);
  await page.getByTestId('foundation-ruler').press('End');await ready(page);
  await page.getByRole('button',{name:'Enter group',exact:true}).click();
  await expect(page.getByTestId('foundation-parent-bar')).toHaveAttribute('data-selector',groupId);
  await expect(page.getByTestId('foundation-local-ruler')).toBeVisible();
  const beforeSave=await source(page);
  await page.screenshot({path:'docs/research/editor-r1-2b-6/desktop.png',fullPage:true});
  for(const [width,height,label] of [[1366,768,'laptop'],[1093,614,'laptop-125']] as const){
    await page.setViewportSize({width,height});await expect(page.getByRole('button',{name:'Group selection',exact:true})).toBeVisible();
    expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
    const timeline=(await page.getByTestId('foundation-timeline').boundingBox())!,footer=(await page.locator('.ef-status').boundingBox())!;
    expect(timeline.y+timeline.height).toBeLessThanOrEqual(footer.y+1);
    const member=(await page.locator('.ef-track[data-selector="'+ids[0]+'"]').boundingBox())!,tracks=(await page.locator('.ef-track-scroll').boundingBox())!;
    expect(member.y+member.height).toBeLessThanOrEqual(tracks.y+tracks.height+1);
    await page.screenshot({path:'docs/research/editor-r1-2b-6/'+label+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.getByTestId('save-graphic').click();await page.getByTestId('save-name').fill('Grouped Hairline');await page.getByTestId('save-confirm').click();
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
    await output.route('http://groups-output.local/**',route=>{
      const name=new URL(route.request().url()).pathname.slice(1),content=files[name];
      return content?route.fulfill({status:200,contentType:/\.m?js$/.test(name)?'application/javascript':/\.html$/.test(name)?'text/html':/\.css$/.test(name)?'text/css':'application/octet-stream',body:Buffer.from(content,'base64')}):route.fulfill({status:name?404:200,contentType:'text/html',body:'<html><body></body></html>'});
    });
    if(target==='ograf'){
      await output.goto('http://groups-output.local/');
      await output.evaluate(async()=>{document.body.style.margin='0'; const mod=await import('http://groups-output.local/graphic.mjs');customElements.define('grouped-graphic',mod.default);const el=document.createElement('grouped-graphic') as HTMLElement & {load(p:unknown):Promise<unknown>;playAction(p:unknown):Promise<unknown>};document.body.appendChild(el);await el.load({data:{}});await el.playAction({});});
    }else{await output.goto('http://groups-output.local/'+Object.keys(files).find(n=>n.endsWith('.html')&&!n.includes('controlpanel')));await output.evaluate(()=>(window as unknown as {play():void}).play());}
    await expect.poll(()=>output.locator(ids[0]).evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    // Wait for the entrance to settle at its authored hold before comparing exported world coordinates.
    for(const [i,id] of ids.entries())await expect.poll(()=>output.locator(id).evaluate((el,expected)=>{const r=el.getBoundingClientRect();return Math.max(...[r.x,r.y,r.width,r.height].map((value,index)=>Math.abs(value-expected[index])));},[authored[i].x,authored[i].y,authored[i].width,authored[i].height])).toBeLessThan(.05);
    expect(exportErrors).toEqual([]);await output.close();
  }
  expect(errors).toEqual([]);
});


test('SVG group rotation and scale motion ungroup exactly at different poses',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="moving-a" x="180" y="90" width="90" height="60" fill="orange"/><path id="moving-b" d="M370 170 L450 170 L420 230 Z" fill="red"/></svg>')});});await ready(page);
  const ids=['#moving-a','#moving-b'],id=await group(page,ids);
  for(const [property,end]of [['rotation',35],['scaleX',1.4],['x',80]] as const){await key(page,id,property,0,property==='scaleX'?1:0);await key(page,id,property,.4,end);}
  const times=[0,.2,.4,0],poses=[];
  for(const time of times){await seek(page,time);poses.push(await rects(page,ids));}
  await select(page,[id]);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);
  for(let i=0;i<times.length;i++){await seek(page,times[i]);nearRects(await rects(page,ids),poses[i]);}
  const parts=await page.evaluate(async t=>(await import('/src/model/structure.ts')).getTemplateParts(t.html,t.fields,true),await source(page));
  expect(parts.some(part=>part.selector.startsWith('#group-carrier-'))).toBe(false);
});

test('group canvas transform is one undo and Escape or navigation cancels its draft',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2)),before=await source(page);
  const handle=page.locator('.ef-selection [data-handle="2"]');
  const begin=async()=>{const r=(await handle.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+35,r.y+r.height/2+17,{steps:5});};
  await begin();expect(await source(page)).toEqual(before);await page.keyboard.press('Escape');await page.mouse.up();await ready(page);expect(await source(page)).toEqual(before);
  await begin();await page.mouse.up();await ready(page);expect((await source(page)).css).not.toBe(before.css);await undo(page);expect(await source(page)).toEqual(before);
  await select(page,[id]);await begin();await page.getByRole('button',{name:'Enter group',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());await page.mouse.up();await ready(page);
  expect(await source(page)).toEqual(before);await expect(page.getByTestId('foundation-parent-bar')).toBeVisible();
  await expect(page.getByRole('button',{name:'rectangle tool',exact:true})).toBeDisabled();await expect(page.getByTestId('foundation-canvas')).toBeVisible();
});

test('painted pseudo-element selectors refuse without wrapping new artwork',async({page})=>{
  await open(page);const ids=await create(page);
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,css:s.template.css+'\n.lower-third > div::before {content:"";position:absolute;width:20px;height:20px;background:red;}'});});await ready(page);
  await select(page,ids.slice(0,2));const before=await source(page);await page.getByRole('button',{name:'Group selection',exact:true}).click();await expect(page.locator('.ef-group-error')).toContainText('structural selector');expect(await source(page)).toEqual(before);
});

test('ungroup refuses a group-owned outline without losing source or selection',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  await page.evaluate(async id=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();const {setCssDeclaration}=await import('/src/blocks/edit.ts');s.applyTemplate({...s.template,css:setCssDeclaration(s.template.css,id,'outline','5px solid red')});},id);await ready(page);
  const before=await source(page);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await expect(page.locator('.ef-group-error')).toContainText('outline');expect(await source(page)).toEqual(before);
  expect(await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual([id]);
});

test('SVG group pivot is centered and remains static during child and group motion',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="pivot-a" x="180" y="90" width="90" height="60" fill="orange"/><path id="pivot-b" d="M370 170 L450 170 L420 230 Z" fill="red"/></svg>')});});await ready(page);
  const ids=['#pivot-a','#pivot-b'],id=await group(page,ids),f=(await(await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  expect((await f.locator(id).getAttribute('data-svg-origin'))!.split(' ').map(Number)).toEqual([315,160]);
  const before=await source(page),pose=await rects(page,ids);
  const input=page.getByRole('textbox',{name:'Anchor X',exact:true});await input.fill('100');await input.press('Enter');await ready(page);
  expect((await f.locator(id).getAttribute('data-svg-origin'))!.split(' ').map(Number)).toEqual([280,160]);nearRects(await rects(page,ids),pose);await undo(page);expect(await source(page)).toEqual(before);
  await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);await key(page,id,'rotation',0,0);await key(page,id,'rotation',.4,35);
  const poses=[];for(const time of [0,.2,.4,0]){await seek(page,time);poses.push(await rects(page,ids));
    const expected=await f.locator(id).evaluate(el=>{const [x,y]=el.getAttribute('data-svg-origin')!.split(' ').map(Number),m=(el as SVGGraphicsElement).getScreenCTM()!;return [m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];});
    const actual=(await page.locator('.ef-selection [data-anchor]').getAttribute('transform'))!.match(/-?[\d.]+/g)!.map(Number);for(let i=0;i<2;i++)expect(Math.abs(actual[i]-expected[i])).toBeLessThan(.01);
  }
  await select(page,[id]);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);
  for(const[i,time]of [0,.2,.4,0].entries()){await seek(page,time);nearRects(await rects(page,ids),poses[i]);}
});

test('local parent trim keeps child motion and navigation cancels timeline drafts',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);
  const prior=await source(page),parse=async(t:Awaited<ReturnType<typeof source>>)=>page.evaluate(async js=>(await import('/src/blocks/animData.ts')).parseAnimData(js),t.js);
  await page.getByRole('button',{name:'Enter group',exact:true}).click();
  const trim=page.getByTestId('foundation-parent-bar').getByRole('button',{name:'Trim start Group 1 span',exact:true}).first();
  await trim.focus();await trim.press('ArrowRight');await ready(page);
  const trimmed=await parse(await source(page)),original=await parse(prior);
  expect(trimmed!.steps[0].layers[ids[0]]).toEqual(original!.steps[0].layers[ids[0]]);
  expect(trimmed!.steps.map(s=>[s.name,s.duration])).toEqual(original!.steps.map(s=>[s.name,s.duration]));
  expect(trimmed!.steps[0].spans![id][0].start).toBeCloseTo(.04,5);
  await undo(page);expect(await source(page)).toEqual(prior);
  const begin=async(locator:ReturnType<typeof page.locator>)=>{const r=(await locator.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+30,r.y+r.height/2,{steps:4});};
  const back=page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button',{name:'Composition',exact:true});
  await begin(page.getByTestId('foundation-parent-bar').getByRole('button',{name:'Move Group 1 span',exact:true}).first());
  await back.evaluate(el=>(el as HTMLButtonElement).click());await page.mouse.up();await ready(page);expect(await source(page)).toEqual(prior);
  await select(page,[id]);await page.getByRole('button',{name:'Enter group',exact:true}).click();
  await begin(page.locator('.ef-track[data-selector="'+ids[0]+'"] .ef-timeline-key').first());
  await back.evaluate(el=>(el as HTMLButtonElement).click());await page.mouse.up();await ready(page);expect(await source(page)).toEqual(prior);
  await expect(page.getByText('0 keys',{exact:true})).toBeVisible();
});

test('grouping existing SVG member motion refuses exactly beside its control',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="guard-a" x="180" y="90" width="90" height="60" fill="orange"/><rect id="guard-b" x="370" y="170" width="80" height="60" fill="red"/></svg>')});});await ready(page);
  const ids=['#guard-a','#guard-b'];await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);await select(page,ids);
  const before=await source(page);await page.getByRole('button',{name:'Group selection',exact:true}).click();
  await expect(page.locator('.ef-group-error')).toContainText('before authoring their motion');expect(await source(page)).toEqual(before);
  expect(await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual(ids);
});

test('SVG parent movement retains only owned static pivots and anchor refuses unknown data',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="time-a" x="180" y="90" width="90" height="60" fill="orange"/><rect id="time-b" x="370" y="170" width="80" height="60" fill="red"/></svg>')});});await ready(page);
  const id=await group(page,['#time-a','#time-b']);
  await page.evaluate(async()=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),{parseAnimData,locateAnimData}=await import('/src/blocks/animData.ts');const data=parseAnimData(store.template.js)!;for(const step of data.steps)step.layers['#time-a']={transformOrigin:[{time:0,value:'10px 10px'}]};const at=locateAnimData(store.template.js)!;store.applyTemplate({...store.template,js:store.template.js.slice(0,at.start)+JSON.stringify(data)+store.template.js.slice(at.end)});});await ready(page);
  await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'group.move',selector:id,step:0,delta:.4}]});},id);await ready(page);
  const moved=await page.evaluate(async js=>(await import('/src/blocks/animData.ts')).parseAnimData(js),(await source(page)).js);
  expect(moved!.steps[0].layers[id].transformOrigin[0].time).toBe(0);expect(moved!.steps[0].layers['#time-a'].transformOrigin[0].time).toBe(.4);
  await page.evaluate(async()=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),{locateAnimData}=await import('/src/blocks/animData.ts');const at=locateAnimData(store.template.js)!,data=JSON.parse(store.template.js.slice(at.start,at.end));data.futureGroupMetadata={keep:'exact'};store.applyTemplate({...store.template,js:store.template.js.slice(0,at.start)+JSON.stringify(data)+store.template.js.slice(at.end)});});await ready(page);
  const before=await source(page);
  const error=await page.evaluate(async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();try{s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'base.set',selector:id,values:{anchorX:100,anchorY:40}}]});return '';}catch(e){return String(e);}},id);
  expect(error).toContain('pivot initializer');expect(await source(page)).toEqual(before);
});

test('new wrapper inheritance refuses without changing member paint',async({page})=>{
  await open(page,'svg');
  await page.evaluate(async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="inherit-a" x="180" y="90" width="90" height="60" fill="currentColor"/><rect id="inherit-b" x="370" y="170" width="80" height="60" fill="currentColor"/></svg>'),css:s.template.css+'\ng {color:#ff0000;}'});});await ready(page);
  const ids=['#inherit-a','#inherit-b'];await select(page,ids);const before=await source(page);
  const frame=(await(await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const color=await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill);
  await page.getByRole('button',{name:'Group selection',exact:true}).click();await ready(page);
  expect(await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill)).toBe(color);
  await expect(page.locator('.ef-group-error')).toContainText('would style the new group');expect(await source(page)).toEqual(before);
  expect(await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill)).toBe(color);
});


test('new wrapper dynamic selector refuses without changing source',async({page})=>{
  await open(page);const ids=await create(page),before=await source(page);
  const result=await page.evaluate(async({before,ids})=>{
    const {locateAnimData}=await import('/src/blocks/animData.ts'),{applyOperations}=await import('/src/components/editorFoundation/operations.ts');
    const at=locateAnimData(before.js)!,data=JSON.parse(before.js.slice(at.start,at.end));
    data.steps[0].dynamics=[{time:0,build:'groupProbe',target:'div'}];
    const input={...before,js:before.js.slice(0,at.start)+JSON.stringify(data)+before.js.slice(at.end)},original=JSON.stringify(input);
    let error='';try{applyOperations(input,[{kind:'group.create',selectors:ids.slice(0,2),box:{x:220,y:-390,width:280,height:110}}]);}catch(e){error=String(e);}
    return{error,unchanged:JSON.stringify(input)===original};
  },{before,ids});
  expect(result.error).toContain('source animation selector');expect(result.unchanged).toBe(true);expect(await source(page)).toEqual(before);
});


test('member blending refuses transformed HTML ungroup without losing source',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  await page.evaluate(async({id,ids})=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),{setCssDeclaration}=await import('/src/blocks/edit.ts'),{editBase}=await import('/src/blocks/baseEdits.ts');store.applyTemplate(editBase({...store.template,css:setCssDeclaration(store.template.css,ids[0],'mix-blend-mode','multiply')},id,{rotation:25}));},{id,ids});await ready(page);
  const before=await source(page);await page.getByRole('button',{name:'Ungroup selection',exact:true}).click();await ready(page);
  await expect(page.locator('.ef-group-error')).toContainText('member blending');expect(await source(page)).toEqual(before);
  expect(await page.evaluate(async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual([id]);
});


test('Project placement respects local group scope and remains available in Composition',async({page})=>{
  await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  await page.evaluate(async()=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();store.applyTemplate({...store.template,assets:[...store.template.assets,{path:'scope.svg',data:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')}]});});await ready(page);
  await select(page,[id]);await page.getByRole('button',{name:'pen tool',exact:true}).click();
  await page.locator('.ef-enter-group').first().click();await ready(page);await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool','select');
  await page.getByRole('button',{name:/^Project/}).click();await page.locator('[data-testid="asset-row"][data-path="scope.svg"]').click();
  const place=page.getByRole('button',{name:'Place image',exact:true}),before=await source(page);
  await place.evaluate(el=>(el as HTMLButtonElement).click());await ready(page);
  expect(await source(page)).toEqual(before);await expect(place).toBeDisabled();await expect(page.getByText('Add artwork in Composition, then group it.',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button',{name:'Composition',exact:true}).click();await expect(place).toBeEnabled();
  await place.click();await expect.poll(async()=>(await source(page)).html).not.toBe(before.html);await ready(page);
  expect((await source(page)).assets).toEqual(before.assets);await undo(page);expect(await source(page)).toEqual(before);
});


for(const kind of ['group marker','carrier marker','frame attributes'])test('source wrapper rules refuse '+kind,async({page})=>{
  await open(page,'svg');
  await page.evaluate(async kind=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();store.applyTemplate({...store.template,html:store.template.html.replace('</svg>','<rect id="style-a" x="180" y="90" width="90" height="60" fill="currentColor"/><rect id="style-b" x="370" y="170" width="80" height="60" fill="currentColor"/></svg>'),css:store.template.css+(kind==='frame attributes'?'\n[data-group-width]{color:red}':'')});},kind);await ready(page);
  const ids=['#style-a','#style-b'];
  if(kind==='frame attributes')await select(page,ids);
  else{
    const id=await group(page,ids);
    await page.evaluate(async kind=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();store.applyTemplate({...store.template,css:store.template.css+'\n'+(kind==='group marker'?'[data-noacg-group]':'[data-noacg-carrier]')+'{color:red}'});},kind);await ready(page);await select(page,[id]);
  }
  const before=await source(page),frame=(await(await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const paint=await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill);
  await page.getByRole('button',{name:kind==='frame attributes'?'Group selection':'Ungroup selection',exact:true}).click();await ready(page);
  expect(await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill)).toBe(paint);
  expect(await source(page)).toEqual(before);await expect(page.locator('.ef-group-error')).toContainText(/source (appearance|rule)/i);
});

test('serialized group frame refuses zero after rounding',async({page})=>{
  await open(page);const ids=await create(page),before=await source(page);
  const error=await page.evaluate(async ids=>{const session=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();try{session.execute({documentId:session.documentId,expected:session.version(),transactionId:crypto.randomUUID(),operations:[{kind:'group.create',selectors:ids.slice(0,2),box:{x:0,y:0,width:4e-10,height:10}}]});return '';}catch(e){return String(e);}},ids);
  expect(error).toContain('group transform frame');expect(await source(page)).toEqual(before);
});
