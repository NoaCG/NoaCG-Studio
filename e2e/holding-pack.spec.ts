// This spec iterates the CATALOG, so a design added anywhere under src/templates/ must select it.
// Until 2026-08-08 it was reachable from no template path and ten designs landed with every
// branch gate green; e2e-affected.test.mjs now pins that every catalog importer covers src/templates/.
// covers: src/templates/**
// covers: src/components/{editorFoundation/EditorFoundation,wizard/steps/FinishStep}.tsx

import { test, expect, type Page } from '@playwright/test';
import { finishIntoNewEditor, bootstrapGraphic } from './_create';
import { toApp } from './_bench';
import { settleDurableWrites } from './_durable';
import { chooseType, pickDesign, resultTotal } from './_browse';

// THE HOLDING / CREDITS / CEREMONY PACK.
//
// Three claims in this pack are behavioural rather than visual, and each one is the kind that
// looks fine in a screenshot and fails on air:
//
//   the countdown  — counts to a WALL-CLOCK time, and stays right through a stalled event loop
//   the loop       — repeats with no visible seam, and does not accumulate clones on replay
//   the board      — shows everything at once, so it must shrink rather than lose its last row
//
// Plus the two things a template pack is worthless without: it can be FOUND in the wizard, and
// it survives the editor's own round trip.

/** Walk the wizard as far as a category's template grid — the real discovery path. */
async function toTemplateStep(page: Page, category: string) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
}

/** Build a variant into a throwaway iframe and run a probe inside it. Deliberately NOT the
 *  editor's preview: these checks drive play()/update() directly, the way playout does. */
async function inTemplate<T>(page: Page, variantId: string, probe: string): Promise<T> {
  return page.evaluate(
    async ([id, body]) => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const variant = Object.values(CATALOG).flat().find((v) => v.id === id);
      if (!variant) throw new Error(`no catalog variant ${id}`);
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;opacity:0.01;';
      document.body.appendChild(frame);
      await new Promise((res) => {
        frame.onload = res;
        frame.srcdoc = composeDocument(variant.create({}));
      });
      const w = frame.contentWindow as unknown as Record<string, (arg?: string) => void>;
      const d = frame.contentDocument!;
      await new Promise((r) => setTimeout(r, 250));
      try {
        return await new Function('w', 'd', `return (async () => { ${body} })()`)(w, d);
      } finally {
        frame.remove();
      }
    },
    [variantId, probe] as const,
  ) as Promise<T>;
}

// ── Discovery ────────────────────────────────────────────────────────────────

test('the three families are browsable and every design in them is offered', async ({ page }) => {
  for (const [label, category] of [
    ['Holding & break screens', 'holding'],
    ['Credits & thanks', 'credits'],
    ['Information cards', 'info'],
  ] as const) {
    await toTemplateStep(page, label);
    // Counted off the TAXONOMY, not the wizard category: browse tiles are graphic categories,
    // and one wizard category can spread across several of them (an info-card that carries a
    // type browses under Titles / Topics / Notices, not under Information cards).
    const expected = await page.evaluate(async (cat) => {
      const { allTemplateMeta } = await import('/src/templates/templateMeta.ts');
      return allTemplateMeta().filter(({ meta }) => meta.category === cat).length;
    }, category);
    // Derived from the live catalog on purpose: the assertion is "every design is reachable",
    // which must keep holding as the catalog grows, not a number that rots on the next one.
    // Against the count LINE, not the cards: the step renders a first page now (handoff
    // §2b), so counting cards would measure the page size and pass at 12 for every category
    // with twelve or more designs - a test that cannot fail.
    expect(await resultTotal(page)).toBe(expected);
  }
});

test('the holding set covers the whole show, not just the front door', async ({ page }) => {
  await toTemplateStep(page, 'Holding & break screens');
  // A tile called "Starting soon" would hide these; the naming IS the discovery fix.
  // Searched one at a time: what must hold is that each design is REACHABLE, and searching
  // is how a person reaches a named one now that the grid shows a first page.
  for (const name of ['Countdown to Start', 'Short Break', 'Intermission', 'Please Stand By', 'Thanks for Watching']) {
    await page.locator('.wz-browse-search').fill(name);
    await expect(page.locator('.wz-variant', { hasText: name })).toBeVisible();
  }
});

