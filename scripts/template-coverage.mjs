#!/usr/bin/env node
// THE TEMPLATE LIBRARY COVERAGE MATRIX (docs/work-specs/svg-template-library/spec.md, AC-2 and D9).
//
//   node scripts/template-coverage.mjs           # check: the matrix matches the registries, every row is covered and holds
//   node scripts/template-coverage.mjs --write   # regenerate docs/template-library/coverage.json from the registries
//
// One row per id in scope: every registered graphic type, the untyped kinds (end credits by form,
// versus, frames, the production Picture), every behaviour recipe and every feature contract. A row
// says which template files serve it, by what mechanism, and its observable proof: the test that
// drives a field, control or output of that template. `covered` rows are held to their evidence;
// `planned` rows name the phase that will cover them. The gate fails when
//   - an id appears in a registry with no row, or a row names an id nothing registers
//     (--write adds the row as `planned` with an unassigned mechanism and no phase, which still fails
//     until a person assigns both);
//   - a `covered` row loses a template file, its proof test, the case in that test, or its
//     inventory entry, or its proof is quarantined (e2e/quarantine.json: a flaky proof is not passing);
//   - an untyped catalog design maps to no row (D9: a look is a capability of a family row).
// Complete enforcement is on since the last gap closed (TL7): a `planned` row or an open extension
// fails the check and the build, so a newly registered id lands covered, with its template and
// proof, in the same change. `--complete` is still accepted and changes nothing.
//
// The registry half needs the app's modules, so it runs through Vite (`withSsrServer`); the
// evidence half is plain file reads (`validateMatrix`), unit-tested on its own in
// scripts/template-coverage.test.mjs, which is also where the build runs both.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const MATRIX_FILE = 'docs/template-library/coverage.json';
export const KINDS = ['type', 'untyped', 'recipe', 'contract'];
export const STATUSES = ['covered', 'planned'];
export const PHASES = ['TL1', 'TL2', 'TL3', 'TL4', 'TL5', 'TL6', 'TL7'];

/** The untyped kinds in scope (D9), with the file that defines each. End credits are rows by form. */
export const UNTYPED_KINDS = [
  { id: 'end-credits-scroll', source: ['src/templates/endCredits/index.ts'] },
  { id: 'end-credits-columns', source: ['src/templates/endCredits/index.ts'] },
  { id: 'end-credits-pager', source: ['src/templates/endCredits/index.ts'] },
  { id: 'end-credits-crawl', source: ['src/templates/endCredits/index.ts'] },
  { id: 'end-credits-static', source: ['src/templates/endCredits/index.ts'] },
  { id: 'versus', source: ['src/templates/versus/index.ts'] },
  { id: 'frames', source: ['src/templates/frames/index.ts'] },
  { id: 'picture', source: ['src/templates/picture.ts', 'src/templates/pictureTarget.ts'] },
];

/** The feature contracts: what a feature reads off an imported graphic by field title or recipe. */
export const CONTRACTS = [
  { id: 'join-link', source: ['src/templates/importedDesign/svgQr.ts'] },
  { id: 'message', source: ['src/control/messageStaging.ts'] },
  { id: 'vote-results', source: ['src/control/resultStaging.ts'] },
  { id: 'word-cloud-target', source: ['src/control/wordStaging.ts'] },
];

const read = (root, file) => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

/** Where a registered type is declared: the types/ file that holds `id: '<id>',`. */
export function typeSource(root, id) {
  const dir = 'src/templates/types';
  const declaration = `id: '${id}',`;
  return readdirSync(path.join(root, dir)).filter((file) => file.endsWith('.ts')).sort()
    .map((file) => `${dir}/${file}`)
    .filter((file) => read(root, file).split('\n').some((line) => line.trim() === declaration));
}

