// guards: src/templates/tickers/tickerMotion.ts, src/templates/tickers/shared.ts,
// guards: src/templates/tickers/tk01.ts, src/templates/tickers/tk11.ts, src/assets/gsap.min.js
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
// The LIVE half is different: a speed change on a running strip is a question about POSITION,
// and a stub that records the last timeScale proves the ratio and nothing about where the strip
// goes. That half runs the same emitted builders against the REAL vendored GSAP, nested in a
// step timeline as the runtime nests them, and reads the strip's x off the target as GSAP's root
// clock is moved by hand, as scripts/credits-live-speed.test.mjs does for the credit rolls.
//
// No browser: the builders only ever read `scrollWidth`, `querySelector` and `textContent`, all
// of which a stub answers honestly. What needs a real Chromium is what a design LOOKS like once
// laid out, which is not this question.
import test, { after, afterEach } from 'node:test';
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
 * `percent` is what the operator has typed into the speed field. A `speedFieldId` of `null` is
 * a design that emits no field at all (the timed rotator), which is how the carve-out is
 * exercised.
 */
function runMotion({ speedFieldId, percent, animSpeed = 1, preset = 'marquee' }) {
  // Every tween the builder hands to GSAP, in the order they were built. The POSITION argument
  // is kept alongside the vars, because the flip's hold is expressed as one ('+=3.2').
  const tweens = [];
  const record = (vars, position) => { tweens.push({ ...vars, position }); return timeline; };
  // GSAP's own signatures, argument for argument. A stub one slot out silently records the
  // TARGET as the tween, and every assertion below then passes on nothing.
  const timeline = {
    set: (_target, vars, position) => record(vars, position),
    to: (_target, vars, position) => record(vars, position),
    from: (_target, vars, position) => record(vars, position),
    fromTo: (_target, _from, to, position) => record(to, position),
    add: (child, position) => record(child, position),
    call: (fn, params, position) => record({ fn }, position),
  };
  const gsap = {
    timeline: () => timeline,
    fromTo: (_target, _from, to) => { tweens.push(to); return to; },
    getProperty: () => 0,
  };

  // The DOM the builders actually touch. A marquee measures the track's scrollWidth; a flip
  // counts .ticker-item children; both read the speed holder's textContent.
  const items = Array.from({ length: ITEM_COUNT }, () => ({}));
  const track = { scrollWidth: ONE_SET_WIDTH * 2, querySelectorAll: () => items };
  const document = {
    querySelector: () => track,
    getElementById: (id) => (id === speedFieldId ? { textContent: String(percent) } : null),
  };

  // ONE builder per run, because both write the same `tickerMotionLive` handle - running the
  // pair would leave the marquee's live speed pointing at the flip's cycle.
  const build = preset === 'flip' ? 'tickerFlipCycle' : 'tickerMarquee';
  const js = tickerMotionJs(speedFieldId);
  const run = new Function('gsap', 'document', 'NOACG_ANIM',
    `${js}\nreturn { motion: ${build}('#ticker-track'), speed: tickerMotionSpeed() };`);
  return { ...run(gsap, document, { speed: animSpeed }), tweens };
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

// ── A speed change reaches a strip that is ALREADY RUNNING, from where it is ──
//
// The dashboard's "± LIVE NUMBERS act on air" row carries every number field a graphic has, so
// one press has to change the pace of the strip on screen. Rebuilding would honour the number
// and snap a half-scrolled strip back to its start; scaling the running tween does not, but only
// if GSAP holds its playhead still across the change. The builder's tween sits inside the step's
// timeline, which has no smoothChildTiming, and a bare timeScale there jumps the strip to where
// the new pace would have had it by now (287px on tk01 at 300%, 1.5s in, measured in Chromium).
// So these read POSITIONS off the real GSAP, and a jump fails them.

const gsapModule = { exports: {} };
new Function('module', 'exports', readFileSync(path.join(projectRoot, 'src/assets/gsap.min.js'), 'utf8'))(gsapModule, gsapModule.exports);
const realGsap = gsapModule.exports.gsap;

// THE ROOT CLOCK, driven by hand: the step timeline is an ordinary child of GSAP's root, as it is
// on air, and the root is advanced to exact times instead of by its ticker, which is put to sleep
// afterwards so the process can exit. Why the root and not a paused parent is written up in
// scripts/credits-live-speed.test.mjs.
realGsap.ticker.remove(realGsap.updateRoot);
let clock = 1000;
realGsap.updateRoot(clock);
after(() => realGsap.ticker.sleep());
// Every strip loops forever, so each test's step is killed when it ends: the next test's clock
// then moves only its own strip.
const steps = [];
afterEach(() => { for (const step of steps.splice(0)) step.kill(); });

const LEAD = 0.4;   // where the step adds the builder, as the runtime's lead does

/** The strip covered `px` between two readings - to the hundredth, since the clock is exact. */
function moved(delta, px) {
  assert.ok(Math.abs(delta - px) < 0.01, `expected ${px}px, measured ${delta}`);
}

const ITEM_WIDTH = ONE_SET_WIDTH / ITEM_COUNT;   // 350px a story, so four make the 1400px set
const STORIES = ['One', 'Two', 'Three', 'Four'];

/**
 * The track as rebuildTicker() leaves it: one node per story, rendered twice for a marquee, each
 * starting hidden as a flip design's CSS has it (tk03: `opacity: 0` until the cycle reveals it).
 * `render()` is what an update with new items does to it: every node replaced.
 */
function fakeTrack(stories, doubled) {
  const track = {
    x: 0, children: [],
    get scrollWidth() { return track.children.length * ITEM_WIDTH; },
    querySelectorAll: () => track.children.slice(),
    insertBefore(node, before) {
      track.removeChild(node);
      const at = track.children.indexOf(before);
      track.children.splice(at < 0 ? track.children.length : at, 0, node);
      node.parentNode = track;
    },
    removeChild(node) {
      const at = track.children.indexOf(node);
      if (at >= 0) track.children.splice(at, 1);
      node.parentNode = null;
    },
    render(list) {
      for (const node of track.children) node.parentNode = null;
      const set = doubled ? [...list, ...list] : list;
      track.children = set.map((textContent) => ({ textContent, y: 0, opacity: 0, parentNode: track }));
    },
  };
  track.render(stories);
  return track;
}

/**
 * One emitted builder on the real GSAP, added to a step timeline at the lead. `at(t)` moves the
 * root clock to `t` seconds after the step began; `retype(v)` is what update() does when a new
 * speed arrives with the strip running, and `edit(stories)` what it does when new ITEMS arrive:
 * the track is re-rendered, then the running motion is told.
 */
function live({ speedFieldId = 'f2', typed = 100, animSpeed = 1, preset = 'marquee', paused = false, stories = STORIES } = {}) {
  const track = fakeTrack(stories, preset !== 'flip');
  const items = track.children.slice();
  const document = {
    querySelector: () => track,
    getElementById: (id) => (id === speedFieldId ? { textContent: String(typed) } : null),
  };
  const build = preset === 'flip' ? 'tickerFlipCycle' : 'tickerMarquee';
  const run = new Function('gsap', 'document', 'NOACG_ANIM',
    `${tickerMotionJs(speedFieldId)}\nreturn { motion: ${build}('#ticker-track'), apply: tickerApplySpeed, build: ${build},
      changed: typeof tickerItemsChanged === 'function' ? tickerItemsChanged : function () {},
      end: typeof tickerMotionEnd === 'function' ? tickerMotionEnd : function () {} };`);
  const result = run(realGsap, document, { speed: animSpeed });
  assert.ok(result.motion, `${build} built nothing`);
  const start = clock;
  const step = realGsap.timeline({ paused });
  step.add(result.motion, LEAD);
  steps.push(step);
  return {
    track, items, step, motion: result.motion,
    at: (t) => { clock = start + t; realGsap.updateRoot(clock); return track; },
    retype: (v) => { typed = v; result.apply(); },
    edit: (list) => { track.render(list); result.changed(); },
    end: result.end,
    /** A new take through the builder alone, as an entrance that skips play() makes one. */
    take: () => { const motion = result.build('#ticker-track'); if (motion) steps.push(motion); return motion; },
    /** The stories a viewer can see: nodes still in the track that are not fully faded. */
    visible: () => track.children.filter((node) => node.opacity > 0.001).map((node) => node.textContent),
  };
}

// 1400px at 140 px/s, so the marquee covers 140px a second as designed.
test('a marquee takes a live speed change from that frame, without a jump', () => {
  const s = live();
  const x1 = s.at(1.4).x;
  const x2 = s.at(2.4).x;
  moved(x1 - x2, 140);
  s.retype(300);
  // Continuity: the next half second covers exactly half a second at the NEW pace, measured from
  // where the strip already was. A bare timeScale would put it 280px further on.
  const x3 = s.at(2.9).x;
  moved(x2 - x3, 210);
  // ...and back down, composed against the speed it was BUILT at, not the last one set.
  s.retype(50);
  const x4 = s.at(3.9).x;
  moved(x3 - x4, 70);
});

test('a sped-up marquee keeps looping seamlessly at the new pace', () => {
  const s = live();
  moved(-s.at(LEAD + 2).x, 280);       // 280px into the 1400px set
  s.retype(400);                       // 560 px/s
  // 2.5s more is 1400px: exactly one set, so the loop is back where it was.
  moved(-s.at(LEAD + 4.5).x, 280);
});

test('a flip takes it as reading time: the item on screen stays, the next comes sooner', () => {
  const s = live({ preset: 'flip' });
  // Per item: 0.4s in, a 3.2s hold, 0.35s out, so item one starts leaving 3.6s into the cycle.
  s.at(LEAD + 1);
  assert.equal(s.items[0].opacity, 1);
  s.retype(200);
  // 2.6s of hold left at 100% is 1.3s at 200%. A jump would have spent it already.
  s.at(LEAD + 1 + 1.2);
  assert.equal(s.items[0].opacity, 1, 'the item on screen must stay for the rest of its hold');
  assert.equal(s.items[0].y, 0);
  s.at(LEAD + 1 + 1.5);                // 4.0s into the cycle: item one gone, item two arriving
  assert.equal(s.items[0].opacity, 0);
  assert.ok(s.items[1].opacity > 0 && s.items[1].opacity < 1, `item two at ${s.items[1].opacity}`);
});

test('the live change composes with the author knob and honours the clamp', () => {
  const s = live({ animSpeed: 2 });
  s.at(1.4);
  s.retype(400);
  assert.equal(s.motion.timeScale(), 4);
  s.retype(9000);                      // clamped, so it can go no faster
  assert.equal(s.motion.timeScale(), 4);
  s.retype('fast');                    // nonsense returns to the design's pace
  assert.equal(s.motion.timeScale(), 1);
});

test('a paused step (a settled preview, an editor scrub) takes a slow-down without breaking', () => {
  // Lending smoothChildTiming to a PAUSED parent sends its start to -Infinity on a slow-down, so
  // a paused step gets the plain timeScale; the next seek shows the new pace.
  const s = live({ paused: true });
  s.step.time(3);
  s.retype(10);
  assert.ok(Number.isFinite(s.step.startTime()), `step start is ${s.step.startTime()}`);
  assert.equal(s.motion.timeScale(), 0.1);
  s.step.time(3.5);
  assert.ok(Number.isFinite(s.track.x));
});

test('a design with no speed field never scales its motion', () => {
  const s = live({ speedFieldId: null });
  s.at(1.4);
  s.retype(400);
  assert.equal(s.motion.timeScale(), 1);
});

// ── New ITEMS reach a strip that is already running ──
//
// Editing the stories of a ticker on air is the most ordinary edit there is. update() re-renders
// the track, which replaces every item node, and the motion built at play() was still working
// on the old ones: measured on tk03 in Chromium, a flip went from 1 visible item to 0 for the
// next 4 s and stayed blank until the next take. These read what a viewer would see, sampled
// every 0.1 s off the real GSAP after an edit.

const TURN = 0.4 + 3.2 + 0.35;   // one story's turn on a flip at 100%: in, hold, out

/**
 * The stories a flip shows from `from` to `to` seconds into the step, in order, one per turn.
 * The design itself is blank for an instant at each boundary (one story is fully out as the next
 * starts in), so a sample may land on that; two blank samples in a row is a blank strip.
 */
function flipSequence(s, from, to) {
  const shown = [];
  let blank = 0;
  for (let t = from; t <= to + 1e-9; t += 0.1) {
    s.at(t);
    const now = s.visible();
    assert.ok(now.length <= 1, `${now.length} stories visible at ${t.toFixed(1)}s (${now})`);
    blank = now.length ? 0 : blank + 1;
    assert.ok(blank < 2, `the strip is blank at ${t.toFixed(1)}s`);
    if (now.length && shown.at(-1) !== now[0]) shown.push(now[0]);
  }
  return shown;
}

test('new items reach a running flip: the story on screen finishes, then the new list', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);                      // "One" is up, with 2.6 s of its hold left
  assert.deepEqual(s.visible(), ['One']);
  s.edit([...STORIES, 'Five']);
  // Never blank: "One" holds to its boundary, then the story after it, and the new one in turn.
  assert.deepEqual(flipSequence(s, LEAD + 1.1, LEAD + 5 * TURN + 1),
    ['One', 'Two', 'Three', 'Four', 'Five', 'One']);
});

