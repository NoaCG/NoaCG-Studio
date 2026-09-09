// The guard on the harness usage meter is these cases, not the prose in harness-usage.mjs.
//
// A usage meter fails SILENTLY: a number that is twice too big, or a window that quietly counts a
// whole session because part of it fell inside, reads exactly like a correct one. So the cases
// pinned here are the four ways the real transcripts are shaped to mislead a naive reader:
//
//   - Claude Code writes the same assistant record two or three times, in one file and again in a
//     resumed session's file, so the dedupe has to be global and keyed on the request;
//   - Codex's `last_token_usage` does not sum to its own `total_token_usage`, so the meter walks
//     cumulative deltas and a session straddling the window contributes only its inside part;
//   - a percentage is a snapshot shared by every session, so exactly one is ever reported;
//   - a live transcript's last line is routinely half-written, and a meter that throws on it is
//     useless at the moment it is wanted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  classifyResult,
  DEFAULT_PRINT_TIMEOUT_SECONDS,
  LEDGER_VERSION,
  ledgerPath,
  ledgerRecord,
  main as agyMain,
  MAX_PROMPT_CHARS,
  parseAgyStdout,
  parseArgs as agyParseArgs,
  parseDuration,
  resolveAgy,
  changedPaths,
  writeScopeRefusal,
  agySettingsPath,
  EFFORTLESS_MODELS,
  effortVerdict,
  foreignCheckoutPaths,
  foreignCheckoutRefusal,
  grantPreflight,
  invocationPreflight,
  planModeWriteRefusal,
  promptPaths,
} from './agy-run.mjs';
import {
  AGY_KINDS,
  landedCapabilitiesText,
  AGY_LEDGER_VERSION,
  attributeProjects,
  bullet,
  CLAUDE_KINDS,
  CODEX_KINDS,
  codexWindowUsage,
  collapse,
  dedupeClaudeRows,
  dedupeCodexSessions,
  deltaTokens,
  findNewestWavePlan,
  findWavePlan,
  formatCount,
  formatDuration,
  formatTable,
  formatWallClock,
  groupAgyCalls,
  groupRows,
  inWindow,
  latestRateLimits,
  parseArgs,
  parseJsonl,
  readAgyLedger,
  readClaudeRows,
  readCodexSession,
  resolveWindow,
  harnessVersions,
  parseVersion,
  versionLines,
  capabilityLines,
  capabilityStandings,
  readCapabilities,
} from './harness-usage.mjs';
import {
  AGY_LEDGER,
  CLAUDE_TRANSCRIPT,
  CLAUDE_TRANSCRIPT_RESUMED,
  CODEX_ROLLOUT,
  CODEX_ROLLOUT_NO_RATE_LIMITS,
} from './harness-usage-fixtures.mjs';

const at = (iso) => Date.parse(iso);
const WHOLE_DAY = { since: at('2026-08-30T00:00:00Z'), until: at('2026-08-30T23:59:59Z') };

// ── Malformed input must never throw ─────────────────────────────────────────────────────────────

test('a half-written last line is skipped and counted, not thrown on', () => {
  const { records, malformed } = parseJsonl(CODEX_ROLLOUT);
  assert.equal(malformed, 1);
  assert.equal(records.length, 5);
});

test('blank lines are not malformed', () => {
  assert.deepEqual(parseJsonl('\n\n  \n'), { records: [], malformed: 0 });
});

test('a JSON scalar on its own line is malformed, not a record', () => {
  assert.equal(parseJsonl('7\n"text"\nnull').malformed, 3);
});

// ── Codex ────────────────────────────────────────────────────────────────────────────────────────

test('a Codex rollout yields its session identity and ordered snapshots', () => {
  const session = readCodexSession(CODEX_ROLLOUT, { file: 'rollout-x.jsonl' });
  assert.equal(session.sessionId, '01a04e5d-d6db-73c0-8c39-441a50539c50');
  assert.equal(session.cwd, 'C:\\claude\\NoaCG-Studio');
  assert.equal(session.malformed, 1);
  assert.equal(session.snapshots.length, 3);
  assert.deepEqual(session.snapshots.map((snap) => snap.totals?.total ?? null), [1050, null, 3120]);
});

test('a token_count with a null info is kept for its rate limits and moves no tokens', () => {
  const session = readCodexSession(CODEX_ROLLOUT);
  const heartbeat = session.snapshots[1];
  assert.equal(heartbeat.totals, null);
  assert.equal(heartbeat.rateLimits.primary.used_percent, 8);
  // The two real snapshots are 1050 then 3120 cumulative, so the whole session is 3120 - not
  // 1050 + 2070 + something for the heartbeat.
  assert.equal(codexWindowUsage(session, WHOLE_DAY).tokens.total, 3120);
});

test('cumulative deltas mean a session straddling the window contributes only its inside part', () => {
  const session = readCodexSession(CODEX_ROLLOUT);
  const usage = codexWindowUsage(session, { since: at('2026-08-30T11:30:00Z'), until: at('2026-08-30T23:00:00Z') });
  assert.equal(usage.turns, 1);
  assert.equal(usage.tokens.total, 2070);
  assert.equal(usage.tokens.input, 2000);
  assert.equal(usage.tokens.output, 70);
  assert.equal(usage.tokens.reasoning, 20);
});

test('a window with no snapshots in it reports zero, not the session total', () => {
  const usage = codexWindowUsage(readCodexSession(CODEX_ROLLOUT), { since: at('2026-08-31T00:00:00Z'), until: at('2026-08-31T23:00:00Z') });
  assert.equal(usage.turns, 0);
  assert.equal(usage.tokens.total, 0);
  assert.equal(usage.firstAt, null);
});

test('a session that never reached the model has no snapshots and no rate limits', () => {
  const session = readCodexSession(CODEX_ROLLOUT_NO_RATE_LIMITS, { file: 'rollout-y.jsonl' });
  assert.equal(session.snapshots.length, 0);
  assert.equal(codexWindowUsage(session, WHOLE_DAY).tokens.total, 0);
  assert.equal(latestRateLimits([session], WHOLE_DAY), null);
});

test('exactly one rate-limit snapshot is reported - the newest, never a sum', () => {
  const sessions = [readCodexSession(CODEX_ROLLOUT), readCodexSession(CODEX_ROLLOUT_NO_RATE_LIMITS)];
  const latest = latestRateLimits(sessions, WHOLE_DAY);
  assert.equal(new Date(latest.at).toISOString(), '2026-08-30T12:00:00.000Z');
  assert.equal(latest.limits.primary.used_percent, 11);
  assert.equal(latest.limits.secondary.used_percent, 40);
  assert.equal(latest.limits.plan_type, 'plus');
});

test('a rate-limit snapshot outside the window is not reported', () => {
  const window = { since: at('2026-08-30T10:30:00Z'), until: at('2026-08-30T11:30:00Z') };
  assert.equal(latestRateLimits([readCodexSession(CODEX_ROLLOUT)], window).limits.primary.used_percent, 8);
});

test('a decreasing cumulative counter is read as a restart, not as negative usage', () => {
  const delta = deltaTokens({ total: 40, input: 30, output: 10 }, { total: 900, input: 800, output: 100 }, ['total', 'input', 'output']);
  assert.deepEqual(delta, { total: 40, input: 30, output: 10 });
});

test('the same session id in both trees is counted once, richest file winning', () => {
  const thin = { sessionId: 'a', snapshots: [1] };
  const full = { sessionId: 'a', snapshots: [1, 2, 3] };
  assert.deepEqual(dedupeCodexSessions([thin, full, { sessionId: 'b', snapshots: [] }]).map((s) => s.snapshots.length), [3, 0]);
});

// ── Claude Code ──────────────────────────────────────────────────────────────────────────────────

test('a Claude transcript yields one row per usage record, duplicates included', () => {
  const { rows, malformed } = readClaudeRows(CLAUDE_TRANSCRIPT, { file: 's1.jsonl' });
  assert.equal(malformed, 1);
  // req_A three times, req_C, req_D. The user record and the assistant record with no usage are
  // not rows at all.
  assert.equal(rows.length, 5);
  assert.equal(rows.filter((row) => row.key === 'msg_A|req_A').length, 3);
});

test('deduping is what stops the answer being several times too big', () => {
  const { rows } = readClaudeRows(CLAUDE_TRANSCRIPT, { file: 's1.jsonl' });
  const raw = rows.reduce((sum, row) => sum + row.tokens.total, 0);
  const deduped = dedupeClaudeRows(rows);
  assert.equal(deduped.length, 3);
  // req_A is 1032 tokens written three times; req_C is 62 and req_D is 10.
  assert.equal(raw, 3168);
  assert.equal(deduped.reduce((sum, row) => sum + row.tokens.total, 0), 1104);
});

