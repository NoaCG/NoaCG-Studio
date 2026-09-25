import { test, expect } from '@playwright/test';
import {
  dismissWizard,
  E2E_TEAMMATE_EMAIL,
  E2E_TEAMMATE_PASSWORD,
  haveCreds,
  haveTeammateCreds,
  shot,
  signIn,
  signInAs,
  SUPABASE_URL,
} from './_helpers';
import { FAKE_JOIN_ROUTE, TEAM } from '../_teams';

// Teams (docs/TEAMS_PLAN.md §7): the DOOR in both of its shapes (stage 3), and - with a second
// account - the invited teammate FINDING the team and what it holds (stage 4).
//
// This spec is the other half of the offline pin in e2e/auth.spec.ts. That one asserts the team
// ids have count 0 with no backend; this one asserts the SAME ids (both import e2e/_teams.ts) are
// really rendered by a real session against the real RPCs from migrations 0053/0054. Without this
// half, the offline assertions could be green because the selectors were never right.
//
// IT WRITES TO THE BACKEND AND CLEANS UP AFTER ITSELF. Creating a team is the verb under test, so
// there is no way to prove it without a row; the walk deletes the team it made as its last act,
// and the team cascades its membership rows with it. Names carry a timestamp so a run that dies
// mid-way leaves something identifiable rather than something ambiguous.

const TEAM_NAME = () => `E2E team ${new Date().toISOString().slice(11, 19)}`;

/**
 * Answer the analytics prompt, which is what a real operator does once.
 *
 * This used to be load-bearing: the banner carried a bare z-index 1200 and so covered the
 * footer of any dialog it overlapped. It no longer can - a notice now sits below every dialog
 * (the layer scale in src/styles/base.css, pinned by e2e/overlay-layers.spec.ts). Answering it
 * is kept because it is still a real step in a first visit, not because the dialog needs it.
 */
async function declineAnalytics(page: import('@playwright/test').Page): Promise<void> {
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
    await expect(consent).toHaveCount(0);
  }
}

