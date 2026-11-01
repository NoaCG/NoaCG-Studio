// GROWTH CONTROLS FOR THE WHOLE DELIVERY PROCESS - the pure half of D7
// (docs/work-specs/cicd-improvement/spec.md, D7 and AC-9; ceilings frozen in
// docs/work-specs/cicd-improvement/evidence/phase-ci01.md section 4, held in growth-ceilings.json).
//
// No I/O here. Two callers use it:
//   - scripts/e2e-capacity.mjs, the existing capacity line every pull request and merge group
//     already passes. It prices what this change ADDS to each tier and refuses additive growth
//     tier by tier. There is no aggregate per-PR gate: the sum of the tiers is a weekly report
//     line and an envelope check only.
//   - scripts/growth-report.mjs, the weekly report (weekly-audit.yml). It measures each tier's
//     runner-minutes, attributes indirect slowdowns to a landing range, reads the open items'
//     ages, and carries each breach through one bounded correction to a growth stop.
//
// THE RULES, in the order a reader needs them:
//   1. Four tiers, each judged alone against its own frozen ceiling: offline, backend (selected
//      and full), graphics (affected, broad, scheduled) and fixed overhead. Runner-minutes per
//      landing for what a landing causes, per day for scheduled work. No tier's headroom offsets
//      another's, and more shards only spend more runner-minutes against the same ceiling.
//   2. 85% warns; at 95% a change that ADDS cost is refused. A change that adds nothing is never
//      refused, so cost-reducing maintenance always passes, also over a ceiling.
//   3. Evidence: complete, partial, stale (older than the freshness bound) or missing. Missing
//      is never zero: additive growth into a tier with no measurement is refused. Partial or
//      stale evidence cannot establish the last 10 points of headroom, so additive growth is
//      refused from the 85% line instead of the 95% line.
//   4. A new case is priced conservatively (growth-ceilings.json `estimates`), including the
//      setup it brings (a stack per ten configured test-minutes, a runner per new job).
//   5. Exceptions: separately reviewed, owned, scoped (`covers`), at most 30 days. An expired or
//      invalid exception covers nothing, so its cost counts again. A later exception whose scope
//      overlaps an earlier one is a renewal and needs a measured repayment receipt; scope is what
//      it covers, not its id or the file it sits in. The ledger is append-only.
//   6. Ceilings move only with a new version carrying a reviewed rationale and the owner's
//      authority; never automatically.
//   7. A single run never refuses its own change for unchanged tests: indirect slowdowns are
//      found in complete post-landing evidence, attributed to a landing range, and only then
//      raise the tier's estimate that later additive growth is judged against.
//   8. Clocks start at an observable event and never reset. Any one unfinished item past its
//      age ceiling gets an owned, dated action at once; pooled weekly reporting needs 12
//      samples across categories and keeps the categories in the report.
//   9. A breach gets one bounded correction; still breached at its due date, growth in the
//      affected tiers stops until it is measured back in bounds.