test('a request copied into a resumed session is deduped ACROSS files', () => {
  const first = readClaudeRows(CLAUDE_TRANSCRIPT, { file: 's1.jsonl' }).rows;
  const second = readClaudeRows(CLAUDE_TRANSCRIPT_RESUMED, { file: 's2.jsonl' }).rows;
  const deduped = dedupeClaudeRows([...first, ...second]);
  assert.equal(deduped.filter((row) => row.key === 'msg_A|req_A').length, 1);
  // Kept in the session that made it, which is the earlier sighting.
  assert.equal(deduped.find((row) => row.key === 'msg_A|req_A').sessionId, 's1');
  assert.equal(deduped.length, 4);
});

test('a record with neither message id nor requestId is never merged with another', () => {
  const text = [
    '{"type":"assistant","timestamp":"2026-08-30T10:00:00.000Z","message":{"usage":{"input_tokens":1,"output_tokens":1}}}',
    '{"type":"assistant","timestamp":"2026-08-30T10:00:01.000Z","message":{"usage":{"input_tokens":1,"output_tokens":1}}}',
  ].join('\n');
  const { rows } = readClaudeRows(text, { file: 'x.jsonl' });
  assert.equal(dedupeClaudeRows(rows).length, 2);
});

test('the four token kinds are read straight through and summed into a total', () => {
  const row = dedupeClaudeRows(readClaudeRows(CLAUDE_TRANSCRIPT).rows).find((entry) => entry.key === 'msg_A|req_A');
  assert.deepEqual(row.tokens, { input: 2, cacheWrite: 100, cacheRead: 900, output: 30, total: 1032 });
});

test('subagent records are counted, and marked as subagent work', () => {
  const rows = dedupeClaudeRows(readClaudeRows(CLAUDE_TRANSCRIPT).rows);
  assert.equal(rows.filter((row) => row.sidechain).length, 1);
  assert.equal(rows.find((row) => row.sidechain).model, 'claude-fable-5');
});

test('rows are windowed by their own timestamp', () => {
  const rows = dedupeClaudeRows(readClaudeRows(CLAUDE_TRANSCRIPT).rows);
  const kept = inWindow(rows, { since: at('2026-08-30T10:30:00Z'), until: at('2026-08-30T12:00:00Z') });
  assert.deepEqual(kept.map((row) => row.key), ['msg_C|req_C']);
});

test('a session that cds mid-run is ONE project row, under the cwd it started in', () => {
  const text = [
    '{"type":"assistant","requestId":"r1","timestamp":"2026-08-30T10:00:00.000Z","sessionId":"s","cwd":"C:\\\\wt","message":{"id":"m1","usage":{"input_tokens":1,"output_tokens":1}}}',
    '{"type":"assistant","requestId":"r2","timestamp":"2026-08-30T10:01:00.000Z","sessionId":"s","cwd":"C:\\\\wt\\\\docs","message":{"id":"m2","usage":{"input_tokens":1,"output_tokens":1}}}',
  ].join('\n');
  const rows = readClaudeRows(text, { file: 'C:\\projects\\encoded\\s.jsonl' }).rows;
  assert.equal(groupRows(rows, (row) => row.project, CLAUDE_KINDS).length, 2, 'unattributed rows split - this is the bug');
  const grouped = groupRows(attributeProjects(rows), (row) => row.project, CLAUDE_KINDS);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].key, 'C:\\wt');
  assert.equal(grouped[0].requests, 2);
});

test('two agents of one wave are two sessions, even though they share a sessionId', () => {
  // Every agent a wave launches writes its own transcript under the PARENT session's directory,
  // and every record in it carries the parent's sessionId. Counting sessionIds reports a wave of
  // six agents as one session, in one worktree, which is the opposite of what the meter is for.
  const record = (file, cwd) => readClaudeRows(
    `{"type":"assistant","requestId":"r-${cwd}","timestamp":"2026-08-30T10:00:00.000Z","sessionId":"parent","cwd":"${cwd}","message":{"id":"m-${cwd}","usage":{"input_tokens":1,"output_tokens":1}}}`,
    { file },
  ).rows;
  const rows = attributeProjects([
    ...record('C:\\p\\parent\\subagents\\agent-one.jsonl', 'A'),
    ...record('C:\\p\\parent\\subagents\\agent-two.jsonl', 'B'),
  ]);
  assert.equal(new Set(rows.map((row) => row.sessionId)).size, 1, 'the sessionId really is shared');
  assert.equal(new Set(rows.map((row) => row.session)).size, 2);
  const grouped = groupRows(rows, (row) => row.project, CLAUDE_KINDS);
  assert.deepEqual(grouped.map((bucket) => bucket.sessions.size), [1, 1]);
});

test('grouping counts distinct sessions, not requests', () => {
  const rows = dedupeClaudeRows([
    ...readClaudeRows(CLAUDE_TRANSCRIPT, { file: 's1.jsonl' }).rows,
    ...readClaudeRows(CLAUDE_TRANSCRIPT_RESUMED, { file: 's2.jsonl' }).rows,
  ]);
  const branches = groupRows(rows, (row) => row.branch, CLAUDE_KINDS);
  assert.deepEqual(branches.map((bucket) => bucket.key), ['claude/s-harness-usage', 'main']);
  assert.equal(branches[0].sessions.size, 1);
  assert.equal(branches[0].requests, 3);
  assert.equal(branches[1].tokens.total, 12);
});

// ── The window ───────────────────────────────────────────────────────────────────────────────────

const NOW = at('2026-08-30T12:00:00Z');

test('with no flags the window is the last 24 hours', () => {
  const window = resolveWindow(parseArgs([]), { now: NOW });
  assert.equal(new Date(window.since).toISOString(), '2026-08-29T12:00:00.000Z');
  assert.equal(window.until, NOW);
  assert.match(window.label, /last 24 hours/);
});

test('--hours and --since and --until are read', () => {
  assert.equal(resolveWindow(parseArgs(['--hours', '5']), { now: NOW }).since, NOW - 5 * 3_600_000);
  assert.equal(resolveWindow(parseArgs(['--since', '2026-08-01T00:00:00Z']), { now: NOW }).since, at('2026-08-01T00:00:00Z'));
  assert.equal(resolveWindow(parseArgs(['--until', '2026-08-02T00:00:00Z']), { now: NOW }).until, at('2026-08-02T00:00:00Z'));
});

test('--since wins over --wave and --hours, so an explicit answer is never overridden', () => {
  const window = resolveWindow(parseArgs(['--since', '2026-08-01T00:00:00Z', '--wave', '--hours', '3']), { now: NOW, wavePlan: { name: 'w.md', mtimeMs: 1 } });
  assert.equal(window.since, at('2026-08-01T00:00:00Z'));
});

test('--wave uses the wave plan mtime, and says so when there is no plan', () => {
  const window = resolveWindow(parseArgs(['--wave']), { now: NOW, wavePlan: { name: 'two-waves-wave-plan.local.md', mtimeMs: at('2026-08-30T08:00:00Z') } });
  assert.equal(window.since, at('2026-08-30T08:00:00Z'));
  assert.match(window.label, /two-waves-wave-plan\.local\.md/);
  assert.throws(() => resolveWindow(parseArgs(['--wave']), { now: NOW }), /wave-plan.*local\.md/);
});