test.describe('teams: the share door', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');

  // ── Signed out ───────────────────────────────────────────────────────────────────────────────
  // A backend IS configured here, so this is the shape the offline suite cannot produce: the
  // door is absent because there is no session, not because there is no server. Teams render
  // nothing rather than a sign-in prompt (TEAMS_PLAN §6) - the one exception is the join link,
  // asserted below.
  test('signed out: a production has no team door anywhere', async ({ page }) => {
    await page.goto('/app#/home/productions');
    await page.getByTestId('new-production-name').fill('Signed-out show');
    await page.getByTestId('new-production').click();
    await expect(page.getByTestId('production-page')).toBeVisible();
    await expect(page.getByTestId('export-production')).toBeVisible();
    await expect(page.getByTestId(TEAM.door)).toHaveCount(0);

    await page.goto('/app#/home/productions');
    const card = page.locator('[data-testid^="production-row-"]').first();
    await expect(card.getByTestId('open-production-name')).toBeVisible();
    await expect(card.getByTestId(TEAM.cardMenu)).toHaveCount(0);
  });

  // A join LINK is the one team surface a signed-out visitor may see, because they arrived on it
  // and have already been told teams exist. It offers the ACCOUNT, leading: a student opening
  // their teacher's link usually has none yet.
  test('signed out: a join link offers an account rather than a wall', async ({ page }) => {
    await page.goto(FAKE_JOIN_ROUTE);
    await declineAnalytics(page);
    await expect(page.getByTestId(TEAM.joinDialog)).toBeVisible();
    await expect(page.getByTestId('signin-prompt')).toBeVisible();
    await expect(page.getByTestId('signin-prompt-signup')).toBeVisible();
    // Joining is not offered until there is an account to join with.
    await expect(page.getByTestId(TEAM.join)).toBeDisabled();
    await shot(page, 'teams-join-signed-out');
  });

  // ── Signed in ────────────────────────────────────────────────────────────────────────────────
  test.describe('signed in', () => {
    test.skip(!haveCreds, 'set E2E_EMAIL and E2E_PASSWORD to run the authenticated walk');
    // The walk creates a team, rotates its code, re-joins through the link and deletes the team,
    // each step a real round trip. Generous, but not so generous that a stuck click costs three
    // minutes before it says so.
    test.setTimeout(120_000);

    test('creates a team, hands out its code, re-joins by link, and leaves nothing behind', async ({ page }) => {
      await signIn(page);
      await dismissWizard(page);
      await declineAnalytics(page);
      // A UNIQUE name, and the card is addressed BY it. The signed-in library SYNCS, so every
      // past run's production comes back down with it - a `.first()` card locator would then be
      // pointing at some earlier run's leftovers. The walk deletes this one at the end.
      const showName = `Teams walk ${Date.now()}`;
      await page.goto('/app#/home/productions');
      await page.getByTestId('new-production-name').fill(showName);
      await page.getByTestId('new-production').click();
      await expect(page.getByTestId('production-page')).toBeVisible();

      // THE POSITIVE HALF the offline pin depends on: the door is really rendered, on the
      // production page's header, by this exact test id.
      const door = page.getByTestId(TEAM.door);
      await expect(door).toBeVisible();
      await door.click();
      await expect(page.getByTestId(TEAM.dialog)).toBeVisible();
      // The pick screen says what a move does before anybody presses it.
      await expect(page.getByTestId('move-explainer')).toBeVisible();
      // Shoot the SETTLED screen. Taken before the fetch lands, the review shot is a picture of
      // the word "Loading", which tells a reader nothing about the screen they are reviewing.
      //
      // ALL THREE states PickScreen settles into, the failed fetch included, and only then the
      // failure ruled out. Waiting on the two happy ones alone spent 20 s and then blamed a
      // missing element for a screen that was fully drawn (2026-09-02, PGRST205 - the rule and
      // the measurement are in e2e/AGENTS.md).
      await expect(
        page
          .getByTestId('no-teams')
          .or(page.getByTestId('teams-load-error'))
          .or(page.locator('.team-pickrow'))
          .first(),
      ).toBeVisible({ timeout: 20_000 });
      // BOTH fetches feed that one state - `loadError` is set by listMyTeams and again by
      // listMyTeamMembers (ShareWithTeamDialog.tsx:104) - so the message names both rather than
      // sending the reader to the wrong table. The count is a snapshot, so a members fetch
      // failing just after the teams fetch settled on `no-teams` reads as 0. A miss, never a
      // false red, and the walk fails a few lines later anyway.
      const teamsFetchFailed = await page.getByTestId('teams-load-error').count();
      expect(
        teamsFetchFailed,
        'the share dialog settled on teams-load-error: listMyTeams() or listMyTeamMembers() failed, so a teams table or one of its RLS grants is missing on this backend',
      ).toBe(0);
      await shot(page, 'teams-share-pick');

      // Make one.
      const name = TEAM_NAME();
      await page.getByTestId(TEAM.newTeam).click();
      await page.getByTestId(TEAM.newTeamName).fill(name);
      await page.getByTestId(TEAM.newTeamDisplayName).fill('E2E Runner');
      await page.getByTestId(TEAM.createTeam).click();

      // The code screen: 8 URL-safe characters (the 0053 recipe), a link built from it, and the
      // creator in the member list as the owner.
      const code = page.getByTestId(TEAM.joinCode);
      await expect(code).toBeVisible({ timeout: 20_000 });
      const first = (await code.textContent())?.trim() ?? '';
      expect(first).toMatch(/^[A-Za-z0-9_-]{8}$/);
      await expect(page.getByTestId(TEAM.joinLink)).toHaveValue(new RegExp(`#/join-team/${first}$`));
      await expect(page.getByTestId(TEAM.members)).toContainText('E2E Runner');
      await expect(page.getByTestId(TEAM.members)).toContainText('You');
      await shot(page, 'teams-share-code');

      // Rotation is the owner's answer to a leaked code, and it really mints a different one.
      await page.getByTestId(TEAM.rotate).click();
      await expect(code).not.toHaveText(first, { timeout: 20_000 });
      const rotated = (await code.textContent())?.trim() ?? '';
      expect(rotated).toMatch(/^[A-Za-z0-9_-]{8}$/);

      // The link works: re-joining with the same account through the code updates the display
      // name, which is how a member renames themselves (0053 team_join's on-conflict branch).
      await page.goto(`/app#/join-team/${rotated}`);
      await expect(page.getByTestId(TEAM.joinDialog)).toBeVisible();
      await expect(page.getByTestId(TEAM.joinCodeField)).toHaveValue(rotated);
      await page.getByTestId(TEAM.joinDisplayName).fill('E2E Runner II');
      await page.getByTestId(TEAM.join).click();
      await expect(page.getByTestId(TEAM.joinDone)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId(TEAM.joinDone)).toContainText(name);
      await shot(page, 'teams-join-done');

      // A code nothing matches is refused BY NAME. "Nothing happened" and "that code is wrong"
      // are different answers to a student staring at a class chat, and 0053 distinguishes them.
      await page.goto(FAKE_JOIN_ROUTE);
      await expect(page.getByTestId(TEAM.joinDisplayName)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId(TEAM.joinDisplayName).fill('E2E Runner');
      await page.getByTestId(TEAM.join).click();
      await expect(page.getByTestId('join-team-error')).toContainText(/join code/i);

      // The card menu is the door's OTHER mount point, and the offline spec asserts it is absent
      // there too, so it gets walked as well.
      await page.goto('/app#/home/productions');
      const card = page.locator('[data-testid^="production-row-"]', { hasText: showName });
      await card.getByTestId(TEAM.cardMenu).click();
      await page.getByTestId(TEAM.door).click();
      await expect(page.getByTestId(TEAM.dialog)).toBeVisible();
      const row = page.locator('.team-pickrow', { hasText: name });
      // The chip is real, and it is what names a team in the list.
      await expect(row.getByTestId(TEAM.chip)).toBeVisible({ timeout: 20_000 });
      await shot(page, 'teams-share-pick-with-a-team');

      // Teardown: every team this suite has ever made goes, not just this run's. A walk that
      // dies mid-way leaves a team behind, and the next run would then pick a `.team-pickrow`
      // by a name that matches two rows. Deleting the whole `E2E team ` family makes the suite
      // self-healing on a throwaway account instead of needing a human with SQL.
      let guard = 20;
      while (guard-- > 0) {
        const stray = page.locator('.team-pickrow', { hasText: /E2E team / }).first();
        if ((await stray.count()) === 0) break;
        await stray.click();
        await page.getByTestId('open-team-details').click();
        await expect(page.getByTestId(TEAM.joinCode)).toBeVisible({ timeout: 20_000 });
        await page.getByTestId(TEAM.deleteTeam).click();
        await page.getByTestId(TEAM.deleteTeam).click();
        await expect(page.getByTestId('open-team-details')).toBeVisible({ timeout: 20_000 });
      }
      await expect(page.locator('.team-pickrow', { hasText: name })).toHaveCount(0);

      // And the productions go too - every run's, not just this one's, for the same reason the
      // team sweep takes the whole family: the library SYNCS, so one left behind is left behind
      // in the CLOUD and every later run pulls it back down.
      await page.getByTestId(TEAM.dialog).locator('.gallery-close').click();
      await expect(page.getByTestId(TEAM.dialog)).toHaveCount(0);
      guard = 20;
      while (guard-- > 0) {
        const stray = page.locator('[data-testid^="production-row-"]', { hasText: /Teams walk / }).first();
        if ((await stray.count()) === 0) break;
        await stray.getByRole('button', { name: /^Delete Teams walk / }).click();
        // The confirm says "Delete and unpublish?" on a published row, so it is found by id.
        await stray.getByTestId('production-delete-confirm').click();
      }
      await expect(page.locator('[data-testid^="production-row-"]', { hasText: showName })).toHaveCount(0);
    });
  });
  // ── Two accounts: the invitation is FOUND ─────────────────────────────────────────────────────
  // The defect this walk exists for (2026-09-25): a student joined their teacher's team and could
  // not find the team, nor anything it held, without searching - a team was reachable only through
  // a production's Share door, and a new member owns no production to open one from. Now the
  // team's band is on the productions list and the team is in Home's nav, both there on the very
  // screen the join's Done lands on, with no reload. B then edits it, and A reads that edit back through
  // the compare-and-swap save, "edited by" and all.
  test.describe('two accounts', () => {
    test.skip(!haveCreds || !haveTeammateCreds, 'set E2E_TEAMMATE_EMAIL and E2E_TEAMMATE_PASSWORD for the two-person walk');
    test.setTimeout(180_000);

    test('an invited teammate finds the team and its production on Home, and both edit it', async ({ browser }) => {
      const ownerContext = await browser.newContext();
      const mateContext = await browser.newContext();
      const owner = await ownerContext.newPage();
      const mate = await mateContext.newPage();
      // `E2E team ` prefix, so the sweep in the walk above deletes it if this run dies mid-way.
      const teamName = `${TEAM_NAME()} shared`;
      const showName = `Team share walk ${Date.now()}`;
      try {
        // A makes a production and a team, then MOVES the production into the team.
        await signIn(owner);
        await dismissWizard(owner);
        await declineAnalytics(owner);
        await owner.goto('/app#/home/productions');
        await owner.getByTestId('new-production-name').fill(showName);
        await owner.getByTestId('new-production').click();
        await expect(owner.getByTestId('production-page')).toBeVisible();
        const showId = owner.url().split('#/production/')[1]?.split('/')[0] ?? '';
        expect(showId).toMatch(/^[0-9a-f-]{36}$/);

        await owner.getByTestId(TEAM.door).click();
        await owner.getByTestId(TEAM.newTeam).click();
        await owner.getByTestId(TEAM.newTeamName).fill(teamName);
        await owner.getByTestId(TEAM.newTeamDisplayName).fill('Anna Owner');
        await owner.getByTestId(TEAM.createTeam).click();
        const code = ((await owner.getByTestId(TEAM.joinCode).textContent({ timeout: 20_000 })) ?? '').trim();
        expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
        // Back to the pick screen, where the new team is selected, and move.
        await owner.getByRole('button', { name: 'Back', exact: true }).click();
        await owner.locator('.team-pickrow', { hasText: teamName }).click();
        await owner.getByTestId(TEAM.moveToTeam).click();
        await expect(owner.getByTestId(TEAM.moved)).toBeVisible({ timeout: 20_000 });
        await shot(owner, 'teams-moved');
        await owner.getByRole('button', { name: 'Done', exact: true }).click();
        // The page stays on the same production - same id - now wearing the team's chip.
        await expect(owner.getByTestId(TEAM.productionTeam)).toContainText(teamName);
        await shot(owner, 'teams-production-header');

        // On A's Home it has LEFT "My productions" and sits in the team's band.
        await owner.goto('/app#/home/productions');
        await expect(owner.getByTestId(TEAM.myProductionsHead)).toBeVisible({ timeout: 20_000 });
        const ownerBand = owner.locator('[data-testid^="team-band-"]', { hasText: teamName });
        await expect(ownerBand.getByTestId(`production-row-${showId}`)).toBeVisible();
        await expect(owner.locator('.prod-grid').first().getByTestId(`production-row-${showId}`)).toHaveCount(0);
        await shot(owner, 'teams-home-owner');

        // B joins from the link, and Done lands on a Home that ALREADY shows the team's band and
        // its production - no reload, no search.
        await signInAs(mate, E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD);
        await dismissWizard(mate);
        await declineAnalytics(mate);
        await mate.goto(`/app#/join-team/${code}`);
        await mate.getByTestId(TEAM.joinDisplayName).fill('Ben Teammate');
        await mate.getByTestId(TEAM.join).click();
        await expect(mate.getByTestId(TEAM.joinDone)).toBeVisible({ timeout: 20_000 });
        await shot(mate, 'teams-join-done-says-where');
        await mate.getByTestId('join-team-done-close').click();
        const mateBand = mate.locator('[data-testid^="team-band-"]', { hasText: teamName });
        // FIVE seconds, deliberately short: the background refresh ticks every 15 s, so a band
        // that only arrives on the tick fails here. "Immediately" means the join fetched it.
        await expect(mateBand).toBeVisible({ timeout: 5_000 });
        const mateCard = mateBand.getByTestId(`production-row-${showId}`);
        await expect(mateCard).toBeVisible();
        await expect(mateCard.getByTestId(TEAM.chip)).toContainText(teamName);
        await expect(mateCard.getByTestId('team-production-meta')).toContainText('edited by Anna Owner');
        await shot(mate, 'teams-home-shared-band');

        // The Teams section: one click from anywhere on Home, naming who is in it.
        await mate.getByTestId(TEAM.navTeams).click();
        const teamCard = mate.getByTestId(TEAM.teamsSection).locator('.team-card', { hasText: teamName });
        await expect(teamCard.getByTestId('team-card-members')).toContainText('Anna Owner (owner)');
        await expect(teamCard.getByTestId('team-card-members')).toContainText('you');
        await shot(mate, 'teams-section');

        // B opens it from there and makes an edit: a data table, on the Data workspace.
        await teamCard.getByTestId('team-card-production').filter({ hasText: showName }).click();
        await expect(mate.getByTestId(TEAM.productionTeam)).toContainText(teamName);
        await mate.goto(`/app#/production/${showId}/data`);
        await mate.getByTestId('add-dataset').click();
        await expect(mate.getByTestId('dataset-name')).toHaveCount(1);
        // The save has reached the server once the header stops saying "Saving…".
        await expect(mate.getByTestId('production-team-save')).toContainText('edited by you', { timeout: 20_000 });

        // A opens the production COLD (a reload - the path a teammate's link takes) and reads
        // B's edit and B's name off the server row.
        await owner.goto(`/app#/production/${showId}/data`);
        await owner.reload();
        await expect(owner.getByTestId('dataset-name')).toHaveCount(1, { timeout: 20_000 });
        await expect(owner.getByTestId('production-team-save')).toContainText('edited by Ben Teammate');
      } finally {
        // Deleting the team cascades its productions (0054) and B's membership with them.
        await owner.goto('/app#/home/teams').catch(() => undefined);
        const card = owner.locator('.team-card', { hasText: teamName });
        if (await card.count().catch(() => 0)) {
          await card.getByTestId('team-card-open').click();
          await owner.getByTestId(TEAM.deleteTeam).click();
          await owner.getByTestId(TEAM.deleteTeam).click();
          await expect(owner.locator('.team-card', { hasText: teamName })).toHaveCount(0, { timeout: 20_000 });
        }
        await ownerContext.close();
        await mateContext.close();
      }
    });
  });
});
