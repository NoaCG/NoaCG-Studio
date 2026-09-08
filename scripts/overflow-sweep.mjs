// The OVERFLOW SWEEP gate: renders every catalog variant at 1920x1080, settles it, and reports
// any painted element that escapes the frame or any box that clips its own content.
//
// Why this exists: the July 2026 catalog audit (docs/TEMPLATE_CATALOG_AUDIT.md) found real
// clipping bugs — a strap running off frame, an accent bar starving its body column until the
// name cut off — that NO repo gate covered. `npm run build`, `type-floor` and `l3-sweep` were
// all green while a graphic painted text past the frame edge. Footprint work (widening designs
// toward their target frame share) is exactly the kind of change that can push a box off screen,
// so that hazard needs a machine check of its own.
//
// Two failure kinds are measured, both on the SETTLED graphic at its defaults:
//   off-frame   — a visible element's painted box crosses outside the 1920x1080 frame.
//   self-clip   — a box whose scrollWidth exceeds its clientWidth (content wider than the box,
//                 hidden by overflow); the auto-fit pattern (design language §5) exists to
//                 prevent exactly this.
//
// Usage (dev server must be running for this checkout — scripts/dev-port.mjs):
//   node scripts/overflow-sweep.mjs                    # sweep every category
//   node scripts/overflow-sweep.mjs lower-third        # one category
//   node scripts/overflow-sweep.mjs --only lt01,lt02   # just these designs (scripts/catalog-scope.mjs)
//   node scripts/overflow-sweep.mjs --json out.json    # dump every row for diffing
//   node scripts/overflow-sweep.mjs --baseline b.json  # only fail on rows WORSE than a baseline
//   node scripts/overflow-sweep.mjs --with-images      # + a pass with a mark in every image field
//   node scripts/overflow-sweep.mjs --type-scale s     # render the pass at another text-size step
//
// --type-scale s|m|l renders every design at that step of the text ladder (S/M/L = 0.85/1/1.2,
// `TYPE_SIZE_STEPS` in src/model/styleVocabulary.ts) instead of the default. Only `font-size`
// consumes `--type-scale`, so a design that sizes a BOX off the same variable while its padding
// stays fixed changes shape as the ladder moves - and it can fit at M and clip at S or L. The
// alerts flag did exactly that (~2px over at M, ~7px at S) and no instrument here could see it,
// because every instrument measured M. Diff a step against the committed M baseline and a row
// that gains an escape or a clip is a design whose lengths do not all move together. A
// non-default step REFUSES --update-baseline: a baseline recorded off-axis would quietly retire
// the gate for every step including this one.
//
// --with-images sweeps every image-capable design a SECOND time with a picture in every
// `filelist` field, recorded as `<id>@image` in the same baseline. A logo is the one operator
// action that can spend a strap's remaining width (docs/ADAPT_FIRST_PLAN.md §1.5 measured +35%
// on lt54) and both this sweep and the catalog tripwire used to run on the bare build only.
//
// IMPORTANT — read before trusting a zero: ~200 of 387 variants report self-clip BY DESIGN.
// Reveal masks (`overflow:hidden` line-masks, `clip-path` wipes) legitimately hide content that
// is wider than the mask at the settled frame; tickers and credit crawls scroll content past the
// frame edge on purpose. This gate is therefore a DIFF tool, not a zero-tolerance one: capture a
// baseline on a known-good tree (`--json before.json`), then run `--baseline before.json` after a
// change and fail only on rows that regressed. A category with no by-design masking (lower-third,
// scoreboard, info-card) can be swept for a hard zero directly.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import { applyOnly, parseOnly, scopeNote } from './catalog-scope.mjs';
import { measured } from './measured.mjs';

const FRAME_W = 1920;
const FRAME_H = 1080;

// A few px of sub-pixel rounding / antialias bleed is not an escape. Anything past this at 1080p
// is a real element sticking out of the frame.
const EDGE_TOLERANCE = 2;
// scrollWidth beats clientWidth by a pixel or two on rounded/monospace text without anything
// actually being hidden; only a real clip is worth reporting.
const CLIP_TOLERANCE = 2;

// The committed reference of every off-frame escape and self-clip that is there BY DESIGN
// (tickers and credit crawls scrolling past the edge, transition covers that slide in from
// off-frame, reveal masks that clip their own content). Regenerate with --update-baseline after
// a deliberate look change; a full run without --baseline hard-fails on any off-frame escape.
const DEFAULT_BASELINE = new URL('./overflow-baseline.json', import.meta.url);

