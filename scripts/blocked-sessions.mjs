#!/usr/bin/env node
/**
 * Which sessions are WAITING on a tool call that never came back?
 *
 * The watch loop in `.agent-workflows/orchestrator.md` could previously only see a branch tip
 * that had stopped moving, and a branch tip is the wrong instrument: a session commits every
 * completed step, so it can work for hours between commits, and it can also stop dead the
 * instant after a commit. Those two look identical from outside, and on 2026-08-29 the loop
 * called the first one the second - a session was written up as having hung for seven hours
 * when it had in fact committed, run a long blocking review leg, integrated `main` and run a
 * full nine-shard suite. Nothing was wrong with the session; the instrument could not see it.
 *
 * THE SIGNAL. Claude Code appends every turn to a JSONL transcript as it happens:
 *
 *   ~/.claude/projects/<sanitised-cwd>/<session>.jsonl                    an ordinary session
 *   ~/.claude/projects/<sanitised-cwd>/<session>/subagents/<agent>.jsonl  a wave subagent
 *
 * An assistant turn that calls a tool is written when the CALL is made; the matching
 * `tool_result` is written when the call comes BACK. So a transcript whose last entry is an
 * assistant message containing `tool_use` is, at that moment, a session waiting on that tool.
 * Everything else - a text answer, a tool_result - is a session that is not waiting.
 *
 * WHAT THE WAIT MEANS was, until the third signal below, deliberately not guessed here, because
 * the transcript alone cannot tell the three apart:
 *
 *   1. a permission prompt with nobody awake to answer it (the case this exists for),
 *   2. a session that was killed, or whose harness died, mid-call,
 *   3. a tool call that is genuinely still running.
 *
 * (3) is what the AGE THRESHOLD removes rather than diagnoses. The shell tool is killed at
 * 600 s, so past ~15 minutes no Bash call is still running; a long agent fork or a slow MCP
 * call can legitimately sit longer, which is why the default is 30 and the number is a flag.
 *
 * THE THIRD SIGNAL separates (2) from the rest, which the transcript never could. Claude Code
 * keeps a live-session inventory that `scripts/claude-agents.mjs` reads: a wait held by a session
 * the harness still lists is (1) or (3), and a wait held by a session it does not list is (2).
 * That signal is a capability probe, not a version check, and it fails to `unknown` on any
 * machine where the inventory does not answer - on which this script reports exactly what it
 * reported before the signal existed. It never converts a wait into a non-finding: every row that
 * qualified still appears, now carrying what is known about the process behind it.
 *
 * THE FOURTH SIGNAL separates (2) from (1) and (3), which the process probe never could: has the
 * transcript been WRITTEN TO since the conversation's last timestamped entry? Claude Code appends
 * trailing records of its own - `bridge-session`, `last-prompt`, `custom-title`, `mode` - when a
 * session ends, and those carry no timestamp, so they move the file's mtime past the newest entry
 * that has one. Measured on 2026-09-04: every live in-flight call had a gap of 0.0-0.1 s, and
 * finished sessions whose tail ended on an unresolved call had gaps of 54 s, 6 min, 50 min and
 * 6.6 h. A session that is really waiting stops writing at the call and the gap stays pinned at
 * zero; a session that finished has been written to since.
 *
 * The anchor is the newest timestamped entry, not the pending call's own timestamp, and the
 * difference is load-bearing: a BATCH where one call is held at a prompt and another comes back
 * writes that other result after the held call, so measuring from the held call would call a
 * genuine wait "moved on" every time a batch was involved.
 *
 * All three want the same answer from the loop - REPORT IT, never kill it (orchestrator.md,
 * "The watch loop"). A stalled worker's slot counts as free; its work does not continue.
 *
 * WHAT THIS IS NOT, and the reason the human output now says so in its own words. This is not an
 * inventory of live sessions, and it never was: a row exists only where a CALL has no RESULT and
 * has had none for `--minutes`, so a session that is working - results arriving, turns closing -
 * cannot qualify. An empty list is therefore silence about every session, not an all-clear about
 * any. On 2026-09-08 a night loop read the empty list as "nothing is alive", diagnosed a row as
 * dead while it was committing and about to queue itself, and came within one instrument of
 * queueing a live session's branch - the 2026-09-05 row Z incident repeating against a different
 * signal. The header was already careful and the reader still went wrong, which is what moved the
 * sentence from here into what the script PRINTS, alongside the live-session inventory it already
 * imports. See `printLiveness` at the bottom.
 *
 * A session that died days ago keeps being reported until its transcript ages past the lookback
 * window. That is deliberate rather than noise: nothing on disk distinguishes a dead session from
 * a stuck one, and quietly dropping the oldest would drop the worst first.
 *
 * Read-only: it opens transcript files and asks git for branch names. Nothing else.
 *
 * Usage:
 *   node scripts/blocked-sessions.mjs                 # waiting >= 30 min, this repo only
 *   node scripts/blocked-sessions.mjs --minutes 10    # lower the threshold
 *   node scripts/blocked-sessions.mjs --all           # every session, not just this repo's
 *   node scripts/blocked-sessions.mjs --json          # machine-readable
 */

