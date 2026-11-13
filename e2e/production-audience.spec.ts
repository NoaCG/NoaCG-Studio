// covers: src/components/home/{ProductionAudienceWorkspace,InteractionQuestions}.tsx
// covers: src/model/questions.ts
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
// covers: src/components/home/CueEditor.tsx
// focus
//
// The readable audience name is minted by the publish path but READ on the audience surfaces, and
// rules union rather than shadowing - so this adds to the `src/control/` covers line.
// covers: src/control/joinName.ts
// covers: src/control/messageStaging.ts
//
// The AUDIENCE plane (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5). Its whole workflow runs on
// the local provider, so the offline suite really does cover it - which is why the seam was
// built before the backend.
// covers: src/audience/**
//
// The public join page is its own MPA entry, so it needs its own mapping: a change to
// join.html or src/join/ touches no module the app imports, and would otherwise map to
// nothing at all.
// covers: {join.html,src/join/**}
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/ProductionShell.tsx
// covers: src/control/cueDraft.ts
// covers: src/control/{graphicVerbs,verbView,verbDispatch,airState,takeBlockers}.ts

import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { openWorkspace } from './_workspace';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';
import { addQuestion, goLive, moreWaysIn, questionRow, simulateArrivals, stopLive } from './_interaction';
import { qrReader } from './_qr';

// The production AUDIENCE workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).
//
// It runs on the LOCAL provider — in memory, with a submission simulator — which is exactly why
// this whole workflow is drivable offline. That was the point of building the seam first: what
// is pinned here is the moderation workflow itself, and the Supabase provider will be a second
// implementation of an interface these specs have already exercised.
//
// THE RULE THE SPECS EXIST FOR: nothing a viewer wrote reaches Program without an operator
// pressing Take. "Prepare cue on <graphic>" makes a CUE and stops (the view is called Interaction,
// docs/work-specs/interaction/spec.md; its route is still `audience`).

async function productionFor(page: Page, name: string): Promise<string> {
  return openProductionWithCurrent(page, name);
}

/** Paste a message into Interaction, as an operator copying it from a chat window. */
async function paste(workspace: Page, body: string, name = ''): Promise<void> {
  if (name) await workspace.getByTestId('message-paste-name').fill(name);
  await workspace.getByTestId('message-paste-body').fill(body);
  await workspace.getByTestId('message-paste-add').click();
}

/** Prepare a row, choosing where messages go when the production has not been told yet. */
async function prepare(row: Locator, on?: string): Promise<void> {
  await row.getByTestId('audience-prepare').click();
  if (on) await row.getByTestId('audience-choose-graphic').filter({ hasText: on }).click();
}

/** A row's menu item: Approve, Shortlist and the presenter pointers sit one press away. */
async function fromMenu(workspace: Page, row: Locator, item: string): Promise<void> {
  await row.getByTestId('audience-more').click();
  await workspace.getByTestId(item).click();
}

test('the audience workflow: arrive, edit a broadcast version, approve, prepare a cue, air it', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Phone In');

  const audience = await openWorkspace(page, 'audience');
  expect(audience.url()).toContain('/audience');
  await expect(audience.getByTestId('audience-empty')).toBeVisible();

  // Three arrive.
  await simulateArrivals(audience);
  const rows = audience.locator('.pd-aud-row');
  await expect(rows).toHaveCount(3);
  await expect(audience.getByTestId('audience-filter-inbox')).toContainText('(3)');

  // ── The BROADCAST version is editable and the ORIGINAL is not. ──
  const first = rows.first();
  const sent = await first.getByTestId('audience-edit-body').inputValue();
  await first.getByTestId('audience-edit-body').fill('Tidied for air');
  await expect(first.getByTestId('audience-show-original')).toBeVisible();
  await first.getByTestId('audience-show-original').click();
  // What was actually sent is still there, word for word — an edit is a tidy-up, never a
  // rewrite of the record.
  await expect(first.getByTestId('audience-original')).toContainText(sent);

  // Anonymise replaces the name on air and leaves the record alone.
  await first.getByTestId('audience-anonymize').check();
  await expect(first.locator('.pd-aud-author')).toHaveText('Anonymous');
  await expect(first.getByTestId('audience-original')).not.toContainText('Anonymous');

  // ── Approve, shortlist, reject: three different verdicts, three different lists. ──
  await fromMenu(audience, rows.nth(1), 'audience-shortlist');
  await rows.nth(2).getByTestId('audience-reject').click();
  await expect(audience.getByTestId('audience-filter-shortlist')).toContainText('(1)');
  await audience.getByTestId('audience-filter-inbox').click();
  await expect(rows).toHaveCount(2); // the rejected one has left the inbox

  // ── The ONE exit: a cue on the rundown, on the graphic the operator CHOSE. Nothing has aired. ──
  await audience.getByTestId('audience-filter-all').click();
  await prepare(audience.locator('.pd-aud-row').first(), 'House Q&A');
  await expect(audience.getByTestId('audience-note')).toContainText('airs when you Take it');
  // The choice is remembered and named on every button from now on.
  await expect(audience.getByTestId('message-target')).toHaveValue(/.+/);
  await expect(audience.locator('.pd-aud-row').nth(1).getByTestId('audience-prepare')).toHaveText('Prepare cue on House Q&A');
  await expect(audience.locator('.pd-aud-row').first().getByTestId('audience-used')).toBeVisible();

  // The cue was written by the WORKSPACE tab, so it has to be durable before the Playout tab -
  // which never left the screen - can be asked about it.
  await settleDurableWrites(audience);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  const cue = page.locator('.pd-cue', { hasText: 'Tidied for air' }).first();
  await expect(cue).toBeVisible();
  await cue.click();

  // Now the operator airs it, deliberately — and the edited text is what goes out.
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('Tidied for air');
});

test('the audience workspace survives a workspace round trip and a reload', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Round Trip');
  const audience = await openWorkspace(page, 'audience');
  await simulateArrivals(audience);
  await expect(audience.locator('.pd-aud-row')).toHaveCount(3);

  // THE ROUND TRIP IS INSIDE THE WORKSPACE'S OWN TAB now. Playout is a button there and
  // navigates in place (it is the surface this tab would keep); coming back is history, not a
  // second link, because opening the link again would be a NEW tab and a new provider - which
  // would prove nothing about surviving anything.
  await audience.getByTestId('tab-playout').click();
  await expect(audience.getByTestId('production-verbs')).toBeVisible();
  await audience.goBack();
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  await expect(audience.locator('.pd-aud-row')).toHaveCount(3);

  // A RELOAD keeps what the operator pasted and drops what was simulated (data-sources C0,
  // localAudience.ts): a forgotten inbox lost the operator's own work, and a rehearsal's invented
  // questions must never accumulate.
  await paste(audience, 'Kept across a reload', 'Ana');
  await expect(audience.locator('.pd-aud-row')).toHaveCount(4);
  await audience.reload();
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  const kept = audience.locator('.pd-aud-row');
  await expect(kept).toHaveCount(1);
  await expect(kept.locator('.pd-aud-body')).toHaveText('Kept across a reload');
  await expect(kept.getByTestId('audience-provenance')).toHaveText('Pasted');
});

test('the viewer preview is the join page itself, and it follows the live question', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Preview');
  const audience = await openWorkspace(page, 'audience');

  await audience.getByTestId('audience-preview-details').locator('summary').click();
  const preview = audience.getByTestId('audience-preview');
  // With no question live, phones show the waiting text, in the words a viewer reads.
  await expect(preview).toContainText('Not taking part right now');

  // Going live changes what the room sees: an Open question takes a sentence...
  await addQuestion(audience, 'open', 'What should we ask the coach?');
  await goLive(audience, 'What should we ask the coach?');
  await expect(preview.locator('.nj-prompt')).toHaveText('What should we ask the coach?');
  await expect(preview).toContainText('Your answer');

  // ...and a Multiple choice one takes a tap, closing the Open one.
  await addQuestion(audience, 'choice', 'Who wins?', ['Home', 'Away']);
  await goLive(audience, 'Who wins?');
  await expect(preview.locator('.nj-opt')).toHaveCount(2);
  await expect(questionRow(audience, 'What should we ask the coach?').getByTestId('question-live')).toHaveCount(0);

  // READ-ONLY: an operator's preview must not be able to put words in the audience's mouth.
  await stopLive(audience, 'Who wins?');
  await goLive(audience, 'What should we ask the coach?');
  await preview.locator('textarea').fill('Not from the operator, thanks');
  await preview.locator('.nj-send').click();
  await expect(preview).toContainText('Send from a phone');
  await expect(audience.locator('.pd-aud-row')).toHaveCount(0);
});

test('the page settings reach the phone preview: the title and waiting text, and the look', async ({ page }) => {
  // interaction spec D4, AC-6 (journey for the settings): Join's page settings are a title (empty
  // = the production name) and the waiting text. Unpublished, the preview takes them, and the
  // look, straight from the production; published, they reach phones on the next read
  // (e2e/configured/audience-live.spec.ts).
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Settings Night');
  const audience = await openWorkspace(page, 'audience');
  // Unpublished, Join offers Publish where the code will be (AC-8) and no code yet.
  await expect(audience.getByTestId('join-unpublished')).toBeVisible();
  await expect(audience.getByTestId('join-qr')).toHaveCount(0);
  await audience.getByTestId('audience-preview-details').locator('summary').click();
  const preview = audience.getByTestId('audience-preview');
  await expect(preview.locator('.nj-title')).toHaveText('Settings Night');
  await expect(preview.locator('.nj-waiting')).toHaveText(/^Not taking part right now/);

  const title = audience.getByTestId('join-page-title');
  const waiting = audience.getByTestId('join-page-waiting');
  await expect(title).toHaveAttribute('placeholder', 'Settings Night');
  await title.fill('Quiz Night');
  await waiting.fill('Back after the break');
  await waiting.press('Enter');
  await expect(preview.locator('.nj-title')).toHaveText('Quiz Night');
  await expect(preview.locator('.nj-waiting')).toHaveText('Back after the break');

  // Saved with the production: a reload keeps both.
  await settleDurableWrites(audience);
  await audience.reload();
  await expect(audience.getByTestId('join-page-title')).toHaveValue('Quiz Night');
  await expect(audience.getByTestId('join-page-waiting')).toHaveValue('Back after the break');
  await audience.getByTestId('audience-preview-details').locator('summary').click();
  await expect(preview.locator('.nj-title')).toHaveText('Quiz Night');

  // Emptied, the defaults come back.
  await audience.getByTestId('join-page-title').fill('');
  await audience.getByTestId('join-page-title').blur();
  await expect(preview.locator('.nj-title')).toHaveText('Settings Night');
  const stored = await audience.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    return loadShows().find((s) => s.id === id)?.joinPage ?? null;
  }, showId);
  expect(stored).toEqual({ waiting: 'Back after the break' });
});

