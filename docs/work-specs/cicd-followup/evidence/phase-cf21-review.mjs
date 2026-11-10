#!/usr/bin/env node
// cicd-followup cf21: review rounds, M1 from ready, reverts and post-landing failures per plan-run
// row, before and after cf21's review stopping rules (phase-cf21.md section 3 defines each measure).
//
//   node docs/work-specs/cicd-followup/evidence/phase-cf21-review.mjs collect --cache <dir> --from <ISO> --until <ISO> [--max-calls 100]
//   node docs/work-specs/cicd-followup/evidence/phase-cf21-review.mjs derive  --cache <dir> --from <ISO> --until <ISO> --out <records.json>
//   node docs/work-specs/cicd-followup/evidence/phase-cf21-review.mjs report  --records <records.json> [--cf21 <cf21 merged_at>]
//
// collect: one bounded pass of at most --max-calls GitHub REST calls (default 100); run it again
// until it prints `complete`. Merged pull requests' reviews, comments and events, completed runs
// and their jobs are immutable and cached once under <dir>. Reads metadata only, never a log or a
// signed URL; writes nothing to GitHub. Needs `gh` signed in.
// derive: one record per row, from the cache and the local git history of origin/main (fetch it
// back to --from first: `git fetch --shallow-since=<date> origin main`).
// report: per side, the measures and cf03's spread rule (phase-cf03.md section 5.2) applied to them.
// Without --cf21 every record is the before side.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'NoaCG/NoaCG-Studio';
const CODEX = 'chatgpt-codex-connector[bot]';
// The agents of a plan run and the owner post as this account; its reviews are replies, not reviews.
const AGENT_ACCOUNT = 'miwco';
const CI = '.github/workflows/ci.yml';
// A plan-run row: a build, repair or re-run branch of a phase, or an owner-requested fix, of the
// cicd-followup or jev-svg-import run (the two runs cf21's before side reads).
export const ROW = /^claude\/plan-(cicd-followup|jev-svg-import)-(?:(.+)-(build|repair|rerun)|fix-(\d+))$/;
// The files whose review rules cf21 changes; a landing that changes one of them ends a side.
const RULE_FILES = ['docs/plan-runs/known-traps.md', '.agent-workflows/plan-run.md', '.agent-workflows/so.md', '.agent-workflows/check.md'];

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

// ---- collect ----
let calls = 0;
class Budget extends Error {}
function api(path) {
  if (calls >= Number(opt('--max-calls', '100'))) throw new Budget();
  calls += 1;
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
}
const cacheDir = () => { const c = opt('--cache'); if (!c) usage(); mkdirSync(c, { recursive: true }); return c; };
const load = (c, name) => (existsSync(join(c, name)) ? JSON.parse(readFileSync(join(c, name), 'utf8')) : undefined);
const save = (c, name, v) => writeFileSync(join(c, name), JSON.stringify(v));
// Pages of a list endpoint until a short page; `key` picks the array out of a wrapped response.
function pages(path, key) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const body = api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const list = key ? body[key] : body;
    out.push(...list);
    if (list.length < 100) return out;
  }
}
const settled = (runs) => runs.every((r) => r.status === 'completed');

function rowsFrom(c, from, until) {
  // Merged PRs into main, newest created first, until PRs created two weeks before the window.
  const name = `pulls-${until}.json`;
  let list = load(c, name);
  if (!list) {
    list = [];
    const stop = new Date(Date.parse(from) - 14 * 86400000).toISOString();
    for (let page = 1; ; page += 1) {
      const body = api(`repos/${REPO}/pulls?state=closed&base=main&sort=created&direction=desc&per_page=100&page=${page}`);
      list.push(...body.filter((p) => p.merged_at).map((p) => ({ number: p.number, created_at: p.created_at, merged_at: p.merged_at, head_ref: p.head.ref, head_sha: p.head.sha, merge_sha: p.merge_commit_sha })));
      if (body.length < 100 || body[body.length - 1].created_at < stop) break;
    }
    save(c, name, list);
  }
  return list.filter((p) => ROW.test(p.head_ref) && p.merged_at >= from && p.merged_at <= until).sort((a, b) => a.merged_at.localeCompare(b.merged_at));
}

