#!/usr/bin/env node
// THE TRACED SPEC MAP: which source files had code execute in each e2e spec's browser on the last
// nightly. Generated, never written or merged by hand.
//
// The `// covers:` headers (scripts/e2e-lists.mjs) are CURATED: a person says what a spec covers,
// and a file the spec depends on but nobody listed is a change that lands green and breaks main.
// That happened on 2026-10-10: #927 changed src/templates/importedDesign/svg.ts, which
// e2e/editor-fidelity-trim.spec.ts runs through its SVG drop but did not list, so the pull
// request's plan never ran it and the full run after landing went red. This map is the measured
// half. scripts/e2e-affected.mjs adds its specs to the curated ones (a union, so it only ever
// selects MORE), escalates a file most of the suite executes like CORE, and escalates every file
// that would have asked a map that is missing, unreadable or older than MAX_AGE_DAYS.
//
// EXECUTED, NOT LOADED. The app imports most of src/ eagerly: measured on 2026-10-10, three specs
// each loaded 629 to 1239 of 1498 source files, and layout.spec.ts loaded svg.ts without running
// it. A map of loads would select nearly every spec for any change. V8's function coverage says
// which modules had a function run, and on the same three specs svg.ts ran in exactly the two that
// import SVGs.
//
// How it is recorded: the nightly sets NOACG_E2E_TRACE, and playwright.config.ts then maps the
// specs' Playwright import to e2e/_trace.ts (an auto fixture reading coverage from every page of
// the test) and adds scripts/e2e-trace-reporter.mjs, which writes one trace per shard. The
// report job merges the shards with the committed map (`mergeTraces`) and queues the result as a
// bot pull request (`queueTracedMap`). What it cannot see is what a spec reads from Node
// (`readFileSync` of a fixture or baseline), what the dev server's own handlers run, and pages a
// spec opens in a browser context of its own: the curated headers keep carrying those.
//
//   node scripts/e2e-traced.mjs merge --previous scripts/e2e-traced.json --sha <sha> \
//     --date <iso> [--run <url>] --out scripts/e2e-traced.json <shard-trace.json>...
//   node scripts/e2e-traced.mjs status            # age and size of the committed map
//   node scripts/e2e-traced.mjs specs <file>...   # which specs the map says load these files
//   node scripts/e2e-traced.mjs queue --file <map> --run <url>   # (CI) land it as a bot pull request
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './e2e-quarantine.mjs';
import { configureBotIdentity, queuePullRequest, spawnRunner } from './queue-pr.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The committed map, repo-relative. Also in IGNORE (scripts/e2e-affected.mjs): it moves selection, not behaviour. */
export const MAP_PATH = 'scripts/e2e-traced.json';
export const MAP_VERSION = 1;

/**
 * How old the map may be before every plan that would consult it escalates. The nightly refreshes
 * it every night, so three days is two missed nights of slack: long enough that one bad night does
 * not make every pull request run the escalation set, short enough that a refresh which has
 * silently stopped is found within the week rather than trusted for a month.
 */
export const MAX_AGE_DAYS = 3;

/**
 * A file executed by more than this share of the traced specs is BROAD. Measured on the first
 * whole-suite trace (nightly run 38050437755, 2026-10-10): 276 of 1190 files are over half the
 * suite and the next 13 sit between a third and a half, so the line falls in a real gap. They are
 * the shared UI most specs walk through (the wizard steps, the editor canvas, Home), not noise.
 */
export const BROAD_SHARE = 0.5;

/**
 * WHAT A BROAD FILE DOES TO A PLAN - decided 2026-10-10, revert by flipping this one constant.
 *
 * false (now): a broad file keeps its curated selection and the plan names it; the map adds specs
 * only for narrow files. true: a broad file escalates like CORE (the focus set under sprint focus).
 * Replayed over the 150 landings to origin/main on 2026-10-10 with sprint focus on, today's curated
 * plans total 4915 test-minutes; the narrow union makes that 5555 (+13%), escalating broad files
 * 6152 (+25%, 15 more landings run the focus set), and a plain union with no broad rule 8102
 * (+65%). The miss that motivated the map (#927, `svg.ts`) is narrow and is caught either way, and
 * neither setting ever plans fewer specs than the headers alone.
 */
export const BROAD_ESCALATES = false;

/**
 * The repository file a dev-server script URL names, repo-relative with forward slashes, or null
 * for anything that is not one: dependencies, Vite internals, inline scripts, other origins.
 * `exists` is injectable so the mapping is testable without a checkout.
 */
