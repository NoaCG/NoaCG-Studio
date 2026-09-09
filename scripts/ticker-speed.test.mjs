// guards: src/templates/tickers/tickerMotion.ts, src/templates/tickers/shared.ts,
// guards: src/templates/tickers/tk01.ts, src/templates/tickers/tk11.ts
//
// THE OPERATOR'S SPEED FIELD HAS TO MOVE THE GRAPHIC, and this is what says it does.
//
// A number on a control page that changes nothing is worse than no number at all: it is a
// promise the product breaks in front of someone on air, and nothing else in the build can
// notice it. The emitted motion is plain JavaScript in a template literal, so a rule that reads
// correctly in the .ts file can still ship broken - the same reason scripts/ticker-parser.
// test.mjs exists.
//
// So this runs the REAL emitted code. Rolldown bundles the two ticker modules (nothing in that
// graph touches the DOM at load time), tickerMotion.ts hands back the exact JavaScript a
// generated ticker ships, and it runs here against a stub GSAP that records the tween it is
// given. The assertions are then durations in seconds, measured off the builder rather than
// reasoned about. shared.ts is bundled for one pure function, the rule that decides which id
// the appended speed field takes.
//
// No browser: the builders only ever read `scrollWidth`, `querySelector` and `textContent`, all
// of which a stub answers honestly. What needs a real Chromium is what a design LOOKS like once
// laid out, which is not this question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ticker = (file) => path.join(projectRoot, 'src/templates/tickers', file);