export const TIERS = ['offline', 'backend', 'graphics', 'overhead'];
const DAY = 86_400_000;

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const dayMs = (s) => Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`);
const addDays = (s, n) => isoDay(dayMs(s) + n * DAY);
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Tiers of jobs (ci01 section 4.2): each job counts once, in one tier, by workflow and job name.

/** The tier a workflow job's runner-minutes belong to. `workflow` is the file name (ci.yml). */
export function tierOfJob(workflow, jobName) {
  const wf = String(workflow).split('/').pop();
  const name = String(jobName);
  if (wf === 'configured-suite.yml' || wf === 'hosted-latency.yml') return 'backend';
  if (wf === 'ci.yml' && /^Configured E2E\b/.test(name)) return 'backend';
  if (wf === 'catalog-gates.yml' || wf === 'fit-sweep.yml') return 'graphics';
  if ((wf === 'ci.yml' || wf === 'nightly.yml') && /^Catalog calibration\b/.test(name)) return 'graphics';
  if (wf === 'nightly.yml' && /^Type floor, overflow sweep\b/.test(name)) return 'graphics';
  if (wf === 'ci.yml' && /^(E2E \d|E2E plan$|E2E retry\b|Combined E2E report$)/.test(name)) return 'offline';
  if (wf === 'nightly.yml' && /^(Nightly E2E \d|Nightly shard plan$|Combined nightly report$)/.test(name)) return 'offline';
  if (wf === 'quarantine.yml' && /^Quarantine \(/.test(name)) return 'offline';
  return 'overhead';
}

// ---------------------------------------------------------------------------------------------
// Pricing what a change adds.

/** Jobs a workflow file declares, and whether it runs on a schedule or on changes. */
export function workflowShape(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const jobs = [];
  const names = {};
  const width = {};
  const axes = {};
  const dynamic = {};
  const includes = {};
  let inJobs = false;
  let current = null;
  let matrixIndent = null;
  let strategyIndent = null;
  let axis = null;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (inJobs && /^\S/.test(line)) inJobs = false;
    if (!inJobs) continue;
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) { current = key[1]; jobs.push(current); axes[current] = []; matrixIndent = null; strategyIndent = null; axis = null; continue; }
    const nm = /^ {4}name:\s*(.+?)\s*$/.exec(line);
    if (nm && current && !names[current]) names[current] = nm[1].replace(/^['"]|['"]$/g, '');
    // A static matrix runs the job once per combination: count each axis's values. A matrix built
    // at run time (`${{ fromJSON(...) }}`) cannot be counted here and is measured weekly instead.
    const indent = line.search(/\S/);
    if (/^\s+strategy:\s*$/.test(line)) { strategyIndent = indent; continue; }
    const inStrategy = strategyIndent !== null && indent === strategyIndent + 2;
    if (inStrategy && /^\s+matrix:\s*$/.test(line)) { matrixIndent = indent; axis = null; continue; }
    if (inStrategy && /^\s+matrix:\s*\$\{\{/.test(line) && current) { dynamic[current] = true; continue; }
    if (strategyIndent !== null && indent >= 0 && indent <= strategyIndent) strategyIndent = null;
    if (matrixIndent === null || indent < 0) continue;
    if (indent <= matrixIndent) { matrixIndent = null; axis = null; continue; }
    const kv = /^\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (kv && indent === matrixIndent + 2) {
      axis = null;
      if (/\$\{\{/.test(kv[2])) { dynamic[current] = true; continue; }
      // `include` adds its entries (each `- ` item); `exclude` only removes, so it is ignored, which
      // can only overcount.
      if (kv[1] === 'include') { axis = 'include'; continue; }
      if (kv[1] === 'exclude') continue;
      const list = /^\[(.*)\]$/.exec(kv[2]);
      if (list) axes[current].push(list[1].split(',').filter((x) => x.trim()).length);
      else if (kv[2] === '') { axis = axes[current].length; axes[current].push(0); }
      continue;
    }
    if (axis === 'include' && /^\s+-\s/.test(line) && indent === matrixIndent + 4) { includes[current] = (includes[current] ?? 0) + 1; continue; }
    if (axis !== null && axis !== 'include' && /^\s+-\s/.test(line) && indent === matrixIndent + 4) axes[current][axis] += 1;
  }
  // Combinations of the axes, plus each `include` entry (counted as its own run: an include that
  // only extends an existing combination is overcounted, never undercounted).
  for (const j of jobs) width[j] = (axes[j].length ? axes[j].reduce((a, n) => a * Math.max(1, n), 1) : includes[j] ? 0 : 1) + (includes[j] ?? 0);
  const on = /^on:\s*\n([\s\S]*?)(?=^\S)/m.exec(`${text ?? ''}\n_end:`)?.[1] ?? '';
  const crons = [...on.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const inline = /^on:[ \t]*\[?([^\n\]]*)\]?[ \t]*$/m.exec(String(text ?? ''))?.[1] ?? '';
  const triggers = new Set([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).concat(inline.split(/[\s,]+/).filter(Boolean)));
  return { jobs, names, crons, triggers, width, dynamic };
}

/** Runs per day of a five-field cron line (minute, hour, day-of-month, month, day-of-week). */
export function cronRunsPerDay(cron) {
  const [min, hour, dom, , dow] = String(cron).trim().split(/\s+/);
  const count = (field, size) => {
    if (field === undefined || field === '*') return size;
    return field.split(',').reduce((n, part) => {
      const step = /^(\*|\d+-\d+)\/(\d+)$/.exec(part);
      if (step) {
        const [lo, hi] = step[1] === '*' ? [0, size - 1] : step[1].split('-').map(Number);
        return n + Math.floor((hi - lo) / Number(step[2])) + 1;
      }
      const range = /^(\d+)-(\d+)$/.exec(part);
      return n + (range ? Number(range[2]) - Number(range[1]) + 1 : 1);
    }, 0);
  };
  let perDay = count(min, 60) * count(hour, 24);
  if (dow !== undefined && dow !== '*') perDay *= count(dow, 7) / 7;
  else if (dom !== undefined && dom !== '*') perDay *= count(dom, 31) / 30.4;
  return perDay;
}

const FOLLOWS = ['workflow_run', 'deployment_status', 'check_suite', 'check_run', 'status'];
const KNOWN = new Set(['pull_request', 'pull_request_target', 'merge_group', 'push', 'schedule', ...FOLLOWS]);

/**
 * How often a workflow's jobs run: per landing by trigger (every PR run, the merge-group run, the
 * push that lands; a job that follows other runs as if on every one; any other trigger at least
 * once per landing, because an unknown frequency is not zero, except a dispatch beside a cron,
 * which is that schedule's manual re-run) and per day by its crons.
 */
export function cadence(shape, e) {
  const has = (t) => shape.triggers.has(t);
  let runs = (has('pull_request') || has('pull_request_target') ? e.prRunsPerLanding : 0) + (has('merge_group') ? 1 : 0) + (has('push') ? 1 : 0);
  if (FOLLOWS.some(has)) runs = Math.max(runs, e.runsPerLanding.everyRun);
  if ([...shape.triggers].some((t) => !KNOWN.has(t) && !(t === 'workflow_dispatch' && shape.crons.length))) runs = Math.max(runs, 1);
  return { runs, daily: shape.crons.reduce((n, c) => n + cronRunsPerDay(c), 0) };
}

/**
 * What this change adds, tier by tier, priced conservatively. Pure.
 *
 * `added` are repo-relative files the change ADDS. `workflows` maps a workflow file name to
 * `{ base, head }` text for each workflow the change touches. Offline spec files are not priced
 * here: the existing table line in e2e-capacity.mjs prices them in table-minutes, as before.
 */
export function priceAdditions({ added = [], workflows = {}, estimates }) {
  const e = estimates;
  const items = [];
  for (const file of added) {
    if (/^e2e\/configured\/.+\.spec\.ts$/.test(file)) {
      // Each configured stack is set up once per ten measured test-minutes, so a case brings
      // its share of a stack's setup on every run it is part of.
      const setup = e.backendStackSetupMinutes * (e.backendCaseMinutes / e.backendStackQuantumMinutes);
      const unit = e.backendCaseMinutes + setup;
      items.push({ tier: 'backend', id: `spec:${file}`, perLanding: e.runsPerLanding.backend * unit, perDay: (e.scheduledRunsPerDay?.backend ?? 0) * unit, how: `new configured spec at ${e.backendCaseMinutes} test-min + ${setup.toFixed(2)} setup, x ${e.runsPerLanding.backend} runs per landing and ${e.scheduledRunsPerDay?.backend ?? 0} scheduled runs a day` });
    } else if (/^e2e\/catalog\/.+\.spec\.ts$/.test(file)) {
      items.push({ tier: 'graphics', id: `spec:${file}`, perLanding: e.runsPerLanding.graphics * e.graphicsCaseMinutes, perDay: (e.scheduledRunsPerDay?.graphics ?? 0) * e.graphicsCaseMinutes, how: `new catalog spec at ${e.graphicsCaseMinutes} min, x ${e.runsPerLanding.graphics} catalog runs per landing and ${e.scheduledRunsPerDay?.graphics ?? 0} scheduled runs a day` });
    }
  }
  for (const [wf, { base, head }] of Object.entries(workflows)) {
    const before = workflowShape(base);
    const after = workflowShape(head);
    const was = cadence(before, e);
    const now = cadence(after, e);
    // A renamed key or a renamed display name is the same job, not a new one. A removed job earns
    // no credit: pricing it would let a cheap removal pay for an expensive addition.
    for (const job of after.jobs) {
      const name = after.names[job] ?? job;
      const tier = tierOfJob(wf, name);
      if (tier === 'offline') continue; // offline work is the table line's to price
      const oldKey = before.jobs.includes(job) ? job : before.jobs.find((j) => (before.names[j] ?? j) === name);
      // A job moved into another tier by a rename brings its whole cost there: it is new to that
      // tier, so its old tier's headroom or exceptions never cover it.
      const moved = oldKey !== undefined && tierOfJob(wf, before.names[oldKey] ?? oldKey) !== tier;
      const fresh = oldKey === undefined || moved;
      // A new job pays for every run of every matrix entry, at the slowest measured job of its tier;
      // an existing job pays for the runs a more frequent trigger or schedule adds and for any
      // matrix entries it gains, never less than nothing. A matrix built at run time is counted at
      // the widest one in the repository.
      const widthOf = (shape, k) => (shape.dynamic[k] ? e.dynamicMatrixWidth : shape.width[k] ?? 1);
      const w = widthOf(after, job);
      const wasW = fresh ? 0 : widthOf(before, oldKey);
      const runs = fresh ? now.runs * w : Math.max(0, now.runs * w - was.runs * wasW);
      const daily = fresh ? now.daily * w : Math.max(0, now.daily * w - was.daily * wasW);
      if (runs <= 0 && daily <= 0) continue;
      const minutes = e.newJobMinutesByTier?.[tier] ?? e.newJobMinutes;
      items.push({ tier, id: `job:${wf}/${name}`, perLanding: runs * minutes, perDay: daily * minutes, how: `${moved ? 'job moved into this tier' : fresh ? 'new job' : 'more runs of a job'} at ${minutes} runner-min${w > 1 ? ` x ${w} matrix entries` : ''}${runs ? `, +${runs.toFixed(2)} runs per landing` : ''}${daily ? `, +${daily.toFixed(2)} runs per day` : ''}` });
    }
  }
  return items;
}

/**
 * What a covered item costs per landing and per day, as far as an exception may credit it: a job
 * from the measurement's per-job costs (a workflow `name:` with `${{ }}` matches every shard of
 * it); anything else nothing.
 */
export function coverCosts(measurement) {
  const jobs = Object.entries(measurement?.jobs ?? {});
  return (cover) => {
    const job = /^job:([^/]+)\/(.+)$/.exec(cover);
    if (job) {
      const pattern = new RegExp(`^${job[2].split(/\$\{\{[^}]*\}\}/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      return jobs.filter(([k]) => k.startsWith(`${job[1]}/`) && pattern.test(k.slice(job[1].length + 1)))
        .reduce((a, [, v]) => ({ perLanding: a.perLanding + (v.perLanding ?? 0), perDay: a.perDay + (v.perDay ?? 0) }), { perLanding: 0, perDay: 0 });
    }
    // A spec has no measured runner-minutes of its own, only a deliberately high estimate, so it
    // earns no credit: an exception naming a spec only keeps that spec's addition from counting.
    return { perLanding: 0, perDay: 0 };
  };
}

