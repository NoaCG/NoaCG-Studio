import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent, skipOldEditor } from './_create';
import { openWorkspace } from './_workspace';
import { settleDurableWrites } from './_durable';

// The production AUDIENCE workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).
//
// It runs on the LOCAL provider — in memory, with a submission simulator — which is exactly why
// this whole workflow is drivable offline. That was the point of building the seam first: what
// is pinned here is the moderation workflow itself, and the Supabase provider will be a second
// implementation of an interface these specs have already exercised.
//
// THE RULE THE SPECS EXIST FOR: nothing a viewer wrote reaches Program without an operator
// pressing Take. "Send to rundown" makes a CUE and stops.

async function productionFor(page: Page, name: string): Promise<void> {
  await openProductionWithCurrent(page, name);
}

test('the audience workflow: arrive, edit a broadcast version, approve, send to the rundown, air it', async ({ page }) => {
  skipOldEditor();
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
  await rows.nth(1).getByTestId('audience-shortlist').click();
  await rows.nth(2).getByTestId('audience-reject').click();
  await expect(audience.getByTestId('audience-filter-shortlist')).toContainText('(1)');
  await audience.getByTestId('audience-filter-inbox').click();
  await expect(rows).toHaveCount(2); // the rejected one has left the inbox

  // ── The ONE exit: a cue on the rundown. Nothing has aired. ──
  await audience.getByTestId('audience-filter-all').click();
  await audience.locator('.pd-aud-row').first().getByTestId('audience-send').click();
  await expect(audience.getByTestId('audience-note')).toContainText('airs when you Take it');
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
  // The provider is in memory and deliberately holds nothing durable, so a round trip within
  // the page keeps the material and a RELOAD does not. Both are stated here rather than left
  // to be discovered: rehearsal material is other people's words in shape, and there is no
  // reason a practice run should outlive the tab.
  await expect(audience.locator('.pd-aud-row')).toHaveCount(3);

  await audience.reload();
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  await expect(audience.getByTestId('audience-empty')).toBeVisible();
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
  skipOldEditor();
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

  const now = (i: number) => rows.nth(i).getByTestId('audience-presenter-now');
  const next = (i: number) => rows.nth(i).getByTestId('audience-presenter-next');

  // Two presses in one beat. This is the case that used to blank a slot: both handlers composed
  // off the RENDERED pointers, so the second overwrote the first and a presenter's "now" went
  // empty while they were reading it.
  await now(0).click();
  await next(1).click();
  await expect(now(0)).toHaveClass(/active/);
  await expect(next(1)).toHaveClass(/active/);

  // Moving "now" to another row leaves "next" alone - the two slots are independent, even though
  // they travel to the server as one object.
  await now(2).click();
  await expect(now(0)).not.toHaveClass(/active/);
  await expect(now(2)).toHaveClass(/active/);
  await expect(next(1)).toHaveClass(/active/);

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
  await expect(now(2)).toHaveClass(/active/);
  await expect(next(1)).toHaveClass(/active/);

  // The same press clears the slot - an autocue you cannot empty is worse than none.
  await now(2).click();
  await expect(now(2)).not.toHaveClass(/active/);
});
