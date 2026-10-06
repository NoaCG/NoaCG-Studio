// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// TEAMS (docs/TEAMS_PLAN.md §7). The whole feature is absent offline BY DESIGN, so the offline
// plan can only ever pin its absence (e2e/auth.spec.ts). Creating a team, reading its join
// code, joining by link and leaving all need a real session against migrations 0053/0054, and
// e2e/configured/teams.spec.ts is the only thing that walks them - it is also what proves the
// test ids the offline pin asserts to be ABSENT are ids something really renders.
// covers: src/backend/teams.ts, src/components/teams/**, e2e/_teams.ts
//
// The door's two MOUNT POINTS, named individually the way this list names
// ProductionDataPanel: the configured walk drives the card's overflow item and the production
// header's button, and offline neither exists to be driven. The `join-team` ROUTE needs no row
// - `src/app/router.ts` is CORE for the offline plan, and the offline pin fails outright if
// that route stops resolving, so it is covered where it is cheap to cover.
// covers: src/components/home/ProductionPage.tsx
// covers: src/components/home/sections/ProductionsSection.tsx

import { publishProduction } from '../_publish';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  dismissWizard,
  E2E_EMAIL,
  E2E_TEAMMATE_EMAIL,
  E2E_TEAMMATE_PASSWORD,
  haveCreds,
  haveTeammateCreds,
  lastAppliedRow,
  SERVICE_ROLE_KEY,
  shot,
  signIn,
  signInAs,
  SUPABASE_URL,
} from './_helpers';
import { settleDurableWrites } from '../_durable';
import { FAKE_JOIN_ROUTE, TEAM } from '../_teams';

async function expectTeamInSetup(page: Page, name: string, editedBy?: string) {
  await expect(page.getByTestId(TEAM.productionTeam)).toHaveCount(0);
  await page.getByTestId('production-setup').click();
  await expect(page.getByTestId(TEAM.productionTeam)).toContainText(name, { timeout: 20000 });
  if (editedBy) await expect(page.getByTestId(TEAM.productionTeam)).toHaveAttribute('title', new RegExp(`edited by ${editedBy}`), { timeout: 20000 });
  await page.getByTestId('production-setup').click();
}

// Teams (docs/TEAMS_PLAN.md §7): the DOOR in both of its shapes (stage 3), with a second account
// the invited teammate FINDING the team and what it holds (stage 4), and with a third the shared
// production proved end to end (stage 5): three members build it, and it plays out with its
// creator signed out.
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

// ── The three-member walk's helpers ─────────────────────────────────────────────────────────────

/** The THIRD account. Neither workflow mints it: the walk does, through the same admin endpoint
 *  and service-role key both workflows already hand the suite, so a run on either backend needs no
 *  new secret or workflow step. Derived from the first account's address so it lands on the same
 *  throwaway domain (`e2e-third@noacg.local` on the local stack). */
const E2E_THIRD_EMAIL = process.env.E2E_THIRD_EMAIL ?? E2E_EMAIL.replace(/^[^@]*/, 'e2e-third');
const E2E_THIRD_PASSWORD = E2E_TEAMMATE_PASSWORD;

/** Create an account, or accept that it already exists. Throws on anything else, so an
 *  environment fault reads as one here rather than as a sign-in timeout three minutes later. */
async function mintAccount(email: string, password: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 422 && /exist|registered/i.test(body)) return;
  throw new Error(`could not mint ${email}: admin/users answered ${res.status} ${body}`);
}

/** Save a graphic into the signed-in account's OWN library, through the model call Save uses, and
 *  push it - the library is where a member's graphic comes from before it is added to anything. */