/** Every cover that names something real: each workflow job (`{ file: text }`) and spec path. */
export function knownCovers(workflowTexts, specPaths) {
  const out = new Set(specPaths.map((f) => `spec:${f}`));
  for (const [wf, text] of Object.entries(workflowTexts)) {
    const shape = workflowShape(text);
    for (const j of shape.jobs) out.add(`job:${wf}/${shape.names[j] ?? j}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Evidence and freshness.

/** complete | partial | stale | missing, with the age in days of the measurement window's end. */
export function evidenceOf(measurement, tier, today, freshnessDays) {
  const t = measurement?.tiers?.[tier];
  if (!measurement || !t || !Number.isFinite(t.perLanding)) return { state: 'missing', ageDays: null, why: 'no measurement of this tier' };
  const ageDays = Math.floor((dayMs(today) - dayMs(measurement.windowEnd)) / DAY);
  if (!Number.isFinite(ageDays)) return { state: 'missing', ageDays: null, why: 'the measurement has no window end' };
  if (ageDays > freshnessDays) return { state: 'stale', ageDays, why: `measured to ${measurement.windowEnd}, ${ageDays} days ago (bound ${freshnessDays})` };
  if (t.evidence !== 'complete') return { state: 'partial', ageDays, why: t.why ?? 'partial evidence' };
  return { state: 'complete', ageDays, why: '' };
}

/**
 * The accepted durations table's age. An open refresh pull request is pending, not accepted:
 * it never makes the table fresh, and it is named so nobody mistakes it for a refresh.
 */
export function tableFreshness({ recordedAt, today, boundDays, pending = [] }) {
  const ageDays = Math.floor((dayMs(today) - dayMs(recordedAt)) / DAY);
  const stale = !Number.isFinite(ageDays) || ageDays > boundDays;
  const pend = pending.length ? `; pending, not accepted: ${pending.map((p) => `#${p.number}${p.recordedAt ? ` (recorded ${p.recordedAt})` : ''}`).join(', ')}` : '';
  return {
    recordedAt, ageDays, stale, pending,
    reason: stale
      ? `durations table recorded ${recordedAt ?? 'never'}, ${Number.isFinite(ageDays) ? ageDays : '?'} days old, over its ${boundDays}-day bound${pend}`
      : `durations table recorded ${recordedAt}, ${ageDays} days old (bound ${boundDays})${pend}`,
  };
}

/** The weekly report itself is owed every `maxAgeDays`; a missing one is an owned failure. */
export function reportCadence({ generatedAt, today, maxAgeDays }) {
  if (!generatedAt) return { overdue: true, reason: 'no weekly growth report has been published' };
  const ageDays = Math.floor((dayMs(today) - dayMs(generatedAt)) / DAY);
  return { overdue: ageDays > maxAgeDays, ageDays, reason: ageDays > maxAgeDays ? `the last weekly growth report is ${ageDays} days old (bound ${maxAgeDays})` : `weekly growth report ${ageDays} day(s) old` };
}

// ---------------------------------------------------------------------------------------------
// Exceptions.

// Scope is what an exception covers, whatever tier, id or file it is filed under: re-filing a
// covered job under another tier is the same scope, and would offset that tier besides.
/** A recorded decision: an issue comment in this repository, never a link to anything else. */
const ISSUE_COMMENT = /^https:\/\/github\.com\/NoaCG\/NoaCG-Studio\/issues\/\d+#issuecomment-\d+$/;

const overlaps = (a, b) => a.covers.some((c) => b.covers.includes(c));

/** The tier a covered entry belongs to: `job:<workflow>/<job name>` or `spec:<path>`. */
export function tierOfCover(cover) {
  const job = /^job:([^/]+)\/(.+)$/.exec(cover);
  if (job) return tierOfJob(job[1], job[2]);
  const spec = /^spec:(e2e\/.+\.spec\.ts)$/.exec(cover);
  if (spec) return /^e2e\/configured\//.test(spec[1]) ? 'backend' : /^e2e\/catalog\//.test(spec[1]) ? 'graphics' : 'offline';
  return null;
}

/**
 * Problems with one exception, judged against the entries before it in the ledger. `known`, when
 * given, is every cover that names a real job or spec today; a cover outside it (a reworded scope)
 * covers nothing.
 */
export function exceptionProblems(e, earlier, maxDays, known = null) {
  const p = [];
  if (!e.id) p.push('no id');
  if (!TIERS.includes(e.tier)) p.push(`unknown tier ${e.tier}`);
  if (!Array.isArray(e.covers) || e.covers.length === 0) p.push('no scope (covers)');
  for (const c of Array.isArray(e.covers) ? e.covers : []) {
    if (tierOfCover(c) !== e.tier) p.push(`covers ${c}, which is not in the ${e.tier} tier`);
    else if (known && !known.has(c)) p.push(`covers ${c}, which names no job or spec in the repository`);
  }
  if (!(e.perLanding > 0) && !(e.perDay > 0)) p.push('no cost');
  if (!e.owner) p.push('no owner');
  // A separate review is a recorded decision on an issue, not a link to anything.
  if (!ISSUE_COMMENT.test(e.reviewed ?? '')) p.push('no separate review: link the issue comment that records the decision');
  const from = dayMs(e.from);
  const exp = dayMs(e.expires);
  if (!Number.isFinite(from) || !Number.isFinite(exp) || exp < from) p.push('no valid from/expires dates');
  else if (exp - from > maxDays * DAY) p.push(`runs ${Math.round((exp - from) / DAY)} days, over ${maxDays}`);
  if (Array.isArray(e.covers) && e.covers.length) {
    // A renamed or removed job is no way round renewal, whatever tier it lands in: an earlier entry
    // whose cover no longer names anything real, and that ran within 30 days of this one, is the same scope.
    const orphaned = (x) => known && x.covers.some((c) => !known.has(c)) && dayMs(x.expires) + maxDays * DAY >= dayMs(e.from);
    const prior = earlier.filter((x) => Array.isArray(x.covers) && (overlaps(x, e) || orphaned(x)));
    if (prior.length) {
      const r = e.repaid;
      const latest = Math.max(...prior.map((x) => dayMs(x.from)));
      const ok = r && (r.perLanding > 0 || r.perDay > 0) && Array.isArray(r.runs) && r.runs.length > 0 && dayMs(r.measuredAt) >= latest;
      if (!ok) p.push(`renews the scope of ${prior.map((x) => x.id).join(', ')} without a measured repayment receipt`);
    }
  }
  return p;
}

/** Active exceptions on `today`, and the invalid ones with why. Expired ones are listed apart. */
export function exceptionStatus(ledger = [], today, maxDays, known = null) {
  const active = [];
  const invalid = [];
  const expired = [];
  ledger.forEach((e, i) => {
    const problems = exceptionProblems(e, ledger.slice(0, i), maxDays, known);
    if (problems.length) invalid.push({ ...e, problems });
    else if (dayMs(e.expires) < dayMs(today)) expired.push(e);
    else if (dayMs(e.from) <= dayMs(today)) active.push(e);
  });
  return { active, invalid, expired };
}

/** Exceptions expiring within `withinDays` of today: the weekly report's expiry alert. */
export function expiringSoon(active, today, withinDays = 7) {
  return active.filter((e) => dayMs(e.expires) - dayMs(today) <= withinDays * DAY);
}

const stripLedger = (c) => Object.fromEntries(Object.entries(c ?? {}).filter(([k]) => k !== 'exceptions' && k !== 'revisions'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What a change does to the ceilings file. The exception ledger is append-only; every other
 * field moves only with a higher version and a new revision naming a reviewed rationale and the
 * owner's authority. `mainRunners` and `shardCap` are the offline line's MAIN_RUNNERS and
 * SHARD_CAP_MINUTES before and after: the two levers that set its capacity.
 */
/** The revision a change to the ceilings file carries, if it changed anything but the exception ledger. */
export function ceilingsRevision(base, head) {
  if (!base || !head || same(stripLedger(base), stripLedger(head))) return null;
  return (head.revisions ?? []).find((r) => r.version === head.version) ?? { version: head.version };
}

export function ledgerChanges({ base, head, mainRunners = null, shardCap = null }) {
  const problems = [];
  if (!base || !head) return problems;
  const headById = new Map((head.exceptions ?? []).map((e) => [e.id, e]));
  for (const e of base.exceptions ?? []) {
    const now = headById.get(e.id);
    if (!now) problems.push(`exception ${e.id} was removed: the ledger is append-only`);
    else if (!same(e, now)) problems.push(`exception ${e.id} was edited: the ledger is append-only; add a new entry`);
  }
  // Append-only means in order too: renewal is judged against the entries BEFORE an exception,
  // so a new entry put ahead of the old ones would turn the old one into the "renewal".
  const prefix = (head.exceptions ?? []).slice(0, (base.exceptions ?? []).length).map((e) => e.id);
  if (problems.length === 0 && !same(prefix, (base.exceptions ?? []).map((e) => e.id))) problems.push('new exceptions must be appended after the existing ones: the ledger is append-only, in order');
  const revised = head.version > base.version && (head.revisions ?? []).some((r) => r.version === head.version && r.rationale && r.authority && ISSUE_COMMENT.test(r.reviewed ?? ''));
  if (!same(stripLedger(base), stripLedger(head)) && !revised) problems.push('the frozen ceilings, estimates or measurement changed without a new version and a reviewed revision (rationale, authority)');
  if (mainRunners && mainRunners.head > mainRunners.base && !revised) problems.push(`MAIN_RUNNERS rose from ${mainRunners.base} to ${mainRunners.head}: more runners never buy budget without a reviewed revision`);
  if (shardCap && shardCap.head > shardCap.base && !revised) problems.push(`SHARD_CAP_MINUTES rose from ${shardCap.base} to ${shardCap.head}: a longer shard never buys budget without a reviewed revision`);
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The per-tier assessment. Pure.

/**
 * Judge each tier alone. `items` are what this change adds (priceAdditions); `measurement` is
 * the latest weekly report's (or the frozen seed's); `stops` maps a tier to the breach that
 * stopped its growth.
 */
export function assessTiers({ ceilings, measurement, items = [], today, stops = {}, exceptions = ceilings.exceptions ?? [], known = null, coverCost = coverCosts(measurement) }) {
  const { active, invalid } = exceptionStatus(exceptions, today, ceilings.exceptionMaxDays, known);
  const tiers = {};
  for (const tier of TIERS) {
    const ceiling = ceilings.tiers[tier];
    const ev = evidenceOf(measurement, tier, today, ceilings.freshnessDays);
    const m = measurement?.tiers?.[tier];
    // Credit is capped at what the covered items cost: an exception never excepts more than the
    // jobs or specs it names and an unknown cost earns no credit. Each cover's measured cost is a
    // pool that active exceptions draw on in ledger order. Overlapping entries (a renewal beside its
    // predecessor) approve the larger allowance, never the sum: an entry credits only what its own
    // allowance adds beyond the credit its covers already received, and never more than they cost.
    const pool = new Map();
    const draw = (covers, want, key) => {
      for (const c of covers) if (!pool.has(c)) pool.set(c, { left: { ...coverCost(c) }, credited: { perLanding: 0, perDay: 0 } });
      const prior = covers.reduce((a, c) => a + pool.get(c).credited[key], 0);
      const budget = Math.max(0, want - prior);
      let got = 0;
      for (const c of covers) {
        const take = Math.min(budget - got, pool.get(c).left[key]);
        pool.get(c).left[key] -= take;
        pool.get(c).credited[key] += take;
        got += take;
      }
      return got;
    };
    const mine = active.filter((e) => e.tier === tier).map((e) => ({
      ...e,
      perLanding: draw(e.covers, e.perLanding ?? 0, 'perLanding'),
      perDay: draw(e.covers, e.perDay ?? 0, 'perDay'),
      claimed: { perLanding: e.perLanding ?? 0, perDay: e.perDay ?? 0 },
    }));
    const covered = (item) => mine.find((e) => e.covers.includes(item.id));
    const tierItems = items.filter((i) => i.tier === tier);
    // An exception waives added cost only up to what is left of its approved allowance after the
    // measured cost of what it covers: growing an excepted job needs approval for the growth.
    // Overlapping entries on one item (a renewal beside its predecessor) approve the larger
    // allowance, never the sum, so an item draws the largest room left and spends it in all of them.
    const costOf = (e, key) => e.covers.reduce((a, c) => a + (coverCost(c)?.[key] ?? 0), 0);
    const left = new Map(mine.map((e) => [e.id, { perLanding: Math.max(0, e.claimed.perLanding - costOf(e, 'perLanding')), perDay: Math.max(0, e.claimed.perDay - costOf(e, 'perDay')) }]));
    const charged = tierItems.map((i) => {
      const rooms = mine.filter((e) => e.covers.includes(i.id)).map((e) => left.get(e.id));
      if (!rooms.length) return i;
      const waivedLanding = Math.min(i.perLanding, Math.max(...rooms.map((r) => r.perLanding)));
      const waivedDay = Math.min(i.perDay, Math.max(...rooms.map((r) => r.perDay)));
      for (const r of rooms) { r.perLanding = Math.max(0, r.perLanding - waivedLanding); r.perDay = Math.max(0, r.perDay - waivedDay); }
      return { ...i, perLanding: i.perLanding - waivedLanding, perDay: i.perDay - waivedDay };
    });
    const addedLanding = charged.reduce((a, i) => a + i.perLanding, 0);
    const addedDay = charged.reduce((a, i) => a + i.perDay, 0);
    const added = addedLanding > 0 || addedDay > 0;
    const exLanding = mine.reduce((a, e) => a + (e.perLanding ?? 0), 0);
    const exDay = mine.reduce((a, e) => a + (e.perDay ?? 0), 0);
    const usedLanding = m ? Math.max(0, m.perLanding - exLanding) : null;
    const usedDay = m ? Math.max(0, (m.perDay ?? 0) - exDay) : null;
    const share = m ? Math.max(usedLanding / ceiling.perLanding, usedDay / ceiling.perDay) : null;
    const after = m ? Math.max((usedLanding + addedLanding) / ceiling.perLanding, (usedDay + addedDay) / ceiling.perDay) : null;
    const line = ev.state === 'complete' ? ceilings.refuseShare : ceilings.warnShare;
    let status = 'ok';
    let why = m ? `${round1(usedLanding)}/${ceiling.perLanding} per landing, ${round1(usedDay)}/${ceiling.perDay} per day (${Math.round(100 * share)}%)` : 'not measured';
    if (mine.length) why += `, ${mine.map((e) => `${e.id} excepts ${round1(e.perLanding)}/landing${e.perLanding < e.claimed.perLanding ? ` (claims ${e.claimed.perLanding}, capped at what it covers)` : ''} to ${e.expires}`).join('; ')}`;
    if (ev.state !== 'complete') why += `; evidence ${ev.state}: ${ev.why}`;
    if (added && stops[tier]) { status = 'refuse'; why += `; growth stopped: ${stops[tier]}`; }
    else if (added && ev.state === 'missing') { status = 'refuse'; why += '; headroom cannot be established, so added cost is refused'; }
    else if (added && after >= line) { status = 'refuse'; why += `; this change adds ${round1(addedLanding)}/landing ${round1(addedDay)}/day, reaching ${Math.round(100 * after)}%, at or over the ${Math.round(100 * line)}% line${ev.state === 'complete' ? '' : ' that partial or stale evidence sets'}`; }
    else if ((after ?? 0) >= ceilings.warnShare || (added && ev.state !== 'complete') || stops[tier]) { status = 'warn'; if (added) why += `; this change adds ${round1(addedLanding)}/landing ${round1(addedDay)}/day`; }
    tiers[tier] = { status, why, evidence: ev.state, share, after, addedLanding, addedDay, items: tierItems.map((i) => ({ ...i, exception: covered(i)?.id ?? null })) };
  }
  const order = { ok: 0, warn: 1, refuse: 2 };
  const status = Object.values(tiers).reduce((s, t) => (order[t.status] > order[s] ? t.status : s), 'ok');
  return { status, tiers, invalid };
}

/** Markdown lines for the capacity summary: one per tier, never one sum. */
export function summarizeTiers(result) {
  return [
    '#### Growth tiers (D7: each tier alone, no aggregate gate)',
    '',
    '| Tier | Verdict | Detail |',
    '|---|---|---|',
    ...TIERS.map((t) => `| ${t} | ${result.tiers[t].status.toUpperCase()} | ${result.tiers[t].why}${result.tiers[t].items.length ? `; adds ${result.tiers[t].items.map((i) => `\`${i.id}\` ${round1(i.perLanding)}/landing${i.perDay ? ` ${round1(i.perDay)}/day` : ''}${i.exception ? ` (exception ${i.exception})` : ''}`).join(', ')}` : ''} |`),
    ...(result.invalid.length ? ['', ...result.invalid.map((e) => `- Exception \`${e.id}\` covers nothing: ${e.problems.join('; ')}.`)] : []),
    '',
  ];
}

