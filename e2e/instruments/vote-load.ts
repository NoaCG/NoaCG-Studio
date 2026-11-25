// A LOAD INSTRUMENT, not a suite spec: a room of 100 and then 200 phones votes on a real staging
// production while an operator page runs the question three times, and the four counts are
// compared (docs/work-specs/live-production-reliability/spec.md, P1 AC-4 and AC-6).
//
//   gh workflow run hosted-latency.yml --ref <branch> -f spec=e2e/instruments/vote-load.ts
//
// The phones are scripts/vote-load.mjs: each with its own device token, reading the join page every
// 5 s, the publishable key only, the requests a phone sends. The operator is this page, pressing
// Go live, Stop, Continue the count and Start a new count as a person does. After each run the
// script's own count, the operator's tally (on the panel and from `audience_tally`), the export
// (`audience_votes_export`, and the CSV the panel downloads) and the result cue's values must agree,
// and every phone must read back the vote it sent. The readings are printed after the marker
// VOTE-LOAD-REPORT and attached (`vote-load-<n>.json`): response times, refusals with their words,
// and the database host's CPU and memory from the privileged metrics endpoint.
//
// It runs on one shard only: the four hosted shards start at once, and four rooms on one database
// would make every reading a share of something else.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGraphicInEditor, haveCreds, settleSync, signIn, SERVICE_ROLE_KEY, SUPABASE_URL, unpublishForCleanup, wipeMyGraphics } from '../configured/_helpers';
import { ANON_KEY } from '../configured/_panel';
import { openProductionWithCurrent } from '../_create';
import { publishProduction } from '../_publish';
import { openWorkspace } from '../_workspace';
import { addQuestion, addResults, goLive, questionRow, stopLive } from '../_interaction';
import { countsOf, createRoom, cueCounts, operatorReads, peakOf, sampleHost, scriptCounts, summarise } from '../../scripts/vote-load.mjs';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');
test.skip(/^e2e-s[2-9]@/.test(process.env.E2E_EMAIL ?? ''), 'the room runs on the first hosted shard only');
test.describe.configure({ mode: 'serial' });

const OPTIONS = ['Red', 'Blue', 'Green', 'Gold'];

/** Read until it equals `want` or the time is up; the last reading either way. */
async function settle<T>(read: () => Promise<T>, want: T, ms = 20_000): Promise<T> {
  const until = Date.now() + ms;
  let last = await read();
  while (JSON.stringify(last) !== JSON.stringify(want) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1_000));
    last = await read();
  }
  return last;
}

/** The option letters of a CSV the panel downloads. */
async function csvCounts(ws: Page, button: Locator): Promise<number[]> {
  const [file] = await Promise.all([ws.waitForEvent('download'), button.click()]);
  const rows = readFileSync((await file.path())!, 'utf8').trim().split('\r\n').slice(1);
  return countsOf(OPTIONS.length, rows.map((r) => r.split(',')[1]));
}