async function makeLibraryGraphic(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { error } = createGraphic({ ...variantsFor('lower-third')[0].create({}), name: n }, { name: n, packageId: null });
    if (error) throw new Error(error);
  }, name);
  await settleDurableWrites(page);
  await page.evaluate(async () => {
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
}

/** Delete the named graphics from the signed-in library and push the tombstones. Best effort:
 *  it runs in teardown, where a failure must not hide the walk's own. */
async function dropLibraryGraphics(page: Page, names: string[]): Promise<void> {
  await page
    .evaluate(async (wanted) => {
      const { loadGraphics, deleteGraphic } = await import('/src/model/library.ts');
      for (const g of loadGraphics()) if (wanted.includes(g.name)) deleteGraphic(g.id);
      const { syncNow } = await import('/src/backend/syncController.ts');
      await syncNow();
    }, names)
    .catch(() => undefined);
}

/** A production's rundown as a page HOLDS it: pool graphics, cues (label, graphic, the values the
 *  members typed), data tables and the two capability slugs. Null when the page holds no such
 *  production. This is what "all three read the same rundown" compares. */
interface HeldRundown {
  graphics: string[];
  /** Each pool graphic's playout layer, in pool order. */
  layers: number[];
  cues: { label: string; graphic: string | null; values: Record<string, string> }[];
  datasets: string[];
  hostedSlug: string | null;
  outputSlug: string | null;
}

/** The fields of a production record the summary reads - the same shape on a page and on the
 *  server row, which is what makes the two comparable. */
interface RundownRecord {
  graphics: { id: string; name: string; layer?: number }[];
  cues?: { label: string; sourceId: string; values: Record<string, string> }[];
  datasets?: { name: string }[];
  hostedSlug?: string;
  outputSlug?: string;
}

function summarise(s: RundownRecord | null): HeldRundown | null {
  if (!s) return null;
  const names = new Map(s.graphics.map((g) => [g.id, g.name] as const));
  return {
    graphics: s.graphics.map((g) => g.name),
    layers: s.graphics.map((g) => Number(g.layer)),
    cues: (s.cues ?? []).map((c) => ({ label: c.label, graphic: names.get(c.sourceId) ?? null, values: c.values })),
    datasets: (s.datasets ?? []).map((d) => d.name),
    hostedSlug: s.hostedSlug ?? null,
    outputSlug: s.outputSlug ?? null,
  };
}

async function heldRundown(page: Page, showId: string): Promise<HeldRundown | null> {
  const record = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x: { id: string }) => x.id === id) ?? null;
  }, showId);
  return summarise(record as RundownRecord | null);
}

/** The same summary off the SERVER row (`team_productions.doc`), read with this page's session -
 *  what tells "the edit reached the team" from "the edit is on this screen". */
async function serverRundown(page: Page, showId: string): Promise<HeldRundown | null> {
  const record = await page.evaluate(async (id) => {
    const { getSupabase } = await import('/src/backend/supabase.ts');
    const sb = await getSupabase();
    if (!sb) return null;
    const { data } = await sb.from('team_productions').select('doc').eq('id', id).maybeSingle();
    return (data as { doc?: unknown } | null)?.doc ?? null;
  }, showId);
  return summarise(record as RundownRecord | null);
}

/** The first field's value on the cue made for `graphic`, off the server row. */
async function serverCueText(page: Page, showId: string, graphic: string): Promise<string | null> {
  const doc = await serverRundown(page, showId);
  return doc?.cues.find((c) => c.graphic === graphic)?.values.f0 ?? null;
}

/** The rundown as the production page SHOWS it: every cue row's label, in order. */
async function shownRundown(page: Page): Promise<string[]> {
  return page.getByTestId('cue-list').locator('.pd-cue [data-testid="select-cue"] strong').allTextContents();
}

/** Select the cue made for `graphic` on the production page. */
async function selectCueFor(page: Page, graphic: string): Promise<void> {
  await page.getByTestId('cue-list').locator('.pd-cue', { hasText: graphic }).getByTestId('select-cue').click();
}

/** Add a graphic from this member's own library to the open production, and type the text its
 *  cue should carry. */
async function addFromLibrary(page: Page, graphic: string, text: string): Promise<void> {
  await page.getByTestId('add-graphic-pick').selectOption({ label: graphic });
  await page.getByTestId('add-graphic').click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue', { hasText: graphic })).toBeVisible();
  await selectCueFor(page, graphic);
  await page.getByTestId('cue-field-f0').fill(text);
}