// ---------------------------------------------------------------------------------------------
// Indirect slowdown: complete post-landing evidence only, attributed to a landing range.

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

/**
 * Find a sustained step up in a series of post-landing measurements, oldest first:
 * `[{ sha, at, complete, value }]`. Incomplete points are ignored, never read as zero or as
 * fast. A step needs `k` complete points on each side, the median after above the median before
 * by `threshold`, and EVERY point after above every point before, so one slow run is noise.
 */
export function detectSlowdown(series, { k = 3, threshold = 0.1 } = {}) {
  const usable = series.filter((p) => p.complete && Number.isFinite(p.value));
  // Points of different workloads are never compared: a full suite after a smaller one is not a slowdown.
  const groups = new Map();
  for (const p of usable) groups.set(p.workload ?? '', [...(groups.get(p.workload ?? '') ?? []), p]);
  for (const pts of groups.values()) {
    const found = slowdownIn(pts, k, threshold);
    if (found) return found;
  }
  return { found: false, ignored: series.length - usable.length };
}

function slowdownIn(pts, k, threshold) {
  for (let i = k; i + k <= pts.length; i++) {
    const prior = pts.slice(i - k, i).map((p) => p.value);
    const before = median(prior);
    const window = pts.slice(i, i + k);
    if (window.every((p) => p.value > Math.max(...prior)) && median(window.map((p) => p.value)) > before * (1 + threshold)) {
      const after = median(pts.slice(i).map((p) => p.value));
      return { found: true, before, after, ratio: after / before, range: { after: pts[i - 1].sha, through: pts[i].sha }, at: pts[i].at };
    }
  }
  return null;
}

