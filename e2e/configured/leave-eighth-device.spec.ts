// covers: none - disposable eighth independent leave-editor check (Phase 2, check 8); never land
//
// The reservation across two DEVICES. The working slot syncs as a per-account singleton
// (backend/storage.ts SINGLETON_KINDS), so a second device signed into the same account boots the
// first device's never-saved draft, with its reserved record id. Repair-8's rule 1 drops a
// reserved id only when THIS browser's library already holds it, and a device learns of another
// device's record only on its next sync pass (its own change, focus, online or a boot), so its
// first Save can mint the very id the first device minted. A real local Supabase stack, two
// browser contexts (two devices), one throwaway account.
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { SUPABASE_URL, SERVICE_ROLE_KEY, signInOnHome, settleSync, mintAccount, deleteAccountByEmail } from './_helpers';
import { open, draw, source } from '../_layerProperty';
import { settleDurableWrites } from '../_durable';

const EMAIL = 'eighth-device@noacg.local', PASSWORD = 'noacg-e2e-local-pw';
const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const flush = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
const slot = (page: Page) => page.evaluate(async () => JSON.parse((await import('/src/model/durableStore.ts')).durable.getItem('spx-gfx-project') ?? 'null'));
const syncPhase = (page: Page) => page.evaluate(async () => (await import('/src/backend/syncController.ts')).getSyncState().phase);
const unnamed = (t: unknown) => ({ ...(t as object), name: '' });
// Key order aside: a body that went through the cloud comes back from jsonb with its keys reordered.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const dialog = (page: Page) => page.getByTestId('confirm-switch');

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

