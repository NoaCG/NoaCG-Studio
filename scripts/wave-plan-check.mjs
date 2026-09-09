#!/usr/bin/env node
// THE WAVE PLAN CHECK - is this wave-state file ready to launch from?
//
//   node scripts/wave-plan-check.mjs                 # the newest fresh plan in the wave-plan store
//   node scripts/wave-plan-check.mjs --plan <path>
//   node scripts/wave-plan-check.mjs --json
//
// WHY. The orchestrator contract carried its readiness rules as prose - every row names its files,
// scarce slots are allocated once, every prompt ends on QUEUE, every handoff is classified, every
// path is confirmed - and each rule failed at least once in its first week without anything saying
// so at the moment it failed. Two of the failures were the kind a file diff cannot see: a row that
// named the wrong file (so two rows called disjoint were unanalysed), and ten rows that all went to
// one worker pool because no rule asked the planner to choose. This script asks. It reads the plan
// the orchestrator writes anyway (`wave-plan-store.mjs`) and refuses the shapes the contract
// forbids, so readiness is a verdict rather than a feeling. It also refuses a plan written OUTSIDE
// the store, because that plan dies with its checkout and takes the wave's whole record with it.
//
// WHAT IT CHECKS, each a named problem in the output:
//   - a `## Wave table` with the columns L, goal, START, TOUCHES, MINTS, POOL, browser;
//   - letters unique; START one of `now`, `on <branch> landing`, `on slot free`;
//   - POOL from the vocabulary below, and a row on a non-Claude pool names its fallback;
//   - no scarce slot minted by two rows;
//   - every TOUCHES entry that looks like a path exists (or is marked `(new)`), globs by prefix;
//   - every letter has a prompt block opening `SESSION <L>` whose last keyword line is QUEUE;
//   - a `Pools at plan time:` line - the capacity snapshot the routing decision was made on;
//   - every tracked handoff file classified under `## Handoffs` (scripts/handoff-drain.mjs);
//   - every STANDING owner ask mentioned by slug somewhere in the plan (scripts/owner-receipts.mjs)
//     - a plan may hold or defer one, never fail to see it. A FINDING is not one of these.
//   - every ANSWERED alignment question mentioned by id (scripts/alignment-answers.mjs) - what he
//     said on Tuesday, still not in docs/OWNER_RULINGS.md. Unlike an ask this one is not deferrable:
//     it is a ruling already given, and it repeats every morning until a branch records it.
//
// And it prints ECONOMY NOTES, which refuse nothing: a snapshot line that gives Claude a percentage
// it does not have, and Codex headroom left idle by a plan with no codex row (`economyNotes`).
//
// It judges nothing about whether the rows are the RIGHT rows; that stays the master's. It only
// refuses a plan whose shape hides a decision that was not made.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { alignmentState } from './alignment-answers.mjs';
import { drain, handoffFiles, newestWavePlan, parseHandoffSection } from './handoff-drain.mjs';
import { inStore, wavePlansDir } from './wave-plan-store.mjs';
import { isStanding, readReceipts } from './owner-receipts.mjs';
import { parseWindowEnd } from './wave-horizon.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/** The worker pools a row may name. The two Antigravity pools are billed separately (owner, 2026-09-01). */
export const POOLS = Object.freeze(['opus', 'fable', 'sonnet', 'agy-gemini', 'agy-claude-gpt', 'codex']);
export const CLAUDE_POOLS = Object.freeze(['opus', 'fable', 'sonnet']);
export const PROMPT_KEYS = /^(SESSION|BRANCH|MODEL|POOL|START|TOUCHES|MINTS|GOAL|WHY|READ|DO|CORE|TAIL|TRAPS|GATE|CHECK|QUEUE)\b/;
const REQUIRED_COLUMNS = ['letter', 'goal', 'start', 'touches', 'mints', 'pool', 'browser'];

function columnKey(header) {
  const text = header.replace(/\*/g, '').trim().toLowerCase();
  if (text === 'l' || text === '#' || text === 'letter') return 'letter';
  return text;
}

