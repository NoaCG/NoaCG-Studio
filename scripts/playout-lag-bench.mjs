// DOES THE OPERATOR'S LAG FOLLOW SELECTION, OR THE VERBS?
//
//   npm run dev:worktree                      (the dev server, for the seed only)
//   node scripts/playout-lag-bench.mjs playout-lag-out --seed
//   npm run build && npm run dev:worktree -- --preview     (the BUILT app, same port)
//   node scripts/playout-lag-bench.mjs playout-lag-out --measure [--rounds N] [--pool N] [--headless]
//
// Both phases in one go against the dev server (instrument shake-out only, never a number to
// act on) is the no-flag form: node scripts/playout-lag-bench.mjs [out-dir]
//
// The owner, driving his own quiz on 2026-09-05: "It didn't play out immediately, or it didn't
// stop immediately." docs/backlog/playout-lag-when-working-the-queue.md carries what was already
// measured - the click handler is 0.3-0.4 ms and the host page records no long task - and the one
// finding that matched "moving around the queue": every cue selection replaces the preview
// iframe's 184 KB `srcdoc`. Nobody had measured what that rebuild COSTS, or whether a Take
// pressed straight after one is slower than a Take pressed on its own.
//
// So this is not a screenshot script and it asserts nothing. It drives the real dashboard and
// reports four numbers per gesture, in one clock (absolute epoch milliseconds, so a stamp taken
// inside a sandboxed graphic document is comparable with one taken in the host - each document
// has its OWN `performance.timeOrigin`, which is why every stamp here is `timeOrigin + now()`):
//
//   click        the capture-phase stamp, before React's handler runs
//   command      the command reaching the stage (PROGRAM's `data-plays` moves, set synchronously
//                inside `PayloadStage.apply`)
//   played       the graphic's own command handler RETURNING, stamped inside its document
//   painted      the first animation frame after that handler - the frame the entrance is drawn in
//
// And one number the four cannot give: `frozeMs`, the largest gap between consecutive animation
// frames in the HOST page across the gesture. That is what an operator actually feels. It is
// measured rather than inferred because the preview document boots on a thread the host may
// share, and a long task attributed to a child frame is exactly the one the host's own
// `longtask` observer missed on 2026-09-05.
//
// WHAT IT FOUND on 2026-09-10 is in docs/backlog/playout-lag-when-working-the-queue.md, and the
// short version is worth carrying here so nobody re-derives the trap: on the BUILT app a Take
// paints in 29 ms and an Out in 30 ms, the preview rebuild costs ONE FRAME, and nothing freezes
// the page for longer than a frame. On the DEV SERVER the same gestures take three to seven
// times as long. Any latency number taken against `npm run dev` is a measurement of React's
// development runtime, which is why this script has a `--measure` phase at all.
//
// Named `*-bench*` on purpose: that puts it inside SWEEP_SCRIPTS (scripts/command-match.mjs), so
// it queues behind any other browser-driving job on this machine rather than competing with one.
// The 2026-09-05 measurement was taken with 3.9 GB free against a 4.0 GB floor, so free memory is
// recorded beside every run - a browser that is swapping lags whatever the code does.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { outDir } from './out-dir.mjs';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('-'));
const headless = args.includes('--headless');
const roundsArg = args.indexOf('--rounds');
const ROUNDS = roundsArg >= 0 ? Number(args[roundsArg + 1]) : 6;
/**
 * TWO PHASES, because the number that matters can only come off the BUILT app.
 *
 * The fixture is built by calling the app's own modules through the dev server's module graph
 * (`import('/src/model/shows.ts')`, the same door e2e/_create.ts uses) - and a production bundle
 * has no such graph. `--seed` therefore runs against the dev server and saves the browser
 * profile it produced: localStorage AND IndexedDB, which is where a production actually lives
 * (model/durableStore.ts). `--measure` restores that profile against whatever is serving the
 * same port - `npm run dev:worktree -- --preview`, the built app - and only measures.
 *
 * The port is the same number in both phases, and that is load-bearing rather than convenient:
 * a stored profile belongs to an ORIGIN, and http://localhost:5224 is the same origin whether
 * Vite is serving src/ or dist/ behind it.
 *
 * With neither flag it seeds and measures in one go against the dev server, which is fine for
 * shaking the instrument out and worthless for a number anybody is going to act on.
 */