const args = process.argv.slice(2);
const flagVal = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? { at, val: args[at + 1] ?? null } : { at: -1, val: null };
};
const { at: jsonAt, val: jsonOut } = flagVal('--json');
const { at: baseAt, val: baseArg } = flagVal('--baseline');
const { at: writeAt, val: writeArg } = flagVal('--update-baseline');
const { at: stepAt, val: stepArg } = flagVal('--type-scale');
// The LABEL is validated here; the NUMBER is resolved in the page from `TYPE_SIZE_STEPS` itself,
// so this script cannot hold a stale copy of the ladder the catalog actually ships.
const STEP = stepAt >= 0 ? String(stepArg || '').toUpperCase() : null;
if (stepAt >= 0 && !/^[SML]$/.test(STEP)) {
  console.error(`--type-scale takes one of s, m, l (got "${stepArg ?? ''}").`);
  process.exit(2);
}
// A baseline is the record of what escapes and clips BY DESIGN at the shipped default. Written
// from another step of the text ladder it would bless that step's shape changes for every step,
// this one included - the gate would still run and would no longer be measuring anything.
// Refused HERE rather than after the sweep, so the answer costs no browser time.
if (STEP && writeAt >= 0) {
  console.error(
    `Refusing to write a baseline from a --type-scale ${STEP} sweep — the gate's baseline is the ` +
      `default text size. Re-run without --type-scale.`,
  );
  process.exit(2);
}
// --baseline / --update-baseline may be given bare to use the committed default path.
const baseIn = baseAt >= 0 ? baseArg && !baseArg.startsWith('--') ? baseArg : DEFAULT_BASELINE : null;
const writeOut = writeAt >= 0 ? (writeArg && !writeArg.startsWith('--') ? writeArg : DEFAULT_BASELINE) : null;

// The one positional is the optional category id — skip flags and the values they consume.
const { ids: onlyIds, at: onlyAt, raw: onlyRaw } = parseOnly(args);
// A baseline written from a SLICE would drop every design the slice did not name, which retires
// the gate for the rest of the catalog - the same argument the --type-scale refusal above makes,
// and refused here for the same reason: before any browser time is spent.
if (onlyIds && writeAt >= 0) {
  console.error("Refusing to write a baseline from a --only sweep — the gate's baseline is the whole catalog.");
  process.exit(2);
}
const consumed = new Set();
for (const [at, val] of [[jsonAt, jsonOut], [baseAt, baseArg], [writeAt, writeArg], [stepAt, stepArg], [onlyAt, onlyRaw]]) {
  if (at >= 0) {
    consumed.add(at);
    if (val && !val.startsWith('--')) consumed.add(at + 1);
  }
}
const only = args.find((a, i) => !consumed.has(i) && !a.startsWith('--')) || null;
// `--with-images` adds a SECOND pass over every image-capable design with a mark in every image
// field, keyed `<id>@image` in the same baseline. Without the flag a run is byte-identical to
// before it existed, so the committed gate and its baseline are untouched.
//
// Why it exists: docs/ADAPT_FIRST_PLAN.md §1.5 measured a logo taking a lower third 35% wider
// (lt54: 409 -> 551px), and BOTH this sweep and the catalog tripwire ran on the bare build - so
// the one operator action that can spend a strap's remaining width was the one nothing watched.
const withImages = args.includes('--with-images');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__wiz = await import('/src/model/wizard.ts');
  window.__style = await import('/src/model/styleVocabulary.ts');
});

// The step, read off the ladder the wizard offers rather than typed in again here. `null` means
// "no option passed at all", so a default run composes exactly the document it always did.
const typeScale = STEP
  ? await page.evaluate((label) => {
      const step = window.__style.TYPE_SIZE_STEPS.find((s) => s.l === label);
      if (!step) throw new Error(`TYPE_SIZE_STEPS has no step "${label}" - has the ladder changed?`);
      return step.s;
    }, STEP)
  : null;

const allTargets = await page.evaluate(
  (only) =>
    window.__wiz.CATEGORIES.filter((c) => !only || c.id === only).flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({ id: v.id, cat: c.id, name: v.name, logo: v.logo })),
    ),
  only,
);
const targets = await applyOnly(allTargets, onlyIds, 'overflow-sweep', page, () => browser.close());
if (!targets.length) {
  console.error(only ? `No variants for category "${only}".` : 'No variants found.');
  await browser.close();
  process.exit(2);
}
measured(targets.length, 'catalog variants');

