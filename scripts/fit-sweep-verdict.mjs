// THE FIT SWEEP'S VERDICT - one table from the shards of `svg-import-sweep.mjs --ladder`, judged
// against the last green runs of .github/workflows/fit-sweep.yml.
//
// Why a baseline and not "no findings": the sweep asserts the ladder's ORDER over every file,
// option and length, and on the day it was scheduled the corpus still carried known findings
// (issue #778). A gate that is red every night says nothing. So the question asked here is the
// one a regression answers: is there a defect tonight that no recent green run had?
//
// A DEFECT is one file, one field and one kind of problem - the problem with its numbers taken
// out, the same collapse the sweep prints by (`groupFindings`). The option and the length it fired
// on are reported, not keyed: a defect that moves from one length to the next is the same defect,
// and keying on them turned tolerance noise into alarms.
//
// SEVERAL GREEN RUNS, NOT ONE. A few lines answer differently from run to run for reasons in the
// product rather than the instrument - a quiz board's state layer is measured either side of the
// moment it is first shown - so a defect counts as new only when none of the recent green runs
// had it. A flake then costs one red night at most, and a real regression still stays red until
// it is fixed. What went away, and which files went unswept, are read against the newest run.
//
// What fails the run: a new defect on a file the baselines swept, a file the newest baseline
// swept that was not swept tonight, and a shard that sent nothing. A file new to the corpus is
// reported and not judged - it has no baseline yet, and becomes one when the run is green.
// `--accept` records tonight as a baseline without judging it, for a finding somebody has decided
// to live with.
//
// Usage:
//   node scripts/fit-sweep-verdict.mjs --shards 4 --current ladder-1.json ladder-2.json ...
//     [--baseline newest.json older.json ...] [--out findings.json] [--summary summary.md] [--accept]
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The problem with its MEASUREMENTS taken out, so a reading that moved a pixel is the same
 *  defect. Digits inside a name stay: "g0" and "g1" are two shapes, and t3 and f2 two rows. */
export function defectOf(problem) {
  return String(problem).replace(/(?<![\w.])-?\d+(\.\d+)?/g, '#');
}

/** Every defect on the files, keyed `file|field|defect`, with what it fired on. */
export function defects(files) {
  const out = new Map();
  for (const file of files) {
    for (const f of file.findings ?? []) {
      const key = `${file.name}|${f.field ?? ''}|${defectOf(f.problem)}`;
      let d = out.get(key);
      if (!d) {
        out.set(key, (d = { file: file.name, field: f.field ?? '', example: f.problem, n: 0, modes: new Set(), lengths: new Set() }));
      }
      d.n += 1;
      if (f.mode) d.modes.add(f.mode);
      if (f.length) d.lengths.add(f.length);
    }
  }
  return out;
}

/** The file rows the baseline keeps: what was decided, never the per-case readings. */
export function slim(files) {
  return files.map(({ name, family, fields, skipped, findings, readings }) => ({
    name,
    family,
    fields,
    skipped: skipped ?? null,
    cases: Array.isArray(readings) ? readings.length : 0,
    findings: findings ?? [],
  }));
}

/** Compare tonight with the recent green runs, newest first. None means there is none yet. */
/** FILES WHOSE FINDINGS FLIP FROM RUN TO RUN ON ONE TREE, reported every night and never judged.
 *  The vote band's line sits in a state layer whose room is measured either side of its first
 *  reveal, so two sweeps of the same commit disagreed on it - and only on it - after the sweep
 *  itself was made deterministic (issue #778, "vote band height"). Take a file off once its rest
 *  pose is stable, or it hides a real regression there. */
export const UNSTABLE = new Set(['illustrator-live-vote-band']);

