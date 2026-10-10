// covers: src/components/editorFoundation/**
// covers: src/blocks/{animEdit,editorAnimation,animData}.ts, src/templates/shared/{animRuntime,easeRuntime}.ts
//
// R1.2a.2 key-side easing in the editor (docs/research/editor-r1-2a-2): marquee and modifier
// selection across rows, the toolbar dropdown and the key context menu calling one operation,
// count and mixed state, keyboard access, one undo, and atomic refusals. What each preset plays
// in the simulator and every export is e2e/editor-ease.spec.ts.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';

type Key = { time: number; value: number; ease?: string };
const L = '0.333333333333', L2 = '0.666666666667';
const bezier = (...points: (string | number)[]) => `cubic-bezier(${points.join(',')})`;

async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function layers(page: Page) {
  return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!.steps.map(s => s.layers)) as Promise<Record<string, Record<string, Key[]>>[]>;
}
async function state(page: Page) {
  return page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); return { js: s.template.js, history: s.history.length, future: s.future.length }; });
}
async function ready(page: Page) { await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0); }

/** A text-and-box graphic: a middle key on each layer, a bounce and a hand-written bezier, and an
 *  Out cue the selection never reaches. */
async function fixture(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  // Ends on a store mutation, the evaluate that failed the nightly as a false navigation (#465).
  await evaluateInPage(page, async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const store = useTemplateStore.getState();
    store.applyTemplate({ ...store.template, fps: 25, fields: [], layers: [],
      html: '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div><div id="title" data-gfx>Text and box</div></div></body></html>',
      css: 'body{margin:0}.fixture{opacity:0}#box{position:absolute;left:500px;top:400px;width:320px;height:100px;background:#eeb844}#title{position:absolute;left:500px;top:420px;width:320px;height:100px;font:40px Arial;color:#111}',
      js: runtimeJs('Key ease fixture', emitAnimRegion({ version: 2, root: '.fixture', speed: 1, steps: [
        { name: 'In', duration: 2, ease: 'none', layers: {
          '#box': { x: [{ time: 0, value: -900 }, { time: 1, value: -200, ease: 'power2.out' }, { time: 2, value: 0 }], opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }] },
          '#title': { x: [{ time: 0, value: -900 }, { time: 1.6, value: 0, ease: 'bounce.out' }], y: [{ time: 0, value: 40 }, { time: 1, value: 0, ease: 'cubic-bezier(0.3,-0.4,0.6,1.5)' }, { time: 2, value: 10 }] },
        } },
        { name: 'Out', duration: 1, ease: 'none', layers: { '#title': { x: [{ time: 0, value: 0 }, { time: 1, value: -900, ease: 'power2.in' }] } } },
      ] })) + '\n// keep this user code',
    }, { resetSampleData: true });
  });
  await ready(page);
  for (const selector of ['#box', '#title']) {
    const toggle = page.locator(`.ef-track[data-selector="${selector}"]:not([data-property])`).getByRole('button', { name: /^Properties of / });
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}
const row = (page: Page, selector: string, property: string) => page.locator(`.ef-track[data-selector="${selector}"][data-property="${property}"]`);
const key = (page: Page, selector: string, property: string, seconds: string) => row(page, selector, property).getByRole('button', { name: `${property} key at ${seconds} s` });
const ease = (page: Page) => page.getByRole('combobox', { name: 'Key ease' });

/** Drag a marquee on the lanes from (time, row) to (time, row), on empty lane space. */
async function marquee(page: Page, from: [number, Locator], to: [number, Locator], modifiers: ('Control' | 'Shift')[] = [], finish = true) {
  const extent = await page.evaluate(async () => Math.max(2, (await import('/src/components/editorFoundation/timelineView.ts')).readTimeline((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template).duration * 1.15));
  const point = async ([time, lane]: [number, Locator]) => { const box = (await lane.locator('.ef-track-lane').boundingBox())!; return { x: box.x + time / extent * box.width, y: box.y + box.height / 2 }; };
  const a = await point(from), b = await point(to);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 });
  if (finish) await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

