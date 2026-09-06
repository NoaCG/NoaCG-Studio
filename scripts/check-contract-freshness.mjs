#!/usr/bin/env node
// THE CONTRACTS DESCRIBE THINGS THAT STILL EXIST - and this is what keeps them honest.
//
//   node scripts/check-contract-freshness.mjs        # part of `npm run build`
//
// WHY. Instruction files only ever grow: every session adds a paragraph and nothing removes one,
// so a rule naming a script, a doc or an npm command outlives the thing it names, and the reader
// cannot tell a live constraint from a fossil (owner receipt `instruction-files-need-a-shrinking-
// mechanism`, 2026-09-03). A stale reference is not a judgement call - it is mechanically
// detectable: the file is there or it is not. This gate makes the detection automatic, which is
// the half that lets a contract be TRIMMED safely - a cut that leaves a dangling pointer fails the
// build instead of rotting unread. `check-shared-instructions` already does this for the modular
// orchestrator workflow; this broadens it to every AGENTS.md/CLAUDE.md chain and every workflow.
//
// WHAT IT CHECKS. In each contract file, every backticked token that is unambiguously a repo path
// (a known top-level prefix plus a file extension, or a directory ending in `/`) and every
// `npm run <name>`. A reference marked `(new)` is exempt (the file is being created), and a token
// carrying a glob, a `<placeholder>`, a `~` home or a `$var` is skipped - those are patterns, not
// paths. Existence is asked of GIT (`ls-files`), so the verdict is identical on a laptop and on
// CI's clean checkout, the same reason `check-docs-index` asks git rather than the filesystem.
//
// It fails CLOSED: it names the file, the dangling reference and its kind, and exits non-zero.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Top-level directories a backticked path may name. A token outside these is not treated as a path. */
export const REPO_PREFIXES = Object.freeze([
  'scripts', 'docs', 'src', 'api', 'supabase', 'cli', 'e2e', 'benchmarks', 'public', 'contracts',
  '.github', '.agent-workflows', '.agents', '.claude', 'example_projects', 'NoaCG-Brand-Kit',
]);

const PREFIX_RE = REPO_PREFIXES.map((prefix) => prefix.replace(/[.]/g, '\\.')).join('|');
// A backticked token: `path`. We only look at ones that begin with a known prefix.
const BACKTICKED = /`([^`\n]+)`/g;
const NPM_RUN = /`npm run ([A-Za-z0-9:_-]+)/g;

// Directories whose files are TRANSIENT BY DESIGN - they come and go, and a reference to one is a
// documentation-hygiene matter, not a live constraint that broke. The gate is about durable
// referents (a script, a contract, a source file): a rule naming one that is gone is a fossil.
export const TRANSIENT_PREFIXES = Object.freeze(['docs/handoffs/', 'docs/acceptance/', 'docs/backlog/']);

/** Is this token a pattern rather than a concrete path? Then it is not checkable and is skipped. */
function isPattern(token) {
  return /[*{}<>~$\s]/.test(token) || /\(new\)/i.test(token);
}