/** The tier measurement after an attributed slowdown: the estimate rises; the ceiling never moves. */
export function applySlowdown(measurement, tier, slowdown) {
  if (!slowdown?.found) return measurement;
  const t = measurement.tiers[tier];
  return { ...measurement, tiers: { ...measurement.tiers, [tier]: { ...t, perLanding: Math.max(t.perLanding, t.perLanding * slowdown.ratio), slowdown: { range: slowdown.range, ratio: slowdown.ratio } } } };
}

// ---------------------------------------------------------------------------------------------
// Clocks (ci01 section 4.3): observable starts, never reset.

const minutesBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 60_000;

/**
 * PR ready-to-merge. Starts at the first worker receipt with every worker gate green on a named
 * head; else the first `noacg/reviewed` stamp on any head (clipped to the PR's opening); else
 * unknown, never zero. Repairs, requeues and new heads change nothing about the start.
 */
export function prClock({ receipts = [], stamps = [], openedAt = null, mergedAt = null, closedAt = null, now }) {
  const green = receipts.filter((r) => r.gatesGreen && r.head).map((r) => r.at).sort();
  let start = green[0] ?? null;
  let source = start ? 'receipt' : null;
  if (!start) {
    const s = stamps.map((x) => (openedAt && x.at < openedAt ? openedAt : x.at)).sort();
    start = s[0] ?? null;
    source = start ? 'stamp' : 'unknown';
  }
  if (!start) return { start: null, source: 'unknown', state: mergedAt ? 'finished' : 'unfinished', minutes: null };
  if (mergedAt) return { start, source, state: 'finished', minutes: minutesBetween(start, mergedAt) };
  const end = closedAt ?? now;
  return { start, source, state: closedAt ? 'abandoned' : 'unfinished', minutes: minutesBetween(start, end) };
}

