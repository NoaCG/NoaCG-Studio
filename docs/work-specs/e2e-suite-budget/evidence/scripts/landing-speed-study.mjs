// Read-only Actions research. Cache is private to this study; never dispatches or changes GitHub.
// node <this-file> runs|jobs|prs|analyze
// NOACG_CI_CACHE selects cache; STUDY_FROM/STUDY_TO pin the UTC window.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const cache = process.env.NOACG_CI_CACHE || join(tmpdir(), 'noacg-landing-speed-20261017');
mkdirSync(cache, { recursive: true });
const read = name => JSON.parse(readFileSync(join(cache, name), 'utf8'));
const write = (name, data) => writeFileSync(join(cache, name), JSON.stringify(data, null, 2) + '\n');
const from = process.env.STUDY_FROM || '2026-10-03T00:00:00Z';
const to = process.env.STUDY_TO || '2026-10-17T06:00:00Z';
if (!(Date.parse(from) < Date.parse(to))) throw new Error('STUDY_FROM must be earlier than STUDY_TO');
const repo = 'NoaCG/NoaCG-Studio';
let requests = 0;
async function api(path, args = []) {
  for (let attempt = 0; ; attempt++) {
    if (++requests > 1800) throw new Error('Study request cap reached; resume from cache in another rate window');
    try {
      const { stdout } = await exec('gh', ['api', path, ...args], { maxBuffer: 1 << 27 });
      const data = JSON.parse(stdout);
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      return data;
    } catch (error) {
      if (attempt >= 2 || !/unexpected EOF|ECONNRESET|wsarecv|timeout|HTTP 50[234]/i.test(String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
async function pool(items, fn) {
  const queue = [...items];
  let done = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      await fn(queue.shift());
      if (++done % 100 === 0) console.log(`${done}/${items.length}; requests ${requests}`);
    }
  }));
}
const mode = process.argv[2];
if (!['runs', 'jobs', 'prs', 'analyze'].includes(mode)) throw new Error('Expected runs, jobs, prs or analyze');
if (existsSync(join(cache, 'window.json'))) {
  const captured = read('window.json');
  if (captured.from !== from || captured.to !== to) {
    throw new Error('Cached study window differs from STUDY_FROM/STUDY_TO; use a fresh NOACG_CI_CACHE');
  }
}
if (mode === 'runs') {
  const runs = new Map();
  const firstDay = new Date(from);
  firstDay.setUTCHours(0, 0, 0, 0);
  for (let d = firstDay; d < new Date(to); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    for (let page = 1; ; page++) {
      const name = `runs-${day}-${page}.json`;
      const data = existsSync(join(cache, name)) ? read(name) : await api(`repos/${repo}/actions/runs?created=${day}&per_page=100&page=${page}`);
      write(name, data);
      if (data.total_count > 1000) throw new Error(`Split day ${day}: API search cap would truncate`);
      for (const r of data.workflow_runs) if (r.created_at >= from && r.created_at < to) runs.set(r.id, r);
      if (page * 100 >= data.total_count) break;
    }
    console.log(day, runs.size);
  }
  write('runs.json', [...runs.values()]);
  write('window.json', { from, to, fetchedAt: new Date().toISOString(), requests });
  const counts = {};
  for (const r of runs.values()) counts[r.path] = (counts[r.path] || 0) + 1;
  console.log(JSON.stringify(counts, null, 2));
}
if (mode === 'jobs') {
  mkdirSync(join(cache, 'jobs'), { recursive: true });
  const wanted = new Set(process.argv.slice(3));
  const runs = read('runs.json').filter(r => !wanted.size || wanted.has(r.path.split('/').pop()));
  const tasks = [];
  for (const r of runs) for (let a = 1; a <= r.run_attempt; a++) {
    const name = `jobs/${r.id}-a${a}.json`;
    if (!existsSync(join(cache, name))) tasks.push({ r, a, name });
  }
  const rate = await api('rate_limit');
  console.log('core remaining', rate.resources.core.remaining, 'missing attempts', tasks.length);
  const batch = tasks.slice(0, Math.min(1750, Math.max(0, rate.resources.core.remaining - 1500)));
  console.log('fetching', batch.length, 'deferred', tasks.length - batch.length);
  await pool(batch, async ({ r, a, name }) => {
    const jobs = [];
    for (let page = 1; ; page++) {
      const data = await api(`repos/${repo}/actions/runs/${r.id}/attempts/${a}/jobs?per_page=100&page=${page}`);
      jobs.push(...data.jobs);
      if (jobs.length >= data.total_count) break;
    }
    write(name, jobs);
  });
}
if (mode === 'prs') {
  let cursor = null;
  const prs = [];
  do {
    const query = `query($cursor:String){search(query:"repo:${repo} is:pr is:merged merged:${from.slice(0, 10)}..${to.slice(0, 10)}",type:ISSUE,first:50,after:$cursor){issueCount pageInfo{hasNextPage endCursor} nodes{... on PullRequest{number title mergedAt mergeCommit{oid} timelineItems(first:100,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,MERGED_EVENT]){pageInfo{hasNextPage} nodes{__typename ... on AddedToMergeQueueEvent{createdAt} ... on RemovedFromMergeQueueEvent{createdAt} ... on MergedEvent{createdAt}}}}}}}`;
    const name = `prs-page-${prs.length}.json`;
    const data = existsSync(join(cache, name)) ? read(name) : await api('graphql', ['-f', `query=${query}`, ...(cursor ? ['-f', `cursor=${cursor}`] : [])]);
    write(name, data);
    const search = data.data.search;
    if (search.issueCount > 1000) throw new Error('Split PR search to avoid truncation');
    if (search.nodes.some(p => p.timelineItems.pageInfo.hasNextPage)) throw new Error('Paginate long PR timelines');
    prs.push(...search.nodes);
    cursor = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
  } while (cursor);
  write('prs.json', prs.filter(p => p.mergedAt >= from && p.mergedAt < to));
  console.log('PRs', read('prs.json').length);
}
if (mode === 'analyze') {
  const window = read('window.json');
  const runs = read('runs.json');
  const byRun = new Map();
  const jobsById = new Map();
  const coverage = {};
  const minutes = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
  const quantile = (values, p) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
  };
  const stats = values => {
    const valid = values.filter(value => Number.isFinite(value) && value >= 0);
    return { n: valid.length, p50: quantile(valid, .5), p90: quantile(valid, .9), max: quantile(valid, 1) };
  };
  for (const r of runs) {
    const wf = r.path.split('/').pop();
    const c = coverage[wf] ||= { runs: 0, attempts: 0, fetched: 0 };
    c.runs++;
    for (let a = 1; a <= r.run_attempt; a++) {
      c.attempts++;
      const name = `jobs/${r.id}-a${a}.json`;
      if (!existsSync(join(cache, name))) continue;
      c.fetched++;
      // Cancelled queued jobs can have apparent start/end timestamps without ever
      // receiving a runner. Their waiting interval is not compute consumption.
      const js = read(name).filter(j => j.runner_name && j.started_at && j.completed_at && j.conclusion !== 'skipped' && minutes(j.started_at, j.completed_at) > 0)
        .map(j => ({ ...j, minutes: minutes(j.started_at, j.completed_at), wait: minutes(j.created_at, j.started_at), run: r.id, wf, event: r.event, branch: r.head_branch }));
      // A partial rerun can assign NEW job IDs to carried-forward successful jobs,
      // retaining identical execution intervals. Count actual executions, not those aliases.
      for (const j of js) jobsById.set([r.id, j.name, j.started_at, j.completed_at, j.runner_name].join('|'), j);
      if (a === r.run_attempt) byRun.set(r.id, js);
    }
  }
  const allJobs = [...jobsById.values()];
  const shard = j => /^E2E \d+\/\d+/.test(j.name);
  const rows = runs.filter(r => r.path.endsWith('/ci.yml')).map(r => {
    const js = byRun.get(r.id);
    if (!js) return null;
    const shards = js.filter(shard);
    const get = name => js.find(j => j.name === name);
    const plan = get('E2E plan');
    const gate = get('CI gate');
    const longestShard = Math.max(0, ...shards.map(j => j.minutes));
    const retry = js.find(j => /^E2E retry/.test(j.name));
    const catalog = get('Catalog calibration gate');
    const guided = js.filter(j => /^Guided mod/.test(j.name));
    // Optimistic zero-wait dependency path for the current CI graph. Execution is unchanged.
    // Includes Reviewed and Vercel as parallel checks conservatively; never a 60-slot simulation.
    const noWait = Math.max(
      get('Build')?.minutes || 0, get('Factory gates')?.minutes || 0,
      get('Reviewed')?.minutes || 0, get('Vercel accepted the commit')?.minutes || 0,
      (plan?.minutes || 0) + Math.max(longestShard + (retry?.minutes || 0), catalog?.minutes || 0, ...guided.map(j => j.minutes))
    ) + (gate?.minutes || 0);
    const observed = gate ? minutes(r.created_at, gate.completed_at) : null;
    return { id: r.id, sha: r.head_sha, branch: r.head_branch, event: r.event, created: r.created_at,
      conclusion: r.conclusion, gate: gate?.conclusion, shardCount: shards.length, longestShard,
      capHits: shards.filter(j => ['cancelled', 'timed_out'].includes(j.conclusion) && j.minutes >= 19.5).length,
      allShardsGreen: shards.length > 0 && shards.every(j => j.conclusion === 'success'),
      maxWait: Math.max(0, ...shards.map(j => j.wait)),
      runnerMinutes: js.reduce((s, j) => s + j.minutes, 0), observed, noWait,
      removableDelayUpperBound: observed === null ? null : Math.max(0, observed - noWait) };
  }).filter(Boolean);
  const prs = read('prs.json').map(p => {
    const entries = p.timelineItems.nodes.filter(e => e.__typename === 'AddedToMergeQueueEvent').map(e => e.createdAt).sort();
    const first = entries[0];
    const last = entries.at(-1);
    const match = rows.filter(r => r.event === 'merge_group' && r.branch?.includes(`/pr-${p.number}-`) && r.created >= last && r.created < p.mergedAt && r.gate === 'success')
      .sort((a, b) => b.created.localeCompare(a.created))[0];
    return { number: p.number, merged: p.mergedAt, first, last, entries: entries.length,
      firstToLanded: first ? minutes(first, p.mergedAt) : null, lastToLanded: last ? minutes(last, p.mergedAt) : null,
      mergeRun: match?.id, optimisticNoWait: match ? Math.max(0, minutes(first, p.mergedAt) - match.removableDelayUpperBound) : null };
  });
  const main = rows.filter(r => r.event === 'push' && r.branch === 'main' && r.shardCount);
  const weekly = [];
  const weekBoundary = new Date(Math.min(Date.parse(window.to), Date.parse(window.from) + 7 * 86400000)).toISOString().replace('.000Z', 'Z');
  for (const [start, end] of [[window.from, weekBoundary], [weekBoundary, window.to]]) {
    if (start >= end) continue;
    const ps = prs.filter(p => p.merged >= start && p.merged < end);
    const js = allJobs.filter(j => j.started_at >= start && j.started_at < end);
    weekly.push({ start, end, landed: stats(ps.map(p => p.firstToLanded)), lastEntry: stats(ps.map(p => p.lastToLanded)),
      shardWait: stats(js.filter(shard).map(j => j.wait)), runnerMinutes: js.reduce((s, j) => s + j.minutes, 0) });
  }
  const events = allJobs.filter(j => j.runner_name).flatMap(j => [[Date.parse(j.started_at), 1], [Date.parse(j.completed_at), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, peak = 0, before = null, busyMs = 0, at20Ms = 0;
  for (const [time, delta] of events) {
    if (before !== null && n > 0) { busyMs += time - before; if (n >= 20) at20Ms += time - before; }
    n += delta; peak = Math.max(peak, n); before = time;
  }
  const byWorkflow = {};
  for (const j of allJobs) byWorkflow[j.wf] = (byWorkflow[j.wf] || 0) + j.minutes;
  const byEvent = {};
  for (const j of allJobs.filter(j => j.wf === 'ci.yml')) byEvent[j.event] = (byEvent[j.event] || 0) + j.minutes;
  const prOutcomes = {};
  const failedPrRuns = new Set();
  for (const r of runs.filter(r => r.path.endsWith('/ci.yml') && r.event === 'pull_request')) {
    prOutcomes[r.conclusion] = (prOutcomes[r.conclusion] || 0) + 1;
    if (r.conclusion === 'failure') failedPrRuns.add(r.id);
  }
  const ciShards = allJobs.filter(j => j.wf === 'ci.yml' && shard(j));
  const setup = ciShards.map(j => {
    const step = j.steps.find(s => s.name === 'E2E shard');
    return step?.started_at ? minutes(j.started_at, step.started_at) : NaN;
  }).filter(Number.isFinite);
  const configured = allJobs.filter(j => j.wf === 'configured-suite.yml' && j.name.startsWith('Configured E2E'));
  const configuredStep = pattern => stats(configured.flatMap(j => j.steps.filter(s => pattern.test(s.name) && s.started_at && s.completed_at).map(s => minutes(s.started_at, s.completed_at))));
  const matched = prs.filter(p => Number.isFinite(p.optimisticNoWait));
  const summary = { window, coverage, fetchedJobs: allJobs.length, landing: stats(prs.map(p => p.firstToLanded)), lastEntry: stats(prs.map(p => p.lastToLanded)),
    reentered: prs.filter(p => p.entries > 1).length, weekly, runnerMinutesByWorkflow: byWorkflow,
    ciRunnerMinutesByEvent: byEvent, prOutcomes,
    failedPrRunnerMinutes: allJobs.filter(j => failedPrRuns.has(j.run)).reduce((s, j) => s + j.minutes, 0),
    observedConcurrency: { peak, busyMinutes: busyMs / 60000, atLeast20Minutes: at20Ms / 60000, shareOfCoveredBusyTime: at20Ms / busyMs },
    shardWait: stats(ciShards.map(j => j.wait)), shardSetup: stats(setup),
    main: { runs: main.length, capRuns: main.filter(r => r.capHits).length, slowest: stats(main.map(r => r.longestShard)),
      latest13: main.filter(r => r.shardCount === 13).sort((a, b) => a.created.localeCompare(b.created)) },
    mergeGroup: stats(rows.filter(r => r.event === 'merge_group' && r.gate === 'success').map(r => r.observed)),
    mergeGroupWithShards: stats(rows.filter(r => r.event === 'merge_group' && r.gate === 'success' && r.shardCount).map(r => r.observed)),
    matchedOptimistic: { observed: stats(matched.map(p => p.firstToLanded)),
      halfDelay: stats(matched.map(p => (p.firstToLanded + p.optimisticNoWait) / 2)),
      noWait: stats(matched.map(p => p.optimisticNoWait)),
      note: 'Matched final successful merge run only; current dependency graph, same execution duration, all start/scheduling wait removed. Not a Team forecast.' },
    configured: { jobs: configured.length, wall: stats(configured.map(j => j.minutes)), stack: configuredStep(/^Start the local/), tests: configuredStep(/^Configured E2E suite/) },
    prs, ciRuns: rows };
  write('summary.json', summary);
  console.log(JSON.stringify({ ...summary, prs: undefined, ciRuns: undefined }, null, 2));
}
console.log('cache', cache, 'requests this invocation', requests);
