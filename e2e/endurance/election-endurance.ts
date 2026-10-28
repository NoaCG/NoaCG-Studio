// covers: scripts/endurance-fixture.mjs, scripts/endurance-judge.mjs, scripts/election-replay-server.mjs, scripts/external-data-connector.mjs
// covers: api/data/?...path?.ts, src/control/selectionAir.ts, src/control/productionDataSession.ts, src/control/sessionWire.ts
//
// THE 60-MINUTE ELECTION ENDURANCE RUN (docs/work-specs/playout-expanded-acceptance/spec.md, phase
// E8.1b, "Required operating envelope"; AC-2's endurance). Not a spec of any suite: started by
// `npm run endurance:election -- --minutes <n>` through playwright.endurance.config.ts.
//
// The whole path, as E7.2b's rehearsal walks it once, held for the minutes asked: the election
// rehearsal package installed and published with a foreign OGraf package beside it; the replay
// server serving the 1,000-candidate endurance timeline (scripts/endurance-fixture.mjs) one revision
// every 5 s, with its scheduled duplicate, older and malformed steps; the trusted agent as its own
// process reading it and posting to the dev server's /api/data/source; a browser output in its own
// context; a candidate cue switch every 15 s; a foreign action through the panel relay every 60 s;
// and in every cycle a Pause and Resume, a controller reload, an output disconnect and a reader
// handover (a released claim, or a frozen agent whose claim lapses and who comes back late).
//
// This file only DRIVES and RECORDS. Every verdict is scripts/endurance-judge.mjs's, over the record
// written to endurance-output/record.json: the run fails when any check fails, and the record is
// written whatever happened, so a red run still says what it saw.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type BrowserContext, type CDPSession, type Frame, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { publishProduction } from '../_publish';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from '../configured/_helpers';
import { answerPanel, pairPanel, shutStatusPanel, type Json } from '../configured/_panel';
import { makeTestCertificate, makeToken, startReplayServer } from '../../scripts/election-replay-server.mjs';
import { ACTION_MS, CUE_SWITCH_MS, STEP_MS, candidates, enduranceTimeline, measureFixture, schedule } from '../../scripts/endurance-fixture.mjs';
import { judge } from '../../scripts/endurance-judge.mjs';

const MINUTES = Number(process.env.ENDURANCE_MINUTES ?? 5);
const OUT = fileURLToPath(new URL('../../endurance-output/', import.meta.url));
const repoFile = (file: string) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const readJson = (file: string) => JSON.parse(readFileSync(repoFile(file), 'utf8'));
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** The package's three candidate cues the run switches between, with the keys they select. */
const CUES = [
  { label: 'Aino Example, Uusimaa 101', key: ['02', 101] },
  { label: 'Leo Example, Helsinki 101', key: ['01', 101] },
  { label: 'Sara Example, Uusimaa 103', key: ['02', 103] },
] as const;
const FOREIGN = repoFile('e2e/fixtures/foreign-ograf/rundown/');

