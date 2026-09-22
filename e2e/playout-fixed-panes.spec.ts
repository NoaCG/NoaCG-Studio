import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { relayServe, routeOrigin } from './_relay';

// THE MONITORS AND THE RUNDOWN NEVER MOVE (owner, real production test, 2026-09-22).
//
// The playout dashboard is a fixed app shell: the document itself never scrolls, the stage head
// (PREVIEW, PROGRAM and the verbs) and the cue rundown sit in grid areas that do not scroll, and
// the CONTROL AREA under the monitors is the one scroll container on the page. Before this, the
// page scrolled and the monitors and the rundown were only STICKY, so anything that moves the
// document moved them too - the overscroll bounce of a trackpad, most visibly - and "they still
// move or bounce when the control area is scrolled" was the report.
//
// So this pins the geometry, not the CSS: scroll the control area with a mouse wheel and with a
// trackpad's many small deltas, past its end and back, and sample every frame while it moves.
// The monitors, the rundown and the header must not move by even one pixel, and the document's
// own scroll position must stay 0 throughout. It runs at the three sizes the owner demos on.
//
// A headless browser does not draw a trackpad's elastic bounce, so the bounce itself is not
// something this can watch. What it pins is the reason there is no bounce any more: the document
// has nothing to scroll, and every scroller that can reach its end is contained. Before the fix
// the same run measured the document scrolling 611px at 1366x768, 687px at 1280x720 and 238px at
// 1920x1080, and the rundown's end chaining into it. The assertions are soft so one run reports
// every part that moved rather than the first.

/** THE PARTS THAT MUST NOT MOVE, named once: the snapshot and the sampler read the same five. */
const FIXED_PARTS = {
  header: '.pd-header',
  monitors: '.pd-monitors',
  verbs: '.pd-stagehead .pd-verbs',
  rail: '.pd-rail',
  firstCue: '[data-testid="select-cue"]',
} as const;
type Part = keyof typeof FIXED_PARTS;

/** Where the fixed parts are, in viewport pixels, plus both scroll positions. */
type Snapshot = Record<Part, number> & { doc: number; controls: number };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate((parts) => {
    const out: Record<string, number> = {
      doc: (document.scrollingElement ?? document.documentElement).scrollTop,
      controls: document.querySelector('[data-testid="control-area"]')?.scrollTop ?? -1,
    };
    for (const [name, selector] of Object.entries(parts)) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`missing ${selector}`);
      out[name] = el.getBoundingClientRect().top;
    }
    return out as Snapshot;
  }, FIXED_PARTS as Record<string, string>);
}

/**
 * Sample the fixed parts on EVERY animation frame while the wheel runs, so a part that moves and
 * comes back between two snapshots is still caught. Returns the largest drift seen per part.
 */
