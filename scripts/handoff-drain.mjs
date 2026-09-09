#!/usr/bin/env node
// THE HANDOFF DRAIN - which handoff files the newest wave plan has classified, and which it has not.
//
//   node scripts/handoff-drain.mjs             # every file in docs/handoffs/ with its class and age
//   node scripts/handoff-drain.mjs --check     # exit 1 while any file is unclassified
//   node scripts/handoff-drain.mjs --plan <path>
//   node scripts/handoff-drain.mjs --json
//
// WHY. The orchestrator contract says every handoff file it reads is classified - consumed, spent,
// deferred, or handed to the owner - and that the classification is what makes a deletion safe.
// On 2026-09-01 a planner classified thirteen files as spent from their headings; four were not,
// and one held the only analysis of an unfixed defect. The rule existed; nothing observed whether
// it had been applied. This script does: it reads the `## Handoffs` section of the newest wave
// plan (the gitignored wave-state file the orchestrator writes) and lists every file in
// `docs/handoffs/` that the section does not mention. An undrained folder is then a printed line
// rather than a thing to remember.
//
// THE FOUR CLASSES, one line each under `## Handoffs` in the wave plan:
//
//   - consumed: 2026-09-01-a-thing.md -> row B
//   - spent: 2026-09-01-d-thing.md - every open item traced: <where each now lives>
//   - deferred: 2026-08-30-n-thing.md - <why not this wave>
//   - owner: 2026-09-02-x-thing.md -> needs-you / owner-queue item <name>
//
// `consumed` means a prompt in this wave was written from it; `spent` that every open item has
// been traced to where it now lives; `deferred` that it is machine-continuable but not this wave;
// `owner` that its open items need a person and have been routed to the report or the owner
// queue. Consumed, spent and owner files are deleted by exactly one wave row; a deferred file
// older than DEFERRED_STALE_DAYS is flagged, because the backlog's graduate-or-die rule applies to
// handoffs too.
//
// Read-only. It never deletes a handoff and never edits the plan.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { daysSince } from './owner-receipts.mjs';
import { newestWavePlan as newestWavePlanIn } from './wave-tick.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

export const HANDOFF_DIR = 'docs/handoffs';
export const CLASSES = Object.freeze(['consumed', 'spent', 'deferred', 'owner']);
export const DEFERRED_STALE_DAYS = 7;

/**
 * The `## Handoffs` section of a wave plan as `Map<filename, { cls, trace }>`. A line names a
 * file with or without its directory; everything after the name is the trace, which is what a
 * reader checks a `spent` claim against.
 */
export function parseHandoffSection(planText) {
  const classified = new Map();
  const lines = planText.replace(/\r\n/g, '\n').split('\n');
  let inside = false;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      inside = /^#{1,6}\s+handoffs?\b/i.test(line);
      continue;
    }
    if (!inside) continue;
    const match = line.match(/^\s*[-*]\s*(consumed|spent|deferred|owner)\s*:\s*(?:`)?(?:docs\/handoffs\/)?([\w.-]+\.md)(?:`)?\s*(.*)$/i);
    if (!match) continue;
    classified.set(match[2], { cls: match[1].toLowerCase(), trace: match[3].replace(/^[-:>\s]+/, '').trim() });
  }
  return classified;
}

/**
 * The tracked handoff files: every `.md` that is not a gitignored `.local.md`.
 *
 * THE FILTER STAYS, and the weekly recap is covered somewhere else instead (decided 2026-09-09,
 * against the backlog item that proposed dropping it). The four classes here are a question about
 * DELETING a file - consumed, spent and owner files are deleted by one wave row - and the two
 * `.local.md` files on this machine are the only ones nothing may delete: the weekly recap is
 * overwritten weekly by a routine and is the record the review reads back, and a wave plan is the
 * only copy of a wave's routing. Listing them here would ask a planner to answer a deletion
 * question about files that are not his to delete, and a plausible "spent" would destroy the
 * routine's own record.
 *
 * The obligation the weekly recap really carries is a different one - whether its candidate rows
 * reached a wave - and it is enforced by `scripts/weekly-candidates.mjs` under its own heading, so
 * one file is not answering two questions on one line.
 */
export function handoffFiles(root = REPO_ROOT) {
  const dir = path.join(root, ...HANDOFF_DIR.split('/'));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !name.endsWith('.local.md'))
    .sort()
    .map((name) => {
      const dated = /^(\d{4}-\d{2}-\d{2})/.exec(name);
      const at = dated ? Date.parse(`${dated[1]}T00:00:00`) : statSync(path.join(dir, name)).mtimeMs;
      return { name, at };
    });
}

/** The newest fresh wave plan in the checkout this script runs from - the tick's own rule. */
export function newestWavePlan(root = REPO_ROOT, now = Date.now()) {
  return newestWavePlanIn(now, root);
}

/**
 * One row per handoff file: its class from the plan, its age, and a flag when something is owed.
 * `UNCLASSIFIED` is the flag that matters; `STALE-DEFERRED` is the graduate-or-die reminder.
 */
export function drain(files, classified, { now = Date.now(), staleDays = DEFERRED_STALE_DAYS } = {}) {
  return files.map(({ name, at }) => {
    const ageDays = daysSince(at, now);
    const entry = classified.get(name);
    let flag = null;
    if (!entry) flag = 'UNCLASSIFIED';
    else if (entry.cls === 'deferred' && ageDays !== null && ageDays > staleDays) flag = 'STALE-DEFERRED';
    return { name, ageDays, cls: entry?.cls ?? null, trace: entry?.trace ?? '', flag };
  });
}

export function formatDrain(rows, planPath) {
  if (rows.length === 0) return ['docs/handoffs/ holds no tracked handoff files - nothing to drain.'];
  const lines = [planPath ? `Handoff drain against ${path.basename(planPath)}:` : 'Handoff drain (no fresh wave plan found - every file reads as unclassified):'];
  for (const row of rows) {
    const age = row.ageDays === null ? '?' : `${row.ageDays}d`;
    const cls = (row.flag === 'UNCLASSIFIED' ? 'UNCLASSIFIED' : row.cls).padEnd(12);
    const stale = row.flag === 'STALE-DEFERRED' ? '  <-- deferred past the graduate-or-die line: re-argue or delete' : '';
    lines.push(`  ${cls} ${age.padStart(4)}  ${row.name}${row.trace ? `  ${row.trace}` : ''}${stale}`);
  }
  const unclassified = rows.filter((row) => row.flag === 'UNCLASSIFIED').length;
  lines.push(
    unclassified === 0
      ? '  Every file is classified. Consumed, spent and owner files are deleted by one wave row.'
      : `  ${unclassified} file(s) unclassified - the plan owes each a line under "## Handoffs".`,
  );
  return lines;
}

export function main(argv = process.argv.slice(2), { root = REPO_ROOT, now = Date.now() } = {}) {
  const planFlag = argv.indexOf('--plan');
  const planPath = planFlag >= 0 ? path.resolve(root, argv[planFlag + 1] ?? '') : newestWavePlan(root, now);
  const classified = planPath && existsSync(planPath) ? parseHandoffSection(readFileSync(planPath, 'utf8')) : new Map();
  const rows = drain(handoffFiles(root), classified, { now });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ plan: planPath, rows }, null, 2));
  } else {
    for (const line of formatDrain(rows, planPath && existsSync(planPath) ? planPath : null)) console.log(line);
  }
  if (argv.includes('--check') && rows.some((row) => row.flag === 'UNCLASSIFIED')) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
