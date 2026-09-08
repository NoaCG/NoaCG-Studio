// THE SVG IMPORT SWEEP - does the SVG road work as advertised, on files designers really export?
//
// Why this exists: every SVG that had ever walked the import door was Illustrator-shaped and
// written for the feature. `docs/SVG_IMPORT_PLAN.md` §6 records the hardening measured against
// three exporters, but nothing in the repo WALKED a corpus door-to-export and printed a verdict.
// A feature the whole "students make their own graphics" goal stands on was therefore proven by
// two fixtures and a reading of the code.
//
// This is an INSTRUMENT, not a gate: it prints a scored table and exits 0 unless `--fail-on`
// says otherwise. The gate is `e2e/import-svg-corpus.spec.ts`, which pins the fixtures whose
// answers we have decided are correct. The sweep is where a new fixture is measured BEFORE
// anybody decides what its right answer is.
//
// WHAT IS MEASURED, per fixture, on the real app (no mocks, no direct module calls until the
// template exists):
//   door      - accepted, or refused with a message that teaches the fix
//   inventory - the size and text-layer count the door reports
//   mapping   - the rows offered, their labels, their samples, what is ticked
//   ladder    - which too-long-text answer the step defaults to (the owner's fit ladder)
//   fonts     - every family resolved, or warned about by name
//   create    - the project builds and the live preview paints without a console error
//   fidelity  - the inlined artwork still carries the source's drawn elements
//   export    - the export window opens and the gate calls the template valid
//
// Each fixture states its OWN expectation in a `.expect.json` sidecar written from the designer's
// promise (docs/SVG_AUTHORING.md), never from the importer's code - so a disagreement is a
// finding rather than a tautology.
//
// Usage (a dev server for THIS checkout must be running - `npm run dev:worktree`):
//   node scripts/svg-import-sweep.mjs                     # sweep the whole corpus
//   node scripts/svg-import-sweep.mjs --only figma        # one family, or one slug
//   node scripts/svg-import-sweep.mjs --json out.json     # every row, for diffing
//   node scripts/svg-import-sweep.mjs --shots dir         # a PNG of each created graphic
//   node scripts/svg-import-sweep.mjs --fail-on fail      # exit 1 on any FAIL row
//   node scripts/svg-import-sweep.mjs --base http://localhost:5186
//   node scripts/svg-import-sweep.mjs --ladder            # the FIT LADDER over the whole corpus
//   node scripts/svg-import-sweep.mjs --ladder --only figma-centred-title-card
//
// `--ladder` is the second sweep and a different question: not "does this file import" but "does
// the fit ladder spend its rungs in order on it, at every option and every value length". It
// drives thousands of rebuilds, so it is much slower than the door sweep - narrow it with
// `--only` while working, and give it a queued slot of its own otherwise.
//
// THE DEFAULT IS NOW THE RIGHT ANSWER, INCLUDING IN A WORKTREE. It used not to be: the only
// sanctioned way to get a server was the Claude preview harness, which does not serve a linked
// worktree at all, so `devPort()` (which reads this checkout's RESERVATION) and whatever was
// listening disagreed. That is how the 2026-08-29 run measured main's importer and reported it
// as the branch's. `npm run dev:worktree` closes it: the server it starts is bound to exactly
// the port `devPort()` returns here, so starting one and running this with no flags measures the
// tree you are editing. `--base` remains for a server somewhere else - another checkout, a
// preview deployment - and the run prints which of the two it used, so a report never again has
// to be reasoned about after the fact to find out what it measured.
//
// It drives Chromium over the app, so it is BROWSER WORK: run it through `npm run queue` like a
// suite, never beside one (`root/enqueue-browser-driving-work-rather-than`,
// scripts/command-match.mjs).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename, dirname, resolve } from 'node:path';
import { devPort } from './dev-port.mjs';
import { LADDER_VALUES, LADDER_MODES, LADDER_LONG } from './ladder-values.mjs';

const CORPUS = fileURLToPath(new URL('../e2e/fixtures/svg-corpus/', import.meta.url));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..').replaceAll('\\', '/');

/** Is anything serving at `base`? A HEAD is enough: we only need "somebody is listening". */
async function answers(url) {
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] ?? null : null;
};
const only = flag('--only');
const jsonOut = flag('--json');
const shotsDir = flag('--shots');
const failOn = flag('--fail-on'); // 'fail' | 'partial'
const baseFlag = flag('--base');
const ladderMode = args.includes('--ladder');

/** Every fixture with a sidecar, in a stable order: family first, then slug. */
function corpus() {
  const files = readdirSync(CORPUS).filter((f) => f.endsWith('.expect.json'));
  const rows = files.map((f) => {
    const spec = JSON.parse(readFileSync(join(CORPUS, f), 'utf8'));
    return { ...spec, svg: join(CORPUS, `${spec.name}.svg`), sidecar: f };
  });
  rows.sort((a, b) => (a.family + a.name).localeCompare(b.family + b.name));
  // A COMMA-SEPARATED LIST, because the useful question is usually about a HANDFUL of files - the
  // ones an exporter quirk is shared by, plus the controls that must not move. The ladder sweep
  // over all 43 takes about two hours, which is a nightly job rather than something to iterate a
  // fix against.
  if (!only) return rows;
  const wanted = only.split(',').map((s) => s.trim()).filter(Boolean);
  return rows.filter((r) => wanted.includes(r.family) || wanted.includes(r.name));
}

