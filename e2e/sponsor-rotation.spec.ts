// It imports the catalog, so any template change selects it.
// covers: src/templates/**
//
// THE SPONSOR ROTATION FOLLOWS THE WALL CLOCK (docs/work-specs/obs-scenes/spec.md, AC-7 and the
// OS4 rules R1-R6). Every copy of a rotating sponsor bug shows the same partner at the same moment:
// one per OBS scene, a monitor beside it, a page reloaded mid-show. Before OS4 each page counted its
// own cycle from its own Take, so two copies drifted apart by however far apart they were loaded.
//
// Playwright's clock drives the page and its frames, PAUSED so it moves only when a test moves it
// (a flowing clock gives each frame its own offset): time is deterministic, and a jump of the
// system time with no timer fired is exactly a page that was throttled while hidden.

import { test, expect, type Page } from '@playwright/test';
import { toApp } from './_bench';

/** Build bug21 into named frames and answer what each shows; all in the app page. */
const HELPERS = `
  window.__rot = window.__rot || {};
  window.__boot = async (name) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const variant = Object.values(CATALOG).flat().find((v) => v.id === 'bug21');
    const old = window.__rot[name];
    if (old) old.frame.remove();
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;border:0;opacity:0.01;';
    document.body.appendChild(frame);
    await new Promise((res) => { frame.onload = res; frame.srcdoc = composeDocument(variant.create({})); });
    window.__rot[name] = { frame, win: frame.contentWindow, doc: frame.contentDocument };
  };
  window.__showing = (name) => {
    const all = Array.from(window.__rot[name].doc.querySelectorAll('.corner-bug-media'));
    return all.findIndex((el) => el.classList.contains('is-showing'));
  };
`;

async function boot(page: Page, name: string): Promise<void> {
  await page.evaluate(async ([helpers, n]) => {
    if (!(window as unknown as { __boot?: unknown }).__boot) new Function(helpers)();
    await (window as unknown as { __boot: (n: string) => Promise<void> }).__boot(n);
  }, [HELPERS, name] as const);
}

/** Run a frame's own global (play, noacgDispatch, ...) by name. */
async function call(page: Page, name: string, body: string): Promise<unknown> {
  return page.evaluate(([n, b]) => {
    const w = (window as unknown as { __rot: Record<string, { win: unknown }> }).__rot[n].win;
    return new Function('w', b)(w);
  }, [name, body] as const);
}

/** The cycle length and the wall clock's partner right now, as frame `name` reads them. */
async function wall(page: Page, name: string): Promise<{ period: number; now: number; slot: number }> {
  return (await call(
    page,
    name,
    `const p = w.sponsorTiming().period; const n = w.Date.now();
     return { period: p, now: n, slot: Math.floor(n / p) % 3 };`,
  )) as { period: number; now: number; slot: number };
}

async function showing(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => (window as unknown as { __showing: (n: string) => number }).__showing(n), name);
}

/** Move the clock to the middle of the next cycle, firing every timer on the way. */
async function toMidCycle(page: Page): Promise<number> {
  const { period, now } = await wall(page, 'a');
  await page.clock.runFor(Math.round(period - (now % period) + period / 2));
  return (await wall(page, 'a')).slot;
}

/** Move the clock to just before the next boundary: the partner must still be this cycle's. */
async function toJustBefore(page: Page): Promise<number> {
  const { period, now } = await wall(page, 'a');
  await page.clock.runFor(Math.round(period - (now % period) - 600));
  return (await wall(page, 'a')).slot;
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T10:00:00Z') });
  await toApp(page);
  await page.clock.pauseAt(new Date('2026-11-12T10:01:00Z'));
});

test('two copies loaded at different times show the same partner, the wall clock\'s, every cycle', async ({ page }) => {
  await boot(page, 'a');
  await call(page, 'a', 'w.play();');
  // Take the second copy 2 s before a boundary: a timer armed at its own Take would then end its
  // first hold about 2 s before the following boundary, so the "just before" reads below see it.
  const { period, now } = await wall(page, 'a');
  await page.clock.runFor(Math.round(period - (now % period) + period - 2000));
  await boot(page, 'b');
  await call(page, 'b', 'w.play();');

  for (let i = 0; i < 4; i++) {
    const slot = await toMidCycle(page);
    expect(await showing(page, 'a'), `cycle ${i}: the first copy`).toBe(slot);
    expect(await showing(page, 'b'), `cycle ${i}: the copy taken a cycle and more later`).toBe(slot);
    // Same MOMENT, not only same cycle: neither changes before the boundary (a timer armed at a
    // copy's own Take would).
    const before = await toJustBefore(page);
    expect(await showing(page, 'a'), `cycle ${i}: just before the boundary`).toBe(before);
    expect(await showing(page, 'b'), `cycle ${i}: just before the boundary`).toBe(before);
  }
});

