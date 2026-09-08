#!/usr/bin/env node
// gate: build
// guards: contracts/**, **/AGENTS.md, **/CLAUDE.md, .agent-workflows/**, .claude/rules/**, .claude/agents/**, .claude/commands/**, .agents/skills/**
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
// (blank-line separated) with its lines joined, so a sentence that wraps stays one sentence, and a
// SENTENCE matching a pattern fails unless it says in its own words that the mechanism is history -
// one of HISTORY_WORDS: "retired", "no longer", "used to", "until <year>", or "never" (a
// prohibition is the retirement rule itself). The grain is the sentence, not the paragraph: "never"
// is this repository's ordinary imperative word, and a paragraph grain let one unrelated "never"
// hide every other sentence beside it - a quarter of the surface, measured on the first sweep.
//
// WHAT IT SCANS. The loaded and invoked instruction surface (`isInstructionFile`): every AGENTS.md
// and CLAUDE.md, the workflows and their modules, the rule store and what it compiles to, the
// agent definitions and the command adapters. NOT scanned: `contracts/records/` (frozen evidence, a
// retired name is the point), the orchestrator's incidents module (the evidence behind its rules,
// which phase 2b moves to records), and `docs/` (not loaded; the freshness gate does not scan it
// either).
//
// It fails CLOSED: it names the file, the line, the retired mechanism, its replacement and why.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryFiles } from './gates.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RETIRED_FILE = 'contracts/retired.json';

/** A sentence naming a retired mechanism passes when it carries one of these. */
export const HISTORY_WORDS = /\b(retired|no longer|used to|until 20\d\d|never)\b/i;

/** Files that exist to hold evidence, where a retired name is the record and not an instruction. */
const EVIDENCE_FILES = new Set(['.agent-workflows/orchestrator/incidents.md']);

/** Where a sentence ends: a terminal mark followed by whitespace or the end of the text. */
const SENTENCE_END = /[.!?](?=\s|$)/g;

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
      regex = new RegExp(entry.pattern, 'gi');
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

/** The sentence of `text` that contains offset `at`: from the previous sentence end to the next. */
export function sentenceAround(text, at) {
  let start = 0;
  let end = text.length;
  for (const mark of text.matchAll(SENTENCE_END)) {
    if (mark.index < at) start = mark.index + 1;
    else {
      end = mark.index + 1;
      break;
    }
  }
  return text.slice(start, end).trim();
}

/**
 * The findings for one file's text, pure: every sentence that names a retired mechanism as an
 * instruction. `line` is the line the match itself is on, so the finding is clickable. One
 * finding per sentence and mechanism, however many times the sentence names it.
 */
export function findRetired(text, retired) {
  const findings = [];
  for (const paragraph of paragraphs(text)) {
    for (const entry of retired) {
      const seen = new Set();
      for (const match of paragraph.text.matchAll(entry.regex)) {
        const sentence = sentenceAround(paragraph.text, match.index);
        if (HISTORY_WORDS.test(sentence) || seen.has(sentence)) continue;
        seen.add(sentence);
        const line = paragraph.line + (paragraph.text.slice(0, match.index).match(/\n/g) ?? []).length;
        findings.push({ line, name: entry.name, replacement: entry.replacement, why: entry.why, excerpt: match[0] });
      }
    }
  }
  return findings;
}

/** Is this repository path part of the loaded or invoked instruction surface? */
export function isInstructionFile(file) {
  if (!file.endsWith('.md') || EVIDENCE_FILES.has(file)) return false;
  return /(^|\/)(AGENTS|CLAUDE)\.md$/.test(file)
    || file.startsWith('.agent-workflows/')
    || file.startsWith('.claude/rules/')
    || file.startsWith('.claude/agents/')
    || file.startsWith('.claude/commands/')
    || file.startsWith('.agents/skills/')
    || (file.startsWith('contracts/') && !file.startsWith('contracts/records/'));
}

function main() {
  const retired = loadRetired(readFileSync(resolve(ROOT, RETIRED_FILE), 'utf8'));
  const failures = [];
  let scanned = 0;
  for (const file of repositoryFiles().filter(isInstructionFile)) {
    // Retiring a mechanism IS the deletion case: `git ls-files --cached` still lists a file deleted
    // from the worktree but not yet staged, and a gate that crashes on it names nothing.
    const path = resolve(ROOT, file);
    if (!existsSync(path)) continue;
    scanned += 1;
    for (const finding of findRetired(readFileSync(path, 'utf8'), retired)) {
      failures.push(
        `${file}:${finding.line}: names retired "${finding.name}" (\`${finding.excerpt}\`) as an instruction.\n`
        + `      replacement: ${finding.replacement}\n      why: ${finding.why}`,
      );
    }
  }
  if (failures.length) {
    console.error(`Retired names FAILED - ${failures.length} sentence(s) across ${scanned} instruction file(s) still instruct a retired mechanism (${RETIRED_FILE}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('  A sentence that names one as history says so in its own words: retired, no longer, used to, until <year>, never.');
    process.exit(1);
  }
  console.log(`Retired names OK: ${scanned} instruction file(s), ${retired.length} retired mechanism(s), none instructed.`);
}

const isEntrypoint = Boolean(process.argv[1])
  && resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();
if (isEntrypoint) main();
