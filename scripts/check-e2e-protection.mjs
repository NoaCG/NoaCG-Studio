#!/usr/bin/env node
// gate: workflow ci.yml
// guards: e2e/**, docs/work-specs/**/spec.md
// PROTECTION IS REMOVED ON PURPOSE OR NOT AT ALL (docs/work-specs/e2e-suite-budget/spec.md,
// decision 4). A change that takes coverage out of the merge gate - a spec file deleted,
// tests removed, an unconditional skip added, a per-test timeout raised past the gate's
// ceiling - must carry a test-maintenance entry naming what stays protected and by what. Without
// one the build job fails and so does the gate.
//
//   node scripts/check-e2e-protection.mjs --changed <base> [--today YYYY-MM-DD]   # the diff this change makes
//
// Needs node_modules (Playwright counts the tests) and the base in history; ci.yml runs it in the build job.
//
// WHY. The suite budget work asks for tests to be moved, merged and retired, and the root auto-fix
// rule says a repair never loosens a test, check or limit. Nothing mechanical told the two apart:
// an automatic fixer facing a red spec could delete it, skip it or stretch its timeout and the
// gate would turn green. This check makes removal visible and deliberate: the same edit passes
// when the pull request's work spec says, under `## Test maintenance`, which behaviours the spec
// protected, what protects them now, and where the receipt is. A fixer never writes that section
// (the rule says so), a reviewer reads it like any claim, and the capacity line's budget
// exceptions live in a different section so one cannot stand in for the other.
//
// WHAT COUNTS. Any `e2e/**/*.spec.ts`: a deleted or renamed-away file; fewer tests after the change
// than before; an added unconditional skip (`test.skip(true, ...)`, `test.skip()`,
// `test.fixme(...)`, `test.describe.skip(`, `skipOldEditor()`); for the offline gate specs
// (`e2e/*.spec.ts`), an added `test.setTimeout(N)` with N above TIMEOUT_CEILING_MS or an added
// `test.slow()`. A conditional skip (`test.skip(!creds, ...)`) is a declared environment, not
// removed coverage, and passes.
//
// TESTS ARE COUNTED BY PLAYWRIGHT, NOT BY READING LINES (#1911). Until 2026-11 the check counted
// lines that begin `test(`, so a test declared in a loop (`for (const x of [...]) test(...)`,
// `cases.forEach(...)`) was invisible: in #1910 three runtime tests left
// e2e/editor-arrangement.spec.ts, one came in, and the line count read no change. Now each changed
// spec file is listed with `playwright test --list` under the config that runs it, once at the
// merge base (a temporary worktree) and once at the head, and the two runtime counts are compared.
// A rename inside e2e/ compares the new file with the old one, and a move into another suite
// (e2e/configured/, e2e/catalog/) is itself a finding. A change to a helper or fixture under e2e/
// or to a Playwright config can change what a spec declares without touching it, so then every
// spec is counted. Loop data a spec imports from src/ is not followed (#2150 tracks that gap). The
// base listing uses the head's node_modules; a base config it cannot load fails the check. A
// listing that fails, or a base that cannot be diffed, fails the check: a count it cannot take is
// never read as "nothing removed".
//
// THE ENTRY. One line per spec file under a `## Test maintenance` heading in any
// docs/work-specs/<x>/spec.md, with an owner and an expiry:
//
//   - e2e/old-walk.spec.ts: group and ungroup kept by editor-groups journeys and scripts/editor-groups.test.mjs; receipt docs/work-specs/x/evidence/groups.md, owner miwco, expires 2026-11-30
//
// The text before `, owner` is the justification, and it is what the reviewer judges. The owner is
// the accountable human owner recorded in scripts/growth-ceilings.json (`ownerLogin`, read at the
// merge base so a change cannot rename the owner and use the new name at once), never an agent. An entry covers a removal only from today until its expiry, at most ENTRY_MAX_DAYS ahead
// (the same 30 days as a budget exception), so a line that once named a file no longer lets every
// later removal from it through, by anyone, for ever. Lines stay on record after they lapse; an
// expired or incomplete line fails only a change that relies on it, and the failure names the line,
// its expiry and what to write instead.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { alarmOwner } from './alarm-owner.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The gate's per-test ceiling: above it one slow test can carry a shard past its 20-minute cap. */
export const TIMEOUT_CEILING_MS = 120_000;

