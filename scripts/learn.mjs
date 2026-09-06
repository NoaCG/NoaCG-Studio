#!/usr/bin/env node
// The write path for a lesson (docs/WORKFLOW_ARCHITECTURE.md §5.3).
//
//   npm run learn -- --area wizard --scope "src/components/wizard/**" --kind trap \
//       --rule "An input-only value lives in a holder carrying \`class=\"noacg-data-source\"\`, never an inline style." \
//       --evidence "On this branch the raw duration aired because ..." [--fires hook:guard-edit]
//       [--supersedes wizard/old-rule] [--allow-numbers] [--dry-run]
//
// It writes ONE new rule file and ONE new record file, both with names nobody else will choose,
// so twelve sessions can learn twelve things without touching a shared file. What it refuses,
// and why, is the point:
//
//   - rule text carrying a date, a run id or a measurement: that is evidence, it goes in the
//     record, and the rule stays a rule;
//   - a rule that reads as one already in the store: the evidence is appended to THAT rule's
//     record and no new rule is written - the answer to "we keep learning the same thing" is
//     one rule with more receipts, not a second rule;
//   - a `fires:` naming a hook, gate or spec that does not exist: land the mechanism first, or
//     declare `fires: contract` and let the compiler's report list it as mechanism-wanted.
//
// Then it recompiles, so the commit carries the rule, the record and the regenerated contracts.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DUPLICATE_THRESHOLD, evidenceProblems, KINDS, loadRules, mechanismPath, nearest, RECORDS_DIR, RULES_DIR,
} from './contracts-lib.mjs';
import { plan, write } from './compile-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[learn]';

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const SLUG_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'are', 'was', 'its', 'not', 'one', 'when']);

