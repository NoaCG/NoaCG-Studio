import { test, expect } from '@playwright/test';
import { enableAdvancedMode } from './_create';

// A SETTLED COUNTING GRAPHIC MUST SHOW ITS REAL FIGURE.
//
// Every surface that shows a graphic without a playback gesture - a Home card, a library
// thumbnail, the Browse grid, the operator's preview before the first take, the editor canvas -
// jumps the entrance to its end with GSAP's callbacks SUPPRESSED (preview/settleGraphic.ts,
// preview/simulatorRuntime.ts). A tween still writes its target under that jump; a callback does
// not. So a readout whose digits only ever reach the DOM from an `onUpdate` settles reading
// whatever the opening `set` wrote, which is 0.
//
// That shipped. Measured on main 2026-08-26: ig01 "Big Stat" rendered `0%` against its own
// `data-target="87%"`, and seventeen readouts across eleven infographics did the same - the first
// thing a browsing user sees on a stat card was a broken number. Nothing in the tree measured it,
// so nothing said so. The fix is one `tl.set` per readout in the emitted runtime
// (templates/infographics/igMotion.ts, "THE SETTLE RULE"); this is the gate that would have
// caught it, and the gate that stops the next readout shipping without one.
//
// THE DESIGN SET IS DISCOVERED, NEVER LISTED. `data-target` is the mark a counting readout
// already carries - it is where the count reads its true figure from, so a readout without one
// cannot count at all - and the composed document is scanned for it before the design is
// rendered. A new counting design in any category is covered the day it lands, and a category
// list nobody remembers to update is not what stands between a broken number and air.

// AND THE ORACLE IS THE FIELD VALUE, NOT THE GRAPHIC'S OWN ATTRIBUTE.
//
// Every pass below used to read both halves of its claim off the live `data-target`: the
// expected figure AND the reading it was compared with. That is a tautology, and it hid the
// worst version of this bug rather than catching it. If anything ever rewrites a readout's
// `data-target` to "0" during a take, the count runs 0 -> 0 and LANDS ON ITS TARGET EXACTLY, so
// "the entrance ends on the real number" is satisfied by a graphic airing a zero - and the
// zero-figure exclusion each sweep carries ("a readout counting to zero has no zero form to tell
// apart from its target") then drops the row before any assertion sees it. The worse the fault,
// the more completely the gate excluded it. Filed 2026-09-04 as the hole a walk found while the
// acceptance item for the same code claimed the opposite.
//
// So the expected figure comes from OUTSIDE the graphic: the value this file typed into the
// field, which nothing the template does can rewrite. `figure()` compares them as NUMBERS, so a
// design that legitimately regroups "124213" into "124,213" or prefixes a currency mark still
// passes while "124,213" -> "0" cannot. A readout that is not a field element keeps the
// attribute comparison, plus the new one that matters most: its target must be the SAME FIGURE
// after the take as before it.

/**
 * The number inside a rendered figure - "€124,213" -> 124213, "42.3%" -> 42.3, "" -> null.
 *
 * It takes the FIRST number and treats every comma as a thousands separator, which is what makes
 * a regrouped "124,213" and a typed "124213" the same claim. Two shapes it would read wrongly, so
 * a design that grows one needs this widened rather than a special case: a readout whose leading
 * number is not its figure ("1 of 4,200"), and a comma used as a decimal mark ("12,5"). Neither
 * exists in the catalog today.
 */