test('the boundary is the one the strip was already heading for', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit([...STORIES, 'Five']);
  s.at(LEAD + TURN - 0.36);            // "One" still holding, exactly as it would have
  assert.equal(s.items[0].opacity, 1);
  s.at(LEAD + TURN - 0.01);            // nearly out
  assert.ok(s.items[0].opacity < 0.1, `"One" at ${s.items[0].opacity}`);
  s.at(LEAD + TURN + 0.2);             // gone from the track, and "Two" on its way in
  assert.ok(!s.track.children.includes(s.items[0]), 'the old node is still in the track');
  assert.deepEqual(s.visible(), ['Two']);
});

test('a story added above the one showing does not make the strip repeat itself', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + TURN + 1);               // "Two" is up
  s.edit(['Breaking', ...STORIES]);
  assert.deepEqual(flipSequence(s, LEAD + TURN + 1.1, LEAD + 6 * TURN + 1),
    ['Two', 'Three', 'Four', 'Breaking', 'One', 'Two']);
});

test('the story on screen edited in place: the one after its old place comes next', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit(['One, corrected', 'Two', 'Three', 'Four']);
  assert.deepEqual(flipSequence(s, LEAD + 1.1, LEAD + 4 * TURN + 1),
    ['One', 'Two', 'Three', 'Four', 'One, corrected']);
});

