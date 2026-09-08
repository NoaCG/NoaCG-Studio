// THE TASTE FRAME REVIEW - render the graphic, so the session can LOOK at it before it ships.
//
// The instrument, its questions and the reason it is answered off a picture are all in
// docs/VISUAL_TASTE_REVIEW.md; this script is only the rendering half of that step. It writes
// PNG frames and asserts NOTHING - a person (or the session) answers the questions by looking.
// Per design:
//   hold.png     the graphic with its own defaults, entrance settled, motion frozen
//   long.png     every text field lengthened the way the text-containment gate does (1.7x its
//                own sample, real words - scripts/text-containment-sweep.mjs), then the entrance
//   step-N.png   each `next()` the design actually ANSWERS - a refused step writes no frame
//   long-step-N.png  the same steps walked at the long strings, which is the only frame that can
//                show a step's box growing with its text
// The bed is #333, the grey the owner's 2026-08-18 blind read used, and the shot is taken through
// the same settle-and-raster recipe as cli/src/screenshot.ts and scripts/pro-spike.mjs, so a
// frame here can be held against the frames he already judged.
//
// Usage (a dev server for THIS checkout must be running - `npm run dev:worktree`):
//   node scripts/taste-frame-review.mjs [out-dir] --only lt27,tk01   # named catalog designs
//   node scripts/taste-frame-review.mjs [out-dir] --affected         # what this branch's diff can move
//   node scripts/taste-frame-review.mjs [out-dir] --base http://localhost:5186
//
// `--only` holds the same contract as every catalog sweep (scripts/catalog-scope.mjs): an id the
// catalog does not ship is an ERROR, never an empty run. `--affected` reads the same plan
// `npm run catalog:affected` does, off the catalog this script already has open, so it costs no
// second browser. A slice renders the named designs; a FULL verdict (shared machinery moved) is
// refused rather than rendering 500 designs - name the ones you changed with --only.
//
// IMPORTED DESIGNS ARE NOT RENDERED HERE. The catalog's `imported-design` entry is a placeholder
// with no artwork, and a second door that builds an import outside the wizard can disagree with
// the one students use. `scripts/svg-import-sweep.mjs --shots <dir>` renders any corpus fixture,
// the owner's quiz board included, through the real door; an id in that category is dropped from
// the scope here and named on the way out.
//
// A DESIGN WHOSE update(), play() OR next() THROWS IS REPORTED, NEVER PAPERED OVER. An exception
// inside page.evaluate reaches no `pageerror` handler, so swallowing one there would hand back a
// long.png identical to hold.png and let "inside its box" be answered YES off a frame that never
// received the long strings - the exact false pass this instrument exists to stop. The error is
// printed on the design's line, the frame is not written, and the run exits 1.
//
// The out-dir defaults to ./shots-taste, which the repo's `shots-*/` ignore rule already covers.
// It drives Chromium over the app, so it is BROWSER WORK: `npm run queue -- "<command>"`, never a
// foreground run beside a suite (`root/enqueue-browser-driving-work-rather-than`,
// scripts/command-match.mjs).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { devPort } from './dev-port.mjs';
import { outDir } from './out-dir.mjs';
import { applyOnly, parseOnly } from './catalog-scope.mjs';

/** The ceiling on how long a mounted graphic gets to finish its entrance (or a step). */
const SETTLE_MS = 2200;
/** The floor: a staggered entrance starts nothing for its first quarter second, and a shot taken
 *  the instant GSAP reports idle would be an empty stage. */
const SETTLE_FLOOR_MS = 600;
/** The category this script cannot render on defaults (see the header). */
const NOT_COVERED = 'imported-design';