function collect() {
  const c = cacheDir();
  const from = opt('--from'); const until = opt('--until');
  if (!from || !until) usage();
  let left = 0;
  try {
    for (const p of rowsFrom(c, from, until)) {
      const n = p.number;
      for (const [file, path, key] of [
        [`pr-${n}-events.json`, `repos/${REPO}/issues/${n}/events`],
        [`pr-${n}-reviews.json`, `repos/${REPO}/pulls/${n}/reviews`],
        [`pr-${n}-review-comments.json`, `repos/${REPO}/pulls/${n}/comments`],
        [`pr-${n}-comments.json`, `repos/${REPO}/issues/${n}/comments`],
      ]) if (!load(c, file)) save(c, file, pages(path, key));
      // The final head's runs (M1 from ready) and the merge commit's runs (post-landing failures).
      for (const sha of [p.head_sha, p.merge_sha]) {
        const file = `runs-${sha}.json`;
        const have = load(c, file);
        if (!have || !settled(have)) save(c, file, pages(`repos/${REPO}/actions/runs?head_sha=${sha}`, 'workflow_runs').map((r) => ({ id: r.id, path: r.path, event: r.event, status: r.status, conclusion: r.conclusion, run_attempt: r.run_attempt, created_at: r.created_at })));
      }
      for (const r of load(c, `runs-${p.head_sha}.json`).filter((x) => x.path === CI && x.status === 'completed' && (x.event === 'pull_request' || x.event === 'workflow_dispatch'))) {
        const file = `jobs-${r.id}-${r.run_attempt}.json`;
        if (!load(c, file)) save(c, file, pages(`repos/${REPO}/actions/runs/${r.id}/jobs?filter=all`, 'jobs').map((j) => ({ name: j.name, conclusion: j.conclusion, run_attempt: j.run_attempt, started_at: j.started_at, completed_at: j.completed_at })));
      }
    }
  } catch (e) {
    if (!(e instanceof Budget)) throw e;
    left = 1;
  }
  console.log(`[collect] ${calls} calls; ${left ? 'more to read: run again' : 'complete'}`);
}

// ---- derive ----
const minutes = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
function addedLines(range, files) {
  const out = new Map();
  if (!files.length) return out;
  let file = null;
  for (const line of git('diff', '--unified=0', range, '--', ...files).split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(6);
    else if (file && /^[+-][^+-]/.test(line) && line.slice(1).trim().length > 3) {
      const k = `${line[0]}${file}`;
      if (!out.has(k)) out.set(k, new Set());
      out.get(k).add(line.slice(1).trim());
    }
  }
  return out;
}

