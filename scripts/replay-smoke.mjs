#!/usr/bin/env node
// THE REPLAY SMOKE (docs/work-specs/playout-external-connectors/spec.md, phase E4.1): the replay
// server and the headless agent side by side for a few minutes, as `.github/workflows/
// endurance.yml` runs it (`npm run endurance:replay-smoke -- --minutes <n>`).
//
// Each run makes its own certificate and bearer token in a temporary folder, starts the replay
// server on 127.0.0.1 and runs the agent as its own process with the token in its environment,
// polling every second while the timeline moves every 4 s, so every step is read. Then, in this
// process: a wrong token is denied, hosted acquisition of the same loopback server is refused,
// and the exported configuration is unbound and refused by the agent until rebound.
//
// It passes when the agent saw every kind of step (changed, unchanged, stale, invalid), its
// accepted revisions only rose, it ended on revision 5 with the empty collection, and the token
// appears in nothing it wrote. Receipts go to endurance-output/: summary.json, the agent's log and
// its reports with payloads left out. The token itself is never written there.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT = path.join(ROOT, 'scripts/external-data-connector.mjs');
const OUT = path.join(ROOT, 'endurance-output');

const { makeTestCertificate, makeToken, startReplayServer } = await import('./election-replay-server.mjs');
const { createConnector } = await import('./external-data-connector.mjs');
const { parseConnectorConfig } = await import('../src/control/externalSource.ts');

const argv = process.argv.slice(2);
const minutes = Number(argv.includes('--minutes') ? argv[argv.indexOf('--minutes') + 1] : 1);
if (!(minutes > 0)) throw new Error('--minutes must be a positive number');

const work = mkdtempSync(path.join(os.tmpdir(), 'replay-smoke-'));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });

try {
  const { cert, key, certFile } = makeTestCertificate(path.join(work, 'tls'));
  const token = makeToken();
  const server = await startReplayServer({ token, cert, key, stepMs: 4000 });
  try {
    const raw = {
      v: 1,
      sourceId: 'election-replay',
      productionId: 'replay-smoke',
      endpoint: server.url,
      mode: 'local',
      caFile: certFile,
      configRevision: 1,
      credentialRef: 'NOACG_SOURCE_REPLAY_SMOKE',
      credentialBound: true,
      pollMs: 1000,
      revisionPath: 'revision',
      eventTimePath: 'observed_at',
    };
    const configFile = path.join(work, 'connector.json');
    writeFileSync(configFile, JSON.stringify(raw, null, 2));
    const env = { ...process.env, NOACG_SOURCE_REPLAY_SMOKE: token };

    // The agent, headless, for the minutes asked.
    const child = spawn(process.execPath, [AGENT, '--config', configFile, '--minutes', String(minutes)], { env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    // 'close', not 'exit': the last report may still be in the pipe when the process exits.
    const code = await new Promise((resolve) => child.on('close', resolve));
    check('the agent ran for the minutes asked and exited cleanly', code === 0, `exit ${code}`);
    const reports = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const statuses = new Set(reports.map((r) => r.status));
    for (const status of ['changed', 'unchanged', 'stale', 'invalid']) check(`the agent reported ${status}`, statuses.has(status));
    check('no read failed, was denied or refused', !['failed', 'denied', 'refused'].some((s) => statuses.has(s)));
    check('accepted revisions only rose', reports.every((r, i) => i === 0 || r.acceptedRevision >= reports[i - 1].acceptedRevision));
    const last = [...reports].reverse().find((r) => r.status === 'changed');
    check('it ended on revision 5 with the empty collection', last?.acceptedRevision === 5 && last?.providerSequence === 5 && Array.isArray(last?.payload?.candidates) && last.payload.candidates.length === 0);

    // A wrong token, and hosted acquisition of loopback, in this process.
    const parsed = parseConnectorConfig(raw);
    const denied = await createConnector({ config: parsed.config, credential: makeToken(), ca: cert }).readOnce();
    check('a wrong token is denied', denied.status === 'denied', denied.error);
    const hosted = parseConnectorConfig({ ...raw, mode: 'hosted', caFile: null }).config;
    const refused = await createConnector({ config: hosted, credential: token }).readOnce();
    check('hosted acquisition of the loopback server is refused', refused.status === 'refused', refused.error);
    // On its ordinary port the address guard itself decides, through real DNS: localhost is loopback.
    const named = parseConnectorConfig({ ...raw, mode: 'hosted', caFile: null, endpoint: 'https://localhost/results' }).config;
    const loopback = await createConnector({ config: named, credential: token }).readOnce();
    check('hosted acquisition of a name resolving to loopback is refused', loopback.status === 'refused' && /public internet/.test(loopback.error ?? ''), loopback.error);

    // The export is unbound and the agent refuses it.
    const exported = spawnSync(process.execPath, [AGENT, '--config', configFile, '--export'], { env, encoding: 'utf8', windowsHide: true });
    const exportedFile = path.join(work, 'exported.json');
    writeFileSync(exportedFile, exported.stdout);
    const rebind = spawnSync(process.execPath, [AGENT, '--config', exportedFile, '--minutes', '0.01'], { env, encoding: 'utf8', windowsHide: true });
    const exportedConfig = exported.status === 0 ? JSON.parse(exported.stdout) : null;
    check('the export carries the credential name, unbound', exportedConfig?.credentialBound === false && exportedConfig?.credentialRef === raw.credentialRef);
    check('the agent refuses the export until it is rebound', rebind.status === 1 && /rebind/.test(rebind.stderr));

    const kept = {
      'agent.log': stderr,
      'reports.jsonl': reports.map(({ payload, ...rest }) => JSON.stringify({ ...rest, payloadBytes: payload === undefined ? 0 : JSON.stringify(payload).length })).join('\n'),
      'exported-config.json': exported.stdout,
    };
    const written = [stdout, stderr, exported.stdout, exported.stderr, rebind.stderr, ...Object.values(kept)];
    check('the token appears in nothing the agent wrote', written.every((text) => !text.includes(token)));

    mkdirSync(OUT, { recursive: true });
    for (const [name, text] of Object.entries(kept)) writeFileSync(path.join(OUT, name), text);
    const summary = { minutes, reads: reports.length, statuses: [...statuses].sort(), checks, passed: checks.every((c) => c.ok) };
    writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail && !c.ok ? ` (${c.detail})` : ''}`);
    console.log(`${reports.length} reports in ${minutes} min: ${summary.passed ? 'passed' : 'FAILED'}`);
    process.exitCode = summary.passed ? 0 : 1;
  } finally {
    await server.close();
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
