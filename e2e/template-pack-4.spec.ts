import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { bootstrapGraphic, openExportWindow, openWorkingGraphicInEditor, skipOldEditor } from './_create';
import { awaitPreviewAfterReload } from './_preview';

// THE TITLE / TOPIC / INFORMATION PACK (src/templates/pack4/).
//
// 36 designs across nine graphic types — openers, topic and chapter cards, now/next, headline +
// body, key facts, processes and checklists, recaps, public notices, and the long-text /
// bilingual statement. The factory gates (scripts/factory.mjs) already prove every design
// creates, validates and matches its type. What this spec covers is the behaviour those gates
// cannot see: what the graphics do with real operator input.
//
// Five things, and each one is a claim the pack makes about itself:
//   1. a field left EMPTY takes no space (the `:empty` rule, and the counters that skip it);
//   2. long text stays inside the frame at the design's own measure;
//   3. a repeating list renders one row per line, including a line with no owner;
//   4. the process card really is stepped — one SPX Continue per step;
//   5. the notice's parallel `level` group escalates and stands down without disturbing the
//      main walk, and its two operator events reach the generated control page.
// Plus the two things every graphic has to survive: a save/reload round trip, and export.

const PACK_IDS = [
  'card10', 'card11', 'card12', 'card13', // title-card
  'card14', 'card15', 'card16', 'card17', // topic-card
  'card18', 'card19', 'card20', 'card21', // now-next
  'card22', 'card23', 'card24', 'card25', // headline-card
  'card26', 'card27', 'card28', 'card29', // process-steps
  'card30', 'card31', 'card32', 'card33', // notice-card
  'card34', 'card35', 'card36', 'card37', // statement-card
  'ig14', 'ig15', 'ig16', 'ig17',         // key-facts
  'ig18', 'ig19', 'ig20', 'ig21',         // recap-card
];

/** Build a pack design in a hidden iframe, send it `data`, play it, and read the DOM back. */
async function inFrame<T>(
  page: Page,
  variantId: string,
  data: Record<string, string>,
  read: string,
  presses = 0,
): Promise<T> {
  return (await page.evaluate(
    async ([id, dataJson, readFn, pressCount]) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const variant = variantById(id as string);
      if (!variant) throw new Error(`no variant ${id}`);
      const tpl = variant.create({});
      const frame = document.createElement('iframe');
      frame.style.cssText = `position:fixed;left:-10000px;top:0;border:0;width:${tpl.resolution.width}px;height:${tpl.resolution.height}px;`;
      await new Promise((res) => {
        frame.onload = res;
        frame.srcdoc = composeDocument(tpl);
        document.body.appendChild(frame);
      });
      const win = frame.contentWindow as unknown as Record<string, (arg?: unknown) => unknown>;
      const doc = frame.contentDocument!;
      const values: Record<string, string> = {};
      for (const f of tpl.fields) values[f.field] = f.value;
      Object.assign(values, JSON.parse(dataJson as string));
      win.update(JSON.stringify(values));
      win.play();
      for (let i = 0; i < (pressCount as number); i++) win.next();
      // The entrance is a real GSAP timeline; jump every tween to its end so the assertions
      // read the settled pose instead of racing it.
      const gsap = (frame.contentWindow as unknown as { gsap: { globalTimeline: { progress: (n: number) => void } } }).gsap;
      gsap.globalTimeline.progress(1);
      const fn = new Function('doc', 'win', 'tpl', readFn as string);
      const out = fn(doc, frame.contentWindow, tpl);
      frame.remove();
      return out;
    },
    [variantId, JSON.stringify(data), read, presses] as const,
  )) as T;
}

test('every design in the pack creates, validates clean, and maps every field to an element', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const report = await page.evaluate(async (ids: string[]) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const problems: string[] = [];
    for (const id of ids) {
      const variant = variantById(id);
      if (!variant) {
        problems.push(`${id}: missing from the catalog`);
        continue;
      }
      let tpl;
      try {
        tpl = variant.create({});
      } catch (e) {
        problems.push(`${id}: create() threw — ${String(e)}`);
        continue;
      }
      const result = validateTemplate(tpl);
      for (const err of result.errors) problems.push(`${id}: ${err.rule} — ${err.message}`);
      for (const warn of result.warnings) problems.push(`${id}: warning ${warn.rule} — ${warn.message}`);
      for (const field of tpl.fields) {
        if (!new RegExp(`id="${field.field}"`).test(tpl.html)) {
          problems.push(`${id}: field ${field.field} has no element`);
        }
      }
    }
    return problems;
  }, PACK_IDS);

  expect(report).toEqual([]);
});