export function repoFileOf(url, root = ROOT, exists = isFile) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(parsed.hostname)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (/^\/(@id|@vite|@react-refresh|node_modules)\b/.test(pathname)) return null;
  const rootPosix = root.replaceAll(path.win32.sep, '/').replace(/\/$/, '');
  let rel;
  if (pathname.startsWith('/@fs/')) {
    const abs = pathname.slice('/@fs'.length).replace(/^\/([A-Za-z]:)/, '$1');
    if (!abs.toLowerCase().startsWith(`${rootPosix.toLowerCase()}/`)) return null;
    rel = abs.slice(rootPosix.length + 1);
  } else {
    rel = pathname.replace(/^\/+/, '');
  }
  if (!rel || rel.startsWith('node_modules/') || rel.split('/').includes('..')) return null;
  return exists(path.join(root, rel)) ? rel : null;
}

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * One run's trace from the fixture's records (e2e/_trace.ts writes one JSON line per test) and
 * the run's outcomes: `{ specs: { [spec]: { complete, files } } }`. A spec is complete when
 * every test of it ran to a pass or a skip; anything else executed only part of what it needs.
 *
 * @param {Array<{ spec: string, urls: string[] }>} records
 * @param {Map<string, boolean>} complete spec -> did every planned test finish
 */
export function traceOf(records, complete, toFile = repoFileOf) {
  // Every test of a shard asks about the same thousand-odd module URLs; look each one up once.
  const known = new Map();
  const fileOf = (url) => {
    if (!known.has(url)) known.set(url, toFile(url));
    return known.get(url);
  };
  const files = new Map();
  for (const { spec, urls } of records) {
    if (!files.has(spec)) files.set(spec, new Set());
    for (const url of urls ?? []) {
      const file = fileOf(url);
      if (file) files.get(spec).add(file);
    }
  }
  const specs = {};
  for (const spec of [...new Set([...complete.keys(), ...files.keys()])].sort()) {
    specs[spec] = { complete: complete.get(spec) ?? false, files: [...(files.get(spec) ?? [])].sort() };
  }
  return { specs };
}

/** The fixture's JSON lines from every worker file in `dir`. */
export function readRecords(dir) {
  if (!existsSync(dir)) return [];
  const records = [];
  for (const name of readdirSync(dir).filter((n) => /^worker-\d+\.jsonl$/.test(n)).sort()) {
    for (const line of readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (line.trim()) records.push(JSON.parse(line));
    }
  }
  return records;
}

/**
 * One night's map from the shards' traces and the previous map.
 *
 * A spec every shard traced COMPLETELY (every one of its tests ran and passed or was skipped) is
 * taken from tonight alone, so a file it stopped loading leaves its entry. A spec that failed,
 * was cut short or sent no trace keeps what the previous map said too: a test that stopped early
 * loaded only part of what it needs, and dropping the rest would let the next change to it go
 * unselected. Specs no longer on disk are dropped.
 *
 * @param {Array<{ specs: Record<string, { complete: boolean, files: string[] }> }>} shards
 * @param {{ files?: Record<string, string[]> } | null} previous
 * @param {{ sha: string, tracedAt: string, run?: string, specsOnDisk: string[] }} meta
 */
export function mergeTraces(shards, previous, { sha, tracedAt, run = '', specsOnDisk }) {
  const tonight = new Map();
  for (const shard of shards) {
    for (const [spec, entry] of Object.entries(shard.specs ?? {})) {
      const seen = tonight.get(spec) ?? { complete: true, files: new Set() };
      seen.complete &&= Boolean(entry.complete);
      for (const f of entry.files ?? []) seen.files.add(f);
      tonight.set(spec, seen);
    }
  }
  const before = specFilesOf(previous);
  const bySpec = new Map();
  const carried = [];
  const untraced = [];
  let fresh = 0;
  for (const spec of [...specsOnDisk].sort()) {
    const now = tonight.get(spec);
    const old = before.get(spec);
    if (now?.complete) {
      bySpec.set(spec, now.files);
      fresh += 1;
      continue;
    }
    const files = new Set([...(now?.files ?? []), ...(old ?? [])]);
    if (old) carried.push(spec);
    if (files.size === 0) {
      untraced.push(spec);
      continue;
    }
    bySpec.set(spec, files);
  }
  const files = {};
  const index = new Map();
  for (const [spec, set] of bySpec) {
    for (const f of set) {
      if (!index.has(f)) index.set(f, []);
      index.get(f).push(spec);
    }
  }
  for (const f of [...index.keys()].sort()) files[f] = index.get(f).sort();
  return { version: MAP_VERSION, sha, tracedAt, run, specs: bySpec.size, fresh, carried, untraced, files };
}

