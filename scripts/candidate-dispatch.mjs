#!/usr/bin/env node
// ONE DISPATCH, ONE ATTRIBUTABLE RUN, ONE COMMIT.
//
//   node scripts/candidate-dispatch.mjs dispatch --ref <branch> [--sha <commit>]
//   node scripts/candidate-dispatch.mjs reconcile <record.json> [--recover]
//
// WHY. Plan-run workers dispatch configured-suite.yml on their reviewed head, and the coordinator
// admits the PR on that run's verdict. A bare `gh workflow run` names a branch, not a commit, and
// the run it started had to be found again by listing - which picks the wrong run when the branch
// moved, when two dispatches overlap, or when a pending run was replaced by a newer one on the same
// branch (run 41197150230, 2026-10-31: cancelled two seconds after the next head was dispatched).
// Grouping by branch (PR #1816) keeps branches apart; it does not say which run answers which
// request. This does, and refuses whenever it cannot.
//
//   - Refuse to dispatch unless the branch head IS the requested commit. The run checks out
//     github.sha, fixed when the dispatch event is created, so the only way to test the wrong
//     commit is to dispatch on a ref that already moved.
//   - Record the intent (ref, commit, time, the dispatch runs already there) BEFORE dispatching,
//     so a lost acknowledgement is reconciled from what was asked, never guessed afterwards.
//   - The existing observation advisory (verification-dispatch.mjs) still runs first and still
//     gates nothing.
//   - The run ID GitHub returns for the dispatch is the ONLY proof of which run answers it;
//     timing, ref and commit never stand in for it. A run on another commit is a mismatch and
//     refused. Without a returned ID (acknowledgement lost, or none sent back) the record never
//     gives a verdict: no new run on the ref in a complete listing SETTLE_MS on is
//     `not-delivered`; any new run makes it `unproven`. Both take `--recover`, a fresh dispatch
//     whose returned ID is the identity. A run that shows up later changes nothing.
//   - Nothing is sent before its claim is on disk, created exclusively: a dispatch's intent
//     record, and for `--recover` a claim on the old record, so a concurrent caller or a restart
//     after the send never sends a second suite.
//   - The one exception, which same-branch supersession needs: a proved run that was cancelled
//     while pending takes its verdict from the other runs of its commit, judged by rule 8 (see
//     settle). That holds only because configured-suite.yml's dispatch takes no inputs and checks
//     out github.sha, so its verdict is a fact about the commit; this helper therefore dispatches
//     that workflow and no other. The answer names the run it used. A run
//     cancelled while pending, with its commit still the branch head and nothing replacing it,
//     is `recover`: `--recover` dispatches it again, once per record. A run someone cancelled
//     after it started is never recovered automatically. A moved head makes the old commit
//     obsolete here: a verdict a checker still needs for it goes through the exact-SHA check
//     branch (check.tmpl).
//
// Output: one JSON line. The exit code is the verdict: 0 only for a finished, passing run on the
// requested commit, covering every run of it (rule 8). 1: a refusal (refused, mismatch,
// unresolved, cancelled after it started) or a failing verdict. 2: no verdict and something to
// do (absent, not-delivered, unproven, recover, obsolete). 3: still running.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagValue, hasFlag } from './jobs-store.mjs';
import { observeVerification } from './verification-dispatch.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REF = /^(?!-)(?!refs\/)[\w./-]+$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
// GitHub creates a dispatch run within seconds; past this a complete listing without it is final.
export const SETTLE_MS = 5 * 60_000;
// The only workflow served: its dispatch takes no inputs, which the supersession exception needs.
export const WORKFLOW = 'configured-suite.yml';
// Clock skew allowed between this machine and GitHub's created_at.
const SKEW_MS = 60_000;
const REFUSALS = ['refused', 'mismatch', 'unresolved', 'cancelled'];
// No verdict for the requested commit yet, and something to do about it.
const ACTION = ['absent', 'not-delivered', 'unproven', 'recover', 'obsolete'];