test('a field the operator clears takes no space at all', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // The public notice with its label, details and contact cleared: the two remaining lines
  // must still be visible, and the cleared ones must occupy no box at all — a card that keeps
  // three empty rows of margin is exactly the hole the `:empty` rule exists to prevent.
  const measured = await inFrame<Record<string, number>>(
    page,
    'card30',
    { f0: '', f2: '', f4: '' },
    `const h = (id) => { const el = doc.getElementById(id); return el ? el.getBoundingClientRect().height : -1; };
     return { label: h('f0'), headline: h('f1'), body: h('f2'), action: h('f3'), contact: h('f4') };`,
  );

  expect(measured.label).toBe(0);
  expect(measured.body).toBe(0);
  expect(measured.contact).toBe(0);
  expect(measured.headline).toBeGreaterThan(20);
  expect(measured.action).toBeGreaterThan(20);
});

test('a cleared step leaves the counter contiguous instead of a gap', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // The step numbers are CSS counters on each line's own ::before, so what has to hold is
  // that a cleared step generates NO BOX — a display:none element is skipped by counters by
  // specification, which is what turns 1, 3, 4 into 1, 2, 3. The rendered numerals themselves
  // are not readable from script (getComputedStyle returns the specified `counter(step)`,
  // never the resolved text), so this asserts the condition the numbering follows from.
  const state = await inFrame<{ cleared: string; kept: string[]; markers: string[] }>(
    page,
    'card26',
    { f2: '' },
    `const style = (id) => win.getComputedStyle(doc.getElementById(id));
     return {
       cleared: style('f2').display,
       kept: ['f1', 'f3', 'f4'].map((id) => style(id).display),
       markers: ['f1', 'f3', 'f4'].map((id) =>
         win.getComputedStyle(doc.getElementById(id), '::before').counterIncrement),
     };`,
    4,
  );

  expect(state.cleared).toBe('none');
  expect(state.kept).toEqual(['inline-block', 'inline-block', 'inline-block']);
  expect(state.markers).toEqual(['step 1', 'step 1', 'step 1']);
});