/**
 * The least share of the suite a night must trace to completion before its map may carry that
 * night's date. The date is what the planner's age limit reads, so a night that traced nothing (no
 * shard sent a trace, the artifacts did not download) and stamped its carried-over content as new
 * would keep an old map "fresh" for ever. Below this line the merge refuses, the job goes red, and
 * the committed map ages into escalation as it should.
 */
export const MIN_FRESH_SHARE = 0.5;

/** Why a merged map must not be published, or null. */
export function mergeRefusal(map, specsOnDisk) {
  const need = Math.ceil(MIN_FRESH_SHARE * specsOnDisk.length);
  return map.fresh >= need ? null : `only ${map.fresh} of ${specsOnDisk.length} spec(s) were traced to completion tonight (need ${need}); refusing to date carried-over entries as new`;
}

/** spec -> Set(file) from a map's file index. */
function specFilesOf(map) {
  const out = new Map();
  for (const [file, specs] of Object.entries(map?.files ?? {})) {
    for (const spec of specs) {
      if (!out.has(spec)) out.set(spec, new Set());
      out.get(spec).add(file);
    }
  }
  return out;
}

/**
 * The map as committed: one file per line, so a night's diff reads as the files whose loaders
 * changed, and git can show it rather than a single changed line of megabytes.
 */
