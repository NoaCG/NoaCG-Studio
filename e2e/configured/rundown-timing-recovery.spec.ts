// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// TIMED CUES ON A PUBLISHED PRODUCTION (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0 and §2.10, phase 2;
// migration 0075). Offline there is one surface and no database, so "exactly once across pages and
// a reload" is a question with no second page to ask it of: the rules are scripts/cue-auto.test.mjs,
// the server's compare-and-set is 0075's self-check, and this walks both pages against a real one.
// covers: src/control/cueArmWire.ts, src/control/cueArmRpc.ts
// covers: supabase/migrations/0075_cue_arms.sql

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Publish nothing behind us: the account is shared by the whole suite (playout-both-roads.spec.ts). */
async function clearPublishedShows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
}

/** Two lower thirds, each with one cue: Anna (to be timed) and Ben, the next graphic cue. */
async function seed(page: Page, name: string): Promise<{ id: string; a: string; b: string }> {
  const seeded = await page.evaluate(async (showName) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { show, error: notCreated } = shows.createShowNamedChecked(showName);
    if (notCreated) throw new Error(notCreated);
    for (const graphicName of ['Guest', 'Host']) {
      const tpl = variantById('lt01')!.create({});
      const { doc, error } = createGraphic(tpl, { name: graphicName });
      if (error) throw new Error(error);
      shows.addGraphicToShow(show.id, { ...tpl, name: graphicName }, { graphicId: doc!.id });
    }
    const rec = shows.loadShows().find((s) => s.id === show.id)!;
    const [guest, host] = rec.graphics;
    const a = rec.cues!.find((c) => c.sourceId === guest.id)!.id;
    const b = rec.cues!.find((c) => c.sourceId === host.id)!.id;
    shows.updateShowCue(show.id, a, { label: 'Anna' });
    shows.updateShowCue(show.id, b, { label: 'Ben' });
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    const { useRouter } = await import('/src/app/router.ts');
    useRouter.getState().navigate({ view: 'production', id: show.id });
    return { id: show.id, a, b };
  }, name);
  await expect(page.getByTestId('production-page')).toBeVisible();
  return seeded;
}

