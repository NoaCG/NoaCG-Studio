// PHASE 9 STAGING RERUN (live-publishing run #2361, after #2620 #2624 #2627 #2630 #2646). Not for
// main: runs only through hosted-latency.yml's `spec` dispatch, on the hosted staging project.
import { test, type Browser, type Page } from '@playwright/test';
import { log, openProduction, publishLog, run, setUp, tearDown, type Person, type Scene } from '../configured/_five';
import { admitStaging, emit, ownerStates, pct, probe, ranOf, readSwitches, restoreSwitches, settle, setSwitches, SHARD1, shot, stats, watchStaging } from './_p9';

export type Switches = { auto_publish: boolean; partial_writes: boolean; production_copies: boolean; team_designs: boolean };
export const ON: Switches = { auto_publish: true, partial_writes: true, production_copies: true, team_designs: true };
// Production today: the three new switches off, production_copies on (publish-guard.spec.ts).
export const PROD: Switches = { auto_publish: false, partial_writes: false, production_copies: true, team_designs: false };

/** The soak: `roles` for `ms`, one reload at 40 %, one editor offline 20 s at 60 %. */
export function soak(name: string, roles: Person['role'][], sw: Switches, ms = 600_000) {
  test.describe.configure({ retries: 0 });
  if (!SHARD1) return test('idle shard', () => {});
  test(name, async ({ page, browser }) => {
    test.setTimeout(ms + 14 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    try {
      await setSwitches(sw);
      emit('switches-during', await readSwitches());
      emit('states', await ownerStates(browser));
      scene = await setUp(browser, page, roles.length, { roles });
      emit('publish', publishLog);
      const net = watchStaging(scene.people.map((p) => p.page));
      const report = await run(scene, { ms, reloadAt: 0.4, offlineAt: 0.6, offlineMs: 20_000 });
      const netRun = net();
      log('run over; settling');
      const atEnd = await probe(scene);
      for (const [i, p] of scene.people.entries()) await shot(p.page, `${name}-person${i}-${p.role}`);
      const settled = await settle(scene, report, 120_000, false);
      emit('soak', {
        ms, pages: roles.length, roles, takes: report.takes.length, lost: report.takes.filter((t) => t.ranAt === null).length,
        lostTakes: report.takes.filter((t) => t.ranAt === null), pressToRan: stats(ranOf(report)), goals: report.goals, score: settled.score,
        messages: report.messages.length, prepared: report.messages.filter((m) => m.prepared).length, messageErrors: report.messages.filter((m) => m.error).map((m) => m.error),
        edits: report.edits.map((e) => ({ cue: e.cue, by: e.by, texts: e.typed.length, last: e.typed[e.typed.length - 1] })),
        reloads: report.reloads, offline: report.offline, errors: report.errors, settled, atEnd, afterSettle: await probe(scene), staging: netRun, stagingAll: net(),
      });
    } finally {
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
}

/** Interleaved pairs: `roundMs` with everyone working, `roundMs` with the taker alone, order alternating. */
export function pairs(name: string, roles: Person['role'][], sw: Switches, rounds: number, roundMs = 45_000) {
  test.describe.configure({ retries: 0 });
  if (!SHARD1) return test('idle shard', () => {});
  test(name, async ({ page, browser }) => {
    const firstAlone = Number(process.env.GITHUB_RUN_NUMBER ?? 0) % 2 === 1;
    test.setTimeout(rounds * 2 * (roundMs + 15_000) + 8 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    const out: Record<string, unknown>[] = [];
    try {
      await setSwitches(sw);
      emit('switches-during', await readSwitches());
      scene = await setUp(browser, page, roles.length, { roles });
      const takerNet = watchStaging([page]);
      for (let r = 0; r < rounds; r++) {
        const order: ('all' | 'alone')[] = (r % 2 === 0) !== firstAlone ? ['all', 'alone'] : ['alone', 'all'];
        for (const mode of order) {
          if (mode === 'alone') for (const p of scene.people.slice(1)) await p.page.goto('about:blank');
          else for (const p of scene.people.slice(1)) if (p.page.url() === 'about:blank') await openProduction(p.page, scene.showId);
          const net = watchStaging([page]);
          const report = await run(scene, { ms: roundMs, everyone: mode === 'all', reloadAt: null, offlineAt: null });
          const samples = ranOf(report);
          out.push({ round: r, mode, samples, lost: report.takes.length - samples.length, errors: report.errors, staging: net().all });
          log(`round ${r} ${mode}: n ${samples.length} p95 ${pct(samples, 95)} errors ${report.errors.length}`);
        }
      }
      emit('taker-staging', takerNet());
    } finally {
      emit('pairs', { pages: roles.length, roles, firstAlone, rounds: out });
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
}

/** Step 7: a 60-graphic production, two typists key by key and a taker; records the publish. */
export function step7(name: string, sw: Switches, rounds = 2, roundMs = 60_000) {
  test.describe.configure({ retries: 0 });
  if (!SHARD1) return test('idle shard', () => {});
  test(name, async ({ page, browser }: { page: Page; browser: Browser }) => {
    test.setTimeout(rounds * (2 * roundMs + 70_000) + 14 * 60_000);
    emit('target', { kind: admitStaging() });
    const before = await readSwitches();
    emit('switches-before', before);
    let scene: Scene | null = null;
    const out: Record<string, unknown>[] = [];
    const t0 = Date.now();
    try {
      await setSwitches(sw);
      emit('switches-during', await readSwitches());
      emit('states', await ownerStates(browser));
      try {
        scene = await setUp(browser, page, 3, { fill: 54, roles: ['taker', 'editor', 'editor'] });
      } finally {
        emit('publish', { attempts: publishLog, setUpMs: Date.now() - t0 });
      }
      const net = watchStaging(scene.people.map((p) => p.page));
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
          }
          out.push(entry);
          log(`round ${r} ${mode}: n ${samples.length} p95 ${pct(samples, 95)} errors ${report.errors.length}`);
        }
      }
      emit('staging', net());
    } finally {
      emit('step7', { rounds: out });
      await tearDown(scene, page).catch(() => undefined);
      emit('switches-after', await restoreSwitches(before));
    }
  });
}