export function serializeMap(map) {
  const { files, ...head } = map;
  const lines = Object.entries(files).map(([f, specs]) => `    ${JSON.stringify(f)}: ${JSON.stringify(specs)}`);
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${headJson},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/**
 * What the planner gets: the file index, or the reason it may not be trusted. Never throws - a map
 * that cannot be read is a `problem`, and a problem escalates. NOACG_E2E_TRACED_MAP points it at
 * another map file, which is how the planner's own tests hand it a map they control instead of
 * one whose age depends on the day they run.
 *
 * @returns {{ files: Map<string, string[]>, broad: Set<string>, problem: string | null, tracedAt: string | null }}
 */
export function readTracedMap({ file = process.env.NOACG_E2E_TRACED_MAP || path.join(ROOT, MAP_PATH), now = Date.now() } = {}) {
  if (!existsSync(file)) return untrusted(`no traced spec map at ${path.relative(ROOT, file).replaceAll(path.win32.sep, '/')}`);
  let map;
  try {
    map = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return untrusted(`the traced spec map is unreadable (${error.message})`);
  }
  return tracedFrom(map, now);
}

/** A map the planner may not trust: it lends no specs, and its `problem` escalates. */
function untrusted(problem, tracedAt = null) {
  return { files: new Map(), broad: new Set(), broadEscalates: BROAD_ESCALATES, problem, tracedAt };
}

/** `readTracedMap` minus the disk, for tests. */
export function tracedFrom(map, now = Date.now()) {
  const none = (problem) => untrusted(problem, map?.tracedAt ?? null);
  if (map?.version !== MAP_VERSION || typeof map.files !== 'object' || map.files === null) {
    return none(`the traced spec map is not version ${MAP_VERSION}`);
  }
  const at = Date.parse(map.tracedAt);
  if (!Number.isFinite(at)) return none('the traced spec map has no tracedAt date');
  const days = (now - at) / 86_400_000;
  if (days > MAX_AGE_DAYS) {
    return none(`the traced spec map is ${days.toFixed(1)} days old (limit ${MAX_AGE_DAYS}; traced ${map.tracedAt} at ${String(map.sha).slice(0, 9)})`);
  }
  const files = new Map(Object.entries(map.files));
  const limit = BROAD_SHARE * (map.specs || 1);
  const broad = new Set([...files].filter(([, specs]) => specs.length > limit).map(([file]) => file));
  return { files, broad, broadEscalates: BROAD_ESCALATES, problem: null, tracedAt: map.tracedAt };
}

/** The one branch the nightly's map lands through. */
export const MAP_BRANCH = 'bot/e2e-traced';

/**
 * Land a freshly merged map through the merge queue: cut `MAP_BRANCH` from origin/main, put the
 * map in, commit and queue it (scripts/queue-pr.mjs). The branch is REGENERATED every night and
 * force-pushed over the last one, so an open pull request from a night that has not landed yet is
 * replaced rather than merged with: nobody ever resolves a conflict in this file. A closed pull
 * request does not mute the next night either - a stale map escalates every plan, so the refresh
 * must keep coming. `file` lives outside the checkout, because the checkout is switched to the
 * branch first.
 */
export function queueTracedMap({ file, runUrl = '', summary = '', root = ROOT, git = spawnRunner('git'), gh = spawnRunner('gh') }) {
  const next = readFileSync(file, 'utf8');
  git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const base = git(['rev-parse', 'refs/remotes/origin/main']).out;
  git(['checkout', '-q', '--force', '-B', MAP_BRANCH, base]);
  const target = path.join(root, MAP_PATH);
  if (existsSync(target) && readFileSync(target, 'utf8') === next) return { skipped: 'origin/main already holds this map' };
  writeFileSync(target, next);
  configureBotIdentity(git);
  git(['add', MAP_PATH]);
  const title = 'Refresh the traced e2e spec map from the nightly';
  const body = [summary, `Generated by .github/workflows/nightly.yml (scripts/e2e-traced.mjs)${runUrl ? ` in ${runUrl}` : ''}. Regenerated every night: never edit or merge this file by hand.`].filter(Boolean).join('\n\n');
  git(['commit', '-q', '-m', title, '-m', body]);
  return queuePullRequest({ branch: MAP_BRANCH, title, body, mechanism: 'traced spec map from the nightly', runUrl, diffBase: base, force: true, git, gh });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function main(argv) {
  const { command, rest, flags } = parseArgs(argv);
  if (command === 'merge') {
    const out = flags.get('--out');
    const sha = flags.get('--sha');
    const tracedAt = flags.get('--date');
    if (!out || !sha || !tracedAt) throw new Error('merge needs --out, --sha and --date');
    const { specFilesOnDisk } = await import('./e2e-durations.mjs');
    const prevFile = flags.get('--previous');
    const previous = prevFile && existsSync(prevFile) ? readJson(prevFile) : null;
    const shards = rest.map(readJson);
    const specsOnDisk = specFilesOnDisk();
    const map = mergeTraces(shards, previous, { sha, tracedAt, run: flags.get('--run') ?? '', specsOnDisk });
    const refusal = mergeRefusal(map, specsOnDisk);
    if (refusal) {
      console.error(`e2e-traced: ${refusal}. The committed map is left to age; plans escalate once it passes ${MAX_AGE_DAYS} days.`);
      return 1;
    }
    writeFileSync(out, serializeMap(map));
    const some = (list) => (list.length === 0 ? 'none' : `${list.slice(0, 10).join(', ')}${list.length > 10 ? `, and ${list.length - 10} more` : ''}`);
    console.log(
      `e2e-traced: ${map.fresh} of ${specsOnDisk.length} spec(s) traced to completion from ${shards.length} shard trace(s), ${Object.keys(map.files).length} source file(s); ` +
        `${map.carried.length} kept their previous entry (${some(map.carried)}), ${map.untraced.length} have none (${some(map.untraced)}).`,
    );
    return 0;
  }
  if (command === 'status') {
    const t = readTracedMap();
    if (t.problem) {
      console.log(`e2e-traced: ${t.problem} - every plan that would consult it escalates.`);
      return 1;
    }
    console.log(`e2e-traced: traced ${t.tracedAt}, ${t.files.size} source file(s).`);
    return 0;
  }
  if (command === 'specs') {
    const t = readTracedMap();
    if (t.problem) console.log(`e2e-traced: ${t.problem}`);
    for (const f of rest) console.log(`${f}: ${(t.files.get(f.replaceAll('\\', '/')) ?? []).join(', ') || '(no spec loaded it)'}`);
    return 0;
  }
  if (command === 'queue') {
    const file = flags.get('--file');
    if (!file) throw new Error('queue needs --file');
    const result = queueTracedMap({ file, runUrl: flags.get('--run') ?? '', summary: flags.get('--summary') ?? '' });
    console.log(result.skipped ? `e2e-traced: ${result.skipped}` : `e2e-traced: queued ${result.url}`);
    return 0;
  }
  console.error('usage: e2e-traced.mjs merge|status|specs|queue (see the header)');
  return 2;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isEntrypoint) process.exit(await main(process.argv.slice(2)));
