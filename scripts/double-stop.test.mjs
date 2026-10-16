// gate: factory
// needs: browser
// guards: src/templates/**, src/preview/composeDocument.ts, src/blocks/animMigration.ts
//
// A SECOND STOP NEVER FREEZES A GRAPHIC ON AIR (issue #759).
//
// Operators press Stop twice, or press it again while the graphic is still leaving. SPX and
// CasparCG call the template's own `stop()` each time, with nothing in between to swallow the
// repeat. Until 2026-10-12 the infographic and competition scaffolds answered the second call by
// killing the timeline on air - which by then WAS the running exit - and asking the interpreter
// for the exit again, which handed back that same killed timeline. The graphic stopped half-way
// out, at full opacity, and stayed on air.
//
// So this sweeps every catalog design through the real composer, on a clock this file drives, and
// holds a repeated Stop to the only answer that is right: the graphic ends exactly where a single
// Stop leaves it. Two repeats are tried, one in the same instant as the first Stop (a double
// click) and one while the exit is moving. The single Stop is also held to actually changing a
// design that is on air, so one whose exit never ran cannot pass by staying put in both runs.
//
// A design SAVED before the fix carries the old `stop()` in its own code. The composer upgrades it
// (blocks/animMigration.ts), so a few designs also run with the guard taken back out of their code,
// the way a saved one reads, and must still exit cleanly.
//
// THE CLOCK. GSAP reads `Date.now` and `requestAnimationFrame` when it loads, and a hidden
// iframe's frames are throttled, so real time would be both slow and flaky. A small script ahead
// of GSAP in each document replaces the clock, the frame callback and the timers, and the test
// advances them in fixed steps. Text is not compared: a time-of-day readout reads `new Date()`,
// which stays real, and a frozen exit shows in opacity, visibility and transforms anyway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { parseOnly } from './catalog-scope.mjs';
import { measured } from './measured.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/templates/catalog.ts', import.meta.url)), globalName: 'NOACG_CATALOG' },
  { entry: fileURLToPath(new URL('../src/preview/composeDocument.ts', import.meta.url)), globalName: 'NOACG_COMPOSE' },
];

