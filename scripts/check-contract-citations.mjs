#!/usr/bin/env node
// gate: build
// guards: **
//
// A CITATION OF A CONTRACT NAMES SOMETHING THAT STILL EXISTS - the prose half of contract
// freshness.
//
//   node scripts/check-contract-citations.mjs        # part of `npm run build`
//
// WHY. `check-contract-freshness` proves that every backticked PATH in a contract resolves, and
// nothing proved the same about the way code and docs point INTO a contract. Those pointers are
// prose: `AGENTS.md "Verifying changes"`, `root AGENTS.md non-negotiable 3`. On 2026-09-07 the
// root AGENTS.md became a GENERATED file compiled from `contracts/rules/`, with rule ids in place
// of prose headings and no numbered lists at all. Forty-three citations across thirty-one files
// went on naming sections that no longer existed - in source comments, in a backlog note, and in
// `.agent-workflows/noacg-graphic-local.md`, where a workflow told its reader to consult a
// heading that was gone. Every one of them still READ as a live pointer. Nothing failed.
//
// That is the same silent rot the compiler already refuses for a rule scope matching no file
// (`scripts/contracts-lib.mjs`, "scope `<glob>` matches no file"): the store claims something is
// there, the tree says otherwise, and only a gate closes the gap. This is that gate for citations.
//
// WHAT IT CHECKS, over every tracked text file rather than only the contracts - because the
// citations that broke were mostly in `.mjs` and `.ts` comments, which no contract gate reads:
//
//   1. A backticked RULE ID (`<area>/<slug>`, area a directory under contracts/rules/) resolves to
//      a rule file. Rule ids are derived from a rule's own words, so rewording a rule renames it,
//      and a citation of the old id would otherwise rot exactly as the prose headings did.
//   2. A SECTION citation of a contract - `AGENTS.md "Some heading"`, or a numbered
//      `AGENTS.md rule 6` / `non-negotiable 3` / `principle 3` - names something that file really
//      has. A GENERATED contract has neither headings nor numbers, so ANY section citation of one
//      is stale by construction, and the message says to cite a rule id instead.
//
// It fails CLOSED, naming the file, the line and the dangling citation.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_MARKER } from './contracts-lib.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Files whose citations are frozen evidence rather than live pointers, and are not checked.
 * A record describes a moment, and a rule it named may rightly have been reworded since - the same
 * carve-out `check-contract-freshness` makes for `contracts/records/`. Handoffs and the acceptance
 * queue are dated notes to a reader, written once and never revised.
 */
const FROZEN_PREFIXES = Object.freeze([
  'contracts/records/', 'docs/handoffs/', 'docs/acceptance/', 'docs/GOALS_ARCHIVE.md',
]);

const TEXT_FILE = /\.(md|mjs|cjs|js|ts|tsx)$/;

/**
 * This gate's own files, repo-relative: the header quotes the citation shapes it refuses, and the
 * test pins them as fixtures. Both are examples of rot rather than instances of it, so scanning
 * them would fail the build on the gate's own documentation.
 */
const SELF = /^scripts\/check-contract-citations\./;

/**
 * A rule id needs at least this many hyphens to be treated as one. Slugs are made from a rule's
 * opening words and the shortest in the store carries five, while short two-segment tokens that
 * are NOT rule ids do exist in prose (`ai/generate` is an API route). Below the threshold the
 * token is ambiguous, so it is skipped rather than guessed at - a gate that invents failures gets
 * switched off.
 */
const MIN_SLUG_HYPHENS = 4;

// `area/slug-with-several-words` inside backticks.
const RULE_ID = /`([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)`/g;

// `[dir/]AGENTS.md` followed by a quoted heading or a numbered item. The optional leading word
// covers the "root AGENTS.md" form, where `root` is a word rather than a directory.
const SECTION_CITATION =
  /(?:\b(?<prefix>[\w.-]+(?:\/[\w.-]+)*)\/)?(?:\broot\s+)?AGENTS\.md[,:]?\s*(?:"(?<heading>[^"\n]{2,60})"|(?<kind>rule|principle|non-negotiable|§)\s*(?<number>\d+))/gi;