/** Count the drawn elements of a source file, so the inlined copy can be checked against it.
 *  Regex rather than a parser on purpose: this counts what the FILE says, with no DOM in the
 *  way, and the inlined side is counted by the browser - two independent measurements. */
function drawnTags(markup) {
  // COMMENTS FIRST. Every fixture opens with a comment saying what the designer drew, and those
  // sentences name elements ("there is no <text> anywhere in this file"). Counted as markup they
  // invent losses that never happened, which is the one way an instrument is worse than none.
  const body = markup.replace(/<!--[\s\S]*?-->/g, '');
  const counts = {};
  for (const tag of ['text', 'rect', 'path', 'circle', 'ellipse', 'polygon', 'line', 'image', 'use']) {
    const m = body.match(new RegExp(`<${tag}[\\s/>]`, 'g'));
    if (m) counts[tag] = m.length;
  }
  return counts;
}

const NEXT = '.wz-modal .wz-next, .wz-modal button:has-text("Next")';

/** OPEN THE IMPORT DOOR AND DROP ONE FILE ON IT, then wait for its answer - which is one of two
 *  and both are a result. Returns `{ accepted, refusal }`.
 *
 *  Shared by both sweeps on purpose. Written twice, a change to a wizard testid leaves the door
 *  sweep green and turns every ladder file into "the door did not accept it" - a broken
 *  instrument reading as a corpus-wide product result, which is the one failure mode this file's
 *  provenance line exists to prevent. */
async function openDoor(page, svgPath, base) {
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(svgPath);

  const card = page.getByTestId('import-svg-card');
  const refusal = page.getByTestId('import-drop-error');
  await Promise.race([
    card.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    refusal.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
  ]);
  if (await refusal.isVisible().catch(() => false)) {
    return { accepted: false, refusal: (await refusal.textContent())?.replace(/^✗\s*/, '').trim() ?? '' };
  }
  if (!(await card.isVisible().catch(() => false))) {
    return { accepted: false, refusal: '(the door neither accepted nor refused it - nothing appeared)' };
  }
  return { accepted: true, refusal: null };
}

/** One fixture, door to export. Returns the measured row; never throws for a product failure -
 *  a crash IS a result and is recorded as one. */
