import { test } from '@playwright/test';
import { SERVICE_ROLE_KEY } from '../_helpers';
import { closeScene, isLocalStack, lastTexts, log, openProduction, openScene, pageCues, run, serverState, type RunReport, type Scene, type Settled } from '../_five';
import { BUILD, NET, pct, summary, writeResult } from './_measure';

// FIVE PEOPLE AT ONCE, MEASURED (docs/work-specs/live-publishing/spec.md, AC-6). The scene is
// e2e/configured/_five.ts; this file runs it long and times it. Local stack only: the switches and
// the extra accounts are service-role writes.
//
//   soak   MEASURE_PAGES people (default 5) for MEASURE_SOAK_MS (default ten minutes), automatic
//          updates and partial writes on; one editor reloads at 40%, another is offline from 60%
//          for 20 s. Reports every press, the settled server state and each page's own copy, read
//          once everything holds each editor's last text or MEASURE_SETTLE_MS (default 90 s) ends.
//   pair   press to ran with everyone working against the taker's page alone, interleaved:
//          MEASURE_ROUNDS rounds of MEASURE_ROUND_MS each way, the order alternating per round.
//
// Judged by the rule fixed before the runs (coordinator, #2361): no command lost, no different cue
// overwritten, and the pooled p95 of press to ran with five pages within 50 ms of a single page,
// with a bootstrap range over rounds. summarize-five.mjs pools the result files.

test.skip(!process.env.E2E_EMAIL || !SERVICE_ROLE_KEY, 'configured measurement: needs the local stack, its account and its service key');

const PAGES = Number(process.env.MEASURE_PAGES ?? 5);
const PART = process.env.MEASURE_PART ?? '1';
const TAG = `${PAGES}-${NET}${BUILD === 'prod' ? '-prod' : ''}`;

test.beforeAll(() => {
  if (!isLocalStack()) throw new Error('five people writes switches and accounts: run it only against a local stack');
});

// MEASURE_BUILD=prod: the whole scene, set-up included, runs on the bundled build. MEASURE_DIST must be
// the e2e build (`vite build --mode e2e` with VITE_MEASURE_HOOKS=1 and the stack's variables): only
// that mode installs the door (`__noacgImport`) the set-up reaches the app's modules through.
test.beforeEach(async ({ page }) => {
  if (BUILD !== 'prod') return;
  const answer = await page.request.get('/__measure/build?to=prod');
  if ((await answer.text()) !== 'prod') throw new Error('the build switch did not move to prod');
});

let scene: Scene | null = null;
test.afterEach(async ({ page }) => {
  await closeScene(scene, page);
  scene = null;
});

const ran = (r: RunReport) => r.takes.filter((t) => t.ranAt !== null).map((t) => t.ranAt! - t.pressAt);

/** Wait until the server and every page hold each editor's last text, or the time is up. */
async function settle(s: Scene, report: RunReport, timeoutMs = 90_000) {
  const lastOf = lastTexts(report);
  const began = Date.now();
  const end = began + timeoutMs;
  let state!: Settled;
  const pages: Record<string, Record<string, string>> = {};
  const read = async () => {
    const [got, ...each] = await Promise.all([serverState(s), ...s.people.map((p) => pageCues(p.page, s.showId).catch(() => ({})))]);
    state = got;
    s.people.forEach((p, i) => (pages[p.email] = each[i]));
  };
  const ok = () =>
    Object.entries(lastOf).every(([cue, text]) => state.cues[cue] === text && state.published.includes(text) && Object.values(pages).every((c) => c[cue] === text));
  await read();
  while (!ok() && Date.now() < end) {
    await s.people[0].page.waitForTimeout(2_000);
    await read();
  }
  return { state, pages, settledInMs: Math.min(Date.now() - began, timeoutMs), lastOf };
}

/** What each editor's own page holds of its cue: the editor box, the page's record, and the team
 *  save's state (#2589). Read on every editor at once. */