/** The recipe modules in registry order, read from registry.ts's list and its imports. */
export function recipeSources(root) {
  const registry = read(root, 'src/templates/behaviours/registry.ts');
  const list = registry.match(/BEHAVIOUR_RECIPES[^=]*=\s*\[([^\]]+)\]/)?.[1];
  if (!list) throw new Error('src/templates/behaviours/registry.ts: BEHAVIOUR_RECIPES is not readable');
  return list.split(',').map((name) => name.trim()).filter(Boolean).map((name) => {
    const module = registry.match(new RegExp(`import\\s*\\{\\s*${name}\\s*\\}\\s*from\\s*['"]\\./([^'"]+)['"]`))?.[1];
    if (!module) throw new Error(`recipe ${name} has no module import in registry.ts`);
    return `src/templates/behaviours/${module}.ts`;
  });
}

/**
 * The ids the registries hold now. `types` and `recipes` are the registry arrays (id only is read);
 * `catalog` is CATALOG (category -> variants), whose variants without a type are the untyped looks.
 */
export function registryIds(root, { types, recipes, catalog }) {
  const recipeFiles = recipeSources(root);
  if (recipeFiles.length !== recipes.length) throw new Error('registry.ts list and BEHAVIOUR_RECIPES disagree');
  const untypedLooks = [];
  const designs = [];
  for (const [category, variants] of Object.entries(catalog)) {
    for (const variant of variants) {
      if (!variant.typeId) untypedLooks.push({ id: variant.id, category });
      designs.push({ id: variant.id, name: variant.name, typeId: variant.typeId ?? null, category });
    }
  }
  return {
    rows: [
      ...types.map((type) => ({ id: type.id, kind: 'type', source: typeSource(root, type.id) })),
      ...UNTYPED_KINDS.map((kind) => ({ ...kind, kind: 'untyped' })),
      ...recipes.map((recipe, i) => ({ id: recipe.id, kind: 'recipe', source: [recipeFiles[i]] })),
      ...CONTRACTS.map((contract) => ({ ...contract, kind: 'contract' })),
    ],
    untypedLooks,
    designs,
  };
}

/**
 * BUILT-IN ALTERNATIVES (D4): the names of the catalog designs a row's templates stand beside, so
 * the Template Library can show which looks NoaCG already has. A type row has the designs of that
 * type; any row has the untyped designs mapped to it (its `variants`, `looks.variants`, or its
 * category in `looks.categories`). Empty for recipes and contracts.
 */
export function builtInsFor(row, designs, looks = {}) {
  if (row.kind !== 'type' && row.kind !== 'untyped') return [];
  const names = [];
  for (const design of designs) {
    const mine = design.typeId
      ? design.typeId === row.id
      : (row.variants ?? []).includes(design.id) || looks.variants?.[design.id]?.row === row.id
        || (!looks.variants?.[design.id] && looks.categories?.[design.category] === row.id);
    if (mine && !names.includes(design.name)) names.push(design.name);
  }
  return names;
}

/** The matrix the registries call for: their rows in order, each keeping what the committed
 *  matrix says about it, and a new id as an unassigned `planned` row. */
export function generateMatrix(registry, committed) {
  const old = new Map((committed?.rows ?? []).map((row) => [rowKey(row), row]));
  const rows = registry.rows.map(({ id, kind, source }) => {
    const prior = old.get(`${kind}:${id}`);
    const row = prior ? { ...prior, id, kind, source } : { id, kind, source, mechanism: 'unassigned', status: 'planned', phase: null, templates: [], proof: { observes: '' } };
    // The catalog decides these, so a regeneration rewrites them and a stale list fails the check.
    delete row.builtIns;
    const builtIns = registry.designs ? builtInsFor(row, registry.designs, committed?.looks) : prior?.builtIns ?? [];
    return builtIns.length ? { ...row, builtIns } : row;
  });
  // The ratchet: a row once covered stays on the floor while it is registered, so turning it back
  // to planned is refused rather than passing as an ordinary edit.
  const registered = new Set(rows.map((row) => rowKey(row)));
  const floor = new Set((committed?.coveredFloor ?? []).filter((key) => registered.has(key)));
  for (const row of rows) if (row.status === 'covered') floor.add(rowKey(row));
  return { ...(committed ?? {}), coveredFloor: [...floor].sort(), rows };
}

