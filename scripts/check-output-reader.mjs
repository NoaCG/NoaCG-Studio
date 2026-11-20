#!/usr/bin/env node
// gate: after-build
// guards: src/**, src/output/**, src/model/ografTyped.ts, vite.config.ts, output.html
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
//      and none of it holds syntax Chromium 71 cannot parse (`?.`, `??` and `export * as`, which
//      ES2020 added, and what ES2021+ adds, which the parser itself refuses at ecmaVersion 2020);
//   2. none of it calls a built-in Chromium 71 lacks (`MISSING_ON_71`) unless output.html shims
//      it (`SHIMMED`): a missing method passes the parse and throws only when called, which is how
//      `matchAll` kept every CasparCG 2.3 output from joining (#2603);
//   3. the typed read gate (src/model/ografTyped.ts `readTypedWire`) is in that graph: its
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

/** Words only the typed read gate says (src/model/ografTyped.ts `readTypedWire`) and only the
 *  output's call of it says (src/output/main.ts): finding all three proves the gate shipped, and
 *  is called, in what an output loads. The call's place in front of the stage is pinned in Node
 *  (scripts/ograf-typed.test.mjs). */
export const READER_WORDS = ['This output cannot show typed data yet', 'This output cannot read this command', 'typed data refused for'];

/** Built-ins CasparCG 2.3's Chromium 71 does not have (the Chrome version that added each in the
 *  comment). Instance methods are matched where called, by property name on any object; statics and globals by
 *  their full name, since `.any` or `.groupBy` alone would match ordinary code. Not seen: a call
 *  through `.call`/`.apply` on a prototype, a destructured static, and code shipped as text into
 *  the graphic's iframe (composeDocument's runtime strings). The real-engine check for those is
 *  e2e/output-boot-resilience.spec.ts, which boots the output with these built-ins removed. */
export const MISSING_ON_71 = {
  methods: [
    'matchAll', // 73
    'replaceAll', // 85
    'at', // 92
    'findLast', 'findLastIndex', // 97
    'toSorted', 'toReversed', 'toSpliced', // 110
    'isWellFormed', 'toWellFormed', // 111
    'replaceChildren', // 86
    'with', // 110
    'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf', 'isDisjointFrom', // 122
    // Set's `union` (122) is left out: it is a common name in ordinary libraries.
  ],
  statics: [
    'Promise.allSettled', // 76
    'Promise.any', // 85
    'Object.hasOwn', // 93
    'Promise.withResolvers', // 119
    'Object.groupBy', 'Map.groupBy', // 117
    'Array.fromAsync', // 121
    'URL.canParse', // 120
    'URL.parse', // 126
    'AbortSignal.timeout', // 103
    'AbortSignal.any', // 116
    'Promise.try', // 128
  ],
  globals: [
    'structuredClone', // 98
    'WeakRef', 'FinalizationRegistry', // 84
    'AggregateError', // 85
  ],
};

/** Built-ins output.html defines before the bundle runs, each with the text that proves the shim
 *  is still there. */
export const SHIMMED = {
  'Promise.allSettled': 'Promise.allSettled || (Promise.allSettled = function',
  structuredClone: 'window.structuredClone || (window.structuredClone = function',
};

/** Every use in a parsed module of a built-in Chromium 71 lacks, at its position. */
export function missingBuiltIns(ast) {
  const methods = new Set(MISSING_ON_71.methods);
  const statics = new Set(MISSING_ON_71.statics);
  const globals = new Set(MISSING_ON_71.globals);
  const found = [];
  const name = (node) => (node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name);
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    // A method counts where it is called: `.at` is also an ordinary field name (`step.at`).
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && methods.has(name(node.callee))) found.push({ at: node.start, what: name(node.callee) });
    if (node.type === 'MemberExpression') {
      const prop = name(node);
      if (node.object.type === 'Identifier' && statics.has(`${node.object.name}.${prop}`)) found.push({ at: node.start, what: `${node.object.name}.${prop}` });
      if (node.object.type === 'Identifier' && ['window', 'self', 'globalThis'].includes(node.object.name) && globals.has(prop)) found.push({ at: node.start, what: prop });
    }
    if (node.type === 'Identifier' && globals.has(node.name)) found.push({ at: node.start, what: node.name });
    for (const key of Object.keys(node)) {
      if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
      if (key === 'key' && node.type === 'Property' && !node.computed) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && typeof child.type === 'string') walk(child);
    }
  };
  walk(ast);
  return found;
}

/** The syntax Chromium 71 cannot parse that ecmaVersion 2020 still accepts, at its position. */
export function unparseable(code) {
  const ast = Parser.parse(code, { ecmaVersion: 2020, sourceType: 'module' });
  const found = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ChainExpression') found.push({ at: node.start, what: 'optional chaining' });
    if (node.type === 'LogicalExpression' && node.operator === '??') found.push({ at: node.start, what: 'nullish coalescing' });
    if (node.type === 'ExportAllDeclaration' && node.exported) found.push({ at: node.start, what: '`export * as`' });
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
    // Rolldown writes some dynamic imports as a template literal with no expressions.
    if (node.type === 'ImportExpression' && node.source.type === 'TemplateLiteral' && node.source.expressions.length === 0) out.push(node.source.quasis[0].value.cooked);
    // A worker or chunk the module loads by `new URL('./x.js', import.meta.url)`.
    if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL' && node.arguments[0]?.type === 'Literal' && /\.js$/.test(String(node.arguments[0].value))) out.push(node.arguments[0].value);
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
  const shipped = new Set();
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
    for (const { at, what } of missingBuiltIns(parsed.ast)) {
      if (SHIMMED[what] && html.includes(SHIMMED[what])) continue;
      problems.push(`${file.slice(dist.length + 1)}:${at}: calls ${what}, which CasparCG 2.3's Chromium 71 does not have (shim it in output.html or write it another way)`);
    }
    for (const words of READER_WORDS) if (code.includes(words)) shipped.add(words);
    for (const spec of importsOf(parsed.ast)) {
      if (spec.startsWith('.') || spec.startsWith('/')) queue.push(spec.startsWith('/') ? join(dist, spec.slice(1)) : resolve(dirname(file), spec));
    }
  }
  measured(seen.size, 'output bundle modules parsed');
  for (const words of READER_WORDS) if (!shipped.has(words)) problems.push(`the typed read gate's "${words}" is not in the output bundle`);
  if (problems.length) {
    console.error(`check-output-reader: ${problems.length} problem(s) in the built output:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-output-reader: ${seen.size} output module(s) parse on Chromium 71, call no built-in it lacks unshimmed, and the typed read gate is in them.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
