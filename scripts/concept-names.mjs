// ONE NAME PER CONCEPT (docs/work-specs/svg-template-library/spec.md, D5 and AC-8).
//
// docs/template-library/names.json lists each concept's one name, the recipe, type and kind label
// that carry it, and the labels it retired. Two halves read it:
//   - the registries: a recipe's or type's `name` and the kind word on a chip
//     (`graphicKindLabel`) equal the concept's name. scripts/concept-names.test.mjs loads the real
//     registries through Vite and runs `checkRegistryNames`.
//   - the surfaces a user reads: no retired label appears in the listed files. In TypeScript the
//     comments are stripped first, because a maintainer's note is not copy (scripts/check-copy.mjs
//     draws the same line).
// Labels only: ids, role words, field titles and persisted keys never change, so nothing here
// reads or writes one.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const NAMES_FILE = 'docs/template-library/names.json';

/** Text files a user can read; binaries and the Illustrator sources are skipped. */
const TEXT = /\.(html|md|json|svg|tsx?|txt)$/;
const CODE = /\.tsx?$/;

export function loadNames(root = ROOT) {
  const parsed = JSON.parse(readFileSync(path.join(root, NAMES_FILE), 'utf8'));
  const names = new Set();
  for (const concept of parsed.concepts) {
    if (typeof concept.name !== 'string' || !concept.name.trim()) throw new Error(`${NAMES_FILE}: a concept has no name`);
    if (names.has(concept.name.toLowerCase())) throw new Error(`${NAMES_FILE}: "${concept.name}" is listed twice`);
    names.add(concept.name.toLowerCase());
  }
  for (const concept of parsed.concepts) {
    for (const old of concept.retired ?? []) {
      if (names.has(old.toLowerCase())) throw new Error(`${NAMES_FILE}: "${old}" is both retired and a current name`);
    }
  }
  return parsed;
}

/** A retired label as a whole phrase, any case. "Vote result" does not match "Vote results". */
export function retiredPattern(label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'gi');
}

/** TypeScript with its comments blanked out, line numbers kept. Strings are left alone, so a
 *  `//` inside one is not a comment. */
export function stripComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/** Every retired label in one text: [{ label, name, line }]. */
export function findRetired(text, concepts) {
  const found = [];
  for (const concept of concepts) {
    for (const label of concept.retired ?? []) {
      for (const match of text.matchAll(retiredPattern(label))) {
        found.push({ label, name: concept.name, line: text.slice(0, match.index).split('\n').length });
      }
    }
  }
  return found;
}

function filesUnder(root, rel) {
  const full = path.join(root, rel);
  if (!statSync(full, { throwIfNoEntry: false })) throw new Error(`${NAMES_FILE}: surface ${rel} does not exist`);
  if (statSync(full).isFile()) return [rel];
  return readdirSync(full, { recursive: true })
    .map((name) => path.join(rel, name))
    .filter((file) => TEXT.test(file) && statSync(path.join(root, file)).isFile());
}

/** Scan every listed surface. Returns { files, problems }. */
export function scanSurfaces(root = ROOT, names = loadNames(root)) {
  const problems = [];
  let files = 0;
  for (const surface of names.surfaces) {
    for (const file of filesUnder(root, surface)) {
      files += 1;
      const raw = readFileSync(path.join(root, file), 'utf8');
      const text = CODE.test(file) ? stripComments(raw) : raw;
      for (const hit of findRetired(text, names.concepts)) {
        problems.push(`${file}:${hit.line}: "${hit.label}" is retired - say "${hit.name}"`);
      }
    }
  }
  return { files, problems };
}

/** The registries carry the concept names. `recipes` and `types` are [{ id, name }];
 *  `kindLabel` is graphicKindLabel. Returns the problems. */
export function checkRegistryNames(names, { recipes, types, kindLabel }) {
  const problems = [];
  const byId = (list, id) => list.find((entry) => entry.id === id);
  for (const concept of names.concepts) {
    if (concept.recipe !== undefined) {
      const recipe = byId(recipes, concept.recipe);
      if (!recipe) problems.push(`recipe ${concept.recipe} (${concept.name}) is not registered`);
      else if (recipe.name !== concept.name) problems.push(`recipe ${concept.recipe} is named "${recipe.name}" - say "${concept.name}"`);
    }
    if (concept.type !== undefined) {
      const type = byId(types, concept.type);
      if (!type) problems.push(`type ${concept.type} (${concept.name}) is not registered`);
      else if (type.name !== concept.name) problems.push(`type ${concept.type} is named "${type.name}" - say "${concept.name}"`);
    }
    for (const kind of concept.kind ?? []) {
      const label = kindLabel(kind);
      if (label !== concept.name) problems.push(`kind ${kind} reads "${label}" on a chip - say "${concept.name}"`);
    }
  }
  // Different controls never share a name: two recipes or two types with one name are one concept.
  for (const list of [recipes, types]) {
    const seen = new Map();
    for (const entry of list) {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) problems.push(`${seen.get(key)} and ${entry.id} share the name "${entry.name}"`);
      seen.set(key, entry.id);
    }
  }
  return problems;
}
