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
import { EXAM_DIR, graphicOf, median, openBriefSet } from './exam.mjs';
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
/** The commit that added the sealed exam, and its commit time (phase-L0.md), recorded so a shallow
 *  checkout, where git cannot see that commit, still checks every ladder session against it. */
export const LADDER_SEAL_COMMIT = { sha: '6c8a1954acd4bff2f5fced503f04e2ac47365e70', at: '2026-10-17T11:16:00Z' };

/**
 * When the sealed exam was committed. `git(args)` runs git in the repository and returns its
 * stdout, or null when git fails. With the history at hand, the commit that added the seal must be
 * the recorded one, at the recorded time. In a shallow checkout (CI's) the oldest commit fetched
 * has no parent and looks as if it added every file, so such a commit is not taken for the
 * sealing commit: the recorded time stands.
 */
export function sealCommittedAt(git, recorded = LADDER_SEAL_COMMIT) {
  const added = (git(['log', '--diff-filter=A', '--format=%H %cI', '--', path.join(LADDER_EXAM_DIR, 'briefs.sealed')]) ?? '').trim().split('\n').filter(Boolean).pop();
  const [sha, at] = (added ?? '').split(' ');
  const boundary = sha && git(['rev-parse', '--is-shallow-repository'])?.trim() === 'true' && git(['rev-parse', '--verify', '--quiet', `${sha}^`]) === null;
  if (!sha || boundary) return { at: recorded.at, from: 'recorded' };
  if (sha !== recorded.sha || Date.parse(at) !== Date.parse(recorded.at)) throw new Error(`the seal was added by ${sha} at ${at}, not by the recorded ${recorded.sha} at ${recorded.at}`);
  return { at, from: 'git' };
}

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

// ── L1: a rung's tally (D5, D6) ─────────────────────────────────────────────────────────────────

/** D5: the order every rung runs the ladder set in; the first four are its screen, two dense boards
 *  and two others. Fixed before L1's first session. */
export const RUNG_ORDER = ['boxing-night-matchup', 'collegiate-cs2-scorebug', 'charity-stream-alerts', 'film-fest-nominee-reveal', 'hockey-club-match-board', 'volleyball-set-board', 'school-quiz-secret-pick', 'ski-sprint-timing-tower'];
export const SCREEN_SIZE = 4;
/** D7's overfit check: a teaching round is re-measured on the tuning bank too, every brief of it a
 *  library graphic can answer (the OGraf brief is not, 4.2), in the bank's order. Those figures
 *  are reported beside the eight's; D5's screen and D6's match are the eight's alone. */
export const tuningOrder = (bank) => bank.filter((b) => b.kind === 'noacg').map((b) => b.id);
/** D5's screen and D6's match, as committed before the first rung. */
export const RUNG_RULE = { screenNotUsableMax: 2, screenUsdPerUsableMax: 2, usableMin: 7, usdPerUsableMax: 1, medianWallSecondsMax: 600, lookAllMin: 7 };
/** D6 as the owner amended it on 2026-10-17 for a taught rung (L2): at most $1.35 notional per
 *  usable, since H8 measured Claude Code's notional at about 1.35 times Managed Agents' real cost;
 *  AC-5's real-host line stays $1.00 measured. Revert: `usdPerUsableMax` back to 1. */
export const TAUGHT_RULE = { ...RUNG_RULE, usdPerUsableMax: 1.35 };
/** The match rule a phase's rung or round is counted by: L1's ladder as committed, L2's teaching
 *  as amended. */
export const rungRule = (phase) => (phase === 'L2' ? TAUGHT_RULE : RUNG_RULE);

/** D8 as amended after L1's check: the ladder judge reads each delivered graphic as a single this
 *  many times, and the judge passes it when at least `usableMin` of them are airable with no basic
 *  visible mistake. Revert: `{ count: 1, usableMin: 1 }`, the first reading as the single. */
export const SINGLE_READINGS = { count: 3, usableMin: 2 };

const perUsable = (usd, usable) => (usable ? Number((usd / usable).toFixed(2)) : null);
/** One reading passes when it is airable with no basic visible mistake (a missing action is the
 *  gate's to count, as H8 counted). */
const readingPasses = (j) => j.answer?.airable === true && !(j.answer?.basicMistakes ?? []).some((m) => m.kind !== 'missing-action');