/** Six significant words of the rule, kebab-cased - a slug a second session will not mint. */
export function slugOf(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/`[^`]*`/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !SLUG_STOPWORDS.has(w))
    .slice(0, 6);
  return words.join('-') || 'rule';
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Render the rule file. Exported so the test can pin the shape the compiler parses. */
export function renderRule({ scope, kind, fires, since, supersedes, record, allowNumbers, rule }) {
  const lines = ['---', `scope: ${scope.join(', ')}`, `kind: ${kind}`, `fires: ${fires}`, 'status: active', `since: ${since}`];
  if (supersedes.length > 0) lines.push(`supersedes: ${supersedes.join(', ')}`);
  if (record) lines.push(`record: ${record}`);
  if (allowNumbers) lines.push('allow-numbers: true');
  lines.push('---', rule.trim(), '');
  return lines.join('\n');
}

export function renderRecord({ id, date, evidence, branch, sha }) {
  return [
    `# ${id}`,
    '',
    `Rule: \`${id}\`. Recorded ${date}${branch ? ` on \`${branch}\`` : ''}${sha ? ` at ${sha}` : ''}.`,
    '',
    evidence.trim(),
    '',
  ].join('\n');
}

/**
 * Decide what a lesson becomes. Pure: takes the parsed arguments and the loaded rules, returns
 * { action: 'new' | 'append' | 'refuse', ... }. The CLI does the writing.
 */
export function decide({ area, scope, kind, fires, rule, supersedes, allowNumbers }, rules, root = ROOT) {
  const problems = [];
  if (!area || !/^[a-z0-9-]+$/.test(area)) problems.push('--area is required: a lowercase name like wizard, templates, e2e, landing');
  if (scope.length === 0) problems.push('--scope is required: comma-separated globs, or ** for everywhere');
  if (!KINDS.includes(kind)) problems.push(`--kind must be one of ${KINDS.join(', ')}`);
  if (!rule) problems.push('--rule is required: one to three imperative sentences');
  if (rule && rule.length > 600) problems.push('--rule is longer than three sentences worth; put the reasoning in --evidence');
  if (rule) problems.push(...evidenceProblems(rule, '--rule', allowNumbers));
  const mechanism = mechanismPath(fires);
  if (fires !== 'contract' && !mechanism) problems.push('--fires must be contract, hook:<name>, gate:<script> or test:<spec path>');
  if (mechanism && !existsSync(path.join(root, mechanism))) {
    problems.push(`--fires ${fires} names ${mechanism}, which does not exist - land the mechanism first, or use --fires contract`);
  }
  for (const id of supersedes) {
    if (!rules.some((r) => r.id === id)) problems.push(`--supersedes ${id}: no such rule`);
  }
  if (problems.length > 0) return { action: 'refuse', problems };

  const match = supersedes.length > 0 ? null : nearest(rules, rule);
  if (match && match.score >= DUPLICATE_THRESHOLD) {
    return { action: 'append', rule: match.rule, score: match.score };
  }
  const id = `${area}/${slugOf(rule)}`;
  if (rules.some((r) => r.id === id)) return { action: 'refuse', problems: [`a rule ${id} already exists and reads differently - say --supersedes ${id}, or reword the rule`] };
  return { action: 'new', id, nearest: match };
}

function recordPathFor(id, date) {
  const [area, slug] = id.split('/');
  return `${RECORDS_DIR}/${area}/${date}-${slug}.md`;
}

function main() {
  const args = process.argv.slice(2);
  const input = {
    area: arg(args, '--area'),
    scope: (arg(args, '--scope') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    kind: arg(args, '--kind') ?? 'rule',
    fires: arg(args, '--fires') ?? 'contract',
    rule: (arg(args, '--rule') ?? '').trim(),
    evidence: (arg(args, '--evidence') ?? '').trim(),
    supersedes: (arg(args, '--supersedes') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowNumbers: args.includes('--allow-numbers'),
  };
  const dryRun = args.includes('--dry-run');
  const { rules, problems: storeProblems } = loadRules(ROOT);
  if (storeProblems.length > 0) {
    console.error(`${LABEL} the store has problems; fix them first (npm run check:contracts):`);
    for (const p of storeProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const verdict = decide(input, rules);
  if (verdict.action === 'refuse') {
    console.error(`${LABEL} refused:`);
    for (const p of verdict.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const date = today();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const sha = git(['rev-parse', '--short', 'HEAD']);

  if (verdict.action === 'append') {
    const { rule } = verdict;
    const record = rule.record || recordPathFor(rule.id, date);
    console.log(`${LABEL} already a rule: ${rule.id} (similarity ${verdict.score.toFixed(2)})`);
    console.log(`  ${rule.body}`);
    if (!input.evidence) {
      console.log('  Nothing new to record. If this is a DIFFERENT rule, reword it or say --supersedes.');
      return;
    }
    if (dryRun) {
      console.log(`  would append the evidence to ${record}`);
      return;
    }
    const file = path.join(ROOT, record);
    mkdirSync(path.dirname(file), { recursive: true });
    if (!existsSync(file)) writeFileSync(file, renderRecord({ id: rule.id, date, evidence: input.evidence, branch, sha }), 'utf8');
    else appendFileSync(file, `\n## ${date}${branch ? ` on \`${branch}\`` : ''}${sha ? ` at ${sha}` : ''}\n\n${input.evidence}\n`, 'utf8');
    if (!rule.record) {
      const ruleFile = path.join(ROOT, rule.path);
      const text = readFileSync(ruleFile, 'utf8').replace(/\n---\n/, `\nrecord: ${record}\n---\n`);
      writeFileSync(ruleFile, text, 'utf8');
    }
    console.log(`  evidence appended to ${record}`);
    return;
  }

  const { id } = verdict;
  const rulePath = `${RULES_DIR}/${id}.md`;
  const record = input.evidence ? recordPathFor(id, date) : '';
  const ruleText = renderRule({ ...input, since: date, record });
  if (verdict.nearest) {
    console.log(`${LABEL} nearest existing rule: ${verdict.nearest.rule.id} (similarity ${verdict.nearest.score.toFixed(2)}) - kept separate`);
  }
  if (dryRun) {
    console.log(`${LABEL} would write ${rulePath}${record ? ` and ${record}` : ''}:`);
    console.log(ruleText);
    return;
  }
  mkdirSync(path.dirname(path.join(ROOT, rulePath)), { recursive: true });
  if (record) {
    mkdirSync(path.dirname(path.join(ROOT, record)), { recursive: true });
    writeFileSync(path.join(ROOT, record), renderRecord({ id, date, evidence: input.evidence, branch, sha }), 'utf8');
  }
  for (const old of input.supersedes) {
    const target = rules.find((r) => r.id === old);
    const file = path.join(ROOT, target.path);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^status: active$/m, 'status: retired'), 'utf8');
  }
  writeFileSync(path.join(ROOT, rulePath), ruleText, 'utf8');
  const compiled = plan(ROOT);
  if (compiled.problems.length > 0) {
    console.error(`${LABEL} wrote ${rulePath}, but the store no longer compiles:`);
    for (const p of compiled.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  write(compiled.outputs, ROOT);
  console.log(`${LABEL} wrote ${rulePath}${record ? ` and ${record}` : ''}, and recompiled the contracts.`);
  console.log('  Commit the rule, the record and the regenerated files together.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
