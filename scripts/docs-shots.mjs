// Capture the PUBLIC DOCS page's product screenshots from the running app.
//
//   node scripts/docs-shots.mjs [--only=<name,name>]   (dev server up)
//
// A picture earns its place where a sentence cannot land. "Your layers become fields" is words
// until somebody sees the layer names sitting in the field list (the Graphics guide: shots 1 and 2,
// then one pair per graphic type),
// and "one value moves every graphic that reads it" is words until somebody sees two scoreboards
// bound to the same four paths (the worked example, shots 4 to 10).
//
// Every one of those pictures is produced HERE, by driving the real app the way the e2e suite
// does, and never hand-captured. A checked-in hand screenshot goes stale the moment the surface
// it shows is redesigned, nobody notices (a PNG cannot fail a build), and the docs then teach
// the wrong thing to exactly the reader who cannot tell. Re-running this script is the fix, and
// the file names below are the contract docs.html references.
//
// Deliberately NOT part of the e2e suite: it produces artifacts and asserts nothing. It writes
// straight into public/docs/ because the output IS the committed asset - reviewing the diff on
// those PNGs is how a stale screenshot gets caught.
//
// The fixtures are the SHIPPED SAMPLES in docs/svg-samples/, the same files e2e/_svg-import.ts
// walks and the same files the guide tells the reader to drop. A picture of a private fixture
// would show a road the reader cannot take.
//
// Each shot runs in its OWN browser context, so no shot inherits the previous one's saved work
// (the wizard auto-opens only on a first-ever visit, and a leftover project would change what
// the Entry step offers).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(projectRoot, 'public', 'docs');
mkdirSync(outDir, { recursive: true });

const sample = (name) => join(projectRoot, 'docs', 'svg-samples', name);

const port = execSync('node scripts/dev-port.mjs', { cwd: projectRoot }).toString().trim();
const base = `http://localhost:${port}`;

const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);
const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;

/**
 * The docs body column is 780 CSS px wide, so everything here is published at well under half
 * the size it was captured at. That, not sharpness, is what decides the pane width: a 1440 pane
 * is a beautiful screenshot whose labels are 6 px tall on the page. 1120 is the narrowest that
 * still keeps the wizard's desktop layout (its breakpoint is 768) and its live preview beside
 * the form. 1.5x device scale then puts 1680 real pixels behind a 780 px slot, crisp on any
 * panel, without the page weight 2x would cost.
 */
const VIEWPORT = { width: 1120, height: 860 };
const SCALE = 1.5;

const browser = await chromium.launch();

/**
 * One shot = one fresh context. `run(page)` returns what to capture:
 *   - a LOCATOR, for a surface that is one element;
 *   - `{ clip }` from `clipBetween`, for a strip of the page that no single element wraps;
 *   - null, for the whole viewport.
 * With `capture: false` the run happens (its checks and its printed lines included) and no
 * picture is written - for a drop whose only job is to prove what the wizard picked.
 */
