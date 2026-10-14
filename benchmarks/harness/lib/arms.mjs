// THE ARMS (docs/work-specs/noacg-harness/spec.md D5). An arm turns a brief into a handed-in
// graphic and says what that took; everything after it (capture, shape check, judge, gallery,
// ledger) is shared, so a later engine is one more arm and the exam compares like with like.
//
//   fake            zero tokens: scaffolds the brief's type (or its typeless fields), validates
//                   and records it, as a perfect agent's last three commands would. The control
//                   that proves the plumbing before a model is paid.
//   managed-agents  one Claude Managed Agents session per brief through api/_lib/harness/client.ts,
//                   on the bench key's credit; or, in --control, on the stub that replays the
//                   documented event and file shapes with the fake arm's work as its agent.
//   claude-code     the reference (4.2): one fresh `claude -p` per brief on the owner's
//                   subscription, the published plugin loaded with --plugin-dir, the CLI on PATH
//                   behind a shim that keeps every call, in an empty directory outside the repo.
//
// Every arm returns { outcome, recordFile, zipFile, trace, reviewedDigest, costCents, notionalUsd,
// wallSeconds, sessionId, model, cleanup }. `reviewedDigest` is the digest of the last validate
// or coverage the arm's agent ran: the version it last looked at, which the delivered record must
// equal (section 6, proof 2).

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, CLI_ENTRY } from './cli.mjs';
import { checkSubscriptionAuth, runClaude, subscriptionEnv } from './subscription.mjs';
import { traceMetrics } from './trace.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The scaffold a brief starts from: its type's neutral spine, its default design, or its fields. */
export function scaffoldArgs(brief, out) {
  const name = ['--name', `Control ${brief.id}`, '--out', out];
  if (brief.type) return ['scaffold', '--type', brief.type, ...(brief.neutral ? ['--design', 'neutral'] : []), ...name];
  if (brief.fields) return ['scaffold', '--fields', brief.fields, ...name];
  throw new Error(`brief ${brief.id} names neither a type nor typeless fields`);
}

/** A library graphic brief: the hand-written OGraf one is not, and stays out (4.2). */
export const isLibraryBrief = (brief) => brief.kind === 'noacg';

/**
 * The fake agent's work: scaffold, validate, record into `outputsDir`. What it ran comes back as
 * the commands and outputs a session's events would carry.
 */
export async function fakeAgentWork({ brief, workDir, outputsDir, cli }) {
  const graphic = path.join(workDir, 'graphic');
  mkdirSync(workDir, { recursive: true });
  mkdirSync(outputsDir, { recursive: true });
  const commands = [];
  const step = async (args) => {
    const r = await cli(args, { cwd: workDir });
    commands.push({ command: `noacg ${args.join(' ')}`, output: r.stdout || r.stderr, code: r.code, digest: r.json?.digest ?? null });
    return r;
  };
  const scaffold = await step([...scaffoldArgs(brief, graphic), '--json']);
  if (scaffold.code !== 0) throw new Error(`scaffold failed: ${scaffold.stderr.slice(-400)}`);
  const validate = await step(['validate', graphic, '--json']);
  if (validate.code !== 0) throw new Error(`the scaffold does not validate: ${validate.stderr.slice(-400)}`);
  const recordFile = path.join(outputsDir, 'record.json');
  const record = await step(['record', graphic, '--out', recordFile, '--json']);
  if (record.code !== 0) throw new Error(`record failed: ${record.stderr.slice(-400)}`);
  return { commands, reviewedDigest: validate.json?.digest ?? null, recordFile, zipFile: record.json?.zip ?? path.join(outputsDir, 'record.zip') };
}

export function fakeArm() {
  return {
    id: 'fake',
    funding: 'none',
    model: null,
    async run({ brief, cellDir, cli }) {
      const started = Date.now();
      const work = await fakeAgentWork({ brief, workDir: path.join(cellDir, 'work'), outputsDir: path.join(cellDir, 'outputs'), cli });
      return {
        outcome: 'delivered',
        recordFile: work.recordFile,
        zipFile: work.zipFile,
        trace: work.commands.map(({ command, code, digest }) => ({ command, code, digest })),
        reviewedDigest: work.reviewedDigest,
        costCents: 0,
        notionalUsd: 0,
        wallSeconds: Math.round((Date.now() - started) / 1000),
        sessionId: null,
        model: null,
        cleanup: null,
      };
    },
  };
}

