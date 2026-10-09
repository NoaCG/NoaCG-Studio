// Phase 2 verification sweep: for each lower-third variant run the deterministic checks
// (validate, runtime, presets, steps, auto-fit) and capture a settled-state screenshot
// over a video-like backdrop for the user's taste review.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import { outDir } from './out-dir.mjs';

// Both arguments are POSITIONAL, not flags. The guard is shared with every other script that
// takes a directory this way (scripts/out-dir.mjs) - this is where the mistake it refuses was
// actually made, and one copy of the check is the point.
const OUT = outDir(
  process.argv[2],
  './l3-shots',
  'Usage: node scripts/l3-sweep.mjs [out-dir] [category]   e.g. node scripts/l3-sweep.mjs ./l3-shots lower-third',
);
const CATEGORY = process.argv[3] || 'lower-third';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

// ---------- 1) Deterministic checks (run inside the app page: Vite serves the source) ----------
const results = await page.evaluate(async (CATEGORY) => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const LOWER_THIRDS = CATALOG[CATEGORY] || [];
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
  const { ANIM_DECLARATION } = await import('/src/assets/animationLiteral.ts');

  const runInFrame = (tpl, fn) => new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px';
    const errs = [];
    f.onload = async () => {
      const w = f.contentWindow;
      w.onerror = (m) => { errs.push(String(m)); return false; };
      try { resolve({ ...(await fn(w, f.contentDocument)), errs }); }
      catch (e) { resolve({ fatal: e.message, errs }); }
      finally { setTimeout(() => f.remove(), 30); }
    };
    f.srcdoc = composeDocument(tpl);
    document.body.appendChild(f);
  });

  const out = [];
  for (const v of LOWER_THIRDS) {
    const row = { id: v.id, name: v.name, checks: {}, issues: [] };
    const tpl = v.create();
    const val = validateTemplate(tpl);
    row.checks.valid = val.ok;
    if (!val.ok) row.issues.push(...val.errors.map((e) => e.rule + ': ' + e.message));
    row.checks.rootVars =
      tpl.css.includes('--accent:') && tpl.css.includes('--scale:') && tpl.css.includes('--type-scale:');
    row.checks.markers = tpl.js.includes('== ANIMATION') && tpl.js.includes('== END ANIMATION ==');
    row.checks.fontFace = tpl.css.includes('@font-face');
    const isCredits = CATEGORY === 'end-credits';
    const isTicker = CATEGORY === 'ticker';
    // Clock categories share the countdown engine; their prefix differs.
    const clockPrefix = { 'starting-soon': 'starting-soon', 'game-timer': 'game-timer' }[CATEGORY] || null;
    // ...but a clock is a DESIGN decision inside those categories, not a category contract.
    // `clock: 'none'` is deliberate (src/templates/AGENTS.md): a technical pause cannot promise
    // a time and a sign-off card is not waiting for anything, so those screens emit no clock
    // field, no clock element and no clock RUNTIME.
    //
    // Read from EITHER signal on purpose. The element alone would be the obvious test and is
    // the wrong one: a design that broke by losing its clock element would then look like a
    // design that never wanted one, and this check would go quiet exactly when it should shout.
    // The runtime is what states the intent - `clock: 'none'` emits no `startClock` at all -
    // so a missing element beside a live runtime still runs the probe and still fails.
    // Measured across all 19 designs in the two clock categories: element and runtime agree
    // everywhere, absent together on ss08/ss09 alone.
    const hasClock = clockPrefix
      ? tpl.html.includes(`${clockPrefix}-clock`) || /function startClock\b/.test(tpl.js)
      : false;
    const isScoreboard = CATEGORY === 'scoreboard';
    const isInfographic = CATEGORY === 'infographic';
    const isQuiz = CATEGORY === 'quiz';
    const isVersus = CATEGORY === 'versus';
    const isAudience = CATEGORY === 'audience';
    // The COMPETITION PACK's four categories share one assembler, and each one's category id
    // IS its prefix (competition/*/shared.ts: type === prefix).
    const compPrefix = ['esports-score', 'matchup', 'results-board', 'reveal'].includes(CATEGORY)
      ? CATEGORY : null;
    row.checks.masks = isCredits ? tpl.html.includes('credits-track')
      : isTicker ? tpl.html.includes('ticker-track')
      // A clock design's masked contract IS its clock; a clockless one still has to carry the
      // category box, the same shape the audience branch below uses for its formless queue.
      : clockPrefix ? (hasClock || tpl.html.includes(`${clockPrefix}-box`))
      : isInfographic ? tpl.html.includes('infographic-box') // designs own their fields — no mask contract
      : isVersus ? (tpl.html.includes('versus-box') && tpl.html.includes('versus-mask') && tpl.html.includes('id="f0"'))
      // An audience graphic's masked element is its MESSAGE, and the queue form has no mask at
      // all — its content is rows the runtime renders. Both carry the box.
      : isAudience ? (tpl.html.includes('audience-box')
          && (tpl.html.includes('audience-question') || tpl.html.includes('id="audience-queue"')))
      : (/-mask/.test(tpl.html) && tpl.html.includes('id="f0"'));

    const rt = await runInFrame(tpl, async (w, d) => {
      w.update(JSON.stringify({ f0: 'Test Person', f1: 'Test Title' }));
      w.play();
      await new Promise((r) => setTimeout(r, 60));
      w.stop();
      return { bound: d.getElementById('f0')?.textContent === 'Test Person' };
    });
    // Infographics may REFORMAT field values on rebuild (thousand separators, parsing) —
    // binding is proven by their shape checks below; here only error-freeness counts.
    row.checks.runtime = !rt.fatal && rt.errs.length === 0 && (isInfographic || !!rt.bound);
    if (rt.fatal || rt.errs.length) row.issues.push('runtime: ' + (rt.fatal || rt.errs[0]));

    let presetOk = true;
    // Rotate easing presets so every animation preset gets runtime coverage with several easings.
    const EASINGS = ['auto', 'easy-ease', 'ease-out', 'back', 'bounce', 'elastic', 'expo', 'sine', 'circ', 'linear', 'cubic', 'ease-in', 'ease-in-out'];
    let e = 0;
    for (const p of v.animationPresets) {
      for (let k = 0; k < 3 && presetOk; k++) {
        const easing = EASINGS[e++ % EASINGS.length];
        const t2 = v.create({ animation: { presetId: p, easing } });
        // Timeline v2 categories emit the data block ("ease" fields inside NOACG_ANIM);
        // legacy categories still carry the knob variables.
        const easingPresent = t2.js.includes(ANIM_DECLARATION)
          ? /"ease":\s*"/.test(t2.js)
          : t2.js.includes("var easeIn = '") && t2.js.includes("var easeOut = '");
        if (!easingPresent) {
          presetOk = false; row.issues.push('easing missing for ' + p + '/' + easing); break;
        }
        const r2 = await runInFrame(t2, async (w) => { w.play(); await new Promise((r) => setTimeout(r, 40)); w.stop(); return {}; });
        if (r2.fatal || r2.errs.length) { presetOk = false; row.issues.push('preset ' + p + '/' + easing + ': ' + (r2.fatal || r2.errs[0])); }
      }
      if (!presetOk) break;
    }
    row.checks.allPresets = presetOk;

    if (['lower-third', 'info-card', 'alert', 'public-info'].includes(CATEGORY) && v.maxLines >= 2) {
      const t3 = v.create({ animation: { steps: true } });
      // A design may opt out of steps coherently (StandardDesign.disableSteps — e.g. a
      // versus card whose lines are simultaneous columns): settings stay '1' AND no
      // revealNextStep is emitted. That is a pass, not a failure.
      const optedOut = t3.settings.steps === '1' && !t3.js.includes('revealNextStep');
      if (optedOut) {
        row.checks.stepsDecl = true;
        row.checks.stepsRuntime = true;
        out.push(row);
        continue;
      }
      row.checks.stepsDecl = Number(t3.settings.steps) >= 2;
      const r3 = await runInFrame(t3, async (w) => {
        w.play(); await new Promise((r) => setTimeout(r, 30)); w.next(); await new Promise((r) => setTimeout(r, 30));
        return { hasReveal: typeof w.revealNextStep === 'function' };
      });
      row.checks.stepsRuntime = !r3.fatal && r3.errs.length === 0 && !!r3.hasReveal;
      if (r3.fatal || r3.errs.length) row.issues.push('steps: ' + (r3.fatal || r3.errs[0]));
    }

    if (clockPrefix && !hasClock) {
      // A design that ships no clock is not a design with a broken clock. Say so as a NOTE and
      // run no clock check at all - a `false` would be a fault report and a `true` would claim
      // a check that never ran. Same doctrine as field-coverage's NOT DRIVEN rows: the report
      // is read by a human scanning for false, so a skipped check must be visibly absent.
      row.clock = 'none - this design ships no countdown by design (clock: \'none\')';
      out.push(row);
      continue;
    }

    if (clockPrefix) {
      // Clock categories: after play() the clock must render M:SS and actually tick down.
      const r7 = await runInFrame(tpl, async (w, d) => {
        w.play();
        const clock = d.querySelector(`.${clockPrefix}-clock`);
        // A design reached this probe because it CLAIMS a clock (element or runtime). A missing
        // element here is therefore a real fault, reported as one rather than as an opaque
        // "cannot read properties of null".
        if (!clock) return { missingElement: true };
        const first = clock.textContent;
        // startClock() fires after the entrance timeline, so the first tick can land ~1.7 s in.
        await new Promise((r) => setTimeout(r, 3000));
        return { first, later: clock.textContent, format: /^\d+:\d{2}$/.test(clock.textContent) };
      });
      row.checks.autoFit = !r7.fatal && r7.errs.length === 0 && r7.format && r7.later !== r7.first;
      if (!row.checks.autoFit) row.issues.push('clock: ' + JSON.stringify(r7));
      out.push(row);
      continue;
    }
    if (isScoreboard) {
      // Scoreboards: all four fields (teams + scores) bind through update().
      const r8 = await runInFrame(tpl, async (w, d) => {
        w.update(JSON.stringify({ f0: 'HOME', f1: '12', f2: 'AWAY', f3: '8' }));
        return {
          teams: d.getElementById('f0')?.textContent === 'HOME' && d.getElementById('f2')?.textContent === 'AWAY',
          scores: d.getElementById('f1')?.textContent === '12' && d.getElementById('f3')?.textContent === '8',
        };
      });
      row.checks.autoFit = !r8.fatal && r8.errs.length === 0 && !!r8.teams && !!r8.scores;
      if (!row.checks.autoFit) row.issues.push('scoreboard: ' + JSON.stringify(r8));
      out.push(row);
      continue;
    }
    if (isInfographic) {
      // Infographics carry their own data shape: bars, cascaded rows, a filling ring, or
      // a counting stat. Pass when the variant's shape demonstrably works.
      const r9 = await runInFrame(tpl, async (w, d) => {
        if (d.getElementById('infographic-bars')) {
          w.update(JSON.stringify({ f0: 'Alpha | 80\nBeta | 55\nGamma | 30', f1: 'Results' }));
          return { bars: d.getElementById('infographic-bars').children.length };
        }
        if (d.getElementById('infographic-rows')) {
          // Row designs rebuild from their textarea source (already holds a sample).
          w.update(JSON.stringify({}));
          return { rows: d.getElementById('infographic-rows').children.length };
        }
        if (d.querySelector('.infographic-ring-fill')) {
          const ring = d.querySelector('.infographic-ring-fill');
          const before = getComputedStyle(ring).strokeDashoffset;
          w.play();
          await new Promise((r) => setTimeout(r, 1400));
          return { ringMoved: getComputedStyle(ring).strokeDashoffset !== before };
        }
        // Bars authored per row (no rebuild container), each carrying its own counted
        // readout at the cap — ig07's shape. Prove the measured motion for real: the fills
        // must grow to their data-value and the readouts must count to their figures.
        if (d.querySelector('.infographic-bar-num')) {
          const fills = [...d.querySelectorAll('.infographic-bar-fill')];
          const nums = () => [...d.querySelectorAll('.infographic-bar-num')].map((e) => e.textContent);
          const widths = () => fills.map((e) => getComputedStyle(e).width);
          w.play();
          await new Promise((r) => setTimeout(r, 250));
          const midNums = nums();
          const midWidths = widths();
          await new Promise((r) => setTimeout(r, 1600));
          const endNums = nums();
          const endWidths = widths();
          // Mid-flight must differ from the settled state (it grew/counted), and each bar
          // must land on its own data-value.
          const landed = fills.every((el, i) => {
            const track = el.parentElement.getBoundingClientRect().width;
            const want = (Number(el.getAttribute('data-value')) / 100) * track;
            return Math.abs(parseFloat(endWidths[i]) - want) < track * 0.04;
          });
          return {
            counting:
              fills.length > 0 &&
              landed &&
              (String(midWidths) !== String(endWidths) || String(midNums) !== String(endNums)),
            bars: 0, // proven by `counting` here — don't let the bar count pass it trivially
            detail: { midNums, endNums, midWidths, endWidths, landed },
          };
        }
        // The MILESTONE track — its measured motion is the progress line, and its #f0 never
        // changes, so without this branch the four milestone designs fell to the count check
        // below and were reported as broken for animating exactly what they are meant to.
        // Read mid-flight against settled, like the bar readouts above: the rebuild renders the
        // fill AT its value, so a before/after pair would compare a number with itself.
        if (d.querySelector('.infographic-milestone-fill')) {
          const fill = d.querySelector('.infographic-milestone-fill');
          const width = () => parseFloat(getComputedStyle(fill).width);
          w.play();
          await new Promise((r) => setTimeout(r, 250));
          const mid = width();
          await new Promise((r) => setTimeout(r, 1600));
          const end = width();
          const track = fill.parentElement.getBoundingClientRect().width;
          const want = (Number(fill.getAttribute('data-value')) / 100) * track;
          return {
            milestoneRan: mid !== end && Math.abs(end - want) < track * 0.04,
            nodes: d.querySelectorAll('.infographic-node').length,
            detail: { mid, end, want },
          };
        }
        w.play();
        const el = d.getElementById('f0');
        const first = el.textContent;
        await new Promise((r) => setTimeout(r, 500));
        return { counting: el.textContent !== first || first === '0' };
      });
      row.checks.autoFit =
        !r9.fatal && r9.errs.length === 0
        && (r9.bars >= 3 || r9.rows >= 2 || !!r9.ringMoved || !!r9.counting || !!r9.milestoneRan);
      if (!row.checks.autoFit) row.issues.push('infographic: ' + JSON.stringify(r9));
      out.push(row);
      continue;
    }
    if (isVersus) {
      // Versus: after the entrance settles, the two team columns must sit exactly on their
      // 40% side of the frame — never crossing into the reserved center VS corridor (the
      // middle 20%) and never hanging off the frame edge — with the design's own samples
      // AND with 60-character team names. The masks clip the names at the column edge, so
      // the visible text extent is the mask rect, not the span.
      const r11 = await runInFrame(tpl, async (w, d) => {
        const W = d.documentElement.clientWidth; // 1920 — the corridor is W*0.4 .. W*0.6
        w.play();
        // The longest entrance (vs-glide) settles at ~1.6 s.
        await new Promise((r) => setTimeout(r, 2200));
        const T = 2; // sub-pixel rounding tolerance
        const measure = () => {
          const a = d.querySelector('.versus-side-a').getBoundingClientRect();
          const b = d.querySelector('.versus-side-b').getBoundingClientRect();
          const maskA = d.querySelector('.versus-side-a .versus-mask').getBoundingClientRect();
          const maskB = d.querySelector('.versus-side-b .versus-mask').getBoundingClientRect();
          const ev = d.querySelector('.versus-bottom .versus-mask').getBoundingClientRect();
          return {
            // settled exactly on its edge (a mid-flight column would be far off these marks)…
            aSettled: Math.abs(a.left) <= T,
            bSettled: Math.abs(b.right - W) <= T,
            // …and out of the corridor: column AND visible name end at the 40%/60% lines
            aOutOfCorridor: a.right <= W * 0.4 + T && maskA.right <= W * 0.4 + T,
            bOutOfCorridor: b.left >= W * 0.6 - T && maskB.left >= W * 0.6 - T,
            eventInFrame: ev.left >= -T && ev.right <= W + T,
            rects: { a: [a.left, a.right], b: [b.left, b.right], maskA: [maskA.left, maskA.right], maskB: [maskB.left, maskB.right] },
          };
        };
        const vs = d.querySelector('.versus-vs').getBoundingClientRect();
        const settled = getComputedStyle(d.querySelector('.versus')).opacity === '1' &&
          getComputedStyle(d.querySelector('.versus-center')).opacity === '1' &&
          Math.abs((vs.left + vs.right) / 2 - W / 2) <= T; // the VS holds the corridor center
        const withSamples = measure();
        // 60-char names (spaces included): they must wrap inside the column, never widen it.
        const LONG = 'INTERNATIONAL ATHLETICS FEDERATION WORLD CHAMPIONSHIP SQUADS';
        w.update(JSON.stringify({ f0: LONG, f1: LONG, f2: 'GRAND FINAL · SATURDAY 20:00 · MAIN ARENA · LIVE COVERAGE' }));
        await new Promise((r) => setTimeout(r, 120)); // reflow after the rebind
        const withLongNames = measure();
        return {
          settled,
          bound: d.getElementById('f0')?.textContent === LONG && d.getElementById('f1')?.textContent === LONG,
          withSamples,
          withLongNames,
        };
      });
      const inFrame = (m) => m && m.aSettled && m.bSettled && m.aOutOfCorridor && m.bOutOfCorridor && m.eventInFrame;
      row.checks.autoFit = !r11.fatal && r11.errs.length === 0 && !!r11.settled && !!r11.bound
        && inFrame(r11.withSamples) && inFrame(r11.withLongNames);
      if (!row.checks.autoFit) row.issues.push('versus: ' + JSON.stringify(r11));
      out.push(row);
      continue;
    }
    if (isQuiz) {
      // Quiz: options bind, and next() reveals the correct answer highlight.
      //
      // The field layout is READ OFF THE TEMPLATE, never assumed: a board has two, three or
      // four answers, so the correct-answer dropdown is f3, f4 or f5. Writing 'B' into a
      // hard-coded f5 set nothing at all on the smaller boards and reported a reveal failure
      // that was the sweep's, not the graphic's.
      const answers = tpl.fields.filter((f) => /^Answer /.test(f.title));
      const correct = tpl.fields.find((f) => f.title === 'Correct answer');
      const payload = { f0: 'Which planet is red?' };
      const NAMES = ['Venus', 'Mars', 'Pluto', 'Titan'];
      answers.forEach((f, i) => { payload[f.field] = NAMES[i]; });
      // Pick the SECOND answer as the right one — every board has at least two.
      if (correct) payload[correct.field] = 'B';
      const secondAnswer = answers[1]?.field;
      const r10 = await runInFrame(tpl, async (w, d) => {
        w.update(JSON.stringify(payload));
        w.play();
        await new Promise((r) => setTimeout(r, 900));
        w.next();
        await new Promise((r) => setTimeout(r, 500));
        return {
          bound: d.getElementById(secondAnswer)?.textContent === 'Mars',
          revealed: !!d.querySelector('.quiz-correct'),
        };
      });
      row.checks.autoFit = !r10.fatal && r10.errs.length === 0 && !!r10.bound && !!r10.revealed;
      if (!row.checks.autoFit) row.issues.push('quiz: ' + JSON.stringify(r10));
      out.push(row);
      continue;
    }
    if (isTicker) {
      // A marquee holds every item in the track at once (twice over, for the seamless loop).
      // A ROTATING ticker shows one at a time and its own timer advances them, so the same
      // count would be wrong by design — check that the item on screen is one the operator
      // actually typed instead.
      const rotates = tpl.js.includes('TICKER_ROTATE = true');
      const r6 = await runInFrame(tpl, async (w, d) => {
        w.update(JSON.stringify({ f0: 'Item one\nItem two\nItem three', f1: 'LIVE' }));
        const track = d.getElementById('ticker-track');
        return { items: track.children.length, shown: track.textContent.trim(), label: d.getElementById('f1')?.textContent };
      });
      const carriesItems = rotates
        ? ['Item one', 'Item two', 'Item three'].some((i) => r6.shown?.includes(i))
        : r6.items >= 3;
      row.checks.autoFit = !r6.fatal && r6.errs.length === 0 && carriesItems && r6.label === 'LIVE';
      if (!row.checks.autoFit) row.issues.push('ticker-track: ' + JSON.stringify(r6));
      // A marquee that never MOVES fails silently: the builder returns null (or its dynamic is
      // gone from the data) and the interpreter skips it with no error, leaving a strip that
      // renders its items perfectly and simply sits there. Content checks cannot see that, so
      // play it and watch the track actually travel. Only the marquee is asserted here: a
      // rotator's cycling is timer-driven and a flip animates the items, not the track.
      const marquee = /"build"\s*:\s*"tickerMarquee"/.test(tpl.js);
      if (marquee) {
        const r6b = await runInFrame(tpl, async (w, d) => {
          w.update(JSON.stringify({ f0: 'Item one\nItem two\nItem three', f1: 'LIVE' }));
          const track = d.getElementById('ticker-track');
          w.play();
          const before = w.getComputedStyle(track).transform;
          // POLL, never sleep a fixed span. The travel only starts once the strip's half-second
          // fade-in has finished, so a single sample at 500 ms lands on the boundary — and under
          // a loaded machine it lands before it, reporting a working marquee as dead. The set of
          // "failing" tickers then changed every run, which is the signature of a racing check
          // rather than a broken template.
          let after = before, waited = 0;
          while (after === before && waited < 4000) {
            await new Promise((r) => setTimeout(r, 60));
            waited += 60;
            after = w.getComputedStyle(track).transform;
          }
          return { before, after, waitedMs: waited };
        });
        row.checks.marqueeMoves = !r6b.fatal && r6b.errs.length === 0 && r6b.before !== r6b.after;
        if (!row.checks.marqueeMoves) row.issues.push('marquee never moved: ' + JSON.stringify(r6b));
      }
      out.push(row);
      continue;
    }
    if (isCredits) {
      const r5 = await runInFrame(tpl, async (w, d) => {
        w.update(JSON.stringify({ f0: 'CREW\nDirector | Ada Lovelace\nProducer | Grace Hopper', f1: '(c) 2026 Test' }));
        const track = d.getElementById('credits-track');
        return { rows: track.children.length, hasEnd: !!track.querySelector('.credits-end') };
      });
      row.checks.autoFit = !r5.fatal && r5.errs.length === 0 && r5.rows >= 2 && r5.hasEnd;
      if (!row.checks.autoFit) row.issues.push('credits-track: ' + JSON.stringify(r5));
      out.push(row);
      continue;
    }
    if (isAudience) {
      // AUDIENCE graphics wrap in their MESSAGE, not in #f0 — that field is the kicker on a
      // question card and the handle on a chat strap. And the message CLAMPS rather than
      // wrapping forever: audience text is the one thing on a broadcast graphic whose length
      // nobody in the production controls, so a 400-character question has to end in an
      // ellipsis instead of growing the card off the frame.
      const LONG = 'I have been watching since the very first series and I have always wondered how the '
        + 'running order actually gets decided on the day, especially when a big story breaks late in '
        + 'the afternoon and everything that was planned has to move around it at short notice.';
      const messageField = (tpl.html.match(/class="audience-question" id="(f\d+)"/) || [])[1];
      const queueField = tpl.html.includes('id="audience-queue"')
        ? (tpl.html.match(/<div id="(f\d+)" style="display: none">/) || [])[1]
        : null;
      const r11 = await runInFrame(tpl, async (w, d) => {
        w.play();
        await new Promise((r) => setTimeout(r, 600));
        const out = { boxW: 0, grew: true, clamped: true, rows: 0, live: 0, anon: false };
        const box = d.querySelector('.audience-box');
        if (messageField) {
          const el = d.querySelector('.audience-question');
          w.update(JSON.stringify({ [messageField]: 'Short?' }));
          const shortH = el.getBoundingClientRect().height;
          w.update(JSON.stringify({ [messageField]: LONG }));
          const cs = w.getComputedStyle(el);
          const lines = parseInt(cs.webkitLineClamp, 10) || 99;
          out.grew = el.getBoundingClientRect().height > shortH;
          out.clamped = el.getBoundingClientRect().height <= parseFloat(cs.lineHeight) * lines + 2;
        }
        if (queueField) {
          w.update(JSON.stringify({ [queueField]: 'One? | A | X\nTwo? | | Y\nThree?' }));
          out.rows = d.querySelectorAll('.audience-queue-row').length;
          out.live = d.querySelectorAll('.audience-queue-live').length;
        }
        // A missing name has to render as the stand-in, on every form that carries a byline.
        const asker = d.querySelector('.audience-asker');
        if (asker) {
          const field = asker.id;
          w.update(JSON.stringify({ [field]: '' }));
          out.anon = d.querySelector('.audience').classList.contains('audience-no-asker');
        } else {
          out.anon = true;                                  // this form has no byline to test
        }
        out.boxW = Math.round(box.getBoundingClientRect().width);
        return out;
      });
      const capA = Number((tpl.css.match(/max-width:\s*(?:min\(calc\()?(\d+)px/) || [])[1] ?? 830);
      row.checks.autoFit =
        !r11.fatal && r11.errs.length === 0 && r11.grew && r11.clamped && r11.anon &&
        r11.boxW <= capA + 2 && (!queueField || (r11.rows === 3 && r11.live === 1));
      if (!row.checks.autoFit) row.issues.push('audience: ' + JSON.stringify({ ...r11, cap: capA }));
      out.push(row);
      continue;
    }
    if (compPrefix) {
      // The competition contract is `.{prefix}-box` > `-head` + `-body` (the accent is a
      // flourish a design may not have), and HALF THE PACK IS FULL-FRAME BY DESIGN — matchup
      // and reveal are stages, not panels. The standard max-width check below is therefore
      // meaningless here: a full-frame stage IS 1920 wide, so every design in the pack failed
      // it against an 830px cap, and a real regression had nowhere to show.
      //
      // What actually holds for both shapes is that the graphic settles and stays INSIDE the
      // 1920x1080 frame — with operator text long enough to push it out if it were going to.
      const LONG = 'INTERNATIONAL ATHLETICS FEDERATION WORLD CHAMPIONSHIP SQUAD';
      const r12 = await runInFrame(tpl, async (w, d) => {
        const W = 1920, H = 1080, T = 2;
        w.play();
        await new Promise((r) => setTimeout(r, 900));
        const box = d.querySelector(`.${compPrefix}-box`);
        const root = d.querySelector(`.${compPrefix}`);
        if (!box || !root) return { structure: false };
        const inFrame = () => {
          const b = box.getBoundingClientRect();
          return b.left >= -T && b.top >= -T && b.right <= W + T && b.bottom <= H + T;
        };
        const structure = !!d.querySelector(`.${compPrefix}-head`) && !!d.querySelector(`.${compPrefix}-body`);
        const settled = w.getComputedStyle(root).opacity === '1';
        const withSamples = inFrame();
        // Write into the VISIBLE text lines only: a hidden source div is a rows textarea whose
        // content is parsed, not laid out, so a long string there tests nothing.
        const ids = [...d.querySelectorAll('[id^="f"]')]
          .filter((el) => /^f\d+$/.test(el.id) && el.tagName !== 'IMG' && w.getComputedStyle(el).display !== 'none')
          .slice(0, 2).map((el) => el.id);
        if (ids.length) {
          w.update(JSON.stringify(Object.fromEntries(ids.map((id) => [id, LONG]))));
          await new Promise((r) => setTimeout(r, 140)); // reflow after the rebind
        }
        const b = box.getBoundingClientRect();
        return {
          structure, settled, withSamples, withLongText: inFrame(), fields: ids.length,
          boxW: Math.round(b.width), boxH: Math.round(b.height),
        };
      });
      row.checks.autoFit = !r12.fatal && r12.errs.length === 0
        && !!r12.structure && !!r12.settled && !!r12.withSamples && !!r12.withLongText;
      if (!row.checks.autoFit) row.issues.push('competition: ' + JSON.stringify(r12));
      out.push(row);
      continue;
    }
    const t4 = v.create({ lines: [{ title: 'Name', sample: 'X' }, { title: 'Title', sample: 'T' }] });
    const r4 = await runInFrame(t4, async (w, d) => {
      const long = 'Alexandrina Konstantinopolous-Vanderberg Featherstonehaugh III';
      const el = d.getElementById('f0');
      const box = d.querySelector('[class*="-box"]');
      w.update(JSON.stringify({ f0: 'Al', f1: 'Title' }));
      const shortH = el.getBoundingClientRect().height;
      w.update(JSON.stringify({ f0: long, f1: 'Title' }));
      const longRect = el.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      return {
        wrapped: longRect.height > shortH * 1.5,
        boxW: Math.round(boxRect.width),
        // For a BAND the question is not "did it wrap" but "did it stay inside": a full-width
        // strip has room for a long name without wrapping, and that is the design working.
        contained: longRect.right <= boxRect.right + 1 && longRect.left >= boxRect.left - 1,
      };
    });
    // The cap differs per category — read it from the generated CSS (max-width on the box).
    // Matches both the plain `806px` form and the scale-aware `min(calc(806px * var(--scale)), …)`
    // form; the sweep creates at default scale 1, where both mean the same width.
    //
    // A BAND design (an alert banner, a public-notice strip) opts out of the shared auto-fit
    // cap with `max-width: none` and states its own width instead — a full-width band is the
    // point of it. Its declared width is then the cap the check should hold it to; without
    // this the sweep measures every band against a cap it deliberately does not obey.
    //
    // A FULL-FRAME BAND states no width at all: it sets `width: 100%` beside the `max-width:
    // none`, so it takes exactly the picture it sits in and its cap is the FRAME, not the safe
    // area. Holding it to the safe-area cap asks it to be 240px narrower than the shape it is —
    // edge contact is the whole silhouette (lowerThirds/lt63, the catalog's one such band).
    // Read that pair from the BOX RULE rather than from the file at large: `width: 100%` on a
    // child — an alert's flag cap, an info-card's printed rule — says nothing about the box's
    // own footprint, and half the opt-out designs carry one.
    const boxRules = [...t4.css.matchAll(/^\.[a-z-]+-box\s*\{([^}]*)\}/gm)].map((m) => m[1]);
    const fillsTheFrame = boxRules.some(
      (rule) => /\bwidth:\s*100%/.test(rule) && /max-width:\s*none/.test(rule),
    );
    const declaredWidth = Number((t4.css.match(/\n\s*width:\s*calc\((\d+)px \* var\(--scale\)\)/) || [])[1]);
    const optsOutOfAutoFit = /max-width:\s*none/.test(t4.css);
    const cap = fillsTheFrame
      ? t4.resolution.width
      : optsOutOfAutoFit && declaredWidth
        ? declaredWidth
        : Number((t4.css.match(/max-width:\s*(?:min\(calc\()?(\d+)px/) || [])[1] ?? 830);
    // A long value passes when it stays INSIDE the box and the box stays within its cap
    // (boxW <= cap, checked below). It gets inside the box one of two ways: a heading too long
    // for one line WRAPS, or a shorter line simply FITS on one line. Requiring a wrap
    // specifically was a lower-third-shaped assumption — there #f0 is the name, and a long one
    // cannot fit on one line within the narrow cap, so it always wraps. Info-card designs whose
    // #f0 is a LABEL rather than the heading (now/next's kicker, the process heading, the offer
    // kicker) fit a long value on one line instead, which is the design working, not a failure.
    // Overflow is still caught — the value then escapes the box and `contained` is false.
    const fits = !!r4.wrapped || !!r4.contained;
    row.checks.autoFit = !r4.fatal && fits && r4.boxW <= cap + 2;
    if (!row.checks.autoFit) row.issues.push('autofit: ' + JSON.stringify({ fatal: r4.fatal, wrapped: r4.wrapped, contained: r4.contained, boxW: r4.boxW, cap }));
    out.push(row);
  }
  return out;
}, CATEGORY);

console.log(JSON.stringify(results, null, 1));

// ---------- 2) Taste screenshots: settled state over a video-like backdrop ----------
const ids = results.map((r) => r.id);
for (const id of ids) {
  await page.evaluate(async ([variantId, CAT]) => {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { CATALOG: C2 } = await import('/src/templates/catalog.ts');
    const v = (C2[CAT] || []).find((x) => x.id === variantId);
    const tpl = v.create();
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;width:1920px;height:1080px;overflow:hidden;position:relative;' +
      'background: radial-gradient(1200px 700px at 30% 20%, #2a3648 0%, #141b26 45%, #0a0e15 100%);';
    // a few soft shapes so it reads like out-of-focus video, not a flat card
    const blob = (x, y, s, c) => { const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:${c};filter:blur(90px);opacity:.5`;
      document.body.appendChild(d); };
    blob(1250, 120, 420, '#3d5a80'); blob(300, 600, 380, '#1f3a2e'); blob(1500, 700, 300, '#4a3660');
    const f = document.createElement('iframe');
    f.id = 'shot';
    f.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
    f.setAttribute('allowtransparency', 'true');
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); document.body.appendChild(f); });
    const w = f.contentWindow;
    // Send every field's own default value — categories with fields beyond f0/f1
    // (scoreboards, quiz…) must not have them blanked in the taste shot.
    const data = {};
    tpl.fields.forEach((fld) => { data[fld.field] = fld.value; });
    // Fall back to the suggested line ONLY when f0 has no default of its own. A field's own
    // default is the design's truth; a design whose wizard lines are composite parse-inputs
    // (ig07's "Name | Party | Percent", split into 9 fields at create) would otherwise get
    // the raw pipe-joined line stuffed into its name element.
    if (v.suggestedLines[0] && !data.f0) data.f0 = v.suggestedLines[0].sample;
    w.update(JSON.stringify(data));
    w.play();
  }, [id, CATEGORY]);
  // Continuous motion needs longer; the versus glide entrance only settles at ~1.6 s.
  await page.waitForTimeout(['end-credits', 'ticker'].includes(CATEGORY) ? 4500 : CATEGORY === 'versus' ? 2600 : 1600);
  if (CATEGORY === 'quiz') {
    // Show the answer reveal in the taste shot.
    await page.evaluate(() => document.getElementById('shot').contentWindow.next());
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${OUT}/${id}.png` });
  console.log('shot:', id);
}

await browser.close();
console.log('DONE');