/** A phase: first ledger `build` to its final `pass`; failed, cancelled and open phases keep ageing. */
export function phaseClock({ events = [], now }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const start = sorted.find((e) => e.type === 'build')?.at ?? null;
  if (!start) return { start: null, source: 'unknown', state: 'unfinished', hours: null };
  const last = sorted.at(-1);
  if (last.type === 'pass') return { start, source: 'ledger', state: 'finished', hours: minutesBetween(start, last.at) / 60 };
  const closed = last.type === 'cancelled' || last.type === 'abandoned';
  return { start, source: 'ledger', state: closed ? 'abandoned' : 'unfinished', hours: minutesBetween(start, closed ? last.at : now) / 60 };
}

/** Queue to landing: the FIRST merge-queue entry, so a requeue never restarts it. */
export function queueClock({ queued = [], mergedAt = null, now }) {
  const start = [...queued].sort()[0] ?? null;
  if (!start) return { start: null, source: 'unknown', state: mergedAt ? 'finished' : 'unfinished', minutes: null };
  return { start, source: 'timeline', state: mergedAt ? 'finished' : 'unfinished', minutes: minutesBetween(start, mergedAt ?? now) };
}

/**
 * Phase items from a plan-run wave file (scripts/plan-run.mjs ledger lines
 * `- <time> phase <n> <event> [detail]`). A `stop` ends a phase unfinished (kept with its age); an
 * owner pause keeps ageing, because owner waits stay in gross time.
 */