test('a Join card cue takes its place and size from the cue editor', async ({ page }) => {
  // interaction spec AC-11: the Join card is an ordinary cue, so the cue editor's Place and Size
  // move it like any other. Adding it from Interaction needs a published link (the configured
  // walk presses that button); here it is added the way that button adds it, with a link.
  await page.setViewportSize({ width: 1600, height: 900 });
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Join Card Night');
  await page.evaluate(async (id) => {
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const { buildDraftTemplate, initialDraft, mergeDraft } = await __noacgImport('/src/components/wizard/draft.ts');
    const { addGraphicToShow } = await __noacgImport('/src/model/shows.ts');
    const variant = variantById('jc01')!;
    const lines = variant.suggestedLines.map((l) => (l.title === 'Join link' ? { ...l, sample: 'https://noacg.studio/j/join-card-night' } : { ...l }));
    addGraphicToShow(id, buildDraftTemplate(variant, mergeDraft(initialDraft(), { variantId: variant.id, lines })), {});
    window.dispatchEvent(new Event('spx-data-changed'));
    await new Promise((r) => setTimeout(r));
  }, showId);
  const cue = page.locator('.pd-cue', { hasText: 'House Join Card' }).first();
  await expect(cue).toBeVisible();
  await cue.click();
  const frame = async () =>
    JSON.parse((await page.locator('[data-testid="production-preview"] iframe').first().getAttribute('data-appearance')) ?? '{"frame":null}').frame as { dx: number; dy: number; s: number } | null;
  const summary = page.getByTestId('cue-adjust-summary');
  await expect(summary).toHaveText(/as designed/);
  await page.getByTestId('cue-adjust-toggle').click();
  await expect(page.getByTestId('adjust-floor')).toHaveText(/smallest text \d/, { timeout: 15_000 });
  // The card is designed bottom-right; Place moves it top-left, and Size makes it larger.
  await page.getByTestId('adjust-place-tl').click();
  await expect(summary).toHaveText(/top-left/);
  await expect.poll(async () => (await frame())?.dx ?? 0).toBeLessThan(-400);
  await page.getByTestId('adjust-larger').click();
  await expect(page.getByTestId('adjust-size')).toHaveValue('105');
  await expect.poll(async () => (await frame())?.s ?? 1).toBeGreaterThan(1);
  // Nothing reaches PROGRAM by being placed.
  expect(await page.locator('[data-testid="program-stage"] iframe').first().getAttribute('data-appearance')).toBeNull();
  // The card on PREVIEW still carries its code.
  await expect(page.frameLocator('[data-testid="production-preview"] iframe').first().locator('#audience-join-qr path')).toHaveAttribute('d', /^M/);
});

test('the public join page answers honestly on an offline build', async ({ page }) => {
  // The page is a capability URL, so every "nothing here" answer is the SAME answer — but an
  // offline build is not a capability question at all, and saying so beats showing a form that
  // could never send anything.
  await page.goto('/join/friday-night-live');
  await expect(page.locator('#join')).toContainText('runs offline');
  // The short link is the same page (interaction spec D2).
  await page.goto('/j/friday-night-live');
  await expect(page.locator('#join')).toContainText('runs offline');
  await page.goto('/join/friday-night-live');
  await expect(page.locator('form, textarea')).toHaveCount(0);
  // …and it answers honestly IN THE PAGE'S OWN LOOK. The stylesheet ships with the join surface,
  // so every state that does not mount that surface — this one and the presenter view — used to
  // render as unstyled serif text flush against the left edge. An honest message nobody would
  // trust is not an honest answer.
  await expect(page.locator('#noacg-join-style')).toHaveCount(1);
  await expect(page.locator('#join')).toHaveClass(/\bnj\b/);
});

test('an unknown production workspace degrades to Playout rather than a dead surface', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Degrade');
  const url = page.url();
  await page.goto(`${url.replace(/\/(data|audience)$/, '')}/nonsense`);
  await expect(page.getByTestId('production-verbs')).toBeVisible();
  await expect(page.getByTestId('production-audience')).toHaveCount(0);
});

test('results reach air only as cues the operator takes: one cue per question, nothing sent from Interaction (AC-9)', async ({ page }) => {
  // docs/work-specs/interaction/spec.md AC-9 and the Rules S1 to S16 in its phase 3 notes. Counts
  // become an ordinary cue's field values on the remembered result graphic; the renderer never
  // learns votes exist, and nothing in Interaction adds a row to the output's command log.
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  await productionFor(page, 'Derby Night');
  await page.getByTestId('action-log').locator('summary').click();
  const log = page.getByTestId('action-log-row');
  const sent = await log.count();
  let audience = await openWorkspace(page, 'audience');
  const stage = () => audience.getByTestId('audience-round-stage');
  const note = () => audience.getByTestId('audience-note');

  await addQuestion(audience, 'choice', 'Who wins the derby?', ['The home side', 'The visitors', 'A draw']);
  await goLive(audience, 'Who wins the derby?');
  await expect(audience.getByTestId('question-selected-text')).toHaveText('Who wins the derby?');
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('2', { timeout: 10_000 });

  // The first press asks where results go (S5), then stages one cue there and remembers it.
  await stage().click();
  await audience.getByTestId('result-choose-graphic').filter({ hasText: 'House Vote' }).click();
  await expect(note()).toContainText('✓ Added a result cue on “House Vote”');
  await expect(stage()).toHaveText('Add results to rundown on House Vote');
  const staged = async () =>
    audience.evaluate(async () => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const show = loadShows()[0];
      const results = (show.cues ?? []).filter((c) => c.label.startsWith('Vote —'));
      const cue = results[0];
      return cue ? { id: cue.id, count: results.length, values: cue.values, mapped: Object.values(show.resultCues ?? {}) } : null;
    });
  await expect.poll(async () => (await staged())?.values.f1).toBe('The home side | 2\nThe visitors | 1\nA draw | 1');
  const first = (await staged())!;
  expect(first.values.f0).toBe('Who wins the derby?');
  expect(first.values.f2).toBe('4 votes · voting open');
  expect(first.mapped).toEqual([first.id]);

  // A second press updates that cue (S2).
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('4', { timeout: 10_000 });
  await stage().click();
  await expect(note()).toContainText('✓ Updated the result cue on “House Vote” with 8 votes');
  await expect.poll(async () => (await staged())?.values.f1).toBe('The home side | 4\nThe visitors | 2\nA draw | 2');
  expect((await staged())!.count).toBe(1);

  // Go live and both presses sent nothing (S8).
  await settleDurableWrites(audience);
  await expect(log).toHaveCount(sent);

  // Only the operator's Take puts the tally on air, and its rows are the Take's.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await page.locator('.pd-cue', { hasText: 'Vote —' }).click();
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('body')).toContainText('8 votes · voting open');
  await expect(log.first()).toContainText('Took “Vote — Who wins the derby?”');
  const taken = await log.count();
  expect(taken).toBeGreaterThan(sent);
  const chip = page.getByTestId('machine-state-chip');
  const onAir = await chip.textContent();

  // With the cue on air, staging changes the cue and not Program (S8).
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('6', { timeout: 10_000 });
  await stage().click();
  await expect.poll(async () => (await staged())?.values.f2).toBe('12 votes · voting open');

  // Stop writes "voting closed" into the cue (S7), sends nothing, and leaves the board where it was.
  await stopLive(audience, 'Who wins the derby?');
  await expect(note()).toContainText('now carries the final counts');
  await expect.poll(async () => (await staged())?.values.f2).toBe('12 votes · voting closed');
  await settleDurableWrites(audience);
  await expect(log).toHaveCount(taken);
  await expect(program.locator('body')).toContainText('8 votes · voting open');
  await expect(chip).toHaveText(onAir ?? '');
  await expect(chip).not.toHaveText(/result/i);

  // A question edit sends nothing either.
  await addQuestion(audience, 'open', 'Any message for the team?');
  await settleDurableWrites(audience);
  await expect(log).toHaveCount(taken);

  // A tab change (the Interaction tab closed and opened again) and a reload update the same cue:
  // the link is saved with the production, not held by the page (S1, S4).
  await settleDurableWrites(audience);
  await audience.close();
  audience = await openWorkspace(page, 'audience');
  await questionRow(audience, 'Who wins the derby?').getByTestId('question-row-text').click();
  await stage().click();
  await expect(note()).toContainText('✓ The result cue on “House Vote” now carries the final 12 votes');
  await settleDurableWrites(audience);
  await audience.reload();
  await questionRow(audience, 'Who wins the derby?').getByTestId('question-row-text').click();
  await stage().click();
  await expect(note()).toContainText('✓ The result cue on “House Vote” now carries the final 12 votes');
  expect(await staged()).toMatchObject({ id: first.id, count: 1 });
  expect((await staged())!.values.f2).toBe('12 votes · voting closed');
  await settleDurableWrites(audience);
  await expect(log).toHaveCount(taken);

  // The operator's Update moves the closed numbers on air.
  await page.getByTestId('verb-update').click();
  await expect(program.locator('body')).toContainText('12 votes · voting closed');
  await expect.poll(() => log.count()).toBeGreaterThan(taken);

  // A deleted result cue gets a new one, and the note says so (S3).
  await audience.evaluate(async (id) => {
    const { loadShows, removeShowCue } = await __noacgImport('/src/model/shows.ts');
    removeShowCue(loadShows()[0].id, id);
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    await commitDurableWrites();
  }, first.id);
  await audience.reload();
  await questionRow(audience, 'Who wins the derby?').getByTestId('question-row-text').click();
  await stage().click();
  await expect(note()).toContainText('The earlier result cue was deleted, so this is a new one.');
  const replaced = (await staged())!;
  expect(replaced.count).toBe(1);
  expect(replaced.id).not.toBe(first.id);
  expect(replaced.mapped).toContain(replaced.id);
});

