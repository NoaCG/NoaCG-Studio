// guards: src/templates/endCredits/creditsMotion.ts, src/assets/gsap.min.js
//
// A SPEED CHANGED ON AIR HAS TO CHANGE THE ROLL ON AIR, and without moving it.
//
// The production dashboard's LIVE NUMBERS row offers a credits design's Scroll / Crawl / Page
// speed and says one press changes the live graphic. The press sends update(), which calls
// creditsApplySpeed(): a timeScale on whatever the builder returned at play(). Two failures are
// possible and both were measured in Chromium before this test existed: the pace not changing at
// all (the builders read the speed once, at play()), and the pace changing with a JUMP - a
// builder's timeline sits inside the step's timeline, which has no smoothChildTiming, so a bare
// timeScale moves the roll to where the new pace would have had it by now (196px on cr01).
//
// A stub GSAP cannot see the second one, which is how the ticker's version of this shipped with
// it. So this runs the REAL emitted builders against the REAL vendored GSAP, nested in a step
// timeline exactly as the runtime nests them, and reads positions off the target as GSAP's root
// clock is moved by hand. No browser: the builders only read rects, sizes and
// textContent, which a stub answers honestly, and GSAP tweens a plain object like any element.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundle = await rolldown({
  input: path.join(projectRoot, 'src/templates/endCredits/creditsMotion.ts'),
  platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent',
});
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const { creditsMotionJs } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);

const gsapModule = { exports: {} };
new Function('module', 'exports', readFileSync(path.join(projectRoot, 'src/assets/gsap.min.js'), 'utf8'))(gsapModule, gsapModule.exports);
const { gsap } = gsapModule.exports;

// THE ROOT CLOCK, driven by hand. The step timeline is an ordinary child of GSAP's root, as it is
// on air, and the root is advanced to exact times instead of by the ticker. It has to be the
// root and not a paused parent: slowing a roll down can put the child's aligned start before its
// parent's zero, and GSAP answers that by shifting the parent against ITS parent - which a
// hand-seeked paused parent would then contradict. The ticker is put to sleep afterwards so the
// process can exit.
gsap.ticker.remove(gsap.updateRoot);
// The vendored build's `attr` plugin does not register in Node, so the roll's pose attribute is
// never written here and GSAP warns once per build. Nothing below reads the attribute; the one
// warning is dropped so a real one is not lost in it.
const warn = console.warn;
console.warn = (...args) => { if (!String(args[0]).startsWith('Invalid property attr')) warn(...args); };
let clock = 1000;
gsap.updateRoot(clock);
after(() => gsap.ticker.sleep());

/** The motion covered `px` between two readings - to the hundredth, since the clock is exact. */
function moved(delta, px) {
  assert.ok(Math.abs(delta - px) < 0.01, `expected ${px}px, measured ${delta}`);
}

const BOX = { width: 1920, height: 1080 };
const LIST = 3000;      // px of names the roll carries
const LEAD = 0.4;       // where the step adds the builder, as the runtime's lead does

