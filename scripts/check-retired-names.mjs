#!/usr/bin/env node
// gate: build
// guards: contracts/retired.json, **/AGENTS.md, **/CLAUDE.md, .agent-workflows/**, .claude/rules/**, .claude/agents/**, .claude/commands/**, .agents/skills/**, contracts/rules/**
//
// A RETIRED MECHANISM CANNOT SURVIVE ONE BUILD AS AN INSTRUCTION.
//
//   node scripts/check-retired-names.mjs        # part of `npm run build`
//
// WHY. When the merge queue replaced the laptop lander (docs/WORKFLOW_ARCHITECTURE.md §5.2) the
// orchestrator contract kept telling its rows to read `auto-merge.mjs` refusals, to quote
// `merge-order` verdicts as a landing order, and to fall back to the safe-merge workflow - for two
// days, across nine files, while every landing went through GitHub. The freshness gate could not
// see it: every script it named still existed. What had changed was the MEANING of the name, and
// only a list of retired names can carry that. This is the negative check §5.3 designs.
//
// WHAT IT CHECKS. `contracts/retired.json` lists each retired mechanism with a regular expression,
// the date, the replacement and the reason. Every instruction file is read paragraph by paragraph
// (blank-line separated), and a paragraph matching a pattern fails unless it says in its own words
// that the mechanism is history - one of HISTORY_WORDS: "retired", "no longer", "used to",
// "until <year>", or "never" (a prohibition is the retirement rule itself). The grain is the
// paragraph because prose wraps: the word that makes a sentence history is often on the line
// before the name. A paragraph is coarse on purpose - a live instruction hiding beside a "never"
// in the same paragraph is a paragraph that needed splitting anyway.
//
// WHAT IT SCANS. The loaded and invoked instruction surface: every AGENTS.md and CLAUDE.md, the
// workflows and their modules, the rule store and what it compiles to, the agent definitions and
// the command adapters. NOT scanned: `contracts/records/` (frozen evidence, a retired name is the
// point), the orchestrator's incidents module (the evidence behind its rules, which phase 2b moves
// to records), and `docs/` (not loaded; the freshness gate does not scan it either).
//
// It fails CLOSED: it names the file, the line, the retired mechanism and its replacement.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const RETIRED_FILE = 'contracts/retired.json';

/** A paragraph naming a retired mechanism passes when it carries one of these. */
export const HISTORY_WORDS = /\b(retired|no longer|used to|until 20\d\d|never)\b/i;

/** Files that exist to hold evidence, where a retired name is the record and not an instruction. */
export const EVIDENCE_FILES = Object.freeze(['.agent-workflows/orchestrator/incidents.md']);

/** Read and validate the retired list. Throws with every defect named, so a bad entry never passes as "no match". */
export function loadRetired(text) {
  const parsed = JSON.parse(text);
  const problems = [];
  const entries = Array.isArray(parsed.retired) ? parsed.retired : [];
  if (!Array.isArray(parsed.retired)) problems.push('`retired` must be an array');
  const out = [];
  entries.forEach((entry, index) => {
    const where = `retired[${index}]${entry?.name ? ` (${entry.name})` : ''}`;
    for (const field of ['name', 'pattern', 'since', 'replacement', 'why']) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') problems.push(`${where}: \`${field}\` is required`);
    }
    if (typeof entry?.since === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(entry.since)) problems.push(`${where}: \`since\` must be YYYY-MM-DD`);
    let regex = null;
    try {
      regex = new RegExp(entry.pattern, 'i');
    } catch (error) {
      problems.push(`${where}: \`pattern\` does not compile - ${error.message}`);
    }
    if (regex) out.push({ ...entry, regex });
  });
  if (problems.length) throw new Error(`${RETIRED_FILE} is malformed:\n  - ${problems.join('\n  - ')}`);
  return out;
}

/** Split a text into paragraphs, each with the 1-indexed line its first line sits on. */
export function paragraphs(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let current = null;
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      if (current) out.push(current);
      current = null;
      return;
    }
    if (!current) current = { line: index + 1, lines: [] };
    current.lines.push(line);
  });
  if (current) out.push(current);
  return out.map((p) => ({ line: p.line, text: p.lines.join('\n') }));
}

/**
 * The findings for one file's text, pure: every paragraph that names a retired mechanism as an
 * instruction. `line` is the line the match itself is on, so the finding is clickable.
 */
export function findRetired(text, retired) {
  const findings = [];
  for (const paragraph of paragraphs(text)) {
    if (HISTORY_WORDS.test(paragraph.text)) continue;
    for (const entry of retired) {
      const match = entry.regex.exec(paragraph.text);
      if (!match) continue;
      const before = paragraph.text.slice(0, match.index);
      const line = paragraph.line + (before.match(/\n/g) ?? []).length;
      findings.push({ line, name: entry.name, replacement: entry.replacement, excerpt: match[0] });
    }
  }
  return findings;
}

/** The instruction files to scan, asked of git so the verdict matches CI's clean checkout. */
function instructionFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean).filter((file) =>
    file.endsWith('.md') && !EVIDENCE_FILES.includes(file) && (
      /(^|\/)(AGENTS|CLAUDE)\.md$/.test(file)
      || file.startsWith('.agent-workflows/')
      || file.startsWith('.claude/rules/')
      || file.startsWith('.claude/agents/')
      || file.startsWith('.claude/commands/')
      || file.startsWith('.agents/skills/')
      || (file.startsWith('contracts/') && !file.startsWith('contracts/records/'))
    ));
}

function main() {
  const retired = loadRetired(readFileSync(resolve(ROOT, RETIRED_FILE), 'utf8'));
  const failures = [];
  let scanned = 0;
  for (const file of instructionFiles()) {
    scanned += 1;
    for (const finding of findRetired(readFileSync(resolve(ROOT, file), 'utf8'), retired)) {
      failures.push(`${file}:${finding.line}: names retired "${finding.name}" (\`${finding.excerpt}\`) as an instruction - replacement: ${finding.replacement}`);
    }
  }
  if (failures.length) {
    console.error(`Retired names FAILED - ${failures.length} paragraph(s) across ${scanned} instruction file(s) still instruct a retired mechanism (${RETIRED_FILE}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('  A paragraph that names one as history says so in its own words: retired, no longer, used to, until <year>, never.');
    process.exit(1);
  }
  console.log(`Retired names OK: ${scanned} instruction file(s), ${retired.length} retired mechanism(s), none instructed.`);
}

const isEntrypoint = Boolean(process.argv[1])
  && resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();
if (isEntrypoint) main();