export function judge(current, baselines = []) {
  const now = defects(current);
  const swept = (files) => new Set(files.filter((f) => !f.skipped).map((f) => f.name));
  const sweptNow = swept(current);
  const before = defects(baselines.flat());
  const sweptBefore = swept(baselines.flat());
  const newest = baselines[0] ?? [];
  const regressions = [];
  const unjudged = [];
  for (const [key, d] of now) {
    if (before.has(key)) continue;
    (sweptBefore.has(d.file) && !UNSTABLE.has(d.file) ? regressions : unjudged).push(d);
  }
  const fixed = [...defects(newest)].filter(([key, d]) => !now.has(key) && sweptNow.has(d.file)).map(([, d]) => d);
  const lost = [...swept(newest)].filter((name) => !sweptNow.has(name));
  return { now, regressions, unjudged, fixed, lost, compared: baselines.length };
}

const list = (s) => [...s].join(', ') || '-';
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The run's summary as markdown, written to the job page. */
/** THE ONE PASS/FAIL RULE, read by the heading and the exit code alike. `missing` is how many
 *  shards sent nothing. */
export function fails({ current, verdict, missing, accepted }) {
  if (!current.length || missing > 0) return true;
  return !accepted && (verdict.regressions.length > 0 || verdict.lost.length > 0);
}

export function summary({ current, verdict, missing, accepted }) {
  const swept = current.filter((f) => !f.skipped);
  const cases = current.reduce((n, f) => n + (Array.isArray(f.readings) ? f.readings.length : f.cases ?? 0), 0);
  const lines = [];
  const failing = fails({ current, verdict, missing, accepted });
  lines.push(`## Fit sweep: ${failing ? 'regressions' : accepted ? 'baseline recorded' : 'no regressions'}`);
  lines.push('');
  lines.push(
    `${swept.length} files swept (${current.length - swept.length} skipped), ${cases} cases, ` +
      `${verdict.now.size} known defect${verdict.now.size === 1 ? '' : 's'}.` +
      (verdict.compared
        ? ` Compared with the last ${verdict.compared} green run${verdict.compared === 1 ? '' : 's'}.`
        : ' No earlier green run to compare with, so tonight is the baseline.'),
  );
  if (accepted) lines.push('', 'Dispatched with `accept`: tonight is recorded as the baseline and not judged.');
  if (missing > 0) lines.push('', `**Shards that sent no results:** ${missing}.`);
  if (verdict.lost.length) {
    lines.push('', `**Swept last time, not tonight:** ${verdict.lost.join(', ')}.`);
    for (const name of verdict.lost) {
      const why = current.find((f) => f.name === name)?.skipped;
      if (why) lines.push(`- ${name}: ${why}`);
    }
  }
  const table = (title, rows) => {
    if (!rows.length) return;
    lines.push('', `### ${title} (${rows.length})`, '', '| File | Field | Defect | Cases | Options | Lengths |', '|---|---|---|---|---|---|');
    for (const d of rows) {
      lines.push(`| ${d.file} | ${d.field || '-'} | ${cell(d.example)} | ${d.n} | ${list(d.modes)} | ${list(d.lengths)} |`);
    }
  };
  table('New: no recent green run had these', verdict.regressions);
  table('On files new to the corpus or known to flip (not judged)', verdict.unjudged);
  table('Gone since the last green run', verdict.fixed);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const values = (name) => {
    const at = argv.indexOf(name);
    if (at < 0) return [];
    const out = [];
    for (let i = at + 1; i < argv.length && !argv[i].startsWith('--'); i += 1) out.push(argv[i]);
    return out;
  };
  const one = (name) => values(name)[0] ?? null;
  const shards = Number(one('--shards') ?? 0);
  const files = values('--current').filter((p) => existsSync(p));
  const baselinePaths = values('--baseline').filter((p) => existsSync(p));
  const accepted = argv.includes('--accept');

  const current = files.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
  const missing = Math.max(0, shards - files.length);
  const baselines = baselinePaths.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const verdict = judge(current, baselines);
  const text = summary({ current, verdict, missing, accepted });
  process.stdout.write(text);
  const summaryPath = one('--summary');
  if (summaryPath) appendFileSync(summaryPath, text);
  const out = one('--out');
  if (out) writeFileSync(out, `${JSON.stringify(slim(current), null, 2)}\n`);
  return fails({ current, verdict, missing, accepted }) ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