test('a ceremony card creates from the wizard and lands in the editor', async ({ page }) => {
  await toTemplateStep(page, 'Information cards');
  await pickDesign(page, 'In Memoriam');
  // Create only appears from the Fields step on, so step forward once first.
  await page.locator('.wz-next').click();
  await finishIntoNewEditor(page);
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { name: t.name, fields: t.fields.map((f) => f.title), type: t.type };
  });
  expect(fields.name).toBe('In Memoriam');
  expect(fields.fields).toEqual(['Name', 'Years', 'Line']);
});

// ── The countdown ────────────────────────────────────────────────────────────

test('a start-time countdown chases the wall clock and never goes negative', async ({ page }) => {
  await toApp(page);

  const r = await inTemplate<Record<string, string>>(
    page,
    'ss05',
    `
    const clock = () => d.querySelector('.starting-soon-clock').textContent;
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const at = (mins) => { const t = new Date(Date.now() + mins * 60000); return pad(t.getHours()) + ':' + pad(t.getMinutes()); };
    // Exercise the clock hook directly: waiting a fixed amount for the entrance timeline to
    // call it makes these four sequential resets race a throttled rAF under a loaded suite.
    const run = (payload) => { w.update(JSON.stringify(payload)); w.startClock(); return clock(); };
    return {
      // No start time set -> the duration is what counts (the field stays optional).
      fallback: await run({ f2: '10', f3: '' }),
      // A start time 95 minutes out formats with hours rather than "95:00".
      overAnHour: await run({ f2: '10', f3: at(95) }),
      // A start time that has already gone past today counts to TOMORROW: an overnight hold
      // must never show a negative number.
      alreadyPast: await run({ f2: '10', f3: at(-5) }),
      // A typo is not a start time; the duration takes over rather than the clock breaking.
      garbage: await run({ f2: '10', f3: 'half past seven' }),
    };
  `,
  );

  expect(r.fallback).toBe('10:00');
  expect(r.overAnHour).toMatch(/^1:3[0-5]:\d{2}$/);
  expect(r.alreadyPast).toMatch(/^23:5\d:\d{2}$/);
  expect(r.garbage).toBe('10:00');
});

test('the countdown self-corrects through a stalled event loop', async ({ page }) => {
  await toApp(page);

  // The clock is anchored to a deadline, not decremented once per tick. Blocking the event
  // loop drops and coalesces interval callbacks — a decrement-per-tick clock loses exactly
  // that many seconds and never gets them back, which is the drift this design prevents.
  const r = await inTemplate<{ before: number; after: number; elapsed: number }>(
    page,
    'ss06',
    `
    const secs = () => { const p = d.querySelector('.starting-soon-clock').textContent.split(':').map(Number); return p[0] * 60 + p[1]; };
    w.update(JSON.stringify({ f2: '5' }));
    w.play();
    await new Promise((r) => setTimeout(r, 1200));   // let the entrance arm the clock
    const before = secs();
    const startedAt = Date.now();
    const until = Date.now() + 2500;
    while (Date.now() < until) { /* deliberate stall */ }
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: secs(), elapsed: (Date.now() - startedAt) / 1000 };
  `,
  );

  // Whatever the stall did to the timer, the painted time must agree with real elapsed time.
  const drift = Math.abs(r.before - r.after - r.elapsed);
  expect(drift, `clock lost ${drift.toFixed(2)} s across a stalled event loop`).toBeLessThan(1.5);
});

