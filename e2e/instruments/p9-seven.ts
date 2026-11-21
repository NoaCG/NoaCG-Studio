// PHASE 9 CLOUD, a report for #2589 on hosted staging (not for main): seven typists (ten pages:
// taker, messages, quick, seven editors) on one team production, both switches on as in phase 8's
// ten-page runs. One reload, one 20 s offline. Each editor's own page probed at the end and after settling.
import { test } from '@playwright/test';
import { log, run, setSwitch, setUp, tearDown, type Scene } from '../configured/_five';
import { admitStaging, emit, probe, ranOf, readSwitches, restoreSwitches, settle, SHARD1, ownerStates, states, stats } from './_p9';

test.describe.configure({ retries: 0 });

if (!SHARD1) test('idle shard', () => {});
else
  test('seven typists', async ({ page, browser }) => {
    const ms = Number(process.env.P9_MS ?? 480_000);
    test.setTimeout(ms + 13 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    try {
      const st = await ownerStates(browser);
      emit('states', st);
      const installed = (st.auto as { installed?: boolean })?.installed === true && (st.partial as { installed?: boolean })?.installed === true;
      if (!installed) throw new Error(`switches not installed on staging: ${JSON.stringify(st)}`);
      await setSwitch('production_copies', true);
      await setSwitch('partial_writes', true);
      await setSwitch('auto_publish', true);
      emit('states-on', await ownerStates(browser));
      scene = await setUp(browser, page, 10);
      const report = await run(scene, { ms, reloadAt: 0.4, offlineAt: 0.6, offlineMs: 20_000 });
      log('run over; settling');
      const atEnd = await probe(scene);
      const settled = await settle(scene, report, 120_000, true);
      const lost = report.takes.filter((t) => t.ranAt === null).length;
      emit('seven', {
        ms, pages: 10, takes: report.takes.length, lost, pressToRan: stats(ranOf(report)), goals: report.goals, score: settled.score,
        messages: report.messages.length, prepared: report.messages.filter((m) => m.prepared).length,
        reloads: report.reloads, offline: report.offline, errors: report.errors, settled, atEnd, afterSettle: await probe(scene),
      });
    } finally {
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
