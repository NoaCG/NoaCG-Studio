#!/usr/bin/env node
// gate: build
// guards: docs/GOALS.md, docs/whats-new/roadmap.md
//
// THE PUBLIC ROADMAP IS BUILT FROM docs/GOALS.md, so it cannot fall out of step with it.
//
//   node scripts/roadmap.mjs --check        fail when GOALS and the roadmap's wording disagree
//                                           (run by `npm run build`, and by the page's Vite
//                                           plugin, which builds /roadmap from the same two files)
//   node scripts/roadmap.mjs                print the roadmap as the page will show it
//
// WHY THIS SHAPE. GOALS is the one direction document, and it holds a hard line budget, internal
// plan names and current-state detail no visitor should read. A hand-kept public copy of it
// would drift the first time a priority moved and nobody remembered the page. So the two jobs are
// split: GOALS decides WHERE each outcome stands (its heading's now, next or later), and
// docs/whats-new/roadmap.md only says each outcome in plain words. Placement is computed at
// build; the wording is checked against GOALS's outcome list and titles, so an added, removed or
// renamed outcome fails the build until somebody has re-read the words that describe it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';
import { bulletProblems } from './whats-new.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GOALS_FILE = path.join(ROOT, 'docs', 'GOALS.md');
export const WORDING_FILE = path.join(ROOT, 'docs', 'whats-new', 'roadmap.md');

export const BUCKETS = ['now', 'next', 'later'];

/** Pure: GOALS's outcomes - number, title, and the priorities its heading names, first = its own. */
export function goalsOutcomes(goalsText) {
  const lines = String(goalsText).split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Outcomes\s*$/.test(l));
  if (start < 0) return [];
  const outcomes = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = /^###\s+(\d+)\.\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const paren = /^(.*?)\s*\(([^()]*)\)$/.exec(m[2]);
    const title = paren ? paren[1] : m[2];
    // The priority is the heading's parenthesis ("(now, with a high-priority next milestone)");
    // a heading without one ("Later and parked") says it in its title.
    const words = (paren ? paren[2] : m[2]).toLowerCase().match(/\b(now|next|later)\b/g) ?? [];
    outcomes.push({ number: Number(m[1]), title, buckets: [...new Set(words)] });
  }
  return outcomes;
}

/** Pure: the wording file's entries - `## N. <GOALS title>`, then `### [bucket: ]<public title>`
 *  items with `- ` bullets. Text before the first entry is the file's own explanation. */
export function parseWording(text) {
  const entries = [];
  const problems = [];
  let entry = null;
  let item = null;
  let bullet = null;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const at = `line ${i + 1}`;
    if (line.trim() === '') {
      bullet = null;
      return;
    }
    const h2 = /^##\s+(\d+)\.\s+(.+)$/.exec(line);
    if (h2) {
      entry = { number: Number(h2[1]), title: h2[2].trim(), items: [], line: i + 1 };
      entries.push(entry);
      item = bullet = null;
      return;
    }
    if (!entry) return;
    const h3 = /^###\s+(?:(now|next|later):\s+)?(.+)$/i.exec(line);
    if (h3) {
      item = { bucket: h3[1]?.toLowerCase() ?? null, title: h3[2].trim(), bullets: [], line: i + 1 };
      entry.items.push(item);
      bullet = null;
      return;
    }
    const li = /^- (.+)$/.exec(line);
    if (li && item) {
      bullet = { text: li[1].trim(), line: i + 1 };
      item.bullets.push(bullet);
      return;
    }
    if (bullet && /^ {2}\S/.test(line)) {
      bullet.text += ` ${line.trim()}`;
      return;
    }
    problems.push(`${at}: an entry holds only "### <title>" items and "- " bullets`);
  });
  return { entries, problems };
}

/**
 * Pure: the roadmap - { now: [...], next: [...], later: [...] } of { title, bullets } in GOALS's
 * outcome order - and every way GOALS and the wording disagree. Placement comes from GOALS.
 */