/**
 * The managed-agents arm. `api` is a real SDK client on the bench key (`--build`) or the stub
 * (`--control`); `client` is api/_lib/harness/client.ts compiled. Polls until the session is no
 * longer running or the hard cap passes, collects the last record, then deletes the session and
 * its files and checks that both answer not found (section 6, proof 4).
 *
 * `modelOverride` runs the session on another model than the synced agent's (`agent_with_overrides`).
 * A brief may carry `mounts` ([{ file, mountPath }]): local files `upload(file)` puts in the Files
 * API and the session mounts under /mnt/session/uploads/; they are deleted with the session.
 * `downloadAll` keeps every output file (the frames too), not only the record. The session's events
 * are kept beside the cell (`events.jsonl`) with what they measure (`trace.json`, lib/trace.mjs).
 */
export function managedAgentsArm({ api, client, agent, environmentId, budgetCents, model, modelOverride = null, funding = 'credit', files = [], upload = null, downloadAll = false, pollMs = 5000, hardCapMinutes = 15, listRetries = 3 }) {
  return {
    id: 'managed-agents',
    funding,
    model: modelOverride?.id ?? model,
    async run({ brief, cellDir, runId }) {
      const started = Date.now();
      const outputs = path.join(cellDir, 'outputs');
      mkdirSync(outputs, { recursive: true });
      const mounted = [];
      for (const m of brief.mounts ?? []) mounted.push({ fileId: await upload(m.file), mountPath: m.mountPath });
      const dropMounted = () => Promise.all(mounted.map((m) => api.beta.files.delete(m.fileId).catch(() => undefined)));
      let sessionId;
      try {
        // A brief may name its own environment (H3's `packages` proof) and go without the tarball.
        ({ sessionId } = await client.startSession(api, { agent, environmentId: brief.environmentId ?? environmentId, brief: brief.prompt, type: brief.type, budgetCents, runId, files: [...(brief.withoutCli ? [] : files), ...mounted], ...(modelOverride ? { model: modelOverride } : {}) }));
      } catch (e) {
        await dropMounted();
        throw e;
      }
      const settle = { pollMs: Math.min(pollMs, 2000) };
      // From here on the session exists and may be spending: whatever fails, it is stopped,
      // its cost read once it is final, and it is deleted, and the cell names it.
      let failure = null;
      let timedOut = false;
      let listed = [];
      let record = null;
      let zip = null;
      let collected = false;
      try {
        // Poll the status alone; the events are read once, at the end.
        while (['running', 'rescheduling'].includes(await client.sessionStatus(api, sessionId))) {
          if (Date.now() - started > hardCapMinutes * 60_000) {
            timedOut = true;
            break;
          }
          await sleep(pollMs);
        }
        // Past the hard cap the session is interrupted and waited for before its cost is read.
        await client.settleSession(api, sessionId, settle);
        // Output files appear a few seconds after the idle; list again before calling one missing.
        listed = await client.listOutputs(api, sessionId);
        for (let i = 0; i < listRetries && !client.handIn(listed).record; i++) {
          await sleep(Math.min(pollMs, 2000));
          listed = await client.listOutputs(api, sessionId);
        }
        ({ record, zip } = client.handIn(listed));
        await Promise.all([[record, 'record.json'], [zip, 'record.zip']].filter(([f]) => f).map(async ([f, name]) => writeFileSync(path.join(outputs, name), await client.downloadFile(api, f.id))));
        collected = Boolean(record && zip);
        if (downloadAll) {
          for (const f of listed) {
            const parts = f.filename.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..');
            const target = path.join(outputs, 'all', ...parts);
            mkdirSync(path.dirname(target), { recursive: true });
            writeFileSync(target, await client.downloadFile(api, f.id));
          }
        }
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
      }
      const final = await client.readSession(api, sessionId).catch((e) => {
        failure = failure ?? `the session could not be read: ${e instanceof Error ? e.message : String(e)}`;
        return null;
      });
      // What the session did, kept before the delete takes its events with it.
      let metrics = null;
      try {
        const session = await api.beta.sessions.retrieve(sessionId);
        const events = [];
        for await (const e of api.beta.sessions.events.list(sessionId, { limit: 1000 })) events.push(e);
        writeFileSync(path.join(cellDir, 'events.jsonl'), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
        metrics = traceMetrics({ events, createdAt: session.created_at, model: modelOverride?.id ?? model, usage: session.usage });
        writeFileSync(path.join(cellDir, 'trace.json'), `${JSON.stringify({ sessionId, createdAt: session.created_at, usage: session.usage, ...metrics }, null, 2)}\n`);
      } catch (e) {
        metrics = { error: e instanceof Error ? e.message : String(e) };
      }
      let cleanup = null;
      try {
        const disposed = await client.disposeSession(api, sessionId, settle);
        cleanup = { ...disposed, sessionGone: await client.sessionGone(api, sessionId), filesLeft: await client.listOutputs(api, sessionId).then((f) => f.length, (e) => `the list answered ${e?.status ?? ''} ${e instanceof Error ? e.message : String(e)}`.trim()) };
      } catch (e) {
        cleanup = { error: e instanceof Error ? e.message : String(e), sessionGone: false };
      }
      await dropMounted();
      const state = failure || timedOut || !final ? 'failed' : final.completion.state;
      const outcome = state === 'delivered' && collected ? 'delivered' : state === 'not-ready' && collected ? 'not-ready' : 'failed';
      return {
        outcome,
        reason: failure ?? (timedOut ? 'the hard time cap passed' : final.completion.reason ?? (record ? null : 'no record handed in')),
        recordFile: collected ? path.join(outputs, 'record.json') : null,
        zipFile: collected ? path.join(outputs, 'record.zip') : null,
        trace: (final?.digests ?? []).map(({ command, digest }) => ({ command, digest })),
        progress: final?.progress ?? [],
        lastMessage: final?.lastMessage ?? null,
        reviewedDigest: final?.lastReviewedDigest ?? null,
        costCents: final?.costCents ?? 0,
        costUnread: !final,
        notionalUsd: 0,
        wallSeconds: Math.round((Date.now() - started) / 1000),
        sessionId,
        model: modelOverride?.id ?? model,
        metrics,
        outputsListed: listed.map((f) => f.filename),
        cleanup,
      };
    },
  };
}

// ── the reference arm ──────────────────────────────────────────────────────────────────────

/** What the reference session receives: the brief as a user types it, the bench's bookkeeping. */
export function referencePrompt(brief) {
  return [
    `Make a NoaCG graphic: ${brief.prompt}`,
    '',
    'Use the `noacg-graphic` skill (it is installed in this session) and the `noacg` CLI, which is on PATH and already points at the NoaCG deployment to use (NOACG_URL is set). Work in the directory `./graphic` inside the current working directory.',
    '',
    'Finish when `noacg validate ./graphic --screenshots ./shots` reports no errors and you have looked at the frames and would air it. Then hand it in with `noacg record ./graphic --out ./outputs/record.json`. Do NOT run `noacg save` or `noacg login`: nothing is saved from this session. End with one short paragraph: what you made, what the operator can change and do.',
  ].join('\n');
}

/** `noacg` on the child's PATH: runs the built CLI, keeps every call and the digest it printed. */
export function writeShim(binDir, ledgerFile, entry = CLI_ENTRY) {
  mkdirSync(binDir, { recursive: true });
  const node = process.execPath;
  const js = path.join(binDir, 'noacg-ledger.mjs');
  writeFileSync(js, `// Keep every noacg call of this session, then pass the real CLI's output and exit code through.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const started = Date.now();
const r = spawnSync(${JSON.stringify(node)}, [${JSON.stringify(entry)}, ...args], { stdio: ['inherit', 'pipe', 'pipe'], env: process.env, maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
const digest = /sha256:[0-9a-f]{64}/.exec(String(r.stdout ?? '') + String(r.stderr ?? ''));
appendFileSync(${JSON.stringify(ledgerFile)}, JSON.stringify({ at: new Date(started).toISOString(), ms: Date.now() - started, args, exit: r.status ?? 1, digest: digest ? digest[0] : null }) + '\\n');
process.exit(r.status ?? 1);
`);
  writeFileSync(path.join(binDir, 'noacg'), `#!/bin/sh\nexec "${node.replace(/\\/g, '/')}" "${js.replace(/\\/g, '/')}" "$@"\n`);
  try {
    chmodSync(path.join(binDir, 'noacg'), 0o755);
  } catch {
    /* windows */
  }
  writeFileSync(path.join(binDir, 'noacg.cmd'), `@echo off\r\n"${node}" "${js}" %*\r\n`);
}

export function readShimLedger(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/** The digest of the last validate or coverage in a shim ledger: what the session last looked at. */
export function lastReviewed(calls) {
  let digest = null;
  for (const c of calls) if ((c.args[0] === 'validate' || c.args[0] === 'coverage') && c.digest) digest = c.digest;
  return digest;
}

export function claudeCodeArm({ claude, token, model, url, pluginDir = path.join(ROOT, 'cli', 'plugin'), timeoutMinutes = 25, run } = {}) {
  let authChecked = false;
  return {
    id: 'claude-code',
    funding: 'subscription',
    model,
    async run({ brief, cellDir }) {
      const sessionDir = path.join(cellDir, 'reference');
      if (path.resolve(sessionDir).startsWith(ROOT + path.sep)) throw new Error(`the reference session must run outside the repository (${ROOT}), or it loads this repo's instructions`);
      const work = path.join(sessionDir, 'work');
      const binDir = path.join(sessionDir, 'bin');
      const ledgerFile = path.join(sessionDir, 'calls.jsonl');
      mkdirSync(path.join(work, 'outputs'), { recursive: true });
      writeShim(binDir, ledgerFile);
      const system = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin';
      const env = subscriptionEnv({ token, home: path.join(sessionDir, 'home'), noacgUrl: url, pathDirs: [binDir, path.dirname(process.execPath), path.dirname(claude), system] });
      if (!authChecked) {
        checkSubscriptionAuth({ claude, env, ...(run ? { run } : {}) });
        authChecked = true;
      }
      const prompt = referencePrompt(brief);
      writeFileSync(path.join(sessionDir, 'prompt.md'), prompt);
      const args = ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--plugin-dir', pluginDir, '--strict-mcp-config', ...(model ? ['--model', model] : [])];
      const r = runClaude({ claude, args, env, cwd: work, input: prompt, timeoutMs: timeoutMinutes * 60_000, ...(run ? { run } : {}) });
      writeFileSync(path.join(sessionDir, 'claude.json'), r.stdout);
      const calls = readShimLedger(ledgerFile);
      const recordFile = path.join(work, 'outputs', 'record.json');
      const delivered = existsSync(recordFile);
      return {
        outcome: r.paused ? 'paused' : delivered ? 'delivered' : 'failed',
        reason: r.paused ? `the subscription's usage limit${r.paused.resetsAt ? `, resets ${r.paused.resetsAt}` : ''}` : delivered ? null : r.timedOut ? 'timed out' : 'no record handed in',
        resetsAt: r.paused?.resetsAt ?? null,
        recordFile: delivered ? recordFile : null,
        zipFile: delivered ? path.join(work, 'outputs', 'record.zip') : null,
        trace: calls.map((c) => ({ command: `noacg ${c.args.join(' ')}`, code: c.exit, digest: c.digest })),
        reviewedDigest: lastReviewed(calls),
        costCents: 0,
        notionalUsd: r.notionalUsd ?? null,
        wallSeconds: Math.round(r.ms / 1000),
        sessionId: r.sessionId,
        model,
        saveAttempts: calls.filter((c) => c.args[0] === 'save' || c.args[0] === 'login').length,
        cleanup: null,
      };
    },
  };
}

/** The `noacg` npm tarball the container installs while the new verbs are unpublished (D3). */
export function packCli(outDir) {
  mkdirSync(outDir, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['pack', '--pack-destination', outDir, '--json'], { cwd: path.join(ROOT, 'cli'), encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true });
  if (r.status !== 0) throw new Error(`npm pack failed: ${(r.stderr || '').slice(-400)}`);
  // `prepack` (the CLI's build) prints to stdout before npm's JSON: read from the JSON's start.
  const [{ filename }] = JSON.parse(r.stdout.slice(r.stdout.search(/^\[/m)));
  return path.join(outDir, filename);
}