test('Update re-arms a running countdown, and an update that did not touch it leaves it alone', async ({ page }) => {
  await toApp(page);

  // Owner walk, 2026-08-29, on ss11 "Doors Open": with the countdown ON AIR, changing the
  // minutes and pressing Update did nothing — the only way to correct the clock was to take
  // the graphic out and back in, which is the one thing an operator cannot do to a screen the
  // audience is watching. The length is DATA, so a new value takes effect at once; the graphic
  // does not move (docs/STATE_MACHINE_SCHEMA.md — update() writes fields, events move states).
  //
  // Written BACKWARDS as well as forwards, because the whole risk of this fix is the opposite
  // failure: an Update that carries only a new headline must never restart the count under it.
  const r = await inTemplate<{
    running: number;
    rearmed: number;
    beforeText: number;
    afterText: number;
    afterStartTime: number;
  }>(
    page,
    'ss11',
    `
    const secs = () => {
      const p = d.querySelector('.starting-soon-clock').textContent.split(':').map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const pad = (n) => (n < 10 ? '0' + n : String(n));

    // On air, counting the thirty minutes the operator set beforehand.
    w.update(JSON.stringify({ f0: 'Doors open', f2: '30', f3: '' }));
    w.startClock();
    await new Promise((r) => setTimeout(r, 700));
    const running = secs();

    // They retype the minutes and press Update. The clock re-derives immediately.
    w.update(JSON.stringify({ f2: '5' }));
    const rearmed = secs();

    // …and an Update that leaves the clock's own fields alone must not restart the count.
    // Read back to back, so no tick can land between the two.
    await new Promise((r) => setTimeout(r, 1200));
    const beforeText = secs();
    w.update(JSON.stringify({ f0: 'Kick-off shortly' }));
    const afterText = secs();

    // A wall-clock start time is the same data, and wins over the duration here exactly as it
    // does at play time.
    const t = new Date(Date.now() + 95 * 60000);
    w.update(JSON.stringify({ f3: pad(t.getHours()) + ':' + pad(t.getMinutes()) }));
    const afterStartTime = secs();
    w.stopClock();
    return { running, rearmed, beforeText, afterText, afterStartTime };
  `,
  );

  expect(r.running).toBeGreaterThan(1700); // still counting out the thirty minutes
  expect(r.rearmed).toBe(300); // …and now the five it was just given, without leaving air
  expect(r.afterText).toBe(r.beforeText); // an unrelated Update moves nothing
  expect(r.afterStartTime).toBeGreaterThan(5600); // ~95 minutes, not the 5-minute duration
});