// Render a batch off-screen at full frame size, play them, then read back every visible element
// that either escapes the frame or clips its own content.
await page.evaluate(
  ({ FRAME_W, FRAME_H, EDGE_TOLERANCE, CLIP_TOLERANCE }) => {
    window.__scan = async (batch, typeScale) => {
      document.body.innerHTML = '';
      // The step goes through `create`, the wizard's own path - not a CSS override on the
      // finished document, which would also move type in a design that declares no
      // `--type-scale` at all (an imported one sizes each placed line from its own rule).
      const step = typeScale == null ? {} : { typeScale };
      const frames = batch.map(({ id, mark }) => {
        const v = window.__cat.variantById(id);
        const f = document.createElement('iframe');
        // The iframe IS the frame: its own 1920x1080 box is the reference rectangle, so an
        // element's offset relative to it maps straight onto frame coordinates.
        f.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
        try {
          f.srcdoc = window.__comp.composeDocument(
            mark
              ? v.create({ ...step, logoEnabled: true, logoAssetPath: mark.path, importedImages: [mark] })
              : v.create(step),
          );
        } catch (e) {
          f.dataset.err = String((e && e.message) || e);
        }
        document.body.appendChild(f);
        return { id, f, mark };
      });
      await new Promise((r) => setTimeout(r, 900));
      // Drive every image FIELD, not just the slot `create` bound: a crest, a sponsor rail and
      // an avatar are ordinary `filelist` fields the assembler leaves empty, and a sweep that
      // filled only the logo slot would call five designs image-free that carry three slots
      // each (docs/ADAPT_FIRST_PLAN.md §1.5).
      for (const { f, mark } of frames) {
        if (!mark) continue;
        try {
          const fields = (f.contentWindow.SPXGCTemplateDefinition || {}).DataFields || [];
          const data = {};
          for (const fd of fields) if (fd.ftype === 'filelist') data[fd.field] = mark.data;
          if (Object.keys(data).length) f.contentWindow.update(JSON.stringify(data));
        } catch { /* a template that cannot take a picture is not an overflow problem */ }
      }
      await new Promise((r) => setTimeout(r, 300));
      for (const { f } of frames) {
        try {
          f.contentWindow.play && f.contentWindow.play();
        } catch { /* a template without play() is not an overflow problem */ }
      }
      // Settle: presets run ~1.2 s, steps and loops a little longer.
      await new Promise((r) => setTimeout(r, 2400));

      return frames.map(({ id, f }) => {
        const out = { id, err: f.dataset.err || null, offFrame: [], selfClip: [] };
        try {
          const w = f.contentWindow;
          const label = (el) =>
            typeof el.className === 'string' && el.className
              ? '.' + el.className.trim().split(/\s+/)[0]
              : el.id
                ? '#' + el.id
                : el.tagName.toLowerCase();
          for (const el of f.contentDocument.body.querySelectorAll('*')) {
            const cs = w.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (!(parseFloat(cs.opacity) > 0.03)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 && r.height < 1) continue; // a zero-box paints nothing

            // Off-frame: the painted box crosses the frame edge. We ignore elements that are
            // themselves overflow-hidden clippers here — their own children can legitimately sit
            // outside them (that is what the mask is for) — and catch the clip below instead.
            const out_l = r.left < -EDGE_TOLERANCE;
            const out_t = r.top < -EDGE_TOLERANCE;
            const out_r = r.right > FRAME_W + EDGE_TOLERANCE;
            const out_b = r.bottom > FRAME_H + EDGE_TOLERANCE;
            if (out_l || out_t || out_r || out_b) {
              const sides = [out_l && 'L', out_t && 'T', out_r && 'R', out_b && 'B'].filter(Boolean).join('');
              out.offFrame.push({
                sel: label(el),
                sides,
                rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
                text: (el.textContent || '').trim().slice(0, 28),
              });
            }

            // Self-clip: content is wider/taller than the box and overflow hides it. Report both
            // axes; ~200 variants trip this by design (reveal masks), which is why this is diffed.
            const clipX = el.scrollWidth - el.clientWidth > CLIP_TOLERANCE;
            const clipY = el.scrollHeight - el.clientHeight > CLIP_TOLERANCE;
            const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
            const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
            if ((clipX && hidesX) || (clipY && hidesY)) {
              out.selfClip.push({
                sel: label(el),
                axis: [(clipX && hidesX) && 'x', (clipY && hidesY) && 'y'].filter(Boolean).join(''),
                over: [
                  clipX && hidesX ? el.scrollWidth - el.clientWidth : 0,
                  clipY && hidesY ? el.scrollHeight - el.clientHeight : 0,
                ],
                text: (el.textContent || '').trim().slice(0, 28),
              });
            }
          }
        } catch (e) {
          out.err = (out.err || '') + ' READ:' + String((e && e.message) || e);
        }
        return out;
      });
    };
  },
  { FRAME_W, FRAME_H, EDGE_TOLERANCE, CLIP_TOLERANCE },
);