test('a bad date and an unknown flag are refused rather than silently defaulted', () => {
  assert.throws(() => resolveWindow(parseArgs(['--since', 'yesterday']), { now: NOW }), /not a date/);
  assert.throws(() => resolveWindow(parseArgs(['--hours', '-2']), { now: NOW }), /positive/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('the newest wave plan wins, and a non-plan local handoff is not one', () => {
  const stats = { 'a-wave-plan.local.md': 10, 'b-wave-plan.local.md': 20, 'notes.local.md': 99, 'x.md': 100 };
  const plan = findWavePlan('docs/handoffs', {
    exists: () => true,
    readdir: () => Object.keys(stats),
    stat: (full) => ({ mtimeMs: stats[full.split(/[\\/]/).pop()] }),
  });
  assert.deepEqual(plan, { name: 'b-wave-plan.local.md', mtimeMs: 20 });
  assert.equal(findWavePlan('nope', { exists: () => false }), null);
});

// `--wave` reads the store now. It kept reading only `docs/handoffs/` for one commit after the
// plans moved there, which made every wave's spend section exit 2 with a message naming a
// directory that can no longer hold a plan.
test('the newest plan is found across the store and the directories plans used to live in', () => {
  const byDir = {
    store: { '2026-09-08-night-wave-plan.local.md': 50 },
    legacy: { '2026-09-09-day-wave-plan.local.md': 90, 'notes.local.md': 99 },
  };
  const options = {
    exists: (dir) => dir in byDir,
    readdir: (dir) => Object.keys(byDir[dir]),
    stat: (full) => {
      const [dir, name] = full.split(/[\\/]/);
      return { mtimeMs: byDir[dir][name] };
    },
  };
  // Newest wins ACROSS the directories, not within the first one that answers.
  assert.deepEqual(findNewestWavePlan(['store', 'legacy'], options), { name: '2026-09-09-day-wave-plan.local.md', mtimeMs: 90 });
  assert.deepEqual(findNewestWavePlan(['legacy', 'store'], options), { name: '2026-09-09-day-wave-plan.local.md', mtimeMs: 90 });
  // A null directory is what `wavePlansDir()` returns outside a checkout, and must be skipped.
  assert.deepEqual(findNewestWavePlan([null, 'store'], options), { name: '2026-09-08-night-wave-plan.local.md', mtimeMs: 50 });
  assert.equal(findNewestWavePlan([null, 'gone'], options), null);
});

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────

test('counts group in threes regardless of the machine locale', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1000), '1,000');
  assert.equal(formatCount(470149931), '470,149,931');
  assert.equal(formatCount(Number.NaN), '-');
});

test('a reset time reads as a duration, and a past one says so', () => {
  assert.equal(formatDuration(33 * 60_000), 'in 33m');
  assert.equal(formatDuration(2 * 3_600_000 + 14 * 60_000), 'in 2h 14m');
  assert.equal(formatDuration(-60_000), '1m ago');
});

test('a table pads to its widest cell and an empty one says nothing rather than printing a header', () => {
  const table = formatTable(['a', 'bb'], [['xxx', '1']], { align: ['left', 'right'] });
  assert.deepEqual(table.split('\n'), ['  a    bb', '  ---  --', '  xxx   1']);
  assert.equal(formatTable(['a'], []), '  (nothing)');
});

test('rows past the cut collapse into one row that still carries their tokens', () => {
  const buckets = groupRows(
    ['a', 'b', 'c'].map((key, index) => ({
      branch: key, session: key, tokens: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: (index + 1) * 10 },
    })),
    (row) => row.branch,
    CLAUDE_KINDS,
  );
  const { shown, rest } = collapse(buckets, 1, CLAUDE_KINDS);
  assert.deepEqual(shown.map((bucket) => bucket.key), ['c']);
  assert.equal(rest.key, '(2 more)');
  assert.equal(rest.tokens.total, 30);
  assert.equal(rest.sessions.size, 2);
  assert.deepEqual(collapse(buckets, 9, CLAUDE_KINDS).rest, null);
});

test('the three harnesses do not share a token vocabulary, and none borrows another', () => {
  assert.ok(CODEX_KINDS.includes('cachedInput') && !CODEX_KINDS.includes('cacheRead'));
  assert.ok(CLAUDE_KINDS.includes('cacheRead') && !CLAUDE_KINDS.includes('cachedInput'));
  assert.ok(AGY_KINDS.includes('thinking') && !CODEX_KINDS.includes('thinking'));
});

// ── Antigravity ──────────────────────────────────────────────────────────────────────────────────
//
// The ledger is the one source here that this repo WRITES, which changes what can go wrong with
// it. A transcript reader can only misread; a ledger reader can also be handed a line from a
// version it has never seen, and reading that with today's assumptions is how a format change
// turns into a wrong bill. The cases below are the ways a ledger misleads: a call that failed and
// still cost money, a call nobody can attribute, a newer version, and the fact that its four
// counts do not add up to anything at all.

test('Antigravity has no `total` kind, because agy\'s own total leaves out two of its four counts', () => {
  assert.equal(AGY_KINDS.includes('total'), false);
  assert.deepEqual(AGY_KINDS, ['input', 'output', 'thinking', 'cacheRead']);
});

test('a ledger yields its calls in time order, skipping the half-written last line', () => {
  const { calls, malformed } = readAgyLedger(AGY_LEDGER);
  assert.equal(malformed, 1);
  assert.deepEqual(
    calls.map((call) => call.at),
    [
      '2026-08-30T10:00:00.000Z',
      '2026-08-30T10:30:00.000Z',
      '2026-08-30T11:00:00.000Z',
      '2026-08-30T11:30:00.000Z',
      '2026-08-30T12:00:00.000Z',
    ].map(at),
  );
});

test('an empty ledger is zero calls, not an error and not a malformed line', () => {
  assert.deepEqual(readAgyLedger(''), { calls: [], malformed: 0, unknownVersion: 0 });
  assert.deepEqual(readAgyLedger('\n\n   \n'), { calls: [], malformed: 0, unknownVersion: 0 });
});

test('a FAILED call is still counted - a denied run spends its input tokens anyway', () => {
  const denied = readAgyLedger(AGY_LEDGER).calls.find((call) => call.label === 'denied');
  assert.equal(denied.ok, false);
  assert.equal(denied.tokens.input, 18000);
  assert.equal(denied.tokens.output, 0);
});

test('a line from a newer ledger version is counted and excluded, never read with old assumptions', () => {
  const { calls, unknownVersion } = readAgyLedger(AGY_LEDGER);
  assert.equal(unknownVersion, 1);
  assert.equal(calls.some((call) => call.tokens.input === 999999), false);
});

test('a call that pinned no model is named as unattributable rather than lumped in somewhere', () => {
  const calls = readAgyLedger(AGY_LEDGER).calls.filter((call) => call.model === '(model not pinned)');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tokens.input, 900);
});

test('a line with no usage object reads as zeros, never NaN', () => {
  const bare = readAgyLedger(AGY_LEDGER).calls.find((call) => call.durationSeconds === 1);
  assert.deepEqual(bare.tokens, { input: 0, output: 0, thinking: 0, cacheRead: 0 });
  assert.equal(bare.turns, 0);
});

test('calls group by model, count their failures, and sort by input rather than by any total', () => {
  const buckets = groupAgyCalls(readAgyLedger(AGY_LEDGER).calls);
  assert.deepEqual(buckets.map((bucket) => bucket.key), ['gemini-3.1-pro-high', 'gemini-3.1-flash', '(model not pinned)']);
  const [pro, flash] = buckets;
  assert.equal(pro.calls, 2);
  assert.equal(pro.failed, 0);
  assert.deepEqual(pro.tokens, { input: 177800, output: 10631, thinking: 7129, cacheRead: 1150000 });
  assert.equal(Math.round(pro.seconds), 101);
  assert.equal(flash.calls, 2);
  assert.equal(flash.failed, 1);
});

test('a window keeps only the calls made inside it', () => {
  const calls = readAgyLedger(AGY_LEDGER).calls;
  const window = { since: at('2026-08-30T10:45:00Z'), until: at('2026-08-30T11:45:00Z') };
  assert.deepEqual(inWindow(calls, window).map((call) => call.model), ['gemini-3.1-flash', '(model not pinned)']);
});

// The WRITER's half of the same feature. It is tested here rather than in a file of its own
// because the ledger has exactly one writer and one reader and they are useless apart - and
// because what is pinned below is the reason any of this exists: `agy` reports SUCCESS, exit code
// 0 and an empty response for a run that produced nothing, and one such run on this machine spent
// 202 K input and 1.56 M cache-read tokens before being cut off at its default timeout. A meter
// that recorded that as a success would be reporting the opposite of the truth.

test('an empty response is a FAILURE, however cheerfully agy reports it', () => {
  const denied = classifyResult({ status: 'SUCCESS', response: '' }, { elapsedSeconds: 46 });
  assert.equal(denied.ok, false);
  assert.equal(denied.timedOut, false);
  assert.match(denied.failure, /auto-denied/);
  assert.equal(classifyResult({ status: 'SUCCESS', response: '   ' }, { elapsedSeconds: 3 }).ok, false);
});

test('a run cut off at its own --print-timeout is diagnosed as a timeout, not as a denial', () => {
  const timedOut = classifyResult({ status: 'SUCCESS', response: '' }, { elapsedSeconds: 299.8, timeoutSeconds: 300 });
  assert.equal(timedOut.timedOut, true);
  assert.match(timedOut.failure, /--print-timeout/);
  // The boundary is a heuristic, so the other cause is always named too.
  assert.match(timedOut.failure, /auto-denied/);
});