export function phasesFromLedger(text) {
  const by = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^- (\d{4}-\d{2}-\d{2}T\S+) phase (\S+) (\w+)/.exec(line.trim());
    if (!m) continue;
    const type = m[3] === 'stop' ? 'cancelled' : m[3];
    if (!by.has(m[2])) by.set(m[2], []);
    by.get(m[2]).push({ type, at: m[1] });
  }
  return [...by].map(([id, events]) => ({ id: `phase ${id}`, events }));
}

const ageOf = (clock) => clock.minutes ?? (clock.hours !== undefined && clock.hours !== null ? clock.hours * 60 : null);

/**
 * Per-item age alarms. ONE unfinished item over its ceiling is enough: no sample minimum.
 * Each alarm is an owned, dated action. `items` are `{ id, category: prReady|phase|queue, clock }`.
 */
export function ageAlarms(items, ceilings, now, owner = ceilings.owner) {
  const actions = [];
  for (const item of items) {
    if (item.clock.state !== 'unfinished') continue;
    const c = ceilings.timing[item.category];
    const limit = c.unit === 'hours' ? c.age * 60 : c.age;
    const age = ageOf(item.clock);
    if (age === null || age <= limit) continue;
    actions.push({ key: `age:${item.id}`, kind: 'age', subject: item.id, category: item.category, owner, due: addDays(now, 1), detail: `${item.category} ${item.id} unfinished for ${Math.round(age)} min, over its ${c.age} ${c.unit} ceiling (clock from ${item.clock.source} ${item.clock.start})` });
  }
  return actions;
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const stats = (xs) => ({ n: xs.length, p50: pct(xs, 0.5), p90: pct(xs, 0.9), max: xs.length ? Math.max(...xs) : null });

/**
 * Pooled timing for one measure over the rolling window. `samples` are finished items,
 * `{ category, value, finishedAt }`, value in the measure's unit. The sample minimum is pooled
 * across categories, and every category stays in the result.
 */
export function pooledTiming(samples, measure, ceilings, now) {
  const c = ceilings.timing[measure];
  const from = Date.parse(now) - ceilings.timing.pooledWindowDays * DAY;
  const inWindow = samples.filter((s) => Date.parse(s.finishedAt) >= from && Date.parse(s.finishedAt) <= Date.parse(now));
  const byCategory = {};
  for (const s of inWindow) (byCategory[s.category] ??= []).push(s.value);
  const pooled = stats(inWindow.map((s) => s.value));
  const adequate = pooled.n >= ceilings.timing.pooledMinSamples;
  const above = adequate && (pooled.p50 > c.p50 || pooled.p90 > c.p90);
  return { measure, pooled, categories: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, stats(v)])), adequate, above, ceiling: { p50: c.p50, p90: c.p90 } };
}

/** Sustained: two consecutive adequately sampled weekly reports above the ceiling. */
export function sustained(previous, current) {
  return Boolean(previous?.adequate && previous.above && current.adequate && current.above);
}

// ---------------------------------------------------------------------------------------------
// Breaches: one bounded correction, then a growth stop for what the breach affects.

/**
 * Tiers whose growth a breach stops once its one correction has not fixed it. Only cost and
 * pre-merge latency breaches (every tier with pre-merge jobs) stop growth. The others stay owned, dated actions without a stop:
 * an item's age and a phase's latency are not caused by added capacity; a stale table, a missing
 * report and an invalid or expiring exception already refuse growth through the evidence and
 * exception rules. A breach that clears and comes back is a new breach with a fresh correction;
 * clearing needs a complete, in-bounds week, so that cannot be gamed by a thin week.
 */
export function affectedTiers(key) {
  const [kind, subject] = key.split(':');
  if (kind === 'cost') return [subject];
  if (kind === 'latency' && (subject === 'prReady' || subject === 'queue')) return ['offline', 'backend', 'graphics', 'overhead'];
  return [];
}

/**
 * Carry breaches from last week's report into this one. A new breach gets an owner, a dated
 * correction (one) and a remeasure date; a breach still present on that date stops growth in
 * its affected tiers; a breach measured back in bounds is cleared, and its stop with it.
 */
export function carryBreaches({ previous = [], current = [], today, owner, correctionDays = 7, confirmed = () => true }) {
  const prev = new Map(previous.map((b) => [b.key, b]));
  // A breach is cleared only by evidence that it is back in bounds. One this week's evidence
  // could not judge (a tier measured partially, a read that failed) stays as it was, stop included.
  const unconfirmed = previous.filter((b) => !current.some((c) => c.key === b.key) && !confirmed(b));
  current = [...current, ...unconfirmed.map((b) => ({ ...b, detail: `${b.detail} (not re-measured this week: kept until evidence clears it)` }))];
  const out = [];
  for (const b of current) {
    const was = prev.get(b.key);
    if (!was) { out.push({ ...b, owner: b.owner ?? owner, since: today, state: 'correcting', corrections: 1, due: b.due ?? addDays(today, correctionDays) }); continue; }
    const overdue = dayMs(today) >= dayMs(was.due);
    out.push({ ...b, owner: was.owner, since: was.since, corrections: was.corrections, due: was.due, state: was.state === 'stopped' || overdue ? 'stopped' : 'correcting' });
  }
  const stops = {};
  for (const b of out) if (b.state === 'stopped') for (const t of affectedTiers(b.key)) stops[t] ??= `${b.key} since ${b.since}, one correction due ${b.due} did not bring it back in bounds`;
  const cleared = previous.filter((b) => !current.some((c) => c.key === b.key)).map((b) => b.key);
  return { breaches: out, stops, cleared };
}