// THE ABSOLUTE DEADLINE (docs/work-specs/obs-scenes/spec.md, AC-8 and OS4 rules R7-R11): the
// start-time field also takes an ISO date and time WITH its offset, the form a caller writes for
// "in 5 minutes" so a write stays absolute. Run in a timezone other than the offset's, on
// Playwright's clock, paused so every second is exact and every frame reads the same time.
test.describe('a countdown to an absolute deadline', () => {
  test.use({ timezoneId: 'America/New_York' });

  /** Boot ss11 into a named frame, write its fields and start the clock; answer what it shows. */
  const start = (page: Page, name: string, f3: string) =>
    page.evaluate(
      async ([n, value]) => {
        const { CATALOG } = await import('/src/templates/catalog.ts');
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const variant = Object.values(CATALOG).flat().find((v) => v.id === 'ss11')!;
        const store = ((window as unknown as { __dl?: Record<string, HTMLIFrameElement> }).__dl ??= {});
        store[n]?.remove();
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;opacity:0.01;';
        document.body.appendChild(frame);
        await new Promise((res) => {
          frame.onload = res;
          frame.srcdoc = composeDocument(variant.create({}));
        });
        store[n] = frame;
        const w = frame.contentWindow as unknown as { update: (d: string) => void; startClock: () => void };
        w.update(JSON.stringify({ f2: '10', f3: value }));
        w.startClock();
        return frame.contentDocument!.querySelector('.starting-soon-clock')!.textContent;
      },
      [name, f3] as const,
    );
  const read = (page: Page, name: string) =>
    page.evaluate((n) => {
      const doc = (window as unknown as { __dl: Record<string, HTMLIFrameElement> }).__dl[n].contentDocument!;
      return {
        clock: doc.querySelector('.starting-soon-clock')!.textContent,
        done: doc.querySelector('.starting-soon')!.classList.contains('starting-soon-done'),
      };
    }, name);

  test.beforeEach(async ({ page }) => {
    // Held at 10:01:00 in Helsinki (+02:00), 03:01 in the page's own New York.
    await page.clock.install({ time: new Date('2026-11-14T08:00:00Z') });
    await toApp(page);
    await page.clock.pauseAt(new Date('2026-11-14T08:01:00Z'));
  });

  test('it counts the time left to the instant, across a reload and a hidden page', async ({ page }) => {
    const deadline = '2026-11-14T11:30:00+02:00';
    expect(await start(page, 'a', deadline)).toBe('1:29:00');

    await page.clock.runFor(10 * 60_000);
    expect((await read(page, 'a')).clock).toBe('1:19:00');
    // A reload starts again from the same instant, not from a length.
    expect(await start(page, 'b', deadline)).toBe('1:19:00');

    // Hidden and throttled: five minutes of wall time with no timer run, then its next tick.
    const now = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(now + 5 * 60_000);
    await page.clock.runFor(300);
    expect((await read(page, 'a')).clock).toBe('1:14:00');
    expect((await read(page, 'b')).clock).toBe('1:14:00');
  });

  test('it holds at zero after the deadline, and a past deadline shows zero, never tomorrow', async ({ page }) => {
    expect(await start(page, 'a', '2026-11-14T10:01:03+02:00')).toBe('0:03');
    await page.clock.runFor(10_000);
    expect(await read(page, 'a')).toEqual({ clock: '0:00', done: true });
    await page.clock.runFor(60_000);
    expect(await read(page, 'a')).toEqual({ clock: '0:00', done: true });

    expect(await start(page, 'past', '2026-11-14T09:59:00+02:00')).toBe('0:00');
    expect(await start(page, 'z', '2026-11-14T07:00:00Z')).toBe('0:00');
    await page.clock.runFor(1000);
    expect(await read(page, 'past')).toEqual({ clock: '0:00', done: true });
  });

  test('an invalid value is an empty field: the duration counts', async ({ page }) => {
    expect(await start(page, 'no-offset', '2026-11-14T11:30:00')).toBe('10:00');
    expect(await start(page, 'no-such-day', '2026-11-31T11:30:00+02:00')).toBe('10:00');
    expect(await start(page, 'bad-hour', '2026-11-14T24:30:00+02:00')).toBe('10:00');
    expect(await start(page, 'empty', '')).toBe('10:00');
    // A UTC deadline with fractions reads, too.
    expect(await start(page, 'utc', '2026-11-14T08:05:00.500Z')).toBe('4:01');
  });
});

test('a clock-less holding screen carries no countdown at all', async ({ page }) => {
  await toApp(page);
  const emitted = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const t = CATALOG['starting-soon']!.find((v) => v.id === 'ss08')!.create({});
    return {
      definesClock: /function startClock/.test(t.js),
      callsClock: /"call":\s*"startClock"/.test(t.js),
      fields: t.fields.map((f) => f.field),
      hasClockElement: /starting-soon-clock/.test(t.html),
    };
  });
  // A technical pause has no honest number to show, so none of the machinery ships.
  expect(emitted).toEqual({ definesClock: false, callsClock: false, fields: ['f0', 'f1'], hasClockElement: false });
});

// ── The loop ─────────────────────────────────────────────────────────────────

