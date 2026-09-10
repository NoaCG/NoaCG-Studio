import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { awaitPreviewRebuild } from './_preview';
import { previewFrame } from './_frame';
import { dropSvg, rowLabelled, rowLayerName } from './_svg-import';
import { LADDER_VALUES, LADDER_MODES } from '../scripts/ladder-values.mjs';

// THE EXPORTER CORPUS - the SVG import road walked with files shaped the way Illustrator, Figma,
// Inkscape and Affinity really export, rather than the way this feature's own samples are written.
//
// Every case here was a WRONG ANSWER the importer gave on 2026-08-28, found by sweeping
// `e2e/fixtures/svg-corpus/` through the real door (`scripts/svg-import-sweep.mjs`) and scoring
// each file against what the designer who drew it expects (docs/SVG_AUTHORING.md), never against
// the importer's own code. The sweep is the instrument and reports; this spec is the gate.
//
// The fixtures and their `.expect.json` sidecars are documented in
// `e2e/fixtures/svg-corpus/README.md`. Files whose answer is still a FINDING stay in the corpus
// as the repro and are deliberately NOT pinned here - see
// `docs/backlog/svg-import-sweep-findings.md`.

const fixture = (slug: string) =>
  fileURLToPath(new URL(`fixtures/svg-corpus/${slug}.svg`, import.meta.url));

/** Drop a corpus file on the Import door and land on the mapping step.
 *
 *  Through the shared `dropSvg`, which opens the wizard rather than assuming a cold `/app` did:
 *  a walk that has already CREATED a project lands in the editor, and a test that needs a second
 *  file (pick the picture, export; pick the picture, build it and operate it) would otherwise
 *  fail on `.wz-modal` never appearing - a message that sends the reader looking for a broken
 *  wizard. Its own doc comment carries the signed-in half of the same story. */
async function mapCorpusFile(page: Page, slug: string) {
  platesAtRest.clear();
  await page.goto('/app');
  await dropSvg(page, fixture(slug));
}

// ── READING THE COMPOSED DOCUMENT, AND WAITING FOR THE RIGHT ONE ────────────────────────────
//
// Every measurement in this file is taken inside the wizard's preview iframe, and that iframe is
// REPLACED on each rebuild rather than re-pointed (WizardPreview.tsx says why: a new srcdoc on a
// live frame is a subframe navigation, so it fills the reader's Back button). So a read is only
// as good as the wait in front of it, and there are two separate ways to get the wait wrong.
//
// THE STAMPS ARE NARROWLY AHEAD OF THE ASSERTION THAT READS THEM. `data-doc-pending` is set from
// a React passive effect - one commit after the change event `fill()` dispatched, never during
// it. Measured over the whole ladder on an idle laptop, that stamp lands 6 to 17 ms before the
// assertion arrives; that margin is the entire safety of a `not.toHaveAttribute('data-doc-
// pending', '1')` wait, and a contended CI runner re-rendering this 2,400-line step does not owe
// anyone 7 ms. Lose it and the wait answers about the PREVIOUS document: it passes on a rebuild
// that has not started, and the frame it leaves in place is replaced 220 ms later.
//
// AND THE RUNG THAT OWES NOTHING WAITS FOR A STAMP THAT NEVER COMES. Typing a value the field
// already holds composes an identical document, so no rebuild is scheduled and no stamp moves at
// all (measured: 0 of 28 rungs stamp anything at `shrink / short`, 1 of 28 at every other). The
// ladder types its datum at the top of each option and again as the first length, so that rung
// is the one where the spec waits for nothing and walks straight into the PREVIOUS fill's
// rebuild. Both CI failures landed there - run 34289872217 on `fc06fc2b`, and again on main's
// tip in run 34421430904 - with `locator.evaluate: Frame was detached`.
//
// The detach is the LUCKY half. Lose the same race by a hair less and the read succeeds against
// the document for the previous value, which is a silently wrong datum on a test whose whole job
// is comparing one reading against another.

const SETTLED = { timeout: 20_000 };

/** A read that failed because the frame it was reading went away, rather than because the thing
 *  it was reading is wrong. Only this shape is worth another attempt. */
const frameWentAway = (err: unknown) =>
  /frame was detached|execution context was destroyed|target closed|frame got detached/i.test(
    err instanceof Error ? err.message : String(err),
  );

/**
 * Read something out of the composed document, re-resolving the frame on every attempt.
 *
 * A rebuild that lands mid-read is a RETRY rather than a failure: the reading itself is
 * unchanged (the getBBox measurements below are deliberate and none of them is relaxed), only
 * the frame it is taken from is resolved again. Nothing here can make a stale reading pass -
 * `awaitPainted` is what proves the document is the current one, and this is what stops the
 * frame being swapped out from under a read that was already correct to take.
 *
 * ONLY A VANISHED FRAME IS RETRIED. Everything else is re-thrown on the spot, because the errors
 * these readings raise are the ones this corpus exists to catch: `#f0` going missing reads as
 * `Cannot read properties of null`, and retrying that for twenty seconds turns a named regression
 * into a bare test timeout with no assertion attached to it.
 */
async function readArt<R, A>(
  frame: FrameLocator,
  fn: (art: SVGElement | HTMLElement, arg: A) => R,
  arg: A,
): Promise<R> {
  let out!: R;
  let fatal: unknown = null;
  await expect(async () => {
    if (fatal) return; // end the loop; the error is re-thrown below with its own message
    try {
      out = await frame.locator('.imported-design-art').evaluate(fn, arg);
    } catch (err) {
      if (!frameWentAway(err)) fatal = err;
      else throw err;
    }
  }).toPass(SETTLED);
  if (fatal) throw fatal;
  return out;
}

/**
 * Wait until the preview is painting exactly `value` AND has finished arriving.
 *
 * TWO THINGS, and neither implies the other. WHICH document is on screen is settled by asking it
 * what it is showing rather than by reading when it was last stamped, so the answer is true at
 * the rung that owes a rebuild and at the rung that owes none, and no margin has to hold for it.
 * `svgFitValue` is the runtime's OWN reader - the one `svgPaintLines` marks its lines for - so a
 * block wrapped onto three tspans comes back as the value it was made from, spaces intact, and
 * the comparison is exact rather than a whitespace heuristic. Measured across all four options
 * and all six lengths: exactly one text node reads back the typed value, every time.
 *
 * WHETHER IT HAS SETTLED is the other half, and asking only the first would have been a step
 * BACKWARDS from the stamps this replaced. The value is baked into the emitted markup, so a text
 * node reads it back the moment the SVG parses - before the fit has run at all. The fit runs
 * twice (`SVG_FIT_BOOT`): once on `DOMContentLoaded`, and again on `document.fonts.ready`,
 * because the first pass measures a face the browser has not loaded yet. So a reading taken
 * between them is a FALLBACK-METRICS reading, and two of them taken either side of that line
 * differ by a whole size step with nothing wrong in the product. `data-doc-pending` clears from
 * the frame's own load handler and `document.fonts.ready` is awaited from here - the runtime
 * registered its own callback on that promise first, so by the time this one resolves the second
 * fit has already run. `fitBothWays` below waits out the same two events for the same reason.
 *
 * Both live inside the retry: a rebuild starting while this settles puts `data-doc-pending` back
 * up, the attempt fails, and the next one re-asks the frame that replaced it.
 */
async function awaitPainted(page: Page, value: string) {
  const stage = page.locator('.wz-stage');
  const frame = page.frameLocator('.wz-side iframe');
  await expect(async () => {
    const state = await frame.locator('.imported-design-art').evaluate((art, want: string) => {
      const read = (window as unknown as { svgFitValue?: (el: Element) => string }).svgFitValue;
      return {
        reader: !!read,
        painted: !!read && [...art.querySelectorAll('text')].some((t) => read(t) === want),
      };
    }, value);
    // Said apart, so a document that is not an imported design at all reports as that rather
    // than as a value that never turned up.
    expect(state.reader, 'the preview document carries no svgFitValue to read itself back with').toBe(true);
    expect(state.painted, `the preview is not painting "${value.slice(0, 40)}" yet`).toBe(true);
    await expect(stage).not.toHaveAttribute('data-doc-pending', '1', { timeout: 2_000 });
    await frame.locator('body').evaluate(async () => {
      await document.fonts.ready;
    });
  }).toPass(SETTLED);
}

/** Drop a corpus file on the Import door and stop on the card, which is where the size is
 *  reported - the mapping step is one click too far to read it. */
async function dropCorpusFile(page: Page, slug: string) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fixture(slug));
}