test('a real answer passes, and a non-SUCCESS status does not', () => {
  assert.deepEqual(classifyResult({ status: 'SUCCESS', response: 'READY' }, { elapsedSeconds: 4 }), { ok: true, failure: null });
  assert.equal(classifyResult({ status: 'ERROR', response: 'partial' }, { elapsedSeconds: 4 }).ok, false);
  assert.equal(classifyResult(null).ok, false);
});

test('a REPORTED error keeps its own message instead of being guessed at as a permission problem', () => {
  // An errored run has an empty response too, so guessing from the response first would answer
  // "fix your allow list" to a quota failure and discard the one true sentence agy produced.
  const errored = classifyResult({ status: 'ERROR', error: 'quota exhausted', response: '' }, { elapsedSeconds: 3 });
  assert.equal(errored.ok, false);
  assert.match(errored.failure, /status ERROR - quota exhausted/);
  assert.doesNotMatch(errored.failure, /auto-denied/);
});

test('the receipt survives noise printed around it, because losing it records a paid call as free', () => {
  const receipt = { status: 'SUCCESS', response: 'hi', usage: { input_tokens: 200000 } };
  const json = JSON.stringify(receipt);
  assert.deepEqual(parseAgyStdout(json), receipt);
  assert.deepEqual(parseAgyStdout(`warning: stale cache\n${json}`), receipt);
  assert.deepEqual(parseAgyStdout(`${json}\ndone.`), receipt);
  assert.deepEqual(parseAgyStdout(`warning\n${json}\ndone.`), receipt);
  assert.equal(parseAgyStdout(''), null);
  assert.equal(parseAgyStdout('no json here at all'), null);
  // Even a warning line carrying a stray brace does not cost the receipt.
  assert.deepEqual(parseAgyStdout(`warn: {unfinished\n${json}`), receipt);
});

test('a prompt too long for a command line is refused with a reason, not an opaque spawn error', () => {
  const written = [];
  const real = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  let code;
  try {
    code = agyMain(['--model', 'gemini-3.1-pro-high', 'x'.repeat(MAX_PROMPT_CHARS + 1)]);
  } finally {
    process.stderr.write = real;
  }
  assert.equal(code, 2);
  assert.match(written.join(''), /passed to agy as a single command-line argument/);
});

test('agy\'s duration grammar is read, and anything unreadable falls back rather than becoming NaN', () => {
  assert.equal(parseDuration('5m', 0), 300);
  assert.equal(parseDuration('90s', 0), 90);
  assert.equal(parseDuration('1h30m', 0), 5400);
  assert.equal(parseDuration('300', 0), 300);
  assert.equal(parseDuration(null, DEFAULT_PRINT_TIMEOUT_SECONDS), 300);
  assert.equal(parseDuration('whenever', 42), 42);
  // Zero would make `elapsed >= timeout - 5` true for every run, so every empty response would be
  // called a timeout - including the denials, which need the opposite fix.
  assert.equal(parseDuration('0', 300), 300);
  assert.equal(parseDuration('0s', 300), 300);
  assert.equal(
    classifyResult({ status: 'SUCCESS', response: '' }, { elapsedSeconds: 2, timeoutSeconds: parseDuration('0', 300) }).timedOut,
    false,
  );
});

test('a pinned model is required, and the permission-skipping flag is refused rather than forwarded', () => {
  assert.equal(agyParseArgs(['--model', 'gemini-3.1-pro-high', 'hello']).model, 'gemini-3.1-pro-high');
  assert.equal(agyParseArgs(['hello']).model, null);
  assert.throws(() => agyParseArgs(['--dangerously-skip-permissions']), /capability, not an instruction/);
  assert.throws(() => agyParseArgs(['one', 'two']), /expected one prompt/);
});

test('the installed version is asked, and a harness that cannot answer is a routing fact', () => {
  assert.equal(parseVersion('2.1.251 (Claude Code)'), '2.1.251');
  assert.equal(parseVersion('codex-cli 0.153.0-alpha.5.1'), '0.153.0-alpha.5.1');
  assert.equal(parseVersion('\n\n1.1.25\n'), '1.1.25');
  assert.equal(parseVersion('no numbers here'), null);
  assert.equal(parseVersion(undefined), null);

  const rows = harnessVersions({
    probes: [
      { pool: 'Present', command: 'a' },
      { pool: 'Missing', command: 'b' },
      { pool: 'Mute', command: 'c' },
      { pool: 'Exploding', command: 'd' },
    ],
    run: (command) => {
      if (command === 'a') return { status: 0, stdout: '9.9.9 (thing)' };
      if (command === 'b') return { status: 1, stdout: '' };
      if (command === 'c') return { status: 0, stdout: 'hello' };
      throw new Error('spawn failed');
    },
  });
  assert.deepEqual(rows[0], { pool: 'Present', version: '9.9.9', why: null });
  assert.equal(rows[1].version, null);
  assert.match(rows[1].why, /not installed/);
  assert.match(rows[2].why, /without a version number/);
  assert.match(rows[3].why, /could not be asked \(spawn failed\)/);

  // Every row prints, because "this pool has no binary" is exactly what a plan needs to read.
  const lines = versionLines(rows);
  assert.equal(lines.length, 5);
  assert.match(lines[0], /never cached in a doc/);
  assert.match(lines[2], /Missing\s+-\s+not installed/);
});

test('a write is refused anywhere its blast radius is shared, and nowhere else', () => {
  const ok = { worktree: 'linked', branch: 'claude/a-thing', cwd: '/repo/wt/a' };
  assert.equal(writeScopeRefusal(ok), null, 'a linked worktree on a feature branch is the whole point');

  // The landing queue rewrites the primary checkout during every integration, so a delegate
  // writing there can lose work that is not its own.
  assert.match(writeScopeRefusal({ ...ok, worktree: 'primary' }), /primary checkout/);
  assert.match(writeScopeRefusal({ ...ok, worktree: 'primary' }), /landing queue/);

  // Outside a repository there is no scope at all.
  assert.match(writeScopeRefusal({ ...ok, worktree: null }), /not inside one/);

  // Both halves of "it lands the way everything else does".
  assert.match(writeScopeRefusal({ ...ok, branch: null }), /detached HEAD/);
  assert.match(writeScopeRefusal({ ...ok, branch: 'main' }), /refuses the branch `main`/);
});

test('a write run reports the paths it touched, and says so when it cannot', () => {
  const before = ' M src/a.ts\n?? notes.md\n';
  // A file newly modified, one whose status changed, one that went away, one untouched.
  const after = ' M src/a.ts\nA  notes.md\n M src/b.ts\n';
  assert.deepEqual(changedPaths(before, after), ['notes.md', 'src/b.ts']);
  assert.deepEqual(changedPaths(before, before), [], 'an unchanged tree is an empty list, not null');
  assert.deepEqual(changedPaths('', ' M src/a.ts\n'), ['src/a.ts']);
  assert.deepEqual(changedPaths(' M src/a.ts\n', ''), ['src/a.ts'], 'a file that stopped being dirty still changed');

  // A failed git call must never read as "the delegate wrote nothing".
  assert.equal(changedPaths(null, after), null);
  assert.equal(changedPaths(before, null), null);
});

test('a launcher is never preferred to a real executable, whatever PATH order says', () => {
  const env = { PATH: 'C:\\shim;C:\\real', LOCALAPPDATA: '' };
  const exists = (candidate) => candidate === 'C:\\shim\\agy.cmd' || candidate === 'C:\\real\\agy.exe';
  // Directory order would pick the .cmd, and running that needs a shell - which re-splits the
  // prompt on spaces. Extension order is what stops a multi-word prompt arriving in pieces.
  // The Windows paths are built with the Windows joiner on ANY host, which is what makes this
  // case mean the same thing on the laptop it describes and on a Linux CI runner.
  assert.equal(resolveAgy({ env, platform: 'win32', exists }), 'C:\\real\\agy.exe');
  assert.equal(resolveAgy({ env: { AGY_BIN: '/opt/agy' }, platform: 'linux', exists: () => true }), '/opt/agy');
  assert.equal(
    resolveAgy({ env: { PATH: '/usr/bin:/opt/bin' }, platform: 'linux', exists: (c) => c === '/opt/bin/agy' }),
    '/opt/bin/agy',
  );
});

