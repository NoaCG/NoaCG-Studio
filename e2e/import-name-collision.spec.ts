import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { settleDurableWrites } from './_durable';

// IMPORTING UNDER A NAME THE LIBRARY ALREADY HOLDS
// (docs/acceptance/owner-queue/2026-09-08-importing-your-artwork-twice-keeps-one-graphic.md).
//
// The student sequence this protects: build a production on an imported graphic, iterate on the
// artwork in Illustrator, import it again under the name you naturally reuse. Before 2026-09-08
// every such import MINTED A SECOND library record under the same name, and the production's
// pool copy - which replaces by name - silently re-pointed its back-link at the new record. The
// student was left with two rows on Home they could not tell apart, the first one detached from
// the production that had been built on it, and the graphic's saved control entries unresolvable
// (two records under one name makes `resolveSavedGraphicDoc`'s name fallback ambiguous by design).
//
// The rule now: a saved graphic's NAME IS ITS IDENTITY, in the library exactly as it always was
// in the production pool. A wizard save under a held name writes OVER that record, keeping its
// id - so every production pooling it keeps pointing at the same graphic - and the Finish step's
// confirmation, which already fires on every press of that door, says which of the two things
// this press does before it happens.

/** A believable foreign SPX template: one operator field, no house contracts. */
function foreignHtml(title: string, field: string, label: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<script>window.SPXGCTemplateDefinition = {
  "description": "${title}", "playserver": "OVERLAY", "playchannel": "1",
  "playlayer": "9", "webplayout": "9", "out": "manual", "dataformat": "json",
  "DataFields": [ { "field": "${field}", "ftype": "textfield", "title": "${label}", "value": "${label} value" } ]
};</script>
<style>body { margin: 0; background: transparent; } #bug { position: absolute; top: 40px; left: 40px; color: #fff; font: bold 40px sans-serif; }</style>
</head>
<body>
  <div id="bug"><span id="${field}">${label} value</span></div>
  <script>
    function update(data) { var f = JSON.parse(data); for (var k in f) { var el = document.getElementById(k); if (el) el.textContent = f[k]; } }
    function play() {} function stop() {} function next() {}
  </script>
</body>
</html>`;
}

/** The same template as the SPX-style package a student's tool exports. */
async function zipOf(html: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('css/template.css', '/* packaged */');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

/** Version one: field `f0`. Version two: the same <title>, a DIFFERENT field. */
const V1 = foreignHtml('Match Score', 'f0', 'Home team');
const V2 = foreignHtml('Match Score', 'f9', 'Sponsor');

const htmlFile = (name: string, html: string) => ({ name, mimeType: 'text/html', buffer: Buffer.from(html) });
const zipFile = async (name: string, html: string) => ({ name, mimeType: 'application/zip', buffer: await zipOf(html) });

interface Snapshot {
  library: { id: string; name: string; fields: string[] }[];
  pool: { id: string; name: string; graphicId: string | null; fields: string[] }[];
  cues: { id: string; sourceId: string; values: Record<string, string> }[];
  /** What the pool copy resolves to through the shared library seam - undefined when the name
   *  it has to fall back on is ambiguous. */
  resolvedId: string | null;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return (await page.evaluate(async () => {
    const { loadGraphics, resolveSavedGraphicDoc } = await import('/src/model/library.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    const library = loadGraphics();
    const show = loadShows()[0];
    const copy = show?.graphics[0];
    return {
      library: library.map((g) => ({ id: g.id, name: g.name, fields: g.template.fields.map((f) => f.field) })),
      pool: (show?.graphics ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        graphicId: g.graphicId ?? null,
        fields: g.template.fields.map((f) => f.field),
      })),
      cues: (show?.cues ?? []).map((c) => ({ id: c.id, sourceId: c.sourceId, values: c.values })),
      resolvedId: copy ? resolveSavedGraphicDoc({ ...copy, graphicId: undefined }, library)?.id ?? null : null,
    };
  })) as Snapshot;
}

/**
 * Drop a template file into the "Import graphic" walk and press the Finish step's production
 * door, answering its confirmation. Returns the confirmation's text - the sentence the student
 * reads before the write happens is half of what this spec is about.
 */
async function importIntoProduction(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  production: 'new' | 'existing',
  productionName = 'Class',
): Promise<string> {
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId('import-template-card')).toBeVisible();
  await page.locator('button.wz-next').click();
  await expect(page.getByTestId('wz-finish-production-pick')).toBeVisible();
  if (production === 'new') {
    await page.getByTestId('wz-finish-production').selectOption('new');
    await page.getByTestId('wz-finish-production-name').fill(productionName);
  } else {
    const labels = await page.getByTestId('wz-finish-production').locator('option').allTextContents();
    await page.getByTestId('wz-finish-production').selectOption({ label: labels.find((l) => l.startsWith(productionName))! });
  }
  await page.getByTestId('wz-finish-production-go').click();
  const confirm = page.getByTestId('wz-finish-production-confirm');
  await expect(confirm).toBeVisible();
  const said = await confirm.innerText();
  await page.getByTestId('wz-finish-production-confirm-go').click();
  // 20 s: the door saves, pools and routes, and the wizard only closes once all three land.
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  return said;
}

/** Come back for a second import the way a student does: a fresh visit, then "+ New graphic". */
async function returnForAnotherImport(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  const wizard = page.getByTestId('creation-wizard');
  if (!(await wizard.isVisible())) {
    await page.getByRole('button', { name: '+ New graphic' }).click();
    const guard = page.getByTestId('confirm-switch');
    await expect(guard.or(wizard)).toBeVisible();
    if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
  }
  await expect(wizard).toBeVisible();
}

async function firstImport(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await importIntoProduction(page, file, 'new');
  await settleDurableWrites(page);
}

test('a second .html import under one name saves OVER the graphic, and the cue keeps its graphic', async ({ page }) => {
  await firstImport(page, htmlFile('match-score.html', V1));
  const before = await snapshot(page);
  expect(before.library).toHaveLength(1);
  expect(before.pool[0].graphicId).toBe(before.library[0].id);
  expect(before.cues[0].values).toEqual({ f0: 'Home team value' });

  await returnForAnotherImport(page);
  const said = await importIntoProduction(page, htmlFile('match-score-v2.html', V2), 'existing');
  await settleDurableWrites(page);
  const after = await snapshot(page);

  // ONE record, still the one the production was built on. Pre-fix this was two, and the pool's
  // back-link had moved to the second - the shape that detached the student's graphic.
  expect(after.library).toHaveLength(1);
  expect(after.library[0].id).toBe(before.library[0].id);
  expect(after.library[0].fields).toEqual(['f9']); // the new version really did land
  expect(after.pool[0].id).toBe(before.pool[0].id);
  expect(after.pool[0].graphicId).toBe(before.library[0].id);

  // The cue survives, on the same pool entry, holding the values it was prepared with. It is
  // not re-seeded and not dropped: a value whose field came back would address it again.
  expect(after.cues).toHaveLength(1);
  expect(after.cues[0].id).toBe(before.cues[0].id);
  expect(after.cues[0].sourceId).toBe(before.pool[0].id);
  expect(after.cues[0].values).toEqual({ f0: 'Home team value' });

  // One name, one graphic - so the library seam can still resolve a pool copy that has no
  // back-link to fall back on. Two records under one name made this ambiguous, by design.
  expect(after.resolvedId).toBe(before.library[0].id);

  // And the student was told, in the dialog that already fires on every press of this door.
  expect(said).toContain('Replace it in this production?');
  expect(said).toContain('is saved over the version in your library');
  expect(said).toContain('Home team'); // the cue value that stops addressing a field, by name
});

test('the Finish step says the name is taken on the field every door shares', async ({ page }) => {
  await firstImport(page, htmlFile('match-score.html', V1));

  await returnForAnotherImport(page);
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(htmlFile('match-score-v2.html', V2));
  await expect(page.getByTestId('import-template-card')).toBeVisible();
  await page.locator('button.wz-next').click();

  // The EXPORT door sits beside the production one and saves with no dialog at all, so the
  // fact that this name is already a graphic has to be readable before any door is pressed.
  await expect(page.getByTestId('wz-finish-name-taken')).toContainText(
    'Your library already has a graphic called Match Score',
  );
  // And it goes the moment the reader says this is a different graphic - which is the whole of
  // "keep both", without a control that picks a name nobody chose.
  await page.getByTestId('wz-finish-name').fill('Match Score v2');
  await expect(page.getByTestId('wz-finish-name-taken')).toBeHidden();
});

test('the same collision through an SPX-style .zip', async ({ page }) => {
  await firstImport(page, await zipFile('match-score.zip', V1));
  const before = await snapshot(page);
  expect(before.library).toHaveLength(1);

  await returnForAnotherImport(page);
  await importIntoProduction(page, await zipFile('match-score.zip', V2), 'existing');
  await settleDurableWrites(page);
  const after = await snapshot(page);

  expect(after.library).toHaveLength(1);
  expect(after.library[0].id).toBe(before.library[0].id);
  expect(after.library[0].fields).toEqual(['f9']);
  expect(after.pool[0].graphicId).toBe(before.library[0].id);
  expect(after.cues[0].id).toBe(before.cues[0].id);
});

test('the identical file imported twice leaves one graphic, not a twin', async ({ page }) => {
  await firstImport(page, htmlFile('match-score.html', V1));
  const before = await snapshot(page);

  await returnForAnotherImport(page);
  const said = await importIntoProduction(page, htmlFile('match-score.html', V1), 'existing');
  await settleDurableWrites(page);
  const after = await snapshot(page);

  expect(after.library).toHaveLength(1);
  expect(after.library[0].id).toBe(before.library[0].id);
  expect(after.pool).toHaveLength(1);
  expect(after.cues).toHaveLength(1);
  // Nothing changed about the fields, so the dialog has no cue values to warn about.
  expect(said).not.toContain('no longer match a field');
});

test('a re-import into a DIFFERENT production still says it saves over the library record', async ({ page }) => {
  await firstImport(page, htmlFile('match-score.html', V1));
  const before = await snapshot(page);

  // The pool collision cannot answer this one: a new production holds no copy of the graphic,
  // and the library write still lands on the record the first import made.
  await returnForAnotherImport(page);
  const said = await importIntoProduction(page, htmlFile('match-score-v2.html', V2), 'new', 'Second show');
  await settleDurableWrites(page);

  expect(said).toContain('Save over Match Score and add it here?');
  expect(said).toContain('is saved over the version in your library');

  const names = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  });
  expect(names).toEqual(['Match Score']);
  const shows = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().map((s) => ({ name: s.name, pooled: s.graphics.map((g) => g.graphicId ?? null) }));
  });
  // BOTH productions pool the same record, so both air the version the student just imported.
  expect(shows).toHaveLength(2);
  for (const show of shows) expect(show.pooled).toEqual([before.library[0].id]);
});

// ── A RENAME MID-WALK, AND WHAT IT IS ALLOWED TO REACH ───────────────────────────────────────
//
// Everything above answers "what does this name already mean" for a walk that has saved NOTHING
// yet - the student coming back with a second version of their own artwork. The two cases below
// are the other half: a walk that has ALREADY made a record, and then types a different name.

/** Last week's graphic, and today's - different artwork, different operator field, and the
 *  student is about to type one of the names while the other is on screen. */
const AWAY = foreignHtml('Away Team', 'zz', 'Sponsor name');
const SPONSOR = foreignHtml('Sponsor', 'f0', 'Home team');

/** Walk an imported file as far as the Finish step, in an already-open wizard. */
async function importToFinish(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId('import-template-card')).toBeVisible();
  await page.locator('button.wz-next').click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

/** Press the EXPORT door and close the window it opens - the one door that saves and leaves the
 *  wizard standing on Finish, which is what makes a second press reachable at all. */
async function exportFromFinish(page: Page): Promise<void> {
  await page.getByTestId('wz-finish-export').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await win.locator('.gallery-close').click();
  await expect(win).toBeHidden();
  await settleDurableWrites(page);
}

test('a rename mid-walk never writes over a graphic this walk did not make', async ({ page }) => {
  // LAST WEEK: "Away Team", its own artwork (field `zz`), pooled into a production.
  await firstImport(page, htmlFile('away-team.html', AWAY));
  const before = await snapshot(page);
  expect(before.library).toHaveLength(1);
  const stranger = before.library[0];
  expect(stranger.name).toBe('Away Team');
  expect(stranger.fields).toEqual(['zz']);

  // TODAY: a different graphic entirely, saved under its own name by the export door.
  await returnForAnotherImport(page);
  await importToFinish(page, htmlFile('sponsor.html', SPONSOR));
  await page.getByTestId('wz-finish-name').fill('Sponsor');
  await exportFromFinish(page);

  // ...and then renamed, in the SAME walk, onto a name that means somebody else's graphic. The
  // step says which of the two graphics moves before any door is pressed.
  await page.getByTestId('wz-finish-name').fill('Away Team');
  await expect(page.getByTestId('wz-finish-name-twin')).toContainText(
    'A different graphic in your library is already called Away Team',
  );
  await expect(page.getByTestId('wz-finish-name-taken')).toBeHidden();
  await exportFromFinish(page);

  const after = await snapshot(page);
  // THE WHOLE TEST. Last week's artwork is still last week's artwork. A save that reaches
  // across to it because the two share a name destroys work this walk never opened, and no
  // student gets it back.
  const kept = after.library.find((g) => g.id === stranger.id);
  expect(kept?.fields).toEqual(['zz']);
  expect(kept?.name).toBe('Away Team');
  // The production built on it still points at it, and its cue still addresses a real field.
  expect(after.pool[0].graphicId).toBe(stranger.id);
  expect(after.cues[0].values).toEqual({ zz: 'Sponsor name value' });

  // The record THIS WALK made is what moved: renamed, not duplicated, and not left orphaned
  // under the name the reader abandoned.
  expect(after.library).toHaveLength(2);
  const mine = after.library.find((g) => g.id !== stranger.id);
  expect(mine?.name).toBe('Away Team');
  expect(mine?.fields).toEqual(['f0']);
});

test('a name taken while Finish is open is still disclosed before the door writes', async ({ page }) => {
  // The Finish step read the library when it OPENED. A record that appears afterwards - another
  // tab, another door press in this same walk - left the step saying nothing while the save
  // wrote over that record anyway, which is exactly the case the disclosure exists for.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await importToFinish(page, htmlFile('sponsor.html', SPONSOR));
  await page.getByTestId('wz-finish-name').fill('Away Team');
  await expect(page.getByTestId('wz-finish-name-taken')).toBeHidden();

  // Somewhere else, "Away Team" becomes a graphic.
  await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { doc, error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'Away Team' });
    if (error || !doc) throw new Error(error ?? 'seed failed');
  });
  await settleDurableWrites(page);

  await expect(page.getByTestId('wz-finish-name-taken')).toContainText(
    'Your library already has a graphic called Away Team',
  );
});