async function startDriftSampler(page: Page): Promise<void> {
  await page.evaluate((parts) => {
    const w = window as unknown as { __drift?: Record<string, number>; __driftStop?: boolean };
    // The elements are looked up ONCE: a query per part per frame is work inside the very
    // measurement it is taking.
    const watched = Object.entries(parts).map(([name, selector]) => {
      const el = document.querySelector(selector)!;
      return { name, el, origin: el.getBoundingClientRect().top };
    });
    const drift: Record<string, number> = { doc: 0 };
    for (const { name } of watched) drift[name] = 0;
    w.__drift = drift;
    w.__driftStop = false;
    const tick = () => {
      for (const { name, el, origin } of watched) {
        drift[name] = Math.max(drift[name], Math.abs(el.getBoundingClientRect().top - origin));
      }
      drift.doc = Math.max(drift.doc, (document.scrollingElement ?? document.documentElement).scrollTop);
      if (!w.__driftStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, FIXED_PARTS as Record<string, string>);
}

async function stopDriftSampler(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const w = window as unknown as { __drift?: Record<string, number>; __driftStop?: boolean };
    w.__driftStop = true;
    return w.__drift ?? {};
  });
}

/** Two frames, so a scroll the wheel started has been laid out and painted before we read. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * One production with fifteen cues (a rundown longer than the rail at every size here), and the
 * names of a LONG graphic and of the one with the fewest fields, so the control area can be
 * driven both long and short.
 */
async function seedProduction(page: Page): Promise<{ id: string; long: string; short: string }> {
  await page.goto('/app');
  await awaitDurableReady(page);
  const seeded = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const show = createShowNamed('Fixed panes');
    const added: { name: string; fields: number }[] = [];
    // A FIXED list rather than the whole catalog, so a new design never changes this rundown.
    // The esports scorebug is the longest control area (its fields plus two groups of actions
    // and live numbers), long enough to scroll even at 1920x1080; the lower thirds are short.
    const categories = ['esports-score', 'quiz', 'results-board', 'scoreboard', 'matchup', 'ticker', 'starting-soon', 'transition'] as const;
    const variants = [...categories.map((c) => variantsFor(c)[0]), ...variantsFor('lower-third').slice(0, 7)];
    // The LONG case is the esports scorebug BY NAME, not by position or field count: its
    // actions and live numbers make its control area longer than a graphic with more fields
    // and nothing else, and it is the one that still scrolls at 1920x1080.
    const longName = variantsFor('esports-score')[0].create({}).name;
    for (const variant of variants) {
      if (!variant) continue;
      const template = variant.create({});
      if (added.some((a) => a.name === template.name)) continue;
      addGraphicToShow(show.id, template);
      added.push({ name: template.name, fields: template.fields.length });
    }
    const byFields = [...added].sort((a, b) => b.fields - a.fields);
    return { id: show.id, long: longName, short: byFields[byFields.length - 1].name, count: added.length };
  });
  expect(seeded.count, 'the rundown needs more cues than a rail can show').toBeGreaterThan(12);
  await settleDurableWrites(page);
  return seeded;
}

async function openCue(page: Page, name: string): Promise<void> {
  await page.getByTestId('select-cue').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('cue-editor')).toBeVisible();
  // Park the pointer over the control area, where an operator's hand is when they scroll it.
  await page.getByTestId('cue-editor').hover({ position: { x: 20, y: 20 } });
  await frames(page);
}

/** A mouse wheel: a few big notches. A trackpad: many small deltas. Both down past the end,
 *  which is where the overscroll that moved the old page happened, then all the way back. */
async function wheelDownAndBack(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 120);
    await frames(page);
  }
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 9);
    if (i % 4 === 0) await frames(page);
  }
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -120);
    if (i % 3 === 0) await frames(page);
  }
  await frames(page);
}

