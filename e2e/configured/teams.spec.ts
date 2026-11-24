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
// covers: src/components/home/CueEditor.tsx
// covers: src/components/home/sections/ProductionsSection.tsx
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/ProductionShell.tsx
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
// covers: src/backend/teamProductions.ts, src/backend/assets.ts, src/backend/pacing.ts
// covers: src/backend/savedRevision.ts, src/control/autoPublish.ts, src/components/home/useAutoPublish.ts
// covers: src/control/publishParts.ts, src/control/publishRevision.ts, src/control/messageStaging.ts
// covers: src/backend/teamDesigns.ts
// A REFUSED SAVE READS ONLY WHAT CHANGED (#2615, live-publishing evidence/fix-2615.md): the describe at the end.
// covers: supabase/migrations/0124_team_save_refusal_token.sql, src/backend/unitPatch.ts

import { publishProduction } from '../_publish';
import { closeScene, isLocalStack, lastTexts, openProduction, openScene, pageCues, run, serverState, setSwitch, type Scene } from './_five';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  dismissWizard,
  E2E_EMAIL,
  E2E_PASSWORD,
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
import { installDoor } from '../_door';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ANON_KEY } from './_panel';
import { applyPatch, applyToMap, canonicalJson, diff, unitMap, type PatchOp, type UnitMap } from '../../src/backend/unitPatch';

// This file also runs in pages that are not the app (e2e/_door.ts).
test.beforeEach(({ context }) => installDoor(context));

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
    const { variantsFor } = await __noacgImport('/src/templates/catalog.ts');
    const { createGraphic } = await __noacgImport('/src/model/library.ts');
    const { error } = createGraphic({ ...variantsFor('lower-third')[0].create({}), name: n }, { name: n, packageId: null });
    if (error) throw new Error(error);
  }, name);
  await settleDurableWrites(page);
  await page.evaluate(async () => {
    const { syncNow } = await __noacgImport('/src/backend/syncController.ts');
    await syncNow();
  });
}

/** Delete the named graphics from the signed-in library and push the tombstones. Best effort:
 *  it runs in teardown, where a failure must not hide the walk's own. */
async function dropLibraryGraphics(page: Page, names: string[]): Promise<void> {
  await page
    .evaluate(async (wanted) => {
      const { loadGraphics, deleteGraphic } = await __noacgImport('/src/model/library.ts');
      for (const g of loadGraphics()) if (wanted.includes(g.name)) deleteGraphic(g.id);
      const { syncNow } = await __noacgImport('/src/backend/syncController.ts');
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
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    return loadShows().find((x: { id: string }) => x.id === id) ?? null;
  }, showId);
  return summarise(record as RundownRecord | null);
}

/** The same summary off the SERVER row (`team_productions.doc`), read with this page's session -
 *  what tells "the edit reached the team" from "the edit is on this screen". */
