// THE OWNER ACCEPTANCE PACK - one reviewable place for every visual read this repo records as
// OWED, so the three of them are answered in one sitting instead of three sessions.
//
//   node scripts/acceptance-pack.mjs [out-dir] [section...]
//   node scripts/acceptance-pack.mjs                             # everything, into the pack's home
//   node scripts/acceptance-pack.mjs docs/acceptance/owner-pack scroll   # one section
//
// Sections: catalog | scroll | hosted | controller | interactive | index (index alone re-renders the
// page around whatever the manifest already holds, without opening a single production).
//
// THE PACK IS COMMITTED, unlike a sweep's output. It is ~2 MB, three docs point at it as the
// thing that answers a read they record as owed, and a picture nobody but this machine can see
// answers nothing. Re-running
// updates it in place; the notes beside it carry the date.
//
// It ASKS, it never answers. Every frame is captioned with the exact question it puts in front
// of the owner, taken verbatim from the doc that records the read as owed - this script must
// never carry a verdict, a "looks fine" or a recommendation, because a pack that pre-judges is
// a pack the owner has to un-read before they can look.
//
// Deliberately NOT part of the e2e suite: it produces artifacts, it does not assert. It IS
// browser-driving work, so it is listed in SWEEP_SCRIPTS (scripts/command-match.mjs) and the
// machine's one-job rule applies to it exactly as it applies to a catalog sweep.
//
// Needs the dev server up on this checkout's port (node scripts/dev-port.mjs).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import JSZip from 'jszip';
import { outDir } from './out-dir.mjs';

const OUT = outDir(
  process.argv[2],
  './docs/acceptance/owner-pack',
  'Usage: node scripts/acceptance-pack.mjs [out-dir] [catalog|scroll|hosted|controller|interactive|index ...]',
);
const ASKED = process.argv.slice(3).filter((a) => !a.startsWith('-'));
const WANT = (name) => ASKED.length === 0 || ASKED.includes(name);
mkdirSync(OUT, { recursive: true });
const PORT = execSync('node scripts/dev-port.mjs').toString().trim();
const BASE = `http://localhost:${PORT}`;

/**
 * THE MANIFEST IS THE PACK. Every capture appends one entry here, and the index page is
 * rendered from it - so a frame that was captured but never captioned cannot exist, and a
 * caption that names a frame nobody captured shows up as a hole rather than as prose.
 */
const frames = [];
const record = (entry) => {
  frames.push(entry);
  console.log(`  · ${entry.file}`);
};

// ── The reported window. NOT a nominal 1920x1080: the defect this replaced does not reproduce
// there, because at 1080 CSS px the page had the room the complaint was about not having.
// 1536x814 is a 1080p monitor at Windows' 125% scaling, which is what the owner reported on.
const REPORTED = { width: 1536, height: 814 };
const SHORT = { width: 1536, height: 560 };
const NOMINAL = { width: 1920, height: 1080 };

const wait = (page, ms) => page.waitForTimeout(ms);

