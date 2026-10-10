# AC-3 and AC-4: the planner unions the map, and an untrusted map escalates

## Unit tests

`node --test scripts/e2e-traced.test.mjs scripts/e2e-affected.test.mjs` on 2026-10-10: 88 pass,
0 fail. The traced-map tests that pin these criteria:

- AC-3: `the traced map adds the spec a covers header missed - the #927 shape` (the union, and
  `plan.traced` naming what tracing added); `a traced spec that is no longer on disk is not
  planned`; `a file only the map knows still escalates as unmapped`; `a broad file keeps its covers
  selection and is named, or escalates like core when BROAD_ESCALATES says so`.
- AC-4: `a stale, missing or unreadable map escalates every file that would have asked it` (full
  without sprint focus, the focus set with it, an ignored doc never asks); `a missing or unreadable
  map file is a problem, never an empty map`; `a map is trusted only when it is the right version,
  dated and younger than the limit`; `CENTRAL source never consults the map`.
- The existing CLI tests run against a fresh empty map (`NOACG_E2E_TRACED_MAP`), so they keep
  pinning the curated behaviour whatever the committed map's age.

## The CLI, by hand

With `scripts/e2e-traced.json` absent (before it was committed):

    $ node scripts/e2e-affected.mjs --list --files src/templates/importedDesign/svg.ts
    e2e-affected: no traced spec map at scripts/e2e-traced.json - so these escalate instead of trusting it (scripts/e2e-traced.mjs):
      - src/templates/importedDesign/svg.ts
    e2e-affected: core/unmapped path(s) detected - the FULL suite would run (1 path(s)).

    $ node scripts/e2e-affected.mjs --json --files src/templates/importedDesign/svg.ts
    ... "mode":"full" ... "traced":{"added":[],"problem":"no traced spec map at scripts/e2e-traced.json","escalated":["src/templates/importedDesign/svg.ts"],"broad":[]}

ci.yml's plan step turns `traced.problem` into a run annotation, so a CI run that grew says why.

With the map committed:

    $ node scripts/e2e-affected.mjs --list --files src/templates/importedDesign/svg.ts
    e2e-affected: the traced map added 9 spec(s) the covers headers do not name: dashboard-operator-walk.spec.ts, editor-drawing-task.spec.ts, editor-out.spec.ts, import-graphic.spec.ts, import-svg-centred-title.spec.ts, import-svg-credits.spec.ts, motion-presets.spec.ts, score-tracker-moments.spec.ts, svg-examples.spec.ts
    e2e-affected: 1 path(s) -> 70 spec files:

(Nine, not ten: today's header for editor-fidelity-trim already names `svg.ts`, added by hand after
the incident.)