/** A countdown's whole seconds, off a chip that reads `0:05` or `Held 0:05`. */
function seconds(text: string | null): number {
  const m = /(\d+):(\d\d)/.exec(text ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** The log as the server holds it, read on the desk. */
async function logRows(page: Page, slug: string) {
  return page.evaluate(async (s) => {
    const { hostedControlTail } = await import('/src/control/hostedControl.ts');
    return (await hostedControlTail(s, 0)).map((r) => ({ graphic: r.graphic, msg: r.msg as { t: string; cue?: string | null; arm?: string } }));
  }, slug);
}

test('a timed cue counts the same second on two pages and a reload, ends once, holds from a phone, and stays missed', async ({ page, context }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);

  const name = `Timed Wire ${Date.now()}`;
  const s = await seed(page, name);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();
  const slugs = await page.evaluate(async (n) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((x) => x.name === n);
    return { hosted: show?.hostedSlug ?? '', output: show?.outputSlug ?? '' };
  }, name);
  expect(slugs.hosted).toBeTruthy();

  const row = (p: Page, cue: string) => p.getByTestId(`cue-${cue}`);
  const deskChip = () => row(page, s.a).getByTestId('cue-auto');

  // ── THE PUBLISHED ENDS PICK: offered, since this server keeps the arms. ─────────────────────────
  await row(page, s.a).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-ends-mode').locator('option[value="after"]')).toHaveJSProperty('disabled', false, { timeout: 30_000 });
  await page.getByTestId('cue-ends-mode').selectOption('after');
  await page.getByTestId('cue-ends-after').fill('12');
  await page.getByTestId('cue-ends-then').selectOption('out-next');
  await expect(deskChip()).toHaveText('0:12 → Out + next');
  // The hosted page reads the cue's end off the payload, which a publish writes.
  await page.getByTestId('production-status').click();
  await expect(links).toBeVisible();
  await expect(page.getByTestId('publish-freshness')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('prepare-for-live-button').click();
  await expect(page.getByTestId('publish-freshness')).toBeHidden({ timeout: 60_000 });
  await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();

  // ── The other seats: air, and the capability URL on a phone. ────────────────────────────────
  const air = await context.newPage();
  await air.goto(`/output?production=${encodeURIComponent(slugs.output)}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });
  const op = await context.newPage();
  await op.goto(`/app?control=${encodeURIComponent(slugs.hosted)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  const opChip = () => op.getByTestId(`hosted-cue-${s.a}`).getByTestId('cue-auto');
  const airPlays = () => air.evaluate(() => Number(document.body.getAttribute('data-plays') ?? '0'));

  // ── 1. Taken on the desk: both pages count the same second, from when air had it. ─────────────
  await row(page, s.a).getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(deskChip()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
  await expect(opChip()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
  await expect(row(page, s.b).getByTestId('cue-armed')).toBeVisible();
  const desk1 = seconds(await deskChip().textContent());
  const op1 = seconds(await opChip().textContent());
  expect(Math.abs(desk1 - op1), `desk ${desk1} s, phone ${op1} s`).toBeLessThanOrEqual(1);
  await expect.poll(airPlays, { timeout: 30_000 }).toBeGreaterThan(0);
  const playsBefore = await airPlays();

  // ── 2. The desk reloads mid-countdown and picks up the same count. ──────────────────────────────
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(deskChip()).toHaveAttribute('data-phase', 'running', { timeout: 30_000 });
  const afterReload = seconds(await deskChip().textContent());
  const opNow = seconds(await opChip().textContent());
  expect(Math.abs(afterReload - opNow), `reloaded desk ${afterReload} s, phone ${opNow} s`).toBeLessThanOrEqual(1);

  // ── 3. At zero, with both pages open to race: one fire, one Out, one Take. ──────────────────────
  await expect(row(page, s.b).locator('.pd-tag.air')).toBeVisible({ timeout: 30_000 });
  await expect(op.getByTestId(`hosted-cue-${s.b}`).locator('.pd-tag.air')).toBeVisible({ timeout: 30_000 });
  await expect(row(page, s.a).locator('.pd-tag.air')).toHaveCount(0);
  await page.waitForTimeout(3_000); // anything that would fire twice has had its chance
  const rows = await logRows(page, slugs.hosted);
  const fireAt = rows.findIndex((r) => r.msg.arm === 'fire');
  expect(rows.filter((r) => r.msg.arm === 'fire')).toHaveLength(1);
  const after = rows.slice(fireAt + 1);
  const guest = rows.find((r) => r.msg.t === 'cue' && r.msg.cue === s.a)!.graphic;
  const host = rows.find((r) => r.msg.t === 'cue' && r.msg.cue === s.b)!.graphic;
  expect(after.filter((r) => r.graphic === guest && r.msg.t === 'stop')).toHaveLength(1);
  expect(after.filter((r) => r.graphic === host && r.msg.t === 'play')).toHaveLength(1);
  await expect.poll(airPlays, { timeout: 30_000 }).toBe(playsBefore + 1);
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Auto Out and next cue sent' })).toHaveCount(1);

  // ── 4. A hold pressed on the phone freezes the count on the desk; resume counts on. ─────────────
  await row(page, s.a).getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(deskChip()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
  await expect(op.getByTestId('program-auto')).toBeVisible({ timeout: 10_000 });
  await op.getByTestId('program-auto-hold').click();
  await expect(deskChip()).toHaveAttribute('data-phase', 'held', { timeout: 10_000 });
  const held = seconds(await deskChip().textContent());
  await page.waitForTimeout(3_000);
  expect(seconds(await deskChip().textContent())).toBe(held);
  await op.getByTestId('program-auto-hold').click();
  await expect(deskChip()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
  // Manual from the desk: the cue stays on air for good, on both pages.
  await page.getByTestId('program-auto-manual').click();
  await expect(op.getByTestId('program-auto')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('program-auto')).toHaveCount(0);
  await expect(row(page, s.a).locator('.pd-tag.air')).toBeVisible();

  // ── 5. Nobody there at zero: Missed, on a page opened afterwards and after its reload. ──────────
  // A re-take changes nothing the renderer reports, so this one counts from the Take itself once
  // 3 s have passed with no covering report (the anchor's fallback, plan §2.0).
  await page.getByTestId('cue-ends-after').fill('6');
  await expect(deskChip()).toHaveText(/0:06 → Out \+ next/);
  await page.getByTestId('verb-retake').click();
  await expect(deskChip()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
  await op.close();
  const prod = page.url();
  await page.goto('about:blank');
  await air.waitForTimeout(12_000); // the deadline and the 5 s after it pass with no operator page
  await page.goto(prod);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(deskChip()).toHaveAttribute('data-phase', 'missed', { timeout: 30_000 });
  await expect(deskChip()).toContainText('was due');
  await page.reload();
  await expect(deskChip()).toHaveAttribute('data-phase', 'missed', { timeout: 30_000 });
  const final = await logRows(page, slugs.hosted);
  expect(final.filter((r) => r.msg.arm === 'fire')).toHaveLength(1);
  expect(final.filter((r) => r.msg.arm === 'late')).toHaveLength(1);
  await expect(row(page, s.a).locator('.pd-tag.air')).toBeVisible();

  await air.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
