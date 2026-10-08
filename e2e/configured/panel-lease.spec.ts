// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend holds a lease.
//
// THE PANEL LEASE ON TWO PRODUCTION PAGES (docs/work-specs/panel-ownership-lease/spec.md AC-2,
// AC-3, AC-4): the page that answers keeps the panel through a reload of its tab, under the same
// page id and claim; a second production page opened beside it takes nothing and says who has it;
// once the first is closed, its lease lapses and the second takes the panel by itself. The server
// rules are panel-relay.spec.ts; Use here and the hosted page are panel-page.spec.ts and
// panel-production-page.spec.ts. A hidden or covered tab (AC-6) cannot be made here: Playwright
// pages are never hidden.
// covers: src/components/control/PanelControl.tsx, src/control/panelRelay.ts, src/control/workerTicker.ts

import { test, expect } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, pairPanel, publishTwoCues, shutStatusPanel } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

test('a reload keeps the panel, a second production page never takes it, and takes over once the first is gone', async ({ page, context }) => {
  test.setTimeout(300_000);
  await publishTwoCues(page, `Panel Lease ${Date.now()}`);
  const first = page;
  await shutStatusPanel(first);
  const deck = await pairPanel(first);
  await answerPanel(first);
  await first.getByTestId('panel-close').click();
  await deck.hello();
  const before = await deck.state((s) => s.where === 'production');
  const firstPage = before.page;

  // AC-3: a reload of the answering tab keeps the panel, under the same page id; no gap lets
  // another page in.
  await first.reload();
  await expect(first.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(first.getByTestId('panel-header-status')).toHaveText('Panel ✓', { timeout: 15_000 });
  await deck.hello();
  const reloaded = await deck.state((s) => s.where === 'production' && (s.ver as number) !== (before.ver as number), 'the reloaded page');
  expect(reloaded.page).toBe(firstPage);
  expect(reloaded.claim).toBe(before.claim);

  // AC-2: a second production page opened beside it takes nothing, and says who has it.
  const second = await context.newPage();
  await second.goto(first.url());
  await expect(second.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(second.getByTestId('panel-header-status')).toHaveText('Panel on Production page', { timeout: 15_000 });
  await expect(second.getByTestId('panel-header-use-here')).toBeVisible();
  await second.waitForTimeout(6_000);
  expect((await deck.state()).page, 'the first page still answers').toBe(firstPage);
  await expect(first.getByTestId('panel-header-status')).toHaveText('Panel ✓');

  // AC-4: the first page closes; its lease lapses within 15 s, and the second takes it by itself.
  await first.close();
  await expect(second.getByTestId('panel-header-status')).toHaveText('Panel ✓', { timeout: 30_000 });
  await deck.hello();
  const taken = await deck.state((s) => s.page !== firstPage, 'the second page answering');
  expect(taken.where).toBe('production');
  expect(Number(taken.claim)).toBeGreaterThan(Number(before.claim));
  await deck.close();
});