/** Frames for a person to look at, off by default: `NOACG_SHOTS=<dir>` writes one per beat. */
const SHOTS = process.env.NOACG_SHOTS ?? '';
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fixed-panes-${name}.png` });
}

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

for (const size of SIZES) {
  test(`at ${size.width}x${size.height} only the control area scrolls, and the monitors and rundown never move`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const seeded = await seedProduction(page);
    await page.goto(`/app#/production/${seeded.id}`);
    await expect(page.getByTestId('production-page')).toBeVisible();

    // ── LONG: the graphic with the most fields, plus its actions and the controls panel. ──
    await openCue(page, seeded.long);
    const before = await snapshot(page);
    // The shell is the viewport: nothing below the fold on the document itself.
    const overflow = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollHeight - root.clientHeight;
    });
    expect.soft(overflow, 'the document must have nothing to scroll').toBe(0);

    await startDriftSampler(page);
    // Down only first, to prove the control area really did scroll (else the rest proves nothing).
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 120);
      await frames(page);
    }
    const scrolled = await snapshot(page);
    await shot(page, `${size.width}x${size.height}-long-top`);
    await page.getByTestId('control-area').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await frames(page);
    await shot(page, `${size.width}x${size.height}-long-bottom`);
    await page.getByTestId('control-area').evaluate((el) => el.scrollTo(0, 0));
    await wheelDownAndBack(page);
    const drift = await stopDriftSampler(page);
    const after = await snapshot(page);
    console.log(`[fixed-panes ${size.width}x${size.height} long]`, JSON.stringify({ before, scrolled, after, drift }));

    expect.soft(scrolled.controls, 'the control area is the scroller, and it scrolled').toBeGreaterThan(0);
    expect.soft(drift.doc, 'the document scroll position stays 0 while the control area scrolls').toBe(0);
    for (const part of ['header', 'monitors', 'verbs', 'rail', 'firstCue'] as const) {
      expect.soft(drift[part], `${part} moved while the control area scrolled`).toBeLessThan(1);
      expect.soft(scrolled[part], `${part} after scrolling`).toBe(before[part]);
      expect.soft(after[part], `${part} after scrolling back`).toBe(before[part]);
    }

    // The rundown's own list scrolls inside the rail and must not chain into anything else.
    await page.getByTestId('select-cue').first().hover();
    await startDriftSampler(page);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 120);
      if (i % 2 === 0) await frames(page);
    }
    await frames(page);
    const railDrift = await stopDriftSampler(page);
    const railAfter = await snapshot(page);
    expect.soft(railDrift.doc, 'scrolling the rundown to its end does not scroll the document').toBe(0);
    for (const part of ['header', 'monitors', 'verbs', 'rail'] as const) {
      expect.soft(railDrift[part], `${part} moved while the rundown scrolled`).toBeLessThan(1);
    }
    expect.soft(railAfter.controls, 'the rundown does not chain into the control area').toBe(after.controls);

    // ── SHORT: the graphic with the fewest fields. Nothing may move here either. ──
    await page.getByTestId('select-cue').filter({ hasText: seeded.short }).first().scrollIntoViewIfNeeded();
    await openCue(page, seeded.short);
    const shortBefore = await snapshot(page);
    await shot(page, `${size.width}x${size.height}-short`);
    await startDriftSampler(page);
    await wheelDownAndBack(page);
    const shortDrift = await stopDriftSampler(page);
    console.log(`[fixed-panes ${size.width}x${size.height} short]`, JSON.stringify({ shortBefore, shortDrift }));
    expect.soft(shortDrift.doc).toBe(0);
    for (const part of ['header', 'monitors', 'verbs', 'rail'] as const) {
      expect.soft(shortDrift[part], `${part} moved with a short control area`).toBeLessThan(1);
    }
    // The monitors sit in the same place whichever cue is selected.
    expect.soft(shortBefore.monitors).toBe(before.monitors);

    // Nothing sticks out sideways (§3: a horizontal scrollbar here is a layout bug). The
    // DOCUMENT cannot overflow now that the shell clips, so the control area and the stage
    // column are where a too-wide row would show up - a box with one axis set to `auto`
    // computes the other to `auto` as well, so it would scroll sideways inside them.
    const sideways = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      const wide = (sel: string) => {
        const el = document.querySelector(sel)!;
        return el.scrollWidth - el.clientWidth;
      };
      return { doc: root.scrollWidth - root.clientWidth, area: wide('[data-testid="control-area"]'), column: wide('.pd-main') };
    });
    expect.soft(sideways.doc, 'no horizontal page scroll').toBe(0);
    expect.soft(sideways.area, 'the control area does not scroll sideways').toBe(0);
    expect.soft(sideways.column, 'the stage column does not scroll sideways').toBe(0);
    // And the column itself has nothing to scroll at a supported size - its `overflow: auto` is
    // only the last resort for a window too short to hold the stage head.
    const columnOverflow = await page.locator('.pd-main').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect.soft(columnOverflow, 'the stage column has nothing to scroll').toBe(0);
  });
}

