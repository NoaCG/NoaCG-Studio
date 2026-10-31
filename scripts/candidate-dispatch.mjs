#!/usr/bin/env node
// ONE DISPATCH, ONE ATTRIBUTABLE RUN, ONE COMMIT.
//
//   node scripts/candidate-dispatch.mjs dispatch --ref <branch> [--sha <commit>] [--workflow configured-suite.yml]
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
//   - The run ID GitHub returns for the dispatch is the identity. When none comes back, the one
//     NEW dispatch run on that ref is; two new runs are ambiguous and refused, a run on another
//     commit is a mismatch and refused. An absent run stays uncertain until the listing is
//     complete and SETTLE_MS has passed.
//   - A cancelled run is followed to the newer run on the SAME commit when there is one. A run
//     cancelled while pending, with its commit still the branch head and nothing replacing it,
//     is `recover`: `--recover` dispatches it again, once per record. A run someone cancelled
//     after it started is never recovered automatically. A moved head makes the old commit
//     obsolete here: a verdict a checker still needs for it goes through the exact-SHA check
//     branch (check.tmpl).
//
// Output: one JSON line. The exit code is the verdict: 0 only for a finished, passing run on the
// requested commit (its own, or a superseding run's). 1: a refusal (refused, mismatch, ambiguous,
// unresolved) or a failing verdict. 2: no verdict and something to do (absent, not-delivered,
// recover, obsolete, cancelled). 3: still running, so wait and reconcile again.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagValue, hasFlag } from './jobs-store.mjs';
import { observeVerification } from './verification-dispatch.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REF = /^(?!-)(?!refs\/)[\w./-]+$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
// GitHub creates a dispatch run within seconds; past this a complete listing without it is final.
export const SETTLE_MS = 5 * 60_000;
// Clock skew allowed between this machine and GitHub's created_at.
const SKEW_MS = 60_000;
const REFUSALS = ['refused', 'mismatch', 'ambiguous', 'unresolved'];
// No verdict for the requested commit yet, and something to do about it.
const ACTION = ['absent', 'not-delivered', 'recover', 'obsolete', 'cancelled'];

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
const since = (intent) => new Date(Date.parse(intent.requestedAt) - SKEW_MS).toISOString();
const ownRun = (intent, run) => run.event === 'workflow_dispatch' && run.head_branch === intent.ref
  && run.path?.split('@')[0] === `.github/workflows/${intent.workflow}`;

function listDispatchRuns(api, { repository, workflow, ref }, after) {
  const r = api('GET', `repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch`
    + `&branch=${encodeURIComponent(ref)}&created=${encodeURIComponent(`>=${after}`)}&per_page=100`);
  if (!r.ok || !Array.isArray(r.json?.workflow_runs)) throw Error('dispatch run listing unreadable');
  return { runs: r.json.workflow_runs,
    complete: Number.isSafeInteger(r.json.total_count) && r.json.total_count <= r.json.workflow_runs.length };
}

/** Which run answers this intent, or why none can be named. Pure. */
export function attribute(intent, { runs, complete }, now) {
  let candidates;
  if (intent.runId !== undefined) {
    candidates = runs.filter((run) => run.id === intent.runId);
    if (!candidates.length) return { state: 'unresolved', reason: `returned run ${intent.runId} could not be read` };
  } else {
    candidates = runs.filter((run) => ownRun(intent, run) && !intent.priorRunIds.includes(run.id)
      && Date.parse(run.created_at) >= Date.parse(intent.requestedAt) - SKEW_MS);
  }
  if (candidates.length > 1) return { state: 'ambiguous', runIds: candidates.map((run) => run.id),
    reason: `${candidates.length} new dispatch runs on ${intent.ref} since the request; none can be attributed to it` };
  if (!candidates.length) {
    const final = intent.delivery !== 'accepted' && complete && now - Date.parse(intent.requestedAt) >= SETTLE_MS;
    return { state: final ? 'not-delivered' : 'absent', reason: final
      ? `no run on ${intent.ref} for this request in a complete listing ${SETTLE_MS / 60_000} minutes on; reconcile with --recover to dispatch it again`
      : 'no run found for this request yet; reconcile again before dispatching' };
  }
  const [run] = candidates;
  if (!ownRun(intent, run)) return { state: 'mismatch', run: summary(run), reason: `run ${run.id} is not a ${intent.workflow} dispatch on ${intent.ref}` };
  if (run.head_sha !== intent.sha) return { state: 'mismatch', run: summary(run),
    reason: `run ${run.id} tested ${run.head_sha}, not the requested ${intent.sha}: the ref moved` };
  return { state: 'accepted', run: summary(run) };
}

/**
 * What the attributed run's outcome means for this commit's verdict. Each fact (runs, started,
 * head) is a value or a getter, read only when the answer needs it.
 */
