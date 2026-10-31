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
//   - A run cancelled while pending is followed to the newer run on the SAME commit when there is
//     one; when the commit is still the branch head and nothing replaced it, `--recover` dispatches
//     it again, once per record. A moved head makes the old commit obsolete here: a verdict a
//     checker still needs for it goes through the exact-SHA check branch (check.tmpl).
//
// Output: one JSON line. Exit 1 on a refusal (refused, mismatch, ambiguous, unresolved), else 0;
// `state` says what to do next.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeVerification } from './verification-dispatch.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REF = /^(?!-)(?!refs\/)[\w./-]+$/;
// GitHub creates a dispatch run within seconds; past this a complete listing without it is final.
export const SETTLE_MS = 5 * 60_000;
// Clock skew allowed between this machine and GitHub's created_at.
const SKEW_MS = 60_000;
export const REFUSALS = ['refused', 'mismatch', 'ambiguous', 'unresolved'];

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

export function listDispatchRuns(api, { repository, workflow, ref }, after) {
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
      ? `no run on ${intent.ref} for this request in a complete listing ${SETTLE_MS / 60_000} minutes on`
      : 'no run found for this request yet; reconcile again before dispatching' };
  }
  const [run] = candidates;
  if (!ownRun(intent, run)) return { state: 'mismatch', run: summary(run), reason: `run ${run.id} is not a ${intent.workflow} dispatch on ${intent.ref}` };
  if (run.head_sha !== intent.sha) return { state: 'mismatch', run: summary(run),
    reason: `run ${run.id} tested ${run.head_sha}, not the requested ${intent.sha}: the ref moved` };
  return { state: 'accepted', run: summary(run) };
}

/** What the attributed run's outcome means for this commit's verdict. Pure. */
export function settle(intent, run, { runs }, branchHead) {
  if (run.status !== 'completed') return { state: 'running', run };
  if (run.conclusion !== 'cancelled') return { state: 'verdict', run, conclusion: run.conclusion };
  const replacement = runs.filter((other) => ownRun(intent, other) && other.id !== run.id && other.head_sha === intent.sha
      && Date.parse(other.created_at) > Date.parse(run.created_at) && other.conclusion !== 'cancelled')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (replacement) return { state: 'superseded', run, by: summary(replacement),
    reason: `run ${run.id} was cancelled; run ${replacement.id} on the same commit carries its verdict` };
  if (branchHead === intent.sha) return { state: 'recover', run,
    reason: `run ${run.id} was cancelled and ${intent.sha} is still the head of ${intent.ref}; dispatch it again` };
  return { state: 'obsolete', run, reason: `run ${run.id} was cancelled and ${intent.ref} moved to ${branchHead ?? 'nothing'};`
    + ' a verdict still required for the old commit goes through the exact-SHA check branch' };
}

function branchHead(api, { repository, ref }) {
  const r = api('GET', `repos/${repository}/git/ref/heads/${ref}`);
  if (r.ok) return r.json?.object?.sha ?? null;
  if (r.status === 404) return null;
  throw Error(`could not read the head of ${ref}`);
}

export function reconcile(intent, { api = ghApi, now = Date.now } = {}) {
  try {
    const listing = listDispatchRuns(api, intent, since(intent));
    let attribution;
    if (intent.runId !== undefined) {
      const r = api('GET', `repos/${intent.repository}/actions/runs/${intent.runId}`);
      attribution = attribute(intent, { runs: r.ok && r.json ? [r.json] : [], complete: true }, now());
    } else attribution = attribute(intent, listing, now());
    if (attribution.state !== 'accepted') return attribution;
    return settle(intent, attribution.run, listing, branchHead(api, intent));
  } catch (error) { return { state: 'unresolved', reason: error.message }; }
}

export function dispatch({ repository, workflow = 'configured-suite.yml', ref, sha, supersedes }, {
  api = ghApi, observe = observeVerification, save, now = Date.now } = {}) {
  if (!REF.test(ref ?? '') || !SHA.test(sha ?? '') || !/^[\w.-]+\.ya?ml$/.test(workflow)) {
    return { state: 'refused', reason: 'usage: a branch name, a full 40-character commit and a workflow file name' };
  }
  let head;
  try { head = branchHead(api, { repository, ref }); } catch (error) { return { state: 'refused', reason: error.message }; }
  if (head !== sha) return { state: 'refused', reason: `${ref} is at ${head ?? 'nothing'}, not the requested ${sha}; nothing dispatched` };
  const requestedAt = new Date(now()).toISOString();
  const intent = { version: 1, repository, workflow, ref, sha, requestedAt, delivery: 'requested' };
  if (supersedes) intent.supersedes = supersedes;
  try { intent.priorRunIds = listDispatchRuns(api, intent, since(intent)).runs.map((run) => run.id); }
  catch (error) { return { state: 'refused', reason: `${error.message}; nothing dispatched` }; }
  const record = save(intent); // Before the dispatch: a lost acknowledgement reconciles from this.
  try { observe({ workflow, ref, expectedRevision: sha, repository, purpose: 'candidate verification', print: (line) => console.error(line) }); }
  catch { /* Observation is advisory and never gates the dispatch. */ }
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
    const target = file ?? path.join(dir, `${intent.workflow.replace(/\.ya?ml$/, '')}-${intent.sha.slice(0, 12)}-${intent.requestedAt.replace(/[:.]/g, '')}.json`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(intent, null, 2)}\n`);
    return target;
  };
}

export function main(argv = process.argv.slice(2), { api = ghApi, observe, now, print = console.log } = {}) {
  const flag = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const deps = { api, now, ...(observe ? { observe } : {}) };
  let result;
  if (argv[0] === 'dispatch') {
    const repository = flag('--repo') ?? api('GET', 'repos/{owner}/{repo}').json?.full_name;
    const sha = flag('--sha') ?? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout?.trim();
    result = dispatch({ repository, workflow: flag('--workflow'), ref: flag('--ref'), sha },
      { ...deps, save: saver(flag('--records') ?? recordDir()) });
  } else if (argv[0] === 'reconcile' && argv[1]) {
    const file = path.resolve(argv[1]);
    const intent = JSON.parse(readFileSync(file, 'utf8'));
    result = { record: file, ...reconcile(intent, deps) };
    const due = ['recover', 'not-delivered'].includes(result.state);
    if (due && argv.includes('--recover')) {
      if (intent.recoveredBy) result = { ...result, state: 'refused', reason: `already recovered by ${intent.recoveredBy}; reconcile that record` };
      else {
        const next = dispatch({ ...intent, supersedes: file }, { ...deps, save: saver(path.dirname(file)) });
        if (next.record) saver(path.dirname(file))({ ...intent, recoveredBy: next.record }, file);
        result = { recoveredFrom: result, ...next };
      }
    }
  } else {
    result = { state: 'refused', reason: 'usage: dispatch --ref <branch> [--sha <commit>] [--workflow <file>] | reconcile <record.json> [--recover]' };
  }
  print(JSON.stringify(result));
  return REFUSALS.includes(result.state) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