// THE EXPORTED CONTROLLER IS THE THIRD SURFACE (docs/CONTROL_PANEL_PARITY.md), and it is the one
// a show drops to when the network dies, so it owes the same fixed shell. It carries its own
// stylesheet (control/productionControllerHtml.ts) rather than the app's, which is exactly why a
// change to the model has to be driven here too and not argued from the other two.
test('the exported controller is the same fixed shell: only its control area scrolls', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const show = shows.createShowNamed('Fixed panes offline');
    // The esports scorebug again: the longest control area, so the editor overflows the column.
    for (const variant of [variantsFor('esports-score')[0], ...variantsFor('lower-third').slice(0, 6)]) {
      const template = variant.create({});
      const { doc } = createGraphic(template, { name: template.name });
      shows.addGraphicToShow(show.id, template, { graphicId: doc!.id });
    }
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^[^/]+\//, ''), await zip.file(name)!.async('string'));
  }
  const { serve } = relayServe(files);
  const origin = 'http://fixed-panes.local';
  const ctl = await context.newPage();
  // 600px tall, not 768: this page lays its fields four across, so the scorebug's editor fits a
  // 1366x768 window whole and there would be nothing to scroll. A shorter window is where the
  // model has to hold, and it is also the shape of a laptop with a browser bar and a dock.
  await ctl.setViewportSize({ width: 1366, height: 600 });
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await ctl.locator('.cue').first().click();
  await expect(ctl.locator('#editor')).toBeVisible();

  const read = () =>
    ctl.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      const controls = document.querySelector('.controls')!;
      const root = document.scrollingElement ?? document.documentElement;
      return {
        doc: root.scrollTop,
        docOverflow: root.scrollHeight - root.clientHeight,
        controls: controls.scrollTop,
        controlsOverflow: controls.scrollHeight - controls.clientHeight,
        header: top('header'),
        monitors: top('.monitors'),
        verbs: top('.verbs'),
        rail: top('.rail'),
      };
    });

  const before = await read();
  expect(before.docOverflow, 'the exported page has nothing to scroll').toBe(0);
  expect(before.controlsOverflow, 'its control area is what overflows').toBeGreaterThan(0);

  await ctl.locator('#editor').hover({ position: { x: 20, y: 20 } });
  for (let i = 0; i < 12; i++) {
    await ctl.mouse.wheel(0, 120);
    await frames(ctl);
  }
  const after = await read();
  expect(after.controls, 'the control area scrolled').toBeGreaterThan(0);
  expect(after.doc).toBe(0);
  for (const part of ['header', 'monitors', 'verbs', 'rail'] as const) {
    expect(after[part], `${part} moved on the exported controller`).toBe(before[part]);
  }
  await ctl.close();
});

// THE PHONE STACKS AND SCROLLS AS ONE COLUMN, by decision (docs/PLAYOUT_DASHBOARD.md §2): there
// is no room at 390px to hold the monitors still beside a scrolling control area. What it still
// owes is the same shell - the document never scrolls, the body does - and the verb bar pinned
// to the bottom of the screen wherever the column is scrolled to.
test('on a phone the body scrolls as one column, the document never does, and the verbs stay pinned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seeded = await seedProduction(page);
  await page.goto(`/app#/production/${seeded.id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('select-cue').filter({ hasText: seeded.long }).first().click();
  await expect(page.getByTestId('cue-editor')).toBeVisible();
  await shot(page, '390x844-top');

  const verbs = page.locator('[data-testid="production-verbs"]');
  const bottomOf = async () => {
    const box = await verbs.boundingBox();
    return box ? Math.round(box.y + box.height) : -1;
  };
  expect(await bottomOf(), 'the verb bar sits on the bottom edge').toBe(844);

  // The header never overflows: ■ All out is the panic control and must be wholly on screen,
  // and the production's name must keep some width of its own. With the workspace tabs in the
  // header, All out sat past the right edge and the name was zero pixels wide.
  const header = await page.evaluate(() => {
    const el = document.querySelector('.pd-header')!;
    const allOut = document.querySelector('[data-testid="verb-out-all"]')!.getBoundingClientRect();
    const name = document.querySelector('.pd-header h1')!.getBoundingClientRect();
    return { overflow: el.scrollWidth - el.clientWidth, allOutRight: allOut.right, allOutLeft: allOut.left, nameWidth: name.width };
  });
  expect(header.overflow, 'the header does not overflow').toBeLessThanOrEqual(0);
  expect(header.allOutLeft).toBeGreaterThanOrEqual(0);
  expect(header.allOutRight, 'All out is wholly on screen').toBeLessThanOrEqual(390);
  expect(header.nameWidth, 'the production name keeps some width').toBeGreaterThan(40);

  await page.locator('.pd-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await frames(page);
  await shot(page, '390x844-bottom');
  const state = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const body = document.querySelector('.pd-body')!;
    return { doc: root.scrollTop, docOverflow: root.scrollHeight - root.clientHeight, body: body.scrollTop, sideways: root.scrollWidth - root.clientWidth };
  });
  expect(state.body, 'the body is the phone scroller, and it scrolled').toBeGreaterThan(0);
  expect(state.doc).toBe(0);
  expect(state.docOverflow).toBe(0);
  expect(state.sideways).toBe(0);
  expect(await bottomOf(), 'the verb bar is still on the bottom edge, scrolled to the end').toBe(844);
});