export function settle(intent, run, facts = {}) {
  const fact = (key) => (typeof facts[key] === 'function' ? facts[key]() : facts[key]);
  if (run.status !== 'completed') return { state: 'running', run };
  if (run.conclusion !== 'cancelled') return { state: 'verdict', run, conclusion: run.conclusion };
  // Run IDs grow with creation; created_at has one-second resolution.
  const replacement = (fact('runs') ?? []).filter((other) => ownRun(intent, other) && other.id > run.id && other.head_sha === intent.sha
      && other.conclusion !== 'cancelled').sort((a, b) => b.id - a.id)[0];
  if (replacement) {
    // The replacement's verdict is this commit's verdict: a failure must not hide behind the cancel.
    const done = replacement.status === 'completed';
    return { state: 'superseded', run, by: summary(replacement), ...(done ? { conclusion: replacement.conclusion } : {}),
      reason: `run ${run.id} was cancelled; run ${replacement.id} on the same commit carries its verdict`
        + (done ? ` (${replacement.conclusion})` : ' (still running)') };
  }
  // The group never cancels a started run (cancel-in-progress: false): someone chose to.
  if (fact('started')) return { state: 'cancelled', run,
    reason: `run ${run.id} was cancelled after its jobs started, by a person or session, not by a newer dispatch; find out why before dispatching again` };
  const branchHead = fact('head');
  if (branchHead === intent.sha) return { state: 'recover', run,
    reason: `run ${run.id} was cancelled while pending and ${intent.sha} is still the head of ${intent.ref}; reconcile with --recover to dispatch it again` };
  return { state: 'obsolete', run, reason: `run ${run.id} was cancelled and ${intent.ref} moved to ${branchHead ?? 'nothing'};`
    + ' dispatch the new head; a verdict still required for the old commit goes through the exact-SHA check branch' };
}

function branchHead(api, { repository, ref }) {
  const r = api('GET', `repos/${repository}/git/ref/heads/${ref}`);
  if (r.ok) return r.json?.object?.sha ?? null;
  if (r.status === 404) return null;
  throw Error(`could not read the head of ${ref}`);
}

/** Re-read the run this intent names (finding it once if GitHub returned no ID) and settle it. */
export function reconcile(intent, { api = ghApi, now = Date.now, save, record } = {}) {
  try {
    let attribution, listing;
    if (intent.runId !== undefined) {
      const r = api('GET', `repos/${intent.repository}/actions/runs/${intent.runId}`);
      if (!r.ok && r.status !== 404) throw Error(`could not read run ${intent.runId}`);
      attribution = attribute(intent, { runs: r.ok && r.json ? [r.json] : [], complete: true }, now());
    } else {
      listing = listDispatchRuns(api, intent, since(intent));
      attribution = attribute(intent, listing, now());
      if (attribution.state === 'accepted' && save) {
        // Found once, kept: a later run on the same ref must not make this record ambiguous.
        Object.assign(intent, { runId: attribution.run.id, delivery: 'accepted' });
        save(intent, record);
      }
    }
    if (attribution.state !== 'accepted') return attribution;
    const { run } = attribution;
    return settle(intent, run, {
      runs: () => (listing ?? listDispatchRuns(api, intent, since(intent))).runs,
      started: () => {
        const jobs = api('GET', `repos/${intent.repository}/actions/runs/${run.id}/jobs?per_page=1`);
        if (!jobs.ok || !Number.isSafeInteger(jobs.json?.total_count)) throw Error(`could not read the jobs of run ${run.id}`);
        return jobs.json.total_count > 0;
      },
      head: () => branchHead(api, intent),
    });
  } catch (error) { return { state: 'unresolved', reason: error.message }; }
}

export function dispatch({ repository, workflow = 'configured-suite.yml', ref, sha }, {
  api = ghApi, observe = observeVerification, save, now = Date.now } = {}) {
  if (!REPOSITORY.test(repository ?? '') || !REF.test(ref ?? '') || !SHA.test(sha ?? '') || !/^[\w.-]+\.ya?ml$/.test(workflow)) {
    return { state: 'refused', reason: 'usage: a repository, a branch name, a full 40-character commit and a workflow file name' };
  }
  // The advisory first: its reads must not widen the window between the head check and the dispatch.
  try { observe({ workflow, ref, expectedRevision: sha, repository, purpose: 'candidate verification', print: (line) => console.error(line) }); }
  catch { /* Observation is advisory and never gates the dispatch. */ }
  let head;
  try { head = branchHead(api, { repository, ref }); } catch (error) { return { state: 'refused', reason: error.message }; }
  if (head !== sha) return { state: 'refused', reason: `${ref} is at ${head ?? 'nothing'}, not the requested ${sha}; nothing dispatched` };
  const requestedAt = new Date(now()).toISOString();
  const intent = { version: 1, repository, workflow, ref, sha, requestedAt, delivery: 'requested' };
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
  return { record, ...reconcile(intent, { api, now, save, record }) };
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
      result = dispatch({ repository, workflow: flag('--workflow'), ref: flag('--ref'), sha },
        { ...deps, save: saver(flag('--records') ?? recordDir()) });
    } else if (argv[0] === 'reconcile' && argv[1]) {
      const file = path.resolve(argv[1]);
      const intent = JSON.parse(readFileSync(file, 'utf8'));
      const save = saver(path.dirname(file));
      result = { record: file, ...reconcile(intent, { ...deps, save, record: file }) };
      if (['recover', 'not-delivered'].includes(result.state) && hasFlag(argv, '--recover')) {
        if (intent.recoveredBy) result = { ...result, state: 'refused', reason: `already recovered by ${intent.recoveredBy}; reconcile that record` };
        else {
          const next = dispatch(intent, { ...deps, save });
          if (next.record) save({ ...intent, recoveredBy: next.record }, file);
          result = { recoveredFrom: result, ...next };
        }
      }
    } else {
      result = { state: 'refused', reason: 'usage: dispatch --ref <branch> [--sha <commit>] [--workflow <file>] | reconcile <record.json> [--recover]' };
    }
  } catch (error) { result = { state: 'unresolved', reason: error.message }; }
  print(JSON.stringify(result));
  return exitCode(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
