#!/usr/bin/env node
// What the instruction contracts cost a session (docs/WORKFLOW_ARCHITECTURE.md §9).
//
//   npm run metrics:contracts                 # today's numbers
//   npm run metrics:contracts -- --at 2026-08-15   # the same numbers at a past commit
//
// Reports: the corpus (every tracked AGENTS.md / CLAUDE.md), the root-to-leaf chains the Codex
// gate measures, the per-file multiplier (bytes x chains that load the file), the compiled layer
// under .claude/rules/ split into what loads at launch and what loads on a matching read, and a
// token estimate at bytes / 4. `--at` reads the tree from git so growth can be measured without
// checking anything out.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function shaAt(date) {
  if (!date) return 'HEAD';
  return git(['log', '-1', '--format=%H', `--before=${date} 23:59:59`, 'origin/main']).trim() || 'HEAD';
}

function files(sha, pattern) {
  return git(['ls-tree', '-r', '--name-only', sha]).split('\n').filter((f) => pattern.test(f));
}

/** The file's text at a commit; the working tree when no `--at` was asked, which needs no git. */
function textAt(sha, file) {
  const text = sha === 'HEAD' ? readFileSync(path.join(ROOT, file), 'utf8') : git(['show', `${sha}:${file}`]);
  return text.replace(/\r\n/g, '\n');
}

const bytesAt = (sha, file) => Buffer.byteLength(textAt(sha, file), 'utf8');

/** Is the contract at `file` loaded by a session working in `dir`? The root and every ancestor are. */
function loadsIn(file, dir) {
  const d = path.posix.dirname(file);
  return d === '.' || dir === d || dir.startsWith(`${d}/`);
}

/** Every chain: for each AGENTS.md leaf, the AGENTS.md files on the path from the root. */
function chains(agentsFiles, sizes) {
  return agentsFiles.map((leaf) => {
    const dir = path.posix.dirname(leaf);
    const parts = agentsFiles.filter((f) => loadsIn(f, dir));
    const bytes = parts.reduce((sum, f) => sum + sizes.get(f), 0) + 2 * (parts.length - 1);
    return { leaf: dir === '.' ? '(root)' : dir, parts, bytes };
  });
}

function main() {
  const args = process.argv.slice(2);
  const at = args.includes('--at') ? args[args.indexOf('--at') + 1] : null;
  const sha = shaAt(at);
  const contracts = files(sha, /(^|\/)(AGENTS|CLAUDE)\.md$/);
  const sizes = new Map(contracts.map((f) => [f, bytesAt(sha, f)]));
  const agents = contracts.filter((f) => /(^|\/)AGENTS\.md$/.test(f));
  const corpus = [...sizes.values()].reduce((a, b) => a + b, 0);
  const allChains = chains(agents, sizes).sort((a, b) => b.bytes - a.bytes);
  const loads = new Map(agents.map((f) => [f, 0]));
  for (const chain of allChains) for (const f of chain.parts) loads.set(f, loads.get(f) + 1);
  const multipliers = [...loads.entries()]
    .map(([f, n]) => ({ file: f, bytes: sizes.get(f), chains: n, product: sizes.get(f) * n }))
    .sort((a, b) => b.product - a.product)
    .slice(0, 6);
  const compiled = files(sha, /^\.claude\/rules\/.*\.md$/);
  let launch = 0;
  let scoped = 0;
  for (const f of compiled) {
    const text = textAt(sha, f);
    if (text.startsWith('---\npaths:')) scoped += Buffer.byteLength(text, 'utf8');
    else launch += Buffer.byteLength(text, 'utf8');
  }
  const root = sizes.get('AGENTS.md') ?? 0;

  console.log(`[metrics:contracts] at ${at ?? 'HEAD'} (${sha.slice(0, 8)})`);
  console.log(`  corpus: ${contracts.length} files, ${corpus.toLocaleString()} bytes (LF)`);
  console.log(`  root AGENTS.md: ${root.toLocaleString()} bytes x ${agents.length} chains = ${(root * agents.length).toLocaleString()} (~${Math.round(root / 4).toLocaleString()} tokens per session)`);
  console.log(`  compiled layer: ${compiled.length} file(s); ${launch.toLocaleString()} bytes load at launch, ${scoped.toLocaleString()} bytes load on a matching read`);
  console.log('  tightest chains (bytes, files):');
  for (const c of allChains.slice(0, 5)) console.log(`    ${String(c.bytes).padStart(8)}  ${c.parts.length}  ${c.leaf}  (~${Math.round(c.bytes / 4).toLocaleString()} tokens)`);
  console.log('  multipliers (bytes x chains):');
  for (const m of multipliers) console.log(`    ${String(m.product).padStart(10)}  ${m.file} (${m.bytes} x ${m.chains})`);
}

main();
