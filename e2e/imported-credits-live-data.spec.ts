// covers: src/templates/importedDesign/creditsRoll.ts, src/templates/importedDesign/svg.ts
// covers: src/control/contentFormats.ts, src/components/home/SourcesLine.tsx, src/components/home/CueEditor.tsx
// covers: e2e/fixtures/jev-svg/dev/credits-1.svg, e2e/fixtures/jev-svg/dev/credits-2.svg
//
// LINKED CREDITS ON AIR (jev-svg-import row 24, AC-14 and AC-24). A Sheet connected to imported
// credits keeps the prepared list current, and what is on air follows one rule per playback:
//
//  - A ROLL OR CARDS ON AIR KEEP THE LIST THEY TOOK. A refresh reaches the graphic, which holds it
//    for the next Take: the moving rows and the card on screen do not change under the viewer,
//    the roll is not restarted, and the production page says newer data shows on the next Take,
//    from the graphic's own answer on PROGRAM (#1980): on the source line and, for a typed Update,
//    in the on-air cue's editor (#1979).
//    A new Scroll speed or Card time still acts on air, as before.
//  - A STILL PAGE shows a refresh at once: nothing moves, so nothing replays.
//  - OFF AIR the prepared rows follow every write, and the next Take airs the newest list. An
//    empty Sheet clears the list at that Take; filled again, the list comes back.
//
// And #1973: a still page whose face starts loading at its Take, after the load-time refit had
// already run, is fitted again when the face lands, once however many updates came meanwhile.
//
// Row 25 (AC-14): a FAILING SHEET. Read from a local fake of the export
// (e2e/fixtures/jev-sheet-server.mjs), a denial, a read that never answers, a dropped connection
// and a sign-in page are each said on the source line and write nothing: the prepared rows keep
// the last good list. The next good read reconnects, the rows follow, the Take airs the newest
// list in the drawn looks, and no model is asked anything on the way.

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';
import { dropSvg, intoProduction } from './_svg-import';
import { startSheetServer, csvOf, MODEL_REQUEST, PAGE_FAILURES } from './fixtures/jev-sheet-server.mjs';

const ABOVE_CREDITS_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/credits-1.svg', import.meta.url));
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NoaCGCreditsSheet00000000/edit#gid=0';

/** A Sheet tab the test edits: every read answers what it holds now. */
async function stubSheet(page: Page, rows: string[][]) {
  const tab = { csv: csvOf(rows) };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv }),
  );
  return { set: (next: string[][]) => { tab.csv = csvOf(next); } };
}

/** Walk credits-1 through the wizard as role-above styled credits, played as `playback`. */
async function styledCreditsProduction(page: Page, playback: 'roll' | 'cards', name: string) {
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', 'role-above');
  await page.getByTestId('map-svg-credits-playback').selectOption(playback);
  await intoProduction(page, name, `${name} night`);
  await settleDurableWrites(page);
}

/** Connect the stubbed Sheet to the selected cue, as the operator does. */
async function connectSheet(page: Page, label: string, link = SHEET_URL) {
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(link);
  await review.getByTestId('cue-connect-read').click();
  await review.getByTestId('cue-connect-label').fill(label);
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('sources-line')).toContainText('checked');
}

const TAB = [['Role', 'Name'], ['Research', 'Nia Vale'], ['', 'Tomas Fen'], ['Sound', 'Ari Moss']];
const NEWER = [['Role', 'Name'], ['Camera', 'Jonas Berg'], ['', 'Ida Lake'], ['Director', 'Alex Rivera']];