/** Join a team through its link, under a display name, and close the done screen. */
async function joinTeam(page: Page, code: string, displayName: string): Promise<void> {
  await page.goto(`/app#/join-team/${code}`);
  await page.getByTestId(TEAM.joinDisplayName).fill(displayName);
  await page.getByTestId(TEAM.join).click();
  await expect(page.getByTestId(TEAM.joinDone)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('join-team-done-close').click();
}

/** Sign out through the account menu. The page reloads onto the signed-out workspace, which is
 *  what empties the in-memory team store (model/teamShows.ts). */
async function signOut(page: Page): Promise<void> {
  const reloaded = page.waitForEvent('load');
  await page.getByTestId('account-button').click();
  await page.getByTestId('account-menu').getByRole('menuitem', { name: 'Sign out' }).click();
  await reloaded;
  await expect(page.getByTestId('auth-state')).toHaveText('Not signed in');
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
    // The Setup menu, where the door would be, rendered: Export is there and the door is not.
    await page.getByTestId('production-setup').click();
    await expect(page.getByTestId('export-production')).toBeVisible();
    await expect(page.getByTestId(TEAM.door)).toHaveCount(0);

    await page.goto('/app#/home/productions');
    const card = page.locator('[data-testid^="production-row-"]').first();
    await expect(card.getByTestId('open-production-name')).toBeVisible();
    // The menu also offers local duplication. Open it before checking the account-only actions.
    await card.getByTestId(TEAM.cardMenu).click();
    await expect(card.getByTestId('duplicate-production')).toBeVisible();
    await expect(page.getByTestId(TEAM.door)).toHaveCount(0);
    await expect(page.getByTestId('open-team')).toHaveCount(0);
    await expect(page.locator('.prod-grid')).not.toContainText(/team/i);
    // Signed out with a backend, the Join a team card is absent as well: it is for accounts.
    await expect(page.getByTestId(TEAM.joinCard)).toHaveCount(0);
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
      // The join door's positive half: every signed-in account has it, in or out of a team.
      await expect(page.getByTestId(TEAM.joinCard)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('new-production-name').fill(showName);
      await page.getByTestId('new-production').click();
      await expect(page.getByTestId('production-page')).toBeVisible();

      // THE POSITIVE HALF the offline pin depends on: the door is really rendered, in the
      // production page's Setup menu, by this exact test id.
      await page.getByTestId('production-setup').click();
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
      // The two name boxes say which is the team's and which is yours, and whose storage it costs.
      await expect(page.getByTestId(TEAM.newTeamExplainer)).toContainText('storage');
      await shot(page, 'teams-share-create');
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

      // The link works, PASTED into Home's Join a team card rather than opened: people paste
      // the whole link into a code field as often as the code, and the card takes the code out
      // of it. Re-joining with the same account updates the display name (0053 team_join's
      // on-conflict branch).
      const rotatedLink = await page.getByTestId(TEAM.joinLink).inputValue();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.goto('/app#/home/productions');
      await page.getByTestId(TEAM.joinCardCode).fill(rotatedLink);
      await page.getByTestId(TEAM.joinCardGo).click();
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

      // The card menu is the door's OTHER mount point. The signed-out/offline specs assert
      // the team action is absent there, so its signed-in presence gets walked as well.
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
        // Back on the pick screen. Not `open-team-details`: once the LAST team is gone the footer
        // offers New team as its primary instead, and the move explainer is on the screen either way.
        await expect(page.getByTestId('move-explainer')).toBeVisible({ timeout: 20_000 });
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
        // The header's primary controls keep their places when the production becomes a team's:
        // Share and the team's button differ in width, and operators press these by muscle memory
        // (docs/work-specs/studio-day-playout AC-6). Share and team identity are in Setup.
        // Pending/failed save state remains visible without moving Setup or All out.
        const fixedControls = ['production-status', 'production-setup', 'verb-out-all'];
        // Each control must be ON SCREEN to be measured: a missing box would compare equal to itself.
        const controlXs = () =>
          Promise.all(
            fixedControls.map(async (id) => {
              await expect(owner.getByTestId(id)).toBeVisible();
              return Math.round((await owner.getByTestId(id).boundingBox())!.x);
            }),
          );
        await owner.getByTestId('production-setup').click();
        await expect(owner.getByTestId('share-with-team')).toBeVisible();
        const personalXs = await controlXs();

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
        // The page stays on the same production; team identity is available inside Setup.
        await expectTeamInSetup(owner, teamName);
        expect(await controlXs()).toEqual(personalXs);
        await shot(owner, 'teams-production-header');

        // On A's Home it has LEFT "My productions" and sits in the team's band.
        await owner.goto('/app#/home/productions');
        await expect(owner.getByTestId(TEAM.myProductionsHead)).toBeVisible({ timeout: 20_000 });
        const ownerBand = owner.locator('[data-testid^="team-band-"]', { hasText: teamName });
        await expect(ownerBand.getByTestId(`production-row-${showId}`)).toBeVisible();
        await expect(owner.locator('.prod-grid').first().getByTestId(`production-row-${showId}`)).toHaveCount(0);
        await shot(owner, 'teams-home-owner');

        // B owns no production and holds only the CODE. B types it into Home's Join a team card
        // - the door that needs no production and no link - and Done lands on a Home that
        // ALREADY shows the team's band and its production: no reload, no search.
        await signInAs(mate, E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD);
        await dismissWizard(mate);
        await declineAnalytics(mate);
        await mate.goto('/app#/home');
        const joinCard = mate.getByTestId(TEAM.joinCard);
        await expect(joinCard).toBeVisible({ timeout: 20_000 });
        await expect(mate.getByTestId('no-productions')).toBeVisible();
        await joinCard.getByTestId(TEAM.joinCardCode).fill(code);
        await shot(mate, 'teams-join-card');
        await joinCard.getByTestId(TEAM.joinCardGo).click();
        await expect(mate.getByTestId(TEAM.joinCodeField)).toHaveValue(code);
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
        await expectTeamInSetup(mate, teamName);
        await mate.goto(`/app#/production/${showId}/data`);
        await mate.getByTestId('add-dataset').click();
        await expect(mate.getByTestId('dataset-name')).toHaveCount(1);
        await mate.goto(`/app#/production/${showId}`);
        await mate.getByTestId('rundown-add').click();
        await mate.getByTestId('rundown-refresh').click();
        await expect(mate.getByTestId('rundown-note')).toHaveText('Rundown refreshed from cloud.', { timeout: 20000 });
        expect((await serverRundown(mate, showId))?.datasets).toHaveLength(1);
        // Cloud-confirmed editor metadata is in Setup; the header keeps pending/failed state.
        await expectTeamInSetup(mate, teamName, 'you');
        await expect(mate.getByTestId('production-team-save')).toHaveCount(0);

        // A opens the production COLD (a reload - the path a teammate's link takes) and reads
        // B's edit and B's name off the server row.
        await owner.goto(`/app#/production/${showId}/data`);
        await owner.reload();
        await expect(owner.getByTestId('dataset-name')).toHaveCount(1, { timeout: 20_000 });
        await expectTeamInSetup(owner, teamName, 'Ben Teammate');

        // B gets BACK to the team from Home, owning nothing: the band's door opens the team with
        // its members, the link to pass on and Leave - and B changes the name teammates see, in
        // B's own row, with no second trip through a join link.
        await mate.goto('/app#/home/productions');
        await mate.locator('[data-testid^="team-band-"]', { hasText: teamName }).getByTestId('team-band-open').click();
        const teamDialog = mate.getByTestId(TEAM.dialog);
        await expect(teamDialog.getByTestId(TEAM.members)).toContainText('Anna Owner', { timeout: 20_000 });
        await expect(teamDialog.getByTestId(TEAM.joinLink)).toHaveValue(new RegExp(`#/join-team/${code}$`));
        await expect(teamDialog.getByTestId(TEAM.leaveTeam)).toBeVisible();
        await teamDialog.getByTestId(TEAM.renameMe).click();
        await teamDialog.getByTestId(TEAM.renameMeField).fill('Ben Renamed');
        await teamDialog.getByTestId(TEAM.renameMeSave).click();
        await expect(teamDialog.getByTestId(TEAM.members)).toContainText('Ben Renamed', { timeout: 20_000 });
        await expect(teamDialog.getByTestId(TEAM.members)).not.toContainText('Ben Teammate');
        await shot(mate, 'teams-member-back-and-renamed');
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

  // ── Three accounts: the production belongs to the team (TEAMS_PLAN §7 stage 5) ────────────────
  // GOALS outcome 5 asks for shared productions proved before anything is rebuilt: several members
  // add graphics to one production, open and use it later, and it stays usable - graphics, data
  // and playout - when its creator is absent. The two-account walk never adds a graphic from a
  // second account and never plays out, and those are exactly where a production could stay
  // trapped in the account that made it: a graphic is copied into the production from its
  // author's OWN library, and publishing resolves each graphic through the PUBLISHER's library.
  //
  // So: Anna (A) makes the team and the production, adds a graphic from her library and publishes.
  // Ben (B) and Cleo (C) join; each adds a graphic from their own library and types its text, and
  // Cleo adds a data table. Anna signs out. Ben then opens the production cold, finds everyone's
  // graphics and data, republishes, and plays it out - Anna's graphic and Cleo's, Take, Update and
  // Out, each read back off the output page. Finally all three read the same rundown, Anna from a
  // fresh sign-in, and the output address never moved.
  test.describe('three accounts', () => {
    test.skip(
      !haveCreds || !haveTeammateCreds || !SERVICE_ROLE_KEY,
      'set E2E_TEAMMATE_EMAIL/E2E_TEAMMATE_PASSWORD and SUPABASE_SERVICE_ROLE_KEY for the three-person walk',
    );
    test.setTimeout(420_000);

    test('three members build one production, and a member plays it out with its creator signed out', async ({ browser }) => {
      await mintAccount(E2E_THIRD_EMAIL, E2E_THIRD_PASSWORD);
      const stamp = Date.now();
      // `E2E team ` prefix, so the sweep in the one-account walk deletes it if this run dies.
      const teamName = `${TEAM_NAME()} three`;
      const showName = `Team three walk ${stamp}`;
      const gfx = { anna: `Anna strap ${stamp}`, ben: `Ben strap ${stamp}`, cleo: `Cleo strap ${stamp}` };
      const said = { anna: 'Anna Aalto', ben: 'Ben Berg', cleo: 'Cleo Castell', cleoLater: 'Cleo Castell, updated' };
      const contexts: BrowserContext[] = [];
      const open = async (): Promise<Page> => {
        const context = await browser.newContext();
        contexts.push(context);
        return context.newPage();
      };
      const anna = await open();
      const ben = await open();
      const cleo = await open();
      let showId = '';
      /** Anna's signed-in page, whichever it is at the time - teardown needs the team owner. */
      let owner: Page | null = null;
      try {
        // ── A: a graphic of her own, a production, a team, and a publish. ──────────────────────
        await signIn(anna);
        await dismissWizard(anna);
        await declineAnalytics(anna);
        owner = anna;
        await makeLibraryGraphic(anna, gfx.anna);
        await anna.goto('/app#/home/productions');
        await anna.getByTestId('new-production-name').fill(showName);
        await anna.getByTestId('new-production').click();
        await expect(anna.getByTestId('production-page')).toBeVisible();
        showId = anna.url().split('#/production/')[1]?.split('/')[0] ?? '';
        expect(showId).toMatch(/^[0-9a-f-]{36}$/);
        await addFromLibrary(anna, gfx.anna, said.anna);
        await expect.poll(async () => (await heldRundown(anna, showId))?.cues[0]?.values.f0, { timeout: 10_000 }).toBe(said.anna);

        await anna.getByTestId('production-setup').click();
        await anna.getByTestId(TEAM.door).click();
        await anna.getByTestId(TEAM.newTeam).click();
        await anna.getByTestId(TEAM.newTeamName).fill(teamName);
        await anna.getByTestId(TEAM.newTeamDisplayName).fill('Anna Owner');
        await anna.getByTestId(TEAM.createTeam).click();
        const code = ((await anna.getByTestId(TEAM.joinCode).textContent({ timeout: 20_000 })) ?? '').trim();
        expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
        await anna.getByRole('button', { name: 'Back', exact: true }).click();
        await anna.locator('.team-pickrow', { hasText: teamName }).click();
        await anna.getByTestId(TEAM.moveToTeam).click();
        await expect(anna.getByTestId(TEAM.moved)).toBeVisible({ timeout: 20_000 });
        await anna.getByRole('button', { name: 'Done', exact: true }).click();
        await expectTeamInSetup(anna, teamName);

        // Published FROM the team: the row is team-stamped, and the slugs travel in the team's doc.
        await publishProduction(anna);
        await expect(anna.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
        await expect(anna.getByTestId('production-links')).toBeVisible();
        await anna.getByTestId('production-status').click();
        await expect(anna.getByTestId('production-links')).toBeHidden();
        await expect.poll(async () => (await serverRundown(anna, showId))?.outputSlug ?? null, { timeout: 30_000 }).not.toBeNull();
        const published = (await serverRundown(anna, showId))!;
        expect(published.hostedSlug, 'publishing must put the control slug in the team document').toBeTruthy();
        expect(published.cues.map((c) => c.values.f0)).toEqual([said.anna]);

        // ── B and C join, each from the link, each under their own name. ───────────────────────
        await signInAs(ben, E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD);
        await dismissWizard(ben);
        await declineAnalytics(ben);
        await signInAs(cleo, E2E_THIRD_EMAIL, E2E_THIRD_PASSWORD);
        await dismissWizard(cleo);
        await declineAnalytics(cleo);
        await makeLibraryGraphic(ben, gfx.ben);
        await makeLibraryGraphic(cleo, gfx.cleo);
        await joinTeam(ben, code, 'Ben Teammate');
        await joinTeam(cleo, code, 'Cleo Third');

        // B opens it from the team's band on Home; C from a teammate's link. Both pages are up
        // before either adds anything, so C's first save may be refused and merged - the walk
        // asserts the outcome, which is the same whichever of the two paths the timing takes.
        await ben
          .locator('[data-testid^="team-band-"]', { hasText: teamName })
          .getByTestId(`production-row-${showId}`)
          .getByTestId('open-production-name')
          .click();
        await expectTeamInSetup(ben, teamName);
        await cleo.goto(`/app#/production/${showId}`);
        await expectTeamInSetup(cleo, teamName);

        // ── Each adds a graphic from their OWN library and types its text. ─────────────────────
        await addFromLibrary(ben, gfx.ben, said.ben);
        await expect.poll(() => serverCueText(ben, showId, gfx.ben), { timeout: 30_000 }).toBe(said.ben);
        await addFromLibrary(cleo, gfx.cleo, said.cleo);
        await expect.poll(() => serverCueText(cleo, showId, gfx.cleo), { timeout: 30_000 }).toBe(said.cleo);
        // …and C adds a data table, on the Data workspace, as the two-account walk's B does.
        await cleo.goto(`/app#/production/${showId}/data`);
        await cleo.getByTestId('add-dataset').click();
        await expect(cleo.getByTestId('dataset-name')).toHaveCount(1);
        await expect.poll(async () => (await serverRundown(cleo, showId))?.datasets.length ?? 0, { timeout: 30_000 }).toBe(1);
        const built = (await serverRundown(cleo, showId))!;
        expect([...built.graphics].sort()).toEqual([gfx.anna, gfx.ben, gfx.cleo].sort());
        // Three graphics, three layers. B's and C's adds each took "the lowest free layer" from
        // the same base, and two graphics on one layer replace each other on air.
        expect(new Set(built.layers).size, `layers ${built.layers.join(', ')}`).toBe(3);
        expect(Object.fromEntries(built.cues.map((c) => [c.graphic, c.values.f0]))).toEqual({
          [gfx.anna]: said.anna,
          [gfx.ben]: said.ben,
          [gfx.cleo]: said.cleo,
        });
        await cleo.goto(`/app#/production/${showId}`);

        // ── A signs out. Nothing of the team stays on her screen. ──────────────────────────────
        await anna.goto('/app#/home');
        await expect(anna.getByTestId('home-page')).toBeVisible();
        await signOut(anna);
        owner = null;

        // ── Later, B opens it COLD and finds every member's graphics and data. ─────────────────
        await ben.goto(`/app#/production/${showId}`);
        await ben.reload();
        const rundown = ben.getByTestId('cue-list');
        for (const name of [gfx.anna, gfx.ben, gfx.cleo]) {
          await expect(rundown.locator('.pd-cue', { hasText: name })).toBeVisible({ timeout: 20_000 });
        }
        await selectCueFor(ben, gfx.cleo);
        await expect(ben.getByTestId('cue-field-f0')).toHaveValue(said.cleo);
        await expect(ben.getByTestId('production-preview').frameLocator('iframe').locator('#f0')).toContainText(said.cleo);
        await shot(ben, 'teams-three-cold-open');

        // B REPUBLISHES - the payload is pinned at publish, and A's publish predates B's and C's
        // graphics - and the output address is the one A's publish minted.
        await expect(ben.getByTestId('production-status')).toHaveAttribute('data-started', 'true');
        await ben.getByTestId('production-status').click();
        await ben.getByTestId('prepare-for-live-button').click();
        await expect(ben.getByTestId('publish-freshness')).toHaveCount(0, { timeout: 30_000 });
        await ben.getByTestId('production-status').click();
        await expect(ben.getByTestId('production-links')).toBeHidden();
        const benHeld = (await heldRundown(ben, showId))!;
        expect(benHeld.outputSlug, 'a member republishing must keep the address the creator published').toBe(published.outputSlug);
        expect(benHeld.hostedSlug).toBe(published.hostedSlug);

        // The output page: every member's graphic is in the payload B pinned.
        const air = await ben.context().newPage();
        air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
        await air.goto(`/output?production=${encodeURIComponent(published.outputSlug!)}&debug=1`);
        await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });
        for (const name of [gfx.anna, gfx.ben, gfx.cleo]) await expect(air.locator(`iframe[title="${name}"]`)).toHaveCount(1);
        const onAir = (name: string) => air.frameLocator(`iframe[title="${name}"]`).locator('#f0');
        const airPlays = async () => Number(await air.evaluate(() => document.body.getAttribute('data-plays')));

        // TAKE A's graphic - its author is signed out and it is in nobody else's library.
        let rows = await lastAppliedRow(air);
        await selectCueFor(ben, gfx.anna);
        await ben.getByTestId('verb-take').click();
        await expect(onAir(gfx.anna)).toContainText(said.anna, { timeout: 30_000 });
        await expect.poll(airPlays, { timeout: 30_000 }).toBe(1);
        await expect.poll(() => lastAppliedRow(air), { timeout: 60_000 }).toBeGreaterThanOrEqual(rows + 3);

        // TAKE C's graphic, then UPDATE its text from B's desk.
        rows = await lastAppliedRow(air);
        await selectCueFor(ben, gfx.cleo);
        await ben.getByTestId('verb-take').click();
        await expect(onAir(gfx.cleo)).toContainText(said.cleo, { timeout: 30_000 });
        await expect.poll(airPlays, { timeout: 30_000 }).toBe(2);
        await expect.poll(() => lastAppliedRow(air), { timeout: 60_000 }).toBeGreaterThanOrEqual(rows + 3);
        await ben.getByTestId('cue-field-f0').fill(said.cleoLater);
        await ben.getByTestId('verb-update').click();
        await expect(onAir(gfx.cleo)).toContainText(said.cleoLater, { timeout: 30_000 });
        await shot(air, 'teams-three-on-air');

        // OUT: the take-off reaches the renderer as durable rows (`clearCueItems`: stop, cue), and
        // plays nothing.
        rows = await lastAppliedRow(air);
        await ben.getByTestId('verb-out').click();
        await expect.poll(() => lastAppliedRow(air), { timeout: 60_000 }).toBeGreaterThanOrEqual(rows + 2);
        await expect(rundown.locator('.pd-cue.on-air', { hasText: gfx.cleo })).toHaveCount(0);
        expect(await airPlays()).toBe(2);
        await air.close();

        // ── All three read the same rundown: C on the page she left open, A signed in afresh. ──
        await expect.poll(() => serverCueText(ben, showId, gfx.cleo), { timeout: 30_000 }).toBe(said.cleoLater);
        const truth = (await serverRundown(ben, showId))!;
        expect(truth.datasets).toHaveLength(1);
        expect(truth.outputSlug).toBe(published.outputSlug);
        const annaAgain = await open();
        await signIn(annaAgain);
        await dismissWizard(annaAgain);
        await declineAnalytics(annaAgain);
        owner = annaAgain;
        await annaAgain.goto(`/app#/production/${showId}`);
        for (const [who, page] of [
          ['Ben', ben],
          ['Cleo', cleo],
          ['Anna', annaAgain],
        ] as const) {
          await expect.poll(() => heldRundown(page, showId), { timeout: 45_000, message: `${who} reads the team's rundown` }).toEqual(truth);
        }
        const shown = await shownRundown(ben);
        expect(shown).toHaveLength(3);
        await expect.poll(() => shownRundown(cleo), { timeout: 20_000 }).toEqual(shown);
        await expect.poll(() => shownRundown(annaAgain), { timeout: 20_000 }).toEqual(shown);
        // …and her desk agrees with AIR. Anna's graphic is still up (B took it and only took
        // Cleo's out), so the program monitor must show what B sent, and the on-air cue's editor
        // must not claim its values are unsent - she opened the desk after the take, not before.
        await expect(annaAgain.getByTestId('cue-list').locator('.pd-cue.on-air', { hasText: gfx.anna })).toHaveCount(1);
        await selectCueFor(annaAgain, gfx.anna);
        await expect(annaAgain.getByTestId('cue-unsent')).not.toContainText('not on air yet');
        await expect(
          annaAgain.getByTestId('program-stage').frameLocator(`iframe[title="${gfx.anna}"]`).locator('#f0'),
        ).toContainText(said.anna, { timeout: 20_000 });
        await shot(annaAgain, 'teams-three-creator-back');
      } finally {
        // Unpublish (A owns the published row), then delete the team, which cascades its
        // productions and both memberships (0054). Then each member's library graphic. None of it
        // may replace the walk's own failure, so a teardown fault is logged, not thrown; a team it
        // leaves is swept by the one-account walk (`E2E team ` prefix). A run that failed while
        // Anna was signed out signs her in again to clean up.
        try {
          if (!owner && showId) {
            owner = await open();
            await signIn(owner);
            await dismissWizard(owner);
          }
          if (owner) {
            if (showId) {
              await owner.evaluate(async (id) => {
                const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
                await unpublishControlShow(id);
              }, showId);
            }
            await owner.goto('/app#/home/teams');
            const card = owner.locator('.team-card', { hasText: teamName });
            if (await card.count()) {
              await card.getByTestId('team-card-open').click();
              await owner.getByTestId(TEAM.deleteTeam).click();
              await owner.getByTestId(TEAM.deleteTeam).click();
              await expect(owner.locator('.team-card', { hasText: teamName })).toHaveCount(0, { timeout: 20_000 });
            }
            await dropLibraryGraphics(owner, [gfx.anna]);
          }
        } catch (e) {
          console.warn('[three-member walk] teardown left something behind:', (e as Error).message);
        }
        await dropLibraryGraphics(ben, [gfx.ben]);
        await dropLibraryGraphics(cleo, [gfx.cleo]);
        for (const context of contexts) await context.close();
      }
    });
  });
});
