// covers: none - disposable ninth independent leave-editor check (Phase 2, check 9); never land
//
// Repair-9 (#1455) across two DEVICES on a real local Supabase stack, two browser contexts, one
// throwaway account per case:
//
//   - S-concurrent: one SAVED graphic edited and saved on both devices at once. Repair-9 discloses
//     that the device whose Save loses the sync conflict now has its draft unlinked. What does the
//     person at that device see, after a Save that said "Saved"? Two orders: they leave for Home
//     at once (the pass lands at Home), or they stay in the editor until it lands.
//   - R-departure: the cloud copy of the working slot still carries device A's reservation (the
//     repair's departure from the owner's wording). Device B pulls it, reloads, signs out and in,
//     edits and first-saves; then an older build's slot naming A's record with a mint mark and
//     exactly that record's source arrives through the cloud, and B reloads onto it.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { SUPABASE_URL, SERVICE_ROLE_KEY, signInOnHome, settleSync, mintAccount, deleteAccountByEmail } from './_helpers';
import { open, draw, source, ready } from '../_layerProperty';
import { settleDurableWrites } from '../_durable';

const PASSWORD = 'noacg-e2e-local-pw';
const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const flush = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
const slot = (page: Page) => page.evaluate(async () => JSON.parse((await import('/src/model/durableStore.ts')).durable.getItem('spx-gfx-project') ?? 'null'));
const syncPhase = (page: Page) => page.evaluate(async () => (await import('/src/backend/syncController.ts')).getSyncState().phase);
const ownList = (page: Page) => page.evaluate(() => localStorage.getItem('spx-gfx-reservations'));
const unnamed = (t: unknown) => { const { html, css, js } = t as { html: string; css: string; js: string }; return { html, css, js }; };
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const dialog = (page: Page) => page.getByTestId('confirm-switch');

function cloudOf(admin: SupabaseClient, userId: string) {
  return {
    graphics: async () => {
      const { data, error } = await admin.from('documents').select('id,body,deleted').eq('user_id', userId).eq('kind', 'graphic');
      expect(error).toBeNull();
      return (data ?? []).filter(r => !r.deleted) as { id: string; body: { name: string; template: unknown } }[];
    },
    slot: async () => {
      const { data } = await admin.from('documents').select('id,body').eq('user_id', userId).eq('kind', 'project');
      return (data?.[0] ?? null) as { id: string; body: Record<string, unknown> } | null;
    },
  };
}
async function device(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signInOnHome(page, email, PASSWORD);
  return page;
}
async function leaveSaving(page: Page, name: string) {
  await page.getByTestId('open-home').click();
  await expect(dialog(page).or(page.getByTestId('home-page')).first()).toBeVisible();
  const asked = await dialog(page).count();
  if (asked) {
    await page.getByTestId('switch-save').click();
    await expect(page.getByTestId('save-name').or(page.getByTestId('home-page')).first()).toBeVisible();
  }
  const named = await page.getByTestId('save-name').count();
  if (named) { await page.getByTestId('save-name').fill(name); await page.getByTestId('save-confirm').click(); }
  await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page);
  return { asked, named };
}
/** Open a saved graphic from Home's library in the editor, as a person would. */
async function openSaved(page: Page, name: string) {
  if (!(await page.getByTestId('home-page').count())) { await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible(); }
  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.lib-row', { hasText: name }).first().getByTestId('open-graphic').click();
  await page.getByTestId('control-open-editor').click(); await ready(page);
}
async function topbarSave(page: Page) {
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-name').or(page.getByTestId('save-status').filter({ hasText: /^Saved$/ })).first()).toBeVisible();
  return page.getByTestId('save-name').count();
}
/** Home's + New graphic: whether it asked, and what. Cancel keeps everything as it was. */
async function newFromHome(page: Page) {
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard').or(dialog(page)).first()).toBeVisible();
  const asked = await dialog(page).count();
  const text = asked ? await dialog(page).innerText() : null;
  if (asked) { await page.screenshot({ path: test.info().outputPath('new-asks.png') }); await page.getByTestId('switch-cancel').click(); await expect(dialog(page)).toHaveCount(0); }
  else { await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible(); }
  return { asked, text };
}

