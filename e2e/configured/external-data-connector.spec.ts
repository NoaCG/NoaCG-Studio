// covers: api/data/?...path?.ts, src/control/sourceMapping.ts, src/control/externalSource.ts
// covers: scripts/external-data-connector.mjs, scripts/election-replay-server.mjs
// covers: supabase/migrations/0101_production_source_snapshots.sql, src/model/productionData.ts
// covers: src/control/connectorReview.ts
//
// A TRUSTED JSON SOURCE THROUGH THE PRODUCTION API (docs/work-specs/playout-external-connectors/
// spec.md, phase E4.2; AC-1 installed-agent part, AC-2, AC-3, AC-4), against the configured
// stack's real database (migration 0101) and the dev server's real `/api/data/source`.
//
// The agent runs as its own process, exactly as installed from docs/DATA_API.md ("A trusted JSON
// agent"): `node scripts/external-data-connector.mjs --config <file> --send <address>`, with the
// production's data key in NOACG_DATA_KEY and the provider's bearer in NOACG_SOURCE_REPLAY. The
// provider is the election replay server (scripts/election-replay-server.mjs), started here with a
// certificate only this run trusts and moved step by step with `at(i)`.
//
// - The first walk registers the source through the page (the ordinary `Show.sources` write C2
//   persists to the row), then follows the timeline: a scalar and a collection reach the log as
//   'api' update rows, a duplicate and an older revision and malformed input hold the last good,
//   Another system's Pause holds two revisions while the agent keeps reading and Resume sends the
//   final values once, a deleted person and a valid empty list arrive, and an unchanged read moves
//   checked-at only.
// - The second kills and restarts the agent (a new epoch, the revision continued, never reused),
//   proves a second agent and the old owner write nothing, rotates the data key, and checks the
//   legacy /patch and /update callers on the same production.
// - The third rotates the provider's credential, interrupts the provider, pauses the source and
//   restores its prior configuration: last values stay on air throughout.
// - The fourth is the Connect review's sample through the agent (docs/work-specs/playout-api-mapping
//   /spec.md, E5.2): the page asks, the agent reads one sample with its own credential and posts it
//   to the route, the review maps it, and nothing is applied until Connect; the new connection
//   then fills at the agent's next read. No credential reaches the page, the stored sample, the
//   production's record or the export.
// The second and third make their production with the service role (an unconfigured private,
// OAuth or webhook provider is refused by the configuration itself, scripts/
// external-data-connector.test.mjs); the limits at their edges are migration 0101's self-check.

import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { publishProduction } from '../_publish';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, deleteAccountByEmail, haveCreds, mintAccount, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';
import { makeTestCertificate, makeToken, startReplayServer } from '../../scripts/election-replay-server.mjs';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset - configured-mode spec');

const AGENT = path.resolve('scripts/external-data-connector.mjs');
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BINDINGS = { Hairline: { f0: 'external.e1.status', f1: 'external.e1.candidates' } };
const REGISTRATION = { v: 1, configRevision: 1, endpoint: 'https://127.0.0.1/results', lists: { candidates: 'lines' } };

interface Replay {
  url: string;
  at(i: number): void;
  close(): Promise<void>;
}

/** The provider, its certificate and its token, in one folder of their own. Restarted on the same
 *  port it keeps its certificate (the agent trusts that one) and takes a new token. */
const certificates = new Map<string, { cert: Buffer; key: Buffer }>();
async function provider(dir: string, port = 0): Promise<Replay & { token: string }> {
  if (!certificates.has(dir)) certificates.set(dir, makeTestCertificate(path.join(dir, 'tls')));
  const { cert, key } = certificates.get(dir)!;
  const token = makeToken();
  // One step lasts a day: the walk moves the timeline by hand.
  const server = (await startReplayServer({ token, cert, key, stepMs: 86_400_000, port })) as Replay;
  return { ...server, token };
}