import { open, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  describeLiveness,
  inventory,
  inventoryIndex,
  livenessFor,
  normalisePath,
  sessionIdFromTranscript,
} from './claude-agents.mjs';

const PROJECTS = join(homedir(), '.claude', 'projects');
/** How much of a transcript's tail to read. Entries are large; a few hundred KB is many turns. */
const TAIL_BYTES = 256 * 1024;
/**
 * Files untouched for longer than this are not considered. Generous on purpose: a blocked
 * session's mtime FREEZES at the moment it blocked, so the longer one has been stuck the older
 * its file looks - a short window would drop the worst cases first, which is backwards.
 */
const LOOKBACK_HOURS = 24 * 7;
/**
 * How far past its newest timestamped entry a transcript's mtime may sit and still count as frozen.
 *
 * A hundredfold margin on what was measured. Writing one entry moves mtime by 0.0-0.1 s of its own
 * timestamp on every live session looked at; the finished sessions that were being misreported sat
 * 54 s to 6.6 h past theirs. Nothing observed lands between the two, so the number is not a tuning
 * knob - it is the gap between "the same write" and "a later one".
 */
const FROZEN_TOLERANCE_MS = 15_000;

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const everywhere = argv.includes('--all');
const minutesArg = argv.includes('--minutes') ? Number(argv[argv.indexOf('--minutes') + 1]) : NaN;
const minutes = Number.isFinite(minutesArg) && minutesArg >= 0 ? minutesArg : 30;

/** The repo this checkout belongs to, so every worktree under it counts as "ours". */
const repoRoot = (() => {
  const res = spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' });
  const dir = res.status === 0 ? resolve(res.stdout.trim(), '..') : process.cwd();
  // Normalised the same way `cwd` is below - an unnormalised fallback would make the
  // repo filter match nothing and print a false all-clear, which is the one thing a
  // tool like this must never do.
  return dir.replaceAll('\\', '/');
})();

/**
 * The same root spelled the way the inventory spells a `cwd` - resolved, forward slashes, lower
 * case. The prefix test above compares two strings this script produced itself and can stay as it
 * is; the inventory's rows come from another process, so a drive letter cased differently there
 * would silently drop every row and print "no live session" on a machine full of them.
 */
const repoRootKey = normalisePath(repoRoot);

/** Every *.jsonl under the projects tree, one level of `subagents/` included. */
async function transcripts() {
  const out = [];
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600_000;
  const walk = async (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p, depth + 1);
      } else if (e.name.endsWith('.jsonl')) {
        try {
          const s = await stat(p);
          if (s.mtimeMs >= cutoff) out.push(p);
        } catch {
          /* vanished between readdir and stat */
        }
      }
    }
  };
  await walk(PROJECTS, 0);
  return out;
}

/** The last complete JSONL entries in a file, newest last. */
async function tailEntries(file) {
  let fh;
  try {
    fh = await open(file, 'r');
    const { size } = await fh.stat();
    const from = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - from);
    await fh.read(buf, 0, buf.length, from);
    const lines = buf.toString('utf8').split('\n');
    if (from > 0) lines.shift(); // the first line is a fragment
    const entries = [];
    for (const line of lines) {
      if (!line || line[0] !== '{') continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        /* a partial final line: the session is mid-write */
      }
    }
    return entries;
  } catch {
    return [];
  } finally {
    await fh?.close();
  }
}

/**
 * What is this session waiting on, if anything?
 *
 * Every call this repo makes may be one of SEVERAL issued in the same turn - the root CLAUDE.md
 * tells sessions to batch independent tool calls - and each result is appended on its own as it
 * returns. So "is the last entry a tool_use?" is not the question: a batch where one call is held
 * at a permission prompt and another completes ends on the completed one's result, and reading
 * only the tail would call that session healthy. The question is which CALLS have no RESULT yet.
 *
 * Returns the oldest such call, because that is the one that has been waiting longest.
 */