test('the ledger the writer targets is the one the reader looks for', () => {
  assert.equal(ledgerPath({ env: {}, home: '/home/x' }), path.join('/home/x', '.noacg', 'agy-usage.jsonl'));
  assert.equal(ledgerPath({ env: { NOACG_AGY_LEDGER: '/tmp/l.jsonl' }, home: '/home/x' }), '/tmp/l.jsonl');
  // The reader must not keep its own copy of either. A drifted path does not fail - it reports
  // "no ledger, nothing to read", which a reader takes to mean the harness cost nothing.
  assert.equal(AGY_LEDGER_VERSION, LEDGER_VERSION);
});

test('a dated-wrong line is an unreadable LINE, not a version this build is too old for', () => {
  const undated = '{"v":1,"at":"not a date","model":"m","ok":true,"usage":{"input":1}}';
  const read = readAgyLedger(undated);
  assert.equal(read.calls.length, 0);
  assert.equal(read.malformed, 1);
  // Counting it as a version gap would send its reader hunting for a format bump that never was.
  assert.equal(read.unknownVersion, 0);
});

test('a ledger line keeps the four counts apart and stores no prompt or response text', () => {
  const record = ledgerRecord({
    args: { model: 'gemini-3.1-pro-high', effort: null, label: 'x', prompt: 'a question' },
    result: { conversation_id: 'c1', status: 'SUCCESS', response: 'an answer', duration_seconds: 4.5, num_turns: 1, usage: { input_tokens: 10, output_tokens: 2, thinking_tokens: 3, cache_read_tokens: 4 } },
    verdict: { ok: true, failure: null },
    at: at('2026-08-30T10:00:00Z'),
    cwd: 'C:\\w',
    branch: 'claude/x',
    exitCode: 0,
    durationMs: 4600,
  });
  assert.equal(record.v, AGY_LEDGER_VERSION);
  assert.deepEqual(record.usage, { input: 10, output: 2, thinking: 3, cacheRead: 4 });
  assert.equal(record.durationSeconds, 4.5);
  assert.deepEqual([record.promptChars, record.responseChars], [10, 9]);
  assert.equal(JSON.stringify(record).includes('a question'), false);
  assert.equal(JSON.stringify(record).includes('an answer'), false);
});

test('a call that died before printing anything still records its real wall clock and zero tokens', () => {
  const record = ledgerRecord({
    args: { model: 'gemini-3.1-flash', effort: null, label: null, prompt: 'q' },
    result: null,
    verdict: { ok: false, failure: 'agy printed no JSON result object on stdout.' },
    at: at('2026-08-30T10:00:00Z'),
    cwd: 'C:\\w',
    branch: null,
    exitCode: 1,
    durationMs: 2500,
  });
  assert.equal(record.durationSeconds, 2.5);
  assert.equal(record.turns, null);
  assert.deepEqual(record.usage, { input: 0, output: 0, thinking: 0, cacheRead: 0 });
  // And the reader must take it back as a failed call rather than dropping it.
  const { calls } = readAgyLedger(JSON.stringify(record));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ok, false);
});

test('a long gap wraps into an aligned bullet rather than one unreadable line', () => {
  assert.deepEqual(bullet('one two three four', { width: 12 }), ['    - one two', '      three four']);
  assert.deepEqual(bullet('short'), ['    - short']);
});

test('wall clock keeps its seconds, because time inside a harness is a stopwatch', () => {
  assert.equal(formatWallClock(4.328), '4.3s');
  assert.equal(formatWallClock(42.4), '42s');
  // Rounding after picking the unit prints "60s" here, which is not a thing.
  assert.equal(formatWallClock(59.7), '1m 0s');
  assert.equal(formatWallClock(99), '1m 39s');
  assert.equal(formatWallClock(3 * 3600 + 4 * 60), '3h 4m');
  assert.equal(formatWallClock(Number.NaN), '-');
});

// ── 2026-09-01: the read-only posture, the label refusal, and pool attribution ───────────────────

test('a call without --write runs in --mode plan; --write omits the mode flag entirely', async () => {
  const { buildAgyArgs, parseArgs } = await import('./agy-run.mjs');
  const readOnly = buildAgyArgs(parseArgs(['--model', 'gemini-3.7-flash-high', '--label', 'x', 'q']));
  assert.deepEqual(readOnly.slice(-2), ['--mode', 'plan']);
  const writing = buildAgyArgs(parseArgs(['--model', 'gemini-3.7-flash-high', '--label', 'x', '--write', 'q']));
  assert.equal(writing.includes('--mode'), false);
});

test('the pool is derived from the model family, and an unknown family is not guessed into one', async () => {
  const { poolForModel } = await import('./agy-run.mjs');
  assert.equal(poolForModel('gemini-3.7-flash-high'), 'antigravity-gemini');
  assert.equal(poolForModel('claude-sonnet-4-6'), 'antigravity-claude-gpt');
  assert.equal(poolForModel('claude-opus-4-6-thinking'), 'antigravity-claude-gpt');
  assert.equal(poolForModel('gpt-oss-120b-medium'), 'antigravity-claude-gpt');
  assert.equal(poolForModel('mystery-model'), 'antigravity-other');
  assert.equal(poolForModel(null), 'antigravity-other');
});

test('a ledger line carries pool and write, additively, without a version bump', () => {
  const record = ledgerRecord({
    args: { model: 'claude-sonnet-4-6', effort: null, label: 'pool-b-trial', prompt: 'q', write: true },
    result: { status: 'SUCCESS', response: 'a', usage: { input_tokens: 1, output_tokens: 1, thinking_tokens: 0, cache_read_tokens: 0 } },
    verdict: { ok: true, failure: null },
    at: at('2026-09-01T10:00:00Z'),
    cwd: 'C:\\w',
    branch: 'claude/x',
    exitCode: 0,
    durationMs: 1000,
  });
  assert.equal(record.v, AGY_LEDGER_VERSION);
  assert.equal(record.pool, 'antigravity-claude-gpt');
  assert.equal(record.write, true);
  // And the reader still takes the line - additive fields never bump the version.
  const { calls, unknownVersion } = readAgyLedger(JSON.stringify(record));
  assert.equal(calls.length, 1);
  assert.equal(unknownVersion, 0);
});

test('parseArgs takes --write as a flag, not as a value-eating option', async () => {
  const { parseArgs: parse } = await import('./agy-run.mjs');
  const args = parse(['--write', '--model', 'm', '--label', 'l', 'the prompt']);
  assert.equal(args.write, true);
  assert.equal(args.prompt, 'the prompt');
});

test('main refuses an unlabelled call before spending anything', async () => {
  const { main: agyMain } = await import('./agy-run.mjs');
  const write = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  try {
    const code = agyMain(['--model', 'gemini-3.7-flash-high', 'a question']);
    assert.equal(code, 2);
    assert.match(stderr, /--label is required/);
  } finally {
    process.stderr.write = write;
  }
});

// ── The delegation-outcome ledger: writer validation and reader discipline ───────────────────────

test('an outcome record derives its pool from harness and model, and an explicit pool wins', async () => {
  const { outcomeRecord } = await import('./delegation-outcome.mjs');
  const base = { taskClass: 'bulk-edit', model: 'gemini-3.7-flash-high', firstPass: 'yes' };
  assert.equal(outcomeRecord({ ...base, harness: 'antigravity' }).pool, 'antigravity-gemini');
  assert.equal(outcomeRecord({ ...base, harness: 'antigravity', model: 'claude-sonnet-4-6' }).pool, 'antigravity-claude-gpt');
  assert.equal(outcomeRecord({ ...base, harness: 'codex', model: 'gpt-5.6-sol' }).pool, 'codex');
  assert.equal(outcomeRecord({ ...base, harness: 'claude', model: 'opus' }).pool, 'claude-max');
  assert.equal(outcomeRecord({ ...base, harness: 'codex', model: 'gpt-5.6-sol', pool: 'custom' }).pool, 'custom');
});

test('an outcome record refuses what routing cannot use', async () => {
  const { outcomeRecord } = await import('./delegation-outcome.mjs');
  assert.throws(() => outcomeRecord({ harness: 'codex', model: 'm', firstPass: 'yes' }), /--task-class is required/);
  assert.throws(() => outcomeRecord({ taskClass: 't', harness: 'gemini-cli', model: 'm', firstPass: 'yes' }), /--harness must be one of/);
  assert.throws(() => outcomeRecord({ taskClass: 't', harness: 'codex', model: 'm', outcome: 'ok' }), /--outcome must be one of/);
  assert.throws(() => outcomeRecord({ taskClass: 't', harness: 'codex', model: 'm', firstPass: 'yes', defects: '-1' }), /non-negative/);
  assert.throws(() => outcomeRecord({ taskClass: 't', harness: 'codex', model: 'm', firstPass: 'yes', usage: '[1]' }), /JSON object/);
});

