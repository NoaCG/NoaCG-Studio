#!/usr/bin/env node
// gate: after-build
// guards: src/output/**, src/model/ografTyped.ts, vite.config.ts, output.html
//
// THE OUTPUT'S READER, IN THE BUNDLE AN OUTPUT LOADS (docs/work-specs/playout-ograf-contract/spec.md,
// E1.1 "Read gate first").
//
//   node scripts/check-output-reader.mjs        # part of `npm run build`, once dist/ exists
//
// An output is a browser source or a CasparCG HTML producer. CasparCG 2.3's Chromium 71 cannot
// PARSE optional chaining or `??`: one such token anywhere in the output's module graph and the
// whole page fails to load on that server, with no error anyone at the NoaCG end can see. Vite's
// `es2017` target (vite.config.ts) is what lowers the syntax, and the runtime APIs are shimmed in
// output.html. This check reads what was actually BUILT, never the source:
//
//   1. the module graph the built output page loads (its entry and every static import) parses,
//      and none of it holds syntax Chromium 71 cannot parse (`?.`, `??`, and what ES2021+ adds,
//      which the parser itself refuses at ecmaVersion 2020);
//   2. the typed read gate (src/model/ografTyped.ts `readTypedWire`) is in that graph: its
//      refusal words ship to every output, so an output that meets an envelope refuses it.
//
// Node's own test of the reader is scripts/ograf-typed.test.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'acorn';

import { measured } from './measured.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Words only the typed read gate says; finding them proves the reader shipped. */
export const READER_WORDS = ['This output cannot show typed data yet', 'This output cannot read this command'];

/** The syntax Chromium 71 cannot parse that ecmaVersion 2020 still accepts, at its position. */
export function unparseable(code) {
  const ast = Parser.parse(code, { ecmaVersion: 2020, sourceType: 'module' });
  const found = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ChainExpression') found.push({ at: node.start, what: 'optional chaining' });
    if (node.type === 'LogicalExpression' && node.operator === '??') found.push({ at: node.start, what: 'nullish coalescing' });
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && typeof child.type === 'string') walk(child);
    }
  };
  walk(ast);
  return { ast, found };
}

/** The modules a parsed module loads, as written: its static imports, and every `import()` of a
 *  literal path, since an output loads those chunks too. */
function importsOf(ast) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) out.push(node.source.value);
    if (node.type === 'ImportExpression' && node.source.type === 'Literal' && typeof node.source.value === 'string') out.push(node.source.value);
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && typeof child.type === 'string') walk(child);
    }
  };
  walk(ast);
  return out;
}

function main() {
  const page = join(dist, 'output.html');
  if (!existsSync(page)) {
    console.error('check-output-reader: dist/output.html is missing. Run `vite build` first.');
    process.exit(1);
  }
  const html = readFileSync(page, 'utf8');
  const entries = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (entries.length !== 1) {
    console.error(`check-output-reader: expected one module script in dist/output.html, found ${entries.length}.`);
    process.exit(1);
  }
  const seen = new Set();
  const queue = [join(dist, entries[0].replace(/^\//, ''))];
  const problems = [];
  let reader = false;
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    let parsed;
    try {
      parsed = unparseable(code);
    } catch (error) {
      problems.push(`${file.slice(dist.length + 1)}: does not parse as ES2020 (${error.message})`);
      continue;
    }
    for (const { at, what } of parsed.found) problems.push(`${file.slice(dist.length + 1)}:${at}: ${what}, which CasparCG 2.3's Chromium 71 cannot parse`);
    if (READER_WORDS.every((words) => code.includes(words))) reader = true;
    for (const spec of importsOf(parsed.ast)) {
      if (spec.startsWith('.') || spec.startsWith('/')) queue.push(spec.startsWith('/') ? join(dist, spec.slice(1)) : resolve(dirname(file), spec));
    }
  }
  measured(seen.size, 'output bundle modules parsed');
  if (!reader) problems.push('the typed read gate (src/model/ografTyped.ts readTypedWire) is not in the output bundle');
  if (problems.length) {
    console.error(`check-output-reader: ${problems.length} problem(s) in the built output:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-output-reader: ${seen.size} output module(s) parse on Chromium 71, and the typed read gate is in them.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