function waitingOn(entries) {
  const pending = new Map();
  for (const e of entries) {
    const blocks = Array.isArray(e?.message?.content) ? e.message.content : [];
    // A NEW assistant turn proves every earlier call was answered somehow - the model could not
    // have produced it otherwise. Without this, one abandoned call (an interrupted turn, a
    // re-prompt) would be reported as blocked for as long as the transcript survives.
    if (e?.message?.role === 'assistant') pending.clear();
    for (const b of blocks) {
      if (b?.type === 'tool_use') {
        pending.set(b.id, {
          tool: b.name,
          detail: describeCall(b),
          since: e.timestamp,
          cwd: typeof e.cwd === 'string' ? e.cwd.replaceAll('\\', '/') : '',
          agentId: typeof e.agentId === 'string' ? e.agentId : '',
        });
      } else if (b?.type === 'tool_result') {
        pending.delete(b.tool_use_id); // an id we never saw is simply older than the tail
      }
    }
  }
  let oldest = null;
  for (const call of pending.values()) {
    const t = Date.parse(call.since);
    if (!Number.isFinite(t)) continue;
    if (!oldest || t < Date.parse(oldest.since)) oldest = call;
  }
  return oldest;
}

function describeCall(call) {
  const i = call.input ?? {};
  const text = i.command ?? i.file_path ?? i.pattern ?? i.description ?? i.url ?? '';
  return String(text).replace(/\s+/g, ' ').slice(0, 110);
}

/**
 * Has this transcript been written to since its newest timestamped entry?
 *
 * `frozen` is a session that has produced nothing since the call - a real wait, and the case this
 * script exists for. `moved-on` is a session whose file grew afterwards, which for an unresolved
 * call means the conversation ended and the harness appended its own trailing, timestamp-less
 * records. `unknown` is an mtime or a timestamp that could not be read, and it reports exactly
 * what this script reported before the signal existed.
 */
function wroteSinceLastEntry(mtimeMs, lastEntryMs) {
  if (!Number.isFinite(mtimeMs) || !Number.isFinite(lastEntryMs)) return 'unknown';
  return mtimeMs - lastEntryMs > FROZEN_TOLERANCE_MS ? 'moved-on' : 'frozen';
}

function describeWrote(wrote, mtimeMs, lastEntryMs) {
  if (wrote === 'moved-on') {
    return `its transcript was written ${Math.round((mtimeMs - lastEntryMs) / 60_000)} min after that turn, `
      + 'so the session did not stop there - the unresolved call is a leftover, not a wait';
  }
  if (wrote === 'frozen') return 'nothing has been written to its transcript since - it really did stop there';
  return 'whether its transcript grew since could not be read';
}

function branchOf(dir) {
  if (!dir) return '';
  const res = spawnSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  });
  return res.status === 0 ? res.stdout.trim() : '';
}

const now = Date.now();
const found = [];
for (const file of await transcripts()) {
  const entries = await tailEntries(file);
  const w = waitingOn(entries);
  if (!w) continue;
  const since = Date.parse(w.since);
  if (!Number.isFinite(since)) continue;
  const waited = Math.round((now - since) / 60_000);
  if (waited < minutes) continue;
  if (!everywhere && !w.cwd.startsWith(repoRoot)) continue;
  const stamps = entries.map((e) => Date.parse(e?.timestamp)).filter(Number.isFinite);
  const lastEntryMs = stamps.length ? Math.max(...stamps) : NaN;
  // STAT AFTER READING, and this is not the redundant call it looks like - `transcripts()` also
  // stats, but it does so BEFORE the read, and an mtime taken before the entries were read can
  // never be later than the newest one of them. Reusing it would make every transcript look frozen
  // and switch the signal off. The two reads are milliseconds apart, so the gap this measures is
  // the harness's trailing write, never the cost of looking.
  const mtimeMs = await stat(file).then((s) => s.mtimeMs, () => NaN);
  const wrote = wroteSinceLastEntry(mtimeMs, lastEntryMs);
  found.push({
    ...w,
    waitedMinutes: waited,
    branch: branchOf(w.cwd),
    transcript: file,
    wrote,
    wroteDetail: describeWrote(wrote, mtimeMs, lastEntryMs),
  });
}
found.sort((a, b) => b.waitedMinutes - a.waitedMinutes);

// The third signal, read once for the whole run and only when there is something to say about.
// A machine whose inventory does not answer produces `unknown` on every row, which is exactly
// what this script reported before the signal existed.
const live = found.length ? inventoryIndex() : { available: false, index: null };
for (const row of found) {
  const verdict = livenessFor(
    { sessionId: sessionIdFromTranscript(row.transcript), cwd: row.cwd },
    live.index,
    { available: live.available },
  );
  row.liveness = verdict.verdict;
  row.livenessDetail = describeLiveness(verdict);
  row.pid = verdict.row?.pid ?? null;
}

// SPLIT, NEVER DROPPED. Every row that qualified still appears - the rule this file has always
// kept - but a row whose transcript grew after the call is not a session anybody needs to answer,
// and printing it beside the real ones is what taught a reader to skim the whole list. On
// 2026-09-04 a finished session was reported blocked for 61 minutes: pid 33028, resident, its last
// entry `node scripts/main-health.mjs` (allowlisted, and it runs in under a second), with the
// harness's own trailing records written to the file long afterwards.
const waits = found.filter((f) => f.wrote !== 'moved-on');
const leftovers = found.filter((f) => f.wrote === 'moved-on');