/** One TypeScript module of the app's graph, importable here. */
async function load(entry) {
  const bundle = await rolldown({
    input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent',
  });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const [{ tickerMotionJs }, { appendedFieldId }] = await Promise.all([
  load(ticker('tickerMotion.ts')),
  load(ticker('shared.ts')),
]);

/** The measurements a run of the emitted code hands back. */
const ONE_SET_WIDTH = 1400;   // px of items, rendered twice -> scrollWidth 2800
const ITEM_COUNT = 4;

/**
 * Run the emitted motion for one design and return what its builders produce.
 *
 * `percent` is what the operator has typed into the speed field - `null` for a design that
 * emits no field at all (the timed rotator), which is how the carve-out is exercised.
 */
function runMotion({ speedFieldId, percent, animSpeed = 1, preset = 'marquee' }) {
  // Every tween the builder hands to GSAP, in the order they were built. The POSITION argument
  // is kept alongside the vars, because the flip's hold is expressed as one ('+=3.2').
  const tweens = [];
  const record = (vars, position) => { tweens.push({ ...vars, position }); return timeline; };
  // GSAP's own signatures, argument for argument. A stub one slot out silently records the
  // TARGET as the tween, and every assertion below then passes on nothing.
  // `scale.at` is the last timeScale the running motion was given, which is how a LIVE speed
  // change is observed: nothing is rebuilt, what is already running is scaled.
  const scale = { at: 1 };
  const timeline = {
    set: (_target, vars, position) => record(vars, position),
    to: (_target, vars, position) => record(vars, position),
    from: (_target, vars, position) => record(vars, position),
    fromTo: (_target, _from, to, position) => record(to, position),
    add: (child, position) => record(child, position),
    call: (fn, params, position) => record({ fn }, position),
    timeScale: (v) => { scale.at = v; return timeline; },
  };
  const gsap = {
    timeline: () => timeline,
    fromTo: (_target, _from, to) => {
      tweens.push(to);
      to.timeScale = (v) => { scale.at = v; return to; };
      return to;
    },
    getProperty: () => 0,
  };

  // The DOM the builders actually touch. A marquee measures the track's scrollWidth; a flip
  // counts .ticker-item children; both read the speed holder's textContent. `typed` is what
  // the operator has in the field RIGHT NOW, so a later change can be exercised.
  const items = Array.from({ length: ITEM_COUNT }, () => ({}));
  const track = { scrollWidth: ONE_SET_WIDTH * 2, querySelectorAll: () => items };
  let typed = percent;
  const document = {
    querySelector: () => track,
    getElementById: (id) =>
      (id === speedFieldId && typed !== null ? { textContent: String(typed) } : null),
  };

  // ONE builder per run, because both write the same `tickerMotionLive` handle - running the
  // pair would leave the marquee's live speed pointing at the flip's cycle.
  const build = preset === 'flip' ? 'tickerFlipCycle' : 'tickerMarquee';
  const js = tickerMotionJs(speedFieldId);
  const run = new Function('gsap', 'document', 'NOACG_ANIM',
    `${js}\nreturn { motion: ${build}('#ticker-track'), speed: tickerMotionSpeed(), applySpeed: tickerApplySpeed };`);
  const result = run(gsap, document, { speed: animSpeed });
  return {
    ...result,
    tweens,
    scale,
    /** What `update()` does when a new speed arrives with the strip already running. */
    retype: (next) => { typed = next; result.applySpeed(); },
  };
}

/** The marquee's travel time for one full set of items, in seconds. */
function marqueeSeconds(percent, opts = {}) {
  const { motion } = runMotion({ speedFieldId: 'f2', percent, ...opts });
  return motion.duration;
}

/** The flip's hold between one item arriving and the next, in seconds. */
function flipHoldSeconds(percent) {
  const { tweens } = runMotion({ speedFieldId: 'f2', percent, preset: 'flip' });
  // The exit of the first item carries the hold, as a relative '+=' position.
  const exit = tweens.find((t) => t.y === -18);
  assert.ok(exit, 'the flip cycle built no exit tween');
  return Number(String(exit.position ?? '').replace('+=', '')) || null;
}

// ── The marquee: 1400px of items at 140 px/s is exactly 10 seconds at the authored pace ──

test('an untouched marquee runs at the pace the design ships at', () => {
  assert.equal(marqueeSeconds(100), 10);
});

test('200% halves the marquee travel time, 50% doubles it', () => {
  assert.equal(marqueeSeconds(200), 5);
  assert.equal(marqueeSeconds(50), 20);
});

test('the operator percentage multiplies the template author speed, never replaces it', () => {
  // The Animation panel's knob at 2x and the operator's at 50%: the strip runs as designed.
  assert.equal(marqueeSeconds(50, { animSpeed: 2 }), 10);
  assert.equal(marqueeSeconds(200, { animSpeed: 2 }), 2.5);
});

// ── Nothing an operator can type may stop the strip ──

test('blank, zero and nonsense all mean "as designed" rather than "stop"', () => {
  for (const typed of ['', '0', 'fast', '-40']) {
    assert.equal(marqueeSeconds(typed), 10, `"${typed}" did not fall back to the design's pace`);
  }
});

test('the clamp holds at both ends: 10% and 400%', () => {
  assert.equal(marqueeSeconds(5), marqueeSeconds(10));      // 100s, not 200s
  assert.equal(marqueeSeconds(10), 100);
  assert.equal(marqueeSeconds(9000), marqueeSeconds(400));  // 2.5s, and never faster
  assert.equal(marqueeSeconds(400), 2.5);
});

// ── The flip: the hold is what a speed means when nothing travels ──

test('the flip hold is 3.2s as designed, and scales with the operator field', () => {
  assert.equal(flipHoldSeconds(100), 3.2);
  assert.equal(flipHoldSeconds(200), 1.6);
  assert.equal(flipHoldSeconds(50), 6.4);
});

// ── The carve-out: a design with no field is exactly what it was ──

test('a design that emits no speed field is unaffected by anything in the DOM', () => {
  const { motion, speed } = runMotion({ speedFieldId: null, percent: 300 });
  assert.equal(speed, 1);
  assert.equal(motion.duration, 10);
});

// ── A speed change reaches a strip that is ALREADY RUNNING ──
//
// The dashboard's "± LIVE NUMBERS act on air" row carries every number field a graphic has, so
// one press has to change the pace of the strip on screen. Rebuilding would honour the number
// and snap a half-scrolled strip back to its start; scaling the running tween does not move it.

test('a speed typed while the strip is travelling scales it from that frame', () => {
  const run = runMotion({ speedFieldId: 'f2', percent: 100 });
  assert.equal(run.motion.duration, 10);       // built at the design's own pace
  run.retype(200);
  assert.equal(run.scale.at, 2);               // twice as fast, with no restart
  run.retype(50);
  assert.equal(run.scale.at, 0.5);             // and back down, measured from the SAME build
});

test('the live change composes with the author knob and honours the clamp', () => {
  const run = runMotion({ speedFieldId: 'f2', percent: 100, animSpeed: 2 });
  run.retype(400);
  assert.equal(run.scale.at, 4);
  run.retype(9000);                            // clamped, so it can go no faster
  assert.equal(run.scale.at, 4);
  run.retype('fast');                          // nonsense returns to the design's pace
  assert.equal(run.scale.at, 1);
});

test('the flip cycle takes a live speed change too', () => {
  const run = runMotion({ speedFieldId: 'f2', percent: 100, preset: 'flip' });
  run.retype(200);
  assert.equal(run.scale.at, 2);
});

test('a design with no speed field never scales its motion', () => {
  const run = runMotion({ speedFieldId: null, percent: null });
  run.retype(400);
  assert.equal(run.scale.at, 1);
});

// ── Where the field SITS: never on an id the design already drew ──
//
// A design that declares three lines draws its second cap whether or not the operator supplied
// a third line, so the field count and the markup disagree exactly when a three-line design is
// built from two lines. The catalog only ever builds designs with their own line count, so the
// emit baseline cannot see this case at all.

test('a three-line design built from two lines does not hand the speed field its cap id', () => {
  // tk11 Headline Crawl's real markup, read from the design itself so this cannot drift from it.
  const tk11 = readFileSync(ticker('tk11.ts'), 'utf8');
  assert.match(tk11, /\bid="f2"/, 'tk11 no longer draws a second cap; this test needs a new subject');
  assert.equal(appendedFieldId(tk11, 2), 'f3');   // two fields pushed, but f2 is on screen
  assert.equal(appendedFieldId(tk11, 3), 'f3');   // three fields pushed: the same id, as before
});

test('a two-line design still gets f2, so nothing that shipped moves', () => {
  const tk01 = readFileSync(ticker('tk01.ts'), 'utf8');
  assert.equal(appendedFieldId(tk01, 2), 'f2');
});

test('the no-field emit still defines tickerSpeed(), so a builder can always call it', () => {
  const js = tickerMotionJs(null);
  assert.match(js, /function tickerSpeed\(\)/);
  // It reads #f0 like every ticker does (the item source); what it must not do is read a
  // speed field, which is what the parse is.
  assert.ok(!js.includes('parseFloat'), 'a design with no speed field must not read one');
});