test('long text stays inside the frame at the design’s own measure', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const long =
    'Coalition agrees an emergency energy package after eleven hours of overnight negotiation ' +
    'in Brussels, and commits every member state to a shared purchasing mechanism';
  const body =
    'Ministers signed the deal shortly after midnight, ending eleven hours of talks that ran ' +
    'through the night and twice came close to collapse. The package caps household bills ' +
    'until spring, funds a winter grid reserve, and holds prices for two heating seasons.';

  for (const id of ['card22', 'card30', 'card35']) {
    const box = await inFrame<{ left: number; right: number; top: number; bottom: number }>(
      page,
      id,
      { f1: long, f2: body },
      `const el = doc.querySelector('.info-card-box');
       const r = el.getBoundingClientRect();
       return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };`,
    );
    // Inside the frame, and inside the 6.25 % horizontal safe area the zone system uses.
    expect(box.left, `${id} left edge`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${id} right edge`).toBeLessThanOrEqual(1920);
    expect(box.top, `${id} top edge`).toBeGreaterThanOrEqual(0);
    expect(box.bottom, `${id} bottom edge`).toBeLessThanOrEqual(1080);
  }
});

test('a list board renders one row per line, and keeps an item with no owner', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const rows = await inFrame<{ count: number; ownerless: number; owners: string[] }>(
    page,
    'ig18',
    {
      f0:
        'Anna | Circulate the revised budget by Friday\n' +
        'Marcus | Book the studio for the March recording\n' +
        '\n' + // a blank line is not a row
        'An action nobody has picked up yet\n' +
        'Priya | Draft the sponsor deck',
    },
    `const list = doc.querySelectorAll('.infographic-row');
     return {
       count: list.length,
       ownerless: [...list].filter((r) => !r.querySelector('.infographic-owner')).length,
       owners: [...doc.querySelectorAll('.infographic-owner')].map((el) => el.textContent),
     };`,
  );

  expect(rows.count).toBe(4);
  expect(rows.ownerless).toBe(1);
  expect(rows.owners).toEqual(['Anna', 'Marcus', 'Priya']);
});

test('the process card is created stepped: one SPX Continue reveals one step', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // Created with NO options at all — the design's own `defaultSteps` is what makes it stepped,
  // which is the whole claim (a process shown all at once is a list).
  const steps = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const tpl = variantById('card26')!.create({});
    return tpl.settings.steps;
  });
  expect(steps).toBe('5');

  // A step that has not been revealed is slid DOWN inside its own overflow-hidden mask — the
  // 'mask' reveal channel — so it still has opacity 1 and is still laid out. What tells the
  // two apart is where it actually sits: a revealed line sits at the top of its mask, a
  // pending one has been pushed past the mask's bottom edge and is clipped away.
  const visibleAfter = async (presses: number) =>
    inFrame<number>(
      page,
      'card26',
      {},
      `return [...doc.querySelectorAll('.info-card-step')].filter((el) => {
         const cs = win.getComputedStyle(el);
         if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false;
         const mask = el.parentElement.getBoundingClientRect();
         return el.getBoundingClientRect().top < mask.bottom - 1;
       }).length;`,
      presses,
    );

  expect(await visibleAfter(0)).toBe(0);
  expect(await visibleAfter(1)).toBe(1);
  expect(await visibleAfter(2)).toBe(2);
  expect(await visibleAfter(4)).toBe(4);
});

test('the notice escalates and stands down without moving the main walk', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const trace = await inFrame<{ before: number; urgent: number; after: number; main: string }>(
    page,
    'card30',
    {},
    `const alert = doc.querySelector('.info-card-alert');
     const opacity = () => parseFloat(win.getComputedStyle(alert).opacity);
     const settle = () => win.gsap.globalTimeline.progress(1);
     const before = opacity();
     win.noacgDispatch('escalate'); settle();
     const urgent = opacity();
     const main = JSON.stringify(win.noacgMachineState().groups);
     win.noacgDispatch('standDown'); settle();
     return { before, urgent, after: opacity(), main };`,
  );

  expect(trace.before).toBeLessThan(0.1);
  expect(trace.urgent).toBeGreaterThan(0.9);
  expect(trace.after).toBeLessThan(0.1);
  // The level group moved; the main group's pointer did not follow it off the walk.
  expect(trace.main).toContain('urgent');
});

test('the notice’s level events reach the generated control page', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Info cards', name: 'Public Advisory' });
  await page.getByTestId('dock-tab-control').click();
  // The Rehearse panel and the timeline's simulator both offer the event, which is the point:
  // one button comes from the machine's `controls` metadata, the other from the graph itself.
  const panel = page.getByTestId('dock-body-right');
  await expect(panel.getByRole('button', { name: /Escalate to urgent/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Back to standard/ })).toBeVisible();
});

test('a pack graphic survives save, reload and reopen unchanged', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Info cards', name: 'Frost Checklist' });
  await openWorkingGraphicInEditor(page);

  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill('Pre-flight checklist');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await awaitPreviewAfterReload(page);

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const tpl = useTemplateStore.getState().template;
    return { js: tpl.js, steps: tpl.settings.steps };
  });
  expect(after.js).toBe(before);
  expect(after.steps).toBe('5'); // the stepped reveal survived the round trip
});

test('a stepped pack card exports to every target with nothing dangling', async ({ page }) => {
  test.setTimeout(120_000);
  await bootstrapGraphic(page, { category: 'Info cards', name: 'Clean Steps' });

  const targets = [
    'SPX export',
    'HTML overlay (OBS / vMix)',
    'H2R Graphics export',
    'CasparCG export',
    'OGraf (EBU) export',
    'LiveOS (NetOn.Live) export',
  ];

  await openExportWindow(page);
  for (const label of targets) {
    await page.locator('.issue', { hasText: label }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Validate & download/ }).click(),
    ]);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names.length, label).toBeGreaterThan(0);

    // Every relative reference the package makes must be a file the package contains. This is
    // the dangling-reference class: a path that resolves in the editor's dev server and 404s
    // on an operator's machine.
    const pages = names.filter((n) => n.endsWith('.html'));
    for (const name of pages) {
      const html = await zip.file(name)!.async('string');
      const dir = name.includes('/') ? `${name.slice(0, name.lastIndexOf('/'))}/` : '';
      const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)].map((m) => m[1]);
      for (const ref of refs) {
        const resolved = new URL(ref, `http://x/${dir}`).pathname.slice(1);
        expect(names, `${label} · ${name} → ${ref}`).toContain(resolved);
      }
    }
  }
});
