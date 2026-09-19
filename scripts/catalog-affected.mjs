#!/usr/bin/env node
// WHICH DESIGNS DID THIS CHANGE TOUCH - so a catalog run costs what the change cost, not what
// the catalog costs.
//
// The five catalog gates MEASURE a rendered graphic, one browser page at a time, over 500+
// designs. That is right, and it is why they are the only checks that catch a visibly broken
// catalog - but it also means a comment fix in one lower third used to re-measure every design
// in the set. The owner's complaint on 2026-08-28 was exactly this: any template change "takes a
// lot of effort from the computer and everything else", and the catalog only grows.
//
// So this answers WHICH designs, and every gate now takes `--only <ids>`:
//
//   node scripts/catalog-affected.mjs             # the plan, in words
//   node scripts/catalog-affected.mjs --json      # the plan, for a script to consume
//   node scripts/catalog-affected.mjs --ids       # just the ids, comma-separated, for --only
//   node scripts/catalog-affected.mjs <base-ref>  # diff against an explicit base
//   node scripts/catalog-affected.mjs --integration      # force the fork point (see below)
//   node scripts/catalog-affected.mjs --no-integration   # force the branch-only base
//
// AFTER TAKING MAIN IN, the base moves to the FORK POINT on its own, so the plan is the union of
// both sides' designs rather than only this branch's - `merge-base HEAD main` IS main once the
// merge exists, and a pre-land gate planning from it would name too few designs with nothing
// going red. Same rule and the same implementation as `scripts/e2e-affected.mjs` (imported).
//
// HOW IT DECIDES, AND WHERE IT FAILS.
//
// WHETHER the catalog is affected at all is not decided here: `scripts/e2e-affected.mjs`
// already owns that question (its CATALOG_TRIGGERS, plus the core escalation), it is tested, and
// CI branches on it. This module imports that answer and adds only WHICH.
//
// WHICH comes from the catalog's own shape, in two steps, both read off the source rather than
// curated - so a design added, moved or renamed re-maps itself with no list to update.
//
//   1. DECLARATIONS. Every design declares itself with a literal `id: 'lt01'` in one file under
//      src/templates, so a changed file contributes the designs declared in it.
//   2. IMPORTERS. Designs are not islands: `tickers/tk07.ts` calls `houseWire` out of
//      `tickers/tk05.ts` as its entire `create` body, so editing tk05 changes what EIGHT designs
//      emit. If a change to a file can move design D at all, D's own code must depend on it - so
//      following importers and collecting every declaration on the way is complete, not merely
//      cautious. The walk passes THROUGH files that declare nothing (`index.ts`,
//      `types/registry.ts`, `catalog.ts`), because those aggregate rather than author.
//
// EVERYTHING ELSE ESCALATES TO THE WHOLE CATALOG, and that is the safety property: a changed
// file that declares no design (a category's `shared.ts`, a preset bank, the type registry, the
// motion runtime, the `:root` contract, fonts, the theme tokens, the bench) is shared machinery
// whose blast radius is the whole set, and a file this script cannot attribute at all is treated
// the same way. Like e2e-affected, it fails toward measuring MORE - the one failure mode with no
// alarm attached is measuring less.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  branchBase,
  changedFilesSince,
  planFor as e2ePlanFor,
  headIsMainMerge,
  integrationBase,
} from './e2e-affected.mjs';

/** True only when this file was RUN, not imported (the same guard e2e-affected.mjs carries). */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

const REPO = fileURLToPath(new URL('..', import.meta.url));

function git(...cmd) {
  return execFileSync('git', cmd, { encoding: 'utf8', cwd: REPO }).trim();
}

/**
 * The literal a design declares itself with. `defineVariant({ id: 'lt01', … })` and the
 * type-compiled tables both use it, so one pattern reads the whole catalog.
 *
 * Deliberately NOT a loose search for the id anywhere in the text: a comment naming a sibling
 * design would then attribute that sibling's measurement to this file, and the sibling's own
 * file would still be attributed too - noise in the plan, not safety.
 */