/** Long enough for every catalog entrance to land and every exit to finish. */
const ON_AIR_MS = 6000;
const EXIT_MS = 8000;
/** The two repeats: a double click, and a press while the exit is moving. */
const REPEATS_MS = [0, 120];
/** One infographic and one competition design, also run as a design saved before the fix. */
const SAVED_BEFORE_FIX = ['ig01', 'es01'];
/** The guard line the fix added (templates/shared/animRuntime.ts STOP_AGAIN_GUARD_JS). */
const GUARD_LINE = /^ {2}if \(typeof noacgOutActive === 'function'[^\n]*\n/m;

/** Installed ahead of GSAP in each document: a clock, frames and timers the test advances. */
const CLOCK = `<script id="test-clock">
(function () {
  var origin = 1700000000000, now = origin, seq = 0, timers = [], frames = [];
  Date.now = function () { return now; };
  performance.now = function () { return now - origin; };
  window.requestAnimationFrame = function (cb) { frames.push({ id: ++seq, cb: cb }); return seq; };
  window.cancelAnimationFrame = function (id) { frames = frames.filter(function (f) { return f.id !== id; }); };
  function add(cb, ms, args, repeat) {
    if (typeof cb !== 'function') return 0;
    var wait = Math.max(0, Number(ms) || 0);
    timers.push({ id: ++seq, cb: cb, at: now + wait, every: Math.max(1, wait), args: args, repeat: repeat });
    return seq;
  }
  window.setTimeout = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), false); };
  window.setInterval = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), true); };
  window.clearTimeout = window.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  // A callback that throws must not stop the others, as in a real frame.
  function run(fn, args) { try { fn.apply(window, args); } catch (e) { /* the template's own error */ } }
  window.__advance = function (ms) {
    var end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 40);
      // Capped, so a zero-delay timer that re-arms itself cannot hold one step for ever.
      for (var fired = 0; fired < 1000; fired++) {
        var due = null;
        for (var i = 0; i < timers.length; i++) if (timers[i].at <= now && (!due || timers[i].at < due.at)) due = timers[i];
        if (!due) break;
        if (due.repeat) due.at += due.every; else timers.splice(timers.indexOf(due), 1);
        run(due.cb, due.args);
      }
      var batch = frames; frames = [];
      for (var j = 0; j < batch.length; j++) run(batch[j].cb, [now - origin]);
    }
  };
})();
</script>`;

/** Play one design, Stop it once or twice, and report what is left. Runs in the browser. */
const PLAY_AND_STOP = async ({ id, repeatsMs, onAirMs, exitMs, savedBeforeFix }) => {
  const variant = window.NOACG_CATALOG.variantById(id);
  const template = variant.create({});
  let unguarded = false;
  if (savedBeforeFix) {
    const stripped = template.js.replace(new RegExp(savedBeforeFix.source, savedBeforeFix.flags), '');
    unguarded = stripped !== template.js;
    template.js = stripped;
  }
  const data = {};
  for (const f of template.fields || []) if (f.field && f.value !== undefined) data[f.field] = String(f.value);
  const html = window.NOACG_COMPOSE.composeDocument(template);
  const clock = window.__TEST_CLOCK;
  const srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + clock) : clock + html;
  const { width, height } = template.resolution;

  const mount = async () => {
    document.getElementById('fx')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'fx';
    frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;`;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
    return frame.contentWindow;
  };
  const elements = (w) => [...w.document.body.querySelectorAll('*')].filter((el) => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE');
  const label = (el) => el.id || el.className?.baseVal || el.className || el.tagName;
  // Every element's paint-relevant state. Opacity, visibility and the transform are where a
  // frozen exit shows; text is left out (see the header).
  const pose = (w) => elements(w).map((el) => {
    const s = w.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return [
      label(el),
      Math.round(Number(s.opacity) * 100) / 100,
      s.visibility,
      s.display,
      s.transform.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10)),
      Math.round(r.x), Math.round(r.y),
    ].join('|');
  });
  // What a viewer could see: elements that paint something themselves (text, a picture, a fill),
  // inside the frame, with no ancestor hiding them. Clipping by an ancestor is not modelled, so
  // this can only over-count.
  const visible = (w) => {
    const opacity = new Map(); // element -> opacity including its ancestors'
    const opacityOf = (el) => {
      if (!el || el === w.document.documentElement) return 1;
      if (!opacity.has(el)) opacity.set(el, Number(w.getComputedStyle(el).opacity) * opacityOf(el.parentElement));
      return opacity.get(el);
    };
    return elements(w).filter((el) => {
      const s = w.getComputedStyle(el);
      const paints = ['IMG', 'svg', 'CANVAS', 'VIDEO'].includes(el.tagName)
        || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        || !/rgba\([^)]*,\s*0\)|transparent/.test(s.backgroundColor) || s.backgroundImage !== 'none';
      if (!paints || s.visibility !== 'visible') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= width || r.top >= height) return false;
      return opacityOf(el) > 0.01;
    }).map(label);
  };
  const rootOpacity = (w) => {
    const sel = w.NOACG_ANIM && w.NOACG_ANIM.root;
    const el = sel && w.document.querySelector(sel);
    return el ? w.getComputedStyle(el).opacity : null;
  };
  const session = async (repeatMs) => {
    const w = await mount();
    if (typeof w.update === 'function') w.update(JSON.stringify(data));
    w.play();
    w.__advance(onAirMs);
    // The on-air reading is the single Stop's; a repeat only needs where it ends.
    const before = repeatMs === null ? { onAir: pose(w), seenOnAir: visible(w) } : {};
    w.stop();
    w.__advance(repeatMs ?? 0);
    if (repeatMs !== null) w.stop();
    w.__advance(exitMs);
    return { ...before, after: pose(w), seenAfter: visible(w), root: rootOpacity(w) };
  };

  const single = await session(null);
  const repeats = [];
  for (const ms of repeatsMs) repeats.push({ ms, ...(await session(ms)) });
  document.getElementById('fx')?.remove();
  return { id, single, repeats, unguarded };
};

const { ids: only } = parseOnly(process.argv.slice(2));

const started = Date.now();
const runs = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate((clock) => { window.__TEST_CLOCK = clock; }, CLOCK);
  const shipped = await page.evaluate(() =>
    Object.values(window.NOACG_CATALOG.CATALOG).flatMap((variants) => (variants ?? []).map((v) => v.id)).sort());
  // A mistyped id must not read as "swept, nothing wrong" (scripts/catalog-scope.mjs).
  const unknown = (only ?? []).filter((id) => !shipped.includes(id));
  if (unknown.length) throw new Error(`--only named id(s) the catalog does not ship: ${unknown.join(', ')}`);
  const ids = only ? shipped.filter((id) => only.includes(id)) : shipped;
  const run = (id, savedBeforeFix = null) =>
    page.evaluate(PLAY_AND_STOP, { id, repeatsMs: REPEATS_MS, onAirMs: ON_AIR_MS, exitMs: EXIT_MS, savedBeforeFix });
  const current = [];
  for (const id of ids) current.push(await run(id));
  const saved = [];
  for (const id of SAVED_BEFORE_FIX) {
    if (ids.includes(id)) saved.push({ ...(await run(id, { source: GUARD_LINE.source, flags: GUARD_LINE.flags })), id: `${id} saved before the fix` });
  }
  return { current, saved };
});
const results = [...runs.current, ...runs.saved];

measured(runs.current.length, 'catalog designs stopped twice');
console.error(`[double-stop] ${results.length} designs, each stopped ${REPEATS_MS.length + 1} ways, in ${((Date.now() - started) / 1000).toFixed(1)} s`);

/** The first element whose pose differs, for a failure message a person can act on. */
function firstDifference(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `${a[i]}  vs  ${b[i]}`;
  return null;
}

test('a design saved before the fix really had the guard taken out', () => {
  for (const r of runs.saved) assert.ok(r.unguarded, `${r.id}: its code carries no guard line to take out`);
});

// A stinger (the transitions) plays through and leaves by itself, so by the time Stop comes there
// is nothing on air for it to move.
test('a single Stop moves every design that is on air (the comparison below is not vacuous)', () => {
  const onAir = results.filter((r) => r.single.seenOnAir.length);
  // A slice can be all stingers; the whole catalog cannot.
  if (!only) assert.ok(onAir.length > results.length / 2, `only ${onAir.length} of ${results.length} designs were on air before Stop`);
  const still = onAir.filter((r) => !firstDifference(r.single.onAir, r.single.after)).map((r) => r.id);
  assert.deepEqual(still, [], `These designs looked the same before and after Stop: ${still.join(', ')}`);
});

test('an interpreter design is fully off air after a single Stop', () => {
  const up = results.filter((r) => r.single.root !== null && r.single.root !== '0').map((r) => `${r.id} (root opacity ${r.single.root})`);
  assert.deepEqual(up, []);
});

test('a second Stop, in the same instant or during the exit, ends where a single Stop does', () => {
  const frozen = [];
  for (const r of results) {
    for (const rep of r.repeats) {
      const diff = firstDifference(r.single.after, rep.after);
      if (diff) frozen.push(`${r.id} (second Stop at +${rep.ms} ms, root opacity ${rep.root}): ${diff}`);
    }
  }
  assert.deepEqual(frozen, [], `${frozen.length} repeated Stop(s) left a design somewhere a single Stop does not:\n${frozen.join('\n')}`);
});

test('nothing a viewer could see is left on air after Stop', () => {
  const left = [];
  for (const r of results) {
    if (r.single.seenAfter.length) left.push(`${r.id} (one Stop): ${r.single.seenAfter.slice(0, 4).join(', ')}`);
    for (const rep of r.repeats) {
      if (rep.seenAfter.length) left.push(`${r.id} (second Stop at +${rep.ms} ms): ${rep.seenAfter.slice(0, 4).join(', ')}`);
    }
  }
  assert.deepEqual(left, []);
});
