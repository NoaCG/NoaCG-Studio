#!/usr/bin/env node
// THE NoaCG PRO SPIKE RUNNER - Phase 0, and the Phase 1 BRAND ROUND on top of it
// (docs/NOACG_PRO_PLAN.md §0 + §14 items 0/0a/1, docs/PRO_PHASE1_HANDOFF.md).
//
//   node scripts/pro-spike.mjs --control                  # FREE. Run this FIRST, and again
//                                                         # after ANY change to the wrapper.
//   node scripts/pro-spike.mjs --generate --route=vercel:<model> --max-cost=8
//                                                         # PAID. Spends real money.
//   node scripts/pro-spike.mjs --generate --route=… --arms=exemplar
//   node scripts/pro-spike.mjs --control news-public       # a subset by brief id
//   node scripts/pro-spike.mjs --alpha --out=<round>      # FREE: re-shoot that round's holds
//                                                         # transparent, from its own saved code
//   node scripts/pro-spike.mjs --recompose --set --out=<round>
//                                                         # FREE: rebuild the round from its
//                                                         # saved languages through TODAY's
//                                                         # composer; --set also composes each
//                                                         # language's package members
//
//   # THE EXEMPLAR ABLATION (plan §14 item 3): the grammar arm across the bank, plus a few
//   # exemplar re-runs to check the stored exemplar arm still reproduces.
//   node scripts/pro-spike.mjs --generate --route=vercel:alibaba/qwen3-coder --max-cost=0.40 \
//     --arms=grammar --drift-check=exemplar:news-public,sports-live,minimalist
//
//   # PHASE A (plan §15.5): the model returns a design LANGUAGE and the platform composes the
//   # graphic. One text call per brief, no image, no repair loop - the cheapest arm here by an
//   # order of magnitude, which is why its divergence cell is affordable.
//   node scripts/pro-spike.mjs --generate --route=vercel:google/gemini-2.5-flash \
//     --arms=language --divergence-arm=language --max-cost=0.40
//
// THE BRAND ROUND (the default since Phase 1): every brief is conditioned on a SYNTHETIC
// brand from benchmarks/pro/v1/spike/brands.json - an invented organisation's name, palette,
// typeface and REAL mark file, the mark's shape/backing/ink measured in the page by probeMark
// before any call. The fixture's `assignment` fixes which brand each brief carries (so a round
// reproduces from committed fixtures alone) and its `divergence` cell re-runs two briefs under
// every OTHER brand on the no-exemplar arm - same brief, different brands, visibly different
// graphics is the round's second question. `--no-brand` runs the bare Phase 0 protocol.
// Records key by `<brief>.<brand>.<arm>`; the mark's rendered gate, the alignment-axis
// instrument and the code audit land on every record beside the validator verdict.
//
// THE CONTROL RUN IS THE POINT OF THE FIRST MODE. It pushes one known-good hand-authored
// lower third - plus the gallery's anchors - through the COMPLETE wrapper: the scaffold
// contract, the deterministic gates, the 1920x1080 render set, the virtual-clock motion
// strips, and the gallery. It spends nothing and calls no model. If the control looks
// broken, the harness is broken, and a paid round would measure the harness. The strips are
// PLAYED as well as laid out - each one is encoded to a webm the gallery loops in place, because
// stills cannot judge motion (owner, after the brand round). ffmpeg is optional; without it the
// gallery falls back to stills. Two paid rounds
// have already been mis-read as model failure when the platform was at fault
// (docs/AI_ATTEMPTS.md), and every deterministic gate stayed green through both - which is
// why this is a picture a human looks at, not an assertion.
//
// THE RUN PROTOCOL (§0.1): the 12-brief bank, every brief in the requested arms (two or three
// hand-vetted complete exemplars retrieved through shortlistFor / no exemplars at all / the
// region GRAMMAR LESSON in their place, src/ai/spike/grammar.ts), one
// candidate each, one or at most two pinned open-weight checkpoints, decoding pinned in
// benchmarks/pro/v1/spike/decoding.json, the shared two-round repair loop,
// productionSpxValidator, composeDocument at 1920x1080, and an ANCHOR-MIXED BLINDED gallery.
//
// THE GALLERY IS BLIND ON PURPOSE (§0.2). review.html shows opaque ids and no verdict, no
// arm and no checkpoint. Human notes are written into notes.md BEFORE anything is revealed;
// `--reveal` then writes key.html, which joins the ids back to their arm, checkpoint,
// validator verdict and cost. A green machine result must not get the chance to frame a
// broken graphic as a success.
//
// ROUTES ARE POLICED by scripts/harness-route-policy.mjs, like every other paid runner here.
//
// Requires the dev server on this checkout's port. From a worktree, compose the environment
// first: `node scripts/bench-env.mjs --profile=pro`, then start the bench dev server.

import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';
import { auditTemplateCode, auditSummaryLine } from './spike-code-audit.mjs';

const BASE = `http://localhost:${devPort()}`;
// ONE OUT-DIR PER CHECKPOINT. Records are keyed by `<brief>.<arm>`, and so are the frames on
// disk, so running a second checkpoint into the same directory silently overwrites the first
// one's images while its ledger rows survive - a gallery that shows one checkpoint's pictures
// under another's key, with nothing anywhere reporting the swap. `--out=` is how the second
// checkpoint gets its own round. It is read before the flag helpers below only because OUT is
// needed by the --rebuild and --reveal branches at the top of this file.
const OUT = path.resolve(
  process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'pro-spike-out',
);
/**
 * THE TWO CLIP NUMBERS THE GALLERY PRINTS, hoisted here for the same reason `OUT` is: the
 * `--rebuild` branch a few lines below builds a gallery, the gallery captions its clips with
 * these, and a `const` declared further down the file is in temporal dead zone by then. That is
 * not hypothetical - `--rebuild` threw `Cannot access 'CLIP_FPS' before initialization` from
 * the moment clips were added until the owner tried to rebuild a gallery. It is the same trap
 * `ledgerPath` is a function declaration to avoid, one scope over.
 *
 * CLIP_FPS: playback rate of the encoded strips. The clip advances virtual time by exactly
 * 1/CLIP_FPS per frame, so a strip plays at the speed the graphic really runs at - to within
 * the one frame a phase length can fail to divide by. Deliberately CAPTURE_FPS rather than a
 * cinematic 25: broadcast entrances are half-second events, so at 25 fps that quantization
 * error reaches 8% of the phase, and the round exists to read easing and settle.
 *
 * UPDATE_LEAD_MS: how far before the update cue the update CLIP starts. The strip's five stills
 * begin at the instant update() fires, so without a lead-in the clip is a frozen frame.
 */
const CLIP_FPS = 50;
const UPDATE_LEAD_MS = 300;

const BANK = path.resolve('benchmarks/pro/v1/briefs.json');
const DECODING = path.resolve('benchmarks/pro/v1/spike/decoding.json');
const BRANDS = path.resolve('benchmarks/pro/v1/spike/brands.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const control = flag('control');
const paid = flag('generate');
const reveal = flag('reveal');
// Keep the generations a previous run already captured and attempt only what is missing.
//
// This is not "best of two" and must not become it: a brief is resumed only when it produced
// NO result at all - a transport failure, a skipped ceiling - so every candidate in the final
// ledger is still one initial call under the same pinned decoding. A brief that produced a
// bad-but-complete result is left exactly as it is, because re-rolling that would be picking
// the sample the reviewer prefers, which is a different experiment.
const resume = flag('resume');

if (!control && !paid && !reveal && !flag('rebuild') && !flag('alpha') && !flag('recompose')) {
  console.error('Pick a mode: --control (free, run this first), --generate (PAID),'
    + ' --rebuild, --reveal or --alpha (free, re-shoots a finished round transparent).');
  process.exit(1);
}
if (control && paid) {
  console.error('--control and --generate are separate runs: the control must pass before tokens burn.');
  process.exit(1);
}

/**
 * `language` is PHASE A (docs/NOACG_PRO_PLAN.md §15.5) and it is a different pipeline, not
 * another prompt: the model returns a design LANGUAGE - enums, four colours, a bundled font id -
 * and the PLATFORM composes the graphic through the catalog's own assembler. One text call, no
 * image, no repair loop, no exemplar block. Everything downstream of the call (the field
 * contract, the code save, the captures, the instruments, the gallery) is shared, which is the
 * point: the two premises are then judged by the same measurements.
 */
const KNOWN_ARMS = ['exemplar', 'none', 'grammar', 'language'];
const ARMS = (value('arms') ?? 'exemplar,none').split(',').filter(Boolean);
for (const arm of ARMS) {
  if (!KNOWN_ARMS.includes(arm)) {
    console.error(`Unknown arm "${arm}" - the arms are ${KNOWN_ARMS.join(', ')}.`);
    process.exit(1);
  }
}

/**
 * --drift-check=<arm>:<brief,brief,…> - re-run a FEW briefs on an arm whose results a previous
 * round already holds, so the comparison against those stored results can say whether they
 * still reproduce.
 *
 * The exemplar ablation is the reason this exists. Re-running all twelve exemplar generations
 * to compare against costs $0.46 and reproduces something already on disk under the same pinned
 * decoding, checkpoint and brand assignment; reusing the stored arm costs nothing and assumes
 * the provider has not moved under it. A handful of re-runs is the cheap way to CHECK that
 * assumption instead of carrying it - and if they diverge, the ablation is read against fresh
 * numbers rather than quietly against stale ones.
 */
const driftArg = value('drift-check');
const driftCheck = driftArg
  ? { arm: driftArg.split(':')[0], briefs: (driftArg.split(':')[1] ?? '').split(',').filter(Boolean) }
  : null;
if (driftCheck) {
  if (!KNOWN_ARMS.includes(driftCheck.arm)) {
    console.error(`--drift-check names an unknown arm "${driftCheck.arm}".`);
    process.exit(1);
  }
  if (!driftCheck.briefs.length) {
    console.error('--drift-check needs briefs: --drift-check=exemplar:news-public,sports-live');
    process.exit(1);
  }
}

// ── --rebuild: regenerate the gallery from the ledger, FREE ────────────────────────────
//
// A presentation fix to the gallery must never require re-running a paid round. This reads
// results.json, re-copies the blind frames and rewrites review.html, calling no model and
// touching no capture. It is how the blinding fix reached a round that was already paid for.
if (flag('rebuild')) {
  const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
  await blindTheFrames(ledger.results);
  await writeFile(path.join(OUT, 'results.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  await writeFile(path.join(OUT, 'review.html'), reviewHtml(ledger.results, {
    name: path.basename(OUT),
    capturedAt: ledger.capturedAt ?? null,
  }));
  await writeNotesTemplate(path.join(OUT, 'notes.md'), ledger.results);
  const rebuiltSet = setGalleryHtml(ledger.results, { name: path.basename(OUT) });
  if (rebuiltSet) await writeFile(path.join(OUT, 'set-gallery.html'), rebuiltSet);
  console.log(`Rebuilt ${path.join(OUT, 'review.html')} from ${ledger.results.length} record(s). No tokens spent.`);
  process.exit(0);
}

// ── --reveal: join the blind ids back to what produced them ────────────────────────────
if (reveal) {
  const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
  await writeFile(path.join(OUT, 'key.html'), keyHtml(ledger));
  console.log(`Key written: ${path.join(OUT, 'key.html')}`);
  // The DIVERGENCE view is a reveal-time artifact on purpose: it groups the same brief's
  // holds under their named brands, which is exactly what the blind gallery must not do.
  const divergence = divergenceHtml(ledger);
  if (divergence) {
    await writeFile(path.join(OUT, 'divergence.html'), divergence);
    console.log(`Divergence view written: ${path.join(OUT, 'divergence.html')}`);
  }
  console.log('Read them only AFTER the notes are written (docs/NOACG_PRO_PLAN.md §0.2).');
  process.exit(0);
}

const route = value('route');
const maxCost = Number(value('max-cost') ?? 0);
let frontierReason = null;