/** How far ahead a maintenance entry may expire: the budget exceptions' limit (EXCEPTION_MAX_DAYS in e2e-capacity.mjs). */
export const ENTRY_MAX_DAYS = 30;

const SPEC = /^e2e\/.+\.spec\.ts$/;
const GATE_SPEC = /^e2e\/[^/]+\.spec\.ts$/;
const UNCONDITIONAL_SKIP = /\btest\.(?:describe\.)?(?:skip|fixme)\(\s*(?:true\b|\)|['"`])|\bskipOldEditor\(\)/;
const TIMEOUT = /\btest\.setTimeout\(\s*([\d_]+)\s*\)/;
const SLOW = /\btest\.slow\(\)/;
const DAY_MS = 86_400_000;

/**
 * Run a command with its stdout written to a file, and resolve with that text. Not through a pipe:
 * Playwright exits as soon as it has listed, and a piped stdout of a few hundred kilobytes then
 * arrives cut off (reproduced: 52,881 and 63,881 of 271,933 bytes, two runs of three).
 */
function runToFile(command, args, { cwd, env }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'e2e-protection-list-'));
  const file = path.join(dir, 'out.txt');
  const fd = openSync(file, 'w');
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, 'pipe'], windowsHide: true });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      closeSync(fd);
      const stdout = readFileSync(file, 'utf8');
      rmSync(dir, { recursive: true, force: true });
      if (code === 0) resolve(stdout);
      else reject(Object.assign(new Error(`exit ${code}`), { stdout, stderr }));
    });
  });
}

/**
 * Read a unified diff into per-file facts. Pure. Test counts are not read here: a diff cannot see a
 * test declared in a loop, so they come from `listCounts`.
 * @returns {Map<string, { skipsAdded: string[], timeoutsAdded: number[], slowAdded: boolean }>}
 */
export function readDiff(diffText) {
  const files = new Map();
  let current = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      const after = m ? m[2].replace(/\\/g, '/') : null;
      current = after && SPEC.test(after) ? after : null;
      if (current && !files.has(current)) files.set(current, { skipsAdded: [], timeoutsAdded: [], slowAdded: false });
      continue;
    }
    if (!current) continue;
    const facts = files.get(current);
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      const text = line.slice(1);
      if (UNCONDITIONAL_SKIP.test(text)) facts.skipsAdded.push(text.trim());
      const t = TIMEOUT.exec(text);
      if (t) facts.timeoutsAdded.push(Number(t[1].replace(/_/g, '')));
      if (SLOW.test(text)) facts.slowAdded = true;
    }
  }
  return files;
}

/** Specs deleted or moved out of e2e/, from `git diff --name-status -M`. */
export function deletedSpecs(nameStatus) {
  const out = [];
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, ...rest] = line.trim().split(/\t/);
    if (!status) continue;
    if (status === 'D' && SPEC.test(rest[0] ?? '')) out.push(rest[0]);
    if (/^R/.test(status) && SPEC.test(rest[0] ?? '') && !SPEC.test(rest[1] ?? '')) out.push(rest[0]);
  }
  return out;
}

/** Each spec renamed inside e2e/, new path to old path, from `git diff --name-status`. */
export function renamedSpecs(nameStatus) {
  const out = new Map();
  for (const line of nameStatus.split(/\r?\n/)) {
    const [status, from, to] = line.trim().split(/\t/);
    if (/^R/.test(status ?? '') && SPEC.test(from ?? '') && SPEC.test(to ?? '')) out.set(to, from);
  }
  return out;
}

/**
 * The Playwright configs that run spec files under e2e/, with the testDir each declares (a test
 * holds this to the config files). `--list` names a file relative to its config's testDir.
 */
export const CONFIGS = { 'playwright.config.ts': 'e2e', 'playwright.live.config.ts': 'e2e/configured', 'playwright.catalog.config.ts': 'e2e/catalog' };

/** The Playwright config that runs a spec file, as the configs' testDir and testIgnore say. */
export function configFor(spec) {
  if (spec.startsWith('e2e/configured/')) return 'playwright.live.config.ts';
  if (spec.startsWith('e2e/catalog/')) return 'playwright.catalog.config.ts';
  return 'playwright.config.ts';
}

