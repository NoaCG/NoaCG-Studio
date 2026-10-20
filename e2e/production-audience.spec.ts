// covers: src/components/home/ProductionAudienceWorkspace.tsx
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
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

import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { openWorkspace } from './_workspace';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';

// The production AUDIENCE workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).
//
// It runs on the LOCAL provider — in memory, with a submission simulator — which is exactly why
// this whole workflow is drivable offline. That was the point of building the seam first: what
// is pinned here is the moderation workflow itself, and the Supabase provider will be a second
// implementation of an interface these specs have already exercised.
//
// THE RULE THE SPECS EXIST FOR: nothing a viewer wrote reaches Program without an operator
// pressing Take. "Prepare cue on <graphic>" makes a CUE and stops (data-sources C0: the view is
// called Messages, its route is still `audience`).

async function productionFor(page: Page, name: string): Promise<string> {
  return openProductionWithCurrent(page, name);
}

/** Paste a message into Messages, as an operator copying it from a chat window. */
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
  await audience.getByTestId('audience-simulate').click();
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
  await audience.getByTestId('audience-simulate').click();
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

test('the viewer preview is the join page itself, and it follows the operator', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Preview');
  const audience = await openWorkspace(page, 'audience');

  await audience.getByTestId('audience-preview-details').locator('summary').click();
  const preview = audience.getByTestId('audience-preview');
  // Closed is the honest starting state, and the preview says so in the words a viewer reads.
  await expect(preview).toContainText('Not taking part right now');

  // Opening the door changes what the room sees — the mode travels with it, so the preview can
  // never sit on "standing by" while the operator's own screen says Questions.
  await audience.getByTestId('audience-open').check();
  await expect(preview.locator('.nj-send')).toBeVisible();
  await expect(preview).toContainText('Send us your question');

  await audience.getByTestId('audience-mode').selectOption('comment');
  await expect(preview).toContainText('Your message');

  // READ-ONLY: an operator's preview must not be able to put words in the audience's mouth.
  await preview.locator('textarea').fill('Not from the operator, thanks');
  await preview.locator('.nj-send').click();
  await expect(preview).toContainText('send from a phone');
  await expect(audience.locator('.pd-aud-row')).toHaveCount(0);
});