if (paid) {
  if (!route) {
    console.error('PAID mode needs an explicit --route=<provider>:<model> - the checkpoint under test.');
    process.exit(1);
  }
  const checked = requireAllowedRoute(route, { flag: 'route', reason: value('frontier-reason') });
  frontierReason = checked.frontierReason;
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('--max-cost must be a positive number of dollars. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID run: ${route}, arms ${ARMS.join(' + ')}, ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

const decoding = JSON.parse(await readFile(DECODING, 'utf8'));
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs.filter((entry) => !only || only.includes(entry.id));
if (!briefs.length) {
  console.error('No briefs matched.');
  process.exit(1);
}

// ── The synthetic brand fixture (the Phase 1 condition) ─────────────────────────────────
// Loaded in BOTH modes: the control run exercises the mark fill and its rendered gate, which
// is the whole point of running it after a wrapper change. `--no-brand` reverts to the bare
// Phase 0 protocol (kept so the generic baseline stays reproducible, never the default).
const noBrand = flag('no-brand');
const brandsFixture = noBrand ? null : JSON.parse(await readFile(BRANDS, 'utf8'));
const rawBrands = [];
if (brandsFixture) {
  for (const brand of brandsFixture.brands) {
    const file = path.resolve(path.dirname(BRANDS), brand.mark);
    const bytes = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg';
    rawBrands.push({
      ...brand,
      markFileName: path.basename(file),
      markDataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
    });
  }
  for (const briefEntry of briefs) {
    if (!brandsFixture.assignment[briefEntry.id]) {
      console.error(`brands.json assigns no brand to brief "${briefEntry.id}" - the fixture is stale.`);
      process.exit(1);
    }
  }
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
// The wizard auto-opens on a fresh visit and would sit over every screenshot taken from the
// page rather than from inside the capture frame.
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

/**
 * FORCE THE ONE RASTER THE STILL IS OF, on a graphic that has already settled.
 *
 * Every capture here mounts the graphic, calls `play()`, waits for the entrance to finish and
 * shoots. That was not byte-stable: recomposing the 2026-08-16 round moved 3 of its 36 frames
 * run to run with no code change in between, and 5 consecutive runs of one cell produced 5
 * different files. The bisect (docs/NOACG_PRO_PLAN.md §20) put it entirely after the
 * platform: the language, the composed html/css/js, the srcdoc and every element's rendered
 * geometry and paint style were byte-identical across the runs that disagreed. Only the pixels
 * moved, and only at glyph and panel EDGES.
 *
 * The cause is the composited layer the graphic animates on. `.lower-third-box` carries
 * `will-change: transform, opacity`, so it is promoted for the whole life of the page; the
 * entrance moves it; Chromium rasterises its texture DURING that move and - because the hint
 * says more transforms are coming - never re-rasterises once the tween settles. The frame we
 * keep is therefore a texture rasterised mid-flight, and which sub-pixel phase of the ~0.5 s
 * entrance that raster caught is machine timing.
 *
 * Dropping the hint for one frame invalidates the layer, so the settled content is rastered
 * once, at the offset it actually rests at; restoring it puts the graphic back exactly as the
 * template wrote it before the shutter. Both halves matter - a still taken with the hint
 * REMOVED is painted straight into the page instead, which switches text to sub-pixel
 * antialiasing and moves a glyph edge by up to 233/255 (that is a different picture, not a
 * stabler one).
 *
 * Measured: with this in place all 10 Anton frames are byte-identical across 5 runs, and the 7
 * that were already stable are byte-identical to their COMMITTED frames - the fix costs nothing
 * on evidence that never moved. Fast-forwarding the entrance instead (`timeScale`) lands on the
 * same bytes, which is the second, independent reason to believe the mechanism; it is not what
 * ships here because it would also fast-forward a timer graphic's own clock.
 */
async function rasterSettledFrame(target) {
  const hintOff = await target.addStyleTag({ content: '*{will-change:auto !important}' });
  const twoFrames = () => target.evaluate(async () => {
    document.body.getBoundingClientRect();   // flush layout before handing the frame over
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await twoFrames();
  await hintOff.evaluate((el) => el.remove());
  await twoFrames();
}

// ── --alpha: re-shoot a finished round's holds WITH THEIR ALPHA, free ───────────────────
//
// `captureHold` screenshots the hold from INSIDE the app, so every frame in a round carries the
// capture frame's grey card baked in. That is fine for a gallery and wrong for the one question
// a broadcast graphic is finally judged on - how it reads over a picture - because a graphic
// composited onto grey cannot be laid over anything else afterwards.
//
// This re-renders from the round's OWN SAVED CODE (`code/<slug>/`), which is why it is free and
// why it is honest: the paid artefact is the emitted HTML/CSS/JS, the document around it is
// deterministic, and the field values are re-derived from the committed brief bank exactly as the
// paid run derived them. The shot is taken on a page of its own parked on this origin - relative
// `fonts/<file>` still resolves - with `omitBackground`, so everything the design does not paint
// stays transparent.
// ── --recompose: rebuild a finished round from its LANGUAGES, free ─────────────────────
//
// `--alpha` re-shoots the code the round SAVED, which is the right answer for "what did that
// round produce". This is the other question: **what would the platform produce from the same
// paid answers today?** The language is the artefact the money bought; everything downstream of
// it is deterministic, so a composer change can be seen across a whole round for nothing.
//
// It exists because the 2026-08-16 read changed the composer: a single-ink mark is now knocked
// rather than plated (§17.1), and every frame on the review page still showed the plate the owner
// rejected. Re-running the round to see that would have cost real money for answers already on
// disk.
//
// The frames land beside the originals rather than over them - a round's own record of what it
// produced is not something a later change gets to overwrite.
if (flag('recompose')) {
  const file = path.join(OUT, 'results.json');
  const ledger = JSON.parse(await readFile(file, 'utf8'));
  const dir = path.join(OUT, 'recomposed');
  await mkdir(dir, { recursive: true });
  const shotPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await shotPage.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  let done = 0;
  for (const record of ledger.results) {
    if (!record.code || record.skipped || record.error) continue;
    const saved = JSON.parse(await readFile(path.join(OUT, record.code, 'language.json'), 'utf8'));
    const brand = rawBrands.find((b) => b.id === record.brand) ?? null;
    const entry = bank.briefs.find((b) => b.id === String(record.slug).split('.')[0]);
    if (!saved?.language || !entry) continue;
    const composed = await page.evaluate(async (input) => {
      const bust = '?t=' + Date.now();
      const { composeFromLanguage } = await import('/src/ai/pro/language/compose.ts' + bust);
      const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
      const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
      const logo = input.mark
        ? {
          assetPath: input.mark.path,
          images: [{ path: input.mark.path, data: input.mark.data }],
          ...(await probeMark({ path: input.mark.path, data: input.mark.data })),
        }
        : null;
      const result = composeFromLanguage(input.language, {
        lines: [
          { title: 'Name', sample: input.name },
          { title: 'Role', sample: input.title },
        ],
        ...(logo ? { logo } : {}),
      });
      return {
        html: composeDocument(result.template),
        adjustments: result.adjustments,
        notes: result.notes,
        markFieldId: result.template.fields.find((f) => f.ftype === 'filelist')?.field ?? null,
      };
    }, {
      language: saved.language,
      name: entry.brief.name,
      title: entry.brief.title,
      mark: brand ? { path: `images/${brand.markFileName}`, data: brand.markDataUrl } : null,
    });

    for (const [suffix, values] of [
      ['hold', { f0: entry.brief.name, f1: entry.brief.title }],
      ['stress', {
        f0: `${entry.brief.name} de la Cruz-Whittington`,
        f1: `${entry.brief.title}, Southern Bureau and Election Desk`,
      }],
    ]) {
      const data = { ...values };
      if (composed.markFieldId && brand) data[composed.markFieldId] = `images/${brand.markFileName}`;
      await shotPage.setContent(composed.html, { waitUntil: 'load' });
      await shotPage.evaluate(async (payload) => {
        try {
          window.update(JSON.stringify(payload));
          window.play();
        } catch { /* a broken lifecycle still paints - shoot what is there */ }
        await document.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }, data);
      await rasterSettledFrame(shotPage);
      const name = `${record.slug}.${suffix}.png`;
      await shotPage.screenshot({ path: path.join(dir, name), omitBackground: true });
      record[suffix === 'hold' ? 'recomposedHold' : 'recomposedStress'] = `recomposed/${name}`;
    }
    record.recomposedAdjustments = composed.adjustments;

    // ── --set: the REST OF THE PACKAGE from the same saved language (§15.9) ────────────────
    //
    // The recompose above answers "what strap would today's composer draw from this paid
    // language"; this answers the SET question - one language, every package graphic - for the
    // same zero tokens. It exists because the two committed checkpoint rounds predate the
    // package surface, so nothing on disk can put their set ROWS side by side
    // (`two-rounds-notes.md`: "a checkpoint comparison would need the two rounds' rows side by
    // side, which nothing here builds yet"). A HOLD each, exactly like the paid capture: the
    // coherence question is answered by three graphics on one screen.
    if (flag('set')) {
      const memberDocs = await page.evaluate(async (input) => {
        const bust = '?t=' + Date.now();
        const { composeGraphic, packageLines, PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts' + bust);
        const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
        const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
        const logo = input.mark
          ? {
            assetPath: input.mark.path,
            images: [{ path: input.mark.path, data: input.mark.data }],
            ...(await probeMark({ path: input.mark.path, data: input.mark.data })),
          }
          : null;
        const out = [];
        for (const spec of PRO_GRAPHIC_LIST) {
          if (spec.id === 'lower-third') continue;
          // Mirrors the wizard's package loop (AiStep.tsx §15.9): the same one-input show
          // facts, channel deliberately null, a mark only where the type takes one.
          const composed = composeGraphic(spec.id, input.language, {
            lines: packageLines(spec.id, { name: input.name, title: input.title, channel: null }),
            ...(spec.takesMark && logo ? { logo } : {}),
          });
          out.push({
            graphic: spec.id,
            label: spec.label,
            html: composeDocument(composed.template),
            adjustments: composed.adjustments,
          });
        }
        return out;
      }, {
        language: saved.language,
        name: entry.brief.name,
        title: entry.brief.title,
        mark: brand ? { path: `images/${brand.markFileName}`, data: brand.markDataUrl } : null,
      });
      record.recomposedSet = [];
      for (const member of memberDocs) {
        await shotPage.setContent(member.html, { waitUntil: 'load' });
        await shotPage.evaluate(async () => {
          try { window.play(); } catch { /* a broken lifecycle still paints - shoot what is there */ }
          await document.fonts.ready;
          await new Promise((resolve) => setTimeout(resolve, 1800));
        });
        await rasterSettledFrame(shotPage);
        const name = `${record.slug}.${member.graphic}.png`;
        await shotPage.screenshot({ path: path.join(dir, name), omitBackground: true });
        record.recomposedSet.push({
          graphic: member.graphic,
          label: member.label,
          file: `recomposed/${name}`,
          adjustments: member.adjustments,
        });
      }
    }

    done += 1;
    console.log(`  ${record.slug} · ${composed.adjustments.join(', ') || 'no adjustments'}`
      + `${record.recomposedSet ? ` · set: ${record.recomposedSet.map((m) => m.graphic).join(', ')}` : ''}`);
  }
  await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`);
  await browser.close();
  console.log(`\n${done} generation(s) recomposed from their saved languages. No tokens spent.`);
  process.exit(0);
}

if (flag('alpha')) {
  const file = path.join(OUT, 'results.json');
  const ledger = JSON.parse(await readFile(file, 'utf8'));
  const alphaDir = path.join(OUT, 'alpha');
  await mkdir(alphaDir, { recursive: true });
  const shotPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await shotPage.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  let shot = 0;
  for (const record of ledger.results) {
    if (!record.code || record.skipped || record.error) continue;
    const dir = path.join(OUT, record.code);
    const [html, css, js] = await Promise.all([
      readFile(path.join(dir, 'index.html'), 'utf8'),
      readFile(path.join(dir, 'template.css'), 'utf8'),
      readFile(path.join(dir, 'template.js'), 'utf8'),
    ]);
    const brand = rawBrands.find((b) => b.id === record.brand) ?? null;
    const entry = bank.briefs.find((b) => b.id === String(record.slug).split('.')[0]);
    // The mark rides as a real asset AND as a field value, the two ways the paid capture had it:
    // baked into the saved `src`, and resent through update() the way SPX resends every field.
    const assets = brand && record.fill?.path
      ? [{ path: record.fill.path, data: brand.markDataUrl, name: brand.markFileName }]
      : [];
    const composed = await page.evaluate(async (input) => {
      const { composeDocument } = await import('/src/preview/composeDocument.ts?t=' + Date.now());
      return composeDocument({
        html: input.html,
        css: input.css,
        js: input.js,
        assets: input.assets,
        resolution: { width: 1920, height: 1080 },
        fields: [],
      });
    }, { html, css, js, assets });

    for (const [suffix, values] of [
      ['hold', { f0: entry?.brief.name, f1: entry?.brief.title }],
      ['stress', {
        f0: `${entry?.brief.name} de la Cruz-Whittington`,
        f1: `${entry?.brief.title}, Southern Bureau and Election Desk`,
      }],
    ]) {
      const data = { ...values };
      if (record.fill?.slotFieldId && record.fill.path) data[record.fill.slotFieldId] = record.fill.path;
      await shotPage.setContent(composed, { waitUntil: 'load' });
      await shotPage.evaluate(async (payload) => {
        try {
          window.update(JSON.stringify(payload));
          window.play();
        } catch { /* a broken lifecycle still paints something - shoot what is there */ }
        await document.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }, data);
      await rasterSettledFrame(shotPage);
      const name = `${record.slug}.${suffix}.png`;
      await shotPage.screenshot({ path: path.join(alphaDir, name), omitBackground: true });
      record[suffix === 'hold' ? 'alphaHold' : 'alphaStressHold'] = `alpha/${name}`;
      shot += 1;
    }
    console.log(`  ${record.slug} · alpha hold + stress`);
  }
  await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`);
  await browser.close();
  console.log(`\n${shot} transparent frame(s) written to ${alphaDir}. No tokens spent.`);
  process.exit(0);
}

// ── Probe the marks IN THE PAGE, before anything else runs ──────────────────────────────
// probeMark is the same content-free measurement Lite sends (shape/backing/ink); it is
// MEASURED here rather than hand-written in the fixture (the supportingLineChars rule), and a
// mark that fails to probe stops the run - a round conditioned on an unreadable mark would
// measure nothing.
const brands = [];
if (brandsFixture) {
  const probes = await page.evaluate(async (input) => {
    const bust = '?t=' + Date.now();
    const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
    const out = {};
    for (const brand of input) {
      out[brand.id] = await probeMark({ path: `images/${brand.markFileName}`, data: brand.markDataUrl });
    }
    return out;
  }, rawBrands.map((b) => ({ id: b.id, markFileName: b.markFileName, markDataUrl: b.markDataUrl })));
  for (const raw of rawBrands) {
    const probe = probes[raw.id];
    if (!probe) {
      console.error(`Brand "${raw.id}": probeMark could not read ${raw.markFileName} - fix the mark file.`);
      process.exit(1);
    }
    brands.push({
      id: raw.id,
      name: raw.name,
      world: raw.world,
      typeface: raw.typeface,
      palette: raw.palette,
      mark: { path: `images/${raw.markFileName}`, dataUrl: raw.markDataUrl, probe },
    });
    console.log(`brand ${raw.id.padEnd(10)} mark ${raw.markFileName}: aspect ${probe.aspect.toFixed(2)}`
      + ` · ${probe.backing} · ink luminance ${probe.inkLuminance.toFixed(2)}`);
  }
}
const brandById = new Map(brands.map((b) => [b.id, b]));
/** The mark-fill control's brand: the wordmark - the shape most real brands have, and the
 *  one the shared band slot was redrawn for (benchmarks/lite/BRAND-AUDIT-2026-08-09.md). */
const controlBrand = brands[0] ?? null;

if (paid) {
  // A managed key only counts for a SIGNED-IN caller once a backend is configured, and a
  // fresh Playwright context has no session (the ai-bench.mjs lesson).
  const fileEnv = await readEnvFile();
  const email = (process.env.E2E_EMAIL ?? fileEnv.E2E_EMAIL ?? '').trim();
  const password = (process.env.E2E_PASSWORD ?? fileEnv.E2E_PASSWORD ?? '').trim();
  if (email && password) {
    try {
      await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-pass').fill(password);
      await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
      console.log('Signed in for the managed route.');
    } catch (error) {
      console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.`);
    }
  } else {
    console.log('No E2E credentials found - continuing signed out (BYO cookie or open self-host only).');
  }
}

// Every in-page import below is cache-busted (`'?t=' + Date.now()`) because a dev server can
// serve a stale module after many edits, and an `import()` in an eval context can then
// resolve a DIFFERENT module instance than the running app (the "ghost store" gotcha in the
// root AGENTS.md).

/**
 * Mount one template's SETTLED HOLD through composeDocument at 1920x1080 and leave it up for
 * the driver to screenshot. Separate from the motion capture on purpose: the hold is the
 * preview compose path (what the editor and every other bench show), the strips are the
 * render compose path (the only place a virtual clock exists).
 */
async function captureHold(item, measure = false) {
  const playError = await page.evaluate(async ({ template, data }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('spike-hold-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'spike-hold-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    // A GENERATED template can throw inside its own lifecycle - a broken buildInTimeline
    // killed a paid round here on 2026-08-13 (`Cannot set properties of undefined`) with ten
    // paid generations behind it. A crash at play() is a RESULT to record and show, not a
    // reason to stop measuring: capture whatever painted, and carry the error.
    let error = null;
    try {
      win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    await win.document.fonts.ready;   // real glyphs or nothing
    await new Promise((resolve) => setTimeout(resolve, 1800));
    // Settled, but not yet REPRODUCIBLE without the next step: the entrance runs on a
    // permanently promoted layer, so the texture Chromium keeps is one it rastered mid-flight
    // and never redrew (§20). Measured, not assumed - two runs of the identical `--control`
    // command disagreed on 7 of these 40 holds, and with this step THREE runs half an hour apart
    // are byte-identical on all 40 while 28 of them stay exactly as they were (§20.5).
    //
    // This is `rasterSettledFrame`'s step (§20's long note explains why BOTH halves are needed),
    // written out inline because the graphic lives in a same-origin srcdoc frame: the page-level
    // helper takes a Playwright page, and there is no Playwright handle for this document, only
    // `win` from the parent. Drop the hint for one frame so the settled content is rastered once
    // at the offset it rests at, then restore it so the shutter sees exactly what the template
    // wrote.
    const hintOff = win.document.createElement('style');
    hintOff.textContent = '*{will-change:auto !important}';
    const twoFrames = async () => {
      win.document.body.getBoundingClientRect();   // flush layout before handing the frame over
      await new Promise((resolve) => {
        win.requestAnimationFrame(() => win.requestAnimationFrame(resolve));
      });
    };
    win.document.head.appendChild(hintOff);
    await twoFrames();
    hintOff.remove();
    await twoFrames();
    return error;
  }, item);
  // Measure the SETTLED frame while it is still mounted: the rendered mark gate (the Phase 0
  // broken-image lesson - read the paint, not the markup) and the alignment-axis instrument.
  // Normal hold only: the stress hold is the same layout under longer text.
  const measured = !measure ? null : await page.evaluate(async ({ markFieldId, markProbe, instruments }) => {
    const bust = '?t=' + Date.now();
    const { measureRenderedMark } = await import('/src/ai/spike/brand.ts' + bust);
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts' + bust);
    const { measureDevice } = await import('/src/ai/spike/deviceCheck.ts' + bust);
    const doc = document.getElementById('spike-hold-frame')?.contentDocument;
    if (!doc) return null;
    // THE THRESHOLDS ARE THE GRAPHIC TYPE's (`PRO_GRAPHICS[id].instruments`, §15.9). Every number
    // in both instruments was calibrated on the lower-third catalog, and measured over the
    // shipped bugs and timers seven of fourteen fail a threshold that is simply not about them.
    // Absent = the lower third's own value, which is what a strap keeps.
    const base = { markFieldId: markFieldId ?? null };
    return {
      axis: measureAxes(doc),
      // Padding and gaps as ratios of type size - the other half of what the owner's blind
      // reads keep naming (docs/DESIGN_PRINCIPLES.md §4, §9).
      spacing: measureSpacing(doc, { ...base, ...(instruments?.spacing ?? {}) }),
      proportion: measureProportion(doc, { ...base, ...(instruments?.proportion ?? {}) }),
      // The DEVICE-EXISTS proxy (docs/MODEL_VS_HARNESS_STUDY.md §6, level 2). Reported,
      // never gated - a plain box can be the right answer; this makes it a visible one.
      device: measureDevice(doc),
      mark: markFieldId && markProbe ? measureRenderedMark(doc, markFieldId, markProbe) : null,
    };
  }, {
    markFieldId: item.markFieldId ?? null,
    markProbe: item.markProbe ?? null,
    instruments: item.instruments ?? null,
  });
  const file = `${item.slug}.hold.png`;
  await page.frameLocator('#spike-hold-frame').locator('body').screenshot({ path: path.join(OUT, file) });
  await page.evaluate(() => document.getElementById('spike-hold-frame')?.remove());
  return { file, measured, playError };
}

/** The same hold, driven with the STRESS values §0.2 asks the human to review beside it. */
async function captureStressHold(item) {
  const stressed = { ...item, data: item.stressData };
  const { file } = await captureHold({ ...stressed, slug: `${item.slug}.stress` });
  return file;
}

// ── The MOTION strips: entrance, update and exit, through the VIRTUAL CLOCK ─────────────
//
// This is the one piece of the wrapper that is new build rather than reuse, and the plan says
// why (§0.1, §0.2): a spike that inspects only settled holds has not reviewed motion, headless
// GSAP does not visibly tick on requestAnimationFrame, and deterministic timeline scrubbing
// exists today only in the RENDER compose path.
//
// It is new WIRING, not a new clock. The clock is src/render/runtimeScript.ts exactly as the
// renderer drives it: composeRenderDocument injects the virtual runtime before GSAP and the
// detach snippet after it, the graphic then executes its REAL lifecycle (update -> play ->
// stop) against time we own, and seek(t) fires due timers at their deadlines and drives
// gsap.updateRoot(t). A second scrubber built for the bench is how the bench and the renderer
// come to disagree about what a template does.
//
// IT LIVES IN THE DRIVER, NOT IN src/. `src/ai` may not import `src/render`
// (docs/ARCHITECTURE.md §3, enforced by .dependency-cruiser.cjs), and a bench rig is a bad
// reason to widen a layering rule permanently - this script is outside the module graph and is
// the composition root that is allowed to reach any domain, which is the same way
// the retired pro-bench.mjs reached pro/, lite/pipeline and preview/ in one evaluate.
//
// FOUR THINGS IT HAS TO GET RIGHT, all load-bearing:
//   1. SEEKS ARE MONOTONIC - the runtime throws on a backward seek, so sample times are
//      produced already sorted and the host never rewinds inside one capture.
//   2. PAINT SETTLES ON THE HOST'S CLOCK. requestAnimationFrame inside the render document is
//      virtualized, so awaiting it there would never resolve; the host page's real double-rAF
//      is what proves a frame is painted (render-worker/remotion/NoaCGGraphic.tsx).
//   3. COLOR SCHEME MUST MATCH THE HOST PAGE. Chromium paints a scheme-mismatched iframe
//      opaque; the app declares dark, so the document is composed dark here where the renderer
//      composes it light for its own light host.
//   4. A CONTINUOUS PHASE reports a duration of 0 (runtimeScript's CONTINUOUS_S rule), so its
//      strip is sampled over a fixed window - a looping entrance is motion, and collapsing it
//      to one frame would hide the thing the strip exists to show.
//
// ── AND THE STRIPS ARE ALSO PLAYED, NOT ONLY LAID OUT ──────────────────────────────────
//
// The owner's rule from the brand round: STILLS CANNOT JUDGE MOTION. Five frames across an
// entrance say where the graphic passed through, never how it felt getting there - easing,
// overshoot, stagger and settle all live between the samples, and "does the motion support the
// composition" is one of the questions §0.2 asks a human to answer.
//
// So each strip is ALSO sampled at a real frame rate and encoded to a webm the gallery plays in
// place. Three properties make that safe to bolt onto an instrument that is already calibrated:
//
//   * THE FIVE STILL TIMES ARE UNCHANGED. The clip grid is merged INTO the same monotonic
//     sample list rather than replacing it, so `frames` still carries exactly the five stills
//     per strip that markMotionSummary, the blinding and the key already read. A denser mark
//     sampling would be a better instrument and a DIFFERENT one, and the mark gate was
//     calibrated 7/7 against this one.
//   * THE CLIP IS THE SAME CLOCK. Nothing new is scrubbed: the extra samples are more seeks on
//     the cursor the stills already advance, so a clip can never show motion the strip denies.
//   * A MISSING ffmpeg DEGRADES TO WHAT WE HAD. The encoder is optional; without it the round
//     still captures, still writes its ledger, and the gallery falls back to stills alone. A
//     paid round must never die on a presentation dependency.

/** A fixed virtual wall clock, so a clock-reading graphic renders the same frame every run. */
const CAPTURE_EPOCH_MS = Date.UTC(2026, 0, 1, 20, 0, 0);
const CAPTURE_FPS = 50;
const SAMPLES_PER_STRIP = 5;
/** Playback rate of the encoded strips. The clip advances virtual time by exactly 1/CLIP_FPS per
 *  frame, so a strip plays back at the speed the graphic actually runs at - to within the one
 *  frame a phase length can fail to divide by. Deliberately CAPTURE_FPS rather than a cinematic
 *  25: broadcast entrances are half-second events, so at 25 fps that quantization error reaches
 *  8% of the phase, and the round exists to read easing and settle. The cost is capture wall
 *  time (about 15 s per item, no tokens), which the generation call dwarfs. */
/** Encoded width. The stills stay 1920x1080; a clip is for reading MOTION, and half size keeps a
 *  30-item gallery in the tens of megabytes instead of the hundreds. */
const CLIP_WIDTH = 960;
/** A runaway phase (a template that reports a minutes-long entrance) must not turn into a
 *  thousand screenshots. Past this the clip is dropped rather than sampled coarsely - a clip
 *  that silently plays at the wrong speed is worse than no clip. */
const CLIP_MAX_FRAMES = 400;

/**
 * Mount one graphic in a virtual-clock document, register its cues, and return the sample plan.
 * The frames are then taken one at a time from OUTSIDE the page - a screenshot cannot be
 * returned from `evaluate` cheaply - so the capture is a cursor the driver advances.
 */
async function startCapture(item) {
  return page.evaluate(async ({
    template, data, stressData, epochMs, fps, samples, clipFps, clipMaxFrames, updateLeadMs,
    markFieldId,
  }) => {
    const bust = '?t=' + Date.now();
    const { composeRenderDocument } = await import('/src/render/composeRenderDocument.ts' + bust);
    const { RENDER_RUNTIME_VERSION } = await import('/src/render/manifest.ts' + bust);
    const { markMotionState } = await import('/src/ai/spike/brand.ts' + bust);

    document.getElementById('spike-capture-frame')?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'spike-capture-frame';
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;`
      + `height:${template.resolution.height}px;border:0;z-index:99999;background:#333;color-scheme:dark;`;
    iframe.srcdoc = await composeRenderDocument(template, { colorScheme: 'dark' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('spike capture: document load timed out')), 30_000);
      iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      document.body.appendChild(iframe);
    });

    const runtime = iframe.contentWindow?.__noacgRender;
    if (!runtime) throw new Error('spike capture: __noacgRender missing from the render document');
    if (runtime.version !== RENDER_RUNTIME_VERSION) {
      throw new Error(`spike capture: runtime version ${runtime.version} !== ${RENDER_RUNTIME_VERSION}`);
    }

    const measured = await runtime.prepare({ epochMs, fps, data });

    // Each phase is sampled at its OWN natural length, which is what makes a slow considered
    // entrance and a fast snap both readable. computeSchedule (the render path's HOLD model) is
    // deliberately not used: it exists to fit measured phases into a chosen TOTAL duration, and
    // the spike has no total to fit.
    const CONTINUOUS_WINDOW_MS = 1500;
    const HOLD_BEFORE_UPDATE_MS = 700;
    const UPDATE_WINDOW_MS = 900;
    const HOLD_AFTER_UPDATE_MS = 500;
    const inMs = measured.continuous.in ? CONTINUOUS_WINDOW_MS : Math.max(measured.inMs, 1);
    const outMs = measured.continuous.out ? CONTINUOUS_WINDOW_MS : Math.max(measured.outMs, 1);
    const updateAt = inMs + HOLD_BEFORE_UPDATE_MS;
    const stopAt = updateAt + UPDATE_WINDOW_MS + HOLD_AFTER_UPDATE_MS;

    // The five STILL times, unchanged - and an EXACT-RATE clip grid merged in around them.
    //
    // The clip grid is spaced at exactly one playback frame (1000/clipFps ms) rather than being
    // stretched to fit the phase, so a clip encoded at clipFps advances virtual time at wall
    // speed and the motion plays back at the speed the graphic really runs at. The first version
    // of this fitted N points across the phase AND fed the stills into the same sequence: a
    // 1340 ms entrance came out as a 1.60 s clip, 19% slow and stuttering on the duplicated
    // still frames - a clip that misreports timing is worse than no clip, because easing is
    // read from timing.
    //
    // So the two sets stay separate in the SEQUENCE and merge only in the SEEK ORDER: a still
    // that does not land on the grid is an extra screenshot the clip never contains, and one
    // that does land on it is a single shot wearing both hats. Both lists are produced sorted
    // and the merge preserves that, which is what the runtime's no-backward-seek rule needs.
    const spread = (strip, from, to, clipFrom = from) => {
      if (to - from < 1) return [{ strip, index: 0, atMs: from, still: true, clip: false }];
      const step = (to - from) / (samples - 1);
      const stills = Array.from({ length: samples },
        (_, i) => ({ strip, index: i, atMs: from + step * i, still: true, clip: false }));
      const frameMs = 1000 / clipFps;
      const count = Math.floor((to - clipFrom) / frameMs) + 1;
      if (count > clipMaxFrames) return stills;
      const clip = Array.from({ length: count },
        (_, i) => ({ strip, atMs: clipFrom + i * frameMs, still: false, clip: true }));
      // The phase's own end, when the grid stops more than half a frame short of it - the last
      // instant of an exit is the one that says whether the graphic actually left.
      if (to - clip[count - 1].atMs > frameMs / 2) clip.push({ strip, atMs: to, still: false, clip: true });
      const merged = [...stills, ...clip].sort((a, b) => a.atMs - b.atMs);
      // Coincident times (the phase's start, usually its end) become ONE sample: seeking twice
      // to the same instant is legal but would put a duplicate frame in the clip.
      return merged.reduce((out, sample) => {
        const last = out[out.length - 1];
        if (last && Math.abs(last.atMs - sample.atMs) < 0.5) {
          last.still = last.still || sample.still;
          last.clip = last.clip || sample.clip;
          if (sample.still) last.index = sample.index;
          return out;
        }
        out.push(sample);
        return out;
      }, []);
    };
    const plan = {
      measured,
      samples: [
        ...spread('entrance', 0, inMs),
        // The update clip LEADS IN from before the cue fires. The strip's five stills begin at
        // updateAt, which is the instant update() is delivered - so a still strip can only ever
        // show the graphic already holding the new copy, and the clip built on those bounds was
        // 900 ms of a frozen frame. The lead-in is clip-only: the still times are untouched, and
        // it stays inside the 700 ms hold the schedule leaves after the entrance, so no seek
        // rewinds into the previous strip.
        ...spread('update', updateAt, updateAt + UPDATE_WINDOW_MS, updateAt - updateLeadMs),
        ...spread('exit', stopAt, stopAt + outMs),
      ],
      note: [
        measured.hasBuilders ? null
          : 'no buildInTimeline/buildOutTimeline - the strips show a static graphic, not motion',
        measured.continuous.in ? `entrance loops forever - sampled over ${CONTINUOUS_WINDOW_MS} ms` : null,
        measured.continuous.out ? `exit loops forever - sampled over ${CONTINUOUS_WINDOW_MS} ms` : null,
      ].filter(Boolean).join('; ') || null,
    };

    runtime.setSchedule([
      { atMs: 0, action: 'play' },
      ...(stressData ? [{ atMs: updateAt, action: 'update', payload: JSON.stringify(stressData) }] : []),
      { atMs: stopAt, action: 'stop' },
    ]);

    let cursor = 0;
    window.__spikeCapture = {
      plan,
      next: async () => {
        if (cursor >= plan.samples.length) return null;
        const sample = plan.samples[cursor++];
        runtime.seek(sample.atMs);
        await Promise.resolve();  // flush the asset shim's MutationObserver microtasks
        // The HOST's real rAF - the document's own is virtualized and would never resolve.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        // The mark slot's animatable state at this instant - "did the mark move at all" is
        // derived from these; whether the motion is MEANINGFUL stays the human's read. Read on
        // the STILL samples only: the clip frames exist to be looked at, and feeding them to a
        // gate calibrated on five samples would quietly change what the gate measures.
        const markState = markFieldId && sample.still
          ? markMotionState(iframe.contentDocument, markFieldId)
          : null;
        return markState ? { ...sample, markState } : sample;
      },
      errors: () => runtime.getErrors(),
      dispose: () => iframe.remove(),
    };
    return plan;
  }, {
    template: item.template,
    data: item.data,
    stressData: item.stressData,
    epochMs: CAPTURE_EPOCH_MS,
    fps: CAPTURE_FPS,
    samples: SAMPLES_PER_STRIP,
    clipFps: CLIP_FPS,
    clipMaxFrames: CLIP_MAX_FRAMES,
    updateLeadMs: UPDATE_LEAD_MS,
    markFieldId: item.markFieldId ?? null,
  });
}

async function captureMotion(item) {
  const plan = await startCapture(item);
  const frames = [];
  const scratch = path.join(OUT, '.clip-frames', item.slug);
  const clipCounts = new Map();
  await mkdir(scratch, { recursive: true });
  for (;;) {
    const sample = await page.evaluate(() => window.__spikeCapture.next());
    if (!sample) break;
    // One screenshot per instant, whichever hats the sample wears - a still and a clip frame at
    // the same time are the same pixels, so shooting twice would only be a way for them to
    // disagree. The clip's sequence numbering counts clip frames alone, so it stays a contiguous
    // %04d run at exactly one playback frame apart.
    const seq = sample.clip ? (clipCounts.get(sample.strip) ?? 0) : null;
    if (sample.clip) clipCounts.set(sample.strip, seq + 1);
    const shot = sample.clip
      ? path.join(scratch, `${sample.strip}.${String(seq).padStart(4, '0')}.png`)
      : path.join(scratch, `${sample.strip}.still-${sample.index}.png`);
    await page.frameLocator('#spike-capture-frame').locator('body').screenshot({ path: shot });
    if (!sample.still) continue;
    const file = `${item.slug}.${sample.strip}-${sample.index}.png`;
    await copyFile(shot, path.join(OUT, file));
    frames.push({ ...sample, file });
  }
  const errors = await page.evaluate(() => {
    const list = window.__spikeCapture.errors();
    window.__spikeCapture.dispose();
    delete window.__spikeCapture;
    return list;
  });
  const clips = await encodeClips(item.slug, scratch, clipCounts);
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  // And the holder, once the last item has emptied it - an out-dir that is going to be archived
  // should not carry a stray dot-directory. `rmdir` rather than `rm -r` on purpose: it refuses a
  // non-empty directory, so a future parallel capture cannot have its frames deleted from under
  // it by another item finishing first.
  await rmdir(path.dirname(scratch)).catch(() => undefined);
  return {
    plan,
    frames,
    errors,
    ...(Object.keys(clips).length ? { clips } : {}),
    ...(item.markFieldId ? { markMotion: markMotionSummary(frames) } : {}),
  };
}

// ── Encoding the strips ────────────────────────────────────────────────────────────────
//
// ffmpeg is looked up ONCE and its absence is a warning, not a failure: this is a presentation
// dependency on a rig whose expensive artifact is the generation, and a paid round that dies
// because a laptop has no encoder would be an unforgivable way to lose $0.30 of tokens.
const FFMPEG = (process.env.FFMPEG_PATH ?? 'ffmpeg').trim() || 'ffmpeg';
const runFfmpeg = promisify(execFile);
/** null until probed; then true/false. */
let ffmpegAvailable = null;

async function haveFfmpeg() {
  if (ffmpegAvailable === null) {
    ffmpegAvailable = await runFfmpeg(FFMPEG, ['-version'], { windowsHide: true }).then(() => true).catch(() => false);
    if (!ffmpegAvailable) {
      console.log(`  ! ${FFMPEG} not found - the gallery will show stills only.`
        + ' Set FFMPEG_PATH to encode the motion strips.');
    }
  }
  return ffmpegAvailable;
}

/**
 * One webm per strip, played in place in the gallery.
 *
 * VP9 over the frame sequence at CLIP_FPS, which is the rate the frames were sampled at, so the
 * clip runs at the graphic's real speed. `format=rgb24` before the yuv conversion is deliberate:
 * a body screenshot can carry alpha, and dropping it late composites transparent pixels as
 * black - which is exactly what the gallery already paints behind the stills.
 *
 * A strip of fewer than two frames is not a clip (a phase shorter than a millisecond collapses
 * to one sample), and a failed encode drops that strip rather than the round.
 */
async function encodeClips(slug, scratch, clipCounts) {
  if (!await haveFfmpeg()) return {};
  const clips = {};
  for (const [strip, count] of clipCounts) {
    if (count < 2) continue;
    const out = `${slug}.${strip}.webm`;
    try {
      await runFfmpeg(FFMPEG, [
        '-hide_banner', '-v', 'error', '-y',
        '-framerate', String(CLIP_FPS),
        '-i', path.join(scratch, `${strip}.%04d.png`),
        '-vf', `scale=${CLIP_WIDTH}:-2,format=rgb24`,
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '34', '-row-mt', '1',
        '-an', path.join(OUT, out),
      ], { windowsHide: true });
      clips[strip] = out;
    } catch (error) {
      console.log(`  ! could not encode ${out}: ${error.message.split('\n')[0]}`);
    }
  }
  return clips;
}

/** Whether the mark MOVED across the entrance and exit strips - a mark that pops in with the
 *  panel reads as one opacity step, so "animated" means its state changed between samples
 *  within a strip. The per-sample states stay on the frames for anyone re-reading a dispute. */
function markMotionSummary(frames) {
  const changedWithin = (strip) => {
    const states = frames.filter((f) => f.strip === strip && f.markState).map((f) => f.markState);
    if (states.length < 2) return null;
    return states.some((s) => s.opacity !== states[states.length - 1].opacity
      || s.transform !== states[states.length - 1].transform);
  };
  return { entranceAnimated: changedWithin('entrance'), exitAnimated: changedWithin('exit') };
}

/** Which strips got a playable clip, said out loud per item - a round that silently encoded
 *  nothing would otherwise look identical in the console to one that encoded everything. */
function clipsCell(record) {
  const strips = Object.keys(record.clips ?? {});
  return strips.length ? `clips ${strips.join('+')}` : 'NO CLIPS';
}

/** Everything a human looks at, for one item - plus the measurements taken while it is up. */
async function captureSet(item) {
  const { file: hold, measured, playError } = await captureHold(item, true);
  const stressHold = await captureStressHold(item);
  const motion = await captureMotion(item);
  return {
    hold,
    stressHold,
    ...(playError ? { playError } : {}),
    ...(measured?.axis ? { axisReport: summarizeAxis(measured.axis) } : {}),
    ...(measured?.spacing ? { spacingReport: measured.spacing } : {}),
    ...(measured?.proportion ? { proportionReport: measured.proportion } : {}),
    ...(measured?.device ? { deviceReport: measured.device } : {}),
    ...(measured?.mark ? { markReport: measured.mark } : {}),
    ...motion,
  };
}

/** The ledger keeps the axis findings, not every cluster: the instrument reports near-misses
 *  and skew straddles, and a record with neither carries only the element count. */
function summarizeAxis(axis) {
  return {
    elements: axis.elements,
    nearMisses: axis.nearMisses,
    skewStraddles: axis.skewStraddles,
  };
}

// ── The run ────────────────────────────────────────────────────────────────────────────
/** A previous run's captured candidates, when resuming. Keyed by slug (`<brief>.<arm>`). */
/** Live text painting outside its own panel - said out loud, because it is the defect the
 *  instrument used to report as the ROOMIEST padding in the round (plan §15.6). A decorative
 *  bleed is a composition and stays in the ledger without a line here. */
function logEscapes(record) {
  for (const escape of record.spacingReport?.escapes ?? []) {
    if (!escape.isText) continue;
    console.log(`    ✗ ESCAPES ITS PANEL: ${escape.desc} paints ${escape.px}px past ${escape.side}`);
  }
}

const kept = new Map();
let carriedSpendUsd = 0;
if (resume) {
  try {
    const prior = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
    for (const record of prior.results ?? []) {
      // Only COMPLETE candidates are kept. An error, a skip or a control/anchor row is
      // re-derived: the free items are recaptured every run anyway, and a failed brief is
      // exactly what resuming exists to retry.
      if (record.kind === 'candidate' && !record.error && !record.skipped) kept.set(record.slug, record);
    }
    carriedSpendUsd = prior.spentUsd ?? 0;
    console.log(`Resuming: ${kept.size} candidate(s) kept from the previous run`
      + ` (~$${carriedSpendUsd.toFixed(3)} already spent).`);
  } catch {
    console.log('Nothing to resume from - running the whole plan.');
  }
}

const results = [];
let spentUsd = carriedSpendUsd;
let blindCounter = 0;
/** Opaque, stable-per-run ids. Sequential rather than hashed so a human can call one out in
 *  a note ("B-07 is the one with the collapsed strap") without transcribing a hash. */
const blindId = () => `B-${String(++blindCounter).padStart(2, '0')}`;

/** The zero-token control and the gallery's anchors. Both are captured in EVERY mode: the
 *  anchors are what make the paid gallery's blind read possible, and re-capturing the
 *  control beside them is the cheapest proof the wrapper did not drift between runs. */
console.log('\n── control + anchors (zero token) ──');
const freeItems = await page.evaluate(async (markBrand) => {
  const bust = '?t=' + Date.now();
  const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
  const control = spikeAnchors.controlAnchor();
  const anchors = await spikeAnchors.galleryAnchors();
  // The mark-fill control: the same fillBrandMark + rendered gate every candidate gets, on a
  // hand-authored slot - if ITS mark is broken, the wiring is broken, not the model.
  const markControl = markBrand ? spikeAnchors.markControlAnchor(markBrand) : null;
  // And the SEATED control: the same fill with the platform's PLACEMENT on, which the
  // catalog-slot control above deliberately skips. Until it existed the placement path had no
  // zero-token coverage and a paid round found the hole instead (docs/AI_ATTEMPTS.md).
  const seatedControl = markBrand ? spikeAnchors.seatedMarkControlAnchor(markBrand) : null;
  // PHASE A (docs/NOACG_PRO_PLAN.md §15.5): four hand-written design LANGUAGES through the real
  // composer. Free, and the whole point of running them here is that the composer is measured by
  // the same instruments a paid round is scored by, before a paid round exists.
  const languages = spikeAnchors.languageAnchors(markBrand);
  // PHASE B (§15.9): the same four languages as the two NEW graphic types - a sponsor bug and a
  // countdown - through `composeGraphic`, the identical function the paid arm takes. It covers
  // the new types only: the strap's four control rows are the §15.5 table this round is compared
  // against, so re-composing them here would either duplicate every row or move a baseline.
  const { newTypeAnchors } = await import('/src/ai/pro/language/control.ts' + bust);
  const { PRO_GRAPHICS } = await import('/src/ai/pro/language/graphics.ts' + bust);
  const newTypes = newTypeAnchors(markBrand ? markBrand.mark : null);
  return [control, ...(markControl ? [markControl] : []), ...(seatedControl ? [seatedControl] : []),
    ...languages, ...newTypes, ...anchors].map((a) => ({
    id: a.id,
    kind: a.kind,
    provenance: a.provenance,
    template: a.template,
    data: a.data,
    stressData: a.stressData,
    markFieldId: a.markFieldId ?? null,
    graphic: a.graphic ?? 'lower-third',
    instruments: PRO_GRAPHICS[a.graphic ?? 'lower-third'].instruments,
  }));
}, controlBrand);

for (const item of freeItems) {
  const started = Date.now();
  const slug = item.id;
  const captured = await captureSet({
    ...item,
    slug,
    markProbe: item.markFieldId && controlBrand ? controlBrand.mark.probe : null,
  });
  const flagged = [
    ...(captured.spacingReport?.findings ?? []),
    ...(captured.proportionReport?.findings ?? []),
  ];
  const record = {
    blindId: blindId(),
    slug,
    kind: item.kind,
    provenance: item.provenance,
    graphic: item.graphic ?? 'lower-third',
    ...captured,
    ms: Date.now() - started,
  };
  results.push(record);
  const flat = record.plan.measured.hasBuilders ? '' : ' · NO TIMELINE BUILDERS';
  console.log(`  ${slug} · in ${record.plan.measured.inMs} ms · out ${record.plan.measured.outMs} ms`
    + ` · ${record.frames.length} motion frames · ${clipsCell(record)}${flat}`
    + `${record.errors.length ? ` · ${record.errors.length} runtime error(s)` : ''}`);
  // A Phase A composition flagging ANYTHING is a composer bug, and the control exists to find it
  // for free - so the readings are printed here rather than left in the ledger for later.
  for (const finding of flagged) console.log(`    ⚠ ${finding.code}: ${finding.detail}`);
  for (const error of record.errors) console.log(`    ✗ ${error}`);
  if (record.markReport) {
    console.log(`    mark: ${record.markReport.findings.length ? record.markReport.findings.join(', ') : 'CLEAN'}`
      + ` · painted ${record.markReport.paintedW}x${record.markReport.paintedH}`
      + ` · clear ${record.markReport.clearPx}/${record.markReport.needClearPx}`
      + `${record.markReport.inkRatio ? ` · ink ${record.markReport.inkRatio}:1` : ''}`);
  }
  if (record.axisReport && (record.axisReport.nearMisses.length || record.axisReport.skewStraddles.length)) {
    console.log(`    axis: ${record.axisReport.nearMisses.length} near-miss(es),`
      + ` ${record.axisReport.skewStraddles.length} skew straddle(s)`);
    // The READING, not just the count - a near-miss is only actionable if you can see which two
    // edges almost line up, and on a free control run there is no reason to leave it in a file.
    for (const miss of record.axisReport.nearMisses) {
      console.log(`      ${typeof miss === 'string' ? miss : JSON.stringify(miss)}`);
    }
  }
  logEscapes(record);
}

// ── The paid arms ──────────────────────────────────────────────────────────────────────
if (paid) {
  // The PLAN, derived from committed fixtures alone: every brief in every requested arm under
  // its ASSIGNED brand, plus the divergence cell - the two named briefs re-run under every
  // OTHER brand on the no-exemplar arm, so each yields a full same-brief/four-brand row.
  const plan = [];
  for (const entry of briefs) {
    const assigned = brandsFixture ? brandById.get(brandsFixture.assignment[entry.id]) : null;
    for (const arm of ARMS) plan.push({ entry, arm, brand: assigned, divergence: false });
  }
  // WHICH ARM THE DIVERGENCE CELL RUNS ON is the fixture's answer, overridable for an arm the
  // fixture predates (`--divergence-arm=language`). The cell is the same brief under every
  // brand, so on a design-language round it is the one measurement that says whether a brand
  // actually moves the answer or whether four brands get one look with different colours - the
  // named sameness failure (src/ai/AGENTS.md).
  // `--no-divergence` drops the cell entirely: a multi-checkpoint round that budgets 12 cells
  // per checkpoint would otherwise silently plan 18 - the fixture's default arm is `none`, so
  // the cell rides along on exactly the arm the free-form coder round runs, and on the dearest
  // checkpoint the extra six cells are the difference between fitting the ceiling and the
  // ceiling cutting the round's last briefs mid-run.
  const divergenceArm = flag('no-divergence') ? null : (value('divergence-arm') ?? brandsFixture?.divergence?.arm);
  if (divergenceArm && !KNOWN_ARMS.includes(divergenceArm)) {
    console.error(`--divergence-arm names an unknown arm "${divergenceArm}".`);
    process.exit(1);
  }
  if (brandsFixture?.divergence && ARMS.includes(divergenceArm)) {
    for (const briefId of brandsFixture.divergence.briefs) {
      const entry = briefs.find((e) => e.id === briefId);
      if (!entry) continue; // a subset run that excludes the divergence brief skips its cell
      for (const brand of brands) {
        if (brand.id === brandsFixture.assignment[briefId]) continue;
        plan.push({ entry, arm: divergenceArm, brand, divergence: true });
      }
    }
  }
  // The drift-check cells, added last so they read as what they are: a few repeats of an arm a
  // previous round already holds, under that arm's own assigned brand so the stored result is
  // the thing they are comparable with. A brief already planned on that arm gains nothing and
  // is skipped rather than generated twice.
  if (driftCheck) {
    for (const briefId of driftCheck.briefs) {
      const entry = briefs.find((e) => e.id === briefId);
      if (!entry) {
        console.error(`--drift-check names a brief this run has no fixture for: ${briefId}`);
        process.exit(1);
      }
      if (ARMS.includes(driftCheck.arm)) continue;
      const assigned = brandsFixture ? brandById.get(brandsFixture.assignment[entry.id]) : null;
      plan.push({ entry, arm: driftCheck.arm, brand: assigned, divergence: false, drift: true });
    }
  }
  console.log(`\nPlan: ${plan.length} generation(s)`
    + `${brandsFixture ? ` (${plan.filter((p) => p.divergence).length} of them the divergence cell)` : ''}`
    + `${driftCheck ? ` (${plan.filter((p) => p.drift).length} of them the ${driftCheck.arm} drift check)` : ''}.`);

  for (const { entry, arm, brand, divergence, drift } of plan) {
      const started = Date.now();
      const slug = brand ? `${entry.id}.${brand.id}.${arm}` : `${entry.id}.${arm}`;
      console.log(`\n── ${slug} ──`);
      const priorRecord = kept.get(slug);
      if (priorRecord) {
        // Re-issue the blind id so the gallery's ordering is this run's, not a stale one; the
        // frames on disk are already correct and are not recaptured.
        results.push({ ...priorRecord, blindId: blindId() });
        console.log(`  kept from the previous run · $${(priorRecord.costUsd ?? 0).toFixed(4)}`);
        continue;
      }
      if (spentUsd >= maxCost) {
        console.log(`  SKIPPED: the $${maxCost.toFixed(2)} ceiling is spent ($${spentUsd.toFixed(3)}).`);
        results.push({
          blindId: blindId(), slug, kind: 'candidate', arm, brand: brand?.id ?? null, skipped: 'cost-ceiling',
        });
        continue;
      }

      let outcome;
      try {
        outcome = arm === 'language' ? await page.evaluate(async (input) => {
          // ── PHASE A: one call for the LANGUAGE, then the platform composes ──────────────
          const bust = '?t=' + Date.now();
          const { generateDesignLanguage } = await import('/src/ai/pro/language/generate.ts' + bust);
          const { composeFromLanguage } = await import('/src/ai/pro/language/compose.ts' + bust);
          const { composeGraphic, packageLines, PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts' + bust);
          const { validateProLanguage } = await import('/src/ai/pro/language/gate.ts' + bust);
          const { brandBlock } = await import('/src/ai/spike/brand.ts' + bust);
          const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
          const { productionSpxValidator } = await import('/src/ai/lite/pipeline.ts' + bust);
          const [provider, ...model] = input.route.split(':');

          const generated = await generateDesignLanguage(
            {
              brief: input.brief.brief,
              // The brand is rendered by the side that OWNS that vocabulary and passed as text
              // (src/ai/pro/language/prompt.ts) - `pro/` may not import the bench-only spike.
              ...(input.brand ? { brandSection: brandBlock(input.brand) } : {}),
            },
            { provider, model: model.join(':') },
            {
              // A bench round is not a product call: `spike` carries Pro's own zero-data-retention
              // posture and reaches no user's hosted allowance.
              surface: 'spike',
              temperature: input.decoding.temperature,
              seed: input.decoding.seed,
            },
          );

          const composed = composeFromLanguage(generated.language, {
            lines: [
              { title: 'Name', sample: input.brief.name },
              { title: 'Role', sample: input.brief.title },
            ],
            ...(input.brand
              ? {
                logo: {
                  assetPath: input.brand.mark.path,
                  images: [{ path: input.brand.mark.path, data: input.brand.mark.dataUrl }],
                  // THE MEASURED INK, which is what the mark field decides on. Without these the
                  // trigger can never fire, so the round would compose a graphic the PRODUCT
                  // does not - the "a control that does not run the code under test is not a
                  // control" rule, arriving as three missing properties.
                  backing: input.brand.mark.probe.backing,
                  inkLuminance: input.brand.mark.probe.inkLuminance,
                  ...(typeof input.brand.mark.probe.inkSpread === 'number'
                    ? { inkSpread: input.brand.mark.probe.inkSpread }
                    : {}),
                },
              }
              : {}),
          });
          const { template, spacing, notes, adjustments } = composed;

          // The slot the shared logo band minted - the platform placed it, so the mark gate and
          // the spacing instrument point at the field a real upload would land in.
          const slotFieldId = input.brand
            ? (template.fields.find((f) => f.ftype === 'filelist')?.field ?? null)
            : null;

          // THROUGH THE ONE SEAM the product is scored by (`pro/language/gate.ts`), so the
          // round measures the same verdict a user gets - including the platform's own
          // divergences, which a bare call to the injected validator cannot see. A bench that
          // scores a different gate than the product runs is the mistake §14 and §16 both
          // recorded, one layer apart.
          //
          // There is NO repair loop here and that is deliberate: nothing the model returns can
          // make the code invalid, so a failing validation would be a PLATFORM bug worth
          // surfacing rather than something to spend a second call on (the grounded-assembly
          // rule, src/ai/AGENTS.md).
          const validation = await validateProLanguage(
            composed,
            generated.fallbacks,
            productionSpxValidator(null, input.brand ? [input.brand.mark.path] : []),
          );

          const data = spikeAnchors.dataFor(input.brief);
          const stressData = spikeAnchors.stressFor(input.brief);
          if (slotFieldId) {
            data[slotFieldId] = input.brand.mark.path;
            stressData[slotFieldId] = input.brand.mark.path;
          }

          // ── THE REST OF THE PACKAGE (§15.9) ─────────────────────────────────────────────
          //
          // The SAME language, rendered as every other graphic type Pro composes. This is the
          // whole Phase B question and it costs NOTHING: the model call above is the only paid
          // step, and composing is deterministic - so a package of three graphics is one call,
          // not three. That is also the claim Pro is sold on, and until this loop existed it had
          // been tested on one type.
          //
          // The words are the SET's, from one show's facts (`packageLines`): the strap names the
          // person on camera, the bug names the channel that is on screen all segment, and the
          // countdown names what the viewer is waiting for. Three unrelated captions would make
          // a coherence read impossible to answer.
          const show = {
            name: input.brief.name,
            title: input.brief.title,
            channel: input.brand?.name ?? null,
          };
          const members = [];
          for (const spec of PRO_GRAPHIC_LIST) {
            if (spec.id === 'lower-third') continue;   // captured as the record's own graphic
            const memberLogo = spec.takesMark && input.brand
              ? {
                assetPath: input.brand.mark.path,
                images: [{ path: input.brand.mark.path, data: input.brand.mark.dataUrl }],
                backing: input.brand.mark.probe.backing,
                inkLuminance: input.brand.mark.probe.inkLuminance,
                ...(typeof input.brand.mark.probe.inkSpread === 'number'
                  ? { inkSpread: input.brand.mark.probe.inkSpread }
                  : {}),
              }
              : null;
            const memberLines = packageLines(spec.id, show);
            const composedMember = composeGraphic(spec.id, generated.language, {
              lines: memberLines,
              ...(memberLogo ? { logo: memberLogo } : {}),
            });
            // Through the SAME gate the strap goes through - one seam, every graphic.
            const memberValidation = await validateProLanguage(
              composedMember,
              generated.fallbacks,
              productionSpxValidator(null, input.brand ? [input.brand.mark.path] : []),
            );
            const memberText = composedMember.template.fields.filter(
              (f) => f.ftype === 'textfield' || f.ftype === 'textarea',
            );
            const memberData = {};
            memberText.forEach((f, i) => {
              memberData[f.field] = memberLines[i]?.sample ?? String(f.value ?? '');
            });
            const memberSlot = memberLogo
              ? composedMember.template.fields.find((f) => f.ftype === 'filelist')?.field ?? null
              : null;
            if (memberSlot) memberData[memberSlot] = input.brand.mark.path;
            members.push({
              graphic: spec.id,
              label: spec.label,
              instruments: spec.instruments,
              template: composedMember.template,
              data: memberData,
              markFieldId: memberSlot,
              notes: composedMember.notes,
              adjustments: composedMember.adjustments,
              spacingPlan: composedMember.spacing,
              validation: {
                ok: memberValidation.ok,
                errors: memberValidation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
                warnings: memberValidation.warnings.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
              },
            });
          }

          return {
            setMembers: members,
            template,
            validation: {
              ok: validation.ok,
              errors: validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
              warnings: validation.warnings.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
            },
            repairRounds: 0,
            exemplarIds: [],
            exemplarReason: 'language arm - the platform composes, so no design is retrieved',
            fill: slotFieldId
              ? { slotFieldId, path: input.brand.mark.path, hadOwnSrc: false, placed: true }
              : null,
            costUsd: generated.costUsd,
            usage: generated.usage,
            model: generated.model,
            emitted: {
              name: generated.language.name,
              type: 'lower-third',
              summary: generated.language.rationale,
            },
            language: generated.language,
            languageFallbacks: generated.fallbacks,
            languageAdjustments: adjustments,
            languageNotes: notes,
            spacingPlan: spacing,
            data,
            stressData,
          };
        }, { brief: entry.brief, route, decoding, brand }) : await page.evaluate(async (input) => {
          const bust = '?t=' + Date.now();
          const spikeRun = await import('/src/ai/spike/run.ts' + bust);
          const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
          const { productionSpxValidator } = await import('/src/ai/lite/pipeline.ts' + bust);
          const [provider, ...model] = input.route.split(':');
          const result = await spikeRun.runSpikeBrief({
            brief: input.brief,
            arm: input.arm,
            route: { provider, model: model.join(':') },
            decoding: input.decoding,
            // The as-is screen is armed with the mark's path: the fill bakes the src inside
            // the ground step, so every validation - including repair rounds - screens the
            // FILLED template for crops, filters and distortions on the customer's mark.
            validate: productionSpxValidator(null, input.brand ? [input.brand.mark.path] : []),
            brand: input.brand ?? undefined,
          });
          const data = spikeAnchors.dataFor(input.brief);
          const stressData = spikeAnchors.stressFor(input.brief);
          if (result.fill?.slotFieldId && result.fill.path) {
            // The mark rides the update payload too - SPX resends every field's value, so the
            // captured hold exercises the runtime's own setFieldValue path beside the baked src.
            data[result.fill.slotFieldId] = result.fill.path;
            stressData[result.fill.slotFieldId] = result.fill.path;
          }
          return {
            template: result.template,
            validation: {
              ok: result.validation.ok,
              errors: result.validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
              warnings: result.validation.warnings.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
            },
            repairRounds: result.repairRounds,
            exemplarIds: result.exemplarIds,
            exemplarReason: result.exemplarReason,
            fill: result.fill ?? null,
            costUsd: result.costUsd,
            usage: result.usage,
            model: result.model,
            emitted: result.emitted,
            data,
            stressData,
          };
        }, { brief: entry.brief, arm, route, decoding, brand });
      } catch (error) {
        // A failed emit still cost tokens where the call was served; there is no cost to read
        // back off a throw here, so it is recorded as unknown rather than as zero.
        console.log(`  FAILED: ${error.message.split('\n')[0]}`);
        results.push({
          blindId: blindId(),
          slug,
          kind: 'candidate',
          arm,
          error: error.message.slice(0, 500),
          costUsd: null,
          ms: Date.now() - started,
        });
        await page.evaluate(() => {
          document.getElementById('spike-hold-frame')?.remove();
          document.getElementById('spike-capture-frame')?.remove();
        }).catch(() => undefined);
        await writeLedger();
        continue;
      }

      spentUsd += outcome.costUsd ?? 0;

      // The FIELD CONTRACT, deterministic - §0.3's "preserve the scaffold and live-field
      // contract" condition. Kept separate from the validator verdict because it is a
      // different question: the validator asks whether the template is sound, this asks
      // whether it is still the graphic that was requested.
      const fields = outcome.template.fields;
      const textFields = fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').length;
      const expected = entry.expect?.textFields ?? 2;
      // EDITABILITY IS DEMOTED HERE FOR THE SAME REASON THE REPAIR LOOP DEMOTES IT, and the
      // first paid brief is what showed the gate disagreeing with the pipeline: a fresh build
      // whose ANIMATION region the converter cannot read still plays, still exports, and only
      // loses its visual timeline, so the product path treats it as a warning. Counting it as
      // a scaffold failure would fail §0.3's "preserve the scaffold and live-field contract"
      // on a criterion that condition never meant - a gate scoring stricter than the pipeline
      // it measures, which is the same shape of bug as the retired pro-bench discarding the compiler's own
      // warnings (docs/AI_ATTEMPTS.md). It is reported, never silently dropped.
      const EDITABILITY_RULE = 'bench-editability';
      const blockingErrors = outcome.validation.errors.filter((e) => !e.startsWith(`${EDITABILITY_RULE}:`));
      const contract = {
        textFields,
        expectedTextFields: expected,
        fieldsOk: textFields >= expected,
        // On a brand round the mark is ALWAYS expected, and "has a slot" means the fill found
        // one - a filelist field with no <img> bound to it is a declaration nothing honours.
        logoExpected: brand ? true : Boolean(entry.expect?.logo ?? entry.brief.includeLogo),
        logoSlot: brand ? Boolean(outcome.fill?.slotFieldId) : fields.some((f) => f.ftype === 'filelist'),
        blockingErrors,
        editabilityDemoted: outcome.validation.errors.length !== blockingErrors.length,
      };
      contract.scaffoldOk = blockingErrors.length === 0 && contract.fieldsOk
        && (!contract.logoExpected || contract.logoSlot);

      // SAVE THE CODE - and save it BEFORE the captures. The frames are expensive; the emitted
      // HTML/CSS/JS is IRREPLACEABLE, and Phase 0 shipped without saving it at all - forty-five
      // paid generations reduced to pictures. The order matters for the same reason: the first
      // brand round lost a paid generation's code because a capture crash sat between the model
      // call and this write. The deliverable lands on disk the moment it exists.
      const codeDir = path.join(OUT, 'code', slug);
      await mkdir(codeDir, { recursive: true });
      await Promise.all([
        writeFile(path.join(codeDir, 'index.html'), outcome.template.html),
        writeFile(path.join(codeDir, 'template.css'), outcome.template.css),
        writeFile(path.join(codeDir, 'template.js'), outcome.template.js),
        writeFile(path.join(codeDir, 'emitted.json'), `${JSON.stringify({
          name: outcome.emitted?.name,
          type: outcome.emitted?.type,
          summary: outcome.emitted?.summary,
        }, null, 2)}\n`),
        // THE LANGUAGE IS THE PAID ARTEFACT on the Phase A arm - the code beside it is
        // deterministic and can be rebuilt from it for free, which the emitted HTML never could.
        // Saved with what the platform did with it, so a later read does not have to re-derive
        // the geometry from a screenshot.
        ...(outcome.language ? [writeFile(path.join(codeDir, 'language.json'), `${JSON.stringify({
          language: outcome.language,
          fallbacks: outcome.languageFallbacks,
          adjustments: outcome.languageAdjustments,
          notes: outcome.languageNotes,
          spacing: outcome.spacingPlan,
        }, null, 2)}\n`)] : []),
      ]);
      // The code axis (docs/NOACG_PRO_PLAN.md §14 item 0a): measured at capture time so the
      // ledger carries it; scripts/spike-code-audit.mjs re-derives the same numbers from the
      // saved files for free after the fact.
      //
      // The timeline verdict comes from the REAL parser, evaluated in the page - the audit
      // script cannot load TypeScript, and its regex stand-in read a NOACG_ANIM-shaped block
      // the parser rejects as a converted timeline. That is the same class of error as a gate
      // measuring a smaller question than the round: it counted 10 read-only results as
      // editable, on the exact axis the exemplar ablation is meant to decide.
      const regionParses = await page.evaluate(async (js) => {
        const { parseAnimData } = await import('/src/blocks/animData.ts?t=' + Date.now());
        try {
          return Boolean(parseAnimData(js));
        } catch {
          return false;
        }
      }, outcome.template.js);
      const codeAudit = auditTemplateCode({
        html: outcome.template.html,
        css: outcome.template.css,
        js: outcome.template.js,
        regionParses,
      });

      // A capture failure is a RESULT, never a round-ender: the generation is already paid for
      // and its code is already saved, so a template the capture rig cannot render lands in the
      // ledger with its cost, its validation and the capture error - and the round moves on.
      // (captureHold survives a template throwing at play(); this guards everything else.)
      let captured;
      try {
        captured = await captureSet({
          ...outcome,
          slug,
          markFieldId: outcome.fill?.slotFieldId ?? null,
          markProbe: brand?.mark.probe ?? null,
        });
      } catch (error) {
        console.log(`  CAPTURE FAILED (kept the paid result): ${error.message.split('\n')[0]}`);
        await page.evaluate(() => {
          document.getElementById('spike-hold-frame')?.remove();
          document.getElementById('spike-capture-frame')?.remove();
          window.__spikeCapture?.dispose?.();
          delete window.__spikeCapture;
        }).catch(() => undefined);
        captured = { captureError: error.message.slice(0, 500), frames: [], errors: [] };
      }

      // ── THE REST OF THE PACKAGE, captured beside the strap (§15.9) ─────────────────────
      //
      // A HOLD each, not a full motion set: the coherence question is answered by looking at
      // three graphics on one screen, and three motion strips per cell would triple the round's
      // wall clock to answer a question nobody asked of it. Each member is measured under its
      // OWN graphic type's thresholds, which is the whole point of the per-type calibration.
      const setMembers = [];
      for (const member of outcome.setMembers ?? []) {
        try {
          const shot = await captureHold({
            template: member.template,
            data: member.data,
            slug: `${slug}.${member.graphic}`,
            markFieldId: member.markFieldId,
            markProbe: member.markFieldId && brand ? brand.mark.probe : null,
            instruments: member.instruments,
          }, true);
          setMembers.push({
            graphic: member.graphic,
            label: member.label,
            hold: shot.file,
            ...(shot.playError ? { playError: shot.playError } : {}),
            ...(shot.measured?.spacing ? { spacingReport: shot.measured.spacing } : {}),
            ...(shot.measured?.proportion ? { proportionReport: shot.measured.proportion } : {}),
            ...(shot.measured?.mark ? { markReport: shot.measured.mark } : {}),
            notes: member.notes,
            adjustments: member.adjustments,
            spacingPlan: member.spacingPlan,
            validation: member.validation,
          });
          const findings = [
            ...(shot.measured?.spacing?.findings ?? []),
            ...(shot.measured?.proportion?.findings ?? []),
          ];
          console.log(`    set · ${member.label.padEnd(13)} ${findings.length
            ? findings.map((f) => f.code).join(', ') : 'clean'}`
            + `${member.validation.ok ? '' : ` · VALIDATION FAILED: ${member.validation.errors[0] ?? ''}`}`
            + `${shot.playError ? ` · ✗ ${shot.playError}` : ''}`);
          for (const f of findings) console.log(`        ${f.code}: ${f.detail}`);
        } catch (error) {
          // Same rule as the strap's capture: a capture failure is a RESULT. The language is
          // already paid for and the member composes deterministically from it.
          console.log(`    set · ${member.graphic}: CAPTURE FAILED ${error.message.split('\n')[0]}`);
          setMembers.push({ graphic: member.graphic, label: member.label, captureError: error.message.slice(0, 300) });
        }
      }
      // The member CODE is saved too - it is as much a deliverable as the strap's, and it is
      // what an export or a re-read is done from.
      for (const member of outcome.setMembers ?? []) {
        const memberDir = path.join(codeDir, member.graphic);
        await mkdir(memberDir, { recursive: true });
        await Promise.all([
          writeFile(path.join(memberDir, 'index.html'), member.template.html),
          writeFile(path.join(memberDir, 'template.css'), member.template.css),
          writeFile(path.join(memberDir, 'template.js'), member.template.js),
        ]);
      }

      const record = {
        blindId: blindId(),
        slug,
        code: path.relative(OUT, codeDir).split(path.sep).join('/'),
        kind: 'candidate',
        arm,
        brand: brand?.id ?? null,
        divergence,
        route,
        model: outcome.model,
        drift: Boolean(drift),
        provenance: `${route} · ${arm} arm${drift ? ' (drift check)' : ''}`
          + `${brand ? ` · brand ${brand.id}${divergence ? ' (divergence cell)' : ''}` : ''}`
          + ` · exemplars [${outcome.exemplarIds.join(', ') || 'none'}]`,
        exemplarIds: outcome.exemplarIds,
        exemplarReason: outcome.exemplarReason,
        ...(outcome.language
          ? {
            language: outcome.language,
            languageFallbacks: outcome.languageFallbacks,
            languageAdjustments: outcome.languageAdjustments,
            languageNotes: outcome.languageNotes,
            spacingPlan: outcome.spacingPlan,
          }
          : {}),
        fill: outcome.fill,
        ...(setMembers.length ? { setMembers } : {}),
        validation: outcome.validation,
        repairRounds: outcome.repairRounds,
        contract,
        codeAudit,
        costUsd: outcome.costUsd,
        usage: outcome.usage,
        ...captured,
        ms: Date.now() - started,
      };
      results.push(record);
      console.log(`  ${contract.scaffoldOk ? 'CONTRACT OK' : 'CONTRACT FAIL'} · fields ${textFields}`
        + `${contract.editabilityDemoted ? ' · read-only timeline' : ''}`
        + ` · repairs ${record.repairRounds} · $${(record.costUsd ?? 0).toFixed(4)}`
        + ` · ${record.frames.length} motion frames · ${clipsCell(record)} · ${record.ms} ms`);
      // OUTPUT VOLUME IS A HEADLINE READING on a multi-checkpoint round, not a footnote:
      // rate and volume cancel or compound, and only the tokens say which (plan §19.3).
      if (record.usage) {
        const u = record.usage;
        const share = u.reasoning ? ` (${u.reasoning} reasoning, ${Math.round((100 * u.reasoning) / Math.max(1, u.output))}%)` : '';
        console.log(`    tokens: ${u.input} in / ${u.output} out${share}`);
      }
      if (record.deviceReport) {
        console.log(`    device: ${record.deviceReport.present
          ? record.deviceReport.channels.map((c) => c.channel).join('+')
          : 'none (plain box)'}`);
      }
      for (const error of contract.blockingErrors) console.log(`    ✗ ${error}`);
      if (outcome.language) {
        const l = outcome.language;
        console.log(`    language "${l.name}": ${l.palette.accent} on ${l.palette.panel}`
          + ` · ${l.typography.fontId} ${l.typography.headingWeight}/${l.typography.supportingWeight}`
          + ` step ${l.typography.step} · ${l.shape.panel} panel, ${l.shape.corner} corners`
          + ` · ${l.accent.form} accent (${l.accent.weight}) · ${l.density} · ${l.motion.character}/${l.motion.pace}`);
        // A field the model did not answer legibly fell back to the HOUSE value, and a round
        // that does not say so is measuring our own defaults and calling them the model's.
        console.log(`    fell back to the house on: ${outcome.languageFallbacks.length
          ? outcome.languageFallbacks.join(', ') : 'nothing'}`);
        // Identity is the model's and is never touched; furniture is the platform's. A round
        // that never reports a repair here is not measuring legibility.
        console.log(`    palette furniture repaired: ${outcome.languageAdjustments.length
          ? outcome.languageAdjustments.join(', ') : 'nothing'}`);
      }
      if (contract.editabilityDemoted) {
        console.log('    · editability demoted to a warning (fresh build) - it plays and exports,'
          + ' its timeline is read-only');
      }
      if (brand) {
        console.log(`    mark: ${!record.markReport ? 'NO SLOT DECLARED'
          : record.markReport.findings.length ? record.markReport.findings.join(', ') : 'CLEAN'}`
          + `${outcome.fill?.hadOwnSrc ? ' · MODEL WROTE ITS OWN src (repaired)' : ''}`
          + `${record.markMotion ? ` · entrance ${record.markMotion.entranceAnimated ? 'animated' : 'STATIC'}` : ''}`);
        // Whether the design's OWN panel carries this mark's ink, decided deterministically
        // from the mark's probe and the design's declared --panel-bg. It is the question the
        // surface argument turns on, and until this round nothing measured it.
        if (outcome.fill?.surface) {
          console.log(`    surface: ${outcome.fill.surface.surface} - ${outcome.fill.surface.reason}`);
        }
        console.log(`    code: ${auditSummaryLine(codeAudit)}`);
        if (record.axisReport && (record.axisReport.nearMisses.length || record.axisReport.skewStraddles.length)) {
          console.log(`    axis: ${record.axisReport.nearMisses.length} near-miss(es),`
            + ` ${record.axisReport.skewStraddles.length} skew straddle(s)`);
        }
        logEscapes(record);
      }
      await writeLedger();
  }
}

// CARRY FORWARD EVERY KEPT RECORD THE CURRENT PLAN DID NOT COVER.
//
// Without this, `--resume` with a brief SUBSET rebuilds the ledger from the subset alone and
// silently drops every other brief's record - their frames stay on disk, orphaned, and their
// verdicts, costs and exemplar ids are gone. That happened on this round and cost ten paid
// generations' worth of metadata: resuming a few briefs is exactly when a subset gets passed,
// so the two features broke each other the first time they were used together. Resume means
// ADD TO what exists, never rebuild only what was named.
const handled = new Set(results.map((r) => r.slug));
for (const [slug, record] of kept) {
  if (handled.has(slug)) continue;
  results.push({ ...record, blindId: blindId() });
  console.log(`  carried forward (outside this run's brief list): ${slug}`);
}

await writeLedger();
// Mode-scoped for the same reason the ledger is: a control rerun after a paid round would
// otherwise replace the blind gallery and the notes template - the two artifacts the human
// review actually happens in - with a control-only version, and notes already written into
// notes.md would go with them.
const reviewFile = path.join(OUT, paid ? 'review.html' : 'control-review.html');
const notesFile = path.join(OUT, paid ? 'notes.md' : 'control-notes.md');
await blindTheFrames(results);
await writeFile(reviewFile, reviewHtml(results, {
  name: path.basename(OUT),
  capturedAt: new Date().toISOString(),
}));
await writeNotesTemplate(notesFile, results);
// THE SET GALLERY (§15.9) - the one artifact the package-coherence claim can be read from, and
// mode-scoped like the others so a free control rerun never replaces a paid round's.
const setFile = path.join(OUT, paid ? 'set-gallery.html' : 'control-set-gallery.html');
const setGallery = setGalleryHtml(results, { name: path.basename(OUT) });
if (setGallery) await writeFile(setFile, setGallery);

const candidates = results.filter((r) => r.kind === 'candidate' && !r.skipped && !r.error);
console.log(`\n${candidates.length} candidate(s) captured, ${results.length - candidates.length} control/anchor/failed`
  + `${paid ? ` · spent ~$${spentUsd.toFixed(3)} of the $${maxCost.toFixed(2)} ceiling` : ''}`);
console.log(`Blind gallery: ${reviewFile}`);
if (setGallery) console.log(`Set gallery (judge the ROW, not the graphics): ${setFile}`);
console.log(`Write notes into ${notesFile} BEFORE running --reveal.`);
await browser.close();

/**
 * THE CONTROL RUN MUST NEVER OVERWRITE A PAID LEDGER.
 *
 * `results.json` carries the round's cumulative spend, and `--resume` reads it to know what
 * has already been paid for. The control mode used to write the same file, so the mandatory
 * "rerun the control after any wrapper change" step silently reset the paid ledger to zero -
 * and the next `--resume` found nothing to keep, regenerated all 24 briefs, and walked the
 * round straight past its approved cost cap. The ceiling was never breached WITHIN a run; the
 * number it counts from was destroyed between runs.
 *
 * A free run therefore writes its own file. Nothing is lost - the control's frames are named
 * per item on disk exactly as before - and the paid ledger is the one artifact a free run
 * cannot touch.
 */
// A function DECLARATION, not a const arrow: `writeLedger` is called from the capture loop
// far above this point, and a const in temporal dead zone throws there instead of writing.
function ledgerPath() {
  return path.join(OUT, paid ? 'results.json' : 'control-results.json');
}

/**
 * COPY EVERY FRAME THE GALLERY SHOWS TO A BLIND FILENAME.
 *
 * The captures are named after the brief and the arm - `sports-live.exemplar.hold.png` - and
 * the gallery referenced them directly, so the one artifact whose entire purpose is to hide
 * the arm, the checkpoint and the verdict announced all of it in every `img src`. A reviewer
 * would not even have to look for it: the browser shows a filename on hover, on right-click,
 * and in the network panel.
 *
 * §0.2 is explicit that the human notes are written before the arm and checkpoint are
 * revealed, and a leak here does not merely weaken that - it silently converts a blind read
 * into an informed one, which is the failure mode the whole anchor-mixing design exists to
 * prevent. Copies rather than renames, so the by-slug originals stay for the key and for
 * anything that has to be re-examined after the reveal.
 */
async function blindTheFrames(all) {
  const dir = path.join(OUT, 'blind');
  await mkdir(dir, { recursive: true });
  for (const record of all) {
    if (record.skipped || record.error) continue;
    const copy = async (file, name) => {
      if (!file) return null;
      const blindName = `${record.blindId}.${name}.png`;
      await copyFile(path.join(OUT, file), path.join(dir, blindName)).catch(() => undefined);
      return `blind/${blindName}`;
    };
    record.blindHold = await copy(record.hold, 'hold');
    record.blindStressHold = await copy(record.stressHold, 'stress');
    // The rest of the package (§15.9) is blinded on the same rule and for the same reason: the
    // set gallery's whole job is "do these three belong to each other", and a filename naming
    // the brand answers a different question before the reviewer has looked.
    for (const member of record.setMembers ?? []) {
      member.blindHold = await copy(member.hold, `set-${member.graphic}`);
    }
    for (const frame of record.frames ?? []) {
      frame.blindFile = await copy(frame.file, `${frame.strip}-${frame.index}`);
    }
    // The clips leak the arm through their filename exactly as the stills did, and a <video src>
    // is if anything more visible than an <img src> - the browser puts it in the context menu.
    if (record.clips) {
      record.blindClips = {};
      for (const [strip, file] of Object.entries(record.clips)) {
        const blindName = `${record.blindId}.${strip}.webm`;
        await copyFile(path.join(OUT, file), path.join(dir, blindName)).catch(() => undefined);
        record.blindClips[strip] = `blind/${blindName}`;
      }
    }
  }
}

async function writeLedger() {
  await writeFile(ledgerPath(), `${JSON.stringify({
    base: BASE,
    /** When this round was captured - so a gallery can say WHICH round a reviewer is looking at
     *  rather than carrying the same title as every other one ever produced. */
    capturedAt: new Date().toISOString(),
    mode: paid ? 'paid' : 'control',
    route: paid ? route : null,
    frontierReason,
    arms: paid ? ARMS : [],
    decoding,
    // The round's brand set with its MEASURED probes (data URLs left out - the marks are
    // committed files), so a ledger read cold still says what conditioned each brief.
    brands: brands.length ? brands.map((b) => ({
      id: b.id, name: b.name, typeface: b.typeface, mark: { path: b.mark.path, probe: b.mark.probe },
    })) : null,
    assignment: brandsFixture?.assignment ?? null,
    spentUsd,
    maxCost: paid ? maxCost : null,
    results,
  }, null, 2)}\n`);
}

// ── The galleries ──────────────────────────────────────────────────────────────────────

/** The BLIND gallery: opaque ids, no verdict, no arm, no checkpoint, everything shuffled by
 *  blind id rather than by run order - run order alone would leak the arms, since the two
 *  arms of one brief are produced back to back. */
function reviewHtml(all, round = {}) {
  const shown = [...all].filter((r) => !r.skipped && !r.error).sort((a, b) => hash(a.blindId) - hash(b.blindId));
  // WHICH ROUND IS THIS? Every gallery this rig had ever produced carried the identical title,
  // so two rounds a day apart were indistinguishable on screen - the owner opened the second
  // one and said it looked like the one they had already done. They were right, and about more
  // than the title: the anchors are re-derived from committed fixtures, so six of the eight
  // rendered byte-identically to the previous round's.
  const name = round.name ? ` · ${round.name}` : '';
  const when = round.capturedAt ? ` · ${String(round.capturedAt).slice(0, 10)}` : '';
  const heading = `NoaCG Pro - blind review${name}${when} · ${shown.length} items`;
  const sections = shown.map((r) => {
    const strips = ['entrance', 'update', 'exit'].map((strip) => {
      const frames = (r.frames ?? []).filter((f) => f.strip === strip);
      if (!frames.length) return '';
      // The CLIP comes first and the stills sit beside it: the clip is what answers "does the
      // motion support the composition", and the stills are what you freeze on to argue about a
      // specific instant. Autoplaying, looping and muted, because a reviewer reading thirty
      // items should not have to press thirty play buttons.
      //
      // NO `controls`. Every graphic here is a LOWER THIRD, so the native control bar lands
      // exactly on top of the thing being judged the moment anyone pauses - the review surface
      // would be hiding the design. Click the clip to freeze it instead.
      const clip = (r.blindClips ?? r.clips)?.[strip];
      const player = clip
        ? `<figure class="clip"><video src="${clip}" autoplay loop muted playsinline></video>`
          + `<figcaption>real speed (${CLIP_FPS} fps)${strip === 'update'
            ? ` · leads in ${UPDATE_LEAD_MS} ms before the swap` : ''} · click to freeze</figcaption></figure>`
        : '';
      return `<h3>${strip}</h3><div class="strip">${player}${frames
        .map((f) => `<figure><img src="${f.blindFile ?? f.file}"><figcaption>${Math.round(f.atMs)} ms</figcaption></figure>`)
        .join('')}</div>`;
    }).join('');
    const notes = [
      r.plan?.note,
      r.playError ? `this graphic THREW during play(): ${r.playError} - the hold shows whatever painted` : null,
      r.captureError ? 'capture failed for this item - judge it from its code and validation in the key' : null,
    ].filter(Boolean);
    const note = notes.length ? `<p class="note">${notes.join('<br>')}</p>` : '';
    const holds = [
      (r.blindHold ?? r.hold) ? `<figure><img src="${r.blindHold ?? r.hold}"><figcaption>normal text</figcaption></figure>` : '',
      (r.blindStressHold ?? r.stressHold) ? `<figure><img src="${r.blindStressHold ?? r.stressHold}"><figcaption>stress text</figcaption></figure>` : '',
    ].join('');
    return `<section id="${r.blindId}">
  <h2>${r.blindId}</h2>
  ${note}
  ${holds ? `<h3>settled hold</h3>\n  <div class="holds">${holds}</div>` : ''}
  ${strips}
</section>`;
  }).join('\n');

  return `<!doctype html><meta charset="utf-8">
<title>${heading}</title>
<style>
body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1600px;margin:0 auto}
h1{font-size:20px} h2{font-size:16px;border-top:1px solid #2a2d34;padding-top:18px;margin-top:32px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9aa0ab;margin:14px 0 6px}
img{border:1px solid #2a2d34;background:#000;display:block}
.holds img{width:640px} .strip{display:flex;gap:8px;overflow-x:auto;align-items:flex-start} .strip img{width:300px}
.strip video{width:480px;border:1px solid #f6a623;background:#000;display:block;cursor:pointer}
.clip figcaption{color:#f6a623}
figure{margin:0} figcaption{color:#9aa0ab;font-size:11px;margin-top:2px}
.note{color:#f6a623} .lead{color:#9aa0ab;max-width:70ch}
</style>
<h1>${heading}</h1>
<p class="lead">Every item below is shown WITHOUT its arm, checkpoint, cost or validator verdict,
and the anchors (adapt-first outputs and strong catalog graphics) are mixed in among the
candidates. Write your notes in <code>notes.md</code> first, then run
<code>node scripts/pro-spike.mjs --reveal</code>.</p>
<p class="lead"><strong>Some of these will look familiar, and that is the design.</strong> The
anchors are a FIXED reference set, re-derived from the same committed fixtures every round, so
they render identically from one round to the next - that is what makes them a yardstick and
what keeps two rounds comparable. Judge each item on what it is rather than on whether you have
seen it before, and do not spend long re-deciding one you recognise.</p>
<p class="lead">Read each one for: deliberate hierarchy, proportion, spacing and composition;
whether it looks like a real broadcast graphic rather than a tutorial component; whether the
motion supports the composition; and whether local CSS/SVG polish would finish it or a
designer would have to start over.</p>
<p class="lead">Each strip LEADS WITH A CLIP that plays the phase at real speed, looping - judge
the motion from that, not from the stills. The stills beside it are the same virtual-clock
instants, kept so a specific frame can be argued about. Click a clip to freeze or restart it;
the update clip starts ${UPDATE_LEAD_MS} ms before the operator's text swap so the change itself
is visible.</p>
<script>
// Click to freeze. The native control bar would cover the lower third, which is the design.
addEventListener('click', function (event) {
  var video = event.target.closest && event.target.closest('.clip video');
  if (video) { if (video.paused) video.play(); else video.pause(); }
});
</script>
${sections}`;
}

/** A stable small hash, so the blind order is deterministic per run without Math.random. */
function hash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Write the notes template ONLY when no notes file exists at all.
 *
 * The rule is deliberately that blunt, because the clever version destroyed a human's review.
 * The first guard tested whether the file "looked like an unfilled template" by searching for
 * a literal bullet string - and the owner's notes were written in prose that never contained
 * it, so a free `--rebuild` (run to fix an unrelated presentation bug) silently replaced their
 * verbatim §0.2 read with blank headings. It was recoverable only because the round had been
 * archived minutes earlier.
 *
 * A notes file is a human artifact this script cannot reconstruct, so it does not get to
 * decide when one is disposable. Existence is the whole test: delete the file to regenerate.
 */
async function writeNotesTemplate(file, all) {
  const exists = await readFile(file, 'utf8').then(() => true).catch(() => false);
  if (exists) {
    console.log(`Kept the existing ${path.basename(file)} - delete it if you want a fresh template.`);
    return;
  }
  await writeFile(file, notesTemplate(all));
}

function notesTemplate(all) {
  const shown = [...all].filter((r) => !r.skipped && !r.error).sort((a, b) => hash(a.blindId) - hash(b.blindId));
  return `# Phase 0 human review notes

Written BEFORE reading key.html (docs/NOACG_PRO_PLAN.md §0.2). One block per item, in the
gallery's order.

For each: deliberate composition? real broadcast graphic or tutorial component? transformed
its references or copied one? does the motion support the composition? would local polish
finish it, or is it a redesign? And where a brand mark is present: does the identity DRIVE
the composition or decorate it, does the mark sit like it belongs, and does it arrive with
intent?

${shown.map((r) => `## ${r.blindId}

- composition:
- broadcast or tutorial:
- copied or transformed:
- motion:
- brand (mark placement, palette driving vs decorating, mark motion):
- polish or redesign:
- airable / one localized repair away / redesign away:
`).join('\n')}`;
}

/** One compact cell for the rendered mark gate + the motion sampling. */
function markCell(r) {
  if (!r.brand) return '-';
  if (r.captureError) return 'capture failed';
  if (!r.markReport) return 'NO SLOT';
  const gate = r.markReport.findings.length ? r.markReport.findings.join(', ') : 'clean';
  const motion = r.markMotion
    ? `<br><small>entrance ${r.markMotion.entranceAnimated ? 'animated' : 'STATIC'}, exit ${
      r.markMotion.exitAnimated ? 'animated' : 'STATIC'}</small>` : '';
  const src = r.fill?.hadOwnSrc ? '<br><small>model wrote its own src (repaired)</small>' : '';
  // The platform's read of whether the design's own panel carries this mark's ink.
  const surface = r.fill?.surface
    ? `<br><small>panel: ${r.fill.surface.surface === 'none' ? 'carries the mark' : `needs a ${r.fill.surface.surface}`}</small>`
    : '';
  return `${gate}${motion}${src}${surface}`;
}

/** Size RELATIONSHIPS - type step, mark scale, panel fill, frame footprint. Every number is
 *  reported whether or not it produced a finding: three of the four have never fired on this
 *  catalog OR on a flagged generation, so their value today is the number beside the frame,
 *  not the verdict (docs/DESIGN_PRINCIPLES.md §4). */
function proportionCell(r) {
  const p = r.proportionReport;
  if (!p) return '-';
  const nums = `<small>type ${p.typeRatio ?? '-'} · mark ${p.markScale ?? '-'}`
    + `<br>fill ${p.panelFill ?? '-'} · frame ${p.footprint ?? '-'}</small>`;
  const found = p.findings.length
    ? `<br>${p.findings.map((f) => `<small>${f.code}</small>`).join('<br>')}`
    : '<br><small>clean</small>';
  return `${nums}${found}`;
}

/** Padding and gap findings, with the ratios that produced them (docs/DESIGN_PRINCIPLES.md). */
function spacingCell(r) {
  const s = r.spacingReport;
  if (!s) return '-';
  const pad = s.padding
    ? `<small>pad ${s.padding.top}/${s.padding.right}/${s.padding.bottom}/${s.padding.left}</small>`
    : '<small>no panel</small>';
  // The escapes are spelled out rather than left to the finding code: "which line, which edge,
  // how far" is the sentence a human needs, and a decorative bleed raises no finding at all.
  const escapes = s.escapes?.length
    ? `<br>${s.escapes.map((e) =>
      `<small>${e.isText ? '⚠ ' : ''}${e.desc} ${e.px}px past ${e.side}</small>`).join('<br>')}`
    : '';
  const gaps = s.lineGaps?.length ? `<br><small>gaps ${s.lineGaps.join(', ')}</small>` : '';
  const mark = typeof s.markGap === 'number' ? `<br><small>mark ${s.markGap}</small>` : '';
  const found = s.findings.length
    ? `<br>${s.findings.map((f) => `<small>${f.code}</small>`).join('<br>')}`
    : '<br><small>clean</small>';
  return `${pad}${escapes}${gaps}${mark}${found}`;
}

function axisCell(r) {
  if (!r.axisReport) return '-';
  const { nearMisses, skewStraddles } = r.axisReport;
  if (!nearMisses.length && !skewStraddles.length) return 'clean';
  const near = nearMisses.map((n) =>
    `<small>${n.side} ${n.a.value}→${n.b.value} (${n.gapPx}px, ${n.relationship})</small>`).join('<br>');
  const skew = skewStraddles.map((s) =>
    `<small>skew ${s.skewed} sweeps ${s.spanPx[0]}-${s.spanPx[1]} over edge ${s.edgeValue}</small>`).join('<br>');
  return [near, skew].filter(Boolean).join('<br>');
}

/** The key, read only after the notes exist. */
function keyHtml(ledger) {
  const rows = ledger.results.map((r) => `<tr>
  <td>${r.blindId}</td>
  <td>${r.kind}${r.arm ? ` · ${r.arm}` : ''}${r.drift ? '<br><small>drift check</small>' : ''}${r.brand ? `<br><small>${r.brand}${r.divergence ? ' · divergence' : ''}</small>` : ''}</td>
  <td>${r.provenance ?? r.slug}</td>
  <td>${r.skipped ? `skipped (${r.skipped})` : r.error ? 'ERROR'
    : r.contract ? `${r.contract.scaffoldOk ? 'contract OK' : 'contract FAIL'}${
      r.contract.editabilityDemoted ? '<br><small>read-only timeline (demoted)</small>' : ''}` : '-'}</td>
  <td>${r.contract ? (r.contract.blockingErrors.length ? r.contract.blockingErrors.join('<br>') : 'valid')
    : r.validation ? (r.validation.ok ? 'valid' : r.validation.errors.join('<br>')) : '-'}</td>
  <td>${markCell(r)}</td>
  <td>${axisCell(r)}</td>
  <td>${spacingCell(r)}</td>
  <td>${proportionCell(r)}</td>
  <td>${r.codeAudit ? `<small>${auditSummaryLine(r.codeAudit)}</small>` : '-'}</td>
  <td>${r.repairRounds ?? '-'}</td>
  <td>${typeof r.costUsd === 'number' ? `$${r.costUsd.toFixed(4)}` : '-'}</td>
</tr>`).join('\n');
  return `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro spike - key</title>
<style>body{background:#101216;color:#e8e9ec;font:13px/1.5 system-ui;padding:24px}
table{border-collapse:collapse;width:100%} td,th{border:1px solid #2a2d34;padding:6px 8px;vertical-align:top;text-align:left}
th{color:#9aa0ab;font-weight:600} small{color:#9aa0ab}</style>
<h1>Key - ${ledger.mode} run${ledger.route ? ` · ${ledger.route}` : ''}</h1>
<p>Spent $${(ledger.spentUsd ?? 0).toFixed(4)}${ledger.maxCost ? ` of a $${ledger.maxCost.toFixed(2)} ceiling` : ''}.
Decoding: temperature ${ledger.decoding.temperature}, seed ${ledger.decoding.seed}.</p>
<table>
<tr><th>id</th><th>kind</th><th>provenance</th><th>contract</th><th>validation</th><th>mark</th><th>axes</th><th>spacing</th><th>proportion</th><th>code</th><th>repairs</th><th>cost</th></tr>
${rows}
</table>`;
}

/**
 * The DIVERGENCE view: every brief that ran under more than one brand, its holds side by side
 * under their named brands - the round's second question made lookable. Same brief, same arm,
 * different brands must be visibly different graphics; four tints of one design is the named
 * failure. Null when the round had no brands (a --no-brand run).
 */
/**
 * THE SET GALLERY - three graphic types side by side, one row per design language (§15.9).
 *
 * The Phase B claim is not "the composer handles three types"; the instruments answer that and
 * they answered it for free. It is that ONE language produces a package a channel could put on
 * air - judged AS A SET, which is a question no per-graphic gallery can ask, because every
 * graphic in a bad package can be individually fine.
 *
 * IT IS BLIND, like the main gallery and for the same reason. The row is keyed by its blind id
 * and every image is a blind copy, so "these three belong to each other" is answered before
 * anyone knows which brand or which checkpoint produced them. The brand names live in key.html.
 *
 * On a CONTROL run the members are separate records rather than one record's `setMembers`, so
 * the rows are grouped by the hand-written language they were composed from - the languages are
 * ours and there is nothing to blind about them.
 */
function setGalleryHtml(all, round = {}) {
  const rows = [];
  // Paid rows: one record carrying the strap plus its package members.
  for (const r of all) {
    if (!r.setMembers?.length || r.skipped || r.error) continue;
    const cells = [
      { label: 'Lower third', file: r.blindHold ?? r.hold, findings: findingCodes(r) },
      ...r.setMembers.map((m) => ({
        label: m.label ?? m.graphic,
        file: m.blindHold ?? m.hold,
        findings: findingCodes(m),
      })),
    ];
    // THE LANGUAGE'S NAME IS NOT BLIND, and printing it here defeated the whole file.
    //
    // A design language is NAMED BY THE MODEL after the brand it was designed for - "Aldervale
    // Nightly", "Kestrel Newsline" - so a heading reading `B-21 "Aldervale Nightly"` announces
    // which of the four brands produced that row, in the one artifact whose entire job is to
    // withhold it until the notes are written. Found by the owner at the moment of reading
    // (2026-08-16), which is the worst possible moment: every earlier reader of this file saw
    // the same leak and it looked like a caption.
    //
    // The blind id alone is the heading now. The name is in key.html with everything else that
    // waits for the reveal, and `blindTheFrames` was already doing the equivalent job for the
    // image filenames - this row's own title was the one thing left announcing it.
    rows.push({ key: r.blindId, sub: '', cells });
  }
  // Control rows: `language-<graphic>-<slug>` records, grouped by the language slug.
  const byLanguage = new Map();
  for (const r of all) {
    const match = /^language-(?:([a-z-]+?)-)?((?:harbour|volt|alder|sunbeam)-[a-z-]+)$/.exec(r.slug ?? '');
    if (!match || r.setMembers?.length) continue;
    const [, , slug] = match;
    if (!byLanguage.has(slug)) byLanguage.set(slug, []);
    byLanguage.get(slug).push(r);
  }
  for (const [slug, records] of byLanguage) {
    if (records.length < 2) continue;   // one graphic is not a set
    const order = ['lower-third', 'sponsor-bug', 'countdown'];
    const cells = records
      .sort((a, b) => order.indexOf(a.graphic ?? 'lower-third') - order.indexOf(b.graphic ?? 'lower-third'))
      .map((r) => ({
        label: (r.graphic ?? 'lower-third').replace(/-/g, ' '),
        file: r.blindHold ?? r.hold,
        findings: findingCodes(r),
      }));
    rows.push({ key: slug.replace(/-/g, ' '), sub: 'zero-token control', cells });
  }
  if (!rows.length) return null;
  const sections = rows.map((row) => {
    const cells = row.cells.map((c) => `<figure><img src="${c.file}">`
      + `<figcaption>${c.label}${c.findings.length ? ` · <b>${c.findings.join(', ')}</b>` : ''}</figcaption></figure>`).join('');
    return `<section><h2>${row.key} <span>${row.sub}</span></h2><div class="row">${cells}</div></section>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro - the package, judged as a set</title>
<style>body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1900px;margin:0 auto}
h1{font-size:19px} h2{font-size:14px;border-top:1px solid #2a2d34;padding-top:14px;margin:26px 0 8px}
h2 span{color:#9aa0ab;font-weight:400}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start} figure{margin:0}
img{width:560px;border:1px solid #2a2d34;background:#000;display:block}
figcaption{color:#9aa0ab;font-size:11px;margin-top:3px} b{color:#f0a94a}
p{color:#9aa0ab;max-width:70ch}</style>
<h1>One design language, the whole package${round.name ? ` - ${round.name}` : ''}</h1>
<p>Each row is ONE design language rendered as every graphic type Pro composes. Judge the ROW,
not the graphics: a channel needs a lower third, a sponsor bug and a countdown that visibly
belong to each other, and every graphic in an incoherent package can be individually fine.</p>
<p>Blind: the rows are keyed by their blind id and the images are blind copies. What produced
each row is in <code>key.html</code>, after the notes are written.</p>
${sections}`;
}

/** The codes both instruments raised on one capture, for the gallery caption. */
function findingCodes(record) {
  return [
    ...(record.spacingReport?.findings ?? []).map((f) => f.code),
    ...(record.proportionReport?.findings ?? []).map((f) => f.code),
  ];
}

function divergenceHtml(ledger) {
  // A capture-failed record has no hold to compare - the key still carries it.
  const candidates = ledger.results.filter((r) => r.kind === 'candidate' && r.brand && !r.skipped && !r.error && r.hold);
  if (!candidates.length) return null;
  const byBrief = new Map();
  for (const r of candidates) {
    const brief = r.slug.split('.')[0];
    if (!byBrief.has(brief)) byBrief.set(brief, []);
    byBrief.get(brief).push(r);
  }
  const sections = [];
  for (const [brief, records] of byBrief) {
    const brandsHere = new Set(records.map((r) => r.brand));
    if (brandsHere.size < 2) continue;
    // The comparable cell is the no-exemplar arm (the divergence cell's arm); fall back to
    // whatever arm exists so a partial round still renders.
    const cells = [...brandsHere].sort().map((brandId) => {
      const r = records.find((x) => x.brand === brandId && x.arm === 'none')
        ?? records.find((x) => x.brand === brandId);
      return `<figure><img src="${r.hold}"><figcaption>${brandId} · ${r.arm} · ${r.blindId}</figcaption></figure>`;
    }).join('');
    sections.push(`<section><h2>${brief}</h2><div class="row">${cells}</div></section>`);
  }
  if (!sections.length) return null;
  return `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro - brand divergence</title>
<style>body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1700px;margin:0 auto}
h2{font-size:15px;border-top:1px solid #2a2d34;padding-top:16px;margin-top:28px}
.row{display:flex;gap:10px;flex-wrap:wrap} figure{margin:0} img{width:400px;border:1px solid #2a2d34;background:#000;display:block}
figcaption{color:#9aa0ab;font-size:11px;margin-top:3px}</style>
<h1>Brand divergence - same brief, different brands</h1>
<p>Read AFTER the blind notes. Different brands must not produce one design in four tints -
that is the sameness failure the adapt-first route already lives under.</p>
${sections.join('\n')}`;
}