async function probe(s: Scene) {
  return Promise.all(
    s.people
      .filter((p) => p.role === 'editor')
      .map(async (p) => {
        const box = await p.page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').first().inputValue({ timeout: 2_000 }).catch(() => null);
        const state = await p.page
          .evaluate(
            async ({ id, cue }) => {
              const { getTeamState, teamEditOwed } = await __noacgImport('/src/backend/teamProductions.ts');
              const { loadShows } = await __noacgImport('/src/model/shows.ts');
              const team = getTeamState();
              const c = loadShows().find((x) => x.id === id)?.cues?.find((x) => x.label === cue);
              return { record: c ? Object.values(c.values ?? {})[0] ?? '' : null, saving: team.saving[id] ?? null, note: team.notes[id] ?? null, owed: teamEditOwed(id), online: navigator.onLine };
            },
            { id: s.showId, cue: p.cue! },
          )
          .catch((e) => ({ error: String(e).split('\n')[0] }));
        return { email: p.email, cue: p.cue, box, ...state };
      }),
  );
}

test('soak', async ({ page, browser }) => {
  const ms = Number(process.env.MEASURE_SOAK_MS ?? 600_000);
  test.setTimeout(ms + 10 * 60_000);
  scene = await openScene(browser, page, PAGES);
  const report = await run(scene, { ms, reloadAt: 0.4, offlineAt: 0.6, offlineMs: 20_000, messageEveryMs: Number(process.env.MEASURE_MESSAGE_MS ?? 15_000) });
  log('run over; settling');
  const probed = process.env.MEASURE_PROBE ? { atEnd: await probe(scene) } as Record<string, unknown> : null;
  const settled = await settle(scene, report, Number(process.env.MEASURE_SETTLE_MS ?? 90_000));
  if (probed) probed.afterSettle = await probe(scene);
  const lost = report.takes.filter((t) => t.ranAt === null).length;
  writeResult(`five-soak-${TAG}-part${PART}`, {
    pages: PAGES,
    at: new Date().toISOString(),
    report,
    pressToRan: summary(ran(report), lost),
    settled,
    probed,
  });
  log('takes', report.takes.length, 'lost', lost, 'goals', report.goals, 'score', settled.state.score, 'messages', report.messages.length, 'errors', report.errors);
});

test('pair', async ({ page, browser }) => {
  const rounds = Number(process.env.MEASURE_ROUNDS ?? 2);
  const roundMs = Number(process.env.MEASURE_ROUND_MS ?? 45_000);
  const firstAlone = process.env.MEASURE_FIRST === 'alone';
  test.setTimeout(rounds * 2 * roundMs + 10 * 60_000);
  scene = await openScene(browser, page, PAGES);
  const out: { round: number; mode: 'all' | 'alone'; samples: number[]; lost: number; errors: string[] }[] = [];
  for (let r = 0; r < rounds; r++) {
    const order: ('all' | 'alone')[] = (r % 2 === 0) !== firstAlone ? ['all', 'alone'] : ['alone', 'all'];
    for (const mode of order) {
      // Alone: the other people's pages are closed (navigated off the app), as if only one page were open.
      if (mode === 'alone') for (const p of scene.people.slice(1)) await p.page.goto('about:blank');
      else for (const p of scene.people.slice(1)) if (p.page.url() === 'about:blank') await openProduction(p.page, scene.showId);
      const report = await run(scene, { ms: roundMs, everyone: mode === 'all', reloadAt: null, offlineAt: null });
      const samples = ran(report);
      out.push({ round: r, mode, samples, lost: report.takes.length - samples.length, errors: report.errors });
      log(`round ${r} ${mode}: n ${samples.length} p95 ${pct(samples, 95)} errors ${report.errors.length}`);
    }
  }
  writeResult(`five-pair-${TAG}-part${PART}`, { pages: PAGES, at: new Date().toISOString(), rounds: out });
});
