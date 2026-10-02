#!/usr/bin/env node
// gate: build
// guards: docs/whats-new/**
//
// WHAT'S NEW: the public account of what changed, kept as notes in the repository.
//
//   node scripts/whats-new.mjs --check                 refuse an update that is not fit to publish
//                                                      (run by `npm run build`, and by the page's
//                                                      Vite plugin, so a bad note cannot ship)
//   node scripts/whats-new.mjs draft [--since <date>] [--ref <ref>]
//                                                      what landed since the last update, grouped
//                                                      by topic: the input for whoever writes the
//                                                      next one, never the note itself
//
// WHY THIS EXISTS. About fifty changes land on main on a busy day. A visitor deciding whether NoaCG
// moved forward cannot read that list, and a list generated from it reads the way the CLI's first
// generated release notes did (cli/scripts/release-notes.mjs): pull request titles, internal names,
// nothing about what the reader gets. So an update is written by hand, about twice a week, as a few
// short bullets per topic, and this script is what keeps the writing honest and cheap: the draft
// gathers the raw material in one command, and the check refuses the shapes generated text falls
// into. The format is described for writers in docs/whats-new/README.md.
//
// AN UPDATE is `docs/whats-new/<YYYY-MM-DD>.md`: nothing but `## <topic>` headings, in the order of
// TOPICS below, each followed by `- ` bullets (a bullet may wrap onto lines indented two spaces).
// A topic with nothing big is left out, not written empty. The three topics are the parts of NoaCG
// worked on all the time; a reader scans them top to bottom, on this page and on the landing.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOTES_DIR = path.join(ROOT, 'docs', 'whats-new');

/** The topics an update may name, in the order the pages show them: the NoaCG playout system with
 *  NoaCG Bridge; the editor and templates; and AI workflows, which are the CLI, the MCP server and
 *  the plugins for coding agents. */
export const TOPICS = ['Playout and Bridge', 'Editor and templates', 'AI workflows'];

/** Only the biggest changes: a longer list is a changelog, which is the thing this is not. */
export const MAX_BULLETS_PER_TOPIC = 6;
export const MAX_BULLETS_PER_UPDATE = 12;
export const MAX_WORDS_PER_BULLET = 30;

const UPDATE_FILE = /^(\d{4})-(\d{2})-(\d{2})\.md$/;

// The first word of a commit subject in this repository: imperative, about the code. A bullet that
// starts this way was copied from the pull request list instead of written for the reader.
const COMMIT_VERBS = [
  'add', 'adds', 'bump', 'clean', 'document', 'drop', 'fix', 'land', 'merge', 'migrate', 'move', 'pin',
  'record', 'refactor', 'remove', 'rename', 'revert', 'rewrite', 'simplify', 'split', 'teach', 'update',
  'wire',
];

const HYPE = [
  'amazing', 'awesome', 'best-in-class', 'blazing', 'breathtaking', 'cutting-edge', 'delve', 'effortless',
  'effortlessly', 'elevate', 'empower', 'excited', 'exciting', 'game-changing', 'game changer', 'groundbreaking',
  'incredible', 'leverage', 'magic', 'magical', 'next-level', 'powerful', 'revolutionary', 'robust',
  'seamless', 'seamlessly', 'stunning', 'supercharge', 'thrilled', 'unleash', 'world-class',
];

// Words a visitor never meets: how the work is organised, not what it made.
const INTERNAL_WORDS = [
  'backlog', 'branch', 'ci', 'e2e', 'gate', 'goals.md', 'handoff', 'orchestrator', 'owner queue', 'receipt',
  'refactor', 'regression', 'spec', 'wave', 'worktree',
];

// Product and platform names whose spelling has a capital inside a lower-case word.
const MIXED_CASE_NAMES = new Set(['vMix', 'macOS', 'iOS', 'iPad', 'iPhone', 'eSports']);