const seedOnly = args.includes('--seed');
const measureOnly = args.includes('--measure');

const out = outDir(positional[0], 'playout-lag-out', 'Usage: node scripts/playout-lag-bench.mjs [out-dir] [--seed|--measure] [--headless] [--rounds N]');
mkdirSync(out, { recursive: true });
const port = execSync('node scripts/dev-port.mjs').toString().trim();
const base = `http://localhost:${port}`;

const gb = (bytes) => (bytes / 1024 ** 3).toFixed(2);
const freeNow = () => ({ freeGb: Number(gb(freemem())), totalGb: Number(gb(totalmem())) });

// ── The probes, injected at document start into EVERY frame ────────────────────────────────
//
// In a GRAPHIC document (any frame that is not the top one) this wraps `addEventListener` so
// that every `message` listener the composed document registers is timed from the outside: the
// stamp before the call is the command arriving, the stamp after it is `play()` having returned.
// Wrapping the registration rather than adding a second listener is what makes "after" mean
// after - listener order is registration order, and this script cannot register later than a
// document it does not control.
const FRAME_PROBE = `(() => {
  const abs = () => performance.timeOrigin + performance.now();
  if (window === window.top) return;
  const marks = [];
  window.__lagMarks = marks;
  const origAdd = window.addEventListener.bind(window);
  window.addEventListener = function (type, fn, opts) {
    if (type !== 'message' || typeof fn !== 'function') return origAdd(type, fn, opts);
    const wrapped = function (ev) {
      const d = ev && ev.data;
      const cmd = d && typeof d === 'object' && d.type === 'spx-preview-cmd' ? d.cmd : null;
      // A state poll is a round trip every 500-1000 ms and would drown the record; only the
      // commands a VERB sends are kept.
      if (!cmd || cmd === 'state' || cmd === 'measure') return fn.apply(this, arguments);
      const rec = { cmd, arrived: abs(), played: null, painted: null, nextFrame: null };
      try {
        return fn.apply(this, arguments);
      } finally {
        rec.played = abs();
        marks.push(rec);
        requestAnimationFrame(() => {
          rec.painted = abs();
          requestAnimationFrame(() => { rec.nextFrame = abs(); });
        });
      }
    };
    return origAdd(type, wrapped, opts);
  };
  // The document's own boot, for the preview rebuild: parse start, then the first frame it can
  // draw in. The graphic's fonts, GSAP and the fit ladder all land between these two.
  marks.push({ cmd: '__parse', arrived: abs(), played: abs(), painted: null, nextFrame: null });
  window.addEventListener('load', () => {
    const t = abs();
    const rec = { cmd: '__load', arrived: t, played: t, painted: null, nextFrame: null };
    marks.push(rec);
    requestAnimationFrame(() => { rec.painted = abs(); });
  });
})();`;

/**
 * The HOST probes: a continuous animation-frame sampler, a capture-phase click stamp, and two
 * targeted attribute observers. Installed after the production page is up rather than at
 * document start, so nothing here is paid during the app's own boot.
 *
 * `data-plays` is the honest "the command reached the stage" signal: PayloadStage sets it
 * synchronously inside the same `apply` call that posts into the graphic's document.
 */
