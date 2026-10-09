#!/usr/bin/env node
// gate: workflow ci.yml
// guards: e2e/**, scripts/e2e-durations.json
//
// Run the e2e specs that cover the files you changed - the inner loop locally, and the per-merge
// tier in CI (docs/DEPLOYMENT.md; the nightly still runs the whole suite).
//
//   npm run test:e2e:affected            # diff against the merge-base with main + working tree
//   npm run test:e2e:affected -- <ref>   # diff against an explicit base ref
//   npm run test:e2e:integration         # after taking main in: diff from the FORK POINT, so the
//                                        # plan covers BOTH sides' changes (automatic when HEAD
//                                        # is a merge of main; --no-integration opts out)
//   npm run test:e2e:affected -- --list  # print the plan without running Playwright
//   npm run test:e2e:affected -- --json  # print the plan as JSON, for CI to branch on
//   node scripts/e2e-affected.mjs --list --files <path> [<path>...]
//                                        # map PATHS (not a diff) through the SAME `// covers:`
//                                        # index, for planning BEFORE any branch exists - the
//                                        # orchestrator's collision pass (no git call at all)
//   npm run test:e2e:affected -- --help  # the accepted flags, generated from the one list
//
// AN ARGUMENT THIS CLI DOES NOT RECOGNISE IS AN ERROR, not a no-op (see `parseArgs`): a
// misspelt plan-only flag used to be dropped on the floor, leaving the plan to RUN.
//
// The mapping is CURATED, not traced, and each spec carries its own share of it in its header
// (`// covers:`, scripts/e2e-lists.mjs): it errs toward running more. Anything touching the
// shared core (store, model, preview composer, validation, the shell, the e2e helpers, build
// config) runs the full suite, because those files feed every flow.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIGURED_TRIGGERS, COVERAGE, FOCUS } from './e2e-lists.mjs';
import { COPY_PATH_FILE, copyEdit, specsNaming } from './e2e-affected-copy.mjs';
import { measured } from './measured.mjs';
import {
  budgetMinutes,
  predictShardMinutes,
  readTable,
  specFilesOnDisk,
  SHARD_CAP_MINUTES,
  SHARD_SAFETY_MINUTES,
} from './e2e-durations.mjs';
import { quarantinedSpecs, readStore as readQuarantine } from './e2e-quarantine.mjs';
import { editedSpecs, planIdentity, specFilterArg, specPath } from './e2e-spec-names.mjs';
import { WHOLE_SUITE_ON_GITHUB } from './command-match.mjs';

/**
 * THE QUARANTINE, applied to a plan. A spec in e2e/quarantine.json failed and then passed on one
 * commit, so its verdict is not one the gate may block on; it leaves the blocking file list here
 * and quarantine.yml runs it on every push to main (scripts/e2e-quarantine.mjs has the mechanism
 * and the release rule). Pure, so the split is testable: `blocking` is what the shards get,
 * `quarantined` is what left, and their union is the input.
 *
 * A SPEC THE CHANGE ITSELF EDITS STAYS BLOCKING. The fix for a flake is an edit to the flaky spec,
 * and a plan that dropped that spec would land the fix untested until its release; the changed
 * set is the one place the planner knows the spec is the point of the change.
 *
 * A quarantined name that is not on disk is dropped silently - a spec deleted while quarantined
 * has nothing left to run - and a quarantined name that is not IN the plan is not reported: a
 * subset that never selected the spec has nothing to say about it.
 *
 * @param {string[]} specs planner names (`anim-engine.spec.ts`)
 * @param {string[]} quarantined store identities (`e2e/anim-engine.spec.ts`)
 * @param {{ changed?: string[] }} [options] repo-relative paths the change touches
 */
export function splitQuarantined(specs, quarantined, { changed = [] } = {}) {
  const bare = new Set((quarantined ?? []).map(planIdentity));
  const edited = editedSpecs(changed);
  const out = (s) => bare.has(s) && !edited.has(s);
  return {
    blocking: specs.filter((s) => !out(s)),
    quarantined: specs.filter(out).map(specPath),
  };
}

/**
 * The plan as it will RUN once the quarantine has left it: an empty blocking list downgrades the
 * mode to 'none', because an empty file list handed to Playwright is not "no tests", it is every
 * test. One helper for both the JSON path and the local run, so the one rule this file calls
 * catastrophic is spelled once.
 */
export function effectivePlan({ mode, blocking }) {
  return { mode: blocking.length === 0 && mode !== 'none' ? 'none' : mode, specs: blocking };
}

function quarantineOnDisk() {
  try {
    return quarantinedSpecs(readQuarantine());
  } catch (error) {
    // A store this build cannot read must not silently un-quarantine everything, nor hide the
    // suite: say so, and plan as if nothing were quarantined - the direction that runs MORE.
    process.stderr.write(`e2e-affected: ignoring e2e/quarantine.json - ${error.message}\n`);
    return [];
  }
}

/**
 * True only when this file was RUN, not imported. `planFor` below is exported for tests, and
 * without this guard importing it executes the CLI at the bottom - which, given no `--list` or
 * `--json`, means spawning Playwright and the whole offline suite. That is not hypothetical:
 * it happened on the first attempt to import this module, and a 150-test run had to be killed.
 */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

