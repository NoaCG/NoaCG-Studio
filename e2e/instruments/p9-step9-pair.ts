// PHASE 9 CLOUD, checklist step 9's timing on hosted staging (not for main): press to ran with five
// people working against the taker's page alone, interleaved rounds, switches as production today.
import { test } from '@playwright/test';
import { log, openProduction, run, setSwitch, setUp, tearDown, type Scene } from '../configured/_five';
import { admitStaging, emit, pct, ranOf, readSwitches, restoreSwitches, SHARD1, signInOwner } from './_p9';

test.describe.configure({ retries: 0 });

if (!SHARD1) test('idle shard', () => {});
else
  test('step 9: interleaved pairs', async ({ page, browser }) => {
    const rounds = Number(process.env.P9_ROUNDS ?? 6);
    const roundMs = 45_000;
    // Alternate which side goes first between dispatches.
    const firstAlone = Number(process.env.GITHUB_RUN_NUMBER ?? 0) % 2 === 1;
    test.setTimeout(rounds * 2 * roundMs + 10 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    const out: { round: number; mode: string; samples: number[]; lost: number; errors: string[] }[] = [];
    try {
      await signInOwner(page);
      await setSwitch('auto_publish', false);
      await setSwitch('partial_writes', false);
      await setSwitch('production_copies', true);
      scene = await setUp(browser, page, 5);
      for (let r = 0; r < rounds; r++) {
        const order: ('all' | 'alone')[] = (r % 2 === 0) !== firstAlone ? ['all', 'alone'] : ['alone', 'all'];
        for (const mode of order) {
          if (mode === 'alone') for (const p of scene.people.slice(1)) await p.page.goto('about:blank');
          else for (const p of scene.people.slice(1)) if (p.page.url() === 'about:blank') await openProduction(p.page, scene.showId);
          const report = await run(scene, { ms: roundMs, everyone: mode === 'all', reloadAt: null, offlineAt: null });
          const samples = ranOf(report);
          out.push({ round: r, mode, samples, lost: report.takes.length - samples.length, errors: report.errors });
          log(`round ${r} ${mode}: n ${samples.length} p95 ${pct(samples, 95)} errors ${report.errors.length}`);
        }
      }
    } finally {
      emit('step9-pair', { pages: 5, firstAlone, rounds: out });
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