test('a second edit before the boundary still lets the same story finish', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit([...STORIES, 'Five']);
  s.at(LEAD + 2);
  s.edit(['One', 'Other', 'Three']);
  assert.deepEqual(flipSequence(s, LEAD + 2.1, LEAD + 3 * TURN + 1), ['One', 'Other', 'Three', 'One']);
});

test('a speed press and a second edit while a story finishes keep its boundary where it was', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit([...STORIES, 'Five']);        // "One" has 2.95 s left
  s.at(LEAD + 1.5);
  s.retype(200);                       // 2.45 s left becomes 1.225 s: the boundary is LEAD + 2.725
  s.at(LEAD + 2);
  s.edit(['One', 'Other', 'Three']);
  s.at(LEAD + 2.6);
  assert.deepEqual(s.visible(), ['One'], 'the story left before its turn ended');
  s.at(LEAD + 2.85);
  assert.deepEqual(s.visible(), ['Other']);
});

test('a speed press after an edit reaches the new cycle', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit([...STORIES, 'Five']);
  s.retype(200);                       // 2.6 s of hold left is 1.3 s, and each turn after is half
  assert.deepEqual(flipSequence(s, LEAD + 1.1, LEAD + 1 + 1.3 + 0.35 / 2 + 2 * TURN / 2 - 0.2),
    ['One', 'Two', 'Three']);
});

