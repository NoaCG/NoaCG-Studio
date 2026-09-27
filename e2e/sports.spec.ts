// covers: src/templates/{scoreboards/**,types/{sportsBugs.ts,scoreboard.ts}}
//
// This spec iterates the CATALOG, so a design added anywhere under src/templates/ must select it -
// a new esports design touches no scoreboards path. Measured on 2026-08-08, when ten designs landed
// with every branch gate green.
// covers: src/templates/**

import { enableAdvancedMode } from './_create';
import { test, expect, type Page } from '@playwright/test';

// THE SPORTS PACK (docs/SPORTS_PACK.md) — the conformance and behaviour suite for the eight
// sports graphic types and their thirty-two designs.
//
// `graphic-types.spec.ts` already holds every registered type to the shape bar (it parses, it
// validates, its parts resolve, its control events are authored). This file covers what is
// specific to a live sports graphic and what the shape checks cannot see:
//
//   - a clock that has to RUN, hold where it is, reset to the period's own start, and accept a
//     correction typed into it on air;
//   - scores that survive being hammered, because an operator holding a keypad in the 89th
//     minute is the normal case, not the stress case;
//   - club names that are longer than the strip they are in, and crests that were never
//     uploaded — both of which are the DEFAULT state for the amateur half of the pack;
//   - the repeating-data boards rebuilding from whatever was pasted into them;
//   - the whole set surviving export.

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape');
}

/** Boot one catalog variant into a hidden frame and hand back its window. */
const HARNESS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function boot(id) {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    let variant = null;
    for (const list of Object.values(CATALOG)) {
      const hit = (list || []).find((v) => v.id === id);
      if (hit) variant = hit;
    }
    const tpl = variant.create({});
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await sleep(60);
    return { tpl, w: f.contentWindow, d: f.contentDocument, frame: f };
  }
`;

/** Every design the sports pack ships, by the type it belongs to. */
const SCOREBOARD_IDS = [
  'sb05', 'sb06', 'sb07', 'sb08', 'sb09', 'sb10', 'sb11', 'sb12',
  'sb13', 'sb14', 'sb15', 'sb16', 'sb17', 'sb18', 'sb19', 'sb20',
];
const BOARD_IDS = [
  'ig26', 'ig27', 'ig28', 'ig29',
];

test('the sports pack ships five types, every one carrying designs, and fills every family cell', async ({ page }) => {
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const SPORTS = ['scorebug','match-board','match-status','match-event','fixtures'];
    const FAMILIES = ['noacg','sport','glass','minimal'];
    const rows = [];
    for (const type of TYPES) {
      if (!SPORTS.includes(type.id)) continue;
      rows.push({
        id: type.id,
        designs: type.designs.length,
        // The matrix cell rule: a pack may pick any family, so every cell has to be filled or
        // resolvePack throws at config time rather than at create time.
        missingFamilies: FAMILIES.filter((f) => !type.designs.some((d) => d.styleTag === f)),
      });
    }
    return rows;
  })()`);
  const rows = report as Array<{ id: string; designs: number; missingFamilies: string[] }>;
  expect(rows.map((r) => r.id).sort()).toEqual(
    ['fixtures', 'match-board', 'match-event', 'match-status', 'scorebug'],
  );
  expect(rows.filter((r) => r.missingFamilies.length)).toEqual([]);
  // Every type carries designs - the claim. The TOTAL is not asserted: it is whatever the pack
  // has been curated to, and a literal here fails on catalog growth while catching nothing the
  // per-type check and the family-cell rule above would not also trip.
  expect(rows.filter((r) => r.designs === 0)).toEqual([]);
});