function figure(text: string | null | undefined): number | null {
  const m = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** One design's settled reading: what the DOM shows against what the data says. */
interface Reading {
  id: string;
  el: string;
  target: string;
  text: string;
  /** The value this file typed into the field of that name, when the readout IS a field. */
  typed: string | null;
}

/** Every catalog design whose composed document carries the counting mark, settled by `recipe`,
 *  reported as one row per marked element. Runs inside the page because both settle recipes are
 *  serialized into the preview document itself and drive live GSAP objects. */
const SWEEP = (recipe: 'thumbnail' | 'canvas') => `(async () => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const { postPreviewCmd } = await import('/src/preview/previewProtocol.ts');
  const recipe = ${JSON.stringify(recipe)};
  const designs = []; const readings = []; let scanned = 0;
  for (const cat of Object.keys(CATALOG)) {
    for (const variant of CATALOG[cat]) {
      scanned++;
      const tpl = variant.create({});
      // THE MARK IS SCANNED FOR IN THE PLAIN DOCUMENT, never in the one a recipe composes. A
      // recipe serializes its own runtime into the page, and that runtime's source can carry the
      // words "data-target" itself: the simulator's did (a comment in runSimCommand), so on the
      // canvas recipe EVERY design matched - 527 of them rendered instead of 44, 2.9 minutes of a
      // 3-minute budget on an idle machine, and a timeout the day the machine was busy
      // (2026-09-21). The design is what carries the mark; the recipe is only how it is settled.
      if (!composeDocument(tpl, {}).includes('data-target')) continue;   // not a counting design
      // The REAL bootstrap in both cases: 'thumbnail' is composeDocument's settleWithData (the
      // shared settleGraphic recipe every card and thumbnail runs), 'canvas' is the editor's
      // simulate channel driven with the same sim-settle the PlayoutSimulator sends.
      const doc = composeDocument(tpl, recipe === 'canvas'
        ? { simulate: true }
        : { settleWithData: '{}' });
      // The design's OWN field defaults - which is what both recipes settle with, since neither
      // pushes data ('{}'). This is the expected figure the graphic cannot rewrite.
      const typed = {};
      for (const fl of tpl.fields) if (fl.field) typed[fl.field] = fl.value == null ? '' : String(fl.value);
      designs.push(variant.id);
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;';
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; f.srcdoc = doc; });
      await new Promise((r) => setTimeout(r, 150));
      if (recipe === 'canvas') {
        postPreviewCmd(f.contentWindow, { cmd: 'sim-settle', data: '{}' });
        await new Promise((r) => setTimeout(r, 150));
      }
      for (const el of f.contentWindow.document.querySelectorAll('[data-target]')) {
        readings.push({
          id: variant.id,
          el: el.id || el.className || el.tagName,
          target: (el.getAttribute('data-target') || '').trim(),
          text: (el.textContent || '').trim(),
          typed: (el.id && typed[el.id] !== undefined) ? typed[el.id] : null,
        });
      }
      f.remove();
    }
  }
  return { designs, readings, scanned };
})()`;

/** The rows where the graphic disagrees with its own data - a blank target is not a claim. */
const wrong = (readings: Reading[]) =>
  readings.filter((r) => r.target && r.text !== r.target)
    .map((r) => `${r.id} [${r.el}] shows "${r.text}" for data-target "${r.target}"`);

for (const recipe of ['thumbnail', 'canvas'] as const) {
  test(`every counting design settles on its real figure (${recipe})`, async ({ page }) => {
    test.setTimeout(180_000);
    await enableAdvancedMode(page);
    await page.goto('/app');
    await page.keyboard.press('Escape');

    const { designs, readings, scanned } = (await page.evaluate(SWEEP(recipe))) as {
      designs: string[];
      readings: Reading[];
      scanned: number;
    };

    // A discovery sweep that discovers nothing passes every assertion below it. These two bounds
    // are what makes the run a verdict: 44 designs carried the mark on 2026-08-27 (39
    // infographics, 5 vote boards) and 21 of them rendered a marked readout in the settled
    // entrance. Both are floors, not equalities - the catalog only grows.
    expect(designs.length, 'designs carrying the counting mark').toBeGreaterThan(30);
    // …and a mark EVERY design carries marks nothing. This is the ceiling that would have named
    // the canvas recipe's runtime matching all 527 designs, rather than letting it surface as a
    // timeout on a loaded machine. Half the catalog is far above any honest count.
    expect(designs.length, 'designs carrying the counting mark, of all scanned').toBeLessThan(scanned / 2);
    expect(readings.length, 'marked readouts in the settled frame').toBeGreaterThan(15);

    // 0 is exactly the failure this exists for, and it is reported as the whole list rather than
    // one row: seventeen of these broke from a single change, and a gate that names one of them
    // sends the next reader looking for seventeen separate faults.
    expect(wrong(readings), 'readouts disagreeing with their own data').toEqual([]);

    // …and the same claim measured against the FIELD VALUE instead of the attribute, which is
    // the half the assertion above cannot make: a readout whose `data-target` has itself been
    // rewritten agrees with its own data perfectly while showing the wrong number.
    expect(
      readings
        .filter((r) => figure(r.typed) !== null && figure(r.typed) !== figure(r.text))
        .map((r) => `${r.id} [${r.el}] settles on "${r.text}" for a field typed "${r.typed}"`),
      'readouts settling on a figure their field never carried',
    ).toEqual([]);
  });
}

// A PLAYED COUNTING GRAPHIC MUST COUNT UP FROM ZERO - it may never show its figure first.
//
// The other end of the same timeline, and the defect the owner hit playing a stat card from the
// playout dashboard: the final count, then a snap to zero, then the count up to the number that
// had just been on screen. A playout server writes the data BEFORE it takes the graphic - SPX,
// CasparCG and the dashboard all call update() and then play() - while the entrance empties each
// readout when its own count begins, a few tenths after the panel is already visible. Measured on
// main 2026-08-27 in that order: twelve readouts across ten designs, every counted readout in the
// catalog.
//
// THE ORDER IS THE TEST. Settling a graphic (above) never showed this, because a jump renders the
// zero and the figure in the same frame; only real playback has a gap to see. So this drives the
// real thing: update() with the design's own field defaults, play(), then a reading on every
// animation frame.
//
// WHICH READOUTS COUNT IS DISCOVERED, not listed - and not assumed from the mark either. update()
// writes data-target onto EVERY field, so the mark alone catches a static "94% COUNTED" caption
// that no builder ever touches. A readout COUNTS if its text changes at all while the entrance
// runs; that is the same claim the defect is about, measured rather than declared.

/** One design's played reading: what the readout showed the first frame it was visible. */
interface Played {
  id: string;
  el: string;
  /** The readout's `data-target` BEFORE the take - the operator's figure, uncorrupted. Empty on
   *  a cold take, which has written no target anywhere yet. */
  target: string;
  /** What the readout must come to rest on: the typed value, or its pre-take target. */
  expected: string;
  /** The value typed into the field of that name, when the readout IS a field. */
  typed: string | null;
  /** Did the entrance animate this readout at all - reported, never a reason to drop the row. */
  counts: boolean;
  /** What it showed the first frame it was visible, and when. Null if it never became visible. */
  first: string | null;
  frame: number | null;
  ended: string | null;
  /** …and its `data-target` AFTER the take. A take may not move this. */
  endedTarget: string | null;
}

/**
 * The two things both playback passes need in the page, defined once and interpolated into each.
 *
 * `markKey(el)` pairs a readout across a take. An id is unique; a class-named readout is numbered
 * among its OWN CLASS in document order, never among the marked elements - the entrance stamps
 * `data-target` on first play (`infographicStat`), so a set numbered off the mark renumbers across
 * the take and would pair one readout's landing figure with another's expectation.
 *
 * `expectedOf(m)` is the whole oracle in one line: the value the test typed wins, because it is
 * the one figure no part of the document can reach; the readout's own pre-take target is the
 * fallback, for the readouts a rebuild mints rather than an operator typing them.
 */
const MARK_JS = `
  const markKey = (el) => {
    if (el.id) return el.id;
    const cls = el.className || el.tagName;
    const kin = el.className ? d.getElementsByClassName(el.className) : [el];
    for (let i = 0; i < kin.length; i++) if (kin[i] === el) return cls + '#' + (i + 1);
    return cls + '#?';
  };
  const expectedOf = (m) => m.typed || m.target;
  const countable = (text) => {
    const v = parseFloat((text || '').replace(/,/g, ''));
    // A readout whose real figure IS zero has no zero form to tell apart from its target.
    return isFinite(v) && v !== 0;
  };
`;

/** Every catalog design carrying the counting mark, driven in the PLAYOUT order and reported as
 *  one row per readout the entrance actually counts. Runs inside the page: the graphic has to be
 *  a live document with a live GSAP clock, which is the whole point of this pass. */
const PLAYED = (seed: 'update' | 'markup') => `(async () => {
  const seed = ${JSON.stringify(seed)};
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const designs = []; const readings = [];
  for (const cat of Object.keys(CATALOG)) {
    for (const variant of CATALOG[cat]) {
      const tpl = variant.create({});
      const doc = composeDocument(tpl, {});      // no settle, no simulator - a plain playout document
      if (!doc.includes('data-target')) continue;
      designs.push(variant.id);
      const f = document.createElement('iframe');
      // ON SCREEN, deliberately: Chromium does not tick rAF in an iframe parked off the viewport,
      // so an off-screen play measures a graphic that never moved.
      f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;z-index:99999;border:0;';
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; f.srcdoc = doc; });
      await sleep(250);
      const w = f.contentWindow, d = w.document;
      // The operator's own defaults, in the shape a playout server sends them.
      const data = {};
      for (const fl of tpl.fields) if (fl.field) data[fl.field] = fl.value == null ? '' : fl.value;
      // 'update' is the playout order (SPX, CasparCG and the dashboard all write the data and
      // then take). 'markup' is the COLD take: a document whose figures are already in its own
      // HTML, played with no update() ever - an exported overlay, an OBS browser source, a
      // CasparCG take of a template carrying its own values. Only in that order does a readout's
      // data-target genuinely start absent, which is the one state a runtime read can get wrong.
      if (seed === 'update') {
        try { w.update(JSON.stringify(data)); } catch (e) { /* a broken template fails elsewhere */ }
      }
      await sleep(40);
      // Visible means visible TO THE VIEWER: the root is hidden by its own opacity until the
      // entrance reveals it, and any ancestor may be mid-fade, so the whole chain is multiplied.
      const visible = (el) => {
        let o = 1, n = el;
        while (n && n.nodeType === 1) {
          const s = w.getComputedStyle(n);
          if (s.visibility === 'hidden' || s.display === 'none') return 0;
          o *= parseFloat(s.opacity);
          n = n.parentElement;
        }
        return o;
      };
      // READOUTS ARE KEYED, NEVER HELD ACROSS A play() - the same pairing the re-take pass
      // states in full: play() calls the design's rebuild, several rebuilds replace their rows
      // wholesale, and a node taken before the take is detached after it, reporting a text
      // nothing is airing.
      // THE MARK IS NOT THE ONLY WAY IN. A cold take has written no data-target anywhere, so a
      // sweep that only queries the mark would find nothing to judge in exactly the order the
      // fault lives in. Every FIELD element joins the marked ones, keyed by its id.
      ${MARK_JS}
      const readMarks = () => {
        const nodes = [];
        for (const el of d.querySelectorAll('[data-target]')) nodes.push(el);
        for (const key of Object.keys(data)) {
          const el = d.getElementById(key);
          if (el && nodes.indexOf(el) < 0) nodes.push(el);
        }
        const out = [];
        for (const el of nodes) {
          out.push({
            el,
            name: el.id || el.className || el.tagName,
            key: markKey(el),
            target: (el.getAttribute('data-target') || '').trim(),
            text: (el.textContent || '').trim(),
            // The value THIS FILE typed into the field of that name. The one expectation the
            // graphic has no way to rewrite.
            typed: (el.id && data[el.id] !== undefined) ? String(data[el.id]) : null,
          });
        }
        return out;
      };
      // THE OPERATOR'S FIGURE, CAPTURED BEFORE THE TAKE. Every claim below is judged against
      // this rather than against whatever the graphic calls its target once the entrance has
      // run: a take that rewrote a readout's own target would otherwise land on it exactly.
      // The zero exclusion is decided on the figure that came from OUTSIDE, so a target already
      // corrupted to "0" - by a load-time rebuild, a settle, an editor reset - can never exclude
      // itself from the sweep.
      const before = {};
      for (const m of readMarks()) {
        const expected = expectedOf(m);
        if (!countable(expected)) continue;
        before[m.key] = {
          target: m.target, typed: m.typed, name: m.name, start: m.text, expected,
          first: null, counts: false,
        };
      }
      if (!Object.keys(before).length) { f.remove(); continue; }
      try { w.play(); } catch (e) { /* a broken template fails elsewhere */ }
      // The nodes the take just produced. Only a play() or an update() replaces them and neither
      // runs again below, so the entrance can be read off these rather than re-querying the
      // document (and re-deriving every ordinal) on all 45 frames.
      const during = readMarks();
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => w.requestAnimationFrame(r));
        for (const m of during) {
          const b = before[m.key];
          if (!b) continue;
          const text = (m.el.textContent || '').trim();
          // It MOVED - a builder owns this readout. Measured against the text the readout was
          // showing before the take, which is a claim a cold document can make too.
          if (text !== b.start) b.counts = true;
          if (!b.first && visible(m.el) > 0.02) b.first = { text: text, frame: i };
        }
      }
      // Run the rest of the entrance out on a fast clock rather than in real time: this is real
      // playback with real callbacks, just 25x, which keeps the whole sweep inside one minute.
      w.gsap.globalTimeline.timeScale(25);
      await sleep(250);
      const after = {};
      for (const m of readMarks()) after[m.key] = { target: m.target, text: (m.el.textContent || '').trim() };
      // EVERY SCOPED READOUT IS REPORTED, and whether the entrance counts it rides along rather
      // than deciding who gets in. Dropping the rows an entrance does not animate also dropped
      // the rows it animates WRONGLY - a count of 0 -> 0 never moves, so the fault this file
      // exists for silently reduced the population instead of failing an assertion. Only the
      // claims genuinely about a count read that flag.
      for (const key of Object.keys(before)) {
        const b = before[key];
        readings.push({
          id: variant.id,
          el: b.name,
          target: b.target,
          expected: b.expected,
          typed: b.typed,
          counts: b.counts,
          first: b.first ? b.first.text : null,
          frame: b.first ? b.first.frame : null,
          ended: after[key] ? after[key].text : null,
          endedTarget: after[key] ? after[key].target : null,
        });
      }
      f.remove();
    }
  }
  return { designs, readings };
})()`;

// BOTH SEEDING ORDERS, because only one of them was ever covered. `update` is the playout order
// every server uses; `markup` is the cold take an exported overlay or an OBS browser source runs,
// where no update() has stamped a single `data-target` and a runtime that falls back to the live
// text is reading whatever the entrance last wrote there.
for (const seed of ['update', 'markup'] as const) {
  test(`every counting design plays its figure up from zero (${seed})`, async ({ page }) => {
    test.setTimeout(240_000);
    await enableAdvancedMode(page);
    await page.goto('/app');
    await page.keyboard.press('Escape');

    const { designs, readings } = (await page.evaluate(PLAYED(seed))) as {
      designs: string[];
      readings: Played[];
    };

    // The same reason the settle sweep states its floors: a discovery pass that discovers nothing
    // passes every assertion under it. 44 designs carried the mark on 2026-08-27 and 12 readouts
    // across ten of them are counted by an entrance. Floors, not equalities.
    expect(designs.length, 'designs carrying the counting mark').toBeGreaterThan(30);
    expect(readings.filter((r) => r.counts).length, 'readouts an entrance counts').toBeGreaterThan(8);

    // A readout the sweep scoped and then never SAW is not a pass. It has to be reported, or a
    // design whose entrance reveals its figure later than the 45-frame window drops out of every
    // assertion below with nothing said.
    expect(
      readings.filter((r) => r.counts && r.first === null)
        .map((r) => `${r.id} [${r.el}] never became visible while the entrance ran`),
      'counted readouts the sweep never saw on screen',
    ).toEqual([]);

    // THE DEFECT: the operator's real figure on screen before the count that is about to zero it.
    expect(
      readings.filter((r) => r.counts && figure(r.first) !== null && figure(r.first) === figure(r.expected))
        .map((r) => `${r.id} [${r.el}] shows its final "${r.expected}" on frame ${r.frame}, its first visible one`),
      'readouts showing their figure before counting to it',
    ).toEqual([]);

    // The other half of the claim, and the one that stops "never show the figure" being satisfied
    // by never showing it: the entrance still ends on the real number - the figure the readout
    // held BEFORE the take, compared as a number so a design that regroups its digits or wears a
    // currency mark still passes.
    expect(
      readings.filter((r) => figure(r.ended) !== figure(r.expected))
        .map((r) => `${r.id} [${r.el}] ends the entrance on "${r.ended}", not "${r.expected}"`),
      'readouts not landing on the figure they held before the take',
    ).toEqual([]);

    // AND THE TAKE MAY NOT REWRITE THE FIGURE ITSELF. This is the assertion the old file could not
    // make, because it read the expectation and the reading off the same live attribute: a take
    // that corrupts a readout's `data-target` to "0" produces a count of 0 -> 0 that lands on its
    // target perfectly, and airs a zero for as long as the graphic is up.
    //
    // Measured against `expected`, not against the pre-take target, so the COLD order is covered
    // too: there `data-target` starts absent by definition, and a guard that skipped an empty one
    // would have turned this assertion off in exactly the seed it was added for. The claim in
    // both orders is the same - after the take, the readout must call its own figure what the
    // operator's field carried.
    expect(
      readings.filter((r) => r.counts && figure(r.endedTarget) !== figure(r.expected))
        .map((r) => `${r.id} [${r.el}] should hold "${r.expected}" and calls its own figure "${r.endedTarget}" after the take`),
      'takes that rewrote a readout\'s own figure',
    ).toEqual([]);

    // …and the whole chain checked against the value this file typed, which nothing in the
    // document can reach. Every assertion above is about the graphic agreeing with itself.
    expect(
      readings.filter((r) => figure(r.typed) !== null && figure(r.typed) !== figure(r.ended))
        .map((r) => `${r.id} [${r.el}] ends on "${r.ended}" for a field typed "${r.typed}"`),
      'readouts ending on a figure their field never carried',
    ).toEqual([]);
  });
}

// A GRAPHIC TAKEN WHILE IT IS ALREADY ON AIR MUST NOT PAINT WHAT IT WAS SHOWING.
//
// The third order, and the one neither pass above could see. Both of them start from a document
// that has never played: the root sits at opacity 0, so the frame before the entrance paints
// nothing and there is no stale pose to catch. Real graphics are re-entered from a VISIBLE state
// all day - the editor canvas and the Rehearse panel settle a graphic and then take it, and a
// dashboard, SPX or CasparCG take of a graphic that is still up does the same.
//
// WHAT GOES WRONG THERE IS ONE FRAME EARLIER THAN THE ZERO RULE CAN REACH. The zero rule
// (templates/infographics/igMotion.ts) moved each readout's emptying onto the entrance's first
// frame; the interpreter writes every opening value as a set() ON the timeline, and a GSAP
// timeline renders nothing until the ticker next runs. play() is one synchronous task, so the
// browser paints once between play() returning and the entrance's first tick - showing the
// graphic exactly as it was, at full opacity. Measured on main 2026-09-03: a settled ig05
// "Rising Total" returned from play() reading its real 124,213 at opacity 1 and was zeroed 14 ms
// later, which is the owner's 2026-08-28 walk report word for word. The fix renders frame 0
// during the take (templates/shared/animRuntime.ts, noacgEntranceTimeline).
//
// SO THE MEASUREMENT IS THE FRAME THE BROWSER WILL PAINT, read synchronously after play()
// returns - not an animation frame later, which is exactly when the evidence is gone.
//
// The second claim here is about the digits themselves: a count that renders a NOTATION its
// figure never lands in changes shape as it arrives. ig05 counted 8807, 16041, 124213 and put
// its commas back on the final frame while ig04 "Poll Ring" beside it was right, because the
// two builders formatted independently. Discovered the same way as everything else in this
// file: a reading is compared against its OWN target's grouping, so a design that groups and a
// design that does not are both held to what their operator typed.

/** One design's re-take: what the graphic painted on the take, and how its count was written. */
interface Retaken {
  id: string;
  el: string;
  /** The readout's figure before either take - the one no take can have moved. */
  target: string;
  /** The value typed into the field of that name, when the readout IS a field. */
  typed: string | null;
  /** What it must come to rest on: the typed value, or its figure before either take. */
  expected: string;
  /** Did the re-take animate this readout - reported, never a reason to drop the row. */
  counts: boolean;
  /** What the readout calls its own target after two takes. */
  retakenTarget: string;
  /** What the readout showed once the first playout finished - the state the re-take starts from. */
  settled: string | null;
  /** The readout's text and effective opacity in the frame the browser paints after play(). */
  painted: string;
  paintedOpacity: number;
  /** Where the re-take's count came to rest. */
  ended: string | null;
  /** An intermediate reading whose thousand separators disagree with the target's, if any. */
  notation: string | null;
}

/** Every catalog design carrying the counting mark, played out ONCE so it is on air, then taken
 *  again - which is the order every re-take in the product uses. Runs inside the page for the
 *  same reason the passes above do: it needs a live document and a live GSAP clock. */
const RETAKEN = `(async () => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const designs = []; const readings = [];
  for (const cat of Object.keys(CATALOG)) {
    for (const variant of CATALOG[cat]) {
      const tpl = variant.create({});
      const doc = composeDocument(tpl, {});
      if (!doc.includes('data-target')) continue;
      designs.push(variant.id);
      const f = document.createElement('iframe');
      // ON SCREEN for the same reason the played pass says: Chromium does not tick rAF for an
      // iframe parked off the viewport, so an off-screen graphic never reaches its on-air state.
      f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;z-index:99999;border:0;';
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; f.srcdoc = doc; });
      await sleep(250);
      const w = f.contentWindow, d = w.document;
      const data = {};
      for (const fl of tpl.fields) if (fl.field) data[fl.field] = fl.value == null ? '' : fl.value;
      const json = JSON.stringify(data);
      try { w.update(json); } catch (e) { /* a broken template fails elsewhere */ }
      await sleep(40);
      const opacity = (el) => {
        let o = 1, n = el;
        while (n && n.nodeType === 1) {
          const s = w.getComputedStyle(n);
          if (s.visibility === 'hidden' || s.display === 'none') return 0;
          o *= parseFloat(s.opacity);
          n = n.parentElement;
        }
        return o;
      };
      // READOUTS ARE RE-QUERIED, NEVER HELD ACROSS A play(). play() calls the design's rebuild,
      // and several rebuilds replace their rows wholesale (dataRuntimes.ts writes
      // rows.innerHTML), so a node reference taken before a take is DETACHED after it - and a
      // detached element reports no computed opacity, which would quietly excuse exactly the
      // designs whose readouts a rebuild mints. They are paired across the take by a stable key
      // instead: the id, or the class plus its ordinal among its siblings of that class.
      //
      // AND EVERY MARK IS READ, WITH THE SCOPE DECIDED ONCE, BEFORE ANY TAKE. The zero-figure
      // exclusion used to run inside this function, so it re-decided the scope on every call
      // against whatever the graphic then claimed its target was - which dropped exactly the
      // readouts a take had corrupted to "0", and shifted the ordinals of the rows that stayed.
      ${MARK_JS}
      const readMarks = () => {
        const out = [];
        for (const el of d.querySelectorAll('[data-target]')) {
          out.push({
            el,
            target: (el.getAttribute('data-target') || '').trim(),
            name: el.id || el.className || el.tagName,
            key: markKey(el),
            text: (el.textContent || '').trim(),
            typed: (el.id && data[el.id] !== undefined) ? String(data[el.id]) : null,
          });
        }
        return out;
      };
      // The figures this design carries before anything has played, and the only scope every
      // reading below is paired against. A readout whose real figure IS zero has no zero form to
      // tell apart from its target, so it is out - decided here, where nothing can have moved it,
      // and from the TYPED value first, which is the one figure the document cannot reach.
      const scope = {};
      for (const m of readMarks()) {
        const expected = expectedOf(m);
        if (!countable(expected)) continue;
        scope[m.key] = { target: m.target, typed: m.typed, expected };
      }
      if (!Object.keys(scope).length) { f.remove(); continue; }
      // ON AIR: run the whole entrance out fast, so the graphic ends settled and VISIBLE showing
      // the operator's data. That is the state every re-take in the product starts from.
      try { w.play(); } catch (e) { /* a broken template fails elsewhere */ }
      w.gsap.globalTimeline.timeScale(40);
      await sleep(300);
      w.gsap.globalTimeline.timeScale(1);
      await new Promise((r) => w.requestAnimationFrame(r));
      const settled = {};
      for (const m of readMarks()) settled[m.key] = { target: m.target, text: m.text };
      // THE RE-TAKE, and the reading taken in the same synchronous task: play() has returned and
      // the ticker has not run, so this is the DOM the browser is about to paint.
      try { w.play(); } catch (e) { /* a broken template fails elsewhere */ }
      // These nodes are the ones the take just produced, and only a play() or an update() can
      // replace them - neither runs again below, so the count can be read off them directly.
      const counting = readMarks().filter((m) => scope[m.key]);
      const painted = {};
      const seen = {};
      for (const m of counting) {
        painted[m.key] = { text: m.text, op: opacity(m.el), target: m.target };
        seen[m.key] = [];
      }
      // Then the count itself, on a fast clock, for the notation half.
      w.gsap.globalTimeline.timeScale(12);
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => w.requestAnimationFrame(r));
        for (const m of counting) seen[m.key].push((m.el.textContent || '').trim());
      }
      w.gsap.globalTimeline.timeScale(1);
      for (const key of Object.keys(painted)) {
        const p = painted[key], texts = seen[key] || [];
        // WHETHER THE ENTRANCE COUNTS THIS READOUT RIDES ALONG, and never decides who gets in.
        // Dropping the rows nothing animates also dropped the rows animated WRONGLY: a count of
        // 0 -> 0 never moves, so the fault this file exists for reduced the population instead of
        // failing an assertion, and "readouts an entrance counts: expected > 8, received 8" was
        // the whole verdict. Movement is measured against the text the graphic settled on before
        // the re-take, which is a claim about this take rather than about the attribute.
        const was = settled[key] ? settled[key].text : p.text;
        const counts = texts.some((t) => t !== was);
        // GROUPING IS READ OFF THE FIGURE THE GRAPHIC LANDS ON, never off the typed value: a
        // design regroups "124213" into "124,213" before it shows it, and counting grouped is
        // then correct. The typed value is the oracle for WHICH NUMBER, not for how it is
        // written.
        const grouped = p.target.indexOf(',') >= 0;
        // A reading only disagrees once it is long enough to carry a separator at all.
        const odd = texts.find((t) => /^[0-9,]{4,}$/.test(t) && (t.indexOf(',') >= 0) !== grouped);
        readings.push({
          id: variant.id,
          el: key,
          // The figure from BEFORE either take, which no take can have moved.
          target: scope[key].target,
          typed: scope[key].typed,
          expected: scope[key].expected,
          counts,
          // What the readout calls its own target after two takes. A take may not move this.
          retakenTarget: p.target,
          // The PRECONDITION, reported rather than assumed: this pass means nothing unless the
          // graphic really was on air showing its data when the second take landed.
          settled: settled[key] ? settled[key].text : null,
          painted: p.text,
          paintedOpacity: p.op,
          ended: texts.length ? texts[texts.length - 1] : null,
          notation: odd === undefined ? null : odd,
        });
      }
      f.remove();
    }
  }
  return { designs, readings };
})()`;

test('a counting graphic taken again on air never paints its old figure', async ({ page }) => {
  test.setTimeout(300_000);
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const { designs, readings } = (await page.evaluate(RETAKEN)) as {
    designs: string[];
    readings: Retaken[];
  };

  // The floors this file states everywhere, for the reason it states everywhere: a discovery
  // pass that discovers nothing passes every assertion under it.
  expect(designs.length, 'designs carrying the counting mark').toBeGreaterThan(30);
  expect(readings.filter((r) => r.counts).length, 'readouts an entrance counts').toBeGreaterThan(8);

  // AND THE PRECONDITION, which is the one this pass could most easily fake. Everything below
  // asks what a RE-take paints, and every assertion under it passes trivially if the graphic was
  // not actually on air showing its data first - a first play() that threw, or an entrance
  // longer than the fast-forward, would leave the readout mid-count and "painted !== target"
  // would be true for the most boring reason there is. So the settled reading is checked, not
  // assumed: it is the same house rule as the floors above, applied to the setup rather than the
  // sweep.
  expect(
    readings.filter((r) => figure(r.settled) !== figure(r.expected))
      .map((r) => `${r.id} [${r.el}] was showing "${r.settled}" instead of its "${r.expected}" before the re-take`),
    'readouts not settled on their data when the re-take landed',
  ).toEqual([]);

  // THE DEFECT: the graphic as it WAS, visible, in the frame the take paints. Only a readout the
  // re-take animates - a static caption paints its own figure on every take, correctly.
  expect(
    readings.filter((r) => r.counts && r.painted === r.expected && r.paintedOpacity > 0.02)
      .map((r) => `${r.id} [${r.el}] paints its settled "${r.expected}" at opacity ${r.paintedOpacity.toFixed(2)} on the re-take`),
    'readouts painting their old figure when the graphic is taken again',
  ).toEqual([]);

  // NEITHER TAKE MAY REWRITE THE FIGURE. Two takes are where a rewrite compounds: the first one
  // corrupts the target, the second reads the corruption back as the operator's data and every
  // assertion that compares the graphic with itself agrees.
  expect(
    readings.filter((r) => figure(r.retakenTarget) !== figure(r.expected))
      .map((r) => `${r.id} [${r.el}] should hold "${r.expected}" and calls its own figure "${r.retakenTarget}" after two takes`),
    'takes that rewrote a readout\'s own figure',
  ).toEqual([]);

  // …and the re-take still lands on the number that was typed, which is the claim an operator
  // actually cares about.
  expect(
    readings.filter((r) => figure(r.ended) !== figure(r.expected))
      .map((r) => `${r.id} [${r.el}] ends the re-take on "${r.ended}", not "${r.expected}"`),
    'readouts ending a re-take on a figure their field never carried',
  ).toEqual([]);

  // The count reads in the notation its figure lands in, whichever one the operator typed.
  expect(
    readings.filter((r) => r.notation !== null)
      .map((r) => `${r.id} [${r.el}] counts through "${r.notation}" on the way to "${r.retakenTarget}"`),
    'counts written in a notation their figure never lands in',
  ).toEqual([]);
});
