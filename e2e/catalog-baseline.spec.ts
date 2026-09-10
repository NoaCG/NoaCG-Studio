import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONLY_DESIGNS, SCOPE_NOTE } from './_catalogScope';

// THE CATALOG BASELINE — the safety net the theme-token migration is built on
// (src/model/themeTokens.ts holds the tokens; DESIGN_LANGUAGE §8 holds the rationale).
// Two baselines, because they answer different questions.
//
// **Source** — a hash of each emitted pane. Tokenizing REWRITES the CSS text by design
// (`calc(18px * var(--scale))` becomes `var(--panel-radius)`), so this baseline is EXPECTED
// to move on a tokenization commit. Its job is to make that move explicit and reviewable,
// and to prove the refactor did not touch `html` or `js` on the way past.
//
// **Render** — a fingerprint of the settled graphic's computed styles and geometry. This one
// must NOT move. Substituting a variable for the literal it was given cannot change what the
// viewer sees, so any drift here is a real regression. This is the actual gate.
//
// The two flags encode the workflow: on a tokenization commit you re-record the source
// hashes and let the render fingerprints hold the line.
//
//     UPDATE_CATALOG_BASELINE=1 npx playwright test catalog-baseline   # source moved on purpose
//     UPDATE_RENDER_BASELINE=1  npx playwright test catalog-baseline   # the look moved on purpose
//
// A mismatch writes the full emitted panes (source) or the per-element records (render) to
// this test's output directory, so the actual values can be diffed against a re-capture.

const BASELINE = fileURLToPath(new URL('catalog-baseline.json', import.meta.url));
const RENDER_BASELINE = fileURLToPath(new URL('catalog-render-baseline.json', import.meta.url));
const UPDATE = process.env.UPDATE_CATALOG_BASELINE === '1';
const UPDATE_RENDER = process.env.UPDATE_RENDER_BASELINE === '1';

// A baseline written from a SLICE would drop every design the slice did not name, retiring the
// gate for the rest of the catalog. Refused rather than obeyed - a re-record is a claim about
// every row in the file.
if (ONLY_DESIGNS && (UPDATE || UPDATE_RENDER)) {
  throw new Error(
    'NOACG_ONLY_DESIGNS is set alongside a baseline re-record. A baseline is recorded over the ' +
      'WHOLE catalog; unset the scope and run it again.',
  );
}

interface Emitted {
  id: string;
  category: string;
  html: string;
  css: string;
  js: string;
  error: string | null;
}

type PaneHashes = { html: string; css: string; js: string };

const hash = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/** Every catalog variant, created at its own defaults. CATALOG is already the MERGED
 *  catalog, so this covers the type-compiled designs alongside the hand-written ones. */
const EMIT = `(async (only) => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const out = [];
  for (const [category, variants] of Object.entries(CATALOG)) {
    for (const variant of variants ?? []) {
      if (only && only.indexOf(variant.id) < 0) continue;
      try {
        const tpl = variant.create({});
        out.push({ id: variant.id, category, html: tpl.html, css: tpl.css, js: tpl.js, error: null });
      } catch (e) {
        out.push({ id: variant.id, category, html: '', css: '', js: '', error: String(e) });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
})(${JSON.stringify(ONLY_DESIGNS)})`;

