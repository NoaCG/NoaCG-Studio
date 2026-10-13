# Phase S1b: characterisation of passing behaviour and the gate (AC-1, AC-10)

Recorded by the S1b builder (branch `claude/plan-wizard-shell-p2-build`, pull request #1134),
2026-10-13, Windows 10. Before = `origin/main` at `13b326773`.

## What was added

| File | What it pins |
|---|---|
| `scripts/check-file-budgets.mjs` | the size gate (D8): fails the build when a budgeted file is longer than its budget |
| `scripts/check-file-budgets.test.mjs` | the gate's line count, both budget layouts, and its four refusals |
| `scripts/file-budgets/components-wizard-CreationWizard.json` | the shell's budget, 2,601 lines |
| `package.json` | `check:file-budgets` |
| `scripts/wizard-draft.test.mjs` | `draft/core.ts`, `draft/template.ts`, `draft/format.ts` (15 tests) |
| `scripts/wizard-kit-plan.test.mjs` | `kitPlan.ts` (10 tests) |
| `e2e/wizard-shell.spec.ts` | +3: a reload on each template step URL; a deep link equals the Browse pick; the production's brand preselected |
| `e2e/wizard-draft-guard.spec.ts` | +2: Continue keeps step, filters and answers; a fresh open holds nothing in any Entry walk |
| `e2e/wizard-kit.spec.ts` | +1: a built kit is held and Continue returns to its hub |
| `e2e/wizard-finish.spec.ts` | +6: held production write (order, no move); refused pool (retry named, no move); refused export save (window opens); second press during a held save; nothing to walk back from after export; a plain `#/new` discards the walk |
| `e2e/template-deep-link.spec.ts`, `e2e/route-transition-flash.spec.ts`, `e2e/mark-legibility.spec.ts` | headers only: `// covers:` names `src/components/wizard/CreationWizard.tsx` |

## Node tests

`node --test scripts/wizard-kit-plan.test.mjs scripts/check-file-budgets.test.mjs`:

```
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

`node --test scripts/wizard-draft.test.mjs` (through the job queue, since it opens Chromium; j-4391):

```
✔ buildDraftTemplate: the Finish name, the font stack, declared overrides only, a different exit (1404ms)
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

Mutation checks, each reverted at once (`git status --short src` empty after): `commitKitGraphic`
keeping the old build, `kitLookPatch` carrying `steps`, and `brandMarkFor` admitting a picture
slot each turned exactly one test red.

Whether `draft/core.ts` loads through rolldown as spec section 5.1 expected: not as it stands. It
reads `../import`, whose index also re-exports the import steps' components, and bundling those
fails twice in Node (a stylesheet import, then `ReferenceError: DOMParser is not defined` at module
load). Both tests therefore resolve `../import` from inside the wizard to `import/draft.ts`, the
only file the draft uses. With that, `draft.ts`, `draft/core.ts` and `kitPlan.ts` load in about
90 ms each. Building any catalog design still needs a DOM: all 528 designs fail
`variant.create()` in bare Node on `DOMParser`, as `scripts/catalog-emit.mjs` measured for 504.

## Journeys

CI, pull request #1134, run 38465569556 on `921f962ec` (the journeys commit):
the affected plan ran all seven spec files in 11 shards. Every new journey passed except a third
draft-guard journey, "Continue keeps a dropped template file". Its first failure was a selector
(the import card shows the file name, not the template's description); with that corrected
(run 38467355045 on `c1869e028`) it failed for real: after Continue the import card is not on
screen at all. It was removed and is the second S1c item in the phase notes. No existing
assertion changed. Where each passing journey ran (line numbers of run 38465569556):

| Shard job | Journeys |
|---|---|
| 115531473173 | draft-guard 148, 194; kit 652 |
| 115531473215 | finish 562, 582, 606, 619, 648, 662 |
| 115531473726 | shell 424, 443, 462 |
| 115531473343 | mark-legibility (4 tests, one skipped as before) |
| 115531473589 | route-transition-flash (6), template-deep-link (2) |

Measured by CI's Combined E2E report (`e2e-capacity.mjs --report`):

| Spec | Table | Measured | Delta |
|---|---:|---:|---:|
| `wizard-draft-guard.spec.ts` | 0.37 | 0.76 | +0.39 |
| `wizard-finish.spec.ts` | 1.61 | 2.17 | +0.56 |
| `wizard-kit.spec.ts` | 2.41 | 2.60 | +0.20 |
| `wizard-shell.spec.ts` | 0.93 | 0.81 | -0.12 |
| `template-deep-link.spec.ts` | 0.17 | 0.19 | +0.01 |
| `route-transition-flash.spec.ts` | 0.67 | 0.59 | -0.08 |
| `mark-legibility.spec.ts` | 0.25 | 0.16 | -0.09 |

`170.3 of 180.6 table-minutes (94%) ... this change adds 1.2 minute(s)`: under the 95% line, so
no `## Budget exceptions` entry.

The final tip's run, 38469151149 on `0a2d55b9c` (after the file-mode journey was removed and
`origin/main` merged): every E2E shard passed, `CI gate` passed, and all 12 journeys are in the
shard logs (shell 424, 443, 462 in job 115548366839; draft-guard 148, 170 in 115548366859; kit
652 in 115548366861; finish 562 to 662 in 115548366878). Its measured line: `169.0 of 180.6
table-minutes (94%) ... this change adds 0.4 minute(s)` (wizard-shell +0.29, wizard-draft-guard
+0.14, the rest at or under their table values in that run).

Local run through the browser queue (`npm run queue -- "npm run test:e2e -- <the seven specs>"`,
jobs j-4387, j-4389, j-4394, j-4396): never started. The queue held it from 22:10 to 01:00
Helsinki time with 0.7 to 2.8 GB free against its 4.0 GB floor, while other sessions' work used
the machine. The CI runs above are the journeys' evidence; see Limitations.

## The gate

```
$ node scripts/check-file-budgets.mjs
[measured] 1 budgeted files
ok      src/components/wizard/CreationWizard.tsx  2485 of 2601 lines  (scripts/file-budgets/components-wizard-CreationWizard.json)
```

With the budget set to 2,484 it printed `OVER ... 2485 of 2484 lines` and exited 1 (reverted).
`node scripts/gates.mjs audit`: `OK - 45 check(s) and 232 test file(s) declare where they run and
what they guard.` `node scripts/gates.mjs run --changed origin/main`: green (13 gates reached,
5 test files, 48 tests).

## Baseline: plan widths and table-minutes

`node scripts/e2e-affected.mjs --list --files <path>`; table-minutes from `planMinutes` over the
same plan (`scripts/e2e-affected.mjs`).

| Changed path | Specs before | Table-minutes before | Specs after | Table-minutes after |
|---|---:|---:|---:|---:|
| `src/components/wizard/CreationWizard.tsx` | 50 | 52.0 | 53 | 53.1 |
| `src/components/wizard/draft/core.ts` | 40 | 36.3 | 40 | 36.3 |
| `src/components/wizard/draft/format.ts` | 40 | 36.3 | 40 | 36.3 |
| `src/components/wizard/draft/template.ts` | 103 | 106.1 | 103 | 106.1 |
| `src/components/wizard/kitPlan.ts` | 40 | 36.3 | 40 | 36.3 |

The shell's plan gained `mark-legibility`, `route-transition-flash` and `template-deep-link`.
`node --test scripts/e2e-affected.test.mjs`: 81 of 81 pass.

Capacity, `node scripts/e2e-capacity.mjs --changed origin/main`: 94.0% (169.7 of 180.6
table-minutes, of which about 0.3 is a local probe file that was never committed); the estimate
counts an edited spec at its table value, so it reports +0.00 for all seven. The minutes the new
journeys add are measured below. `node scripts/check-e2e-protection.mjs --changed origin/main`:
`OK - 7 changed spec file(s), none removes protection without an entry.`

The Node test list the later phases run: `scripts/wizard-draft.test.mjs` (factory),
`scripts/wizard-kit-plan.test.mjs` (build), `scripts/check-file-budgets.test.mjs` (build).

AC-9: `git diff --name-only origin/main...HEAD -- src` prints nothing.

## Limitations

- The build of a real design is proved in Chromium, not in Node: one test case in
  `wizard-draft.test.mjs`, on the first lower third that declares the label font token and not the
  body one. The kit tests build fixture designs only.
- Both Node tests load the draft through a resolver that skips the import steps' components. A
  change that makes `draft/core.ts` need something from `import/index.ts` beyond
  `import/draft.ts` would load here and fail in the app, or the reverse.
- "A reload on every mode's step URL" is covered for the template walk only; the other walks are
  the S1c item in the phase notes, read from the code.
- The held-write journeys hold the IndexedDB transaction open by keeping it busy; they prove the
  order the shell awaits its writes in, not the browser's own commit timing.
- The second-press journey records one ordering (both presses inside one held library save). A
  press that lands between two later writes may end differently; S1c decides the guard.
- The measured minutes moved between the two CI runs (+1.2 and +0.4 minutes); neither crossed
  the 95% line.
- The journeys never ran on this machine: the browser queue did not admit a browser job all
  evening (above). They ran twice on CI's Linux runners. The `wizard-draft` Chromium case did run
  locally through the queue (j-4391), when a smaller job fitted under the floor.
- The non-template reload item in the phase notes is read from the code; the probe that would
  have confirmed it was in the local run that never started.