/** `gh api` adapter: { ok, status, json, error }. A 4xx is a definite answer; anything else is not. */
export function ghApi(method, endpoint, body) {
  const args = ['api', '-X', method, endpoint];
  if (body) args.push('--input', '-');
  const r = spawnSync('gh', args, { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8',
    timeout: 15_000, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
  const status = Number(/HTTP (\d{3})/.exec(r.stderr ?? '')?.[1] ?? 0);
  if (r.error || r.status !== 0) return { ok: false, status, error: String(r.stderr ?? r.error ?? '').trim().slice(0, 300) };
  try { return { ok: true, status: 200, json: r.stdout.trim() ? JSON.parse(r.stdout) : null }; }
  catch { return { ok: false, status: 0, error: 'unparseable response' }; }
}

const summary = (run) => ({ id: run.id, url: run.html_url, head_sha: run.head_sha, head_branch: run.head_branch,
  event: run.event, status: run.status, conclusion: run.conclusion, attempt: run.run_attempt, created_at: run.created_at });
// A raw run carries run_attempt; a summarised one carries attempt.
const attemptOf = (run) => run.run_attempt ?? run.attempt ?? 1;
const since = (intent) => new Date(Date.parse(intent.requestedAt) - SKEW_MS).toISOString();
const sameCheck = (intent, run) => run.event === 'workflow_dispatch' && run.head_sha === intent.sha
  && run.path?.split('@')[0] === `.github/workflows/${intent.workflow}`;
const ownRun = (intent, run) => run.event === 'workflow_dispatch' && run.head_branch === intent.ref
  && run.path?.split('@')[0] === `.github/workflows/${intent.workflow}`;

/** Every dispatch run of the workflow at this commit, on any branch, with no time window. */
function listCommitRuns(api, { repository, workflow, sha }) {
  const r = api('GET', `repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&head_sha=${sha}&per_page=100`);
  if (!r.ok || !Array.isArray(r.json?.workflow_runs)) throw Error('commit run listing unreadable');
  return { runs: r.json.workflow_runs,
    complete: Number.isSafeInteger(r.json.total_count) && r.json.total_count <= r.json.workflow_runs.length };
}

function listDispatchRuns(api, { repository, workflow, ref }, after) {
  const r = api('GET', `repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch`
    + `&branch=${encodeURIComponent(ref)}&created=${encodeURIComponent(`>=${after}`)}&per_page=100`);
  if (!r.ok || !Array.isArray(r.json?.workflow_runs)) throw Error('dispatch run listing unreadable');
  return { runs: r.json.workflow_runs,
    complete: Number.isSafeInteger(r.json.total_count) && r.json.total_count <= r.json.workflow_runs.length };
}

// THE DECISION TABLE (docs/work-specs/cicd-improvement/evidence/phase-ci03.md, section 4). The
// two functions below transcribe it row by row, first matching row wins, and every answer names
// its row. scripts/candidate-dispatch.test.mjs has one test per row.

/** Rows A1-A5: which run answers this record, or why none can be named. Pure. */
export function attribute(intent, { runs, complete }, now) {
  if (intent.runId === undefined) {
    const fresh = runs.filter((run) => ownRun(intent, run) && !intent.priorRunIds.includes(run.id)
      && Date.parse(run.created_at) >= Date.parse(intent.requestedAt) - SKEW_MS);
    if (fresh.length) return { row: 'A1', state: 'unproven', runIds: fresh.map((run) => run.id),
      reason: `no run ID came back for this dispatch and ${fresh.length} new dispatch run(s) exist on ${intent.ref};`
        + ' none can be proved to be this request\'s, so this record never gives a verdict: reconcile with --recover to dispatch afresh' };
    if (intent.delivery !== 'accepted' && complete && now - Date.parse(intent.requestedAt) >= SETTLE_MS) return { row: 'A2',
      state: 'not-delivered', reason: `no run on ${intent.ref} for this request in a complete listing ${SETTLE_MS / 60_000} minutes on; reconcile with --recover to dispatch it again` };
    return { row: 'A3', state: 'absent', reason: 'no run found for this request yet; reconcile again before dispatching' };
  }
  const run = runs.find((candidate) => candidate.id === intent.runId);
  if (!run) return { row: 'A4', state: 'unresolved', reason: `returned run ${intent.runId} could not be read` };
  if (!ownRun(intent, run) || run.head_sha !== intent.sha) return { row: 'A5', state: 'mismatch', run: summary(run),
    reason: `run ${run.id} is a ${run.event} run of ${run.path} on ${run.head_branch} at ${run.head_sha}, not a ${intent.workflow} dispatch on ${intent.ref} at ${intent.sha}` };
  return { state: 'accepted', run: summary(run) };
}

/**
 * Rows V1-V9: the verdict for the requested commit, given its proved run R. C is R plus every
 * configured-suite workflow_dispatch run listed at the commit, on any branch. Facts (runs,
 * complete, head) are values or getters; `started(run)` and `attempts(run)` are read only when a
 * row needs them, and may throw when GitHub cannot be read.
 */
export function settle(intent, run, facts = {}) {
  const fact = (key) => (typeof facts[key] === 'function' ? facts[key]() : facts[key]);
  // R cancelled while pending answers through the other runs of its commit (rule 2).
  const pendingCancel = (other) => other.status === 'completed' && other.conclusion === 'cancelled';
  const answer = (row, state, by, conclusion, why) => ({ row,
    state: pendingCancel(run) && ['verdict', 'running'].includes(state) ? 'superseded' : state, run,
    ...(by ? { by: summary(by) } : {}), ...(conclusion ? { conclusion } : {}), reason: why });
  if (intent.workflow !== WORKFLOW) return answer('V1', 'refused', null, null,
    `this record names ${intent.workflow}; only ${WORKFLOW}, whose runs on one commit are one check, is judged here`);
  const listed = fact('runs') ?? [];
  const all = [run, ...listed.filter((other) => sameCheck(intent, other) && other.id !== run.id)].sort((x, y) => x.id - y.id);
  const failed = all.find((other) => other.status === 'completed' && !['success', 'cancelled'].includes(other.conclusion));
  if (failed) return answer('V2', 'verdict', failed, failed.conclusion, `run ${failed.id} at this commit ended ${failed.conclusion}`);
  if (fact('complete') !== true || !listed.some((other) => other.id === run.id)) return run.status !== 'completed'
    ? answer('V3', 'running', run, null, `run ${run.id} is running; the list of runs at this commit does not show it yet`)
    : answer('V3', 'unresolved', null, null, `the list of ${WORKFLOW} runs at this commit is incomplete or does not show run ${run.id}`);
  let unreadable;
  for (const other of all.filter((candidate) => attemptOf(candidate) > 1)) {
    let earlier;
    try { earlier = facts.attempts?.(other); } catch { earlier = undefined; }
    if (!Array.isArray(earlier)) { unreadable ??= other; continue; }
    const bad = earlier.find((conclusion) => conclusion !== 'success');
    if (bad) return answer('V4', 'verdict', other, bad, `run ${other.id} was re-run after an attempt that ended ${bad}`
      + ' (a re-run after a runner death is the coordinator\'s call, with a written reason)');
  }
  if (unreadable) return answer('V5', 'unresolved', unreadable, null, `the earlier attempts of re-run ${unreadable.id} could not be read`);
  for (const other of all.filter(pendingCancel)) {
    let started;
    try { started = facts.started?.(other) ?? true; } catch { started = undefined; }
    if (started === undefined) return answer('V6', 'unresolved', other, null, `whether cancelled run ${other.id} had started could not be read`);
    if (started) return answer('V6', 'cancelled', other, 'cancelled', `run ${other.id} was cancelled after its jobs started, by a person`
      + ' or session, not by a newer dispatch: its result is unknown, so the commit cannot pass; find out why before dispatching again');
  }
  const counted = all.filter((other) => !pendingCancel(other));
  const pending = counted.find((other) => other.status !== 'completed');
  if (pending) return answer('V7', 'running', pending, null, `run ${pending.id} at this commit is still running`);
  if (!counted.length) {
    const head = fact('head');
    return head === intent.sha
      ? answer('V8', 'recover', null, null, `run ${run.id} was cancelled while pending and ${intent.sha} is still the head of ${intent.ref}; reconcile with --recover to dispatch it again`)
      : answer('V8', 'obsolete', null, null, `run ${run.id} was cancelled and ${intent.ref} moved to ${head ?? 'nothing'};`
        + ' dispatch the new head; a verdict still required for the old commit goes through the exact-SHA check branch');
  }
  return { ...answer('V9', 'verdict', counted[0], 'success', `all ${counted.length} run(s) at this commit passed on every attempt`),
    runIds: counted.map((other) => other.id) };
}

function branchHead(api, { repository, ref }) {
  const r = api('GET', `repos/${repository}/git/ref/heads/${ref}`);
  if (r.ok) return r.json?.object?.sha ?? null;
  if (r.status === 404) return null;
  throw Error(`could not read the head of ${ref}`);
}

/** Re-read the run this intent names (finding it once if GitHub returned no ID) and settle it. */
export function reconcile(intent, { api = ghApi, now = Date.now } = {}) {
  try {
    let attribution;
    if (intent.runId !== undefined) {
      const r = api('GET', `repos/${intent.repository}/actions/runs/${intent.runId}`);
      if (!r.ok && r.status !== 404) throw Error(`could not read run ${intent.runId}`);
      attribution = attribute(intent, { runs: r.ok && r.json ? [r.json] : [], complete: true }, now());
    } else attribution = attribute(intent, listDispatchRuns(api, intent, since(intent)), now());
    if (attribution.state !== 'accepted') return attribution;
    const { run } = attribution;
    let listing;
    const list = () => (listing ??= listCommitRuns(api, intent));
    return settle(intent, run, {
      runs: () => list().runs,
      complete: () => list().complete,
      attempts: (other) => Array.from({ length: attemptOf(other) - 1 }, (_, i) => {
        const r = api('GET', `repos/${intent.repository}/actions/runs/${other.id}/attempts/${i + 1}`);
        if (!r.ok || r.json?.status !== 'completed') throw Error(`could not read attempt ${i + 1} of run ${other.id}`);
        return r.json.conclusion;
      }),
      started: (other) => {
        const jobs = api('GET', `repos/${intent.repository}/actions/runs/${other.id}/jobs?per_page=1`);
        if (!jobs.ok || !Number.isSafeInteger(jobs.json?.total_count)) throw Error(`could not read the jobs of run ${other.id}`);
        return jobs.json.total_count > 0;
      },
      head: () => branchHead(api, intent),
    });
  } catch (error) { return { state: 'unresolved', reason: error.message }; }
}

export function dispatch({ repository, workflow = WORKFLOW, ref, sha, recovers }, {
  api = ghApi, observe = observeVerification, save, now = Date.now } = {}) {
  if (workflow !== WORKFLOW) return { state: 'refused', reason: `only ${WORKFLOW} is dispatched here; nothing dispatched` };
  if (!REPOSITORY.test(repository ?? '') || !REF.test(ref ?? '') || !SHA.test(sha ?? '')) {
    return { state: 'refused', reason: 'usage: a repository, a branch name and a full 40-character commit' };
  }
  // The advisory first: its reads must not widen the window between the head check and the dispatch.
  try { observe({ workflow, ref, expectedRevision: sha, repository, purpose: 'candidate verification', print: (line) => console.error(line) }); }
  catch { /* Observation is advisory and never gates the dispatch. */ }
  let head;
  try { head = branchHead(api, { repository, ref }); } catch (error) { return { state: 'refused', reason: error.message }; }
  if (head !== sha) return { state: 'refused', reason: `${ref} is at ${head ?? 'nothing'}, not the requested ${sha}; nothing dispatched` };
  const requestedAt = new Date(now()).toISOString();
  const intent = { version: 1, repository, workflow, ref, sha, requestedAt, delivery: 'requested' };
  if (recovers) intent.recovers = recovers; // Written before the POST, so a restart can find it.
  try { intent.priorRunIds = listDispatchRuns(api, intent, since(intent)).runs.map((run) => run.id); }
  catch (error) { return { state: 'refused', reason: `${error.message}; nothing dispatched` }; }
  const record = save(intent); // Before the dispatch: a lost acknowledgement reconciles from this.
  const sent = api('POST', `repos/${repository}/actions/workflows/${workflow}/dispatches`, { ref, return_run_details: true });
  if (sent.ok) {
    intent.delivery = 'accepted';
    if (Number.isSafeInteger(sent.json?.workflow_run_id)) intent.runId = sent.json.workflow_run_id;
  } else intent.delivery = sent.status >= 400 && sent.status < 500 ? 'refused' : 'uncertain';
  save(intent, record);
  if (intent.delivery === 'refused') return { record, state: 'refused', reason: `GitHub refused the dispatch: ${sent.error}` };
  return { record, ...reconcile(intent, { api, now }) };
}

function recordDir() {
  const r = spawnSync('git', ['rev-parse', '--git-path', 'noacg-dispatch'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('not in a git checkout; pass --records <dir>');
  return path.resolve(r.stdout.trim());
}

export function saver(dir) {
  return (intent, file) => {
    mkdirSync(dir, { recursive: true });
    if (file) { writeFileSync(file, `${JSON.stringify(intent, null, 2)}\n`); return file; }
    // A new record never replaces another: unique name, created exclusively ('wx' fails on a clash).
    const target = path.join(dir, `${intent.workflow.replace(/\.ya?ml$/, '')}-${intent.sha.slice(0, 12)}-`
      + `${intent.requestedAt.replace(/[:.]/g, '')}-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(target, `${JSON.stringify(intent, null, 2)}\n`, { flag: 'wx' });
    return target;
  };
}

/**
 * Claim a record's one recovery before anything is sent. The claim is created exclusively, so a
 * concurrent caller, or the same one after a restart between the send and the final save, finds
 * it and never sends again.
 */
function claimRecovery(file, at) {
  try {
    writeFileSync(`${file}.recovery`, `${JSON.stringify({ claimedAt: new Date(at).toISOString() })}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

export function exitCode(result) {
  if (REFUSALS.includes(result.state)) return 1;
  if (ACTION.includes(result.state)) return 2;
  const finished = result.state === 'verdict' || (result.state === 'superseded' && result.conclusion !== undefined);
  if (!finished) return 3; // Still running: pending evidence is never a pass.
  return result.conclusion === 'success' ? 0 : 1;
}

export function main(argv = process.argv.slice(2), { api = ghApi, observe, now, print = console.log } = {}) {
  const flag = (name) => flagValue(argv, name);
  const deps = { api, now, observe };
  let result;
  try {
    if (argv[0] === 'dispatch') {
      const repository = flag('--repo') ?? api('GET', 'repos/{owner}/{repo}').json?.full_name;
      const sha = flag('--sha') ?? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim();
      result = dispatch({ repository, ref: flag('--ref'), sha },
        { ...deps, save: saver(flag('--records') ?? recordDir()) });
    } else if (argv[0] === 'reconcile' && argv[1]) {
      const file = path.resolve(argv[1]);
      const intent = JSON.parse(readFileSync(file, 'utf8'));
      const save = saver(path.dirname(file));
      result = { record: file, ...reconcile(intent, deps) };
      if (['recover', 'not-delivered', 'unproven'].includes(result.state) && hasFlag(argv, '--recover')) {
        if (intent.recoveredBy || !claimRecovery(file, (now ?? Date.now)())) {
          result = { ...result, state: 'refused', reason: `already recovered${intent.recoveredBy ? ` by ${intent.recoveredBy}` : ''};`
            + ` reconcile the record whose \`recovers\` names ${file}` };
        } else {
          const next = dispatch({ ...intent, recovers: file }, { ...deps, save });
          if (next.record) save({ ...intent, recoveredBy: next.record }, file);
          else unlinkSync(`${file}.recovery`); // Refused before anything was sent: the claim is free again.
          result = { recoveredFrom: result, ...next };
        }
      }
    } else {
      result = { state: 'refused', reason: 'usage: dispatch --ref <branch> [--sha <commit>] | reconcile <record.json> [--recover]' };
    }
  } catch (error) { result = { state: 'unresolved', reason: error.message }; }
  print(JSON.stringify(result));
  return exitCode(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