test('an edit after the strip is taken off reaches nothing that is running', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.end();                             // stop(): the motion is dropped with the strip
  s.edit([...STORIES, 'Five']);
  s.at(LEAD + 6);
  assert.deepEqual(s.visible(), []);
});

test('a speed and new items in the same update: the story on screen finishes at the new pace', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.retype(200);                       // update() applies the speed first, then the items
  s.edit([...STORIES, 'Five']);
  // 2.6 s of hold and 0.35 s out at 200% is 1.475 s, so "Two" is up 1.6 s later, not 3 s.
  s.at(LEAD + 1 + 1.6);
  assert.deepEqual(s.visible(), ['Two']);
});

test('a whole new list starts at its top once the story on screen has finished', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit(['Ex', 'Why', 'Zed']);
  assert.deepEqual(flipSequence(s, LEAD + 1.1, LEAD + 3 * TURN + 1), ['One', 'Ex', 'Why', 'Zed']);
});

test('a story that appears twice continues from the copy that is showing', () => {
  const list = ['Weather', 'Aa', 'Bb', 'Weather', 'Cc'];
  const s = live({ preset: 'flip', stories: list });
  s.at(LEAD + 3 * TURN + 1);           // the second "Weather" is up
  s.edit([...list, 'Dd']);
  assert.deepEqual(flipSequence(s, LEAD + 3 * TURN + 1.1, LEAD + 6 * TURN + 1), ['Weather', 'Cc', 'Dd', 'Weather']);
});

