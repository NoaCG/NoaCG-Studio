// THE HARNESS LADDER (docs/work-specs/harness-ladder/spec.md): the noacg-harness bench's phases
// L0 to L4, run by the same `scripts/harness-bench.mjs`.
//
//   L0  the forced look, the sealed exam, the money held, the ladder judge     subscription only
//   L1  the ladder: rungs cheapest first (D5), on the subscription arm         subscription only
//   L2  teaching rounds (D7)                                                    subscription only
//   L3  the winner confirmed on Managed Agents (AC-5)                          credit, within L3's hold
//   L4  the exam on the newly sealed briefs, beside the Claude Code reference  credit, within L4's hold
//
// The phases run in order: one starts only once every earlier one is closed in the ledger. No
// ladder session runs before L0 has put the exam reserve and the confirmation ceiling in the
// ledger (D9); credit is spent only in L3 and L4, each inside what the ledger holds for it.
//
// Briefs: the 16 tuning briefs (benchmarks/harness/tuning/briefs.json), the eight ladder briefs
// of D4 (from the closed H8 exam, opened in memory with its passphrase), and in L4 only the
// ladder's own sealed exam (benchmarks/harness/ladder/exam/).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXAM_DIR, openBriefSet } from './exam.mjs';
import { loadJudge } from './judge.mjs';
import { holdFor, phaseCompleted, phaseNumber } from './ledger.mjs';
import { privatePassphraseFile } from './sealed.mjs';

export const LADDER_PHASES = ['L0', 'L1', 'L2', 'L3', 'L4'];
/** What each phase may run (D2, sections 3 and 5): the subscription arm until L3; then credit. */
export const LADDER_ARMS = { L0: ['subscription'], L1: ['subscription'], L2: ['subscription'], L3: ['managed-agents'], L4: ['managed-agents', 'claude-code'] };
/** D9: what L0 holds, in cents. */
export const LADDER_HOLDS = { L4: { kind: 'exam', cents: 3_000 }, L3: { kind: 'ceiling', cents: 800 } };
/** D4: the ladder set, eight briefs of the closed H8 exam; the first four are the dense boards. */
export const LADDER_SET = ['boxing-night-matchup', 'collegiate-cs2-scorebug', 'hockey-club-match-board', 'volleyball-set-board', 'charity-stream-alerts', 'film-fest-nominee-reveal', 'school-quiz-secret-pick', 'ski-sprint-timing-tower'];
/** The parent's exam, closed by H8, which the ladder set is read from. */
export const CLOSED_EXAM = 'H8';
export const LADDER_EXAM_DIR = path.join('benchmarks', 'harness', 'ladder', 'exam');
export const LADDER_JUDGE_LOCK = path.join('benchmarks', 'harness', 'ladder', 'judge.lock.json');

/** Does the ledger hold what D9 fixes before any ladder session: L4's reserve and L3's ceiling? */
export function ladderHeld(ledger) {
  return Object.entries(LADDER_HOLDS).every(([phase, want]) => {
    const h = holdFor(ledger, phase);
    return h && h.kind === want.kind && h.cents <= want.cents;
  });
}

/** Why `--build <L#> --arms ...` may not run, or null. */
export function refuseLadderBuild(ledger, phase, arms = []) {
  if (!LADDER_PHASES.includes(phase)) return `the ladder's phases are ${LADDER_PHASES.join(', ')}, not ${phase}`;
  if (phaseCompleted(ledger, phase)) return `the ledger already holds ${phase} as completed; a completed phase never runs again`;
  const open = LADDER_PHASES.slice(0, phaseNumber(phase)).filter((p) => !phaseCompleted(ledger, p));
  if (open.length) return `${phase} starts once ${open.join(', ')} ${open.length > 1 ? 'are' : 'is'} closed: the ladder runs its phases in order`;
  if (phase !== 'L0' && !ladderHeld(ledger)) return 'the ledger does not hold the exam reserve ($30.00, L4) and the confirmation ceiling ($8.00, L3): L0 holds them before any ladder session (D9)';
  const wrong = arms.filter((a) => !LADDER_ARMS[phase].includes(a));
  if (wrong.length) return `${phase} runs ${LADDER_ARMS[phase].join(' and ')}, not ${wrong.join(', ')}: ${LADDER_ARMS[phase].includes('subscription') ? 'the search and the teaching spend no credit (D2, section 3)' : 'credit is spent only on the real host'}`;
  return null;
}