for (const order of ['leaves at once', 'stays in the editor'] as const) {
  test(`ninth S-concurrent (${order}): one saved graphic edited and saved on two devices; device B's Save loses the sync conflict`, async ({ browser }) => {
    test.setTimeout(360_000);
    expect(new URL(SUPABASE_URL).hostname).toBe('127.0.0.1');
    const email = `ninth-s-${order === 'leaves at once' ? 'leave' : 'stay'}@noacg.local`;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const userId = await mintAccount(admin, email, PASSWORD);
    const cloud = cloudOf(admin, userId);
    const facts: Record<string, unknown> = { order };
    try {
      // Device A makes and saves "Gamma".
      const a = await device(browser, email);
      await open(a); await draw(a, .3); await flush(a);
      facts.aFirst = await leaveSaving(a, 'Ninth S Gamma');
      await settleSync(a);
      const gamma = (await library(a)).find(g => g.name === 'Ninth S Gamma')!;
      await expect.poll(async () => (await cloud.graphics()).some(g => g.id === gamma.id), { timeout: 60_000 }).toBe(true);
      // Device B signs in and opens Gamma; both devices edit it.
      const b = await device(browser, email);
      await openSaved(b, 'Ninth S Gamma');
      facts.bLinkOpened = await link(b);
      expect(facts.bLinkOpened, 'precondition: B opened Gamma').toMatchObject({ graphicId: gamma.id });
      await draw(b, .55); await flush(b); await settleDurableWrites(b);
      // B's pass after its edit has run (its slot reached the cloud): B's next pass is its Save's.
      const bEdited = await source(b);
      await expect.poll(async () => same(unnamed((await cloud.slot())?.body.template), unnamed(bEdited)), { timeout: 60_000 }).toBe(true);
      await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
      await openSaved(a, 'Ninth S Gamma');
      await draw(a, .7); await flush(a);
      facts.aSaveNamed = await topbarSave(a);
      await expect(a.getByTestId('save-status')).toHaveText('Saved');
      await settleDurableWrites(a);
      const aSaved = await source(a);
      await expect.poll(async () => same(unnamed((await cloud.graphics()).find(g => g.id === gamma.id)?.body.template), unnamed(aSaved)), { timeout: 60_000 }).toBe(true);
      const gammaCloudA = (await cloud.graphics()).find(g => g.id === gamma.id)!.body;
      // B saves its edit from the topbar, before its next sync pass.
      const bSaved = await source(b);
      facts.bSaveNamed = await topbarSave(b);
      await expect(b.getByTestId('save-status')).toHaveText('Saved');
      facts.bStatusAtSave = await b.getByTestId('save-status').innerText();
      if (order === 'leaves at once') {
        await b.getByTestId('open-home').click();
        await expect(dialog(b).or(b.getByTestId('home-page')).first()).toBeVisible();
        facts.bLeaveAsked = await dialog(b).count();
        await expect(b.getByTestId('home-page')).toBeVisible();
      }
      // B's pass after the Save meets A's version.
      await expect.poll(async () => (await library(b)).some(g => g.name.includes('(conflicted copy)')), { timeout: 60_000 }).toBe(true);
      await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
      Object.assign(facts, { bLinkAfterPass: await link(b), bLibrary: (await library(b)).map(g => ({ id: g.id, name: g.name })) });
      if (order === 'stays in the editor') {
        facts.bStatusAfterPass = await b.getByTestId('save-status').innerText();
        await b.screenshot({ path: test.info().outputPath('b-editor-after-pass.png') });
        await b.getByTestId('open-home').click();
        await expect(dialog(b).or(b.getByTestId('home-page')).first()).toBeVisible();
        facts.bLeaveAsked = await dialog(b).count();
        facts.bLeaveText = facts.bLeaveAsked ? await dialog(b).innerText() : null;
        if (facts.bLeaveAsked) { await b.screenshot({ path: test.info().outputPath('b-leave-asks.png') }); await b.getByTestId('switch-cancel').click(); }
      } else {
        facts.bNew = await newFromHome(b);
        await settleDurableWrites(b); await b.reload();
        await expect(b.getByTestId('home-page').or(b.getByTestId('editor-foundation')).first()).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
        facts.bNewAfterReload = await newFromHome(b);
        // What answering it with "Save first…" does.
        if ((facts.bNewAfterReload as { asked: number }).asked) {
          await b.locator('[data-door="new-graphic"]').click();
          await expect(dialog(b)).toBeVisible();
          await b.getByTestId('switch-save').click();
          await expect(b.getByTestId('save-name').or(b.getByTestId('creation-wizard')).first()).toBeVisible();
          const named = await b.getByTestId('save-name').count();
          if (named) { await b.getByTestId('save-name').fill('Ninth S Gamma from B'); await b.getByTestId('save-confirm').click(); }
          await expect(b.getByTestId('creation-wizard')).toBeVisible();
          await settleDurableWrites(b);
          facts.bAnsweredSave = { named, library: (await library(b)).map(g => ({ id: g.id, name: g.name })) };
        }
      }
      // Both settle with the cloud.
      await a.reload(); await expect(a.getByTestId('home-page').or(a.getByTestId('editor-foundation')).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => syncPhase(a), { timeout: 30_000 }).toBe('synced');
      const final = await cloud.graphics();
      const gammaFinal = final.find(g => g.id === gamma.id);
      const bRecord = final.find(g => g.id !== gamma.id && same(unnamed(g.body.template), unnamed(bSaved)));
      Object.assign(facts, {
        cloudFinal: final.map(g => ({ id: g.id, name: g.body.name })),
        gammaHoldsA: !!gammaFinal && same(gammaFinal.body.template, gammaCloudA.template),
        bRecord: bRecord ? { id: bRecord.id, name: bRecord.body.name } : null,
      });
      writeFileSync(test.info().outputPath('s-concurrent.json'), JSON.stringify(facts, null, 2));
      expect(facts.bSaveNamed, 'B\'s Save of the linked graphic asked for a name').toBe(0);
      expect(facts.gammaHoldsA, 'A\'s saved edit was lost from Gamma').toBe(true);
      expect(facts.bRecord, 'B\'s saved edit is in no record').toBeTruthy();
      expect(facts.bLinkAfterPass, 'B stayed linked to the version A saved').not.toMatchObject({ graphicId: gamma.id, dirty: false });
      if (order === 'leaves at once') {
        expect(facts.bLeaveAsked, 'Home asked after a Save that said Saved').toBe(0);
        expect((facts.bNew as { asked: number }).asked, 'New from Home asked about the graphic B just saved').toBe(0);
        expect((facts.bNewAfterReload as { asked: number }).asked, 'after a reload, New from Home asked about the graphic B just saved').toBe(0);
      } else {
        expect(facts.bLeaveAsked, 'Home asked about the graphic B just saved').toBe(0);
      }
    } finally {
      writeFileSync(test.info().outputPath('s-concurrent-facts.json'), JSON.stringify(facts, null, 2));
      await deleteAccountByEmail(admin, email).catch(() => {});
    }
  });
}

