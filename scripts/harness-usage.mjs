#!/usr/bin/env node
// THE HARNESS USAGE METER - what each AI harness actually cost over a window.
//
//   node scripts/harness-usage.mjs                    # the last 24 hours
//   node scripts/harness-usage.mjs --hours 5          # the last 5 hours
//   node scripts/harness-usage.mjs --since 2026-08-29T12:00:00Z
//   node scripts/harness-usage.mjs --wave             # since the newest wave plan was written
//   node scripts/harness-usage.mjs --json             # the same numbers, machine-readable
//
// WHY THIS EXISTS. The owner pays for a Codex subscription and cannot tell whether it is being
// used at all. "Am I paying for nothing" is a question about EVIDENCE, and both harnesses already
// write the evidence to disk and nobody reads it. Every future routing decision - which harness
// gets which work - needs numbers rather than impressions, and the first delegation trial
// (2026-08-29) shows why: it FELT like Codex was working for ten minutes, and it had in fact
// written nothing.
//
// WHAT IT READS. Two transcript trees and one ledger, all local, all append-only, none an API:
//
//   ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl   and  ~/.codex/archived_sessions/*.jsonl
//     `token_count` events carrying `info.total_token_usage` (CUMULATIVE for the session) and a
//     `rate_limits` snapshot: `primary` is the 5-hour window, `secondary` the weekly one.
//     BOTH TREES MATTER - Codex moves a session to archived_sessions when it is done with it, so
//     reading only `sessions/` silently loses the finished work, which is most of it.
//
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
//     assistant records carrying `message.usage` - input_tokens, cache_creation_input_tokens,
//     cache_read_input_tokens, output_tokens. One directory per cwd, so a wave that ran in six
//     worktrees is spread over six directories; and each agent a session LAUNCHES writes its own
//     file under `<that directory>/<session-id>/subagents/`, which is a second place to look.
//
//   ~/.noacg/agy-usage.jsonl  (override: NOACG_AGY_LEDGER)
//     Antigravity CLI is the odd one out: it writes NO cumulative usage anywhere on disk. Its
//     per-run usage exists once, on stdout, and is then gone - so this file is not a transcript
//     the harness wrote, it is a ledger `scripts/agy-run.mjs` appends to as it makes each call.
//     That has a consequence the report states out loud rather than hiding: an agy call made any
//     other way left NO trace anywhere, and no reader can recover it.
//
//   ~/.noacg/delegation-outcomes.jsonl  (override: NOACG_OUTCOMES_LEDGER)
//     The delegation OUTCOME ledger `scripts/delegation-outcome.mjs` writes - one line per
//     verified delegated task (which outcome? whose fault? redone by whom?), the evidence
//     outcome-based routing runs on (docs/ORCHESTRATION_NEXT.md §6). Spend says what a harness
//     COST; this says whether the work came back right.
//
// FOUR THINGS THAT MAKE A NAIVE READER WRONG.
//
//   1. CLAUDE CODE WRITES THE SAME ASSISTANT RECORD MORE THAN ONCE. A single request can appear
//      two or three times in one file, byte-identical usage and all, and a resumed session copies
//      earlier records forward into the new file. Summing records inflates the answer by roughly
//      2x. `dedupeClaudeRows` keys on `message.id` + `requestId` and counts each request once,
//      ACROSS files, which is why the dedupe happens after every file is read and not inside one.
//
//   2. CODEX'S PER-TURN FIELD DOES NOT SUM TO ITS OWN TOTAL. `last_token_usage` is emitted more
//      often than the cumulative counter advances: over the 88 rollouts on this machine, summing
//      it disagreed with the session's final `total_token_usage` in 46 of them, by up to 30%. So
//      the meter never adds `last_token_usage`. It walks `total_token_usage` - verified monotonic
//      across all 88 - and takes DELTAS, which also gives windowing for free: a session that
//      started before the window contributes only the part that happened inside it.
//
//   3. A PERCENTAGE IS A SNAPSHOT, NOT A RATE. `primary.used_percent` says how full the 5-hour
//      window was at that instant. Two sessions' percentages never add, and a percentage from
//      four hours ago says nothing about now. The meter therefore reports exactly ONE percentage
//      pair - the newest snapshot it found - and stamps it with the time it was taken.
//
//   4. `sessionId` DOES NOT IDENTIFY A SESSION. Every agent a wave launches inherits the parent's
//      `sessionId` and the parent's `gitBranch`, so counting those reports six agents working in
//      six worktrees as one session on one branch. The TRANSCRIPT FILE is the session, and the
//      cwd the file's first record names is the worktree. That also means the branch table shows
//      the LAUNCHING session's branch for such work, which the report says out loud.
//
// AND A FIFTH, WHICH ONLY ANTIGRAVITY HAS. Its four token counts do not add up to anything.
// agy's own `total_tokens` is input + output ONLY - it excludes thinking and cache reads, and on
// a real run the cache reads are larger than the other three together by an order of magnitude
// (1.15 M against 168 K, measured 2026-08-30). So there is no `total` kind for Antigravity and the
// report never prints one: any single number would be a different number depending on which
// fields somebody happened to add.
//
// WHAT IT CANNOT KNOW. Claude Code's own 5-hour window percentage is not in the transcripts.
// There is no rate-limit event in `~/.claude/projects/**`, so this script cannot report it and
// does not estimate it: token totals are not a percentage of an undisclosed allowance. The Codex
// percentages come from Codex's own `rate_limits` payload, which is why only Codex has them.
// Antigravity has neither a percentage nor any history before its ledger existed, and the report
// says so under its own table instead of leaving a small number to be read as a small bill.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The writer of the Antigravity ledger owns where it lives and what version it is. Importing both
// rather than restating them is the whole guarantee that the reader and the writer point at the
// same file: a restated path that drifts does not fail, it reports "no ledger - nothing to read",
// which reads as "Antigravity cost nothing".
import { LEDGER_VERSION, ledgerPath } from './agy-run.mjs';
import { wavePlansDir } from './wave-plan-store.mjs';
// Same guarantee for the delegation-outcome ledger: its writer owns the path and the version.
import {
  ACCEPTED_OUTCOMES, OUTCOMES_VERSION, legacyVerdict, outcomesLedgerPath, poolFor,
} from './delegation-outcome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/** Token kinds are reported per harness, because the two harnesses do not slice input the same way. */
export const CODEX_KINDS = ['input', 'cachedInput', 'cacheWrite', 'output', 'reasoning', 'total'];
export const CLAUDE_KINDS = ['input', 'cacheWrite', 'cacheRead', 'output', 'total'];
/** Deliberately no `total`: agy's own total is input+output, and cache reads dwarf both. */
export const AGY_KINDS = ['input', 'output', 'thinking', 'cacheRead'];

/** The ledger format `scripts/agy-run.mjs` writes. A line from a future version is not guessed at. */
export const AGY_LEDGER_VERSION = LEDGER_VERSION;

const HOUR_MS = 3_600_000;

// ── Pure decisions ───────────────────────────────────────────────────────────────────────────────