test('an edit during the entrance waits for the motion to begin where it would have', () => {
  for (const preset of ['flip', 'marquee']) {
    const s = live({ preset });
    s.at(LEAD - 0.2);                  // the panel is still fading in; the motion starts at LEAD
    s.edit(['Ex', 'Why', 'Zed']);
    s.at(LEAD - 0.05);
    if (preset === 'flip') assert.deepEqual(s.visible(), [], 'a story came in before the lead');
    else assert.equal(s.track.x, 0, 'the marquee moved before the lead');
    s.at(LEAD + 1);
    if (preset === 'flip') assert.deepEqual(s.visible(), ['Ex']);
    else moved(-s.track.x, 140);
  }
});

test('an emptied list, then new stories: the strip picks them up without a take', () => {
  const flip = live({ preset: 'flip' });
  flip.at(LEAD + 1);
  flip.edit([]);
  flip.at(LEAD + 5);                   // "One" finished its turn and nothing followed
  assert.deepEqual(flip.visible(), []);
  flip.edit(['Ex', 'Why']);
  assert.deepEqual(flipSequence(flip, LEAD + 5.1, LEAD + 5 + TURN + 1), ['Ex', 'Why']);

  const marquee = live();
  marquee.at(LEAD + 2);
  marquee.edit([]);
  marquee.at(LEAD + 3);
  marquee.edit(['Ex', 'Why']);
  marquee.at(LEAD + 4);
  moved(-marquee.track.x, 140);
});

test('an edit reaching a step another entrance already killed builds nothing on it', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.step.kill();                       // the simulator or a snap tore the step down
  s.edit([...STORIES, 'Five']);
  assert.equal(s.track.children.length, 5, 'the old story was put back into the track');
});

test('a take after a stop during the handover drops the story that was finishing', () => {
  const s = live({ preset: 'flip' });
  s.at(LEAD + 1);
  s.edit([...STORIES, 'Five']);
  s.end();                             // stop() while "One" is still finishing: it stays for the fade
  assert.equal(s.track.children.length, 6);
  s.take();                            // an entrance that does not re-render the track
  assert.equal(s.track.children.length, 5);
});