test('the match clock runs, holds where it is, and resets to the period start', async ({ page }) => {
  test.setTimeout(90_000);
  await toApp(page);
  // sb06 counts DOWN from 12:00 (basketball / ice hockey shaped); sb05 counts UP from 0:00.
  // Both directions matter: a countdown that does not stop itself at zero would run negative,
  // and a count-up that reset to zero on a restart would lose the first half.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const read = (d) => d.querySelector('.scoreboard-clock').textContent;

    const down = await boot('sb06');
    down.w.startMatchClock();
    await sleep(2400);
    const ran = read(down.d);
    down.w.stopMatchClock();
    const held = read(down.d);
    await sleep(1600);                       // a held clock must read the same afterwards
    const stillHeld = read(down.d) === held;
    down.w.resetMatchClock();
    const reset = read(down.d);
    down.frame.remove();

    const up = await boot('sb05');
    up.w.startMatchClock();
    await sleep(2400);
    const counted = read(up.d);
    up.frame.remove();
    return { ran, held, stillHeld, reset, counted };
  })()`);
  const r = result as Record<string, string | boolean>;
  // Counting DOWN: 12:00 is where it starts, so two seconds of running must be below it.
  expect(r.ran).not.toBe('12:00');
  expect(r.stillHeld).toBe(true);
  // Reset returns to the period's OWN start, never to zero-by-assumption.
  expect(r.reset).toBe('12:00');
  // Counting UP: two seconds of running must be above 0:00.
  expect(r.counted).not.toBe('0:00');
});

test('an operator can correct the clock on air by typing into it', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // Every live clock drifts from the stadium's. If a correction were overwritten by the next
  // tick a second later, the operator's fix would look broken and they would stop trusting it.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb05');
    w.startMatchClock();
    await sleep(1200);
    w.update(JSON.stringify({ f5: '43:12' }));
    const applied = d.querySelector('.scoreboard-clock').textContent;
    await sleep(2200);                       // the tick must continue FROM the correction
    const after = d.querySelector('.scoreboard-clock').textContent;
    w.stopMatchClock();
    return { applied, after };
  })()`);
  const r = result as { applied: string; after: string };
  expect(r.applied).toBe('43:12');
  // It kept counting up from what was typed, rather than snapping back to where it had been.
  expect(Number(r.after.split(':')[0])).toBe(43);
  expect(r.after).not.toBe('43:12');
});

test('a score bump on air does not pull the running clock back', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // THE ON-AIR CASE THIS EXISTS FOR. Every Take, ✎ Update and Snap sends the cue's WHOLE value
  // set over the wire (control/hostedControl.ts), so an operator adding a goal in the 64th
  // minute resends the clock field too — carrying whatever was last typed into it, not what the
  // clock has ticked to. Re-seeding from that is indistinguishable from a correction unless the
  // runtime compares against the last value it RECEIVED: the element's own text is the ticked
  // time, so it differs from the resent value on every single update.
  //
  // Measured before the fix: the clock jumped back to its typed value on every score change.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb05');
    const clock = () => d.querySelector('.scoreboard-clock').textContent;
    // The operator sets the clock once, the way they would after a kick-off correction.
    w.update(JSON.stringify({ f1: '0', f3: '0', f5: '20:00' }));
    w.startMatchClock();
    await sleep(2200);
    const running = clock();                 // the clock has ticked past what was typed
    // A goal. The score changes; the clock field rides along UNCHANGED, as the wire sends it.
    w.update(JSON.stringify({ f1: '1', f3: '0', f5: '20:00' }));
    const afterGoal = clock();
    // A second update with the clock still unchanged must be just as harmless.
    w.update(JSON.stringify({ f1: '1', f3: '1', f5: '20:00' }));
    const afterSecond = clock();
    // And a REAL correction must still take, or the fix would have broken the thing it guards.
    w.update(JSON.stringify({ f1: '1', f3: '1', f5: '43:12' }));
    const corrected = clock();
    w.stopMatchClock();
    return { running, afterGoal, afterSecond, corrected, score: d.querySelector('#f1').textContent };
  })()`);
  const r = result as Record<string, string>;
  expect(r.running).not.toBe('20:00');       // it really was running, or the test proves nothing
  expect(r.afterGoal).toBe(r.running);       // the goal left the clock exactly where it stood
  expect(r.afterSecond).toBe(r.running);
  expect(r.score).toBe('1');                 // and the score still arrived
  expect(r.corrected).toBe('43:12');         // a genuine correction is still obeyed
});

test('a score bump does not pull the clock back when the ORIGIN arrived over the wire', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // THE SEAM THE TEST ABOVE CANNOT SEE, and it aired (found 2026-08-21). That one calls
  // startMatchClock() directly, so the runtime mints its own LOCAL origin and `matchClockSent`
  // stays the plain "20:00" the operator typed — a resend of "20:00" then matches exactly and
  // the guard fires. On the HOSTED plane the origin arrives over the WIRE instead: /output
  // stamps the clock field on clockStart (control/matchClockWire.ts), so what the runtime last
  // received is "20:00@1755600000000" while the cue still stores "20:00".
  //
  // Comparing the whole of those two says CHANGED, so a goal in the 5th minute read as a typed
  // correction and re-anchored a running clock back to 20:00, on air. The stamp is OURS, not the
  // operator's: it is the PLAIN HALF that has to be compared.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb05');
    const clock = () => d.querySelector('.scoreboard-clock').textContent;
    // The take: the cue's own plain value. Then the origin write a control surface makes when
    // the operator starts the clock — the same shape output/main.ts puts on the wire.
    w.update(JSON.stringify({ f1: '0', f3: '0', f5: '20:00' }));
    w.update(JSON.stringify({ f5: '20:00@' + Date.now() }));
    await sleep(2200);
    const running = clock();                 // ticking, anchored to the wire's origin
    // A goal. The cue's WHOLE value set goes again, and a cue stores a plain time forever.
    w.update(JSON.stringify({ f1: '1', f3: '0', f5: '20:00' }));
    const afterGoal = clock();
    await sleep(1100);
    const stillRunning = clock();            // and it is still counting, not restarted
    // A REAL correction must still take, or the guard would have swallowed the one edit that
    // matters most: a clock that cannot be corrected is a clock nobody trusts.
    w.update(JSON.stringify({ f1: '1', f3: '1', f5: '43:12' }));
    const corrected = clock();
    w.stopMatchClock();
    return { running, afterGoal, stillRunning, corrected, score: d.querySelector('#f1').textContent };
  })()`);
  const r = result as Record<string, string>;
  expect(r.running).not.toBe('20:00');       // it really was running, or the test proves nothing
  expect(r.afterGoal).toBe(r.running);       // the goal left the clock exactly where it stood
  expect(r.stillRunning).not.toBe(r.running); // …and it kept going, rather than being re-seeded
  expect(r.score).toBe('1');
  expect(r.corrected).toBe('43:12');         // a genuine correction is still obeyed
});

