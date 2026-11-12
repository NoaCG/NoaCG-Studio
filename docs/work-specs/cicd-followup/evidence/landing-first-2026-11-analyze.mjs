#!/usr/bin/env node
// Landing-first study: reads the collector's cache and `git log` and prints the figures the
// evidence file quotes. Read-only, no API calls.
//
//   node docs/work-specs/cicd-followup/evidence/landing-first-2026-11-analyze.mjs --cache <dir>
//
// Needs a full clone (git fetch --unshallow origin): a shallow one lists too few landings.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const CACHE = args[args.indexOf('--cache') + 1];
const FROM = '2026-10-29T00:00:00Z';
const UNTIL = '2026-11-12T00:00:00Z';
if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true') {
  console.error('shallow clone: run git fetch --unshallow origin first');
  process.exit(2);
}

const read = (f) => JSON.parse(readFileSync(join(CACHE, f), 'utf8'));
const runsOf = (prefix) => readdirSync(CACHE).filter((f) => f.startsWith(prefix)).flatMap(read);
const jobsOf = (id) => { try { return read(`jobs-${id}.json`); } catch { return null; } };
const min = (a, b) => (new Date(b) - new Date(a)) / 60000;
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const med = (xs) => q(xs, 0.5);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const out = {};

// Landings: first-parent merges on origin/main in the window.
const log = execFileSync('git', ['log', '--first-parent', 'origin/main', `--since=${FROM}`, `--until=${UNTIL}`, '--format=%H %cI %s'], { encoding: 'utf8' })
  .trim().split('\n').map((l) => { const [sha, at, ...s] = l.split(' '); const m = s.join(' ').match(/Merge pull request #(\d+) from [^/]+\/(\S+)/); return { sha, at, pr: m ? Number(m[1]) : null, branch: m ? m[2] : null }; });
out.landings = log.length;
out.landingsPerDay = f1(log.length / 14);

// Jobs: runner-minutes, E2E shards, peak parallel jobs.
function jobStats(jobs) {
  const live = jobs.filter((j) => j.started_at && j.completed_at && j.conclusion !== 'skipped');
  const rm = live.reduce((s, j) => s + Math.max(0, min(j.started_at, j.completed_at)), 0);
  const e2e = live.filter((j) => /E2E|shard/i.test(j.name) && !/plan|report|verdict/i.test(j.name));
  const e2eRm = e2e.reduce((s, j) => s + min(j.started_at, j.completed_at), 0);
  const ev = live.flatMap((j) => [[j.started_at, 1], [j.completed_at, -1]]).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let c = 0, peak = 0; for (const [, d] of ev) { c += d; peak = Math.max(peak, c); }
  const wall = live.length ? min(live.map((j) => j.started_at).sort()[0], live.map((j) => j.completed_at).sort().at(-1)) : 0;
  return { rm, e2eRm, shards: e2e.length, peak, wall };
}
function summarise(name, runs) {
  const st = runs.map((r) => jobsOf(r.id)).filter(Boolean).map(jobStats).filter((s) => s.rm > 0);
  out[name] = {
    n: st.length,
    runnerMinutesMean: f1(mean(st.map((s) => s.rm))), runnerMinutesMedian: f1(med(st.map((s) => s.rm))),
    e2eRunnerMinutesMean: f1(mean(st.map((s) => s.e2eRm))),
    shardsMedian: med(st.map((s) => s.shards)), peakJobsMedian: med(st.map((s) => s.peak)), peakJobsMax: Math.max(...st.map((s) => s.peak)),
    wallMedian: f1(med(st.map((s) => s.wall))), wallP90: f1(q(st.map((s) => s.wall), 0.9)),
  };
}

const push = runsOf('runs-ci.yml-push-');
const mg = runsOf('runs-ci.yml-merge_group-');
const pr = runsOf('runs-ci.yml-pull_request-');
const cfg = runsOf('runs-configured-suite.yml-push-');
const nightly = runsOf('runs-nightly.yml-');
const by = (rs, k) => rs.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});

out.pushRuns = { n: push.length, conclusion: by(push, 'conclusion') };
out.configuredRuns = { n: cfg.length, conclusion: by(cfg, 'conclusion') };
out.mergeGroupRuns = { n: mg.length, conclusion: by(mg, 'conclusion') };
out.prRuns = { n: pr.length, conclusion: by(pr, 'conclusion') };
// The unit cost of a full push run comes from the collector's even sample only (the same pick),
// single-attempt and green: runs read for other reasons (re-runs, nightly shas) would bias it, and
// a re-run's jobs hold every attempt.
const pick = (runs, n) => {
  const done = runs.filter((r) => r.status === 'completed').sort((x, y) => x.created_at.localeCompare(y.created_at));
  return done.length <= n ? done : Array.from({ length: n }, (_, i) => done[Math.floor((i * done.length) / n)]);
};
summarise('pushFull', pick(push.filter((r) => r.conclusion !== 'cancelled'), 25).filter((r) => r.conclusion === 'success' && r.run_attempt === 1));
summarise('configured', cfg.filter((r) => r.conclusion === 'success'));
summarise('mergeGroup', mg.filter((r) => r.conclusion === 'success'));
summarise('nightly', nightly.filter((r) => r.event === 'schedule' && r.conclusion === 'success'));
out.nightlyStarts = nightly.filter((r) => r.event === 'schedule').map((r) => r.run_started_at.slice(5, 16));
// A cancelled push run: most were cancelled while pending, by main's concurrency group (a newer
// pending run replaces an older one), so they ran no job; the rest stopped at the plan job's
// superseded exit, or in one case had a re-run whose last attempt was cancelled.
const cancelledPush = push.filter((r) => r.conclusion === 'cancelled').map((r) => jobsOf(r.id)).filter(Boolean).map(jobStats);
out.cancelledPushSampled = { n: cancelledPush.length, noJobs: cancelledPush.filter((s) => s.rm === 0).length, rmMean: f1(mean(cancelledPush.map((s) => s.rm))) };

// Landings' own push and configured runs.
const pushBySha = new Map(push.map((r) => [r.head_sha, r]));
const cfgBySha = new Map(cfg.map((r) => [r.head_sha, r]));
// A run's conclusion is its LAST attempt's. Its verdicts are read from the CI gate job in every
// attempt where the jobs were read (every cancelled or re-run push run), else from the conclusion.
// A run cancelled in one job can still have a green or red gate (43092663612: red, then green).
const gates = (r) => {
  const jobs = jobsOf(r.id);
  if (jobs) return jobs.filter((j) => j.name === 'CI gate' && ['success', 'failure'].includes(j.conclusion))
    .map((j) => ({ c: j.conclusion, at: j.completed_at })).sort((a, b) => a.at.localeCompare(b.at));
  return ['success', 'failure'].includes(r.conclusion) ? [{ c: r.conclusion, at: r.updated_at }] : [];
};
const label = (r) => { const g = gates(r); return g.length ? g.map((x) => (x.c === 'success' ? 'green' : 'red')).join(' then ') : 'no verdict'; };
out.landingOwnPush = log.map((l) => (pushBySha.get(l.sha) ? label(pushBySha.get(l.sha)) : 'no push run'))
  .reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});