function derive() {
  const c = cacheDir();
  const from = opt('--from'); const until = opt('--until'); const outPath = opt('--out');
  if (!from || !until || !outPath) usage();
  // Revert candidates: every commit on origin/main whose subject begins with "Revert".
  const reverts = git('log', 'origin/main', `--since=${from}`, '--format=%H%x09%cI%x09%s%x09%b%x1e').split('\x1e').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [sha, at, subject, ...body] = s.split('\t'); return { sha, at, subject, body: body.join('\t') }; })
    .filter((r) => /^revert/i.test(r.subject));
  // Landings that changed a review-rule file (they end a side; cf03 section 5.2's clean stretch).
  const ruleLandings = git('log', 'origin/main', '--first-parent', `--since=${from}`, '--format=%H%x09%cI', '--', ...RULE_FILES).trim().split('\n').filter(Boolean).map((l) => l.split('\t')[1]).sort();
  const records = [];
  for (const p of rowsFrom(c, from, until)) {
    const n = p.number;
    const [, plan, phase, kind, fix] = ROW.exec(p.head_ref);
    const events = load(c, `pr-${n}-events.json`);
    if (!events) throw new Error(`#${n} not collected: run collect until complete`);
    const reviews = load(c, `pr-${n}-reviews.json`).filter((r) => r.submitted_at && r.submitted_at <= p.merged_at);
    const inline = load(c, `pr-${n}-review-comments.json`).filter((x) => !x.in_reply_to_id);
    const comments = load(c, `pr-${n}-comments.json`).filter((x) => x.created_at <= p.merged_at);

    // Review rounds: reviewer results that carried findings. A Codex review with at least one
    // inline comment, or a review by anyone other than Codex, a bot or the agents' account that
    // requests changes or has inline comments. Clean results (a receipt or a thumbs-up) end the
    // count and are not rounds. reviews_to_pass = rounds + 1 (1: passed on its first review).
    const findingReviews = reviews.filter((r) => {
      const own = inline.filter((x) => x.pull_request_review_id === r.id).length;
      if (r.user?.login === CODEX) return own > 0;
      if (!r.user || r.user.login === AGENT_ACCOUNT || r.user.type === 'Bot') return false;
      return r.state === 'CHANGES_REQUESTED' || own > 0;
    });
    const rounds = findingReviews.length;
    const findings = findingReviews.reduce((s, r) => s + inline.filter((x) => x.pull_request_review_id === r.id).length, 0);
    const codexClean = comments.filter((x) => x.user?.login === CODEX && x.body.includes('codex-review-receipt')).length;
    const requests = comments.filter((x) => x.user?.login !== CODEX && /@codex review/.test(x.body)).length;

    // M1 from ready, cf03's definition (phase-cf03.md section 2, phase-cf03-baseline.mjs derive):
    // from the PR's last ready_for_review event (or its creation) to the first successful CI gate
    // job of the final head's ci.yml PR or dispatch runs, every attempt.
    const headRuns = load(c, `runs-${p.head_sha}.json`).filter((r) => r.path === CI && (r.event === 'pull_request' || r.event === 'workflow_dispatch'));
    const gate = headRuns.flatMap((r) => load(c, `jobs-${r.id}-${r.run_attempt}.json`) ?? [])
      .filter((j) => j.name === 'CI gate' && j.conclusion === 'success').map((j) => j.completed_at).sort()[0] ?? null;
    const ready = events.filter((e) => e.event === 'ready_for_review' && e.created_at <= p.merged_at).map((e) => e.created_at).sort().pop() ?? p.created_at;
    const m1FromReady = gate ? +Math.max(0, minutes(ready, gate)).toFixed(2) : null;
    // cf03's group (section 4.1): offline E2E shards and configured jobs of the gate's attempt.
    let mode = 'none'; let shards = 0; let configured = 0;
    const gateRun = headRuns.find((r) => (load(c, `jobs-${r.id}-${r.run_attempt}.json`) ?? []).some((j) => j.name === 'CI gate' && j.completed_at === gate));
    if (gateRun) {
      const jobs = load(c, `jobs-${gateRun.id}-${gateRun.run_attempt}.json`);
      const attempt = jobs.find((j) => j.name === 'CI gate' && j.completed_at === gate).run_attempt;
      for (const j of jobs.filter((x) => x.run_attempt === attempt)) {
        const mm = /^E2E \d+\/(\d+) \((\w+)\)/.exec(j.name);
        if (mm && j.conclusion !== 'skipped') { mode = mm[2]; shards = Number(mm[1]); }
        if (/^Configured E2E \d+\/\d+/.test(j.name) && j.conclusion !== 'skipped' && j.started_at) configured += 1;
      }
    }
    const bucket = mode === 'none' || !shards ? 'none' : shards >= 15 ? 'cap' : 'small';

    // Post-landing failures: a run on the merge commit from the push to main (or its deployment)
    // whose latest attempt failed, or that was run again.
    const landRuns = (load(c, `runs-${p.merge_sha}.json`) ?? []).filter((r) => r.event === 'push' || r.event === 'deployment_status');
    const landFailures = landRuns.filter((r) => ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion) || r.run_attempt > 1)
      .map((r) => `${r.path.replace('.github/workflows/', '')} ${r.id} ${r.conclusion}${r.run_attempt > 1 ? ` attempt ${r.run_attempt}` : ''}`);
    const landPending = landRuns.filter((r) => r.status !== 'completed').length;

    // Reverts: a later "Revert..." commit on main that names this PR or its merge, or removes lines
    // this PR added to a file both touched.
    const files = git('diff', '--name-only', `${p.merge_sha}^1`, p.merge_sha).split('\n').filter(Boolean);
    const added = addedLines(`${p.merge_sha}^1..${p.merge_sha}`, files);
    const revertedBy = [];
    for (const r of reverts.filter((x) => x.at > p.merged_at)) {
      const named = new RegExp(`#${n}\\b|${p.merge_sha.slice(0, 7)}`).test(`${r.subject} ${r.body}`);
      const shared = git('diff', '--name-only', `${r.sha}^1`, r.sha).split('\n').filter((f) => files.includes(f));
      const removed = addedLines(`${r.sha}^1..${r.sha}`, shared);
      let undone = 0;
      for (const f of shared) for (const l of added.get(`+${f}`) ?? []) if (removed.get(`-${f}`)?.has(l)) undone += 1;
      if (named || undone > 0) revertedBy.push({ sha: r.sha.slice(0, 8), named, lines_undone: undone });
    }

    records.push({
      number: n, plan, phase: phase ?? `fix-${fix}`, kind: kind ?? 'fix', head_ref: p.head_ref,
      created_at: p.created_at, merged_at: p.merged_at, merge_sha: p.merge_sha, head_sha: p.head_sha,
      rounds, findings, reviews_to_pass: rounds + 1, passed_first: rounds === 0, codex_clean: codexClean, codex_requests: requests,
      ready_at: ready, gate_at: gate, m1_from_ready: m1FromReady, mode, shards, bucket, configured_jobs: configured, group: `${bucket}${configured > 0 ? '+cfg' : ''}`,
      land_failures: landFailures, land_pending: landPending, reverted_by: revertedBy,
    });
  }
  writeFileSync(outPath, `${JSON.stringify({ from, until, ruleLandings, records }, null, 1)}\n`);
  console.log(`[derive] ${records.length} rows -> ${outPath}`);
}

