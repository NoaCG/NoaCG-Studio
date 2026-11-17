// PHASE 9 CLOUD, checklist step 7 on hosted staging (not for main): a team production of 60
// graphics; two operators, each their own staging account, type key by key into different cues
// without pausing while a third takes. Interleaved with the taker alone, switches as production today.
import { test } from '@playwright/test';
import { log, openProduction, run, setSwitch, setUp, tearDown, type Scene } from '../configured/_five';
import { admitStaging, emit, pct, probe, ranOf, readSwitches, restoreSwitches, settle, SHARD1, shot, signInOwner } from './_p9';

test.describe.configure({ retries: 0 });

if (!SHARD1) test('idle shard', () => {});
else
  test('step 7: two typists and a taker on 60 graphics', async ({ page, browser }) => {
    const rounds = Number(process.env.P9_ROUNDS ?? 4);
    const roundMs = 60_000;
    test.setTimeout(rounds * (2 * roundMs + 70_000) + 12 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    const out: Record<string, unknown>[] = [];
    try {
      await signInOwner(page);
      await setSwitch('auto_publish', false);
      await setSwitch('partial_writes', false);
      await setSwitch('production_copies', true);
      // 3 lower thirds to take, 2 to edit, a score and 54 more: 60 graphics.
      scene = await setUp(browser, page, 3, { fill: 54, roles: ['taker', 'editor', 'editor'] });
      emit('step7-scene', { graphics: scene.takes.length + scene.edits.length + 1 + 54 });
      for (let r = 0; r < rounds; r++) {
        const order: ('all' | 'alone')[] = r % 2 === 0 ? ['all', 'alone'] : ['alone', 'all'];
        for (const mode of order) {
          if (mode === 'alone') for (const p of scene.people.slice(1)) await p.page.goto('about:blank');
          else for (const p of scene.people.slice(1)) if (p.page.url() === 'about:blank') await openProduction(p.page, scene.showId);
          const report = await run(scene, { ms: roundMs, everyone: mode === 'all', keys: true, reloadAt: null, offlineAt: null });
          const samples = ranOf(report);
          const entry: Record<string, unknown> = { round: r, mode, samples, lost: report.takes.length - samples.length, errors: report.errors };
          if (mode === 'all') {
            entry.typed = report.edits.map((e) => ({ cue: e.cue, texts: e.typed.length, last: e.typed[e.typed.length - 1] }));
            entry.atEnd = await probe(scene);
            entry.settled = await settle(scene, report, 60_000, false);
            if (r === 0) for (const [i, p] of scene.people.entries()) await shot(p.page, `step7-person${i}-${p.role}`);
          }
          out.push(entry);
          log(`round ${r} ${mode}: n ${samples.length} p95 ${pct(samples, 95)} errors ${report.errors.length}`);
        }
      }
    } finally {
      emit('step7', { rounds: out });
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