test('a second operator tab updates the same result cue; a graphic without the fields gets a new cue (AC-9)', async ({ page }) => {
  // Two Interaction tabs of one production stand for two operators of one browser; a synced
  // second operator reads the same saved link (Node: scripts/result-staging.test.mjs).
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  await productionFor(page, 'Two Desks');
  const one = await openWorkspace(page, 'audience');
  await addQuestion(one, 'choice', 'Best goal?', ['First', 'Second']);
  await goLive(one, 'Best goal?');
  await one.getByTestId('audience-round-stage').click();
  await one.getByTestId('result-choose-graphic').filter({ hasText: 'House Vote' }).click();
  await expect(one.getByTestId('audience-note')).toContainText('✓ Added a result cue');
  await settleDurableWrites(one);
  const two = await openWorkspace(page, 'audience');
  await questionRow(two, 'Best goal?').getByTestId('question-row-text').click();
  await two.getByTestId('audience-round-stage').click();
  await expect(two.getByTestId('audience-note')).toContainText('✓ Updated the result cue on “House Vote”');
  const results = async () =>
    two.evaluate(async () => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const show = loadShows()[0];
      return { cues: (show.cues ?? []).filter((c) => c.label.startsWith('Vote —')).map((c) => ({ id: c.id, source: c.sourceId })), mapped: Object.values(show.resultCues ?? {}) };
    });
  const before = await results();
  expect(before.cues).toHaveLength(1);

  // Its graphic loses the result fields (an edit made elsewhere): the next press makes a new cue on
  // the graphic chosen, with a note, and the old cue stays in the rundown.
  await two.evaluate(async (id) => {
    const { loadShows, addGraphicToShow } = await __noacgImport('/src/model/shows.ts');
    const show = loadShows()[0];
    const g = show.graphics.find((x) => x.id === id)!;
    // The graphic updated in place (same name, same id), now without an Options field.
    addGraphicToShow(show.id, { ...g.template, fields: (g.template.fields ?? []).map((f) => (f.title === 'Options' ? { ...f, title: 'Rows' } : f)) }, { graphicId: g.id });
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    await commitDurableWrites();
  }, before.cues[0].source);
  await two.reload();
  await questionRow(two, 'Best goal?').getByTestId('question-row-text').click();
  await two.getByTestId('audience-round-stage').click();
  await expect(two.getByTestId('audience-note')).toContainText('no longer has the result fields');
  await two.getByTestId('result-choose-board').filter({ hasText: 'Volt Vote' }).click();
  await expect(two.getByTestId('audience-note')).toContainText('✓ The earlier result cue’s graphic no longer has the result fields, so this is a new one. Added a result cue on “Volt Vote”');
  const after = await results();
  expect(after.cues).toHaveLength(2);
  expect(after.mapped).toContain(after.cues.find((c) => c.id !== before.cues[0].id)!.id);
});

// ── QUESTIONS AND THEIR LIFECYCLE (docs/work-specs/interaction/spec.md, phase 1). The provider's
// rules are pinned in Node (scripts/interaction-lifecycle.test.mjs) and against the database in
// e2e/configured/audience-live.spec.ts; these are the operator's and a phone's walks. ──

/** The production's room as the local provider keeps it (src/audience/localAudience.ts). */
async function room(tab: Page, showId: string): Promise<{ rounds: { id: string; closedAt: string | null }[] } | null> {
  return tab.evaluate((id) => {
    const raw = window.localStorage.getItem('spx-gfx-audience-room');
    return raw ? (JSON.parse(raw).rooms?.[id] ?? null) : null;
  }, showId);
}

test('questions are written, browsed and changed safely, and the list survives a reload (AC-1, AC-2)', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  const showId = await productionFor(page, 'Question Night');
  // Setup names the view Interaction, and so does the view itself.
  await page.getByTestId('production-setup').click();
  await expect(page.getByTestId('setup-audience')).toHaveText('Interaction…');
  await page.keyboard.press('Escape');
  const ws = await openWorkspace(page, 'audience');
  await expect(ws.getByRole('heading', { name: 'Interaction', exact: true })).toBeVisible();
  await expect(ws.getByText('Messages…')).toHaveCount(0);

  await addQuestion(ws, 'open', 'What should we ask the coach?');
  await addQuestion(ws, 'choice', 'Who wins?', ['Home', 'Away']);
  await addQuestion(ws, 'open', 'Where are you watching from');
  const texts = ws.getByTestId('question-row-text');
  await expect(texts).toHaveText(['What should we ask the coach?', 'Who wins?', 'Where are you watching from']);

  // Edit, then reorder by the menu and by the keyboard.
  await questionRow(ws, 'Where are you watching from').getByTestId('question-more').click();
  await ws.getByTestId('question-edit').click();
  await ws.getByTestId('question-text').fill('Where are you watching from?');
  await ws.getByTestId('question-save').click();
  await questionRow(ws, 'Where are you watching from?').getByTestId('question-more').click();
  await ws.getByTestId('question-move-up').click();
  await expect(texts).toHaveText(['What should we ask the coach?', 'Where are you watching from?', 'Who wins?']);
  await questionRow(ws, 'Who wins?').focus();
  await ws.keyboard.press('Alt+ArrowUp');
  await expect(texts).toHaveText(['What should we ask the coach?', 'Who wins?', 'Where are you watching from?']);

  // SELECTING changes nothing on phones or Program (R12): no round, no cue.
  const cuesBefore = await cueLabels(ws);
  await questionRow(ws, 'Who wins?').click();
  await expect(ws.getByTestId('question-selected-text')).toHaveText('Who wins?');
  expect((await room(ws, showId))?.rounds ?? []).toHaveLength(0);
  expect(await cueLabels(ws)).toEqual(cuesBefore);

  // Live, the words are locked even with no answers; answered, they stay locked after Stop.
  const vote = questionRow(ws, 'Who wins?');
  await goLive(ws, 'Who wins?');
  await vote.getByTestId('question-more').click();
  await expect(ws.getByTestId('question-edit')).toBeDisabled();
  await expect(ws.getByTestId('question-clear')).toBeDisabled(); // refused while live
  await ws.keyboard.press('Escape');
  await expect(ws.getByTestId('question-locked')).toBeVisible();
  await ws.getByTestId('audience-simulate-votes').click();
  await expect(vote.getByTestId('question-count')).toHaveText('3', { timeout: 10_000 });
  await stopLive(ws, 'Who wins?');
  await vote.getByTestId('question-more').click();
  await expect(ws.getByTestId('question-edit')).toBeDisabled();
  await ws.keyboard.press('Escape');

  // Going live again continues the same count.
  await goLive(ws, 'Who wins?');
  await expect(vote.getByTestId('question-count')).toHaveText('3');
  await ws.getByTestId('audience-simulate-votes').click();
  await expect(vote.getByTestId('question-count')).toHaveText('6', { timeout: 10_000 });
  await stopLive(ws, 'Who wins?');

  // Clear results takes two presses and leaves nothing; the words may then change.
  await vote.getByTestId('question-more').click();
  await ws.getByTestId('question-clear').click();
  await expect(ws.getByTestId('question-clear')).toHaveText('Press again to clear its results');
  await expect(vote.getByTestId('question-count')).toHaveText('6');
  await ws.getByTestId('question-clear').click();
  await expect(vote.getByTestId('question-count')).toHaveText('0');
  await vote.getByTestId('question-more').click();
  await expect(ws.getByTestId('question-edit')).toBeEnabled();
  await ws.keyboard.press('Escape');

  // An answered Open question: Duplicate starts from zero; Delete (while live) stops it first and
  // keeps its answer under Earlier questions.
  await goLive(ws, 'What should we ask the coach?');
  await paste(ws, 'How is the knee?', 'Ana');
  const coach = questionRow(ws, 'What should we ask the coach?');
  await expect(coach.getByTestId('question-count')).toHaveText('1');
  await coach.getByTestId('question-more').click();
  await ws.getByTestId('question-duplicate').click();
  await expect(texts).toHaveText(['What should we ask the coach?', 'What should we ask the coach?', 'Who wins?', 'Where are you watching from?']);
  await expect(ws.getByTestId('question-count').nth(1)).toHaveText('0');
  await coach.first().getByTestId('question-more').click();
  await ws.getByTestId('question-delete').click();
  await expect(texts).toHaveText(['What should we ask the coach?', 'Who wins?', 'Where are you watching from?']);
  await expect(ws.getByTestId('question-live')).toHaveCount(0);
  await ws.getByTestId('message-question-filter').selectOption('earlier');
  await expect(ws.locator('.pd-aud-row')).toHaveCount(1);
  await expect(ws.locator('.pd-aud-row .pd-aud-body')).toHaveText('How is the knee?');

  // The list, its order and the edited words survive a reload.
  await settleDurableWrites(ws);
  await ws.reload();
  await expect(ws.getByTestId('question-row-text')).toHaveText(['What should we ask the coach?', 'Who wins?', 'Where are you watching from?']);

  // R27: a live question removed from the list elsewhere (here the Playout tab, as another device's
  // sync would) still has a Stop, and Stop takes phones back to the waiting text.
  await goLive(ws, 'Where are you watching from?');
  await page.evaluate(async (id) => {
    const { setShowQuestions } = await __noacgImport('/src/model/shows.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    setShowQuestions(id, (list) => list.filter((q) => q.text !== 'Where are you watching from?'));
    await commitDurableWrites();
  }, showId);
  const orphan = ws.getByTestId('question-orphan-live');
  await expect(orphan).toContainText('Where are you watching from?');
  await orphan.getByTestId('question-orphan-stop').click();
  await expect(orphan).toHaveCount(0);
  expect(((await room(ws, showId))?.rounds ?? []).filter((r) => !r.closedAt)).toHaveLength(0);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('a Word question takes one word per phone, lists words by frequency, and airs only the shown words through Take (AC-14)', async ({ page, context }) => {
  // docs/work-specs/interaction/spec.md AC-14 and the Rules W1 to W9 in its phase 6 notes.
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Word Night');
  await page.getByTestId('action-log').locator('summary').click();
  const log = page.getByTestId('action-log-row');
  const sent = await log.count();
  const ws = await openWorkspace(page, 'audience');
  const note = ws.getByTestId('audience-note');

  await addQuestion(ws, 'word', 'Sum up tonight in one word');
  await expect(questionRow(ws, 'Sum up tonight in one word').getByTestId('question-type')).toHaveText('Word');
  await goLive(ws, 'Sum up tonight in one word');

  // A phone: one word of at most 25 characters, once (W2, W3).
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`/join?rehearse=${showId}`);
  await expect(phone.locator('#join .nj-prompt')).toHaveText('Sum up tonight in one word');
  const word = phone.locator('#nj-word');
  const send = phone.locator('#join .nj-send');
  await word.fill('two words');
  await expect(phone.locator('#join .nj-count')).toHaveText('One word only');
  await expect(send).toBeDisabled();
  await word.fill('x'.repeat(26));
  await expect(phone.locator('#join .nj-count')).toHaveText('1 character too many');
  await expect(send).toBeDisabled();
  await word.fill(' Brilliant ');
  await send.click();
  await expect(phone.locator('#join .nj-word')).toHaveText('Brilliant');
  await expect(word).toHaveCount(0);
  await phone.reload();
  await expect(phone.locator('#join .nj-word')).toHaveText('Brilliant');
  await expect(phone.locator('#nj-word')).toHaveCount(0);

  // Listed by frequency (W1); words are not messages (W9).
  await ws.getByTestId('word-simulate').click(); // Exciting, Tense, Exciting, Loud
  await expect(ws.getByTestId('word-text')).toHaveText(['Exciting', 'Brilliant', 'Loud', 'Tense']);
  await expect(ws.getByTestId('word-count')).toHaveText(['2', '1', '1', '1']);
  await expect(questionRow(ws, 'Sum up tonight in one word').getByTestId('question-count')).toHaveText('5');
  await expect(ws.locator('.pd-aud-row')).toHaveCount(0);

  // A hidden word stays listed, struck through, and never reaches the cue (W6).
  await ws.getByTestId('word-row').filter({ hasText: 'Loud' }).getByTestId('word-hide').click();
  await expect(ws.getByTestId('word-row').filter({ hasText: 'Loud' })).toHaveClass(/hidden/);

  // Staging asks where, adds one word cloud cue with the shown words, and sends nothing (W7, W8).
  await ws.getByTestId('word-stage').click();
  await ws.getByTestId('word-choose-board').filter({ hasText: 'House Word Cloud' }).click();
  await expect(note).toContainText('✓ Added a word cloud cue on “House Word Cloud” with 3 words');
  await expect(ws.getByTestId('word-stage')).toHaveText('Add word cloud to rundown on House Word Cloud');
  const staged = async () =>
    ws.evaluate(async () => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const show = loadShows()[0];
      const cues = (show.cues ?? []).filter((c) => c.label.startsWith('Words:'));
      return { count: cues.length, id: cues[0]?.id, values: cues[0]?.values ?? {} };
    });
  await expect.poll(async () => (await staged()).values.f2).toBe('Exciting | 2\nBrilliant | 1\nTense | 1');
  expect((await staged()).values.f1).toBe('Sum up tonight in one word');
  await settleDurableWrites(ws);
  await expect(log).toHaveCount(sent);

  // Only Take puts it on air, and air carries the shown words only.
  await page.locator('.pd-cue', { hasText: 'Words:' }).click();
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="House Word Cloud"]');
  const onAir = async () => (await program.locator('.audience-word').allTextContents()).sort();
  await expect.poll(onAir).toEqual(['Brilliant', 'Exciting', 'Tense']);
  await expect(log.first()).toContainText('Took “Words: Sum up tonight in one word”');
  const taken = await log.count();

  // A copy of the cue made before a Hide (the rundown's own clipboard) is held to it as well.
  const clip = await ws.evaluate(async () => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const { copyClip } = await __noacgImport('/src/model/cueClipboard.ts');
    const show = loadShows()[0];
    return copyClip(show, (show.cues ?? []).filter((c) => c.label.startsWith('Words:')).map((c) => c.id));
  });
  // A word hidden after the press leaves the cue too, so it never airs with the next Take or
  // Update; the write sends nothing (W6, W8).
  await ws.getByTestId('word-row').filter({ hasText: 'Tense' }).getByTestId('word-hide').click();
  await expect.poll(async () => (await staged()).values.f2).toBe('Exciting | 2\nBrilliant | 1');
  await expect(note).toContainText('If the cloud is on air, press Update');
  // Pasting the earlier copy brings no hidden word back (W11), then the copy is removed again.
  const pasted = await ws.evaluate(async (c) => {
    const { loadShows, pasteInRundown, removeShowCue } = await __noacgImport('/src/model/shows.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const show = loadShows()[0];
    const r = pasteInRundown(show.id, c as never, { end: true });
    await commitDurableWrites();
    const values = loadShows()[0].cues?.find((x) => x.id === r.cueIds[0])?.values.f2 ?? null;
    for (const id of r.cueIds) removeShowCue(show.id, id);
    await commitDurableWrites();
    await new Promise((res) => setTimeout(res));
    return { error: r.refused ?? r.error, values };
  }, clip);
  expect(pasted).toEqual({ error: null, values: 'Exciting | 2\nBrilliant | 1' });

  // A second press is a new snapshot on the same cue; Program changes only by Update (W7, W8).
  await ws.getByTestId('word-simulate').click(); // Fun, Exciting, Tense, Proud
  await expect(ws.getByTestId('word-text').first()).toHaveText('Exciting');
  await expect(ws.getByTestId('word-count').first()).toHaveText('3');
  await ws.getByTestId('word-stage').click();
  await expect(note).toContainText('✓ Updated the word cloud cue on “House Word Cloud”');
  await expect.poll(async () => (await staged()).values.f2).toBe('Exciting | 3\nBrilliant | 1\nFun | 1\nProud | 1');
  expect((await staged()).count).toBe(1);
  await stopLive(ws, 'Sum up tonight in one word');
  await settleDurableWrites(ws);
  await expect(log).toHaveCount(taken);
  expect(await onAir()).toEqual(['Brilliant', 'Exciting', 'Tense']);
  await page.getByTestId('verb-update').click();
  await expect.poll(onAir).toEqual(['Brilliant', 'Exciting', 'Fun', 'Proud']);
});