// ---- statistics: copied unchanged from phase-cf03-baseline.mjs, which runs its own command line when imported ----
export function quantile(values, q) { // nearest rank
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
export const median = (v) => quantile(v, 0.5);
export function mad(values) {
  const v = values.filter((x) => x != null);
  const m = median(v);
  return 1.4826 * median(v.map((x) => Math.abs(x - m)));
}
export function rng(seed) { // mulberry32, fixed seed so a checker gets the same numbers
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function minSample(values, spread, stat, { seed = 3, trials = 2000, nMin = 8, nMax = 120 } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 8 || !(spread > 0)) return null;
  const rand = rng(seed);
  const draw = (n, shift) => Array.from({ length: n }, () => Math.max(0, v[Math.floor(rand() * v.length)] - shift));
  for (let n = nMin; n <= nMax; n += 1) {
    let fp = 0; let tp = 0;
    for (let t = 0; t < trials; t += 1) {
      const before = stat(draw(n, 0));
      if (before - stat(draw(n, 0)) > spread) fp += 1;
      if (before - stat(draw(n, 2 * spread)) > spread) tp += 1;
    }
    if (fp / trials <= 0.05 && tp / trials >= 0.8) return n;
  }
  return `>${nMax}`;
}
/** One-sided Fisher exact p that side a's share of hits is higher than side b's (cf03's M4 test). */
export function fisherGreater(aHits, aN, bHits, bN) {
  const hits = aHits + bHits; const n = aN + bN;
  const lg = (x) => { let s = 0; for (let i = 2; i <= x; i += 1) s += Math.log(i); return s; };
  const logC = (a, b) => lg(a) - lg(b) - lg(a - b);
  let total = 0;
  for (let k = aHits; k <= Math.min(aN, hits); k += 1) total += Math.exp(logC(aN, k) + logC(bN, hits - k) - logC(n, hits));
  return Math.min(1, +total.toFixed(4));
}

// ---- report ----
const round1 = (x) => (x == null ? null : +x.toFixed(1));
const stats = (v) => { const x = v.filter((y) => y != null); return { n: x.length, median: round1(median(x)), p95: round1(quantile(x, 0.95)) }; };
// cf03 section 5.2: robust SD over the reference, and over its longest stretch with no landing that
// ends the side; the larger is the spread. Here the reference is the before side and the landings
// are those that changed a review-rule file.
function spreadOf(rows, metric, landings) {
  const whole = mad(rows.map((r) => r[metric]));
  let best = []; let cur = [];
  for (const r of rows) {
    if (cur.length && landings.some((t) => t > cur[cur.length - 1].merged_at && t <= r.merged_at)) cur = [];
    cur.push(r);
    if (cur.length > best.length) best = [...cur];
  }
  const clean = best.length >= 8 ? mad(best.map((r) => r[metric])) : null;
  return { whole: round1(whole), clean: round1(clean), clean_n: best.length, spread: round1(Math.max(whole, clean ?? 0)) };
}
function share(rows, test) { const hits = rows.filter(test).length; return { hits, n: rows.length, share: rows.length ? +(hits / rows.length).toFixed(2) : null }; }
function sideReport(rows) {
  return {
    n: rows.length,
    by_plan: Object.fromEntries(['cicd-followup', 'jev-svg-import'].map((p) => [p, rows.filter((r) => r.plan === p).length])),
    rounds: stats(rows.map((r) => r.rounds)),
    rounds_histogram: rows.reduce((h, r) => ({ ...h, [r.rounds]: (h[r.rounds] ?? 0) + 1 }), {}),
    passed_after_one_round: share(rows, (r) => r.passed_first),
    five_or_more_reviews: share(rows, (r) => r.reviews_to_pass >= 5),
    m1_from_ready: stats(rows.map((r) => r.m1_from_ready)),
    m1_from_ready_by_group: Object.fromEntries([...new Set(rows.map((r) => r.group))].sort().map((g) => [g, stats(rows.filter((r) => r.group === g).map((r) => r.m1_from_ready))])),
    reverted: share(rows, (r) => r.reverted_by.length > 0),
    post_landing_failure: share(rows, (r) => r.land_failures.length > 0),
    post_landing_pending: rows.filter((r) => r.land_pending > 0).length,
  };
}
function report() {
  const path = opt('--records'); if (!path) usage();
  const { from, until, ruleLandings, records } = JSON.parse(readFileSync(path, 'utf8'));
  const cf21 = opt('--cf21');
  const before = records.filter((r) => !cf21 || r.merged_at < cf21);
  // After: built under cf21's rules, so the PR was opened after cf21 landed. A PR opened before
  // and merged after straddles the change and is on neither side.
  const after = cf21 ? records.filter((r) => r.created_at > cf21) : [];
  const straddling = cf21 ? records.filter((r) => r.merged_at >= cf21 && r.created_at <= cf21).map((r) => r.number) : [];
  const ref = before.filter((r) => r.m1_from_ready != null);
  const sp = { m1_from_ready: spreadOf(ref, 'm1_from_ready', ruleLandings), rounds: spreadOf(before, 'rounds', ruleLandings) };
  const minN = Object.fromEntries(Object.entries(sp).map(([m, s]) => [m, {
    median: minSample((m === 'rounds' ? before : ref).map((r) => r[m]), s.spread, median),
    p95: minSample((m === 'rounds' ? before : ref).map((r) => r[m]), s.spread, (v) => quantile(v, 0.95), { nMin: 20 }),
  }]));
  const out = { window: { from, until, cf21: cf21 ?? null }, before: sideReport(before), after: cf21 ? sideReport(after) : null, straddling, spread: sp, min_n_per_side: minN, rule_landings: ruleLandings };
  if (cf21 && after.length) {
    const claim = {};
    for (const m of ['m1_from_ready', 'rounds']) {
      const b = before.map((r) => r[m]).filter((x) => x != null); const a = after.map((r) => r[m]).filter((x) => x != null);
      const enough = typeof minN[m].median === 'number' && a.length >= minN[m].median && b.length >= minN[m].median;
      claim[m] = { enough_rows: enough, before_median: median(b), after_median: median(a), improved: enough && median(b) - median(a) > sp[m].spread, regressed: enough && median(a) - median(b) > sp[m].spread };
    }
    const pf = (s) => [s.passed_after_one_round.hits, s.passed_after_one_round.n];
    const [ah, an] = pf(out.after); const [bh, bn] = pf(out.before);
    claim.passed_after_one_round = { enough_rows: an >= 8 && bn >= 8, p_higher_after: fisherGreater(ah, an, bh, bn) };
    // The guardrail: a rise in reverts or post-landing failures counts against the change.
    for (const k of ['reverted', 'post_landing_failure']) {
      const a = out.after[k]; const b = out.before[k];
      claim[k] = { rise: a.share > b.share, p_higher_after: fisherGreater(a.hits, a.n, b.hits, b.n), counts_against_change: a.share > b.share };
    }
    out.claims = claim;
  }
  out.rows = records.map((r) => ({ n: r.number, plan: r.plan, phase: r.phase, kind: r.kind, merged_at: r.merged_at, side: before.includes(r) ? 'before' : after.includes(r) ? 'after' : 'neither', rounds: r.rounds, findings: r.findings, m1_from_ready: r.m1_from_ready, group: r.group, reverted_by: r.reverted_by.map((x) => x.sha), land_failures: r.land_failures }));
  console.log(JSON.stringify(out, null, 1));
}

function usage() {
  console.error('usage: collect|derive --cache <dir> --from <ISO> --until <ISO> [--max-calls 100] [--out <records.json>] | report --records <records.json> [--cf21 <ISO>]');
  process.exit(2);
}
if (cmd === 'collect') collect();
else if (cmd === 'derive') derive();
else if (cmd === 'report') report();
else usage();