const HOST_PROBE = `(() => {
  const abs = () => performance.timeOrigin + performance.now();
  const h = { frames: [], clicks: [], plays: [], srcdoc: [], previewLoads: [] };
  window.__lagHost = h;
  const tick = () => { h.frames.push(abs()); if (h.frames.length > 4000) h.frames.shift(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  document.addEventListener('click', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-testid],.pd-cue-label') : null;
    h.clicks.push({ t: abs(), what: el ? (el.getAttribute('data-testid') || el.className) : 'unknown' });
  }, true);
  const stage = document.querySelector('[data-testid="program-stage"]');
  if (stage) new MutationObserver(() => h.plays.push({ t: abs(), plays: Number(stage.getAttribute('data-plays') || 0) }))
    .observe(stage, { attributes: true, attributeFilter: ['data-plays'] });
  const attachPreview = () => {
    const frame = document.querySelector('[data-testid="production-preview"] iframe');
    if (!frame || frame.__lagAttached) return;
    frame.__lagAttached = true;
    new MutationObserver(() => h.srcdoc.push({ t: abs(), bytes: (frame.getAttribute('srcdoc') || '').length }))
      .observe(frame, { attributes: true, attributeFilter: ['srcdoc'] });
    frame.addEventListener('load', () => h.previewLoads.push(abs()));
  };
  attachPreview();
  // The frame node is React-stable, but the preview is absent until a cue is selected.
  window.__lagAttachPreview = attachPreview;
})();`;

/** Everything the host recorded, then cleared - one gesture's worth. */
const HOST_READ = `(() => {
  const h = window.__lagHost;
  const out = { frames: h.frames.slice(), clicks: h.clicks.slice(), plays: h.plays.slice(), srcdoc: h.srcdoc.slice(), previewLoads: h.previewLoads.slice() };
  h.frames.length = 0; h.clicks.length = 0; h.plays.length = 0; h.srcdoc.length = 0; h.previewLoads.length = 0;
  return out;
})();`;

/** The largest gap between consecutive animation frames in a window - the freeze an operator feels. */
function frozeMs(frames, from) {
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from) continue;
    worst = Math.max(worst, frames[i] - frames[i - 1]);
  }
  return Number(worst.toFixed(1));
}

const round = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Number(n.toFixed(1)));

/** Where the seed phase leaves the browser profile and the fixture's own ids. */
const STATE_FILE = join(out, 'seed-state.json');
const FIXTURE_FILE = join(out, 'seed-fixture.json');

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  ...(measureOnly ? { storageState: STATE_FILE } : {}),
});
await context.addInitScript(FRAME_PROBE);
const page = await context.newPage();

/** Build one catalog design into the working document - the wizard's own create path. */
const createProject = (variantName) =>
  page.evaluate(async (name) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const variant = Object.values(CATALOG).flat().find((v) => v.name === name);
    if (!variant) throw new Error(`no catalog variant called ${name}`);
    const draft = mergeDraft(initialDraft(), {
      variantId: variant.id,
      lines: variant.suggestedLines.map((l) => ({ ...l })),
    });
    const template = await formatTemplate(buildDraftTemplate(variant, draft));
    useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
  }, variantName);

// ── THE FIXTURE: the owner's shape, not a lower third ───────────────────────────────────────
// A quiz board (drawn states, a machine, the fit ladder on every state change), a scoreboard and
// a lower third, in ONE production with six cues that alternate between them - so "move up and
// down the rundown" crosses a template boundary on every step, which is the only case where the
// preview document can be replaced at all.
const GRAPHICS = ['Arena Quiz', 'Quiet Score', 'Hairline'];
/**
 * HOW MANY GRAPHICS THE PRODUCTION HOLDS - the axis that decides whether this scales to a real
 * show. Every pool graphic gets its OWN document on the PROGRAM stage at all times, its own
 * entry in the once-a-second state poll, and its own row in every render of the rundown, so a
 * production is not one size. Three is the default because it is the smallest fixture that can
 * cross a template boundary; the 2026-09-12 rehearsal is a quiz plus a scoreboard plus whatever
 * else the night needs. Pass `--pool 8` to ask the question at that size.
 */
const poolArg = args.indexOf('--pool');
const POOL = poolArg >= 0 ? Math.max(3, Number(args[poolArg + 1])) : GRAPHICS.length;