const DECLARATION = /\bid:\s*'([a-z][a-z0-9]*\d)'/gi;

/**
 * id -> the template files that DECLARE it.
 *
 * @param {{ file: string, text: string }[]} sources every tracked file under src/templates
 * @returns {Map<string, string[]>}
 */
export function declaringFiles(sources) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const { file, text } of sources) {
    for (const [, id] of text.matchAll(DECLARATION)) {
      map.set(id, [...(map.get(id) ?? []), file]);
    }
  }
  return map;
}

/**
 * imported file -> the template files that import it. Only edges BETWEEN files in `sources`
 * exist, which is exactly the graph the attribution walks.
 *
 * @param {{ file: string, text: string }[]} sources
 * @returns {Map<string, string[]>}
 */
export function importerGraph(sources) {
  const known = new Set(sources.map((s) => s.file));
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const { file, text } of sources) {
    for (const target of importsOf(file, text)) {
      if (!known.has(target) || target === file) continue;
      map.set(target, [...(map.get(target) ?? []), file]);
    }
  }
  return map;
}

/** file -> the ids it declares, inverted from the map above. */
function idsByFile(map) {
  /** @type {Map<string, string[]>} */
  const byFile = new Map();
  for (const [id, files] of map) for (const f of files) byFile.set(f, [...(byFile.get(f) ?? []), id]);
  return byFile;
}

/**
 * A file's relative imports, resolved to repo-relative template paths.
 *
 * WHY THIS EXISTS, AND IT IS THE WHOLE SAFETY ARGUMENT FOR SCOPING. Designs are not islands.
 * `tickers/tk07.ts` imports `houseWire` from `tickers/tk05.ts` and calls it as its entire `create`
 * body, so editing tk05 changes what tk07 EMITS - and an attribution that reads only the
 * declarations in the changed file would have handed back `['tk05']`, measured one design, and
 * passed. `mr01 -> mr04` and `rs03 -> rs04` have the same shape. That is precisely the "naming too
 * FEW designs" failure this file claims to protect against, so the importers are followed.
 */
function importsOf(file, text) {
  const dir = file.slice(0, file.lastIndexOf('/'));
  const out = new Set();
  for (const [, spec] of text.matchAll(/\bfrom\s+'(\.[^']+)'|\bimport\('(\.[^']+)'\)/g)) {
    if (!spec) continue;
    const parts = `${dir}/${spec}`.split('/');
    const stack = [];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    const base = stack.join('/');
    // A specifier is extensionless by house style; it resolves to `<base>.ts` or `<base>/index.ts`
    // and both are added, because only one of them will exist in the source list.
    out.add(`${base}.ts`);
    out.add(`${base}/index.ts`);
  }
  return out;
}


/**
 * THE GATES THEMSELVES. A change to what MEASURES the catalog has to be executed over the whole
 * catalog, for the reason e2e-affected gives about its own selector: editing the rule and never
 * running it is how a gate quietly stops measuring what it claims to, and the failure is silent.
 * Their baselines are here too - a re-recorded baseline is a claim about every design in it.
 *
 * WRITTEN AS A RULE RATHER THAN A ROSTER, because the first version was a roster and it was
 * already wrong: it named eight scripts by hand and omitted `catalog-scope.mjs`, the shared
 * `--only` implementation every sweep imports - so a change to the thing that decides the scope
 * would have run no catalog gate at all. A pattern covers a new sibling the day it is written,
 * which is the same argument this file makes for reading design ids off the source. A gate script
 * that cannot be named like its siblings must be added here explicitly, exactly as
 * `scripts/command-match.mjs` states the rule for the browser-job list.
 */