async function walk(page, fixture, base) {
  const seen = { errors: [], notices: [] };
  const onConsole = (m) => {
    if (m.type() === 'error') seen.errors.push(m.text().slice(0, 300));
  };
  page.on('console', onConsole);
  page.on('pageerror', (e) => seen.errors.push(`pageerror: ${String(e).slice(0, 300)}`));

  const got = {
    name: fixture.name,
    family: fixture.family,
    exporter: fixture.exporter,
    accepted: null,
    refusal: null,
    size: null,
    textLayers: null,
    rows: [],
    ticked: 0,
    images: 0,
    outlines: 0,
    ladder: null,
    fonts: [],
    fontWarnings: [],
    notices: [],
    created: null,
    fidelity: null,
    exported: null,
    validation: null,
    consoleErrors: [],
  };

  try {
    const door = await openDoor(page, fixture.svg, base);
    if (!door.accepted) {
      got.accepted = false;
      got.refusal = door.refusal;
      return got;
    }
    const card = page.getByTestId('import-svg-card');
    got.accepted = true;
    const sizeText = (await card.locator('.mono').first().textContent()) ?? '';
    got.size = sizeText.trim();
    const layers = page.getByTestId('import-svg-layers');
    got.textLayers = (await layers.isVisible().catch(() => false))
      ? Number((((await layers.textContent()) ?? '').match(/(\d+) text layer/) ?? [])[1] ?? 0)
      : 0;
    const fontsLine = page.getByTestId('import-svg-fonts');
    if (await fontsLine.isVisible().catch(() => false)) {
      got.fonts = (((await fontsLine.textContent()) ?? '').split(':')[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // The importer's NOTICES: the sanitizer's removals, the flowed-text warning, the symbol note.
    // Told apart from the card's own lines by having NO testid - matching on words instead once
    // swallowed the outlined-text warning, because "No text layers here" contains "text layer".
    for (const p of await card.locator('p.hint:not([data-testid]), p.status-warn:not([data-testid])').all()) {
      const t = ((await p.textContent()) ?? '').trim();
      if (t) got.notices.push(t);
    }
    // The outlined-export answer is a card line WITH a testid, and it is a notice by every
    // measure that matters: it is the only thing said to a designer whose type came out as paths.
    const noLayers = page.getByTestId('import-svg-nolayers');
    if (await noLayers.isVisible().catch(() => false)) {
      got.notices.push(((await noLayers.textContent()) ?? '').trim());
    }

    await page.locator(NEXT).first().click();
    const map = page.getByTestId('map-svg-fields');
    const mapped = await map
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (mapped) {
      for (const row of await map.locator('[data-testid^="map-svg-row-"]').all()) {
        const id = ((await row.getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
        const on = await row.locator('input[type="checkbox"]').first().isChecked().catch(() => false);
        got.rows.push({
          id,
          // Either shape of row: an ordinary one names its layer in an editable box, and one
          // whose layer a bound BEHAVIOUR writes has no box - it is not a field - and states the
          // name in its own sentence instead. Read only the box, a poll board reports four
          // unnamed rows and the sidecar comparison calls it a regression.
          label:
            (await row.locator(`[data-testid="map-svg-title-${id}"]`).inputValue().catch(() => '')) ||
            (await row.locator(`[data-testid="map-svg-driven-${id}"] strong`).textContent().catch(() => '')) ||
            '',
          sample: (await row.locator(`[data-testid="map-svg-sample-${id}"]`).inputValue().catch(() => '')) || '',
          on,
        });
        if (on) got.ticked += 1;
      }
      got.images = await page
        .getByTestId('map-svg-images')
        .locator('.map-svg-row')
        .count()
        .catch(() => 0);
      got.outlines = await page
        .getByTestId('map-svg-outlines')
        .locator('.map-svg-row')
        .count()
        .catch(() => 0);

      const mode = page.getByTestId('map-svg-stretch-mode');
      got.ladder = (await mode.isVisible().catch(() => false)) ? await mode.inputValue() : null;

      for (const warn of await page.locator('[data-testid^="map-svg-font-warn-"]').all()) {
        got.fontWarnings.push(((await warn.getAttribute('data-testid')) ?? '').replace('map-svg-font-warn-', ''));
      }
    }

    // Straight through Animation to Finish on the DEFAULTS - the defaults are the promise.
    await page.locator(NEXT).first().click();
    await page.locator(NEXT).first().click();
    const exportDoor = page.getByTestId('wz-finish-export');
    got.created = await exportDoor
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (got.created) {
      // FIDELITY: the artwork inlined into the built template still holds what the file drew.
      // Measured on the wizard's own live preview, which is the same document the export ships.
      const frame = page.frameLocator('.wz-side iframe');
      got.fidelity = await frame
        .locator('svg')
        .first()
        .evaluate((svg) => {
          const counts = {};
          for (const el of svg.querySelectorAll('*')) {
            const t = el.tagName.toLowerCase();
            counts[t] = (counts[t] ?? 0) + 1;
          }
          return counts;
        })
        .catch(() => null);

      if (shotsDir) {
        mkdirSync(shotsDir, { recursive: true });
        await page
          .locator('.wz-side iframe')
          .screenshot({ path: join(shotsDir, `${fixture.name}.png`) })
          .catch(() => {});
      }

      await exportDoor.click();
      const win = page.getByTestId('export-window');
      got.exported = await win
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (got.exported) {
        const ok = win.locator('.status-ok');
        got.validation = (await ok.isVisible().catch(() => false))
          ? ((await ok.first().textContent()) ?? '').trim()
          : ((await win.locator('.status-bad').first().textContent().catch(() => '')) ?? '').trim() ||
            '(no verdict shown)';
      }
    }
  } catch (e) {
    seen.errors.push(`walk: ${String(e).slice(0, 300)}`);
  } finally {
    page.off('console', onConsole);
  }

  got.consoleErrors = seen.errors.slice(0, 5);
  return got;
}

/** Score one measured row against what its designer expected. */
function score(fixture, got) {
  const want = fixture.expect ?? {};
  const problems = [];
  const soft = [];

  if (want.accepted === false) {
    if (got.accepted !== false) problems.push('imported a file it should have refused');
    else if (fixture.refusalAbout && !new RegExp(fixture.refusalAbout, 'i').test(got.refusal ?? '')) {
      soft.push(`refused, but the message never names "${fixture.refusalAbout}": ${got.refusal}`);
    }
    return { verdict: problems.length ? 'FAIL' : soft.length ? 'PARTIAL' : 'PASS', problems, soft };
  }

  if (got.accepted !== true) {
    problems.push(`refused a file that should import: ${got.refusal ?? '(no message)'}`);
    return { verdict: 'FAIL', problems, soft };
  }

  if (want.width && want.height) {
    const wantSize = `${want.width} × ${want.height}`;
    if (got.size !== wantSize) soft.push(`size read as "${got.size}", drawn as ${wantSize}`);
  }

  if (typeof want.textFields === 'number' && got.ticked !== want.textFields) {
    const line = `${got.ticked} text field${got.ticked === 1 ? '' : 's'} offered ON, designer expected ${want.textFields}`;
    (got.ticked === 0 && want.textFields > 0 ? problems : soft).push(line);
  }
  for (const [i, label] of (want.textLabels ?? []).entries()) {
    const actual = got.rows[i]?.label;
    if (actual !== label) soft.push(`row ${i + 1} labelled "${actual ?? '(none)'}", expected "${label}"`);
  }
  if (typeof want.imageFields === 'number' && got.images !== want.imageFields) {
    soft.push(`${got.images} picture rows, expected ${want.imageFields}`);
  }
  if (typeof want.outlineRows === 'number' && got.outlines !== want.outlineRows) {
    soft.push(`${got.outlines} outline rows, expected ${want.outlineRows}`);
  }
  if (want.growth !== undefined && want.growth !== null && got.ladder !== want.growth) {
    soft.push(`fit ladder defaults to "${got.ladder}", expected "${want.growth}"`);
  }
  for (const topic of want.noticeAbout ?? []) {
    const said = [...got.notices, ...got.fontWarnings].some((n) => new RegExp(topic, 'i').test(n));
    if (!said) soft.push(`no warning about "${topic}"`);
  }
  if ((want.noticeAbout ?? []).length === 0 && got.notices.length) {
    soft.push(`warned about something the designer expected no warning for: ${got.notices[0]}`);
  }

  if (got.created !== true) problems.push('the wizard never reached Finish - the project did not build');
  if (got.created && got.exported !== true) problems.push('the export door never opened');
  if (got.validation && !/valid and ready/i.test(got.validation)) {
    problems.push(`the export gate refused it: ${got.validation}`);
  }
  if (got.fidelity) {
    const src = drawnTags(readFileSync(fixture.svg, 'utf8'));
    for (const [tag, n] of Object.entries(src)) {
      // <use>/<image> are legitimately removed by the sanitizer, and a fixture that expects
      // that says so. TSPANS are not counted at all (neither side): binding a kerned headline
      // means `update()` writes the whole <text>'s textContent, which is exactly what the plan's
      // merged-field case specifies - the runs go, the line stays. Every other drawn tag
      // surviving is the verbatim promise.
      if (tag === 'use' || tag === 'image') continue;
      const kept = got.fidelity[tag] ?? 0;
      if (kept < n) soft.push(`${n - kept} of ${n} <${tag}> lost between the file and the artwork`);
    }
  }
  if (got.consoleErrors.length) soft.push(`console: ${got.consoleErrors[0]}`);

  return { verdict: problems.length ? 'FAIL' : soft.length ? 'PARTIAL' : 'PASS', problems, soft };
}

// ── THE FIT LADDER, SWEPT OVER THE WHOLE CORPUS (`--ladder`) ─────────────────────────────────
//
// The owner has now found the same bug family four times, each time by typing into one field for
// a few minutes on a graphic with a green build and a passing corpus gate. His own ask
// (`docs/backlog/fit-ladder-exhaustive-sweep.md`, 2026-09-03):
//
//   "Even though I wish that this could just be automated - the testing - and that it would try
//    all the combinations until it works as intended."
//
// The space is small and finite: every bound field on every corpus file, times the four ladder
// options, times a handful of value lengths. That is thousands of cases, which is nothing for a
// machine and impossible for a person - and each one has an answer that needs no taste.
//
// WHAT IS ASSERTED IS THE LADDER'S ORDER AND ITS INDEPENDENCE FROM HISTORY, never a table of
// expected numbers. A file's right answer depends on the artwork; these six do not:
//
//   1. shrink is the LAST rung - a breakable value may not get smaller while the design still
//      has room for another line, nor without wrapping once;
//   2. the block stays inside the room the design gave it plus whatever a rule then offered;
//   3. the block does not DRIFT in its box as the value grows - where the designer composed it
//      is where it stays, at every length and every option;
//   4. what a rule OFFERS is a function of the artwork, so it may not move with the value;
//   5. "the panel gets wider" widens the named shape, and widens rather than heightens it;
//   6. nothing a rule grew is painted outside the frame.
//
// Row A's spec (`e2e/import-svg-corpus.spec.ts`) pins exactly these on the owner's own board and
// is the GATE. This is the INSTRUMENT: it walks every file, prints a table naming file, field,
// option and length, and is where a defect of this family is now found instead of by the owner.
// Slow by construction (thousands of rebuilds), so it belongs in a queued or nightly job.

// The space swept - the options and the value lengths - is `scripts/ladder-values.mjs`, shared
// with the gate so the two can never cover different ground. What each of them ASSERTS is its
// own: the gate pins one board's known answers at tolerances measured on it, this asserts what
// holds for any artwork.

/** Everything one pass of the ladder decided, read out of the COMPOSED DOCUMENT rather than out
 *  of the code that emits it - the same rig `runtimeBench.ts` uses, and the only way to measure
 *  the graphic a student would be looking at.
 *
 *  The block and its box are read through `getBBox`, in the BOX'S OWN drawn frame (`svgLocalBox`,
 *  which the runtime exports for exactly this reason). Corpus artwork is routinely on a tilt, so
 *  a screen rectangle is bigger than the plate and "where the block sits in its plate" is not a
 *  question screen coordinates can answer. getBBox also ignores transforms, so a reading cannot
 *  be spoiled by an entrance still in flight. The PANEL'S PAINTED SIZE is the one thing that does
 *  belong in screen px: "wider" is a promise about what the reader sees, and a rotated rect's own
 *  width attribute can run down the painted band rather than across it. */
async function readLadder(frame) {
  return frame.locator('.imported-design-art').evaluate(async (art) => {
    const w = window;
    // AFTER THE SECOND FIT PASS, always. The ladder runs once on load and again at
    // `document.fonts.ready`, and the second answer is the one that airs - the whole reason
    // `refitSvgText` rests the layout first. Read before it, a case is measured against a pose
    // taken in a fallback face, and the rest datum and the value's reading can be taken in
    // different ones, which invents drift and hides it in equal measure.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // CALLED, NOT PROBED. Guarding these behind a `typeof` check turns a renamed runtime export
    // into a two-hour green run that measured nothing, every file reporting "the preview never
    // composed a bound line". Called plainly, the first file throws and is recorded as a finding.
    const nodes = w.svgFitNodes();
    const fields = [];
    for (const el of nodes) {
      const panel = w.svgFitContainer(el);
      const local = panel ? w.svgLocalBox(panel, el) : null;
      const bb = el.getBBox();
      const align = (w.svgFitAlign ?? {})[el.id] ?? null;
      const room = (w.svgFitRoom ?? {})[el.id] ?? null;
      const rect = el.getBoundingClientRect();
      fields.push({
        id: el.id,
        drawn: (w.svgFitDrawn ?? {})[el.id] ?? '',
        value: w.svgFitValue(el),
        alignH: align ? align.h : null,
        alignV: align ? align.v : null,
        derived: !!(align && align.derived),
        alignWidth: align && align.width > 0 ? align.width : 0,
        size: parseFloat(getComputedStyle(el).fontSize) || 0,
        drawnSize: (w.svgFitSizes ?? {})[el.id] ?? 0,
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        blockW: bb.width,
        blockH: bb.height,
        roomW: room ? room.width : 0,
        roomH: room ? room.height : 0,
        penned: !!(room && room.penned),
        extraW: (w.svgFitExtra ?? {})[el.id] ?? 0,
        extraH: (w.svgFitExtraH ?? {})[el.id] ?? 0,
        over: !!(w.svgFitOver ?? {})[el.id],
        offX: local ? bb.x + bb.width / 2 - local.cx : null,
        offY: local ? bb.y + bb.height / 2 - local.cy : null,
        boxW: local ? local.right - local.left : 0,
        boxH: local ? local.bottom - local.top : 0,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    }
    // The growth table AS THE RUNTIME HOLDS IT, so "the named shape" is the shape the author's
    // own row names rather than one this script guessed at from the markup.
    const rules = [];
    const table = w.NOACG_LAYOUT;
    if (table && table.rules) {
      for (const rule of table.rules) {
        const el = w.svgLayoutEl(rule.el);
        const r = el ? el.getBoundingClientRect() : null;
        rules.push({
          el: rule.el,
          axis: rule.axis,
          found: !!el,
          width: r ? r.width : 0,
          height: r ? r.height : 0,
          left: r ? r.left : 0,
          top: r ? r.top : 0,
        });
      }
    }
    const f = art.getBoundingClientRect();
    let outside = 0;
    for (const el of art.querySelectorAll('rect, path, text, image, circle, ellipse, polygon')) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0) || !(r.height > 0)) continue;
      if (r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1) {
        outside += 1;
      }
    }
    return { fields, rules, outside, frame: { width: f.width, height: f.height } };
  });
}

/** Wait for the wizard to finish rebuilding its document.
 *
 *  The STAGE carries the rebuild stamps, not the frame: a rebuild REPLACES the frame, so a stamp
 *  read off the frame is gone exactly when a waiter needs it (WizardPreview.tsx). */
async function settled(page) {
  await page
    .locator('.wz-stage')
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {});
  // Both stamps in ONE animation-frame-paced poll rather than two round trips and a fixed 100 ms
  // sleep each time round. At roughly six thousand settles in a corpus run the sleep alone was
  // several minutes of the sweep spent waiting for nothing.
  await page
    .waitForFunction(
      () => {
        const stage = document.querySelector('.wz-stage');
        return !!stage && stage.getAttribute('data-doc-pending') !== '1' && !!stage.getAttribute('data-doc-rev');
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
}

/** One fixture's whole ladder space: every bound field x every option the file offers x every
 *  length. Returns the findings and one reading row per case. */
async function walkLadder(page, fixture, base) {
  const got = { name: fixture.name, family: fixture.family, fields: 0, readings: [], findings: [], skipped: null };
  try {
    if (!(await openDoor(page, fixture.svg, base)).accepted) {
      got.skipped = 'the door did not accept it (the door sweep is where that is scored)';
      return got;
    }
    await page.locator(NEXT).first().click();
    const map = page.getByTestId('map-svg-fields');
    if (!(await map.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false))) {
      got.skipped = 'no mapping step - nothing to bind, so no ladder to sweep';
      return got;
    }

    // The rows that are TICKED are the ones that become fields, in document order. Each is
    // swept on its own and put back afterwards, so a case is never measured against a
    // neighbour somebody else's case left long.
    const ticked = [];
    for (const row of await map.locator('[data-testid^="map-svg-row-"]').all()) {
      const id = ((await row.getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
      if (!(await row.locator('input[type="checkbox"]').first().isChecked().catch(() => false))) continue;
      ticked.push({ id, sample: await page.getByTestId(`map-svg-sample-${id}`).inputValue().catch(() => '') });
    }
    if (!ticked.length) {
      got.skipped = 'no bound text fields';
      return got;
    }
    got.fields = ticked.length;

    const frame = page.frameLocator('.wz-side iframe');
    await settled(page);
    const first = await readLadder(frame).catch(() => null);
    if (!first || !first.fields.length) {
      got.skipped = 'the preview never composed a bound line';
      return got;
    }
    // WHICH RUNTIME FIELD IS WHICH ROW, checked rather than assumed: the Nth ticked row becomes
    // fN, and the drawn text is the pair's own witness. A file where they disagree is a finding
    // in its own right, because everything below would then measure the wrong node.
    for (let i = 0; i < Math.min(ticked.length, first.fields.length); i += 1) {
      ticked[i].field = first.fields[i].id;
      // Compared with the whitespace collapsed: the mapping step trims and joins what a designer
      // typed, the runtime keeps the file's own indentation, and the two disagreeing about
      // newlines is not what this is asking.
      const flat = (s) => s.replace(/\s+/g, ' ').trim();
      if (ticked[i].sample && first.fields[i].drawn && flat(ticked[i].sample) !== flat(first.fields[i].drawn)) {
        got.findings.push({
          problem: `row ${ticked[i].id} samples "${flat(ticked[i].sample)}" but ${first.fields[i].id} was drawn "${flat(first.fields[i].drawn)}"`,
        });
      }
    }

    const modeSelect = page.getByTestId('map-svg-stretch-mode');
    const hasModes = await modeSelect.isVisible().catch(() => false);
    const modes = hasModes ? LADDER_MODES : ['(no growth control)'];

    for (const mode of modes) {
      if (hasModes) {
        if (!(await modeSelect.selectOption(mode).then(() => true).catch(() => false))) continue;
        await settled(page);
      }
      // THE DESIGN'S OWN ANSWER, ONCE PER OPTION - the datum every longer value is judged
      // against. One reading covers every field, because it is the whole document at rest with
      // the drawn text standing in every node, and only the OPTION changes what that document
      // says. Taken per field it cost a rebuild and a read for each one to produce the identical
      // answer, an eighth of the run on a nine-field board.
      const restAll = await readLadder(frame).catch(() => null);
      if (!restAll) continue;

      for (const row of ticked) {
        if (!row.field) continue;
        const rest = restAll.fields.find((f) => f.id === row.field);
        if (!rest) continue;

        for (const [name, value] of Object.entries(LADDER_VALUES)) {
          await page.getByTestId(`map-svg-sample-${row.id}`).fill(value);
          await settled(page);
          const now = await readLadder(frame).catch(() => null);
          const r = now?.fields.find((f) => f.id === row.field);
          if (!r) continue;
          got.readings.push({ mode, field: row.field, label: row.id, length: name, ...r });
          for (const problem of judgeLadder({ mode, name, rest, r, restAll, now })) {
            got.findings.push({ mode, length: name, field: row.field, problem });
          }
        }
        // And the row goes back to what the designer drew, so the next field is never measured
        // against a neighbour this loop left long.
        await page.getByTestId(`map-svg-sample-${row.id}`).fill(row.sample);
        await settled(page);
      }
    }
  } catch (e) {
    got.findings.push({ problem: `walk: ${String(e).slice(0, 200)}` });
  }
  return got;
}

/** Score one case. Every rule here is checkable without taste - it is either the ladder's own
 *  stated order, or the promise that an answer depends on the ARTWORK and not on what was typed
 *  before it. */
function judgeLadder({ mode, name, value, rest, r, restAll, now }) {
  const out = [];
  const breakable = /\s/.test(value);

  // 1. SHRINK IS THE LAST RUNG (owner, 2026-08-26, re-ruled 2026-09-03). "Could take another
  //    line" needs a break opportunity as well as the height: a single unbroken run has nowhere
  //    to break, so shrink IS its second rung.
  const shrank = r.size < r.drawnSize - 0.01;
  if (shrank && breakable && r.blockH + r.size * 1.2 <= r.roomH + 0.5) {
    out.push(`shrank to ${r.size.toFixed(1)} of ${r.drawnSize.toFixed(1)} with room for another line`);
  }
  // "Without wrapping once" is asked against the room the design has AT THE DRAWN SIZE, not
  // against the shrunk one. A line drawn hard under the line below it - a card's eyebrow, a
  // ticker's kicker - has nowhere to wrap to at any size, so shrink is its second rung too, and
  // asking this without the height turns every such line into a false finding.
  if (shrank && breakable && r.lines === 1 && r.roomH >= r.drawnSize * 2.4) {
    out.push(`shrank to ${r.size.toFixed(1)} of ${r.drawnSize.toFixed(1)} without wrapping once`);
  }

  // 2. THE TEXT STAYS IN THE BOX IT WAS DRAWN IN, both ways. The bound is the room the DESIGN
  //    gave plus whatever a growth rule then offered - the same sum the runtime spends.
  //    THE TOLERANCE SCALES WITH THE TYPE, because the two sides measure different widths. The
  //    runtime fits on the ADVANCE (`getComputedTextLength`, which is what a budget is spent in);
  //    this reads the INK box, which carries side bearings and any glyph overhang. The gap is a
  //    fraction of the type size - two units on a 36 px answer, measured - and calling that an
  //    overflow buries the real ones, which are whole lines wide.
  const budget = r.roomW + r.extraW;
  const ceiling = r.roomH + r.extraH;
  const slack = 1 + r.size * 0.15;
  if (r.blockW > budget + slack) out.push(`block ${r.blockW.toFixed(0)} wider than budget ${budget.toFixed(0)}`);
  if (r.blockH > ceiling + slack) out.push(`block ${r.blockH.toFixed(0)} taller than ceiling ${ceiling.toFixed(0)}`);

  // 2b. AND IT DOES NOT SPILL FURTHER OUT OF ITS BOX THAN THE DESIGN ALREADY DOES. "It should
  //    fill the graphic in the box it lives on" (owner, 2026-09-03) is about the painted block,
  //    not about a budget: a budget measured as the run from where the text was DRAWN to the far
  //    margin is a true statement about a start-anchored line and a wrong one about a centred
  //    line, which spends half of every extra unit on its other side. Asked as spill BEYOND the
  //    rest pose, because artwork legitimately overhangs its own box - a headline drawn wider
  //    than the rule under it is a composition, and only growing that overhang is a defect.
  const spill = (f) => Math.abs(f.offX ?? 0) + f.blockW / 2 - f.boxW / 2;
  if (rest.boxW > 0 && spill(r) > spill(rest) + 1) {
    out.push(`spills ${(spill(r) - spill(rest)).toFixed(0)} further out of its box than the design does`);
  }

  // 3. A CENTRED BLOCK DOES NOT DRIFT IN ITS BOX AS THE VALUE GROWS. "Keep the text centered so
  //    it looks like it's aligned with everything else" (owner, 2026-09-03) - and asked as DRIFT
  //    from where the design put it rather than as an absolute offset, because only drift is
  //    answerable without taste: a composition may be off-centre on purpose, and the ladder's job
  //    is not to move it either way.
  //
  //    ON THE AXIS THE BLOCK IS ANCHORED ON, and no other. A middle anchor fixes the block's
  //    CENTRE, which is the point measured here. A start-anchored line's centre travels every
  //    time the value gets longer, and a top-anchored line's ink centre rises whenever the type
  //    shrinks under an unchanged baseline - both are the artwork behaving, and asking them this
  //    question reports the design as a defect.
  if (r.alignH === 'middle' && rest.offX != null && r.offX != null && Math.abs(r.offX - rest.offX) > 1) {
    out.push(`drifted ${(r.offX - rest.offX).toFixed(1)} across its box (drawn at ${rest.offX.toFixed(1)})`);
  }
  if (r.alignV === 'middle' && rest.offY != null && r.offY != null && Math.abs(r.offY - rest.offY) > 1) {
    out.push(`drifted ${(r.offY - rest.offY).toFixed(1)} down its box (drawn at ${rest.offY.toFixed(1)})`);
  }

  // 4. WHAT A RULE OFFERS IS A FUNCTION OF THE DESIGN, NEVER OF HISTORY. The offer is measured on
  //    the artwork at rest, so it cannot depend on which value happened to be standing in the
  //    node when the pass began. This is the whole of "sometimes it works and goes to the next
  //    line" (owner, 2026-09-03).
  if (Math.abs(r.extraH - rest.extraH) > 0.5) {
    out.push(`height offer moved to ${r.extraH.toFixed(0)} (the design offers ${rest.extraH.toFixed(0)})`);
  }
  //    AND SO IS THE ROOM ITSELF. `measureSvgRoom` runs against a RESTED layout by contract, so
  //    the width the design offers a line cannot depend on what was typed before it. Any drift
  //    here means something the previous pass wrote survived the rest - the anchor's own `x` is
  //    the candidate, since it is written every pass and restored by nothing.
  if (Math.abs(r.roomW - rest.roomW) > 1) {
    out.push(`room moved to ${r.roomW.toFixed(0)} (the design offers ${rest.roomW.toFixed(0)})`);
  }

  // 5. "THE PANEL GETS WIDER" VISIBLY WIDENS THE NAMED SHAPE (owner, 2026-09-03: "Nothing seems
  //    to get wider ... it doesn't do it"), and widens rather than heightens it: a portrait rect
  //    on a tilt grows its painted band DOWNWARDS when the wrong attribute is chosen. Asked only
  //    where the value genuinely exceeded the room the design already gave it - growth is spent
  //    after the design's own space, never before it.
  const needed = r.lines > rest.lines || r.size < r.drawnSize - 0.01 || r.blockW > r.roomW - 1;
  if ((mode === 'grow-x' || mode === 'grow-xy') && LADDER_LONG.includes(name) && needed && restAll && now) {
    // INSIDE ON BOTH AXES. Asked sideways alone, every line of a board is "inside" the question's
    // plate, because the plates are stacked and share an x span - so typing a long ANSWER
    // reported the QUESTION's plate for not widening, which is the one correct thing it could
    // have done. 16 of the owner board's findings were that, measured 2026-09-04.
    const inside = (rule, box) =>
      rule.width > 0 &&
      box.left >= rule.left - 1 &&
      box.left + box.width <= rule.left + rule.width + 1 &&
      box.top >= rule.top - 1 &&
      box.top + box.height <= rule.top + rule.height + 1;
    for (let i = 0; i < restAll.rules.length; i += 1) {
      const was = restAll.rules[i];
      const is = now.rules[i];
      if (!was || !is || was.axis === 'y' || !inside(was, rest.rect)) continue;
      const wider = is.width - was.width;
      const taller = is.height - was.height;
      // A ROW THAT NAMES SOMETHING AS WIDE AS THE FRAME can never widen, and the reason is worth
      // saying rather than leaving as "it stayed the same": the shape the mapping step defaulted
      // to is the artwork's own ground, not a panel (docs/backlog/growth-target-defaults-to-the-frame.md).
      if (now.frame && was.width >= now.frame.width - 2) {
        out.push(`"${was.el}" is the full frame (${Math.round(was.width)} px), so widening it can do nothing`);
      } else if (wider <= 1) out.push(`"${was.el}" stayed ${Math.round(is.width)} px wide`);
      // WIDER, NOT TALLER. A bound rather than an equality: a band a degree or two off level that
      // gets longer necessarily gains a little screen height, and that is the artwork, not the
      // growth. The defect this catches spent the whole grant on height.
      else if (taller > Math.max(1, Math.abs(wider) * 0.2)) {
        out.push(`"${was.el}" got ${Math.round(taller)} px taller for ${Math.round(wider)} px wider`);
      }
    }
  }

  // 6. AND NOTHING A RULE GREW IS PAINTED OUTSIDE THE FRAME - "we cannot have templates outgrow
  //    the screen", asked of the composed document rather than of the cap that is meant to
  //    guarantee it.
  if (now && restAll && now.outside > restAll.outside) {
    out.push(`${now.outside - restAll.outside} more shapes painted outside the frame`);
  }
  return out;
}

/** Collapse a file's findings to one line per DEFECT: the numbers in a message vary case by case
 *  and the defect does not, so two messages that differ only in their figures are the same thing.
 *  Each line keeps a real example, and then names the fields, options and lengths it fired on. */
function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = String(f.problem).replace(/-?\d+(\.\d+)?/g, '#');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { example: f.problem, n: 0, fields: new Set(), modes: new Set(), lengths: new Set() }));
    g.n += 1;
    if (f.field) g.fields.add(f.field);
    if (f.mode) g.modes.add(f.mode);
    if (f.length) g.lengths.add(f.length);
  }
  const list = (s) => [...s].join(' ');
  return [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .map(
      (g) =>
        `${String(g.n).padStart(3)}x  ${g.example}\n         ${list(g.fields)} · ${list(g.modes)} · ${list(g.lengths)}`,
    );
}

/** The whole ladder sweep, printed as a table a person can read. */
async function runLadder(browser, rows, base) {
  const results = [];
  let cases = 0;
  for (const fixture of rows) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    const got = await walkLadder(page, fixture, base);
    results.push(got);
    cases += got.readings.length;
    const mark = got.skipped ? '·' : got.findings.length ? '✗' : '✓';
    const count = got.skipped
      ? got.skipped
      : `${got.fields} field${got.fields === 1 ? '' : 's'}, ${got.readings.length} cases, ${got.findings.length} finding${got.findings.length === 1 ? '' : 's'}`;
    console.log(`${mark} ${fixture.family.padEnd(11)} ${fixture.name.padEnd(42)} ${count}`);
    // ONE LINE PER DEFECT, not per case. The same wrong answer at six lengths on four options is
    // one thing to fix, and printing it 24 times buries the other three defects on the file. The
    // cases it fired on are named after it, because WHICH combination reproduces it is the half
    // of the report somebody debugging actually needs.
    for (const group of groupFindings(got.findings)) console.log(`    ${group}`);
    await ctx.close();
  }
  const swept = results.filter((r) => !r.skipped);
  const bad = swept.filter((r) => r.findings.length);
  console.log(
    `\n${swept.length} files swept (${results.length - swept.length} skipped), ${cases} cases — ` +
      `${swept.length - bad.length} clean, ${bad.length} with findings`,
  );
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Rows written to ${jsonOut}`);
  }
  return bad.length;
}

const base = (baseFlag ?? `http://localhost:${devPort()}`).replace(/\/+$/, '');
const rows = corpus();
if (!rows.length) {
  console.error(`No fixtures in ${CORPUS}${only ? ` matching "${only}"` : ''}.`);
  process.exit(1);
}

// SAY WHICH BUILD THIS MEASURES, before measuring it. A sweep against the wrong server produces
// a full, confident, well-formatted report of somebody else's importer, and every row in it looks
// exactly like a row about yours - which is what happened on 2026-08-29 and was only caught
// afterwards by reasoning about the harness (docs/backlog/svg-import-sweep-findings.md). One line
// of provenance at the top turns that from an inference into something the log records.
console.log(
  `Driving ${base}${baseFlag ? ' (--base)' : ` (this checkout's reserved port, ${repoRoot})`}`,
);

// And refuse when nothing is there. Without this the run spends its whole slot collecting
// ERR_CONNECTION_REFUSED and then reports every fixture as broken, which reads like the product
// failing rather than a missing server - a slot burned and a morning spent on a false alarm.
if (!(await answers(base))) {
  console.error(
    `Nothing is answering at ${base}, so there is no build to measure.\n` +
      'Start this checkout\'s server first: `npm run dev:worktree` (it prints the URL it serves, ' +
      'and refuses if that port is already taken), or pass `--base <url>` to drive one elsewhere. ' +
      '`node scripts/dev-port.mjs --base` prints this checkout\'s URL on its own.',
  );
  process.exit(1);
}

const browser = await chromium.launch();

if (ladderMode) {
  if (shotsDir) console.log('(--shots is a door-sweep flag; the ladder sweep takes no screenshots.)');
  console.log(
    `Sweeping the FIT LADDER: ${rows.length} file${rows.length === 1 ? '' : 's'} x ` +
      `${LADDER_MODES.length} options x ${Object.keys(LADDER_VALUES).length} lengths, every bound field.\n`,
  );
  const withFindings = await runLadder(browser, rows, base);
  await browser.close();
  // The ladder makes no PARTIAL verdict - a case either keeps the ladder's order or does not -
  // so both `--fail-on` levels mean the same thing here, and saying so beats a flag that reads
  // as accepted and does nothing.
  process.exit((failOn === 'fail' || failOn === 'partial') && withFindings ? 1 : 0);
}

const results = [];
for (const fixture of rows) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const got = await walk(page, fixture, base);
  const scored = score(fixture, got);
  results.push({ ...fixture, svg: basename(fixture.svg), got, ...scored });
  const mark = scored.verdict === 'PASS' ? '✓' : scored.verdict === 'PARTIAL' ? '~' : '✗';
  console.log(`${mark} ${fixture.family.padEnd(11)} ${fixture.name}`);
  for (const p of scored.problems) console.log(`    FAIL    ${p}`);
  for (const s of scored.soft) console.log(`    note    ${s}`);
  await ctx.close();
}
await browser.close();

const tally = { PASS: 0, PARTIAL: 0, FAIL: 0 };
for (const r of results) tally[r.verdict] += 1;
console.log(
  `\n${results.length} fixtures — ${tally.PASS} pass, ${tally.PARTIAL} partial, ${tally.FAIL} fail`,
);

if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Rows written to ${jsonOut}`);
}

if (failOn === 'fail' && tally.FAIL) process.exit(1);
if (failOn === 'partial' && (tally.FAIL || tally.PARTIAL)) process.exit(1);