test('a clock value carries the instant it was true, so a fresh renderer opens at the real match time', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // THE LIVE FAULT THIS EXISTS FOR (2026-08-19). A match clock used to be a counter each
  // renderer incremented once a second in its own memory, so the number existed nowhere else: a
  // browser source RELOADED at 67 minutes came back at 0:00, on air, with nothing on the
  // operator's screen saying so. Two renderers started a second apart also stayed a second
  // apart for the whole match, and a background tab (Chromium throttles those timers to roughly
  // one a minute) simply fell behind.
  //
  // The clock's value now carries the instant it was true — "45:00@<epoch ms>" — and every
  // renderer paints value ± elapsed. A document that has never seen the match therefore opens
  // at the right time from the value alone, and two documents fed the same string agree.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const read = (d) => d.querySelector('.scoreboard-clock').textContent;
    const stamp = (time, agoMs) => time + '@' + (Date.now() - agoMs);

    // A renderer opening cold into the 67th minute: 45:00, true 22 minutes ago.
    const rebooted = await boot('sb05');
    const started = stamp('45:00', 22 * 60 * 1000);
    rebooted.w.update(JSON.stringify({ f5: started }));
    const recovered = read(rebooted.d);
    await sleep(1300);
    const kept = read(rebooted.d);          // and it is RUNNING, not a frozen recovered number

    // A SECOND renderer, fed the same string a moment later, must read the same second.
    const second = await boot('sb05');
    second.w.update(JSON.stringify({ f5: started }));
    const agree = read(second.d) === read(rebooted.d);

    // Re-sending the identical stamped value is idempotent — the whole point of the syntax,
    // since every Take and Update re-sends the cue's whole value set.
    rebooted.w.update(JSON.stringify({ f1: '2', f5: started }));
    const afterResend = read(rebooted.d);
    const score = rebooted.d.querySelector('#f1').textContent;

    // A counting-DOWN clock reads the other way from the same origin.
    const down = await boot('sb06');
    down.w.update(JSON.stringify({ f5: stamp('12:00', 90 * 1000) }));
    const counted = read(down.d);

    rebooted.frame.remove(); second.frame.remove(); down.frame.remove();
    return { recovered, kept, agree, afterResend, counted, score };
  })()`);
  const r = result as Record<string, string | boolean>;
  // 45:00 plus 22 minutes. Not 45:00, and emphatically not 0:00.
  expect(r.recovered).toBe('67:00');
  expect(r.kept).not.toBe('67:00');
  expect(r.agree).toBe(true);
  // The score bump did not pull the clock back to where the stamp says it started.
  expect(String(r.afterResend).split(':')[0]).toBe('67');
  expect(r.afterResend).not.toBe('45:00');
  expect(r.score).toBe('2');                 // and the value that WAS edited still arrived
  // Counting down: 12:00 less 90 seconds.
  expect(r.counted).toBe('10:30');
});

test('a counting-down period stops itself at zero and says so', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // The period ends when the clock does, and nobody presses anything to make that true.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb06');
    w.update(JSON.stringify({ f5: '0:02' }));
    w.startMatchClock();
    await sleep(3000);
    return {
      clock: d.querySelector('.scoreboard-clock').textContent,
      expired: d.querySelector('.scoreboard').classList.contains('scoreboard-expired'),
      // Starting a spent clock again must be a no-op, not a run into negative time.
      restarted: (function () { w.startMatchClock(); return d.querySelector('.scoreboard-clock').textContent; })(),
    };
  })()`);
  expect(result).toMatchObject({ clock: '0:00', expired: true, restarted: '0:00' });
});