test('the public join page answers honestly on an offline build', async ({ page }) => {
  // The page is a capability URL, so every "nothing here" answer is the SAME answer — but an
  // offline build is not a capability question at all, and saying so beats showing a form that
  // could never send anything.
  await page.goto('/join/friday-night-live');
  await expect(page.locator('#join')).toContainText('runs offline');
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

test('the vote reaches air the same way a question does: open, count, stage a cue, take it', async ({ page }) => {
  // PHASE 6 (docs/INTERACTIVE_PLAYOUT_PLAN.md). The plane could already open rounds, count
  // votes and tally them — nothing called any of it. What is pinned here is the whole walk,
  // and above all its ENDING: counts become an ordinary cue's field values, so the renderer
  // never learns votes exist and nothing goes out without a Take.
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  await productionFor(page, 'Derby Night');
  const audience = await openWorkspace(page, 'audience');

  await audience.getByTestId('audience-round-question').fill('Who wins the derby?');
  await audience.getByTestId('audience-round-options').fill('The home side\nThe visitors\nA draw');
  await audience.getByTestId('audience-round-open').click();
  await expect(audience.getByTestId('audience-round-live')).toHaveText('Who wins the derby?');

  // The MODE follows the vote, and says so. A select whose value is not among its options
  // renders as the first one — which had this reading "Questions" over an open poll.
  await expect(audience.getByTestId('audience-mode')).toHaveValue('poll');
  await expect(audience.getByTestId('audience-mode')).toBeDisabled();

  // Votes land and the tally moves (it polls while the round is open).
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('2', { timeout: 10_000 });
  await expect(audience.getByTestId('audience-tally-1')).toHaveText('1');

  // STAGING WRITES A CUE AND STOPS. The values are the poll board's own `Label | count` idiom,
  // the same one a hand-typed rehearsal uses.
  await audience.getByTestId('audience-round-stage').click();
  const staged = async () =>
    audience.evaluate(async () => {
      const { loadShows } = await import('/src/model/shows.ts');
      const cue = loadShows()[0].cues?.find((c) => c.label.startsWith('Vote —'));
      return cue ? { label: cue.label, values: cue.values } : null;
    });
  await expect.poll(async () => (await staged())?.values.f0).toBe('Who wins the derby?');
  const first = await staged();
  expect(first?.values.f0).toBe('Who wins the derby?');
  expect(first?.values.f1).toBe('The home side | 2\nThe visitors | 1\nA draw | 1');
  expect(first?.values.f2).toContain('4 votes');
  expect(first?.values.f2).toContain('voting open');

  // Re-staging UPDATES that cue rather than adding another — a rundown must not fill with a row
  // per refresh.
  const cueCount = async () =>
    audience.evaluate(async () => {
      const { loadShows } = await import('/src/model/shows.ts');
      return (loadShows()[0].cues ?? []).filter((c) => c.label.startsWith('Vote —')).length;
    });
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('4', { timeout: 10_000 });
  await audience.getByTestId('audience-round-stage').click();
  await expect.poll(async () => (await staged())?.values.f1).toBe('The home side | 4\nThe visitors | 2\nA draw | 2');
  expect(await cueCount()).toBe(1);

  // CLOSING finalises the same cue. Without this the board still said "voting open" beside its
  // final numbers and there was no way to correct it: staging needs an open round.
  await audience.getByTestId('audience-round-close').click();
  await expect(audience.getByTestId('audience-round-open')).toBeVisible(); // composer back
  await expect.poll(async () => (await staged())?.values.f2).toContain('voting closed');
  expect(await cueCount()).toBe(1);

  // The room goes back to what it was asked for before the vote — a phone left in poll mode
  // would show the vote heading over an empty card.
  await expect(audience.getByTestId('audience-mode')).toHaveValue('question');
  await expect(audience.getByTestId('audience-mode')).toBeEnabled();

  // Only the operator's Take puts the final tally on air.
  await settleDurableWrites(audience);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  const final = await staged();
  expect(final).not.toBeNull();
  await page.locator('.pd-cue', { hasText: final!.label }).click();
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('body')).toContainText('Who wins the derby?');
  await expect(program.locator('body')).toContainText('The home side');
  await expect(program.locator('body')).toContainText('8 votes');
  await expect(program.locator('body')).toContainText('voting closed');
});

test('a vote with nowhere to go says so instead of writing a cue nobody can read', async ({ page }) => {
  // The pool holds a name strap, not a vote board. Staging a tally into it would put a question
  // in a presenter's name field — so the surface refuses and names the missing thing.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Board');
  const audience = await openWorkspace(page, 'audience');

  await audience.getByTestId('audience-round-question').fill('Anything?');
  await audience.getByTestId('audience-round-options').fill('Yes\nNo');
  await audience.getByTestId('audience-round-open').click();
  await audience.getByTestId('audience-round-stage').click();

  await expect(audience.getByTestId('audience-note')).toContainText('no question/options fields');
  const votes = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows()[0].cues ?? []).filter((c) => c.label.startsWith('Vote —')).length;
  });
  expect(votes).toBe(0);
});

// ── A cue the rundown did not keep is said as such, never with a tick
// (components/never-report-save-storage-layer-has). The workspace is its own tab, so the refusal is
// armed on the whole browser context. ──

/** The cues of the one production, as the workspace's own tab has them. */
async function cueLabels(tab: Page): Promise<string[]> {
  return tab.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows()[0].cues ?? []).map((c) => c.label);
  });
}

test('a message prepared while the rundown cannot save says so, stays unused, and prepares once on retry', async ({ page }) => {
  await armStorageFailure(page.context());
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await productionFor(page, 'Phone In');
  const audience = await openWorkspace(page, 'audience');
  await audience.getByTestId('audience-simulate').click();
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

test('a vote staged while the rundown cannot save says so, and staging again adds the cue once', async ({ page }) => {
  await armStorageFailure(page.context());
  await bootstrapGraphic(page, { category: 'Polls', name: 'House Vote' });
  await productionFor(page, 'Derby Night');
  const audience = await openWorkspace(page, 'audience');
  await audience.getByTestId('audience-round-question').fill('Who wins the derby?');
  await audience.getByTestId('audience-round-options').fill('The home side\nThe visitors');
  await audience.getByTestId('audience-round-open').click();
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).not.toHaveText('0', { timeout: 10_000 });
  const votes = async () => (await cueLabels(audience)).filter((l) => l.startsWith('Vote —')).length;

  await fillStorage(audience);
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('No cue was added to the rundown');
  expect(await votes()).toBe(0);

  await freeStorage(audience);
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('✓ Added a cue to the rundown');
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
  await audience.getByTestId('audience-simulate').click();
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
    const { loadShows } = await import('/src/model/shows.ts');
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
    const { loadShows } = await import('/src/model/shows.ts');
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
  await expect(messages.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible();
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
        const shows = await import('/src/model/shows.ts');
        const { commitDurableWrites } = await import('/src/model/durableStore.ts');
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
    const shows = await import('/src/model/shows.ts');
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
    const shows = await import('/src/model/shows.ts');
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

test('Fill from… in the cue editor pastes a message into the edited cue, and Messages lists it as used', async ({ page }) => {
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
