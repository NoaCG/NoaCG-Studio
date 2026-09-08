// Capture the LANDING PAGE's product screenshots from the running app.
//
//   node scripts/landing-shots.mjs [--only=<name,name>]   (dev server up)
//
// The landing page shows real screenshots and never fakes product UI (src/landing/AGENTS.md).
// That policy only holds if the pictures are cheap to RE-take: a shot hand-cropped once drifts
// the moment the surface it shows is redesigned, and nobody notices because a PNG cannot fail
// a build. So every landing screenshot is produced here, by driving the real app the way the
// e2e suite does, and the file names below are the contract index.html references.
//
// Deliberately NOT part of the e2e suite: it produces artifacts, it asserts nothing. It writes
// straight into public/landing/ because the output IS the committed asset - reviewing the diff
// on those PNGs is how a stale screenshot gets caught.
//
// Each shot runs in its OWN browser context, so no shot inherits the previous one's saved work
// (the wizard auto-opens only on a first-ever visit, and a leftover project would change what
// the Entry step offers).

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(projectRoot, 'public', 'landing');
mkdirSync(outDir, { recursive: true });

const port = execSync('node scripts/dev-port.mjs', { cwd: projectRoot }).toString().trim();
const base = `http://localhost:${port}`;

const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);
const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;

/**
 * The landing renders these at ~500-800 CSS px wide, so 1.5x of a 1440 pane (2160px) is already
 * ~3x the display size - crisp on any panel. 2x was ~2.3 MB of PNG for nine pictures on a page
 * whose whole pitch is that it loads.
 */
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 1.5;

const browser = await chromium.launch();

/**
 * One shot = one fresh context.
 *
 * `run(page)` returns what to capture:
 *   a locator      - that element
 *   { cutBelow }   - the viewport, cut off just under that selector's last match. Every one of
 *                    these surfaces is a full-height app pane, so a straight viewport grab ends
 *                    in a band of empty panel (or worse, half a row). The cut is FRAMING, not
 *                    editing: nothing above it is touched or rearranged.
 *   null           - the whole viewport
 *
 * `size` overrides the viewport for surfaces whose content wants a different shape.
 */
async function shot(name, run, size = VIEWPORT) {
  if (wanted && !wanted.has(name)) return;
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    const target = await run(page);
    // `animations: 'disabled'` parks CSS/Web animations at their end state, which is what a
    // settled product surface looks like. GSAP is rAF-driven and unaffected - every shot below
    // waits for whatever it needs instead.
    const opts = { path: join(outDir, `${name}.png`), animations: 'disabled' };
    if (target && target.cutBelow) {
      const box = await page.locator(target.cutBelow).last().boundingBox();
      if (!box) throw new Error(`nothing matched ${target.cutBelow}`);
      const bottom = Math.min(size.height, Math.ceil(box.y + box.height + (target.pad ?? 22)));
      await page.screenshot({ ...opts, clip: { x: 0, y: 0, width: size.width, height: bottom } });
    } else {
      await (target ?? page).screenshot(opts);
    }
    console.log(`✓ ${name}.png`);
  } catch (e) {
    console.error(`✗ ${name}.png — ${(e ?? '').message ?? e}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

/** The wizard panel itself, not the dimmed shell behind it: the landing shows the SURFACE. */
const modal = (page) => page.locator('.wz-modal');

async function openWizard(page) {
  await page.goto(`${base}/app#/new`);
  await modal(page).waitFor();
  // The Entry step's cards mount immediately; the fonts decide the layout.
  await page.evaluate(() => document.fonts.ready);
}

/** Let the live MiniPreview / WizardPreview iframes paint before the shutter. They are real
 *  templates being built and formatted, so this is a settle, not a guess at a fixed cost. */
async function settlePreviews(page, ms = 1200) {
  await page.waitForTimeout(ms);
}

// ── 1. Entry: the ways to start ──────────────────────────────────────────────
await shot('shot-wizard-entry', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="template"]').waitFor();
  await settlePreviews(page, 500);
  return { cutBelow: '.wz-entry-card--video', pad: 34 };
});

// ── 2. Browse: the faceted template storefront, live previews on every card ──
await shot('shot-wizard-browse', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().waitFor();
  // Cards mount their preview iframe on scroll-in; give the visible row time to render.
  await settlePreviews(page, 2500);
  return modal(page);
});