// ── Which specs a source change selects ─────────────────────────────────────
// Each spec declares the source it covers in its own header (`// covers:`, scripts/e2e-lists.mjs),
// and every matching spec contributes (union). Adding or re-mapping a spec edits that spec only.
//
// What stays HERE is only what no single spec can hold, each with its reason:
//   - CORE below: the shared foundations whose change runs the full suite.
//   - IGNORE below: files no spec can observe.
//   - CATALOG_TRIGGERS below: the catalog gate is a separate config over the whole catalog, raised
//     as one flag, not a spec a header could name.
//   - CENTRAL: source that is KNOWN and deliberately selects no spec. There is no spec to carry
//     it, and without the row it would read as unmapped and escalate to the full suite.
//
// `components/spaceKey.ts` is deliberately in NONE of these. It answers who owns Space, Delete,
// Escape, Ctrl+C and the arrows for the canvas, the timeline, every modal and every focused
// control, so the set of specs a change to it can move is not a list anybody would keep correct.
// It escalates as unmapped, and that is the decision rather than an omission.
export const CENTRAL = [
  // The CLI under cli/ has its own package tests (CI) and `npm run bench:cli`; a change there
  // runs no e2e spec. (e2e/bridge-ograf.spec.ts imports the Bridge from cli/ and runs when it is
  // edited itself, through the focus set and at night.)
  [/^cli\//, []],
  // The plugin marketplace entry (root .claude-plugin/) and the agent round's brief bank +
  // results (benchmarks/agent/): read by `claude plugin` and by scripts/agent-round-bench.mjs,
  // never by a spec.
  [/^(\.claude-plugin\/|benchmarks\/agent\/)/, []],
];

// Anything matching these runs the FULL suite - shared foundations with fan-out everywhere.
const CORE = [
  /^src\/store\//,
  /^src\/model\//,
  /^src\/preview\//,
  /^src\/validation\//,
  /^src\/components\/(PreviewFrame|App\.)/,
  /^src\/(App|main)\./,
  // The hash router. Every surface in /app is reached through it and browser Back/Forward are
  // part of what it promises, so a route-shape change fans out to every flow that navigates -
  // which is all of them. It reached the full suite anyway, as the unmapped fallback; naming it
  // here records that the escalation is DELIBERATE rather than a file nobody got round to.
  /^src\/app\/router\./,
  /^src\/styles/,
  // The bundled GSAP build is a shared foundation that happens to live under src/assets/, and
  // the `src/assets/**` spec headers are written for asset HELPERS (eraseRegion, assetInfo,
  // lottieSupport) - so without this line an upgrade of the animation engine ran the assets
  // and Pro specs and never anim-engine.spec.ts. Measured on the 3.10.4 -> 3.15.0 upgrade: 57
  // specs, none of them the one that pins editor-vs-runtime motion parity. Every preview and
  // every export inlines this file verbatim (imported `?raw`, so Vite never even transpiles
  // it), which is the definition of fan-out. Matching CORE as well as a header is harmless - the
  // full suite is a superset - and it fails toward running MORE, the direction this script
  // says its safety comes from.
  /^src\/assets\/gsap\.min\.js$/,
  // The flex-gap shim and its carrier are inlined into every composed document and every
  // export the same way GSAP is, so an edit there has the same fan-out.
  /^src\/assets\/flexGapShim\.js$/,
  /^src\/assets\/flexGapSupport\.ts$/,
  /^e2e\/_/,
  // The suite's own machinery, which lives under scripts/ but is imported by the Playwright
  // configs and by the offline globalSetup: the port every spec connects to, the worker count,
  // and the cross-checkout queue that runs before any test does. Naming them here rather than
  // leaving them to the unmapped fallback records WHY they escalate - they are foundations, not
  // files nobody got round to mapping. Their exception in IGNORE above is what lets them reach
  // this list at all.
  /^scripts\/(dev-port|port-registry|e2e-runs|e2e-workers)\.mjs$/,
  /^playwright\.config\.ts$/,
  /^(package|package-lock)\.json$/,
  /^vite\.config/,
  // The template contract: TemplateVariant, WizardOptions, the palettes and the resolvers that
  // every catalog design and every wizard surface reads. It lived in src/model (CORE) until
  // domain row 1 moved it here, and moving a file does not narrow what depends on it - 617
  // template files and the whole wizard do. The files AROUND it keep their subset; this one
  // path escalates, which is what CORE is for (docs/ARCHITECTURE.md §6, the model/wizard.ts shim).
  /^src\/templates\/contract\.ts$/,
  /^app\.html$/,
];

// Files that never affect the offline e2e surface.
//
// `.gitignore` is here because it is VCS metadata: nothing imports it, nothing serves it, and
// no spec can observe it. Left unmapped it escalated a branch to the FULL suite on its own -
// measured on the 2026-07-31 merge of claude/ai-benchmark-harness-routing, where it was the
// only unmapped file and cost a 619-spec run plus the catalog gate to prove nothing.
//
// `benchmarks/corpus-eval/` is the visual eval set's CURATION (docs/SPX_EXAMPLES_CORPUS.md
// workstream 4): pairings and written observations, read only by scripts/spx-eval-set.mjs,
// which is local-only and already ignored above. It ships no code and no spec loads it -
// unlike benchmarks/creative/, whose brief bank creative-routing.spec.ts really does read.
//
// `scripts/` is ignored WHOLESALE on the premise that it is local tooling the app never loads,
// which makes the exception list load-bearing: anything under it that the SUITE ITSELF imports
// must be named here, or a change to it runs no spec at all. The Playwright configs and the
// offline globalSetup import dev-port (hence port-registry, which it imports in turn) for the
// port, e2e-workers for the worker count, and e2e-runs for the cross-checkout queue. A fault in
// any of those does not break one flow - it breaks every spec in the suite, which is the exact
// profile of a file that must escalate. Measured the hard way on 2026-08-06: a commit rewriting
// e2e-runs' checkout attribution, which globalSetup calls before a single test starts, produced
// plan `mode: none` and a green gate that had run zero specs.
//
// Add to the IGNORE list only for a file that genuinely cannot change what a spec sees. The
// script's safety comes from failing TOWARD running more (an unmapped path escalates), so a
// wrong entry here silently runs FEWER specs - the one failure mode with no alarm attached.
// `e2e-affected` and `e2e-lists` are here for a different reason than the rest: they cannot
// break a spec, they decide WHICH specs run. Left ignored, the one change guaranteed to go
// unverified is a change to the thing that chooses the verification - a mistake in this file
// reports `mode: none`, the gate goes green, and nothing ran. Covering them costs one focus run.
// `.github/` is CI configuration. No spec can observe it: Playwright drives a local dev server
// and never reads a workflow file, so running one spec - let alone all 103 - proves exactly
// nothing about a change to it. Its real gate is `scripts/check-workflows.mjs`, which validates
// every workflow against the GitHub Actions schema and runs FIRST in `npm run build`.
//
// The one entry that looks like an exception is not one. `ci.yml` sets `E2E_SPRINT_FOCUS=1`, so
// it decides WHICH specs run - the same category as `e2e-affected`/`e2e-lists`, which are
// deliberately NOT ignored above. The difference is that escalating cannot catch the fault:
// running the full suite locally tells you nothing about whether a workflow's env block is
// right. Nothing is given up by ignoring it, because nothing was being gained. Measured
// 2026-08-07: `nightly.yml` was the unmapped file that turned a two-line gate addition into a
// 759-spec run.
const SUITE_CRITICAL_SCRIPTS =
  'renderDevPlugin|aiDevPlugin|dataDevPlugin|apiRouteTable|build-player-host|dev-port|port-registry|e2e-runs|e2e-workers|e2e-affected|e2e-lists';
// `.env.example` is a template a human copies; nothing loads it. Vite and the dev-server middleware
// read `.env`, and a spec drives a dev server that has never opened the example - so escalating on
// it ran 53 specs to prove nothing. It already has a real gate in `npm run build`:
// `scripts/ai-lite-bench.test.mjs` fails if it ships a concrete AI_LITE_PROMPT_VERSION, which is the
// one way this file has ever changed a deployment's behaviour.
//
// `.claude/`, `.codex/`, `.agents/` and `.agent-workflows/` are the AGENT HARNESS, and they are
// here for exactly the reason `.github/` is: no spec can observe them. Playwright drives a local
// dev server; it never reads a settings file, a skill adapter or a hook. Five tracked files
// across all four directories are not markdown (`.claude/settings.json`, `.codex/config.toml`,
// `.codex/environments/environment.toml`, two `agents/openai.yaml` adapters), and all five
// configure the tools a session runs, not the product a spec drives. Measured over the 119
// first-parent commits on `main` to 2026-09-04: eight of them escalated on nothing but
// `.claude/settings.json` or `.codex/config.toml`, each running the 55-spec focus set to prove
// something no spec can see. `.claude-plugin/` is NOT covered by this - it is the published
// plugin manifest and has its own CENTRAL rule.
//
// `scripts/*.test.mjs` is here because a test cannot change the thing it tests. The suite-critical
// exception above matches on a NAME, so `scripts/e2e-affected.test.mjs` was pulled back out of
// the wholesale `scripts/` ignore and escalated, which was an accident of the regex rather than a
// decision anybody took. These files have a real gate that runs on every change: the
// `node --test` block in `npm run build`, which names each of them.
// A NESTED `.gitattributes` declares how git MERGES and checks out a file - a merge driver and
// an end-of-line rule. Nothing it says reaches the browser, so no spec can observe it. It is
// here because phase 2b writes one into every migrated area (scripts/compile-contracts.mjs), and
// without this line each of the hundred-odd migration rows would run its area's whole spec map
// for two lines of git metadata - `src/templates/versus/.gitattributes` alone planned 46 specs
// plus the catalog gate. The ROOT `.gitattributes` is deliberately NOT ignored: it also carries
// the eol rules for every generated artefact in the repository, and a mistake there is the kind
// that makes a clean tree read as dirty.
const NESTED_GITATTRIBUTES = /\/\.gitattributes$/;
// `contracts/` is the rule store and its retired list: read by the build gates, never by the product.
const IGNORE = [/^docs\/(?!svg-samples\/|tutorials\/svg-examples\/)/, /^(?!docs\/tutorials\/svg-examples\/README\.md$).*\.md$/, /^scripts\/[^/]*\.test\.mjs$/, /^e2e\/quarantine\.json$/, new RegExp(`^scripts/(?!.*(${SUITE_CRITICAL_SCRIPTS}))`), /^e2e\/configured\//, /^render-worker\//, /^supabase\//, /^contracts\//, /^NoaCG-Brand-Kit\//, /^example_projects\//, /^benchmarks\/corpus-eval\//, /^\.dependency-cruiser\.cjs$/, /^\.gitignore$/, /^\.github\//, /^\.(claude|codex|agents|agent-workflows)\//, /^\.env\.example$/, NESTED_GITATTRIBUTES];

// Anything matching these also needs the catalog-wide gate (npm run test:e2e:catalog -
// e2e/catalog/catalog-bench.spec.ts, excluded from the default suite above). Same reasoning as
// type-floor.mjs/overflow-sweep.mjs: it only needs to run when the catalog itself, or the
// runtime bench it's calibrated against, could have changed.
// `src/model/fonts.ts` is here because a font change is a catalog-wide LOOK change: the
// registry decides every design's default face, and `tabularFigures` decides what its live
// numbers are set in (scripts/numerals.mjs). Editing it without the calibration gate is how a
// width budget silently moves under 430 designs at once.
const CATALOG_TRIGGERS = [
  // The gate's own config. It is the one file that can change what the tripwire MEASURES -
  // its worker count, its timeouts, its offline pinning - while touching no catalog source at
  // all, so no other rule here would ever raise it. Left unmapped it escalates to `full`
  // instead, and under sprint focus a `full` escalation deliberately drops the catalog
  // coupling: the change to the catalog gate would be the one change that never runs it.
  /^playwright\.catalog\.config\.ts$/,
  // The gate's own SPECS, for the same reason one line up and with the same failure if omitted:
  // they live outside the default suite, so no other rule here mentions them, and an unmapped
  // change escalates to `full` - which under sprint focus drops the catalog coupling, making a
  // change to a catalog spec the one change that never runs that spec. Editing the rule and never
  // executing it is how a gate quietly stops measuring what it claims to.
  /^e2e\/catalog\//,
  /^src\/templates\//,
  /^src\/blocks\//,
  /^src\/assets\//,
  /^src\/model\/fonts\.ts$/,
  /^src\/model\/themeTokens\.ts$/,
  /^src\/validation\/runtimeBench\.ts$/,
  // The modules the bench MEASURES THROUGH, for the same reason as the line above: the catalog
  // gate is what says a bench rule does not fire on the house's own 502 designs, and a rule
  // whose measurement lives in its own file would otherwise be edited without ever running that
  // gate. `occlusion.ts` is the first of those; anything the bench comes to import for a
  // catalog-visible finding belongs here beside it.
  /^src\/validation\/occlusion\.ts$/,
];

/**
 * THE CLASSIFICATION, as a pure function of a changed-file list.
 *
 * Split out from the CLI so it can be tested without a git repository and a real diff. That is
 * not tidiness: this function decides how much of the suite runs, and its worst failure - saying
 * "nothing to run" when something should have - is silent by construction. It shipped exactly
 * that on 2026-08-06 (a change to files the Playwright configs import, hidden by the blanket
 * `scripts/` exemption) and the gate went green having executed zero specs. A pure function is
 * one that can be pinned with a list of realistic merges and an expected size for each.
 *
 * A CHANGED SPEC THAT NO LONGER EXISTS PLANS NOTHING. The diff lists a deleted file like any
 * other, and a deleted spec's tests are gone, so there is nothing of it to run; planning its
 * name anyway handed CI a ghost that `emitJson` rightly refuses. `specsOnDisk` is the bare spec
 * names in `e2e/` (`specFilesOnDisk()`); the function stays pure because the caller supplies it,
 * and leaving it out keeps the old behaviour for callers that only reason about names.
 *
 * A FILE WHOSE EDIT IS ONLY COPY is planned by the specs that name what changed
 * (scripts/e2e-affected-copy.mjs), not by its covers lines or the core escalation. `copyEdits`
 * maps such a file to its edit, as `copyEdit` classified it from the two versions; a file absent
 * from it is planned exactly as before, and with no map at all nothing changes. `specTexts` is
 * every spec's source with the e2e helpers it imports, which the naming search reads. Of the
 * file's normal coverage two kinds stay: `baselined`, the specs with screenshot baselines, since a
 * picture compares every pixel; and, when the wording GREW, `measuring`, the specs that measure
 * geometry, since longer words are how a fit breaks. The catalog and configured flags are asked
 * first either way.
 *
 * @param {string[]} changed        repo-relative paths, forward slashes
 * @param {{ sprintFocus?: boolean, specsOnDisk?: string[] | null,
 *           copyEdits?: Map<string, { kind: 'text'|'class', terms: string[], grew?: boolean }>,
 *           specTexts?: Map<string, string>, baselined?: string[], measuring?: string[] }} [opts]
 * @returns {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean,
 *             unmapped: string[], focusApplied: boolean, copyOnly: string[] }}
 */
export function planFor(
  changed,
  { sprintFocus = false, specsOnDisk = null, coverage = COVERAGE, copyEdits = new Map(), specTexts = new Map(), baselined = [], measuring = [] } = {},
) {
  const onDisk = specsOnDisk ? new Set(specsOnDisk) : null;
  const specs = new Set();
  let full = false;
  let catalog = false;
  let configured = false;
  const unmapped = [];
  const copyOnly = [];

  for (const file of changed) {
    // Asked BEFORE the ignore list, deliberately: `e2e/configured/**` is ignored for the
    // offline plan (those specs cannot run here), and that is precisely the file set whose
    // change most needs the configured suite named.
    if (CONFIGURED_TRIGGERS.some((r) => r.test(file))) configured = true;
    if (IGNORE.some((r) => r.test(file))) continue;
    if (CATALOG_TRIGGERS.some((r) => r.test(file))) catalog = true;
    if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
      const name = file.replace(/^e2e\//, '');
      if (!onDisk || onDisk.has(name)) specs.add(name); // a deleted spec has nothing left to run
      continue;
    }
    // A spec's screenshot baselines (`<name>.spec.ts-snapshots/`) are that spec's own input: a
    // re-recorded picture runs the spec that compares against it, and nothing else.
    const baselineOf = /^e2e\/([^/]+\.spec\.ts)-snapshots\//.exec(file)?.[1];
    if (baselineOf) {
      if (!onDisk || onDisk.has(baselineOf)) specs.add(baselineOf);
      continue;
    }
    const copy = copyEdits.get(file);
    if (copy) {
      copyOnly.push(file);
      for (const s of specsNaming(copy, specTexts)) specs.add(s);
      for (const c of coverage) {
        const kept = baselined.includes(c.spec) || (copy.grew && measuring.includes(c.spec));
        if (kept && c.test(file)) specs.add(c.spec);
      }
      continue;
    }
    if (CORE.some((r) => r.test(file))) {
      full = true;
      continue;
    }
    const covering = coverage.filter((c) => c.test(file));
    const central = CENTRAL.filter(([r]) => r.test(file));
    if (covering.length === 0 && central.length === 0) {
      unmapped.push(file); // Unknown territory: be safe, run everything, and say why.
      full = true;
    } else {
      for (const c of covering) specs.add(c.spec);
      for (const [, list] of central) for (const s of list) specs.add(s);
    }
  }

  // Under sprint focus, the escalation that would have run everything runs the focus set
  // (union with whatever the mapped rules already named). The full->catalog coupling below is
  // deliberately skipped for an intercepted run: a styles.css tweak stops paying the 25-minute
  // catalog gate, while a direct CATALOG_TRIGGERS match above still raises the flag.
  let focusApplied = false;
  if (full && sprintFocus) {
    full = false;
    focusApplied = true;
    for (const s of FOCUS) specs.add(s);
  }
  // A core/unmapped change gets the same conservative default the offline suite gets: assume it
  // could touch the catalog too, rather than trusting CATALOG_TRIGGERS to have named every path.
  if (full) catalog = true;

  const list = full ? [] : [...specs].sort();
  // `configured` never changes `mode`: the configured suite is opt-in, needs secrets, and is
  // reported rather than run (scripts/e2e-lists.mjs). A change that touches ONLY its territory
  // still reports 'none' for this gate, and the printed line is what says otherwise.
  const mode = full ? 'full' : list.length === 0 && !catalog ? 'none' : 'subset';
  return { mode, specs: list, catalog, configured, unmapped, focusApplied, copyOnly };
}

/**
 * How much runner time one shard should be worth, in minutes of measured test execution.
 *
 * SET FROM THE FIXED COST OF ADDING A SHARD, which is about a minute when nothing is wrong: 0.3
 * of job setup (checkout 0.08, setup-node 0.03, a cached install 0.13, the browser cache 0.08)
 * and about 0.7 inside the step for Playwright's own start and the dev-server boot. Measured on
 * run 32301623379: three shards, 22.0 table-minutes, 7.8-9.7 min per job - which the model
 * `minutes / n + 1.0` predicts to within a few seconds, and which the nine-shard full runs
 * beside it match too.
 *
 * "WHEN NOTHING IS WRONG" IS NOT AN ASSUMPTION ANY MORE, and it should never have been one. That
 * 0.3 was a reading from a good day: over the 90 shard jobs of the ten runs to 2026-09-04 08:43
 * the install alone averaged 6.4 minutes and reached 10.2 at the p90, which is what actually
 * killed the two shards this file's packer was meant to save. `budgetMinutes`
 * (scripts/e2e-durations.mjs) now carries the MEASURED per-job cost, `shardsFor` sizes against
 * the job cap as well as against this target, and a plan that cannot fit says so instead of
 * discovering it one cancelled shard at a time.
 *
 * At three minutes a shard the setup is ~25% overhead, and below that an extra runner stops
 * paying. It is deliberately much lower than it could have been before 2026-08-19: until the
 * apt call in `.github/actions/playwright-chromium` was tied to the browser cache miss, adding a
 * shard cost 3.5 minutes of setup rather than one, and the old workflow comment's "beyond four,
 * the 52 s of per-shard setup costs more than it saves" was understating its own case. Making a
 * shard cheap is what makes sharding finely correct.
 *
 * The full plan is now 123.6 measured minutes (2026-10-03, run 37143991356), so this target
 * asks for 42 shards and the ceiling holds it at ten. Refreshing the stale weights alone left
 * one of nine jobs at 18.65 minutes on full run 37149189106. Replaying that run's measured
 * file costs gives ten bins a slowest predicted job of 16.06 minutes, restoring the three-minute
 * safety margin without raising the timeout. See the shard-headroom backlog evidence.
 */
export const SHARD_TARGET_MINUTES = 3;

/**
 * The ceiling, for the reasons ci.yml's `strategy` comment gives: every shard is an independent
 * runner, so the chance one of them hits an infrastructure hiccup grows with the count, and the
 * account's 20-concurrent-job limit is a real constraint here - runs starting while two other
 * branches were mid-gate waited 22 to 45 minutes for a runner over the 60 runs to 2026-08-19.
 */
export const MAX_SHARDS = 10;

/**
 * HOW MANY RUNNERS THIS PLAN IS WORTH, from measured minutes rather than from a file count.
 *
 * The old rule was `full ? 9 : min(4, floor(files / 4))`, and the cap was the expensive half:
 * under sprint focus and the curated map, a "subset" is routinely 70-100 of the 128 spec files,
 * so 80% of the suite ran on 44% of the runners and a targeted run finished LATER than the full
 * one. Measured on run 32174589727: 103 specs, 58.3 min of tests, 4 shards, 14.6 min each -
 * against 7.4 min a shard on the full run beside it.
 *
 * A spec the table has never measured counts as the MEDIAN rather than as zero: a new spec file
 * must be able to raise the shard count, and zero would let a plan made entirely of new specs
 * ask for one runner. This function still decides only the runner COUNT and never which tests
 * run, so a wrong number here cannot cost coverage - but since `packShards` began spending the
 * same durations on balance, the accuracy matters more than it did, and `emitJson` names every
 * spec it had to guess at rather than guessing quietly.
 *
 * TWO REASONS TO ASK FOR A RUNNER, and the bigger one wins. The target above is an EFFICIENCY
 * question - below three minutes an extra runner stops paying for itself. `budgetMinutes` is a
 * DEADLINE question - how much a shard can carry and still come in under ci.yml's 20-minute cap,
 * given the measured per-job overhead. The target has always asked for more runners than the cap
 * needs, so on a healthy day this second term changes nothing; it earns its place on an unhealthy
 * one, where it is what makes `emitJson` able to say the plan does not fit instead of finding out
 * from a cancelled shard.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[] }} plan
 * @param {{ minutes: Record<string, number> }} [table]
 * @returns {number} shard count, at least 1
 */
export function shardsFor({ mode, specs }, table = readTable(), suite = specFilesOnDisk()) {
  if (mode === 'none') return 1;
  const minutes = planMinutes({ mode, specs }, table, suite);
  const forThroughput = Math.ceil(minutes / SHARD_TARGET_MINUTES);
  const forCap = Math.ceil(minutes / budgetMinutes(table));
  return Math.min(MAX_SHARDS, Math.max(1, forThroughput, forCap));
}

/**
 * The measured minutes a plan is worth, over THE FILES IT WILL ACTUALLY RUN.
 *
 * A full plan's file list is the e2e DIRECTORY, not `specs` (which a full plan deliberately
 * leaves empty) and not the table's keys. Summing the table's keys instead - which is what this
 * did until the review of 2026-09-04 - gets both ends wrong in the same direction the sizing
 * cannot afford: a spec on disk that the table has never measured contributes ZERO rather than
 * the median, so a stale table under-asks for runners exactly when the cap term exists to catch
 * it, and an entry left behind by a deleted spec is counted for work nobody will do. `packShards`
 * and the prediction beside it already enumerate from the directory, so this is also what makes
 * the two agree about the same plan.
 */
export function planMinutes({ mode, specs }, table = readTable(), suite = specFilesOnDisk()) {
  return minutesFor(mode === 'full' ? suite : specs, table);
}

/**
 * WHAT ONE SPEC IS WORTH, as a function bound to a table.
 *
 * The one place the "unmeasured counts as the median" rule lives. Sizing, packing and the
 * wall-clock prediction all need it and all used to carry their own copy, which is how two of
 * them can come to disagree about the same plan.
 */
function weigher(table) {
  const median = medianOf(Object.values(table.minutes));
  return (spec) => table.minutes[spec] ?? median;
}

/** What a list of spec files is worth, in measured minutes (an unmeasured spec at the median). */
export function minutesFor(files, table) {
  const weight = weigher(table);
  return files.reduce((sum, spec) => sum + weight(spec), 0);
}

/** The middle measured duration - what an unmeasured spec is worth to both sizing and packing. */
function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/**
 * ONE SPEC FILE, as a Playwright positional filter that matches THAT FILE AND NO OTHER.
 *
 * Playwright's positional arguments are REGULAR EXPRESSIONS matched against the whole test-file
 * path, not file names, so a bare `control.spec.ts` also selects `ai-more-control.spec.ts` and
 * `hosted-control.spec.ts`. Five such collisions exist in `e2e/` today (`control`, `format`,
 * `import`, `project`, and the pairs above), and under the old `--shard=i/n` split they cost
 * nothing: the filter was the whole plan and Playwright divided the union, so a file pulled in
 * twice was still run once. Handing each runner its OWN file list removes that protection - the
 * same spec would land on two shards, run twice, and unbalance both.
 *
 * The leading separator class is what anchors it, and it has to be a class rather than `/`
 * because the path is built by the OS: `C:\...\e2e\control.spec.ts` on a developer's machine,
 * `/home/runner/.../e2e/control.spec.ts` on the runner. Verified both directions against
 * `playwright test --list`.
 */
// The builder itself lives with the other spec-name conversions (scripts/e2e-spec-names.mjs), so
// the quarantine and the retry can use it without loading the planner; re-exported here because
// ci.yml's shard step and the tests reach it through this module.
export { specFilterArg };

/**
 * WHICH SPEC FILES EACH RUNNER GETS, bin-packed by measured duration.
 *
 * WHY THIS REPLACED `--shard=i/n`. Playwright shards by test COUNT, so the spread inside a shard
 * set is whatever the split happens to give. Measured over the 30 ci.yml runs on `main` from
 * 2026-09-02 23:06 to 2026-09-04 02:23, per-shard mean wall clock on the 26 green runs was:
 *
 *   shard 1  8.8 min      shard 4  12.5     shard 7  13.0
 *   shard 2 14.6 min      shard 5  11.0     shard 8  12.3
 *   shard 3 10.1 min      shard 6  11.1     shard 9  12.4
 *
 * A 1.66x spread with nothing wrong: shard 2 sat at 14.6 against the job's 20-minute cap while
 * shard 1 idled at 8.8. Ordinary runner variance on top of that is what tipped 4 of those 30 runs
 * over the cap - and a shard killed by its own `timeout-minutes` is recorded by GitHub as
 * `cancelled`, which makes the whole RUN cancelled and poisons every instrument downstream
 * (measured on the shard-cap row, whose handoff was drained on 2026-09-09 and prints from
 * `git show ba427e57:docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md`).
 * Longest-processing-time-first packing pulls every shard to within a few percent of the balanced
 * 11.1 min, which turns shard 2's 2.6 minutes of headroom into about eight.
 *
 * WHAT MAKES IT SAFE, and it is the objection ci.yml raised for three weeks: an explicit per-shard
 * file list means a spec missing from the assignment is a spec nobody runs, where a missing
 * DURATION used to cost only wall clock. So the packer takes the suite from `allSpecs` (the
 * DIRECTORY, via `specFilesOnDisk`) and the table supplies weights only; an unmeasured spec is
 * packed at the median, never dropped. The union of the returned bins is then asserted to be
 * exactly the input, and a mismatch THROWS - failing the plan job loudly rather than quietly
 * testing less than it claims.
 *
 * Bins are returned non-empty and at most `shardCount` of them: an empty list handed to Playwright
 * is not "no tests", it is EVERY test, so a shard with nothing to do must not exist at all.
 *
 * @param {string[]} specs the files to divide - the whole suite for mode 'full'
 * @param {number} shardCount the ceiling from `shardsFor`
 * @param {{ minutes: Record<string, number> }} [table]
 * @returns {string[][]} one sorted file list per runner, heaviest bin first
 */
export function packShards(specs, shardCount, table = readTable()) {
  const files = [...new Set(specs)];
  const bins = Math.max(1, Math.min(Math.floor(shardCount), files.length));
  if (files.length === 0) return [];

  const weight = weigher(table);

  // Longest-processing-time-first: heaviest spec onto the lightest bin. A 4/3-approximation in
  // the worst case and far better than that here, where no single spec is a large fraction of a
  // bin - the slowest file in the table is 3.3 min against an 11.1-min bin.
  const packed = Array.from({ length: bins }, () => ({ total: 0, files: [] }));
  const order = [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  for (const spec of order) {
    let lightest = packed[0];
    for (const bin of packed) if (bin.total < lightest.total) lightest = bin;
    lightest.files.push(spec);
    lightest.total += weight(spec);
  }

  const result = packed
    .sort((a, b) => b.total - a.total)
    .map((bin) => bin.files.sort());

  // THE COVERAGE ASSERTION. Everything above is arithmetic that decides what gets tested, so it
  // states its result rather than trusting it. Cheap, total, and the only thing standing between
  // a packing bug and a gate that silently runs less than the whole plan. The length check is not
  // redundant with the membership one: it is what catches a spec assigned TWICE.
  const assigned = result.flat();
  const seen = new Set(assigned);
  const missing = files.filter((f) => !seen.has(f));
  if (missing.length > 0 || assigned.length !== files.length) {
    throw new Error(
      'packShards did not assign every spec exactly once - refusing to plan a run that tests less than it claims. ' +
        `Got ${assigned.length} assignment(s) for ${files.length} file(s)` +
        (missing.length ? `; never assigned: ${missing.join(', ')}` : ''),
    );
  }
  return result;
}

/**
 * THE RUN LIST, as a pure function of a plan. One entry per Playwright invocation this command
 * is responsible for: the mapped/full suite, and the catalog calibration tripwire, which is a
 * SEPARATE config and therefore a separate process.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @returns {{ name: string, args: string[] }[]}
 */
export function runsFor({ mode, specs, catalog }) {
  const runs = [];
  // An empty spec list handed to Playwright is not "no tests", it is EVERY test - which is why
  // `full` names the suite with no arguments and `subset` only ever runs with a non-empty list.
  if (mode === 'full' || specs.length > 0) {
    runs.push({ name: 'suite', args: ['playwright', 'test', ...specs] });
  }
  if (catalog) {
    runs.push({ name: 'catalog gate', args: ['playwright', 'test', '--config=playwright.catalog.config.ts'] });
  }
  return runs;
}

/**
 * Run everything the plan named and report the FIRST FAILURE's status, never the last run's.
 *
 * This command can spawn two Playwright processes, and the catalog gate is the one that usually
 * goes second. Returning only its status would mean a failing suite followed by a passing gate
 * exits 0 - a green light over a red run, on the command that IS the per-merge gate
 * (docs/DEPLOYMENT.md). Both runs still execute on a failure: the gate's verdict is information
 * worth having even once the suite has gone red, and skipping it would turn one red run into two
 * round trips.
 *
 * `runOne` is injected so this is testable without spawning Playwright - the point being that a
 * defect here is silent by construction, exactly like `planFor`'s.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @param {(run: { name: string, args: string[] }) => number|null|undefined} runOne
 * @returns {{ status: number, runs: { name: string, args: string[], status: number }[] }}
 */
export function runPlan(plan, runOne) {
  const runs = [];
  let status = 0;
  for (const run of runsFor(plan)) {
    // A spawn that was killed by a signal, or never started, reports a null status. That is a
    // failure, not a pass - the one case where "no exit code" must not read as zero.
    const code = runOne(run) ?? 1;
    runs.push({ ...run, status: code });
    if (code !== 0 && status === 0) status = code;
  }
  return { status, runs };
}

/**
 * WHAT A RUN MAY DO ON THIS MACHINE. The whole suite runs on GitHub Actions: CI plans every pull
 * request and every merge group from this same file and runs the plan there, sharded. So off CI a
 * plan that is the whole suite (`full`, `--all`) or its stand-in (the sprint focus set an
 * escalation collapses to) is refused, and the catalog gate, a whole-catalog run, is left to CI.
 * A mapped subset runs as before, whatever its size: it is targeted, and a risky change or a CI
 * failure to reproduce may need a large one.
 *
 * @param {{ mode: 'none'|'subset'|'full', focusApplied?: boolean, catalog?: boolean }} plan
 * @param {{ ci?: boolean }} where  `ci` is true on GitHub Actions
 * @returns {{ refusal: string|null, catalog: boolean }} the refusal to print, or null, and whether
 *   the catalog gate runs here
 */
export function localRunPolicy({ mode, focusApplied = false, catalog = false }, { ci = false } = {}) {
  if (ci) return { refusal: null, catalog };
  return { refusal: mode === 'full' || focusApplied ? WHOLE_SUITE_ON_GITHUB : null, catalog: false };
}

/** True on GitHub Actions (and any CI that sets `CI`), the one place the whole suite runs. */
const onCi = () => Boolean(process.env.CI || process.env.GITHUB_ACTIONS);

/** The one-line verdict, naming each run - so a red overall status says WHICH run went red. */
export function summariseRuns(runs, status) {
  const parts = runs.map((r) => `${r.name} ${r.status === 0 ? 'passed' : `FAILED (exit ${r.status})`}`);
  return `e2e-affected: ${parts.join('; ')}. Overall: ${status === 0 ? 'passed' : `FAILED (exit ${status})`}.`;
}

/**
 * `git`, in a named repository. `undefined` keeps the process's own directory, which is what this
 * file's own CLI wants; `catalog-affected.mjs` passes its repository root, because it pins every
 * git call there rather than to wherever the process was started.
 */
function gitIn(cwd, ...cmd) {
  return execFileSync('git', cmd, { encoding: 'utf8', ...(cwd ? { cwd } : {}), windowsHide: true }).trim();
}

/**
 * THE CHANGED-FILE LIST: everything committed since `base`, plus the working tree.
 *
 * Exported because `scripts/catalog-affected.mjs` asks the same question of the same repository
 * and had a byte-identical copy of this, comment-free - including the porcelain-prefix regex whose
 * reason is the next paragraph. Two copies of "what changed" is two answers waiting to differ.
 *
 * Porcelain lines are `XY path` (a rename is `XY old -> new`); a global `trim()` would eat the
 * first line's leading status space, so the prefix is stripped by pattern, not by position.
 *
 * @param {string} base  a ref; the diff is `base...HEAD`
 * @param {string} [cwd] the repository to ask - a linked worktree passes its own root
 * @returns {string[]} repo-relative paths, forward slashes, deduplicated
 */
export function changedFilesSince(base, cwd = undefined) {
  const opts = { encoding: 'utf8', ...(cwd ? { cwd } : {}), windowsHide: true };
  const committed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], opts).trim().split('\n');
  const working = execFileSync('git', ['status', '--porcelain'], opts)
    .split('\n')
    .map((l) => l.replace(/^.{2} /, '').replace(/^.* -> /, '').trim());
  return [...new Set([...committed, ...working])].filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}

/**
 * WHAT THE COPY PATH NEEDS FROM THE REPOSITORY: each changed file's edit, read from the file at
 * the diff's own old side (the merge-base `changedFilesSince` diffs from) and from the working
 * tree, plus every spec's source and which specs carry screenshot baselines. A file either side
 * cannot be read for - added, deleted, renamed - gets no entry, which is the normal plan.
 *
 * @param {string} base the ref `changedFilesSince` was given
 * @param {string[]} changed its answer
 * @param {string} [cwd]
 */
export function copyContext(base, changed, cwd = undefined) {
  const root = cwd ?? gitIn(cwd, 'rev-parse', '--show-toplevel');
  const old = gitIn(cwd, 'merge-base', base, 'HEAD');
  const read = (f) => {
    try {
      return readFileSync(join(root, f), 'utf8');
    } catch {
      return null;
    }
  };
  const copyEdits = new Map();
  for (const file of changed) {
    if (!COPY_PATH_FILE.test(file)) continue;
    let before;
    try {
      before = execFileSync('git', ['show', `${old}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20, ...(cwd ? { cwd } : {}), windowsHide: true });
    } catch {
      continue;
    }
    const edit = copyEdit(file, before, read(file));
    if (edit) copyEdits.set(file, edit);
  }
  const specTexts = new Map();
  const baselined = [];
  const measuring = [];
  if (copyEdits.size > 0) {
    const names = readdirSync(join(root, 'e2e'));
    // A spec reads the wording its helpers read: `_video.ts` clicks a button by its name for
    // every spec that imports it, so the helper's text counts as the spec's own.
    const helpers = new Map(names.filter((n) => /^_.*\.ts$/.test(n)).map((n) => [n.replace(/\.ts$/, ''), read(`e2e/${n}`) ?? '']));
    const withHelpers = (text) => {
      const seen = new Set();
      const queue = [text];
      let all = '';
      while (queue.length) {
        const t = queue.pop();
        all += `\n${t}`;
        for (const m of t.matchAll(/from\s+['"]\.\/(_[\w-]+)(?:\.ts)?['"]/g)) {
          if (helpers.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); queue.push(helpers.get(m[1])); }
        }
      }
      return all;
    };
    for (const name of names) {
      if (name.endsWith('.spec.ts')) {
        const own = read(`e2e/${name}`) ?? '';
        specTexts.set(name, withHelpers(own));
        if (MEASURES_GEOMETRY.test(own)) measuring.push(name);
      } else if (name.endsWith('.spec.ts-snapshots')) baselined.push(name.replace(/-snapshots$/, ''));
    }
  }
  return { copyEdits, specTexts, baselined, measuring };
}

/** A spec that measures layout - the kind longer wording can break without naming it. */
const MEASURES_GEOMETRY = /scrollHeight|scrollWidth|clientHeight|clientWidth|offsetHeight|offsetWidth|getBoundingClientRect|boundingBox\(|toBeInViewport/;

/**
 * The main refs this checkout actually has.
 *
 * A worktree's local `main` is routinely stale here - the merge queue moves `origin/main` and
 * nothing moves the local ref - while a checkout that was pulled but not fetched has the opposite,
 * and a CI checkout of a feature branch has NO local `main` at all, because `actions/checkout`
 * creates a branch only for the ref it checked out. Every caller below has to survive each case,
 * so the question is asked once, and each caller decides which of the refs to trust.
 */
function mainRefs(cwd) {
  return ['main', 'origin/main'].filter(
    (ref) =>
      spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore', cwd, windowsHide: true }).status === 0,
  );
}

/**
 * The ordinary base: where this branch left main. Exported for `catalog-affected.mjs`, which
 * needs the same answer and used to hardcode `main` - unresolvable on a CI checkout.
 *
 * `cwd` for the same reason `changedFilesSince` takes one: catalog-affected pins every git call
 * to the repository root rather than to wherever it was invoked from, and a base resolved in one
 * repository and diffed in another is not a smaller answer, it is a crash.
 *
 * THE NEWEST MERGE-BASE WINS. A stale ref is an ancestor of the fresh one, so its merge-base with
 * HEAD is older, and diffing from it charges this branch with everything that landed since: a
 * seven-file branch was planned as the whole suite on 2026-09-15 because its local `main` was
 * behind `origin/main`. Whichever ref is fresh, its merge-base contains the other's, so that one
 * is taken. Two merge-bases neither of which contains the other (a HEAD that merged both) take the
 * first, which can only plan wider.
 */
export function branchBase(cwd = undefined) {
  const refs = mainRefs(cwd);
  if (refs.length === 0) throw new Error('neither main nor origin/main exists in this checkout - cannot compute a base');
  const bases = refs.map((ref) => gitIn(cwd, 'merge-base', 'HEAD', ref));
  return bases.find((b) => bases.every((other) => other === b || isAncestor(other, b, cwd))) ?? bases[0];
}

/**
 * True when HEAD is a merge commit - which, on a feature branch, means main was just taken in.
 * Module scope and exported for the same reason `integrationBase` is: `catalog-affected.mjs`
 * asks the same question and the two must answer it identically.
 */
export function headIsMainMerge(cwd = undefined) {
  return gitIn(cwd, 'rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/).length > 2;
}

/** True when `maybeAncestor` is contained in `ref`. Exit status, so no output to parse. */
function isAncestor(maybeAncestor, ref, cwd) {
  return spawnSync('git', ['merge-base', '--is-ancestor', maybeAncestor, ref], { stdio: 'ignore', cwd, windowsHide: true }).status === 0;
}

/**
 * THE INTEGRATION BASE - the fork point, for a branch that has taken `main` in.
 *
 * The default base is `merge-base HEAD main`, which answers "what has this branch changed".
 * After `git merge main` that base IS `main`, so the plan covers only the branch's own files
 * and everything main just brought in is invisible to the gate. That is the wrong question at
 * exactly the moment the right one matters: a clean textual merge says nothing about whether
 * the COMBINED state holds, and the two sides are individually green by construction - each was
 * verified against a tree that no longer exists.
 *
 * So when HEAD has taken main in, diff from where the two sides diverged instead: for the most
 * recent first-parent merge whose SECOND parent came from main, that is `merge-base P1 P2`. The
 * resulting file list is the union of both sides' changes since the fork, which is what "verify
 * the combined state" means in terms this script can classify. It is deliberately
 * over-inclusive - the same direction every other fallback here fails in - and the cost is
 * bounded by sprint focus, which collapses the escalation to the 34-spec set rather than 103.
 *
 * Walking the first-parent chain (rather than only looking at HEAD) keeps this working after
 * follow-up commits: the integration is not verified until it is verified, and adding a commit
 * on top does not make the merge older news. The walk stops at the first merge that is ALREADY
 * contained in main - see the comment on that line; below it there is nothing of this branch's
 * to integrate.
 *
 * Exported because `scripts/catalog-affected.mjs` needs the identical answer and must not grow a
 * second implementation of it: the two planners already share `changedFilesSince`, and a fork
 * point that drifted between them would mean the E2E gate and the catalog gate disagreed about
 * what a post-merge branch had changed.
 *
 * @returns {string|null} the fork point, or null when this branch has merged nothing from main
 */
export function integrationBase(cwd = undefined) {
  // "Came from main" is asked of `origin/main` as well as `main` (see `mainRefs`): a branch that
  // merged `origin/main` directly would otherwise look like it had merged nothing, and the silent
  // answer would be the old, narrower base - the exact failure this exists to prevent.
  const refs = mainRefs(cwd);
  const merges = gitIn(cwd, 'rev-list', '--merges', '--first-parent', '--max-count=50', 'HEAD')
    .split('\n')
    .filter(Boolean);
  for (const merge of merges) {
    // A MERGE THAT IS ALREADY ON MAIN IS NOT THIS BRANCH'S INTEGRATION TO VERIFY. Landing a
    // branch leaves a merge commit on main, so every branch cut from main afterwards inherits it
    // in its first-parent chain - and without this line the walk finds that one, hands back a
    // fork point from somebody else's work, and a six-file branch gets planned as if it had
    // merged half the repository. It was measured doing exactly that on run 32301201748: a
    // six-file push planned 6 shards instead of 3, because this branch was cut from a `main`
    // whose tip happened to be a merge commit. Everything below such a merge is main's own
    // history and was verified when it landed, so stopping here is the whole answer, not a skip.
    if (refs.some((ref) => isAncestor(merge, ref, cwd))) return null;
    const [, p1, p2] = gitIn(cwd, 'rev-list', '--parents', '-n', '1', merge).split(/\s+/);
    // A merge with one parent is an octopus artefact or a grafted history; skip rather than
    // guess. `p2` came from main only if a main ref still contains it.
    if (!p1 || !p2 || !refs.some((ref) => isAncestor(p2, ref, cwd))) continue;
    return gitIn(cwd, 'merge-base', p1, p2);
  }
  return null;
}

/** The plan, as CI consumes it. `mode` covers the specs to run; `catalog` is independent of it,
 *  because a catalog change can need the calibration gate while needing no feature spec.
 *
 *  `shardSpecs` is the ASSIGNMENT - one explicit file list per runner, bin-packed by measured
 *  duration (`packShards`) - and `shards` is simply how many of them there are, so the matrix
 *  size and the assignment cannot disagree. For mode 'full' the suite comes from the directory
 *  rather than from `specs`, which stays `[]` because that is what the rest of the CLI means by
 *  "no filter"; the two are consistent because every runner is now handed its files explicitly. */
function emitJson({ mode, specs, catalog, base, changedFiles }) {
  const changed = changedFiles === null ? null : changedFiles.length;
  const onDisk = specFilesOnDisk();
  const planned = mode === 'full' ? onDisk : specs;

  // The quarantine split comes AFTER the ghost check below so a ghost is still reported, and
  // BEFORE sizing and packing so the shards are sized for the files they will actually run.
  const { blocking: suite, quarantined } = splitQuarantined(planned, quarantineOnDisk(), { changed: changedFiles ?? [] });
  if (quarantined.length > 0) {
    process.stderr.write(`e2e-affected: ${quarantined.length} quarantined spec(s) left the blocking shards for quarantine.yml: ${quarantined.join(', ')}\n`);
  }

  // A SPEC NAME THAT NAMES NOTHING used to be harmless: Playwright took the plan as filters and
  // simply matched nothing extra. Now each name becomes one runner's whole file list, so a ghost
  // left behind by a rename can land alone in a bin and red that shard with "no tests found" -
  // a central-rule typo reported as a test failure. The build refuses one first (`auditSpecHeaders`
  // in scripts/e2e-lists.mjs, run by `e2e-affected.test.mjs`); this is the line behind it.
  const ghosts = planned.filter((spec) => !onDisk.includes(spec));
  if (ghosts.length > 0) {
    throw new Error(`the plan names ${ghosts.length} spec file(s) that do not exist: ${ghosts.join(', ')} - fix CENTRAL in scripts/e2e-affected.mjs`);
  }

  const table = readTable();
  // The same `suite` goes to the sizing and to the packing, so the runner count and the
  // assignment are answering about one file list rather than two.
  const { mode: effectiveMode } = effectivePlan({ mode, blocking: suite });
  const shardSpecs = effectiveMode === 'none' ? [] : packShards(suite, shardsFor({ mode: effectiveMode, specs: suite }, table, suite), table);
  const shards = Math.max(1, shardSpecs.length);

  // UNMEASURED SPECS ARE NOW LOUD. They are packed at the median, which was a harmless guess while
  // the table only sized the shard COUNT (capped at 9, so drift changed nothing). Bin-packing
  // spends those weights on balance, and the median is a bad guess for the specs that most need a
  // good one: on 2026-09-04 the table was 15 days stale and the two heaviest files in the whole
  // suite - counting-settle.spec.ts at 4.96 min and import-svg-corpus.spec.ts at 3.36 - were both
  // missing from it, so each would have been packed as 0.51. A bin holding both would have run
  // roughly seven minutes over its planned 11.
  const unmeasured = suite.filter((spec) => table.minutes[spec] === undefined);
  if (unmeasured.length > 0) {
    process.stderr.write(
      `e2e-affected: ${unmeasured.length} spec file(s) have no measured duration and were packed at the median - ` +
        `shard balance is a guess for them. Refresh with \`npm run record:e2e-durations\`.\n` +
        `  ${unmeasured.join('\n  ')}\n`,
    );
  }

  // WHAT EACH SHARD IS PREDICTED TO COST IN WALL CLOCK, and whether that fits the job's cap.
  //
  // The table measures TEST time; a runner also checks out, installs, starts Playwright and
  // boots a dev server. Until 2026-09-04 nothing carried that second term, so the packer aimed
  // nine bins at 11.1 table-minutes each, called it comfortable against a 20-minute cap, and two
  // shards of the first run under it were killed at exactly that cap - each carrying 9.8 measured
  // minutes behind a ten-minute `npm ci`. `predictShardMinutes` applies the measured overhead, so
  // the plan states the number it is betting on rather than implying one.
  //
  // An over-cap plan is a WARNING and not a refusal: a shard that might run out of clock still
  // tests more than a shard that never starts. But it is said out loud, in the plan job's own
  // log and as a run annotation, because the alternative is what the last fortnight was - the
  // gate discovering it one cancelled run at a time, with every downstream instrument reading a
  // verdict that was never reached.
  const predicted = shardSpecs.map((bin) => Number(predictShardMinutes(minutesFor(bin, table), table).toFixed(1)));
  // The line is the cap MINUS the variance margin, not the cap itself. The same shard index
  // varied by 2-3 minutes run to run over the 26 green runs to 2026-09-04 with nothing wrong, so
  // a prediction that only just clears 20 is a shard that fails on an ordinary bad day - and a
  // warning that waits for the average to fail is a warning that arrives after the cancellations.
  const limit = SHARD_CAP_MINUTES - SHARD_SAFETY_MINUTES;
  const overCap = predicted.filter((m) => m > limit).length;
  if (overCap > 0) {
    process.stderr.write(
      `e2e-affected: ${overCap} of ${predicted.length} shard(s) are predicted at more than ${limit} min ` +
        `(worst ${Math.max(...predicted)}), which leaves less than the ${SHARD_SAFETY_MINUTES}-minute variance margin ` +
        `under the ${SHARD_CAP_MINUTES}-minute job cap. Either the per-job overhead has grown - re-measure with ` +
        '`npm run record:e2e-durations` - or the plan selects more than the change needs (docs/TEST_SELECTION.md).\n',
    );
  }

  process.stdout.write(
    `${JSON.stringify({ mode: effectiveMode, specs: mode === 'full' ? specs : suite, catalog, shards, shardSpecs, predicted, overCap, unmeasured, quarantined, base, changed })}\n`,
  );
}

/**
 * EVERY FLAG THIS CLI ACTS ON, and the one line of help each gets.
 *
 * The list is the contract `parseArgs` enforces. Adding a flag to `main` without adding it here
 * makes the CLI refuse its own callers, which is a loud failure on the first run - the direction
 * this whole file is supposed to fail in.
 */
const KNOWN_FLAGS = new Map([
  ['--all', 'the whole suite and the catalog gate, with no diff at all'],
  ['--focus', 'collapse a core/unmapped escalation to the sprint focus set'],
  ['--no-focus', 'force the honest full escalation even with E2E_SPRINT_FOCUS=1'],
  ['--integration', 'move the base to the FORK POINT, covering both sides of a merge of main'],
  ['--no-integration', 'force the plain branch-only diff, never the fork point'],
  ['--json', 'print the plan as one JSON object and run nothing (implies --list)'],
  ['--list', 'print the plan and run nothing'],
  ['--files', 'classify the given PATHS instead of a git diff - no ref, no repository state'],
  ['--help', 'print this and exit'],
]);

/** The usage text, generated from KNOWN_FLAGS so it cannot drift from what is accepted. */
function usage() {
  const rows = [...KNOWN_FLAGS].map(([f, why]) => `  ${f.padEnd(18)}${why}`);
  return [
    'usage: node scripts/e2e-affected.mjs [<base-ref>] [flags]',
    '       node scripts/e2e-affected.mjs --files <path> [<path>...] [flags]',
    '',
    'With no base ref the diff is against the merge-base with main, plus the working tree.',
    '--files maps PATHS through the same `// covers:` index a diff would, with no git call at',
    'all - for planning before any branch exists (the orchestrator collision pass).',
    '',
    ...rows,
  ].join('\n');
}

/**
 * PARSE THE ARGUMENTS, AND REFUSE THE ONES WE DO NOT UNDERSTAND.
 *
 * This used to accept anything: unrecognised flags were filtered out by `startsWith('--')` and
 * then never looked at again. That is the most expensive fail-open in the repository, because
 * the flags people mistype are the plan-only ones. `--print` is not `--list`, so `listOnly`
 * stayed false, and a command whose author expected a printed plan instead spawned
 * `npx playwright test` with NO spec arguments - which is not "no tests", it is all 1179 of
 * them - plus the 25-minute catalog gate. It happened twice in one day, once beside another
 * session's live run on a laptop where one browser job per machine is the standing rule
 * (`root/enqueue-browser-driving-work-rather-than`). A typo must not be able to start the most
 * expensive thing this repository can do.
 *
 * Single-dash arguments are flags too, so `-h` is a named error rather than being taken as a
 * base ref and handed to git (no git ref may begin with `-`). A SECOND positional is refused
 * for the same reason the first unknown flag is: the old code silently used the first and
 * dropped the rest, so `e2e-affected <old> <new>` planned from a base its author had corrected.
 *
 * `--files` changes what the positionals MEAN, not the git ref rule above: with it present they
 * are PATHS to classify (one or more, no upper bound - the orchestrator hands it a whole row's
 * `TOUCHES`), and the ref mode's "at most one" limit does not apply. Without `--files`, ref mode
 * is exactly as it was.
 *
 * Pure and exported so the refusal is testable without a git repository or a Playwright install.
 *
 * @param {string[]} args  process.argv.slice(2)
 * @returns {{ ok: true, flags: Set<string>, base: string|undefined, files?: string[] }
 *          | { ok: false, message: string, help: boolean }}
 */
export function parseArgs(args) {
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f));
  if (unknown.length > 0) {
    return {
      ok: false,
      help: false,
      message: [
        `e2e-affected: unrecognised ${unknown.length === 1 ? 'flag' : 'flags'}: ${unknown.join(', ')}`,
        'Refusing to run. An ignored flag here means running the FULL suite by accident.',
        '',
        usage(),
      ].join('\n'),
    };
  }
  if (flags.includes('--help')) return { ok: false, help: true, message: usage() };
  if (flags.includes('--files')) {
    if (positional.length === 0) {
      return {
        ok: false,
        help: false,
        message: [
          'e2e-affected: --files needs at least one path.',
          '',
          usage(),
        ].join('\n'),
      };
    }
    return { ok: true, flags: new Set(flags), base: undefined, files: positional };
  }
  if (positional.length > 1) {
    return {
      ok: false,
      help: false,
      message: [
        `e2e-affected: expected at most one base ref, got ${positional.length}: ${positional.join(', ')}`,
        'Refusing to run rather than silently planning from the first one.',
        '',
        usage(),
      ].join('\n'),
    };
  }
  return { ok: true, flags: new Set(flags), base: positional[0] };
}

/**
 * THE NARRATION a classified plan gets printed with - shared between a live diff (about to run
 * what it names) and `--files` (only asking what a diff WOULD say for that same file list). One
 * function so the two cannot drift into describing an identical `planFor` result differently,
 * which a first draft of `--files` already did once by copying the checks without the words:
 * `hypothetical` is the one thing they say differently, because `--files` never runs anything.
 *
 * @param {(...a: unknown[]) => void} log
 * @param {ReturnType<typeof planFor>} plan
 * @param {{ count: number, noun: string, hypothetical: boolean }} opts  `count` and `noun` name
 *   the input list ("N changed files" for a diff, "N path(s)" for `--files`).
 */
function narratePlan(log, { mode, specs: plan, catalog: catalogAffected, configured, unmapped, focusApplied, copyOnly = [] }, { count, noun, hypothetical, catalogHere = true }) {
  if (copyOnly.length > 0) {
    log(`e2e-affected: ${copyOnly.length} file(s) changed only wording or class styling - planned by the specs that name what changed (scripts/e2e-affected-copy.mjs):`);
    for (const f of copyOnly) log('  -', f);
  }
  // Printed before mode 'none' returns: a change confined to hosted Pro's wire contract or to
  // e2e/configured/ leaves this gate with nothing to run, and that verdict on its own reads as
  // "covered" when the covering suite is the one that never ran.
  if (configured) {
    log('e2e-affected: this change touches behaviour only a CONFIGURED deployment has - run `npm run test:e2e:live:queued` (needs .env + a throwaway test account; not runnable in CI).');
  }
  if (unmapped.length > 0) {
    log(`e2e-affected: no mapping for these files (falling back to the ${focusApplied ? 'SPRINT FOCUS set' : 'full suite'}):`);
    for (const f of unmapped) log('  -', f);
  }
  if (focusApplied) {
    log(`e2e-affected: SPRINT FOCUS - a core/unmapped ${hypothetical ? 'path' : 'change'} would run the full suite (${specFilesOnDisk().length} files); the plan is the ${plan.length}-spec student-critical set instead (npm run test:e2e:focus; nightly still runs everything).`);
  }
  if (mode === 'full') {
    log(
      hypothetical
        ? `e2e-affected: core/unmapped path(s) detected - the FULL suite would run (${count} path(s)).`
        : `e2e-affected: core/unmapped change detected - the plan is the FULL suite (${count} changed files).`,
    );
  } else if (mode === 'none') {
    log(
      hypothetical
        ? 'e2e-affected: these paths touch nothing the offline e2e suite covers.'
        : 'e2e-affected: changes touch nothing the offline e2e suite covers - nothing to run.',
    );
  } else if (plan.length > 0) {
    log(`e2e-affected: ${count} ${noun} -> ${plan.length} spec files:`);
    for (const s of plan) log('  -', s);
  }
  if (catalogAffected) {
    log(
      hypothetical
        ? 'e2e-affected: catalog/bench-affecting path detected - would also run npm run test:e2e:catalog.'
        : catalogHere
          ? 'e2e-affected: catalog/bench-affecting change detected - will also run npm run test:e2e:catalog.'
          : 'e2e-affected: catalog/bench-affecting change detected - the catalog gate runs on GitHub Actions; here, run the battery `node scripts/catalog-affected.mjs` prints.',
    );
  }
}

/** Everything the CLI does: resolve the diff, classify it, report it, and run what it named. */
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    // stderr, never stdout: with --json stdout is a data channel, and CI captures it into a
    // shell variable. An empty capture plus a non-zero exit fails the step, which is the
    // verdict we want; a usage message on stdout would be parsed as a plan.
    (parsed.help ? console.log : console.error)(parsed.message);
    return parsed.help ? 0 : 2;
  }
  // The parsed flags, asked directly. Rebuilding an argv array here just to call `.includes` on
  // it would leave a second, looser copy of "was this flag given" beside the one `parseArgs`
  // has already validated - and the looser copy is the one that would drift.
  const has = (flag) => parsed.flags.has(flag);
  // SPRINT FOCUS (docs/GOALS_ARCHIVE.md "Student release", scripts/e2e-lists.mjs): while the sprint
  // runs, a CORE/unmapped escalation runs the student-critical focus set instead of the full
  // suite. Opt-in via env so nothing changes for a checkout that has not set it; --no-focus
  // forces the honest full escalation for a one-off. Mapped subsets are NOT intersected - they
  // are already small and precisely targeted, and intersecting would run zero relevant specs
  // for a paused-area fix. The nightly still runs everything.
  // `--focus` is the same switch as the env var, spelled so an npm script can carry it: Windows
  // runs package scripts through cmd.exe, where the posix `VAR=1 cmd` prefix is a syntax error,
  // so the env-only form could never be baked into `npm run` and every local run had to remember
  // it by hand. It could not, which is why a core change on this laptop kept escalating to the
  // full 103-file suite while CI - where ci.yml does set the env - ran the 34-file focus set.
  const sprintFocus =
    (process.env.E2E_SPRINT_FOCUS === '1' || has('--focus')) && !has('--no-focus');
  // --json prints the plan as one machine-readable object and runs nothing, which is how CI
  // decides between "skip the suite", "run these specs" and "run everything". It implies
  // --list, and it silences the human commentary: in this mode stdout is a data channel and a
  // stray progress line would corrupt it.
  const asJson = has('--json');
  const listOnly = asJson || has('--list');
  const baseArg = parsed.base;
  const log = asJson ? () => {} : console.log;

  // THE POPULATION THIS PLANNER SELECTS FROM. The plan itself is allowed to be empty - a change
  // touching nothing e2e covers honestly plans `mode: none` - but the suite on disk is not. If
  // `specFilesOnDisk` ever stopped resolving, every plan would collapse to `mode: none` and every
  // run would report green having run nothing, so the size of the suite is what gets said out
  // loud, on every path including --json: `measured` writes to stderr precisely because ci.yml
  // captures this script's stdout whole and hands it to `JSON.parse`.
  measured(specFilesOnDisk().length, 'e2e spec files on disk');

  // --files: classify PATHS through the SAME index `planFor` uses for a diff, with no git call at
  // all. This is the orchestrator's collision pass: it needs to know which specs a row's
  // `TOUCHES` shares with another row BEFORE either branch exists, so there is no ref to diff yet
  // and `changedFilesSince` would have nothing to ask git. The narration below is `narratePlan`,
  // the same function ref mode calls further down, so this cannot drift into describing an
  // identical `planFor` result differently.
  if (has('--files')) {
    const changed = [...new Set(parsed.files)].map((f) => f.replace(/\\/g, '/'));
    const plan = planFor(changed, { sprintFocus, specsOnDisk: specFilesOnDisk() });
    narratePlan(log, plan, { count: changed.length, noun: 'path(s)', hypothetical: true });
    if (asJson) {
      emitJson({ mode: plan.mode, specs: plan.specs, catalog: plan.catalog, base: null, changedFiles: changed });
      return 0;
    }
    // --files answers a planning question, not "run this now": it has no branch to run Playwright
    // against, so unlike ref mode it does not fall through into `runPlan` when --list is absent.
    return 0;
  }

  // --all is "the whole suite, with no diff at all" - what `main` and an unusable diff base both
  // want. It lived as a hand-written `{"mode":"full",...}` literal inside ci.yml, which meant the
  // two paths that run the MOST tests were the two the tested code never saw, and neither could
  // be given a shard count without duplicating the arithmetic in YAML. Sprint focus deliberately
  // does not apply: this is the honest full escalation, which is the point of asking for it.
  if (has('--all')) {
    if (asJson) {
      emitJson({ mode: 'full', specs: [], catalog: true, base: null, changedFiles: null });
      return 0;
    }
    log('e2e-affected: --all - the FULL suite and the catalog gate, with no diff.');
    if (listOnly) return 0;
    const { refusal } = localRunPolicy({ mode: 'full', catalog: true }, { ci: onCi() });
    if (refusal) {
      console.error(refusal);
      return 2;
    }
    const { status, runs } = runPlan({ mode: 'full', specs: [], catalog: true }, ({ args: a }) =>
      spawnSync('npx', a, { stdio: 'inherit', shell: true, windowsHide: true }).status,
    );
    log(summariseRuns(runs, status));
    return status;
  }

  // INTEGRATION MODE. `--integration` asks the question a post-merge run has to ask - "does the
  // COMBINED state hold" - by moving the base back to the fork point (see `integrationBase`).
  // It is also taken automatically when HEAD is itself a merge that brought main in, because
  // that is precisely the moment someone is about to push an unverified combination and the
  // ceremony of remembering a flag is what fails. `--no-integration` forces the plain
  // branch-only diff for a one-off.
  //
  // A BASE ARGUMENT AND `--integration` COMPOSE, and that is what CI needs. Passing a base used
  // to switch integration off entirely ("it was asked for"), which was right for a person naming
  // a ref by hand and wrong for the automated caller: ci.yml passes `github.event.before`, so on
  // a merge commit the plan diffed the pre-merge branch tip against the merge and saw only the
  // files MAIN had brought in. Measured over the last 120 merge-of-main commits in this
  // repository, 71 of them (59%) would have been planned differently from the fork point: 17
  // skipped the catalog calibration gate the combined tree needed, and 8 skipped E2E altogether
  // with `mode: none` - a green verdict on a combination nothing had run. The fork point is
  // always an ancestor of the push base, so preferring it fails toward running MORE, which is
  // the direction every other fallback in this file fails in. Without the flag the old rule
  // stands untouched: a bare `e2e-affected <ref>` still means exactly that ref.
  const wantsIntegration = !has('--no-integration');
  const askedForIntegration = has('--integration');
  const integration =
    wantsIntegration && (askedForIntegration || (!baseArg && headIsMainMerge())) ? integrationBase() : null;
  const base = integration ?? baseArg ?? branchBase();
  if (integration) {
    log(
      `e2e-affected: INTEGRATION base ${base.slice(0, 8)} - this branch has taken main in, so the plan covers BOTH sides' changes since the fork, not just the branch's.`,
    );
  }
  const changed = changedFilesSince(base);

  if (changed.length === 0) {
    if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changedFiles: [] });
    log('e2e-affected: no changes vs', base, '- nothing to run.');
    return 0;
  }

  const planResult = planFor(changed, { sprintFocus, specsOnDisk: specFilesOnDisk(), ...copyContext(base, changed) });
  const { mode, specs: plan, catalog: catalogAffected } = planResult;
  const full = mode === 'full';

  // A change confined to hosted Pro's wire contract or to e2e/configured/ leaves this gate with
  // nothing to run, so the 'none' verdict below has to be printed BEFORE it returns, or it reads
  // as "covered" when the covering suite is the one that never ran; `mode === 'none'` always
  // means `catalogAffected` is false (see `planFor`), so returning here early loses no message
  // `narratePlan` would otherwise have printed.
  if (asJson && mode === 'none') {
    emitJson({ mode: 'none', specs: [], catalog: false, base, changedFiles: changed });
    return 0;
  }
  const here = localRunPolicy(planResult, { ci: onCi() });
  narratePlan(log, planResult, { count: changed.length, noun: 'changed files', hypothetical: false, catalogHere: here.catalog });
  if (mode === 'none') return 0;

  if (asJson) {
    // `mode` is only ever none/subset/full; the catalog gate rides alongside as its own flag,
    // because a catalog-only change needs that gate and no feature spec at all - and that case
    // is exactly why the empty plan must report 'none' rather than 'subset'. An empty spec list
    // handed to Playwright is not "no tests", it is EVERY test, so a mislabelled subset would
    // quietly run the whole suite.
    emitJson({ mode, specs: plan, catalog: catalogAffected, base, changedFiles: changed });
    return 0;
  }

  // Locally, a quarantined spec leaves a SUBSET the same way it leaves the shards: a known flake
  // must not stand between a person and a verdict on their change - unless the change edits that
  // spec, which is the fix. A full run passes Playwright no file list and so still includes it,
  // which is fine at a laptop - the point of the split is what the GATE blocks on, and nothing
  // local is a gate. Said before `--list` returns, so a listing is the run it describes.
  const local = full ? { mode, specs: plan } : effectivePlan({ mode, blocking: splitQuarantined(plan, quarantineOnDisk(), { changed }).blocking });
  if (!full && local.specs.length < plan.length) {
    log(`e2e-affected: skipping ${plan.length - local.specs.length} quarantined spec(s) (e2e/quarantine.json): ${plan.filter((s) => !local.specs.includes(s)).join(', ')}`);
  }
  if (listOnly) return 0;
  if (here.refusal) {
    console.error(here.refusal);
    return 2;
  }

  const { status, runs } = runPlan(
    { ...local, catalog: here.catalog },
    ({ args }) => spawnSync('npx', args, { stdio: 'inherit', shell: true, windowsHide: true }).status,
  );
  if (runs.length > 1 || status !== 0) log(summariseRuns(runs, status));
  return status;
}

if (isEntrypoint) process.exit(main());