test('ninth R-departure: B pulls A\'s reservation as data, reloads, signs out and in, edits and first-saves; then an older build\'s marked slot naming A\'s record arrives', async ({ browser }) => {
  test.setTimeout(360_000);
  expect(new URL(SUPABASE_URL).hostname).toBe('127.0.0.1');
  const email = 'ninth-r@noacg.local';
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = await mintAccount(admin, email, PASSWORD);
  const cloud = cloudOf(admin, userId);
  const facts: Record<string, unknown> = {};
  const bootB = async (b: Page, url: string, label: string) => {
    await b.goto(url); await b.reload();
    await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
    facts[label] = { link: await link(b), slotReservation: (await slot(b))?.reservedGraphicId ?? null };
  };
  try {
    const a = await device(browser, email);
    await open(a); await draw(a, .3); await flush(a); await settleDurableWrites(a);
    const reserved = (await slot(a)).reservedGraphicId as string;
    const editorUrl = a.url();
    await expect.poll(async () => (await cloud.slot())?.body.reservedGraphicId, { timeout: 60_000 }).toBe(reserved);
    facts.cloudSlotCarriesAReservation = true;
    const b = await device(browser, email);
    await expect.poll(async () => (await slot(b))?.reservedGraphicId, { timeout: 60_000 }).toBe(reserved);
    facts.bOwnListAfterPull = await ownList(b);
    await bootB(b, editorUrl, 'bBoot1');
    await bootB(b, editorUrl, 'bBoot2');
    // Sign out and back in on B.
    await b.goto('/app#/home'); await expect(b.getByTestId('home-page')).toBeVisible();
    await b.getByTestId('account-button').click(); await b.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(b.getByTestId('auth-state')).toHaveText('Not signed in', { timeout: 30_000 });
    await signInOnHome(b, email, PASSWORD);
    await bootB(b, editorUrl, 'bAfterSignIn');
    // Signing out revokes the account's sessions everywhere, device A's included: A signs back in.
    await a.goto('/app#/home'); await a.reload();
    await expect(a.getByTestId('auth-state')).toHaveText('Not signed in', { timeout: 60_000 });
    await signInOnHome(a, email, PASSWORD);
    await a.goto(editorUrl); await expect(a.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    facts.aAfterSignIn = { slotReservation: (await slot(a)).reservedGraphicId, ownListHasIt: (await ownList(a) ?? '').includes(reserved) };
    facts.bOwnListAfterSignIn = await ownList(b);
    // B edits: its first write names a reservation of its own.
    await draw(b, .5); await flush(b); await settleDurableWrites(b);
    facts.bReservationAfterEdit = (await slot(b)).reservedGraphicId;
    // A first-saves its draft as "Alpha"; it reaches the cloud.
    await draw(a, .62); await flush(a);
    facts.aLeave = await leaveSaving(a, 'Ninth R Alpha');
    await settleSync(a);
    const alpha = (await library(a)).find(g => g.name === 'Ninth R Alpha')!;
    facts.alphaIsReserved = alpha.id === reserved;
    await expect.poll(async () => (await cloud.graphics()).some(g => g.id === alpha.id), { timeout: 60_000 }).toBe(true);
    const alphaCloud = (await cloud.graphics()).find(g => g.id === alpha.id)!.body;
    // B leaves and saves its draft.
    facts.bLeave = await leaveSaving(b, 'Ninth R Beta');
    const beta = (await library(b)).find(g => g.name === 'Ninth R Beta');
    facts.betaId = beta?.id ?? null;
    await settleSync(b);
    // An older build's slot naming Alpha, marked as minting it, holding exactly Alpha's source,
    // arrives through the cloud (newer than every device's slot).
    const row = (await cloud.slot())!;
    const at = new Date(Date.now() + 5_000).toISOString();
    const older = { ...row.body, updatedAt: at, template: alpha.template, baseline: alpha.template, graphicId: null, dirty: true, reservedGraphicId: alpha.id, mintingReserved: true };
    const { error } = await admin.from('documents').update({ body: older }).eq('id', row.id);
    expect(error).toBeNull();
    await b.goto('/app#/home'); await b.reload(); await expect(b.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await slot(b))?.updatedAt, { timeout: 60_000 }).toBe(at);
    facts.bPulledOlder = { reservedGraphicId: (await slot(b)).reservedGraphicId, mintingReserved: (await slot(b)).mintingReserved ?? null };
    await bootB(b, editorUrl, 'bOnOlderSlot');
    await draw(b, .4); await flush(b);
    facts.bOlderLeave = await leaveSaving(b, 'Ninth R Beta 2');
    await settleSync(b);
    // A third device with no draft of its own signs in while that slot is the cloud's: only the
    // boot rule stands between it and Alpha (the pull rule keeps nothing there).
    const latest = (await cloud.slot())!;
    const atC = new Date(Date.now() + 5_000).toISOString();
    const { error: errorC } = await admin.from('documents').update({ body: { ...latest.body, updatedAt: atC, template: alpha.template, baseline: alpha.template, graphicId: null, dirty: true, reservedGraphicId: alpha.id, mintingReserved: true } }).eq('id', latest.id);
    expect(errorC).toBeNull();
    const c = await device(browser, email);
    await expect.poll(async () => (await slot(c))?.updatedAt, { timeout: 60_000 }).toBe(atC);
    facts.cPulled = { reservedGraphicId: (await slot(c)).reservedGraphicId, isAlpha: (await slot(c)).reservedGraphicId === alpha.id, mintingReserved: (await slot(c)).mintingReserved ?? null };
    await bootB(c, editorUrl, 'cBoot');
    facts.cLeave = await leaveSaving(c, 'Ninth R Gamma');
    facts.cMinted = (await library(c)).find(g => g.name === 'Ninth R Gamma')?.id ?? null;
    await settleSync(c);
    const final = await cloud.graphics();
    const alphaFinal = final.find(g => g.id === alpha.id);
    Object.assign(facts, { cloudFinal: final.map(g => ({ id: g.id, name: g.body.name })), alphaFinalUnchanged: !!alphaFinal && same(alphaFinal.body.template, alphaCloud.template) });
    writeFileSync(test.info().outputPath('r-departure.json'), JSON.stringify(facts, null, 2));
    expect(facts.cLeave, 'C on the older build\'s marked slot: Home asks, Save asks for a name').toEqual({ asked: 1, named: 1 });
    expect(facts.cMinted, 'C minted Alpha\'s id').not.toBe(alpha.id);
    for (const label of ['bBoot1', 'bBoot2', 'bAfterSignIn', 'bOnOlderSlot', 'cBoot']) expect((facts[label] as { link: { graphicId: string | null } }).link.graphicId, `${label}: B is linked to a record`).toBeNull();
    expect(facts.bOwnListAfterPull ?? '', 'B recorded A\'s reservation as its own').not.toContain(reserved);
    expect(facts.bOwnListAfterSignIn ?? '', 'B recorded A\'s reservation as its own').not.toContain(reserved);
    expect(facts.bReservationAfterEdit, 'B\'s write names A\'s reservation').not.toBe(reserved);
    expect(facts.betaId, 'B minted the id A reserved').not.toBe(alpha.id);
    expect(facts.bLeave, 'B\'s never-saved draft: Home asks, Save asks for a name').toEqual({ asked: 1, named: 1 });
    expect(facts.bOlderLeave, 'B on the older build\'s marked slot: Home asks, Save asks for a name').toEqual({ asked: 1, named: 1 });
    expect(facts.alphaFinalUnchanged, 'Alpha is not what A saved').toBe(true);
  } finally {
    writeFileSync(test.info().outputPath('r-departure-facts.json'), JSON.stringify(facts, null, 2));
    await deleteAccountByEmail(admin, email).catch(() => {});
  }
});