/** One agent process, as installed: its configuration file, its two credentials, its log. */
function agent(dir: string, replay: { url: string; token: string }, dataKey: string, address: string) {
  const config = path.join(dir, 'agent.json');
  writeFileSync(
    config,
    JSON.stringify({
      v: 1,
      sourceId: 'e1',
      productionId: 'walk',
      endpoint: replay.url,
      mode: 'local',
      caFile: 'tls/ca.pem',
      configRevision: 1,
      credentialRef: 'NOACG_SOURCE_REPLAY',
      credentialBound: true,
      revisionPath: 'revision',
      eventTimePath: 'observed_at',
      // Every 2 s, so each step of the walk is seen at once; the production still takes at most
      // one revision every 5 s (a sooner one is refused and offered again).
      pollMs: 2000,
      sendPaths: ['revision', 'status', 'candidates'],
    }),
  );
  let log = '';
  const child: ChildProcess = spawn(process.execPath, [AGENT, '--config', config, '--send', address], {
    env: { ...process.env, NOACG_DATA_KEY: dataKey, NOACG_SOURCE_REPLAY: replay.token },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  child.stderr!.on('data', (chunk) => (log += chunk));
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return {
    log: () => log,
    stop: async (signal: NodeJS.Signals = 'SIGTERM') => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      await exited;
    },
  };
}

/** The production's update rows, oldest first. */
async function rows(showId: string) {
  const { data, error } = await admin().from('control_events').select('id, graphic, msg').eq('show_id', showId).order('id');
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => r.msg?.t === 'update').map((r) => ({ id: r.id as number, src: r.msg.src as string, data: r.msg.data as Record<string, string> }));
}

async function snapshot(showId: string) {
  const { data, error } = await admin().from('production_source_snapshots').select('*').eq('show_id', showId).eq('source_id', 'e1').maybeSingle();
  if (error) throw new Error(error.message);
  return data as null | { owner_epoch: number; accepted_revision: number; checked_at: string | null; changed_at: string | null; status: { state?: string } };
}

async function tree(showId: string) {
  const { data, error } = await admin().from('control_shows').select('data, data_key, slug, sources').eq('id', showId).single();
  if (error) throw new Error(error.message);
  return data as { data: { external?: { e1?: Record<string, string> } }; data_key: string; slug: string; sources: { id: string; paused?: boolean; config: { configRevision: number } }[] };
}

/** Let the source's lease lapse now, as it would 30 s after its owner's last report. */
async function lapse(showId: string) {
  const { error } = await admin().from('control_source_reads').update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq('show_id', showId);
  if (error) throw new Error(error.message);
}