test(`every catalog variant emits byte-identical code${SCOPE_NOTE}`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const emitted = (await page.evaluate(EMIT)) as Emitted[];
  expect(emitted.length, 'the catalog produced no variants — the import or the merge is broken').toBeGreaterThan(0);

  const failedToCreate = emitted.filter((e) => e.error);
  expect(failedToCreate.map((e) => `${e.id}: ${e.error}`)).toEqual([]);

  const actual: Record<string, PaneHashes> = {};
  for (const e of emitted) {
    actual[e.id] = { html: hash(e.html), css: hash(e.css), js: hash(e.js) };
  }

  if (UPDATE || !existsSync(BASELINE)) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          $comment:
            // Word for word what scripts/check-catalog-emit.mjs writes. Two recorders writing two
            // sentences meant the comment flipped back and forth depending on which one had last
            // re-recorded, so every second recording carried a diff about nothing.
            'Emitted-code fingerprints for every catalog variant at its own defaults. ' +
            'Re-record with UPDATE_CATALOG_BASELINE=1 and let the diff be the review. ' +
            'Compared by scripts/check-catalog-emit.mjs (fast) and e2e/catalog-baseline.spec.ts (in the suite).',
          variants: actual,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    test.info().annotations.push({ type: 'baseline', description: `recorded ${emitted.length} variants` });
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).variants as Record<string, PaneHashes>;

  // The variant SET first: an added or removed design must be a visible decision, never a
  // silent pass because its id simply stopped being compared. Only a full run can ask this -
  // a scoped run compares the slice, and scripts/catalog-affected.mjs escalates to the whole
  // catalog for any change it cannot attribute to named designs.
  if (!ONLY_DESIGNS) {
    expect(Object.keys(actual).sort(), 'the set of catalog variants changed').toEqual(Object.keys(baseline).sort());
  } else {
    const gone = ONLY_DESIGNS.filter((id) => baseline[id] && !actual[id]);
    expect(gone, 'these ids are in the baseline but the catalog no longer ships them').toEqual([]);
  }

  // Then the panes. Report every drifted pane at once — during a bulk migration the useful
  // question is "which variants moved", not "which one moved first".
  const drifted: string[] = [];
  for (const e of emitted) {
    const was = baseline[e.id];
    const now = actual[e.id];
    if (!was) continue;
    const panes = (['html', 'css', 'js'] as const).filter((p) => was[p] !== now[p]);
    if (!panes.length) continue;
    drifted.push(`${e.id} (${e.category}): ${panes.join(', ')}`);
    const dir = testInfo.outputPath('emitted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${e.id}.html`), e.html, 'utf8');
    writeFileSync(path.join(dir, `${e.id}.css`), e.css, 'utf8');
    writeFileSync(path.join(dir, `${e.id}.js`), e.js, 'utf8');
  }

  expect(
    drifted,
    'Emitted code moved. If that was the point, re-record with UPDATE_CATALOG_BASELINE=1 ' +
      'and review the JSON diff; the full emitted panes are in this test’s output directory.',
  ).toEqual([]);
});

// ── Hidden data holders: a CSS rule, never an inline style ──────────────────────────────

/**
 * A `<div id="fN">` the operator writes into and the runtime reads is hidden with the
 * `.noacg-data-source` RULE (templates/shared/base.ts). Never with `style="display: none"`:
 * the canvas returns a graphic to its resting state by clearing GSAP's inline properties over
 * the whole root subtree (preview/simulatorRuntime.ts `resetGraphicInline`), which wipes the
 * style attribute — and the holder then draws its raw value on screen. Measured before this
 * gate existed: ig22/ig23 leaked their goal figure, ig24/ig25 leaked the milestone list AND
 * the running total, the poll board leaked its options, and every audience queue leaked its
 * pending questions. ig05, hidden by the rule, survived the same reset.
 *
 * An `<img id="fN">` is the deliberate exception and is NOT flagged: an empty image slot hides
 * itself inline through setFieldValue, and `resetGraphicInline` restates exactly that after
 * clearing (otherwise an empty logo would draw as a broken-image box).
 */
test(`no catalog variant hides a data holder with an inline style${SCOPE_NOTE}`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const emitted = (await page.evaluate(EMIT)) as Emitted[];
  expect(emitted.length).toBeGreaterThan(0);

  const inlineHidden = /<(?!img\b)[a-z]+[^>]*\bid="f\d+"[^>]*style="[^"]*display:\s*none/gi;
  const offenders: string[] = [];
  for (const e of emitted) {
    for (const match of e.html.match(inlineHidden) ?? []) {
      offenders.push(`${e.id} (${e.category}): ${match.trim()}`);
    }
  }

  expect(
    offenders,
    'A hidden data holder must carry class="noacg-data-source" — an inline display:none is ' +
      'wiped by the canvas entrance reset and the value appears on air.',
  ).toEqual([]);
});

/**
 * A catalog NAME is what the user picks by, so two designs may not share one.
 *
 * Export already survives a collision - the whole-show export suffixes the second graphic
 * ("House Ident 2") so the folders, files and OGraf ids stay distinct (docs/OGRAF.md). The
 * USER does not: Browse offers two identical cards with nothing to choose between, and a
 * production holding both silently renames one in the operator's rundown. Five pairs had
 * drifted together by 2026-08-19 (bug05/lt54, card30/pi01, ig38/tk13, tt01/ig03, fr03/qz05),
 * every one of them a design added years after the name it landed on.
 *
 * BOTH names are checked because a design writes two: the VARIANT name is the Browse card,
 * and the created template's name is what a production, a rundown and an export folder carry.
 * They are the same string by convention, and a design that lets them drift is its own defect.
 */