/** One mark, drawn in the page rather than committed as a fixture. */
const MARK = withImages
  ? await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#f6a623'; g.fillRect(0, 0, 256, 256);
      return { path: 'images/sweep-mark.png', data: c.toDataURL('image/png') };
    })
  : null;

// The bare pass is every design; the image pass is only the designs that can hold a picture.
// Its rows are keyed `<id>@image` so one baseline file carries both states and the existing
// signature diff works on them unchanged — a design is allowed to clip differently with a mark
// in it, and the gate's job is to notice when that CHANGES.
const plan = [
  ...targets.map((t) => ({ t, key: t.id, mark: null })),
  ...(MARK ? targets.filter((t) => t.logo !== 'none').map((t) => ({ t, key: `${t.id}@image`, mark: MARK })) : []),
];

const rows = [];
for (let i = 0; i < plan.length; i += 12) {
  const slice = plan.slice(i, i + 12);
  const res = await page.evaluate(
    ({ batch, ts }) => window.__scan(batch, ts),
    { batch: slice.map((p) => ({ id: p.t.id, mark: p.mark })), ts: typeScale },
  );
  res.forEach((r, k) => rows.push({ ...slice[k].t, ...r, id: slice[k].key }));
}
await browser.close();

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
  console.log(`Wrote ${rows.length} rows to ${jsonOut}`);
}

// A stable per-row signature so a baseline compares like with like. Sides/axes matter (a box
// that gains a new escaped side is a regression); exact pixel offsets do not, so they are omitted.
// A signature with no findings is dropped from the baseline entirely — the file lists only the
// variants that legitimately escape or clip, which keeps it small and reviewable.
//
// ONE ENTRY PER AXIS, NEVER ONE PER COMBINATION. The comparison below is a string diff, so a
// combined token made "lost an axis" indistinguishable from "gained a finding": cr03's stage
// clips `.credits-box:xy` at the default text size and only `:y` at S, which is strictly better
// and read as a regression, because the string `:y` is not the string `:xy`. Splitting them means
// a row can only ever fail on an axis or a side it did NOT have before, which is what the gate
// claims to measure. It also makes the baseline readable: `.credits-box:x` and `.credits-box:y`
// are two facts about the design, not one opaque pair.
const axisTokens = (sel, chars) => [...String(chars)].map((c) => `${sel}:${c}`);
const sigOf = (r) => ({
  off: r.offFrame.flatMap((h) => axisTokens(h.sel, h.sides)).sort(),
  clip: r.selfClip.flatMap((h) => axisTokens(h.sel, h.axis)).sort(),
});

if (writeOut) {
  const toDefault = writeOut === DEFAULT_BASELINE;
  if (only && toDefault) {
    console.error(
      `Refusing to overwrite the committed baseline with a "${only}"-only sweep — it would drop ` +
        `every other category. Re-run without a category, or write to an explicit path.`,
    );
    process.exit(2);
  }
  // The same hazard the category guard above covers, one axis over: re-recording without
  // `--with-images` drops every `@image` row and silently retires the image half of the gate.
  if (toDefault && !withImages) {
    let existing = {};
    try { existing = JSON.parse(readFileSync(DEFAULT_BASELINE, 'utf8')); } catch { /* no baseline yet */ }
    if (Object.keys(existing).some((k) => k.endsWith('@image'))) {
      console.error(
        'Refusing to overwrite the committed baseline without --with-images — it already carries ' +
          'image-pass rows, and this run measured none of them. Re-run with --with-images.',
      );
      process.exit(2);
    }
  }
  const sigs = {};
  for (const r of rows) {
    const s = sigOf(r);
    if (s.off.length || s.clip.length) sigs[r.id] = s;
  }
  writeFileSync(writeOut, JSON.stringify(sigs, null, 1) + '\n');
  console.log(`Wrote baseline for ${Object.keys(sigs).length} variant(s) to ${writeOut.pathname || writeOut}`);
  process.exit(0);
}