/**
 * Whether a changed path can change which tests a spec declares without touching the spec: a
 * helper or fixture under e2e/ (loop data in `_saveMatrix.ts`, say) or a config's own testDir,
 * testIgnore or projects. Then every spec is counted, not only the changed ones.
 */
export function broadens(file) {
  return (file.startsWith('e2e/') && !SPEC.test(file)) || Object.hasOwn(CONFIGS, file);
}

/**
 * Runtime tests per file in `playwright test --list` output, keyed relative to the config's
 * testDir. The listing's own `Total: N tests` line must equal the sum, so a line format this does
 * not read is an error, never a lower count. Pure. (Not the JSON reporter: the catalog config
 * refuses any `--reporter`, since one would replace its scope guard.)
 */
export function parseList(text) {
  const counts = new Map();
  let total = null;
  for (const line of text.split(/\r?\n/)) {
    const t = /^Total: (\d+) tests? in \d+ files?$/.exec(line.trim());
    if (t) { total = Number(t[1]); continue; }
    const m = /^\s+(?:\[[^\]]*\] › )?(.+?):\d+:\d+ › /.exec(line);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const sum = [...counts.values()].reduce((a, n) => a + n, 0);
  if (total === null) throw new Error('playwright --list printed no "Total:" line');
  if (sum !== total) throw new Error(`playwright --list says ${total} tests but ${sum} test lines were read`);
  return counts;
}

/**
 * How many runtime tests Playwright finds per spec file in the checkout at `tree`: in each of
 * `specs` (a file with none counts 0), or, with `specs` null, in every file each config runs.
 * Throws when a listing fails, so an uncounted file never reads as unchanged.
 */
export async function listCounts(tree, specs) {
  const counts = new Map((specs ?? []).map((s) => [s, 0]));
  const byConfig = new Map(specs ? [] : Object.keys(CONFIGS).filter((c) => existsSync(path.join(tree, c))).map((c) => [c, []]));
  for (const s of specs ?? []) byConfig.set(configFor(s), [...(byConfig.get(configFor(s)) ?? []), s]);
  const cli = path.join(tree, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!existsSync(cli)) throw new Error(`no Playwright in ${tree}/node_modules: install dependencies first (npm ci)`);
  const listings = await Promise.all([...byConfig].map(async ([config, files]) => {
    try {
      return [config, await runToFile(process.execPath, [cli, 'test', '--list', '--pass-with-no-tests', '--config', config, ...files], {
        cwd: tree, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      })];
    } catch (e) {
      throw new Error(`playwright --list failed for ${files.join(', ') || 'every spec'} under ${config}: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 3).join(' ')}`, { cause: e });
    }
  }));
  for (const [config, out] of listings) {
    for (const [rel, n] of parseList(out)) {
      const file = `${CONFIGS[config]}/${rel}`;
      if (!specs || counts.has(file)) counts.set(file, n);
    }
  }
  return counts;
}

/**
 * What each changed spec removed, as reasons; empty when nothing was taken out. Pure.
 * `counts` maps a spec to its runtime tests `{ before, after }` (Playwright's own count), and
 * `renamed` a spec moved inside e2e/ to its old path.
 */
export function findings(files, deleted = [], counts = new Map(), renamed = new Map()) {
  const out = new Map();
  const add = (spec, reason) => out.set(spec, [...(out.get(spec) ?? []), reason]);
  for (const spec of deleted) add(spec, 'the spec file is deleted or moved out of e2e/');
  for (const [spec, f] of files) {
    for (const s of f.skipsAdded) add(spec, `an unconditional skip is added: ${s}`);
    if (GATE_SPEC.test(spec)) {
      for (const ms of f.timeoutsAdded) if (ms > TIMEOUT_CEILING_MS) add(spec, `a per-test timeout of ${ms} ms is added, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling`);
      if (f.slowAdded) add(spec, `test.slow() is added (three times the default, above the gate's ${TIMEOUT_CEILING_MS} ms ceiling)`);
    }
  }
  for (const [spec, c] of counts) if (c.before > c.after) add(spec, `${c.before - c.after} test(s) fewer than before (${c.before} -> ${c.after}, counted by playwright --list)`);
  for (const [spec, from] of renamed) if (configFor(spec) !== configFor(from)) add(spec, `the spec moves from ${from} under ${configFor(from)} to ${configFor(spec)}, a different suite`);
  return out;
}