// ── 3. Style: brand controls beside the live graphic ─────────────────────────
await shot('shot-wizard-style', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-browse-search').fill('House Strap');
  await page.locator('.wz-variant', { hasText: 'House Strap' }).first().click();
  // Fields → Style.
  await page.locator('.wz-next').click(); // Fields
  await page.locator('.wz-next').click(); // Style
  // Open the typeface disclosure: the palette alone leaves the form column half empty, and
  // the font library is half of what this step answers.
  await page.locator('summary', { hasText: 'Typeface' }).first().click();
  // The preview frames the whole 1920×1080 canvas by default; a lower third is a band across
  // a fraction of it. The step's own control is what a person presses here too.
  await page.locator('button', { hasText: 'Zoom to graphic' }).first().click();
  await settlePreviews(page, 2000);
  return modal(page);
});

// ── 4. Create with AI: the one AI door ───────────────────────────────────────
//
// The status route is answered so the step renders the HOSTED default - NoaCG Lite, included,
// no key. A dev checkout serves no Lite, so the step falls back to the bring-your-own-key
// surface and names a third-party model; publishing that as "how Create with AI looks" would
// describe a deployment nobody visits. Nothing else is stubbed.
await shot('shot-wizard-ai', async (page) => {
  await page.route('**/api/ai/lite/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        profile: 'lite',
        enabled: true,
        available: true,
        requiresSignIn: false,
        supportedCategories: ['lower-third', 'title-card', 'ticker', 'scoreboard'],
        limits: {
          promptCharacters: 600,
          conversationTurns: 6,
          conversationCharacters: 2400,
          fields: 2,
          logos: 1,
          logoBytes: 512_000,
        },
      }),
    }),
  );
  await openWizard(page);
  await page.locator('[data-entry="ai"]').click();
  await page.locator('.wz-drop, [data-testid="ai-prompt"]').first().waitFor();
  await settlePreviews(page, 700);
  // The settings panel opens ITSELF when nothing is configured (wizard/AGENTS.md), so the
  // frame ends on the composer row rather than through the middle of a tier list.
  return { cutBelow: '.wz-body button:has-text("AI settings")', pad: 10 };
});

// ── 5. Video or animation: the second workspace's door ───────────────────────
await shot('shot-wizard-video', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="video"]').click();
  await page.getByTestId('video-step').waitFor();
  await settlePreviews(page, 700);
  return { cutBelow: '[data-testid="video-create"]', pad: 26 };
});

// ── 6. Import graphic: fields placed on your own artwork ─────────────────────
//
// The artwork is DRAWN IN THE PAGE and handed to the real file input, because the flow
// measures whatever image it is given and a checked-in fixture would be one more picture
// nobody re-makes. What it draws stands in for the flat design a user brings from their own
// design tool: a plate with NO text on it, since placing the text is what this step is for.
//
// The shot is the TEXT step, not the drop: "bring a picture" is a file dialog anywhere, while
// editable broadcast fields sitting on somebody's own artwork is the thing worth showing.
await shot('shot-wizard-import', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="import-graphic"]').click();
  const artwork = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const plate = g.createLinearGradient(150, 690, 1250, 950);
    plate.addColorStop(0, '#121720');
    plate.addColorStop(0.55, '#1d2534');
    plate.addColorStop(1, '#2a3345');
    g.fillStyle = plate;
    g.beginPath();
    g.roundRect(150, 690, 1100, 250, 14);
    g.fill();
    // The accent column and the kicker tab: the two shapes that make a flat plate read as a
    // designed lower third rather than a grey box.
    const bar = g.createLinearGradient(150, 690, 150, 940);
    bar.addColorStop(0, '#ffc65c');
    bar.addColorStop(1, '#f6a623');
    g.fillStyle = bar;
    g.beginPath();
    g.roundRect(150, 690, 16, 250, 8);
    g.fill();
    g.fillStyle = '#f6a623';
    g.beginPath();
    g.roundRect(150, 612, 300, 56, 10);
    g.fill();
    g.strokeStyle = 'rgba(232,237,242,0.14)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(196, 858);
    g.lineTo(1200, 858);
    g.stroke();
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'channel-strap.png',
    mimeType: 'image/png',
    buffer: Buffer.from(artwork),
  });
  await page.locator('.asset-card').waitFor();
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  const stage = page.getByTestId('place-stage');
  await stage.waitFor();
  await settlePreviews(page, 900);
  const box = await stage.boundingBox();

  // Place two real fields the way a person does: arm the T tool, click where the text goes,
  // then name it and give it the words the operator will see.
  const place = async (fx, fy, title, text) => {
    await page.getByTestId('tool-text').click();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.getByTestId('field-title').fill(title);
    await page.getByTestId('field-text').fill(text);
  };
  await place(0.13, 0.735, 'Name', 'Lina Berg');
  await place(0.13, 0.83, 'Role', 'Anchor · Evening News');
  await page.getByTestId('tool-select').click();
  await settlePreviews(page, 900);
  // The viewport, not the modal element: the Text step is a WORKING surface, so the panel is
  // wider than the window and an element grab loses the right edge of the live preview.
  return null;
});

