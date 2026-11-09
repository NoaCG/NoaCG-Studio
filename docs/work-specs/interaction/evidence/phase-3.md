# Phase 3 evidence: first complete flow

Spec: `docs/work-specs/interaction/spec.md`, phase 3 (AC-9, AC-15 first run). Base:
`f47aa360c411cc44f30ba95b09c853b93141ade1`. Branch: `claude/plan-interaction-3-build`. The PR, its
reviewed head, the CI run and the merge sha are in the PR description and the receipt to the
coordinator; this file holds what was checked and how.

## Per criterion

| AC | Result | Evidence |
| --- | --- | --- |
| AC-9 | pass (local) | Node: `scripts/result-staging.test.mjs` (11 tests: the field contract; nothing picked without a choice, the choice remembered; a second press from a page holding an older record updates the cue the first made; only result fields written; a deleted cue and a graphic without the fields get a new cue with a note; Change then a pick moves the result and keeps the old cue; a catalog board's seeded cue adopted; Stop finalises and never adds; a refused or unlanded write says so and records nothing; a team merge keeps both questions' links; the staging modules import nothing that sends). Journey, offline, `e2e/production-audience.spec.ts`: "results reach air only as cues the operator takes" (choose, stage, a second press, Take, a stage with the cue on air, Stop, a question edit, a tab change, a reload, Update, a deleted cue; the Playout page's command log counted at each step: Go live, staging, Stop, edits, tab change and reload add no row; Take and Update add theirs; Stop writes "voting closed" into the cue while Program keeps "voting open" and the board's state chip does not move) and "a second operator tab updates the same result cue; a graphic without the fields gets a new cue". The older walks now pick, then stage: "a vote with nowhere to go offers a vote board", "a result staged while the rundown cannot save", the imported board in `e2e/import-svg-behaviour.spec.ts`, and `e2e/configured/audience-live.spec.ts`. |
| AC-15 | first run: offline walk done here; local-stack walk in CI | See "Rehearsal walk" below. |

## Mutation

The spec asks that a mutation which sends Update on staging fails. Applied by hand to
`ProductionPage.tsx` (not committed): an effect that calls the Update verb whenever a question's
result cue values change. The AC-9 journey failed at the Stop step: `action-log-row` expected 3,
received 5 (job j-0005). Reverted; the journey passes again.

The phone page's note fix (below): with the new line removed, the stale-phone journey fails at
`#join .nj-note` expected 0, received 1 (job j-0011).

## Rehearsal walk (AC-15, first run)

**On the local stack.** `e2e/configured/audience-live.spec.ts` "the rehearsal walk" runs it in the
PR's configured selection on a local Supabase stack: Interaction's QR code is read from its pixels
and a 390 x 844 touch browser opens that link; it answers an Open question; the answer is prepared
on a House Q&A card and taken; the room moves to a vote, the phone votes, Add results to rundown
stages the result on House Vote and Take airs it; a third question goes live on the phone; Stop
leaves the phone the waiting text. The phone's six screens are attached to the test result. The
run is named in the PR and the receipt. This machine could not start a local stack (downloading
the Supabase CLI was refused here), so the local-stack walk is CI's.

**Offline, walked here.** The same walk on the local provider with the rehearsal phone tab
(`/join?rehearse=<id>`), at 1440 x 900 for the studio and 390 x 844 for the phone, screenshots
read one by one. Three questions: Open "What should we ask the coach?", Multiple choice "Who wins
tonight?" (Home, Away, Draw), Open "One word for tonight?".

Findings:

1. **Blocking, fixed here.** After the room moved on, the phone kept the note from the previous
   question: under the vote it still thanked the viewer for the Open answer, and under the third
   question and the waiting text it said "Counted. You can change your mind while the vote is
   open." A thanks now belongs to the round it was for and leaves when the room moves on; a
   refusal ("That question has closed") still stays, as R14 needs (`src/audience/joinSurface.ts`).
   Pinned in the stale-phone journey, mutation above.
2. **Filed, #2333 (P2).** A catalog vote board's 20-second timer can close voting on air while
   phones still vote. The spec's Closing section wants a staged board to drop it; AC-9 does not
   name it and it needs template machinery.
3. **Filed, #2334 (P2).** A message prepared on a Q&A card keeps the card's sample answer and
   source, so its Show answer action would air sample text under a viewer's question.

Seen and fine: unpublished, the Join area offers Publish where the QR code goes; the choice
"Results on: House Vote" appears once and the button then names it, with Change; the result cue
reads `Home | 2`, `Away | 2`, `Draw | 1` and "5 votes · voting closed" once the third question went
live (S14); Program changed only on Take.

## Checks run on this machine

- `npm run gates -- run --changed origin/main`: 283 tests, 0 failed (after re-recording the copy
  baseline down by one em dash the moved code no longer has).
- `npx tsc --noEmit -p tsconfig.json` and eslint on the changed files: clean.
- Browser, local queue: `e2e/production-audience.spec.ts` and `e2e/import-svg-behaviour.spec.ts`
  filtered to the Interaction, vote, phone, join and message tests: 35 passed (j-0006); the AC-9
  journeys and the stale-phone journey again after the last changes.
- Capacity: `node scripts/e2e-capacity.mjs --changed origin/main`: no table change for the two
  offline files (+0.00 min); `check-e2e-protection`: OK, `production-audience.spec.ts` 29 to 30
  tests.
- Not run here: the configured suite and the catalog battery (the change moves the vote field
  words into `voteFields.ts`, which `e2e-affected` reads as catalog-affecting); both run in the
  PR's CI gate.