test('a Sheet refresh keeps a rolling list as taken, says newer data waits, and the next Take airs it; empty clears and fills again', async ({ page }) => {
  test.setTimeout(120_000);
  const sheet = await stubSheet(page, TAB);
  await styledCreditsProduction(page, 'roll', 'Live roll');
  await connectSheet(page, 'Crew');
  // The list field follows the Sheet through the credits adapter.
  await expect(page.getByTestId('cue-connected-mark').first()).toBeVisible();

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  const roll = () => air.locator('.imported-design-credits-roll').evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: { progress(): number; __mark?: number } | null; noacgCreditsWaiting: boolean };
    return { mark: w.noacgCreditsTween?.__mark ?? null, progress: w.noacgCreditsTween?.progress() ?? null, waiting: w.noacgCreditsWaiting };
  });
  await expect.poll(async () => (await roll()).progress).not.toBeNull();
  // Mark the running roll, so a restarted one is told apart from the one taken.
  await air.locator('.imported-design-credits-roll').evaluate(() => {
    (window as unknown as { noacgCreditsTween: { __mark?: number } }).noacgCreditsTween.__mark = 1;
  });
  const waitingLine = page.getByTestId('source-waiting');
  await expect(waitingLine).toHaveCount(0);

  // THE SHEET CHANGES while the list rolls: the refresh reaches the graphic, which keeps the rows
  // it took and keeps rolling them; the production page says the newer data shows on the next Take.
  const before = await roll();
  sheet.set(NEWER);
  await expect.poll(() => roll().then((r) => r.waiting), { timeout: 20_000, message: 'the refresh reached the graphic' }).toBe(true);
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  const during = await roll();
  expect(during.mark, 'the roll taken is the roll running').toBe(1);
  expect(during.progress!, 'the roll was not restarted').toBeGreaterThan(before.progress!);
  await expect(waitingLine).toHaveText('· Newer data shows on the next Take');
  await expect(waitingLine).toHaveAttribute('title', 'On air: Live roll');
  // The on-air cue's editor says it too, beside Update (#1979), from the same answer.
  await expect(page.getByTestId('cue-unsent')).toHaveText('New list shows on the next ⟳ Re-take');

  // THE NEXT TAKE airs the newest list, from the start of a new roll, and the line clears.
  await page.getByTestId('verb-retake').click();
  await expect(rows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  await expect.poll(async () => (await roll()).mark).toBeNull();
  expect((await roll()).waiting).toBe(false);
  await expect(waitingLine).toHaveCount(0);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();

  // EMPTY: the Sheet emptied while on air waits as any change does; the next Take clears the list.
  sheet.set([['Role', 'Name']]);
  await expect.poll(() => roll().then((r) => r.waiting), { timeout: 20_000 }).toBe(true);
  await expect(rows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  await page.getByTestId('verb-retake').click();
  await expect(rows).toHaveCount(0);
  // FILLED AGAIN: off air the prepared rows follow at once; the Take airs them.
  await page.getByTestId('verb-out').click();
  sheet.set(TAB);
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss'], { timeout: 20_000 });
  await expect(waitingLine).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  // The drawn styling carries every list: roles in the role look, names in the name look.
  const looks = await rows.evaluateAll((els) => els.map((el) => [el.getAttribute('data-noacg-credits'), getComputedStyle(el).fill, getComputedStyle(el).fontSize]));
  expect(looks).toEqual([
    ['role', 'rgb(237, 188, 113)', '25px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
    ['role', 'rgb(237, 188, 113)', '25px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
  ]);

  // PAUSE holds what is prepared; RESUME reads again, and on air the change waits for a Take.
  await page.getByTestId('source-pause').click();
  await expect(page.getByTestId('sources-line')).toContainText('paused');
  sheet.set(NEWER);
  await page.waitForTimeout(6000);
  expect((await roll()).waiting, 'paused: nothing read').toBe(false);
  await page.getByTestId('source-pause').click();
  await expect.poll(() => roll().then((r) => r.waiting), { timeout: 20_000 }).toBe(true);
  await expect(waitingLine).toBeVisible();
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  // Paused again, the list read before the pause still waits, and the line still says so (#1980).
  await page.getByTestId('source-pause').click();
  await expect(page.getByTestId('sources-line')).toContainText('paused');
  await expect(waitingLine).toBeVisible();
});

test('a typed Update on a held roll says the new list shows on the next Re-take, from what PROGRAM holds; an Update that leaves the list as taken says nothing; a reload brings back no stale note', async ({ page }) => {
  test.setTimeout(120_000);
  await styledCreditsProduction(page, 'roll', 'Typed roll');
  const list = page.getByTestId('cue-field-f1');
  await expect(list).toHaveValue(LIST);
  const fate = page.getByTestId('cue-unsent');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  const waiting = () => air.locator('.imported-design-credits-roll').evaluate(() => (window as unknown as { noacgCreditsWaiting: boolean }).noacgCreditsWaiting);
  await page.getByTestId('verb-take').click();
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  await expect(fate).toBeEmpty();

  // A corrected name, sent with Update: PROGRAM keeps the list its Take took, and the editor says
  // when the new one shows. Before Update the unsent note asks for Update as always.
  await list.fill(OTHER);
  await expect(fate).toHaveText(/^1 change not on (air|PROGRAM) yet\. Press ✎ Update$/);
  await page.getByTestId('verb-update').click();
  await expect.poll(waiting).toBe(true);
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take');
  await expect(fate).toHaveAttribute('title', /keeps the names its Take took/);
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);

  // RELOAD: an unpublished production airs on this page only, so a reload leaves nothing on air
  // and nothing waits. The note follows PROGRAM, not a memory of its own: none comes back, and
  // the Take airs the list as typed.
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue(OTHER);
  await expect(page.getByTestId('verb-retake')).toBeDisabled();
  await expect(fate).toBeEmpty();
  await page.getByTestId('verb-take').click();
  await expect(rows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  await expect(fate).toBeEmpty();
  // Sent again on air: it waits, as before the reload.
  await page.getByTestId('cue-field-f1').fill(LIST);
  await page.getByTestId('verb-update').click();
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take');

  // The list put back as taken, sent: nothing waits any more, so nothing is said.
  await page.getByTestId('cue-field-f1').fill(OTHER);
  await page.getByTestId('verb-update').click();
  await expect.poll(waiting).toBe(false);
  await expect(fate).toBeEmpty();

  // A change to another field leaves the list as taken: nothing is said either.
  await page.getByTestId('cue-field-f0').fill('CREW');
  await page.getByTestId('verb-update').click();
  await expect(air.getByText('CREW')).toBeVisible();
  await expect.poll(waiting).toBe(false);
  await expect(fate).toBeEmpty();

  // Changed again and sent, then RE-TAKE: the new list airs and the note clears.
  await page.getByTestId('cue-field-f1').fill(LIST);
  await page.getByTestId('verb-update').click();
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take');
  await page.getByTestId('verb-retake').click();
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  await expect(fate).toBeEmpty();
  // OUT: off air nothing waits.
  await page.getByTestId('cue-field-f1').fill(OTHER);
  await page.getByTestId('verb-update').click();
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take');
  await page.getByTestId('verb-out').click();
  await expect(fate).toBeEmpty();
});

test('cards on air keep the cards they took: a refresh waits for the next Take, Next card turns the cards taken', async ({ page }) => {
  test.setTimeout(120_000);
  const sheet = await stubSheet(page, [['Role', 'Name'], ['Research', 'Nia Vale'], ['', 'Tomas Fen'], ['', ''], ['Sound', 'Ari Moss']]);
  await styledCreditsProduction(page, 'cards', 'Live cards');
  await connectSheet(page, 'Crew cards');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen']);
  const waiting = () => air.locator('.imported-design-credits-roll').evaluate(() => (window as unknown as { noacgCreditsWaiting: boolean }).noacgCreditsWaiting);

  sheet.set([['Role', 'Name'], ['Camera', 'Jonas Berg'], ['', ''], ['Director', 'Alex Rivera'], ['', ''], ['Editor', 'Mia Holt']]);
  await expect.poll(waiting, { timeout: 20_000, message: 'the refresh reached the graphic' }).toBe(true);
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen']);
  await expect(page.getByTestId('source-waiting')).toHaveText('· Newer data shows on the next Take');
  await expect(page.getByTestId('cue-unsent')).toHaveText('New list shows on the next ⟳ Re-take');
  // The prepared cue follows the refresh: PREVIEW shows the newer first card meanwhile.
  await expect(page.frameLocator('[data-testid="production-preview"] iframe').locator('.imported-design-credits-row')).toHaveText(['Camera', 'Jonas Berg']);
  // Next card turns to the second card of the list taken, not of the newer one.
  await page.getByTestId('cue-actions').getByRole('button', { name: /Next card$/ }).click();
  await expect(rows).toHaveText(['Sound', 'Ari Moss']);
  // The next Take deals the newer list from its first card.
  await page.getByTestId('verb-retake').click();
  await expect(rows).toHaveText(['Camera', 'Jonas Berg']);
  await expect(page.getByTestId('source-waiting')).toHaveCount(0);
  await page.getByTestId('cue-actions').getByRole('button', { name: /Next card$/ }).click();
  await expect(rows).toHaveText(['Director', 'Alex Rivera']);
});

test('a failing Sheet keeps the prepared credits as last read and says why; the reconnect brings the newest, and the Take airs it with no model request', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = await startSheetServer();
  const SHEET = '1NoaCGCreditsFake00000000';
  fake.set(SHEET, csvOf(TAB));
  await fake.route(page.context());
  const asked: string[] = [];
  page.on('request', (r) => { if (MODEL_REQUEST.test(r.url())) asked.push(r.url()); });
  try {
    await styledCreditsProduction(page, 'roll', 'Failing roll');
    await connectSheet(page, 'Crew', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`);
    const status = page.getByTestId('sources-line').getByTestId('source-status');
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    const rows = air.locator('.imported-design-credits-row');
    await page.getByTestId('verb-take').click();
    await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
    // Off air the prepared rows follow every write, so a write that should not happen would show.
    await page.getByTestId('verb-out').click();

    for (const [mode, said] of PAGE_FAILURES) {
      fake.mode(SHEET, mode);
      await expect(status, mode).toHaveText(said, { timeout: 25_000 });
      await expect(rows, `${mode}: the last good list is kept`).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
    }

    // Reconnect: the newest list arrives off air, and the Take airs it in the drawn looks.
    fake.set(SHEET, csvOf(NEWER));
    await expect(rows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera'], { timeout: 20_000 });
    await expect(status).toContainText('checked');
    await page.getByTestId('verb-take').click();
    await expect(rows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
    const looks = await rows.evaluateAll((els) => els.map((el) => [el.getAttribute('data-noacg-credits'), getComputedStyle(el).fill]));
    expect(looks.map((l) => l.join(' '))).toEqual(['role rgb(237, 188, 113)', 'name rgb(255, 255, 255)', 'name rgb(255, 255, 255)', 'role rgb(237, 188, 113)', 'name rgb(255, 255, 255)']);
    expect(asked, 'no model request on any refresh').toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
    await fake.close();
  }
});

// ── The same rules on a blank page, built as the wizard saves each binding ─────────────────────

type Built = { js: string; html: string; layout: string };
/** `first` is the sample of the layer picked as Credits: the first role, as the wizard offers it. */
function buildCredits(page: Page, source: string, playback: 'roll' | 'static' | 'cards', face: boolean, advance?: number, first = 'Research'): Promise<Built> {
  return page.evaluate(async ({ source, playback, face, advance, first }) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
    const C = await import('/src/templates/importedDesign/creditsRoll.ts');
    const { initialDraft, mergeDraft } = await import('/src/components/wizard/draft/core.ts');
    const { withUniversalMotion } = await import('/src/components/wizard/draft/template.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const imp = importSvgMarkup(source);
    const content = imp.candidates.find((c) => c.sample === first)!.id;
    const host = document.createElement('div');
    host.innerHTML = imp.markup;
    document.body.appendChild(host);
    const preview = C.creditsPreview(host.firstElementChild!, imp.candidates.map((c) => c.id), content);
    host.remove();
    const block = preview.anchors.map((a) => a.candidateId);
    const all = imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
    const fields = all.filter((f) => !block.includes(f.candidateId) || f.candidateId === content);
    const credits = fields.findIndex((f) => f.candidateId === content);
    const svg = {
      markup: imp.markup, width: imp.width, height: imp.height, fields, images: [], outlines: [],
      fonts: face ? [{ family: 'Anton', fontId: 'anton' }] : [],
      behaviour: { kind: 'recipe' as const, recipe: 'credits', layers: {}, fields: { credits }, credits: { v: 1 as const, layout: preview.layout, playback, ...(advance === undefined ? {} : { advance }), anchors: preview.anchors } },
    };
    const template = IMPORTED_SVG.create({ designSvg: svg });
    return { js: template.js, layout: preview.layout, html: composeDocument(withUniversalMotion(template, mergeDraft(initialDraft(), { animation: { motionIn: 'rise', motionOut: 'fade' } }), IMPORTED_SVG)) };
  }, { source, playback, face, advance, first });
}

const rowTexts = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => el.textContent));
const call = (page: Page, data: Record<string, string> | null, verb?: 'play' | 'stop') => page.evaluate(({ data, verb }) => {
  const w = window as unknown as { update(d: Record<string, string>): void; play(): void; stop(): void };
  if (data) w.update(data);
  if (verb) w[verb]();
}, { data, verb });
const fieldFor = (page: Page, role: string) => page.evaluate((role) => (window as unknown as { noacgFieldFor(role: string, key: null): string }).noacgFieldFor(role, null), role);
const LIST = 'Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss';
const OTHER = 'Camera:\nJonas Berg\nIda Lake\nDirector:\nAlex Rivera';
const THIRD = 'Editor:\nMia Holt';

test('a roll on air keeps its list through updates, a new speed and its faces landing; Out lets the rows follow again', async ({ page }) => {
  await page.goto('/app');
  const ABOVE = readFileSync(ABOVE_CREDITS_SVG, 'utf8').replace('font-family="sans-serif"', 'font-family="Anton"');
  const built = await buildCredits(page, ABOVE, 'roll', true);
  const held: (() => void)[] = [];
  await page.route('**/fonts/anton*.woff2*', async (route) => {
    await new Promise<void>((resolve) => { held.push(resolve); });
    await route.fulfill({ body: readFileSync('public/fonts/anton.woff2'), contentType: 'font/woff2' });
  });
  await page.goto('/robots.txt');
  await page.setContent(built.html, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.fonts.status), 'the face is on its way').toBe('loading');
  const field = await fieldFor(page, 'credits');
  const speed = await fieldFor(page, 'scrollSpeed');
  await call(page, { [field]: LIST }, 'play');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  const state = () => page.evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: { progress(): number; timeScale(): number; __mark?: number } | null; noacgCreditsWaiting: boolean; noacgCreditsLast: { distance: number } };
    return { mark: w.noacgCreditsTween?.__mark ?? null, progress: w.noacgCreditsTween?.progress() ?? null, scale: w.noacgCreditsTween?.timeScale() ?? null, waiting: w.noacgCreditsWaiting, distance: w.noacgCreditsLast.distance };
  });
  await page.evaluate(() => { (window as unknown as { noacgCreditsTween: { __mark?: number } }).noacgCreditsTween.__mark = 1; });

  // An update on air: the rows the take built stay; nothing restarts.
  const first = await state();
  await call(page, { [field]: OTHER });
  expect(await rowTexts(page)).toEqual(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  const kept = await state();
  expect([kept.mark, kept.waiting], 'the roll taken keeps running, a newer list waiting').toEqual([1, true]);
  expect(kept.progress!).toBeGreaterThanOrEqual(first.progress!);
  // The same list as taken again: nothing waits any more.
  await call(page, { [field]: LIST });
  expect((await state()).waiting).toBe(false);
  await call(page, { [field]: OTHER });

  // A new Scroll speed still acts on the roll on air, from this frame.
  await call(page, { [speed]: '200' });
  const faster = await state();
  expect([faster.mark, faster.scale], 'the speed changed the running roll').toEqual([1, 2]);

  // The faces land: the take is measured again in them, from where it was, with the list it took.
  await expect.poll(() => held.length > 0, 'the face request is held').toBe(true);
  for (const resolve of held.splice(0)) resolve();
  await expect.poll(async () => (await state()).distance, 'measured again in the face').not.toBe(first.distance);
  expect(await rowTexts(page), 'the settled roll keeps the list it took').toEqual(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  expect((await state()).waiting).toBe(true);

  // Out: off air, the rows follow every write; the next take airs the newest list.
  await call(page, null, 'stop');
  await expect.poll(async () => (await state()).waiting).toBe(false);
  await call(page, { [field]: OTHER });
  expect(await rowTexts(page)).toEqual(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  await call(page, null, 'play');
  await expect.poll(async () => (await state()).progress).not.toBeNull();
  expect(await rowTexts(page)).toEqual(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  expect((await state()).mark).toBeNull();
});

test('cards on air keep the cards they took, while a new card time still applies; the next take deals the newer list', async ({ page }) => {
  await page.goto('/app');
  const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), 'cards', false);
  await page.goto('/robots.txt');
  await page.setContent(built.html);
  const field = await fieldFor(page, 'credits');
  const time = await fieldFor(page, 'cardTime');
  const cards = () => page.evaluate(() => {
    const w = window as unknown as { noacgCreditsCards: { from: number; to: number }[]; noacgCreditsCard: number; noacgCreditsWaiting: boolean; noacgCreditsTween: unknown };
    return { cards: w.noacgCreditsCards.length, card: w.noacgCreditsCard, waiting: w.noacgCreditsWaiting, hold: !!w.noacgCreditsTween };
  });
  await call(page, { [field]: 'Research:\nNia Vale\n\nSound:\nAri Moss' }, 'play');
  await expect.poll(async () => (await cards()).card).toBe(0);
  expect(await rowTexts(page)).toEqual(['Research', 'Nia Vale']);

  // Three cards written on air: the two cards taken stay dealt; the one on screen is unchanged.
  await call(page, { [field]: 'Camera:\nJonas Berg\n\nDirector:\nAlex Rivera\n\nEditor:\nMia Holt' });
  expect(await cards()).toEqual({ cards: 2, card: 0, waiting: true, hold: false });
  expect(await rowTexts(page)).toEqual(['Research', 'Nia Vale']);
  // A card time set on air starts the hold of the cards taken, and turns to their second card.
  await call(page, { [time]: '2' });
  expect((await cards()).hold, 'the card time applies on air').toBe(true);
  await expect.poll(async () => (await cards()).card, { timeout: 5000 }).toBe(1);
  await expect.poll(() => rowTexts(page)).toEqual(['Sound', 'Ari Moss']);
  // The next take deals the newer list, from its first card.
  await call(page, null, 'play');
  await expect.poll(async () => (await cards()).card).toBe(0);
  expect(await cards()).toMatchObject({ cards: 3, waiting: false });
  expect(await rowTexts(page)).toEqual(['Camera', 'Jonas Berg']);
});

// #2057: play() paints the entrance's first frame at once, and the take holds its list on GSAP's
// first tick after it. A design whose credits already show on that frame (here the entrance's fade
// taken out) would show one list and then another if an update in between reached the rows: the
// take holds the list that frame shows, and the newer one waits for the next take.
for (const playback of ['roll', 'cards'] as const) {
  test(`${playback}: an update between play() and the take waits, so the first frame's list is the one taken (#2057)`, async ({ page }) => {
    await page.goto('/app');
    const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), playback, false);
    await page.goto('/robots.txt');
    await page.setContent(built.html);
    const field = await fieldFor(page, 'credits');
    await call(page, { [field]: LIST });
    const first = await page.evaluate(({ field, other }) => {
      const w = window as unknown as { NOACG_ANIM: { steps: { layers: Record<string, Record<string, unknown>> }[] }; play(): void; update(d: Record<string, string>): void };
      for (const tracks of Object.values(w.NOACG_ANIM.steps[0].layers)) delete tracks.opacity;
      w.play();
      // What the first frame paints: the rows, and whether they are visible at all.
      const row = document.querySelector('.imported-design-credits-row');
      let shown = row ? 1 : 0;
      for (let el = row; el; el = el.parentElement) shown *= Number(getComputedStyle(el).opacity);
      const rows = [...document.querySelectorAll('.imported-design-credits-row')].map((el) => el.textContent);
      w.update({ [field]: other });
      return { shown, rows };
    }, { field, other: OTHER });
    expect(first.shown, 'the credits show on the first frame').toBeGreaterThan(0);
    expect(first.rows[0], 'the first frame shows the list written before play()').toBe('Research');
    const state = () => page.evaluate(() => {
      const w = window as unknown as { noacgCreditsHeld: string | null; noacgCreditsWaiting: boolean; noacgCreditsTween: unknown; noacgCreditsCard?: number };
      return { taken: w.noacgCreditsCard === undefined ? !!w.noacgCreditsTween : w.noacgCreditsCard === 0, held: w.noacgCreditsHeld, waiting: w.noacgCreditsWaiting };
    });
    await expect.poll(async () => (await state()).taken, 'the take ran').toBe(true);
    expect(await state(), 'the take keeps the list its first frame showed; the newer one waits').toMatchObject({ held: LIST, waiting: true });
    expect(await rowTexts(page), 'no frame after the first shows another list').toEqual(first.rows);
    // The next take airs the newer list.
    await call(page, null, 'play');
    await expect.poll(async () => (await state()).held).toBe(OTHER);
    expect([(await rowTexts(page))[0], (await state()).waiting]).toEqual(['Camera', false]);
    // A LIST THAT WAITED AT OUT: once the exit has ended the rows show it, so the next take's first
    // frame does too, and an update between play() and that take waits as above.
    await call(page, { [field]: LIST });
    expect([(await rowTexts(page))[0], (await state()).waiting], 'on air, the newer list waits').toEqual(['Camera', true]);
    await call(page, null, 'stop');
    await expect.poll(async () => (await rowTexts(page))[0], 'off air after Out, the rows show the list that waited').toBe('Research');
    const again = await page.evaluate(({ field, third }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void };
      w.play();
      const rows = [...document.querySelectorAll('.imported-design-credits-row')].map((el) => el.textContent);
      w.update({ [field]: third });
      return rows;
    }, { field, third: THIRD });
    expect(again[0], 'the first frame shows the list that waited').toBe('Research');
    await expect.poll(async () => (await state()).taken, 'the take ran').toBe(true);
    expect(await state(), 'the take keeps the list its first frame showed').toMatchObject({ held: LIST, waiting: true });
    expect(await rowTexts(page)).toEqual(again);
    // Taken again before that exit ends (#2108): the exit keeps the list taken while it is on
    // screen; the new take cuts it short, which lets that list go and builds the rows from the
    // holder before the take's first frame paints, so the frame shows the newest list and never
    // the older one. The take keeps what that frame showed, and a write after it waits.
    const retaken = await page.evaluate(async ({ field, other }) => {
      const w = window as unknown as { play(): void; stop(): void; update(d: Record<string, string>): void; noacgCreditsHeld: string | null };
      w.stop();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = w.noacgCreditsHeld;
      w.play();
      const rows = [...document.querySelectorAll('.imported-design-credits-row')].map((el) => el.textContent);
      w.update({ [field]: other });
      return { out, rows };
    }, { field, other: OTHER });
    expect(retaken.out, 'the exit keeps the list taken while it is on screen').toBe(LIST);
    expect(retaken.rows[0], 'the re-take\'s first frame shows the newest list').toBe('Editor');
    await expect.poll(async () => (await state()).taken, 'the take ran').toBe(true);
    expect(await state(), 'the take keeps the list its first frame showed; the write after it waits').toMatchObject({ held: THIRD, waiting: true });
    expect((await rowTexts(page))[0]).toBe('Editor');
    // An entrance killed before its first tick (an Out or a snap) never takes, so it holds nothing,
    // not even a list an update held at its cue: off air again, the rows follow the next write.
    await call(page, null, 'stop');
    await expect.poll(async () => (await state()).held).toBeNull();
    expect((await rowTexts(page))[0], 'off air, the rows show the list taken, which nothing replaced').toBe('Camera');
    await page.evaluate(({ field, other, list }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void; noacgLiveTimeline: { kill(): void } };
      w.play();
      w.update({ [field]: other });
      w.noacgLiveTimeline.kill();
      w.update({ [field]: list });
    }, { field, other: OTHER, list: LIST });
    expect([(await rowTexts(page))[0], (await state()).held], 'a killed entrance holds no list').toEqual(['Research', null]);
    // A SNAP BETWEEN play() AND THE TAKE, after an update held a list at the cue: nothing takes,
    // and the next take airs the newest list, never the one that cue held.
    await page.evaluate(({ field, other }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void; noacgSnap(a: null): void };
      w.play();
      w.update({ [field]: other });
      w.noacgSnap(null);
    }, { field, other: OTHER });
    // The next take, with an update between its play() and its first tick (a snap leaves the old
    // roll's tween in place, so the take is waited for by frames, not by the tween).
    const taken = await page.evaluate(async ({ field, third }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void; noacgCreditsHeld: string | null };
      w.play();
      w.update({ [field]: third });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return w.noacgCreditsHeld;
    }, { field, third: THIRD });
    expect(taken, 'the take after a snapped cue airs the newest list').toBe(THIRD);
    // The same with the entrance killed instead, which leaves the held cue in place until the next
    // write: that write lets it go, and the rows still showing the held list are no list to hold.
    await call(page, null, 'stop');
    await expect.poll(async () => (await state()).held).toBeNull();
    await call(page, { [field]: LIST });
    const afterKill = await page.evaluate(async ({ field, other, third }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void; noacgLiveTimeline: { kill(): void }; noacgCreditsHeld: string | null };
      w.play();
      w.update({ [field]: other });
      w.noacgLiveTimeline.kill();
      w.play();
      w.update({ [field]: third });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return w.noacgCreditsHeld;
    }, { field, other: OTHER, third: THIRD });
    expect(afterKill, 'the take after a killed cue airs the newest list, never the list that cue held').toBe(THIRD);
    // A STOP WITH NO EXIT TO WAIT FOR (a styled stop rests the graphic, then Out lets go): a list
    // that waited shows off air at once.
    await call(page, { [field]: OTHER });
    expect((await state()).waiting, 'on air, the newer list waits').toBe(true);
    await page.evaluate(() => {
      const w = window as unknown as { noacgResetGraphic(): void; stopCreditsRoll(): void };
      w.noacgResetGraphic();
      w.stopCreditsRoll();
    });
    expect([(await rowTexts(page))[0], (await state()).held], 'off air with no exit, the rows show the list that waited').toEqual(['Camera', null]);
    // OUT BEFORE THE TAKE, THEN A TAKE INTERRUPTING THAT EXIT: the cue held the rows' list and a
    // newer one waited; the exit keeps it while on screen, and the take that cuts the exit short
    // builds the rows from the holder first, so it airs the list its first frame shows.
    const interrupted = await page.evaluate(async ({ field, list, third }) => {
      const w = window as unknown as { play(): void; stop(): void; update(d: Record<string, string>): void; noacgCreditsHeld: string | null };
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      w.play();
      w.update({ [field]: list });
      w.stop();
      await frames();
      const out = w.noacgCreditsHeld;
      w.play();
      w.update({ [field]: third });
      await frames();
      return { out, taken: w.noacgCreditsHeld };
    }, { field, list: LIST, third: THIRD });
    expect(interrupted, 'the exit kept the list the cue held, and the take after it airs the list its first frame showed').toEqual({ out: OTHER, taken: LIST });
    // NO UPDATE BEFORE THE FIRST play(): the rows built at load are the list its first frame shows.
    await page.setContent(built.html);
    const first2 = await page.evaluate(async ({ field, other }) => {
      const w = window as unknown as { play(): void; update(d: Record<string, string>): void; noacgCreditsHeld: string | null; noacgCreditsWaiting: boolean };
      const loaded = document.getElementById(field)!.textContent;
      w.play();
      w.update({ [field]: other });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { same: w.noacgCreditsHeld === loaded, waiting: w.noacgCreditsWaiting };
    }, { field, other: OTHER });
    expect(first2, 'the first take after load keeps the list its rows were built with').toEqual({ same: true, waiting: true });
  });
}

