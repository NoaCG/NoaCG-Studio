# Phase 5: Apply the contract through the existing draft

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-4: "Proposals reference real layers, retain unknown intent, reject stale/invalid/conflicting
  decisions, preserve user edits and apply atomically/idempotently. SVG text remains data."
- AC-5: "Automatic working preview, existing control renderer and ordinary Finish/save; no routine
  layer-by-layer acceptance. Material ambiguity alone causes a compact decision."
- Row verification: "Round-trip existing deterministic mappings, preserve corrections and source
  layers, and prove idempotence and rollback on invalid proposals."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. No model call, no spend; the holdout was not read.
Allowed files: `src/components/wizard/import/draft.ts`, `src/components/wizard/import/fieldAutoMap.ts`,
`+src/ai/svgInterpretation/apply.ts`, `+scripts/jev-svg-apply.test.mjs` and this file.

## Pinned main

Worktree created from `b666f302d4eea1e22506a6769b058318fc30438a` (PR #1861) after a fresh fetch.
Previous verified main: `b666f302`: merge-group CI, push CI, configured-suite (41219291410),
Post-landing, Quarantine and Push on main all succeeded.

## Rules (written before code)

The change sets state rules (who owns a value, accepted versus refused operations, revision
identity, re-application), so these were written and pushed before any code (`a98ee92`), and a
fresh read-only `/so` challenged them first (session `session_017SdbwNzfLUHxqAyBydwg2c`, AGREE
WITH CORRECTIONS). Its corrections are folded in below and listed after the rules. Each line is
observable through `svgDraftWithProposal(draft, proposal)` (draft.ts), which validates with
`validateSvgProposal` and merges with `applySvgProposal` (apply.ts).

- **A1 Validate first, all or nothing.** The proposal is checked by row 4's validator (R1-R7)
  against the draft's own `designSvg`: its markup is the revision, its inventory the layers.
  Refused: the result carries the errors and no patch, so the draft stays exactly as it was.
  Accepted: one patch holding `svgFields`, `svgImages`, `svgOutlines`, `svgBehaviour` and
  `svgApplied`, applied in one draft update; no other key moves. Inputs are never mutated.
- **A2 Only what today's draft can express.** The capabilities are what the draft can hold: every
  full recipe in the registry, `field.countdown`, `quiz.lock:lock`, `quiz.reveal:manual` and
  `quiz.reveal:automatic`. The true no-Lock quiz, the credits layout and playback values and the
  `clock` recipe are refused as `unsupported-capability` until the rows that add them. The draft
  holds one behaviour, and only full recipes are offered, so a second component is refused by
  row 4's one-full-recipe guard (`conflicting-ownership`).
- **A3 The reference.** `svgApplied` (draft-only, never read by the build) holds, per row and for
  the behaviour, the value the last accepted apply left as the proposal's; with none, or one for
  another revision, the reference is what the drop gives for this artwork (`svgDraftFromImport`'s
  answers, recomputed from `designSvg` by the same pure function). Every drop resets it. A value
  equal to its reference is untouched; any other value is a correction: the author's, or the
  mapping step's own (text it measures off the frame). Known limit: an author who changes a value
  and then changes it back to the reference reads as untouched.
- **A4 Corrections win, per value.** For each row the proposal decides, `on`, `kind` (text rows)
  and `title` (when the proposal gives one) are written only where the row's current value is
  untouched; a corrected value stays and the result names it in `kept`. Sample, `whenOff`,
  alignment, nudge, outline boxes, fonts, growth and extras are never written; `armedByTimer`
  moves only through `armTimerClock` and `disarmTimerClock` (A6). A row the proposal does not
  name stays as it is. Source layers are never added, removed or rewritten: the markup is not
  part of the patch. A value the proposal wrote becomes the reference, so a later proposal may
  replace it; a corrected one keeps its old reference, so no later proposal overrides it.
- **A5 The behaviour is one answer.** A proposal always states the behaviour: its components are
  the whole answer, and no component means none (the ordinary in and out graphic). If the current
  behaviour equals its reference, the proposal's component replaces it. If the author changed it
  in any way, it stays whole and `kept` names `behaviour`. A component becomes the existing draft
  shape of its recipe (quiz, score, `vote` as poll, `countdown` as timer with its clock on the
  countdown row, any other as the generic recipe); each pick lands in its (role, row) box, the row
  count is one past the highest row picked, and a pick that cannot land refuses the whole
  proposal (`invalid-value`, same refused result as A1).
- **A6 The countdown machinery runs on replacement.** When the behaviour is replaced by a
  different one, `disarmTimerClock` first puts back what the drop or an earlier apply armed, the
  proposal's decisions are written, then `armTimerClock` arms the one clock-shaped row only if the
  new behaviour is a timer and nothing is a countdown yet. At most one ticked countdown row
  remains: where a kept correction holds one, the proposal's countdown is not written.
- **A7 A proposal never fights a kept correction.** Validation sees the proposal alone; after the
  merge, a proposal pick or field decision that conflicts with a kept correction is not written
  and `kept` names the correction. Conflicts: a field role on a row that is off, a display-target
  role on a text row that is on, the countdown readout on a row that is not a countdown, a field
  role on the countdown row, and two countdowns. Text the mapping step measured off the frame is
  a correction (off), so no proposal pick binds it.
- **A8 Intent stays explicit.** `default` writes no option (the recipe's declared defaults).
  `quiz.lock:lock` writes `lock: true`; `quiz.reveal:manual` and `automatic` write `autoReveal`
  false and true. `unresolved` writes no option, so the preview runs on the recipe's defaults, and
  the key is kept on the draft in `svgApplied.unresolved` and returned in `decisions`. `decisions`
  holds exactly the open keys: empty when nothing is materially ambiguous. A later accepted
  proposal that answers a key clears it. There is no per-layer acceptance: an accepted apply is
  the draft, and the existing preview, control renderer and Finish build it. Whether Finish may
  proceed while a key is open, and the compact question that asks it, belong to the row that wires
  a proposer into the step; this row only keeps the keys.
- **A9 Idempotent.** Applying the same accepted proposal to its own result changes nothing.
  Re-applying it after further corrections keeps them.
- **A10 Round trip, not vacuous.** `svgProposalOfDraft(draft)` expresses the deterministic import
  as a proposal. For the drop draft of every development design and every corpus file, read by
  the real reader in Chromium, it validates, and applying it to that draft returns the drop's rows
  and behaviour unchanged. A decision the validator would refuse as contradicting its own pick (a
  display-target text layer, an unticked layer a field role picks) or a title it refuses is left
  out, so that row stays as the reader offered it; the test asserts each file's omitted list, so a
  broad omission fails.
- **A11 Text stays data.** Nothing from a proposal reaches a sample, the markup or any text
  content; a title reaches only a field title (row 4's R6).

Corrections taken from the rules review: an earlier proposal's values are no longer treated as
author corrections (A3, A4: the `svgApplied` reference); the arm and disarm pair runs on
replacement (A6); conflicts with kept corrections are general, not only the countdown (A7);
unresolved keys stay on the draft rather than only in a return value, and Finish with an open key
is left to its row (A8); the round trip asserts its omissions (A10). Noted, not fixed: a recipe
pick can land on a `show:` or `choice:` layer that `svgExtras` already uses, which the drop's own
name proposal can do today too.

## What landed

- `src/ai/svgInterpretation/apply.ts`: `applySvgProposal`, the merge over a neutral view of the
  draft (per row `on`, `kind`, `title`; the behaviour as one component), enforcing A1-A9. Also
  `SVG_RECIPE_ROLES`, the role table built once from the recipe declarations (row 4's note: it
  lived only in the contract test), and `SVG_DRAFT_CAPABILITIES`. It imports no wizard code:
  src/ai may not import src/components.
- `src/components/wizard/import/draft.ts`: `svgDraftWithProposal(draft, proposal)`, the one
  door, and `svgProposalOfDraft(draft)`, the name-based import as a proposal. The drop's rows and
  behaviour moved unchanged into `svgDropAnswers`, so the reference is the drop's own function.
  `svgApplied` is a new optional, draft-only key the build never reads; the drop resets it.
- `src/components/wizard/import/fieldAutoMap.ts`: the existing box walk now passes each box's
  row place, and `boxPicksOf` / `withBoxPicks` turn a behaviour into a proposal's picks and back.
- `scripts/jev-svg-apply.test.mjs` (factory gate, browser): 11 tests. Every development design
  and every corpus file (68 read) round-trips, builds the identical graphic, passes the export
  gate and applies again to no change; the omitted decisions are pinned per file (a vote board's
  eight written layers and a reveal's secret, both display targets). Rule cases on small named
  artworks cover refusals, capability limits, corrections and re-application, the behaviour, the
  countdown machinery, conflicts, open intent and text as data.

Nothing calls the door yet: no visible product behaviour changes in this row. The row that wires
a proposer into the mapping step consumes it, and asks the open questions it keeps.

Mutation checks on this worker, reverted before commit, each failing the suite: treating every
value as untouched (3 tests), always replacing the behaviour, dropping the conflict rule, dropping
the one-countdown rule, skipping the disarm, not advancing the reference, not holding open keys
(1 each).

## Code review and simplify (`/check`)

The review found ten candidates, all confirmed and fixed: the arm and disarm pair overruled a
kind the author corrected; replacing the behaviour disarmed a countdown the proposal kept and
nothing wrote it back (not idempotent); the conflict revert ran after the one-countdown check and
could leave two; an open key outlived an option the author set; the behaviour comparison counted
the proposer's id and pick order; a last row whose only pick gave way vanished instead of staying
empty; an unreachable second-component branch (A2 now says how a second component is really
refused); a copy of `recipeIdOf`; repeated work in the reference loop and the role table.

Simplify applied: the countdown readout comes from the role table rather than the timer's name;
draft equality uses the existing `canonical` (`src/model/publishedRecord.ts`); the unused
reference component was dropped; writes are grouped by layer. Declined: hashing the markup once
(the validator computes the revision itself, row 4's R2); a skip parameter on the shared arm and
disarm functions (the restore after them is tested); folding the countdown check into the
conflict filter (it must run last); sharing the empty behaviour seeds with `BehaviourSection.tsx`
and moving the contract test onto `SVG_RECIPE_ROLES` (both outside this row's files).

## Verification on this worker

- `node --test scripts/jev-svg-apply.test.mjs`: 11/11 pass.
- `node --test scripts/jev-svg-contract.test.mjs` 16/16, `scripts/jev-svg-baseline.test.mjs`
  19/19 pass.
- `scripts/svg-import-passes.test.mjs`: 18 pass, 4 fail (inventory, bind, emit, runtime records).
  The same four fail on unchanged main `b666f302` on this machine, so this is the machine's
  browser build against the recorded snapshot, not this change; CI judges it.
- `e2e/import-svg-behaviour.spec.ts` 38/38 and `e2e/import-svg.spec.ts` 68/68 through the queue.
  A first combined run hit its cap at 103/106 with none failing; a second lost its dev server when
  source files were edited mid-run (connection refused), and passed on the re-run with no edits.
- `npx tsc --noEmit`, eslint on the changed files, dependency-cruiser on both folders, and
  `npm run gates -- run --changed origin/main`: clean.

## Decisions and traps

- The reference is kept on the draft (`svgApplied`) rather than inferred from the drop alone, so
  a better later proposal can replace an earlier one's answers but never the author's.
- Unresolved intent is kept, not decided: Finish with an open key is the wiring row's question.
- A proposal states the whole behaviour: no component means none.
- `svgApplied` is optional and only the drop resets it, because a new key in `emptySvgSlice`
  would change the 51-file harness's pinned clear record, which is outside this row.
- Trap: editing source while a queued e2e run uses the dev server kills the run.
- Trap: `svg-import-passes` records fail locally on this cloud image's browser build; run a
  control on main before reading them as a regression.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-5-build')"

It removes the apply, its test and the door, and puts the drop back in one function. Nothing
else depends on them yet; a draft holding `svgApplied` simply carries an unread key.