/** The wizard's exact create path, run in the page - the same helper e2e/_create.ts uses. */
async function createProject(page, spec) {
  await page.addInitScript(() => {
    try {
      let prefs = {};
      try { prefs = JSON.parse(localStorage.getItem('spx-gfx-prefs') ?? '{}'); } catch { prefs = {}; }
      if (prefs.advancedMode !== true) {
        localStorage.setItem('spx-gfx-prefs', JSON.stringify({ ...prefs, advancedMode: true }));
      }
    } catch { /* opaque-origin preview frame: nothing to persist */ }
  });
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar', { timeout: 30_000 });
  await page.evaluate(async (s) => {
    const { CATALOG, variantsFor } = await import('/src/templates/catalog.ts');
    const { CATEGORIES } = await import('/src/model/wizard.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { setDefaultBrand } = await import('/src/model/brand.ts');
    const { createLook } = await import('/src/model/packets.ts');
    const { saveProject } = await import('/src/model/project.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { useDocKindStore } = await import('/src/store/docKindStore.ts');
    const cat = s.category ? CATEGORIES.find((c) => c.id === s.category || c.name === s.category) : undefined;
    const pool = cat ? variantsFor(cat.id) : Object.values(CATALOG).flat();
    const variant = s.name
      ? pool.find((v) => v.name === s.name) ?? pool.find((v) => v.name.includes(s.name))
      : pool[s.index ?? 0];
    if (!variant) throw new Error(`no catalog variant for ${JSON.stringify(s)}`);
    const draft = mergeDraft(initialDraft(), {
      variantId: variant.id,
      lines: variant.suggestedLines.map((l) => ({ ...l })),
      zone: null, logoEnabled: null,
      animation: { presetId: null, outPresetId: null },
      paletteId: null, customPalette: null, fontId: null,
    });
    const template = await formatTemplate(buildDraftTemplate(variant, draft));
    const store = useTemplateStore.getState();
    store.applyTemplate(template, { resetSampleData: true });
    store.setActiveTab('html');
    useDocKindStore.getState().setKind('spx');
    const made = createLook(`${variant.name} look`, {
      styleTag: variant.styleTag, palette: variant.defaultPalette,
      fontId: variant.defaultFontId, customFont: null,
    });
    setDefaultBrand(made.id);
    const created = useTemplateStore.getState();
    saveProject(created.template, created.baseline, { graphicId: created.saved.graphicId, dirty: created.saved.dirty }, created.aiSpec, created.aiThread);
  }, spec);
  await wait(page, 1_200);
}

/** Create the current editor graphic's production and land on its dashboard. */
async function productionFor(page, name) {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await page.waitForSelector('[data-testid="production-page"]', { timeout: 30_000 });
  await wait(page, 1_500);
}

/** Add a second graphic (already in the library) to the open production's pool. */
async function addGraphicToOpenProduction(page, variantId, label) {
  await page.evaluate(async ({ variantId, label }) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const shows = await import('/src/model/shows.ts');
    const tpl = variantById(variantId).create({});
    const show = shows.loadShows()[0];
    shows.addGraphicToShow(show.id, tpl, {});
    const fresh = shows.loadShows().find((s) => s.id === show.id);
    const cue = fresh.cues[fresh.cues.length - 1];
    shows.updateShowCue(show.id, cue.id, { label });
  }, { variantId, label });
  await page.reload();
  await page.waitForSelector('[data-testid="production-page"]', { timeout: 30_000 });
  await wait(page, 1_500);
}

/** The measurements the pack's captions quote, read off the live document, never assumed. */
async function measureDashboard(page) {
  return page.evaluate(() => {
    const px = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    // THE STICKY HEAD is what "how much of the screen do the monitors eat" now means: since
    // 2026-08-21 it holds the verb bar as well, and the monitors' own grid box stretches to
    // whichever of the two is taller. Measuring `.pd-monitors` alone reported that stretch as
    // if it were picture, which is why the PVW frame is measured separately below.
    const monitors = document.querySelector('.pd-stagehead') ?? document.querySelector('.pd-monitors');
    const main = document.querySelector('.pd-main');
    const editor = document.querySelector('.pd-editor');
    const mrect = monitors?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    // THE PGM FRAME'S OWN RIGHT EDGE, not the monitor block's. `.pd-monitors` is a full-width
    // grid whose TRACKS carry the cap, so its right edge is the column's right edge and
    // measuring against it reports the empty space as one pixel wide - which is the opposite
    // of what the picture shows and exactly the number the owner is being asked about.
    const grid = document.querySelector('.pd-monitors');
    const pgm = grid?.lastElementChild?.getBoundingClientRect();
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      monitorBlock: px(monitors),
      monitorShareOfHeight: mrect ? `${Math.round((mrect.height / window.innerHeight) * 100)}%` : null,
      // The PICTURE itself - what an operator actually judges a graphic by, and the number the
      // owner's first question is about. Distinct from the block, which also carries the labels,
      // the sticky padding and (since the verb bar moved) whichever column is taller.
      pictureHeight: px(document.querySelector('.pd-pvw .pd-frame')),
      // The question the owner is asked about the empty column: how wide is it, really.
      spaceRightOfProgram: pgm && mainRect ? Math.round(mainRect.right - pgm.right) : null,
      editorHeight: px(editor),
      editorHidden: editor ? Math.max(0, editor.scrollHeight - editor.clientHeight) : null,
      pageScrollable: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      // THE SLACK: the room below the last thing on the page. This is the number the owner's
      // 1080p complaint is actually about - "too much empty room at the bottom" - and the one
      // that says whether the monitors have anywhere left to grow. Zero on a page that scrolls.
      slackBelowLastRow: (() => {
        const rows = main ? [...main.children] : [];
        const last = rows[rows.length - 1];
        if (!last) return null;
        return Math.max(0, Math.round(window.innerHeight - last.getBoundingClientRect().bottom));
      })(),
      panesThatScroll: ['.pd-main', '.pd-editor', '.pd-actions', '.pd-activity', '.pd-data', '.pd-audience']
        .filter((sel) => {
          const el = document.querySelector(sel);
          return el && el.scrollHeight - el.clientHeight > 1;
        }),
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ig39 "Key Figures": the catalog's first two-column stat list, live, never seen
// ═════════════════════════════════════════════════════════════════════════════════════════
/**
 * The five designs this section puts side by side, and WHY each one is in the room. A taste
 * read of a new design is never only about the design: it is about the row it lands in.
 */
const CATALOG_READ = [
  {
    id: 'ig39',
    title: 'ig39 — “Key Figures”, the subject of this read',
    question:
      'Does the two-column stat list read as a broadcast graphic — the label column, the figure column sharing one edge, the header band, the footer rule? This design is live in the catalog and has never been looked at on a screen.',
    note:
      'Two rules it holds, both stated in its own source: a figure is rendered exactly as typed (nothing parses it, so “€4.21bn” and “12.4 %” survive intact), and the stat column asks for LINING numerals as well as tabular ones — the editorial serif’s default old-style figures ride at x-height and put “42” lower than “18,400” beside it. The numerals gate cannot see that: it measures whether a figure’s box moves, and old-style digits are perfectly stable at the wrong height.',
  },
  {
    id: 'ig01',
    title: 'ig01 — the shelf’s original stat panel',
    question:
      'The design ig39 has to be worth picking INSTEAD of. Does the two-column list do a job this one cannot?',
    note: 'Same storefront shelf: Statistics & data → stat panel (src/templates/meta.ts).',
  },
  {
    id: 'ig37',
    title: 'ig37 — “House Forecast”, a stat panel on the same shelf',
    question: 'A second card in the same result. Is ig39 distinct enough to earn its slot in this row?',
    note: 'Same shelf; also the design written immediately before ig39 in the registry.',
  },
  {
    id: 'ig36',
    title: 'ig36 — “Turnout Dial”, a stat panel AND an editorial sibling',
    question:
      'The one design that is both a shelf neighbour and family. Do these two look like they come from one house?',
    note: 'The election-night mini-pack (ig34–ig36), all siblings of lt25 “Masthead” — the editorial language ig39 was written into.',
  },
  {
    id: 'ig38',
    title: 'ig38 — “Results Rail”, the other half of the lesson ig39 completes',
    question:
      'Not a shelf neighbour (it files under Results & standings), but the design ig39’s source argues against. Is the argument visible on screen — a fill that carries its own figure, versus a real grid column?',
    note:
      'ig38 nests the figure’s cap INSIDE the growing bar, so the readout rides the tip; ig39’s label and figure are SIBLINGS, so the figures share an edge because they share a column.',
  },
];

async function sectionCatalog(browser) {
  console.log('\n[catalog] ig39 Key Figures and the storefront it sits in');
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // THE FULL-FRAME PICTURES COME FROM THE CATALOG'S OWN INSTRUMENT, not from a second renderer
  // written here. `l3-sweep` settles each design over the sweep's bed and is the sweep the
  // catalog gates are read off - a picture taken any other way would be a picture of this
  // script rather than of the design.
  const sweep = './l3-shots/infographic';
  for (const design of CATALOG_READ) {
    const src = join(sweep, `${design.id}.png`);
    if (!existsSync(src)) {
      console.warn(`  ! ${src} missing - run: node scripts/l3-sweep.mjs ${sweep} infographic`);
      continue;
    }
    copyFileSync(src, join(OUT, `catalog-${design.id}.png`));
    record({ section: 'catalog', file: `catalog-${design.id}.png`, ...design });
  }

  // …and the STOREFRONT itself: the cards a person actually chooses between, reached the way a
  // person reaches them - Entry, Browse, the shelf ig39 files under, then paging until the card
  // is on the grid. The Browse step renders a PAGE of twelve, not the catalog, so there is no
  // shortcut that shows the real row.
  //
  // THE SHELF IS 'stats', NOT 'infographic'. The registry directory a design lives in and the
  // storefront facet it files under are different things (src/templates/meta.ts): ig39 is
  // Statistics & data → stat panel, which is why its shelf neighbours are ig01/ig36/ig37 and
  // not the ig38 that sits beside it in the source.
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wz-modal', { timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await page.waitForSelector('.wz-browse-search', { timeout: 20_000 });
  // The two-level Option A dropdown (2026-08-28): a one-member shelf renders as a plain option
  // for the GROUP, so the value that exists in the list is `group:<id>`, otherwise `cat:<id>`.
  const target = await page.evaluate(async () => {
    const { GRAPHIC_CATEGORIES, CATEGORY_GROUPS, CATEGORY_GROUP_OF } = await import('/src/model/taxonomy.ts');
    const cat = GRAPHIC_CATEGORIES.find((c) => c.id === 'stats');
    const group = CATEGORY_GROUPS.find((g) => g.id === CATEGORY_GROUP_OF[cat.id]);
    return group.categories.length > 1 ? `cat:${cat.id}` : `group:${group.id}`;
  });
  await page.getByTestId('wz-browse-type').selectOption(target);
  await wait(page, 1_200);
  const card = page.locator('.wz-variant', { hasText: 'Key Figures' }).first();
  const more = page.getByTestId('wz-browse-more');
  for (let press = 0; press < 20 && !(await card.count()); press += 1) {
    if (!(await more.count())) break;
    await more.click();
    await wait(page, 700);
  }
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded();
    await wait(page, 2_000);
  }
  await page.screenshot({ path: join(OUT, 'catalog-storefront.png') });
  record({
    section: 'catalog',
    file: 'catalog-storefront.png',
    title: 'The storefront row ig39 lands in',
    question:
      'On the Browse grid, beside the cards it competes with for the same click: does “Key Figures” read as a distinct thing worth picking, or as one more card in the row?',
    note: 'The wizard’s Browse step, narrowed to infographics and paged until the card is on the grid — the walk a person makes, not a deep link past it.',
  });

  await context.close();
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — the playout dashboard's scroll model, on the surface it was reported on
// ═════════════════════════════════════════════════════════════════════════════════════════
async function sectionScroll(browser) {
  console.log('\n[scroll] the playout dashboard at the reported size');
  const context = await browser.newContext({ viewport: REPORTED, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // An EIGHT-FIELD QUIZ over a match board: the graphic the complaint was measured with, and a
  // second layer so PROGRAM carries a badge and the rundown has something to walk.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Owner Read');
  await addGraphicToOpenProduction(page, 'sb01', 'Match board');
  await page.locator('.pd-cue').first().click();
  await wait(page, 1_200);
  await page.getByTestId('verb-take').click();
  await wait(page, 2_500);

  const shots = [
    {
      viewport: REPORTED,
      file: 'scroll-1536x814-top.png',
      title: 'The reported window — 1536×814 (a 1080p monitor at 125% scaling)',
      question:
        'You accepted this size on 2026-08-21 (“the gap and monitors are not too small”). It is here to prove the re-lay did not spend that acceptance: does it still read the way it did?',
      note:
        'What moved: the picture went 212px → 225px and the sticky head 254px → 267px, so 13px each. The verb bar is now INSIDE that head, beside PROGRAM, instead of below the monitors.',
    },
    {
      viewport: REPORTED,
      file: 'scroll-1536x814-bottom.png',
      scrollToBottom: true,
      title: 'The same window, scrolled to the bottom of the page',
      question:
        'The empty column beside PROGRAM now holds the verbs. Is that what you meant by “could the buttons be placed to the right”, and does TAKE still read as the loudest control on the page from over there?',
      note:
        'Two across with TAKE spanning the pair, not a single stack: six verbs in one column are taller than the monitors at this size, and the stack would then set the head’s height instead of the picture.',
    },
    {
      viewport: SHORT,
      file: 'scroll-1536x560-top.png',
      title: 'A short window — 1536×560, BELOW the supported minimum',
      question:
        '1366×768 is the floor you set, so this window owes degrading without breaking rather than fitting. Does it degrade acceptably?',
      note:
        'The head takes a bigger share here than it used to (34% → 40%) precisely BECAUSE it now carries the verb bar. The picture is 170px, its clamp floor.',
    },
    {
      viewport: SHORT,
      file: 'scroll-1536x560-bottom.png',
      scrollToBottom: true,
      title: 'The short window, scrolled to the bottom',
      question:
        'This is the frame you called scary — the monitors used to scroll over the take buttons. TAKE, Preview, Re-take, Update, Next and Out are all still on screen. Is the hazard gone?',
      note: 'The stage head sticks as one block now, so the bar cannot be scrolled under the monitors on any of the three surfaces.',
    },
    {
      viewport: NOMINAL,
      file: 'scroll-1920x1080.png',
      title: 'Nominal 1080p — 1920×1080, the size you rejected',
      question:
        'Your words were “too much empty room at the bottom and the monitors are unnecessarily small”. The picture is a third bigger and the verbs have moved into the width beside PROGRAM. Is there still too much empty room?',
      note:
        'Picture 281px → 368px; sticky head 323px (30%) → 410px (38%). The cap grows with the window now instead of being a flat 26vh, from the 768px floor of the minimum supported one. It is deliberately viewport-derived and not content-derived: sizing it from what the editor leaves over would resize the monitors whenever a cue with a different field count was selected — the same twitch in another costume.',
    },
  ];

  for (const shot of shots) {
    await page.setViewportSize(shot.viewport);
    await wait(page, 900);
    if (shot.scrollToBottom) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(page, 500);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(page, 300);
    }
    const measured = await measureDashboard(page);
    await page.screenshot({ path: join(OUT, shot.file) });
    record({ ...shot, section: 'scroll', measured });
  }

  // The HOSTED control page renders the same dashboard from the same stylesheet. Offline it
  await context.close();
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// SECTION 2b — the HOSTED control page: the surface a phone across the building drives
//
// It needs a Supabase backend, and this checkout is offline by design, so a picture of it takes
// a build with the env set and a server answering the RPCs. Both are FAKE and neither is a
// mockup: the page is the real built bundle, and what it renders is a real production's own
// `buildPanelSpec` / `buildOutputPayload`, computed by the app itself on the dev server. What is
// stubbed is the TRANSPORT - migration 0008's RPCs answered from memory, with `control_send`
// appending to an ordered log that `control_tail` serves back, exactly as e2e/_relay.ts does for
// the exported package. A Take therefore really airs, and the PROGRAM monitor really follows it.
//
// The one thing this cannot prove is the server: RLS, the slug capability, the real log's
// ordering. That is what the live checklist is for. This proves the LAYOUT, which is the only
// thing the two questions in §2 are about.
// ═════════════════════════════════════════════════════════════════════════════════════════
const STUB_SUPABASE = 'https://stub-backend.invalid';
const STUB_ORIGIN = 'http://hosted-read.local';
const HOSTED_BUILD = '.tmp-hosted-build';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};

/** Every file under a directory, keyed by its path relative to it, with forward slashes. */
function readTree(root, prefix = '', into = new Map()) {
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) readTree(root, rel, into);
    else into.set(rel, readFileSync(join(root, rel.split('/').join('/'))));
  }
  return into;
}

async function sectionHosted(browser) {
  console.log('\n[hosted] the hosted control page, over a stubbed backend');

  // ── 1. The production, and the two payloads a publish would write, computed by the app ──
  const offline = await browser.newContext({ viewport: REPORTED, deviceScaleFactor: 1 });
  const seed = await offline.newPage();
  await createProject(seed, { name: 'Arena Quiz' });
  const published = await seed.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildPanelSpec, buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const quiz = variantById('qz01').create({});
    const { doc } = createGraphic(quiz, { name: 'Arena Quiz' });
    const show = shows.createShowNamed('Owner Read');
    shows.addGraphicToShow(show.id, quiz, { graphicId: doc.id });
    let fresh = shows.loadShows().find((s) => s.id === show.id);
    shows.updateShowCue(show.id, fresh.cues[0].id, { label: 'Question one' });
    const board = variantById('sb01').create({});
    const made = createGraphic(board, { name: 'Match Strip' });
    shows.addGraphicToShow(show.id, board, { graphicId: made.doc.id });
    fresh = shows.loadShows().find((s) => s.id === show.id);
    shows.updateShowCue(show.id, fresh.cues[fresh.cues.length - 1].id, { label: 'Match board' });
    fresh = shows.loadShows().find((s) => s.id === show.id);
    const output = await buildOutputPayload(fresh);
    return {
      id: fresh.id,
      title: fresh.name,
      panel: buildPanelSpec(fresh),
      output,
      // The cue the stubbed resolve will report as already on air.
      onAir: output.cues[0],
    };
  });
  await offline.close();

  // ── 2. A build with the backend env SET. Nothing else about it differs from a real one. ──
  console.log('  building a bundle with the backend env set…');
  execSync(`npx vite build --outDir ${HOSTED_BUILD} --emptyOutDir --logLevel error`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: STUB_SUPABASE,
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
    },
  });
  const files = readTree(HOSTED_BUILD);
  console.log(`  serving ${files.size} built files over ${STUB_ORIGIN}`);

  // ── 3. The transport, from memory: 0008's RPCs, with a real ordered log behind them ──
  const log = [];
  const stubbed = new Set();
  const rpc = (name, body) => {
    stubbed.add(name);
    switch (name) {
      case 'control_show_by_slug':
        // OPENING ONTO A PRODUCTION THAT IS ALREADY ON AIR - the hosted page's own real case
        // (an operator joins from a phone mid-show), and the one this rig can show honestly.
        // The resolve reports which layer is up and what it last applied; the page's boot
        // recovery plays that onto PROGRAM from those two fields alone, with no log row and no
        // socket involved. Driving it live from here would need Supabase REALTIME - the log
        // follower tail-fills only when a phoenix channel reports SUBSCRIBED - and a faked
        // socket is where this rig would stop being a picture of the product.
        return {
          id: published.id, title: published.title, panel: published.panel,
          staged: {}, last_event_id: log.length,
          live: { [published.onAir.graphic]: { data: published.onAir.values, state: null } },
          output: published.output, output_seen_at: new Date(0).toISOString(),
          live_cue: { v: 2, layers: { [published.onAir.graphic]: { cue: published.onAir.id } } },
        };
      case 'control_tail':
        return log.filter((r) => r.id > Number(body.p_after ?? 0));
      case 'control_send':
        log.push({ id: log.length + 1, graphic: body.p_graphic, msg: body.p_msg });
        return null;
      case 'control_send_many':
        for (const item of body.p_items ?? []) log.push({ id: log.length + 1, graphic: item.graphic, msg: item.msg });
        return null;
      case 'control_stage':
        log.push({ id: log.length + 1, graphic: body.p_graphic, msg: { t: 'staged', data: body.p_data } });
        return null;
      default:
        // Everything the OUTPUT plane asks for. Named rather than blanket-answered, so a call
        // this pack has not thought about shows up in the console instead of looking handled.
        return null;
    }
  };
  const unexpected = [];
  const serve = (route) => {
    const url = new URL(route.request().url());
    if (url.origin === STUB_SUPABASE) {
      const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (!m) { unexpected.push(url.pathname); return route.fulfill({ status: 404, body: '{}' }); }
      const body = route.request().postDataJSON() ?? {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rpc(m[1], body)) });
    }
    // `cleanUrls` in production serves app.html for /app; the built tree has the .html file.
    // THE CONTENT TYPE COMES OFF THE KEY THAT MATCHED, never off the request path: `/app` has
    // no extension, so typing it by the URL hands the browser an octet-stream and Chromium
    // DOWNLOADS the page instead of rendering it.
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    const key = [path, `${path}.html`, `${path.replace(/\/$/, '')}/index.html`].find((k) => files.has(k));
    if (!key) return route.fulfill({ status: 404, body: 'nf' });
    const ext = key.slice(key.lastIndexOf('.'));
    return route.fulfill({ status: 200, contentType: MIME[ext] ?? 'application/octet-stream', body: files.get(key) });
  };

  const context = await browser.newContext({ viewport: REPORTED, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route(`${STUB_ORIGIN}/**`, serve);
  await page.route(`${STUB_SUPABASE}/**`, serve);
  await page.goto(`${STUB_ORIGIN}/app?control=owner-read-pack`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="hosted-control-page"]', { timeout: 45_000 });
  await wait(page, 3_000);
  // The quiz is up (the resolve said so and the boot recovery played it); select the OTHER cue,
  // so PREVIEW carries the graphic being checked and PROGRAM carries the one on air - the same
  // two-populated-monitors picture the in-app frames above are read from.
  await page.getByTestId('hosted-select-cue').nth(1).click();
  await wait(page, 3_000);

  for (const shot of [
    {
      viewport: REPORTED,
      file: 'scroll-hosted-1536x814.png',
      title: 'The HOSTED control page at 1536×814 — the third surface, opened onto a live show',
      question:
        'The re-lay reached this surface too. It measures IDENTICALLY to the in-app page — 225px of picture in a 267px head, 33% of the window — so the three still have not diverged. Does it read the same to you?',
      note:
        'The real built bundle — nothing about it differs from a deployed one except which URL its Supabase env points at. What it renders is this production’s own `buildPanelSpec` and `buildOutputPayload`, computed by the app itself, and migration 0008’s RPCs answered from memory. It is captured OPENING onto a production already on air, which is the hosted page’s own case (an operator joining mid-show): the resolve reports which layer is up and what it last applied, and the boot recovery plays that onto PROGRAM from those two fields alone. WHAT THIS FRAME CANNOT SHOW: anything that happens AFTER the open. The log follower tail-fills only when Supabase Realtime reports SUBSCRIBED, and this rig has no socket — so the buttons here would not move the picture. It proves the LAYOUT, which is all the two questions are about; the server side (RLS, the slug capability, the log’s ordering) belongs to the live checklist.',
    },
    {
      viewport: SHORT,
      file: 'scroll-hosted-1536x560.png',
      scrollToBottom: true,
      title: 'The hosted page in a short window — 1536×560, scrolled down',
      question:
        'Third surface, below the supported minimum. Same question as the in-app frame: does it degrade acceptably rather than break?',
      note:
        'The header, the monitors and the cue rail stay put; the page is what moves. One thing to look at while you are here, recorded as an observation and not a verdict: the ⚡ block is offered for the cue being EDITED, whose layer (L21) is not the one on air — the same undecided question the exported-controller frame below raises, which §7b and §7c of docs/PLAYOUT_DASHBOARD.md are the two places the rule would live.',
    },
  ]) {
    await page.setViewportSize(shot.viewport);
    await wait(page, 900);
    await page.evaluate((bottom) => window.scrollTo(0, bottom ? document.documentElement.scrollHeight : 0), !!shot.scrollToBottom);
    await wait(page, 500);
    const measured = await measureDashboard(page);
    await page.screenshot({ path: join(OUT, shot.file) });
    record({ ...shot, section: 'scroll', measured });
  }

  console.log(`  RPCs answered: ${[...stubbed].sort().join(', ')}`);
  if (unexpected.length) console.warn(`  ! unexpected backend calls: ${[...new Set(unexpected)].join(', ')}`);
  await context.close();
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// SECTION 3 — the EXPORTED controller: the third surface, and the one a dead network drops to
// ═════════════════════════════════════════════════════════════════════════════════════════
async function sectionController(browser) {
  console.log('\n[controller] the exported production controller');
  const context = await browser.newContext({ viewport: REPORTED, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await createProject(page, { name: 'Arena Quiz' });

  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantById('qz01').create({});
    const { doc } = createGraphic(tpl, { name: 'Arena Quiz' });
    const show = shows.createShowNamed('Owner Read');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id);
    shows.updateShowCue(show.id, fresh0.cues[0].id, { label: 'Question one' });
    const board = variantById('sb01').create({});
    shows.addGraphicToShow(show.id, board, {});
    const fresh1 = shows.loadShows().find((s) => s.id === show.id);
    shows.updateShowCue(show.id, fresh1.cues[fresh1.cues.length - 1].id, { label: 'Match board' });
    const fresh = shows.loadShows().find((s) => s.id === show.id);
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^[^/]+\//, ''), await zip.file(name).async('string'));
  }

  // LOCAL RELAY protocol v1, in-process - the same shape e2e/_relay.ts serves, so the exported
  // surface is driven exactly as it is driven under test rather than opened as a dead page.
  const rows = [];
  let head = 0;
  const serve = (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/relay/ping') return route.fulfill({ json: { ok: true, v: 1, head } });
    if (url.pathname === '/relay/head') return route.fulfill({ json: { head } });
    if (url.pathname === '/relay/log') {
      const after = Number(url.searchParams.get('after') ?? '0');
      return route.fulfill({ json: { rows: rows.filter((r) => r.id > after).slice(0, 500), head } });
    }
    if (url.pathname === '/relay/send') {
      const body = route.request().postDataJSON();
      const items = body.items ?? [body];
      for (const item of items) rows.push({ id: ++head, graphic: String(item.graphic), stream: item.stream || 'program', msg: item.msg });
      return route.fulfill({ json: { head } });
    }
    const file = files.get(decodeURIComponent(url.pathname.replace(/^\//, '')));
    if (file == null) return route.fulfill({ status: 404, body: 'nf' });
    const type = url.pathname.endsWith('.json') ? 'application/json' : 'text/html';
    return route.fulfill({ status: 200, contentType: type, body: file });
  };
  const origin = 'http://owner-read.local';
  const ctl = await context.newPage();
  await ctl.route(`${origin}/**`, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await wait(ctl, 1_500);
  await ctl.locator('.cue', { hasText: 'Question one' }).first().click();
  await wait(ctl, 1_200);
  await ctl.screenshot({ path: join(OUT, 'controller-1536x814.png') });
  record({
    section: 'scroll',
    file: 'controller-1536x814.png',
    title: 'The EXPORTED controller at 1536×814 — the same dashboard, shipped in the package',
    question:
      'The surface a dead network drops to, carrying the same re-lay: verbs beside PROGRAM, the bar inside the sticky head, the monitor cap growing with the window. Is the package still the same product as the app that generated it?',
    note:
      'Driven through the bundled local relay, a cue selected onto PREVIEW. Three surfaces render this dashboard and the contract says they must not diverge — this one and the in-app page above are two of the three. ONE DIFFERENCE IS VISIBLE HERE, stated as an observation and not as a verdict: with nothing on air this surface offers all five ⚡ actions and carries no state chip, where the in-app page at the same moment (frame “Contextual cue controls — OFF AIR”) greys all five and says “not on air”.',
  });

  await ctl.setViewportSize(SHORT);
  await wait(ctl, 800);
  await ctl.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await wait(ctl, 400);
  await ctl.screenshot({ path: join(OUT, 'controller-1536x560.png') });
  record({
    section: 'scroll',
    file: 'controller-1536x560.png',
    title: 'The exported controller in a short window — 1536×560, scrolled down',
    question:
      'The exported surface at the same short window. Do all three still behave alike where the room runs out?',
    note: 'Same package, same relay, viewport shortened and the page scrolled to its end.',
  });

  await context.close();
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// SECTION 4 — the INTERACTIVE PLAYOUT PLANE: screens, not prose
// ═════════════════════════════════════════════════════════════════════════════════════════
async function sectionInteractive(browser) {
  console.log('\n[interactive] contextual controls, Data, vote-to-air, presenter, join');
  const context = await browser.newContext({ viewport: REPORTED, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // ── 4a. The ⚡ GRAPHIC ACTIONS on a quiz: structural greying, and the chip it is judged on ──
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');
  await page.locator('.pd-cue').first().click();
  await wait(page, 1_000);
  await page.screenshot({ path: join(OUT, 'interactive-actions-offair.png') });
  record({
    section: 'interactive',
    file: 'interactive-actions-offair.png',
    title: 'Contextual cue controls — OFF AIR',
    question:
      'Every ⚡ action is greyed and the state chip says what the greying is judged against. Does a student reading this screen understand WHY the buttons are dead, without being told?',
    note: 'The greying is STRUCTURAL: a transition is offered only if the author drew that arrow from the current state. No expression language, ever.',
  });

  await page.getByTestId('verb-take').click();
  await wait(page, 2_500);
  await page.screenshot({ path: join(OUT, 'interactive-actions-live.png') });
  record({
    section: 'interactive',
    file: 'interactive-actions-live.png',
    title: 'Contextual cue controls — LIVE, at the Question beat',
    question:
      'The same block after Take. Are the actions that are now legal the ones you would expect to be able to press at this moment in a quiz?',
    note: 'The chip names the machine state the legality is computed from; the verb bar shows its keyboard chips beside each control.',
  });

  const select = page.getByTestId('cue-action-select');
  if (await select.count()) {
    await select.first().click();
    await wait(page, 2_000);
    await page.screenshot({ path: join(OUT, 'interactive-actions-selected.png') });
    record({
      section: 'interactive',
      file: 'interactive-actions-selected.png',
      title: 'One beat later — an answer selected on air',
      question:
        'The action fired, PROGRAM changed and the legal set moved with it. Is the operator’s picture of “where the graphic is” trustworthy from this screen alone?',
      note: 'PROGRAM here is the same renderer the published /output page runs, so what this monitor shows is what airs.',
    });
  }

  // ── 4b. The DATA workspace: the empty state that was rebuilt, and a filled table ──
  await page.getByTestId('tab-data').click();
  await page.waitForSelector('[data-testid="production-data"]', { timeout: 20_000 });
  await wait(page, 1_000);
  await page.screenshot({ path: join(OUT, 'interactive-data-empty.png') });
  record({
    section: 'interactive',
    file: 'interactive-data-empty.png',
    title: 'The Data workspace, empty',
    question:
      'This state was a header and one sentence over ~830px of nothing until 2026-08-12. Does it now answer its own question — what a table is for here, and which column names would bind on THIS production?',
    note: 'The three doors are one cluster that holds together and wraps together, rendered inside the empty state while there is nothing else on the screen.',
  });

  await page.getByTestId('add-dataset').click();
  await wait(page, 800);
  const dataset = page.locator('.pd-dataset');
  const fillRow = async (index, cells) => {
    const row = dataset.locator('tbody tr').nth(index);
    for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);
  };
  await fillRow(0, ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B']);
  await page.getByTestId('add-row').click();
  await wait(page, 400);
  await fillRow(1, ['Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 'C']);
  await page.getByTestId('add-row').click();
  await wait(page, 400);
  await fillRow(2, ['Who painted the Night Watch?', 'Vermeer', 'Rembrandt', 'Hals', 'Steen', 'B']);
  await wait(page, 800);
  await page.screenshot({ path: join(OUT, 'interactive-data-table.png') });
  record({
    section: 'interactive',
    file: 'interactive-data-table.png',
    title: 'A quiz bank authored on the Data tab',
    question:
      'Three questions typed into the show’s own table. Is this a grid a teacher would prepare a lesson in, or does it want to be a spreadsheet import?',
    note: 'The preset’s columns spell the quiz graphic’s own field titles — the same words an imported CSV header is matched against.',
  });

  await page.getByTestId('tab-playout').click();
  await wait(page, 1_200);
  const load = page.getByTestId('cue-load-row');
  if (await load.count()) {
    await load.selectOption({ label: 'Quiz questions: Which ocean is the largest?' }).catch(() => {});
    await wait(page, 1_800);
  }
  await page.screenshot({ path: join(OUT, 'interactive-data-loaded.png') });
  record({
    section: 'interactive',
    file: 'interactive-data-loaded.png',
    title: 'A row loaded into the cue — the draft filled, air untouched',
    question:
      'A table row became a cue’s field values and PREVIEW followed. Does the screen make it obvious that nothing has aired yet?',
    note: 'The load fills the DRAFT. Take is still the one door to Program.',
  });

  // ── 4c. VOTE TO AIR, on a production whose pool holds a vote board ──
  const vote = await context.newPage();
  await createProject(vote, { category: 'Polls', name: 'House Vote' });
  await productionFor(vote, 'Derby Night');
  await vote.getByTestId('tab-audience').click();
  await vote.waitForSelector('[data-testid="production-audience"]', { timeout: 20_000 });
  await wait(vote, 1_000);
  await vote.screenshot({ path: join(OUT, 'interactive-audience-empty.png') });
  record({
    section: 'interactive',
    file: 'interactive-audience-empty.png',
    title: 'The Audience workspace before anyone has joined',
    question:
      'The inbox, the round composer and the viewer preview, with nothing in them. Does an operator opening this cold know what the room is being asked, and what to press first?',
    note: 'The audience plane runs on the LOCAL provider here — in memory, with a simulator — which is what makes this walk drivable offline.',
  });

  await vote.getByTestId('audience-round-question').fill('Who wins the derby?');
  await vote.getByTestId('audience-round-options').fill('The home side\nThe visitors\nA draw');
  await vote.getByTestId('audience-round-open').click();
  await wait(vote, 1_200);
  await vote.getByTestId('audience-simulate-votes').click();
  await wait(vote, 4_000);
  await vote.screenshot({ path: join(OUT, 'interactive-vote-open.png') });
  record({
    section: 'interactive',
    file: 'interactive-vote-open.png',
    title: 'A vote open, votes landing, the tally moving',
    question:
      'The round is open and the counts are climbing. Is the tally readable at a glance from across a gallery, and is “the room can see this right now” unmistakable?',
    note: 'The MODE travels with the round and the selector locks while it is open, so the operator’s screen cannot say “Questions” over a live poll.',
  });

  await vote.getByTestId('audience-round-stage').click();
  await wait(vote, 1_500);
  await vote.screenshot({ path: join(OUT, 'interactive-vote-staged.png') });
  record({
    section: 'interactive',
    file: 'interactive-vote-staged.png',
    title: 'Staged — the counts became an ordinary cue',
    question:
      'Staging wrote a cue and stopped. Does the surface say clearly enough that this has NOT aired?',
    note: 'The counts land as the poll board’s own `Label | count` idiom, so the renderer never learns votes exist. Re-staging updates that one cue rather than adding a row per refresh.',
  });

  await vote.getByTestId('tab-playout').click();
  await wait(vote, 1_200);
  const voteCue = vote.locator('.pd-cue', { hasText: 'Vote —' }).first();
  if (await voteCue.count()) {
    await voteCue.click();
    await wait(vote, 1_500);
    await vote.getByTestId('verb-take').click();
    await wait(vote, 3_000);
  }
  await vote.screenshot({ path: join(OUT, 'interactive-vote-onair.png') });
  record({
    section: 'interactive',
    file: 'interactive-vote-onair.png',
    title: 'The vote on air, after a deliberate Take',
    question:
      'The audience’s own counts, aired by an operator pressing Take. Is the board on PROGRAM one you would put on a channel?',
    note: 'This is the rule the whole plane exists for: nothing a viewer wrote reaches Program without an operator pressing Take.',
  });

  // ── 4d. PRESENTER pointers, and the audience join page as the room sees it ──
  const room = await context.newPage();
  await createProject(room, { name: 'House Q&A' });
  await productionFor(room, 'Phone In');
  await room.getByTestId('tab-audience').click();
  await room.waitForSelector('[data-testid="production-audience"]', { timeout: 20_000 });
  await room.getByTestId('audience-simulate').click();
  await wait(room, 1_500);
  const rows = room.locator('.pd-aud-row');
  await rows.nth(0).getByTestId('audience-presenter-now').click().catch(() => {});
  await wait(room, 500);
  await rows.nth(1).getByTestId('audience-presenter-next').click().catch(() => {});
  await wait(room, 1_200);
  await room.screenshot({ path: join(OUT, 'interactive-presenter-pointers.png') });
  record({
    section: 'interactive',
    file: 'interactive-presenter-pointers.png',
    title: 'The inbox with 🎤 Now and ⇢ Next pointed at two questions',
    question:
      'A producer has queued what the presenter reads next. From this screen, is it obvious which question is in the presenter’s hand right now — and that pointing at one has not put it in front of anyone else?',
    note: 'The pointers are IDS, so a later tidy-up of the wording follows into the presenter’s hand. They reach no rundown and no command log.',
  });

  await room.getByTestId('audience-preview-details').locator('summary').click();
  await wait(room, 600);
  await room.getByTestId('audience-open').check();
  await wait(room, 1_200);
  const preview = room.getByTestId('audience-preview');
  await preview.scrollIntoViewIfNeeded();
  await wait(room, 600);
  await preview.screenshot({ path: join(OUT, 'interactive-join-open.png') }).catch(() => {});
  record({
    section: 'interactive',
    file: 'interactive-join-open.png',
    title: 'The audience join page — the room’s own screen, taking questions',
    question:
      'This is what a phone in the hall shows. Is it something you would read a URL out on air for?',
    note:
      'joinSurface.ts is the ONE renderer both the public /join page and this operator preview mount, so this frame is the real page and not a drawing of it. Cropped to the preview’s phone-shaped frame.',
  });

  await room.getByTestId('audience-mode').selectOption('comment').catch(() => {});
  await wait(room, 1_000);
  await preview.screenshot({ path: join(OUT, 'interactive-join-comment.png') }).catch(() => {});
  record({
    section: 'interactive',
    file: 'interactive-join-comment.png',
    title: 'The same page asked for comments instead of questions',
    question:
      'The mode changed what the room is asked for. Do the two modes read as different enough to matter, or is this one screen with a different heading?',
    note: 'The operator preview is read-only by design: an operator cannot put words in the audience’s mouth from it.',
  });

  // The PUBLIC page itself, offline: the honest state, so the gap is a frame rather than a
  // sentence somebody has to remember.
  const publicJoin = await context.newPage();
  await publicJoin.setViewportSize({ width: 420, height: 860 });
  await publicJoin.goto(`${BASE}/join?p=owner-read-pack`, { waitUntil: 'domcontentloaded' });
  await wait(publicJoin, 1_500);
  await publicJoin.screenshot({ path: join(OUT, 'interactive-join-offline.png') });
  record({
    section: 'interactive',
    file: 'interactive-join-offline.png',
    title: 'The public /join page on an offline build',
    question:
      'THIS FRAME DOES NOT ANSWER ANYTHING EITHER. An offline build has no audience plane and says so instead of showing a form that could never send. Is that the right thing for a self-hosted student build to say?',
    note:
      'The hosted walk — a real publish, a real phone, the presenter’s own tablet page — needs Supabase env and a signed-in account, and is owed separately.',
  });

  // THE LINKS PANEL IS DELIBERATELY NOT IN THIS PACK. Offline the header carries
  // "▶ Start production" where the Links button lives, because each of the four capability URLs
  // appears only once a publish has minted its slug - so there is no panel to photograph, not a
  // panel that photographs badly. It belongs to the hosted walk named in the two gap frames.

  await context.close();
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// THE INDEX — one page, every frame, each captioned with the question it asks
// ═════════════════════════════════════════════════════════════════════════════════════════
const SECTIONS = [
  {
    id: 'catalog',
    title: '1 · ig39 “Key Figures” — the catalog’s first two-column stat list',
    owed: 'docs/CATALOG_VARIETY.md and src/templates/AGENTS.md record the design as landed; nobody has looked at it on a screen.',
    ask: 'One question: does this design belong in the catalog as it stands?',
  },
  {
    id: 'scroll',
    title: '2 · The playout dashboard’s scroll model',
    owed: 'docs/PLAYOUT_DASHBOARD.md §2: “The owner’s read is still owed.”',
    ask: 'Two questions, verbatim from the contract: are the capped monitors too small to judge a graphic by, and does the space they free to the right of PROGRAM read as SIZED or as UNFINISHED?',
  },
  {
    id: 'interactive',
    title: '3 · The interactive playout plane',
    owed:
      'docs/INTERACTIVE_PLAYOUT_PLAN.md “Verification contract”: a phase is never verified on a green build. Phases 0–6 are merged and have never been visually accepted.',
    ask: 'One question per screen. This is a student-facing surface nobody has looked at, and students go live 2026-08-21.',
  },
];

function buildIndex(manifest) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const measuredRow = (m) =>
    !m
      ? ''
      : `<dl class="measured">
        <div><dt>viewport</dt><dd>${esc(m.viewport)}</dd></div>
        <div><dt>PREVIEW picture</dt><dd>${esc(m.pictureHeight)}px tall</dd></div>
        <div><dt>sticky head</dt><dd>${esc(m.monitorBlock)}px (${esc(m.monitorShareOfHeight)} of the window)</dd></div>
        <div><dt>space right of PROGRAM</dt><dd>${esc(m.spaceRightOfProgram)}px</dd></div>
        <div><dt>editor</dt><dd>${esc(m.editorHeight)}px, ${esc(m.editorHidden)}px hidden</dd></div>
        <div><dt>page scrolls</dt><dd>${esc(m.pageScrollable)}px</dd></div>
        <div><dt>empty below the last row</dt><dd>${esc(m.slackBelowLastRow)}px</dd></div>
        <div><dt>panes with their own scrollbar</dt><dd>${m.panesThatScroll.length ? esc(m.panesThatScroll.join(', ')) : 'none'}</dd></div>
      </dl>`;

  const body = SECTIONS.map((section) => {
    const own = manifest.filter((f) => f.section === section.id);
    if (!own.length) return '';
    return `<section id="${section.id}">
      <h2>${esc(section.title)}</h2>
      <p class="owed"><strong>Recorded as owed:</strong> ${esc(section.owed)}</p>
      <p class="ask">${esc(section.ask)}</p>
      ${own
        .map(
          (f) => `<figure>
        <a href="${esc(f.file)}"><img src="${esc(f.file)}" alt="${esc(f.title)}"></a>
        <figcaption>
          <h3>${esc(f.title)}</h3>
          <p class="q">${esc(f.question)}</p>
          ${f.note ? `<p class="n">${esc(f.note)}</p>` : ''}
          ${measuredRow(f.measured)}
        </figcaption>
      </figure>`,
        )
        .join('\n')}
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NoaCG Studio — owner acceptance pack</title>
<style>
  :root { color-scheme: dark; --bg:#0b0d10; --card:#14181d; --line:#252c34; --text:#e8edf2; --dim:#9aa7b4; --amber:#f0a92b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif; }
  header, section { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  header { padding-top: 44px; padding-bottom: 8px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
  h1 { font-size: 30px; margin: 0 0 10px; letter-spacing: -0.01em; }
  h2 { font-size: 21px; margin: 48px 0 6px; color: var(--amber); }
  h3 { font-size: 16px; margin: 0 0 6px; }
  p { margin: 0 0 10px; }
  .lede { color: var(--dim); max-width: 74ch; }
  .rules { color: var(--dim); font-size: 13.5px; max-width: 74ch; border-left: 2px solid var(--amber); padding-left: 14px; margin: 18px 0 26px; }
  .owed, .ask { color: var(--dim); font-size: 14px; max-width: 82ch; }
  .ask { color: var(--text); }
  nav { margin: 22px 0 6px; display: flex; gap: 14px; flex-wrap: wrap; }
  nav a { color: var(--amber); text-decoration: none; border: 1px solid var(--line); padding: 6px 12px; border-radius: 6px; }
  figure { margin: 26px 0 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; background: #000; }
  figcaption { padding: 16px 18px 18px; }
  .q { font-size: 15.5px; }
  .n { color: var(--dim); font-size: 13.5px; margin-bottom: 0; }
  .measured { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 12px 0 0; font-size: 12.5px; color: var(--dim); }
  .measured div { display: flex; gap: 6px; }
  .measured dt { color: #6f7c89; } .measured dd { margin: 0; color: var(--text); }
  footer { max-width: 1180px; margin: 60px auto 80px; padding: 0 24px; color: var(--dim); font-size: 13.5px; }
  code { background: #1b2027; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
</style></head>
<body>
<header>
  <h1>Owner acceptance pack</h1>
  <p class="lede">Every visual read this repo currently records as OWED, in one place, so the three of them
  are answered in one sitting instead of three sessions.</p>
  <p class="rules">This pack asks; it does not answer. No frame here carries a verdict, and nothing in it has
  been pre-judged — the captions are questions, and where a frame cannot answer the question it is put beside,
  it says so instead of standing in for one. Geometry-only e2e coverage is not acceptance; that is why these
  are pictures.</p>
  <nav>${SECTIONS.filter((s) => manifest.some((f) => f.section === s.id))
    .map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`)
    .join('')}</nav>
</header>
${body}
<footer>
  <p>Rebuild this pack in one command, with the dev server up on this checkout's port:</p>
  <p><code>node scripts/acceptance-pack.mjs</code></p>
  <p>Section 1's full-frame pictures come from the catalog's own sweep, which has to have run first:
  <code>node scripts/l3-sweep.mjs ./l3-shots/infographic infographic</code></p>
  <p>${manifest.length} frames. The measurements under the dashboard frames are read off the live
  document at capture time, never assumed.</p>
</footer>
</body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════════════════
const browser = await chromium.launch();
try {
  if (WANT('catalog')) await sectionCatalog(browser);
  if (WANT('scroll')) await sectionScroll(browser);
  if (WANT('hosted')) await sectionHosted(browser);
  if (WANT('controller')) await sectionController(browser);
  if (WANT('interactive')) await sectionInteractive(browser);
} finally {
  await browser.close();
}

// A partial run must not silently drop the frames an earlier run captured: the manifest is
// merged with whatever is already on disk, keyed by file name, so `… scroll` re-renders the
// index around every section rather than around one.
const manifestPath = join(OUT, 'manifest.json');
let merged = frames;
if (existsSync(manifestPath)) {
  const prior = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const byFile = new Map(prior.map((f) => [f.file, f]));
  for (const f of frames) byFile.set(f.file, f);
  // Keep the capture order the sections were written in, not the order of a partial re-run.
  const order = ['catalog', 'scroll', 'interactive'];
  merged = [...byFile.values()].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
// A frame whose PNG never landed is a hole in the pack, and a hole must read as one.
const missing = merged.filter((f) => !existsSync(join(OUT, f.file)));
if (missing.length) console.warn(`\nMISSING ${missing.length} frame(s): ${missing.map((f) => f.file).join(', ')}`);
merged = merged.filter((f) => existsSync(join(OUT, f.file)));

writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
writeFileSync(join(OUT, 'index.html'), buildIndex(merged));
console.log(`\nPack: ${join(OUT, 'index.html')}  (${merged.length} frames)`);