// #2108: the list on screen never changes during the exit. Out keeps the list taken until its
// exit has ended; an update during the exit waits, and the rows follow it once the exit is over.
for (const playback of ['roll', 'cards'] as const) {
  test(`${playback}: an update during the exit waits for the exit to end (#2108)`, async ({ page }) => {
    await page.goto('/app');
    const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), playback, false);
    await page.goto('/robots.txt');
    await page.setContent(built.html);
    const field = await fieldFor(page, 'credits');
    await call(page, { [field]: LIST }, 'play');
    await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsHeld: string | null }).noacgCreditsHeld)).toBe(LIST);
    const during = await page.evaluate(async ({ field, other }) => {
      const w = window as unknown as { stop(): void; update(d: Record<string, string>): void; noacgOutTimeline: { progress(): number } | null };
      w.stop();
      // The exit's first tick has run its calls (Out's stopCreditsRoll), and the exit is on screen.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const progress = w.noacgOutTimeline ? w.noacgOutTimeline.progress() : 1;
      w.update({ [field]: other });
      return { progress, rows: [...document.querySelectorAll('.imported-design-credits-row')].map((el) => el.textContent) };
    }, { field, other: OTHER });
    expect(during.progress, 'the exit is still running').toBeLessThan(1);
    expect(during.rows[0], 'an update during the exit leaves the list fading out as it was').toBe('Research');
    await expect.poll(async () => (await rowTexts(page))[0], 'once the exit has ended, the rows follow the update').toBe('Camera');
    expect(await page.evaluate(() => (window as unknown as { noacgCreditsHeld: string | null; noacgCreditsWaiting: boolean }).noacgCreditsHeld)).toBeNull();
  });
}