const GATE_FILES = [
  /^scripts\/(catalog-[\w-]+|check-catalog-[\w-]+|type-floor|overflow-sweep|field-coverage|numerals|l3-sweep)\.(mjs|json)$/,
  /^scripts\/overflow-baseline\.json$/,
  /^e2e\/catalog-(baseline|render-baseline)\.json$/,
  /^e2e\/catalog-baseline\.spec\.ts$/,
  /^e2e\/_catalogScope\.ts$/,
  /^e2e\/catalog\//,
  /^playwright\.catalog\.config\.ts$/,
];

const isGateFile = (file) => GATE_FILES.some((r) => r.test(file));

/**
 * THE CLASSIFICATION, as a pure function - testable without a git repository, for the same
 * reason `e2e-affected.planFor` is: its worst failure (naming too few designs) is silent.
 *
 * @param {string[]} changed   repo-relative paths, forward slashes
 * @param {{ declaring: Map<string, string[]>, catalogIds: Set<string>,
 *           triggersCatalog: (file: string) => boolean,
 *           importers?: Map<string, string[]> }} ctx
 *   `importers` maps a template file to the template files that import it; omit it and the
 *   import graph is simply not followed (every test that omits it is testing declarations alone).
 * @returns {{ mode: 'none'|'slice'|'full', ids: string[], escalatedBy: string[],
 *             attributed: Record<string, string[]> }}
 *   `categories` is NOT here: only `planForWorkingTree` holds the id -> category map, and a field
 *   that every return statement hard-codes to `[]` for a caller to patch afterwards is a lie in
 *   the type.
 */
export function planFor(changed, { declaring, catalogIds, triggersCatalog, importers = new Map() }) {
  const byFile = idsByFile(declaring);
  const ids = new Set();
  const escalatedBy = [];
  /** @type {Record<string, string[]>} */
  const attributed = {};

  /**
   * EVERY DESIGN A CHANGE TO `file` CAN REACH.
   *
   * If editing `file` changes what design D emits, then D's own `create` must depend on `file` -
   * so D's declaring file transitively IMPORTS it. Walking importers until nothing new appears
   * and collecting every declaration on the way is therefore complete, not merely conservative.
   *
   * The walk passes THROUGH files that declare nothing (a category's `index.ts`, `types/registry.ts`,
   * `catalog.ts`) rather than stopping at them: those aggregate, and stopping there would escalate
   * almost every design file in the catalog to a full run for no gain. A changed file that
   * aggregates is a different question and is escalated by the caller, because it declares nothing
   * of its own.
   *
   * @returns {string[]} every design id in the closure, including `file`'s own
   */
  const memo = new Map();
  const reachFrom = (file) => {
    const cached = memo.get(file);
    if (cached) return cached;
    const found = new Set(byFile.get(file) ?? []);
    const seen = new Set([file]);
    const queue = [file];
    while (queue.length) {
      for (const importer of importers.get(queue.pop()) ?? []) {
        if (seen.has(importer)) continue;
        seen.add(importer);
        queue.push(importer);
        for (const id of byFile.get(importer) ?? []) if (catalogIds.has(id)) found.add(id);
      }
    }
    const result = [...found];
    memo.set(file, result);
    return result;
  };

  for (const file of changed) {
    if (isGateFile(file)) {
      escalatedBy.push(file);
      continue;
    }
    // Files that cannot move a catalog measurement at all - docs, the API, the app's own
    // surfaces, most of scripts/. e2e-affected already owns that judgement (CATALOG_TRIGGERS
    // plus its core escalation) and is tested; asking it per file keeps one answer to one
    // question instead of a second list that drifts.
    if (!triggersCatalog(file)) continue;
    // Only files under src/templates can ever name specific designs. Anything else that got the
    // catalog flagged at all (fonts, the theme tokens, blocks/, assets/, the bench, a core file)
    // is machinery with catalog-wide reach.
    if (!file.startsWith('src/templates/') || !file.endsWith('.ts')) {
      escalatedBy.push(file);
      continue;
    }
    const declared = (byFile.get(file) ?? []).filter((id) => catalogIds.has(id));
    if (declared.length === 0) {
      // A category's shared.ts, its index.ts, a preset bank, the type registry - or a file whose
      // designs this script simply could not attribute. Both are the whole catalog.
      escalatedBy.push(file);
      continue;
    }
    // A DESIGN DECLARED IN TWO FILES needs no special case once the import graph is walked. Half
    // the catalog is declared twice - once by hand in its own file and once by the graphic type
    // that compiles it (`mergeCatalog`, templates/types/registry.ts) - and either the shipped
    // implementation transitively imports the changed file, in which case the walk below finds it,
    // or it does not, in which case naming the design anyway only measures one design too many.
    //
    // Everything the change can REACH through the import graph, which is what makes a slice
    // honest: tk07's whole body comes out of tk05.
    const reached = reachFrom(file).sort();
    attributed[file] = reached;
    for (const id of reached) ids.add(id);
  }

  if (escalatedBy.length > 0) return { mode: 'full', ids: [], escalatedBy, attributed };
  return { mode: ids.size > 0 ? 'slice' : 'none', ids: [...ids].sort(), escalatedBy: [], attributed };
}