// A marquee keeps sliding until its loop point, and the loop is seamless only when that point is
// exactly one set of the CURRENT items: the track then shows the second copy where the first one
// was. Each 1/60 s step must move the picture by the travel of that step, measured modulo one set
// of the items on screen; a wrong loop point shows as a step of hundreds of pixels.
for (const [name, list] of [
  ['longer', [...STORIES, 'Five']],
  ['shorter', STORIES.slice(0, 3)],
]) {
  test(`a marquee given a ${name} list keeps moving without a seam`, () => {
    const s = live();
    s.at(LEAD + 2);                    // 280px in
    s.edit(list);
    const set = list.length * ITEM_WIDTH;
    let x = s.track.x;
    assert.equal(x, -280, 'the picture moved when the items changed');
    for (let frame = 1; frame <= 60 * 15; frame++) {    // more than a loop at either width
      s.at(LEAD + 2 + frame / 60);
      const step = (((x - s.track.x) % set) + set) % set;
      assert.ok(Math.abs(step - 140 / 60) < 0.01, `a ${step.toFixed(1)}px step at ${(2 + frame / 60).toFixed(2)}s`);
      assert.ok(s.track.x <= 0 && s.track.x > -set - 1e-6, `x ${s.track.x} is off the doubled track`);
      x = s.track.x;
    }
  });
}

// ── A speed press leaves the items where they are ──
//
// update() re-renders the track from #f0, and rewriting it replaces the nodes a running flip
// cycle is animating: measured on tk03 in Chromium, one speed press left the cycle fading
// detached items and the strip blank until the next take. So an update rewrites the track only
// when the items it draws changed, and only then tells the running motion (tickerItemsChanged,
// pinned above). rebuildTicker() and update() are plain text in shared.ts, sliced out and run
// here with every write to the track counted.

function updateRun() {
  const source = readFileSync(ticker('shared.ts'), 'utf8');
  const start = source.indexOf('var tickerBuiltHtml');
  const end = source.indexOf('// play():');
  assert.ok(start > 0 && end > start, 'rebuildTicker() and update() not found in shared.ts');
  const block = source.slice(start, end).replace('${setFieldValueJs}', '');
  assert.ok(!block.includes('${') && !block.includes('`'), 'the block is no longer plain text');
  const writes = { track: 0, speed: 0, items: 0 };
  const track = { set innerHTML(_html) { writes.track++; } };
  const els = { 'ticker-track': track, f0: { textContent: 'One\nTwo' }, f1: { textContent: 'NEWS' }, f2: { textContent: '100' } };
  const run = new Function('document', 'setFieldValue', 'parseTickerItems', 'tickerItemHtml', 'tickerApplySpeed',
    'tickerItemsChanged',
    `var TICKER_ROTATE = false, TICKER_DOUBLE_ITEMS = true;\n${block}\nreturn { rebuildTicker, update };`)(
    { getElementById: (id) => els[id] ?? null },
    (el, v) => { el.textContent = v; },
    (text) => text.split('\n').map((line) => ({ kicker: '', text: line })),
    (item) => `<span class="ticker-item">${item.text}</span>`,
    () => { writes.speed++; },
    () => { writes.items++; },
  );
  run.rebuildTicker();             // what play() does: the first render, always
  writes.track = 0;
  return { ...run, writes };
}

test('a speed or label press reaches the pace without re-rendering the items', () => {
  const { update, writes } = updateRun();
  update({ f2: '300' });
  update(JSON.stringify({ f0: 'One\nTwo', f1: 'LATEST', f2: '200' }));   // SPX re-sends the lot
  assert.deepEqual(writes, { track: 0, speed: 2, items: 0 });
});

test('new items still re-render the track and reach the running motion, and a take always re-renders', () => {
  const { update, rebuildTicker, writes } = updateRun();
  update({ f0: 'One\nTwo\nThree' });
  assert.deepEqual(writes, { track: 1, speed: 1, items: 1 });
  rebuildTicker();                 // play(): a take starts from clean items even when unchanged
  assert.equal(writes.track, 2);
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