// ── Arguments - checked before anything is launched ────────────────────────────────────────
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--only', '--base']);
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]));
if (positional.length > 1) {
  console.error(`One positional argument (the out-dir) - not sure what to do with "${positional[1]}".`);
  process.exit(2);
}
const OUT = outDir(
  positional[0],
  './shots-taste',
  'Usage: node scripts/taste-frame-review.mjs [out-dir] --only lt27,tk01 | --affected',
);
const { ids: onlyIds } = parseOnly(args);
const affected = args.includes('--affected');
const baseAt = args.indexOf('--base');
const baseArg = baseAt >= 0 ? args[baseAt + 1] : null;
if (baseAt >= 0 && (!baseArg || baseArg.startsWith('--'))) {
  console.error('--base takes a URL (e.g. --base http://localhost:5186).');
  process.exit(2);
}
const BASE = baseArg ?? `http://localhost:${devPort()}`;
if (!onlyIds && !affected) {
  console.error('Nothing to render. Name designs with --only, or pass --affected.');
  process.exit(2);
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev:worktree).`);
  process.exit(1);
}

// ── The rig ────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// The catalog and the rig, once. The iframe is the same composed document the studio previews
// and the export ships (composeDocument), on the same bed the owner's blind frames were shot on.
const index = await page.evaluate(async ({ settleMs, floorMs }) => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FILL = ['Wisniewska', 'district', 'provisional', 'afternoon', 'coverage', 'regional'];

  /** The text-containment gate's recipe: each text field lengthened against its OWN sample. */
  const longValues = (win) => {
    const data = {};
    for (const fd of (win.SPXGCTemplateDefinition || {}).DataFields || []) {
      if (fd.ftype !== 'textfield' && fd.ftype !== 'textarea') continue;
      const sample = String(fd.value ?? '').trim();
      if (!sample) continue;
      let value = sample;
      const target = Math.max(sample.length + 8, Math.round(sample.length * 1.7));
      for (let i = 0; value.length < target; i += 1) value += ' ' + FILL[i % FILL.length];
      data[fd.field] = value;
    }
    return data;
  };

  const twoFrames = (win) => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
  const gsapBusy = (win) => {
    const tl = win.gsap?.globalTimeline;
    return tl ? tl.getChildren(true, true, true).some((t) => t.isActive()) : true;
  };

  /**
   * Wait for the motion to finish, then freeze and re-rasterise. GSAP is polled after a floor
   * and up to a ceiling, because a crawl never goes idle (the text-containment rule: pause the
   * global timeline before reading). The raster step is the recipe both existing copies use
   * (cli/src/screenshot.ts, scripts/pro-spike.mjs): a `will-change` layer keeps the texture it
   * was rasterised with mid-entrance, so the hint is turned off, two frames pass, and it is put
   * BACK before the shot - a still taken with the hint removed switches text to a different
   * antialiasing and is a different picture, not a stabler one.
   */
  const settle = async (win) => {
    await sleep(floorMs);
    for (let waited = floorMs; waited < settleMs && gsapBusy(win); waited += 50) await sleep(50);
    win.gsap?.globalTimeline?.pause();
    const hint = win.document.createElement('style');
    hint.textContent = '*{will-change:auto !important}';
    win.document.head.appendChild(hint);
    await twoFrames(win);
    hint.remove();
    await twoFrames(win);
  };

  /**
   * Mount the built document full-frame over the grey bed, write the long values first when
   * asked, play, settle. Returns the step count the design declares. Throws when update() or
   * play() throws - the caller records it, and no frame is passed off as settled.
   */
  window.__mount = async (long) => {
    document.getElementById('taste-stage')?.remove();
    const host = document.createElement('div');
    host.id = 'taste-stage';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#333;overflow:hidden';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1920px;height:1080px;border:0;display:block;color-scheme:dark';
    host.appendChild(frame);
    document.body.appendChild(host);
    await new Promise((r) => {
      frame.onload = r;
      frame.srcdoc = window.__doc;
    });
    const win = frame.contentWindow;
    await win.document.fonts.ready;
    if (long) {
      const data = longValues(win);
      if (Object.keys(data).length) win.update(JSON.stringify(data));
    }
    win.play?.();
    await settle(win);
    const steps = Number.parseInt((win.SPXGCTemplateDefinition || {}).steps, 10);
    return Number.isFinite(steps) ? steps : 1;
  };

  /** Advance one step and settle; false when the design has no next() or REFUSED the move
   *  (next() returns null then - base.ts), so a refused step never ships as a new frame. */
  window.__next = async () => {
    const win = document.querySelector('#taste-stage iframe').contentWindow;
    if (typeof win.next !== 'function') return false;
    win.gsap?.globalTimeline?.resume();
    if (win.next() == null) return false;
    await settle(win);
    return true;
  };

  return Object.entries(window.__cat.CATALOG).flatMap(([category, variants]) =>
    (variants ?? []).map((v) => ({ id: v.id, category })),
  );
}, { settleMs: SETTLE_MS, floorMs: SETTLE_FLOOR_MS });

// ── What to render - every id checked before the first mount ───────────────────────────────
const covered = index.filter((v) => v.category !== NOT_COVERED);
const close = () => browser.close();
let targets = [];
if (onlyIds) targets = await applyOnly(covered, onlyIds, 'taste-frame-review', page, close);
if (affected) {
  const { planForWorkingTree } = await import('./catalog-affected.mjs');
  const plan = await planForWorkingTree({ index });
  if (plan.mode === 'full') {
    console.error(
      'taste-frame-review: this change moves shared machinery, so every design can look different:\n' +
        plan.escalatedBy.map((f) => `  - ${f}`).join('\n') +
        '\nRendering all of them is not a review anybody reads. Name the designs you changed or ' +
        'looked at with --only (one per affected category is the honest minimum). A change on the ' +
        'SVG import road renders through `node scripts/svg-import-sweep.mjs --shots <dir>`.',
    );
    await close();
    process.exit(2);
  }
  const dropped = plan.ids.filter((id) => !covered.some((v) => v.id === id));
  if (dropped.length) {
    console.log(
      `taste-frame-review: ${dropped.join(', ')} is the imported-design placeholder and has no artwork to ` +
        'render - an import is looked at through `node scripts/svg-import-sweep.mjs --shots <dir>`.',
    );
  }
  for (const v of covered) if (plan.ids.includes(v.id) && !targets.some((t) => t.id === v.id)) targets.push(v);
  if (targets.length === 0) {
    console.log('taste-frame-review: nothing in this change can move a catalog design - nothing to look at here.');
    await close();
    process.exit(0);
  }
}

// ── The frames ─────────────────────────────────────────────────────────────────────────────
/** The first line of a page.evaluate rejection - the template's own error, not the stack. */
const firstLine = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 160);
const shoot = (file) => page.screenshot({ path: file });

let written = 0;
let failed = 0;
for (const { id, category } of targets) {
  // Compose once; the hold and long mounts differ only in what update() writes before play().
  const built = await page.evaluate((variantId) => {
    try {
      window.__doc = window.__comp.composeDocument(window.__cat.variantById(variantId).create({}));
      return null;
    } catch (e) {
      return `create() threw: ${String(e?.message ?? e).slice(0, 160)}`;
    }
  }, id);
  if (built) {
    console.error(`  ! ${id}: ${built}`);
    failed += 1;
    continue;
  }
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  const shot = [];
  const errors = [];

  // Both mounts walk the steps. A step frame at the DEFAULT strings alone cannot answer whether
  // a growing box grows the way the design implies (T4) - the owner's X-25 fault was a step whose
  // panel grew with its second line and overflowed the background, which no default-data frame
  // shows. So the long mount steps too, and `long-step-N.png` is the frame T4 is answered off.
  const walk = async (long, first, stepName) => {
    const steps = await page.evaluate((withLong) => window.__mount(withLong), long);
    await shoot(join(dir, first));
    shot.push(first);
    for (let k = 1; k < steps; k += 1) {
      if (!(await page.evaluate(() => window.__next()))) break;
      await shoot(join(dir, stepName(k)));
      shot.push(stepName(k));
    }
  };
  try {
    await walk(false, 'hold.png', (k) => `step-${k}.png`);
  } catch (e) {
    errors.push(`hold: ${firstLine(e)}`);
  }
  try {
    await walk(true, 'long.png', (k) => `long-step-${k}.png`);
  } catch (e) {
    errors.push(`long: ${firstLine(e)}`);
  }

  written += shot.length;
  if (errors.length) failed += 1;
  console.log(
    `  ${id.padEnd(9)} ${category.padEnd(16)} ${shot.join(' · ') || '(nothing)'}` +
      (errors.length ? `\n      ! ${errors.join('\n      ! ')}` : ''),
  );
}
await page.evaluate(() => document.getElementById('taste-stage')?.remove());
await close();

if (written === 0) {
  console.error('taste-frame-review: nothing was rendered - every design named above was refused.');
  process.exit(2);
}
console.log(`
${written} frame(s) in ${OUT}. Open every one and answer docs/VISUAL_TASTE_REVIEW.md in writing.`);
if (failed) {
  console.error(`\n${failed} design(s) threw while building, updating or playing - a frame that was never written cannot be reviewed.`);
  process.exit(1);
}