let baseline = null;
if (baseIn) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(baseIn, 'utf8'));
  } catch (e) {
    console.error(`Could not read baseline ${baseIn.pathname || baseIn}: ${e.message}`);
    console.error('Generate it first with:  node scripts/overflow-sweep.mjs --update-baseline');
    process.exit(2);
  }
  // Committed baselines are the compact { id: {off, clip} } map; tolerate a raw --json dump too.
  const entries = Array.isArray(raw)
    ? raw.map((r) => [r.id, sigOf(r)])
    : Object.entries(raw).map(([id, s]) => [id, { off: s.off || [], clip: s.clip || [] }]);
  baseline = new Map(entries);
}

const errored = rows.filter((r) => r.err);

// A row REGRESSES against a baseline if it escapes a frame side or clips an axis it did not
// before. New rows (variants added since the baseline) count every finding as new.
const regressed = [];
for (const r of rows) {
  const now = sigOf(r);
  if (baseline) {
    const was = baseline.get(r.id) || { off: [], clip: [] };
    const newOff = now.off.filter((s) => !was.off.includes(s));
    const newClip = now.clip.filter((s) => !was.clip.includes(s));
    if (newOff.length || newClip.length) regressed.push({ id: r.id, cat: r.cat, newOff, newClip });
  }
}

const anyOff = rows.filter((r) => r.offFrame.length);
const anyClip = rows.filter((r) => r.selfClip.length);

console.log(
  `\nOverflow sweep — ${rows.length} variants${scopeNote(onlyIds, targets.length, allTargets.length)}${only ? ` (${only})` : ''}`,
);
console.log(`  frame ${FRAME_W}x${FRAME_H} · edge tol ${EDGE_TOLERANCE}px · clip tol ${CLIP_TOLERANCE}px`);
console.log(
  `  text size: ${STEP ?? 'M'}${STEP ? ` (--type-scale ${typeScale}) — diffed against a baseline recorded at M` : ' (the default)'}`,
);
console.log(`  off-frame: ${anyOff.length} variant(s) · self-clip: ${anyClip.length} variant(s) (many by design — see header)\n`);

if (errored.length) {
  console.log(`RENDER ERRORS (${errored.length}):`);
  for (const e of errored) console.log(`  ${e.id}  ${e.err}`);
  console.log('');
}

if (anyOff.length) {
  console.log(`OFF-FRAME (${anyOff.length}) — a painted box crosses the frame edge:`);
  for (const r of anyOff) {
    for (const h of r.offFrame) {
      console.log(`  ${r.id.padEnd(9)} ${r.cat.padEnd(14)} ${h.sides.padEnd(4)} ${h.sel.padEnd(24)} [${h.rect.join(',')}]  ${h.text}`);
    }
  }
  console.log('');
}

if (baseline) {
  if (regressed.length) {
    console.log(`REGRESSED vs baseline (${regressed.length}) — new escapes/clips not in the baseline:`);
    for (const r of regressed) {
      const parts = [...r.newOff.map((s) => `off ${s}`), ...r.newClip.map((s) => `clip ${s}`)];
      console.log(`  ${r.id.padEnd(9)} ${r.cat.padEnd(14)} ${parts.join(' · ')}`);
    }
    console.log('');
    console.log(`FAIL — ${regressed.length} variant(s) regressed against the baseline.\n`);
    process.exit(1);
  }
  console.log('PASS — no variant regressed against the baseline.\n');
  process.exit(errored.length ? 1 : 0);
}

// No baseline: report is informational. Off-frame is still a hard fail — nothing should paint
// outside the frame that a baseline has not explicitly blessed.
if (anyOff.length) {
  console.log(`FAIL — ${anyOff.length} variant(s) paint outside the frame.\n`);
  process.exit(1);
}
console.log('PASS — no variant paints outside the frame. (self-clip is informational; diff with --baseline.)\n');
process.exit(errored.length ? 1 : 0);