/** The labels the mapping step offers, in document order. */
async function labels(page: Page): Promise<string[]> {
  const rows = page.getByTestId('map-svg-fields').locator('[data-testid^="map-svg-row-"]');
  const out: string[] = [];
  for (const row of await rows.all()) {
    const id = ((await row.getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
    out.push(await rowLayerName(row, id));
  }
  return out;
}

/** Straight through Animation to Finish on the DEFAULTS, then out the export door: the gate's
 *  own verdict is the only proof that a corpus file really is playable, not merely readable. */
async function exportsClean(page: Page) {
  await page.locator('.wz-next').click(); // Animation
  await page.locator('.wz-next').click(); // Finish
  await page.getByTestId('wz-finish-export').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible({ timeout: 30_000 });
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');
}

test('corpus: a KERNED Illustrator headline is one field, and the licensed face warns by name', async ({ page }) => {
  // Illustrator hand-kerns by splitting a line into <tspan> runs with their own x. They are one
  // line of type, not four fields, and the measured GAP is the only thing that says so.
  await mapCorpusFile(page, 'illustrator-kerned-headline');
  expect(await labels(page)).toEqual(['Headline', 'Subtitle']);
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('WORLD REPORT');

  // Gotham is neither bundled nor on Google, so it warns and continues - and the two PostScript
  // faces beside it resolve, rather than warning about a family this project ships.
  await expect(page.getByTestId('map-svg-font-warn-Gotham-Bold')).toBeVisible();
  await expect(page.getByTestId('map-svg-font-ok-Inter-Regular')).toBeVisible();
  await exportsClean(page);
});

test('corpus: a Figma board is labelled with the designer\'s names, not Figma\'s own', async ({ page }) => {
  // Figma auto-names a text layer after the words in it (`<text id="Amsterdam">`) and wraps
  // things in frames it names itself (`<g id="Frame 21">`). Both used to beat the name the
  // designer typed one level up, so an operator's field for the D answer read "Reykjavik" - the
  // very word they were about to replace - and another read "Frame 21".
  await mapCorpusFile(page, 'figma-nested-frames-quiz-board');
  expect(await labels(page)).toEqual(['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D']);
  await expect(page.getByTestId('map-svg-sample-t4')).toHaveValue('Reykjavik');
  await exportsClean(page);
});

test('corpus: Affinity\'s serif:id spells the label, and a shifted viewBox origin still imports', async ({ page }) => {
  // Affinity Designer sanitizes the layer name into `id` ("Answer-A") and keeps the spelling the
  // designer typed in `serif:id` ("Answer A") - the same trick as Illustrator's `data-name` and
  // Inkscape's `inkscape:label`. The artboard is drawn around 0,0 with viewBox="-960 -540 …".
  await mapCorpusFile(page, 'origin-shifted-quiz-board');
  expect(await labels(page)).toEqual(['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D']);
  await exportsClean(page);
});

test('corpus: text on an Inkscape path binds, labelled from its layer and not from a serial id', async ({ page }) => {
  // The run inside <textPath> is what binds (the <text> around it has no words of its own), and
  // Inkscape's generated `textPath6` is not a name - the labelled layer above it is.
  await mapCorpusFile(page, 'inkscape-text-on-path-bumper');
  expect(await labels(page)).toEqual(['Headline', 'Subtitle']);
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('CHAMPIONS');
  await expect(page.getByTestId('map-svg-font-warn-DejaVu Sans')).toBeVisible();
  await exportsClean(page);
});

test('corpus: a script and an internet reference are removed, said out loud, and the rest imports', async ({ page }) => {
  // Imported SVG is untrusted input entering previews and exports (plan §5). The file also has
  // two real text layers, and losing them along with the script would be its own failure.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fixture('effects-external-ref-and-script'));

  const card = page.getByTestId('import-svg-card');
  await expect(card).toContainText('Script code inside the SVG was removed');
  await expect(card).toContainText('References to files on the internet were removed');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  expect(await labels(page)).toEqual(['Kicker', 'Sponsor']);
  await exportsClean(page);
});

test('corpus: a compound PostScript weight resolves, and symbol text says why it cannot be a field', async ({ page }) => {
  // `Archivo-SemiBold` is the bundled Archivo at 600. Read word by word the suffix splits into
  // "semi" + "bold", "semi" is not a weight, and the whole name stopped reading as a face - so
  // the import warned "not available" about a family this project ships. Illustrator writes
  // SemiBold, ExtraBold and UltraLight exactly this way.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fixture('effects-symbol-library-ticker'));

  // A <use> paints a COPY of a symbol, so binding the original is a promise the import cannot
  // keep - and saying nothing would leave a designer hunting for a field that can never exist.
  await expect(page.getByTestId('import-svg-card')).toContainText('reusable symbol');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await expect(page.getByTestId('map-svg-font-ok-Archivo-SemiBold')).toBeVisible();
  await expect(page.locator('[data-testid^="map-svg-font-warn-"]')).toHaveCount(0);
  expect(await labels(page)).toEqual(['Story', 'Source']);
  await exportsClean(page);
});

test('corpus: a quiz board\'s hidden state layers are drawn, and never offered as fields', async ({ page }) => {
  // §5b tells the student to draw each moment on its own layer and click the eye off, so which
  // hiding IDIOMS are understood is load-bearing for the quiz. The corpus proved exactly one:
  // Illustrator's class="st12" beside a .st12{display:none} rule. Inkscape - the free tool a
  // school installs - writes style="display:none" on the layer itself instead, and this board
  // has two hidden layers carrying WORDS ("LOCKED IN", "+1") plus one switched off the other
  // way the same attribute allows, visibility:hidden. Miss either form and the operator gets
  // seven fields, two of which type into a stamp nobody can see.
  await mapCorpusFile(page, 'inkscape-hidden-state-layers-quiz');
  expect(await labels(page)).toEqual(['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D']);
  await exportsClean(page);
});

/** A 1×1 green pixel - any PNG that is NOT the one a fixture draws, so a swap is visible. */
const SWAPPED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * OPERATE the picture field: swap it, then clear it, and read the node update() writes to.
 *
 * BOTH exporters write the picture reference as SVG 1.1 `xlink:href`, and update()
 * (templates/shared/base.ts) remembers and rewrites the SVG 2 `href`. Measured over that
 * runtime verbatim, an unnormalized node half-works in the worst way: the swap paints (a
 * browser prefers `href`), and clearing the field restores `""` - so the promise the row makes,
 * "an empty swap field keeps the picture you drew", fails only on the second click. Which is
 * why the restore is asserted here rather than taken on trust from the swap.
 */
async function swapAndRestore(page: Page, field: string) {
  const frame = previewFrame(page);
  const drawn = await frame.locator(`image#${field}`).getAttribute('href');
  expect(drawn).toMatch(/^data:image\/png;base64,/);
  await frame.locator('body').evaluate((_, args) => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ [args.f]: args.v }));
  }, { f: field, v: SWAPPED_PNG });
  await expect(frame.locator(`image#${field}`)).toHaveAttribute('href', SWAPPED_PNG);
  await frame.locator('body').evaluate((_, f) => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ [f]: '' }));
  }, field);
  await expect(frame.locator(`image#${field}`)).toHaveAttribute('href', drawn!);
}

/** Tick the one picture row on. Pictures are offered OFF: inside a design a picture is usually
 *  the artwork itself, so making one swappable is a choice the author states. */
async function pickPicture(page: Page) {
  const row = page.getByTestId('map-svg-image-i0');
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  await row.locator('input[type=checkbox]').check();
}

/** Build the project from the mapping step, so the emitted template's field can be operated.
 *  Not `_create.ts`'s `createProject`, which builds a CATALOG design from a spec and never
 *  drives the wizard - a different job under a name that would read as the same one. */