/**
 * THE VERDICTS THAT NEED NOTHING BUT THE FILE LIST, decided before anything is read or launched.
 *
 * `planFor` needs the catalog's own id list, every file under src/templates and an import graph -
 * about five megabytes of text, a Rolldown bundle and a Chromium launch. Two of the three possible
 * answers do not: a change with no catalog-triggering file in it is `none`, and a change carrying
 * a gate file or a non-template trigger is `full` whatever the graph says. Those are the common
 * cases - most changes touch no template at all - and paying a browser round trip to be told
 * "nothing to scope" would be this tool doing the exact thing it exists to stop.
 *
 * @param {string[]} changed
 * @param {(file: string) => boolean} triggersCatalog
 * @returns {{ mode: 'none'|'full', escalatedBy: string[] }|null} null = ask the full classifier
 */
export function quickVerdict(changed, triggersCatalog) {
  const escalatedBy = [];
  let attributable = 0;
  for (const file of changed) {
    if (isGateFile(file)) {
      escalatedBy.push(file);
      continue;
    }
    if (!triggersCatalog(file)) continue;
    if (!file.startsWith('src/templates/') || !file.endsWith('.ts')) escalatedBy.push(file);
    else attributable += 1;
  }
  if (escalatedBy.length > 0) return { mode: 'full', escalatedBy };
  if (attributable === 0) return { mode: 'none', escalatedBy: [] };
  return null;
}

// ── reading the repository ──────────────────────────────────────────────────

/** Every tracked file under src/templates, with its text - including deleted ones read from `base`. */
function templateSources(base) {
  const tracked = git('ls-files', 'src/templates').split('\n').filter((f) => f.endsWith('.ts'));
  const sources = [];
  const have = new Set();
  for (const file of tracked) {
    try {
      sources.push({ file, text: readFileSync(join(REPO, file), 'utf8') });
      have.add(file);
    } catch {
      /* raced with a checkout; the base copy below covers it */
    }
  }
  // A DELETED design file no longer exists in the worktree, so its ids would be unattributable
  // and the plan would escalate. Reading its base copy keeps the attribution, and the emit gate
  // catches the removal itself (an id in the baseline the catalog no longer ships).
  if (base) {
    const atBase = git('ls-tree', '-r', '--name-only', base, 'src/templates').split('\n').filter((f) => f.endsWith('.ts'));
    for (const file of atBase) {
      if (have.has(file)) continue;
      try {
        sources.push({ file, text: git('show', `${base}:${file}`) });
      } catch {
        /* unreadable at base: the file simply does not contribute */
      }
    }
  }
  return sources;
}

/**
 * The plan for the working tree. Async because the authoritative id list comes from the catalog
 * itself (scripts/catalog-emit.mjs), never from a list in this file - but only when the answer
 * actually depends on it (see `quickVerdict`).
 */
