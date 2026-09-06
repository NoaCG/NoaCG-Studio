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
 */
export function moduleScopeNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of text.matchAll(/^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
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

export function findViolations(files) {
  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const bound = moduleScopeNames(text);
    for (const match of text.matchAll(SERIALIZED)) {
      if (!bound.has(match[1])) continue;
      const line = text.slice(0, match.index).split('\n').length;
      if (lines[line - 1].includes(IGNORE_MARKER)) continue;
      violations.push({ file: relative(root, file), line, expr: match[0] });
    }
  }
  return violations;
}

// `pathToFileURL`, not a hand-built `file://` string: on Windows `process.argv[1]` is a backslash
// path that never compares equal to `import.meta.url`, so the naive form is always false here and
// silently relies on whatever fallback sits beside it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = findViolations(sourceFiles(join(root, 'src')));
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