test('a page throttled for a minute, and a reloaded one, rejoin the cycle within one change', async ({ page }) => {
  await boot(page, 'a');
  await call(page, 'a', 'w.play();');
  await page.clock.runFor(1500);
  await toMidCycle(page);

  // Hidden and throttled: a minute of wall time with no timer and no frame run, then it runs again.
  const { period, now } = await wall(page, 'a');
  const later = now + 60_000;
  await page.clock.setSystemTime(later - (later % period) + period / 2);
  await page.clock.runFor(700);
  expect(await showing(page, 'a'), 'joined at its first read').toBe((await wall(page, 'a')).slot);
  // Its own timer, armed before the jump, is never trusted: the copy stays on the wall clock.
  for (let i = 0; i < 3; i++) {
    const slot = await toMidCycle(page);
    expect(await showing(page, 'a')).toBe(slot);
  }

  // Hidden the way a browser really throttles: reads go on, drawing stops, so the crossfade fired
  // at a boundary stalls across later ones. When drawing resumes it lands on the wall's partner,
  // not the stalled cycle's.
  await call(page, 'a', 'w.gsap.globalTimeline.pause();');
  await page.clock.runFor(Math.round(period * 2.25));
  await call(page, 'a', 'w.gsap.globalTimeline.resume();');
  await page.clock.runFor(700);
  expect(await showing(page, 'a'), 'a stalled crossfade lands on the current cycle').toBe((await wall(page, 'a')).slot);

  // A reload recovers by snapping on air with timers (docs/CLOUD_PLAYOUT.md section 3), as a scene
  // link's settled Take does.
  // Snapped 240 ms before a boundary, so it joins inside the crossfade's lead: it must still make
  // that boundary's change, not skip a cycle. The boundary is one whose partner is not the slot a
  // fresh copy shows (0), so a skipped change is visible.
  await boot(page, 'a2');
  const at = await wall(page, 'a');
  let next = Math.floor(at.now / at.period) + 2;
  while (next % 3 === 0) next++;
  await page.clock.runFor(Math.round(next * at.period - 240 - at.now));
  await call(page, 'a2', 'const g = w.noacgMachine.groups[0]; w.noacgSnap({ [g.id]: g.defaultPath[0] }, { timers: true });');
  for (let i = 0; i < 2; i++) {
    const slot = await toMidCycle(page);
    expect(await showing(page, 'a2')).toBe(slot);
    expect(await showing(page, 'a')).toBe(slot);
  }
});

test('off air, parked or held nothing moves; Resume rejoins the wall clock', async ({ page }) => {
  // Off air: the first slot from load, as the catalog's load-state fingerprint expects.
  await boot(page, 'idle');
  await page.clock.runFor(20_000);
  expect(await showing(page, 'idle')).toBe(0);

  // Parked on air (a measurement or the editor's preview): no timer, so no rotation.
  await call(page, 'idle', 'const g = w.noacgMachine.groups[0]; w.noacgSnap({ [g.id]: g.defaultPath[0] }, { timers: false });');
  await page.clock.runFor(20_000);
  expect(await showing(page, 'idle')).toBe(0);

  await boot(page, 'a');
  await call(page, 'a', 'w.play();');
  await page.clock.runFor(1500);
  await toMidCycle(page);
  await call(page, 'a', 'w.noacgDispatch("hold");');
  const held = await showing(page, 'a');
  await toMidCycle(page);
  await toMidCycle(page);
  expect(await showing(page, 'a'), 'held across two boundaries').toBe(held);

  // Resume crossfades to the next partner at once, as it always did, then the next boundary brings
  // it back onto the wall clock.
  await call(page, 'a', 'w.noacgDispatch("resume");');
  await page.clock.runFor(700);
  expect(await showing(page, 'a'), 'Resume advances one').toBe((held + 1) % 3);
  for (let i = 0; i < 2; i++) {
    const slot = await toMidCycle(page);
    expect(await showing(page, 'a'), 'rejoined').toBe(slot);
  }
});