test('a stale phone keeps its words, sees the new question, and files nothing until it sends again (AC-4, AC-7)', async ({ page, context }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Phone Night');
  const ws = await openWorkspace(page, 'audience');
  await addQuestion(ws, 'open', 'First question');
  await addQuestion(ws, 'open', 'Second question');
  await addQuestion(ws, 'choice', 'Pick one', ['Red', 'Blue']);
  await goLive(ws, 'First question');

  // A rehearsal phone in this browser. Its clock is held, so it keeps what it last read until the
  // test lets its five-second poll run: that is what makes it stale.
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.clock.install();
  await phone.goto(`/join?rehearse=${showId}`);
  await expect(phone.locator('#join .nj-prompt')).toHaveText('First question');
  await phone.locator('#nj-body').fill('Typed for the first');

  await goLive(ws, 'Second question');
  await phone.locator('#join .nj-send').click();
  await expect(phone.locator('#join .nj-note')).toHaveText('That question has closed.');
  await expect(phone.locator('#join .nj-prompt')).toHaveText('Second question');
  await expect(phone.locator('#nj-body')).toHaveValue('Typed for the first');
  // Nothing was filed, under either question, until the viewer sends again.
  await expect(questionRow(ws, 'First question').getByTestId('question-count')).toHaveText('0');
  await expect(questionRow(ws, 'Second question').getByTestId('question-count')).toHaveText('0');
  await phone.locator('#join .nj-send').click();
  await expect(phone.locator('#join .nj-mine')).toContainText('Typed for the first');
  await expect(questionRow(ws, 'Second question').getByTestId('question-count')).toHaveText('1');

  // Paste files under the live Open question by default, or under none (AC-7).
  await expect(ws.getByTestId('paste-destination')).toHaveValue('live');
  await paste(ws, 'Pasted under the second');
  await ws.getByTestId('paste-destination').selectOption('none');
  await paste(ws, 'Pasted under none');
  await ws.getByTestId('message-question-filter').selectOption({ label: 'No question' });
  await expect(ws.locator('.pd-aud-row .pd-aud-body')).toHaveText(['Pasted under none']);

  // A vote: after Stop, Clear results, an edit and Go live again, a phone still showing the old
  // options is refused rather than counted against the new ones.
  await goLive(ws, 'Pick one');
  // Changing the live question never moved the earlier answers.
  await ws.getByTestId('message-question-filter').selectOption({ label: 'Second question' });
  await expect(ws.locator('.pd-aud-row .pd-aud-body')).toHaveText(['Typed for the first', 'Pasted under the second']);
  await phone.clock.runFor(7_000);
  await expect(phone.locator('#join .nj-opt')).toHaveCount(2);
  await phone.locator('#join .nj-opt').nth(1).click();
  await expect(phone.locator('#join .nj-opt').nth(1)).toHaveAttribute('aria-pressed', 'true');
  const pick = questionRow(ws, 'Pick one');
  await expect(pick.getByTestId('question-count')).toHaveText('1', { timeout: 10_000 });
  await stopLive(ws, 'Pick one');
  await pick.getByTestId('question-more').click();
  await ws.getByTestId('question-clear').click();
  await ws.getByTestId('question-clear').click();
  await expect(pick.getByTestId('question-count')).toHaveText('0');
  await pick.getByTestId('question-more').click();
  await ws.getByTestId('question-edit').click();
  await ws.getByTestId('question-options').fill('Blue\nRed\nGreen');
  await ws.getByTestId('question-save').click();
  await goLive(ws, 'Pick one');
  await phone.locator('#join .nj-opt').nth(0).click(); // still the old "Red"
  await expect(phone.locator('#join .nj-note')).toHaveText('That question has closed.');
  await expect(phone.locator('#join .nj-opt')).toHaveCount(3);
  await expect(pick.getByTestId('question-count')).toHaveText('0');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  // A thanks belongs to the question it was for (found on the phase 3 rehearsal walk): once the
  // room moves on, the phone does not keep saying "Counted ... while the vote is open".
  await phone.locator('#join .nj-opt').nth(2).click();
  await expect(phone.locator('#join .nj-note')).toHaveText(/^Counted\./);
  await stopLive(ws, 'Pick one');
  await phone.clock.runFor(7_000);
  await expect(phone.locator('#join .nj-waiting')).toBeVisible();
  await expect(phone.locator('#join .nj-note')).toHaveCount(0);
});

