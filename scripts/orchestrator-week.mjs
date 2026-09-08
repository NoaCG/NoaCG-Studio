// THE WEEKLY ORCHESTRATOR REVIEW'S MEASUREMENT HALF - the numbers the `orchestrator-week` workflow
// judges, read off the ledgers, the wave plans and git, never off anyone's memory of the week.
//
//   node scripts/orchestrator-week.mjs             # the last 7 days
//   node scripts/orchestrator-week.mjs --days 14
//   node scripts/orchestrator-week.mjs --json
//
// WHY. The owner asked (2026-09-03) for a weekly loop over the orchestration system itself: how
// much of the Codex and Antigravity subscriptions it used, how many decisions it took without
// asking him, what it changed about its own skill, and what the tokens across every model came to.
// Each of those already has a durable source - the harness meter, the delegation ledger, the
// wave-state files, git - and none of them was ever read together. This script reads them
// together and prints one page. It judges nothing: the recap, the search for what other
// orchestrators do, and the improvements proposed are the workflow's, in a session with a model.
//
// WHAT IT READS.
//   - `scripts/harness-usage.mjs --json` over the window: tokens by model, Codex tokens and its
//     rate-limit snapshot, Antigravity calls, the delegation outcomes, the capability standings.
//   - every `*-wave-plan.local.md` in the wave-plan store (`wave-plan-store.mjs`) and, for the
//     window that spans the 2026-09-09 move, in the primary checkout's and the orchestrator home's
//     `docs/handoffs/` written inside the window: rows per pool from the wave table, and the
//     decisions the master took on the owner's behalf, one `DECIDED:` line each
//     (`.agent-workflows/orchestrator/report.md` item 10; older plans wrote "taken on the owner's
//     behalf", counted as legacy).
//   - every handoff ADDED in the window, read at the commit that added it (consumed handoffs are
//     deleted, so the working tree cannot answer): does it carry a "Needs the owner" ask?
//   - every owner-queue item added in the window, by `kind:` - who has to settle it.
//   - `landed.jsonl` beside the job store: branches the queue landed in the window.
//   - `git log` over the paths that ARE the orchestration system, and the common-path line count
//     now against the same count at the window's start (the gate's own arithmetic).
//
// Every count is a proxy and the output says which. "Decisions taken" is the marker count, not the
// truth about judgement; "questions asked" is a heading match. They move in the right direction
// when the system improves, which is what a weekly loop needs from them.
//
// AN ABSENT SOURCE IS NEVER A ZERO. The wave plans are the one input that can vanish - they are
// gitignored and live in a checkout - so when none is found the page says so loudly, names every
// directory it searched and what was in it, and marks the rows, pools and DECIDED: counts
// UNMEASURED. The first real run of this script (2026-09-08) printed 0 waves and 0 decisions for a
// week in which nine lettered rows landed on one day, and the reader had no way to tell that apart
// from an idle machine.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWaveTable } from './wave-plan-check.mjs';
import { wavePlansDir } from './wave-plan-store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DAY_MS = 24 * 3_600_000;
/** The page names this many commits and counts the rest; a busy week is a number, not a wall. */
export const COMMITS_SHOWN = 25;

/** The files that are the orchestration system. A commit touching one of them changed the skill. */
export const SYSTEM_PATHS = Object.freeze([
  '.agent-workflows/orchestrator.md',
  '.agent-workflows/orchestrator',
  '.agent-workflows/orchestrator-week.md',
  '.claude/agents',
  'scripts/hooks',
  'scripts/wave-plan-check.mjs',
  'scripts/wave-plan-store.mjs',
  'scripts/wave-tick.mjs',
  'scripts/agy-run.mjs',
  'scripts/codex-rescue.mjs',
  'scripts/harness-usage.mjs',
  'scripts/harness-capabilities.json',
  'scripts/delegation-outcome.mjs',
  'scripts/owner-receipts.mjs',
  'scripts/handoff-drain.mjs',
  'scripts/orchestrator-home.mjs',
  'scripts/orchestrator-week.mjs',
  'docs/HARNESS_ROUTING.md',
  'docs/ORCHESTRATION_REVIEW.md',
  'docs/ORCHESTRATION_NEXT.md',
  'docs/MISTAKE_TRIGGERS.md',
]);