test('the match state groups move independently and refuse illegal moves', async ({ page }) => {
  test.setTimeout(90_000);
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb05');
    const groups = () => w.noacgMachineState().groups;
    w.play();
    await sleep(400);

    // A score change is DATA: the numbers move, no pointer does.
    const before = JSON.stringify(groups());
    w.update(JSON.stringify({ f1: '3', f3: '2' }));
    await sleep(120);
    const dataMovedNothing = JSON.stringify(groups()) === before;

    // Three unrelated facts, three groups, dispatched in one tick.
    w.noacgDispatch('clockStart');
    w.noacgDispatch('interval');
    w.noacgDispatch('final');
    const settled = groups();

    // The result group is one-way: a match does not un-finish, so the repeat is dropped.
    w.noacgDispatch('final');
    const repeatDropped = groups().result === 'final';
    return { dataMovedNothing, score: d.getElementById('f1').textContent, settled, repeatDropped };
  })()`);
  expect(result).toMatchObject({
    dataMovedNothing: true,
    score: '3',
    settled: { clock: 'running', play: 'interval', result: 'final' },
    repeatDropped: true,
  });
});

test('the status card walks live to the interval to full time, and refuses to walk back', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // The three states are mutually exclusive here (unlike the boards' parallel groups): a card
  // cannot be at half time and finished at once, and a finished match cannot go back to live.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w } = await boot('sb13');
    const at = () => w.noacgMachineState().groups.status;
    w.play();
    await sleep(300);
    const live = at();
    w.noacgDispatch('interval');
    const interval = at();
    w.noacgDispatch('final');
    const final = at();
    w.noacgDispatch('resumePlay');
    return { live, interval, final, afterIllegalResume: at() };
  })()`);
  expect(result).toMatchObject({ live: 'live', interval: 'interval', final: 'final', afterIllegalResume: 'final' });
});

test('the event card can be held on air, and cleared', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // A card left up through the next passage of play is the commonest live-graphics mistake, so
  // the card clears itself on a timer. Hold takes it out of the timer's reach for the ones that
  // should stay (a red card); next clears it early.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w } = await boot('sb17');
    const at = () => w.noacgMachineState().groups.main;
    w.play();
    await sleep(400);
    const onAir = at();
    w.noacgDispatch('hold');
    const held = at();
    await sleep(600);
    const stillHeld = at();
    w.noacgDispatch('next');
    return { onAir, held, stillHeld, cleared: at() };
  })()`);
  const r = result as Record<string, string>;
  expect(r.held).toBe('held');
  expect(r.stillHeld).toBe('held');
  expect(r.cleared).toBe('off');
  expect(r.onAir).not.toBe('held');
});

test('rapid score updates all land, and never leave a score mid-pop', async ({ page }) => {
  test.setTimeout(90_000);
  await toApp(page);
  // An operator holding a keypad in the 89th minute is the normal case. Every update must land,
  // the last one must win, and the score-pop tween must not freeze a digit enlarged.
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { w, d } = await boot('sb05');
    w.play();
    await sleep(300);
    for (let i = 1; i <= 40; i++) {
      w.update(JSON.stringify({ f1: String(i), f3: String(40 - i) }));
    }
    await sleep(900);
    const mask = d.getElementById('f1').parentNode;
    const scale = w.getComputedStyle(mask).transform;
    // stop() kills the pops; nothing may be left enlarged afterwards.
    w.stop();
    await sleep(500);
    return {
      home: d.getElementById('f1').textContent,
      away: d.getElementById('f3').textContent,
      afterStop: w.getComputedStyle(mask).transform,
      poppedWhileLive: scale,
    };
  })()`);
  const r = result as Record<string, string>;
  expect(r.home).toBe('40');
  expect(r.away).toBe('0');
  // A settled mask is identity (or unset) — never a frozen scale from a killed pop.
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(r.afterStop);
});