test('unpublished, Interaction offers Publish where phones would join and publishes nothing by itself (AC-8)', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Rehearsal');
  const ws = await openWorkspace(page, 'audience');
  const join = ws.getByTestId('interaction-join');
  await expect(join.getByTestId('join-unpublished')).toContainText('Phones can join once this production is published.');
  // This build has no backend: Publish says why it is off, and no sign-in prompt appears.
  await expect(join.getByTestId('join-publish')).toBeDisabled();
  await expect(join.getByTestId('join-publish')).toHaveAttribute('title', 'Publishing needs the cloud backend, and this build runs offline');
  await expect(ws.getByTestId('signin-prompt')).toHaveCount(0);
  await expect(join.getByTestId('join-rehearse')).toHaveAttribute('href', `/join?rehearse=${showId}`);

  // Everything but phones rehearses: questions, Go live, the preview, paste and Simulate.
  await addQuestion(ws, 'open', 'Rehearse me');
  await goLive(ws, 'Rehearse me');
  await ws.getByTestId('audience-preview-details').locator('summary').click();
  await expect(ws.getByTestId('audience-preview').locator('.nj-prompt')).toHaveText('Rehearse me');
  await paste(ws, 'A pasted answer');
  await simulateArrivals(ws);
  await expect(questionRow(ws, 'Rehearse me').getByTestId('question-count')).toHaveText('4');
  await settleDurableWrites(ws);
  const published = await ws.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const show = loadShows().find((s) => s.id === id)!;
    return { hosted: show.hostedSlug ?? null, join: show.joinSlug ?? null };
  }, showId);
  expect(published).toEqual({ hosted: null, join: null });
});

test('a vote with nowhere to go offers a vote board instead of writing a cue nobody can read', async ({ page }) => {
  // The pool holds a name strap, not a vote board. Staging a tally into it would put a question in
  // a presenter's name field, so the press offers the catalog's vote boards (S5), and the board
  // picked arrives with one cue, which becomes the result cue.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Board');
  const audience = await openWorkspace(page, 'audience');

  await addQuestion(audience, 'choice', 'Anything?', ['Yes', 'No']);
  await goLive(audience, 'Anything?');
  // Stopped with no result cue: the note offers nothing to take.
  await stopLive(audience, 'Anything?');
  await expect(audience.getByTestId('audience-note')).toHaveText('✓ Stopped. Phones show the waiting text.');
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('result-no-destination')).toBeVisible();
  const cues = async () =>
    page.evaluate(async () => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      return (loadShows()[0].cues ?? []).map((c) => ({ label: c.label, values: c.values }));
    });
  expect((await cues()).filter((c) => c.label.startsWith('Vote —'))).toHaveLength(0);

  await audience.getByTestId('result-choose-board').filter({ hasText: 'House Vote' }).click();
  await expect(audience.getByTestId('audience-note')).toContainText('✓ Added a result cue on “House Vote”');
  await expect.poll(async () => (await cues()).filter((c) => c.label.startsWith('Vote —'))).toHaveLength(1);
  // The board's one seeded cue became the result cue: no extra sample cue was left behind.
  expect((await cues()).filter((c) => c.label === 'House Vote')).toHaveLength(0);
  expect((await cues()).some((c) => Object.values(c.values).includes('Anything?'))).toBe(true);
});

// ── A cue the rundown did not keep is said as such, never with a tick
// (components/never-report-save-storage-layer-has). The workspace is its own tab, so the refusal is
// armed on the whole browser context. ──

/** The cues of the one production, as the workspace's own tab has them. */
async function cueLabels(tab: Page): Promise<string[]> {
  return tab.evaluate(async () => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    return (loadShows()[0].cues ?? []).map((c) => c.label);
  });
}

test('a message prepared while the rundown cannot save says so, stays unused, and prepares once on retry', async ({ page }) => {
  await armStorageFailure(page.context());
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Phone In');
  const audience = await openWorkspace(page, 'audience');
  await simulateArrivals(audience);
  // All, not the inbox: a message that was used leaves the inbox, and this one must stay in view.
  await audience.getByTestId('audience-filter-all').click();
  const first = audience.locator('.pd-aud-row').first();
  await expect(first).toBeVisible();
  const before = await cueLabels(audience);

  // Where messages go is chosen first, so the refused write below is the cue's alone.
  await audience.getByTestId('message-target').selectOption({ label: 'House Q&A' });
  await settleDurableWrites(audience);

  await fillStorage(audience);
  await first.getByTestId('audience-prepare').click();
  await expect(audience.getByTestId('audience-note')).toContainText('No cue was prepared');
  await expect(audience.getByTestId('audience-note')).not.toContainText('✓');
  await expect(first.getByTestId('audience-used')).toHaveCount(0);
  expect(await cueLabels(audience)).toEqual(before);

  await freeStorage(audience);
  await first.getByTestId('audience-prepare').click();
  await expect(audience.getByTestId('audience-note')).toContainText('✓ Cue');
  await expect(first.getByTestId('audience-used')).toBeVisible();
  expect((await cueLabels(audience)).length).toBe(before.length + 1);
});

test('a result staged while the rundown cannot save says so, and staging again adds the cue once', async ({ page }) => {
  await armStorageFailure(page.context());
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  await productionFor(page, 'Derby Night');
  const audience = await openWorkspace(page, 'audience');
  await addQuestion(audience, 'choice', 'Who wins the derby?', ['The home side', 'The visitors']);
  await goLive(audience, 'Who wins the derby?');
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).not.toHaveText('0', { timeout: 10_000 });
  const votes = async () => (await cueLabels(audience)).filter((l) => l.startsWith('Vote —')).length;

  // Where results go is chosen first, so the refused write below is the cue's alone.
  await audience.getByTestId('audience-round-stage').click();
  await audience.getByTestId('result-choose-graphic').filter({ hasText: 'House Vote' }).click();
  await expect(audience.getByTestId('audience-note')).toContainText('✓ Added a result cue');
  expect(await votes()).toBe(1);
  // The cue is deleted, so the next press adds one, and that write is refused.
  await audience.evaluate(async () => {
    const { loadShows, removeShowCue } = await __noacgImport('/src/model/shows.ts');
    const show = loadShows()[0];
    const cue = (show.cues ?? []).find((c) => c.label.startsWith('Vote —'))!;
    removeShowCue(show.id, cue.id);
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    await commitDurableWrites();
  });
  expect(await votes()).toBe(0);

  await fillStorage(audience);
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('No result');
  await expect(audience.getByTestId('audience-note')).not.toContainText('✓');
  expect(await votes()).toBe(0);

  await freeStorage(audience);
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('✓ The earlier result cue was deleted, so this is a new one. Added a result cue');
  expect(await votes()).toBe(1);

  // Re-staging a cue that exists: a refused update is said, and no second cue appears.
  await fillStorage(audience);
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('was not updated');
  expect(await votes()).toBe(1);
});

test('the presenter pointers: queue what is read now and next, without airing anything', async ({ page }) => {
  // PHASE 6 (docs/INTERACTIVE_PLAYOUT_PLAN.md). `audience_set_join` accepted presenter.current
  // and .next and `/join?pv=<slug>` rendered them, but nothing set them. What is pinned here is
  // the operator half - the half the offline suite can drive - and above all that pointing at a
  // question TELLS A PERSON WHAT TO SAY and airs nothing: no cue appears on the rundown.
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Autocue');
  const audience = await openWorkspace(page, 'audience');
  await simulateArrivals(audience);
  const rows = audience.locator('.pd-aud-row');
  await expect(rows).toHaveCount(3);

  // The pointers sit in each message's menu, one press away. An item reads "Clear …" while its
  // slot points at that message, which is what is read back here.
  const now = (i: number) => fromMenu(audience, rows.nth(i), 'audience-presenter-now');
  const next = (i: number) => fromMenu(audience, rows.nth(i), 'audience-presenter-next');
  const pointed = async (i: number, slot: 'now' | 'next') => {
    await rows.nth(i).getByTestId('audience-more').click();
    const item = audience.getByTestId(`audience-presenter-${slot}`);
    const on = /Clear/.test((await item.textContent()) ?? '');
    await audience.keyboard.press('Escape');
    return on;
  };

  // Two presses in one beat. This is the case that used to blank a slot: both handlers composed
  // off the RENDERED pointers, so the second overwrote the first and a presenter's "now" went
  // empty while they were reading it.
  await now(0);
  await next(1);
  expect(await pointed(0, 'now')).toBe(true);
  expect(await pointed(1, 'next')).toBe(true);

  // Moving "now" to another row leaves "next" alone - the two slots are independent, even though
  // they travel to the server as one object.
  await now(2);
  expect(await pointed(0, 'now')).toBe(false);
  expect(await pointed(2, 'now')).toBe(true);
  expect(await pointed(1, 'next')).toBe(true);

  // NOTHING AIRED. The pointers reach no rundown and no command log - a producer queues three
  // questions the show never gets to, and that must not put anything in front of anyone.
  const cues = await page.evaluate(async () => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    return (loadShows().find((s) => s.name === 'Autocue')?.cues ?? []).length;
  });
  expect(cues).toBe(1); // just the one seeded when the graphic was pooled

  // They belong to the PRODUCTION, not this component: a trip to Playout and back must not
  // leave a presenter's tablet showing what the operator's screen says is empty. The trip is
  // taken INSIDE the workspace's own tab - a fresh tab would bring a fresh in-memory provider
  // and prove nothing about the pointers surviving.
  await audience.getByTestId('tab-playout').click();
  await expect(audience.getByTestId('production-verbs')).toBeVisible();
  await audience.goBack();
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  await expect.poll(() => pointed(2, 'now')).toBe(true);
  expect(await pointed(1, 'next')).toBe(true);

  // The same press clears the slot - an autocue you cannot empty is worse than none.
  await now(2);
  expect(await pointed(2, 'now')).toBe(false);
});

// ── PASTE AND SAFE STAGING (docs/work-specs/data-sources/spec.md C0; audience-flow AC-1, AC-2,
// AC-3, AC-6, AC-8). The staging itself is pinned in Node (scripts/message-staging.test.mjs);
// these are the journeys around it. ──

/** The production as this tab's store has it: its graphics and cues, plain. */
async function record(tab: Page, showId: string) {
  return tab.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const show = loadShows().find((s) => s.id === id)!;
    return {
      graphics: show.graphics.map((g) => ({ id: g.id, name: g.name, fields: (g.template.fields ?? []).map((f) => ({ field: f.field, title: f.title ?? '' })) })),
      cues: (show.cues ?? []).map((c) => ({ id: c.id, sourceId: c.sourceId, label: c.label, values: c.values, stagedFrom: c.stagedFrom ?? null })),
      bindings: show.bindings ?? {},
    };
  }, showId);
}