out.landingOwnConfigured = log.map((l) => cfgBySha.get(l.sha)?.conclusion ?? 'none').reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});

// Gap from a landing to the end of the first green full push run on it or a later landing:
// the window in which a bad merge sits on main before the full suite has spoken about it.
const order = new Map(log.map((l, i) => [l.sha, i])); // 0 = newest
// When main moved: the landing's own push run's creation, or the next landing's when it had none
// (ci13 R1). The merge commit's committer time is when the queue BUILT the group, about 9 minutes
// earlier, so it would count the merge-queue run as time on main.
const pushCreated = new Map(push.map((r) => [r.head_sha, r.created_at]));
for (let i = 0; i < log.length; i += 1) {
  let k = i; while (k >= 0 && !pushCreated.has(log[k].sha)) k -= 1;
  log[i].queuedAt = log[i].at;
  if (k >= 0) log[i].at = new Date(pushCreated.get(log[k].sha)).toISOString();
}
const lag = log.map((l) => min(l.queuedAt, l.at)).filter((x) => x >= 0);
out.mergeCommitToMainMinutes = { n: lag.length, median: f1(med(lag)), p95: f1(q(lag, 0.95)) };
// The bad-merge window: from a landing to the end of the first COMPLETED full push run (green or
// red) on it or a later landing. A red run is the detection, so it ends the window too.
const verdicts = push.filter((r) => order.has(r.head_sha)).map((r) => ({ sha: r.head_sha, g: gates(r) })).filter((v) => v.g.length);
const winRows = log.map((l) => {
  const i = order.get(l.sha);
  const c = verdicts.filter((v) => order.get(v.sha) <= i).map((v) => min(l.at, v.g[0].at)).filter((x) => x >= 0);
  return c.length ? { sha: l.sha, m: Math.min(...c) } : null;
}).filter(Boolean);
const win = winRows.map((x) => x.m);
out.badMergeWindowWorst = winRows.sort((a, b) => b.m - a.m).slice(0, 3).map((x) => `${x.sha.slice(0, 8)} ${f1(x.m)}`);
// One push run, creation to its first gate verdict: the per-run part of the window.
const perRun = push.map((r) => { const g = gates(r); return g.length ? min(r.created_at, g[0].at) : null; }).filter((x) => x !== null);
out.pushRunToFirstVerdict = { n: perRun.length, median: f1(med(perRun)), p95: f1(q(perRun, 0.95)), max: f1(Math.max(...perRun)) };
out.badMergeWindowToday = { n: win.length, median: f1(med(win)), p90: f1(q(win, 0.9)), p95: f1(q(win, 0.95)), p99: f1(q(win, 0.99)), max: f1(Math.max(...win)) };
// Was each scheduled nightly's tree already covered by a completed full push run on the same sha
// (the nightly then repeated it), and by a green one?
const nsha = nightly.filter((r) => r.event === 'schedule');
out.nightlyHeadAlreadyFull = { n: nsha.length,
  pushGreenOnSameSha: nsha.filter((r) => push.some((p) => p.head_sha === r.head_sha && gates(p).some((g) => g.c === 'success'))).length,
  nightlyOwn: nsha.map((r) => `${r.created_at.slice(5, 10)} ${r.conclusion} ${r.head_sha.slice(0, 8)}`) };