// #2104: a snap to off rests the graphic without running Out's calls. The take's list is let go
// all the same: off air the rows follow every write again, and nothing says a newer list waits.
for (const playback of ['roll', 'cards'] as const) {
  test(`${playback}: a snap to off after a take lets go of the taken list (#2104)`, async ({ page }) => {
    await page.goto('/app');
    const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), playback, false, playback === 'cards' ? 3 : undefined);
    await page.goto('/robots.txt');
    await page.setContent(built.html);
    const field = await fieldFor(page, 'credits');
    const state = () => page.evaluate(() => {
      const w = window as unknown as { noacgCreditsHeld: string | null; noacgCreditsWaiting: boolean; noacgCreditsTween: unknown; noacgCreditsCard?: number };
      return { held: w.noacgCreditsHeld, waiting: w.noacgCreditsWaiting, tween: !!w.noacgCreditsTween, card: w.noacgCreditsCard ?? null };
    });
    await call(page, { [field]: 'Research:\nNia Vale\n\nSound:\nAri Moss' }, 'play');
    await expect.poll(async () => (await state()).held).not.toBeNull();
    await call(page, { [field]: OTHER });
    expect((await state()).waiting, 'on air, the newer list waits').toBe(true);
    // The snap every playout road sends (the editor, a recovery, an exported receiver): the graphic
    // is off air at once, the rows show the list that waited, and nothing says a list waits.
    await page.evaluate(() => (window as unknown as { noacgSnap(a: null, o: { timers: boolean }): void }).noacgSnap(null, { timers: false }));
    expect(await state(), 'off air after the snap: no list held, nothing waits, no hold running').toMatchObject({ held: null, waiting: false, tween: false, ...(playback === 'cards' ? { card: -1 } : {}) });
    expect((await rowTexts(page))[0], 'the rows show the list that waited').toBe('Camera');
    await call(page, { [field]: THIRD });
    expect(await rowTexts(page), 'off air, the rows follow every write').toEqual(['Editor', 'Mia Holt']);
    // Taken again: the snap left nothing behind, so the take airs the newest list.
    await call(page, null, 'play');
    await expect.poll(async () => (await state()).held).toBe(THIRD);
    // A SNAP ONTO AIR (an output's reload recovery, OGraf's skip-animation) is no snap to off: the
    // pose's own take runs, and the roll moves or the cards turn as after a Take.
    const TWO = 'Research:\nNia Vale\n\nSound:\nAri Moss';
    const onAir = await page.evaluate(() => (window as unknown as { noacgMachineState(): { groups: Record<string, string> } }).noacgMachineState().groups);
    await page.evaluate(({ groups, field, two }) => {
      const w = window as unknown as { noacgSnap(a: unknown): void; update(d: Record<string, string>): void };
      w.noacgSnap(null);
      w.update({ [field]: two });
      w.noacgSnap(groups);
    }, { groups: onAir, field, two: TWO });
    expect(await state(), 'snapped onto air: the take holds its list and runs').toMatchObject({ held: TWO, waiting: false, ...(playback === 'cards' ? { card: 0 } : { tween: true }) });
    if (playback === 'roll') {
      const at = () => page.evaluate(() => (window as unknown as { noacgCreditsTween: { progress(): number } }).noacgCreditsTween.progress());
      const from = await at();
      await expect.poll(at, 'the roll moves').toBeGreaterThan(from);
    } else {
      await page.evaluate(() => (window as unknown as { noacgCreditsNext(): void }).noacgCreditsNext());
      await expect.poll(async () => (await state()).card, 'Next moves a card').toBe(1);
    }
  });
}