async function serverRundown(page: Page, showId: string): Promise<HeldRundown | null> {
  const record = await page.evaluate(async (id) => {
    const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
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
      await installDoor(ownerContext);
      const mateContext = await browser.newContext();
      await installDoor(mateContext);
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
        await expect(mate.getByTestId('sync-status')).toHaveText('Synced');

        // A opens the production COLD (a reload - the path a teammate's link takes) and reads
        // B's edit and B's name off the server row.
        await owner.goto(`/app#/production/${showId}/data`);
        await owner.reload();
        await expect(owner.getByTestId('dataset-name')).toHaveCount(1, { timeout: 20_000 });
        await expectTeamInSetup(owner, teamName, 'Ben Teammate');

        // A file in a team production lives in Storage, not in the row (0106). A adds one; the row
        // holds a reference; B's copy holds the bytes; somebody outside the team cannot read it.
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAAMEAQDtAb2rAAAAAElFTkSuQmCC';
        const heldAsset = (page: Page) => page.evaluate(async (id) => {
          const { loadTeamShows } = await __noacgImport('/src/model/teamShows.ts');
          const show = loadTeamShows().find((s) => s.id === id) as unknown as { e2eAsset?: { data?: string } } | undefined;
          return show?.e2eAsset?.data ?? null;
        }, showId);
        const rowAsset = (page: Page) => page.evaluate(async (id) => {
          const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
          const sb = await getSupabase();
          const { data } = await sb!.from('team_productions').select('asset:doc->e2eAsset->>data').eq('id', id).maybeSingle();
          return (data as { asset?: string } | null)?.asset ?? null;
        }, showId);
        await owner.evaluate(async ({ id, data }) => {
          const { loadTeamShows, writeTeamShow } = await __noacgImport('/src/model/teamShows.ts');
          const show = loadTeamShows().find((s) => s.id === id)!;
          writeTeamShow({ ...show, e2eAsset: { path: 'e2e.png', data } } as typeof show);
        }, { id: showId, data: png });
        await expect.poll(() => rowAsset(owner), { timeout: 20_000 }).toMatch(/^spx-storage:team\/[0-9a-f-]{36}\/[0-9a-f]{8}-\d+$/);
        const assetKey = (await rowAsset(owner))!.slice('spx-storage:'.length);
        expect(await heldAsset(owner)).toBe(png);
        await mate.evaluate(async () => {
          const { refreshTeams } = await __noacgImport('/src/backend/teamProductions.ts');
          await refreshTeams();
        });
        await expect.poll(() => heldAsset(mate), { timeout: 30_000 }).toBe(png);
        await mintAccount(E2E_THIRD_EMAIL, E2E_THIRD_PASSWORD);
        const strangerContext = await browser.newContext();
        await installDoor(strangerContext);
        const stranger = await strangerContext.newPage();
        await signInAs(stranger, E2E_THIRD_EMAIL, E2E_THIRD_PASSWORD);
        const strangerRead = await stranger.evaluate(async (key) => {
          const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
          const sb = await getSupabase();
          const read = await sb!.storage.from('user-assets').download(key);
          const write = await sb!.storage.from('user-assets').upload(key.replace(/[^/]+$/, 'stranger'), new Blob(['x']));
          return { read: read.data === null, write: write.data === null };
        }, assetKey);
        expect(strangerRead).toEqual({ read: true, write: true });
        await strangerContext.close();

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
        await installDoor(context);
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
        await expect(anna.getByTestId('production-status-panel')).toBeVisible();
        await anna.getByTestId('production-status').click();
        await expect(anna.getByTestId('production-status-panel')).toBeHidden();
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
        // Since live-production-reliability P2 B's page adds the graphics A's publish lacks by itself;
        // Publish changes is pressed for whatever else is left (the panel offers it only then).
        await ben.getByTestId('production-status').click();
        const panelPublish = ben.getByTestId('panel-publish-changes');
        const storedNames = () =>
          ben.evaluate(async (id) => {
            const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
            const { data } = await (await getSupabase())!.from('control_shows').select('published_ver').eq('id', id).maybeSingle();
            return Object.keys((data as { published_ver?: { g?: Record<string, string> } } | null)?.published_ver?.g ?? {});
          }, showId);
        const allNamed = async () => {
          const names = await storedNames();
          return [gfx.anna, gfx.ben, gfx.cleo].every((n) => names.includes(n));
        };
        await expect.poll(async () => (await panelPublish.count()) > 0 || (await allNamed()), { timeout: 60_000 }).toBe(true);
        if (await panelPublish.count()) await panelPublish.click();
        await expect(panelPublish).toHaveCount(0, { timeout: 30_000 });
        await expect.poll(allNamed, { timeout: 30_000, message: 'every member graphic is published' }).toBe(true);
        await ben.getByTestId('production-status').click();
        await expect(ben.getByTestId('production-status-panel')).toBeHidden();
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
                const { unpublishControlShow } = await __noacgImport('/src/control/hostedControl.ts');
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

// FIVE PEOPLE AT ONCE (docs/work-specs/live-publishing/spec.md, AC-6). Five signed-in accounts in
// browser contexts of their own work one team production with automatic updates and partial writes
// on: one takes and outs, one pastes messages and prepares cues from them, one presses the score's
// Goal, and two type into their own cues at the same instant each tick. One editor's page reloads
// part way through; the other loses its connection and gets it back. Afterwards: no command lost
// (every Take ran on the output, the score moved once per Goal, every message became a cue), no
// different cue overwritten (each editor's last text is in the team's record, in the publication
// and on every page; the reloaded editor finds its text, the reconnected editor's offline text
// arrives), and no conflicted copy anywhere.
// This is the 30 s run the suite can afford; the ten-minute run, press to ran against a single page
// and the 10 and 15 page runs use the same scene (e2e/configured/_five.ts) from
// e2e/configured/measure/five.measure.ts, with their numbers in
// docs/work-specs/live-publishing/evidence/phase-8.md.
test.describe('five accounts at once', () => {
  test.skip(!haveCreds || !SERVICE_ROLE_KEY || !isLocalStack(), 'five people: needs the local stack, its accounts and its service key (it mints accounts and writes the switches)');

  let scene: Scene | null = null;
  test.afterEach(async ({ page }, testInfo) => {
    // On a failure, keep what each person's own page shows before the scene goes: a lost text is
    // diagnosed from the typist's page (its record, its open cue editor), never from the record alone.
    if (scene && testInfo.status !== testInfo.expectedStatus) {
      for (const [i, p] of scene.people.entries()) {
        const cues = await pageCues(p.page, scene.showId).catch((e) => String(e));
        const editing = await p.page.getByTestId('cue-editor').locator('input[type="text"]').first().inputValue({ timeout: 2_000 }).catch(() => null);
        await testInfo.attach(`person-${i}-${p.role}.json`, { body: JSON.stringify({ email: p.email, cue: p.cue, editing, cues }, null, 2), contentType: 'application/json' });
        await testInfo.attach(`person-${i}-${p.role}.png`, { body: await p.page.screenshot().catch(() => Buffer.from('')), contentType: 'image/png' });
      }
    }
    await closeScene(scene, page);
    scene = null;
  });

  test('five people on one production: no command lost, no different cue overwritten', async ({ page, browser }) => {
    test.setTimeout(120_000);
    scene = await openScene(browser, page, 5);
    const before = await serverState(scene);
    const report = await run(scene, { ms: 30_000, tickMs: 3_000, messageEveryMs: 9_000, reloadAt: 0.3, offlineAt: 0.5, offlineMs: 8_000 });
    expect(report.errors, 'every role ran to the end').toEqual([]);
    expect(report.reloads, 'one page reloaded').toBe(1);
    expect(report.offline, 'one page lost its connection and got it back').not.toBeNull();

    // No command lost.
    expect(report.takes.length).toBeGreaterThan(5);
    expect(report.takes.filter((t) => t.ranAt === null).map((t) => t.label), 'every Take ran on the output').toEqual([]);
    expect(report.goals).toBeGreaterThan(3);
    expect(report.messages.filter((m) => !m.prepared), 'every message became a cue').toEqual([]);

    // Everything settles: the record, the publication and every page.
    const last = lastTexts(report);
    const s = scene;
    await expect
      .poll(async () => (await serverState(s)).score, { timeout: 20_000, message: 'the score moved once per Goal' })
      .toBe(report.goals);
    await expect
      .poll(
        async () => {
          const state = await serverState(s);
          return Object.fromEntries(Object.keys(last).map((cue) => [cue, { record: state.cues[cue], published: state.published.includes(last[cue]) }]));
        },
        { timeout: 30_000, message: "each editor's last text is in the team's record and in the publication" },
      )
      .toEqual(Object.fromEntries(Object.entries(last).map(([cue, text]) => [cue, { record: text, published: true }])));
    await Promise.all(
      s.people.map((p) =>
        expect
          .poll(async () => pickCues(await pageCues(p.page, s.showId), Object.keys(last)), {
            timeout: 30_000,
            message: `${p.email}'s page holds each editor's last text`,
          })
          .toEqual(last),
      ),
    );
    const state = await serverState(s);
    for (const label of [...s.takes, s.score]) expect(state.cues[label], `${label}, which nobody writes, keeps its text`).toBe(before.cues[label]);
    for (const m of report.messages) expect(state.labels, `a cue from "${m.body}"`).toContain(m.body);
    expect(state.conflicted, 'no conflicted copy anywhere').toEqual([]);
    test.info().annotations.push({ type: 'press to ran (ms, not judged here)', description: JSON.stringify(report.takes.map((t) => Math.round(t.ranAt! - t.pressAt))) });
  });

  function pickCues(cues: Record<string, string>, labels: string[]): Record<string, string> {
    return Object.fromEntries(labels.map((l) => [l, cues[l]]));
  }
});

// THE TEAM RECORD WITHOUT ITS DESIGNS (live-publishing G5, issue #2614), with the `team_designs`
// switch on: a team record names each design once (`designRef`) and every page reads it whole; a
// cue edit puts no design, even after a reload; a design change puts one. A page opened before the
// update is played here by a browser context whose REST requests lose the designs mark, which is
// exactly what the database sees of an older page: it is never handed a split record and cannot
// write the production's record or publication, while its Takes still land.
test.describe('team designs: one copy of each design per production', () => {
  test.skip(!haveCreds || !haveTeammateCreds || !SERVICE_ROLE_KEY || !isLocalStack(), 'the switch is a service-role write: local stack, its accounts and its key only');
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await setSwitch('team_designs', false).catch(() => undefined);
  });

  const MARK = 'x-noacg-team-designs';
  const REFUSED = 'Reload this page to edit';
  // A small PNG, so the image round trip through Storage is part of what a reload re-reads.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  /** The team's rows, removed with the local stack's service role (the team owner's own delete runs
   *  from a page that a failed step may have left mid-navigation). Teams this walk left behind are
   *  swept first: one split record locks the older page's account out of every team it is in. */
  async function dropDesignTeams(id?: string): Promise<void> {
    const filter = id ? `id=eq.${id}` : `name=like.${encodeURIComponent('E2E team *designs')}`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/teams?${filter}`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
    expect(r.ok, `the walk's teams were removed: ${r.status} ${await r.text()}`).toBe(true);
  }

  /** A context whose REST requests never carry the designs mark: an older page, to the database. */
  async function asOlderPage(context: BrowserContext): Promise<void> {
    await context.route('**/rest/v1/**', (route) => {
      const headers = { ...route.request().headers() };
      delete headers[MARK];
      return route.continue({ headers });
    });
  }

  /** Cue edits and design changes go up now, not after the debounce. */
  async function editCue(page: Page, showId: string, graphic: string, text: string): Promise<void> {
    const error = await page.evaluate(async ({ id, graphic, text }) => {
      const m = await __noacgImport('/src/model/shows.ts');
      const { flushTeamProduction } = await __noacgImport('/src/backend/teamProductions.ts');
      const show = m.loadShows().find((s: { id: string }) => s.id === id)!;
      const g = show.graphics.find((x: { name: string }) => x.name === graphic)!;
      const cue = show.cues!.find((c: { sourceId: string }) => c.sourceId === g.id)!;
      m.updateShowCue(id, cue.id, { values: { ...cue.values, f0: text } });
      return await flushTeamProduction(id);
    }, { id: showId, graphic, text });
    expect(error, `the edit to ${graphic} was saved`).toBeNull();
  }

  /** The stored row as a new page's session reads it: its form and each graphic's stored members. */
  async function storedRow(page: Page, showId: string): Promise<{ form: number | null; graphics: Array<{ name: string; designRef?: string; template?: unknown }>; cues: Array<{ values?: Record<string, string> }> }> {
    return page.evaluate(async (id) => {
      const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
      const sb = (await getSupabase())!;
      const { data, error } = await sb.from('team_productions').select('doc, doc_form').eq('id', id).single();
      if (error) throw new Error(error.message);
      const row = data as { doc: { graphics: Array<Record<string, unknown>>; cues: Array<{ values?: Record<string, string> }> }; doc_form: number | null };
      return { form: row.doc_form, graphics: row.doc.graphics.map((g) => ({ name: String(g.name), designRef: g.designRef as string | undefined, template: g.template })), cues: row.doc.cues };
    }, showId);
  }

  /** The designs this page holds, by graphic name, as canonical JSON. */
  async function heldDesigns(page: Page, showId: string): Promise<Record<string, string>> {
    return page.evaluate(async (id) => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const { canonicalJson } = await __noacgImport('/src/backend/unitPatch.ts');
      const show = loadShows().find((s: { id: string }) => s.id === id)!;
      return Object.fromEntries(show.graphics.map((g: { name: string; template: unknown }) => [g.name, canonicalJson(g.template)]));
    }, showId);
  }

  /** One REST call as this page makes it (an older page's context strips the mark on the way). */
  async function rest(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; text: string }> {
    return page.evaluate(async ({ path, init }) => {
      const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
      const { loadBackendConfig } = await __noacgImport('/src/backend/config.ts');
      const sb = (await getSupabase())!;
      const { data } = await sb.auth.getSession();
      const { url, anonKey } = loadBackendConfig();
      const r = await fetch(`${url}/rest/v1/${path}`, {
        method: init.method ?? 'GET',
        headers: { apikey: anonKey, authorization: `Bearer ${data.session!.access_token}`, 'content-type': 'application/json', 'x-noacg-production-copies': '1', 'x-noacg-team-designs': '1', prefer: 'return=representation' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { status: r.status, text: await r.text() };
    }, { path, init });
  }

  test('a cue edit stores no design; every page reads the record whole; an older page only plays out', async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const open = async (older = false) => {
      const context = await browser.newContext();
      contexts.push(context);
      await installDoor(context);
      if (older) await asOlderPage(context);
      return context.newPage();
    };
    let teamId: string | null = null;
    let ownTeamId: string | null = null;
    const owner = await open();
    try {
      await setSwitch('team_designs', false);
      await dropDesignTeams();
      await signIn(owner);
      await dismissWizard(owner).catch(() => undefined);
      await owner.goto('/app#/home');
      await expect(owner.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
      // A production of two graphics, one with an image, moved into a new team and published.
      const made = await owner.evaluate(async ({ name, png }) => {
        const { CATALOG } = await __noacgImport('/src/templates/catalog.ts');
        const { initialDraft, mergeDraft, buildDraftTemplate } = await __noacgImport('/src/components/wizard/draft.ts');
        const { formatTemplate } = await __noacgImport('/src/format/formatCode.ts');
        const m = await __noacgImport('/src/model/shows.ts');
        const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
        const pick = Object.values(CATALOG).flat().find((v) => v.name === 'Hairline')!;
        const draft = mergeDraft(initialDraft(), { variantId: pick.id, lines: pick.suggestedLines.map((l) => ({ ...l })), zone: null, logoEnabled: null, animation: { presetId: null, outPresetId: null }, paletteId: null, customPalette: null, fontId: null });
        const base = await formatTemplate(buildDraftTemplate(pick, draft));
        const { show, error } = m.createShowNamedChecked(name);
        if (error) throw new Error(error);
        for (const [n, assets] of [['Designs A', [{ path: 'logo.png', data: png }]], ['Designs B', []]] as const) {
          const added = m.addGraphicToShow(show.id, { ...base, name: n, assets: [...(base.assets ?? []), ...assets] }, {});
          if (added.error) throw new Error(added.error);
        }
        const failure = await commitDurableWrites();
        if (failure) throw new Error(failure);
        return { id: show.id };
      }, { name: `Team designs ${Date.now()}`, png: PNG });
      const team = await owner.evaluate(async ({ id, teamName }) => {
        const { createTeam } = await __noacgImport('/src/backend/teams.ts');
        const { moveProductionToTeam } = await __noacgImport('/src/backend/teamProductions.ts');
        const { loadShows } = await __noacgImport('/src/model/shows.ts');
        const { team, error } = await createTeam(teamName, 'Designs owner');
        if (!team) throw new Error(`team: ${error}`);
        const moved = await moveProductionToTeam(loadShows().find((s: { id: string }) => s.id === id)!, team.id);
        if (moved.error) throw new Error(`move: ${moved.error}`);
        return { id: team.id as string, code: team.joinCode as string };
      }, { id: made.id, teamName: `${TEAM_NAME()} designs` });
      teamId = team.id;
      await owner.goto(`/app#/production/${made.id}`);
      await expect(owner.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
      await publishProduction(owner);
      expect((await storedRow(owner, made.id)).form, 'with the switch off the record stays whole').toBeNull();

      // The older page opens the production while its record is still whole.
      const older = await open(true);
      await signInAs(older, E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD);
      await dismissWizard(older).catch(() => undefined);
      const joined = await older.evaluate(async ({ code }) => {
        const { joinTeamByCode } = await __noacgImport('/src/backend/teams.ts');
        const { refreshTeams } = await __noacgImport('/src/backend/teamProductions.ts');
        const { error } = await joinTeamByCode(code, 'Older page');
        await refreshTeams();
        return error;
      }, { code: team.code });
      expect(joined).toBeNull();
      await openProduction(older, made.id);

      // The switch goes on; the owner's page reads it on its next load and splits its next save.
      await setSwitch('team_designs', true);
      await owner.reload();
      await openProduction(owner, made.id);
      const state = await owner.evaluate(async () => {
        const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
        return (await (await getSupabase())!.rpc('team_designs_state')).data as { mark: boolean; on: boolean };
      });
      expect(state, 'a marked browser request reaches the database').toEqual({ installed: true, mark: true, on: true });
      const puts: string[] = [];
      owner.on('request', (r) => { if (r.url().endsWith('/rest/v1/rpc/team_designs_put')) puts.push(r.url()); });
      await editCue(owner, made.id, 'Designs A', 'Split first');
      let stored = await storedRow(owner, made.id);
      expect(stored.form, 'the record is split (R5)').toBe(1);
      expect(stored.graphics.every((g) => typeof g.designRef === 'string' && g.template === undefined), 'every graphic names its design and carries none (R16)').toBe(true);
      expect(puts.length, 'the conversion put the designs').toBeGreaterThan(0);
      const designs = await heldDesigns(owner, made.id);
      expect(designs['Designs A']).toContain(PNG);

      // Another new page reads the record whole: the same designs, image included, and the edit (R1).
      const second = await open();
      await signIn(second);
      await openProduction(second, made.id);
      expect(await heldDesigns(second, made.id)).toEqual(designs);

      // After a reload a cue edit puts no design (R8), and the record stays split.
      await owner.reload();
      await openProduction(owner, made.id);
      puts.length = 0;
      await editCue(owner, made.id, 'Designs B', 'After reload');
      expect(puts, 'a cue edit after a reload puts no design').toEqual([]);

      // A design change puts that one design, and keeps the record split; the next cue edit puts none.
      const changed = await owner.evaluate(async ({ id }) => {
        const m = await __noacgImport('/src/model/shows.ts');
        const { flushTeamProduction } = await __noacgImport('/src/backend/teamProductions.ts');
        const g = m.loadShows().find((s: { id: string }) => s.id === id)!.graphics.find((x: { name: string }) => x.name === 'Designs B')!;
        const { error } = m.setGraphicCopyScript(id, g.id, g.template.js, `${g.template.js}\n// changed`);
        return error ?? (await flushTeamProduction(id));
      }, { id: made.id });
      expect(changed).toBeNull();
      expect(puts.length, 'one design put for one design change').toBe(1);
      const before = stored;
      stored = await storedRow(owner, made.id);
      expect(stored.form).toBe(1);
      expect(stored.graphics.every((g) => typeof g.designRef === 'string' && g.template === undefined)).toBe(true);
      expect(stored.graphics.find((g) => g.name === 'Designs B')!.designRef).not.toBe(before.graphics.find((g) => g.name === 'Designs B')!.designRef);
      expect(stored.graphics.find((g) => g.name === 'Designs A')!.designRef).toBe(before.graphics.find((g) => g.name === 'Designs A')!.designRef);
      puts.length = 0;
      await editCue(owner, made.id, 'Designs A', 'After the change');
      expect(puts).toEqual([]);
      await expect.poll(async () => (await heldDesigns(second, made.id))['Designs B'], { timeout: 40_000, message: 'the other new page takes the new design on its next read' }).toBe((await heldDesigns(owner, made.id))['Designs B']);

      // Two new pages save at once: one is refused (the token only, #2615), reads the split record
      // through team_production_changes, makes it whole and merges; both edits stand, the record stays
      // split, and both pages still hold every design (R1, R9).
      await Promise.all([
        editCue(owner, made.id, 'Designs A', 'Both at once A'),
        editCue(second, made.id, 'Designs B', 'Both at once B'),
      ]);
      await expect.poll(async () => (await storedRow(owner, made.id)).cues.map((c) => c.values?.f0), { timeout: 40_000, message: 'both edits stand' })
        .toEqual(expect.arrayContaining(['Both at once A', 'Both at once B']));
      expect((await storedRow(owner, made.id)).form).toBe(1);
      for (const p of [owner, second]) {
        await expect.poll(async () => heldDesigns(p, made.id), { timeout: 40_000, message: 'each page holds every design whole' }).toEqual(await heldDesigns(owner, made.id));
        expect(Object.values(await heldDesigns(p, made.id)).every((d) => d.length > 1000)).toBe(true);
      }

      // The older page: every read that would include the split row is refused, as a whole (R6).
      const heads = await rest(older, 'team_productions?select=id,updated_at');
      expect(heads.status).toBeGreaterThanOrEqual(400);
      expect(heads.text).toContain(REFUSED);
      const token = (await rest(owner, `team_productions?select=updated_at&id=eq.${made.id}`)).text;
      const expected = (JSON.parse(token) as Array<{ updated_at: string }>)[0].updated_at;
      for (const [fn, body] of [
        ['team_production_save', { p_id: made.id, p_expected: expected, p_doc: { name: 'whole', graphics: [], cues: [] } }],
        ['team_production_patch', { p_id: made.id, p_expected: expected, p_ops: [{ m: 'name', set: 'x', u: 'u' }] }],
        // #2615's saves and its read of what changed (0124).
        ['team_production_save_v2', { p_id: made.id, p_expected: expected, p_doc: { name: 'whole', graphics: [], cues: [] } }],
        ['team_production_patch_v2', { p_id: made.id, p_expected: expected, p_ops: [{ m: 'name', set: 'x', u: 'u' }] }],
        ['team_production_changes', { p_id: made.id, p_map: null }],
      ] as const) {
        const answer = await rest(older, `rpc/${fn}`, { method: 'POST', body });
        expect(answer.text, `${fn} from an older page`).toContain(REFUSED);
      }
      // Nor can it write the publication (R7).
      const publish = await rest(older, `control_shows?id=eq.${made.id}`, { method: 'PATCH', body: { title: 'From an older page' } });
      expect(publish.text, 'a publish from an older page').toContain(REFUSED);
      // Nor delete the production or its publication, even signed in as the team's owner (the only
      // account allowed to delete): refused before anything is removed.
      const olderOwner = await open(true);
      await signIn(olderOwner);
      const deleteRecord = await rest(olderOwner, `team_productions?id=eq.${made.id}&select=id`, { method: 'DELETE' });
      expect(deleteRecord.text, 'an older page deleting the split production').toContain(REFUSED);
      const deletePublication = await rest(olderOwner, `control_shows?id=eq.${made.id}&select=id`, { method: 'DELETE' });
      expect(deletePublication.text, 'an older page deleting the publication').toContain(REFUSED);
      expect((await storedRow(owner, made.id)).form, 'the record is still there, split').toBe(1);
      // A team of the older page's own, with only a whole production: its heads poll (one query
      // across all its teams) still fails while the split sibling exists; by-id reads of the whole
      // production are recorded as the planner answers them (G5 section 8).
      const own = await older.evaluate(async ({ teamName }) => {
        const m = await __noacgImport('/src/model/shows.ts');
        const { createTeam } = await __noacgImport('/src/backend/teams.ts');
        const { moveProductionToTeam } = await __noacgImport('/src/backend/teamProductions.ts');
        const { show } = m.createShowNamedChecked(`Older page's own ${Date.now()}`);
        const { team, error } = await createTeam(teamName, 'Older page');
        if (!team) throw new Error(`team: ${error}`);
        const moved = await moveProductionToTeam(m.loadShows().find((s: { id: string }) => s.id === show.id)!, team.id);
        return { id: show.id as string, teamId: team.id as string, error: moved.error };
      }, { teamName: `${TEAM_NAME()} older designs` });
      ownTeamId = own.teamId;
      expect(own.error, 'the older page made a whole team production of its own').toBeNull();
      const polled = await rest(older, 'team_productions?select=id,updated_at');
      expect(polled.text, "the older page's heads poll, with a whole production of another team in it").toContain(REFUSED);
      const byId = await rest(older, `team_productions?select=id&id=eq.${own.id}`);
      test.info().annotations.push({ type: 'older page by-id read of a whole production beside a split one', description: `${byId.status} ${byId.text.slice(0, 120)}` });
      expect(byId.status === 200 || byId.text.includes(REFUSED), `either read as today or refused with the words: ${byId.status} ${byId.text}`).toBe(true);
      // Its Takes still land (R14): a command row appears for the press.
      const commands = async () => JSON.parse((await rest(owner, `control_events?select=id&show_id=eq.${made.id}`)).text).length as number;
      const sent = await commands();
      await selectCueFor(older, 'Designs A');
      await older.getByTestId('verb-take').click();
      await expect.poll(commands, { timeout: 20_000, message: "the older page's Take reached the output's command log" }).toBeGreaterThan(sent);
      // The record kept every new page's edit.
      expect((await storedRow(owner, made.id)).cues.map((c) => c.values?.f0)).toEqual(expect.arrayContaining(['Both at once A', 'Both at once B']));
    } finally {
      await setSwitch('team_designs', false).catch(() => undefined);
      for (const c of contexts) await c.close().catch(() => undefined);
      if (teamId) await dropDesignTeams(teamId);
      if (ownTeamId) await dropDesignTeams(ownTeamId);
    }
  });
});

// A REFUSED SAVE READS ONLY WHAT CHANGED (#2615, docs/work-specs/live-publishing/evidence/fix-2615.md).
// The real functions of 0124 on the stack, two accounts writing random edits over compare-and-swap,
// and a reader holding older versions. The oracle is G4's own `diff` (src/backend/unitPatch.ts), not
// a copy of the read: each answer, applied to the kept version, is the stored record, and names
// exactly the members and elements `diff` finds changed between the two versions.
test.describe('a refused team save reads only what changed', () => {
  test.skip(!haveCreds || !haveTeammateCreds, 'needs the configured account and its teammate');

  test('random edits by two writers: every read rebuilds the record and names only what changed', async () => {
    test.setTimeout(60_000);
    const client = async (email: string, password: string): Promise<{ sb: SupabaseClient; userId: string }> => {
      // The build mark this build's pages send (src/backend/supabase.ts), so 0115's guard admits the writes.
      const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-noacg-production-copies': '1' } } });
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { sb, userId: data.user.id };
    };
    const [{ sb: anna, userId: annaId }, { sb: ben }] = await Promise.all([client(E2E_EMAIL, E2E_PASSWORD), client(E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD)]);
    const { data: made, error: teamError } = await anna.from('teams').insert({ name: `E2E team 2615 ${Date.now()}` }).select('id, join_code').single();
    expect(teamError).toBeNull();
    const team = made as { id: string; join_code: string };
    const id = crypto.randomUUID();
    try {
      expect((await anna.rpc('team_join', { p_code: team.join_code, p_display_name: 'Anna' })).error).toBeNull();
      expect((await ben.rpc('team_join', { p_code: team.join_code, p_display_name: 'Ben' })).error).toBeNull();
      // A seeded generator (mulberry32), so a failure names a run that can be repeated.
      let seed = 2615;
      const rand = (n: number) => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (((t ^ (t >>> 14)) >>> 0) % n);
      };
      type Doc = Record<string, unknown>;
      const cue = (i: number) => ({ id: `c${i}`, label: `cue ${i}`, values: { n: i } });
      let doc: Doc = {
        name: 'Seed', n: 0, tags: ['a', 'b'],
        cues: [0, 1, 2, 3].map(cue),
        graphics: [{ id: 'g0', name: 'Strap', template: { html: '<p>0</p>' } }, { id: 'g1', name: 'Score', template: { html: '<p>1</p>' } }],
        bindings: [{ key: 'k0', v: 0 }],
        shifty: [{ id: 's0', name: 'x' }],
        empty: [],
      };
      const { data: row, error: insertError } = await anna.from('team_productions').insert({ id, team_id: team.id, doc, updated_by: annaId }).select('updated_at').single();
      expect(insertError).toBeNull();
      let token = (row as { updated_at: string }).updated_at;
      let next = 4;
      // Every kind of edit in turn, its details random.
      const edit = (d: Doc, kind: number): Doc => {
        const out: Doc = { ...d };
        const cues = [...((out.cues as Doc[]) ?? [])];
        switch (kind % 11) {
          case 0: if (cues.length) { const i = rand(cues.length); cues[i] = { ...cues[i], label: `typed ${rand(1000)}` }; } break;
          case 1: cues.splice(rand(cues.length + 1), 0, cue(next++)); break;
          case 2: if (cues.length > 1) cues.splice(rand(cues.length), 1); break;
          case 3: if (cues.length > 1) { const [m] = cues.splice(rand(cues.length), 1); cues.splice(rand(cues.length + 1), 0, m); } break;
          case 4: { const which = rand(2); out.graphics = (out.graphics as Doc[]).map((g, i) => (i === which ? { ...g, template: { html: `<p>${rand(1000)}</p>` } } : g)); break; }
          case 5: out.n = rand(1000); break;
          case 6: if ('tags' in out) delete out.tags; else out.tags = ['c']; break;
          case 7: out.shifty = rand(2) ? [{ id: 's0', name: 'x' }] : [{ id: 's0', name: 'y' }, { id: 's0', name: 'z' }]; break;
          case 8: out.empty = rand(2) ? [] : [{ key: 'e0' }]; break;
          case 9: cues[cues.length - 1] = { ...cues[cues.length - 1], label: `last ${rand(1000)}` }; break;
          default: out.bindings = [{ key: `k${rand(3)}`, v: rand(5) }]; break;
        }
        out.cues = cues;
        return out;
      };
      const stored = async (): Promise<{ doc: Doc; at: string }> => {
        const { data, error } = await anna.from('team_productions').select('doc, updated_at').eq('id', id).single();
        expect(error).toBeNull();
        return { doc: (data as { doc: Doc }).doc, at: (data as { updated_at: string }).updated_at };
      };
      // The reader keeps versions read through the real function, and checks each next read against G4's diff.
      let kept: { doc: Doc; map: UnitMap } = { doc: {}, map: {} };
      let refused = 0, reads = 0;
      const read = async () => {
        const before = kept;
        const { data, error } = await ben.rpc('team_production_changes', { p_id: id, p_map: { f: 's1', m: before.map } });
        expect(error).toBeNull();
        const answer = data as { updated_at: string; ops: PatchOp[] };
        const now = await stored();
        expect(answer.updated_at, 'the stored record did not move during the read').toBe(now.at);
        const rebuilt = applyPatch(before.doc, answer.ops);
        expect(canonicalJson(rebuilt), 'the answer on the kept version is the stored record').toBe(canonicalJson(now.doc));
        const named = (ops: PatchOp[]) => ops.map((op) => ('put' in op
          ? `${op.m}:${op.put.map((p) => (p.v as Doc)[op.by]).join(',')}:-${op.del.join(',')}`
          : 'drop' in op ? `${op.m}:drop` : `${op.m}:set`)).sort();
        const expected = (await diff(Object.keys(before.doc).length ? await unitMap(before.doc) : null, now.doc)).ops;
        expect(named(answer.ops), 'the answer names exactly what changed').toEqual(named(expected));
        kept = { doc: rebuilt, map: applyToMap(before.map, answer.ops, rebuilt) };
        reads++;
      };
      await read();
      for (let step = 0; step < 66; step++) {
        const writer = step % 3 === 0 ? ben : anna;
        // Sometimes a writer saves on a stale token: the refusal must carry no document.
        const stale = rand(4) === 0;
        doc = edit(doc, step);
        const { data, error } = await writer.rpc('team_production_save_v2', { p_id: id, p_expected: stale ? '2000-01-01T00:00:00Z' : token, p_doc: doc });
        expect(error).toBeNull();
        const answer = data as { saved: boolean; updated_at: string; rev: number; doc?: unknown };
        if (answer.saved) token = answer.updated_at;
        else {
          refused++;
          expect(answer.doc, 'a refusal carries no document').toBeUndefined();
          expect(JSON.stringify(answer).length).toBeLessThan(1024);
          expect(answer.updated_at).toBe(token);
          doc = (await stored()).doc;
        }
        if (rand(2) === 0) await read();
      }
      await read();
      expect(refused).toBeGreaterThan(3);
      expect(reads).toBeGreaterThan(8);
    } finally {
      await anna.from('team_productions').delete().eq('id', id);
      await anna.from('teams').delete().eq('id', team.id);
    }
  });
});