test('eighth X-device: device B boots device A\'s never-saved draft from the synced slot; A first-saves it; B, which has not synced since, first-saves its draft', async ({ browser }) => {
  test.setTimeout(300_000);
  expect(new URL(SUPABASE_URL).hostname).toBe('127.0.0.1');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = await mintAccount(admin, EMAIL, PASSWORD);
  const cloudGraphics = async () => {
    const { data, error } = await admin.from('documents').select('id,body,deleted').eq('user_id', userId).eq('kind', 'graphic');
    expect(error).toBeNull();
    return (data ?? []).filter(r => !r.deleted) as { id: string; body: { name: string; template: unknown } }[];
  };
  const cloudSlot = async () => {
    const { data } = await admin.from('documents').select('body').eq('user_id', userId).eq('kind', 'project');
    return (data?.[0]?.body ?? null) as { reservedGraphicId?: string; template?: unknown } | null;
  };
  const facts: Record<string, unknown> = {};
  try {
    // Device A: a never-saved edited draft; its slot reaches the cloud.
    const a = await (await browser.newContext()).newPage();
    await signInOnHome(a, EMAIL, PASSWORD);
    await open(a); await draw(a, .3); await flush(a); await settleDurableWrites(a);
    const reserved = (await slot(a)).reservedGraphicId as string;
    const draft = await source(a);
    await expect.poll(async () => (await cloudSlot())?.reservedGraphicId, { timeout: 60_000 }).toBe(reserved);
    const editorUrl = a.url();
    // Device B signs in, then opens the editor: it continues A's draft from the synced slot.
    const b = await (await browser.newContext()).newPage();
    await signInOnHome(b, EMAIL, PASSWORD);
    await expect.poll(async () => (await slot(b))?.reservedGraphicId, { timeout: 60_000 }).toBe(reserved);
    await b.goto(editorUrl); await b.reload();
    await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
    Object.assign(facts, { reserved, bBootedADraft: same(await source(b), draft), bLinkAtBoot: await link(b) });
    expect(facts.bBootedADraft, 'precondition: device B did not continue A\'s draft').toBe(true);
    // Device A edits again and first-saves it as "Alpha"; the record reaches the cloud.
    await draw(a, .62); await flush(a); await settleDurableWrites(a);
    facts.aLeave = await leaveSaving(a, 'Eighth X Alpha');
    await settleSync(a);
    const alpha = (await library(a)).find(g => g.name === 'Eighth X Alpha')!;
    await expect.poll(async () => (await cloudGraphics()).some(g => g.id === alpha.id), { timeout: 60_000 }).toBe(true);
    const alphaCloud = (await cloudGraphics()).find(g => g.id === alpha.id)!.body;
    Object.assign(facts, { alphaId: alpha.id, alphaIsReserved: alpha.id === reserved, bLibraryHasAlpha: (await library(b)).some(g => g.id === alpha.id) });
    // Device B, untouched since its boot pass, leaves its never-saved draft and saves it.
    const bSource = await source(b); facts.bSourceLayers = (bSource.html.match(/class="/g) ?? []).length;
    facts.bLeave = await leaveSaving(b, 'Eighth X Beta');
    const bMinted = (await library(b)).find(g => g.name === 'Eighth X Beta');
    Object.assign(facts, { bMintedId: bMinted?.id ?? null, bMintedAlphaId: bMinted?.id === alpha.id });
    await settleSync(b);
    // Both devices settle with the cloud.
    await a.reload(); await expect(a.getByTestId('home-page').or(a.getByTestId('editor-foundation')).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => syncPhase(a), { timeout: 30_000 }).toBe('synced');
    const cloud = await cloudGraphics();
    const alphaNow = cloud.find(g => g.id === alpha.id);
    // B's source as B's Save minted it (the mint prepares the Out step), wherever the sync put it.
    const bRecord = cloud.find(g => g.id !== alpha.id && !!bMinted && same(unnamed(g.body.template), unnamed(bMinted.template)));
    Object.assign(facts, {
      cloud: cloud.map(g => ({ id: g.id, name: g.body.name })),
      alphaCloudUnchanged: !!alphaNow && same(alphaNow.body.template, alphaCloud.template),
      alphaCloudHoldsB: !!alphaNow && same(unnamed(alphaNow.body.template), unnamed(bSource)),
      bRecord: bRecord && { id: bRecord.id, name: bRecord.body.name },
      bLinkAfter: await link(b),
      aLibrary: (await library(a)).map(g => ({ id: g.id, name: g.name })),
    });
    // B goes on working on what its editor calls its saved graphic, and saves.
    await b.goto(editorUrl); await b.reload();
    await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    facts.bLinkReopened = await link(b);
    await draw(b, .45); await flush(b);
    await b.getByTestId('save-graphic').click();
    await expect(b.getByTestId('save-name').or(b.getByTestId('save-status').filter({ hasText: 'Saved' })).first()).toBeVisible();
    facts.bSecondSaveNamed = await b.getByTestId('save-name').count();
    if (facts.bSecondSaveNamed) { await b.getByTestId('save-name').fill('Eighth X Beta 2'); await b.getByTestId('save-confirm').click(); }
    await expect(b.getByTestId('save-status')).toHaveText('Saved');
    await settleDurableWrites(b);
    await expect.poll(() => syncPhase(b), { timeout: 30_000 }).toBe('synced');
    const final = await cloudGraphics();
    const alphaFinal = final.find(g => g.id === alpha.id);
    Object.assign(facts, { cloudFinal: final.map(g => ({ id: g.id, name: g.body.name })), alphaFinalUnchanged: !!alphaFinal && same(alphaFinal.body.template, alphaCloud.template) });
    writeFileSync(test.info().outputPath('x-device.json'), JSON.stringify(facts, null, 2));
    expect(facts.bLibraryHasAlpha, 'precondition: B had already learnt of Alpha').toBe(false);
    expect(facts.bLeave, 'B\'s never-saved draft: Home asks and Save asks for a name').toEqual({ asked: 1, named: 1 });
    expect(facts.bMintedAlphaId, 'device B\'s first Save minted the id of the graphic device A saved').toBe(false);
    expect(facts.alphaCloudUnchanged, 'Alpha in the cloud is not what A saved').toBe(true);
    expect(bRecord, 'B\'s source is in no record of its own').toBeTruthy();
    expect(facts.alphaFinalUnchanged, 'B\'s next Save overwrote the graphic device A saved').toBe(true);
  } finally {
    writeFileSync(test.info().outputPath('x-device-facts.json'), JSON.stringify(facts, null, 2));
    await deleteAccountByEmail(admin, EMAIL).catch(() => {});
  }
});
