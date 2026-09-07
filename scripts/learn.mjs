#!/usr/bin/env node
// The write path for a lesson (docs/WORKFLOW_ARCHITECTURE.md §5.3).
//
//   npm run learn -- --area wizard --scope "src/components/wizard/**" --kind trap \
//       --rule "An input-only value lives in a holder carrying \`class=\"noacg-data-source\"\`, never an inline style." \
//       --evidence "On this branch the raw duration aired because ..." [--fires hook:guard-edit]
//       [--supersedes wizard/old-rule] [--distinct] [--allow-numbers] [--dry-run]
//
// It writes ONE new rule file and ONE new record file, both with names nobody else will choose,
// so twelve sessions can learn twelve things without touching a shared file. What it refuses,
// and why, is the point:
//
//   - rule text carrying a date, a run id or a measurement: that is evidence, it goes in the
//     record, and the rule stays a rule;
//   - a rule that reads as one already in the store: the evidence is appended to THAT rule's
//     record and no new rule is written - the answer to "we keep learning the same thing" is
//     one rule with more receipts, not a second rule. `--distinct` says "no, this is a different
//     rule" and `--supersedes <id>` says "this replaces that one"; both are recorded;
//   - a `fires:` naming a hook, gate or spec that does not exist: land the mechanism first, or
//     declare `fires: contract` and let the compiler's report list it as mechanism-wanted.
//
// Then it recompiles, so the commit carries the rule, the record and the regenerated contracts.
// Validation is `parseRule` + `validateAgainstTree` over the file this would write, so the
// command and the compiler cannot disagree about what a rule is.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DUPLICATE_THRESHOLD, FORMAT_VERSION, loadRules, nearest, parseRule, RECORDS_DIR, RULES_DIR, validateAgainstTree,
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
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return '';
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Render the rule file - the one shape `parseRule` reads back. */
export function renderRule({ scope, kind, fires, since, supersedes, record, allowNumbers, rule }) {
  const lines = ['---', `v: ${FORMAT_VERSION}`, `scope: ${scope.join(', ')}`, `kind: ${kind}`, `fires: ${fires}`, 'status: active', `since: ${since}`];
  if (supersedes.length > 0) lines.push(`supersedes: ${supersedes.join(', ')}`);
  if (record) lines.push(`record: ${record}`);
  if (allowNumbers) lines.push('allow-numbers: true');
  lines.push('---', rule.trim(), '');
  return lines.join('\n');
}

export function renderRecord({ id, date, evidence, branch, sha }) {
  return [`# ${id}`, '', `Rule: \`${id}\`. ${stampLine(date, branch, sha)}`, '', evidence.trim(), ''].join('\n');
}

