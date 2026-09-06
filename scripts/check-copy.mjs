// gate: build
// guards: src/**, docs/**, README.md, cli/**, *.html, scripts/copy-baseline.json
//
// THE COPY A USER READS MUST NOT READ AS MACHINE-WRITTEN.
//
// The owner's complaint, 2026-08-26, is specific and it is the most common one this product gets:
// the em-dash is "the one thing people complain about, claiming it's AI-written". A reader who
// decides a broadcast tool was written by a machine stops trusting the graphics it makes, and no
// amount of correctness argues them back out of it. So the tells are a BUILD GATE, not a style
// note somebody remembers.
//
// WHAT IS IN SCOPE: text a user can read.
//   - Product UI:      src/components, src/landing, src/docs, index.html, docs.html
//   - Emitted code:    src/templates - the HTML/CSS/JS a template WRITES, comments included,
//                      because those comments ship inside every export a customer opens.
//   - Published READMEs: README.md is the repository's front page and cli/README.md and
//                      cli/plugin/README.md are shipped to npm. All three are read by strangers,
//                      so they are copy in exactly the sense this gate means.
//
// WHAT IS OUT OF SCOPE, deliberately:
//   - Source code comments. A comment in a .tsx file is a note between maintainers; it is not
//     copy, nobody outside this repo reads it, and sweeping it in would triple the surface for no
//     reader. The one exception is a comment INSIDE an emitted template literal, which is exactly
//     the code the export ships.
//   - Maintainer docs (docs/, AGENTS.md, this file). Same reason.
//
// HOW IT HOLDS THE LINE: a per-file, per-rule COUNT BASELINE (scripts/copy-baseline.json).
// The catalog and the app carry ~5,300 of these lines today, which is a drain job and not a
// tonight job - a gate that red-mains five hundred files on the day it lands gets switched off in
// a week. So the baseline freezes what exists and the gate refuses everything NEW.
//
// The baseline is EXACT in both directions. A count that drops is just as much a stale baseline as
// one that climbs: leave the high number in place and the file silently regains room for a tell it
// had already given up. Re-record with:
//
//   npm run check:copy -- --update
//
// The drain is a real piece of work with an owner ruling behind it, filed as
// docs/backlog/copy-tells-drain.md. Every entry that reaches zero disappears from the baseline on
// the next --update, so the file itself is the progress bar.
//
// Run: node scripts/check-copy.mjs   (part of `npm run build`)

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(projectRoot, 'scripts', 'copy-baseline.json');

/**
 * Where a user can read the words. Directories, not globs: git's default pathspec lets `*` cross
 * a `/`, so `src/components/**\/*.tsx` silently misses every loose top-level file - the hole that
 * hid three strings from check-client-neutral until 2026-08-26. Extensions are filtered below.
 */
export const SCANNED = [
  'src/components',
  'src/landing',
  'src/docs',
  'src/templates',
  'index.html',
  'docs.html',
  'README.md',
  'cli/README.md',
  'cli/plugin/README.md',
  'cli/plugin-mcp/README.md',
];

/** The entries above that name one file rather than a directory, so a `.md` can be scanned
 *  without dragging in every nested AGENTS.md the directory pathspecs would sweep up. */
const SCANNED_FILES = new Set(SCANNED.filter((entry) => /\.[a-z]+$/i.test(entry)));

/** A quantity big enough to be a boast: two to four digits, a comma-grouped thousand, or the
 *  vague words that mean the same thing. One-digit numbers are left alone, because a user's own
 *  library legitimately says "3 graphics" and that is their count, not ours. */