/** A row's pools, one grammar for the per-row check and the summary: `opus`, `agy-gemini + opus`. */
function rowPools(row) {
  return (row.pool ?? '').split(/[+,/]/).map((pool) => pool.trim().toLowerCase()).filter(Boolean);
}

/** The spellings of "this row mints nothing". Anything else in MINTS is a slot name. */
export const NO_MINT = new Set(['-', '', 'none', 'nothing', 'n/a', 'no']);

/** A MINTS cell as its slot names - the one grammar, shared with the refill instrument. */
export function mintsOf(cell) {
  return String(cell ?? '').split(',').map((mint) => mint.trim()).filter((mint) => !NO_MINT.has(mint.toLowerCase()));
}

/**
 * The first markdown table under the first heading matching `headingRe`: `header` is the column
 * keys (`columnKey`), each row is keyed by them and carries its `raw` line. Null when the heading
 * is missing; a table with no header row comes back with `header: null`. The one table walker for
 * the wave table here and the candidates table in `candidates.mjs`, so the two cannot drift.
 */
export function tableUnder(text, headingRe) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => headingRe.test(line));
  if (start < 0) return null;
  let header = null;
  const rows = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s+/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (!header) {
      header = cells.map(columnKey);
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const row = { raw: line };
    header.forEach((key, position) => {
      row[key] = cells[position] ?? '';
    });
    rows.push(row);
  }
  return { header, rows };
}