// The point of the vocabulary: "--first-pass no" used to mean "never ran", "someone else fixed it"
// and "review found a typo" interchangeably, and all three were on the real ledger. It is the one
// value that must now fail rather than record an ambiguity.
test('the outcome vocabulary refuses the value that used to mean three things', async () => {
  const { outcomeRecord, resolveVerdict } = await import('./delegation-outcome.mjs');
  const base = { taskClass: 't', harness: 'codex', model: 'm' };
  assert.throws(() => outcomeRecord({ ...base, firstPass: 'no' }), /no longer accepted/);
  assert.throws(() => outcomeRecord({ ...base }), /--outcome is required/);
  assert.throws(() => outcomeRecord({ ...base, outcome: 'clean', firstPass: 'yes' }), /not both/);
  // Every non-clean outcome must say who it is evidence about, and clean must not pretend to.
  assert.throws(() => outcomeRecord({ ...base, outcome: 'repaired' }), /needs --cause/);
  assert.throws(() => outcomeRecord({ ...base, outcome: 'unusable', cause: 'vibes' }), /needs --cause/);
  assert.throws(() => outcomeRecord({ ...base, outcome: 'clean', cause: 'worker' }), /nothing went wrong/);
  // `reviewed` is a pass, so it needs nobody to blame - but may still name one.
  assert.equal(outcomeRecord({ ...base, outcome: 'reviewed' }).cause, null);
  assert.deepEqual(resolveVerdict({ firstPass: 'yes' }), { outcome: 'clean', cause: null });
  assert.deepEqual(resolveVerdict({ outcome: 'Reviewed', cause: 'Worker' }), { outcome: 'reviewed', cause: 'worker' });
  assert.equal(outcomeRecord({ ...base, outcome: 'reviewed', cause: 'worker' }).firstPass, false);
  assert.equal(outcomeRecord({ ...base, firstPass: 'yes' }).outcome, 'clean');
});

// The reader must never resolve a legacy false into one of the three new values - that would be
// inventing evidence about a pool from a field that carried none.
test('legacy lines resolve to clean or to nothing at all, never to a guess', async () => {
  const { readOutcomesLedger, workerQuality } = await import('./harness-usage.mjs');
  const line = (extra) => JSON.stringify({
    v: 1, at: '2026-09-01T10:00:00Z', taskClass: 'c', harness: 'codex', model: 'm', ...extra,
  });
  const { rows } = readOutcomesLedger([
    line({ firstPass: true }),
    line({ firstPass: false, redoneBy: 'opus', defects: 3 }),
    line({ firstPass: false, outcome: 'repaired', cause: 'prompt', redoneBy: 'opus' }),
  ].join('\n'));
  assert.deepEqual(rows.map((row) => row.outcome), ['clean', null, 'repaired']);
  const quality = workerQuality(rows);
  // One clean row is attributable; the undecidable legacy row and the prompt-caused row are not.
  assert.deepEqual(
    [quality.accepted, quality.attributable, quality.excludedOurs, quality.unclassified],
    [1, 1, 1, 1],
  );
});

// The writer's header documents this backfill; before it existed the second line double-counted
// the task, and the `landed` column read 0 for work that had in fact landed.
test('a second line with the same label backfills one task instead of minting another', async () => {
  const { readOutcomesLedger } = await import('./harness-usage.mjs');
  const line = (at, extra) => JSON.stringify({
    v: 1, at, taskClass: 'c', harness: 'codex', model: 'm', outcome: 'clean', label: 'row-q', ...extra,
  });
  const { rows } = readOutcomesLedger([
    line('2026-09-01T10:00:00Z'),
    line('2026-09-02T10:00:00Z', { landedSha: 'abc1234' }),
    JSON.stringify({ v: 1, at: '2026-09-01T10:00:00Z', taskClass: 'c', harness: 'codex', model: 'm', outcome: 'clean' }),
    JSON.stringify({ v: 1, at: '2026-09-01T10:00:00Z', taskClass: 'c', harness: 'codex', model: 'm', outcome: 'clean' }),
  ].join('\n'));
  assert.equal(rows.length, 3, 'the labelled pair is one task; the two unlabelled lines stay separate');
  const [merged] = rows;
  assert.equal(merged.landed, true);
  // The first line's timestamp survives, so a late backfill cannot drag the task into today's window.
  assert.equal(new Date(merged.at).toISOString(), '2026-09-01T10:00:00.000Z');
});

// `--label` is documented as a back-reference to whatever paid for the work, not as a task id, so
// two honest rows may reuse one. Keyed on the label alone the older task is deleted outright and
// the newer one is redated into a window it did not happen in.
test('two different tasks that reuse one label are not collapsed into each other', async () => {
  const { readOutcomesLedger } = await import('./harness-usage.mjs');
  const line = (at, extra) => JSON.stringify({
    v: 1, at, label: 'row G', outcome: 'clean', ...extra,
  });
  const { rows } = readOutcomesLedger([
    line('2026-09-01T10:00:00Z', { taskClass: 'doc-sweep', harness: 'antigravity', model: 'gemini-3.7' }),
    line('2026-09-05T10:00:00Z', { taskClass: 'bug-fix', harness: 'codex', model: 'gpt-5.6' }),
    line('2026-09-06T10:00:00Z', { taskClass: 'doc-sweep', harness: 'antigravity', model: 'gemini-3.7', landedSha: 'abc' }),
  ].join('\n'));
  assert.equal(rows.length, 2, 'same label, different work - only the matching pair merges');
  assert.deepEqual(rows.map((row) => row.taskClass), ['doc-sweep', 'bug-fix']);
  assert.equal(rows[0].landed, true, 'the real backfill still lands its task');
});

// The backfill the writer documents restates only the required flags, so a merge that let the
// later line win outright would zero the counts that are the whole point of the ledger.
test('a backfill cannot zero the evidence the first line recorded', async () => {
  const { readOutcomesLedger } = await import('./harness-usage.mjs');
  const line = (at, extra) => JSON.stringify({
    v: 1, at, taskClass: 'fixture-generation', harness: 'antigravity', model: 'gemini-3.7',
    label: 'q-a2', outcome: 'repaired', cause: 'worker', ...extra,
  });
  const { rows } = readOutcomesLedger([
    line('2026-09-02T06:00:00Z', { defects: 4, retries: 1, redoneBy: 'claude-opus-5' }),
    line('2026-09-02T20:00:00Z', { landedSha: 'ef6f6c40' }),
  ].join('\n'));
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].defects, rows[0].retries, rows[0].redone, rows[0].landed],
    [4, 1, true, true],
  );
});

// A pass that cost us a wasted call is still a pass. Counting it out of the rate would let one row
// be accepted in the tally and absent from the denominator at the same time.
test('an accepted row stays in the rate even when a prompt defect preceded it', async () => {
  const { readOutcomesLedger, workerQuality } = await import('./harness-usage.mjs');
  const line = (extra) => JSON.stringify({
    v: 1, at: '2026-09-03T10:00:00Z', taskClass: 'c', harness: 'antigravity', model: 'gemini-3.7', ...extra,
  });
  const { rows } = readOutcomesLedger([
    line({ outcome: 'reviewed', cause: 'prompt', label: 'a' }),
    line({ outcome: 'unusable', cause: 'prompt', label: 'b' }),
    line({ outcome: 'repaired', cause: 'worker', label: 'c' }),
  ].join('\n'));
  const quality = workerQuality(rows);
  assert.deepEqual(
    [quality.accepted, quality.attributable, quality.excludedOurs, quality.ours],
    // The reviewed row counts as a pass and stays in the denominator; only the failure is
    // excluded; `ours` counts both rows a prompt defect touched, because that is the cost.
    [1, 2, 1, 2],
  );
});