/** A field id on a pool graphic, by its title. */
function fieldOf(rec: Awaited<ReturnType<typeof record>>, graphic: string, title: string): string {
  const g = rec.graphics.find((x) => x.name === graphic)!;
  return g.fields.find((f) => f.title === title)!.field;
}

test('#1313: with only a scoreboard, Prepare adds no cue and offers the Q&A cards; one press adds the card and its cue, airing nothing', async ({ page }) => {
  // The walk of 2026-10-16: a new production holding one scoreboard. "Send to rundown" put the
  // viewer's question into the scoreboard as Team A, because the fallback took the first graphic
  // and its first text field. Restoring that fallback in stageMessage fails this test.
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await productionFor(page, 'Derby');
  const before = await record(page, showId);
  expect(before.cues).toHaveLength(1);

  const messages = await openWorkspace(page, 'audience');
  await expect(messages.getByRole('heading', { name: 'Interaction', exact: true })).toBeVisible();
  await paste(messages, 'Who scores first?', 'Mia');
  const row = messages.locator('.pd-aud-row').first();
  await row.getByTestId('audience-prepare').click();
  await expect(row.getByTestId('audience-no-destination')).toBeVisible();
  await expect(row.getByTestId('audience-choose-card')).toHaveText(['House Q&A', 'Volt Q&A', 'Frost Q&A', 'Clean Q&A']);
  // Asking wrote nothing: the scoreboard's cue is as it was and no cue was added.
  expect((await record(messages, showId)).cues).toEqual(before.cues);

  await row.getByTestId('audience-choose-card').first().click();
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “Who scores first?” is ready on');
  await expect(messages.getByTestId('audience-note')).toContainText('It airs when you Take it');
  await settleDurableWrites(messages);
  const after = await record(messages, showId);
  expect(after.graphics).toHaveLength(2);
  const card = after.graphics.find((g) => g.id !== before.graphics[0].id)!;
  // One card, one cue on it, holding the message; the scoreboard's cue is untouched.
  const onCard = after.cues.filter((c) => c.sourceId === card.id);
  expect(onCard).toHaveLength(1);
  expect(onCard[0].values[fieldOf(after, card.name, 'Question')]).toBe('Who scores first?');
  expect(onCard[0].values[fieldOf(after, card.name, 'Asked by')]).toBe('Mia');
  expect(after.cues.find((c) => c.id === before.cues[0].id)).toEqual(before.cues[0]);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('a pasted message airs exactly as prepared; a second message, an edit and a new arrival cannot change it', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Paste Night');
  const messages = await openWorkspace(page, 'audience');

  // Paste needs no open audience, no publish and no account; Source and Reference stay off air.
  await paste(messages, 'First question?', 'Ana');
  await paste(messages, 'Second question?', 'Ben');
  const rows = messages.locator('.pd-aud-row');
  await expect(rows).toHaveCount(2);
  await prepare(rows.first(), 'House Q&A');
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “First question?”');

  await settleDurableWrites(messages);
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.locator('.pd-cue', { hasText: 'First question?' }).first().click();
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('First question?');
  await expect(program.locator('body')).toContainText('Ana');
  await expect(program.locator('body')).not.toContainText('Pasted');

  // A second message on the same card, an edit of the first message and a new arrival.
  await messages.getByTestId('audience-filter-all').click();
  await messages.locator('.pd-aud-row', { hasText: 'Second question?' }).getByTestId('audience-prepare').click();
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “Second question?”');
  await messages.locator('.pd-aud-row', { hasText: 'First question?' }).getByTestId('audience-edit-body').fill('Edited after preparing');
  await paste(messages, 'A late arrival', 'Cy');
  await settleDurableWrites(messages);

  const rec = await record(messages, showId);
  const question = fieldOf(rec, 'House Q&A', 'Question');
  const prepared = rec.cues.filter((c) => c.stagedFrom);
  expect(prepared.map((c) => c.values[question])).toEqual(['First question?', 'Second question?']);
  await expect(program.locator('body')).toContainText('First question?');
  await expect(program.locator('body')).not.toContainText('Second question?');

  // A double press makes one cue.
  const late = messages.locator('.pd-aud-row', { hasText: 'A late arrival' });
  await late.getByTestId('audience-prepare').dblclick();
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “A late arrival”');
  await settleDurableWrites(messages);
  expect((await record(messages, showId)).cues.filter((c) => c.values[question] === 'A late arrival')).toHaveLength(1);

  // A used message prepares again only when asked: "Prepare again" makes the deliberate second cue.
  // (Pasting put the list back on Inbox, where a used message is not shown.)
  await messages.getByTestId('audience-filter-all').click();
  await expect(late.getByTestId('audience-prepare')).toBeDisabled();
  await fromMenu(messages, late, 'audience-prepare-again');
  await settleDurableWrites(messages);
  expect((await record(messages, showId)).cues.filter((c) => c.values[question] === 'A late arrival')).toHaveLength(2);
});

test('a binding on the card\'s Question is refused once messages are prepared, and makes the card no destination before', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Bound');
  const rec = await record(page, showId);
  const question = fieldOf(rec, 'House Q&A', 'Question');
  const askedBy = fieldOf(rec, 'House Q&A', 'Asked by');
  const bind = (entries: { fieldId: string; path: string | null }[], bulk: boolean) =>
    page.evaluate(
      async ([id, list, many]) => {
        const shows = await __noacgImport('/src/model/shows.ts');
        const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
        if (many) shows.setFieldBindings(id, list.map((e) => ({ graphic: 'House Q&A', fieldId: e.fieldId, path: e.path ?? '' })));
        else for (const e of list) shows.setFieldBinding(id, 'House Q&A', e.fieldId, e.path);
        await commitDurableWrites();
      },
      [showId, entries, bulk] as const,
    );

  // BEFORE preparing: a bound Question makes the card no destination, so the cards are offered.
  await bind([{ fieldId: question, path: 'feed.question' }], false);
  const messages = await openWorkspace(page, 'audience');
  await paste(messages, 'Bound or not?');
  const row = messages.locator('.pd-aud-row').first();
  await row.getByTestId('audience-prepare').click();
  await expect(row.getByTestId('audience-no-destination')).toBeVisible();
  await row.getByTestId('audience-choose-cancel').click();

  // Unbound, it prepares; AFTER that, neither door binds the Question or the name: one at a
  // time, or in bulk (what "Bind all by title" and the Advanced rows write through).
  await bind([{ fieldId: question, path: null }], false);
  await prepare(row, 'House Q&A');
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue');
  await settleDurableWrites(messages);
  await bind([{ fieldId: question, path: 'feed.question' }], false);
  await bind([{ fieldId: question, path: 'feed.question' }, { fieldId: askedBy, path: 'feed.name' }], true);
  expect((await record(page, showId)).bindings['House Q&A'] ?? {}).toEqual({});

  // The Data view says why, and offers the separate card that can follow data.
  const data = await openWorkspace(page, 'data');
  await data.getByTestId('data-advanced-toggle').click();
  const refused = data.getByTestId(`bind-refused-House Q&A-${question}`);
  await expect(refused).toContainText('Prepared messages use this field');
  await expect(data.getByTestId(`bind-House Q&A-${question}`)).toHaveAttribute('readonly', '');
  await data.getByTestId(`bind-separate-House Q&A-${question}`).click();
  await expect(data.getByTestId('bind-graphic-House Q&A (live data)')).toBeVisible();
});

// THE SAME RULE ACROSS TABS. Data and Messages open in their own tabs, and every model write is a
// read-modify-WHOLE-RECORD write from that tab's mirror (model/durableStore.ts). A tab that has
// not yet heard of the other tab's write used to check the rule against its old copy and write
// that copy back: a binding next to a prepared cue (CI run 39506957594 on the test above, 4 ms
// between the prepare landing and the bind). These hold one tab stale ON PURPOSE, by giving it a
// durable-writes channel that hears nothing, so the window is forced rather than hoped for. The
// read-back is from a fresh third tab, which sees only what the database holds.

/** A tab on `url` cut off from the other tabs' durable-write announcements, both ways. It re-reads
 *  the database only when it writes itself. */
async function staleTab(page: Page, url: string): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.addInitScript(() => {
    const Real = window.BroadcastChannel;
    window.BroadcastChannel = class extends Real {
      constructor(name: string) {
        super(name === 'noacg-durable-writes' ? `${name}-deaf-${Math.random()}` : name);
      }
    };
  });
  await tab.goto(url);
  return tab;
}

/** What the database holds, read from a tab opened after every write. */
async function storedRecord(page: Page, showId: string) {
  const fresh = await page.context().newPage();
  await fresh.goto(page.url().split('#')[0] + '#/home');
  await awaitDurableReady(fresh);
  const rec = await record(fresh, showId);
  await fresh.close();
  return rec;
}

test('a tab that has not heard of a prepared message cannot bind its field', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Stale Data');
  const question = fieldOf(await record(page, showId), 'House Q&A', 'Question');
  await settleDurableWrites(page);
  const data = await staleTab(page, page.url());
  await expect(data.getByTestId('production-page')).toBeVisible();

  const messages = await openWorkspace(page, 'audience');
  await paste(messages, 'Prepared elsewhere');
  await prepare(messages.locator('.pd-aud-row').first(), 'House Q&A');
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue');
  await settleDurableWrites(messages);

  // The stale tab still believes nothing is prepared, and binds the Question.
  expect((await record(data, showId)).cues.some((c) => c.stagedFrom)).toBe(false);
  await data.evaluate(async ([id, field]) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    shows.setFieldBinding(id, 'House Q&A', field, 'feed.question');
    await new Promise((r) => setTimeout(r));
  }, [showId, question] as const);
  await settleDurableWrites(data);

  const stored = await storedRecord(page, showId);
  expect(stored.bindings['House Q&A'] ?? {}).toEqual({});
  expect(stored.cues.filter((c) => c.stagedFrom).map((c) => c.values[question])).toEqual(['Prepared elsewhere']);
  // And the stale tab now holds what the database holds.
  expect(await record(data, showId)).toEqual(stored);
});