test('a marquee across rows and the toolbar dropdown write key-side eases as one undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  const original = await source(page);
  await expect(ease(page)).toBeDisabled();
  // From the box's X row to the title's Y row: the middle and last keys between 0.9 and 1.95 s.
  await marquee(page, [.9, row(page, '#box', 'x')], [1.95, row(page, '#title', 'y')]);
  await expect(page.getByTestId('key-count')).toHaveText('4 keys');
  for (const [s, p, t] of [['#box', 'x', '1.00'], ['#box', 'opacity', '1.00'], ['#title', 'x', '1.60'], ['#title', 'y', '1.00']]) await expect(key(page, s, p, t)).toHaveAttribute('aria-pressed', 'true');
  await expect(key(page, '#box', 'x', '2.00')).toHaveAttribute('aria-pressed', 'false');
  // Modifiers toggle: add the first X key, then take the title's X key out and back in.
  await key(page, '#box', 'x', '0.00').click({ modifiers: ['Control'] });
  await key(page, '#title', 'x', '1.60').click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('key-count')).toHaveText('4 keys');
  await key(page, '#title', 'x', '1.60').click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('key-count')).toHaveText('5 keys');
  await expect(ease(page)).toHaveValue('mixed');
  await ease(page).selectOption({ label: 'Easy Ease' }); await ready(page);
  await expect(page.locator('.ef-key-error')).toHaveCount(0);
  const [cue, exit] = await layers(page), before = JSON.parse(JSON.stringify((await page.evaluate(async js => (await import('/src/blocks/animData.ts')).parseAnimData(js)!.steps.map(s => s.layers), original.js)))) as typeof cue[];
  expect(cue['#box'].x).toEqual([{ time: 0, value: -900 }, { time: 1, value: -200, ease: bezier(L, 0, L2, 1) }, { time: 2, value: 0, ease: bezier(L, 0, L2, L2) }]);
  expect(cue['#box'].opacity).toEqual([{ time: 0, value: 0 }, { time: 1, value: 1, ease: bezier(L, L, L2, 1) }]);
  expect(cue['#title'].x).toEqual([{ time: 0, value: -900 }, { time: 1.6, value: 0, ease: bezier(L, L, L2, 1) }]);
  expect(cue['#title'].y).toEqual([{ time: 0, value: 40 }, { time: 1, value: 0, ease: bezier('0.3', '-0.4', L2, 1) }, { time: 2, value: 10, ease: bezier(L, 0, L2, L2) }]);
  expect(exit).toEqual(before[1]);
  // The selection stays, and now reads as the preset it has.
  await expect(page.getByTestId('key-count')).toHaveText('5 keys');
  await expect(ease(page)).toHaveValue('easyEase');
  const eased = await source(page);
  // Everything outside the animation literal is byte-identical.
  const outside = (js: string) => js.replace(/var NOACG_ANIM = [\s\S]*?;\n/, '');
  expect(outside(eased.js)).toBe(outside(original.js));
  expect([eased.html, eased.css]).toEqual([original.html, original.css]);
  // Re-applying (the menu marks the current preset) writes nothing and adds no history.
  const applied = await state(page);
  await key(page, '#box', 'x', '1.00').click({ button: 'right' });
  const current = page.getByRole('menu', { name: 'Key ease' }).getByRole('menuitemradio', { name: 'Easy Ease', exact: true });
  await expect(current).toHaveAttribute('aria-checked', 'true');
  await current.click(); await expect(page.getByRole('menu', { name: 'Key ease' })).toBeHidden();
  expect(await state(page)).toEqual(applied);
  await expect(page.getByTestId('key-count')).toHaveText('5 keys');
  await page.keyboard.press('Escape'); expect((await source(page)).js).toBe(eased.js);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(original.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(eased.js);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Key-side eases'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); expect(await layers(page)).toEqual([cue, exit]);
  await page.reload(); await ready(page); expect((await source(page)).js).toBe(saved.js);
  const again = await page.evaluate(async () => { const { saveCurrentGraphic } = await import('/src/store/saveActions.ts'); await saveCurrentGraphic(); return (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js; });
  expect(again).toBe(saved.js);
  expect(errors).toEqual([]);
});