test('the outcomes reader excludes unknown versions and undatable lines, and groups by pool+model+class', async () => {
  const { readOutcomesLedger, groupOutcomes } = await import('./harness-usage.mjs');
  const { outcomeRecord } = await import('./delegation-outcome.mjs');
  const good = (extra) => JSON.stringify(outcomeRecord({
    taskClass: 'bulk-edit', harness: 'codex', model: 'gpt-5.6-sol', outcome: 'clean', ...extra,
  }, { at: Date.parse('2026-09-01T10:00:00Z') }));
  const text = [
    good({}),
    good({ outcome: 'repaired', cause: 'worker', defects: '2', retries: '1', redoneBy: 'opus' }),
    JSON.stringify({ v: 99, at: '2026-09-01T10:00:00Z', harness: 'codex', taskClass: 'x' }),
    JSON.stringify({ v: 1, at: 'not-a-date', harness: 'codex', taskClass: 'x' }),
    'not json at all',
  ].join('\n');
  const read = readOutcomesLedger(text);
  assert.equal(read.rows.length, 2);
  assert.equal(read.unknownVersion, 1);
  assert.equal(read.malformed, 2);
  const [bucket] = groupOutcomes(read.rows);
  assert.deepEqual(
    [bucket.pool, bucket.taskClass, bucket.tasks, bucket.accepted, bucket.repaired,
      bucket.defects, bucket.retries, bucket.redone],
    ['codex', 'bulk-edit', 2, 1, 1, 2, 1, 1],
  );
});

test('outcome main writes one line to the override path and reports where', async () => {
  const { main: outcomeMain, outcomesLedgerPath } = await import('./delegation-outcome.mjs');
  const { mkdtempSync, readFileSync: readBack, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'outcomes-'));
  const env = { NOACG_OUTCOMES_LEDGER: path.join(dir, 'ledger.jsonl') };
  const write = process.stdout.write;
  let stdout = '';
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  try {
    const code = outcomeMain(
      ['--task-class', 'doc-sweep', '--harness', 'antigravity', '--model', 'gemini-3.7-flash-high', '--first-pass', 'yes'],
      { env, at: Date.parse('2026-09-01T10:00:00Z') },
    );
    assert.equal(code, 0);
    const lines = readBack(env.NOACG_OUTCOMES_LEDGER, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).pool, 'antigravity-gemini');
    assert.match(stdout, /antigravity\/antigravity-gemini/);
    assert.equal(outcomesLedgerPath({ env }), env.NOACG_OUTCOMES_LEDGER);
  } finally {
    process.stdout.write = write;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the agy:read armor refuses a smuggled --write in code, where a pattern cannot', async () => {
  const { main: agyMain } = await import('./agy-run.mjs');
  const write = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  try {
    const code = agyMain(['--read-only', '--write', '--model', 'gemini-3.7-flash-high', '--label', 'x', 'q']);
    assert.equal(code, 2);
    assert.match(stderr, /read-only.*refuses --write/);
  } finally {
    process.stderr.write = write;
  }
});

test('the --wave window opens at the plan name\'s day, never at a heartbeat-freshened mtime', async () => {
  const { resolveWindow: resolve, parseArgs: parse } = await import('./harness-usage.mjs');
  const mtime = at('2026-08-31T03:55:00Z');
  const window = resolve(parse(['--wave']), {
    now: at('2026-08-31T04:00:00Z'),
    wavePlan: { name: '2026-08-30-wave-plan.local.md', mtimeMs: mtime },
  });
  assert.equal(window.since, Date.parse('2026-08-30T00:00:00'));
  assert.notEqual(window.since, mtime);
  assert.match(window.label, /named day/);
});
// ── The invocation preflight ─────────────────────────────────────────────────────────────────────
//
// Seven of the first eleven delegations burned a call on our own invocation. Each shape below is
// one of those, with the innocent case beside it - over-refusal is paid by every session on the
// machine, so the innocent list matters more than the guilty one.

const ROOTS = { worktree: 'C:/claude/NoaCG-Studio/.claude/worktrees/agent-a1', primary: 'C:/claude/NoaCG-Studio' };
const GRANTS = JSON.stringify({ permissions: { allow: ['read_file(*)', 'write_file(C:/claude/NoaCG-Studio/.claude/worktrees/)'] } });

test('a writing prompt launched in plan mode is a contradiction, and is refused before the spawn', () => {
  const prompt = 'TOOLS: you have read_file and write_file and NO SHELL. Rewrite the file.';
  assert.match(planModeWriteRefusal({ prompt, write: false }), /declares the `write_file` tool/);
  // The same prompt with --write is the intended shape.
  assert.equal(planModeWriteRefusal({ prompt, write: true }), null);
  // A read question that never mentions the tool is not judged - this check reads facts, not intent.
  assert.equal(planModeWriteRefusal({ prompt: 'Name every export target and its file.', write: false }), null);
  assert.equal(planModeWriteRefusal({ prompt: 'Please write a summary of the file.', write: false }), null, 'the verb "write" is prose, not the tool');
});

test('paths in another checkout are refused; paths in this worktree, and outside the repo, are not', () => {
  const own = 'Read C:/claude/NoaCG-Studio/.claude/worktrees/agent-a1/src/a.ts and C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\agent-a1\\docs\\X.md.';
  assert.deepEqual(foreignCheckoutPaths(own, ROOTS), [], 'a worktree path has the primary root as a prefix and must NOT be refused');
  assert.equal(foreignCheckoutRefusal(own, ROOTS), null);

  const main = 'Read C:/claude/NoaCG-Studio/scripts/reclaim.mjs, then the test beside it.';
  assert.deepEqual(foreignCheckoutPaths(main, ROOTS), ['C:/claude/NoaCG-Studio/scripts/reclaim.mjs']);
  assert.match(foreignCheckoutRefusal(main, ROOTS), /a checkout this call is not standing in/);

  const sibling = 'Compare against C:/claude/NoaCG-Studio/.claude/worktrees/agent-b2/src/a.ts';
  assert.equal(foreignCheckoutPaths(sibling, ROOTS).length, 1, 'another worktree is another checkout');

  const outside = 'Write the result to C:/Users/x/AppData/Local/Temp/claude/out.md and read https://example.com/a/b';
  assert.deepEqual(foreignCheckoutPaths(outside, ROOTS), [], 'the scratchpad and a URL are nobody\'s business here');

  // Trailing punctuation belongs to the sentence, not the path; case and slashes do not matter.
  assert.deepEqual(promptPaths('see c:\\CLAUDE\\NoaCG-Studio\\a.ts.'), ['c:/CLAUDE/NoaCG-Studio/a.ts']);
  assert.deepEqual(foreignCheckoutPaths('see c:\\CLAUDE\\NoaCG-Studio\\a.ts.', ROOTS), ['c:/CLAUDE/NoaCG-Studio/a.ts']);

  // An ancestor of the worktree names the checkout this run stands in, not another one: a prompt
  // saying "never write outside C:/claude/NoaCG-Studio/.claude/worktrees/" must not be refused.
  const ancestors = 'Never write outside C:/claude/NoaCG-Studio/.claude/worktrees/. The repo is C:\\claude\\NoaCG-Studio.';
  assert.deepEqual(foreignCheckoutPaths(ancestors, ROOTS), []);

  // When git cannot answer, nothing is judged - a preflight that cannot tell must not refuse.
  assert.deepEqual(foreignCheckoutPaths(main, null), []);
  // From the primary checkout itself every repo path is in scope and none is foreign.
  assert.deepEqual(foreignCheckoutPaths(main, { worktree: ROOTS.primary, primary: ROOTS.primary }), []);
});

test('--effort on a model measured to reject it is refused on that agy version and only warned on any other', () => {
  const measured = EFFORTLESS_MODELS.measuredOn;
  assert.match(effortVerdict({ model: 'claude-sonnet-4-6', effort: 'high', installedVersion: measured }).refusal, /Drop the flag/);
  assert.match(effortVerdict({ model: 'claude-opus-4-6-thinking', effort: 'low', installedVersion: measured }).refusal, /rejected/);
  // A newer (or unknown) agy is a re-probe, never a permanent block: the rejection is free.
  assert.match(effortVerdict({ model: 'claude-sonnet-4-6', effort: 'high', installedVersion: '1.1.30' }).warning, /unverified here and the call goes through/);
  assert.match(effortVerdict({ model: 'claude-sonnet-4-6', effort: 'high', installedVersion: null }).warning, /\(unknown\)/);
  // Keyed by model, never by pool: GPT-OSS bills the same pool and carries its tier in its name.
  assert.equal(effortVerdict({ model: 'gpt-oss-120b-medium', effort: 'high', installedVersion: measured }), null);
  assert.equal(effortVerdict({ model: 'gemini-3.7-flash-high', effort: 'high', installedVersion: measured }), null);
  assert.equal(effortVerdict({ model: 'claude-sonnet-4-6', effort: null, installedVersion: measured }), null);
});