let showId;
let fixture;
if (measureOnly) {
  ({ showId, fixture } = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')));
} else {
  await seedFixture();
  if (seedOnly) {
    await context.storageState({ path: STATE_FILE, indexedDB: true });
    writeFileSync(FIXTURE_FILE, JSON.stringify({ showId, fixture }, null, 2) + '\n');
    await browser.close();
    console.log(`Seeded ${fixture.labels.length} cues over ${fixture.graphics.join(', ')}.`);
    console.log(`Profile written to ${STATE_FILE} - now serve the BUILT app on the same port and re-run with --measure.`);
    process.exit(0);
  }
}

/** Create the three graphics, the production, its cues, its data tree and its bindings. */
async function seedFixture() {
  await page.goto(`${base}/app`);
  await page.waitForSelector('.topbar');
  await page.evaluate(async () => {
    const { setAnalyticsConsent } = await import('/src/backend/events.ts');
    setAnalyticsConsent(false);
  });
  await page.waitForSelector('[data-testid="analytics-consent"]', { state: 'detached' });
  await createProject(GRAPHICS[0]);
  showId = await page.evaluate(async () => {
    const shows = await import('/src/model/shows.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const list = shows.createShow('Lag Bench');
    const show = list[list.length - 1];
    shows.addGraphicToShow(show.id, useTemplateStore.getState().template);
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    return show.id;
  });
  // The pool. `addGraphicToShow` replaces BY NAME, so a bigger pool needs distinct names rather
  // than distinct designs - what costs the dashboard is the number of documents and rows, not
  // how many different catalog entries they came from.
  for (let i = 1; i < POOL; i++) {
    await createProject(GRAPHICS[i % GRAPHICS.length]);
    await page.evaluate(
      async ({ id, suffix }) => {
        const shows = await import('/src/model/shows.ts');
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        const { commitDurableWrites } = await import('/src/model/durableStore.ts');
        const template = useTemplateStore.getState().template;
        shows.addGraphicToShow(id, suffix ? { ...template, name: `${template.name} ${suffix}` } : template);
        const failure = await commitDurableWrites();
        if (failure) throw new Error(failure);
      },
      { id: showId, suffix: i >= GRAPHICS.length ? String(Math.floor(i / GRAPHICS.length) + 1) : '' },
    );
  }

  // Six cues, alternating graphic, and a BOUND production: seed data plus one binding per graphic,
  // so the data effect runs and every take carries an overlaid value, exactly as his did.
  fixture = await page.evaluate(async ({ id, cues }) => {
    const shows = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const all = shows.loadShows();
    const show = all.find((s) => s.id === id);
    if (!show) throw new Error('no show');
    const pool = show.graphics;
    const labels = [];
    // Two cues per pool graphic, laid out so that `labels[n]` and `labels[n + pool.length]` are
    // the same graphic - which is what lets a family move WITHIN one template.
    for (let i = 0; i < cues; i++) {
      const g = pool[i % pool.length];
      const { cueId } = shows.addShowCue(id, g.id, { label: `${g.name} cue ${Math.floor(i / pool.length) + 1}` });
      if (!cueId) throw new Error('cue refused');
      labels.push(`${g.name} cue ${Math.floor(i / pool.length) + 1}`);
    }
    shows.setShowSeedData(id, { round: { title: 'Round two', home: '3', away: '1' } });
    for (const g of pool) {
      const text = g.template.fields.find((f) => (f.ftype ?? 'textfield') === 'textfield');
      if (text) shows.setFieldBinding(id, g.name, text.field, 'round.title');
    }
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    return { labels, graphics: pool.map((g) => g.name), poolSize: pool.length };
  }, { id: showId, cues: POOL * 2 });
}


await page.goto(`${base}/app#/production/${showId}`);
await page.waitForSelector('[data-testid="cue-editor"]');
// The PROGRAM stage builds one document per pool graphic and boots them all; nothing below is a
// measurement of that boot, so wait it out first.
await page.waitForTimeout(4000);
await page.evaluate(HOST_PROBE);

/** Select a cue by its rundown label - the operator's own gesture. */
const clickCue = async (label) => {
  await page.locator('.pd-cue', { hasText: label }).locator('.pd-cue-label').first().click();
};

/** Read every graphic frame's marks, then clear them. */
async function frameMarks() {
  const rows = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    let marks;
    try {
      marks = await frame.evaluate(() => {
        const m = window.__lagMarks;
        if (!m) return null;
        const copy = m.slice();
        m.length = 0;
        return copy;
      });
    } catch {
      continue; // a frame that went away mid-read is a rebuilt preview, which the host recorded
    }
    if (marks) for (const m of marks) rows.push({ ...m, frame: frame.name() || frame.url().slice(0, 24) });
  }
  return rows;
}

/** One gesture: click, wait, and turn every stamp into the four numbers plus the freeze. */
async function gesture(name, act, settleMs = 1200) {
  await page.evaluate(HOST_READ); // drop whatever the settle before this produced
  await frameMarks();
  const t0 = Date.now();
  await act();
  await page.waitForTimeout(settleMs);
  const host = await page.evaluate(HOST_READ);
  const marks = await frameMarks();
  const click = host.clicks.length ? host.clicks[0].t : t0;
  const command = host.plays.length ? host.plays[0].t : null;
  // The command a VERB sends, not the settle burst the preview gets on selection.
  const verbMark = marks.find((m) => m.cmd === 'play' || m.cmd === 'stop' || m.cmd === 'dispatch') ?? null;
  const bootMark = marks.find((m) => m.cmd === '__load') ?? null;
  return {
    gesture: name,
    clickedWhat: host.clicks.length ? host.clicks[0].what : null,
    // The rebuild half: did the preview document get replaced at all, and how big was it?
    srcdocReplaced: host.srcdoc.length,
    srcdocBytes: host.srcdoc.length ? host.srcdoc[host.srcdoc.length - 1].bytes : null,
    toSrcdocMs: host.srcdoc.length ? round(host.srcdoc[0].t - click) : null,
    toPreviewLoadMs: host.previewLoads.length ? round(host.previewLoads[0] - click) : null,
    toPreviewFirstFrameMs: bootMark && bootMark.painted ? round(bootMark.painted - click) : null,
    // The verb half.
    toCommandMs: command === null ? null : round(command - click),
    toPlayedMs: verbMark ? round(verbMark.played - click) : null,
    toPaintedMs: verbMark && verbMark.painted ? round(verbMark.painted - click) : null,
    handlerMs: verbMark ? round(verbMark.played - verbMark.arrived) : null,
    // What the operator feels, whichever half caused it.
    frozeMs: frozeMs(host.frames, click),
    freeGb: freeNow().freeGb,
  };
}

// ── THE FIVE FAMILIES, INTERLEAVED ──────────────────────────────────────────────────────────
//
// Interleaved, not run one after another, because the first pass of this bench ran them in
// blocks and the LAST block was three times slower than the first - on a machine whose free
// memory fell from 2.2 GB to 0.8 GB while it ran. Block order and machine drift were the same
// axis, so the numbers could not tell them apart. One round of every family, `ROUNDS` times,
// puts every family across the same stretch of the machine's day.
//
// Every family that presses TAKE presses it on the SAME graphic (the quiz, cue "Arena Quiz 1"),
// so no comparison between them is really a comparison between two graphics' entrances.
//
//   select-rebuild        move to a cue of ANOTHER graphic - the document is replaced
//   select-no-rebuild     move to another cue of the SAME graphic - it cannot be
//   take-idle             take, on a selection that settled seconds ago
//   take-after-rebuild    move across a template boundary, then take at once
//   take-after-no-rebuild move within one template, then take at once
//
// take-after-rebuild and take-after-no-rebuild differ in ONE thing: whether the selection
// rebuilt the preview document. take-idle differs from both in one other: whether a selection
// click happened at all. Between the three, the operator's lag has nowhere left to hide.

// Cue 0 and cue `poolSize` are the SAME pool graphic (the quiz), so moving between them cannot
// rebuild the preview document. Cue 1 is a different graphic, so moving to it must.
const QUIZ_A = fixture.labels[0];
const QUIZ_B = fixture.labels[fixture.poolSize ?? 3];
const OTHER = fixture.labels[1];

const runs = [];
const note = (o) => { runs.push(o); console.log(JSON.stringify(o)); };

const buildLabel = measureOnly ? "dist (the BUILT app)" : "src (the DEV server - React dev runtime, not the product)";
console.log(`# playout lag bench — ${new Date().toISOString()} — ${JSON.stringify(freeNow())} — headless=${headless} — serving ${buildLabel}`);
console.log(`# fixture: ${fixture.graphics.join(', ')} / ${fixture.labels.length} cues`);

/** Leave air down and one named cue selected and settled - every family's starting position. */
async function reset(label) {
  const cls = await page.locator('[data-testid="verb-take"]').getAttribute('class');
  if (cls?.includes('pd-verb-live')) {
    await page.getByTestId('verb-take').click();
    await page.waitForTimeout(900);
  }
  await clickCue(label);
  await page.waitForTimeout(2200);
}

await reset(QUIZ_A);
await page.evaluate(() => window.__lagAttachPreview?.());

for (let r = 0; r < ROUNDS; r++) {
  // 1. A selection that REBUILDS the preview document.
  await reset(QUIZ_A);
  note(await gesture('select-rebuild', () => clickCue(OTHER), 2200));

  // 2. A selection that cannot.
  await reset(QUIZ_A);
  note(await gesture('select-no-rebuild', () => clickCue(QUIZ_B), 2200));

  // 3. TAKE on a selection that settled two seconds ago.
  await reset(QUIZ_A);
  note(await gesture('take-idle', () => page.getByTestId('verb-take').click(), 2200));

  // 3b. OUT - the other half of what he reported ("it didn't stop immediately"). The toggle IS
  //     the Out button on a live cue, so this is the same control pressed from the other state.
  //     `toCommand` stays blank here by design: `data-plays` counts entrances, not exits, so
  //     the stage-side stamp for a stop is the one taken INSIDE the graphic's own handler.
  await reset(QUIZ_A);
  await page.getByTestId('verb-take').click();
  await page.waitForTimeout(2200);
  note(await gesture('out-idle', () => page.getByTestId('verb-take').click(), 2200));

  // 4. Move ACROSS a template boundary, then take at once - onto the quiz, so the entrance
  //    being measured is the same one families 3 and 5 measure.
  await reset(OTHER);
  note(
    await gesture(
      'take-after-rebuild',
      async () => {
        await clickCue(QUIZ_A);
        await page.getByTestId('verb-take').click();
      },
      2200,
    ),
  );

  // 5. The control: the same two clicks, the same interval, the same entrance - and no rebuild.
  await reset(QUIZ_B);
  note(
    await gesture(
      'take-after-no-rebuild',
      async () => {
        await clickCue(QUIZ_A);
        await page.getByTestId('verb-take').click();
      },
      2200,
    ),
  );
}

const record = { at: new Date().toISOString(), base, serving: buildLabel, headless, rounds: ROUNDS, memory: freeNow(), fixture, runs };
writeFileSync(join(out, 'playout-lag.json'), JSON.stringify(record, null, 2) + '\n');

// A summary a person reads without opening the JSON: per gesture family, the median of each
// number. Median rather than mean because one swap or one GC should not move the verdict.
const median = (xs) => {
  const v = xs.filter((n) => typeof n === 'number').sort((a, b) => a - b);
  return v.length ? Number(v[Math.floor(v.length / 2)].toFixed(1)) : null;
};
const families = [...new Set(runs.map((r) => r.gesture.split(':')[0]))];
console.log('\n# family                 n  srcdoc  toSrcdoc  toPvwFrame  toCommand  toPlayed  toPainted  froze');
for (const f of families) {
  const rows = runs.filter((r) => r.gesture.split(':')[0] === f);
  const cell = (k) => String(median(rows.map((r) => r[k])) ?? '-').padStart(9);
  console.log(
    `# ${f.padEnd(22)}${String(rows.length).padStart(2)}${String(median(rows.map((r) => r.srcdocReplaced)) ?? '-').padStart(8)}`
    + `${cell('toSrcdocMs')}${cell('toPreviewFirstFrameMs')}${cell('toCommandMs')}${cell('toPlayedMs')}${cell('toPaintedMs')}${cell('frozeMs')}`,
  );
}
console.log(`\nWritten to ${join(out, 'playout-lag.json')}`);

await browser.close();