for (const size of [100, 200]) {
  test(`${size} phones vote three times: the script, the panel, the tally, the export, the CSV and the result cue agree`, async ({ page }, testInfo) => {
    test.setTimeout(900_000);
    const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(SUPABASE_URL)?.[1] ?? '';
    const host = ref && SERVICE_ROLE_KEY ? sampleHost({ ref, serviceKey: SERVICE_ROLE_KEY }) : null;

    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Polls', 'Result Donut Lower');
    const showId = await openProductionWithCurrent(page, `Vote Load ${size} ${Date.now()}`);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    const slugs = await page.evaluate(async (id) => {
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const show = loadShows().find((s) => s.id === id)!;
      return { control: show.hostedSlug!, join: show.joinSlug! };
    }, showId);
    const ws = await openWorkspace(page, 'audience');
    await expect(ws.getByTestId('join-published')).toBeVisible({ timeout: 30_000 });
    const QUESTION = `Which colour, ${size}?`;
    await addQuestion(ws, 'choice', QUESTION, OPTIONS);
    const row = questionRow(ws, QUESTION);

    const panel = async () => Promise.all(OPTIONS.map(async (_, i) => Number(await ws.getByTestId(`audience-tally-${i}`).textContent())));
    const cue = () =>
      ws.evaluate(async (id) => {
        const { loadShows } = await __noacgImport('/src/model/shows.ts');
        const show = loadShows().find((s) => s.id === id)!;
        const cueId = Object.values((show as { resultCues?: Record<string, string> }).resultCues ?? {})[0];
        return show.cues?.find((c) => c.id === cueId)?.values ?? null;
      }, showId);

    // The room opens the link before the question: most phones are there, a tenth come late.
    const room = createRoom({ url: SUPABASE_URL, key: ANON_KEY, join: slugs.join, seed: size });
    const late = size / 10;
    const changers = size / 5;
    await room.arrive(size - late);
    const idleFrom = Date.now();
    await new Promise((r) => setTimeout(r, 10_000));
    const idle = { requests: summarise(room.requests.filter((r) => r.at >= idleFrom)), host: host ? peakOf(host.readings, idleFrom) : null };

    /** Every phone's view has left the question (the poll after Stop). */
    const phonesSeeStop = () =>
      expect.poll(() => room.phones.filter((p) => p.view?.state?.round).length, { timeout: 15_000, intervals: [500] }).toBe(0);

    const runs: Record<string, unknown>[] = [];
    let roundId = '';
    const runOnce = async (name: string, press: () => Promise<void>, arriving: number) => {
      const from = Date.now();
      await press();
      const outcomes = await room.run({ options: OPTIONS.length, changers, late: arriving });
      roundId = room.phones.find((p) => p.view?.state?.round)?.view.state.round.id ?? roundId;
      const phonesShow = await room.readBack(roundId);
      const script = scriptCounts(room.phones, roundId, OPTIONS.length);
      const votedAt = Date.now();
      await stopLive(ws, QUESTION);
      const total = script.reduce((a, b) => a + b, 0);
      const reads = await operatorReads(room, slugs.control, roundId, OPTIONS.length);
      const shownOnPanel = await settle(panel, script);
      const csv = await csvCounts(ws, ws.getByTestId('audience-export-votes'));
      await addResults(ws, 'Result Donut Lower');
      const resultCue = cueCounts(await cue(), OPTIONS);
      const mismatched = room.phones.filter((p, i) => phonesShow[i] !== (p.sent.get(roundId) ?? null));
      const reading = {
        name,
        phones: room.phones.length,
        script: { counts: script, total },
        panel: shownOnPanel,
        tally: reads.tally,
        export: reads.export,
        csv,
        resultCue,
        agree:
          JSON.stringify(reads.tally.counts) === JSON.stringify(script) &&
          reads.tally.total === total &&
          JSON.stringify(reads.export.counts) === JSON.stringify(script) &&
          reads.export.voters === total &&
          JSON.stringify(shownOnPanel) === JSON.stringify(script) &&
          JSON.stringify(csv) === JSON.stringify(script) &&
          JSON.stringify(resultCue.counts) === JSON.stringify(script) &&
          resultCue.total === total,
        phonesShowingAnotherVote: mismatched.map((p) => ({ phone: p.index, sent: p.sent.get(roundId) ?? null, shows: phonesShow[p.index] })),
        // Every press that did not go in at the first try, with what the phone said.
        notFirstTime: room.phones.flatMap((p) => p.sends.filter((s) => s.round === roundId && s.shown !== null).map((s) => ({ phone: p.index, ...s }))),
        notCounted: outcomes.filter((o) => o.shown),
        votingSeconds: Math.round((votedAt - from) / 100) / 10,
        requests: summarise(room.requests.filter((r) => r.at >= from && r.at <= votedAt)),
        host: host ? peakOf(host.readings, from, votedAt) : null,
      };
      runs.push(reading);
      console.log(`VOTE-LOAD-RUN ${size} ${JSON.stringify(reading)}`);
      await phonesSeeStop();
      return reading;
    };

    try {
      // RUN 1: the first count.
      await runOnce('first count', () => goLive(ws, QUESTION), late);
      // RUN 2: Continue the count; the phones keep their votes, a fifth change theirs, a tenth arrive.
      await runOnce('continue the count', async () => {
        await row.getByTestId('question-go-live').click();
        await ws.getByTestId('question-run-continue').click();
        await expect(row.getByTestId('question-live')).toBeVisible();
      }, late);
      const continued = runs.at(-1) as { script: { counts: number[]; total: number } };
      // RUN 3: Start a new count; every phone votes afresh, and the earlier count stays as it was.
      await runOnce('start a new count', async () => {
        await row.getByTestId('question-go-live').click();
        await ws.getByTestId('question-run-new').click();
        await expect(row.getByTestId('question-live')).toBeVisible();
      }, late);
      const earlierTotal = (await ws.getByTestId('earlier-count-total').textContent())?.trim();
      const earlierCsv = await csvCounts(ws, ws.getByTestId('earlier-count-export'));
      runs.push({ name: 'earlier count after the new one', total: earlierTotal, csv: earlierCsv, agree: earlierTotal === `${continued.script.total} votes` && JSON.stringify(earlierCsv) === JSON.stringify(continued.script.counts) });
    } finally {
      room.leave();
      host?.stop();
      const report = { size, phonesAtEnd: room.phones.length, idle, runs, wholeRun: summarise(room.requests), hostReadings: host?.readings ?? null };
      console.log(`VOTE-LOAD-REPORT ${size} ${JSON.stringify({ ...report, hostReadings: undefined })}`);
      await testInfo.attach(`vote-load-${size}.json`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    }

    for (const r of runs) expect(r.agree, `${r.name}: ${JSON.stringify(r)}`).toBe(true);
    for (const r of runs.filter((x) => 'phonesShowingAnotherVote' in x)) expect(r.phonesShowingAnotherVote).toEqual([]);

    await ws.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });
}