test('the grant file is a lower bound: a missing grant refuses, a present one proves nothing', () => {
  const declared = 'TOOLS: read_file and write_file, NO SHELL.';
  assert.deepEqual(grantPreflight(GRANTS, { write: false, prompt: declared }), { refusal: null, warning: null });
  // No command grant is the common state of this machine, so the warning is reserved for the
  // prompt shape that actually fails there: one that declares no tool set at all.
  assert.match(grantPreflight(GRANTS, { write: false, prompt: 'Count the ticker builders.' }).warning, /declares no tool set/);
  assert.equal(grantPreflight(GRANTS, { write: true }).refusal, null);

  const noRead = JSON.stringify({ permissions: { allow: ['write_file(C:/x/)'] } });
  assert.match(grantPreflight(noRead, { write: false }).refusal, /allows no `read_file/);
  const noWrite = JSON.stringify({ permissions: { allow: ['read_file(*)'] } });
  assert.equal(grantPreflight(noWrite, { write: false }).refusal, null, 'a read does not need write_file');
  assert.match(grantPreflight(noWrite, { write: true }).refusal, /allows no `write_file/);

  // No command grant is the common state of this machine; it warns because whether a prompt needs
  // a shell is a property of the prompt, and guessing it has been wrong in both directions.
  const withCommand = JSON.stringify({ permissions: { allow: ['read_file(*)', 'write_file(C:/x/)', 'command(grep)'] } });
  assert.equal(grantPreflight(withCommand, { write: true, prompt: 'Count the ticker builders.' }).warning, null);

  // Unreadable or malformed: warn, never refuse - a preflight that cannot tell must not block.
  assert.equal(grantPreflight(null).refusal, null);
  assert.match(grantPreflight(null).warning, /could not be read/);
  assert.match(grantPreflight('{not json').warning, /not valid JSON/);
});

test('the whole preflight collects every refusal and every warning, and says nothing on a clean call', () => {
  const clean = invocationPreflight({
    prompt: 'TOOLS: read_file and write_file, NO SHELL. Edit C:/claude/NoaCG-Studio/.claude/worktrees/agent-a1/docs/A.md.',
    write: true,
    model: 'gemini-3.7-flash-high',
    effort: 'high',
    roots: ROOTS,
    installedVersion: EFFORTLESS_MODELS.measuredOn,
    settingsText: GRANTS,
  });
  assert.deepEqual(clean, { refusals: [], warnings: [] });

  // The reclaim.mjs draft, as it was actually launched: plan mode, main-checkout paths, and on the
  // second pool with the flag it rejects. Three shapes, three refusals, in one message.
  const reclaim = invocationPreflight({
    prompt: 'TOOLS: read_file, write_file. Write scripts/reclaim.mjs; the test is at C:/claude/NoaCG-Studio/scripts/reclaim.test.mjs.',
    write: false,
    model: 'claude-sonnet-4-6',
    effort: 'high',
    roots: ROOTS,
    installedVersion: EFFORTLESS_MODELS.measuredOn,
    settingsText: GRANTS,
  });
  assert.equal(reclaim.refusals.length, 3);
  assert.match(reclaim.refusals[0], /plan/);
  assert.match(reclaim.refusals[1], /not standing in/);
  assert.match(reclaim.refusals[2], /Drop the flag/);
});

test('agySettingsPath is the file agy reads, and a test can point it elsewhere', () => {
  assert.equal(agySettingsPath({ env: {}, home: '/home/x' }), path.join('/home/x', '.gemini', 'antigravity-cli', 'settings.json'));
  assert.equal(agySettingsPath({ env: { AGY_SETTINGS: '/tmp/s.json' }, home: '/home/x' }), '/tmp/s.json');
});
// ── Capability observations ──────────────────────────────────────────────────────────────────────

test('an observation holds only on the build it was measured on; a constraint never lapses', () => {
  const observations = [
    { id: 'a', harness: 'Antigravity', kind: 'observation', measuredOn: '1.1.25', claim: 'x', reprobe: 'run y' },
    { id: 'b', harness: 'Codex', kind: 'observation', measuredOn: '0.153.0-alpha.5.1', claim: 'x', reprobe: null },
    { id: 'c', harness: 'Claude Code', kind: 'observation', measuredOn: '2.1.240', claim: 'x', reprobe: 'z' },
    { id: 'd', harness: 'Antigravity', kind: 'constraint', measuredOn: null, claim: 'ours', reprobe: null },
  ];
  const installed = [
    { pool: 'Claude Code', version: '2.1.251', why: null },
    { pool: 'Codex', version: '0.153.0-alpha.5.1', why: null },
    { pool: 'Antigravity', version: null, why: 'not installed, or it did not answer' },
  ];
  const standings = capabilityStandings(observations, installed);
  assert.deepEqual(standings.map((row) => row.standing), ['unverified', 'holds', 'unverified', 'constraint']);
  assert.equal(standings[0].installedVersion, null, 'a harness that does not answer backs nothing');
  assert.equal(standings[2].installedVersion, '2.1.251');

  const lines = capabilityLines(standings);
  assert.match(lines[0], /1 measured on the installed build, 2 UNVERIFIED/);
  assert.match(lines[0], /1 constraint/);
  assert.ok(lines.some((line) => /UNVERIFIED\s+Antigravity 1\.1\.25 -> installed not answering: a/.test(line)));
  assert.ok(lines.some((line) => /UNVERIFIED\s+Claude Code 2\.1\.240 -> installed 2\.1\.251: c/.test(line)));
  assert.ok(lines.some((line) => /re-probe: run y/.test(line)));
  assert.ok(!lines.some((line) => /: b$/.test(line)), 'an observation that holds is counted, not listed');
  assert.match(lines[lines.length - 1], /routing on a memory/);

  // Nothing unverified prints one line and no warning.
  const allHold = capabilityLines(capabilityStandings([observations[1], observations[3]], installed));
  assert.equal(allHold.length, 1);
  assert.match(allHold[0], /0 UNVERIFIED/);
});

test('the shipped observation file parses, every observation names its version, and its ids are unique', () => {
  const observations = readCapabilities(readFileSync(new URL('./harness-capabilities.json', import.meta.url), 'utf8'));
  assert.ok(observations.length >= 8);
  const ids = new Set();
  for (const row of observations) {
    assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
    ids.add(row.id);
    assert.ok(['observation', 'constraint'].includes(row.kind), `${row.id}: kind`);
    assert.ok(['Claude Code', 'Codex', 'Antigravity'].includes(row.harness), `${row.id}: harness must match a version probe pool`);
    if (row.kind === 'observation') {
      assert.match(String(row.measuredOn), /^\d+\.\d+\.\d+/, `${row.id}: an observation is pinned to the build it was measured on`);
      assert.ok(row.reprobe, `${row.id}: an observation names how it is re-settled`);
    }
  }
  assert.deepEqual(readCapabilities('not json'), []);
  assert.deepEqual(readCapabilities('{}'), []);
});

// The stale-checkout false alarm, which is the reason `--landed` exists. Measured on 2026-09-09:
// this worktree reported 0 unverified and the orchestrator worktree, eight commits behind and
// holding the pre-re-probe file, reported ELEVEN off the same installed builds. A daily routine
// pointed at the second would have raised that alarm every morning. So the flag must read the
// LANDED file and must not quietly fall back to the tree when git answers.
test('--landed reads the observation file from the landed ref, never the checkout', () => {
  const landed = JSON.stringify({ v: 1, observations: [{ id: 'a', harness: 'Codex', kind: 'observation', measuredOn: '9.9.9' }] });
  const asked = [];
  const runGit = (args) => {
    asked.push(args.join(' '));
    if (args[0] === 'rev-parse') return { status: 0, stdout: '' };
    if (args[0] === 'merge-base') return { status: 0, stdout: '' };
    if (args[0] === 'show') return { status: 0, stdout: landed };
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };

  assert.equal(landedCapabilitiesText(runGit), landed);
  // origin/main, never the bare local name - the whole point of routing through mainRef.
  assert.ok(
    asked.some((call) => call.startsWith('show origin/main:scripts/harness-capabilities.json')),
    `expected a show against origin/main, got ${JSON.stringify(asked)}`,
  );

  // A path git cannot answer falls back to the caller's tree rather than reporting nothing: an
  // answer from the checkout beats no answer at all on a fresh clone with no remote.
  const noRef = (args) => (args[0] === 'rev-parse' ? { status: 1, stdout: '' } : { status: 128, stdout: '' });
  assert.equal(landedCapabilitiesText(noRef), null);
});

test('--landed is parsed, and defaults off so the ordinary run still describes this checkout', () => {
  assert.equal(parseArgs([]).landed, false);
  assert.equal(parseArgs(['--landed']).landed, true);
  assert.equal(parseArgs(['--landed', '--json']).json, true);
});