async function createFromWizard(page: Page) {
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

test('corpus: a positioned embedded picture is a picture field an operator can swap', async ({ page }) => {
  test.slow(); // two walks through the door, an export and a project build
  // The A side of the finding-2 pair. Illustrator writes the plain positioned <image> the spec
  // describes; Figma writes the same design as a pattern-filled rect (the case below). Keeping
  // both says which half of the road a failure is in, rather than "pictures are broken".
  await mapCorpusFile(page, 'illustrator-embedded-image-card');
  expect(await labels(page)).toEqual(['Guest name', 'Guest role']);
  await expect(page.getByTestId('map-svg-images').locator('.map-svg-row')).toHaveCount(1);
  await pickPicture(page);
  await exportsClean(page);

  await mapCorpusFile(page, 'illustrator-embedded-image-card');
  await pickPicture(page);
  await createFromWizard(page);
  await swapAndRestore(page, 'f2');
});

test('corpus: a Figma-placed picture is a picture field, and an operator can swap it', async ({ page }) => {
  test.slow(); // two walks through the door, an export and a project build
  // SWEEP FINDING 2. Figma NEVER writes a positioned <image>: a placed raster is a
  // <rect fill="url(#pattern0)"> whose <pattern> <use>s an <image> parked in <defs>. Both of
  // those tags are non-rendered markup the importer rightly refuses to mine for layers, so the
  // picture road never opened for the shape the most popular drawing tool actually produces -
  // every picture a student places in Figma imported as unswappable artwork.
  //
  // The row is offered on the RECT (the layer the designer named and can point at), and the
  // field binds the <image> the pattern resolves to (the only node a swap can repaint). This
  // walks both halves, because either one alone looks like a fix and is not: a row bound to the
  // rect would swap nothing, and a row bound to the <image> would be labelled `image0_44_612`.
  await mapCorpusFile(page, 'figma-embedded-raster-card');
  expect(await labels(page)).toEqual(['Guest name', 'Guest role']);
  await expect(page.getByTestId('map-svg-images').locator('.map-svg-row')).toHaveCount(1);
  // The designer's own name for the square, which lives on the rect - the <image> in <defs>
  // is called `image0_44_612` and a row labelled that answers nobody's question.
  await expect(page.getByTestId('map-svg-image-title-i0')).toHaveValue('Guest photo');
  await pickPicture(page);
  await exportsClean(page);

  await mapCorpusFile(page, 'figma-embedded-raster-card');
  await pickPicture(page);
  await createFromWizard(page);

  const field = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields[2];
  });
  expect(field.ftype).toBe('filelist');
  expect(field.title).toBe('Guest photo');

  const frame = previewFrame(page);
  // The field id landed on the <image> in <defs>, and the pattern's <use> came WITH it - an id
  // renamed on its own would leave the rect painting nothing at all. The reference stays in the
  // spelling Figma wrote it in (`xlink:href`), because it is the designer's markup and it
  // resolves; only the picture node itself is normalized, and only because update() writes there.
  await expect(frame.locator('image#f2')).toHaveCount(1);
  await expect(frame.locator('pattern use')).toHaveAttribute('xlink:href', '#f2');
  await expect(frame.locator('rect[id="Guest photo"]')).toHaveAttribute('fill', /^url\(#pattern/);
  await swapAndRestore(page, 'f2');
});

test('corpus: a photo-filled backplate is offered as a picture AND as the panel that grows', async ({ page }) => {
  test.slow(); // a walk through the door, then a project build and an operated field
  // SWEEP FINDING 7, and the reason the marker contract now lets ONE element hold two candidate
  // roles. docs/SVG_AUTHORING.md makes this rectangle two separate promises - a picture filling
  // a shape you drew is a picture field, and a panel drawn as a rectangle is the one that grows
  // - and never says you have to choose. Picture candidates are tagged before the panel shapes,
  // so the moment the backplate became a picture (finding 2) it left the growth inventory, and
  // the only rectangle left to offer was the 10px accent tab that can never grow.
  await mapCorpusFile(page, 'figma-photo-strap-backplate');
  expect(await labels(page)).toEqual(['Guest name', 'Guest role']);
  await expect(page.getByTestId('map-svg-images').locator('.map-svg-row')).toHaveCount(1);
  await expect(page.getByTestId('map-svg-image-title-i0')).toHaveValue('Strap backplate');

  // BOTH ROLES, on the same marker. The measured default reads the strap as the banner it is,
  // and it is the SOLE grower - the accent tab holds no bound line, so the step states the
  // answer instead of asking. Read before the picture is ticked and again after, because the
  // marker is assigned at import: whether the author wants a swappable photo has never had
  // anything to do with whether the panel can widen.
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('grow-xy');
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Strap backplate');
  await pickPicture(page);
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('grow-xy');
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Strap backplate');
  await exportsClean(page);

  await mapCorpusFile(page, 'figma-photo-strap-backplate');
  await pickPicture(page);
  await createFromWizard(page);

  // The emitted graphic carries both roles on the two nodes each one needs: the growth stamp on
  // the RECT (the thing that widens), the field id on the <image> the pattern resolves to (the
  // only node a swap repaints). One marker named them both; the binding still splits them.
  const frame = previewFrame(page);
  await expect(frame.locator('rect[id="Strap backplate"]')).toHaveAttribute('data-noacg-el', /(^|\s)g0(\s|$)/);
  await expect(frame.locator('image#f2')).toHaveCount(1);
  await expect(frame.locator('pattern use')).toHaveAttribute('xlink:href', '#f2');
  await swapAndRestore(page, 'f2');
});

test('corpus: two exporter envelopes are stripped, said out loud, and the drawing survives', async ({ page }) => {
  // Both removals reach INSIDE the artwork rather than around it, which is what makes them
  // worth a gate: the SMIL elements are children of the circle and rect they animate and the
  // first child of the group holding everything, and the foreignObject is the first branch of
  // a <switch> whose SECOND branch is the whole drawing. Taking the artwork down with either
  // would be a silent loss.
  for (const [slug, says, fields] of [
    ['effects-smil-animated-bug', 'animation', ['Station', 'Strap']],
    ['illustrator-save-as-foreignobject', 'foreignObject', ['Name', 'Role']],
  ] as const) {
    await test.step(slug, async () => {
      await dropCorpusFile(page, slug);
      await expect(page.getByTestId('import-svg-card')).toContainText(says);
      await page.locator('.wz-next').click();
      await expect(page.getByTestId('map-svg-fields')).toBeVisible();
      expect(await labels(page)).toEqual([...fields]);
    });
  }
});

test('corpus: an internet reference hiding inside a <style> block is removed too', async ({ page }) => {
  // Every other external reference in the corpus is on an href, which an attribute scan sees.
  // A pasted @import and a url(https://) live in a declaration block instead, and an exported
  // graphic that fetches a stylesheet on air fails only on the playout machine and only when
  // the network is down - the worst possible place to find out.
  await dropCorpusFile(page, 'effects-css-import-webfont');
  await expect(page.getByTestId('import-svg-card')).toContainText('References to files on the internet were removed');
});

test('corpus: a file broken by one character is refused by a message that names the character', async ({ page }) => {
  // An SVG is XML, so a bare & from a pasted web address stops the document being readable.
  // The file really is unimportable and should stay refused; what is pinned here is the
  // SENTENCE. "Damaged, or not an SVG at all" points at the export and sends someone back to
  // re-make a file that was never the problem, when the parser already knows the line, the
  // column and the reason.
  await dropCorpusFile(page, 'geometry-unescaped-ampersand');
  const refusal = page.getByTestId('import-drop-error');
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('&');
  await expect(refusal).toContainText('line');
});

test('corpus: a print-unit page arrives at its real pixel size, in millimetres and in points', async ({ page }) => {
  // Inkscape defaults new documents to MILLIMETRES and every print-first tool (Affinity,
  // CorelDRAW) defaults to millimetres or points, so a full 1280 × 720 page states itself as
  // width="338.66666mm" or width="960pt" with a viewBox carrying that same number - the user
  // unit IS the physical one. Read as pixels those are 339 × 191 and 960 × 540, and a whole
  // design lands on the frame as a postage stamp with nothing saying so (sweep finding 3).
  // Both units, because a conversion that knows only about mm passes the first and fails the
  // second while looking exactly as fixed.
  for (const slug of ['inkscape-millimetre-scorebug', 'affinity-point-sized-nameplate']) {
    await test.step(slug, async () => {
      await dropCorpusFile(page, slug);
      const card = page.getByTestId('import-svg-card');
      await expect(card).toBeVisible();
      await expect(card.locator('.mono').first()).toHaveText('1280 × 720');
    });
  }
});

test('corpus: a percentage is not a size, and a print size on a big drawing does not rescale it', async ({ page }) => {
  // The two guards on the conversion above, and the reason it tests the viewBox against the
  // stated number rather than simply preferring width/height. A "responsive SVG" edit leaves
  // width="100%", which parses as the number 100 and means nothing - reading it would put every
  // field position out by a factor of nineteen while reporting a plausible size.
  await dropCorpusFile(page, 'geometry-percent-viewport-strap');
  await expect(page.getByTestId('import-svg-card').locator('.mono').first()).toHaveText('1920 × 1080');
});

// ── THE LADDER ANSWER EVERY CORPUS FILE ARRIVES ON ─────────────────────────────────────────
// Each sidecar states the too-long answer its designer should be offered, written from
// docs/SVG_AUTHORING.md rather than from the importer. That column had only the SWEEP reading
// it, which is an instrument nobody runs on a commit - so the day the measured default changed,
// twenty-two stated expectations could go stale in silence. This is the gate for it.
//
// It stops at the mapping step on purpose: the answer is a reading of the ARTWORK, and creating
// and exporting each file is what the cases above already do.
// Sweep finding 5 (docs/backlog/svg-import-sweep-findings.md): four files read as banners to the
// measured default and are not. The owner ruled that growing is the right default where the
// geometry is unambiguous and the author changes it in one click, so the finding stands open and
// these four are the repro rather than a pinned answer - the same rule this file's header states.
// The list was FOUR until this gate ran: `inkscape-flowed-text-card` and
// `student-illustrator-quiz` default to growing too, and nothing was reading the column, so the
// finding under-counted its own repros. Both are the same shape as the four it did name.
// It lost one on 2026-09-01. `figma-nested-frames-quiz-board` was named by the finding and had
// been left excluded on the chance the reading was taken against a different build; walked by
// hand it arrives on `shrink`, which is what its sidecar states, so it is an ordinary pinned row
// and an exclusion here was a row the gate silently did not check.
// It gained one on 2026-09-02 and lost it again the same evening.
// `illustrator-owner-quiz-board-rotated` is the owner's own board, and it was excluded while its
// sidecar said `grow-y` and the step proposed `grow-xy`. His fuller ruling closed the gap in the
// other direction - a graphic the audience sees again keeps a fixed box, so the board proposes
// `shrink` - and the file is back under the gate rather than beside it.
const GROWTH_FINDINGS = [
  'effects-figma-masked-reveal',
  'inkscape-flowed-text-card',
  'nested-svg-sub-artboard',
  'student-illustrator-quiz',
  'ticker-strip-3840',
];

test('corpus: every file arrives on the too-long answer and the picture count its sidecar states', async ({ page }) => {
  // ONE WALK THROUGH THE IMPORT DOOR PER ACCEPTED FILE, and the budget is said here rather than
  // taken from `test.slow()`. The cap column added on 2026-09-10 types a long value into every
  // sample box on every file and settles twice, which roughly doubled this walk: measured on CI
  // run 34502002518 it took 125 s against `test.slow()`'s 180, and the very next run on a slower
  // runner went past 180 and was killed. That is the false-deadline shape playwright.config.ts
  // warns about - a budget through the middle of the work rather than above it - and a test whose
  // whole job is sweeping 46 files should not be one contended runner away from red.
  test.setTimeout(6 * 60_000);
  const dir = fileURLToPath(new URL('fixtures/svg-corpus/', import.meta.url));
  // Every file that REACHES the mapping step is walked, and each COLUMN then decides for itself
  // whether it applies. The two used to share one filter, so the growth column's exclusions
  // silently took the picture column with them - the same "a column nobody reads goes stale"
  // failure one level up. What stays a walk filter is only what makes the step unreachable: a
  // file with no bound text (an ALL-OUTLINED export lands on the honest re-export answer, not
  // the checklist) and a file the door refuses. Those two are the corpus's only blind spots for
  // the picture column, and neither can carry a picture row to read.
  const sidecars = readdirSync(dir)
    .filter((f) => f.endsWith('.expect.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      name: string;
      expect: {
        accepted: boolean;
        textFields: number;
        imageFields?: number;
        growth?: string | null;
        growthShape?: string;
      };
    })
    .filter((s) => s.expect.accepted && s.expect.textFields > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(sidecars.length).toBeGreaterThan(12);

  const wrong: string[] = [];
  for (const s of sidecars) {
    // One step per file, so a walk that dies names the file it died on rather than a line in a
    // shared helper.
    await test.step(s.name, async () => {
      await mapCorpusFile(page, s.name);
      if (s.expect.growth && !GROWTH_FINDINGS.includes(s.name)) {
        const got = await page.getByTestId('map-svg-stretch-mode').inputValue();
        if (got !== s.expect.growth) wrong.push(`${s.name}: stated ${s.expect.growth}, got ${got}`);
      }
      // WHICH SHAPE, where the sidecar names one (sweep finding 7). Its OWN column, at the same
      // level as the ladder rather than inside it: the two answer different questions - the
      // ladder answer cannot tell a panel that grows from a hairline that cannot, since both read
      // `grow-x` on the control while only one does anything - and nesting it would mean a
      // fixture on the findings list, or one stating a shape and no ladder answer, passing green
      // with this never executed. That is the exact false-green the column was added to close.
      // Read wherever the step names the shape: a sole grower is stated in a sentence, a choice
      // is the picker's selected option.
      if (s.expect.growthShape) {
        const only = page.getByTestId('map-svg-stretch-only');
        const picker = page.getByTestId('map-svg-stretch-shape');
        let named = '(growth is off, so the step names no shape)';
        if (await only.count()) named = (await only.textContent()) ?? '';
        else if (await picker.count()) named = (await picker.locator('option:checked').textContent()) ?? '';
        if (!named.includes(s.expect.growthShape)) {
          wrong.push(`${s.name}: stated "${s.expect.growthShape}" grows, step names "${named}"`);
        }
      }
      // The PICTURE column, read on the same walk so it costs nothing. It went stale in exactly
      // the way this loop exists to prevent - two sidecars stated a picture row and only the
      // sweep read them, so sweep finding 2 (Figma's pattern-filled raster) sat unpinned. It
      // guards both directions: a picture that stops being offered, and a shape wrongly offered
      // as one - a gradient fill is also `url(#…)`, and half this corpus carries one.
      const pictures = await page.getByTestId('map-svg-images').locator('.map-svg-row').count();
      const wanted = s.expect.imageFields ?? 0;
      if (pictures !== wanted) wrong.push(`${s.name}: stated ${wanted} picture rows, got ${pictures}`);
      // The CAP column, read last on the same walk because it is the only one that changes the
      // step's own answers - see `overgrown` for what it asks and why it had to be swept.
      for (const said of await overgrown(page, s.name)) wrong.push(said);
    });
  }
  expect(wrong).toEqual([]);
});

// ── NOTHING OUTGROWS THE SCREEN ────────────────────────────────────────────────────────────
// The owner's limit on growth, in his words (2026-08-26): "we cannot have templates outgrow the
// screen", and on the vertical half (2026-09-03): "we shouldn't be able to put one page of text".
// `svgGrowCap` is the mechanism - it mirrors the margin the design keeps on the side the panel is
// anchored to onto the side it grows towards, floored by the table's own safe margin - so a wrong
// value is unreachable rather than warned about.
//
// NOTHING GATED IT UNTIL 2026-09-10, and it was broken. Growth is decided in screen px and spent
// by writing user units, and the one helper that converts between the two read every panel as a
// PLACED line and converted at 1 (svg.ts `svgFitPlaced`). On a 1920x1080 artwork the frame scale
// IS 1, which is every fixture the ladder sweep below walks and every graphic anyone had looked
// at - so the defect was invisible in exactly the place people look. Measured on
// `inkscape-millimetre-scorebug`, whose user units are millimetres: the plate grew to 1700 px
// inside a 720 px frame and stood 1040 px below its bottom edge. The 3840-wide ticker had the
// same bug the other way and grew half as far as it was granted.
//
// So the cap is swept over the WHOLE corpus rather than pinned on one file: what makes a fixture
// able to catch this is its unit system, which is not something the reader of a growth change can
// be expected to know to go looking for. Every field gets a long value, because one long field on
// its own stayed inside the frame on that scorebug and four together did not - a panel's growth
// is one pot the blocks inside it share (svgOfferHeights), so the cap is only actually reached
// when they all ask.

/** How far each growth-ruled panel hangs outside the frame, per edge, in screen px. Read once at
 *  rest and once grown, because the law is about what GROWTH did: a shape drawn overhanging an
 *  edge it never grows towards - a full-bleed band, a filtered shape whose rect spills - is the
 *  artwork, and reporting it as a cap failure would send the next reader to the wrong code. */
async function overhang(page: Page): Promise<Record<string, Record<string, number>>> {
  return readArt(page.frameLocator('.wz-side iframe'), (art) => {
    const w = window as unknown as { NOACG_LAYOUT?: { rules: { el: string }[] } };
    const frame = art.getBoundingClientRect();
    const out: Record<string, Record<string, number>> = {};
    for (const rule of w.NOACG_LAYOUT?.rules ?? []) {
      const el = art.querySelector(`[data-noacg-el~="${rule.el}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out[rule.el] = {
        'past the left': frame.left - r.left,
        'past the right': r.right - frame.right,
        'above the top': frame.top - r.top,
        'below the bottom': r.bottom - frame.bottom,
      };
    }
    return out;
  }, null);
}

/** Every long value the step will take, then every growth-ruled panel that GREW past the frame.
 *  Empty is the pass. */
async function overgrown(page: Page, slug: string): Promise<string[]> {
  const mode = page.getByTestId('map-svg-stretch-mode');
  if (!(await mode.count())) return []; // a graphic with no growth control has no cap to keep
  const samples = page.locator('[data-testid^="map-svg-sample-"]');
  const n = await samples.count();
  if (n === 0) return []; // nothing to type, so nothing can ask the panel to grow
  await mode.selectOption('grow-xy');
  const rest = await overhang(page);
  // A DISTINCT VALUE PER FIELD, so the wait can prove the LAST fill landed. Filling every box
  // with one string leaves `awaitPainted` satisfied by the first field's document, and a rebuild
  // landing mid-loop would then be measured with only some of the fields long - which is not the
  // case the cap is reached in, so the gate would pass without exercising itself.
  const value = (i: number) => `${LADDER_VALUES.absurd} (${i + 1})`;
  for (let i = 0; i < n; i++) await samples.nth(i).fill(value(i));
  await awaitPainted(page, value(n - 1));
  const grown = await overhang(page);
  const said: string[] = [];
  for (const [token, edges] of Object.entries(grown)) {
    // TWO CONDITIONS, and both are needed. Outside the frame at all - a pixel of slack, because a
    // panel drawn flush to an edge measures a rounding tick outside it - AND further outside than
    // the drawing put it, so an overhang the designer drew is not read as growth spending it.
    const past = Object.entries(edges)
      .filter(([edge, px]) => px > 1 && px > (rest[token]?.[edge] ?? 0) + 1)
      .map(([edge, px]) => `${Math.round(px)}px ${edge}`);
    if (past.length) said.push(`${slug}: ${token} grew to stand ${past.join(' and ')}`);
  }
  return said;
}

// ── THE FIT LADDER, SWEPT ──────────────────────────────────────────────────────────────────
// The owner has found the same bug family three times, on three files, each time by typing into
// one field for a few minutes on a graphic with a green build and a passing corpus gate
// (docs/acceptance/owner-queue/2026-09-02-text-knows-its-box.md). The gate above walks each file
// ONCE, at the drawn length, on the default option - and none of what he found is visible there.
//
// So this sweeps the small finite space instead: his own board x four ladder options x six value
// lengths, asserting the ORDER of the ladder rather than a table of expected numbers
// (docs/backlog/fit-ladder-exhaustive-sweep.md). A case fails when a RUNG WAS SKIPPED, which is
// checkable without taste: the text is inside its box, it wrapped before it shrank, the offer it
// was given came from the design rather than from whatever value arrived before it, and a panel
// told to get wider got wider.
//
// His acceptance test, in his words (2026-09-03): "it should fill the graphic in the box it
// lives on, wrap the new lines if there's room in the box, and keep the text centered so it
// looks like it's aligned with everything else."

const OWNER_BOARD = 'illustrator-owner-quiz-board-rotated';

/** The values and the options are `scripts/ladder-values.mjs`, shared with the instrument
 *  (`svg-import-sweep.mjs --ladder`) so the gate and the sweep can never cover different ground.
 *  What each of them ASSERTS stays its own: this pins the answers THIS board is known to give, at
 *  tolerances measured on it; the sweep asserts what has to hold for any artwork. */


interface LadderReading {
  lines: number;
  size: number;
  drawn: number;
  blockW: number;
  blockH: number;
  roomW: number;
  roomH: number;
  /** How far the painted block's centre sits from the plate's, in the plate's own frame. */
  offX: number;
  offY: number;
  /** What the growth rules offered this line - the quantity that must not depend on history. */
  extraW: number;
  extraH: number;
  /** The named plate's own painted size, which is what "gets wider" has to mean. */
  panelW: number;
  panelH: number;
  /** The four answer plates, left and top in screen px - the rest of the board. */
  others: number[];
  over: boolean;
}

/** Everything one pass of the ladder decided, read out of the composed document.
 *
 *  The block and the plate are measured through `getBBox`, in the plate's own drawn frame. This
 *  board is tilted on purpose ("my design here is wonky on purpose to see how we manage it"), so
 *  a screen rectangle is bigger than the plate and "centred on the plate" is not a question
 *  screen coordinates can answer. getBBox also ignores transforms, so a reading cannot be spoiled
 *  by an entrance still in flight. The plate's PAINTED size is the one thing that does belong in
 *  screen px: "wider" is a promise about what the reader sees, and this plate's own width
 *  attribute runs down the painted band rather than across it. */
async function readLadder(frame: FrameLocator): Promise<LadderReading> {
  return readArt(frame, (art) => {
    const w = window as unknown as Record<string, Record<string, number>>;
    const q = art.querySelector('#f0') as SVGGraphicsElement;
    const panel = art.querySelector('#q_bg') as SVGGraphicsElement;
    const bb = q.getBBox();
    const pr = panel.getBoundingClientRect();
    const room = w.svgFitRoom?.f0 as unknown as { width: number; height: number } | undefined;
    // THE PLATE IN THE TEXT'S OWN FRAME. Both carry their own rotation, so their two getBBox
    // answers live in different spaces and subtracting them measures nothing. The runtime maps
    // one into the other for exactly this reason, and the gate asks the same question the same
    // way (`svgLocalBox`, templates/importedDesign/svg.ts).
    const local = (
      w.svgLocalBox as unknown as (
        p: Element,
        t: Element,
      ) => { cx: number; cy: number } | null
    )(panel, q);
    return {
      // THE LINES THE LADDER PAINTED, not every tspan in the node: a kerned headline arrives with
      // its own per-glyph runs, and counting those reads as "already wrapped" and quietly
      // disarms the rung-order check below. `data-noacg-line` is what svgPaintLines marks.
      lines: q.querySelectorAll('tspan[data-noacg-line]').length || 1,
      size: parseFloat(getComputedStyle(q as unknown as Element).fontSize),
      drawn: w.svgFitSizes?.f0 ?? 0,
      blockW: bb.width,
      blockH: bb.height,
      roomW: room?.width ?? 0,
      roomH: room?.height ?? 0,
      offX: local ? bb.x + bb.width / 2 - local.cx : NaN,
      offY: local ? bb.y + bb.height / 2 - local.cy : NaN,
      extraW: w.svgFitExtra?.f0 ?? 0,
      extraH: w.svgFitExtraH?.f0 ?? 0,
      panelW: pr.width,
      panelH: pr.height,
      others: ['a1_bg', 'a2_bg', 'a3_bg', 'a4_bg'].flatMap((id) => {
        const r = art.querySelector('#' + id)?.getBoundingClientRect();
        return r ? [r.left, r.top, r.width, r.height] : [];
      }),
      over: !!w.svgFitOver?.f0,
    };
  }, null);
}

/** Type a question into the mapping step's own Text box and wait for the wizard to be showing it.
 *
 *  The WIZARD is the surface he walked all three times, and it builds its document by a different
 *  path than the editor - so it needs its own measurement rather than inheriting the editor's.
 *
 *  The wait leads with what the document is PAINTING rather than with the stage's rebuild stamps,
 *  for the two reasons written out at the top of this file: the stamps are only a handful of
 *  milliseconds ahead of the assertion that reads them, and at the rung where the field already
 *  holds this value there is no rebuild to stamp at all. `awaitPainted` still waits the stamps
 *  out afterwards - by then they say something, because the document they describe is known. */
async function typeQuestion(page: Page, candidateId: string, value: string) {
  await page.getByTestId(`map-svg-sample-${candidateId}`).fill(value);
  await awaitPainted(page, value);
}

/** The candidate id of the layer the designer named "question". */
const questionRow = (page: Page) => rowLabelled(page, /question/i);

test('corpus: the fit ladder spends its rungs in order, on every option and every length', async ({
  page,
}) => {
  test.slow();
  await mapCorpusFile(page, OWNER_BOARD);
  const qId = await questionRow(page);
  const frame = page.frameLocator('.wz-side iframe');
  const wrong: string[] = [];

  for (const mode of LADDER_MODES) {
    await page.getByTestId('map-svg-stretch-mode').selectOption(mode);
    // The design's own answer under this option, taken on a value that fits - the datum every
    // longer one is judged against.
    await typeQuestion(page, qId, LADDER_VALUES.short);
    const rest = await readLadder(frame);

    for (const [name, value] of Object.entries(LADDER_VALUES)) {
      await test.step(`${mode} / ${name}`, async () => {
        await typeQuestion(page, qId, value);
        const r = await readLadder(frame);
        const at = `${mode}/${name}`;

        // 1. SHRINK IS THE LAST RUNG (owner, 2026-08-26, re-ruled 2026-09-03). A value that
        //    could still take another line may not be smaller than the designer drew it, and a
        //    value with a break opportunity may not be shrunk without wrapping once.
        //
        //    "Could take another line" needs a break opportunity as well as the height: a single
        //    unbroken run has nowhere to break, so shrink IS its second rung and the ladder is
        //    in order. That is the difference the owner met as randomness - "I make spaces in a
        //    word, and it sometimes understands that it should be big".
        const breakable = /\s/.test(value);
        const roomForAnother = breakable && r.blockH + r.size * 1.2 <= r.roomH + 0.5;
        const shrank = r.size < r.drawn - 0.01;
        if (shrank && roomForAnother) {
          wrong.push(`${at}: shrank to ${r.size} of ${r.drawn} with room for another line`);
        }
        if (shrank && breakable && r.lines === 1) {
          wrong.push(`${at}: shrank to ${r.size} of ${r.drawn} without wrapping once`);
        }

        // 2. THE TEXT STAYS IN THE BOX IT WAS DRAWN IN, both ways - the half of his sentence
        //    that says "in the box it lives on". Sideways the box is the room the DESIGN gave it
        //    plus whatever a growth rule then bought, which is the same sum the runtime spends.
        //    Both bounds are the room the DESIGN gave plus whatever a growth rule then offered,
        //    which is the same sum the runtime spends on each axis - a height bound written
        //    without the offer would fail a block that legitimately wrapped into a panel told to
        //    get taller.
        const budget = r.roomW + r.extraW;
        const ceiling = r.roomH + r.extraH;
        if (r.blockW > budget + 1) wrong.push(`${at}: block ${r.blockW} wider than budget ${budget}`);
        if (r.blockH > ceiling + 1) wrong.push(`${at}: block ${r.blockH} taller than ceiling ${ceiling}`);

        // 3. A CENTRED BLOCK STAYS CENTRED AS IT GAINS LINES - it grows from the middle, which
        //    is the last clause of his sentence. A unit of tolerance, the snap's own floor.
        if (Math.abs(r.offX) > 1) wrong.push(`${at}: block ${r.offX.toFixed(1)} off the plate centre across`);
        if (Math.abs(r.offY) > 1) wrong.push(`${at}: block ${r.offY.toFixed(1)} off the plate centre down`);

        // 4. WHAT A RULE OFFERS IS A FUNCTION OF THE DESIGN, NEVER OF HISTORY. The offer is
        //    measured on the artwork at rest, so it cannot depend on which value happened to be
        //    standing in the node when the pass began. This is the whole of "sometimes it works
        //    and goes to the next line" (owner, 2026-09-03): the height offer collapsed to zero
        //    on every pass that began with an already-wrapped block, and the wrap rung then had
        //    nowhere to go.
        if (Math.abs(r.extraH - rest.extraH) > 0.5) {
          wrong.push(`${at}: height offer moved to ${r.extraH} (the design offers ${rest.extraH})`);
        }

        // 5. "THE PANEL GETS WIDER" VISIBLY WIDENS THE NAMED SHAPE (owner, 2026-09-03: "Nothing
        //    seems to get wider ... it doesn't do it"). Only where the value is genuinely too
        //    wide for the room the design already gives it: growth is spent after the design's
        //    own space, never before it. And it gets WIDER, not taller - this board's plates are
        //    portrait rects plus a rotation, so growing the rect's own width attribute grows the
        //    painted band downwards, which is not what the control says.
        if ((mode === 'grow-x' || mode === 'grow-xy') && (name === 'over3' || name === 'absurd')) {
          const wider = r.panelW - rest.panelW;
          const taller = r.panelH - rest.panelH;
          if (wider <= 1) wrong.push(`${at}: the plate stayed ${Math.round(r.panelW)} px wide`);
          // WIDER, NOT TALLER. A bound rather than an equality, because this plate is drawn on a
          // tilt: a band 1.3 degrees off level that gets 114 px longer necessarily gains a couple
          // of px of screen height, and that is the artwork, not the growth. The defect this
          // catches spent the whole grant on height (measured 2026-09-03: +100 px taller, +2
          // wider), so a fifth is a wide bound that still fails it outright.
          if (taller > Math.max(1, Math.abs(wider) * 0.2)) {
            wrong.push(`${at}: the plate got ${Math.round(taller)} px taller for ${Math.round(wider)} px wider`);
          }
        }

        // 6. AND THE FOUR ANSWERS DO NOT MOVE, at any question length or option. His own claim 3
        //    from 2026-09-02, and the guard on the layers a growing panel is allowed to take with
        //    it: the answer plates sit below the question's plate rather than past either of its
        //    edges, so nothing about the question may reach them. A panel that widens from its
        //    middle moves things on BOTH sides of it, which is twice the chance of moving one
        //    that should have stayed.
        const moved = r.others.findIndex((v, i) => Math.abs(v - rest.others[i]) > 1);
        if (moved >= 0) {
          wrong.push(`${at}: answer plate ${Math.floor(moved / 4) + 1} moved or resized`);
        }
      });
    }
  }
  expect(wrong).toEqual([]);
});

// ── WIDER, THEN TALLER - ONE PANEL, BOTH AXES ──────────────────────────────────────────────
// The second rung of the ladder, on the file the owner found it missing on. Walking
// `effects-gradient-shadow-lower-third.svg` on 2026-09-03 he found the plate widens and the text
// wraps and then the plate does NOT get taller, so the second line prints over the row beneath
// it (docs/backlog/growth-rule-geometry-and-purpose.md):
//
//   > we need to ensure that all our shapes can grow when we want them to grow vertically as well
//
// Nothing gated it. The ladder sweep above runs all four options on the owner's QUIZ BOARD, whose
// question plate has 216 units of room and never needs a single unit of the height it is offered -
// so grow-xy and grow-x give it identical answers at every length, and assertion 5 there actively
// requires the plate NOT to get taller. The rung that had been broken twice was therefore measured
// nowhere, on any file.
//
// This is that measurement, and it is deliberately RELATIONAL rather than a table of numbers, for
// the reason the sweep above gives: what has to hold is the order of the rungs. The panel spends
// its width first; when width alone will not do it, the block wraps AT THE SIZE THE DESIGNER DREW
// and the panel gets taller by what the settled block took, keeping the drawn gap to the line
// underneath. Shrinking is what must not happen here, because both of the rungs above it can still
// pay.
test('corpus: a panel told to get wider AND taller spends both, at the drawn size', async ({
  page,
}) => {
  test.slow();
  await mapCorpusFile(page, 'effects-gradient-shadow-lower-third');
  const nameId = await rowLabelled(page, /name/i);
  const frame = page.frameLocator('.wz-side iframe');
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-xy');

  /** The plate, the name's painted block and the row drawn under it, in screen px. */
  const read = () =>
    readArt(frame, (art) => {
      const name = art.querySelector('#f0') as SVGGraphicsElement;
      const plate = art.querySelector('[data-noacg-el~="g0"]') as SVGGraphicsElement;
      const role = art.querySelector('#f1') as SVGGraphicsElement;
      return {
        plate: plate.getBoundingClientRect().toJSON(),
        block: name.getBoundingClientRect().toJSON(),
        roleTop: role.getBoundingClientRect().top,
        lines: name.querySelectorAll('tspan[data-noacg-line]').length || 1,
        size: parseFloat(getComputedStyle(name as unknown as Element).fontSize),
        drawn: (window as unknown as { svgFitSizes: Record<string, number> }).svgFitSizes.f0,
      };
    }, null);

  // The length the designer drew, which is the datum every claim below is made against.
  await page.getByTestId(`map-svg-sample-${nameId}`).fill('Alexandra Riva');
  await awaitPainted(page, 'Alexandra Riva');
  const rest = await read();
  expect(rest.lines, 'the drawn name is one line').toBe(1);
  // The drawn size is ASSERTED, not merely read: every shrink claim below compares against it,
  // and comparing against an unmeasured NaN is false for any size at all - so a missing datum
  // would turn the one rung that must not fire into an assertion that cannot.
  expect(rest.drawn, 'the drawn type size was measured').toBeGreaterThan(0);

  // A name too long for the plate's width AND for one line of the width it may grow to.
  await page.getByTestId(`map-svg-sample-${nameId}`).fill(LADDER_VALUES.over3);
  await awaitPainted(page, LADDER_VALUES.over3);
  const grown = await read();

  const said: string[] = [];
  if (grown.plate.width <= rest.plate.width + 1) {
    said.push(`the plate stayed ${Math.round(grown.plate.width)} px wide`);
  }
  if (grown.plate.height <= rest.plate.height + 1) {
    said.push(`the plate stayed ${Math.round(grown.plate.height)} px tall`);
  }
  if (grown.lines < 2) said.push('the name never wrapped');
  if (grown.size < grown.drawn - 0.01) {
    said.push(`the name shrank to ${grown.size} of ${grown.drawn} while both rungs could still pay`);
  }
  // The half the owner actually SAW go wrong: the wrapped block printing over the role under it.
  if (grown.block.bottom > grown.roleTop + 1) {
    said.push(`the name runs ${Math.round(grown.block.bottom - grown.roleTop)} px into the role`);
  }
  expect(said, 'the wider-then-taller ladder did not spend both rungs').toEqual([]);
});

// ── AN EXPLICIT text-anchor IS INFORMATION, NOT AN OPT-OUT ──────────────────────────────────
// Eight of the corpus files state one, and until 2026-09-04 a file that did got none of the
// SIDEWAYS alignment work: the anchor, the room measured from the box and the growth from the
// middle were all gated on having DERIVED the alignment, so stating it opted the file out of all
// three (the vertical snap ran either way). Every centre-aligned Figma export is that case, which
// is how a title card is always built - so a student exporting the most ordinary thing there is
// got the least of the feature.
//
// The anchor and the PLACEMENT are two facts, and a file can state one while drawing the other.
// Both fixtures below state `middle`; one is drawn on its plate's midline and one is drawn 260
// units left of it because the right of the plate is deliberately empty. The rule is the same for
// both: believe the anchor, read the placement off the drawing, and never move what was placed.

/** What the runtime decided about one bound line, read out of the composed document: the
 *  alignment, the room it was given, and where the painted block sits in its box. In the BOX'S
 *  OWN frame (`svgLocalBox`), for the same reason the ladder sweep above measures there. */
/**
 * THE PLATE EACH LINE WAS DRAWN IN, resolved ONCE while the line still holds its drawn value.
 *
 * `svgFitContainer` answers by CONTAINMENT, so asked about a block that has already outgrown its
 * plate it answers "nothing holds this" - correct, and useless as a way to keep watching the
 * plate. Since the squeeze gained a legibility floor (2026-09-05, owner: readable beats contained)
 * a value at the top of the ladder genuinely does stand wider than its plate, so a helper that
 * re-derives the container each time starts returning NaN at exactly the lengths these tests exist
 * to measure. Remembered per field id, cleared by `mapCorpusFile`.
 */
const platesAtRest = new Map<string, number>();

async function rememberPlate(frame: FrameLocator, id: string): Promise<void> {
  const idx = await readArt(frame, (art, fieldId: string) => {
    const w = window as unknown as Record<string, Record<string, unknown>>;
    const el = art.querySelector(`#${fieldId}`) as SVGGraphicsElement;
    const panel = (w.svgFitContainer as unknown as (e: Element) => Element | null)(el);
    return [...art.querySelectorAll('rect, path, polygon, ellipse, circle')].indexOf(panel as Element);
  }, id);
  if (idx >= 0) platesAtRest.set(id, idx);
}

async function readAlign(frame: FrameLocator, id: string) {
  const remembered = platesAtRest.get(id);
  return readArt(frame, (art, [fieldId, atRest]: [string, number]) => {
    const w = window as unknown as Record<string, Record<string, unknown>>;
    const el = art.querySelector(`#${fieldId}`) as SVGGraphicsElement;
    const shapes = [...art.querySelectorAll('rect, path, polygon, ellipse, circle')];
    const panel =
      atRest >= 0
        ? shapes[atRest]
        : (w.svgFitContainer as unknown as (e: Element) => Element | null)(el);
    const box = (
      w.svgLocalBox as unknown as (
        p: Element,
        t: Element,
      ) => { left: number; right: number; cx: number } | null
    )(panel as Element, el);
    const align = (w.svgFitAlign?.[fieldId] ?? {}) as { h?: string; width?: number };
    const room = (w.svgFitRoom?.[fieldId] ?? {}) as { width?: number };
    const bb = el.getBBox();
    const width = box ? box.right - box.left : 0;
    const off = box ? bb.x + bb.width / 2 - box.cx : NaN;
    return {
      h: align.h ?? null,
      alignWidth: align.width ?? 0,
      roomWidth: room.width ?? 0,
      boxWidth: width,
      // How far the painted block's centre sits from the box's, and how far it hangs out of it.
      offX: off,
      spill: box ? Math.abs(off) + bb.width / 2 - width / 2 : NaN,
    };
  }, [id, remembered ?? -1] as [string, number]);
}

test('corpus: a stated text-anchor gets the alignment work rather than opting the file out', async ({
  page,
}) => {
  // Figma's centred title card: stated `middle`, drawn ON the plate's midline, so the anchor and
  // the drawing agree and the line is treated exactly as a derived one would be.
  await mapCorpusFile(page, 'figma-centred-title-card');
  const titleRow = await rowLabelled(page, /title/i);
  const frame = page.frameLocator('.wz-side iframe');
  await typeQuestion(page, titleRow, 'The Long Winter');

  await rememberPlate(frame, 'f1');
  const rest = await readAlign(frame, 'f1');
  expect(rest.h).toBe('middle');
  // THE ROOM IS THE BOX'S OWN INSIDE. Zero here was the opt-out: with no `align.width` the line
  // measured its room as the run from where it was drawn out to the plate's far margin, which is
  // the answer for a line that fills one way and the wrong one for a line that fills both.
  expect(rest.alignWidth).toBeGreaterThan(0);
  expect(Math.abs(rest.offX)).toBeLessThan(1);

  // And it STAYS on the midline as the value grows, at every length - the half of the owner's
  // sentence that says "keep the text centered so it looks like it's aligned with everything
  // else". A block that wrapped and one that shrank are both still centred.
  for (const value of [LADDER_VALUES.over1, LADDER_VALUES.over3, LADDER_VALUES.unbroken]) {
    await typeQuestion(page, titleRow, value);
    const now = await readAlign(frame, 'f1');
    expect(Math.abs(now.offX), `centred title at "${value.slice(0, 24)}"`).toBeLessThan(1.5);
    // AND IT STAYS INSIDE THE PLATE. This used to read `< rest.spill + 1`, which is not the
    // sentence above it: `rest` is the SHORT drawn title, so that compared every longer value
    // against the width of the designer's own words and failed a block that was still comfortably
    // inside the plate. It passed only because a centred line was handed its own drawn width as
    // its room, so it pinned that defect rather than this property (fixed 2026-09-05). Zero is
    // the plate's own edge; the ladder's floor and squeeze are what keep it there.
    expect(now.spill, 'the block spills out of its plate').toBeLessThan(0);
  }
});

test('corpus: a plate turned on its LAYER measures a screen pixel the same as one turned on itself', async ({
  page,
}) => {
  // Every other rotated file in the corpus carries its rotation on the SHAPE, which is what
  // Illustrator writes - so `ctm.a`, the matrix entry the runtime read its scale from, never saw
  // a rotation and the whole corpus agreed with the code by accident. Inkscape and Figma write
  // the rotation one level up, on the layer or frame group, which is exactly the frame that
  // entry describes: at 89.5 degrees it reports 0.0087 screen pixels per drawn unit instead of 1.
  //
  // Measured on this file before the fix: one line was handed 123,760 units of room inside a
  // plate 1,240 units wide. A budget nothing can overflow is the worst answer of the lot - the
  // ladder never wraps and never shrinks, and the words run out of the plate and off the frame.
  await mapCorpusFile(page, 'inkscape-layer-rotated-quiz-plate');
  const frame = page.frameLocator('.wz-side iframe');
  const row = await rowLabelled(page, /question/i);
  await typeQuestion(page, row, 'Mika on Suomen korkein tunturi?');

  const room = await readArt(frame, () => {
    const w = window as unknown as Record<string, Record<string, { width: number }>>;
    const plate = (
      w.svgLayoutEl as unknown as (t: string) => SVGGraphicsElement | null
    )('g0');
    return {
      roomW: w.svgFitRoom?.f0?.width ?? 0,
      plateW: plate ? plate.getBoundingClientRect().width : 0,
    };
  }, null);
  // The room a line is offered can never be a multiple of the plate it is drawn in. Asked as a
  // ratio rather than as a number, because the number is the artwork's and this is about the
  // frame it was read in.
  expect(room.plateW).toBeGreaterThan(1000);
  expect(room.roomW).toBeLessThan(room.plateW * 1.1);

  // And the words stay on the frame at a value long enough to have run off it.
  await typeQuestion(page, row, LADDER_VALUES.absurd);
  const off = await readArt(frame, (art) => {
    const f = art.getBoundingClientRect();
    return [...art.querySelectorAll('text, rect')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < f.left - 1 || r.right > f.right + 1);
    }).length;
  }, null);
  expect(off, 'shapes painted off the frame').toBe(0);
  await exportsClean(page);
});

test("corpus: a centre-anchored line drawn off its box's middle is left where it was drawn", async ({
  page,
}) => {
  // The endboard: both lines state `middle` and are composed 260 units LEFT of the plate's own
  // midline, because the right third of the plate is empty on purpose. Two ways to get this
  // wrong, and both are invisible at the length the designer drew: snapping the line onto the
  // plate's middle (inventing a centring nobody drew), or reading its room as the run to the far
  // margin, after which a long value paints off the plate's LEFT edge - centred text spends half
  // of every extra unit on its other side.
  await mapCorpusFile(page, 'figma-offset-centred-endboard');
  const signOff = await rowLabelled(page, /sign off/i);
  const frame = page.frameLocator('.wz-side iframe');
  await typeQuestion(page, signOff, 'Kiitos katsomisesta');

  await rememberPlate(frame, 'f0');
  const rest = await readAlign(frame, 'f0');
  expect(rest.h).toBe('middle');
  // Drawn well off the middle, and left there: the composition is the design.
  expect(Math.abs(rest.offX)).toBeGreaterThan(200);
  // HOW MUCH room it gets was the open call this test refused to pin: the margin rule gave a
  // centred line back exactly the width it already occupied, so rung 1 never fired for centred
  // text (2026-09-04-a-stated-anchor-is-not-an-opt-out.md, call 2 - which named it as the
  // likeliest thing behind "when I add a longer text it gets smaller"). The owner answered it on
  // 2026-09-03 walking his vote board: *"it doesn't fill the whole shape. It could."* A centred
  // line now gets its box down to a typographic margin (svg.ts, svgAlignOf), and the number is
  // pinned by import-svg.spec.ts. What stays pinned HERE is what this file is for: an OFF-CENTRE
  // composition is not moved onto the middle, and the block does not paint off the plate - which
  // is by construction, since the room is twice the SHORTER run from the anchor.

  for (const value of [LADDER_VALUES.over1, LADDER_VALUES.over3]) {
    await typeQuestion(page, signOff, value);
    const now = await readAlign(frame, 'f0');
    expect(Math.abs(now.offX - rest.offX), 'the line slid across its plate').toBeLessThan(1.5);
    expect(now.spill, 'the block paints off the plate').toBeLessThan(0);
  }
  await exportsClean(page);
});

// ── THE FIT MAY NOT DEPEND ON WHEN THE DESIGN WAS FIRST LAID OUT ────────────────────────────
//
// The owner walked his own quiz board on production (2026-09-04) and found the same text in the
// same graphic rendering correctly or incorrectly depending on what had been toggled beforehand:
// "when I removed the text and tried adding it again, it bugged out again, so the text became
// small ... after switching around a few times from nothing to a quiz table, it got it right
// again." An output that depends on the order of unrelated interactions is not a layout bug, so
// no amount of walking the ladder harder was ever going to find it.
//
// It is a MEASUREMENT THAT WAS CACHED BEFORE IT COULD BE TAKEN. Every number the ladder uses is
// read off the laid-out design, and the design is not always laid out when the document runs: a
// playout renderer preloads its templates before anything is on air, a control page keeps its
// monitors in a display:none column while the operator is on another workspace, and a drawn
// state is display:none from the first frame until its state fires. Each of those measured zero,
// recorded the zero as the answer, and could never re-measure - so the line was skipped for the
// life of the graphic and painted at its drawn size, on one line, across the artwork.
//
// WHY EVERY EXISTING GATE WAS GREEN THROUGH ALL OF IT: they build their document on a surface
// that is on screen, so none of them ever asked what the ladder answers for a graphic that
// loaded out of sight. This mounts the SAME document twice - one visible, one blind - and
// asserts the two agree.

/** Mount one composed document twice and read the fit out of each: once in a container that is
 *  on screen from the start, once in a display:none one that is revealed afterwards. The srcdoc
 *  is lifted off a surface the walk already built, so this measures the real emitted runtime
 *  rather than a document the test wrote for itself. */
async function fitBothWays(page: Page, value: string, poke: 'update' | 'nothing') {
  return page.evaluate(
    async ([longValue, mode]) => {
      const src = (document.querySelector('.wz-side iframe') as HTMLIFrameElement).srcdoc;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const SHOWN = 'position:fixed;left:0;top:0;width:1920px;height:1080px;z-index:-1;opacity:0';

      async function mount(hidden: boolean) {
        const wrap = document.createElement('div');
        wrap.style.cssText = hidden ? 'display:none' : SHOWN;
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:1920px;height:1080px;border:0';
        const loaded = new Promise<void>((res) => frame.addEventListener('load', () => res()));
        frame.srcdoc = src;
        wrap.appendChild(frame);
        document.body.appendChild(wrap);
        await loaded;
        const win = frame.contentWindow as unknown as Record<string, unknown>;
        await frame.contentDocument!.fonts?.ready;
        await wait(150);
        return { wrap, frame, win };
      }

      /** What the ladder settled on - the same question the sweep above asks, asked of a
       *  document this test mounted itself. */
      function read(win: Record<string, unknown>, frame: HTMLIFrameElement) {
        const q = frame.contentDocument!.querySelector('#f0') as unknown as SVGGraphicsElement;
        const room = (win.svgFitRoom as Record<string, { width: number; height: number }>)?.f0;
        const r1 = (n: number) => Math.round(n * 10) / 10;
        const bb = q.getBBox();
        return {
          lines: q.querySelectorAll('tspan[data-noacg-line]').length || 1,
          size: r1(parseFloat(getComputedStyle(q as unknown as Element).fontSize)),
          blockW: r1(bb.width),
          blockH: r1(bb.height),
          roomW: r1(room?.width ?? 0),
          roomH: r1(room?.height ?? 0),
        };
      }

      const shown = await mount(false);
      if (mode === 'update') (shown.win.update as (s: string) => void)(JSON.stringify({ f0: longValue }));
      await wait(150);
      const visible = read(shown.win, shown.frame);

      // The blind one loads with nothing to measure, is revealed, and is then given the same
      // value the visible one got - or, on 'nothing', no prompt at all, because a cue taken to
      // air exactly as it was authored never sends one and still has to fit.
      const dark = await mount(true);
      dark.wrap.style.cssText = SHOWN;
      await wait(250);
      if (mode === 'update') (dark.win.update as (s: string) => void)(JSON.stringify({ f0: longValue }));
      await wait(150);
      const revealed = read(dark.win, dark.frame);

      shown.wrap.remove();
      dark.wrap.remove();
      return { visible, revealed };
    },
    [value, poke] as const,
  );
}

test('corpus: a board that loaded out of sight fits its question exactly as one that did not', async ({
  page,
}) => {
  test.slow();
  await mapCorpusFile(page, OWNER_BOARD);
  const qId = await questionRow(page);

  // A value that needs the ladder: it wraps onto several lines inside the plate it was drawn in.
  // Fitted against a room of nothing it stays one line at the drawn size and runs off the board,
  // which is the several-thousand-pixel block the old code painted here.
  await typeQuestion(page, qId, LADDER_VALUES.over3);

  // 1. The value arrives by update(), the way an operator's does.
  const byUpdate = await fitBothWays(page, LADDER_VALUES.over3, 'update');
  expect(byUpdate.revealed, 'the blind mount fitted differently once it was on screen').toEqual(
    byUpdate.visible,
  );

  // 2. And with NO update at all - a cue taken to air exactly as it was authored. Nothing
  //    prompts the ladder there, so this is the half the load-time recovery answers.
  const untouched = await fitBothWays(page, LADDER_VALUES.over3, 'nothing');
  expect(untouched.revealed, 'the blind mount never recovered without an update').toEqual(
    untouched.visible,
  );
  expect(untouched.visible.roomW, 'the datum itself measured nothing').toBeGreaterThan(0);
});

// ── ONE INPUT AT A TIME, ASSERTED AFTER EACH ────────────────────────────────────────────────
// The gates that missed all of the above set every input and then asserted once, which a
// recomputation firing on only one of two inputs passes cleanly. This walks the owner's own
// sequence instead - type, attach a behaviour, take it off, retype the same words - and asserts
// after every single step that the same value still fits the same way. The datum is the FIRST
// reading; nothing here pins a number, only that the number does not move.
test('corpus: the same question fits the same way whatever was toggled before it', async ({
  page,
}) => {
  test.slow();
  await mapCorpusFile(page, OWNER_BOARD);
  const qId = await questionRow(page);
  const frame = page.frameLocator('.wz-side iframe');
  const stage = page.locator('.wz-stage');
  const value = LADDER_VALUES.over3;

  // Attaching or removing a behaviour paints no new words, so this one cannot wait on what the
  // document is showing the way `typeQuestion` does - it waits on the REVISION MOVING instead,
  // snapshotted before the click. That is deterministic here for the one reason it is not
  // deterministic in general: a behaviour is emitted code, so this select always composes a
  // different document, and `awaitPainted` has already waited the previous rebuild out, so there
  // is nothing older in flight whose landing could be mistaken for this one's. The stamp is read
  // only once it exists, the way e2e/_preview.ts reads it - a revision snapshotted as null is
  // not an "attribute absent" expectation, it is an expectation Playwright will not take.
  const behaviour = async (kind: string) => {
    await expect(stage).toHaveAttribute('data-doc-rev', /\d/, SETTLED);
    const before = await stage.getAttribute('data-doc-rev');
    await page.getByTestId('map-svg-behaviour-kind').selectOption(kind);
    await expect(stage).not.toHaveAttribute('data-doc-rev', before!, SETTLED);
    await expect(stage).not.toHaveAttribute('data-doc-pending', '1', SETTLED);
  };

  await typeQuestion(page, qId, value);
  const datum = await readLadder(frame);
  const moved: string[] = [];
  const same = async (what: string) => {
    const now = await readLadder(frame);
    if (now.size !== datum.size || now.lines !== datum.lines || Math.abs(now.blockW - datum.blockW) > 1) {
      moved.push(`${what}: ${now.lines} lines at ${now.size}px (was ${datum.lines} at ${datum.size}px)`);
    }
  };

  await behaviour('quiz');
  await same('after attaching the quiz behaviour');
  await typeQuestion(page, qId, 'Short one');
  await typeQuestion(page, qId, value);
  await same('after clearing the question and typing it again');
  await behaviour('none');
  await same('after taking the behaviour off again');
  await behaviour('quiz');
  await same('after putting the quiz behaviour back');
  await typeQuestion(page, qId, value);
  await same('after retyping the same words on top of themselves');
  expect(moved, 'the fit moved without the question changing').toEqual([]);
});