test('right-click keeps the selection, the context menu matches the dropdown, and the keyboard opens it', async ({ page }) => {
  await fixture(page);
  const original = await source(page);
  await key(page, '#box', 'x', '1.00').click();
  await key(page, '#title', 'x', '1.60').click({ modifiers: ['Control'] });
  await expect(page.getByTestId('key-count')).toHaveText('2 keys');
  await key(page, '#box', 'x', '1.00').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Key ease' });
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('key-count')).toHaveText('2 keys');
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Linear', 'Easy Ease In', 'Easy Ease Out', 'Easy Ease', 'Bounce', 'Overshoot', 'Hold']);
  await menu.getByRole('menuitemradio', { name: 'Bounce' }).click(); await ready(page);
  await expect(menu).toBeHidden();
  const viaMenu = await source(page);
  // Only the box's segment changes: the title's X already settles with bounce.out.
  expect((await layers(page))[0]['#box'].x[1]).toEqual({ time: 1, value: -200, ease: 'bounce.out' });
  expect((await layers(page))[0]['#title'].x).toEqual([{ time: 0, value: -900 }, { time: 1.6, value: 0, ease: 'bounce.out' }]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(original.js);
  await ease(page).selectOption({ label: 'Bounce' }); await ready(page);
  expect((await source(page)).js).toBe(viaMenu.js);
  // The dropdown keeps focus after it edits, and undo and redo still work from it; an undo that
  // moves no key keeps the selection.
  await ease(page).focus(); await page.keyboard.press('Control+z'); await ready(page);
  expect((await source(page)).js).toBe(original.js);
  await expect(page.getByTestId('key-count')).toHaveText('2 keys');
  await page.keyboard.press('Control+y'); await ready(page);
  expect((await source(page)).js).toBe(viaMenu.js);
  // Right-click on a key outside the selection selects that key alone.
  await key(page, '#title', 'y', '1.00').click({ button: 'right' });
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
  await expect(key(page, '#title', 'y', '1.00')).toBeFocused();
  // Keyboard: Shift+F10 on a focused key opens the menu; arrows move, Escape returns focus.
  await key(page, '#box', 'x', '0.00').focus(); await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await expect(menu.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(menu.getByRole('menuitemradio', { name: 'Easy Ease In' })).toBeFocused();
  await page.keyboard.press('End'); await expect(menu.getByRole('menuitemradio', { name: 'Hold' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(key(page, '#box', 'x', '0.00')).toBeFocused();
  const unchanged = await source(page);
  await page.keyboard.press('ContextMenu'); await expect(menu).toBeVisible();
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await ready(page);
  await expect(menu).toBeHidden();
  // Hold on the first X key: the segment it departs through holds, nothing else changes.
  const held = (await layers(page))[0]['#box'].x;
  expect(held).toEqual([{ time: 0, value: -900 }, { time: 1, value: -200, ease: 'hold' }, { time: 2, value: 0 }]);
  expect((await source(page)).js).not.toBe(unchanged.js);
  await expect(ease(page)).toHaveValue('hold');
});

test('Escape cancels a marquee, and a refused batch keeps source and history and says why', async ({ page }) => {
  await fixture(page);
  await key(page, '#box', 'x', '1.00').click();
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await marquee(page, [.2, row(page, '#box', 'x')], [1.95, row(page, '#title', 'y')], [], false);
  await expect(page.locator('.ef-marquee')).toBeVisible();
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('.ef-marquee')).toHaveCount(0);
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await expect(key(page, '#box', 'x', '1.00')).toHaveAttribute('aria-pressed', 'true');
  // Easy Ease Out on the title's first X key would have to keep bounce.out's arrival as a bezier
  // point, and it has none: the whole batch refuses.
  await key(page, '#box', 'x', '0.00').click({ modifiers: ['Control'] });
  await key(page, '#title', 'x', '0.00').click({ modifiers: ['Control'] });
  const before = await state(page);
  await ease(page).selectOption({ label: 'Easy Ease Out' });
  await expect(page.locator('.ef-key-error')).toContainText('bounce.out');
  expect(await state(page)).toEqual(before);
  // A click on empty lane space clears the key selection.
  await marquee(page, [.5, row(page, '#title', 'y')], [.5, row(page, '#title', 'y')]);
  await expect(page.getByTestId('key-count')).toHaveText('0 keys');
  await expect(ease(page)).toBeDisabled();
  // An edit that moves keys (Set Out inside the entrance) clears the selection rather than
  // re-pointing it at whatever key sits at the old time now.
  await key(page, '#box', 'x', '1.00').click(); await ready(page);
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click(); await ready(page);
  await expect(page.locator('.ef-out-error')).toHaveCount(0);
  await expect(page.getByTestId('key-count')).toHaveText('0 keys');
});

test('the last key of one cue and the first of the next are one boundary key', async ({ page }) => {
  await fixture(page);
  // End the In cue on a title X key, so In's landing key and Out's first key share 2.00 s.
  await evaluateInPage(page, async () => {
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const d = parseAnimData(store.template.js)!; d.steps[0].layers['#title'].x.push({ time: 2, value: 0 });
    store.applyTemplate({ ...store.template, js: spliceAnimData(store.template.js, d)! });
  });
  await ready(page);
  const boundary = row(page, '#title', 'x').getByRole('button', { name: 'X keys at 2.00 s' });
  await expect(boundary).toHaveCount(1);
  await boundary.click();
  await expect(page.getByTestId('key-count')).toHaveText('2 keys');
  // Easy Ease on it eases its arrival in In and its departure in Out.
  await ease(page).selectOption({ label: 'Easy Ease' }); await ready(page);
  const [cue, exit] = await layers(page);
  expect(cue['#title'].x[2]).toEqual({ time: 2, value: 0, ease: bezier(L, L, L2, 1) });
  expect(exit['#title'].x[1]).toEqual({ time: 1, value: -900, ease: bezier(L, 0, L2, 0) });
});