// #2086 (owner decision 2026-11-05): a Next card pressed while the next card fades in is
// remembered, one at most, and runs when that change ends. A press while the card on air fades
// out is that change, so a fast double press still moves one card.
test('cards: a Next pressed during the fade-in runs when the change ends; a double press moves one card (#2086)', async ({ page }) => {
  await page.goto('/app');
  const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), 'cards', false);
  await page.goto('/robots.txt');
  await page.setContent(built.html);
  const field = await fieldFor(page, 'credits');
  const cards = () => page.evaluate(() => {
    const w = window as unknown as { noacgCreditsCards: unknown[]; noacgCreditsCard: number; noacgCreditsTurning: boolean };
    return { cards: w.noacgCreditsCards.length, card: w.noacgCreditsCard, turning: w.noacgCreditsTurning };
  });
  const next = () => page.evaluate(() => (window as unknown as { noacgCreditsNext(): void }).noacgCreditsNext());
  await call(page, { [field]: 'Research:\nNia Vale\n\nSound:\nAri Moss\n\nCamera:\nJonas Berg\n\nEditor:\nMia Holt\n\nDirector:\nAlex Rivera' }, 'play');
  await expect.poll(cards).toMatchObject({ cards: 5, card: 0 });
  // A double press: the second comes while the card on air fades out, and is that change.
  await next();
  await next();
  await expect.poll(cards, 'one card per change').toMatchObject({ card: 1, turning: false });
  // A press while the next card fades in: it waits for the change, then runs; a second press
  // then is the same remembered press.
  await next();
  // The change lays the next card out at 0.4 s and fades it in to 0.9 s.
  await expect.poll(() => page.evaluate(() => { const w = window as unknown as { noacgCreditsTurning: boolean; noacgCreditsTween: { time(): number } }; return w.noacgCreditsTurning && w.noacgCreditsTween.time() > 0.5; }), 'the next card fades in').toBe(true);
  expect((await cards()).card).toBe(2);
  await next();
  await next();
  await expect.poll(cards, 'the press during the fade-in ran when the change ended, once').toMatchObject({ card: 3, turning: false });
  expect(await rowTexts(page)).toEqual(['Editor', 'Mia Holt']);
});