/** A published-looking production owned by `owner`, registered for `e1`, made by the service role. */
async function serviceProduction(owner: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin()
    .from('control_shows')
    .insert({
      id,
      owner_id: owner,
      title: `Connector ${Date.now()}`,
      panel: [
        { name: 'Hairline', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name' }, { field: 'f1', ftype: 'textfield', title: 'Role' }] },
        { name: 'Board', fields: [{ field: 'f0', ftype: 'number', title: 'Revision' }] },
      ],
      bindings: BINDINGS,
      sources: [{ id: 'e1', kind: 'external', label: 'Results', config: REGISTRATION }],
    });
  if (error) throw new Error(error.message);
  return id;
}

const AINO = (votes: number) => `FI2027_02_101\t${votes}`;

test.describe('a trusted JSON source', () => {
  let dir: string;
  test.beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'connector-walk-'));
  });
  test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('registered through the page: a scalar and a collection arrive; holds keep the last good; Pause holds while the agent reads and Resume sends the final values once', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const replay = await provider(dir);
    let running: ReturnType<typeof agent> | null = null;
    try {
      await signIn(page);
      await page.keyboard.press('Escape');
      await clearPublishedShows(page);
      await wipeMyGraphics(page);
      await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
      const showId = await openProductionWithCurrent(page, `Connector ${Date.now()}`);
      await publishProduction(page);
      await page.keyboard.press('Escape');

      // Registration is the ordinary Show.sources write, which C2 puts on the row at once.
      const registered = await page.evaluate(
        async ({ id, registration, bindings }) => {
          const { connectShowSource } = await import('/src/model/shows.ts');
          const entries = Object.entries(bindings.Hairline).map(([fieldId, p]) => ({ graphic: 'Hairline', fieldId, path: p }));
          const source = { id: 'e1', kind: 'external' as const, label: 'Results', config: registration };
          return connectShowSource(id, source, entries).error;
        },
        { id: showId, registration: REGISTRATION, bindings: BINDINGS },
      );
      expect(registered).toBeNull();
      await expect.poll(async () => (await tree(showId)).sources?.map((s) => s.id), { timeout: 15_000 }).toEqual(['e1']);
      const { data_key: dataKey, slug } = await tree(showId);

      running = agent(dir, replay, dataKey, `${baseURL}/api/data/source`);
      // count-01: the scalar and the collection, one row, as the API.
      await expect.poll(async () => (await rows(showId)).filter((r) => r.src === 'api').length, { timeout: 20_000 }).toBe(1);
      const [first] = await rows(showId);
      expect(first.data).toEqual({ f0: 'PRELIMINARY · DEMO', f1: expect.stringContaining(AINO(3500)) });
      expect(first.data.f1.split('\n')).toHaveLength(6);

      // Pause Another system: the agent keeps reading and the production keeps accepting its
      // revisions, but nothing airs.
      const pausedAt = first.id;
      const pauseAnother = (paused: boolean) =>
        page.evaluate(async ({ s, paused }) => (await import('/src/control/productionDataApi.ts')).setAnotherSystemPaused(s, paused), { s: slug, paused });
      await pauseAnother(true);
      replay.at(1); // count-increase
      await expect.poll(async () => (await snapshot(showId))?.accepted_revision, { timeout: 15_000 }).toBe(2);
      replay.at(3); // correction-down
      await expect.poll(async () => (await snapshot(showId))?.accepted_revision, { timeout: 15_000 }).toBe(3);
      expect((await rows(showId)).filter((r) => r.id > pausedAt)).toEqual([]);
      // The tree operators and a Take read is what is on air: the held values are not in it.
      expect((await tree(showId)).data.external?.e1?.candidates).toContain(AINO(3500));

      // Resume: the final values, once.
      await pauseAnother(false);
      const resumed = (await rows(showId)).filter((r) => r.id > pausedAt);
      expect(resumed).toHaveLength(1);
      expect(resumed[0].data).toEqual({ f1: expect.stringContaining(AINO(3680)) });

      // An older revision arriving late, then malformed input: held, the last good stays.
      const before = (await rows(showId)).length;
      replay.at(4);
      await expect.poll(async () => (await snapshot(showId))?.status.state, { timeout: 15_000 }).toBe('stale');
      replay.at(5);
      await expect.poll(async () => (await snapshot(showId))?.status.state, { timeout: 15_000 }).toBe('invalid');
      expect((await rows(showId)).length).toBe(before);
      expect((await tree(showId)).data.external?.e1?.candidates).toContain(AINO(3680));

      // A deleted person, then a valid empty list, which clears the field.
      replay.at(6);
      await expect.poll(async () => (await rows(showId)).length, { timeout: 15_000 }).toBe(before + 1);
      expect((await rows(showId)).at(-1)!.data.f1).not.toContain('FI2027_02_104');
      replay.at(7);
      await expect.poll(async () => (await rows(showId)).at(-1)!.data, { timeout: 15_000 }).toEqual({ f1: '' });

      // Unchanged reads: checked-at moves, changed-at does not, and no row is written.
      const settled = await snapshot(showId);
      await expect.poll(async () => (await snapshot(showId))?.checked_at, { timeout: 25_000 }).not.toBe(settled!.checked_at);
      const later = await snapshot(showId);
      expect([later!.status.state, later!.changed_at, later!.accepted_revision]).toEqual(['unchanged', settled!.changed_at, 5]);
      expect((await rows(showId)).length).toBe(before + 2);
      expect(running.log()).not.toContain(replay.token);
      expect(running.log()).not.toContain(dataKey);
    } finally {
      await running?.stop();
      await replay.close();
      await clearPublishedShows(page).catch(() => {});
      await wipeMyGraphics(page).catch(() => {});
    }
  });

  test('kill and restart: a new epoch continues the revision; a second agent and the old owner write nothing; a rotated data key; /patch and /update still work', async ({ baseURL }) => {
    test.setTimeout(120_000);
    const email = `e2e-connector-restart-${Date.now()}@noacg.invalid`;
    const owner = await mintAccount(admin(), email, `pw-${makeToken()}`);
    const replay = await provider(dir);
    const address = `${baseURL}/api/data/source`;
    const started: ReturnType<typeof agent>[] = [];
    try {
      const showId = await serviceProduction(owner);
      let { data_key: dataKey } = await tree(showId);
      const first = agent(dir, replay, dataKey, address);
      started.push(first);
      await expect.poll(async () => (await rows(showId)).length, { timeout: 20_000 }).toBe(1);
      const { data: lease } = await admin().from('control_source_reads').select('claim').eq('show_id', showId).single();

      // A second agent with the same configuration is told the source is held, and writes nothing.
      const second = agent(dir, replay, dataKey, address);
      started.push(second);
      await expect.poll(() => second.log(), { timeout: 10_000 }).toContain('held by another agent');
      await second.stop();

      // Killed without a word: its lease lapses (30 s later, made now), and the restarted agent
      // claims a newer epoch and continues after revision 1.
      await first.stop('SIGKILL');
      await lapse(showId);
      const restarted = agent(dir, replay, dataKey, address);
      started.push(restarted);
      await expect.poll(() => restarted.log(), { timeout: 10_000 }).toContain('claimed: epoch 2, continuing after revision 1');
      // It knows the production's revision, not its content: the provider's unchanged answer is
      // sent once as revision 2 and writes no row; the next change is revision 3, never a reused 2.
      await expect.poll(async () => (await snapshot(showId))?.accepted_revision, { timeout: 15_000 }).toBe(2);
      expect((await rows(showId)).length).toBe(1);
      replay.at(1);
      await expect.poll(async () => (await snapshot(showId))?.accepted_revision, { timeout: 15_000 }).toBe(3);
      expect((await rows(showId)).length).toBe(2);

      // The old owner's late report, under its old claim and epoch, is refused and writes nothing.
      const late = await fetch(address, {
        method: 'POST',
        headers: { authorization: `Bearer ${dataKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          v: 1, op: 'report', sourceId: 'e1', claim: lease!.claim,
          acquisition: { v: 1, sourceId: 'e1', configRevision: 1, ownerEpoch: 1, acceptedRevision: 9, checkedAt: new Date().toISOString(), status: 'changed', payload: { status: 'OLD OWNER', candidates: [] } },
        }),
      });
      expect([late.status, (await late.json()).refused]).toEqual([409, 'moved']);
      expect((await tree(showId)).data.external?.e1?.status).toBe('PRELIMINARY · DEMO');

      // The data key rotated: the running agent is refused (401) and writes nothing; restarted with
      // the new key it claims again and carries on.
      const rotated = makeToken().slice(0, 24);
      await admin().from('control_shows').update({ data_key: rotated }).eq('id', showId);
      replay.at(3);
      await expect.poll(() => restarted.log(), { timeout: 15_000 }).toMatch(/not (taken|claimed) \(401/);
      expect((await rows(showId)).length).toBe(2);
      await restarted.stop();
      await lapse(showId);
      dataKey = rotated;
      const again = agent(dir, replay, dataKey, address);
      started.push(again);
      await expect.poll(() => again.log(), { timeout: 10_000 }).toContain('claimed: epoch 3, continuing after revision 3');
      await expect.poll(async () => (await rows(showId)).at(-1)?.data.f1 ?? '', { timeout: 15_000 }).toContain(AINO(3680));

      // The legacy callers keep their contract on the same production.
      const auth = { authorization: `Bearer ${dataKey}`, 'content-type': 'application/json' };
      const patch = await fetch(`${baseURL}/api/data/patch`, { method: 'POST', headers: auth, body: JSON.stringify({ other: { line: 'manual' } }) });
      expect(patch.status, await patch.text()).toBe(200);
      const update = await fetch(`${baseURL}/api/data/update`, { method: 'POST', headers: auth, body: JSON.stringify({ graphic: 'Hairline', values: { Name: 'By hand' } }) });
      expect(update.status, await update.text()).toBe(200);
      expect((await rows(showId)).at(-1)!.data).toEqual({ f0: 'By hand' });
      expect((await tree(showId)).data.external?.e1?.status).toBe('PRELIMINARY · DEMO');
    } finally {
      for (const a of started) await a.stop('SIGKILL');
      await replay.close();
      await deleteAccountByEmail(admin(), email).catch(() => {});
    }
  });

  test('the provider credential rotated, the provider gone, the source paused and its prior configuration restored: the last values stay on air', async ({ baseURL }) => {
    test.setTimeout(120_000);
    const email = `e2e-connector-rotate-${Date.now()}@noacg.invalid`;
    const owner = await mintAccount(admin(), email, `pw-${makeToken()}`);
    let replay = await provider(dir);
    const port = Number(new URL(replay.url).port);
    const address = `${baseURL}/api/data/source`;
    const started: ReturnType<typeof agent>[] = [];
    try {
      const showId = await serviceProduction(owner);
      const { data_key: dataKey } = await tree(showId);
      const first = agent(dir, replay, dataKey, address);
      started.push(first);
      await expect.poll(async () => (await rows(showId)).length, { timeout: 20_000 }).toBe(1);
      // A field connected after that revision is filled from it at the next receipt, with no new
      // revision: the route evaluates the accepted payload again.
      const before = await snapshot(showId);
      await admin().from('control_shows').update({ bindings: { ...BINDINGS, Board: { f0: 'external.e1.revision' } } }).eq('id', showId);
      await expect.poll(async () => (await rows(showId)).find((r) => 'f0' in r.data && r.data.f0 === '1')?.src ?? null, { timeout: 25_000 }).toBe('api');
      expect((await snapshot(showId))?.accepted_revision).toBe(before!.accepted_revision);
      const filled = (await rows(showId)).length;
      const lastF1 = async () => (await rows(showId)).filter((r) => 'f1' in r.data).at(-1)!.data.f1;
      const onAir = (await tree(showId)).data.external?.e1;

      // The provider goes away (the network): failed reads, nothing written, the values hold.
      await replay.close();
      await expect.poll(async () => (await snapshot(showId))?.status.state, { timeout: 15_000 }).toBe('failed');
      // Back with a NEW credential: the running agent is denied, still writing nothing.
      replay = await provider(dir, port);
      await expect.poll(async () => (await snapshot(showId))?.status.state, { timeout: 30_000 }).toBe('denied');
      expect((await rows(showId)).length).toBe(filled);
      expect((await tree(showId)).data.external?.e1).toEqual(onAir);
      // Restarted with the rotated credential (the documented step), it reads and writes again.
      await first.stop();
      const rebound = agent(dir, replay, dataKey, address);
      started.push(rebound);
      replay.at(1);
      await expect.poll(lastF1, { timeout: 20_000 }).toContain(AINO(3700));
      expect(rebound.log()).not.toContain(replay.token);

      // Disabled: the source paused in the production. The agent keeps its revision; nothing airs.
      const setEntry = async (edit: (entry: Record<string, unknown>) => Record<string, unknown>) => {
        const { sources } = await tree(showId);
        const { error } = await admin().from('control_shows').update({ sources: sources.map((s) => edit(s as unknown as Record<string, unknown>)) }).eq('id', showId);
        if (error) throw new Error(error.message);
      };
      const held = (await rows(showId)).length;
      await setEntry((e) => ({ ...e, paused: true }));
      replay.at(3);
      await expect.poll(() => rebound.log(), { timeout: 15_000 }).toMatch(/not taken \(409 paused\)/);
      expect((await rows(showId)).length).toBe(held);
      // Resumed: the kept revision lands once.
      await setEntry((e) => ({ ...e, paused: false }));
      await expect.poll(lastF1, { timeout: 15_000 }).toContain(AINO(3680));
      expect((await rows(showId)).filter((r) => 'f1' in r.data && r.data.f1.includes(AINO(3680))).length).toBe(1);

      // Another configuration revision in the production refuses the agent's (and takes its fence);
      // the prior configuration restored, it claims again and carries on. The values stay meanwhile.
      const kept = (await tree(showId)).data.external?.e1;
      await setEntry((e) => ({ ...e, config: { ...REGISTRATION, configRevision: 2 } }));
      replay.at(6);
      await expect.poll(() => rebound.log(), { timeout: 15_000 }).toMatch(/not claimed \(409 config\)/);
      expect((await tree(showId)).data.external?.e1).toEqual(kept);
      await setEntry((e) => ({ ...e, config: REGISTRATION }));
      await expect.poll(lastF1, { timeout: 20_000 }).not.toContain('FI2027_02_104');
      expect((await snapshot(showId))?.owner_epoch).toBe(3);
      await rebound.stop();
    } finally {
      for (const a of started) await a.stop('SIGKILL');
      await replay.close().catch(() => {});
      await deleteAccountByEmail(admin(), email).catch(() => {});
    }
  });

  test('a sample through the agent: the page asks, the agent reads with its own credential, nothing applies until Connect, and no credential reaches the page or the export', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const replay = await provider(dir);
    let running: ReturnType<typeof agent> | null = null;
    try {
      await signIn(page);
      await page.keyboard.press('Escape');
      await clearPublishedShows(page);
      await wipeMyGraphics(page);
      await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
      const showId = await openProductionWithCurrent(page, `Sample ${Date.now()}`);
      await publishProduction(page);
      await page.keyboard.press('Escape');
      const registered = await page.evaluate(async ({ id, registration }) => {
        const { connectShowSource } = await import('/src/model/shows.ts');
        const source = { id: 'e1', kind: 'external' as const, label: 'Results', config: registration };
        return connectShowSource(id, source, [{ graphic: 'Hairline', fieldId: 'f0', path: 'external.e1.status' }]).error;
      }, { id: showId, registration: REGISTRATION });
      expect(registered).toBeNull();
      await expect.poll(async () => (await tree(showId)).sources?.map((s) => s.id), { timeout: 15_000 }).toEqual(['e1']);
      const { data_key: dataKey } = await tree(showId);
      running = agent(dir, replay, dataKey, `${baseURL}/api/data/source`);
      await expect.poll(async () => (await rows(showId)).length, { timeout: 20_000 }).toBe(1);
      const before = await rows(showId);
      const treeBefore = (await tree(showId)).data;

      // The review asks; the agent hears it with its next claim renewal or report and posts one.
      await page.getByTestId('cue-connect').click();
      const review = page.getByTestId('cue-connect-menu');
      await review.getByTestId('cue-connect-reuse').selectOption({ label: 'Connector: Results' });
      await expect(review.getByTestId('cue-connect-map')).toBeVisible({ timeout: 45_000 });
      await expect(review.getByTestId('cue-connect-pick-f0')).toHaveValue('external.e1.status');
      await expect(review.getByTestId('cue-connect-row-f0')).toContainText('PRELIMINARY · DEMO');
      await expect.poll(() => running!.log(), { timeout: 5_000 }).toContain('e1 sample posted');
      const { data: kept } = await admin().from('production_source_snapshots').select('payload, status').eq('show_id', showId).eq('source_id', 'e1.sample').single();
      expect(Object.keys(kept!.payload as object).sort()).toEqual(['candidates', 'revision', 'status']);
      // Stored for preview only: no row, no tree write, and the source's own snapshot untouched.
      expect(await rows(showId)).toEqual(before);
      expect((await tree(showId)).data).toEqual(treeBefore);

      await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'revision' });
      await review.getByTestId('cue-connect-confirm').click();
      await expect(review).toBeHidden();
      // The recipe reaches the production's record, stamped with its config revision...
      await expect
        .poll(async () => (await tree(showId)).sources?.[0]?.config, { timeout: 15_000 })
        .toEqual({ ...REGISTRATION, lists: undefined, mapping: { v: 1, sourceId: 'e1', configRevision: 1, outputs: { status: { from: 'status' }, revision: { from: 'revision' } } } } as never);
      // ...and the new connection fills at the agent's next read (a receipt, at most 15 s): its
      // path was never written, so the unchanged payload is evaluated for it.
      await expect.poll(async () => (await tree(showId)).data.external?.e1?.revision, { timeout: 30_000 }).toBe(String((kept!.payload as { revision: number }).revision));
      expect((await rows(showId)).at(-1)!.data).toEqual({ f1: String((kept!.payload as { revision: number }).revision) });

      // No credential anywhere the page or a package can show.
      const exported = await page.evaluate(async (sid) => {
        const { loadShows } = await import('/src/model/shows.ts');
        const { buildShowZip } = await import('/src/export/showExport.ts');
        const zip = await buildShowZip(loadShows().find((s) => s.id === sid)!);
        return (await Promise.all(Object.values(zip.files).filter((f) => !f.dir).map((f) => f.async('string')))).join('\n');
      }, showId);
      expect(exported).toContain('The connector Results');
      for (const text of [await page.content(), exported, JSON.stringify(kept), JSON.stringify((await tree(showId)).sources), running.log()]) {
        expect(text).not.toContain(replay.token);
      }
      expect(JSON.stringify(kept)).not.toContain(dataKey);
    } finally {
      await running?.stop();
      await replay.close();
      await clearPublishedShows(page).catch(() => {});
      await wipeMyGraphics(page).catch(() => {});
    }
  });
});