const BOAST_QUANTITY = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{2,4})\+?|dozens|hundreds|thousands`;

/** What we would be counting. Up to two words may sit in between, as in "hundreds OF
 *  BROADCAST-GRADE designs". */
const CATALOG_NOUN = String.raw`designs?|templates?|graphics|categories|packs?|kits?|variants?`;

/**
 * Where a catalog count would be a BOAST: the surfaces that sell the catalog to somebody who has
 * not used it. `src/templates` is deliberately absent. Its emitted comments carry the measurements
 * a design decision was made from ("measured across the same 23 designs, ZERO newly wrapped
 * lines"), and a number that is the evidence for a rule is the opposite of a number nobody asked
 * for.
 */
const SELLS_THE_CATALOG = [
  'README.md',
  'cli/README.md',
  'cli/plugin/README.md',
  'cli/plugin-mcp/README.md',
  'index.html',
  'docs.html',
  'src/landing',
  'src/docs',
  'src/components',
];

/**
 * The tells. Each is a phrase a person writing carefully would not reach for, and the reason is
 * written down so the next person can argue with it rather than guess at it.
 *
 * Adding one is cheap and permanent, so the bar is: would a NoaCG-shaped sentence ever need this
 * word? "Seamless loop" is a real term of art in animation and is NOT banned; "seamlessly" as an
 * adverb of quality is the marketing tic.
 *
 * A rule may carry a `scope` when it is about ONE kind of surface rather than about writing in
 * general. Everything without one applies to every scanned file.
 */
export const RULES = [
  {
    id: 'design-count',
    pattern: new RegExp(String.raw`\b(?:${BOAST_QUANTITY})\s+(?:[a-z-]+\s+){0,2}(?:${CATALOG_NOUN})\b`, 'i'),
    scope: SELLS_THE_CATALOG,
    why:
      'a design count is a boast that ages badly and invites the wrong comparison (owner, ' +
      '2026-08-28: "we should never say how many designs we have"). It also has to be kept in ' +
      'sync forever. Say what the catalog covers instead, and let the storefront do the counting.',
  },
  {
    id: 'em-dash',
    // The character itself, plus the three HTML spellings of it.
    pattern: /—|&mdash;|&#8212;|&#x2014;/i,
    why: 'em-dash - the tell the product is actually accused over. Use a plain dash, a comma, or two sentences.',
  },
  {
    id: 'seamlessly',
    pattern: /\bseamlessly\b/i,
    why: 'nothing is ever described as happening seamlessly by someone who watched it happen. Say what it does.',
  },
  {
    id: 'empower',
    pattern: /\bempower(s|ed|ing|ment)?\b/i,
    why: 'brochure verb. The user is not empowered, they are given a specific thing they can do.',
  },
  {
    id: 'elevate',
    pattern: /\belevat(e|es|ed|ing)\b/i,
    why: 'brochure verb with no content. Name the improvement instead.',
  },
  {
    id: 'delve',
    pattern: /\bdelv(e|es|ed|ing)\b/i,
    why: 'nobody delves. They look, open, read or check.',
  },
  {
    id: 'whether-youre',
    pattern: /\bwhether you(['’]re| are)\b/i,
    why: 'the "whether you are X or Y" opener is the single most recognisable generated-copy shape.',
  },
];

/**
 * Reduce a source file to the text a USER can reach, keeping every newline so line numbers still
 * point at the source.
 *
 * The rule, stated once: a comment in the file's own code is blanked; a comment inside a template
 * literal is kept, because that literal IS the exported graphic. Strings, JSX text and markup are
 * always kept.
 *
 * Known limits, both of which only ever hide a violation rather than invent one, and both of which
 * are frozen into the baseline the first time they fire: a regex literal containing `//` reads as
 * a line comment, and an apostrophe in bare JSX text opens a string that runs to the next quote.
 */
export function visibleText(source, { html = false, plain = false } = {}) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  // Markdown has no code to strip: every line of it is the text. Running it through the
  // JavaScript scanner would be actively wrong, because a fenced block's backtick opens a
  // template literal and a URL's `//` reads as a line comment.
  if (plain) return source;
  if (html) return source.replace(/<!--[\s\S]*?-->/g, blank);

  const BACKSLASH = String.fromCharCode(92);
  let out = '';
  let i = 0;
  // A stack of frames so `${ ... }` inside a template literal is code again, and a template
  // literal inside THAT is emitted code again.
  const stack = [{ kind: 'code', depth: 0 }];
  const top = () => stack[stack.length - 1];

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    const frame = top();

    if (frame.kind === 'code') {
      if (c === '/' && next === '/') {
        const end = source.indexOf('\n', i);
        const stop = end === -1 ? source.length : end;
        out += blank(source.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2);
        const stop = end === -1 ? source.length : end + 2;
        out += blank(source.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === "'" || c === '"') {
        stack.push({ kind: 'quote', quote: c });
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        stack.push({ kind: 'template' });
        out += c;
        i++;
        continue;
      }
      if (c === '{') frame.depth++;
      if (c === '}') {
        if (frame.depth === 0 && stack.length > 1) {
          stack.pop(); // closes a ${ } inside a template literal
          out += c;
          i++;
          continue;
        }
        frame.depth--;
      }
      out += c;
      i++;
      continue;
    }

    if (frame.kind === 'quote') {
      if (c === BACKSLASH) {
        out += source.slice(i, i + 2).replace(/[^\n]/g, ' ');
        i += 2;
        continue;
      }
      if (c === frame.quote || c === '\n') stack.pop(); // an unterminated string never eats the file
      out += c;
      i++;
      continue;
    }

    // frame.kind === 'template'
    if (c === BACKSLASH) {
      out += source.slice(i, i + 2).replace(/[^\n]/g, ' ');
      i += 2;
      continue;
    }
    if (c === '$' && next === '{') {
      stack.push({ kind: 'code', depth: 0 });
      out += '${';
      i += 2;
      continue;
    }
    if (c === '`') {
      stack.pop();
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Does a rule apply to this file? Most rules apply everywhere in SCANNED; one that carries a
 * `scope` applies only under those paths, and then only when the caller says which file it is.
 */
export function ruleApplies(rule, file = '') {
  if (!rule.scope) return true;
  return rule.scope.some((entry) => file === entry || file.startsWith(`${entry}/`));
}

/** Every violating line in one file, as `{ line, rule, text }`. */
export function scanSource(source, { html = false, plain = false, file = '' } = {}) {
  const visible = visibleText(source, { html, plain }).split('\n');
  const original = source.split('\n');
  const findings = [];
  const rules = RULES.filter((rule) => ruleApplies(rule, file));
  visible.forEach((line, i) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) findings.push({ line: i + 1, rule: rule.id, text: (original[i] ?? '').trim() });
    }
  });
  return findings;
}

