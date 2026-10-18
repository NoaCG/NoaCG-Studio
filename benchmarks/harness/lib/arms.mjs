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
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, CLI_ENTRY } from './cli.mjs';
import { checkSubscriptionAuth, runClaudeAsync, subscriptionEnv } from './subscription.mjs';
import { traceMetrics, transcriptReads, transcriptUsd } from './trace.mjs';

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
  // The forced look (docs/work-specs/harness-ladder/spec.md D1), as a perfect agent does it: the
  // coverage, every frame it lists opened and found airable, the record handed in with the review.
  const coverageDir = path.join(outputsDir, 'coverage');
  const coverage = await step(['coverage', graphic, '--out', coverageDir, '--json']);
  if (!existsSync(path.join(coverageDir, 'review.json'))) throw new Error(`coverage wrote no review.json: ${coverage.stderr.slice(-400)}`);
  const review = JSON.parse(readFileSync(path.join(coverageDir, 'review.json'), 'utf8'));
  const reads = review.frames.map((f) => path.join(coverageDir, f.file));
  writeFileSync(path.join(coverageDir, 'review.json'), `${JSON.stringify({ ...review, frames: review.frames.map((f) => ({ ...f, verdict: 'ok' })) }, null, 2)}\n`);
  const recordFile = path.join(outputsDir, 'record.json');
  const record = await step(['record', graphic, '--out', recordFile, '--review', path.join(coverageDir, 'review.json'), '--json']);
  if (record.code !== 0) throw new Error(`record failed: ${(record.json?.problems ?? []).join('; ') || record.stderr.slice(-400)}`);
  return { commands, reviewedDigest: coverage.json?.digest ?? validate.json?.digest ?? null, recordFile, zipFile: record.json?.zip ?? path.join(outputsDir, 'record.zip'), reads };
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
        reads: work.reads,
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
export function managedAgentsArm({ id = 'managed-agents', api, client, agent, environmentId, budgetCents, model, modelOverride = null, funding = 'credit', files = [], upload = null, downloadAll = false, pollMs = 5000, hardCapMinutes = 15, listRetries = 3, adopt = {} }) {
  return {
    id,
    funding,
    model: modelOverride?.id ?? model,
    async run({ brief, cellDir, runId }) {
      let started = Date.now();
      const outputs = path.join(cellDir, 'outputs');
      mkdirSync(outputs, { recursive: true });
      const mounted = [];
      const dropMounted = () => Promise.all(mounted.map((m) => api.beta.files.delete(m.fileId).catch(() => undefined)));
      let sessionId;
      try {
        if (adopt[brief.id]) {
          // A session this arm created in a run that was stopped while it worked: taken over as it
          // stands, never created again, its wall counted from its creation.
          sessionId = adopt[brief.id];
          started = Date.parse((await api.beta.sessions.retrieve(sessionId)).created_at);
        } else {
          if (brief.mounts?.length && !upload) throw new Error(`brief ${brief.id} mounts files, and this arm has no upload`);
          for (const m of brief.mounts ?? []) mounted.push({ fileId: await upload(m.file), mountPath: m.mountPath });
          // A brief may name its own environment (H3's `packages` proof) and go without the tarball.
          ({ sessionId } = await client.startSession(api, { agent, environmentId: brief.environmentId ?? environmentId, brief: brief.prompt, type: brief.type, budgetCents, runId, files: [...(brief.withoutCli ? [] : files), ...mounted], ...(modelOverride ? { model: modelOverride } : {}) }));
        }
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
      const undownloadable = [];
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
          // The list by session also holds the session's copies of mounted files, which the
          // Files API refuses to download (`file_not_downloadable`): only what the agent wrote.
          // The list keeps only base names, so a second file of one name is kept beside the first
          // under its id rather than over it. A file that fails to download is named, and never
          // turns a collected hand-in into a failure.
          for (const f of listed.filter((x) => x.downloadable !== false && x !== record && x !== zip)) {
            const name = f.filename.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..').join('_') || f.id;
            let target = path.join(outputs, 'all', name);
            if (existsSync(target)) target = path.join(outputs, 'all', `${f.id}-${name}`);
            mkdirSync(path.dirname(target), { recursive: true });
            try {
              writeFileSync(target, await client.downloadFile(api, f.id));
            } catch {
              undownloadable.push(f.filename);
            }
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
        // A subagent (the critic, D4) works in its own thread, whose requests the session's stream
        // does not carry: each child thread's events and usage are kept and measured beside it.
        const threads = await sessionThreads(api, sessionId, { cellDir, model: modelOverride?.id ?? model });
        if (threads.length) metrics.threads = threads;
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
        ...(undownloadable.length ? { undownloadable } : {}),
        cleanup,
      };
    },
  };
}

/**
 * The session's child threads (a subagent's work), each with its usage, its own list cost and what
 * its events measure (lib/trace.mjs), its raw events kept as `threads/<thread id>.events.jsonl`.
 * Empty for a session with no subagent, or an api without threads (the stub).
 */
export async function sessionThreads(api, sessionId, { cellDir, model }) {
  if (!api.beta.sessions.threads?.list) return [];
  const out = [];
  for await (const thread of api.beta.sessions.threads.list(sessionId)) {
    if (!thread.parent_thread_id) continue;
    const events = [];
    for await (const e of api.beta.sessions.threads.events.list(thread.id, { session_id: sessionId, limit: 1000 })) events.push(e);
    mkdirSync(path.join(cellDir, 'threads'), { recursive: true });
    writeFileSync(path.join(cellDir, 'threads', `${thread.id}.events.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
    const { steps: _steps, ...measured } = traceMetrics({ events, createdAt: thread.created_at, model, usage: thread.usage });
    out.push({ id: thread.id, agent: thread.agent?.name ?? thread.agent?.type ?? null, status: thread.status, usage: thread.usage, stats: thread.stats, ...measured });
  }
  return out;
}

// ── the archived reference arm ────────────────────────────────────────────────────────────

/** Where the 2026-08-22 agent round keeps its cells (4.2): `<brief>.<configuration>/graphic`. */
export const AUGUST_CELLS = path.join(process.env.NOACG_BENCH_ARCHIVE || 'C:\\claude\\noacg-bench-archive', 'agent-round-2026-08-22', 'cells');

/**
 * The reference for the v1 briefs (4.2): Claude Code's graphic from the August round, re-captured
 * at zero cost. Its sources are copied, validated and recorded here, the last two commands a
 * session would have run, so the shared half (capture, shape, gate, judge) sees it as it sees any
 * arm's hand-in. `configuration` is the round's arm letter (A: the contract-only skill with free
 * design, the default the round's verdict kept).
 */
export function archivedArm({ cellsDir = AUGUST_CELLS, configuration = 'A' } = {}) {
  return {
    id: `august-${configuration}`,
    funding: 'none',
    model: null,
    async run({ brief, cellDir, cli }) {
      const started = Date.now();
      const source = path.join(cellsDir, `${brief.id}.${configuration}`, 'graphic');
      if (!existsSync(source)) throw new Error(`no archived cell ${brief.id}.${configuration} under ${cellsDir}`);
      const graphic = path.join(cellDir, 'work', 'graphic');
      const outputs = path.join(cellDir, 'outputs');
      mkdirSync(outputs, { recursive: true });
      cpSync(source, graphic, { recursive: true });
      // The first validate regenerates an August package's generated half in place (digest.ts), so
      // the version recorded and captured is the one the second validate reviews.
      await cli(['validate', graphic, '--json'], { cwd: cellDir });
      const validate = await cli(['validate', graphic, '--json'], { cwd: cellDir });
      const recordFile = path.join(outputs, 'record.json');
      const record = await cli(['record', graphic, '--out', recordFile, '--json'], { cwd: cellDir });
      if (record.code !== 0) throw new Error(`record failed on ${brief.id}.${configuration}: ${record.stderr.slice(-400)}`);
      return {
        outcome: 'delivered',
        recordFile,
        zipFile: record.json?.zip ?? path.join(outputs, 'record.zip'),
        trace: [{ command: 'noacg validate (after the regenerating one)', code: validate.code, digest: validate.json?.digest ?? null }, { command: 'noacg record', code: record.code, digest: record.json?.digest ?? null }],
        reviewedDigest: validate.json?.digest ?? null,
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

/**
 * One `claude -p` session on the owner's subscription, as both subscription-funded arms run it:
 * in `sessionDir` outside the repository, the CLI on PATH behind the call-keeping shim, the 5.4
 * environment built from scratch with a fresh home, the subscription checked once before the
 * first session. `outsideOnly` is the refusal for a session directory inside the repository.
 */
function subscriptionSessions({ claude, token, url, run, outsideOnly }) {
  const system = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin';
  const envFor = (home, binDir) => subscriptionEnv({ token, home, noacgUrl: url, pathDirs: [binDir, path.dirname(process.execPath), path.dirname(claude), system] });
  let authChecked = false;
  return {
    /** The subscription's check, made before a build's first session of any arm: an arm that
     *  cannot start must not be found out after the credit arm has spent. */
    preflight(dir) {
      return checkSubscriptionAuth({ claude, env: envFor(path.join(dir, 'home'), null), run });
    },
    async session({ sessionDir, prompt, args, timeoutMinutes }) {
      if (path.resolve(sessionDir).startsWith(ROOT + path.sep)) throw new Error(outsideOnly);
      const work = path.join(sessionDir, 'work');
      const binDir = path.join(sessionDir, 'bin');
      const ledgerFile = path.join(sessionDir, 'calls.jsonl');
      mkdirSync(path.join(work, 'outputs'), { recursive: true });
      writeShim(binDir, ledgerFile);
      const env = envFor(path.join(sessionDir, 'home'), binDir);
      if (!authChecked) {
        checkSubscriptionAuth({ claude, env, ...(run ? { run } : {}) });
        authChecked = true;
      }
      writeFileSync(path.join(sessionDir, 'prompt.md'), prompt);
      const base = ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep'];
      // Not blocking: a build runs a subscription arm beside the credit arm, whose session it polls.
      const r = await runClaudeAsync({ claude, args: [...base, ...args], env, cwd: work, input: prompt, timeoutMs: timeoutMinutes * 60_000, ...(run ? { run } : {}) });
      writeFileSync(path.join(sessionDir, 'claude.json'), r.stdout);
      const calls = readShimLedger(ledgerFile);
      const recordFile = path.join(work, 'outputs', 'record.json');
      const recorded = existsSync(recordFile);
      return {
        r,
        env,
        recorded,
        paused: r.paused ? `the subscription's usage limit${r.paused.resetsAt ? `, resets ${r.paused.resetsAt}` : ''}` : null,
        handedIn: {
          resetsAt: r.paused?.resetsAt ?? null,
          recordFile: recorded ? recordFile : null,
          zipFile: recorded ? path.join(work, 'outputs', 'record.zip') : null,
          trace: calls.map((c) => ({ command: `noacg ${c.args.join(' ')}`, code: c.exit, digest: c.digest })),
          reviewedDigest: lastReviewed(calls),
          costCents: 0,
          wallSeconds: Math.round(r.ms / 1000),
          sessionId: r.sessionId,
          saveAttempts: calls.filter((c) => c.args[0] === 'save' || c.args[0] === 'login').length,
          cleanup: null,
        },
      };
    },
  };
}

export function claudeCodeArm({ claude, token, model, url, pluginDir = path.join(ROOT, 'cli', 'plugin'), timeoutMinutes = 25, run } = {}) {
  const sessions = subscriptionSessions({ claude, token, url, run, outsideOnly: `the reference session must run outside the repository (${ROOT}), or it loads this repo's instructions` });
  return {
    id: 'claude-code',
    funding: 'subscription',
    model,
    preflight: sessions.preflight,
    async run({ brief, cellDir }) {
      const args = ['--plugin-dir', pluginDir, '--strict-mcp-config', ...(model ? ['--model', model] : [])];
      const { r, recorded, paused, handedIn } = await sessions.session({ sessionDir: path.join(cellDir, 'reference'), prompt: referencePrompt(brief), args, timeoutMinutes });
      return {
        ...handedIn,
        outcome: r.paused ? 'paused' : recorded ? 'delivered' : 'failed',
        reason: paused ?? (recorded ? null : r.timedOut ? 'timed out' : 'no record handed in'),
        notionalUsd: r.notionalUsd ?? null,
        model,
      };
    },
  };
}

// ── the subscription arm (docs/work-specs/harness-ladder/spec.md D2) ──────────────────────────

/**
 * What a ladder session receives: the brief as the harness's user message carries it
 * (api/_lib/harness/client.ts `briefMessage`), then the system prompt's plumbing on local paths
 * (agents/noacg-harness/agent.md): the same hand-in, the same ten-minute aim.
 */
export function ladderPrompt(brief) {
  return [
    `Brief: ${brief.prompt.trim()}`,
    ...(brief.type ? [`Graphic type: ${brief.type} (the user chose it).`] : []),
    '',
    'You make this one broadcast graphic for NoaCG Studio. The `noacg-graphic` skill is how; the `noacg` CLI is on PATH and already points at the deployment to use. Work in `./graphic`. Never run `noacg save` or `noacg login`: nothing is saved from here; the host saves what you hand in.',
    '',
    'Aim to finish within ten minutes; the session stops at twenty.',
    '',
    "Hand in as the skill's `references/hand-in.md` says: the coverage with `noacg coverage ./graphic --out ./outputs/coverage`, the record with `noacg record ./graphic --out ./outputs/record.json --review ./outputs/coverage/review.json`. The last record is what the host takes. End with one line: `DELIVERED`, or `NOT READY: <why>`.",
  ].join('\n');
}

/** The session's own transcript, which Claude Code keeps under the child's config directory. A
 *  session stopped at its time limit printed no id, and its fresh home holds its one transcript. */
export function findTranscript(configDir, sessionId) {
  const projects = path.join(configDir, 'projects');
  if (!existsSync(projects)) return null;
  const all = readdirSync(projects).flatMap((dir) => readdirSync(path.join(projects, dir)).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(projects, dir, f)));
  if (sessionId) return all.find((f) => path.basename(f) === `${sessionId}.jsonl`) ?? null;
  return all.length === 1 ? all[0] : null;
}