// Per landed pull request: its PR runs (heads, cancelled), its merge-group runs. The runs list
// carries no PR number for this repository, so a PR's runs are its branch's runs created before
// it landed and after the same branch's previous landing (branch names are reused rarely).
const mgByPr = new Map();
for (const r of mg) { const m = r.head_branch?.match(/pr-(\d+)-/); if (m) { const n = Number(m[1]); mgByPr.set(n, (mgByPr.get(n) || 0) + 1); } }
const used = new Set();
const rows = [...log].reverse().filter((l) => l.branch).map((l) => {
  const rs = pr.filter((r) => r.head_branch === l.branch && r.created_at <= l.at && !used.has(r.id));
  rs.forEach((r) => used.add(r.id));
  const heads = new Set(rs.map((r) => r.head_sha)).size;
  const span = rs.length ? min(rs.map((r) => r.created_at).sort()[0], l.at) : 0;
  return { pr: l.pr, runs: rs.length, heads, cancelled: rs.filter((r) => r.conclusion === 'cancelled').length,
    failed: rs.filter((r) => r.conclusion === 'failure').length, mg: mgByPr.get(l.pr) || 0, hours: span / 60 };
}).filter((r) => r.runs > 0);
const dist = (k) => ({ median: med(rows.map((r) => r[k])), p90: q(rows.map((r) => r[k]), 0.9), mean: f1(mean(rows.map((r) => r[k]))), max: Math.max(...rows.map((r) => r[k])) });
out.perLandedPr = { n: rows.length, prRuns: dist('runs'), heads: dist('heads'), cancelled: dist('cancelled'), failed: dist('failed'), mergeGroupRuns: dist('mg'),
  totalPrRuns: rows.reduce((s, r) => s + r.runs, 0), totalCancelled: rows.reduce((s, r) => s + r.cancelled, 0),
  share4plusHeads: f1((100 * rows.filter((r) => r.heads >= 4).length) / rows.length) + '%',
  runsOnPrsWith4plusHeads: rows.filter((r) => r.heads >= 4).reduce((s, r) => s + r.runs, 0) };
out.prRunsNotOnALandedPr = pr.filter((r) => !used.has(r.id)).length;
out.prRunsInWindowOnLandedPrs = used.size;
// PR run cost: mean runner-minutes of completed PR runs is not collected (no job reads); the
// merge-group run is the closest planned-alike run and is used as the unit.
// What a pull request run costs, by outcome (sampled jobs), and how soon the next head follows.
summarise('prCancelled', pr.filter((r) => r.conclusion === 'cancelled'));
summarise('prCompleted', pr.filter((r) => r.conclusion !== 'cancelled'));
summarise('pushCancelled', push.filter((r) => r.conclusion === 'cancelled'));
const gaps = [];
for (const b of new Set(pr.map((r) => r.head_branch))) {
  const rs = pr.filter((r) => r.head_branch === b).sort((x, y) => x.created_at.localeCompare(y.created_at));
  for (let i = 1; i < rs.length; i += 1) gaps.push(min(rs[i - 1].created_at, rs[i].created_at));
}
out.nextHeadGapMinutes = { n: gaps.length, median: f1(med(gaps)), p90: f1(q(gaps, 0.9)),
  within15: gaps.filter((g) => g <= 15).length, within30: gaps.filter((g) => g <= 30).length, within60: gaps.filter((g) => g <= 60).length };