/** Argument parsing, separated from the filesystem so the window logic is testable on its own. */
export function parseArgs(argv) {
  const args = { json: false, wave: false, since: null, until: null, hours: null, top: 12 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[index += 1];
    if (token === '--json') args.json = true;
    else if (token === '--wave') args.wave = true;
    else if (token === '--since') args.since = next();
    else if (token === '--until') args.until = next();
    else if (token === '--hours') args.hours = Number(next());
    else if (token === '--top') args.top = Number(next());
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

/**
 * The window, and the sentence that explains it. `--since` wins, then `--wave`, then `--hours`,
 * and with none of them it is the last 24 hours - because the question "what did today cost" is
 * the one asked most often and should need no flags.
 */
export function resolveWindow(args, { now, wavePlan } = {}) {
  const until = args.until ? Date.parse(args.until) : now;
  if (!Number.isFinite(until)) throw new Error(`--until is not a date: ${args.until}`);

  if (args.since) {
    const since = Date.parse(args.since);
    if (!Number.isFinite(since)) throw new Error(`--since is not a date: ${args.since}`);
    return { since, until, label: `since ${new Date(since).toISOString()}` };
  }
  if (args.wave) {
    if (!wavePlan) {
      throw new Error(
        'no *wave-plan*.local.md found in the wave-plan store, so --wave has no start time. '
        + '`node scripts/wave-plan-store.mjs --list` says what the store holds; '
        + 'otherwise use --since <iso> or --hours <n>.',
      );
    }
    // The window opens at the DATE IN THE PLAN'S NAME (local midnight), not its mtime: the watch
    // loop's tick appends a heartbeat line to the live plan, so the mtime is minutes old all
    // night and an mtime-anchored window would report the whole wave as costing nearly nothing.
    // Midnight overshoots the true wave start by most of a day, which errs the honest way - this
    // meter measures MORE than the wave, never a sliver of it. An undated plan name falls back
    // to the mtime, which is all it has.
    const dated = /^(\d{4}-\d{2}-\d{2})/.exec(wavePlan.name);
    const namedDay = dated ? Date.parse(`${dated[1]}T00:00:00`) : NaN;
    if (Number.isFinite(namedDay)) {
      return {
        since: namedDay,
        until,
        label: `since the start of the wave plan's named day (${wavePlan.name})`,
      };
    }
    return {
      since: wavePlan.mtimeMs,
      until,
      label: `since the wave plan ${wavePlan.name} was last written (${new Date(wavePlan.mtimeMs).toISOString()})`,
    };
  }
  const hours = args.hours ?? 24;
  if (!Number.isFinite(hours) || hours <= 0) throw new Error(`--hours must be a positive number: ${args.hours}`);
  return { since: until - hours * HOUR_MS, until, label: `the last ${hours} hour${hours === 1 ? '' : 's'}` };
}

/**
 * JSONL, forgiving. A transcript is written by a live process, so the last line of an open file is
 * routinely half-written; a meter that threw on it would be unusable exactly when it is wanted.
 * Malformed lines are counted and reported rather than swallowed, so a parser that has drifted
 * out of date announces itself instead of quietly reporting less.
 */
export function parseJsonl(text) {
  const records = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === 'object') records.push(value);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
}

const zeroTokens = (kinds) => Object.fromEntries(kinds.map((kind) => [kind, 0]));

export function addTokens(left, right, kinds) {
  const out = {};
  for (const kind of kinds) out[kind] = (left[kind] ?? 0) + (right[kind] ?? 0);
  return out;
}

/**
 * A delta on a cumulative counter, resilient to a reset. No reset has ever been observed in the
 * 88 rollouts on this machine, but a counter that restarts and is read as a huge negative would
 * silently zero a whole day, so a decrease is treated as "the counter restarted" and the new
 * reading is taken whole.
 */
export function deltaTokens(current, previous, kinds) {
  const reset = kinds.some((kind) => (current[kind] ?? 0) < (previous[kind] ?? 0));
  const out = {};
  for (const kind of kinds) out[kind] = reset ? (current[kind] ?? 0) : (current[kind] ?? 0) - (previous[kind] ?? 0);
  return out;
}

/** One Codex rollout file, reduced to what the meter needs: ordered snapshots and the session's identity. */
export function readCodexSession(text, { file = '' } = {}) {
  const { records, malformed } = parseJsonl(text);
  const session = {
    file,
    sessionId: path.basename(file, '.jsonl') || 'unknown',
    cwd: null,
    originator: null,
    model: null,
    snapshots: [],
    malformed,
  };
  for (const record of records) {
    const payload = record?.payload;
    if (record?.type === 'session_meta' && payload) {
      session.sessionId = payload.session_id ?? payload.id ?? session.sessionId;
      session.cwd = payload.cwd ?? session.cwd;
      session.originator = payload.originator ?? session.originator;
      session.model = payload.model ?? session.model;
      continue;
    }
    if (payload?.type !== 'token_count') continue;
    // A token_count with no `info` is a rate-limit-only heartbeat; it still carries a usable
    // rate_limits payload, so it is kept as a snapshot with no token movement.
    const totals = payload.info?.total_token_usage;
    const at = Date.parse(record?.timestamp ?? '');
    if (!Number.isFinite(at)) continue;
    session.snapshots.push({
      at,
      totals: totals
        ? {
          input: totals.input_tokens ?? 0,
          cachedInput: totals.cached_input_tokens ?? 0,
          cacheWrite: totals.cache_write_input_tokens ?? 0,
          output: totals.output_tokens ?? 0,
          reasoning: totals.reasoning_output_tokens ?? 0,
          total: totals.total_tokens ?? 0,
        }
        : null,
      rateLimits: payload.rate_limits ?? null,
    });
  }
  session.snapshots.sort((left, right) => left.at - right.at);
  return session;
}

/**
 * What this session cost INSIDE the window. Walks the cumulative counter and keeps only the
 * deltas whose reading landed in the window, so a session straddling the boundary contributes
 * exactly its inside part rather than all or nothing.
 */
export function codexWindowUsage(session, window) {
  let previous = zeroTokens(CODEX_KINDS);
  let tokens = zeroTokens(CODEX_KINDS);
  let turns = 0;
  let firstAt = null;
  let lastAt = null;
  for (const snapshot of session.snapshots) {
    if (!snapshot.totals) continue;
    const delta = deltaTokens(snapshot.totals, previous, CODEX_KINDS);
    previous = snapshot.totals;
    if (snapshot.at < window.since || snapshot.at > window.until) continue;
    if (delta.total <= 0) continue;
    tokens = addTokens(tokens, delta, CODEX_KINDS);
    turns += 1;
    if (firstAt === null) firstAt = snapshot.at;
    lastAt = snapshot.at;
  }
  return { tokens, turns, firstAt, lastAt };
}

/**
 * One entry per session id. Archiving a rollout is a MOVE, so a copy in both trees should not
 * happen - but if it ever does, the same tokens would be counted twice with nothing to say so.
 * The richer file wins, since a partial copy is the one that would be left behind.
 */
export function dedupeCodexSessions(sessions) {
  const best = new Map();
  for (const session of sessions) {
    const seen = best.get(session.sessionId);
    if (!seen || session.snapshots.length > seen.snapshots.length) best.set(session.sessionId, session);
  }
  return [...best.values()];
}

/**
 * The newest rate-limit snapshot in the window, across every session. ONE snapshot, never a sum:
 * `used_percent` describes a rolling window shared by every session, so the latest reading is the
 * only one that is still true.
 */
export function latestRateLimits(sessions, window) {
  let best = null;
  for (const session of sessions) {
    for (const snapshot of session.snapshots) {
      if (!snapshot.rateLimits) continue;
      if (snapshot.at < window.since || snapshot.at > window.until) continue;
      if (!best || snapshot.at > best.at) best = { at: snapshot.at, sessionId: session.sessionId, limits: snapshot.rateLimits };
    }
  }
  return best;
}

/** One Claude Code transcript, reduced to billable rows. Dedupe happens later, across all files. */
export function readClaudeRows(text, { file = '' } = {}) {
  const { records, malformed } = parseJsonl(text);
  const rows = [];
  for (const record of records) {
    const usage = record?.message?.usage;
    if (!usage || typeof usage !== 'object') continue;
    const at = Date.parse(record?.timestamp ?? '');
    if (!Number.isFinite(at)) continue;
    const messageId = record.message?.id ?? null;
    const requestId = record.requestId ?? null;
    rows.push({
      at,
      // A record with neither id is unmergeable with anything, so it gets a key of its own rather
      // than colliding with every other id-less record and being counted once for all of them.
      key: messageId || requestId ? `${messageId ?? ''}|${requestId ?? ''}` : `${file}#${rows.length}`,
      // THE TRANSCRIPT FILE IS THE SESSION, not `record.sessionId`. Every agent a wave launches
      // writes its own file under `<parent>/<parent-session-id>/subagents/`, and every one of
      // those records carries the PARENT'S sessionId - so counting sessionIds reports a wave of
      // six agents as one session. `sessionId` is kept for reference and never counted.
      session: file,
      sessionId: record.sessionId ?? path.basename(file, '.jsonl'),
      // The momentary cwd. `attributeProjects` replaces it with the one the session STARTED in,
      // because a session that cds would otherwise be split across a row per subdirectory.
      project: record.cwd ?? path.basename(path.dirname(file)),
      branch: record.gitBranch || '(no branch)',
      model: record.message?.model ?? 'unknown',
      sidechain: record.isSidechain === true,
      tokens: {
        input: usage.input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        total: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
          + (usage.cache_read_input_tokens ?? 0) + (usage.output_tokens ?? 0),
      },
    });
  }
  return { rows, malformed };
}

/** One row per request. Keeps the earliest sighting, which is the one in the session that made it. */
export function dedupeClaudeRows(rows) {
  const seen = new Map();
  for (const row of [...rows].sort((left, right) => left.at - right.at)) {
    if (!seen.has(row.key)) seen.set(row.key, row);
  }
  return [...seen.values()];
}

/**
 * Give every row of a session the cwd that session STARTED in. Without this, one session that
 * changed directory reports as several projects, each with a fraction of its cost - which reads
 * exactly like several small sessions and is the kind of wrong that never announces itself.
 */
export function attributeProjects(rows) {
  const firstCwd = new Map();
  for (const row of [...rows].sort((left, right) => left.at - right.at)) {
    if (!firstCwd.has(row.session)) firstCwd.set(row.session, row.project);
  }
  return rows.map((row) => ({ ...row, project: firstCwd.get(row.session) ?? row.project }));
}

/**
 * The Antigravity ledger, reduced to calls. Unlike the other two readers this one is reading a
 * file THIS REPO wrote, so it is the one place where a version can be trusted to mean something -
 * and therefore the one place that must refuse a version it does not know rather than reading a
 * newer shape with older assumptions. An unknown line is counted and reported, never guessed at
 * and never silently dropped, because a dropped call is spend that vanishes.
 *
 * A FAILED call still counts. A run whose tool calls were all auto-denied returns an empty
 * response and still spends ~18 K input tokens; leaving those out would flatter the harness at
 * exactly the point where it is being judged.
 */
export function readAgyLedger(text) {
  const { records, malformed: unparseable } = parseJsonl(text);
  const calls = [];
  let malformed = unparseable;
  let unknownVersion = 0;
  for (const record of records) {
    if (record.v !== AGY_LEDGER_VERSION) {
      unknownVersion += 1;
      continue;
    }
    const at = Date.parse(record.at ?? '');
    if (!Number.isFinite(at)) {
      // Valid JSON of the right version, but undatable - so it can belong to no window. That is
      // an unreadable LINE, not a format the meter is too old for, and it is counted as one: the
      // version gap tells its reader to look for a format bump, which for this is a dead end.
      malformed += 1;
      continue;
    }
    const usage = record.usage ?? {};
    const count = (value) => (Number.isFinite(value) ? value : 0);
    calls.push({
      at,
      // A call with no pinned model is one whose cost cannot be attributed - the agy result does
      // not name the model that answered. It is reported under a name that says so.
      model: record.model || '(model not pinned)',
      label: record.label ?? null,
      ok: record.ok !== false,
      durationSeconds: Number.isFinite(record.durationSeconds) ? record.durationSeconds : 0,
      turns: count(record.turns),
      tokens: {
        input: count(usage.input),
        output: count(usage.output),
        thinking: count(usage.thinking),
        cacheRead: count(usage.cacheRead),
      },
    });
  }
  calls.sort((left, right) => left.at - right.at);
  return { calls, malformed, unknownVersion };
}

/** Calls grouped by model, biggest input first. Input is the sort key, never a total - see AGY_KINDS. */
export function groupAgyCalls(calls) {
  const buckets = new Map();
  for (const call of calls) {
    let bucket = buckets.get(call.model);
    if (!bucket) {
      bucket = { key: call.model, calls: 0, failed: 0, seconds: 0, turns: 0, tokens: zeroTokens(AGY_KINDS) };
      buckets.set(call.model, bucket);
    }
    bucket.calls += 1;
    if (!call.ok) bucket.failed += 1;
    bucket.seconds += call.durationSeconds;
    bucket.turns += call.turns;
    bucket.tokens = addTokens(bucket.tokens, call.tokens, AGY_KINDS);
  }
  return [...buckets.values()].sort((left, right) => right.tokens.input - left.tokens.input);
}

/**
 * The delegation-outcome ledger `scripts/delegation-outcome.mjs` writes - one line per DELEGATED
 * OR REVIEWED TASK, not per call. Same reading discipline as the agy ledger: an unknown version
 * is excluded and counted, an undatable line is malformed, and nothing is guessed at.
 */
export function readOutcomesLedger(text) {
  const { records, malformed: unparseable } = parseJsonl(text);
  const rows = [];
  let malformed = unparseable;
  let unknownVersion = 0;
  for (const record of records) {
    if (record.v !== OUTCOMES_VERSION) {
      unknownVersion += 1;
      continue;
    }
    const at = Date.parse(record.at ?? '');
    if (!Number.isFinite(at) || !record.harness || !record.taskClass) {
      malformed += 1;
      continue;
    }
    rows.push({
      at,
      taskClass: record.taskClass,
      harness: record.harness,
      // The writer's own derivation is the fallback, so an old line without a pool lands in the
      // same bucket the writer would put it in today - `record.harness` here would mint a
      // phantom 'claude' pool beside the real 'claude-max'.
      pool: record.pool ?? poolFor(record.harness, record.model),
      model: record.model ?? '(model not recorded)',
      label: typeof record.label === 'string' && record.label.trim() ? record.label.trim() : null,
      ...legacyVerdict(record),
      defects: Number.isFinite(record.defects) ? record.defects : 0,
      retries: Number.isFinite(record.retries) ? record.retries : 0,
      redone: Boolean(record.redoneBy),
      landed: Boolean(record.landedSha),
      wallMs: Number.isFinite(record.wallMs) ? record.wallMs : 0,
    });
  }
  rows.sort((left, right) => left.at - right.at);
  return { rows: mergeOutcomesByLabel(rows), malformed, unknownVersion };
}

/**
 * Collapse the lines describing ONE task into one row, which is what makes the writer's documented
 * backfill (`--landed-sha` on a second line with the same `--label`) real rather than a double
 * count. Unlabelled lines never merge with anything.
 *
 * The key is the label WITH the harness, model and task class, never the label alone: `--label` is
 * documented as a back-reference to whatever paid for the work, not as a task id, so two unrelated
 * rows may honestly reuse one. Keyed on the label alone, a reused label silently deletes the older
 * task and redates the newer one into a window it did not happen in - evidence destroyed in the
 * one place routing looks.
 *
 * Merging PREFERS EVIDENCE over recency. The later line wins each field it actually carries, but a
 * count it omits keeps the earlier value rather than zeroing it, and the first line's timestamp
 * always survives. Both matter because the backfill only requires the outcome flags to be
 * restated: without this, following the documented procedure on a row recorded with four defects
 * would silently drop it to zero.
 */
export function mergeOutcomesByLabel(rows) {
  const byKey = new Map();
  const merged = [];
  for (const row of rows) {
    const key = row.label ? JSON.stringify([row.label, row.harness, row.model, row.taskClass]) : null;
    const seen = key === null ? undefined : byKey.get(key);
    if (seen === undefined) {
      if (key !== null) byKey.set(key, merged.length);
      merged.push(row);
      continue;
    }
    const first = merged[seen];
    merged[seen] = {
      ...row,
      at: first.at,
      outcome: row.outcome ?? first.outcome,
      cause: row.cause ?? first.cause,
      defects: row.defects || first.defects,
      retries: row.retries || first.retries,
      redone: row.redone || first.redone,
      landed: row.landed || first.landed,
      wallMs: row.wallMs || first.wallMs,
    };
  }
  return merged;
}

/**
 * Outcomes grouped by (pool, model, task class) - the grain routing decisions are made at
 * (docs/ORCHESTRATION_NEXT.md §6). Most tasks first, so the best-evidenced pairs lead.
 */
export function groupOutcomes(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const key = `${row.pool}|${row.model}|${row.taskClass}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        pool: row.pool, model: row.model, taskClass: row.taskClass, tasks: 0,
        accepted: 0, repaired: 0, unusable: 0, ours: 0, unclassified: 0,
        defects: 0, retries: 0, redone: 0, landed: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.tasks += 1;
    if (!row.outcome) bucket.unclassified += 1;
    else if (ACCEPTED_OUTCOMES.includes(row.outcome)) bucket.accepted += 1;
    else if (row.outcome === 'repaired') bucket.repaired += 1;
    else bucket.unusable += 1;
    // `ours` is the count the pool must not be judged on: the delegation failed on our spec or
    // invocation, so the row is evidence about the delegating session (routing.md, "a null
    // delegation is a PROMPT defect until proven otherwise").
    if (row.cause === 'prompt') bucket.ours += 1;
    bucket.defects += row.defects;
    bucket.retries += row.retries;
    if (row.redone) bucket.redone += 1;
    if (row.landed) bucket.landed += 1;
  }
  return [...buckets.values()].sort((left, right) => right.tasks - left.tasks
    || left.pool.localeCompare(right.pool) || left.taskClass.localeCompare(right.taskClass));
}

/**
 * Below this many attributable rows the report calls its own fraction an anecdote. Three is not a
 * statistical threshold and does not pretend to be - it is the smallest count at which one bad
 * row stops being the whole picture.
 */
export const MIN_ATTRIBUTABLE_FOR_A_RATE = 3;

/**
 * The one rate a routing decision may rest on: how often a pool's own artifact was accepted, over
 * the rows that are evidence ABOUT that pool. A row whose cause was our prompt or a capacity
 * refusal is excluded, and so is one written before the vocabulary existed. Returns nulls rather
 * than a zero when nothing attributable is in the window - "no evidence" and "failed everything"
 * are the two readings the old 0/6 could not tell apart, and that was the whole defect.
 */
export function workerQuality(rows) {
  const isAccepted = (row) => ACCEPTED_OUTCOMES.includes(row.outcome);
  // An ACCEPTED row is always evidence about the worker, whatever it cost us to get: the artifact
  // came back and we took it. Only a row that FAILED can be somebody else's fault, so only a
  // failure is excluded. Counting a pass out of the rate because a wasted call preceded it would
  // let one row be a pass in the tally and a non-row in the rate at the same time.
  const excluded = (row) => !isAccepted(row) && (row.cause === 'prompt' || row.cause === 'capacity');
  const attributable = rows.filter((row) => row.outcome && !excluded(row));
  const accepted = attributable.filter(isAccepted).length;
  return {
    accepted,
    attributable: attributable.length,
    excludedOurs: rows.filter((row) => !isAccepted(row) && row.cause === 'prompt').length,
    excludedCapacity: rows.filter((row) => !isAccepted(row) && row.cause === 'capacity').length,
    // Every row a prompt defect touched, passes included - the COST signal, separate from the
    // quality one, and the number that showed seven of eleven rows were our own fault.
    ours: rows.filter((row) => row.cause === 'prompt').length,
    unclassified: rows.filter((row) => !row.outcome).length,
    rate: attributable.length ? accepted / attributable.length : null,
  };
}

export function inWindow(rows, window) {
  return rows.filter((row) => row.at >= window.since && row.at <= window.until);
}

/**
 * Group rows into { key, requests, sessions, tokens } buckets, biggest first. Sessions are counted
 * by TRANSCRIPT FILE, which is the only thing that is one per session - see readClaudeRows.
 */
export function groupRows(rows, keyOf, kinds) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, requests: 0, sessions: new Set(), tokens: zeroTokens(kinds) };
      buckets.set(key, bucket);
    }
    bucket.requests += 1;
    bucket.sessions.add(row.session);
    bucket.tokens = addTokens(bucket.tokens, row.tokens, kinds);
  }
  return [...buckets.values()].sort((left, right) => right.tokens.total - left.tokens.total);
}

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────

export function formatCount(value) {
  if (!Number.isFinite(value)) return '-';
  const digits = String(Math.round(Math.abs(value)));
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return (value < 0 ? '-' : '') + out;
}

/** "1m 27s" / "4.3s". Wall clock spent inside a harness, which IS a stopwatch, so seconds survive. */
export function formatWallClock(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  // Round BEFORE choosing the unit, or 59.7s picks the seconds branch and then prints "60s".
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}m ${whole % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "2h 14m", for a reset time. Deliberately coarse - a rate-limit window is not a stopwatch. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  const past = ms < 0;
  const minutes = Math.round(Math.abs(ms) / 60_000);
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return past ? `${text} ago` : `in ${text}`;
}

export function formatTable(headers, rows, { align = [] } = {}) {
  if (!rows.length) return '  (nothing)';
  const cells = [headers, ...rows].map((row) => row.map((cell) => String(cell ?? '')));
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => row[column].length)));
  const line = (row) => row
    .map((cell, column) => (align[column] === 'right' ? cell.padStart(widths[column]) : cell.padEnd(widths[column])))
    .join('  ')
    .trimEnd();
  return [
    `  ${line(cells[0])}`,
    `  ${widths.map((width) => '-'.repeat(width)).join('  ')}`,
    ...cells.slice(1).map((row) => `  ${line(row)}`),
  ].join('\n');
}

/** Long rows past `top` collapse into one honest "N more" row rather than being dropped. */
export function collapse(buckets, top, kinds) {
  if (buckets.length <= top) return { shown: buckets, rest: null };
  const rest = buckets.slice(top).reduce(
    (acc, bucket) => ({
      key: `(${buckets.length - top} more)`,
      requests: acc.requests + bucket.requests,
      sessions: new Set([...acc.sessions, ...bucket.sessions]),
      tokens: addTokens(acc.tokens, bucket.tokens, kinds),
    }),
    { key: '', requests: 0, sessions: new Set(), tokens: zeroTokens(kinds) },
  );
  return { shown: buckets.slice(0, top), rest };
}

const shortLabel = (value, max = 46) => (value.length <= max ? value : `...${value.slice(-(max - 3))}`);

/** A wrapped bullet: "    - first line", then continuation lines aligned under its text. */
export function bullet(text, { indent = '    ', width = 72 } = {}) {
  const chunks = text.match(new RegExp(`.{1,${width}}(\\s|$)`, 'g')) ?? [text];
  return chunks.map((chunk, index) => `${indent}${index === 0 ? '- ' : '  '}${chunk.trim()}`);
}

// ── The filesystem side ──────────────────────────────────────────────────────────────────────────

function listJsonl(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJsonl(full, out);
    else if (entry.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

/**
 * The newest wave plan across several directories, which is what `--wave` means by "this wave".
 * Several, because a plan lives in the store (`wave-plan-store.mjs`) and the two `docs/handoffs/`
 * directories still hold the ones written before the 2026-09-09 move.
 */
export function findNewestWavePlan(dirs, options = {}) {
  let best = null;
  for (const dir of dirs) {
    if (!dir) continue;
    const found = findWavePlan(dir, options);
    if (found && (!best || found.mtimeMs > best.mtimeMs)) best = found;
  }
  return best;
}

/** The newest wave plan in ONE directory. */
export function findWavePlan(handoffDir, { readdir = readdirSync, stat = statSync, exists = existsSync } = {}) {
  if (!exists(handoffDir)) return null;
  let best = null;
  for (const name of readdir(handoffDir)) {
    if (!/wave-plan.*\.local\.md$/.test(name)) continue;
    const info = stat(path.join(handoffDir, name));
    if (!best || info.mtimeMs > best.mtimeMs) best = { name, mtimeMs: info.mtimeMs };
  }
  return best;
}

function collectCodex(home, window) {
  const roots = [path.join(home, '.codex', 'sessions'), path.join(home, '.codex', 'archived_sessions')];
  const present = roots.filter((root) => existsSync(root));
  const files = roots.flatMap((root) => listJsonl(root));
  const sessions = [];
  let malformed = 0;
  for (const file of files) {
    // A rollout whose file has not been touched since before the window cannot contain a snapshot
    // inside it. Skipping those keeps a full read of 88 files down to the handful that matter.
    if (statSync(file).mtimeMs < window.since) continue;
    const session = readCodexSession(readFileSync(file, 'utf8'), { file });
    malformed += session.malformed;
    sessions.push(session);
  }
  return { sessions: dedupeCodexSessions(sessions), files: files.length, malformed, roots: present };
}

function collectClaude(home, window) {
  const root = path.join(home, '.claude', 'projects');
  const files = listJsonl(root);
  const rows = [];
  let malformed = 0;
  for (const file of files) {
    if (statSync(file).mtimeMs < window.since) continue;
    const read = readClaudeRows(readFileSync(file, 'utf8'), { file });
    malformed += read.malformed;
    rows.push(...read.rows);
  }
  return { rows: attributeProjects(dedupeClaudeRows(rows)), files: files.length, malformed, root: existsSync(root) ? root : null };
}

function collectAgy(home, env) {
  const file = ledgerPath({ env, home });
  if (!existsSync(file)) return { file, exists: false, calls: [], malformed: 0, unknownVersion: 0, firstAt: null };
  const read = readAgyLedger(readFileSync(file, 'utf8'));
  return {
    file,
    exists: true,
    ...read,
    // The whole ledger's first line, not the window's - it is what "there is nothing before this"
    // means, and it is the honest bound on every Antigravity number this report prints.
    firstAt: read.calls.length ? read.calls[0].at : null,
  };
}

function collectOutcomes(home, env) {
  const file = outcomesLedgerPath({ env, home });
  if (!existsSync(file)) return { file, exists: false, rows: [], malformed: 0, unknownVersion: 0 };
  return { file, exists: true, ...readOutcomesLedger(readFileSync(file, 'utf8')) };
}

// ── Reporting ────────────────────────────────────────────────────────────────────────────────────

function codexReport(collected, window, top) {
  const lines = [];
  const rows = [];
  for (const session of collected.sessions) {
    const usage = codexWindowUsage(session, window);
    if (usage.turns === 0) continue;
    rows.push({ session, usage });
  }
  rows.sort((left, right) => right.usage.tokens.total - left.usage.tokens.total);

  const totals = rows.reduce((acc, row) => addTokens(acc, row.usage.tokens, CODEX_KINDS), zeroTokens(CODEX_KINDS));
  const turns = rows.reduce((acc, row) => acc + row.usage.turns, 0);

  lines.push('CODEX');
  if (!collected.roots.length) {
    lines.push('  no ~/.codex/sessions or ~/.codex/archived_sessions on this machine - nothing to read.');
    return { lines, totals, sessions: 0, turns, rate: null };
  }
  if (!rows.length) {
    lines.push(`  0 sessions, 0 tokens. Codex did no work in this window (${collected.files} rollouts on disk).`);
  } else {
    lines.push(`  ${rows.length} session${rows.length === 1 ? '' : 's'}, ${turns} turns, ${formatCount(totals.total)} tokens.`);
    lines.push('');
    const shown = rows.slice(0, top);
    lines.push(formatTable(
      ['session', 'where', 'turns', 'input', 'cached', 'output', 'reasoning', 'total'],
      shown.map(({ session, usage }) => [
        // 13 characters, not 8: these are UUIDv7s, so the leading bytes are the timestamp and
        // sessions started in the same minute share their first 8 characters exactly.
        session.sessionId.slice(0, 13),
        shortLabel(session.cwd ? path.basename(session.cwd) : '(unknown cwd)', 28),
        formatCount(usage.turns),
        formatCount(usage.tokens.input),
        formatCount(usage.tokens.cachedInput),
        formatCount(usage.tokens.output),
        formatCount(usage.tokens.reasoning),
        formatCount(usage.tokens.total),
      ]),
      { align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'] },
    ));
    if (rows.length > top) lines.push(`  (${rows.length - top} more sessions not shown)`);
    lines.push('');
    lines.push('  cached is the share of input that was a cache hit. total = input + output.');
  }

  const rate = latestRateLimits(collected.sessions, window);
  lines.push('');
  if (!rate) {
    lines.push('  Rate limits: no snapshot in this window. Codex only writes the percentages while');
    lines.push('  it is running, so a quiet window has none - which is not the same as 0% used.');
  } else {
    const { limits } = rate;
    const stamp = new Date(rate.at).toISOString();
    lines.push(`  Rate limits, as of ${stamp} (plan: ${limits.plan_type ?? 'unknown'}) - a SNAPSHOT, not a sum:`);
    for (const [name, label] of [['primary', '5-hour window'], ['secondary', 'weekly window']]) {
      const entry = limits[name];
      if (!entry) {
        lines.push(`    ${label.padEnd(14)} not reported`);
        continue;
      }
      const minutes = entry.window_minutes ? `${entry.window_minutes} min` : 'unknown length';
      const resetsAt = Number.isFinite(entry.resets_at) ? new Date(entry.resets_at * 1000) : null;
      const reset = resetsAt
        ? `resets ${resetsAt.toISOString()} (${formatDuration(resetsAt.getTime() - window.until)})`
        : 'reset time not reported';
      lines.push(`    ${label.padEnd(14)} ${String(entry.used_percent ?? '?').padStart(5)}% used  [${minutes}]  ${reset}`);
    }
  }
  return { lines, totals, sessions: rows.length, turns, rate };
}

function claudeReport(collected, window, top) {
  const lines = ['CLAUDE CODE'];
  if (!collected.root) {
    lines.push('  no ~/.claude/projects on this machine - nothing to read.');
    return { lines, totals: zeroTokens(CLAUDE_KINDS), rows: [] };
  }
  const rows = inWindow(collected.rows, window);
  const totals = rows.reduce((acc, row) => addTokens(acc, row.tokens, CLAUDE_KINDS), zeroTokens(CLAUDE_KINDS));
  const sessions = new Set(rows.map((row) => row.session)).size;
  const sidechain = rows.filter((row) => row.sidechain).length;

  if (!rows.length) {
    lines.push('  0 sessions, 0 tokens in this window.');
    return { lines, totals, rows };
  }
  lines.push(
    `  ${sessions} session${sessions === 1 ? '' : 's'}, ${rows.length} requests `
    + `(${sidechain} from subagents), ${formatCount(totals.total)} tokens.`,
  );

  const groupings = [['by branch', (row) => row.branch], ['by project', (row) => row.project]];
  for (const [title, keyOf] of groupings) {
    const { shown, rest } = collapse(groupRows(rows, keyOf, CLAUDE_KINDS), top, CLAUDE_KINDS);
    const body = [...shown, ...(rest ? [rest] : [])];
    lines.push('');
    lines.push(`  ${title}`);
    lines.push(formatTable(
      [title.replace('by ', ''), 'sessions', 'reqs', 'input', 'cache write', 'cache read', 'output', 'total'],
      body.map((bucket) => [
        shortLabel(bucket.key),
        formatCount(bucket.sessions.size),
        formatCount(bucket.requests),
        formatCount(bucket.tokens.input),
        formatCount(bucket.tokens.cacheWrite),
        formatCount(bucket.tokens.cacheRead),
        formatCount(bucket.tokens.output),
        formatCount(bucket.tokens.total),
      ]),
      { align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'] },
    ));
  }

  const models = groupRows(rows, (row) => row.model, CLAUDE_KINDS);
  lines.push('');
  lines.push('  by model');
  lines.push(formatTable(
    ['model', 'reqs', 'input', 'cache write', 'cache read', 'output', 'total'],
    models.map((bucket) => [
      bucket.key,
      formatCount(bucket.requests),
      formatCount(bucket.tokens.input),
      formatCount(bucket.tokens.cacheWrite),
      formatCount(bucket.tokens.cacheRead),
      formatCount(bucket.tokens.output),
      formatCount(bucket.tokens.total),
    ]),
    { align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'] },
  ));
  lines.push('');
  lines.push('  "branch" is whatever each request recorded, which for a session launched into a');
  lines.push('  worktree is the LAUNCHING session\'s branch - read the project table for which');
  lines.push('  checkout the work actually happened in.');
  lines.push('');
  lines.push('  No 5-hour window percentage exists for Claude Code: the transcripts carry usage,');
  lines.push('  not rate limits. Tokens are not a percentage of an undisclosed allowance, so this');
  lines.push('  meter reports the tokens and refuses to guess the rest.');
  return { lines, totals, rows };
}

/**
 * The Antigravity block. Its shape differs from the other two on purpose: no total column, and a
 * "what this cannot know" paragraph that is part of the OUTPUT rather than a comment in the
 * source. A small number here can mean "cheap" or it can mean "most of the calls were not made
 * through the wrapper", and only the report can tell the reader which question it is answering.
 */
function agyReport(collected, window) {
  const lines = ['ANTIGRAVITY (agy)'];
  const gaps = [];

  if (!collected.exists) {
    lines.push(`  no ledger at ${collected.file} - nothing to read.`);
    lines.push('  agy keeps NO cumulative usage anywhere on disk, so there is nothing else to read');
    lines.push('  either. Call it through `npm run agy:read -- --model <id> --label <what-for> "..."`');
    lines.push('  and its cost lands here.');
    return { lines, calls: [], totals: zeroTokens(AGY_KINDS), seconds: 0, failed: 0 };
  }

  const calls = inWindow(collected.calls, window);
  const totals = calls.reduce((acc, call) => addTokens(acc, call.tokens, AGY_KINDS), zeroTokens(AGY_KINDS));
  const seconds = calls.reduce((acc, call) => acc + call.durationSeconds, 0);
  const failed = calls.filter((call) => !call.ok).length;
  const unpinned = calls.filter((call) => call.model === '(model not pinned)').length;

  if (!calls.length) {
    lines.push(`  0 calls in this window (${collected.calls.length} on the ledger overall).`);
  } else {
    lines.push(
      `  ${calls.length} call${calls.length === 1 ? '' : 's'}`
      + `${failed ? `, ${failed} failed` : ''}, ${formatWallClock(seconds)} of wall clock.`,
    );
    lines.push('');
    lines.push(formatTable(
      ['model', 'calls', 'failed', 'wall clock', 'input', 'output', 'thinking', 'cache read'],
      groupAgyCalls(calls).map((bucket) => [
        bucket.key,
        formatCount(bucket.calls),
        bucket.failed ? formatCount(bucket.failed) : '-',
        formatWallClock(bucket.seconds),
        formatCount(bucket.tokens.input),
        formatCount(bucket.tokens.output),
        formatCount(bucket.tokens.thinking),
        formatCount(bucket.tokens.cacheRead),
      ]),
      { align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'] },
    ));
    lines.push('');
    lines.push('  The four counts are NOT added. agy\'s own `total_tokens` is input + output only -');
    lines.push('  it leaves out thinking and cache reads, and cache reads are routinely larger than');
    lines.push('  the other three together. A single number here would be a different number');
    lines.push('  depending on which fields it added, so this meter prints the four and stops.');
  }

  gaps.push(
    collected.firstAt
      ? `no history before ${new Date(collected.firstAt).toISOString()}, when the ledger got its `
        + 'first line. agy writes no cumulative usage anywhere, so an agy call made outside '
        + '`npm run agy` left no trace and cannot be recovered.'
      : 'the ledger exists but is empty. Only calls made through `npm run agy` are ever visible '
        + 'here - agy itself keeps no usage on disk.',
  );
  gaps.push(
    'no remaining quota. agy has no `usage` subcommand and no headless quota surface at all, so '
    + 'unlike Codex there is no percentage to report - and tokens spent are not a percentage of '
    + 'an allowance nobody has published.',
  );
  if (unpinned) {
    gaps.push(
      `${unpinned} call${unpinned === 1 ? '' : 's'} did not pin a model. Those tokens are real and `
      + 'unattributable: agy\'s result never names the model that answered.',
    );
  }
  if (collected.unknownVersion) {
    const one = collected.unknownVersion === 1;
    gaps.push(
      `${collected.unknownVersion} ledger line${one ? '' : 's'} ${one ? 'carries' : 'carry'} a version `
      + `this build does not know (it reads v${AGY_LEDGER_VERSION}), so ${one ? 'it is' : 'they are'} `
      + 'excluded from every number above rather than read with the wrong assumptions.',
    );
  }

  lines.push('');
  lines.push('  What this cannot know:');
  for (const gap of gaps) lines.push(...bullet(gap));
  return { lines, calls, totals, seconds, failed };
}

/**
 * Delegation outcomes - the routing evidence, printed at the grain decisions are made at. This is
 * the block the orchestrator reads at plan time: a (pool, model, task-class) pair with a run of
 * ACCEPTED outcomes graduates to volume, a "cheap" pair generating retries and repairs stops
 * being treated as cheap (docs/ORCHESTRATION_NEXT.md §6). The rate is stated only over rows that
 * are evidence about the worker, because the alternative retires a pool for our own mistake.
 */
function outcomesReport(collected, window, top) {
  const lines = ['DELEGATION OUTCOMES'];
  // One shape from all three exits, so `--json` reads the same verdict the text was printed from
  // rather than deriving its own from the rows a second time.
  const rows = collected.exists ? inWindow(collected.rows, window) : [];
  const pairs = groupOutcomes(rows);
  const quality = workerQuality(rows);
  const report = { lines, rows, pairs, quality };
  if (!collected.exists) {
    lines.push(`  no ledger at ${collected.file} - nothing recorded yet.`);
    lines.push('  A delegating session records each verified result with `node scripts/delegation-outcome.mjs`;');
    lines.push('  until it does, routing rests on the prose in docs/HARNESS_ROUTING.md alone.');
    return report;
  }
  if (!rows.length) {
    lines.push(`  0 tasks in this window (${collected.rows.length} on the ledger overall).`);
    return report;
  }
  // Every task lands in exactly one of these, so the parts SUM to the total. An earlier summary
  // printed only the good count against the total, and "0 first-pass of 6" read as six failures
  // when in fact not one of the six had been classified at all.
  const tally = [
    [rows.filter((row) => ACCEPTED_OUTCOMES.includes(row.outcome)).length, 'accepted as delivered'],
    [rows.filter((row) => row.outcome === 'repaired').length, 'repaired after review'],
    [rows.filter((row) => row.outcome === 'unusable').length, 'unusable'],
    [quality.unclassified, 'not classified'],
  ].filter(([count]) => count > 0).map(([count, what]) => `${count} ${what}`);
  lines.push(`  ${rows.length} task${rows.length === 1 ? '' : 's'}: ${tally.join(', ')}.`);
  // The point of this block. A bare rate over every row reads as a verdict on the pools, and on
  // the real ledger most non-clean rows were OUR prompt or predate the vocabulary entirely
  // (docs/HARNESS_ROUTING.md, "What zero first-pass meant"). So the rate is stated over what it
  // is actually evidence about, and everything excluded is named rather than averaged in.
  if (quality.rate === null) {
    lines.push('  No row in this window is evidence about a worker, so there is no quality rate to read.');
  } else {
    lines.push(`  Worker quality: ${quality.accepted}/${quality.attributable} accepted, over the rows that are `
      + 'evidence about the WORKER.');
    // A fraction over one or two rows is an anecdote, and the table below it splits that thin
    // evidence thinner still. Say so where the number is read, not only in the doctrine.
    if (quality.attributable < MIN_ATTRIBUTABLE_FOR_A_RATE) {
      lines.push(`  That is ${quality.attributable} row${quality.attributable === 1 ? '' : 's'} - an anecdote, not a rate. `
        + 'Do not move a task class on it.');
    }
  }
  const excluded = [];
  if (quality.excludedOurs) {
    excluded.push(`${quality.excludedOurs} failed on OUR prompt or invocation (a spec defect, not a pool defect)`);
  }
  if (quality.excludedCapacity) excluded.push(`${quality.excludedCapacity} were capacity refusals`);
  if (quality.unclassified) excluded.push(`${quality.unclassified} predate the outcome vocabulary and stay unresolved`);
  if (excluded.length) lines.push(`  Excluded from that rate: ${excluded.join('; ')}.`);
  // The cost line, kept apart from the rate: a row can be a PASS and still have burned a call on
  // our own invocation, and that is a spec problem to fix, never a reason to move the work. Only
  // worth printing when it counts rows the exclusion line above did not already name.
  if (quality.ours > quality.excludedOurs) {
    lines.push(`  ${quality.ours} of ${rows.length} row${rows.length === 1 ? '' : 's'} burned a call on OUR prompt`);
    lines.push('  or invocation, passes included. That is a spec defect to fix, never a reason to move the work.');
  }
  lines.push('');
  // This is the finest-grained table in the report (pool x model x free-text task class), so it
  // honors --top like the others - unbounded, it would bury the summaries above it within weeks.
  lines.push(formatTable(
    ['pool', 'model', 'task class', 'tasks', 'accepted', 'repaired', 'unusable', 'ours', 'unclassed', 'defects', 'retries', 'landed'],
    pairs.slice(0, top).map((bucket) => [
      bucket.pool,
      shortLabel(bucket.model, 24),
      shortLabel(bucket.taskClass, 22),
      formatCount(bucket.tasks),
      bucket.accepted ? formatCount(bucket.accepted) : '-',
      bucket.repaired ? formatCount(bucket.repaired) : '-',
      bucket.unusable ? formatCount(bucket.unusable) : '-',
      bucket.ours ? formatCount(bucket.ours) : '-',
      bucket.unclassified ? formatCount(bucket.unclassified) : '-',
      bucket.defects ? formatCount(bucket.defects) : '-',
      // Kept visible because a pair that answers correctly on the third call is not as cheap as
      // its accepted count makes it look, and `ours` only covers the calls WE wasted.
      bucket.retries ? formatCount(bucket.retries) : '-',
      `${bucket.landed}/${bucket.tasks}`,
    ]),
    { align: ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'] },
  ));
  if (pairs.length > top) lines.push(`  (${pairs.length - top} more pool/model/task-class rows not shown - raise --top)`);
  lines.push('');
  lines.push('  One line per verified TASK, not per call. `ours` is the count that is evidence about the');
  lines.push('  DELEGATING SESSION - never route away from a pool on it. `landed` counts a recorded sha,');
  lines.push('  which is written when the outcome is, so work that landed later reads 0 until a second');
  lines.push('  line with the same --label backfills it. Usage stays on each harness\'s own meter.');
  if (collected.unknownVersion) {
    lines.push(`  ${collected.unknownVersion} line(s) carry a version this build does not read (v${OUTCOMES_VERSION}) and are excluded.`);
  }
  return report;
}

const USAGE = `Usage: node scripts/harness-usage.mjs [--since <iso> | --hours <n> | --wave] [--until <iso>] [--top <n>] [--json]

Prints what each AI harness cost over a window: Claude Code and Codex from their own local
transcripts, Antigravity from the ledger \`npm run agy\` keeps (it writes none of its own). With no
flags, the last 24 hours.`;

/**
 * WHICH BUILD ANSWERED - asked of each harness, never written down anywhere.
 *
 * A contract that quotes a version is a cache, and every one of them in this repo has gone stale
 * (docs/HARNESS_ROUTING.md pinned `agy` three minor releases behind for a week, and a capability
 * review then had to correct it). This is the plan-time instrument the orchestrator already runs,
 * so the live number belongs here: routing reads it, nobody maintains it, and a claim about what
 * a harness can do is checked against the build that is installed rather than against a memory of
 * a release note.
 *
 * Every probe fails soft. A harness that is not installed is reported as such, which is itself a
 * routing fact - a pool with no binary takes no rows.
 */
export const VERSION_PROBES = Object.freeze([
  { pool: 'Claude Code', command: 'claude --version' },
  { pool: 'Codex', command: 'codex --version' },
  { pool: 'Antigravity', command: 'agy --version' },
]);

/** The version out of a `--version` line: the first dotted number on the first non-empty line. */
export function parseVersion(stdout) {
  for (const line of String(stdout ?? '').split('\n')) {
    const found = /\d+\.\d+\.\d+[\w.-]*/.exec(line);
    if (found) return found[0];
  }
  return null;
}

/**
 * `[{ pool, version, why }]`. `run` is injected by the test; the real one goes through a shell
 * because these launchers are `.cmd` files on Windows, which is safe here and only here - the
 * command strings are constants with no argument anybody supplies.
 */
export function harnessVersions({ probes = VERSION_PROBES, run = null, timeoutMs = 10_000 } = {}) {
  const exec = run ?? ((command) => spawnSync(command, { shell: true, encoding: 'utf8', timeout: timeoutMs, windowsHide: true }));
  return probes.map(({ pool, command }) => {
    let result;
    try {
      result = exec(command);
    } catch (error) {
      return { pool, version: null, why: `could not be asked (${error?.message ?? error})` };
    }
    if (result?.error || result?.status !== 0) return { pool, version: null, why: 'not installed, or it did not answer' };
    const version = parseVersion(result.stdout);
    return { pool, version, why: version ? null : 'answered without a version number' };
  });
}

export function versionLines(rows) {
  return [
    'Installed harnesses (asked now, never cached in a doc)',
    ...rows.map(({ pool, version, why }) => `  ${pool.padEnd(12)} ${version ?? `-  ${why}`}`),
  ];
}

// ── Capability observations, and whether the installed build still backs them ───────────────────
//
// Codex and Antigravity ship almost daily. A doc sentence saying "this flag does not exist" or
// "this model is unavailable" is evidence about ONE build, and left as prose it quietly disables
// a capability for weeks after the harness changed (docs/HARNESS_ROUTING.md pinned agy three
// releases behind for a week). `scripts/harness-capabilities.json` holds each such observation
// with the version it was measured on; this compares that version with the one installed now and
// names every observation the installed build has not been seen to back. It re-tests nothing -
// a re-probe costs a call - it only says which claims are currently unverified so a plan does not
// route on a memory.

function readTextOrNull(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function readCapabilities(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.observations) ? parsed.observations : [];
  } catch {
    return [];
  }
}

/** Each observation with its standing against the installed versions: holds, unverified, or constraint. */
export function capabilityStandings(observations, installed) {
  const versionOf = new Map(installed.map((row) => [row.pool, row.version ?? null]));
  return observations.map((observation) => {
    if (observation.kind === 'constraint') return { ...observation, standing: 'constraint', installedVersion: null };
    const installedVersion = versionOf.get(observation.harness) ?? null;
    const holds = installedVersion !== null && installedVersion === observation.measuredOn;
    return { ...observation, standing: holds ? 'holds' : 'unverified', installedVersion };
  });
}

export function capabilityLines(standings) {
  const unverified = standings.filter((row) => row.standing === 'unverified');
  const holds = standings.filter((row) => row.standing === 'holds').length;
  const constraints = standings.filter((row) => row.standing === 'constraint').length;
  const lines = [
    `Capability observations (scripts/harness-capabilities.json): ${holds} measured on the installed `
      + `build, ${unverified.length} UNVERIFIED since the build they were measured on, ${constraints} constraint(s) of our own.`,
  ];
  for (const row of unverified) {
    lines.push(
      `  UNVERIFIED  ${row.harness} ${row.measuredOn ?? '?'} -> installed ${row.installedVersion ?? 'not answering'}: ${row.id}`,
      ...bullet(row.claim, { indent: '              ' }),
      ...(row.reprobe ? bullet(`re-probe: ${row.reprobe}`, { indent: '              ' }) : []),
    );
  }
  if (unverified.length) {
    lines.push('  An unverified observation is neither true nor false; routing on it is routing on a memory.');
  }
  return lines;
}

export function main(argv = process.argv.slice(2), { home = homedir(), now = Date.now(), env = process.env } = {}) {
  let args;
  let window;
  try {
    args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    window = resolveWindow(args, {
      now,
      wavePlan: findNewestWavePlan([wavePlansDir(), path.join(REPO_ROOT, 'docs', 'handoffs')]),
    });
  } catch (error) {
    process.stderr.write(`harness-usage: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }

  const codex = collectCodex(home, window);
  const claude = collectClaude(home, window);
  const agy = collectAgy(home, env);
  const outcomes = collectOutcomes(home, env);
  const codexOut = codexReport(codex, window, args.top);
  const claudeOut = claudeReport(claude, window, args.top);
  const agyOut = agyReport(agy, window);
  const outcomesOut = outcomesReport(outcomes, window, args.top);
  const installed = harnessVersions();
  const capabilities = capabilityStandings(
    readCapabilities(readTextOrNull(path.join(REPO_ROOT, 'scripts', 'harness-capabilities.json'))),
    installed,
  );

  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      window: { since: new Date(window.since).toISOString(), until: new Date(window.until).toISOString(), label: window.label },
      installed,
      capabilities: capabilities.map(({ id, harness, kind, measuredOn, installedVersion, standing }) => ({ id, harness, kind, measuredOn, installedVersion, standing })),
      codex: {
        sessions: codexOut.sessions,
        turns: codexOut.turns,
        tokens: codexOut.totals,
        rateLimits: codexOut.rate
          ? { at: new Date(codexOut.rate.at).toISOString(), ...codexOut.rate.limits }
          : null,
      },
      claudeCode: {
        sessions: new Set(claudeOut.rows.map((row) => row.session)).size,
        requests: claudeOut.rows.length,
        tokens: claudeOut.totals,
        byModel: groupRows(claudeOut.rows, (row) => row.model, CLAUDE_KINDS)
          .map((bucket) => ({ model: bucket.key, requests: bucket.requests, tokens: bucket.tokens })),
        rateLimits: null,
      },
      antigravity: {
        ledger: agy.file,
        ledgerExists: agy.exists,
        // The whole ledger's start, not the window's: every Antigravity number here is bounded by
        // it, and a consumer that does not see the bound will read a small number as a small bill.
        historyFrom: agy.firstAt ? new Date(agy.firstAt).toISOString() : null,
        calls: agyOut.calls.length,
        failedCalls: agyOut.failed,
        wallClockSeconds: Number(agyOut.seconds.toFixed(3)),
        // No `total`: agy's own total_tokens is input + output and excludes the other two.
        tokens: agyOut.totals,
        rateLimits: null,
      },
      delegationOutcomes: {
        ledger: outcomes.file,
        ledgerExists: outcomes.exists,
        tasks: outcomesOut.rows.length,
        // The whole verdict, never a single number: a consumer that reads only a rate cannot tell
        // "no evidence" from "failed everything", which is the defect this replaced.
        quality: outcomesOut.quality,
        pairs: outcomesOut.pairs,
      },
      malformedLines: { codex: codex.malformed, claudeCode: claude.malformed, antigravity: agy.malformed, outcomes: outcomes.malformed },
      unknownLedgerLines: { antigravity: agy.unknownVersion, outcomes: outcomes.unknownVersion },
    }, null, 2)}\n`);
    return 0;
  }

  const out = [
    `Harness usage - ${window.label}`,
    `${new Date(window.since).toISOString()}  ..  ${new Date(window.until).toISOString()}`,
    '',
    ...versionLines(installed),
    '',
    ...capabilityLines(capabilities),
    '',
    ...claudeOut.lines,
    '',
    ...codexOut.lines,
    '',
    ...agyOut.lines,
    '',
    ...outcomesOut.lines,
  ];
  if (codex.malformed || claude.malformed || agy.malformed || outcomes.malformed) {
    out.push(
      '',
      `  Skipped unreadable lines: ${claude.malformed} in Claude Code, ${codex.malformed} in Codex, `
      + `${agy.malformed} in the Antigravity ledger, ${outcomes.malformed} in the outcomes ledger.`,
    );
  }
  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