test('a tab that has not heard of a binding cannot prepare a message onto it', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Stale Messages');
  const question = fieldOf(await record(page, showId), 'House Q&A', 'Question');
  await settleDurableWrites(page);
  const messages = await staleTab(page, `${page.url()}/audience`);
  await expect(messages.getByTestId('production-audience')).toBeVisible();
  await paste(messages, 'Should not land');

  await page.evaluate(async ([id, field]) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    shows.setFieldBinding(id, 'House Q&A', field, 'feed.question');
    await new Promise((r) => setTimeout(r));
  }, [showId, question] as const);
  await settleDurableWrites(page);

  // The stale tab still offers the card, and the prepare is refused where it is written.
  await prepare(messages.locator('.pd-aud-row').first(), 'House Q&A');
  await expect(messages.getByTestId('audience-note')).toContainText('No cue was prepared');
  await expect(messages.locator('.pd-aud-row').first().getByTestId('audience-used')).toHaveCount(0);

  const stored = await storedRecord(page, showId);
  expect(stored.bindings['House Q&A']).toEqual({ [question]: 'feed.question' });
  expect(stored.cues.some((c) => c.stagedFrom)).toBe(false);
});

test('Fill from… in the cue editor pastes a message into the edited cue, and Interaction lists it as used', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Editor Door');
  const rec = await record(page, showId);
  const question = fieldOf(rec, 'House Q&A', 'Question');

  await page.locator('.pd-cue').first().click();
  await page.getByTestId('cue-fill-from').click();
  await page.getByTestId('cue-fill-name').fill('Rui');
  await page.getByTestId('cue-fill-body').fill('Straight from the cue editor');
  await page.getByTestId('cue-fill-paste').click();
  await expect(page.getByTestId(`cue-field-${question}`)).toHaveValue('Straight from the cue editor');

  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('Straight from the cue editor');
  await expect(program.locator('body')).toContainText('Rui');

  await settleDurableWrites(page);
  const messages = await openWorkspace(page, 'audience');
  await messages.getByTestId('audience-filter-all').click();
  const row = messages.locator('.pd-aud-row', { hasText: 'Straight from the cue editor' });
  await expect(row.getByTestId('audience-used')).toBeVisible();
  await expect(row.getByTestId('audience-provenance')).toHaveText('Pasted');
});

const MESSAGE_SHEET = 'https://docs.google.com/spreadsheets/d/1NoaCGMessageSheet00000000/edit#gid=0';
const HEAD = 'Name,Message,Source,Reference\n';

/** A stub message tab: the export answers with whatever `tab.csv` holds at the moment of the read. */
async function stubMessageSheet(page: Page, csv: string): Promise<{ csv: string; reads: number }> {
  const tab = { csv, reads: 0 };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, async (route) => {
    tab.reads += 1;
    await route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv });
  });
  return tab;
}

test('a message Sheet: rows arrive as candidates; a vanished row leaves an unused one and keeps a used one; Source and Reference stay off air', async ({ page }) => {
  // data-sources C3; audience-flow AC-8; sheet-data-flow AC-11. Identity is the row's cells, never
  // its place (scripts/sheet-messages.test.mjs pins the rules); this walks them on the page.
  test.setTimeout(100_000);
  await bootstrapGraphic(page, { name: 'House Q&A' });
  const showId = await productionFor(page, 'Sheet Messages');
  const tab = await stubMessageSheet(
    page,
    `${HEAD}Ana,First from the Sheet,WhatsApp,+358 40 000 0001\nBo,Same words twice,,\nBo,Same words twice,,\nDee,Stays put,,\n`,
  );
  const messages = await openWorkspace(page, 'audience');
  await moreWaysIn(messages);
  await messages.getByTestId('chat-add-platform').selectOption('sheet');
  await messages.getByTestId('sheet-add-link').fill(MESSAGE_SHEET);
  await messages.getByTestId('chat-add-connect').click();
  await expect(messages.getByTestId('message-source-sheet')).toContainText('Sheet: Messages');

  // Four rows, four candidates: two identical rows are two.
  const rows = messages.locator('.pd-aud-row');
  await expect(rows).toHaveCount(4, { timeout: 20_000 });
  await expect(rows.filter({ hasText: 'Same words twice' })).toHaveCount(2);
  const ana = rows.filter({ hasText: 'First from the Sheet' });
  await expect(ana.getByTestId('audience-provenance')).toHaveText('Sheet: Messages · WhatsApp · +358 40 000 0001');

  // Prepared and taken: only Name and Message reach the graphic.
  await prepare(ana, 'House Q&A');
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “First from the Sheet”');
  // A second cue on the same card, from another row (sheet AC-11's two-cue refresh).
  await rows.filter({ hasText: 'Stays put' }).getByTestId('audience-prepare').click();
  await expect(messages.getByTestId('audience-note')).toContainText('✓ Cue “Stays put”');
  await settleDurableWrites(messages);
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.locator('.pd-cue', { hasText: 'First from the Sheet' }).first().click();
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('First from the Sheet');
  await expect(program.locator('body')).toContainText('Ana');
  await expect(program.locator('body')).not.toContainText('WhatsApp');
  await expect(program.locator('body')).not.toContainText('+358');

  // The Sheet changes: Ana's row and one of Bo's go, Cy's arrives, Dee's moves, and the rest is
  // reordered.
  const readsBefore = tab.reads;
  tab.csv = `${HEAD}Cy,A new arrival,,\nDee,Stays put,,\nBo,Same words twice,,\n`;
  await messages.getByTestId('audience-filter-all').click();
  await expect(rows.filter({ hasText: 'A new arrival' })).toHaveCount(1, { timeout: 20_000 });
  await expect(rows.filter({ hasText: 'Same words twice' })).toHaveCount(1);
  expect(tab.reads).toBeGreaterThan(readsBefore);
  // The used one stays, with its original and its cue, and says where its row went.
  await expect(ana.getByTestId('audience-used')).toBeVisible();
  await expect(ana.getByTestId('audience-withdrawn')).toHaveText('no longer in the Sheet');
  await expect(rows.filter({ hasText: 'Stays put' }).getByTestId('audience-withdrawn')).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  await expect(program.locator('body')).toContainText('First from the Sheet');
  const rec = await record(messages, showId);
  const question = fieldOf(rec, 'House Q&A', 'Question');
  // Both prepared cues hold what was prepared: a refresh, a reorder and a delete rewrite neither.
  expect(rec.cues.filter((c) => c.stagedFrom).map((c) => c.values[question])).toEqual(['First from the Sheet', 'Stays put']);

  // The cue editor's door picks a Sheet message too, and names where it came from.
  await page.locator('.pd-cue', { hasText: 'First from the Sheet' }).first().click();
  await page.getByTestId('cue-fill-from').click();
  const pick = page.getByTestId('cue-fill-pick').filter({ hasText: 'A new arrival' });
  await expect(pick).toContainText('Sheet: Messages');

  // A reload keeps every candidate once, and the used one's mark.
  await page.keyboard.press('Escape');
  await messages.reload();
  await messages.getByTestId('audience-filter-all').click();
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'First from the Sheet' }).getByTestId('audience-withdrawn')).toBeVisible();
  const reads = tab.reads;
  await expect.poll(() => tab.reads, { timeout: 20_000 }).toBeGreaterThan(reads);
  await expect(rows).toHaveCount(4);
});

// THE PHONE PAGE'S LOOK AND THE STUDIO'S QR CODE, on a blank page (interaction spec, phase 2).
//   AC-5: the studio's QR code (SVG and PNG) decodes to the short link, read from PIXELS by
//         e2e/_qr.ts as a phone camera would read it.
//   AC-6: the join surface shows the look's colours, font, logo, title and waiting text; a
//         low-contrast palette still meets WCAG AA; a broken logo shows no broken image; a failing
//         custom font falls back with the layout intact; a replaced or removed logo takes effect
//         on the next read.

const LINK = 'https://noacg.studio/j/friday-night-live';
const PHONE = { width: 390, height: 844 };

/** A blank page on the app's origin with join.html's own page colours, the join surface loaded. */
async function phonePage(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.route('**/join-surface-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0b0b0d;color:#f4f4f5}</style><body><main id="join"></main></body>',
    }),
  );
  await page.goto('/join-surface-probe');
}

/**
 * Mount the surface over a client whose view the test sets (`window.__view`), and keep the handle
 * as `window.__join`. `round` picks what is live: none, an Open question or a Multiple choice one.
 */
async function mount(page: Page, view: Record<string, unknown>, round: 'none' | 'open' | 'choice' = 'none'): Promise<void> {
  await page.evaluate(
    async ({ view, round }) => {
      const { mountJoinSurface } = await __noacgImport('/src/audience/joinSurface.ts');
      const state =
        round === 'none'
          ? { open: false, mode: 'waiting', round: null, prompt: '', presenter: { current: null, next: null } }
          : {
              open: true,
              mode: round === 'open' ? 'question' : 'poll',
              prompt: round === 'open' ? 'What should we ask the panel?' : 'Who wins tonight?',
              presenter: { current: null, next: null },
              round: {
                id: 'r1', kind: round === 'open' ? 'open' : 'poll', question: '', revision: 1, openedAt: '', closedAt: null, correctOption: null,
                options: round === 'open' ? [] : ['The home side', 'The visitors', 'A draw after extra time'],
              },
            };
      const w = window as unknown as { __view: Record<string, unknown>; __join: { refresh(): void } };
      w.__view = { productionName: 'Friday Night Live', state, mine: [], myVote: null, ...view };
      w.__join = mountJoinSurface(document.getElementById('join')!, {
        load: async () => w.__view as never,
        submit: async () => ({ ok: true, error: null }),
        vote: async () => ({ ok: true, error: null }),
      }, { poll: false });
    },
    { view, round },
  );
  await expect(page.locator('.nj-title')).toBeVisible();
}

/** A small PNG logo as a data URL, drawn in the page. */
const logoDataUrl = (page: Page, colour: string) =>
  page.evaluate((c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 120, 40);
    return canvas.toDataURL('image/png');
  }, colour);