async function shot(name, run, size = VIEWPORT, scale = SCALE, { capture = true } = {}) {
  if (wanted && !wanted.has(name)) return;
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    const target = await run(page);
    if (!capture) return;
    const clipping = target && typeof target.clip === 'object';
    // `animations: 'disabled'` parks CSS/Web animations at their end state, which is what a
    // settled product surface looks like. `fullPage` with a clip is what makes the clip's
    // numbers PAGE coordinates rather than viewport ones, so a region below the fold is
    // captured where it is instead of being scrolled at.
    await (clipping ? page : (target ?? page)).screenshot({
      path: join(outDir, `${name}.png`),
      animations: 'disabled',
      ...(clipping ? { clip: target.clip, fullPage: true } : {}),
    });
    // The SIZE, printed, because `docs.html` hard-codes width/height on every frame so the page
    // reserves the right box before a lazy image arrives - and `e2e/docs.spec.ts` fails when the
    // two disagree. A regenerated shot of a different shape needs those two numbers updated in
    // the same commit, and reading them off a PNG by hand is how that step gets skipped.
    const png = readFileSync(join(outDir, `${name}.png`));
    console.log(`✓ ${name}.png  width="${png.readUInt32BE(16)}" height="${png.readUInt32BE(20)}"`);
  } catch (e) {
    console.error(`✗ ${name}.png - ${(e ?? '').message ?? e}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

/** The wizard panel itself, not the dimmed shell behind it: the docs show the SURFACE. */
const modal = (page) => page.locator('.wz-modal');

async function openImportDoor(page) {
  await page.goto(`${base}/app#/new`);
  await modal(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-entry="import-graphic"]').click();
}

/**
 * A screenshot of the strip between two elements, top of the first to bottom of the second.
 *
 * Some of the surfaces below are one long panel with no wrapper around the part that earns a
 * picture: the Data tab's live tree and its bindings share `.pd-live`, and the Audience tab's
 * viewer preview and its inbox are siblings under the page. Capturing the wrapper publishes a
 * tall picture whose subject is a third of it; capturing one child leaves out the half that
 * makes it mean something. The clip is the honest middle.
 *
 * With one selector it is that element plus the padding its own box does not carry.
 */
async function clipBetween(page, fromSelector, toSelector = fromSelector, { pad = 12, top = pad, bottom = pad } = {}) {
  const box = await page.evaluate(
    ([from, to, p, topPad, bottomPad]) => {
      const first = document.querySelector(from);
      const last = document.querySelector(to);
      if (!first || !last) throw new Error(`clipBetween: ${first ? to : from} is not on the page`);
      // DOCUMENT coordinates, and the shot is taken with `fullPage`, so nothing here scrolls.
      //
      // The first attempt scrolled the region to the top of the pane and clipped against the
      // viewport, and it failed twice over. The dashboard's topbar is sticky, so scrollIntoView
      // parked the live tree's own heading underneath it; and a region near the BOTTOM of a long
      // page cannot be scrolled to the top at all once the pane is 1400px tall, which is how the
      // Tables shot came back demanding a viewport it already had. Page coordinates have neither
      // problem: a sticky bar sits at its own resting place far above, and how far something is
      // down the page stops mattering.
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      // The padded edges are clamped to the page FIRST and the size measured from them, so a
      // panel sitting closer to the left edge than the pad gets a narrower clip rather than one
      // whose right edge runs off the page by the difference.
      const left = Math.max(0, Math.min(a.left, b.left) + window.scrollX - p);
      const topEdge = Math.max(0, Math.min(a.top, b.top) + window.scrollY - topPad);
      return {
        x: left,
        y: topEdge,
        width: Math.max(a.right, b.right) + window.scrollX + p - left,
        height: Math.max(a.bottom, b.bottom) + window.scrollY + bottomPad - topEdge,
      };
    },
    [fromSelector, toSelector, pad, top, bottom],
  );
  return { clip: box };
}

/** Drop focus before the shutter. A box the script typed into keeps its focus ring, and a
 *  published picture of a form with one cell outlined reads as a state the reader has to
 *  explain to themselves. */
async function blur(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/**
 * THE WORKED EXAMPLE (`/docs#data-example`): one small imaginary show, built the way the guide
 * tells a reader to build it.
 *
 * "Hall Cup" is a school sports night with four graphics that are not all the same shape - two
 * scoreboards reading the same score, a ticker whose lines are one list, and a name strap the
 * operator fills per guest. It exists so the three screens the guide describes (the live tree,
 * the bindings, the tables) can be photographed carrying the SAME show, which is the one thing
 * a reader cannot get from three separate reference sections.
 *
 * The graphics are CATALOG VARIANTS by name, and the tree and the table are the ones printed in
 * the guide, so a reader who follows the steps lands on these screens rather than on something
 * that looks like them. It is built through the model the way e2e/_create.ts builds a project -
 * the wizard walk is covered by the wizard's own specs, and repeating it here would only add
 * ways for a screenshot run to fail.
 */
const HALL_CUP_TREE = {
  match: { teamA: 'Otava', scoreA: 2, teamB: 'Karhut', scoreB: 1 },
  tickerItems: [
    'Junior final starts at 19:30',
    'Canteen closes at 20:00',
    'The bus home leaves from gate 4',
  ],
};

/** The example production, with the graphics this shot needs. Returns its id. */
async function hallCup(page, graphics) {
  await page.goto(`${base}/app`);
  await page.locator('.topbar').waitFor({ timeout: 60_000 });
  return page.evaluate(async (graphics) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');

    const show = createShowNamed('Hall Cup');
    for (const [categoryId, variantName] of graphics) {
      const variant = variantsFor(categoryId).find((v) => v.name === variantName);
      if (!variant) throw new Error(`no catalog variant "${variantName}" in ${categoryId}`);
      const draft = mergeDraft(initialDraft(), {
        variantId: variant.id,
        lines: variant.suggestedLines.map((l) => ({ ...l })),
        zone: null,
        logoEnabled: null,
        animation: { presetId: null, outPresetId: null },
        paletteId: null,
        customPalette: null,
        fontId: null,
      });
      addGraphicToShow(show.id, await formatTemplate(buildDraftTemplate(variant, draft)));
    }
    await commitDurableWrites();
    return show.id;
  }, graphics);
}

/**
 * The four graphics the data half of the guide walks through.
 *
 * TWO SCOREBOARDS ON PURPOSE. The guide's headline claim is that one value moves every graphic
 * that reads it, and a pool where no two graphics want the same number cannot show that: the
 * picture would be four bindings that each happen to point somewhere. Match Strip (the bug that
 * stays up) and Quiet Score (the card you cut to at half time) carry the SAME four field titles,
 * so one press of "Bind all by title" binds both to the same paths and the claim is visible
 * rather than asserted.
 */
const HALL_CUP_GRAPHICS = [
  ['scoreboard', 'Match Strip'],
  ['scoreboard', 'Quiet Score'],
  ['ticker', 'House Wire'],
  ['lower-third', 'House Strap'],
];

/** Open the Data tab, paste the tree, and bind every field whose title names a leaf. */
async function fillTree(page, showId) {
  await page.goto(`${base}/app#/production/${showId}/data`);
  await page.getByTestId('production-data').waitFor();
  await page.getByTestId('data-raw-toggle').click();
  await page.getByTestId('data-raw-text').fill(JSON.stringify(HALL_CUP_TREE, null, 2));
  await page.getByTestId('data-raw-apply').click();
  await page.getByTestId('data-row-match.teamA').waitFor();
  await page.getByTestId('bind-all-production').click();
  await page.getByTestId('bind-all-note-production').waitFor();
}

/** The guest list the name strap is filled from: the Line-up shape, cut to two columns. */
async function addInterviewTable(page) {
  await page.getByTestId('new-dataset-kind').selectOption('roster');
  await page.getByTestId('add-dataset').click();
  const dataset = page.locator('.pd-dataset');
  await dataset.waitFor();
  await dataset.getByTestId('dataset-name').fill('Interviews');
  // Line-up ships Name / Number / Position. The strap's second field is called Title, and the
  // binding is the WORDS, so the column is renamed rather than mapped. Number goes: this show
  // interviews a referee and a coach, and a column nothing fills teaches nothing.
  await dataset.getByTestId('col-c2').fill('Title');
  await dataset.getByTestId('col-delete-c1').click();
  await dataset.getByTestId('col-delete-c1').click();
  const fill = async (row, cells) => {
    const tr = dataset.locator('tbody tr').nth(row);
    for (let i = 0; i < cells.length; i += 1) await tr.locator('td input').nth(i).fill(cells[i]);
  };
  await fill(0, ['Aino Virtanen', 'Otava captain']);
  await page.getByTestId('add-row').click();
  await fill(1, ['Mikko Laine', 'Karhut head coach']);
  await page.getByTestId('add-row').click();
  await fill(2, ['Sofia Nieminen', 'Referee']);
  // The rundown reads the tables through the durable store, so let the write land before the
  // next navigation: a shot of the Playout tab with no "Load a row" select is a shot of a
  // product that looks like it does not have the feature.
  await page.waitForTimeout(900);
}

/** Drop a shipped sample (a bare file name) or any file (a full path) and land on the mapping
 *  step. */
async function dropSample(page, file) {
  await page.locator('.wz-drop input[type="file"]').setInputFiles(file.includes('/') || file.includes('\\') ? file : sample(file));
  await page.getByTestId('import-svg-card').waitFor();
  await modal(page).getByRole('button', { name: 'Next' }).click();
  await page.getByTestId('map-svg-fields').waitFor();
  // The mapping step mounts a live template in an iframe and measures it; let it settle before
  // the shutter rather than guessing a fixed cost after the fact.
  await page.waitForTimeout(1500);
}

// ── 1. The drop step, with the export advice open ────────────────────────────
//
// The ⓘ is opened on purpose. Shut, the picture says "there is a drop zone", which the reader
// already believes. The reason this section exists is that the export settings decide whether
// the import works at all, and the page's job is to show that they are THERE, at the drop.
// Narrower than its siblings on purpose. The docs column is 780 CSS px, so everything captured
// here is shown at well under half size, and this step is all TYPE - a 1280 pane would publish
// the export rules at a size nobody can read on the page. There is no preview pane on this step
// to lose, and 1040 is clear of the wizard's 768 px breakpoint.
await shot('svg-drop', async (page) => {
  await openImportDoor(page);
  await page.getByTestId('import-svg-export-why').click();
  await page.getByTestId('import-svg-export-why-body').waitFor();
  await page.waitForTimeout(400);
  return modal(page);
}, { width: 1040, height: 860 });

// ── 2. The mapping step: layer names, sitting in the field list ──────────────
await shot('svg-fields', async (page) => {
  await openImportDoor(page);
  await dropSample(page, 'lower-third.svg');
  return modal(page);
});

// ── 3. One pair of pictures per graphic type ────────────────────────────────────────────────────────────────
//
// Each type in the Graphics guide (`/docs#scoreboards` and its siblings) has a downloadable
// example file in public/docs/examples/, named so the wizard recognises it. Two pictures come
// from each: `type-<id>.png`, the artwork itself as it renders, and `type-<id>-fields.png`, the
// Fields step one drop later. The docs draw the file's layer panel in HTML beside them. An
// example marked `fieldsShot: false` (the lower-third versions of a type) still takes the drop
// but publishes only the first picture, so `--only=type-<id>-fields` for one of those runs the
// check and writes nothing.
//
// The render loads the SVG into a bare page with the app's own font files, because an SVG shown
// through <img> cannot load a web font and would publish every example in a fallback face.
// `crop` is the part of the 1920x1080 frame worth showing: a scorebug in the corner of an empty
// frame is a picture of nothing.
//
// The drop also PRINTS which behaviour the wizard picked, and the run fails on the wrong one.
// That line is the proof the example teaches what the guide says it teaches: a scoreboard
// example that lands on "Nothing" is a broken promise, and a PNG cannot say so on its own.
const example = (name) => join(projectRoot, 'public', 'docs', 'examples', name);

/**
 * One entry per example file. `behaviour` is what the wizard must pick after the drop, and the
 * run fails when it picks anything else. `fieldsShot: false` keeps that check but publishes no
 * Fields-step picture: the lower-third files are the full-frame ones drawn again in Illustrator
 * with the same names, so a second Fields picture would show the same panel twice.
 */
const TYPE_EXAMPLES = [
  { id: 'scoreboard', crop: [60, 40, 680, 130], behaviour: 'score' },
  { id: 'scoreboard-lower-third', crop: [150, 880, 780, 150], behaviour: 'score', fieldsShot: false },
  { id: 'quiz', crop: [340, 120, 1240, 840], behaviour: 'quiz' },
  { id: 'quiz-lower-third', crop: [-15, 745, 1950, 300], behaviour: 'quiz', fieldsShot: false },
  { id: 'live-vote', crop: [340, 120, 1240, 840], behaviour: 'poll' },
  { id: 'countdown', crop: [520, 270, 880, 540], behaviour: 'timer' },
  { id: 'end-credits', crop: [520, 90, 880, 900], behaviour: null },
  { id: 'ticker', crop: [0, 930, 1100, 140], behaviour: null },
];

/** The families the examples use, mapped to the woff2 files the app ships in public/fonts.
 *  The Illustrator-saved files name a FACE the PostScript way ('Archivo-Bold'), which the app
 *  resolves to the family at that weight; here the face name gets its own @font-face at that
 *  weight so the picture shows the same thing. */
const EXAMPLE_FONTS = {
  Archivo: 'archivo', Inter: 'inter', 'JetBrains Mono': 'jetbrains-mono', Sora: 'sora',
  'Space Grotesk': 'space-grotesk', 'Playfair Display': 'playfair-display',
  'Source Serif 4': 'source-serif-4', 'Libre Franklin': 'libre-franklin',
  'Archivo-Bold': ['archivo', 700], 'Inter-Regular': ['inter', 400],
};

for (const type of TYPE_EXAMPLES) {
  await shot(`type-${type.id}`, async (page) => {
    const [x, y, w, h] = type.crop;
    const markup = readFileSync(example(`${type.id}.svg`), 'utf8')
      .replace(/<\?xml[^>]*>/, '')
      // The crop is the viewBox, so the page shows only that part of the frame, at full size.
      .replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
      .replace(/ width="1920" height="1080"/, ' width="100%"');
    const faces = Object.entries(EXAMPLE_FONTS)
      .map(([family, spec]) => {
        const [file, weight] = Array.isArray(spec) ? spec : [spec, '100 900'];
        return `@font-face{font-family:"${family}";src:url("${base}/fonts/${file}.woff2") format("woff2");font-weight:${weight};}`;
      })
      .join('');
    // A mid slate rather than the docs' own near-black, so a dark panel drawn on a transparent
    // artboard still reads as a panel against it.
    await page.setContent(
      `<!doctype html><style>${faces}html,body{margin:0;background:#262d3a}#frame{width:${Math.min(w, 780)}px;line-height:0}</style><div id="frame">${markup}</div>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    return page.locator('#frame');
  }, VIEWPORT, 2);

  // The drop, and what the wizard picked; the run fails on the wrong type. For a check-only
  // example that is the whole job, so it ends here and no picture is written.
  const checkOnly = type.fieldsShot === false;
  await shot(`type-${type.id}-fields`, async (page) => {
    await openImportDoor(page);
    await dropSample(page, example(`${type.id}.svg`));
    const kind = page.getByTestId('map-svg-behaviour-kind');
    const picked = (await kind.count()) ? await kind.inputValue() : null;
    if (type.behaviour && (picked ?? 'none') !== type.behaviour) {
      throw new Error(`the wizard picked "${picked}" for ${type.id}.svg, the guide promises "${type.behaviour}"`);
    }
    console.log(`  ${type.id}.svg -> ${picked || 'no behaviour'}`);
    if (checkOnly) return null;
    if (type.behaviour) {
      // To the TOP of the panel, so the picked type is the first thing in the shot.
      await page.getByTestId('map-svg-behaviour').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(600);
    }
    return modal(page);
  }, VIEWPORT, SCALE, { capture: !checkOnly });
}

// ── 4. The live tree: paths, types, and the values a whole show reads from ───
await shot('data-tree', async (page) => {
  const showId = await hallCup(page, HALL_CUP_GRAPHICS);
  await fillTree(page, showId);
  // No top pad: the dashboard's topbar sits directly above this panel, and padding upward
  // catches a slice of its last button.
  return clipBetween(page, '.pd-live-head', '.pd-live-add', { top: 0 });
});

// ── 5. The bindings: which field of which graphic reads which path ───────────
//
// The picture the guide turns on. Nine bound rows reading their value back and four left empty
// is the whole distinction between "this value is the show's" and "this value is this cue's",
// and it is one screen rather than two paragraphs. Both scoreboards landing on the same four
// paths is the claim itself, which is why the pool carries two.
//
// A padded CLIP rather than an element grab: `.pd-bindings` has no gutter of its own, so the
// element's own box puts the headings hard against the left edge and slices the "Bind all by
// title" buttons down their right one.
await shot('data-bindings', async (page) => {
  const showId = await hallCup(page, HALL_CUP_GRAPHICS);
  await fillTree(page, showId);
  await blur(page);
  return clipBetween(page, '.pd-bindings');
});

// ── 6. What a bound field looks like on the Playout tab ──────────────────────
//
// Captured as a CLIP down to the ± LIVE NUMBERS block, because the two halves answer each
// other: the fields read out with the path they follow, and the presses underneath are how an
// operator moves that shared value without opening the Data tab at all.
await shot('data-cue', async (page) => {
  const showId = await hallCup(page, HALL_CUP_GRAPHICS);
  await fillTree(page, showId);
  await page.goto(`${base}/app#/production/${showId}`);
  await page.getByTestId('production-page').waitFor();
  await page.getByTestId('live-numbers').waitFor();
  // The cue editor mounts a preview iframe and measures it; let the page settle before the
  // shutter rather than photographing a half-laid-out dashboard.
  await page.waitForTimeout(1200);
  // No pad above or below: the verbs row sits 12px over the editor card and the next panel sits
  // the same distance under the live-numbers one, so padding either way publishes a slice of a
  // card that is not the subject. Both carry their own gutter.
  return clipBetween(page, '[data-testid="cue-editor"]', '[data-testid="live-numbers"]', { top: 0, bottom: 0 });
});

// ── 7. A table, and the cue that loads a row out of it ───────────────────────
await shot('data-table', async (page) => {
  const showId = await hallCup(page, HALL_CUP_GRAPHICS);
  await fillTree(page, showId);
  await addInterviewTable(page);
  await blur(page);
  return clipBetween(page, '.pd-data-head', '.pd-dataset');
});

/**
 * The two graphics the audience half needs: somewhere for a moderated question to go, and a
 * board for a vote's counts. Hall Cup grows them in the guide at the same point.
 */
const HALL_CUP_AUDIENCE = [
  ['audience', 'House Question'],
  ['poll', 'House Vote'],
];

/** The Audience tab of that production, with the door open. Everything below starts here. */
async function openAudience(page) {
  const showId = await hallCup(page, HALL_CUP_AUDIENCE);
  await page.goto(`${base}/app#/production/${showId}/audience`);
  await page.getByTestId('production-audience').waitFor();
  await page.getByTestId('audience-open').check();
}

/** ...and three rehearsal arrivals in, with the viewer preview unfolded. Shared by the two
 *  shots below, which photograph different halves of the same screen. */
async function audienceInbox(page) {
  await openAudience(page);
  await page.getByTestId('audience-simulate').click();
  await page.getByTestId('audience-preview-details').locator('summary').click();
  // The preview mounts the join surface and loads its first view over the provider's own
  // promise; the inbox rows arrive on the same change signal.
  await page.waitForTimeout(1200);
  await blur(page);
}

// ── 8. What the room actually sees ───────────────────────────────────────────
//
// TWO pictures rather than one, and this is the reason. A viewer's page is PORTRAIT and about
// 380px wide; the operator's inbox is the full width of a dashboard. Photographed together the
// result is a phone in the corner of a frame that is three-fifths empty black, and at the 780px
// the docs column gives it, the phone is a stamp nobody can read.
//
// So the join surface gets its own frame, at 3x device scale because it is published near its
// captured size rather than shrunk to a third of it (docs.css `.doc-shot.phone`). It is the
// real renderer, the same code a phone loads, mounted read-only inside the studio.
await shot('audience-join', async (page) => {
  await audienceInbox(page);
  return page.locator('.pd-aud-preview-frame');
}, VIEWPORT, 3);

// ── 9. Where those words land, and the only road from them to air ────────────
//
// The moderation rows, from the filter tabs down. The arrivals are simulated: that button is
// what an operator with no room yet actually presses, and its rows say "(rehearsal)" in their
// own text, so this picture cannot be read as real people's words.
await shot('audience-inbox', async (page) => {
  await audienceInbox(page);
  // No bottom pad: the rows sit 6px apart, so padding downward publishes a sliver of the
  // third card that reads as a rendering fault rather than as a list continuing.
  return clipBetween(page, '.pd-aud-filters', '.pd-aud-row:nth-of-type(2)', { bottom: 0 });
});

// ── 10. A vote, counted ──────────────────────────────────────────────────────
//
// The operator's side only. The viewer's ballot is in the shot above's preview frame, and this
// one is about the counts - which exist HERE and nowhere a viewer can reach.
await shot('audience-vote', async (page) => {
  await openAudience(page);
  await page.getByTestId('audience-round-question').fill('Who takes the second half?');
  await page.getByTestId('audience-round-options').fill('Otava\nKarhut\nToo close to call');
  await page.getByTestId('audience-round-open').click();
  await page.getByTestId('audience-round-live').waitFor();
  await page.getByTestId('audience-simulate-votes').click();
  // The tally is POLLED at 2 s (ProductionAudienceWorkspace's tally effect), so a shutter
  // fired straight after the press photographs three zeroes and a product that looks broken.
  await page.waitForTimeout(2600);
  return page.locator('.pd-aud-round');
});

await browser.close();