/** Entries under `## Test maintenance` in one work spec's markdown, with owner and expiry when written. */
export function parseMaintenance(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Test maintenance\s*$/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = /^-\s+(?:\d{4}-\d{2}-\d{2}\s+)?`?(e2e\/[^\s:`]+\.spec\.ts)`?:\s*(\S.*)$/.exec(line.trim());
    if (!m) continue;
    const terms = /^(.*?),\s*owner\s+`?([A-Za-z0-9-]+)`?,\s*expires\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(m[2].trim());
    out.push(terms ? { spec: m[1], justification: terms[1].trim(), owner: terms[2], expires: terms[3] } : { spec: m[1], justification: m[2].trim(), owner: null, expires: null });
  }
  return out;
}

/** Every maintenance entry in every work spec on disk. */
export function readMaintenance(root = ROOT) {
  const dir = path.join(root, 'docs', 'work-specs');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const file = path.join(dir, folder.name, 'spec.md');
    if (!existsSync(file)) continue;
    for (const e of parseMaintenance(readFileSync(file, 'utf8'))) out.push({ ...e, from: `docs/work-specs/${folder.name}/spec.md` });
  }
  return out;
}

/** Why an entry does not cover a removal today, or null when it does. Pure. */
export function entryProblem(entry, { today, ownerLogin }) {
  if (!entry.owner || !entry.expires) return 'it has no owner and expiry';
  if (entry.owner !== ownerLogin) return `its owner "${entry.owner}" is not the accountable owner (${ownerLogin}, scripts/growth-ceilings.json)`;
  if (!/[A-Za-z]{3}/.test(entry.justification)) return 'it gives no justification (what stays protected and by what)';
  const exp = Date.parse(`${entry.expires}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(exp)) return `its expiry ${entry.expires} is not a date`;
  if (exp < now) return `it expired on ${entry.expires}`;
  if (exp - now > ENTRY_MAX_DAYS * DAY_MS) return `its expiry ${entry.expires} is more than ${ENTRY_MAX_DAYS} days after today (${today})`;
  return null;
}

/**
 * The verdict: a finding is allowed only by an owned, justified entry for the same spec path that
 * has not expired; otherwise it is refused, with each entry that named it and why it did not count. Pure.
 */
export function verdict(found, entries, { today, ownerLogin }) {
  const refused = [];
  const allowed = [];
  for (const [spec, reasons] of found) {
    const named = entries.filter((e) => e.spec === spec).map((e) => ({ ...e, problem: entryProblem(e, { today, ownerLogin }) }));
    const valid = named.find((e) => !e.problem);
    if (valid) allowed.push({ spec, reasons, entry: valid });
    else refused.push({ spec, reasons, lapsed: named });
  }
  return { refused, allowed };
}

/** The actionable failure for one refused spec: what was removed, which entries did not count and why, and what to write. Pure. */
export function refusalMessage(r, { today, ownerLogin }) {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + ENTRY_MAX_DAYS * DAY_MS).toISOString().slice(0, 10);
  const lapsed = r.lapsed.map((e) => ` The entry for it in ${e.from} does not count: ${e.problem}.`).join('');
  return `${r.spec}: ${r.reasons.join('; ')}.${lapsed} Restore the protection, or, if removing it is deliberate and reviewed, add a line under "## Test maintenance" in the pull request's work spec: "- ${r.spec}: <what stays protected and by what; receipt>, owner ${ownerLogin}, expires <a date from ${today} to ${until}>". A repair never writes this line (scripts/check-e2e-protection.mjs).`;
}

/** The base tree of a diff as a temporary worktree sharing the checkout's node_modules; returns its path and a cleanup. */
function baseTree(root, git, mergeBase) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'e2e-protection-base-'));
  git('worktree', 'add', '--detach', '--force', dir, mergeBase);
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return { dir, remove: () => { try { git('worktree', 'remove', '--force', dir); } catch { rmSync(dir, { recursive: true, force: true }); git('worktree', 'prune'); } } };
}