/** A reference under a transient-by-design directory is skipped - those files are meant to vanish. */
function isTransient(ref) {
  return TRANSIENT_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

/**
 * The checkable references in one contract's text: concrete repo paths and npm-run names.
 * A path is a token starting with a known top-level prefix that either carries a file extension
 * or ends in `/` (a directory). Everything else backticked is prose (`f0`, `id="fN"`, a symbol).
 */
export function extractRefs(text) {
  const clean = String(text).replace(/\r\n/g, '\n');
  const paths = new Set();
  const dirs = new Set();
  for (const match of clean.matchAll(BACKTICKED)) {
    const token = match[1].trim();
    if (isPattern(token)) continue;
    if (!new RegExp(`^(?:${PREFIX_RE})(?:/|$)`).test(token)) continue;
    if (isTransient(token)) continue;
    if (token.endsWith('/')) dirs.add(token.replace(/\/+$/, ''));
    else if (/\.[A-Za-z0-9]{1,6}$/.test(token)) paths.add(token);
    // A bare prefix with no extension and no slash (e.g. `scripts`) is a directory reference.
    else if (!token.includes('/')) dirs.add(token);
  }
  const npmScripts = new Set([...clean.matchAll(NPM_RUN)].map((match) => match[1]));
  return { paths: [...paths], dirs: [...dirs], npmScripts: [...npmScripts] };
}

/**
 * The dangling references, pure. `tracked` is the set of repo file paths; `dirs` are the set of
 * directory prefixes that contain a tracked file; `npmScripts` are package.json's script names.
 */
export function staleRefs({ paths, dirs, npmScripts }, { tracked, trackedDirs, definedScripts }) {
  const stale = [];
  for (const path of paths) if (!tracked.has(path)) stale.push({ ref: path, kind: 'file' });
  for (const dir of dirs) if (!trackedDirs.has(dir)) stale.push({ ref: `${dir}/`, kind: 'directory' });
  for (const script of npmScripts) if (!definedScripts.has(script)) stale.push({ ref: `npm run ${script}`, kind: 'npm script' });
  return stale;
}

/** Every tracked file, plus the set of directories any tracked file lives under. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  const files = out.split('\n').map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean);
  const dirs = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let index = 1; index <= parts.length - 1; index += 1) dirs.add(parts.slice(0, index).join('/'));
  }
  return { tracked: new Set(files), trackedDirs: dirs };
}

/**
 * The subset of `refs` that git treats as IGNORED - generated or local files a contract may
 * legitimately name (`.claude/launch.json`, `.claude/dev-port.json`), which are absent from a
 * clean checkout by design. Asked of git so the verdict is identical on a laptop and on CI.
 */
function ignoredRefs(refs) {
  if (refs.length === 0) return new Set();
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], { cwd: ROOT, input: refs.join('\n'), encoding: 'utf8' });
    return new Set(out.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch {
    // git check-ignore exits 1 when NONE of the paths are ignored - that is not an error here.
    return new Set();
  }
}

/**
 * The contract files to scan: every AGENTS.md / CLAUDE.md, every workflow markdown, the rule
 * store and what it compiles to. A rule under contracts/rules/ is what the generated
 * .claude/rules/ files are made of, so a stale path there rots in every session that reads a
 * matching file - the same failure this gate exists for. contracts/records/ is NOT scanned: a
 * record is frozen evidence of a moment, and a path it named may rightly be gone.
 */
function contractFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean).filter((file) =>
    /(^|\/)(AGENTS|CLAUDE)\.md$/.test(file) || file.startsWith('.agent-workflows/')
    || (file.startsWith('contracts/') && !file.startsWith('contracts/records/') && file.endsWith('.md'))
    || file.startsWith('.claude/rules/'));
}

function main() {
  const { tracked, trackedDirs } = trackedFiles();
  const definedScripts = new Set(Object.keys(JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts ?? {}));
  const candidates = [];
  let scanned = 0;
  for (const file of contractFiles()) {
    scanned += 1;
    const refs = extractRefs(readFileSync(resolve(ROOT, file), 'utf8'));
    for (const stale of staleRefs(refs, { tracked, trackedDirs, definedScripts })) candidates.push({ file, ...stale });
  }
  // A generated or local path git IGNORES is legitimately named though absent from a clean
  // checkout (`.claude/launch.json`, the gitignored `example_projects/` reference pack). A
  // directory is passed WITH its trailing slash so check-ignore matches a `dir/` rule even when the
  // directory is not on disk - the file half carries no slash, and both come back in that form.
  const ignored = ignoredRefs(candidates.filter((candidate) => candidate.kind !== 'npm script').map((candidate) => candidate.ref));
  const failures = candidates
    .filter((candidate) => !ignored.has(candidate.ref))
    .map((candidate) => `${candidate.file}: ${candidate.kind} \`${candidate.ref}\` is referenced but does not exist (mark it (new) if it is being created, or fix the reference)`);
  if (failures.length) {
    console.error(`Contract freshness FAILED - ${failures.length} dangling reference(s) across ${scanned} contract file(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Contract freshness OK: ${scanned} contract file(s), every referenced script, doc and path exists.`);
}

const isEntrypoint = Boolean(process.argv[1])
  && resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() === resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();
if (isEntrypoint) main();