// ── 7 + 8. The playout dashboard and Home, off a seeded production ───────────
//
// Seeding runs the app's own create path (buildDraftTemplate → the library → the production),
// so the dashboard shows real graphics with their real field values - not a mock.
const SEED = [
  { design: 'House Strap', name: 'Presenter strap' },
  { design: 'Match Strip', name: 'Match scorebug' },
  { design: 'News Strip', name: 'News ticker' },
];

async function seedProduction(page) {
  await page.goto(`${base}/app`);
  await page.locator('.wz-modal, .topbar').first().waitFor();
  const showId = await page.evaluate(async (seed) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import(
      '/src/components/wizard/draft.ts'
    );
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const all = Object.values(CATALOG).flat();
    const show = createShowNamed('Evening News');
    for (const item of seed) {
      const variant = all.find((v) => v.name === item.design) ?? all[0];
      const draft = mergeDraft(initialDraft(), {
        variantId: variant.id,
        name: item.name,
        lines: variant.suggestedLines.map((l) => ({ ...l })),
      });
      const template = { ...buildDraftTemplate(variant, draft), name: item.name };
      const { doc } = createGraphic(template, { name: item.name });
      addGraphicToShow(show.id, template, { graphicId: doc.id });
    }
    // A durable write is accepted synchronously and lands a moment later - navigating before
    // it commits loses the last graphic or two (e2e/AGENTS.md "Gotchas when writing a spec").
    await commitDurableWrites();
    return show.id;
  }, SEED);
  return showId;
}

await shot('shot-playout', async (page) => {
  const showId = await seedProduction(page);
  await page.goto(`${base}/app#/production/${showId}`);
  await page.getByTestId('production-page').waitFor();
  await page.locator('.pd-cue').first().waitFor();
  await settlePreviews(page, 2000);
  // Put something on AIR: offline the verbs drive the local PROGRAM monitor, so this is a real
  // take of a real graphic, not a dressed-up still.
  await page.getByTestId('verb-take').click();
  await settlePreviews(page, 2500);
  return null;
}, { width: 1440, height: 820 });

await shot('shot-home', async (page) => {
  await seedProduction(page);
  await page.goto(`${base}/app#/home`);
  await page.locator('.home-page').waitFor();
  await settlePreviews(page, 2500);
  return { cutBelow: '.home-shelf-card', pad: 30 };
}, { width: 1440, height: 820 });

// ── 9. Export: one package for whichever system you run ──────────────────────
await shot('shot-export', async (page) => {
  await openWizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-browse-search').fill('House Strap');
  await page.locator('.wz-variant', { hasText: 'House Strap' }).first().click();
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-export').click();
  // Creating formats through Prettier on a cold module - the same 20 s the import spec documents.
  await page.getByTestId('export-window').waitFor({ timeout: 40_000 });
  await settlePreviews(page, 1200);
  // The dialog scrolls on past the targets into the per-engine compatibility report. The
  // targets ARE the claim being made here; the report is a thing you read once you have picked.
  return { cutBelow: '.export-window-body label.issue', pad: 4 };
  // Narrower than the rest on purpose: the dialog is a fixed width, so on a 1440 window the
  // shot is half empty shell and the target list lands unreadably small on the page.
}, { width: 1080, height: 900 });

await browser.close();