/** What a change touches under e2e/ and whether counting its tests needs Playwright. Throws when `base` cannot be diffed. */
export function scope({ root = ROOT, base }) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const mergeBase = git('merge-base', base, 'HEAD').trim();
  const files = readDiff(git('diff', '-M', `${mergeBase}..HEAD`, '--', 'e2e'));
  const nameStatus = git('diff', '--name-status', '-M', `${mergeBase}..HEAD`, '--', 'e2e');
  const broad = git('diff', '--name-only', '-M', `${mergeBase}..HEAD`).split(/\r?\n/).some(broadens);
  const deleted = deletedSpecs(nameStatus);
  const kept = [...files.keys()].filter((spec) => !deleted.includes(spec));
  return { git, mergeBase, files, deleted, renamed: renamedSpecs(nameStatus), broad, kept, needsPlaywright: broad || kept.length > 0 };
}

/**
 * The whole check for the checkout at `root` against `base`. The accountable owner is read from the
 * merge base, so a change cannot name a new owner and an entry under that owner at once. Throws
 * when `base` cannot be diffed or a spec's tests cannot be counted.
 */
export async function check({ root = ROOT, base, today, entries = readMaintenance(root) }) {
  const { git, mergeBase, files, deleted, renamed, broad, kept, needsPlaywright } = scope({ root, base });
  const { login: ownerLogin } = alarmOwner(JSON.parse(git('show', `${mergeBase}:scripts/growth-ceilings.json`)));
  const was = (s) => renamed.get(s) ?? s;
  const counts = new Map();
  if (needsPlaywright) {
    let olds = null;
    if (!broad) {
      const atBase = new Set(git('ls-tree', '-r', '--name-only', mergeBase, '--', 'e2e').split(/\r?\n/));
      olds = kept.map(was).filter((s) => atBase.has(s));
    }
    const tree = olds?.length === 0 ? null : baseTree(root, git, mergeBase);
    let after;
    let before;
    try {
      [after, before] = await Promise.all([listCounts(root, broad ? null : kept), tree ? listCounts(tree.dir, olds) : new Map()]);
    } finally {
      tree?.remove();
    }
    const movedAway = new Set(renamed.values());
    const specs = new Set([...after.keys(), ...[...before.keys()].filter((s) => !movedAway.has(s))]);
    for (const spec of specs) if (!deleted.includes(spec)) counts.set(spec, { before: before.get(was(spec)) ?? 0, after: after.get(spec) ?? 0 });
  }
  const found = findings(files, deleted, counts, renamed);
  return { files, deleted, counts, broad, ownerLogin, ...verdict(found, entries, { today, ownerLogin }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  const base = value('--changed');
  if (!base || /^0{40}$/.test(base)) {
    console.log('check-e2e-protection: no base to diff against - nothing to check.');
    process.exit(0);
  }
  let result;
  try {
    result = await check({ base, today });
  } catch (e) {
    console.log(`::error title=E2E protection::cannot check the change against ${base}: ${String(e?.message ?? e).split('\n')[0]}. The check fails rather than read an unchecked change as removing nothing.`);
    process.exit(1);
  }
  const { files, deleted, counts, broad, ownerLogin, refused, allowed } = result;
  const changed = new Set([...files.keys(), ...deleted]).size;
  measured.optional(changed, 'changed spec files read from the diff', 'a change that touches no spec file has nothing to remove');
  if (broad) console.log(`check-e2e-protection: the change touches an e2e helper, fixture or Playwright config, so every spec is counted (${counts.size}).`);
  for (const [spec, c] of counts) if (!broad || c.before !== c.after) console.log(`check-e2e-protection: ${spec}: ${c.before} -> ${c.after} tests (playwright --list).`);
  for (const a of allowed) console.log(`check-e2e-protection: ${a.spec} removes protection (${a.reasons.join('; ')}); the test-maintenance entry in ${a.entry.from} (owner ${a.entry.owner}, expires ${a.entry.expires}) covers it.`);
  if (refused.length === 0) {
    console.log(`check-e2e-protection: OK - ${changed} changed spec file(s)${broad ? ` and ${counts.size} counted` : ''}, none removes protection without a current entry.`);
    process.exit(0);
  }
  for (const r of refused) console.log(`::error title=E2E protection::${refusalMessage(r, { today, ownerLogin })}`);
  process.exit(1);
}
