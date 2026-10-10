# Traced e2e selection: a measured spec map beside the curated one

Status: AGREED - the owner's task of 2026-10-10 (stop real breakages landing green because a
spec's hand-written file list missed a dependency).

## Why

Pull request and merge-queue CI run only the e2e specs whose `// covers:` headers match the
changed files (`scripts/e2e-affected.mjs`). The headers are curated, so a dependency nobody listed
is a change that lands green and turns `main` red. #927 did exactly that on 2026-10-10: it changed
`src/templates/importedDesign/svg.ts`, which `e2e/editor-fidelity-trim.spec.ts` runs through its
SVG drop, and the spec's header did not list it. The pull request's plan (run 38013662731) never
selected the spec; the full run on `main` after landing (run 38015497259) failed it, and #947 fixed
the baseline and hand-added the missing header line.

Of the four main runs named as selection misses, only that one was (evidence/run-triage.md). The
other three were flakes: a timing race in `layout.spec.ts` that passed on full runs between the
failures and was fixed in the spec, a `.gitignore`-only landing whose shard hit the job cap, and a
port collision in a CLI unit test.

## Goal

What each spec really executes is measured every night and joins the curated headers in selection,
so an unlisted dependency is selected without anybody having to know about it.

## Non-goals

- Replacing the curated headers. They still carry what the browser trace cannot see: files a spec
  reads from Node, the dev server's own handlers, pages opened in a context of a spec's own.
- Narrowing any plan. The trace only adds specs or escalates; it never makes a file look mapped.
- Tracing pull request runs. Only the nightly full run records.

## Key decisions

1. **Executed, not loaded.** The app loads most of `src/` eagerly (three specs loaded 629 to 1239 of
   1498 files, and `layout.spec.ts` loaded `svg.ts`), so a load map selects nearly everything. V8
   binary function coverage records which modules had a function run; `svg.ts` ran in exactly the
   two specs that import SVGs.
2. **No spec edits.** A trace-only `e2e/tsconfig.trace.json` maps the specs' `@playwright/test`
   import to `e2e/_trace.ts`, an auto fixture. Runs without `NOACG_E2E_TRACE` are unchanged.
3. **A night is regenerated, never merged.** The report job merges the shard traces with the
   committed map (a spec that did not finish keeps its previous entry too) and lands it through one
   bot branch, `bot/e2e-traced`, force-pushed each night and queued like the quarantine's branches.
4. **Fail toward running more.** A missing, unreadable or over-age map (`MAX_AGE_DAYS`) escalates
   every file that would have consulted it, through the existing escalation (the focus set under
   sprint focus). A file most of the suite executes (`BROAD_SHARE`) escalates like `CORE`.

## Acceptance criteria

### AC-1: Each shard of the nightly records, per spec, the source files that executed

The nightly's shard jobs upload `nightly-trace-<n>` with a per-spec file list and whether the spec
finished, and the test time is not measurably longer.

### AC-2: The nightly produces the traced map and proposes it through the merge queue

The report job uploads `e2e-traced-map`; on a scheduled or `main` run it opens or updates the
`bot/e2e-traced` pull request with the regenerated map, stamped and queued. A branch dispatch
builds the map without proposing it.

### AC-3: The planner unions the map with the curated headers

`planFor` adds the specs the map names for a changed file to those its headers name, and the plan
says which specs tracing added.

### AC-4: A missing or stale map escalates and is never skipped

With no map, an unreadable one, or one older than `MAX_AGE_DAYS`, every file that would have
consulted it escalates, and the plan names the reason and the files.

### AC-5: The traced map selects the spec #927 broke

Planning #927's changed files with the curated headers as they were at #927 and the traced map
from a whole-suite nightly selects `editor-fidelity-trim.spec.ts`; without the map it does not.
