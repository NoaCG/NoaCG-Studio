#!/usr/bin/env node
// cicd-followup land-c-measure planner: for each failing run's head, the full selection and the
// "direct set" the selector of THAT commit gives for that head's changed files. No API calls.
//
//   node docs/work-specs/cicd-followup/evidence/land-c-measure-plan.mjs --cache <dir> --work <dir> [--shard i/n]
//
// --shard i/n plans every n-th head from the i-th (1-based), so n copies can run side by side.
//
// Reads <cache>/changed/<sha>.json (the collector) and writes <cache>/plans/<sha>.json.
//
// How the direct set is computed (no supported switch exists: `BROAD_ESCALATES` is a constant in
// scripts/e2e-traced.mjs, and `--no-focus` only turns an escalation into the whole suite):
//  1. A detached scratch worktree at the head (never this checkout), so the headers, CORE list,
//     traced map and selector are the ones the worker would have had.
//  2. FULL: `node scripts/e2e-affected.mjs --json --files <changed>` as committed. Its size is
//     the offline specs (the whole suite on disk when mode is full) plus the configured specs.
//  3. DIRECT: the same CLI with `BROAD_ESCALATES = false` written into that scratch copy only,
//     run once per changed file. A file's direct specs are its plan minus the critical journeys
//     the plan added (`critical.added`, a product-change rule, not a mapping). When the file
//     escalated anyway (CORE, unmapped, an untrusted traced map: the plan then holds every
//     non-quarantined FOCUS spec, since the JSON has no `focusApplied`), the plan is the
//     shared-change set; its direct part is the plan minus FOCUS, plus the FOCUS specs whose own
//     `// covers:` header names the file (COVERAGE of that commit). Configured direct specs are the
//     plan's per-file configured reasons only (`configuredReasons.files[file]`), never the whole
//     configured set an escalation selects.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const CACHE = resolve(opt('--cache'));
const WORK = resolve(opt('--work'));
const REPO = process.cwd();
mkdirSync(join(CACHE, 'plans'), { recursive: true });
mkdirSync(WORK, { recursive: true });

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function cli(dir, files) {
  const out = execFileSync('node', ['scripts/e2e-affected.mjs', '--json', '--files', ...files], {
    cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GITHUB_ACTIONS: '', NOACG_E2E_TRACED_MAP: '' },
  });
  return JSON.parse(out);
}
const bare = (s) => s.replace(/^e2e\//, '');

const [shardI, shardN] = (opt('--shard') ?? '1/1').split('/').map(Number);
for (const [k, name] of readdirSync(join(CACHE, 'changed')).sort().entries()) {
  if (k % shardN !== shardI - 1) continue;
  const sha = name.replace('.json', '');
  const target = join(CACHE, 'plans', name);
  if (existsSync(target)) continue;
  const { files } = JSON.parse(readFileSync(join(CACHE, 'changed', name), 'utf8'));
  const dir = join(WORK, sha.slice(0, 12));
  if (!existsSync(dir)) git(REPO, 'worktree', 'add', '-q', '--detach', dir, sha);
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
  try {
    const full = cli(dir, files);
    const suite = readdirSync(join(dir, 'e2e')).filter((f) => f.endsWith('.spec.ts'));
    // Direct: broad escalation off, in the scratch copy only.
    const traced = join(dir, 'scripts/e2e-traced.mjs');
    const text = readFileSync(traced, 'utf8');
    const hasSwitch = /export const BROAD_ESCALATES = (true|false);/.test(text);
    writeFileSync(traced, text.replace(/export const BROAD_ESCALATES = (true|false);/, 'export const BROAD_ESCALATES = false;'));
    const lists = await import(pathToFileURL(join(dir, 'scripts/e2e-lists.mjs')).href);
    const focus = new Set((lists.FOCUS ?? []).map(bare));
    const direct = new Set();
    const directConfigured = new Set();
    const perFile = {};
    const escalated = [];
    for (const f of files) {
      const p = cli(dir, [f]);
      const crit = new Set((p.critical?.added ?? []).map(bare));
      let mine = (p.specs ?? []).map(bare).filter((s) => !crit.has(s));
      // The JSON does not carry `focusApplied`: an escalated plan is the one that holds every
      // FOCUS spec not quarantined (or the whole suite).
      const quarantined = new Set((p.quarantined ?? []).map(bare));
      const planned = new Set(mine);
      const isFocus = focus.size > 0 && [...focus].every((s) => planned.has(s) || quarantined.has(s));
      if (isFocus || p.mode === 'full') {
        escalated.push(f);
        const named = new Set((lists.COVERAGE ?? []).filter((c) => c.test(f)).map((c) => bare(c.spec)));
        mine = mine.filter((s) => !focus.has(s) || named.has(s));
      }
      const conf = (p.configuredReasons?.files?.[f] ?? []).map(bare);
      for (const s of mine) direct.add(s);
      for (const s of conf) directConfigured.add(s);
      if (mine.length || conf.length) perFile[f] = { specs: mine, configured: conf };
    }
    writeFileSync(traced, text);
    const fullSpecs = full.mode === 'full' ? suite : (full.specs ?? []).map(bare);
    writeFileSync(target, JSON.stringify({
      sha, files: files.length, broadSwitch: hasSwitch,
      full: { mode: full.mode, focusApplied: full.focusApplied, specs: fullSpecs, configured: (full.configured?.specs ?? full.configuredSpecs ?? []).map(bare), broad: full.traced?.broad ?? full.tracedBroad ?? [], quarantined: full.quarantined ?? [] },
      direct: { specs: [...direct].sort(), configured: [...directConfigured].sort(), escalated, perFile },
    }));
    console.log(JSON.stringify({ sha: sha.slice(0, 12), files: files.length, full: fullSpecs.length, direct: direct.size, escalated: escalated.length }));
  } catch (e) {
    console.log(JSON.stringify({ sha: sha.slice(0, 12), error: String(e.message).split('\n')[0].slice(0, 200) }));
  } finally {
    git(REPO, 'worktree', 'remove', '--force', dir);
    rmSync(dir, { recursive: true, force: true });
  }
}
