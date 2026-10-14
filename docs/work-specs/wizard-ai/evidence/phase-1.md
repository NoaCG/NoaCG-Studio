# Phase A1: baseline on the existing step (AC-1, AC-16, AC-10)

Recorded by the A1 builder (branch `claude/plan-wizard-ai-p1-build`, pull request #1164),
2026-10-14, Windows 10. Before = `origin/main` at `1e9ff904b`. No file under `src/` changed.

## What changed

| File | What it does |
|---|---|
| `e2e/ai.spec.ts` | the runtime skip is gone (the `beforeEach` no longer calls `enableAdvancedMode`), so 31 skipped tests run again; the nine that finished in the old editor finish through the export door (eight) or the production door (one) and read the saved library record; two late-completion tests added (35 in the file) |
| `e2e/ai-lite.spec.ts` | the runtime skip is gone; the Lite create finishes through the export door and reads the library record and the export window |
| `scripts/file-budgets/components-wizard-steps-AiStep.json` | the step's budget, 2,152 lines |
| `scripts/check-file-budgets.mjs` | its `// guards:` line names the step, so `gates run --changed` runs the gate when the step changes |

What each revived test kept, and what replaced its ending (setup and the final assertion only,
parent D9):

| Test | Old ending (old editor) | New ending |
|---|---|---|
| harness off, one raw call | topbar name | export door, library record `Test Slate` |
| describe-it: prompt to project | topbar name, `#f0` in the editor preview | production door: wizard closed, production page, record `Test Slate` with field `f0`, the production's rundown holds it |
| finish: reaches Finish | `wz-finish-editor` visible | `wz-finish-production-go` visible (the editor door no longer exists) |
| three grounded alternatives, pick remembered | topbar name | export door, record `Grounded Two`; the preference assertions after it unchanged |
| refining keeps the others | topbar name | export door, record `Grounded Two Warmer`; preferences unchanged |
| image attached to a refinement | topbar name, store assets | export door, record name and its assets hold `images/badge.png` |
| brand colour from a logo | topbar name, store CSS | export door, record name and its CSS hold `#1e9e8a` |
| flourish polish, contract-breaking polish | topbar name, store CSS | export door, record name and CSS |
| the conversation travels and survives a reload | the editor's AI panel, before and after a reload | export door, the record's `aiThread` holds both sides, then `settleDurableWrites`, reload, `awaitDurableReady`, the record still holds it |
| Lite creates one graphic | editor door, topbar, store facts, the editor's Export | export door, `accepted` outcome, the record's name, fields, timeline and no generation id, the export window's SPX target and six targets |

The other 21 revived tests never reached the editor; they were skipped only by the `beforeEach`
and run unchanged. The two arrival tests that were live keep their bodies; only their
`{ tag: NO_EDITOR }` went, with the constant, since nothing reads it.

## Late completion (spec 1.3 A1), decided on evidence

Two tests, raw path (harness off), the first answer at once and the second held on a deferred
route until the test releases it, `aiRunRecords()` polled until the second run is recorded:

- **Home while busy.** The late answer reaches the shell after the wizard closed. Home's
  + New graphic asks (the walk held a result), Continue reopens the AI step, which mounts again:
  the past generation its thread held before Home is gone and the result card shows the late `Late Slate`, not the
  `Test Slate` that stood when the reader left. A fresh open (Discard) shows no result card and
  Next is disabled.
- **✕ while busy.** ✕ rewinds to the front page and clears the result, but the late answer then
  sets it again: picking Create with AI shows `Late Slate` with Next enabled. Recorded, not
  endorsed: issue #1165.

Both passed on CI as predicted from the code (`run` resolves on an unmounted step and calls
`showChange`, which calls `onResult`; the shell's setter is live while it renders null, and its
`onAi` entry does not clear `aiResult`).

## Runs

CI run 38520085781 on `5f05909c2` (the plan selected exactly `ai-lite.spec.ts` and
`ai.spec.ts`): `Running 37 tests using 1 worker`, `37 passed (4.8m)`, nothing skipped. Build,
Factory gates and CI gate passed. After the review's fixes (an `ai-past` count of 1 before the
reader leaves, the saved HTML's sample text, the Lite read guarded), CI run 38521655425 on
`507033857`: `Running 44 tests using 1 worker`, `44 passed (5.4m)` (the plan also ran
`wizard-brand.spec.ts`, which `main` had changed since this branch's base; the branch then merged
`main` at `25218ca58`).

The other specs of section 5's A1 row (`ai-tiers`, `ai-depth`, `ai-consent`, `pro`,
`wizard-finish`) are not touched by this change and import none of the edited files; they passed
in main's full run 38516567471 on `1e9ff904b`, this branch's base.

Local (Node only; the browser queue's 4 GB floor refused Playwright, 0.9 GB free):

```
node scripts/check-file-budgets.mjs
[measured] 2 budgeted files
ok      src/components/wizard/CreationWizard.tsx  2516 of 2601 lines  (scripts/file-budgets/components-wizard-CreationWizard.json)
ok      src/components/wizard/steps/AiStep.tsx  2152 of 2152 lines  (scripts/file-budgets/components-wizard-steps-AiStep.json)
node --test scripts/check-file-budgets.test.mjs        6 pass, 0 fail
node --test scripts/ai-lite-bench.test.mjs             28 pass, 0 fail
node scripts/gates.mjs run --changed origin/main       all ok (file-budgets among them), 13 tests pass
node scripts/gates.mjs audit                           OK, 45 checks and 235 test files
node scripts/check-e2e-protection.mjs --changed origin/main   OK, 2 changed spec files
eslint --max-warnings 0 on the three changed code files       clean
```

## Measurements

Plan widths (`node scripts/e2e-affected.mjs --list --files <path>`, 233 spec files on disk):

| Path | Specs |
|---|---|
| `src/components/wizard/steps/AiStep.tsx` | 44 |
| `src/components/wizard/steps/ai/MoreControlPanel.tsx` | 44 |
| `src/ai/creation.ts` (A2's module, not yet on disk) | 15 |
| `src/ai/lite/pipeline.ts` | 22 |

The step's 44 is one more than the spec's 43: the traced map adds `wizard-draft-guard.spec.ts`.

Capacity (`e2e-capacity`, measured in the CI run above): `ai.spec.ts` 0.22 -> 4.41 table-minutes,
`ai-lite.spec.ts` 0.00 -> 0.24; the suite 169.4 -> 173.8 of 180.6, 96.3%. Over the 95% line, so
the spec carries a budget exception for both files (expires 2026-11-13) and issue #1166 records
that the suite stays over the line for everyone once the durations refresh lands.

## Limitations

- No local browser run: every browser result above is CI's.
- `ai-more-control`, `adapt-first`, `design-rules-product` and `image-purpose` still skip at
  runtime (#800); they are outside A1's row.
- The late-completion tests cover Home and ✕; the header's + New graphic mid-walk (a guarded
  rewind with the draft kept) was not run.