// Why each follow-up head was pushed: while the previous head's run was going (it was cancelled
// at or after the new head's creation), after a red run, or after a green one.
const why = { whileRunning: 0, afterRed: 0, afterGreen: 0, other: 0 };
for (const b of new Set(pr.map((r) => r.head_branch))) {
  const rs = pr.filter((r) => r.head_branch === b).sort((x, y) => x.created_at.localeCompare(y.created_at));
  for (let i = 1; i < rs.length; i += 1) {
    const p = rs[i - 1];
    if (p.conclusion === 'cancelled' && min(rs[i].created_at, p.updated_at) >= -1) why.whileRunning += 1;
    else if (p.conclusion === 'failure') why.afterRed += 1;
    else if (p.conclusion === 'success') why.afterGreen += 1;
    else why.other += 1;
  }
}
out.followUpHeads = why;
// Runs created per UTC hour over the window (push, pull request).
out.runsByUtcHour = Array.from({ length: 24 }, (_, h) => [h,
  push.filter((r) => new Date(r.created_at).getUTCHours() === h).length,
  pr.filter((r) => new Date(r.created_at).getUTCHours() === h).length].join(' ')).join(', ');

// Step 5: the suite from one nightly's merged Playwright report (--report <nightly-report.json>).
if (args.includes('--report')) {
  const rep = JSON.parse(readFileSync(args[args.indexOf('--report') + 1], 'utf8'));
  const tests = [];
  const walk = (s, file) => { file = s.file || file; for (const x of s.suites || []) walk(x, file);
    for (const sp of s.specs || []) for (const t of sp.tests || []) tests.push({ file: sp.file || file, title: sp.title, ms: (t.results || []).reduce((a, r) => a + (r.duration || 0), 0) }); };
  for (const s of rep.suites) walk(s);
  const mins = (xs) => xs.reduce((a, t) => a + t.ms, 0) / 60000;
  const long = tests.filter((t) => t.ms > 30000);
  const chrome = tests.filter((t) => t.file.includes('public-chrome-baseline'));
  // Screen-size repeats: tests whose titles differ only by a size label.
  const V = /\b(desk(top)?|laptop(-125)?|phone|tablet|mobile|narrow|wide|\d{3,4}(px|x\d+)?)\b/gi;
  const groups = {};
  for (const t of tests) { const k = `${t.file}::${t.title.replace(V, '<v>')}`; if (k.includes('<v>')) (groups[k] = groups[k] || []).push(t); }
  const multi = Object.entries(groups).filter(([, v]) => v.length > 1);
  const beyondFirst = (v) => v.map((t) => t.ms).sort((a, b) => b - a).slice(1).reduce((a, b) => a + b, 0) / 60000;
  const EDITOR_JOURNEYS = /^editor-(command-task|drawing-task|cli-round-trip|usability|keys|out|fidelity-trim|layer-property-qualification|transform-qualification)\.spec\.ts::/;
  // The first cut: each editor journey kept at the smallest size it runs at (1093 wide is
  // laptop-125), the others dropped.
  const width = (title) => (/laptop-125|\b1093\b/.test(title) ? 1093 : /\blaptop\b|\b1366\b/.test(title) ? 1366 : /desktop|\b1920\b/.test(title) ? 1920 : 0);
  const cut = multi.filter(([k]) => EDITOR_JOURNEYS.test(k)).flatMap(([, v]) => {
    const keep = Math.min(...v.map((t) => width(t.title)));
    return v.filter((t) => width(t.title) !== keep);
  });
  out.suite = { tests: tests.length, files: new Set(tests.map((t) => t.file)).size, testMinutes: f1(mins(tests)),
    perTestSeconds: { p50: f1(q(tests.map((t) => t.ms / 1000), 0.5)), p90: f1(q(tests.map((t) => t.ms / 1000), 0.9)), p99: f1(q(tests.map((t) => t.ms / 1000), 0.99)) },
    over30s: { n: long.length, minutes: f1(mins(long)) }, publicChrome: { n: chrome.length, minutes: (mins(chrome)).toFixed(2) },
    sizeRepeats: { groups: multi.length, tests: multi.reduce((a, [, v]) => a + v.length, 0), minutesBeyondFirst: f1(multi.reduce((a, [, v]) => a + beyondFirst(v), 0)) },
    firstCut: { tests: cut.length, minutes: f1(mins(cut)), commandTask: f1(mins(cut.filter((t) => t.file.startsWith('editor-command-task')))),
      alsoOver30s: f1(mins(cut.filter((t) => t.ms > 30000))) } };
}
out.ciRunsPerLanding = f1((pr.length + mg.length + push.length + cfg.length) / log.length);
out.top = rows.sort((a, b) => b.runs - a.runs).slice(0, 8);

console.log(JSON.stringify(out, null, 1));
