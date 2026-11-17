// PHASE 9 CLOUD, checklist step 9 on hosted staging (not for main): five people, each a staging test
// account in its own browser context, one team production, switches as production has them today
// (auto_publish and partial_writes off, production_copies on). One reload, one 20 s offline.
import { test } from '@playwright/test';
import { log, run, setSwitch, setUp, tearDown, type Scene } from '../configured/_five';
import { admitStaging, emit, probe, ranOf, readSwitches, restoreSwitches, settle, SHARD1, shot, signInOwner, states, stats } from './_p9';

test.describe.configure({ retries: 0 });

if (!SHARD1) test('idle shard', () => {});
else
  test('step 9: five people, ten minutes', async ({ page, browser }) => {
    const ms = Number(process.env.P9_MS ?? 600_000);
    test.setTimeout(ms + 12 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    try {
      await signInOwner(page);
      emit('states', await states(page));
      await setSwitch('auto_publish', false);
      await setSwitch('partial_writes', false);
      await setSwitch('production_copies', true);
      scene = await setUp(browser, page, 5);
      const report = await run(scene, { ms, reloadAt: 0.4, offlineAt: 0.6, offlineMs: 20_000 });
      log('run over; settling');
      const atEnd = await probe(scene);
      for (const [i, p] of scene.people.entries()) await shot(p.page, `step9-person${i}-${p.role}`);
      await shot(scene.output, 'step9-output');
      const settled = await settle(scene, report, 120_000, false);
      const lost = report.takes.filter((t) => t.ranAt === null).length;
      emit('step9-soak', {
        ms, pages: 5, takes: report.takes.length, lost, pressToRan: stats(ranOf(report)), goals: report.goals, score: settled.score,
        messages: report.messages.length, prepared: report.messages.filter((m) => m.prepared).length, messageErrors: report.messages.filter((m) => m.error).map((m) => m.error),
        reloads: report.reloads, offline: report.offline, errors: report.errors, settled, atEnd, afterSettle: await probe(scene),
      });
    } finally {
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