/** The wave table as rows keyed by column name. Any heading containing "wave table" opens it. */
export function parseWaveTable(text) {
  const table = tableUnder(text, /^#{1,6}\s+.*\bwave table\b/i);
  if (!table) return { rows: [], columns: [], problems: ['no "## Wave table" heading'] };
  if (!table.header) return { rows: [], columns: [], problems: ['the wave table has no header row'] };
  const problems = [];
  for (const column of REQUIRED_COLUMNS) {
    if (!table.header.includes(column)) problems.push(`the wave table lacks a ${column.toUpperCase()} column`);
  }
  return { rows: table.rows, columns: table.header, problems };
}

/**
 * The planner's word in a `browser` cell, with backticks and bold stripped: a cell STARTING with
 * yes or no, so `yes - drives the running app` counts, and a dash or a note naming neither is null.
 * Shared with `candidates.mjs`, which reads the same word off the candidates table.
 */
export function browserWord(cell) {
  const text = String(cell ?? '').replace(/[`*]/g, '').trim();
  if (/^yes\b/i.test(text)) return true;
  if (/^no\b/i.test(text)) return false;
  return null;
}

/**
 * Every fenced or dashed prompt block, keyed by the letter on its `SESSION <L>` line. A block ends
 * at its closing fence, at the next `SESSION` line, or at a markdown heading of two hashes or
 * more; a single `#` is a shell comment inside a prompt and never closes one.
 */
export function parsePromptBlocks(text) {
  const blocks = new Map();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let current = null;
  const close = () => {
    if (!current) return;
    const keyLines = current.lines.filter((line) => PROMPT_KEYS.test(line.trim()));
    const lastKey = keyLines.length ? keyLines[keyLines.length - 1].trim().split(/\s+/)[0] : null;
    blocks.set(current.letter, { lines: current.lines, lastKey, text: current.lines.join('\n') });
    current = null;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const opening = trimmed.match(/^SESSION\s+([A-Z]{1,2})\b/);
    if (opening) {
      close();
      current = { letter: opening[1], lines: [line] };
      continue;
    }
    if (!current) continue;
    if (/^```/.test(trimmed) || /^---\s*SESSION\b/.test(trimmed) || /^#{2,6}\s+/.test(trimmed)) {
      close();
      continue;
    }
    current.lines.push(line);
  }
  close();
  return blocks;
}

/**
 * TOUCHES entries that are paths, and whether each exists. An entry is a path when it has a
 * directory separator or a file extension and no spaces; free text ("the AGENTS.md chain") is
 * skipped rather than guessed at, and `(new)` marks a file the row will create.
 */
export function touchProblems(row, exists) {
  const problems = [];
  const entries = (row.touches ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    if (/\(new\)/i.test(entry)) continue;
    const token = entry.replace(/`/g, '').split(/\s+/)[0];
    if (!token || /\s/.test(entry.replace(/`/g, '')) && !/^[\w.@/*-]+$/.test(token)) continue;
    const looksLikePath = token.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(token);
    if (!looksLikePath || !/^[\w.@/*-]+$/.test(token)) continue;
    // The probe itself is shared with the launch guard (`pathProbe`), so the two cannot disagree
    // about what a glob or a trailing slash asks for; an extension-only token probes as itself.
    const probe = pathProbe(token)?.probe ?? token;
    if (probe && !exists(probe)) problems.push(`row ${row.letter}: TOUCHES names ${token}, which does not exist (mark it (new) if the row creates it)`);
  }
  return problems;
}

/**
 * A token's PROBE - the path to ask the tree about - or null when the token is not a relative
 * path of this checkout. ONE definition for the plan check and the launch guard, because the two
 * had drifted within a day of each other: the plan check probed a glob at the character before its
 * star (`docs/handoffs/2026-09-01-` for `docs/handoffs/2026-09-01-*.md`, which never exists), the
 * launch guard at the directory above it, so one TOUCHES line could pass the plan and be refused
 * at launch (found in review, 2026-09-05).
 *
 * A path here has a separator, only path characters, and is relative: an absolute path, `~`, a
 * drive letter and a URL are not this checkout's to judge. Wrapping backticks and punctuation are
 * stripped first, so `(docs/X.md),` reads as `docs/X.md`. A glob is probed at the directory above
 * its first star; a glob with no directory before the star (`*.md`, or a star before the first slash) has nothing to
 * probe and answers null rather than a nonsense path.
 */
export function pathProbe(raw) {
  const token = raw.replace(/`/g, '').replace(/^[(["']+/, '').replace(/[)\]"'.,;:]+$/, '');
  if (!token.includes('/') || !/^[\w.@-][\w.@/*-]*$/.test(token)) return null;
  const star = token.indexOf('*');
  const cut = star >= 0 ? token.lastIndexOf('/', star) : -1;
  const probe = star >= 0 ? (cut > 0 ? token.slice(0, cut) : '') : token.replace(/\/$/, '');
  return probe ? { token, probe } : null;
}

/**
 * The paths a wave PROMPT names on its TOUCHES and READ lines that do not exist, for the launch
 * guard (scripts/hooks/guard-agent-launch.mjs). `touchProblems` above reads the plan's table; this
 * reads the prompt a session is actually handed, which is the second place the same path can be
 * wrong and the last moment it can be caught.
 *
 * A line is a key line when it starts with the key, and the indented lines under it continue it,
 * as a wrapped READ line does; a blank line, an unindented line, a prompt key or another
 * key-shaped word (NOTE, CONTEXT, WHEN) ends the block, so an indented prompt does not feed its
 * every paragraph to the probe. TOUCHES is cut at MINTS, which names what the row CREATES. An
 * entry carrying `(new` is skipped, as in the plan check. A bare basename such as `settings.json`
 * names no directory, so nothing here can say it is wrong, and `e.g.` and version numbers never
 * reach the probe. `exists` is asked about a token's FIRST SEGMENT before its full path, which is
 * what keeps prose out (see `missingPaths`).
 *
 * @returns {{ key: string, token: string, probe: string }[]}
 */
export function promptPathProblems(text, exists) {
  if (typeof text !== 'string') return [];
  const problems = [];
  let block = null;
  const flush = () => {
    if (block) problems.push(...missingPaths(block, exists));
    block = null;
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    const key = /^(TOUCHES|READ)\b/.exec(trimmed);
    if (key) {
      flush();
      block = { key: key[1], text: trimmed.slice(key[0].length) };
      continue;
    }
    if (!block) continue;
    if (trimmed === '' || !/^\s/.test(line) || PROMPT_KEYS.test(trimmed) || /^[A-Z][A-Z-]{2,}(?:\s|$)/.test(trimmed)) {
      flush();
      continue;
    }
    block.text += ` ${trimmed}`;
  }
  flush();
  return problems;
}

/** The entries of one key line that name a relative path the checkout does not have. */
function missingPaths({ key, text }, exists) {
  const scope = key === 'TOUCHES' ? text.split(/\bMINTS\b/)[0] : text;
  const found = [];
  for (const entry of scope.split(',')) {
    // `(new` rather than `(new)`: the qualifier may carry a comma of its own - "(new, plus its
    // owner-queue file)" - and the split above has already taken the closing bracket away.
    if (/\(new\b/i.test(entry)) continue;
    for (const raw of entry.split(/\s+/)) {
      const path = pathProbe(raw);
      if (!path) continue;
      // PROSE HAS SLASHES TOO. `Take/Update/Out`, `and/or`, `f0/f1` and `I/O` all pass the
      // character test, and refusing a launch over them is a machine-wide outage the moment the
      // guard lands (found in review, 2026-09-05, against this checkout's own READ lines). A token
      // claims to be a path of THIS checkout only if its first segment is something the checkout
      // has: `docs/CONTRL_LAYER.md` is still refused, `Take/Update/Out` is never probed. The cost
      // is a misspelt top-level directory going unprobed, which no prompt has produced yet.
      const first = path.probe.split('/')[0];
      if (first === '.' || first === '..' || !exists(first)) continue;
      if (exists(path.probe)) continue;
      found.push({ key, token: path.token, probe: path.probe });
    }
  }
  return found;
}

/**
 * The plan-time economy notes - the capacity half of routing, read off the plan's own
 * `Pools at plan time:` line and its POOL column. Notes, never refusals: the check cannot know
 * whether a row SUITS a pool, only whether a pool with known headroom was left idle without a
 * word. Two shapes it names, both measured in the first two real waves (2026-09-02/03):
 *
 *   - the snapshot's percentages read as Claude's. Claude Code has no rate-limit surface; the only
 *     percentages `harness:usage` prints are Codex's own windows. The 2026-09-03 day plan wrote
 *     "Claude 5-hour window 0% ... weekly 64%", which were Codex's numbers, and then routed no row
 *     to Codex at all;
 *   - Codex headroom with no Codex row. The owner's 2026-09-03 ruling makes Codex available by
 *     default unless the wave's invocation says it is off limits; a plan that leaves it idle owes
 *     section 4 one sentence saying why.
 */
export function economyNotes(text, rows) {
  const notes = [];
  const match = /^\s*(?:[-*]\s*)?(?:\*\*)?pools at plan time\s*(?:\*\*)?:(.*(?:\n(?![\s#|\-*]|\s*$).*)*)/im.exec(text.replace(/\r\n/g, '\n'));
  if (!match) return notes;
  const line = match[1].replace(/\s+/g, ' ').trim();
  const pools = new Set(rows.flatMap(rowPools));
  if (/\bclaude\b[^.;]*?\d+\s*%/i.test(line) && !/\bcodex\b[^.;]*?\d+\s*%/i.test(line)) {
    notes.push('the snapshot line gives Claude a percentage. Claude Code publishes no rate limit; the only '
      + 'window percentages harness:usage prints are Codex\'s own 5-hour and weekly meters - re-read '
      + 'the snapshot before routing on it (2026-09-03 day plan).');
  }
  const offLimits = /\bcodex\b[^.;]*\b(off[- ]limits|needed elsewhere|unavailable|not (?:available|installed)|no headroom|exhausted)\b/i.test(line)
    || /\b(off[- ]limits|needed elsewhere)\b[^.;]*\bcodex\b/i.test(line);
  const weekly = /\b(?:codex[^.;]*?)?weekly[^.;%]*?(\d+)\s*%/i.exec(line);
  const headroom = /\bcodex\b[^.;,]*\b(headroom|available|ample|free)\b/i.test(line) || (weekly && Number(weekly[1]) < 90);
  if (!pools.has('codex') && !offLimits && headroom) {
    notes.push('Codex shows headroom in the snapshot and no row names the codex pool. Codex is available by '
      + 'default (owner, 2026-09-03): route the rows that are long to do and short to specify there, '
      + 'or say in section 4 why none suits it this wave.');
  }
  return notes;
}

/**
 * The whole verdict, from the plan text plus injected facts so the pure part is testable.
 * `exists(relativePath)`, `handoffs` (from handoff-drain), `receipts` (from owner-receipts),
 * `alignment` (the pending answers from alignment-answers).
 */
export function checkPlan(text, { exists, handoffs = [], receipts = [], alignment = [], now = Date.now(), night = false } = {}) {
  const problems = [];
  const table = parseWaveTable(text);
  problems.push(...table.problems);
  const blocks = parsePromptBlocks(text);
  const seenLetters = new Set();
  const mints = new Map();
  for (const row of table.rows) {
    const letter = (row.letter ?? '').trim();
    if (!/^[A-Z]{1,2}$/.test(letter)) {
      problems.push(`a row has no letter: ${row.raw.trim().slice(0, 60)}`);
      continue;
    }
    if (seenLetters.has(letter)) problems.push(`letter ${letter} is used by two rows`);
    seenLetters.add(letter);
    const start = (row.start ?? '').trim().toLowerCase();
    if (!(start === 'now' || start.startsWith('now ') || start.startsWith('now (') || /^on\s+\S+\s+landing\b/.test(start) || /^on slot free\b/.test(start) || /^when\b/.test(start))) {
      problems.push(`row ${letter}: START must be now, "on <branch> landing" or "on slot free" - got "${row.start}"`);
    }
    const pools = rowPools(row);
    if (pools.length === 0) problems.push(`row ${letter}: no POOL - every row names the pool that does its work (${POOLS.join(', ')})`);
    for (const pool of pools) {
      if (!POOLS.includes(pool)) problems.push(`row ${letter}: POOL "${pool}" is not one of ${POOLS.join(', ')}`);
    }
    const block = blocks.get(letter);
    if (pools.some((pool) => POOLS.includes(pool) && !CLAUDE_POOLS.includes(pool))) {
      const named = /\bfallback\b/i.test(row.raw) || /\bfallback\b/i.test(block?.text ?? '');
      if (!named) problems.push(`row ${letter}: a non-Claude pool must name its fallback pool (in the row or the prompt)`);
    }
    for (const mint of mintsOf(row.mints)) {
      const key = mint.toLowerCase();
      if (mints.has(key)) problems.push(`rows ${mints.get(key)} and ${letter} both mint ${mint}`);
      else mints.set(key, letter);
    }
    // The browser cell is read by the refill instrument to know who HOLDS the machine's one browser
    // slot, so a value it cannot read is a row that holds nothing: "needs it" or "shared with F"
    // passed this check and held nothing until 2026-09-09.
    if (table.columns.includes('browser') && browserWord(row.browser) === null) {
      problems.push(`row ${letter}: browser must start with yes or no - got "${row.browser}"`);
    }
    if (exists) problems.push(...touchProblems({ ...row, letter }, exists));
    if (!block) problems.push(`row ${letter}: no prompt block opens with "SESSION ${letter}"`);
    else if (block.lastKey !== 'QUEUE') problems.push(`row ${letter}: the prompt's last keyword line is ${block.lastKey ?? 'missing'}, not QUEUE`);
  }
  for (const letter of blocks.keys()) {
    if (!seenLetters.has(letter)) problems.push(`prompt block SESSION ${letter} has no wave-table row`);
  }
  // The candidates table is the refill loop's list (night.md). Its optional browser column is the
  // planner's override of the specs-derived need, and only a cell starting with yes or no is read
  // as one - so a cell spelt any other way is a planner who believes they overrode and did not.
  const candidates = tableUnder(text, /^#{1,6}\s+.*\bcandidates\b/i);
  if (candidates?.header?.includes('browser')) {
    for (const row of candidates.rows) {
      const cell = String(row.browser ?? '').replace(/[`*]/g, '').trim();
      if (cell && cell !== '-' && browserWord(cell) === null) {
        problems.push(`candidate ${row.letter ?? '?'}: browser must start with yes or no, or be empty - got "${row.browser}"`);
      }
    }
  }
  if (!/^\s*(?:[-*]\s*)?(?:\*\*)?pools at plan time\s*(?:\*\*)?:/im.test(text)) {
    problems.push('no "Pools at plan time:" line - quote npm run harness:usage for the snapshot the routing was decided on');
  }
  // A night wave refills unattended, and the refill loop stops on the horizon, so the window the
  // horizon measures against must be written down. A day plan has no unattended window and no loop.
  if (night && parseWindowEnd(text) === null) {
    problems.push('a night plan needs a "Window ends: <iso>" line - wave-horizon.mjs reads it to know when to stop refilling');
  }
  const rows = drain(handoffs, parseHandoffSection(text), { now });
  for (const row of rows.filter((entry) => entry.flag === 'UNCLASSIFIED')) {
    problems.push(`handoff ${row.name} is not classified under "## Handoffs" (consumed | spent | deferred | owner)`);
  }
  // Only the ASKS. A bug he reported while serving one is real work and takes its turn like any
  // other backlog item; making a plan account for it by name turns it into his requirement, which
  // is the thing he asked us to stop doing (owner, 2026-09-03).
  for (const receipt of receipts.filter(isStanding)) {
    if (!text.includes(receipt.slug)) {
      problems.push(`standing owner ask ${receipt.slug} (${receipt.ageDays ?? '?'} days) is not mentioned - plan it, hold it or defer it, in writing`);
    }
  }
  // An answered alignment question is a ruling he has already given, so the plan may not hold or
  // defer it the way it may an ask - it plans the row that writes it into docs/OWNER_RULINGS.md.
  // Mentioning the id is what passes here; the answer stops being pending when the ruling lands,
  // so an unrecorded one comes back tomorrow and the morning after that.
  for (const entry of alignment) {
    if (!text.includes(entry.id)) {
      problems.push(`alignment answer ${entry.id} is not in docs/OWNER_RULINGS.md and this plan does not mention it - plan the row that records what he said`);
    }
  }
  return { problems, notes: economyNotes(text, table.rows), rows: table.rows.length, pools: [...new Set(table.rows.flatMap(rowPools))] };
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT, now = Date.now() } = {}) {
  const planFlag = argv.indexOf('--plan');
  const planPath = planFlag >= 0 ? path.resolve(root, argv[planFlag + 1] ?? '') : newestWavePlan(root, now);
  if (!planPath || !existsSync(planPath)) {
    console.error(`No fresh wave plan found in the store ${wavePlansDir() ?? '(no git checkout)'} (expected <date>-<day|night>-wave-plan.local.md); pass --plan <path>.`);
    console.error('The path to write is what `node scripts/wave-plan-store.mjs --path <date> <day|night>` prints.');
    return 1;
  }
  // WHERE the plan lives is checked before WHAT it says, because a perfect plan in a worktree is
  // still gone next week: that is how 2026-09-05 to 09-07 lost every row and every DECIDED: line.
  // This check gates every launch, so it is the place the location becomes a fact and not a hope.
  if (!inStore(planPath)) {
    console.error(`Wave plan NOT ready - ${planPath} is outside the wave-plan store.\n`);
    console.error(`  - a plan in a checkout dies with that checkout, and it holds the only record of the wave's`);
    console.error('    routing and of every decision taken on the owner\'s behalf. Move it to the store:');
    console.error(`      ${wavePlansDir() ?? '(no git checkout)'}`);
    console.error('    whose exact path for today `node scripts/wave-plan-store.mjs --path <date> <day|night>` prints.\n');
    return 1;
  }
  const verdict = checkPlan(readFileSync(planPath, 'utf8'), {
    exists: (relative) => existsSync(path.join(root, ...relative.split('/'))),
    handoffs: handoffFiles(root),
    receipts: readReceipts(root, { now }),
    alignment: alignmentState(root).pending,
    now,
    night: /-night-/.test(path.basename(planPath)),
  });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ plan: planPath, ...verdict }, null, 2));
    return verdict.problems.length ? 1 : 0;
  }
  for (const note of verdict.notes) console.error(`  economy: ${note}`);
  if (verdict.problems.length) {
    console.error(`\nWave plan NOT ready - ${path.basename(planPath)} (${verdict.problems.length} problem(s)):\n`);
    for (const problem of verdict.problems) console.error(`  - ${problem}`);
    console.error('');
    return 1;
  }
  console.log(`Wave plan OK: ${path.basename(planPath)} - ${verdict.rows} row(s), pools ${verdict.pools.join(', ') || 'none'}; every handoff classified, every standing owner ask and alignment answer mentioned.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