/**
 * One rung's figures from its cells (`cell.json`) and the ladder judge's singles, counted as H8
 * counted (phase-8.md: delivered, validator clean, shape ok, no missing action after the readings,
 * and the judge airable with no basic visible mistake), the judge's verdict being that of at least
 * `repeat.usableMin` of the graphic's first `repeat.count` readings (D8 as amended); a graphic with
 * fewer readings is not judged yet. Each judged row gives its agreement (how many readings share
 * the verdict) and `all.agreement` the judge's repeatability. The cost is Claude Code's notional
 * `total_cost_usd` (D2) over every session that ran, failed and stopped ones included, per usable
 * graphic. The screen (D5) reads the first four of `order`; the match (D6) needs all eight. A
 * rubber stamp is a delivered graphic whose review said `ok` to every frame and that the judge
 * failed (not airable, or a basic visible mistake). With `match` false (the tuning bank's
 * figures, `tuningOrder`) there is no screen and no match: a complete set is `measured`.
 * `flagsToRead` are the gate's missing actions
 * the judge's single did not also name, which H8's ruling reads against the operator surface.
 */
export function tallyRung({ cells, judgements, fingerprint = null, readings = {}, order = RUNG_ORDER, rule = RUNG_RULE, repeat = SINGLE_READINGS, match = true }) {
  const singles = judgements.filter((j) => j.task === 'single' && !j.error && (!fingerprint || j.judge === fingerprint));
  const ran = (brief) => cells.find((c) => c.brief === brief && c.outcome !== 'refused' && c.outcome !== 'paused') ?? null;
  const rows = order.map((brief) => {
    const cell = ran(brief);
    // A rung is one arm, so its singles are the judgements of the brief (judged by cell id), in the
    // order they were given; the verdict is the one at least `usableMin` of the first `count` give,
    // and the reading that gives it stands for the graphic (its mistakes, its confidence).
    const read = cell ? singles.filter((j) => j.brief === brief).slice(0, repeat.count) : [];
    const passes = read.filter(readingPasses).length;
    const passed = passes >= repeat.usableMin;
    const single = read.length === repeat.count ? read.find((j) => readingPasses(j) === passed) : undefined;
    const g = graphicOf(cell, single, null, readings);
    if (!cell) return { brief, ...g, look: null, rubberStamp: false, flagsToRead: [], judgeReadings: [], agreement: null };
    const judgeMissing = read.flatMap((j) => j.answer?.missingActions ?? []).map(String);
    const judgeFailed = g.judged && (g.airable !== true || g.defects.length > 0);
    return {
      brief,
      ...g,
      look: cell.look ?? null,
      rubberStamp: g.delivered && judgeFailed && Boolean(cell.look?.reviewed) && !cell.look?.fixed,
      flagsToRead: g.missing.filter((a) => !judgeMissing.some((m) => m.includes(a))),
      judgeReadings: read.map((j) => ({ at: j.at ?? null, airable: j.answer?.airable ?? null, mistakes: (j.answer?.basicMistakes ?? []).filter((m) => m.kind !== 'missing-action').map((m) => m.kind), passes: readingPasses(j) })),
      agreement: single ? `${passed ? passes : repeat.count - passes}/${repeat.count}` : null,
    };
  });
  const figures = (rs) => {
    const run = rs.filter((r) => r.ran);
    const usable = rs.filter((r) => r.usable).length;
    const notionalUsd = Number(run.reduce((k, r) => k + (r.notionalUsd ?? 0), 0).toFixed(2));
    return {
      briefs: rs.length,
      ran: run.length,
      delivered: rs.filter((r) => r.delivered).length,
      usable,
      notionalUsd,
      usdPerUsable: perUsable(notionalUsd, usable),
      medianWallSeconds: median(run.map((r) => r.wallSeconds).filter((w) => Number.isFinite(w))),
      lookAll: rs.filter((r) => r.look?.all).length,
      framesReviewed: rs.reduce((k, r) => k + (r.look?.reviewed ?? 0), 0),
      framesOpened: rs.reduce((k, r) => k + (r.look?.opened ?? 0), 0),
      rubberStamps: rs.filter((r) => r.rubberStamp).map((r) => r.brief),
      unjudged: rs.filter((r) => r.delivered && !r.judged).map((r) => r.brief),
      // The judge's repeatability: of the graphics judged, how many had every reading agree.
      agreement: { unanimous: rs.filter((r) => r.agreement === `${repeat.count}/${repeat.count}`).length, judged: rs.filter((r) => r.agreement).length },
    };
  };
  const screenRows = rows.slice(0, SCREEN_SIZE);
  const screen = figures(screenRows);
  const screenDone = screenRows.every((r) => r.ran) && !screen.unjudged.length;
  // A delivered graphic not yet judged is not counted either way.
  const screenNotUsable = screenRows.filter((r) => r.ran && !r.usable && !(r.delivered && !r.judged)).length;
  // Three not usable ends the rung as soon as they are known; the cost line needs the four.
  const endsAt = !match ? null : screenNotUsable > rule.screenNotUsableMax ? 'not usable' : screenDone && (screen.usable === 0 || screen.usdPerUsable > rule.screenUsdPerUsableMax) ? 'cost' : null;
  const all = figures(rows);
  const complete = rows.every((r) => r.ran) && !all.unjudged.length;
  const lines = [
    { rule: `at least ${rule.usableMin} of ${order.length} delivered and usable`, holds: all.usable >= rule.usableMin, figure: `${all.usable} of ${order.length}` },
    { rule: `at most $${rule.usdPerUsableMax.toFixed(2)} notional per usable graphic`, holds: all.usdPerUsable !== null && all.usdPerUsable <= rule.usdPerUsableMax, figure: all.usdPerUsable === null ? `$${all.notionalUsd.toFixed(2)}, none usable` : `$${all.usdPerUsable.toFixed(2)}` },
    { rule: `median wall at most ${rule.medianWallSecondsMax / 60} minutes`, holds: all.medianWallSeconds !== null && all.medianWallSeconds <= rule.medianWallSecondsMax, figure: `${all.medianWallSeconds ?? '-'} s` },
    { rule: `every reviewed frame opened in at least ${rule.lookAllMin} sessions`, holds: all.lookAll >= rule.lookAllMin, figure: `${all.lookAll} of ${order.length}` },
  ];
  const restRan = rows.slice(SCREEN_SIZE).some((r) => r.ran);
  const verdict = !match ? (complete ? 'measured' : 'incomplete') : endsAt ? 'screened out' : !complete ? (screenDone && !restRan ? 'screen passed' : 'incomplete') : lines.every((l) => l.holds) ? 'MATCH' : 'no match';
  return { verdict, screen: { ...screen, notUsable: screenNotUsable, endsAt, done: screenDone }, all, lines, rows };
}