// ── Pure ─────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { days: 7, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') args.json = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--days') {
      args.days = Number(argv[(index += 1)]);
      if (!Number.isFinite(args.days) || args.days <= 0) throw new Error('--days must be a positive number');
    } else throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

/**
 * Decisions the master took on the owner's behalf in a wave-state file. `DECIDED:` opens each
 * questionnaire item since 2026-09-03; the two earlier real plans wrote "taken on the owner's
 * behalf" inline, counted separately so the number does not jump when the marker arrived.
 */
export function decisionsIn(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let decided = 0;
  let legacy = 0;
  for (const line of lines) {
    if (/^\s*(?:[-*]\s*|\d+\.\s*)?(?:\*\*)?DECIDED:/i.test(line)) decided += 1;
    else if (/taken on the owner'?s behalf/i.test(line)) legacy += 1;
  }
  return { decided, legacy };
}

/**
 * Does a handoff ask the owner for something? A "Needs the owner" / "Needs you" heading or line
 * whose body does not open with "nothing" or "none". Returns the number of bullet lines under it,
 * or 1 for a bare sentence - a proxy, and the caller says so.
 */
export function questionsIn(handoffText) {
  const lines = String(handoffText ?? '').replace(/\r\n/g, '\n').split('\n');
  const opener = /^(?:[-*]\s+)?(?:#+\s*|\*\*)?needs (?:the owner|you)(?:\*\*)?\s*[:.-]?\s*(.*)$/i;
  let asks = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = opener.exec(lines[index].trim());
    if (!match) continue;
    const inline = match[1].trim();
    if (inline) {
      if (!/^(nothing|none|no\b|-\s*$)/i.test(inline)) asks += 1;
      continue;
    }
    let bullets = 0;
    let firstBody = null;
    for (let look = index + 1; look < lines.length; look += 1) {
      const body = lines[look].trim();
      if (/^#{1,6}\s/.test(body)) break;
      if (!body) continue;
      if (firstBody === null) firstBody = body;
      if (/^[-*]\s|^\d+\.\s/.test(body)) bullets += 1;
    }
    if (firstBody && !/^(?:[-*]\s*)?(nothing|none)\b/i.test(firstBody)) asks += Math.max(bullets, 1);
  }
  return asks;
}

/**
 * The paragraph the page prints when it found NO wave plan in the window. It exists because the
 * first run of this script over a real week printed "Wave plans in the window: 0", "Rows planned:
 * 0" and "Decisions taken: 0" for a week in which nine lettered rows landed on one day - the plans
 * had been written into throwaway worktrees, are gitignored, and died with the folder. Zero is a
 * measurement; an absent file is not one, and a page that prints the first when it means the second
 * is lying to the only reader who cannot check it.
 *
 * `search` is `{ dirs: [{ dir, exists, planFiles, inWindow }], outsideWindow }` from `wavePlans`.
 */
export function noPlansBlock(search) {
  const dirs = search?.dirs ?? [];
  const lines = ['- **NO WAVE PLAN FOUND. The rows, pools and decisions below are UNMEASURED, not zero.**'];
  lines.push('  Looked in:');
  if (!dirs.length) lines.push('  - nowhere - this run could not resolve the primary checkout, so it searched no directory at all');
  for (const entry of dirs) {
    if (!entry.exists) lines.push(`  - \`${entry.dir}\` - the directory does not exist`);
    else if (!entry.planFiles) lines.push(`  - \`${entry.dir}\` - exists, holds no \`*-wave-plan.local.md\` at all`);
    else lines.push(`  - \`${entry.dir}\` - holds ${entry.planFiles} plan${entry.planFiles === 1 ? '' : 's'}, ${entry.inWindow} of them inside the window`);
  }
  // Two very different stories end in an empty result, and the fix is different for each: a plan
  // outside the window is a reading error the reader can correct, a plan nowhere on disk is a
  // record that is gone for good.
  if (search?.outsideWindow) {
    lines.push(
      `  ${search.outsideWindow} plan file${search.outsideWindow === 1 ? ' is' : 's are'} on disk but older than the window,`,
      '  so this is a window that missed them and NOT a lost record - widen it with `--days` and read again.',
    );
  } else {
    lines.push(
      '  No plan of any date is on disk. A wave plan is gitignored and lives only in the checkout that',
      '  wrote it, so a plan written in a worktree that has since been removed leaves nothing behind.',
      '  Read the week\'s waves off the landed branches and the handoffs instead, and record that the',
      '  routing evidence is GONE for this window rather than that the machine sat idle.',
    );
  }
  return lines;
}

/** Rows per pool from a wave table; a row naming two pools counts once for each. */
export function poolCounts(rows) {
  const counts = {};
  for (const row of rows) {
    for (const pool of String(row.pool ?? '').split(/[+,/]/).map((p) => p.trim().toLowerCase()).filter(Boolean)) {
      counts[pool] = (counts[pool] ?? 0) + 1;
    }
  }
  return counts;
}

/** `git log --format=%h%x09%s` lines into `{ sha, subject }`. */
export function improvementsFrom(logText) {
  return String(logText ?? '').replace(/\r\n/g, '\n').split('\n')
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\t');
      return { sha, subject: rest.join('\t') };
    });
}