/** Every text and edge on the page with its contrast against what it sits on (WCAG 2). */
function contrastReport(page: Page) {
  return page.evaluate(() => {
    const parse = (v: string): number[] => (v.match(/[\d.]+/g) ?? []).map(Number);
    const over = (top: number[], under: number[]) => {
      const a = top.length > 3 ? top[3] : 1;
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a));
    };
    const lum = (c: number[]) =>
      c.slice(0, 3).reduce((sum, v, i) => {
        const s = v / 255;
        const lin = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        return sum + lin * [0.2126, 0.7152, 0.0722][i];
      }, 0);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The opaque colour behind an element: its ancestors' fills laid over the page. */
    const behind = (el: Element | null): number[] => {
      const chain: number[][] = [];
      for (let n = el; n && n instanceof HTMLElement; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg.length >= 3 && (bg.length === 3 || bg[3] > 0)) chain.push(bg);
      }
      let colour = [11, 11, 13];
      for (const layer of chain.reverse()) colour = over(layer, colour);
      return colour;
    };
    const out: { what: string; ratio: number; need: number }[] = [];
    const text = (selector: string) =>
      document.querySelectorAll(selector).forEach((el) => {
        if (!(el as HTMLElement).innerText.trim()) return;
        const style = getComputedStyle(el);
        if (Number(style.opacity) < 1) throw new Error(`${selector} is dimmed by opacity`);
        const own = parse(style.backgroundColor);
        const bg = own.length >= 3 && (own.length === 3 || own[3] > 0) ? behind(el) : behind(el.parentElement);
        const fg = over(parse(style.color), bg);
        out.push({ what: `text ${selector}`, ratio: ratio(fg, bg), need: 4.5 });
      });
    const edge = (selector: string) =>
      document.querySelectorAll(selector).forEach((el) => {
        const style = getComputedStyle(el);
        const bg = behind(el.parentElement);
        // A focused field draws its edge as the focus outline (its border goes transparent).
        const line = document.activeElement === el ? style.outlineColor : style.borderTopColor;
        out.push({ what: `edge ${selector}${document.activeElement === el ? ':focus' : ''}`, ratio: ratio(over(parse(line), bg), bg), need: 3 });
      });
    text('.nj-title');
    text('.nj-prompt');
    text('.nj-waiting');
    text('.nj-label');
    text('.nj-opt > span:last-child');
    text('.nj-key');
    text('.nj-send:not([disabled])');
    text('.nj-note');
    text('.nj-mine li');
    edge('.nj-card');
    edge('.nj-opt');
    edge('.nj-send:not([disabled])');
    edge('.nj input[type=text], .nj textarea');
    return out;
  });
}

test.describe('the phone page carries the production look (AC-6)', () => {
  test('colours, font, logo, title and waiting text appear', async ({ page }) => {
    await phonePage(page);
    const logo = await logoDataUrl(page, '#ff3366');
    await mount(page, {
      brand: {
        accent: '#ff3366', text: '#ffffff', panel: '#202040', font: '"Oswald", Arial, sans-serif',
        logo, title: 'Quiz Night', waiting: 'Back after the break',
      },
    });
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    await expect(page.locator('.nj-waiting')).toHaveText('Back after the break');
    const img = page.locator('img.nj-logo');
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(120);
    const look = await page.evaluate(async () => {
      await document.fonts.ready;
      const root = document.getElementById('join')!;
      return {
        font: getComputedStyle(root).fontFamily,
        accent: root.style.getPropertyValue('--nj-accent'),
        text: getComputedStyle(document.querySelector('.nj-waiting')!).color,
        oswald: document.fonts.check('16px Oswald'),
      };
    });
    expect(look.font).toContain('Oswald');
    expect(look.oswald, 'the bundled face is loaded, not only named').toBe(true);
    expect(look.accent).toBe('rgb(255, 51, 102)');

    // The look's colours where they pass, so a branded page is the brand's, not a safe grey.
    await page.evaluate(() => {
      const w = window as unknown as { __view: { state: unknown }; __join: { refresh(): void } };
      w.__view.state = {
        open: true, mode: 'question', prompt: 'What should we ask the panel?', presenter: { current: null, next: null },
        round: { id: 'r1', kind: 'open', question: '', options: [], revision: 1, openedAt: '', closedAt: null, correctOption: null },
      };
      w.__join.refresh();
    });
    await expect(page.locator('.nj-prompt')).toHaveText('What should we ask the panel?');
    expect(await page.locator('.nj-prompt').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('.nj-card').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 32, 64)');
  });

  test('without a look or page settings, the page shows the production name and the default waiting text', async ({ page }) => {
    await phonePage(page);
    await mount(page, { brand: null });
    await expect(page.locator('.nj-title')).toHaveText('Friday Night Live');
    await expect(page.locator('.nj-waiting')).toHaveText(/^Not taking part right now/);
    await expect(page.locator('img')).toHaveCount(0);
  });

  test('a low-contrast palette still meets AA: dark on dark, light on light, a mid grey', async ({ page }) => {
    await phonePage(page);
    for (const [name, brand] of [
      ['dark on dark', { accent: '#1a1a1a', text: '#222222', panel: '#1c1c1c' }],
      ['light on light', { accent: '#ffff66', text: '#f0f0f0', panel: '#ffffff' }],
      ['a mid grey that passes nowhere', { accent: '#777777', text: '#6a6a6a', panel: 'rgba(120,120,120,.9)' }],
    ] as const) {
      for (const round of ['none', 'open', 'choice'] as const) {
        await page.evaluate(() => {
          (window as unknown as { __join?: { destroy(): void } }).__join?.destroy();
        });
        await mount(page, { brand: { ...brand, font: null, title: 'Low contrast', waiting: 'Waiting for the next question' }, mine: [{ id: 'm1', body: 'An earlier answer', createdAt: '' }] }, round);
        if (round === 'open') await page.locator('#nj-body').fill('A sentence to send');
        if (round === 'choice') {
          // A picked option, so the accent fill and its text are on the page too.
          await page.evaluate(() => {
            const w = window as unknown as { __view: { myVote: number }; __join: { refresh(): void } };
            w.__view.myVote = 1;
            w.__join.refresh();
          });
          await expect(page.locator('.nj-opt[aria-pressed=true]')).toHaveCount(1);
        }
        const report = await contrastReport(page);
        expect(report.length, `${round}: something was measured`).toBeGreaterThanOrEqual(3);
        const failing = report.filter((r) => r.ratio < r.need);
        expect(failing, `${name}, ${round}: every text 4.5:1 and every edge 3:1`).toEqual([]);
      }
    }
  });

  test('a broken logo URL shows the title and no broken image', async ({ page }) => {
    await phonePage(page);
    await page.route('**/broken-logo.png', (route) => route.fulfill({ status: 404, body: 'not here' }));
    // Never painted until it loads: watch every logo the page ever shows.
    await page.evaluate(() => {
      const w = window as unknown as { __shown: boolean };
      w.__shown = false;
      new MutationObserver(() => {
        const img = document.querySelector('img.nj-logo') as HTMLImageElement | null;
        if (img && getComputedStyle(img).visibility !== 'hidden') w.__shown = true;
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    const url = new URL('/broken-logo.png', page.url()).href;
    await mount(page, { brand: { accent: null, text: null, panel: null, font: null, logo: url, title: 'Quiz Night' } });
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    // A later read with the same URL does not try it again.
    await page.evaluate(() => (window as unknown as { __join: { refresh(): void } }).__join.refresh());
    await expect(page.locator('.nj-title')).toHaveText('Quiz Night');
    await expect(page.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __shown: boolean }).__shown)).toBe(false);
  });

  test('a failing custom font falls back to the system font with the layout intact', async ({ page }) => {
    await phonePage(page);
    await page.route('**/missing-face.woff2', (route) => route.fulfill({ status: 404, body: '' }));
    const layout = async () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const root = document.documentElement;
        const boxes = [...document.querySelectorAll('.nj-title, .nj-prompt, .nj-opt, .nj-card')].map((el) => el.getBoundingClientRect());
        return {
          overflow: root.scrollWidth - root.clientWidth,
          outside: boxes.filter((b) => b.left < 0 || b.right > window.innerWidth).length,
          optionHeights: [...document.querySelectorAll('.nj-opt')].map((el) => el.getBoundingClientRect().height),
          face: document.fonts.check('16px "Missing Face"'),
        };
      });
    await page.addStyleTag({ content: '@font-face { font-family: "Missing Face"; src: url("/missing-face.woff2") format("woff2"); }' });
    await mount(page, { brand: { accent: null, text: null, panel: null, font: '"Missing Face", system-ui, sans-serif' } }, 'choice');
    await page.evaluate(() => document.fonts.load('16px "Missing Face"').catch(() => null));
    const missing = await layout();
    expect(missing.overflow, 'no sideways scroll').toBeLessThanOrEqual(0);
    expect(missing.outside, 'nothing past the screen edge').toBe(0);
    expect(Math.min(...missing.optionHeights), 'every option keeps its thumb size').toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('join')!).fontFamily)).toContain('system-ui');
  });

  test('replacing and removing the logo take effect on the next read', async ({ page }) => {
    await phonePage(page);
    const first = await logoDataUrl(page, '#ff0000');
    const second = await logoDataUrl(page, '#0000ff');
    await mount(page, { brand: { accent: null, text: null, panel: null, font: null, logo: first } });
    const img = page.locator('img.nj-logo');
    await expect(img).toHaveAttribute('src', first);
    await expect(img).toBeVisible();
    const next = (logo: string | null) =>
      page.evaluate((l) => {
        const w = window as unknown as { __view: { brand: { logo: string | null } }; __join: { refresh(): void } };
        w.__view = { ...w.__view, brand: { ...w.__view.brand, logo: l } };
        w.__join.refresh();
      }, logo);
    await next(second);
    await expect(img).toHaveAttribute('src', second);
    await expect(img).toBeVisible();
    await next(null);
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.locator('.nj-title')).toHaveText('Friday Night Live');
  });
});

test('the studio QR code decodes to the short link, as SVG and as PNG (AC-5)', async ({ page, browser }) => {
  const reader = await qrReader(browser);
  try {
    await phonePage(page);
    await page.setViewportSize({ width: 800, height: 800 });
    const png = await page.evaluate(async (link) => {
      const { qrSvg, qrPng } = await __noacgImport('/src/audience/joinQr.ts');
      const host = document.createElement('div');
      host.id = 'qr';
      host.style.cssText = 'width:400px;height:400px';
      host.innerHTML = qrSvg(link);
      (host.firstElementChild as SVGElement).style.cssText = 'width:100%;height:100%;display:block';
      document.body.prepend(host);
      const blob = await qrPng(link);
      const bytes = new Uint8Array(await blob!.arrayBuffer());
      let s = '';
      bytes.forEach((b) => (s += String.fromCharCode(b)));
      return btoa(s);
    }, LINK);
    expect(await reader.read(await page.locator('#qr').screenshot()), 'the SVG').toBe(LINK);
    expect(await reader.read(Buffer.from(png, 'base64')), 'the downloaded PNG').toBe(LINK);
  } finally {
    await reader.close();
  }
});
