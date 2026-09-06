#!/usr/bin/env node
// Hand-written contracts may not GROW evidence (docs/WORKFLOW_ARCHITECTURE.md phase 0).
//
//   node scripts/check-contract-evidence.mjs           # part of `npm run build`
//   node scripts/check-contract-evidence.mjs --write   # refresh the baseline after a cut
//
// WHY. Every lesson a session learned used to become a paragraph in the nearest AGENTS.md, with
// its date, its run id and its measurement. Measured 2026-09-06: the contract corpus grows about
// 8 KB a day and a quarter to a half of it, depending on the unit, is paragraphs carrying such
// evidence. The write path for a lesson is now `npm run learn` (a rule file plus a record file,
// neither loaded), so a hand-written contract has no reason to gain another dated paragraph.
//
// HOW. The same shape as scripts/check-copy.mjs: a per-file COUNT of evidence-bearing paragraphs
// is frozen in scripts/contract-evidence-baseline.json, and the gate refuses any file whose count
// went UP. A count that went DOWN is a stale baseline, refused too, with `--write` as the answer,
// so the number only ever ratchets towards zero. A paragraph counts when it carries a date, a run
// id or a measurement (scripts/contracts-lib.mjs EVIDENCE_PATTERNS). This is a limit on growth,
// not a judgement on what is there: the migration (phase 2b) is what empties the files.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { EVIDENCE_PATTERNS } from './contracts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'contract-evidence-baseline.json');
const LABEL = '[check-contract-evidence]';

/** Blank-line paragraphs of a contract that carry evidence. */
export function evidenceParagraphs(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .filter((paragraph) => EVIDENCE_PATTERNS.some(({ regex }) => regex.test(paragraph)));
}

/** The hand-written contracts: every tracked AGENTS.md and CLAUDE.md. */
export function contractFiles(root = ROOT) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter((f) => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(f)).sort();
}

export function measure(root = ROOT) {
  const counts = {};
  for (const file of contractFiles(root)) {
    const n = evidenceParagraphs(readFileSync(path.join(root, file), 'utf8')).length;
    if (n > 0) counts[file] = n;
  }
  return counts;
}

/** Files whose count moved, and in which direction. Exact in both directions, like check-copy. */
export function compare(baseline, actual) {
  const grew = [];
  const shrank = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(actual)])) {
    const was = baseline[file] ?? 0;
    const now = actual[file] ?? 0;
    if (now > was) grew.push({ file, was, now });
    else if (now < was) shrank.push({ file, was, now });
  }
  return { grew, shrank };
}

function main() {
  const actual = measure();
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    console.log(`${LABEL} baseline written: ${Object.keys(actual).length} file(s) carry evidence paragraphs`);
    return;
  }
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  const { grew, shrank } = compare(baseline, actual);
  if (grew.length === 0 && shrank.length === 0) {
    const total = Object.values(actual).reduce((a, b) => a + b, 0);
    console.log(`${LABEL} OK - ${total} evidence paragraph(s) across ${Object.keys(actual).length} contract(s), none new`);
    return;
  }
  if (grew.length > 0) {
    console.error(`${LABEL} a hand-written contract gained evidence:`);
    for (const { file, was, now } of grew) console.error(`  - ${file}: ${was} -> ${now} paragraph(s) carrying a date, run id or measurement`);
    console.error('  Dates, run ids and measurements are evidence. Record the lesson with `npm run learn -- ...` instead:');
    console.error('  the rule goes to contracts/rules/, the evidence to contracts/records/, and neither loads into every session.');
  }
  if (shrank.length > 0) {
    console.error(`${LABEL} the baseline is stale (a contract lost evidence - good). Refresh it:`);
    for (const { file, was, now } of shrank) console.error(`  - ${file}: ${was} -> ${now}`);
    console.error('  node scripts/check-contract-evidence.mjs --write');
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