const select = (page: Page, label: string) => page.getByTestId('cue-list').locator('.pd-cue').filter({ hasText: label }).first().locator('.pd-cue-label').click();
async function take(page: Page, label: string) {
  await select(page, label);
  await expect(page.getByTestId('verb-take')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('verb-take').click();
}

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset: run it through npm run endurance:election');

test('the election data path holds for the minutes asked', async ({ page, browser, baseURL }) => {
  const plan = schedule(MINUTES);
  const people = candidates();
  const fixture = measureFixture(MINUTES, people);
  mkdirSync(OUT, { recursive: true });
  const record: Record<string, unknown> & { errors: Json[]; takes: Json[]; actions: Json[]; faults: Json[]; samples: Json[]; frames: Json[]; snapshots: Json[]; provider: Json[]; reads: Json[]; agents: Json[] } = {
    minutes: MINUTES,
    schedule: plan,
    fixture: { ...fixture, projected: undefined, jsonbBytes: Number(process.env.ENDURANCE_JSONB_BYTES) || null },
    errors: [],
    takes: [],
    actions: [],
    faults: [],
    samples: [],
    frames: [],
    snapshots: [],
    provider: [],
    reads: [],
    agents: [],
  };
  const error = (where: string, message: string) => record.errors.push({ where, message, at: Date.now() });
  page.on('pageerror', (e) => error('controller', e.message));
  process.on('unhandledRejection', (e) => error('driver', String((e as Error)?.message ?? e)));

  const dir = mkdtempSync(path.join(os.tmpdir(), 'endurance-'));
  const tls = makeTestCertificate(path.join(dir, 'replay'));
  const token = makeToken();
  const replay = await startReplayServer({
    token,
    cert: tls.cert,
    key: tls.key,
    stepMs: STEP_MS,
    timeline: enduranceTimeline(MINUTES + 10, people),
    onStep: (name: string, at: number) => record.provider.push({ name, at }),
  });
  const agents: { name: string; child: ChildProcess; log: string; started: number; ended?: number }[] = [];
  const stopAgents = async () => {
    for (const a of agents) {
      if (a.ended) continue;
      const gone = new Promise((resolve) => a.child.once('exit', resolve));
      a.child.kill('SIGCONT');
      a.child.kill('SIGTERM');
      await gone;
    }
  };
  let outputContext: BrowserContext | null = null;
  try {
    // ── The production: the election package, published, with a foreign package beside it ──
    await signIn(page);
    await page.keyboard.press('Escape');
    await clearPublishedShows(page);
    await wipeMyGraphics(page);
    await page.goto('/app#/home/productions');
    await page.getByTestId('import-pack-card').getByTestId('import-pack-file').setInputFiles(repoFile('public/packs/election-rehearsal.noacgpack.json'));
    await expect(page.getByTestId('production-page')).toBeVisible();
    const zip = new JSZip();
    for (const name of ['graphic.mjs', 'rundown.ograf.json']) zip.file(`rundown/${name}`, readFileSync(path.join(FOREIGN, name)));
    const showId = await page.evaluate(async (b64) => {
      const { importForeignOgraf } = await import('/src/export/targets/ografForeign.ts');
      const m = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const show = m.loadShows().find((s) => s.name === 'Election night rehearsal')!;
      const read = await importForeignOgraf('rundown.zip', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      if (!read || !read.ok) throw new Error(`the package did not import: ${read && !read.ok ? read.reason : 'not foreign'}`);
      m.addGraphicToShow(show.id, { ...read.template, name: 'Board' });
      const board = m.loadShows().find((x) => x.id === show.id)!.graphics.find((g) => g.name === 'Board')!;
      const first = m.loadShows().find((x) => x.id === show.id)!.cues!.find((c) => c.sourceId === board.id)!;
      m.updateShowCueChecked(show.id, first.id, { label: 'Board', values: { headline: 'Endurance', score: '0' } });
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      return show.id;
    }, (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })).toString('base64'));
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible();
    await publishProduction(page);
    await shutStatusPanel(page);

    // The source, registered as the rehearsal runbook does, pointing at this run's replay server.
    const registration = readJson('docs/work-specs/playout-election-package/replay-source.json');
    const refused = await page.evaluate(
      async ({ id, source }) => (await import('/src/model/shows.ts')).connectConnectorSource(id, source as never, [], null).error,
      { id: showId, source: { ...registration, config: { ...registration.config, endpoint: replay.url } } },
    );
    expect(refused).toBeNull();
    const db = admin();
    await expect.poll(async () => ((await db.from('control_shows').select('sources').eq('id', showId).single()).data?.sources ?? []).length, { timeout: 20_000 }).toBe(1);
    const { data: row } = await db.from('control_shows').select('data_key, slug, output_slug').eq('id', showId).single();
    const { data_key: dataKey, slug, output_slug: outputSlug } = row as { data_key: string; slug: string; output_slug: string };

    // ── The trusted agent, as its own process, as installed ──
    const config = { ...readJson('docs/work-specs/playout-election-package/replay-agent.json'), endpoint: replay.url, caFile: path.join(dir, 'replay', 'ca.pem') };
    writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(config));
    const startAgent = (name: string) => {
      const child = spawn(process.execPath, [repoFile('scripts/external-data-connector.mjs'), '--config', path.join(dir, 'agent.json'), '--send', `${baseURL}/api/data/source`], {
        env: { ...process.env, NOACG_DATA_KEY: dataKey, NOACG_SOURCE_REPLAY: token },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        windowsHide: true,
      });
      const agent = { name, child, log: '', started: Date.now() } as (typeof agents)[number];
      child.stderr!.on('data', (chunk) => {
        const text = String(chunk);
        agent.log += text;
        for (const line of text.split('\n').filter(Boolean)) record.reads.push({ agent: name, at: Date.now(), line });
      });
      child.on('exit', (code, signal) => {
        agent.ended = Date.now();
        record.agents.push({ name, started: agent.started, ended: agent.ended, code, signal });
      });
      agents.push(agent);
      return agent;
    };
    const backlog = (agent: (typeof agents)[number]) =>
      new Promise<Json | null>((resolve) => {
        if (agent.ended || !agent.child.connected) return resolve(null);
        const timer = setTimeout(() => resolve(null), 2_000);
        agent.child.once('message', (m: { backlog?: Json }) => {
          clearTimeout(timer);
          resolve(m.backlog ?? null);
        });
        agent.child.send('backlog');
      });
    let current = startAgent('agent-1');
    const snapshot = async () => (await db.from('production_source_snapshots').select('owner_epoch, accepted_revision, changed_at, checked_at, status, byte_size').eq('show_id', showId).eq('source_id', 'election')).data ?? [];
    await expect.poll(async () => (await snapshot())[0]?.accepted_revision ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

    // ── The output, in its own browser context so it can be disconnected alone ──
    outputContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const output = await outputContext.newPage();
    output.on('pageerror', (e) => error('output', e.message));
    await output.goto(`${baseURL}/output?production=${encodeURIComponent(outputSlug)}`);

    // Everything but the candidate card on air once; the card and the foreign Board take turns below.
    for (const label of ['Party totals', 'Count status', 'Headlines', 'Board']) {
      await take(page, label);
      record.takes.push({ at: Date.now(), label });
    }
    const board = output.frameLocator('iframe[title="Board"]').locator('.card');
    await expect(board).toHaveAttribute('data-on', 'true', { timeout: 30_000 });
    const deck = await pairPanel(page);
    await answerPanel(page);
    await page.getByTestId('panel-close').click();
    await deck.hello();

    // What the output shows, read at 4 Hz from each graphic's own frame (isolated, so through
    // Playwright's frames, named by their element's title); only changes are kept.
    const titles = new Map<Frame, string | null>();
    const titled = async () => {
      const frames = output.frames().filter((f) => f !== output.mainFrame());
      for (const f of [...titles.keys()]) if (!frames.includes(f)) titles.delete(f);
      for (const f of frames) if (!titles.has(f)) titles.set(f, await f.frameElement().then((e) => e.getAttribute('title')).catch(() => null));
      return frames;
    };
    const text = async (title: string, ids: string[]) => {
      const frame = [...titles].find(([, t]) => t === title)?.[0];
      if (!frame) return ids.map(() => null);
      return frame.evaluate((list) => list.map((id) => document.getElementById(id)?.textContent ?? null), ids).catch(() => ids.map(() => null));
    };
    let last = '';
    const readOutput = async () => {
      const frames = await titled().catch(() => null);
      if (!frames) return;
      const [name, votes] = await text('Candidate card', ['f0', 'f2']);
      const [kok] = await text('Party totals', ['f8']);
      const [counted] = await text('Count bug', ['f2']);
      const seen = { at: Date.now(), name, votes, kok, counted, frames: frames.length };
      const key = JSON.stringify({ ...seen, at: 0 });
      if (key !== last) record.frames.push(seen);
      last = key;
    };

    // Memory and instance counts, garbage collected first so windows compare like with like.
    const cdp = new Map<Page, CDPSession>();
    const metrics = async (p: Page, gc: boolean) => {
      try {
        if (!cdp.has(p)) {
          const s = await p.context().newCDPSession(p);
          await s.send('Performance.enable');
          cdp.set(p, s);
        }
        const s = cdp.get(p)!;
        if (gc) await s.send('HeapProfiler.collectGarbage');
        const { metrics: list } = await s.send('Performance.getMetrics');
        const m = Object.fromEntries(list.map((x: { name: string; value: number }) => [x.name, x.value]));
        const channels = await p.evaluate(async () => (await (await import('/src/backend/supabase.ts')).getSupabase())?.getChannels().length ?? null).catch(() => null);
        return { heap: m.JSHeapUsedSize, nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, frames: m.Frames, channels, gc };
      } catch (e) {
        return { failed: String((e as Error).message ?? e) };
      }
    };
    // The controller's reads of the published tree in flight (its client backlog).
    let stateReads = 0;
    let stateReadsMax = 0;
    const isStateRead = (url: string) => url.includes('/api/data/state');
    const watchReads = (p: Page) => {
      p.on('request', (r) => {
        if (!isStateRead(r.url())) return;
        stateReads++;
        stateReadsMax = Math.max(stateReadsMax, stateReads);
      });
      const done = (r: { url: () => string }) => void (isStateRead(r.url()) && (stateReads = Math.max(0, stateReads - 1)));
      p.on('requestfinished', done);
      p.on('requestfailed', done);
    };
    watchReads(page);
    const sample = async (at: number, gc: boolean) => {
      const agent = await backlog(current);
      const snap = await snapshot();
      record.samples.push({
        at,
        controller: await metrics(page, gc),
        output: await metrics(output, gc),
        stateReadsInFlight: stateReads,
        stateReadsMax,
        agent,
        agentsAlive: agents.filter((a) => !a.ended).length,
        snapshots: snap.length,
        driver: { rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed, handles: process.getActiveResourcesInfo().length },
      });
      stateReadsMax = stateReads;
      if (snap[0]) record.snapshots.push({ at, epoch: snap[0].owner_epoch, revision: snap[0].accepted_revision, state: snap[0].status?.state ?? null, bytes: snap[0].byte_size });
    };

    // ── The scheduled faults ──
    const pause = async (ms: number) => {
      const paused = (on: boolean) => page.evaluate(async ({ s, on }) => (await import('/src/control/productionDataApi.ts')).setAnotherSystemPaused(s, on), { s: slug, on });
      const fault: Json = { kind: 'pause', at: Date.now() };
      record.faults.push(fault);
      fault.answer = await paused(true);
      fault.paused = Date.now();
      await page.waitForTimeout(ms);
      fault.resuming = Date.now();
      fault.resume = await paused(false);
      fault.end = Date.now();
    };
    const reload = async () => {
      const fault: Json = { kind: 'reload', at: Date.now() };
      record.faults.push(fault);
      await page.reload();
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
      fault.end = Date.now();
    };
    const disconnect = async (ms: number) => {
      const fault: Json = { kind: 'disconnect', at: Date.now() };
      record.faults.push(fault);
      await outputContext!.setOffline(true);
      await output.waitForTimeout(ms);
      await outputContext!.setOffline(false);
      fault.end = Date.now();
    };
    const handover = async (mode: 'release' | 'crash') => {
      const old = current;
      const before = (await snapshot())[0];
      const fault: Json = { kind: 'handover', mode, at: Date.now(), from: old.name, epochBefore: before?.owner_epoch ?? null };
      record.faults.push(fault);
      const name = `agent-${agents.length + 1}`;
      if (mode === 'release') {
        // A graceful handover: the old agent stops and releases its claim; the new one claims at once.
        const gone = new Promise((resolve) => old.child.once('exit', resolve));
        old.child.kill('SIGTERM');
        await gone;
        current = startAgent(name);
      } else {
        // A crash: the old agent freezes holding its claim, the new one waits out the 30 s lease and
        // claims; then the old one wakes and tries to write as the owner it no longer is.
        old.child.kill('SIGSTOP');
        fault.frozen = Date.now();
        current = startAgent(name);
        await expect.poll(async () => (await snapshot())[0]?.owner_epoch, { timeout: 90_000, intervals: [1_000] }).toBeGreaterThan(before?.owner_epoch ?? 0);
        fault.claimed = Date.now();
        await page.waitForTimeout(3_000);
        const woke = Date.now();
        fault.woke = woke;
        old.child.kill('SIGCONT');
        // It reads within its 2 s poll and posts under its old claim; give it three polls.
        await page.waitForTimeout(8_000);
        const gone = new Promise((resolve) => old.child.once('exit', resolve));
        old.child.kill('SIGTERM');
        await gone;
      }
      fault.to = name;
      await expect.poll(async () => (await snapshot())[0]?.owner_epoch, { timeout: 90_000, intervals: [1_000] }).toBeGreaterThan(before?.owner_epoch ?? 0);
      fault.epochAfter = (await snapshot())[0]?.owner_epoch ?? null;
      fault.end = Date.now();
    };

    // ── A foreign action through the panel relay, on the program instance of Board ──
    let actions = 0;
    const foreignAction = async (at: number) => {
      actions++;
      const entry: Json = { at, n: actions };
      record.actions.push(entry);
      try {
        const offered = await deck.actions((a) => {
          const g = (a.graphics as { graphic: string; live: string | null; caps: { id: string; allowed: boolean }[] }[]).find((x) => x.graphic === 'Board');
          return !!g?.live && !!g.caps.find((c) => c.id === 'foreign:mark')?.allowed;
        }, 'Board offered live');
        const g = (offered.graphics as { graphic: string; live: string }[]).find((x) => x.graphic === 'Board')!;
        const before = Number(await board.getAttribute('data-marks', { timeout: 10_000 }));
        const pressed = await deck.action({ target: 'Board', cap: 'foreign:mark', instance: g.live, seen: offered.actionsVer as number, args: { v: `endurance ${actions}` } });
        entry.outcome = pressed.outcome;
        entry.settled = (pressed.settled as Json | null)?.outcome ?? null;
        await expect(board).toHaveAttribute('data-mark', `endurance ${actions}`, { timeout: 20_000 });
        entry.marksBefore = before;
        entry.marksAfter = Number(await board.getAttribute('data-marks'));
        if (actions % 5 === 0) {
          // The same press again, one id: a duplicate, never a second mark.
          const again = await deck.action({ target: 'Board', cap: 'foreign:mark', instance: g.live, seen: offered.actionsVer as number, args: { v: `endurance ${actions}` }, id: pressed.id });
          await output.waitForTimeout(2_000);
          entry.duplicate = { outcome: again.outcome, marks: Number(await board.getAttribute('data-marks')) };
        }
      } catch (e) {
        entry.failed = String((e as Error).message ?? e).split('\n')[0];
      }
      entry.end = Date.now();
    };

    // ── The run ──
    const t0 = Date.now();
    record.t0 = t0;
    await sample(t0, true);
    type Due = { at: number; run: () => Promise<void>; name: string };
    const due: Due[] = [];
    let cue = 0;
    for (let at = 0; at < plan.totalMs; at += CUE_SWITCH_MS) {
      const which = CUES[cue++ % CUES.length];
      due.push({
        at,
        name: 'switch',
        run: async () => {
          const entry: Json = { label: which.label, key: which.key, clickAt: Date.now() };
          record.takes.push(entry);
          try {
            await take(page, which.label);
            entry.at = Date.now();
          } catch (e) {
            entry.failed = String((e as Error).message ?? e).split('\n')[0];
          }
        },
      });
    }
    for (let at = 30_000; at < plan.totalMs; at += ACTION_MS) due.push({ at, name: 'action', run: () => foreignAction(Date.now()) });
    for (const e of plan.events as { at: number; kind: string; ms?: number; mode?: 'release' | 'crash' }[]) {
      const run = e.kind === 'pause' ? () => pause(e.ms!) : e.kind === 'reload' ? reload : e.kind === 'disconnect' ? () => disconnect(e.ms!) : () => handover(e.mode!);
      due.push({ at: e.at, name: e.kind, run });
    }
    due.sort((a, b) => a.at - b.at);
    // Each job runs on its own and is awaited at the end; the loop keeps reading and sampling.
    const running: Promise<void>[] = [];
    let nextSample = t0 + 10_000;
    let nextGc = t0 + 60_000;
    while (Date.now() - t0 < plan.totalMs) {
      const now = Date.now();
      while (due.length && t0 + due[0].at <= now) {
        const job = due.shift()!;
        running.push(job.run().catch((e) => error(job.name, String((e as Error).message ?? e).split('\n')[0])));
      }
      if (now >= nextSample) {
        const gc = now >= nextGc;
        if (gc) nextGc += 60_000;
        nextSample += 10_000;
        await sample(now, gc);
      }
      await readOutput();
      await new Promise((r) => setTimeout(r, 250));
    }
    await Promise.all(running);
    await sample(Date.now(), true);
    record.end = Date.now();
    await deck.close();
    // The agents stop first, so the source's state read below is the last it will have.
    await stopAgents();

    // What the renderers received, and the source's state at the end.
    const rows: Json[] = [];
    for (let from = 0; ; ) {
      const { data } = await db.from('control_events').select('id, graphic, msg, created_at').eq('show_id', showId).gt('id', from).order('id').limit(1000);
      if (!data?.length) break;
      for (const r of data) rows.push({ id: r.id, graphic: r.graphic, t: r.msg?.t, src: r.msg?.src ?? null, data: r.msg?.data ?? null, at: Date.parse(r.created_at) });
      from = data.at(-1)!.id;
    }
    record.rows = rows;
    record.finalSnapshot = (await snapshot())[0] ?? null;
    record.credentialLeaked = agents.some((a) => a.log.includes(token) || a.log.includes(dataKey));
  } finally {
    await stopAgents();
    await outputContext?.close().catch(() => {});
    await replay.close();
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(path.join(OUT, 'record.json'), JSON.stringify(record));
    await clearPublishedShows(page).catch(() => {});
  }
  const verdict = judge(record);
  writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  expect(verdict.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
});
