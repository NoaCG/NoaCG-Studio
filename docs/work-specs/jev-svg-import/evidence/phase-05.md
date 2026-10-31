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

## Rules (written before code)

The change sets state rules (who owns a value, accepted versus refused operations, revision
identity, re-application), so these were written and pushed before any code. Each line is
observable through `svgDraftWithProposal(draft, proposal)` (draft.ts), which validates with
`validateSvgProposal` and merges with `applySvgProposal` (apply.ts).

- **A1 Validate first, all or nothing.** The proposal is checked by row 4's validator (R1-R7)
  against the draft's own `designSvg`: its markup is the revision, its inventory the layers.
  Refused: the result carries the errors and no patch, so the draft stays exactly as it was.
  Accepted: one patch holding `svgFields`, `svgImages`, `svgOutlines` and `svgBehaviour`, applied
  in one draft update; no other key moves. Inputs are never mutated.
- **A2 Only what today's draft can express.** The capabilities are what the draft can hold: every
  full recipe in the registry, `field.countdown`, `quiz.lock:lock`, `quiz.reveal:manual` and
  `quiz.reveal:automatic`. The true no-Lock quiz, the credits layout and playback values and the
  `clock` recipe are refused as `unsupported-capability` until the rows that add them. More than
  one component is refused: the draft holds one behaviour.
- **A3 The drop is the reference.** A value is untouched when it equals what the drop gives for
  this artwork (`svgDraftFromImport`'s answers, recomputed from `designSvg` by the same pure
  function). Any other value is a correction: the author's, the mapping step's own measurement
  (text found off the frame), or an earlier applied proposal's.
- **A4 Corrections win, per value.** For each row the proposal decides, `on`, `kind` (text rows)
  and `title` (when the proposal gives one) are taken from it only where the row's current value
  is untouched; a corrected value stays and the result names it in `kept`. Sample, `whenOff`,
  alignment, nudge, `armedByTimer`, outline boxes, fonts, growth and extras are never written.
  A row the proposal does not name stays as it is. Source layers are never added, removed or
  rewritten: the markup is not part of the patch.
- **A5 The behaviour is one answer.** If the current behaviour equals the drop's, the proposal's
  component replaces it, and no component means none (the ordinary in and out graphic). If the
  author changed it in any way, it stays whole and `kept` names `behaviour`. A component becomes
  the existing draft shape of its recipe (quiz, score, `vote` as poll, `countdown` as timer with
  its clock on the countdown row, any other as the generic recipe); each pick lands in its (role,
  row) box, the row count is one past the highest row picked, and a pick that cannot land refuses
  the whole proposal.
- **A6 Intent stays explicit.** `default` writes no option (the recipe's declared defaults).
  `quiz.lock:lock` writes `lock: true`; `quiz.reveal:manual` and `automatic` write `autoReveal`
  false and true. `unresolved` writes no option, so the preview runs on the recipe's defaults,
  and is listed in `decisions`. `decisions` holds exactly the unresolved keys: empty when nothing
  is materially ambiguous. There is no per-layer acceptance: an accepted apply is the draft, and
  the existing preview, control renderer and Finish build it.
- **A7 One countdown after the merge.** Where a kept correction already holds the countdown, the
  proposal's countdown is not written, and `kept` names it.
- **A8 Idempotent.** Applying the same accepted proposal to its own result changes nothing.
  Re-applying it after further corrections keeps them.
- **A9 Round trip.** `svgProposalOfDraft(draft)` expresses the deterministic import as a
  proposal. For the drop draft of every development design and every corpus file it validates,
  and applying it to that draft returns the drop's rows and behaviour unchanged. A decision that
  would contradict its own pick (a display-target text layer, an unticked layer a field role
  picks) or a title the contract refuses is left out, so that row stays as the reader offered it.
- **A10 Text stays data.** Nothing from a proposal reaches a sample, the markup or any text
  content; a title reaches only a field title (row 4's R6).
