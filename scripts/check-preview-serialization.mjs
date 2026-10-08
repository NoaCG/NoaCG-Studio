#!/usr/bin/env node
// gate: build
// guards: src/**
//
// A function serialized into a preview document with `.toString()` must be bound under the name
// the BUNDLER gave it, not under the name this repo's source spells.
//
// The failure this gate exists for is invisible in every environment a developer or the e2e suite
// can reach. `.toString()` returns a function's source AS THE BUNDLER LEFT IT. `npm run dev`
// serves the original identifiers, so a serialized `runSimCommand` calling `killAllTimelines(w)`
// finds the helper composeDocument.ts bound under that spelling. `vite build` MINIFIES both, so
// the same emitted body reads `Q(w)` while the document still binds `killAllTimelines` — and
// composeDocument wraps every command in `try { … } catch (e) {}`, so the `ReferenceError` is
// swallowed. On https://noacg.studio that silently killed the editor's whole simulator: the stage
// never settled (blank canvas) and Play, Stop, Next, scrub and snap all did nothing. Both e2e
// configs run `npm run dev`, so no spec could ever have seen it. Measured and fixed 2026-09-02;
// this gate is what keeps it fixed.
//
// The rule is the ONE DOOR: composeDocument.ts's `serializeHelper` is the only place allowed to
// interpolate a MODULE-SCOPE binding's source into a document, because it is the only place that
// emits the `fn.name` binding the bundle's own call sites need. Anything else writing
// `${killAllTimelines.toString()}` into a template literal is the old bug being retyped.
//
// Scans SOURCE, not `dist/`: the mistake is made in a source file, the artifact only hides it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

import { measured } from './measured.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** `${something.toString()}` inside a template literal — the shape that ships the hazard. */
const SERIALIZED = /\$\{\s*([A-Za-z_$][\w$]*)\s*\.toString\(\)\s*\}/g;

/** The one false positive the rule below can produce, waved off on the line that carries it. */
const IGNORE_MARKER = 'check-preview-serialization: not a function';

/**
 * Names bound at MODULE SCOPE in this file: imported, or declared at the top level.
 *
 * Only a module-scope binding is a hazard, because only a module-scope binding gets renamed. That
 * single test does all the discrimination this gate needs, and it is why there is no
 * comment-stripping or string-parsing here at all:
 *
 * - `${fn.toString()}` inside `serializeHelper` — `fn` is a parameter. Not module scope, ignored,
 *   so the door needs no exemption of its own.
 * - `${fn.toString()}` in prose explaining this rule — same, ignored. Blanking comments to catch
 *   that was the earlier design, and it could blank real code inside a template literal (a `//`
 *   in a URL, a `/*` in emitted CSS) and MISS a violation. A gate no test can back up must not
 *   have a silent false negative; a rare false positive it can be argued with is the safe side.
 * - `${new URL(base).toString()}`, `${count.toString()}` on a local — not a bare module-scope
 *   name, ignored. Those are ordinary correct code and this gate has no business failing them.
 *
 * A module-scope number or URL named in an interpolation is the one false positive left, and
 * `IGNORE_MARKER` on the line is how it steps aside.
 *
 * READ OFF THE SYNTAX TREE, NOT OFF THE TEXT. This table is a THRESHOLD: a name missing from it
 * is skipped, so an incomplete table passes the very violation it exists to catch. It used to be
 * three line-anchored regexes, and a formatting change was enough to shrink it - an indented
 * declaration, a decorated class, `import gsap, { a } from`, `import * as ns`, a destructured
 * `const { a } =` or the second name in `const a = 1, b = 2` all dropped out while the hazard
 * stayed in the file. The TypeScript parser reads the module's top-level statements the way the
 * bundler does, whatever their layout.
 */
export function moduleScopeNames(text) {
  const names = new Set();
  const bind = (node) => {
    if (!node) return;
    if (ts.isIdentifier(node)) names.add(node.text);
    else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      for (const element of node.elements) if (!ts.isOmittedExpression(element)) bind(element.name);
    }
  };
  const source = ts.createSourceFile('module.tsx', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      bind(clause?.name);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) bind(bindings.name);
      else if (bindings) for (const element of bindings.elements) bind(element.name);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) bind(declaration.name);
    } else if (
      ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)
      || ts.isImportEqualsDeclaration(statement) || ts.isModuleDeclaration(statement)
    ) {
      bind(statement.name);
    }
  }
  return names;
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The violations in `files`. `stats.resolved` is set to how many module-scope names were found
 * in the files that interpolate a `.toString()` at all - the size of the table each match was
 * judged against.
 */
export function findViolations(files, stats = {}) {
  const violations = [];
  let resolved = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const matches = [...text.matchAll(SERIALIZED)];
    if (matches.length === 0) continue;
    const lines = text.split('\n');
    const bound = moduleScopeNames(text);
    resolved += bound.size;
    for (const match of matches) {
      if (!bound.has(match[1])) continue;
      const line = text.slice(0, match.index).split('\n').length;
      if (lines[line - 1].includes(IGNORE_MARKER)) continue;
      violations.push({ file: relative(root, file), line, expr: match[0] });
    }
  }
  stats.resolved = resolved;
  return violations;
}

// `pathToFileURL`, not a hand-built `file://` string: on Windows `process.argv[1]` is a backslash
// path that never compares equal to `import.meta.url`, so the naive form is always false here and
// silently relies on whatever fallback sits beside it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = sourceFiles(join(root, 'src'));
  // The walk is the whole reach of this gate: an empty src/ tree, or one no longer holding .ts
  // files, would pass it without a single body having been looked at.
  measured(files.length, 'source files scanned');
  const stats = {};
  const violations = findViolations(files, stats);
  // The threshold half. composeDocument.ts's door itself interpolates `${fn.toString()}`, so the
  // files that interpolate one have module scopes, and an empty table would skip every match.
  measured(stats.resolved, 'module-scope names in files that interpolate a toString()');
  if (violations.length === 0) {
    console.log('[check:preview-serialization] ok - every serialized helper goes through serializeHelper');
    process.exit(0);
  }
  console.error('[check:preview-serialization] a function body is interpolated into a document by hand:\n');
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.expr}`);
  console.error(`
A minified build renames a module-scope binding, so a sibling serialized function calls it by a
name the emitted document never binds, and the try/catch around the command hides the
ReferenceError. Route it through composeDocument.ts's serializeHelper(fn, alias), which binds
fn.name as well as the readable alias.

If the value is genuinely not a function being serialized into a document, say so on the line:
  // ${IGNORE_MARKER}`);
  process.exit(1);
}
