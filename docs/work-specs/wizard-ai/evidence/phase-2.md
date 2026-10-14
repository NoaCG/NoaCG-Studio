# Phase A2: the tier dispatch in `src/ai/creation.ts` (AC-2, AC-3, AC-9, AC-13 for A2's rows)

Recorded by the A2 builder (branch `claude/plan-wizard-ai-p2-build`, pull request #1178),
2026-10-14, Windows 10. Before = `origin/main` at `9fd10aed3`. Candidate = the branch head the
queue lands. Assessment A reviewed `440aabc62`; the `/check` pass after it (the test's tier
header, a separate `originals` array, the busy labels inside `runCreation`'s cases, one bundle in
the test) was re-assessed as a delta at `14f40e1e4`: PASS; its note that the simplify pass had
loosened the validator text guard was taken, and the guard is back as first written.

## What changed

| File | What it does |
|---|---|
| `src/ai/creation.ts` (new, 310 lines) | `creationRoute` (section 4's "Selected when", with the three refusals), `runCreation(input, io)` (the five routes; `io` = `provider`, `validate`, `structuralCheck`, `probeMark`, `onProgress`), `creationError` (the step's error wording), `screenChange` (`validateTemplate` + `mergeSafety`, the display screen); the Pro branch moved as written into `runPro` |
| `src/components/wizard/steps/AiStep.tsx` | still builds `productionSpxValidator` + `withSpecChecks` and passes it as `io.validate`; `generate` calls the module and sets the screen state from the result; `run` and the inline dispatch are gone; `showChange` calls `screenChange`. 2,152 to 1,940 lines |
| `scripts/ai-creation.test.mjs` (new) | 19 tests, `// gate: factory`, `// needs: browser`, `// guards: src/ai/creation.ts`, loaded through rolldown |
| `scripts/ai-lite-bench.test.mjs` | the validator test checks the new boundary; its guards name `creation.ts` and the step |

## Section 4 rows and their Node tests

| Row | Late answer | Thrown answer | After the caller abandoned | Options pinned |
|---|---|---|---|---|
| Convert | yes | yes (`LiteUnsupportedError` gets "Try:") | yes | `{validate, structuralCheck, onProgress}`, the imported template as source |
| Lite | yes | yes | yes | the same plus `profile: 'lite'`, `io.provider('lite')` |
| Raw | yes | yes | yes | `{onProgress}` only; the screen tested separately (no verdict -> `validateTemplate`'s, plus the safety finding; a carried verdict kept; the imported source's own construct not attributed) |
| Three directions | yes | yes (plain message) | yes | `{validate, structuralCheck, onProgress}`; first passing selected, else 0, empty list; the seeded busy label |
| Pro | reservation held | design call refused: reported `failed`/`generation_failed`, error reaches the caller | two held reservations released out of order, each report on its own generation id | finished run on a Chromium page: package of two named members, the step validator run on both, stages in order, reported `usable` |

Route selection and its precedence (convert, refusals, pro, lite, directions, raw) are one test.
Identity is asserted, not shape: the options carry the step's own `validate`, `structuralCheck`
and `onProgress` functions.

**Mutation, red where it should be:** twelve hand mutants of `creation.ts` (raw forwarding the
validator, Lite without its profile, Lite on the default provider, directions without the
structural check, directions starting on 0, the suggestion on directions, the screen without
safety, the screen without its source, Pro without its failed report, Pro skipping the step
validator, Pro dropping the package, the refusal order) each turned the suite red; the file was
restored after each.

## Runs (local)

- `node --test scripts/ai-creation.test.mjs`: 19 passed (about 1 s, the Chromium page 0.3 s).
- `node --test scripts/ai-lite-bench.test.mjs`: 28 passed.
- `node scripts/gates.mjs run --changed origin/main`: exit 0 (contract freshness and citations,
  client secrets, gate coverage, file budgets "2 budgeted files" ok, client-neutral, copy,
  preview serialization, ai-gateway, landed-ref, the three hit test files).
- `npx tsc --noEmit`, `npx eslint --max-warnings 0` on the four files, `npm run depcruise`
  ("no dependency violations", config unchanged): all clean.
- `git diff --name-only origin/main...HEAD -- src`: `src/ai/creation.ts`,
  `src/components/wizard/steps/AiStep.tsx` (AC-9).
- Not run locally: Playwright. Free RAM was about 1.6 GB against the queue's 4 GB floor; the
  eleven covering and sixteen driving specs run on the pull request's CI (AC-2).

## Assessment A

A fresh read-only `wave-row-deciding` session with the `/so` brief reviewed `440aabc62`:
FAIL on one blocking finding, everything else passing. The finding: the test launches Chromium
but declared no tier, so it would run in the Build job, which has no browser. Fixed by declaring
`// gate: factory` and `// needs: browser` (the `wizard-draft.test.mjs` pattern); `gates list
--changed origin/main --gate factory` now hits it and the Factory job runs it. Its other
findings: behaviour equivalent, with four internal differences none observable (`setError(null)`
before the busy label in the same batch; a single result's stage cleared by `stagePick(change,
[change])` after `showChange` instead of before; `generate` awaited, every caller `void`s it and
it cannot reject; the Pro WeakMaps set after the run, which differs only on a Pro failure after the
design call, unreachable with `proMode` false); D3 holds; AC-13 met for A2's rows; the Pro branch
is a move (IO substitutions, the WeakMap writes lifted out, the return shape); AC-3 and AC-9 hold.

## The `/check` pass

Review (delegated, scope matched): no regression from the move. Fixed: a single result's list is
now copied into `originals`, so the two state slots are separate arrays as before the move.
Reported, not changed (behaviour existing before A2, AC-12): a late result after the step was left
(#1165); every displayed result screened against an unrelated import (#1179); a Pro package
member whose composition throws skips the outcome report (Pro unreachable). Not taken: lowering
the budget (A3's, per the row), a route-keyed input union (A3 can shape it with refine's inputs).
Simplify (delegated, four angles): each route's busy label now opens its own `case` (one switch
instead of two), `onProgress: setBusy`, `Promise.withResolvers` for the test's deferreds, one
rolldown build emitted twice, and a validator text guard that no longer depends on field order.
Not taken: `withBundledPage` reuse (needs an options argument in `catalog-emit.mjs`, outside the
row). After it: 19 of 19 and 28 of 28 pass, the twelve mutants all red again, tsc and eslint clean.

## Mapping (parent section 6)

`node scripts/e2e-affected.mjs --list --files src/ai/creation.ts` selects 15 specs, among them
`ai`, `ai-lite`, `ai-tiers`, `ai-depth`, `pro` and `adapt-first`, which hold the dispatch's
behaviour. Five of the eleven specs whose covers name the step are not selected by a change to
`creation.ts` alone: `ai-more-control`, `design-rules-product`, `image-purpose` (skipped at
runtime, #800), `configured/pro-wizard` (needs credentials) and `ai-consent` (its live test
generates, but asserts the absence of a notice). No covers header was edited here: A4 rewrites
all eleven and adds `src/ai/creation.ts` where a spec drives Generate.