/** `{ 'em-dash': 3, seamlessly: 1 }` - the shape one baseline entry holds. */
export function tally(findings) {
  const counts = {};
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  return counts;
}

/**
 * The verdict. Every file whose counts differ from the baseline in EITHER direction, with which
 * rule moved and which way, so the message can say what to do rather than only that something is
 * wrong.
 */
export function compare(baseline, actual) {
  const drift = [];
  const files = new Set([...Object.keys(baseline), ...Object.keys(actual)]);
  for (const file of [...files].sort()) {
    const was = baseline[file] ?? {};
    const now = actual[file] ?? {};
    const rules = new Set([...Object.keys(was), ...Object.keys(now)]);
    for (const rule of [...rules].sort()) {
      const before = was[rule] ?? 0;
      const after = now[rule] ?? 0;
      if (before !== after) drift.push({ file, rule, before, after });
    }
  }
  return drift;
}

function listFiles() {
  return execFileSync('git', ['ls-files', '--', ...SCANNED], { cwd: projectRoot, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    // A directory pathspec sweeps in CSS and the nested AGENTS.md contracts. Neither carries copy:
    // a stylesheet has no sentences, and a contract is maintainer prose. A .d.ts has no strings
    // at all. A file named outright in SCANNED is always kept, which is how the published
    // READMEs get in without every AGENTS.md coming with them.
    .filter((f) => SCANNED_FILES.has(f) || (/\.(tsx|ts|html)$/.test(f) && !f.endsWith('.d.ts')));
}

function scanRepo() {
  const actual = {};
  const findings = {};
  for (const file of listFiles()) {
    const source = readFileSync(path.join(projectRoot, file), 'utf8');
    const found = scanSource(source, { html: file.endsWith('.html'), plain: file.endsWith('.md'), file });
    if (found.length === 0) continue;
    findings[file] = found;
    actual[file] = tally(found);
  }
  return { actual, findings };
}

function readBaseline() {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    return parsed.files ?? {};
  } catch {
    return {};
  }
}

function writeBaseline(actual) {
  const body = {
    note:
      'Generated by `npm run check:copy -- --update`. Per-file counts of the copy tells that ' +
      'already existed when scripts/check-copy.mjs landed (2026-08-26). The gate refuses any ' +
      'change to these numbers; the drain is docs/backlog/copy-tells-drain.md.',
    files: actual,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

const LABEL = 'Copy tells - user-facing text must not read as machine-written';

function main(argv) {
  const { actual, findings } = scanRepo();

  if (argv.includes('--update')) {
    writeBaseline(actual);
    const lines = Object.values(actual).reduce(
      (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(`${LABEL}\n\nBaseline re-recorded: ${lines} line(s) across ${Object.keys(actual).length} file(s).`);
    return 0;
  }

  const drift = compare(readBaseline(), actual);
  if (drift.length === 0) {
    console.log(`${LABEL}\n\nPASS - no new tells, and the baseline still matches the tree.`);
    return 0;
  }

  const added = drift.filter((d) => d.after > d.before);
  const removed = drift.filter((d) => d.after < d.before);
  console.error(`${LABEL}\n`);

  for (const d of added) {
    const rule = RULES.find((r) => r.id === d.rule);
    console.error(`  ADDED  ${d.file}  ${d.rule}: ${d.before} -> ${d.after}`);
    console.error(`         ${rule?.why ?? ''}`);
    for (const f of (findings[d.file] ?? []).filter((f) => f.rule === d.rule).slice(0, 6)) {
      console.error(`         ${d.file}:${f.line}  ${f.text.slice(0, 120)}`);
    }
  }
  for (const d of removed) {
    console.error(`  FIXED  ${d.file}  ${d.rule}: ${d.before} -> ${d.after}`);
  }

  if (added.length > 0) {
    console.error(
      `\nFAIL - ${new Set(added.map((d) => d.file)).size} file(s) gained a copy tell.\n` +
        'Rewrite the line. An em-dash becomes a plain dash, a comma, or two sentences; a brochure\n' +
        'verb becomes the specific thing the user gets. If the phrase is genuinely the right word\n' +
        '(a "seamless loop" is a real term of art), say so in the commit and re-record the\n' +
        'baseline - but the default answer is that the line reads better without it.',
    );
  }
  if (removed.length > 0 && added.length === 0) {
    console.error(
      `\nFAIL - ${removed.length} entr(ies) improved and the baseline still holds the old number.\n` +
        'A stale-high baseline quietly hands the file back the room it just gave up. Re-record it:\n\n' +
        '  npm run check:copy -- --update\n',
    );
  } else if (removed.length > 0) {
    console.error('\nSome counts also DROPPED - re-record with `npm run check:copy -- --update` once the new tells are gone.');
  }
  return 1;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  process.argv[1].replaceAll('\\', '/').toLowerCase().endsWith('check-copy.mjs');
if (isEntrypoint) process.exit(main(process.argv.slice(2)));