test('a still page shows an update on air at once, where the drawing put it', async ({ page }) => {
  // The held-still decision (phase 24): nothing on a still page moves, so an update has no
  // motion to replay, and a last-minute correction reaches air at once, refitted in place.
  await page.goto('/app');
  const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), 'static', false);
  expect(built.js, 'a still page holds no list of its own').not.toContain('noacgCreditsHeld');
  await page.goto('/robots.txt');
  await page.setContent(built.html);
  const field = await fieldFor(page, 'credits');
  await call(page, { [field]: LIST }, 'play');
  await expect.poll(() => rowTexts(page)).toEqual(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  await call(page, { [field]: OTHER });
  expect(await rowTexts(page)).toEqual(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  const still = await page.evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: unknown; noacgCreditsLast: unknown };
    return { tween: w.noacgCreditsTween, last: w.noacgCreditsLast, moved: getComputedStyle(document.querySelector('.imported-design-credits-roll')!).transform };
  });
  expect(still).toEqual({ tween: null, last: { still: true, rows: 5, scale: 1, refused: false }, moved: 'none' });
});

// Row 39 (AC-13, AC-14): the walks above are role above. The same update policy holds for
// role beside, in each playback, so all six layout and playback pairs follow a linked list:
// roll and cards keep what they took and air the newer list on the next Take; a still page
// shows it at once. Every row keeps its drawn column and look, on the list taken and on the
// newer one (credits-2: roles at x 90, 26 px; names at x 440, 32 px; a role on its first
// name's line).
const BESIDE_CREDITS_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/credits-2.svg', import.meta.url));
for (const playback of ['static', 'roll', 'cards'] as const) {
  test(`role beside, ${playback}: a linked update follows the playback's rule, in the drawn columns`, async ({ page }) => {
    await page.goto('/app');
    const built = await buildCredits(page, readFileSync(BESIDE_CREDITS_SVG, 'utf8'), playback, false, undefined, 'Réalisation');
    expect(built.layout).toBe('role-beside');
    await page.goto('/robots.txt');
    await page.setContent(built.html);
    const field = await fieldFor(page, 'credits');
    // Cards deal one role per card; the other playbacks show the whole list.
    const [taken, newer, takenRows, newerRows] = playback === 'cards'
      ? ['Research:\nNia Vale\n\nSound:\nAri Moss', 'Camera:\nJonas Berg\n\nDirector:\nAlex Rivera', ['Research', 'Nia Vale'], ['Camera', 'Jonas Berg']]
      : [LIST, OTHER, ['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss'], ['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']];
    const waiting = () => page.evaluate(() => (window as unknown as { noacgCreditsWaiting?: boolean }).noacgCreditsWaiting ?? false);
    // Every row in its drawn column and look: all roles share one left edge, all names another
    // to its right (within a glyph's side bearing), and each role sits on the line of the name
    // that follows it. Read in one frame, so a moving roll is read at one instant.
    const expectDrawnColumns = async () => {
      const rows = await page.evaluate(() => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.getAttribute('data-noacg-credits'), left: Math.round(r.left), top: Math.round(r.top), size: getComputedStyle(el).fontSize };
      }));
      const said = JSON.stringify(rows);
      const roles = rows.filter((r) => r.kind === 'role');
      const names = rows.filter((r) => r.kind === 'name');
      expect(roles.length + names.length, said).toBe(rows.length);
      expect(roles.length, said).toBeGreaterThan(0);
      for (const [column, size] of [[roles, '26px'], [names, '32px']] as const) {
        for (const r of column) {
          expect(Math.abs(r.left - column[0].left), `one column: ${said}`).toBeLessThanOrEqual(4);
          expect(r.size, said).toBe(size);
        }
      }
      expect(Math.max(...roles.map((r) => r.left)), `roles left of names: ${said}`).toBeLessThan(Math.min(...names.map((r) => r.left)));
      rows.forEach((r, i) => {
        if (r.kind !== 'role') return;
        expect(rows[i + 1]?.kind, `a name follows each role: ${said}`).toBe('name');
        expect(Math.abs(r.top - rows[i + 1].top), `a role on its first name's line: ${said}`).toBeLessThan(12);
      });
    };
    await call(page, { [field]: taken }, 'play');
    await expect.poll(() => rowTexts(page)).toEqual(takenRows);
    // The take holds its list in the entrance's call at time 0, which runs on the first tick
    // after play(). The rows read the same before that, because off air they already follow the
    // list, so an update sent the moment they match could still reach the take (#2048). This
    // drawing's credits enter from hidden, so nothing showed meanwhile; a design visible on that
    // first frame is #2057. Wait for the take to hold its list.
    if (playback !== 'static') {
      await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsHeld: string | null }).noacgCreditsHeld), 'the take holds its list').toBe(taken);
    }

    await expectDrawnColumns();

    // An update on air.
    await call(page, { [field]: newer });
    if (playback === 'static') {
      expect(await rowTexts(page), 'a still page shows it at once').toEqual(newerRows);
      await expectDrawnColumns();
      return;
    }
    expect(await rowTexts(page), `${playback} keeps the list it took`).toEqual(takenRows);
    expect(await waiting(), 'the newer list waits').toBe(true);
    // The next take airs the newer list.
    await call(page, null, 'play');
    await expect.poll(() => rowTexts(page)).toEqual(newerRows);
    expect(await waiting()).toBe(false);
    await expectDrawnColumns();
  });
}