const stampLine = (date, branch, sha) => `Recorded ${date}${branch ? ` on \`${branch}\`` : ''}${sha ? ` at ${sha}` : ''}.`;

/**
 * Decide what a lesson becomes. Pure: takes the parsed arguments and the loaded rules, returns
 * { action: 'new' | 'append' | 'refuse', ... }. The CLI does the writing.
 */
export function decide({ area, scope, kind, fires, rule, supersedes, allowNumbers, distinct = false }, rules, root = ROOT) {
  const problems = [];
  if (!area || !/^[a-z0-9-]+$/.test(area)) problems.push('--area is required: a lowercase name like wizard, templates, e2e, landing');
  if (!rule) problems.push('--rule is required: one to three imperative sentences');
  for (const id of supersedes) {
    if (!rules.some((r) => r.id === id)) problems.push(`--supersedes ${id}: no such rule`);
  }
  const id = `${area || 'area'}/${slugOf(rule)}`;
  const text = renderRule({ scope, kind, fires, since: today(), supersedes, record: '', allowNumbers, rule: rule || '' });
  const parsed = parseRule(`${RULES_DIR}/${id}.md`, text);
  problems.push(...parsed.problems.map((p) => p.replace(`${RULES_DIR}/${id}.md: `, '')));
  if (parsed.rule) problems.push(...validateAgainstTree(parsed.rule, root).map((p) => p.replace(`${RULES_DIR}/${id}.md: `, '')));
  if (problems.length > 0) return { action: 'refuse', problems: [...new Set(problems)] };

  const match = nearest(rules, rule);
  if (match && match.score >= DUPLICATE_THRESHOLD && supersedes.length === 0 && !distinct) {
    return { action: 'append', rule: match.rule, score: match.score };
  }
  if (rules.some((r) => r.id === id)) {
    return { action: 'refuse', problems: [`a rule ${id} already exists and reads differently - say --supersedes ${id}, or reword the rule`] };
  }
  return { action: 'new', id, text, nearest: match };
}

function recordPathFor(id, date) {
  const [area, slug] = id.split('/');
  return `${RECORDS_DIR}/${area}/${date}-${slug}.md`;
}

function writeText(rel, text) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

/** Read a store file with CRLF normalised, so a converting checkout edits like a plain one. */
const readStore = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function appendEvidence(verdict, input, ctx) {
  const { rule } = verdict;
  const record = rule.record || recordPathFor(rule.id, ctx.date);
  console.log(`${LABEL} already a rule: ${rule.id} (similarity ${verdict.score.toFixed(2)})`);
  console.log(`  ${rule.body}`);
  if (!input.evidence) {
    console.log('  Nothing new to record. If this IS a different rule, say --distinct (or --supersedes <id>).');
    return;
  }
  if (ctx.dryRun) {
    console.log(`  would append the evidence to ${record}`);
    return;
  }
  if (!existsSync(path.join(ROOT, record))) {
    writeText(record, renderRecord({ id: rule.id, date: ctx.date, evidence: input.evidence, branch: ctx.branch, sha: ctx.sha }));
  } else {
    writeText(record, `${readStore(record).trimEnd()}\n\n## ${stampLine(ctx.date, ctx.branch, ctx.sha)}\n\n${input.evidence}\n`);
  }
  if (!rule.record) {
    const text = readStore(rule.path);
    const end = text.indexOf('\n---\n', 4);
    writeText(rule.path, `${text.slice(0, end)}\nrecord: ${record}${text.slice(end)}`);
  }
  console.log(`  evidence appended to ${record}`);
}

function writeNewRule(verdict, input, ctx) {
  const { id } = verdict;
  const rulePath = `${RULES_DIR}/${id}.md`;
  const record = input.evidence ? recordPathFor(id, ctx.date) : '';
  const text = renderRule({ ...input, since: ctx.date, record });
  if (verdict.nearest && verdict.nearest.score > 0) {
    console.log(`${LABEL} nearest existing rule: ${verdict.nearest.rule.id} (similarity ${verdict.nearest.score.toFixed(2)}) - kept separate`);
  }
  if (ctx.dryRun) {
    console.log(`${LABEL} would write ${rulePath}${record ? ` and ${record}` : ''}:`);
    console.log(text);
    return;
  }
  if (record) writeText(record, renderRecord({ id, date: ctx.date, evidence: input.evidence, branch: ctx.branch, sha: ctx.sha }));
  for (const old of input.supersedes) {
    const target = ctx.rules.find((r) => r.id === old);
    writeText(target.path, readStore(target.path).replace(/^status: active$/m, 'status: retired'));
  }
  writeText(rulePath, text);
  const compiled = plan(ROOT);
  if (compiled.problems.length > 0) {
    console.error(`${LABEL} wrote ${rulePath}, but the store no longer compiles:`);
    for (const p of compiled.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  write(compiled.outputs, ROOT, compiled.owned);
  console.log(`${LABEL} wrote ${rulePath}${record ? ` and ${record}` : ''}, and recompiled the contracts.`);
  console.log('  Commit the rule, the record and the regenerated files together.');
}

function main() {
  const args = process.argv.slice(2);
  const input = {
    area: arg(args, '--area'),
    scope: (arg(args, '--scope') ?? '').split(/,(?![^{]*\})/).map((s) => s.trim()).filter(Boolean),
    kind: arg(args, '--kind') ?? 'rule',
    fires: arg(args, '--fires') ?? 'contract',
    rule: (arg(args, '--rule') ?? '').trim(),
    evidence: (arg(args, '--evidence') ?? '').trim(),
    supersedes: (arg(args, '--supersedes') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    allowNumbers: args.includes('--allow-numbers'),
    distinct: args.includes('--distinct'),
  };
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
  const ctx = {
    rules,
    date: today(),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    sha: git(['rev-parse', '--short', 'HEAD']),
    dryRun: args.includes('--dry-run'),
  };
  if (verdict.action === 'append') appendEvidence(verdict, input, ctx);
  else writeNewRule(verdict, input, ctx);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