/** Cost breaches: a tier whose measured cost, net of active exceptions, is over its ceiling. */
export function costBreaches(assessment) {
  return TIERS.filter((t) => (assessment.tiers[t].share ?? 0) > 1).map((t) => ({ key: `cost:${t}`, kind: 'cost', subject: t, detail: `${t} at ${Math.round(100 * assessment.tiers[t].share)}% of its ceiling: ${assessment.tiers[t].why}` }));
}

// ---------------------------------------------------------------------------------------------
// Test admission (D7): cheapest faithful layer, named contract, overlap, cost and owner.

export const LAYERS = ['node', 'browser', 'journey', 'backend'];

/**
 * Admit a new case or refuse it with reasons. `record` names what it proves; `assessment` is
 * assessTiers over the case's priced cost, so admission and the tier gate cannot disagree.
 */
export function admit(record, assessment) {
  const reasons = [];
  for (const f of ['case', 'contract', 'failure', 'overlap', 'layer', 'cadence', 'owner', 'tier']) if (!record[f]) reasons.push(`names no ${f}`);
  if (record.layer && !LAYERS.includes(record.layer)) reasons.push(`unknown layer ${record.layer}`);
  if (record.layer && record.layer !== 'node' && !record.whyNotCheaper) reasons.push('says nothing about why a cheaper layer cannot prove it');
  if (record.layer === 'backend' && !['persistence', 'permissions', 'concurrency'].includes(record.needs)) reasons.push('a backend case must need persistence, permissions or concurrency');
  if (record.layer === 'journey' && !record.extends && !record.newJourney) reasons.push('a journey case extends a maintained journey or says why a new one is needed');
  if (!(record.costPerLanding >= 0)) reasons.push('names no incremental cost');
  const tier = assessment?.tiers?.[record.tier];
  if (tier?.status === 'refuse') reasons.push(`the ${record.tier} tier refuses its cost: ${tier.why}`);
  return { admitted: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------------------------
// The weekly report's text.

/** Markdown for the weekly report: tiers, the aggregate line, freshness, exceptions, timing, actions. */
export function weeklyMarkdown(r) {
  const fmt = (x) => (x === null || x === undefined ? 'n/a' : round1(x));
  const lines = [
    `## Growth controls, week to ${r.measurement.windowEnd}`,
    '',
    `Owner: ${r.owner}. Landings in the window: ${r.measurement.landings ?? 'unknown'}. Collection: ${r.collection ?? 'n/a'}.`,
    '',
    '| Tier | Per landing | Ceiling | Per day | Ceiling | Evidence | Verdict |',
    '|---|---:|---:|---:|---:|---|---|',
    ...TIERS.map((t) => { const m = r.measurement.tiers[t] ?? {}; const c = r.ceilings.tiers[t]; const a = r.assessment.tiers[t]; return `| ${t} | ${fmt(m.perLanding)} | ${c.perLanding} | ${fmt(m.perDay)} | ${c.perDay} | ${a.evidence} | ${a.status}${m.slowdown ? `, slowdown x${m.slowdown.ratio.toFixed(2)} after ${m.slowdown.range.after.slice(0, 8)} through ${m.slowdown.range.through.slice(0, 8)}` : ''} |`; }),
    '',
    `Aggregate (a report line, not a gate): ${fmt(r.aggregate.perDay)} runner-minutes a day of the ${r.ceilings.envelopeRunnerMinutesPerDay} envelope (${fmt(100 * r.aggregate.perDay / r.ceilings.envelopeRunnerMinutesPerDay)}%); allocated at this workload ${fmt(r.aggregate.allocatedPerDay)}.`,
    '',
    `Durations table: ${r.table.reason}${r.table.stale ? ' - OVERDUE REFRESH' : ''}.`,
    '',
    ...(r.exceptions.length ? ['Exceptions:', ...r.exceptions.map((e) => `- \`${e.id}\` (${e.tier}, ${e.covers.join(', ')}): ${e.state}${e.state === 'active' ? `, expires ${e.expires}${e.soon ? ' - EXPIRES WITHIN A WEEK' : ''}` : ''}${e.problems ? `: ${e.problems.join('; ')}` : ''}; repayment ${e.repayment ?? 'none'}`), ''] : []),
    ...r.timing.map((t) => `Timing ${t.measure}: ${t.pooled.n} samples pooled (need ${r.ceilings.timing.pooledMinSamples}${t.adequate ? '' : ', descriptive only'}), p50 ${fmt(t.pooled.p50)}, p90 ${fmt(t.pooled.p90)}, max ${fmt(t.pooled.max)} against p50 ${t.ceiling.p50}/p90 ${t.ceiling.p90}${t.sustained ? ' - SUSTAINED BREACH' : ''}. Categories: ${Object.entries(t.categories).map(([k, v]) => `${k} n=${v.n} p50 ${fmt(v.p50)}`).join(', ') || 'none'}.`),
    '',
    ...(r.unknownClocks?.length ? [`Unknown clock starts (reported, never zero): ${r.unknownClocks.join(', ')}.`, ''] : []),
    r.breaches.length ? '### Actions' : '### Actions: none',
    ...r.breaches.map((b) => `- **${b.key}** (${b.state}): ${b.detail}. Owner ${b.owner}; ${b.state === 'stopped' ? `growth stopped in ${affectedTiers(b.key).join(', ') || 'nothing (item-level)'} until measured back in bounds` : `correction due ${b.due}`}.`),
    '',
  ];
  return lines.join('\n');
}