const words = (text) => text.split(/\s+/).filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Why one bullet is not fit to publish - an empty list when it is. */
export function bulletProblems(text) {
  const problems = [];
  const n = words(text).length;
  if (n > MAX_WORDS_PER_BULLET) problems.push(`it is ${n} words; keep a bullet to ${MAX_WORDS_PER_BULLET} or fewer`);
  if (/(^|[\s(])#\d+\b/.test(text) || /\/pull\/\d+/.test(text) || /\bPRs?\b/.test(text) || /pull request/i.test(text)) {
    problems.push('it points at a pull request; say what changed for the reader');
  }
  const first = (words(text)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (COMMIT_VERBS.includes(first) || /^(feat|fix|chore|docs|refactor|test|ci|build|perf)(\(|:)/i.test(text)) {
    problems.push('it reads like a pull request title; say what the reader can now do, e.g. "Playout now ..."');
  }
  if (/`/.test(text)) problems.push('it quotes code; name the thing the way the product shows it');
  if (/(^|[\s(])(src|docs|scripts|cli|api|e2e|public|supabase|contracts|\.github)\//.test(text) ||
      /\b[\w-]+\.(ts|tsx|mjs|cjs|js|json|md|yml|yaml|css|html|ps1|py|sh)\b/.test(text)) {
    problems.push('it names a file or path');
  }
  if (/\bclaude\/[\w-]/.test(text) || /\brow [A-Z]{1,3}\b/.test(text) || /\bR\d+\.\d/.test(text) || /\boutcome \d/i.test(text)) {
    problems.push('it names internal work (a branch, a row, a plan stage or a goal number)');
  }
  for (const word of INTERNAL_WORDS) {
    if (new RegExp(`(^|[^\\w-])${escapeRe(word)}s?($|[^\\w-])`, 'i').test(text)) {
      problems.push(`it uses the internal word "${word}"`);
    }
  }
  const identifier = text.match(/\b[a-z]+[A-Z]\w*\b/g)?.find((w) => !MIXED_CASE_NAMES.has(w)) ??
    text.match(/\b[a-z]+_[a-z_]+\b/)?.[0];
  if (identifier) problems.push(`"${identifier}" looks like a name from the code`);
  if (/[—–]/.test(text)) problems.push('it uses an em or en dash; this project writes a comma, a plain dash or two sentences');
  for (const word of HYPE) {
    if (new RegExp(`(^|[^\\w-])${escapeRe(word)}($|[^\\w-])`, 'i').test(text)) problems.push(`it uses the hype word "${word}"`);
  }
  if (/!/.test(text)) problems.push('it uses an exclamation mark');
  if (/\b(coming soon|soon|next (week|month|year)|later this (week|month|year))\b/i.test(text)) {
    problems.push('it promises a date; what is planned belongs on the roadmap, without dates');
  }
  if (/(^|\s)@[A-Za-z\d-]+/.test(text) || /\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(text)) problems.push('it names a person or an address');
  return problems;
}

/**
 * Pure: parse one update's text into its topics, and say why it is not fit to publish.
 * `problems` is empty when it is.
 */
export function parseUpdate(text) {
  const topics = [];
  const problems = [];
  let current = null;
  let bullet = null;
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const at = `line ${i + 1}`;
    if (line.trim() === '') {
      bullet = null;
      return;
    }
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      const name = heading[1].trim();
      bullet = null;
      if (!TOPICS.includes(name)) {
        problems.push(`${at}: "${name}" is not a topic; use one of: ${TOPICS.join(', ')}`);
        current = null;
        return;
      }
      if (topics.some((a) => a.name === name)) problems.push(`${at}: "${name}" appears twice`);
      current = { name, bullets: [] };
      topics.push(current);
      return;
    }
    const item = /^- (.+)$/.exec(line);
    if (item) {
      if (!current) {
        problems.push(`${at}: a bullet before any topic heading`);
        bullet = null;
        return;
      }
      bullet = { text: item[1].trim(), line: i + 1 };
      current.bullets.push(bullet);
      return;
    }
    if (bullet && /^ {2}\S/.test(line)) {
      bullet.text += ` ${line.trim()}`;
      return;
    }
    problems.push(`${at}: an update holds only "## <topic>" headings and "- " bullets`);
  });

  if (topics.length === 0 && problems.length === 0) problems.push('the update is empty; write at least one topic');
  const order = topics.map((a) => TOPICS.indexOf(a.name));
  if (order.some((v, i) => i > 0 && v < order[i - 1])) problems.push(`the topics are out of order; keep them as ${TOPICS.join(', ')}`);
  let total = 0;
  for (const topic of topics) {
    total += topic.bullets.length;
    if (topic.bullets.length === 0) problems.push(`"${topic.name}" has no bullets; leave a topic out when nothing big changed in it`);
    if (topic.bullets.length > MAX_BULLETS_PER_TOPIC) {
      problems.push(`"${topic.name}" has ${topic.bullets.length} bullets; keep the ${MAX_BULLETS_PER_TOPIC} biggest`);
    }
    for (const b of topic.bullets) {
      for (const p of bulletProblems(b.text)) problems.push(`line ${b.line}: ${p}`);
    }
  }
  if (total > MAX_BULLETS_PER_UPDATE) problems.push(`the update has ${total} bullets; keep the ${MAX_BULLETS_PER_UPDATE} biggest`);
  return { topics, problems };
}

/** The date an update file is named for, or null when the name is not `YYYY-MM-DD.md` of a real day. */
export function dateOfFile(name) {
  const m = UPDATE_FILE.exec(name);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Every update in `dir`, newest first, each parsed and judged. Other files (the README, the
 *  roadmap's wording) are not updates and are skipped; a misnamed dated file is a problem. */
export function loadUpdates(dir = NOTES_DIR) {
  const updates = [];
  for (const name of readdirSync(dir)) {
    if (!/^\d/.test(name)) continue;
    const date = dateOfFile(name);
    const parsed = date ? parseUpdate(readFileSync(path.join(dir, name), 'utf8')) : { topics: [], problems: [] };
    if (!date) parsed.problems.push('name an update YYYY-MM-DD.md, after a real day');
    updates.push({ file: name, date, ...parsed });
  }
  return updates.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Problems across every update, each prefixed with its file. */
export function problemsIn(updates) {
  const all = updates.flatMap((u) => u.problems.map((p) => `${u.file}: ${p}`));
  if (updates.length === 0) all.push('docs/whats-new has no update; the page would be empty');
  return all;
}

export const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2 October 2026", the way the rest of the site writes a date. */
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * The list every update surface shares (What's new, the roadmap and the landing): a heading per
 * topic and its bullets beneath, read top to bottom, never cards. `topics` is
 * [{ name, bullets: [text] }]; `attrs` adds attributes to a topic's block (the roadmap's outcome).
 */
export function renderTopicsHtml(topics, { level = 3, attrs = () => '' } = {}) {
  const blocks = topics.map((t) => {
    const items = t.bullets.map((b) => `            <li>${escapeHtml(b)}</li>`).join('\n');
    return `          <div class="up-topic"${attrs(t)}>\n            <h${level}>${escapeHtml(t.name)}</h${level}>\n` +
      `            <ul>\n${items}\n            </ul>\n          </div>`;
  });
  return `        <div class="up-topics">\n${blocks.join('\n')}\n        </div>`;
}

const topicsOf = (update) => update.topics.map((t) => ({ name: t.name, bullets: t.bullets.map((b) => b.text) }));

function refuseUnfit(updates) {
  const problems = problemsIn(updates);
  if (problems.length > 0) throw new Error(`whats-new: not fit to publish:\n  - ${problems.join('\n  - ')}`);
}

/** The page's list of updates as HTML, newest first. Throws when any update is not fit to publish,
 *  so the page cannot be built from one. */
export function renderUpdatesHtml(updates = loadUpdates()) {
  refuseUnfit(updates);
  return updates
    .map((u) =>
      `      <article class="up-row wn-update" id="${u.date}">\n` +
      `        <h2 class="up-when"><time datetime="${u.date}">${longDate(u.date)}</time></h2>\n` +
      `${renderTopicsHtml(topicsOf(u))}\n      </article>`)
    .join('\n');
}

/** The landing's What's new: the newest update alone, under its date. Refuses the same way. */
export function renderLatestHtml(updates = loadUpdates()) {
  refuseUnfit(updates);
  const u = updates[0];
  return `        <div class="up-label">\n          <h3>Latest update</h3>\n` +
    `          <p class="up-when"><time datetime="${u.date}">${longDate(u.date)}</time></p>\n        </div>\n` +
    renderTopicsHtml(topicsOf(u), { level: 4 });
}

// ── The draft ─────────────────────────────────────────────────────────────────────────────────

/** Where a changed path belongs, by the topics a reader knows; null for work no user sees. The
 *  first match wins, so the Bridge's half of the CLI is claimed before the rest of the CLI. */
const TOPIC_PATHS = [
  ['Playout and Bridge', [
    /^cli\/src\/playout\//, /^cli\/src\/playoutEntry\.ts$/, /^cli\/src\/commands\/(bridge|caspar)\.ts$/, /^cli\/BRIDGE_/,
    /^src\/(bridge|control|output|export|ograf|audience|join)\//,
    /^src\/components\/(control\/|teams\/|BridgePairPage|ControlPanel|HostedControlPage|Playout|RecentServers|Export)/,
    /^output\.html$/,
  ]],
  ['AI workflows', [
    /^cli\/src\//, /^cli\/CHANGELOG\.md$/, /^cli\/README\.md$/, /^cli\/(plugin|plugin-mcp|skill)\//,
    /^src\/ai\//, /^api\/ai\//, /^api\/_lib\/ai/,
  ]],
  ['Editor and templates', [/^src\/(editor|templates|components|model|format|packs|preview|blocks|teach|validation|store|community)\//]],
];

export function topicOfPath(file) {
  if (/\.test\.|\/__tests__\//.test(file)) return null;
  for (const [topic, patterns] of TOPIC_PATHS) if (patterns.some((re) => re.test(file))) return topic;
  return null;
}

/** Pure: group landed changes ({ title, files }) under the topic most of their files belong to. */
export function groupLanded(changes) {
  const groups = new Map([...TOPICS, null].map((a) => [a, []]));
  for (const change of changes) {
    const counts = new Map();
    for (const f of change.files) {
      const topic = topicOfPath(f);
      if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    groups.get(ranked[0]?.[0] ?? null).push({ ...change, topics: ranked.map(([a, n]) => `${a} ${n}`) });
  }
  return groups;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** The first-parent changes on `ref` since `since`, each with its title and changed files. */
function landedSince(ref, since) {
  const out = git(['log', ref, '--first-parent', '-m', '--name-only', `--since=${since}T00:00:00`, '--format=%x1e%s%x1f%b%x1f']);
  return out
    .split('\x1e')
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [subject, body, rest = ''] = chunk.split('\x1f');
      const pr = /^Merge pull request (#\d+)/.exec(subject);
      const title = pr ? `${body.trim().split(/\r?\n/)[0] || subject} (${pr[1]})` : subject.trim();
      return { title, files: rest.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) };
    });
}

function changelogAdditions(ref, since, file) {
  let base;
  try {
    base = git(['rev-list', '-1', '--first-parent', `--before=${since}T00:00:00`, ref]).trim();
  } catch {
    return '';
  }
  if (!base) return '';
  return git(['diff', `${base}..${ref}`, '--', file])
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n')
    .trim();
}

/** YYYY-MM-DD in the writer's own time zone: an update is named for the day it is written. */
const localDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function draft(args) {
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const latest = loadUpdates().find((u) => u.date)?.date;
  const fortnightAgo = localDay(new Date(Date.now() - 14 * 86400000));
  const since = valueOf('--since') ?? latest ?? fortnightAgo;
  let ref = valueOf('--ref');
  if (!ref) {
    try {
      git(['rev-parse', '--verify', '--quiet', 'origin/main']);
      ref = 'origin/main';
    } catch {
      ref = 'HEAD';
    }
  }
  const changes = landedSince(ref, since);
  const groups = groupLanded(changes);
  const out = [];
  out.push(`# Draft input: what landed on ${ref} since ${since} (${changes.length} changes)`);
  out.push('');
  out.push(`Write docs/whats-new/${localDay(new Date())}.md from this. It is raw material, not the note:`);
  out.push(`- only the biggest changes a user would notice: at most ${MAX_BULLETS_PER_TOPIC} bullets a topic and ${MAX_BULLETS_PER_UPDATE} in all;`);
  out.push(`- topics in this order, and a topic with nothing big left out: ${TOPICS.join(', ')};`);
  out.push(`- each bullet at most ${MAX_WORDS_PER_BULLET} words, saying what changed for the user, in plain words;`);
  out.push('- no pull request titles or numbers, internal names, file paths, people, customers, shows or dates;');
  out.push('- every claim has to be true today: check it against the current state in docs/GOALS.md;');
  out.push('- then run: node scripts/whats-new.mjs --check');
  for (const [topic, list] of groups) {
    if (list.length === 0) continue;
    out.push('');
    out.push(`## ${topic ?? 'Not in any topic (usually internal; leave out unless a user sees it)'} (${list.length})`);
    for (const c of list) out.push(`- ${c.title}${c.topics.length > 1 ? `  [${c.topics.join(', ')}]` : ''}`);
  }
  for (const file of ['cli/CHANGELOG.md', 'cli/BRIDGE_CHANGELOG.md']) {
    const added = changelogAdditions(ref, since, file);
    if (!added) continue;
    out.push('');
    out.push(`## Written for users already: lines added to ${file}`);
    out.push('');
    out.push(added);
  }
  console.log(out.join('\n'));
  return 0;
}

function check() {
  const updates = loadUpdates();
  measured(updates.length, 'updates in docs/whats-new');
  const problems = problemsIn(updates);
  if (problems.length > 0) {
    console.error('whats-new: these updates cannot be published:');
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  const bullets = updates.reduce((n, u) => n + u.topics.reduce((m, a) => m + a.bullets.length, 0), 0);
  console.log(`whats-new: OK - ${updates.length} update(s), ${bullets} bullets, newest ${updates[0].date}.`);
  return 0;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === fileURLToPath(import.meta.url).replaceAll('\\', '/').toLowerCase();

if (isEntrypoint) {
  const args = process.argv.slice(2);
  if (args[0] === 'draft') process.exitCode = draft(args.slice(1));
  else if (args.includes('--check')) process.exitCode = check();
  else {
    console.error('usage: node scripts/whats-new.mjs --check | draft [--since YYYY-MM-DD] [--ref <ref>]');
    process.exitCode = 2;
  }
}