test('the credit reel loops with no seam and does not stack clones on replay', async ({ page }) => {
  await toApp(page);

  const r = await inTemplate<{
    firstTravel: number; firstRun: number; firstClones: number; covered: boolean;
    replayClones: number; grownTravel: number; grownRun: number;
  }>(
    page,
    'cr06',
    `
    const track = () => d.querySelector('#credits-track');
    const run = () => d.querySelector('.credits-loop-run');
    const clones = () => d.querySelectorAll('.credits-loop-clone').length;
    const travel = () => { const t = w.gsap.getTweensOf(track())[0]; return t ? t.vars.y : null; };
    w.play(); await new Promise((r) => setTimeout(r, 500));
    const firstTravel = travel(), firstRun = run().offsetHeight, firstClones = clones();
    const covered = firstRun * (1 + firstClones) >= firstRun + d.querySelector('.credits-box').clientHeight;
    // A second play() must rebuild the loop, not append another copy of the list.
    w.stop(); await new Promise((r) => setTimeout(r, 300));
    w.play(); await new Promise((r) => setTimeout(r, 500));
    const replayClones = clones();
    // New data re-measures: the travel always equals ONE run, whatever the list becomes.
    const many = ['CREW'].concat(Array.from({ length: 40 }, (_, i) => 'Role ' + i + ' | Person ' + i)).join('\\n');
    w.update(JSON.stringify({ f0: many }));
    w.play(); await new Promise((r) => setTimeout(r, 600));
    return { firstTravel, firstRun, firstClones, covered, replayClones, grownTravel: travel(), grownRun: run().offsetHeight };
  `,
  );

  // Travelling exactly one run's height is what makes the seam invisible: at the repeat the
  // clone is sitting precisely where the original started.
  expect(r.firstTravel).toBe(-r.firstRun);
  expect(r.covered, 'the clones must cover the viewport or the loop shows a gap').toBe(true);
  expect(r.replayClones).toBe(r.firstClones);
  expect(r.grownRun).toBeGreaterThan(r.firstRun);
  expect(r.grownTravel).toBe(-r.grownRun);
});

test('a static board holds still and shrinks to fit rather than losing rows', async ({ page }) => {
  await toApp(page);

  const r = await inTemplate<{ transform: string; rows: number; short: number; longFits: boolean; longRows: number }>(
    page,
    'cr05',
    `
    w.play(); await new Promise((r) => setTimeout(r, 900));
    const box = () => d.querySelector('.credits-box');
    const transform = w.getComputedStyle(d.querySelector('#credits-track')).transform;
    const rows = d.querySelectorAll('.credits-row').length;
    const short = Math.round(box().getBoundingClientRect().height);
    // A day far longer than the design was drawn for: the board must fit it, not clip it.
    const long = Array.from({ length: 22 }, (_, i) => (8 + i) + ':00 | Session number ' + i + ' with a long descriptive title').join('\\n');
    w.update(JSON.stringify({ f0: long }));
    await new Promise((r) => setTimeout(r, 300));
    const rect = box().getBoundingClientRect();
    return { transform, rows, short, longFits: rect.height <= 1080 && rect.width <= 1920, longRows: d.querySelectorAll('.credits-row').length };
  `,
  );

  expect(r.transform, 'a board must never travel').toBe('none');
  expect(r.rows).toBe(6);
  expect(r.longRows, 'every scheduled item is still rendered').toBe(22);
  expect(r.longFits, 'the board must shrink into the frame instead of running off it').toBe(true);
});

// ── The editor round trip ────────────────────────────────────────────────────

test('a looping reel survives create, save and reopen with its motion intact', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Credit Reel' });

  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const t = useTemplateStore.getState().template;
    const data = parseAnimData(t.js);
    return {
      js: t.js,
      builds: (data?.steps ?? []).flatMap((s) => (s.dynamics ?? []).map((x) => x.build)),
    };
  });
  // The measured motion rides in the data as a NAME; the builder itself lives outside the
  // marked region, which is what lets the timeline show the reel without owning its maths.
  expect(before.builds).toContain('creditsLoop');

  // Save into the library, reload the app, reopen: the document must come back byte-identical.
  const id = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const t = useTemplateStore.getState().template;
    const { doc, error } = createGraphic(t, { name: 'Reel round trip', baseline: t });
    if (error) throw new Error(error);
    return doc.id;
  });
  // The save is accepted synchronously and lands a moment later; reloading first aborts it
  // (e2e/_durable.ts). The reload below is the whole point of the test, so wait for the disk.
  await settleDurableWrites(page);

  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  const after = await page.evaluate(async (graphicId) => {
    const { loadAllGraphics } = await import('/src/model/library.ts');
    const doc = loadAllGraphics().find((g) => g.id === graphicId);
    return doc?.template.js ?? null;
  }, id);

  expect(after).toBe(before.js);
});