/**
 * The briefs a ladder phase runs, by id: tuning briefs from the bank, ladder briefs from the closed
 * H8 exam (opened in memory, verified against its hash), and in L4 the ladder's own sealed exam,
 * which nothing else may open. `tuning` is the bank's briefs; `passphraseFile` and
 * `ladderPassphraseFile` default to the main checkout's private folders.
 */
export function ladderBriefs({ root, ledger, phase, ids, tuning, passphraseFile = privatePassphraseFile(root, 'harness-exam'), ladderPassphraseFile = privatePassphraseFile(root, 'harness-ladder-exam') }) {
  if (phase === 'L4') {
    if (!phaseCompleted(ledger, 'L3') || phaseCompleted(ledger, 'L4')) throw new Error('the ladder exam opens only in L4, once L3 is closed and before L4 is');
    const exam = openBriefSet({ root, dir: LADDER_EXAM_DIR, passphraseFile: ladderPassphraseFile, folder: 'harness-ladder-exam' });
    const unknown = ids.filter((id) => !exam.some((b) => b.id === id));
    if (unknown.length) throw new Error(`no ladder exam brief ${unknown.join(', ')}`);
    return ids.length ? exam.filter((b) => ids.includes(b.id)) : exam;
  }
  const wantSet = ids.filter((id) => LADDER_SET.includes(id));
  let set = [];
  if (wantSet.length) {
    if (!phaseCompleted(ledger, CLOSED_EXAM)) throw new Error(`the ladder briefs come from ${CLOSED_EXAM}'s exam, which is not closed`);
    set = openBriefSet({ root, dir: EXAM_DIR, passphraseFile, folder: 'harness-exam' });
  }
  return ids.map((id) => {
    const brief = set.find((b) => b.id === id && LADDER_SET.includes(id)) ?? tuning.find((b) => b.id === id);
    if (!brief) throw new Error(`no tuning or ladder brief ${id}`);
    return brief;
  });
}

/** The phases the ladder's own judge judges, in singles (D8); the exam (L4) is the exam judge's. */
export const LADDER_JUDGED = ['L1', 'L2'];

/**
 * The ladder's judge (D8): Opus 5.5, frozen in its own lock, when its calibration passed (the
 * block `calibration.mjs score --lock` writes into the lock, and the committed score it names);
 * else the exam judge. A lock whose calibration did not pass is no judge.
 */
export function ladderJudge(root) {
  const judgeDir = path.join(root, 'benchmarks', 'harness', 'judge');
  const lockFile = path.join(root, LADDER_JUDGE_LOCK);
  if (existsSync(lockFile)) {
    const c = JSON.parse(readFileSync(lockFile, 'utf8')).calibration;
    const scored = c?.score && existsSync(path.join(root, c.score)) ? JSON.parse(readFileSync(path.join(root, c.score), 'utf8')) : null;
    if (c?.pass === true && scored?.pass === true) return { ...loadJudge(judgeDir, { lockFile }), which: 'ladder' };
  }
  return { ...loadJudge(judgeDir), which: 'exam' };
}

/** Every brief id in an earlier brief file of this repository: what a new exam's ids must avoid
 *  (AC-2). The closed H8 exam's are added where its passphrase is on this machine. */
export const EARLIER_BRIEF_FILES = ['benchmarks/agent/v1/briefs.json', 'benchmarks/creative/v1/briefs.json', 'benchmarks/harness/tuning/briefs.json', 'benchmarks/pro/v1/briefs.json', 'benchmarks/pro/v1/custom/briefs.json', 'benchmarks/video/v1/briefs.json', 'scripts/video-bench-briefs.sample.json', 'scripts/video-bench-briefs.varied.json'];

export function earlierBriefIds(root, { passphraseFile = privatePassphraseFile(root, 'harness-exam') } = {}) {
  const ids = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (k === 'id' && typeof x === 'string' ? ids.add(x) : walk(x));
  };
  for (const f of EARLIER_BRIEF_FILES) walk(JSON.parse(readFileSync(path.join(root, f), 'utf8')));
  if (passphraseFile) walk(openBriefSet({ root, dir: EXAM_DIR, passphraseFile, folder: 'harness-exam' }));
  return ids;
}