export async function planForWorkingTree({ base = null, index = null, integration = null } = {}) {
  // THE INTEGRATION BASE, on the same rule `e2e-affected.mjs` follows and with the same
  // implementation (imported, never copied).
  //
  // `merge-base HEAD main` answers "what has this BRANCH changed". After `git merge main` that
  // base IS main, so a branch that has taken main in plans only its own designs and everything
  // main brought with it is invisible - at exactly the moment this gate is sold as the pre-land
  // one. The failure is silent in the direction that has no alarm: naming too FEW designs.
  //
  // So when HEAD is a merge that brought main in, diff from the fork point instead, which makes
  // the plan the union of both sides.
  //
  // THE THREE INPUTS COMPOSE EXACTLY AS THEY DO FOR THE E2E PLANNER, because a caller reasoning
  // about one and getting the other is the reason this shares an implementation at all:
  // `integration: true` WINS over an explicit base - which is what an automated caller passing
  // one needs in order to ask for both sides anyway - `integration: false` forces the plain
  // base, and a bare base with neither still means exactly that ref.
  //
  // Every git call here is pinned to REPO, like the rest of this module: `changedFilesSince` is
  // asked of REPO too, and a base resolved in one repository and diffed in another is a crash
  // rather than a smaller answer.
  const forkPoint =
    integration === false
      ? null
      : (integration === true || (!base && headIsMainMerge(REPO))) && integrationBase(REPO);
  const resolvedBase = forkPoint || base || branchBase(REPO);
  const changed = changedFilesSince(resolvedBase, REPO);
  const triggersCatalog = (file) => e2ePlanFor([file]).catalog;

  const quick = quickVerdict(changed, triggersCatalog);
  if (quick)
    return {
      ...quick,
      ids: [],
      categories: [],
      attributed: {},
      base: resolvedBase,
      integration: Boolean(forkPoint),
      changed,
    };

  // `index` is `[{ id, category }]` for every shipped design. A caller that already has the
  // catalog open on a page (scripts/taste-frame-review.mjs) hands it in, because `catalogIndex()`
  // bundles catalog.ts and launches a headless Chromium of its own just to list ids - a second
  // browser on a laptop whose queue serialises browser jobs behind a RAM floor.
  const resolvedIndex = index ?? (await (await import('./catalog-emit.mjs')).catalogIndex());
  const catalogIds = new Set(resolvedIndex.map((v) => v.id));
  const categoryById = new Map(resolvedIndex.map((v) => [v.id, v.category]));
  const sources = templateSources(resolvedBase);
  const declaring = declaringFiles(sources);
  const plan = planFor(changed, {
    declaring,
    catalogIds,
    importers: importerGraph(sources),
    triggersCatalog,
  });
  plan.categories = [...new Set(plan.ids.map((id) => categoryById.get(id)).filter(Boolean))].sort();
  return { ...plan, base: resolvedBase, integration: Boolean(forkPoint), changed };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/**
 * THE BATTERY FOR A PLAN, as commands to run.
 *
 * It PRINTS them rather than running them, deliberately. Four of the six are on the machine-wide
 * browser-job list (`SWEEP_SCRIPTS`, scripts/command-match.mjs) and belong in the queue one at a
 * time; a wrapper that spawned them would be one process the guard hook cannot see the shape of,
 * and naming the wrapper into that list instead would park this cheap plan behind a live suite
 * for half an hour. So the plan is the product, and the commands go through the same rhythm every
 * other job does (`npm run queue -- "<command>"`).
 *
 * @param {string[]|null} ids  null for a full run
 * @param {string[]} categories
 */
export function batteryFor(ids, categories) {
  // ONE SPELLING FOR ALL SIX GATES. The specs need the scope as an environment variable (a
  // Playwright spec has no argv), but `VAR=value cmd` is a POSIX-ism that does not run under the
  // cmd.exe the job runner spawns - so scripts/catalog-specs.mjs takes `--only` like everything
  // else and sets the variable itself.
  const only = ids && ids.length ? ` --only ${ids.join(',')}` : '';
  return {
    cheap: [`node scripts/check-catalog-emit.mjs${only}`],
    sweeps: [
      `node scripts/type-floor.mjs${only}`,
      `node scripts/overflow-sweep.mjs --baseline${only}`,
      `node scripts/field-coverage.mjs${only}`,
      `node scripts/numerals.mjs${only}`,
    ],
    specs: [`node scripts/catalog-specs.mjs${only}`],
    // THE FACTORY IS CI'S OWN JOB ("Factory gates"), and it was missing from this list. It runs
    // checks nothing above does - the literal-token drift scan, the pack and matrix validation,
    // the promotion gates on every type's designs - so a branch could run this whole battery
    // green and still be refused at the merge. It did: on 2026-09-19 nine new designs passed
    // everything printed here and failed CI on one hand-typed accent glow. It takes no `--only`
    // because its checks are about the catalog as a whole; it is one browser job like the rest.
    factory: ['node scripts/factory.mjs'],
    look: categories.map((c) => `node scripts/l3-sweep.mjs ./l3-shots ${c}`),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const idsOnly = args.includes('--ids');
  const baseArg = args.find((a) => !a.startsWith('--')) ?? null;
  // `--integration` asks for the fork point even when HEAD is not itself the merge (a follow-up
  // commit on top of one); `--no-integration` forces the plain branch-only base for a one-off.
  // Neither is needed for the ordinary case, which takes the fork point on its own.
  const integration = args.includes('--integration') ? true : args.includes('--no-integration') ? false : null;

  const plan = await planForWorkingTree({ base: baseArg, integration });

  if (plan.integration && !asJson && !idsOnly) {
    console.log(
      `catalog-affected: INTEGRATION base ${plan.base.slice(0, 8)} - this branch has taken main in, so the plan covers BOTH sides' designs, not just the branch's.`,
    );
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return 0;
  }
  if (idsOnly) {
    // Empty for 'none' AND for 'full' - a caller that wants the difference reads --json. A full
    // run is the absence of a scope, which is exactly what an empty --only list must never mean,
    // so the sweeps refuse an empty `--only` rather than sweeping nothing.
    process.stdout.write(`${plan.ids.join(',')}\n`);
    return 0;
  }

  if (plan.mode === 'none') {
    console.log('catalog-affected: nothing in this change can move a catalog measurement - no catalog run needed.');
    return 0;
  }
  if (plan.mode === 'full') {
    console.log('catalog-affected: FULL catalog - these changed files are shared machinery (or could not be attributed to designs):');
    for (const f of plan.escalatedBy) console.log('  -', f);
    if (Object.keys(plan.attributed).length) {
      console.log('  (design files in the same change, covered by the full run:');
      for (const [f, ids] of Object.entries(plan.attributed)) console.log(`     ${f} -> ${ids.join(', ')}`);
      console.log('  )');
    }
  } else {
    console.log(
      `catalog-affected: ${plan.ids.length} design(s) in ${plan.categories.length} categor${plan.categories.length === 1 ? 'y' : 'ies'} - ${plan.ids.join(', ')}`,
    );
    for (const [f, ids] of Object.entries(plan.attributed)) console.log(`  ${f} -> ${ids.join(', ')}`);
  }

  const battery = batteryFor(plan.mode === 'slice' ? plan.ids : null, plan.categories);
  console.log('\n  1. the cheap gate first - seconds, no dev server, run it now:');
  for (const c of battery.cheap) console.log(`       ${c}`);
  console.log('\n  2. the rendered sweeps - one browser job at a time, so enqueue them:');
  for (const c of [...battery.sweeps, ...battery.specs, ...battery.factory]) console.log(`       npm run queue -- "${c}"`);
  if (battery.look.length) {
    console.log('\n  3. and a look at the result for each affected category (screenshots, never a gate;');
    console.log('     it writes into the out-dir you name, so keep that out of the commit):');
    for (const c of battery.look) console.log(`       ${c}`);
  }
  console.log('');
  return 0;
}

if (isEntrypoint) process.exit(await main());