/**
 * WHAT IS ACTUALLY RUNNING - printed under every human answer, empty or not.
 *
 * This script answers "who is HELD on a call". The question its readers keep asking it instead is
 * "who is alive", and the two have no overlap: a working session never appears above, so neither
 * an empty list nor a short one carries any claim about the sessions it does not name. Warning
 * against the substitution did not work (the header has said it since the file was written and the
 * loop still made it on 2026-09-08), so the output now ANSWERS the other question rather than
 * declining it - the live-session inventory this file already reads for each row, printed whole.
 *
 * It is not a complete liveness answer either, and says so: the inventory never lists an Agent-tool
 * subagent, a Codex session or a session on another machine. Deciding a row is gone still takes all
 * three signals of `.agent-workflows/orchestrator/night.md`, where any one speaking means alive.
 */
function printLiveness() {
  const read = inventory();
  console.log('\nWHO IS ALIVE is a different question, and this script does not answer it: only a session');
  console.log('HELD on a call appears above. A working session has results arriving and never qualifies,');
  console.log('so the list above is silent about it rather than clearing it. What the harness lists:\n');
  if (!read.available) {
    console.log(`  unknown - the live-session inventory did not answer (${read.why}).`);
  } else {
    const mine = read.rows.filter((row) => {
      if (everywhere) return true;
      const at = normalisePath(row?.cwd);
      return Boolean(at && (at === repoRootKey || at.startsWith(`${repoRootKey}/`)));
    });
    const scope = everywhere ? '' : ' in this repo';
    if (mine.length === 0) {
      console.log(`  no live session${scope}. Treat that as unknown rather than as none.`);
    } else {
      for (const row of mine) {
        console.log(`  ${row.name ?? row.sessionId ?? 'unnamed'}  pid ${row.pid ?? '?'}  ${row.cwd ?? 'no working directory recorded'}`);
      }
    }
  }
  console.log('\nThe inventory never lists an Agent-tool subagent, a Codex session or another machine, so it');
  console.log('is not a liveness verdict on its own. Deciding a row is gone takes all three signals of');
  console.log('`.agent-workflows/orchestrator/night.md` - inventory, branch-tip age, transcript mtime -');
  console.log('and any one of them speaking means alive.');
}

function printRow(f) {
  const who = f.agentId ? `agent ${f.agentId}` : f.cwd.split('/').pop();
  console.log(`  ${who}${f.branch ? ` (${f.branch})` : ''}`);
  console.log(`    waiting ${f.waitedMinutes} min on ${f.tool}: ${f.detail}`);
  console.log(`    since ${f.since}  in ${f.cwd}`);
  console.log(`    ${f.livenessDetail}`);
  console.log(`    ${f.wroteDetail}`);
}

// `--json` keeps its shape exactly: a TOP-LEVEL ARRAY of the rows and nothing else. `wave-tick.mjs`
// parses it and refuses anything that is not an array, and the liveness note below is prose for a
// person - the tick reads each row's own `liveness` field for the same fact.
if (asJson) {
  console.log(JSON.stringify(found, null, 2));
} else if (found.length === 0) {
  console.log(`No session has been waiting on a tool call for ${minutes}+ minutes.`);
  printLiveness();
} else {
  if (waits.length === 0) {
    console.log(`No session has been waiting on a tool call for ${minutes}+ minutes.`);
  } else {
    console.log(`Sessions waiting on a tool call for ${minutes}+ minutes:\n`);
    for (const f of waits) printRow(f);
    console.log(
      '\nA wait held by a session the harness still lists is a permission prompt nobody has\n'
        + 'answered or a call still running; the transcript cannot separate those two, and nothing\n'
        + 'here pretends to. A wait the inventory does not hold is a session that is no longer\n'
        + 'running - good evidence, not proof, so it is never written up as a death.\n'
        + 'Report it and treat the slot as free - never kill the session to find out.',
    );
    const absent = waits.filter((f) => f.liveness === 'absent').length;
    const unknown = waits.filter((f) => f.liveness === 'unknown').length;
    if (absent) console.log(`\n${absent} of ${waits.length} are held by no live session.`);
    if (unknown) console.log(`\n${unknown} of ${waits.length} could not be checked against the harness inventory.`);
  }
  if (leftovers.length > 0) {
    console.log(`\nNot waits - ${leftovers.length} transcript(s) end on a call the session moved past:\n`);
    for (const f of leftovers) printRow(f);
    console.log('\nNobody has to answer these. They are listed because a row that qualified is never dropped.');
  }
  printLiveness();
}