test('long club names never change a fixed strip’s height, and never leave the frame', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  // The amateur half of the pack ships full club names by default, and a viewer's club may be
  // "Borussia Mönchengladbach Reserves". A scorebug that grows taller mid-match moves
  // everything the director framed around it, so the fixed strips clip rather than wrap.
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const LONG = 'Borussia Mönchengladbach Reserves II';
    // A score widens by DIGIT COUNT, not by a long word, so it needs its own worst case — and
    // it needs one at all only because the scores became number fields: a filter on textfield
    // alone silently stopped stressing them, leaving a strip that grows on the first
    // three-figure basketball score to pass this test forever.
    const BIG_SCORE = '188';
    const FIXED_STRIPS = ['sb05', 'sb06', 'sb07'];
    const out = [];
    for (const id of ${JSON.stringify(SCOREBOARD_IDS)}) {
      const { tpl, w, d, frame } = await boot(id);
      const box = d.querySelector('.scoreboard-box');
      const before = box.getBoundingClientRect();
      const payload = {};
      for (const f of tpl.fields) {
        if (f.ftype === 'textfield') payload[f.field] = LONG;
        else if (f.ftype === 'number') payload[f.field] = BIG_SCORE;
      }
      w.update(JSON.stringify(payload));
      await sleep(150);
      const after = box.getBoundingClientRect();
      out.push({
        id,
        grew: Math.round(after.height) - Math.round(before.height),
        inFrame: after.right <= 1920 && after.bottom <= 1080 && after.left >= -1 && after.top >= -1,
        fixed: FIXED_STRIPS.includes(id),
      });
      frame.remove();
    }
    return out;
  })()`);
  const rows = report as Array<{ id: string; grew: number; inFrame: boolean; fixed: boolean }>;
  expect(rows.filter((r) => !r.inFrame).map((r) => r.id)).toEqual([]);
  // The three fixed strips must not move at all; the growing cards may, but only a little.
  expect(rows.filter((r) => r.fixed && r.grew !== 0).map((r) => `${r.id} grew ${r.grew}px`)).toEqual([]);
  expect(rows.filter((r) => r.grew > 140).map((r) => `${r.id} grew ${r.grew}px`)).toEqual([]);
});

test('recovery leaves no machinery on air: no colour hex, no period source, no stale full-time wash', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  // THE RECOVERY DRILL, which is the whole point of a scoreboard being a long-running graphic:
  // an output renderer reboots mid-match and rebuilds itself with data-then-snap. Two things
  // have to survive that, and neither did.
  //
  //  1. The hidden holders. A board keeps its club colours and its period breakdown in holders
  //     the runtime reads and the viewer must never see. Hiding them with an inline style is
  //     not enough: the entrance reset clears inline props off every descendant, so the reset
  //     itself is what puts "#f6a623" and "Q1 | 24 | 19" on air.
  //  2. The state markers. A snap replays states with callbacks suppressed and skips any group
  //     already at its initial, and the reset clears inline styles but never CLASSES - so the
  //     full-time wash and the interval treatment outlive both, and a board recovered at 0-0
  //     comes back still wearing FULL TIME.
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = [];
    for (const id of ['sb05', 'sb09', 'sb13']) {
      const { w, d, frame } = await boot(id);
      w.play();
      await sleep(400);
      // Take the match to full time, then through an interval treatment on the way there.
      w.noacgDispatch('final');
      await sleep(400);
      // Recovery, both halves and in order: the data half, then the visual half.
      w.update(JSON.stringify({ f1: '0', f3: '0' }));
      w.noacgSnap(null);
      w.update(JSON.stringify({ f1: '0', f3: '0' }));
      await sleep(400);
      const visibleText = (sel) => {
        const el = d.querySelector(sel);
        if (!el) return null;
        const cs = w.getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' ? null : (el.textContent || '').trim();
      };
      // Read the ROOT's own class list. Matching against markup would be a false positive:
      // the runtime's source names these classes, so a body-text search reports the fix itself.
      const root = d.querySelector('.scoreboard');
      const rootClasses = root ? String(root.className) : '';
      out.push({
        id,
        colourA: visibleText('.scoreboard-colour-a'),
        colourB: visibleText('.scoreboard-colour-b'),
        periods: visibleText('.scoreboard-periods-src'),
        markers: ['scoreboard-final', 'scoreboard-break', 'scoreboard-expired']
          .filter((c) => rootClasses.split(/\\s+/).indexOf(c) !== -1),
      });
      frame.remove();
    }
    return out;
  })()`);
  const rows = report as Array<Record<string, unknown>>;
  // Nothing the runtime keeps for itself may be readable on air after a recovery.
  expect(rows.filter((r) => r.colourA !== null).map((r) => `${r.id}: colour A holder visible ("${r.colourA}")`)).toEqual([]);
  expect(rows.filter((r) => r.colourB !== null).map((r) => `${r.id}: colour B holder visible ("${r.colourB}")`)).toEqual([]);
  expect(rows.filter((r) => r.periods !== null).map((r) => `${r.id}: period source visible ("${r.periods}")`)).toEqual([]);
  // And the visual half of reset has to actually reset the LOOK, not just the inline styles.
  expect(
    rows.filter((r) => (r.markers as string[]).length)
      .map((r) => `${r.id}: state marker(s) survived the reset — ${(r.markers as string[]).join(', ')}`),
  ).toEqual([]);
});