/** A node the builders can measure. `extent` is its box at rest; the rect follows its x/y. */
function node(extent, extra = {}) {
  const attrs = {};
  const el = {
    x: 0, y: 0, opacity: 1, children: [],
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getBoundingClientRect: () => ({
      left: el.x, right: el.x + extent.width, top: el.y, bottom: el.y + extent.height,
      width: extent.width, height: extent.height,
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    ...extra,
  };
  return el;
}

/**
 * The emitted builders, run with real GSAP. `typed` is what the operator has in the speed field
 * now; `retype(v)` is what update() does when a new one arrives with the motion running.
 */
function credits({ build, speedFieldId = 'f3', typed = 100, paused = false }) {
  const box = node(BOX, { clientHeight: BOX.height, clientWidth: BOX.width });
  const pages = [0, 1, 2].map(() => node({ width: 800, height: 300 }, { children: [{}, {}, {}] }));
  const track = node(build === 'creditsCrawl' ? { width: LIST, height: 60 } : { width: 1200, height: LIST }, {
    querySelectorAll: () => pages,
  });
  const document = {
    querySelector: (sel) => (sel === '.credits-box' ? box : track),
    getElementById: (id) => (id === speedFieldId ? { textContent: String(typed) } : null),
    createElement: () => node({ width: 1200, height: LIST }, { appendChild() {}, offsetHeight: LIST }),
  };
  // The reel wraps its content in a run it measures; hand it one that is already there.
  track.querySelector = (sel) => (sel === '.credits-loop-run' ? { offsetHeight: LIST, cloneNode: () => ({ setAttribute() {} }) } : null);
  track.appendChild = () => {};
  track.removeChild = () => {};
  const run = new Function('gsap', 'document', 'getComputedStyle', 'NOACG_ANIM',
    `${creditsMotionJs(speedFieldId)}\nreturn { motion: ${build}('#credits-track'), apply: creditsApplySpeed };`);
  const result = run(gsap, document, () => ({ paddingTop: '0', paddingBottom: '0', paddingLeft: '0', paddingRight: '0' }), { speed: 1 });
  assert.ok(result.motion, `${build} built nothing`);
  // The step: a plain timeline on the root, the builder added into it at the lead, as on air.
  const start = clock;
  const step = gsap.timeline({ paused });
  step.add(result.motion, LEAD);
  return {
    track, pages, motion: result.motion, step,
    at: (t) => { clock = start + t; gsap.updateRoot(clock); return track; },
    retype: (v) => { typed = v; result.apply(); },
  };
}

test('a roll takes a live speed change from that frame, without a jump', () => {
  const c = credits({ build: 'creditsRoll' });
  const y1 = c.at(1.4).y;
  const y2 = c.at(2.4).y;
  moved(y1 - y2, 90);
  c.retype(300);
  // Continuity: the next half second covers exactly half a second at the NEW pace, measured from
  // where the roll already was. A bare timeScale would put it 180px further on.
  const y3 = c.at(2.9).y;
  moved(y2 - y3, 135);
  // …and back down, composed against the speed it was BUILT at, not the last one set.
  c.retype(50);
  const y4 = c.at(3.9).y;
  moved(y3 - y4, 45);
});

test('a crawl takes it along x', () => {
  const c = credits({ build: 'creditsCrawl' });
  const x1 = c.at(1.4).x;
  const x2 = c.at(2.4).x;
  moved(x1 - x2, 160);
  c.retype(200);
  const x3 = c.at(3.4).x;
  moved(x2 - x3, 320);
});

test('a reel takes it, and keeps looping at the new pace', () => {
  const c = credits({ build: 'creditsLoop' });
  const y1 = c.at(1.4).y;
  const y2 = c.at(2.4).y;
  moved(y1 - y2, 90);
  c.retype(400);
  const y3 = c.at(2.9).y;
  moved(y2 - y3, 180);
});

test('a page swap takes it as reading time: the page on screen stays, the next comes sooner', () => {
  const c = credits({ build: 'creditsPages' });
  // Three rows hold max(2.5, 2.7) = 2.7s after a 0.5s arrival, so page one leaves at 3.2s.
  c.at(LEAD + 1);
  assert.equal(c.pages[0].opacity, 1);
  c.retype(300);
  c.at(LEAD + 1.01);
  assert.equal(c.pages[0].opacity, 1, 'the page on screen must not restart or vanish');
  // 2.2s of hold left at 100% is 0.73s at 300%: gone well before the 3.2s it was built with.
  c.at(LEAD + 1 + 0.9);
  assert.equal(c.pages[0].opacity, 0);
  assert.ok(c.pages[1].opacity > 0, 'the next page is arriving');
});

test('the clamp holds on air, and nonsense returns to the design\'s pace', () => {
  const c = credits({ build: 'creditsRoll' });
  c.at(1.4);
  c.retype(9000);
  assert.equal(c.motion.timeScale(), 4);
  c.retype('fast');
  assert.equal(c.motion.timeScale(), 1);
});

test('a paused step (a settled preview, an editor scrub) takes a slow-down without breaking', () => {
  // Lending smoothChildTiming to a PAUSED parent sends its start to -Infinity on a slow-down, so
  // a paused step gets the plain timeScale; the next seek shows the new pace.
  const c = credits({ build: 'creditsRoll', paused: true });
  c.step.time(3);
  c.retype(10);
  assert.ok(Number.isFinite(c.step.startTime()), `step start is ${c.step.startTime()}`);
  assert.equal(c.motion.timeScale(), 0.1);
  c.step.time(3.5);
  assert.ok(Number.isFinite(c.track.y));
});

test('a design with no speed field never scales its motion', () => {
  const c = credits({ build: 'creditsRoll', speedFieldId: null });
  c.at(1.4);
  c.retype(400);
  assert.equal(c.motion.timeScale(), 1);
});