/** What the session said it handed in: its last line, `DELIVERED` or `NOT READY: <why>`. */
export function handInLine(result) {
  const last = String(result ?? '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? '';
  // The prompt shows the word in backticks, and a model may bold it: both are the same line.
  return /^[`*]*DELIVERED\b/.test(last) ? 'delivered' : /^[`*]*NOT READY\b/.test(last) ? 'not-ready' : null;
}

/** The session's whole closing message: `readRun` keeps only its first 4,000 characters, and the
 *  hand-in line is the last one. */
function closingMessage(r) {
  try {
    const result = JSON.parse(r.stdout)?.result;
    return typeof result === 'string' ? result : r.result;
  } catch {
    return r.result;
  }
}

/**
 * The ladder's arm: one `claude -p` per brief on the owner's subscription, the checkout's CLI build
 * on PATH behind the call-keeping shim, the checkout's skill as the plugin, `--model` and
 * `--effort` the rung's, no web, in the 5.4 isolation, outside the repository; stopped at 20
 * minutes. Its cost is Claude Code's notional `total_cost_usd`, never the credit's. The frames it
 * opened come from its transcript.
 */
export function subscriptionArm({ claude, token, model, effort = null, url, pluginDir = path.join(ROOT, 'cli', 'plugin'), timeoutMinutes = 20, run } = {}) {
  if (!model) throw new Error('the subscription arm needs --model, the rung\'s model id');
  const sessions = subscriptionSessions({ claude, token, url, run, outsideOnly: `a ladder session runs outside the repository (${ROOT}), or it loads this repo's instructions` });
  return {
    id: 'subscription',
    funding: 'subscription',
    model,
    effort,
    preflight: sessions.preflight,
    async run({ brief, cellDir }) {
      const args = ['--disallowedTools', 'WebFetch,WebSearch', '--plugin-dir', pluginDir, '--strict-mcp-config', '--model', model, ...(effort ? ['--effort', effort] : [])];
      const { r, env, recorded, paused, handedIn } = await sessions.session({ sessionDir: path.join(cellDir, 'session'), prompt: ladderPrompt(brief), args, timeoutMinutes });
      const transcript = findTranscript(env.CLAUDE_CONFIG_DIR, r.sessionId);
      const transcriptText = transcript ? readFileSync(transcript, 'utf8') : '';
      // A session stopped at its limit printed no cost: its transcript's usage at list prices stands in.
      const notionalUsd = r.notionalUsd ?? (transcript ? transcriptUsd(transcriptText, model) : null);
      const said = handInLine(closingMessage(r));
      const outcome = r.paused ? 'paused' : !recorded ? 'failed' : said === 'delivered' && !r.timedOut ? 'delivered' : 'not-ready';
      const reason = paused ?? (r.timedOut ? `stopped at ${timeoutMinutes} minutes` : !recorded ? 'no record handed in' : outcome === 'not-ready' ? (said === 'not-ready' ? 'the session said NOT READY' : 'the session ended without DELIVERED') : null);
      return {
        ...handedIn,
        outcome,
        reason,
        reads: transcriptReads(transcriptText),
        readsBack: transcriptReads(transcriptText, { back: true }),
        transcript,
        notionalUsd,
        ...(r.notionalUsd === null && notionalUsd !== null ? { notionalFrom: 'transcript' } : {}),
        model,
        effort,
        turns: r.turns,
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

/** The name `npm pack` gives the CLI (cli/package.json's name), which the bench uploads it under. */
const CLI_UPLOAD_NAME = /^noacg-cli-.+\.tgz$/;

/** Delete the CLI uploads an earlier run left on the workspace, and say which. A stopped run never
 *  reaches the cleanup that deletes its own (H6's first run left one). Bench runs are one at a
 *  time on the bench workspace, so any CLI upload there before a run starts is a leftover. */
export async function deleteLeftCliUploads(api, log = console.log) {
  const left = [];
  for await (const file of api.beta.files.list()) if (CLI_UPLOAD_NAME.test(file.filename)) left.push(file);
  for (const file of left) {
    await api.beta.files.delete(file.id);
    log(`  deleted ${file.id} (${file.filename}, ${file.created_at}), a CLI upload an earlier run left`);
  }
  return left.map((f) => f.id);
}

