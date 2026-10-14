# Phase A3: refine, rebuild and talk in the module; the Pro quarantine; the lifted import (AC-2, AC-10, AC-13, AC-14)

Recorded by the A3 builder (branch `claude/plan-wizard-ai-p3-build`, pull request #1189),
2026-10-14, Windows 10. Before = `origin/main` at `759772ddd`. Candidate = the branch head the
queue lands.

## What changed

| File | What it does |
|---|---|
| `src/ai/creation.ts` (310 to 420 lines) | `refineResult(input, io)` (one `modify` call; `level: 'spec'` sends the result's spec, `'code'` (a fix) sends none; Lite asks `io.provider('lite')` and `profile: 'lite'`; the busy label first), `fixInstruction(validation)`, `rebuildOnChassis(current, variantId, context, io)` (`assembleGroundedTemplate` with `keepChassisZone`, the step's validator through `demoteSpecFields`, path `grounded`, `null` when there is nothing to rebuild), `CONVERSATION_TURNS`, `conversationOf(talk)`, `chat(conversation, text)` (the brainstorm, past the provider). `runPro` untouched |
| `src/components/wizard/steps/AiStep.tsx` (1,940 to 1,659 lines) | calls them; keeps the screen state, the plain error message for refine, fix and rebuild, and the `.map` replacement of `alternatives` with `originals` untouched. The shortlist handler is `swapChassis` |
| `src/components/wizard/steps/ai/ProPanel.tsx` (new) | `useProTier` (status state and read, package, primary, dropped, hosted flag, the two WeakMaps; called where the status state stood), `useProCategory` (the category reset; called where the effect stood), `ProUploadNote`, `ProSettings`, `ProReport`, `ProFailingNote`, each rendered behind the guard it had (`proMode &&`, the report behind `lastPath === 'pro' &&`) |
| `src/model/cssVars.ts`, `steps/ai/MoreControlPanel.tsx`, `steps/StyleStep.tsx` | `pickerHex` moved unchanged to `model/cssVars.ts` beside `toHex`; `MoreControlPanel` imports it there; `StyleStep` loses the definition (it never called it). `node scripts/worktree-activity.mjs` showed no shell branch with `StyleStep.tsx` in flight |
| `scripts/ai-creation.test.mjs` | 19 to 33 tests |
| `scripts/file-budgets/components-wizard-steps-AiStep.json` | 2,152 to 1,659 (AC-10) |

## Section 4 rows A3 adds, and their tests

| Row | Late answer | Thrown answer | After the caller abandoned | Pinned |
|---|---|---|---|---|
| Refine | yes (also on Lite, and with no spec) | yes, the error object unchanged | yes, two turns released out of order | `modify(instruction, result, context, {validate, onProgress[, profile][, spec]})`, the step's own functions, no structural check, label "Refining…" |
| Fix | yes (also on Lite) | as refine | as refine | no spec even when the result has one; label "Fixing the findings…"; `fixInstruction` word for word |
| Rebuild | verdict held on a Chromium page | verdict throws | two rebuilds, verdicts released out of order | no provider asked; same spec on the new design; path `grounded`; spec-field errors demoted; generation id and shortlist kept; the standing direction untouched; the no-op cases in Node |
| Talk | yes, stubbed `fetch` | a 400 refusal's message | yes | the request's messages are the bounded conversation plus the new words; `conversationOf` keeps the last 10, oldest first |

**Mutation, red where it should be:** seven hand mutants of `creation.ts` (a fix sending the spec,
refine forwarding the structural check, rebuild without the demotion, rebuild keeping the polish
path, talk dropping the new words, talk unbounded, the fix instruction losing a line) each failed
exactly its row's tests; the file was restored after each.

## AC-14: the disabled Pro implementation is preserved

- Every runtime Pro symbol the step imported before A2 (`591213fca^1`) is still used outside an
  import line: `PRO_STANDARD_ROUTES`, `generateProGraphic`, `proRuleCodes`, `validateProLanguage`,
  `composeGraphic`, `namedPackage`, `packageLines`, `openProSession`, `reportProOutcome`,
  `proBrandPalette`, `proLines`, `proMarkDescriptor`, `standardProLanguageBrief` in `creation.ts`
  (`runPro`, unchanged since A2); `PRO_GRAPHICS`, `PRO_PACKAGE_LIST`, `loadProStatus` in
  `ProPanel.tsx`; `PRO_SUPPORTED_CATEGORIES` and `loadProStatus` also still in the step.
- Move, not a rewrite: main's lines 282-307, 315-322, 463-474 (state, status read, hosted flag,
  WeakMaps), 439-446 (category reset), 1124-1130, 1528-1612, 1719-1809 and 1894-1899 (markup),
  trimmed, against `ProPanel.tsx` trimmed: the only differences are the header, imports,
  function wrappers and return statements, the comment braces of two JSX comments that became
  JS comments, `spec.category` read as the parameter `category`, and `setSpec` added to that
  effect's dependencies (a state setter, stable).
- `tsc --noEmit` passes with `proMode` false; nothing under `src/ai/pro/` changed.

## Runs (local)

- `node --test scripts/ai-creation.test.mjs`: 33 passed, the two Chromium cases included (free
  RAM was 6.4 GB at the time).
- `node --test scripts/ai-lite-bench.test.mjs`: 28 passed (its text guards still match).
- `npm run gates -- run --changed origin/main`: exit 0 (file budgets "1659 of 1659").
- `tsc --noEmit`, `eslint --max-warnings 0` on the changed files, `depcruise --config
  .dependency-cruiser.cjs src` ("no dependency violations", config unchanged): clean.
- `git diff --name-only origin/main...HEAD -- src`: the six files above (AC-9).
- Not run locally: Playwright. `ai`, `ai-tiers` and `pro` run on the pull request's CI (AC-2,
  AC-15); `ai-more-control` stays skipped at runtime (#800): reviving it means rewriting its three
  editor-door endings, which was not cheap inside this window.

## The `/check` pass

Review (delegated, scope matched): no correctness finding. Fixed: the module header's overlong
line; the Pro panel's header now says the status read still runs on every opening. Reported, not
changed: `proDropped` is one piece of state while the details and package are per result, so a
restored Pro result would show the newest run's dropped list (existing, Pro unreachable; for A5's
record); `pickerHex` and `toHex` differ on `#rgb` (moved as is, comment now says so); the spec's
section 2 table and the shipped signatures differ (recorded in the Phase notes); the rebuild's
no-op now passes through the handler's `finally` (busy is already null whenever the shortlist
is visible). Simplify (four angles): the test's talk stubs reuse the JSON answer helper; a
duplicated comment line went. Not taken: one shared Chromium for the two page tests (about a
second on CI), a `talkMessages` helper shared with the thread report effect, and accessors on
`useProTier` instead of the raw setter and refs (an interface change, kept for the reopening).