test('no two catalog designs share a name', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const named = (await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const out = [];
    for (const [category, variants] of Object.entries(CATALOG)) {
      for (const variant of variants ?? []) {
        let templateName = null;
        try { templateName = variant.create({}).name; } catch { /* the emit test reports this */ }
        out.push({ id: variant.id, category, name: variant.name, templateName });
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  })()`)) as { id: string; category: string; name: string; templateName: string | null }[];
  expect(named.length).toBeGreaterThan(0);

  const byName = new Map<string, string[]>();
  for (const v of named) byName.set(v.name, [...(byName.get(v.name) ?? []), `${v.id} (${v.category})`]);
  const collisions = [...byName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => `"${name}": ${ids.join(' + ')}`);

  expect(
    collisions,
    'Two designs carry the same catalog name. Rename the one whose category the name fits ' +
      'worse - Browse cannot tell them apart, and a production holding both renames one.',
  ).toEqual([]);

  const drifted = named
    .filter((v) => v.templateName !== null && v.templateName !== v.name)
    .map((v) => `${v.id}: card "${v.name}" vs template "${v.templateName}"`);
  expect(
    drifted,
    'A design\'s variant name and the name of the template it creates must match - the user ' +
      'picks by the first and operates by the second.',
  ).toEqual([]);
});

// ── The render fingerprint — the gate tokenization must not move ────────────────────────

interface Rendered {
  id: string;
  error: string | null;
  /** [elementKey, "prop:value; … |rect"] for the settled graphic, capped. */
  elements: [string, string][];
  /** Total elements found, so a change in element COUNT is caught even past the cap. */
  count: number;
}

/** The properties a theme can move. Geometry rides along as the rect, which catches the
 *  layout consequences (a changed padding shifts what sits next to it) that a property
 *  list alone would miss. */
const CAPTURE = `(async (only) => {
  const PROPS = ['background-color','background-image','border-radius','box-shadow','backdrop-filter',
    'color','font-family','font-size','font-weight','letter-spacing','text-transform','line-height',
    'padding','gap','opacity','transform','filter','text-shadow','border-width','border-style',
    'border-color','-webkit-text-stroke','clip-path','mix-blend-mode'];
  const MAX_ELEMENTS = 80;
  // GSAP writes sub-pixel inline transforms; rounding keeps the fingerprint stable without
  // hiding a real move (a themed radius or padding change is never sub-pixel).
  const round1 = (s) => String(s).replace(/-?\\d+\\.\\d+/g, (m) => (Math.round(parseFloat(m) * 10) / 10).toFixed(1));

  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const out = [];

  for (const variants of Object.values(CATALOG)) {
    for (const variant of variants ?? []) {
      if (only && only.indexOf(variant.id) < 0) continue;
      const rec = { id: variant.id, error: null, elements: [], count: 0 };
      let frame = null;
      try {
        const tpl = variant.create({});
        frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;border:0;width:' +
          tpl.resolution.width + 'px;height:' + tpl.resolution.height + 'px;';
        await new Promise((res, rej) => {
          frame.onload = res;
          frame.onerror = () => rej(new Error('the iframe failed to load'));
          frame.srcdoc = composeDocument(tpl);
          document.body.appendChild(frame);
        });
        const win = frame.contentWindow, doc = frame.contentDocument;
        if (!win || !doc) throw new Error('the iframe has no document');

        // FONTS FIRST, AND THE WAIT IS NOT ALLOWED TO GIVE UP QUIETLY. Every measurement here is
        // a face measurement, and a staged design re-calibrates its fit ON fonts.ready - so a
        // reading taken before the swap is the FALLBACK face's geometry, recorded as if it were
        // the design's. Under a loaded machine the old 1.5s cap expired often enough to move
        // al01's four severity slabs and fail this spec inside the full suite while it passed
        // alone. The cap is still here so a genuinely missing face cannot hang the run, but it
        // now THROWS: the faces are bundled and served by the dev server, so eight seconds
        // without them is a fault to report, never a baseline to record.
        const fontsReady = await Promise.race([
          doc.fonts.ready.then(() => true),
          new Promise((r) => setTimeout(() => r(false), 8000)),
        ]);
        if (!fontsReady) {
          throw new Error(rec.id + ': the webfonts were not ready after 8s - a fallback-face measurement is not a baseline');
        }
        // The fit re-runs on that promise; give the layout it schedules a frame to land.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        // MEASURE THE AUTHORED DESIGN, NOT AN ANIMATION PHASE.
        //
        // The first version of this fingerprinted the settled on-air pose. That is the wrong
        // frame to measure and it made the spec flaky under load: a ticker marquee is an
        // infinite GSAP repeat driven by a measured builder, so there is no "settled" state
        // for it to reach — seeking an endless timeline to its end lands wherever the clock
        // happened to be, and tk06 drifted by 32 elements whenever the machine was busy.
        //
        // Motion is deliberately NOT tokenized (model/themeTokens.ts says why), so the gate
        // does not need the animated frame to do its job: everything a token can touch —
        // colour, radius, blur, shadow, weight, tracking, and the layout those imply — is
        // fully determined by the CSS with no timeline running at all. Removing motion from
        // the measurement removes the whole class of timing flake with it. The animated
        // runtime is still covered, by e2e/catalog/catalog-bench.spec.ts.
        const still = doc.createElement('style');
        still.textContent =
          '*, *::before, *::after { animation: none !important; transition: none !important; }' +
          // Templates hide their root until play(); reveal it so layout is measurable. The
          // root is always the template's single top-level element, and forcing it the same
          // way every run means the reveal itself can never drift.
          ' body > * { opacity: 1 !important; }';
        doc.head.appendChild(still);

        // Never play. Just make sure nothing GSAP may have touched at load carries inline
        // styles into the measurement.
        //
        // NOTE WHAT THIS DOES NOT CLEAR, because a failure here sent someone the wrong way once:
        // clearProps takes back what GSAP wrote, and a design's OWN runtime writes inline styles
        // too - the stage fit pins each line's height and the panel's min-height (stageFit.ts).
        // Those are part of what the graphic ships and are measured here deliberately. So a
        // DRIFTING element set under load is not this block failing to clean up; it is that
        // reserve being measured differently on two runs, which is what
        // e2e/stage-fit-determinism.spec.ts guards (docs/FOOTPRINT_STABILITY.md, last section).
        // Re-recording would bake in whichever half of that race won.
        try {
          if (win.gsap) {
            win.gsap.globalTimeline.pause();
            win.gsap.killTweensOf('*');
            win.gsap.set(doc.body.querySelectorAll('*'), { clearProps: 'all' });
          }
        } catch (e) { void e; }
        await new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));

        const walk = (el, path) => {
          rec.count++;
          if (rec.elements.length < MAX_ELEMENTS) {
            const cs = win.getComputedStyle(el);
            const decls = PROPS.map((p) => p + ':' + round1(cs.getPropertyValue(p))).join('; ');
            const r = el.getBoundingClientRect();
            const rect = [r.x, r.y, r.width, r.height].map((n) => Math.round(n)).join(',');
            rec.elements.push([path, decls + ' |' + rect]);
          }
          const seen = {};
          for (const kid of Array.from(el.children)) {
            const cls = typeof kid.className === 'string' && kid.className.trim()
              ? '.' + kid.className.trim().split(/\\s+/).join('.') : '';
            const base = kid.tagName.toLowerCase() + cls;
            seen[base] = (seen[base] || 0) + 1;
            walk(kid, path + '>' + base + '[' + seen[base] + ']');
          }
        };
        walk(doc.body, 'body');
      } catch (e) {
        rec.error = String(e);
      } finally {
        if (frame) frame.remove();
      }
      out.push(rec);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
})(${JSON.stringify(ONLY_DESIGNS)})`;

test(`every catalog variant renders identically${SCOPE_NOTE}`, async ({ page }, testInfo) => {
  test.setTimeout(300_000);

  // The fingerprint is PLATFORM-BOUND: rects and letter-spacing resolve through the OS font
  // rasterizer, so a baseline recorded on Windows can never match a Linux runner — CI was red
  // for a day on exactly that before the baseline learned to say where it was recorded. The
  // comparison runs only on the recording platform; everywhere else this skips loudly rather
  // than failing meaninglessly. The SOURCE baseline above is byte-exact and platform-free, so
  // CI keeps its guard against emitted-code drift either way.
  if (!UPDATE_RENDER && existsSync(RENDER_BASELINE)) {
    const recordedOn = JSON.parse(readFileSync(RENDER_BASELINE, 'utf8')).platform;
    test.skip(
      typeof recordedOn === 'string' && recordedOn !== process.platform,
      `render baseline recorded on "${recordedOn}", this is "${process.platform}" — font rasterization differs; re-record here to compare here`,
    );
  }

  await page.goto('/app');
  await page.keyboard.press('Escape');

  const rendered = (await page.evaluate(CAPTURE)) as Rendered[];
  expect(rendered.length).toBeGreaterThan(0);
  expect(rendered.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`)).toEqual([]);

  // Per ELEMENT, not per variant: during a bulk migration "which element moved" is the
  // question, and a whole-variant hash answers it with a shrug.
  const actual: Record<string, Record<string, string>> = {};
  for (const r of rendered) {
    const byKey: Record<string, string> = { '#count': String(r.count) };
    for (const [key, record] of r.elements) byKey[key] = hash(record);
    actual[r.id] = byKey;
  }

  if (UPDATE_RENDER || !existsSync(RENDER_BASELINE)) {
    writeFileSync(
      RENDER_BASELINE,
      `${JSON.stringify(
        {
          $comment:
            'Computed-style and geometry fingerprints of every catalog variant, settled and on air. ' +
            'Substituting a token for the literal it was given must not move these. ' +
            'Re-record with UPDATE_RENDER_BASELINE=1 only when the look changed ON PURPOSE. ' +
            'Platform-bound: compared only on the platform that recorded it (font rasterization). ' +
            '`recorded` is the day it was taken - the failure message prints it, because the ' +
            'commonest drift is a markup change landed after that day.',
          platform: process.platform,
          // WHEN this was taken, because the commonest cause of drift is AGE. This file is only
          // ever compared on one machine, so a commit that changes the emitted markup and
          // re-records e2e/catalog-baseline.json can leave this one behind for days without
          // anything going red anywhere - which is exactly what happened between 2026-09-06 and
          // 2026-09-10, and cost two backlog items that both guessed at the wrong cause. A date
          // in the file turns "which of these two is stale" into one `git log --since`.
          recorded: new Date().toISOString().slice(0, 10),
          variants: actual,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    test.info().annotations.push({ type: 'baseline', description: `recorded ${rendered.length} variants` });
    return;
  }

  const recorded = JSON.parse(readFileSync(RENDER_BASELINE, 'utf8')) as {
    recorded?: string;
    variants: Record<string, Record<string, string>>;
  };
  const baseline = recorded.variants;
  if (!ONLY_DESIGNS) {
    expect(Object.keys(actual).sort(), 'the set of catalog variants changed').toEqual(Object.keys(baseline).sort());
  }

  const drifted: string[] = [];
  for (const r of rendered) {
    const was = baseline[r.id];
    if (!was) continue;
    const now = actual[r.id];
    const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
    const moved = keys.filter((k) => was[k] !== now[k]);
    if (!moved.length) continue;
    // A key the baseline never had reads very differently from a key whose record CHANGED, and
    // the old line showed neither: `+` is an element that is new here, `-` one that is gone, and
    // a bare key is one that stayed and moved. An added hidden holder is a `+`, and that is the
    // difference between a stale baseline and a look that moved.
    const mark = (k: string): string => {
      if (was[k] === undefined) return `+${k}`;
      if (now[k] === undefined) return `-${k}`;
      return k;
    };
    drifted.push(`${r.id}: ${moved.length} element(s) — ${moved.slice(0, 4).map(mark).join(', ')}`);
    const dir = testInfo.outputPath('rendered');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${r.id}.txt`),
      r.elements.map(([k, v]) => `${moved.includes(k) ? 'MOVED ' : '      '}${k}\n        ${v}`).join('\n'),
      'utf8',
    );
  }

  // THE TWO CAUSES, IN THE ORDER THEY ACTUALLY HAPPEN. The old message named only the second one
  // ("a token substitution cannot do this"), and both times this went red for real the cause was
  // the first: a commit changed the emitted markup, re-recorded the SOURCE baseline beside it,
  // and left this file behind — for two days in 2026-09-06's credits speed field and one more in
  // 2026-09-09's ticker one. Two backlog items were filed off that message, both reasoning from
  // "the look moved" towards a defect that was not there. The message now hands over the date
  // this baseline was taken and the one command that separates the two.
  expect(
    drifted,
    `The rendered look moved against a baseline recorded on ${recorded.recorded ?? 'an unstated date'}. ` +
      'Per-element records are in this test’s output directory; read them before re-recording. ' +
      'FIRST ask whether the emitted MARKUP moved since that date and only the source baseline ' +
      'was re-recorded: `git log --since=<that date> -- e2e/catalog-baseline.json` names every ' +
      'such commit, and a `+key` above whose record ends `|0,0,0,0` is an element added to the ' +
      'markup that nothing draws — a re-record is then right, and says so in its message. ' +
      'ONLY IF IT IS NOT THAT is this a look that moved, which a token substitution cannot cause.',
  ).toEqual([]);
});