test('a missing crest shows the design’s placeholder, not a broken image', async ({ page }) => {
  test.setTimeout(90_000);
  await toApp(page);
  // Most club and amateur broadcasts will never upload a crest, so EMPTY is the default state
  // of these slots and it has to look deliberate. Setting one and clearing it again must also
  // return cleanly — an operator correcting the wrong club's badge does exactly that.
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = [];
    for (const id of ['sb09', 'sb10', 'sb11', 'sb12']) {
      const { w, d, frame } = await boot(id);
      const slot = d.querySelector('.scoreboard-crest');
      const img = slot.querySelector('img');
      const emptyHidden = w.getComputedStyle(img).display === 'none' || !img.getAttribute('src');
      const emptyHasPlaceholder = !slot.classList.contains('has-image');
      w.update(JSON.stringify({ f9: 'images/crest.png' }));
      const filled = slot.classList.contains('has-image');
      w.update(JSON.stringify({ f9: '' }));
      const clearedAgain = !slot.classList.contains('has-image');
      out.push({ id, emptyHidden, emptyHasPlaceholder, filled, clearedAgain });
      frame.remove();
    }
    return out;
  })()`);
  for (const row of report as Array<Record<string, unknown>>) {
    expect(row, `crest handling for ${row.id}`).toMatchObject({
      emptyHidden: true, emptyHasPlaceholder: true, filled: true, clearedAgain: true,
    });
  }
});

test('the repeating boards rebuild from whatever is pasted into them', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  // The canonical repeating-data contract: one item per line, "|" between the parts, malformed
  // lines skipped rather than rendered as a broken row. That last rule is what keeps a
  // half-typed substitution off air.
  const report = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = [];
    for (const id of ${JSON.stringify(BOARD_IDS)}) {
      const { w, d, frame } = await boot(id);
      const count = () => d.querySelectorAll('#infographic-rows > *').length;
      const initial = count();

      // Three valid rows, carrying MARKUP inside a text part: operator text reaches the DOM
      // through innerHTML and has to arrive as text. The mixed shapes are deliberate — a row
      // WITH a result and a row without both have to render from the one runtime.
      const pick = 'SAT | A<b>C</b> Milan | 1-0 | B\\nSUN | C | D\\nMON | E | 2-2 | F';
      w.update(JSON.stringify({ f0: pick }));
      await sleep(80);
      const afterValid = count();
      // The markup must have been escaped into text, not parsed into an element.
      const escaped = !d.querySelector('#infographic-rows b')
        && d.getElementById('infographic-rows').textContent.indexOf('<b>') !== -1;

      // Now the junk an operator actually produces mid-move: blank lines, whitespace-only
      // lines, and half-typed separators. None of these is a row in ANY of the four shapes,
      // and each must be skipped rather than rendered as an empty box.
      w.update(JSON.stringify({ f0: pick + '\\n\\n   \\n|\\n||\\n | | ' }));
      await sleep(80);
      const afterJunk = count();

      // Emptying the source must empty the board, not leave the last render on air.
      w.update(JSON.stringify({ f0: '' }));
      await sleep(80);
      const afterEmpty = count();
      out.push({ id, initial, afterValid, afterJunk, escaped, afterEmpty });
      frame.remove();
    }
    return out;
  })()`);
  for (const row of report as Array<Record<string, number | boolean | string>>) {
    expect(row, `repeating data for ${row.id}`).toMatchObject({
      afterValid: 3,
      // The junk added no rows and ran no markup.
      afterJunk: 3,
      escaped: true,
      afterEmpty: 0,
    });
    expect(Number(row.initial), `${row.id} renders its own samples`).toBeGreaterThan(0);
  }
});

