# Create with AI step: a thin step over a Node-tested run module

Child of `docs/work-specs/wizard-structure/spec.md` (the parent; its sections are cited as
"parent section N"). Baseline: main `dba61b8e1`, 2026-10-13; every line number below is of that
revision and, unless a path is given, of `src/components/wizard/steps/AiStep.tsx`. Authority:
owner, 2026-10-13 (see `work.json`). Plan for `/plan-run wizard-ai`: five sequential phases, each
built by one session and checked by another on `main`, runnable beside `wizard-shell` on
disjoint files (parent section 8). Inherits AC-1, AC-2, AC-3, AC-9, AC-10, AC-11, AC-12 and
AC-15 from the parent as written there; AC-13 and AC-14 are this plan's own.

## Verdict

Extract the step's React-free orchestration into `src/ai/creation.ts` behind injected IO,
quarantine the Pro-only code without deleting it, and bring the step's run chain back under
test first. Nothing the user sees changes: the coding-agent route, the one composer, the three
directions, refine, undo, fix, the settings sheet, the result card and the Finish hand-off stay
as they are. What changes is that the tier dispatch, refinement and chassis rebuild run and are
tested in Node with a stub provider and deferred answers, and that the 2,152-line step loses the
roughly 400 lines that cannot run today.

Not promised: a decision on which engine survives (issue #771, the owner's), or that the step
becomes small; the markup (999 lines) stays where it is.

Biggest risk: a pending generation that completes after the reader left or reset the walk. The
step stays mounted hidden on Finish (`CreationWizard.tsx:1964-1968`) and the shell renders null
when closed, so today a late answer still runs `showChange` and `onResult`
(`CreationWizard.tsx:1977`); A1 pins what happens, and the module's contract keeps it.

## Why

`AiStep.tsx` is 2,152 lines (68 commits in 90 days; 299 lines on 2026-07-08): imports 1-101 (51
statements, 64 symbols from 22 `src/ai/` paths, one through `src/ai/index.ts`, which exports only
`getAiProvider`), props 102-140, React-free helpers 141-268, hooks and handlers 287-1153 (29
`useState`, 9 `useEffect`, 6 refs, no `useCallback`), markup 1154-2152. About 415 lines are
Pro-only and cannot run: `proMode` is always false (363) because the door is closed pending
#771 and the branches were deliberately left intact (346-357). About 600 to 650 lines have no
JSX and no hook: `generate` 854-1068 (five tier branches), `run` 718-747, `applyRefinement`
1092-1114, `rebuildOnChassis` 769-793, `sendChat` 576-595, `contextFor` 801-822, the tier
derivations 332-402 and three policy effects 375-382, 449-461, 464-469; none of it needs
`WizardDraft` (the step's props do not take the draft). The `AIProvider` interface
(`src/ai/provider.ts`) is used for five calls; `brainstorm`, the Pro flow (`pro/session`,
`pro/language/*`, `pro/brief`), `lite/pipeline.assembleGroundedTemplate` and `lite/client`
bypass it, and seven Pro functions have no caller but this file. The run chain (create, three
directions, apply, refine, undo, fix, thread, Finish) has no live offline test: 31 of the 33
tests in `e2e/ai.spec.ts` skip in `beforeEach` (213-231) because they finish through the retired
editor door (`finishInEditor`, 205-208; issue #800).

## Goal

The step becomes a thin component over `src/ai/creation.ts`: it owns the composer, the
thread, uploads, settings and the result card; the module owns which provider call runs for
which tier with which checks, how a result is refined or rebuilt, and what a result carries back.
Every moved rule is pinned by a test that existed or was written before the move. The Pro code
compiles and is reachable by the two edits the code names, from a file of its own.

## Non-goals

Deciding the engine or deleting Pro code (#771); changing `src/ai/lite/pipeline.ts`,
`src/ai/pro/language/pipeline.ts` or any provider; the editor's AI panel
(`src/components/AIPromptPanel.tsx`, the other consumer of `getAiProvider`); the shell
(`CreationWizard.tsx`, the parent's); copy, test ids, the settings sheet's behaviour, the
coding-agent route, consent; the `MoreControlPanel` beyond lifting one import.

## 1. Decisions

### 1.1 Owner decisions (2026-10-13)

1. **Both tracks** (parent 1.1): this plan is authorised beside the shell plan.
2. **Pro code is preserved, not deleted.** The branches are quarantined and keep compiling.

### 1.2 Derived decisions (revertible; each says how)

- **D1 The run module lives in `src/ai/creation.ts`.** It is harness orchestration
  (`docs/ARCHITECTURE.md` section 4: prompt, harness, provider work lives in `ai/`), it needs
  `GenerateContext`, `DesignSpec`, `AiTemplateChange`, `SpxValidator` and
  `StructuralIntentChecker` from `src/ai/`, `ImportedTemplateResult` and `AssetFile` from
  `model/`, and nothing from `components/`; `ai -> validation` is an existing edge, so no table
  change. Plan width for a change there is 15 to 21 specs against 43 for the step, and the
  harness benches can drive the same tier switch. The injection shape already exists:
  `GenerateOptions.validate/structuralCheck/onProgress` (`src/ai/provider.ts:85-111`) and
  `generateProGraphic(input, route, { session, validate, onStage })`
  (`src/ai/pro/language/pipeline.ts:98`). Revert: move the file under `wizard/ai/run.ts`.
- **D2 The IO shape.** `runCreation(input, io)` takes `{ provider: (profile?) => AIProvider,
  validate, structuralCheck, probeMark, onProgress }` (A2 dropped the planned `now`: no route
  reads a clock); the step constructs `validate` as
  today (`productionSpxValidator` at 657-660 wrapped by `withSpecChecks` at 661) and passes it.
  Revert: inline.
- **D3 Validation is preserved per route, as today.** The routes that forward `validate` keep
  forwarding it: the Lite `generate` (1028-1035, with `profile: 'lite'`), `generateAlternatives`
  (1044-1052, with `structuralCheck`), `convertImport` (871-889, through `run`), `modify`
  (1092-1114, with the spec when refining at spec level). The raw route (1037-1043, harness off)
  passes `onProgress` only and its output is screened afterwards in `showChange` (663-683:
  `validation ?? validateTemplate(template)` merged through `mergeSafety`). The guard is a Node
  test of `creation.ts` at these boundaries: forwarding per route, the raw screen, and the
  step still constructing the validator. `scripts/ai-lite-bench.test.mjs:83-87`, which asserts
  the text `productionSpxValidator(` in `AiStep.tsx`, is updated in the same pull request to the
  boundary that holds the guarantee after the move; the test follows the architecture. The
  literal wording of `wizard/inject-harness-validator-every-provider-call` against the raw route
  is recorded for A5's rule pass, not changed here. Revert: none, the behaviour is unchanged.
- **D4 Pro quarantine.** The Pro generate branch (890-1027) becomes the `'pro'` tier of
  `creation.ts` that the step never selects; the Pro markup (1743-1824, 1935-2021, 1336-1342,
  2106-2111) becomes `wizard/ai/ProPanel.tsx` rendered behind the existing `proMode &&`; the Pro
  state and effects (305-330, 338-345, 462-469, 486-497) move with it. The disabled implementation
  is preserved and compiles; reopening it is what the comment at 352-357 says (restore
  `proOffered` and give `tier` a branch to `'pro'`) plus the server's eligibility, not one flag.
  The dollar cost at 2017 (it contradicts `wizard/show-money-result-card-prices-codebase`) and
  the stale records `contracts/records/ai/2026-09-07-*` (they cite `TIER_OPTIONS` and
  `proOffered` at lines that no longer exist) are noted for A5. Revert: inline the panel.
- **D5 The step-to-step edge goes.** `steps/ai/MoreControlPanel.tsx:39` imports `pickerHex`
  from `../StyleStep`; A3 lifts it to a leaf (`model/cssVars` if it is a pure colour helper,
  else `wizard/colour.ts`) so the AI folder never imports a template step. Revert: keep it.
- **D6 Folder move by shim.** A4 moves `AiStep.tsx` and `steps/ai/*` under
  `src/components/wizard/ai/` and leaves `steps/AiStep.tsx` as a one-line re-export, so the shell's
  lazy import (`CreationWizard.tsx:100`) is untouched by this track; the parent's S7 retargets it
  and deletes the shim. The move is needed so that Codex loads the rules scoped
  `src/components/wizard/steps/ai/**` for the step itself once they are rescoped to
  `wizard/ai/**` (Claude loads by path and is unaffected). Covers headers (11 specs name
  `steps/{AiStep.tsx,ai/**}`), `contracts/index.md:523`, `scripts/e2e-affected.test.mjs:261` and
  the cochange prefixes (`scripts/metrics/cochange.mjs:32` already lists `wizard/ai/`) are updated
  in the same pull request. Revert: `git mv` back.
- **D7 No new ARCHITECTURE edge, no new seam promise.** `src/ai/index.ts` keeps exporting
  `getAiProvider`; `creation.ts` is a named module the step imports directly, as the step imports
  the pipelines today. Widening the index is a later decision when a second consumer exists.
- **D8 Markers and rule edits only in A4 and A5**, in the order parent section 8 fixes.
- **D9 Never weaken, defects apart:** parent D9 and D10 apply unchanged.

### 1.3 Suspected existing behaviour to pin (A1 decides on evidence)

- **A1 Late completion.** A routed `/api/ai/generate` answer released after the reader pressed
  the close control, Home, or "+ New graphic" (held walk) while `busy`: today `run` resolves on a
  still-mounted component and calls `showChange`, which calls `onResult`; the discard telemetry
  (`CreationWizard.tsx:721-728`) fires on close only for a result that existed at close. A1
  records what the shell holds afterwards (`aiResult` after a fresh open; the thread) as today's
  behaviour; any change is its own fix.
- **A2 The dead doors.** The AI package doors (`CreationWizard.tsx:1242-1266`) and the cost line
  (2017) are unreachable; they move with the quarantine and are not behaviour.

## 2. Module boundaries

| Module | Responsibility | Owns | Runtime imports / injected IO | Interface | Benefit |
|---|---|---|---|---|---|
| `src/ai/creation.ts` | the tier dispatch, refinement and chassis rebuild | nothing | `ai/provider` (types), `ai/lite/pipeline` (`assembleGroundedTemplate`), `ai/pro/*` (the quarantined tier), `ai/spec/*`, `ai/brainstorm`, `model/*` types / `provider`, `validate`, `structuralCheck`, `probeMark`, `onProgress` | `creationRoute(state)`, `runCreation(input, io)`, `screenChange(change)` (a convert's result carries `convertedFrom`, issue #1179), `creationError(error, route)`, `refineResult({ result, instruction, level, spec, context, lite, convertedFrom }, io)`, `fixInstruction(validation)`, `rebuildOnChassis(current, variantId, context, io)` (`io` narrowed to `validate` and `onProgress`), `conversationOf(talk)`, `chat(conversation, text)` (past the provider, no `io`); results are `AiTemplateChange` values with their metadata (section 4) | about 600 React-free lines leave the component; Node tests with a stub provider and deferred answers; the benches reuse the dispatch |
| `src/components/wizard/ai/AiStep.tsx` (A4; before that `steps/AiStep.tsx`) | the step's screen state and markup | prompt, thread, uploads, settings, result card state, busy, error | react; `creation.ts`; `validation/*` for the validator it constructs | today's ten props, unchanged | the component holds screen state and rendering only |
| `src/components/wizard/ai/ProPanel.tsx` | the Pro markup, quarantined | nothing | react | today's values as props | the live file loses the markup that cannot render; nothing is deleted |
| `scripts/ai-creation.test.mjs` | the Node guard | nothing | rolldown `load()` as `scripts/field-auto-map.test.mjs:30-40` | `// guards: src/ai/creation.ts` | the first test of the run chain outside Playwright |

Not made: a widened `src/ai/index.ts`; a generic "AI session" object; a change to the Lite or
Pro pipelines; a store for the thread.

## 3. Safety net

### 3.1 Environments

Offline Playwright with routed provider answers, the pattern `e2e/ai.spec.ts` already uses
(`page.route('/api/ai/generate', ...)` at 238-241 answering `toolUse('emit_template', ...)`); a
held answer is a route that resolves on a deferred promise. Node tests load `creation.ts`
through rolldown with a stub `provider` whose calls return deferred promises.

### 3.2 Inventory (reconciled against `origin/main` on 2026-10-13)

Live: `ai.spec.ts` 2 of 33 (arrival on the coding-agent route, a template dropped before the
choice), `ai-tiers` (8: settings sheet, route card, install copy, own-key providers, credential
naming, own-account route), `ai-depth` (2: example prompts, brainstorm chat), `ai-consent` (1 of
2), `pro` (2: the tier is absent when it cannot run). Skipped at runtime (#800): `ai.spec.ts`
31 of 33, `ai-lite` 2, `ai-more-control` 3, `adapt-first` 3, `design-rules-product` 10,
`image-purpose` 5 of 6. Configured only: `configured/pro-wizard.spec.ts` (skips without
credentials). Sixteen specs drive the step through `e2e/_ai-step.ts chooseNoacgAgent`. Node:
`scripts/ai-lite-bench.test.mjs:83-87` reads `AiStep.tsx` as text.

### 3.3 What A1 brings back and adds

| Behaviour (step code) | Proved today | A1 |
|---|---|---|
| Create: one raw call with the harness off (1037-1043) | ai.spec 233 (skipped) | revived through the export door: the routed tool list and the result card's verdict |
| Create: three directions, pass or fail marks, first passing selected (1044-1067) | ai.spec (skipped) | revived; `data-*` of the direction cards and the verdict class |
| Pick a direction, refine in place, undo (750-754, 1092-1114, 1144-1150) | ai.spec (skipped) | revived |
| Fix the findings (1132-1141) | ai.spec (skipped) | revived |
| Thread, archive, restore a past generation (563-574, 1071-1081) | ai.spec (skipped) | revived |
| Convert an imported template (871-889) | ai.spec (skipped) | revived |
| Lite status, allowance, unsupported brief (1028-1035, `LiteUnsupportedError`) | ai-lite (skipped) | revived |
| Finish from the AI result through export and the production door | ai.spec (skipped, editor door) | revived through `wz-finish-export` and the production door; the editor door assertion is replaced by the library record's name |
| Late completion (1.3 A1) | none | new: hold the routed answer, close the wizard, release; assert what a fresh open shows |

Revivals rewrite setup and the final assertion only (export window or library record instead of
the old editor's topbar), never the behaviour assertions in between (parent D9); each revived
section is a `## Test maintenance` entry if a section is retired instead.

## 4. The run contract (reconciled against the code)

| Route | Selected when (332-402, 854-1068) | Provider call and options | Result shape | Progress and errors |
|---|---|---|---|---|
| Convert | an imported template, confirmed, own key (871-889) | `convertImport(brief, template, context, { validate, structuralCheck, onProgress })` through `run` | one `AiTemplateChange`; replaces the directions; `clearStagedSelection` | `busy` from `onProgress`; errors to `error`; `LiteUnsupportedError.suggestedBrief` appended |
| Lite | `liteActive` (1028-1035) | `getAiProvider('lite').generate(brief, context, { validate, structuralCheck, onProgress, profile: 'lite' })` through `run`; Lite status reloaded after | as Convert | as Convert |
| Raw | own key, harness off (1037-1043) | `generateRaw(brief, context, { onProgress })` through `run`; the output is screened in `showChange` with `validateTemplate` + `mergeSafety` | as Convert | as Convert |
| Three directions | own key, harness on (1044-1067) | `generateAlternatives(brief, context, { validate, structuralCheck, onProgress })` | the list as `alternatives` and `originals`; first passing selected; `stagePick`; `recordSpend` | `busy` set by the step; errors to `error` |
| Pro | never (`proMode` false) | `generateProGraphic` and the package loop (890-1027) | kept as written, quarantined | kept |
| Refine, fix | a result stands (1092-1114) | `getAiProvider(lite ? 'lite' : undefined).modify(instruction, result, context, { validate, onProgress, profile?, spec? })` | replaces the selected direction in place; `originals` untouched; `stagePick`; `recordSpend` | as Convert |
| Rebuild on another design | a shortlist entry picked (769-793) | no model call: `assembleGroundedTemplate` with the same spec | replaces the selected direction; no spend | the busy line "Rebuilding on that design…"; a pick of the design it already has, or a result with no spec, returns `null` (no change); errors show their plain message |
| Talk | the composer in talk mode (576-595) | `brainstorm(turns)` (bypasses the provider today; stays so) | a talk turn | `chatBusy` |

What every result carries back to the shell (663-683, `CreationWizard.tsx:1977`): the template,
the merged validation verdict, the spec, the generation id, the path and, for a Pro result, the
package read from the WeakMap (497). The shell stores it as `AiResultState`
(`CreationWizard.tsx:208-221`) and `applyAiProject` (1276-1302) commits the staged pick,
records the Lite outcome and sets spec and thread on the store. Late completion: parent of 1.3
A1; the module returns the result to whoever awaits it and never touches React state, so the
component decides what to do with a result that arrives after a reset, pinned by A1's test.
Every row becomes a Node test in A2 with a stub provider whose call answers late, throws, or
answers after the caller abandoned the run.

## 5. Verification matrix

Every phase runs `/check`, `npm run depcruise`, `node scripts/gates.mjs run --changed
origin/main`, AC-9's scope fence and the Node files it adds; local targeted specs through the
browser queue (`node scripts/e2e-runs.mjs --wait && npx playwright test <files>`); broad
affected suites on GitHub Actions. Assessment A as parent section 6.

| Phase | Local targeted specs | Node | Assessment | Measurement |
|---|---|---|---|---|
| A1 | ai, ai-tiers, ai-depth, ai-consent, ai-lite, pro, wizard-finish | ai-lite-bench | none | budget 2,152 installed; plan widths recorded |
| A2 | the eleven specs whose covers name the step, the sixteen that drive it | ai-creation (every section 4 row, late and thrown answers), ai-lite-bench (updated) | A | none |
| A3 | ai, ai-tiers, pro, ai-more-control (revived if cheap) | ai-creation extended | none | budget lowered |
| A4 | the affected plan for the moved files | e2e-affected (pins updated) | none | plan widths, chain sizes after the marker |
| A5 | the affected plan | all of the above | none | chain sizes, recorded in `docs/metrics/<date>-wizard-ai.md` |

Evidence (`evidence/phase-<n>.md`) and revalidation as parent section 6.

## 6. Parallel execution rules

As parent section 8: this track writes only this spec and its `work.json`; owns
`steps/AiStep.tsx`, `steps/ai/*`, the future `wizard/ai/`, `src/ai/*`, `e2e/_ai-step.ts`,
`e2e/ai*.spec.ts`, `e2e/pro*.spec.ts`, `scripts/ai-lite-bench.test.mjs`,
`scripts/ai-creation.test.mjs`; never edits `CreationWizard.tsx` (the shim keeps the lazy import
valid); recompiles contracts only in A4 and A5, after the parent's S1a and before its S7; the
coordinator reads `wizard-shell`'s ledger before A4 and records a `stop` while S1a or S7 is open (launched, not landed); a shell run that has not started holds nothing.
`scripts/e2e-affected.test.mjs` is edited in A4 only; the budgets directory takes one JSON for
the step; `package.json` is not touched.

## 7. Execution settings and how the owner starts this plan

`/plan-run wizard-ai`, sequential, `wave-row` (Opus, high) builders, `wave-row-deciding` for
A2's assessment; the same preflight as parent section 9 with this spec's `work.json`; the start
template:

```
/plan-run wizard-ai until <date and time with UTC offset>
```

Continuation, expiry and the report follow the parent's section 10. This plan is never restarted
from A1.

## 8. Acceptance criteria

The parent's criteria this track inherits are declared here as headings of their own so the
ledger tracks them; their text is the parent's, with this track's observable named.

### AC-1: The prerequisites exist before any extraction
A1 (the revived run-chain tests, the late-completion test, the step's budget) is on `main`
before A2 lands.

### AC-2: Behaviour is identical at every phase
The eleven specs whose covers name the step and the sixteen that drive it pass at every phase
with unchanged assertions; the checker confirms the e2e diff changed selectors at most; no test
id, copy or settings behaviour changed.

### AC-3: Every new pure module runs in Node
`src/ai/creation.ts` has `scripts/ai-creation.test.mjs` with `// guards:`, loaded through
rolldown, taking browser IO through `io`; `npm run depcruise` passes with no config change.

### AC-9: Each phase stays inside its fence
`git diff --name-only origin/main...HEAD -- src` lists only the phase's allowed files; never
`CreationWizard.tsx`.

### AC-10: The size gate never rose
The step's budget was installed at 2,152, lowered by A3 and A4, and never raised.

### AC-11: Docs and rules follow the code inside the run
A5 wrote the metrics file, fixed the stale record citations, made the rule pass through
`npm run learn` and recompiled; A4 updated every covers header, pin and prefix it names.

### AC-12: Suspected behaviour was decided on evidence
Section 1.3's late-completion behaviour is pinned by A1's test; any change found during an
extraction landed as its own fix with its regression test.

### AC-15: Nothing visible changed
`ai-tiers`, `pro` and the two live `ai.spec.ts` arrival tests pass unchanged at every phase.

### AC-13: The run module runs in Node and holds its contract
`src/ai/creation.ts` has `scripts/ai-creation.test.mjs` with `// guards:`; every section 4 row
is tested with a stub provider answering late, throwing, and answering after the caller
abandoned the run; validation is forwarded per route exactly as section 4 says and the raw
route's screen is tested; `AiStep.tsx` still constructs the validator; `npm run depcruise`
passes with no config change; the step's eleven covering specs and the sixteen driving specs
pass unchanged.

### AC-14: The disabled Pro implementation is preserved
Every Pro function the step called is still called from the quarantined tier or panel; the
build type-checks with `proMode` false; a diff of the quarantined code against the original is
a move, not a rewrite; nothing under `src/ai/pro/` changed.

### AC-16: The run chain is live again
The `ai.spec.ts` sections of section 3.3 run and pass on the offline gate (no runtime skip), and
the late-completion test exists, before A2 lands.

## Phases

Each phase runs `/check` and the section 5 matrix and lands with `/queue-merge`; the builder
adds the next phase's notes under `## Phase notes`. Allowed `src` files are exactly those named.

1. **A1. Baseline on the existing step** (AC-1, AC-16, AC-10). Files: `e2e/ai.spec.ts`,
   `e2e/ai-lite.spec.ts`, `e2e/_ai-step.ts`, the budget JSON for the step, `evidence/*`. No
   `src/`. Revivals through the export door or the production door with routed answers; the
   late-completion case added; nothing else.
2. **A2. `src/ai/creation.ts`: the tier dispatch** (AC-2, AC-3, AC-9; AC-13 for the rows it
   moves: convert, Lite, raw, three directions and the unselectable Pro tier; the rest of AC-13
   is A3's). Files:
   `src/ai/creation.ts`, `src/components/wizard/steps/AiStep.tsx` (calls the module; constructs
   the validator), `scripts/ai-creation.test.mjs`, `scripts/ai-lite-bench.test.mjs` (the guard
   points at the new boundary). Temporary interface: `refine`, `rebuild` and `chat` stay in the
   step until A3.
3. **A3. Refine, rebuild and chat into the module; the Pro quarantine; the lifted import**
   (AC-2, AC-13 in full, AC-14, AC-10). Files: `src/ai/creation.ts`, `steps/AiStep.tsx`,
   `steps/ai/ProPanel.tsx`, `steps/ai/MoreControlPanel.tsx` (the `pickerHex` import), the leaf
   that receives `pickerHex` (`src/model/cssVars.ts` or `src/components/wizard/colour.ts`),
   `scripts/ai-creation.test.mjs`. Budget lowered.
4. **A4. Folder move** (AC-2, AC-9, AC-11). Never while the parent's S1a or S7 is open. Files: `git mv` of
   `steps/AiStep.tsx` and `steps/ai/*` to `src/components/wizard/ai/`, the one-line
   `steps/AiStep.tsx` re-export, `src/components/wizard/ai/AGENTS.md` (marker), the eleven
   covers headers, `scripts/e2e-affected.test.mjs`, `scripts/metrics/cochange.mjs` (the
   prefixes), the rule scopes `steps/ai/** -> ai/**` and `steps/AiStep.tsx -> ai/AiStep.tsx`
   through their rule files, the regenerated contracts. No logic change.
5. **A5. Close-out** (AC-11). Files: `docs/metrics/<date>-wizard-ai.md`, the stale records
   `contracts/records/ai/2026-09-07-*` (citations fixed), the rule pass through `npm run learn`
   (the validator rule's wording against the raw route; retirements the quarantine allows), the
   regenerated contracts, `evidence/*`. Lands before the parent's S7 when both tracks run at
   once; when S7 has already landed, A5 lands alone and the shim retarget stays a one-line
   leftover for the shell's next landing.

## What the plan can demonstrate, and what stays uncertain

Demonstrable: the run chain live on the offline gate again; every route's provider call and
options pinned in Node; the same results under late and thrown answers; the step's size under
a gate; the Pro code compiling from its own file. Uncertain: the engine decision (#771) and
whether the quarantined code ever returns; the hosted Pro route, which no offline test reaches.

## Readiness

Before A1: this spec and `work.json` on `main`, `work-spec.mjs status` clean, the "Runnable
plans" line present; `origin/main` CI green; the browser queue idle; `gh auth status` ok; no
open plan run on these files; the owner's window supplied. Before A4: no shell phase that recompiles contracts (S1a, S7) is open.

## Budget exceptions

- e2e/ai.spec.ts: 4.4 min, protects the Create with AI run chain (create raw and in three directions, pick, refine, undo, fix, thread, the Finish doors, late completion; AC-16), expires 2026-11-13
- e2e/ai-lite.spec.ts: 0.3 min, protects the Lite create, its allowance and the unsupported brief (AC-16), expires 2026-11-13

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found,
and the check's findings.

### A5 check on `main` (2026-10-14): PASS

The plan's last entry: every phase is built and checked.

- **Shas:** checked `main` at `65b64086a`, the merge of #1203. Its merge-group run 38558000847
  passed. `git diff 4d18e937a 65b64086a -- src` is the regenerated
  `src/components/wizard/ai/AGENTS.md` alone: no product code (AC-9).
- **Node checks (section 5's A5 row), run on `65b64086a`:** `ai-creation` 33 of 33,
  `ai-lite-bench` 28 of 28, `e2e-affected` 81 of 81; `check:contracts` OK (562 rules, 259
  generated files current); `check-file-budgets` OK, the step 1,659 of 1,659.
- **AC-10:** the budget JSON's history is 2,152 (A1), 1,660 (A3), 1,659 (A3 tidy), 1,659 renamed
  in A4; it never rose.
- **AC-11, the validator rule:** the new rule file carries `supersedes:` and a `learn`-format
  record, the old one is `retired` and kept, and the compiler reports every generated file
  current, so nothing compiled was hand-edited. The demand is unchanged: `runCreation`'s `raw`
  case passes only `onProgress` to `generateRaw`, and `screenChange` (`validateTemplate` through
  `mergeSafety`) screens it, pinned by `ai-creation`; the step still builds
  `productionSpxValidator` for the other routes.
- **AC-11, records and metrics:** each citation in the seven annotated records resolves at
  `65b64086a` (`AI_TIERS`, `const tier: AiTier` with the reopen comment above it, `useProTier`,
  the `pro` route's `generateProGraphic`, `CONVERSATION_TURNS` and `conversationOf`,
  `screenChange` and `showChange`, `AIPromptPanel`'s `mergeSafety`; no `TIER_OPTIONS` in
  `src`). One is indirect: `useProTier` reads `/api/ai/pro-status` through `loadProStatus` in
  `src/ai/pro/session.ts`. Reproduced in the metrics file: the chains (AI step 44,665, `steps/`
  42,338, `src/ai/` 32,535, and A5's +66 bytes) and the widths (`creation.ts` 19, the step 43).
- **D4's dollar line:** the record and the #771 comment are the right close. The card never
  renders while `proMode` is false, AC-14 requires the move, and A5's fence has no `src`;
  whoever reopens the Pro door removes the figure in that change.
- **Still open, carried from A5:** the four `src` comments naming old paths and the shim go with
  the shell's S7; `keepChassisZone` is unpinned; the AI step's chain is 3,705 bytes over 40,960.

### A5. Close-out (built 2026-10-14)

- **Check's findings (A4 check, main `15b26a6c9`): PASS.** Merge-group run 38552822347 green
  (562 tests), the AI counts equal to A3's; rule-id sets equal before and after; `check:contracts`
  OK; chain 52,023 -> 44,599; widths step 43, `creation.ts` 19; the size gate fails at 1,660 on
  the moved step. Carried into A5: stale old paths in `docs/AI_WIZARD_PLAN.md:13`,
  `docs/BRAND_PLAN.md:246`, `docs/PROMISE_AUDIT.md` and four `src` comments; the 2026-09-07 AI
  records citing `TIER_OPTIONS` / `proOffered`; section 2's signatures and section 4's rebuild
  progress; `keepChassisZone` unpinned; `UploadCard` shared with `steps/VideoStep.tsx`; chains
  over 40,960 (AI 44,599, `steps/` 42,338).
- **Shas:** previous verified `main` `15b26a6c9`; built on `claude/plan-wizard-ai-p5-build`; the
  merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge commit (the
  compiled contracts revert with it; `npm run check:contracts` confirms).
- **What landed** (`evidence/phase-5.md`): `docs/metrics/2026-10-14-wizard-ai.md`; the validator
  rule reworded through `npm run learn --supersedes` (new id
  `wizard/inject-harness-validator-every-harnessed-provider`, the old one retired); the Pro
  card's dollar line recorded on the money invariant's record; seven 2026-09-07 AI records given a
  dated note naming where the code is now; the three docs' paths; this spec's D2, section 2 and
  section 4 made true to the code.
- **Decisions** (each revertible as stated):
  - *The validator rule's demand is unchanged, only its wording.* The raw route never ran the
    injected validator; the rule now says the raw result is screened where it is shown. Revert:
    set the new rule `retired`, the old one `active`, recompile.
  - *The dollar line is the code's debt, not the rule's.* Allowing it would change what the
    invariant demands (an owner question), and removing it would break AC-14's move. It goes
    when the Pro door reopens; the record says so.
  - *No retirements.* The Pro rules guard preserved code (1.1, decision 2).
  - *Records keep their evidence.* A dated note is appended, the 2026-09-07 quotations are not
    rewritten, as the records' own "Quotation correction" entries do.
- **For the shell's S7 (this plan has no next phase):** S7 deletes the `steps/AiStep.tsx` shim
  and retargets `CreationWizard.tsx`'s lazy import; it should also fix the four comments naming
  old paths (`src/ai/creation.ts:5`, `src/model/aiThread.ts:2`, `src/model/cssVars.ts:21`,
  `src/styles/wizard-describe.css:200`) and decide whether `ai/UploadCard.tsx`, shared with
  `steps/VideoStep.tsx`, belongs in `wizard/`. Still open beyond this plan: `keepChassisZone`
  is not pinned by a test (A3 check's surviving mutant); the rebuild has no live e2e while
  `adapt-first` is skipped (#800); the AI step's chain is 3,705 bytes over the 40,960 target.
- **Traps:** rewording a rule renames it (the id comes from its words); the retired file stays so
  citations of the old id still resolve. `learn` with an existing rule's exact text and
  `--evidence` appends to that rule's record instead of writing a rule.

### A4 check on `main` (2026-10-14): PASS

- **Shas:** checked `main` at `15b26a6c9`, the merge of #1199 (`origin/main` had not moved).
- **Browser evidence (CI):** #1199's merge-group run 38552822347 ran `15b26a6c9` and passed,
  0 unexpected and 0 flaky of 562. Its merged report: `ai` 35, `ai-lite` 2, `ai-tiers` 8,
  `ai-depth` 2, `pro` 2, `ai-consent` 1 plus 1 skip, `wizard-finish` 22 plus 1,
  `ai-more-control` 3 skipped (#800): the A3 check's counts exactly. The e2e diff is the eleven
  covers headers and nothing else (AC-2). Production's deploy-verify passed on the same sha.
- **AC-9:** the moved files, diffed blob to blob against `15b26a6c9^1`, differ in relative
  imports only, plus two comments in the step naming `ProPanel.tsx` and `AgentRouteCard.tsx`;
  each new path resolves to the same module. The shim is `export { default } from
  '../ai/AiStep';`, and `CreationWizard.tsx:116`'s lazy import is unchanged and untouched.
  `steps/VideoStep.tsx`'s one line (`./ai/UploadCard` -> `../ai/UploadCard`) is outside the
  list but required by the move: accepted.
- **Rules (AC-11, D6):** 31 rule files changed, each a `scope:` line only, `steps/ai/` ->
  `ai/` and `steps/AiStep.tsx` -> `ai/AiStep.tsx`; 561 rule files before and after. The rule
  ids in every compiled `AGENTS.md` (442 entries, 428 distinct) and in `.claude/rules/*` (443)
  are the same multiset before and after: none lost, none duplicated. The 11 `.claude/rules`
  files are renames, each with its successor. `npm run check:contracts`: `OK - 561 rule(s),
  259 generated file(s) current`. `npm run rules -- src/components/wizard/ai/AiStep.tsx`
  lists the wizard AI rules from the folder's own contract (23 rules in `wizard/ai/AGENTS.md`).
- **Measurements reproduced:** chains (LF, 2 bytes per join) AI step 44,599 (was 2,863 +
  8,987 + 11,697 + 11,367 + 8,058 + 9,041 + 10 = 52,023), `steps/` 42,338, shell 34,920. Plan
  widths: the step 43, `ProPanel.tsx` 43, `UploadCard.tsx` 43, `creation.ts` 19, the shim 44
  (the traced-only `wizard-draft-guard`). Node: `e2e-affected` 81 of 81, `ai-lite-bench` 28 of
  28. Budget (AC-10): 1,659 before and after; a probe line in `ai/AiStep.tsx` makes the gate
  fail at `1660 of 1659`, the same line in the shim passes (not guarded). Probes reverted.
- **For A5:** besides the builder's list, `docs/AI_WIZARD_PLAN.md:13`, `docs/BRAND_PLAN.md:246`
  and `docs/PROMISE_AUDIT.md` still cite the old paths. Not checked: local `tsc` and
  `depcruise` (CI's Build and Factory gates passed on the sha).

### A4. Folder move (built 2026-10-14)

- **Check's findings (A3 check, main `9f89075c3`):** merge-group run 38545131904 green, the
  counts equal to the A2 check's; `ai-creation` 33 of 33 on CI and locally; AC-14 holds (17 Pro
  symbols used, a line-by-line move, `tsc` strict with `proMode` false); the pro-status request
  count unchanged; the adapt-first shortlist test passes with its skip removed; budget 1,659 of
  1,659; D5 holds. Carried: `StyleStep.tsx` was in A3's `src` diff (the unused `pickerHex`
  definition removed, within the row's intent); `keepChassisZone` is not pinned (a surviving
  mutant); rebuild has no live e2e while `adapt-first` is skipped (#800), though its shortlist
  test could be revived alone; stale spec text for A5: section 2's signatures, and section 4's
  rebuild progress "none" (it shows "Rebuilding on that design...").
- **Shas:** previous verified `main` `a5992ed97`; built on `claude/plan-wizard-ai-p4-build`; the
  merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge commit, then
  `npm run contracts:compile -- --prune` and commit what it changes.
- **What landed** (`evidence/phase-4.md`): the step and `steps/ai/*` (ProPanel included) under
  `src/components/wizard/ai/` by `git mv`, imports only; `steps/AiStep.tsx` a one-line
  re-export; the marker `wizard/ai/AGENTS.md` (23 rules) and its generated `.gitattributes`;
  `steps/ai/`'s generated pair deleted; 31 rule scopes rewritten (26 active, 5 retired) and the
  contracts recompiled; the eleven covers headers, the configured-flag pin, the budget JSON
  (renamed `components-wizard-ai-AiStep.json`, 1,659), the gate's and the bench's guards. The
  AI-step chain 52,023 -> 44,599 bytes, `steps/` 42,980 -> 42,338. Plan widths: the step 43,
  `creation.ts` 19.
- **Decisions** (each revertible as stated):
  - *Retired rules rescoped too.* The compiler refuses a scope matching no file, and the shim is
    not where the code is. Revert: none needed; scopes of retired rules load nothing.
  - *`steps/VideoStep.tsx` edited* (one import path; outside the row's list, the build needs it).
    Revert: with the move.
  - *`src/ai/creation.ts` added to five headers only* (`ai-consent`, `ai-more-control`,
    `design-rules-product`, `image-purpose`, `configured/pro-wizard`): `ai` and `ai-depth` already
    cover `src/ai/**`, which selects them for `creation.ts`; naming it there too is redundant.
    The Pro spec also names `ProPanel.tsx`, where A3 put the Pro markup. Revert: edit the headers.
  - *`e2e-traced.json` not hand-edited:* it is the nightly's output with its sha. Until the next
    nightly, the moved step's plan misses the traced-only `wizard-draft-guard.spec.ts` (43
    instead of 44); this pull request's own plan includes it through the shim's old path.
  - *The budget JSON renamed* to match its file, so the directory names what it budgets. Revert:
    `git mv` it back.
- **A5 must allow for:**
  - Comments still naming the old paths, outside A4's fence: `src/ai/creation.ts:5`,
    `src/model/aiThread.ts:2`, `src/model/cssVars.ts:21`, `src/styles/wizard-describe.css:200`.
    A5's file list has no `src`; fold them into the shell's S7 (which deletes the shim) or a
    one-line follow-up.
  - Rule texts and records citing paths: `contracts/records/ai/2026-09-07-*` (D4) still cite the
    old step; the rule pass reads the rules in `wizard/ai/AGENTS.md` now. Recompiling after any
    scope change renames `.claude/rules/*` files and can need `-- --prune`.
  - The chain targets after A4: the AI step 3,639 over 40,960, `steps/` 1,378, `import/` 1,500.
  - `ai/UploadCard.tsx` is shared: `steps/VideoStep.tsx` imports it across the folders, and an
    edit to it now loads the AI rules but not `steps/`'s video rules. D6 moves all of
    `steps/ai/*`; whether the card belongs in `wizard/` beside the other shared parts is the
    shell's call (S7) or a follow-up, not A5's.
  - The A3 check's carried items above (section 2 signatures, section 4 rebuild progress text,
    `keepChassisZone`, the adapt-first shortlist revival) are A5's or an issue's.
- **Traps:** a `git mv` of a whole folder would carry the generated pair into a folder the marker
  then fights; delete them first. `contracts:compile` refuses more than four deletions without
  `-- --prune`; the eleven are the renamed Claude rule files, each with a successor. A file
  `git rm --cached` and rewritten in place (the shim) shows as an add, so the move and the shim
  are separate commits to keep `git log --follow` on the step.

### A3 check on `main` (2026-10-14): PASS

- **Shas:** checked `main` at `9f89075c3`, the merge of #1189 (`origin/main` was `77d38d583`;
  only `docs.html`, `privacy.html` and `e2e/docs.spec.ts` changed since).
- **Browser evidence (CI):** #1189's merge-group run 38545131904 ran `9f89075c3` and passed. Its
  merged report: `ai` 35 passed (the two arrival tests among them), `ai-lite` 2, `ai-tiers` 8,
  `ai-depth` 2, `pro` 2, `ai-consent` 1 plus 1 skip, `wizard-finish` 22 plus 1,
  `ai-more-control` 3 skipped (#800): the A2 check's counts exactly. #1189's e2e diff is empty
  and `.dependency-cruiser.cjs` is unchanged (AC-2, AC-15).
- **The Node guard on CI:** Factory gates job 115789190207, `ai-creation` 33 of 33 (refine, fix,
  rebuild, talk and Pro rows `ok 17` to `ok 33`), 173 passed in the step. Locally: `ai-creation`
  33 of 33 with both Chromium cases, `ai-lite-bench` 28 of 28, `tsc --noEmit` (strict,
  `noUnusedLocals`) clean with `proMode` false, `npm run depcruise` no violations.
- **Local browser runs** (one worker, about 2 GB free): `pro` 2 of 2. A throwaway probe counted
  `/api/ai/pro-status` requests on opening Create with AI: 0 before the click and 2 after, both
  at `9f89075c3^1` and at `9f89075c3`, so `useProTier` keeps the request as it was. As a user:
  `adapt-first`'s shortlist test, run from a copy without its editor-door skip, passed on
  `9f89075c3` (another design picked, no model call, the card names it, validation passes, the
  brief's text in the preview). Probe files deleted, nothing committed.
- **AC-14:** each of the 17 runtime Pro symbols the step imported at `591213fca^1` is still used
  outside an import in `creation.ts`, `ProPanel.tsx` or the step. Every Pro line removed from
  the step, trimmed, appears in `ProPanel.tsx`, except the imports, the call sites now reading
  `proTier.*`, the `proMode &&` wrappers, two JSX comment braces and `spec.category` read as
  `category`, as the evidence says. `git diff 591213fca^1 9f89075c3 -- src/ai/pro/` is empty.
- **Mutation:** seven of mine in `creation.ts`, each restored: Lite refine without the profile,
  Lite refine on the default provider, rebuild dropping `...current`, rebuild keeping the old
  `variantId`, talk keeping the oldest turns, one busy label for refine and fix, talk dropping
  the conversation. Six went red on exactly their rows. `keepChassisZone: false` survived: the
  rebuild test does not pin that option (moved unchanged; a gap, not a regression).
- **Judgements:** the shipped signatures differ from section 2's table, but section 4 holds
  row by row: the same `modify` options, the result replacing in place, no spend on a rebuild,
  talk past the provider. Section 2's table (and section 4's "none" for rebuild progress: the
  rebuild showed "Rebuilding on that design…" before and still does) are stale text for A5.
  Refine, fix, rebuild and talk show the plain `e.message`; only the whole-result routes go
  through `creationError`. The no-op rebuild now reaches `finally`, harmless because the
  shortlist only renders when `busy` is null. `StyleStep.tsx` is outside the row's literal
  file list, but D5's lift cannot be done without removing the definition there, and only the
  unused definition went (AC-9 holds in intent). D5 holds: nothing under `src` imports
  `StyleStep` for `pickerHex`. Budget JSON 1,659, the step 1,659 lines (AC-10).
- **For A4:** the rebuild still has no live e2e while `adapt-first` stays skipped (#800); its
  shortlist test needs no editor and could be revived alone.

### A3. Refine, rebuild and talk in the module; the Pro quarantine (built 2026-10-14)

- **Check's findings (A2 check, main `591213fca`):** merge-group run 38536443430 green, the AI
  spec counts as before A2; e2e diff empty; `ai-creation` 19 of 19 in Factory job 115760358442,
  the Chromium case included; four mutants red; `runPro` a move; D3, AC-9 and AC-10 hold;
  dropping `now` justified; #1179 predates A2. Carried: main run 38537984916 red only on
  `editor-fidelity-trim` (#1177, unrelated).
- **Shas:** previous verified `main` `759772ddd`; built on `claude/plan-wizard-ai-p3-build`, pull
  request #1189; the merge sha is the one the queue records. **Revert:** `git revert -m 1` the
  merge commit; nothing else depends on the new exports yet.
- **What landed** (`evidence/phase-3.md`): `refineResult`, `fixInstruction`, `rebuildOnChassis`,
  `conversationOf` and `chat` in `creation.ts`; the Pro state, status read, category reset and
  four markup pieces in `steps/ai/ProPanel.tsx`; `pickerHex` in `model/cssVars.ts`. The step 1,940
  to 1,659 lines, budget JSON 1,659. `ai-creation` 33 tests (14 new), seven new mutants red.
- **Decisions** (each revertible as stated):
  - *Signatures differ from section 2's table:* `refineResult({ result, instruction, level, spec,
    context, lite }, io)`, `rebuildOnChassis(current, variantId, context, io)` returning `null`
    when there is nothing to rebuild, `chat(conversation, text)` with no `io` (the brainstorm
    reaches the gateway itself; nothing to inject; the test stubs `fetch`). Revert: reshape the
    arguments.
  - *The busy label is the module's first `onProgress`* for refine, fix and rebuild, as A2 did.
    Revert: pass the label in.
  - *Pro state is two hooks in `ProPanel.tsx`, called where the state and the effect stood*, not
    panel-local state: the status read runs on mount today whatever the tier, and a component
    mounted only behind `proMode` would have dropped that request. So the panel file "owns" the
    state section 2 says it does not; its components take values (one `tier` object) as props.
    Revert: inline the hooks.
  - *`StyleStep.tsx` loses `pickerHex`* (the row's list allowed the edit; it never called it).
- **A4 must allow for:**
  - `git mv` must take `steps/ai/ProPanel.tsx` too; its imports are four levels deep
    (`../../../../ai/...`, `../../MiniPreview`) and change with the folder.
  - The budget JSON names `steps/AiStep.tsx` at 1,659; point it and the gate's guards line at
    `wizard/ai/AiStep.tsx` (A1's note), never at the shim.
  - `ai-creation.test.mjs` now has two Chromium cases (Pro finish, rebuild); still factory tier.
  - The covers headers: `src/ai/creation.ts` now holds refine, fix, rebuild and talk, so a spec
    that drives those (`ai`, `ai-depth` for talk) should name it; five covering specs are still
    not selected by `creation.ts` alone.
  - For A5: `proDropped` is one state slot while the Pro details and package are per result, so
    a restored Pro result shows the newest run's dropped list (existing; Pro unreachable).
    `pickerHex` and `toHex` disagree on `#rgb` (moved as is). `ai-more-control` stays skipped
    (#800); not revived here.
- **Traps:** rebuilding needs `DOMParser` (catalog assembly), so its success, thrown and abandoned
  cases run on the test's Chromium page; only the no-op cases are plain Node. The brainstorm's
  gateway call reads settings and `getAccessToken`, which the existing bundle already stubs.

### A2 check on `main` (2026-10-14): PASS

- **Shas:** checked `main` at `591213fca`, the merge of #1178.
- **Browser evidence (CI; the local queue refused, about 2 GB free):** #1178's merge-group run
  38536443430 ran the tree `591213fca` and passed. Its merged report: `ai` 35 passed (the two
  arrival tests among them), `ai-lite` 2, `ai-tiers` 8, `ai-depth` 2, `pro` 2, `ai-consent` 1
  plus 1 old skip, `wizard-finish` 22 plus 1, `import` 1 plus 3, `import-svg` 54 plus 47,
  `image-purpose` 1 plus 5, `project-format` 9 plus 3; `adapt-first`, `ai-more-control`,
  `design-rules-product` and `flows` skip as before (#800). The same counts as main's full run
  38526192545 before A2, except `project-format`, revived by `519d1ee4e`, not by A2. All ten
  offline covering specs and the fourteen offline driving specs were in the plan; the two
  `configured/` specs need credentials. #1178's e2e diff is empty (AC-2, AC-15).
- **The Node guard runs on CI:** the Factory gates job 115760358442 of that run, step
  "Factory-tier tests" (`gates.mjs run --gate factory`, every factory file): `ai-creation` 19 of
  19, the Chromium Pro case `ok 19`; 152 passed, 0 skipped. Locally the 18 Node cases and
  `ai-lite-bench` 28 of 28 pass; `npm run depcruise` clean, config unchanged.
- **Mutation, red where it should be:** in `creation.ts`, convert without the structural check,
  raw forwarding the validator, and directions with a wrapped validator each failed exactly its
  row's test (17 of 18 passed); in the step, `validate: safeValidate` in `creationIo` failed the
  bench's validator guard. Each reverted, nothing committed.
- **Move, not a rewrite:** the step's lines 890-1027 at `591213fca^1`, indentation stripped,
  against `runPro`: only the IO swaps (`io.validate`, `io.probeMark`, `io.onProgress`), the
  upload lookup lifted to the step's input, the WeakMap writes and `setProDropped` lifted out, a
  comment's "above" made "in the step", and the return shape. `primaryGraphic` is derived as
  before; nothing under `src/ai/pro/` changed.
- **D3, AC-9, AC-10:** forwarding matches section 4 route by route; the raw screen is
  `screenChange`, tested; the step still builds `productionSpxValidator` + `withSpecChecks`.
  `src` diff is the two allowed files. Budget JSON still 2,152, the step 1,940.
- **Judgements:** dropping D2's `now` is right: nothing in `creation.ts` or the step reads the
  clock; A3 adds it if a moved function does. #1179 predates A2: the `imported?.template` source
  of the display screen came with `04da7bc8d` (2026-07-24).
- **For A3:** lower the budget to the actual count; the factory-tier note above holds for new
  Node cases.

### A2. The tier dispatch in `src/ai/creation.ts` (built 2026-10-14)

- **Check's findings (A1 check, main `29883468f`):** `ai` 35 passed, 0 skipped; `ai-lite` 2,
  `ai-tiers` 8, `ai-depth` 2, `pro` 2, `ai-consent` 1 plus 1 old skip, `wizard-finish` 22 plus 1
  old skip (main run 38526192545); mutation probe 4 of 4 red; the size gate fails at 2,153; the
  Finish door swap (D9) and the budget exception judged sanctioned. Carried, still untested: + New
  graphic while busy; the shell's `aiThread` after Continue (A1's note on `onThread` null). Open:
  #1165 (a late result after close), #1166 (capacity over 95%). Plan widths: 45 for the step, 15
  for `creation.ts`.
- **Shas:** previous verified `main` `9fd10aed3`; built on `claude/plan-wizard-ai-p2-build`, pull
  request #1178; the merge sha is the one the queue records. **Revert:** `git revert -m 1` the
  merge commit; nothing else depends on the module yet.
- **What landed** (`evidence/phase-2.md`): `creation.ts` holds `creationRoute`, `runCreation`,
  `creationError` and `screenChange`; the step builds the validator and calls them; 2,152 to 1,940
  lines, budget JSON untouched. `ai-creation.test.mjs` (19 tests, factory tier) covers every A2
  row late, thrown and abandoned; twelve hand mutants all red. Assessment A: FAIL on the test's
  missing tier header, fixed; the rest passed.
- **Decisions** (each revertible as stated):
  - *Route choice in the module, as a pure function.* `creationRoute` returns the route or the
    refusal text, so the step refuses synchronously before any busy line, as before. Revert:
    inline it.
  - *The busy label is the run's first progress call.* Each route in `runCreation` calls `io.onProgress(label)`
    synchronously before its first await, so the step needs no label table. Revert: return the
    label from `creationRoute`.
  - *`runCreation` throws; `creationError(e, route)` words it.* The step keeps one
    try/catch/finally around the run and its own `showChange`, as `run` did. Revert: return
    `{ error }`.
  - *The display screen is `screenChange` in the module*, called by `showChange` for every path
    (restore, select and revert too), so the raw route's screen is testable in Node. Revert:
    inline `mergeSafety`.
  - *No `now` in `CreationIO`* (D2 lists it): nothing moved reads the clock. Add it when a moved
    function does.
  - *The Pro success path runs on a Chromium page*: composing a catalog design needs `DOMParser`,
    which bare Node lacks. The file is `gate: factory`, `needs: browser`, so the Factory job runs
    it, not Build. Revert: split the Pro success test into its own file and drop the header.
  - *No covers header edited* (outside the row's files): five of the eleven covering specs are
    not selected by `creation.ts` alone; A4 rewrites the eleven headers and adds it there.
- **A3 must allow for:**
  - Refine and fix errors use the plain message; do not route them through `creationError`,
    whose "Try:" suffix only the whole-result routes had.
  - `alternatives` and `originals` are separate arrays (the step copies the result list into
    `originals`); keep updating them with `.map`, never in place.
  - Found by the review, existing before A2 and left as they were: `showChange` screens every
    displayed result against `imported?.template`, not only a convert's (#1179); a Pro package
    member whose composition throws skips the outcome report (Pro is unreachable).
  - The Pro generate branch already lives in `creation.ts` (`runPro`). AC-14's move check diffs
    across A2: `origin/main` before #1178, lines 890-1027 of the step, against `runPro`, with
    the WeakMap writes lifted into the step's `generate` and `setProDropped(pro.dropped)`.
  - `ai-creation.test.mjs` is factory tier because of its Chromium case; extended Node cases
    belong there too, or in a new build-tier file without the page.
  - The late answer still reaches `showChange` and `onResult` after the step was left (#1165
    unchanged); the module keeps returning results to whoever awaits them.
  - Lower the budget from 2,152 (the step is 1,940 now).
- **Traps:** a rolldown bundle of anything reaching `ai/settings.ts` needs
  `transform.define['import.meta.env'] = '{}'`, and anything reaching `backend/auth.ts` pulls
  supabase-js whose externals a `data:` import cannot resolve; the test stubs `getAccessToken`
  with a plugin. `namedPackage` returns renamed copies for a package of two or more, so a
  package's first member is not the result's template object.

### A1 check on `main` (2026-10-14): PASS

- **Shas:** checked `main` at `29883468f`, which contains A1's merge `bd6fd764d` (#1164).
- **Browser evidence (CI; the local queue refused, about 1 GB free):** #1164's merge-group run
  38525110256 ran the merged tree's `ai.spec.ts` and `ai-lite.spec.ts`: `Running 37 tests`,
  `37 passed`, nothing skipped. Main's full run 38526192545 on `29883468f` passed (1,764 expected,
  0 unexpected, 0 flaky); its merged report gives the A1 row: `ai` 35 passed, `ai-lite` 2,
  `ai-tiers` 8, `ai-depth` 2, `pro` 2, `ai-consent` 1 passed and 1 skipped, `wizard-finish` 22
  passed and 1 skipped (both skips are outside A1's files and predate it). Neither revived file
  nor any helper it imports calls `test.skip`, `fixme` or a retired `_create.ts` door.
- **Mutation, red where it should be:** a probe branch (dispatched run 38526539094, branch deleted,
  never merged) flipped four assertions in `ai.spec.ts`; exactly those four tests failed and the
  other 31 passed. The four: the raw call's tool list, the refined name in the library record, and
  the two late-completion tests (after Home, Continue showed `Late Slate` where `Test Slate` was
  asserted; after ✕, the result card was there, count 1, where none was asserted). So the late tests read the
  late answer and would flip when #1165 is fixed.
- **Size gate:** the step is 2,152 lines against a 2,152 budget. One added line made
  `check-file-budgets.mjs` exit 1 (`2153 of 2152`), `gates.mjs list --changed origin/main` showed the
  gate hit by a change to `AiStep.tsx` alone, and `gates.mjs run --changed origin/main --only checks`
  failed on it. CI runs every build gate in `npm run build` regardless.
- **Fence:** `git diff bd6fd764d^1 bd6fd764d -- src` is empty. `scripts/check-file-budgets.mjs`
  (its guards line) is outside the row's list, needed for `--changed` to reach the step; accepted.
- **Judgements:** the Finish test's `wz-finish-editor` -> `wz-finish-production-go` stays within D9:
  that door no longer exists in `src/`, the behaviour asserted (an AI result lands on Finish with
  its doors) is unchanged, and the export-door assertion beside it is untouched. The conversation
  test's editor AI panel read became the record's `aiThread` because that panel lives only in the
  unreachable old editor. The budget exceptions follow `scripts/e2e-capacity.mjs` and
  `docs/VERIFICATION.md` (minutes, what they protect, 30-day expiry; both parse and cover today);
  they come from the planned build, not a repair, and #1166 records the over-line state.
- **For A2:** 45 specs now plan for `AiStep.tsx` (44 at A1, `main` moved); 15 for
  `src/ai/creation.ts`. Not covered, as the builder recorded: the header's + New graphic while
  busy, and the shell's `aiThread` after Continue (only the step's past generations are asserted).

### A1. Baseline on the existing step (built 2026-10-14)

- **Check's findings:** none (no check preceded this phase).
- **Shas:** previous verified `main` `1e9ff904b`; built on `claude/plan-wizard-ai-p1-build`, pull
  request #1164; the merge sha is the one the queue records. **Revert:** `git revert -m 1` the
  merge commit; nothing under `src/` changed, so the skips come back and nothing else depends on
  it.
- **What landed** (`evidence/phase-1.md`): `ai.spec.ts` runs all 35 tests (31 revived, 2 new) and
  `ai-lite.spec.ts` both of its tests, with no runtime skip, 37 of 37 green on CI run
  38520085781; the step's budget at 2,152 and the gate's `// guards:` naming the step; plan
  widths 44 for the step and 15 for `src/ai/creation.ts`.
- **Decisions** (each revertible as stated):
  - *Eight endings through the export door, one through the production door.* The export door
    saves before it opens its window and leaves the wizard where it was, so it is the cheaper
    read; the "create project" test takes the production door so both doors run from an AI
    result. Both read the library record (`savedGraphic` in the spec), which replaced the old
    editor's topbar and store reads. Revert: swap the helper per test.
  - *Two late-completion tests, not one.* Section 1.3 names the close control first; the Home test
    carries the fresh-open assertion the row asks for, and the ✕ test pins a probable defect,
    issue #1165. Today: a late answer reaches the shell after Home (Continue shows it, a fresh
    open shows nothing) and after ✕ (picking Create with AI again shows it, Next enabled).
    Recorded, not endorsed. Revert: delete the ✕ test.
  - *Budget exception.* Measured on CI the revival adds 4.4 table-minutes and puts the suite at
    96.3% of its envelope, over the 95% line; the exceptions above cover this plan's two files
    until 2026-11-13, and issue #1166 records that the line stays over for everyone once the
    durations refresh lands. Revert: delete the section and make the change cheaper.
  - *`scripts/check-file-budgets.mjs` gained the step on its guards line* (outside the row's file
    list; S1b's notes say a plan that budgets a file adds it there, or `gates run --changed`
    skips the gate for it). The Lite test's title says "saves it for export" instead of "opens
    the normal editor"; the `NO_EDITOR` tag went with the skip it existed for.
- **A2 must allow for:**
  - The late-completion tests pin that `run` hands a late answer to `showChange` and `onResult`
    after the step unmounted. `runCreation` must keep returning the result to whoever awaits it;
    dropping or ignoring a late answer is #1165's fix, its own pull request, which flips the ✕
    test's last assertions.
  - The tests wait on `aiRunRecords()` (`src/ai/telemetry.ts`) counting the second run, then on
    the result card; they read `loadGraphics()` and `loadShows()` for every Finish ending.
  - `ai.spec.ts` is now 4.4 table-minutes; a further edit to it before 2026-11-13 is covered by
    the exception above, an edit to another spec that adds minutes is not.
  - For A3 and A4: the budget JSON names `src/components/wizard/steps/AiStep.tsx`. A3 lowers its
    `lines`. A4 must point the JSON's `file` and the gate's guards line at
    `src/components/wizard/ai/AiStep.tsx`: the one-line shim left at the old path would pass a
    2,152-line budget while the real step grew.
- **Noticed, not reproduced:** Continue into an AI walk mounts the step again with empty state,
  and by the code its `onThread` effect then reports `null`, so the shell's `aiThread`, which the
  parent's keep/clear table lists as kept on Continue, is overwritten. A Finish after Continue
  would save no conversation. The Home test asserts only that the past generations are gone.
- **Traps:** the local browser queue refused every job (0.9 GB free against its 4 GB floor), so all
  browser evidence is CI's. `e2e-capacity --changed` locally counts an edited spec at its table
  value (+0.00) and the plan job's estimate does the same, so CI gate passes; only the Combined E2E
  report's measured line shows REFUSE. A held route that is never released keeps its handler
  parked, so the late-completion helper also releases it when the page closes. Playwright leaves
  the order of several `addInitScript` calls undefined; these tests, like the file's older
  harness-off tests, rely on the test's own settings script running after the `beforeEach` one.