/** A rung's tally as the evidence's heading line and table. */
export function rungMarkdown(rung, t) {
  const usd = (x) => (x === null || x === undefined ? '-' : `$${Number(x).toFixed(2)}`);
  const a = t.all.agreement;
  const head = `${rung}: ${t.verdict}${t.screen.endsAt ? ` (the screen: ${t.screen.endsAt})` : ''}; ${t.all.delivered} delivered, ${t.all.usable} usable of ${t.all.ran} run, ${usd(t.all.notionalUsd)} notional, ${usd(t.all.usdPerUsable)} per usable, median wall ${t.all.medianWallSeconds ?? '-'} s, frames opened ${t.all.framesOpened} of ${t.all.framesReviewed} reviewed (every one in ${t.all.lookAll} sessions), the judge unanimous on ${a.unanimous} of ${a.judged} judged`;
  const readings = (r) => r.judgeReadings.map((j) => (j.passes ? 'pass' : j.airable ? 'mistake' : 'not airable')).join(', ') || '-';
  const rows = t.rows.filter((r) => r.ran).map((r) => `| ${r.brief} | ${r.outcome} | ${readings(r)} | ${r.agreement ?? '-'} | ${r.judged ? (r.airable ? 'airable' : 'not airable') : '-'} | ${r.defects.map((d) => d.kind).join(', ') || '-'} | ${r.missing.join(', ') || '-'} | ${r.usable ? 'yes' : 'no'} | ${usd(r.notionalUsd)} | ${r.wallSeconds ?? '-'} | ${r.look ? `${r.look.opened}/${r.look.reviewed}${r.look.fixed ? `, ${r.look.fixed} fixed` : ''}` : '-'} | ${r.rubberStamp ? 'yes' : ''} |`);
  return [head, '', '| brief | outcome | readings | agreement | single | basic mistakes | missing | usable | notional | wall s | opened/reviewed | all ok, judge failed |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}