test('every sports graphic exports through every target', async ({ page }) => {
  test.setTimeout(300_000);
  await toApp(page);
  // The export gate is what "production-ready" means here: a graphic that cannot ship is not a
  // graphic. Every target, every design — including the ones carrying a state machine, whose
  // interpreter has to travel with them.
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const ids = ${JSON.stringify([...SCOREBOARD_IDS, ...BOARD_IDS])};
    const byId = {};
    for (const list of Object.values(CATALOG)) for (const v of (list || [])) byId[v.id] = v;
    const out = [];
    for (const id of ids) {
      const tpl = byId[id].create({});
      const verdict = validateTemplate(tpl);
      const failures = [];
      if (!verdict.ok) failures.push('validation: ' + verdict.errors.map((e) => e.rule).join(','));
      for (const target of EXPORT_TARGETS) {
        try {
          const zip = await target.build(tpl);
          const names = Object.keys(zip.files);
          if (!names.length) failures.push(target.id + ': empty package');
        } catch (e) {
          failures.push(target.id + ': ' + String(e));
        }
      }
      out.push({ id, failures });
    }
    return out;
  })()`);
  const rows = report as Array<{ id: string; failures: string[] }>;
  // Every id the page was handed came back with a verdict - derived from the list above rather
  // than restated as a literal, so curating the pack cannot make this fail on arithmetic.
  expect(rows.map((r) => r.id)).toEqual([...SCOREBOARD_IDS, ...BOARD_IDS]);
  expect(rows.filter((r) => r.failures.length).map((r) => `${r.id}: ${r.failures.join(' | ')}`)).toEqual([]);
});

test('every sports design keeps its state machine paired with a machine-aware interpreter', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  // THE PAIRING RULE (src/templates/CLAUDE.md): machine-bearing data must never land under an
  // interpreter that predates the engine, or the graphic's buttons would silently do nothing.
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { validateMachine, spxSteps } = await import('/src/blocks/animMachine.ts');
    const { hasMachineRuntime } = await import('/src/templates/shared/animRuntime.ts');
    const ids = ${JSON.stringify(SCOREBOARD_IDS)};
    const byId = {};
    for (const list of Object.values(CATALOG)) for (const v of (list || [])) byId[v.id] = v;
    return ids.map((id) => {
      const tpl = byId[id].create({});
      const data = parseAnimData(tpl.js);
      return {
        id,
        hasMachine: !!data.machine,
        pairedRuntime: hasMachineRuntime(tpl.js),
        machineErrors: data.machine ? validateMachine(data).errors : [],
        stepsDerived: String(spxSteps(data)) === tpl.settings.steps,
      };
    });
  })()`);
  for (const row of report as Array<Record<string, unknown>>) {
    expect(row, `machine pairing for ${row.id}`).toMatchObject({
      hasMachine: true, pairedRuntime: true, machineErrors: [], stepsDerived: true,
    });
  }
});