/**
 * The common path as the gate counts it: the core's lines plus every module its routing table
 * marks *every plan*. `modules` maps a module file name to its text; a marked module missing
 * from the map counts nothing, exactly as the gate treats an absent file.
 */
export function commonPathLines(coreText, modules) {
  const core = String(coreText ?? '').replace(/\r\n/g, '\n');
  const lineCount = (text) => text.replace(/\r\n/g, '\n').split('\n').filter((line, index, all) => index < all.length - 1 || line !== '').length;
  const marked = new Set(
    core.split('\n')
      .filter((line) => line.includes('*every plan*'))
      .flatMap((line) => [...line.matchAll(/orchestrator\/([A-Za-z0-9._-]+\.md)/g)].map((match) => match[1])),
  );
  let total = lineCount(core);
  for (const name of marked) if (modules[name] !== undefined) total += lineCount(modules[name]);
  return { core: lineCount(core), marked: [...marked], total };
}

const fmt = (value) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '-');
const pct = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'unknown');

/** The page. `facts` is the object `gather()` returns; pure so the shape is pinned. */
export function summarise(facts) {
  const lines = [];
  const { window, usage, waves, handoffs, queueItems, landed, skill } = facts;
  lines.push(`# Orchestrator week - ${window.since.slice(0, 10)} .. ${window.until.slice(0, 10)}`, '');

  lines.push('## Spend across models (each harness on its own meter, never summed across them)', '');
  const models = usage?.claudeCode?.byModel ?? [];
  if (models.length) {
    lines.push('| model | requests | tokens (input + cache + output) |', '| --- | --- | --- |');
    for (const row of models) lines.push(`| ${row.model} | ${fmt(row.requests)} | ${fmt(row.tokens?.total)} |`);
    lines.push('');
  }
  lines.push(`- Claude Code: ${fmt(usage?.claudeCode?.sessions)} sessions, ${fmt(usage?.claudeCode?.requests)} requests, ${fmt(usage?.claudeCode?.tokens?.total)} tokens. No weekly percentage exists on this machine; the owner's account page has it.`);
  const rate = usage?.codex?.rateLimits;
  lines.push(`- Codex: ${fmt(usage?.codex?.sessions)} sessions, ${fmt(usage?.codex?.tokens?.total)} tokens; snapshot ${rate ? `${rate.at.slice(0, 16)}Z - 5-hour ${pct(rate.primary?.used_percent)}, weekly ${pct(rate.secondary?.used_percent)}` : 'absent (no Codex session ran)'}.`);
  lines.push(`- Antigravity: ${fmt(usage?.antigravity?.calls)} calls, ${fmt(usage?.antigravity?.failedCalls)} returned nothing; input ${fmt(usage?.antigravity?.tokens?.input)}, output ${fmt(usage?.antigravity?.tokens?.output)}.`);
  const quality = usage?.delegationOutcomes?.quality;
  if (quality) lines.push(`- Delegation outcomes: ${fmt(usage?.delegationOutcomes?.tasks)} tasks; ${quality.accepted ?? '-'} accepted of ${quality.attributable ?? '-'} attributable to a worker; ${quality.ours ?? '-'} burned a call on our own invocation; ${quality.unclassified ?? 0} predate the outcome vocabulary and count nowhere.`);
  const unverified = (usage?.capabilities ?? []).filter((row) => row.standing === 'unverified').map((row) => row.id);
  lines.push(`- Capability observations unverified on the installed builds: ${unverified.length}${unverified.length ? ` (${unverified.join(', ')})` : ''}.`, '');

  lines.push('## Waves and rows', '');
  // Everything read off a wave plan is unmeasured when no plan survived, so the whole block is
  // gated on that one fact rather than each number being separately excused.
  if (!waves.length) {
    lines.push(...noPlansBlock(facts.planSearch));
  } else {
    lines.push(`- Wave plans in the window: ${waves.length} (${waves.map((wave) => wave.name).join(', ')}).`);
    const pools = poolCounts(waves.flatMap((wave) => wave.rows));
    const totalRows = waves.reduce((sum, wave) => sum + wave.rows.length, 0);
    lines.push(`- Rows planned: ${totalRows}; by pool: ${Object.entries(pools).map(([pool, count]) => `${pool} ${count}`).join(', ') || 'none'}.`);
    lines.push(`- Rows planned off Claude (codex, agy-gemini, agy-claude-gpt): ${(pools.codex ?? 0) + (pools['agy-gemini'] ?? 0) + (pools['agy-claude-gpt'] ?? 0)} of ${totalRows}.`);
  }
  lines.push(`- Branches the queue landed: ${landed.count}.`);
  if (landed.count && usage?.claudeCode?.tokens?.total) {
    lines.push(`- Claude tokens per landed branch: ${fmt(Math.round(usage.claudeCode.tokens.total / landed.count))} (the whole machine's Claude spend over the queue's landings - a ceiling, not a cost per row).`);
  }
  lines.push('');

  lines.push('## Decisions and questions', '');
  if (!waves.length) {
    lines.push('- Decisions taken on the owner\'s behalf: **UNMEASURED** - the `DECIDED:` marker lives in the wave plan and no plan survived the window (see above). This is not "no decisions were taken".');
  } else {
    const decided = waves.reduce((sum, wave) => sum + wave.decisions.decided, 0);
    const legacy = waves.reduce((sum, wave) => sum + wave.decisions.legacy, 0);
    lines.push(`- Decisions taken on the owner's behalf (DECIDED: lines in the wave plans): ${decided}${legacy ? `, plus ${legacy} in the older inline wording` : ''}.`);
  }
  const asking = handoffs.filter((file) => file.asks > 0);
  lines.push(`- Handoffs added: ${handoffs.length}; carrying an ask for the owner: ${asking.length} (${asking.reduce((sum, file) => sum + file.asks, 0)} items)${asking.length ? ` - ${asking.map((file) => path.basename(file.name)).join(', ')}` : ''}.`);
  const kinds = {};
  for (const item of queueItems) kinds[item.kind ?? 'unknown'] = (kinds[item.kind ?? 'unknown'] ?? 0) + 1;
  lines.push(`- Owner-queue items added: ${queueItems.length}; by kind: ${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}`).join(', ') || 'none'} (an item of kind agent needs nobody; walk and walk-p need his eyes; owner-action and hardware need his hands).`);
  lines.push('- Both counts are proxies: a marker and a heading. The questionnaire in each morning report is where the decisions themselves are read.', '');

  lines.push('## The skill this week', '');
  lines.push(`- Commits touching the orchestration system (merges excluded): ${skill.commits.length}.`);
  for (const commit of skill.commits.slice(0, COMMITS_SHOWN)) lines.push(`  - ${commit.sha} ${commit.subject}`);
  if (skill.commits.length > COMMITS_SHOWN) lines.push(`  - (${skill.commits.length - COMMITS_SHOWN} more - git log --since=${window.since} --no-merges -- <the system paths>)`);
  lines.push(`- Common path (core + every-plan modules): ${skill.commonPathNow.total} lines now, ${skill.commonPathThen ? `${skill.commonPathThen.total} at the window's start` : 'no reading at the window\'s start'}; core ${skill.commonPathNow.core} lines.`, '');

  lines.push('## Recap inputs - the questions the workflow answers from the above', '');
  lines.push('- Did the rows off Claude land, and what did their repair cost on the delegation ledger?');
  lines.push('- Which asks of the owner were the machine\'s to decide, and which shape did they take?');
  lines.push('- Did any commit above add a rule where a mechanism was available, and did the common path grow?');
  lines.push('- Which capability observation lapsed, and was it re-probed or routed on?');
  return lines;
}

// ── Shell ────────────────────────────────────────────────────────────────────────────────────────

function git(args, cwd = REPO_ROOT) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return run.status === 0 ? String(run.stdout ?? '') : null;
}

function primaryRoot() {
  const common = git(['rev-parse', '--git-common-dir']);
  if (!common) return null;
  return path.dirname(path.resolve(REPO_ROOT, common.trim()));
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function usageJson(days) {
  const run = spawnSync(process.execPath, [path.join(HERE, 'harness-usage.mjs'), '--hours', String(days * 24), '--json'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) return null;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return null;
  }
}

/**
 * The wave plans in the window, AND a record of where the search went. The record is not
 * bookkeeping: an empty result means either "no wave ran" or "the plans died with their worktree",
 * and only the list of directories with what each held tells the reader which (see `noPlansBlock`).
 */
function wavePlans(dirs, since) {
  const seen = new Map();
  const searched = [];
  let outsideWindow = 0;
  for (const dir of dirs) {
    if (!dir) continue;
    if (!existsSync(dir)) {
      searched.push({ dir, exists: false, planFiles: 0, inWindow: 0 });
      continue;
    }
    const entry = { dir, exists: true, planFiles: 0, inWindow: 0 };
    searched.push(entry);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('-wave-plan.local.md')) continue;
      entry.planFiles += 1;
      const file = path.join(dir, name);
      if (statSync(file).mtimeMs < since) {
        outsideWindow += 1;
        continue;
      }
      entry.inWindow += 1;
      const text = readText(file) ?? '';
      const previous = seen.get(name);
      // Two checkouts can hold the same plan name; the larger copy is the one the wave wrote to.
      if (previous && previous.text.length >= text.length) continue;
      seen.set(name, { name, file, text, rows: parseWaveTable(text).rows, decisions: decisionsIn(text) });
    }
  }
  return {
    plans: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    search: { dirs: searched, outsideWindow },
  };
}

function addedInWindow(sinceIso, pathspec) {
  const log = git(['log', `--since=${sinceIso}`, '--diff-filter=A', '--name-only', '--format=%H', '--', pathspec]);
  if (!log) return [];
  const added = [];
  let sha = null;
  for (const line of log.replace(/\r\n/g, '\n').split('\n')) {
    if (/^[0-9a-f]{40}$/.test(line)) sha = line;
    else if (line.trim() && sha) added.push({ sha, name: line.trim() });
  }
  return added;
}

function handoffsAdded(sinceIso) {
  return addedInWindow(sinceIso, 'docs/handoffs')
    .filter((entry) => entry.name.endsWith('.md') && !entry.name.endsWith('.local.md'))
    .map((entry) => ({ ...entry, asks: questionsIn(git(['show', `${entry.sha}:${entry.name}`]) ?? '') }));
}

function queueItemsAdded(sinceIso) {
  return addedInWindow(sinceIso, 'docs/acceptance/owner-queue').map((entry) => {
    const text = git(['show', `${entry.sha}:${entry.name}`]) ?? '';
    const kind = /^kind:\s*(\S+)/m.exec(text)?.[1] ?? null;
    return { ...entry, kind };
  });
}

function landedInWindow(since) {
  const common = git(['rev-parse', '--git-common-dir']);
  if (!common) return { count: 0, branches: [] };
  const file = path.join(path.resolve(REPO_ROOT, common.trim()), 'noacg-jobs', 'landed.jsonl');
  const text = readText(file);
  if (!text) return { count: 0, branches: [] };
  const branches = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (Number(entry.at) >= since) branches.push(entry.branch);
    } catch {
      // a half-written last line is the normal state of a live ledger
    }
  }
  return { count: branches.length, branches };
}

function commonPathAt(rev) {
  const core = git(['show', `${rev}:.agent-workflows/orchestrator.md`]);
  if (core === null) return null;
  const modules = {};
  const listing = git(['ls-tree', '--name-only', rev, '.agent-workflows/orchestrator/']) ?? '';
  for (const entry of listing.split('\n').map((line) => line.trim()).filter(Boolean)) {
    modules[path.basename(entry)] = git(['show', `${rev}:${entry}`]) ?? '';
  }
  return commonPathLines(core, modules);
}

export function gather({ now = Date.now(), days = 7 } = {}) {
  const since = now - days * DAY_MS;
  const sinceIso = new Date(since).toISOString();
  const primary = primaryRoot();
  const home = primary ? path.join(primary, '.claude', 'worktrees', 'orchestrator') : null;
  const startRev = git(['rev-list', '-1', `--before=${sinceIso}`, 'HEAD'])?.trim() || null;
  const log = git(['log', `--since=${sinceIso}`, '--no-merges', '--format=%h%x09%s', '--', ...SYSTEM_PATHS]) ?? '';
  // The store first, then the two places plans were written before it existed. The legacy pair is
  // the ARCHIVE half of the move and nothing else: `wave-tick.mjs` resolves the store alone, so no
  // new plan can land in either. Drop them once no window can still reach 2026-09-09.
  const plans = wavePlans([
    wavePlansDir(),
    primary && path.join(primary, 'docs', 'handoffs'),
    home && path.join(home, 'docs', 'handoffs'),
  ], since);
  return {
    window: { since: sinceIso, until: new Date(now).toISOString(), days },
    usage: usageJson(days),
    waves: plans.plans,
    planSearch: plans.search,
    handoffs: handoffsAdded(sinceIso),
    queueItems: queueItemsAdded(sinceIso),
    landed: landedInWindow(since),
    skill: {
      commits: improvementsFrom(log),
      commonPathNow: commonPathAt('HEAD') ?? { core: 0, marked: [], total: 0 },
      commonPathThen: startRev ? commonPathAt(startRev) : null,
    },
  };
}

const USAGE = `Usage: node scripts/orchestrator-week.mjs [--days <n>] [--json]

  --days <n>   the window, default 7
  --json       the gathered facts instead of the page`;

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`orchestrator-week: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const facts = gather({ days: args.days });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${summarise(facts).join('\n')}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