test('#1973: a still page whose face starts loading at its take is fitted again when it lands, once per landing', async ({ page }) => {
  // The drawing names no face of its own until the test points the drawn layers at Anton after
  // the load-time refit has run: the take is then the first layout in the face, so only the
  // take's own refit can fit the page again when the face lands.
  await page.goto('/app');
  const built = await buildCredits(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), 'static', true);
  const held: (() => void)[] = [];
  await page.route('**/fonts/anton*.woff2*', async (route) => {
    await new Promise<void>((resolve) => { held.push(resolve); });
    await route.fulfill({ body: readFileSync('public/fonts/anton.woff2'), contentType: 'font/woff2' });
  });
  await page.goto('/robots.txt');
  await page.setContent(built.html);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.status), 'nothing loading before the take').toBe('loaded');
  const field = await fieldFor(page, 'credits');
  const list = ['Research:', ...Array.from({ length: 12 }, (_, i) => `Name Number ${i + 1}`)].join('\n');
  // Count the page's fits from here on.
  await page.evaluate(() => {
    const w = window as unknown as { creditsHold(): unknown; __fits: number };
    const hold = w.creditsHold;
    w.__fits = 0;
    w.creditsHold = function () { w.__fits += 1; return hold(); };
    for (const el of document.querySelectorAll('[data-noacg-credit]')) el.setAttribute('font-family', 'Anton');
  });
  await call(page, { [field]: list }, 'play');
  expect(await page.evaluate(() => document.fonts.status), 'the take set the rows in the face, which is loading').toBe('loading');
  const early = await page.evaluate(() => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => (el as SVGTextElement).getComputedTextLength()));
  // Three more updates while the face loads.
  for (let i = 0; i < 3; i++) await call(page, { [field]: list });
  const before = await page.evaluate(() => (window as unknown as { __fits: number }).__fits);
  await expect.poll(() => held.length > 0, 'the face request is held').toBe(true);
  for (const resolve of held.splice(0)) resolve();
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fits: number }).__fits - 0), 'fitted again when the face landed').toBeGreaterThan(before);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __fits: number }).__fits), 'once per landing').toBe(before + 1);
  const late = await page.evaluate(() => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => (el as SVGTextElement).getComputedTextLength()));
  expect(late, 'the rows are now set in the face').not.toEqual(early);
  // Fitted by the still page's rule in the face: its last ink inside the room, the room spent.
  const fit = await page.evaluate(() => {
    const art = (document.querySelector('[data-noacg-credit]') as SVGGraphicsElement).ownerSVGElement!;
    const bottoms = [...document.querySelectorAll('.imported-design-credits-row')].map((el) => {
      const t = el as SVGTextElement;
      const m = art.getScreenCTM()!.inverse().multiply(t.getScreenCTM()!);
      const b = t.getBBox();
      return m.b * b.x + m.d * (b.y + b.height) + m.f;
    });
    return { bottom: Math.max(...bottoms), scale: (window as unknown as { noacgCreditsLast: { scale: number } }).noacgCreditsLast.scale };
  });
  expect(fit.scale, JSON.stringify(fit)).toBeLessThan(1);
  expect(fit.bottom, JSON.stringify(fit)).toBeLessThanOrEqual(772.5 + 0.5);
  expect(fit.bottom, JSON.stringify(fit)).toBeGreaterThan(772.5 - 2);
});