/** The rule ids the store defines: contracts/rules/<area>/<slug>.md -> `<area>/<slug>`. */
export function ruleIds(root = ROOT) {
  const base = resolve(root, 'contracts/rules');
  const ids = new Set();
  const areas = new Set();
  if (!existsSync(base)) return { ids, areas };
  for (const area of readdirSync(base, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    areas.add(area.name);
    for (const file of readdirSync(resolve(base, area.name))) {
      if (file.endsWith('.md')) ids.add(`${area.name}/${file.slice(0, -3)}`);
    }
  }
  return { ids, areas };
}

/** Is this token shaped like a rule id at all? Short two-segment tokens are prose, not ids. */
function looksLikeRuleId(slug) {
  return (slug.match(/-/g) ?? []).length >= MIN_SLUG_HYPHENS;
}

/**
 * The dangling rule-id citations in one file's text, pure.
 * A token is a failure only when its AREA is a real rule area and its slug is long enough to be
 * unmistakably an id - anything else is prose that happens to contain a slash.
 */
export function staleRuleIds(text, { ids, areas }) {
  const out = [];
  for (const [line, content] of lines(text)) {
    for (const match of content.matchAll(RULE_ID)) {
      const [token, area, slug] = match;
      const id = `${area}/${slug}`;
      if (!areas.has(area) || ids.has(id) || !looksLikeRuleId(slug)) continue;
      out.push({ line, citation: token.slice(1, -1), kind: 'rule id', why: 'no such rule in contracts/rules/' });
    }
  }
  return out;
}

/**
 * The dangling section citations in one file's text, pure.
 * `contracts` maps a contract path to `{ generated, text }`. A citation whose target cannot be
 * resolved to a tracked contract is SKIPPED - the gate judges what it can see and stands down
 * elsewhere, rather than failing on a shorthand it cannot place.
 */
export function staleSections(text, contracts) {
  const out = [];
  for (const [line, content] of lines(text)) {
    for (const match of content.matchAll(SECTION_CITATION)) {
      const { prefix, heading, kind, number } = match.groups;
      const target = resolveContract(prefix, contracts);
      if (!target) continue;
      const contract = contracts.get(target);
      const cited = heading ?? `${kind} ${number}`;
      if (contract.generated) {
        out.push({
          line,
          citation: `${target} ${heading ? `"${heading}"` : cited}`,
          kind: 'section',
          why: `${target} is GENERATED from contracts/rules/ and has no prose sections - cite the rule id instead`,
        });
      } else if (heading && !contract.text.includes(flatten(heading).trim())) {
        out.push({
          line,
          citation: `${target} "${heading}"`,
          kind: 'section',
          why: `${target} says nothing of the sort - the section was renamed or removed`,
        });
      }
    }
  }
  return out;
}

/**
 * Which contract a citation points at. A bare or `root`-prefixed `AGENTS.md` is the root one; a
 * path prefix is taken literally, and a prefix naming no tracked contract answers null so the
 * caller skips it (`wizard/AGENTS.md` in a comment is shorthand, not a path).
 */
function resolveContract(prefix, contracts) {
  if (!prefix) return contracts.has('AGENTS.md') ? 'AGENTS.md' : null;
  const path = `${prefix}/AGENTS.md`;
  return contracts.has(path) ? path : null;
}

/** Line-numbered iteration, CRLF normalised so a converting checkout reads the same. */
function* lines(text) {
  const all = String(text).replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < all.length; index += 1) yield [index + 1, all[index]];
}

/**
 * One contract's text flattened for citation matching: emphasis stripped, whitespace collapsed,
 * lowercased.
 *
 * The anchor is the whole text rather than the heading list, because the house style cites a bold
 * BULLET lead-in as often as a heading - `e2e/AGENTS.md, "A suite that skips itself exits 0"`
 * names a bullet, and it is a perfectly good pointer. Matching headings only would have failed it.
 * Drift is still caught: rename the section and nothing in the file matches the quoted words.
 */
function flatten(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Every file git knows about, repo-relative and posix. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean);
}

function main() {
  const files = trackedFiles();
  const { ids, areas } = ruleIds();
  const contracts = new Map();
  for (const file of files.filter((f) => /(^|\/)AGENTS\.md$/.test(f))) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    contracts.set(file, { generated: text.includes(GENERATED_MARKER), text: flatten(text) });
  }

  const failures = [];
  let scanned = 0;
  for (const file of files) {
    if (!TEXT_FILE.test(file)) continue;
    if (FROZEN_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    if (SELF.test(file)) continue;
    scanned += 1;
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    for (const stale of [...staleRuleIds(text, { ids, areas }), ...staleSections(text, contracts)]) {
      failures.push(`${file}:${stale.line}: ${stale.kind} \`${stale.citation}\` - ${stale.why}`);
    }
  }

  if (failures.length) {
    console.error(`Contract citations FAILED - ${failures.length} dangling citation(s) across ${scanned} file(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Contract citations OK: ${scanned} file(s), every cited rule id and contract section exists.`);
}

const isEntrypoint = Boolean(process.argv[1])
  && resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();
if (isEntrypoint) main();