export function buildRoadmap(goalsText, wordingText) {
  const outcomes = goalsOutcomes(goalsText);
  const { entries, problems } = parseWording(wordingText);
  const columns = { now: [], next: [], later: [] };
  if (outcomes.length === 0) problems.push('docs/GOALS.md has no "### N. Title (priority)" outcomes under "## Outcomes"');
  for (const outcome of outcomes) {
    const where = `outcome ${outcome.number}`;
    if (outcome.buckets.length === 0) {
      problems.push(`${where} ("${outcome.title}") names no priority in GOALS: now, next or later`);
      continue;
    }
    const matching = entries.filter((e) => e.number === outcome.number);
    if (matching.length === 0) {
      problems.push(`${where} ("${outcome.title}") has no wording: add "## ${outcome.number}. ${outcome.title}" to docs/whats-new/roadmap.md`);
      continue;
    }
    if (matching.length > 1) problems.push(`${where} has ${matching.length} entries in the wording; keep one`);
    const entry = matching[0];
    if (entry.title !== outcome.title) {
      problems.push(
        `${where} is "${outcome.title}" in GOALS but "${entry.title}" in the wording (line ${entry.line}): ` +
          're-read its wording against the outcome, then copy the title',
      );
    }
    if (entry.items.length === 0) problems.push(`${where} has no "### " item in the wording`);
    for (const item of entry.items) {
      const bucket = item.bucket ?? outcome.buckets[0];
      if (!outcome.buckets.includes(bucket)) {
        problems.push(
          `line ${item.line}: "${item.title}" is marked ${bucket}, but GOALS gives ${where} only ${outcome.buckets.join(' and ')}`,
        );
        continue;
      }
      if (item.bullets.length === 0) problems.push(`line ${item.line}: "${item.title}" has no bullets`);
      for (const b of item.bullets) for (const p of bulletProblems(b.text)) problems.push(`line ${b.line}: ${p}`);
      if (/\b(19|20)\d\d\b|\bQ[1-4]\b/.test([item.title, ...item.bullets.map((b) => b.text)].join(' '))) {
        problems.push(`line ${item.line}: "${item.title}" carries a date; the roadmap gives none`);
      }
      columns[bucket].push({ outcome: outcome.number, title: item.title, bullets: item.bullets.map((b) => b.text) });
    }
  }
  for (const entry of entries) {
    if (!outcomes.some((o) => o.number === entry.number)) {
      problems.push(`line ${entry.line}: the wording names outcome ${entry.number}, which GOALS does not have`);
    }
  }
  return { columns, problems, outcomes: outcomes.length };
}

export function loadRoadmap() {
  return buildRoadmap(readFileSync(GOALS_FILE, 'utf8'), readFileSync(WORDING_FILE, 'utf8'));
}

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COLUMN_HEADINGS = { now: 'Now', next: 'Next', later: 'Later' };
const COLUMN_NOTES = {
  now: 'What we are building and improving at the moment.',
  next: 'What comes once the current work is done.',
  later: 'Planned, not started.',
};

/** The roadmap's three columns as HTML. Throws when GOALS and the wording disagree, so the page
 *  cannot be built from a roadmap that is out of step. */
export function renderRoadmapHtml(roadmap = loadRoadmap()) {
  if (roadmap.problems.length > 0) {
    throw new Error(`roadmap: out of step with docs/GOALS.md:\n  - ${roadmap.problems.join('\n  - ')}`);
  }
  return BUCKETS.map((bucket) => {
    const items = roadmap.columns[bucket]
      .map((item) => {
        const bullets = item.bullets.map((b) => `            <li>${escapeHtml(b)}</li>`).join('\n');
        return `        <article class="rm-item" data-outcome="${item.outcome}">\n          <h3>${escapeHtml(item.title)}</h3>\n          <ul>\n${bullets}\n          </ul>\n        </article>`;
      })
      .join('\n');
    return `      <section class="rm-col" id="${bucket}" aria-labelledby="rm-${bucket}">\n        <h2 id="rm-${bucket}">${COLUMN_HEADINGS[bucket]}</h2>\n        <p class="rm-note">${COLUMN_NOTES[bucket]}</p>\n        <div class="rm-items">\n${items}\n        </div>\n      </section>`;
  }).join('\n');
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === fileURLToPath(import.meta.url).replaceAll('\\', '/').toLowerCase();

if (isEntrypoint) {
  const roadmap = loadRoadmap();
  measured(roadmap.outcomes, 'outcomes in docs/GOALS.md');
  if (roadmap.problems.length > 0) {
    console.error('roadmap: docs/GOALS.md and docs/whats-new/roadmap.md disagree:');
    for (const p of roadmap.problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else if (process.argv.includes('--check')) {
    const counts = BUCKETS.map((b) => `${roadmap.columns[b].length} ${b}`).join(', ');
    console.log(`roadmap: OK - ${roadmap.outcomes} outcomes in GOALS, ${counts}.`);
  } else {
    for (const b of BUCKETS) {
      console.log(`\n${COLUMN_HEADINGS[b]}`);
      for (const item of roadmap.columns[b]) console.log(`  ${item.title}\n${item.bullets.map((t) => `    - ${t}`).join('\n')}`);
    }
  }
}