export const rowKey = (row) => `${row.kind}:${row.id}`;

/** One row per line, so a diff of the matrix reads as a diff of rows. */
export function formatMatrix(matrix) {
  const { rows, looks, ...head } = matrix;
  const entries = (object, indent) => Object.entries(object ?? {})
    .map(([key, value]) => `${indent}${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n');
  const parts = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  if (looks) {
    const groups = Object.entries(looks).map(([key, value]) => `    ${JSON.stringify(key)}: {\n${entries(value, '      ')}\n    }`);
    parts.push(`  "looks": {\n${groups.join(',\n')}\n  }`);
  }
  parts.push(`  "rows": [\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]`);
  return `{\n${parts.join(',\n')}\n}\n`;
}

export function loadMatrix(root = ROOT) {
  return JSON.parse(read(root, MATRIX_FILE));
}

function quarantined(root) {
  const file = path.join(root, 'e2e/quarantine.json');
  return existsSync(file) ? new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')).specs ?? {})) : new Set();
}

/**
 * The evidence half: every row well formed, every `covered` row's templates, proof and inventory
 * present, every untyped look mapped. Returns the problems, one line each.
 */
export function validateMatrix(matrix, { root = ROOT, untypedLooks = [], complete = false } = {}) {
  const problems = [];
  const ids = new Set();
  const quarantine = quarantined(root);
  for (const row of matrix.rows) {
    const at = `${row.kind} ${row.id}`;
    const key = `${row.kind}:${row.id}`;
    if (ids.has(key)) problems.push(`${at}: listed twice`);
    ids.add(key);
    if (!KINDS.includes(row.kind)) problems.push(`${at}: unknown kind`);
    if (!STATUSES.includes(row.status)) problems.push(`${at}: status must be covered or planned`);
    if (!row.mechanism || row.mechanism === 'unassigned') problems.push(`${at}: assign its mechanism (D7)`);
    if (!row.proof?.observes) problems.push(`${at}: name its observable proof (a field update, control or output a test drives)`);
    if (!Array.isArray(row.source) || row.source.length === 0) problems.push(`${at}: no source file found for this id`);
    for (const file of row.source ?? []) if (!existsSync(path.join(root, file))) problems.push(`${at}: source ${file} is missing`);
    for (const open of row.extensions ?? []) {
      if (!PHASES.includes(open.phase) || !open.observes) problems.push(`${at}: an open extension names its phase and what its proof will observe`);
      if (complete) problems.push(`${at}: open extension (${open.observes}), and complete coverage is required`);
    }
    if (row.status === 'planned') {
      if (complete) problems.push(`${at}: planned, and complete coverage is required`);
      if (!PHASES.includes(row.phase)) problems.push(`${at}: a planned row names the phase that covers it (${PHASES.join(', ')})`);
      continue;
    }
    if (row.status !== 'covered') continue;
    if (row.phase !== undefined) problems.push(`${at}: a covered row has no phase`);
    if (!Array.isArray(row.templates) || row.templates.length === 0) problems.push(`${at}: covered with no template file`);
    for (const file of row.templates ?? []) {
      if (!existsSync(path.join(root, file))) problems.push(`${at}: template ${file} is missing`);
    }
    const { test, case: proofCase, inventory } = row.proof ?? {};
    if (!test || !proofCase) {
      problems.push(`${at}: a covered row names its proof test and the case in it`);
      continue;
    }
    if (!existsSync(path.join(root, test))) {
      problems.push(`${at}: proof ${test} is missing`);
      continue;
    }
    if (quarantine.has(test)) problems.push(`${at}: proof ${test} is quarantined, so it is not passing`);
    const testText = read(root, test);
    // The case is a test's title, not any text: a comment or a helper holding it proves nothing.
    if (!testText.split('\n').some((line) => /\btest(?:\.\w+)?\(/.test(line) && line.includes(proofCase))) problems.push(`${at}: ${test} has no test titled with the case "${proofCase}"`);
    if (inventory) {
      if (!existsSync(path.join(root, inventory))) {
        problems.push(`${at}: inventory ${inventory} is missing`);
        continue;
      }
      if (!testText.includes(inventory.split('/').slice(-2).join('/'))) problems.push(`${at}: ${test} does not read ${inventory}`);
      const entries = JSON.parse(read(root, inventory));
      for (const file of row.templates ?? []) {
        const slug = path.basename(file, '.svg');
        const entry = entries.find((item) => item.slug === slug);
        // Each template's recipe is stated (null for none) and checked, because the proof's loop
        // branches on it: a template whose recipe changed is no longer driven by the same case.
        const expected = row.recipeBySlug && Object.hasOwn(row.recipeBySlug, slug) ? row.recipeBySlug[slug] : row.recipe;
        if (!entry) problems.push(`${at}: ${inventory} does not list ${slug}`);
        // One inventory holds both template styles, and each proof loop runs one of them.
        else if (entry.style !== undefined && entry.style !== row.proof.style) problems.push(`${at}: ${test} runs the ${row.proof.style ?? '(unnamed)'} templates, and ${slug} is ${entry.style}`);
        // ...and the test must be the loop over that style, which the shared inventory path alone
        // no longer tells apart.
        else if (entry.style !== undefined && !testText.includes(`style === '${entry.style}'`)) problems.push(`${at}: ${test} does not select the ${entry.style} templates (style === '${entry.style}')`);
        else if (expected === undefined) problems.push(`${at}: name the recipe ${slug} is proved with (null for none)`);
        else if ((entry.recipe ?? null) !== expected) problems.push(`${at}: ${inventory} lists ${slug} with recipe ${entry.recipe}, not ${expected}`);
        // A loop that runs only the entries with a recipe never reaches one without.
        else if (row.proof.selects === 'recipe' && expected === null) problems.push(`${at}: ${test} runs only entries with a recipe, and ${slug} has none`);
      }
    }
  }
  // Coverage never goes back: every row on the floor is still covered.
  const statusOf = new Map(matrix.rows.map((row) => [rowKey(row), row.status]));
  for (const key of matrix.coveredFloor ?? []) {
    if (statusOf.has(key) && statusOf.get(key) !== 'covered') problems.push(`${key.replace(':', ' ')}: was covered and is now ${statusOf.get(key)} - coverage never goes back`);
  }
  // D9: every untyped catalog design is a look of some row.
  const looks = matrix.looks ?? {};
  const rowIds = new Set(matrix.rows.map((row) => row.id));
  const byVariant = new Map();
  for (const row of matrix.rows) {
    for (const id of row.variants ?? []) {
      if (byVariant.has(id)) problems.push(`untyped design ${id} is on two rows (${byVariant.get(id)}, ${row.id})`);
      byVariant.set(id, row.id);
    }
  }
  // A listed design that the catalog no longer holds untyped is stale (only checked against a real catalog).
  if (untypedLooks.length) {
    const live = new Set(untypedLooks.map((look) => look.id));
    for (const id of [...byVariant.keys(), ...Object.keys(looks.variants ?? {})]) {
      if (!live.has(id)) problems.push(`untyped design ${id} is listed but the catalog holds no untyped design by that id`);
    }
  }
  for (const [id, look] of Object.entries(looks.variants ?? {})) {
    if (!rowIds.has(look.row)) problems.push(`look ${id}: row ${look.row} does not exist`);
    if (!look.capability) problems.push(`look ${id}: name the capability it is (count-up, dial, ...)`);
  }
  for (const [category, rowId] of Object.entries(looks.categories ?? {})) {
    if (!rowIds.has(rowId)) problems.push(`looks of ${category}: row ${rowId} does not exist`);
  }
  for (const look of untypedLooks) {
    if (byVariant.has(look.id) || looks.variants?.[look.id] || looks.categories?.[look.category]) continue;
    if (looks.excluded?.[look.category]) continue;
    problems.push(`untyped design ${look.id} (${look.category}) maps to no row: list it on a row, in looks.variants, or map its category`);
  }
  return problems;
}

/** Coverage never goes back across a landing: every row covered in `base` (the matrix on
 *  origin/main) is still covered. The in-file floor catches an edit to one row; this catches the
 *  same edit made together with the floor. */
export function lostSince(base, matrix) {
  const now = new Map(matrix.rows.map((row) => [rowKey(row), row.status]));
  return (base?.rows ?? []).filter((row) => row.status === 'covered' && now.has(rowKey(row)) && now.get(rowKey(row)) !== 'covered')
    .map((row) => `${row.kind} ${row.id}: covered on origin/main and ${now.get(rowKey(row))} here - coverage never goes back`);
}

/** Compare the committed matrix with the one the registries call for. */
export function staleRows(committed, generated) {
  const problems = [];
  const before = new Map(committed.rows.map((row) => [`${row.kind}:${row.id}`, row]));
  const after = new Map(generated.rows.map((row) => [`${row.kind}:${row.id}`, row]));
  for (const key of after.keys()) if (!before.has(key)) problems.push(`${key.replace(':', ' ')}: registered with no row - run node scripts/template-coverage.mjs --write, then assign it`);
  for (const key of before.keys()) if (!after.has(key)) problems.push(`${key.replace(':', ' ')}: no longer registered - run node scripts/template-coverage.mjs --write`);
  if (problems.length === 0 && formatMatrix(committed) !== formatMatrix(generated)) problems.push(`${MATRIX_FILE} is out of date (row order or source files) - run node scripts/template-coverage.mjs --write`);
  return problems;
}

/** Load the real registries through Vite. */
export async function loadRegistries(root = ROOT) {
  const { withSsrServer } = await import('./catalogIndexPlugin.mjs');
  return withSsrServer(async (server) => {
    const { TYPES } = await server.ssrLoadModule('/src/templates/types/registry.ts');
    const { BEHAVIOUR_RECIPES } = await server.ssrLoadModule('/src/templates/behaviours/registry.ts');
    const { CATALOG } = await server.ssrLoadModule('/src/templates/catalog.ts');
    return registryIds(root, { types: TYPES, recipes: BEHAVIOUR_RECIPES, catalog: CATALOG });
  });
}

export function summary(matrix) {
  const count = (status) => matrix.rows.filter((row) => row.status === status).length;
  return { rows: matrix.rows.length, covered: count('covered'), planned: count('planned') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const committed = existsSync(path.join(ROOT, MATRIX_FILE)) ? loadMatrix() : null;
  if (!committed && !args.includes('--write')) {
    console.error(`template-coverage: ${MATRIX_FILE} is missing - run node scripts/template-coverage.mjs --write`);
    process.exit(1);
  }
  const registry = await loadRegistries();
  const generated = generateMatrix(registry, committed);
  if (args.includes('--write')) {
    writeFileSync(path.join(ROOT, MATRIX_FILE), formatMatrix(generated));
    console.log(`template-coverage: written ${MATRIX_FILE}`);
  }
  const matrix = args.includes('--write') ? generated : committed;
  const problems = [
    ...(args.includes('--write') ? [] : staleRows(committed, generated)),
    ...validateMatrix(matrix, { untypedLooks: registry.untypedLooks, complete: true }),
  ];
  const { rows, covered, planned } = summary(matrix);
  if (problems.length) {
    console.error(`template-coverage: ${problems.length} problem(s)\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log(`template-coverage: ${rows} rows, ${covered} covered, ${planned} planned`);
  }
}
