# Phase 3 evidence: first complete flow

Spec: `docs/work-specs/interaction/spec.md`, phase 3 (AC-9, AC-15 first run). Base:
`f47aa360c411cc44f30ba95b09c853b93141ade1`. Branch: `claude/plan-interaction-3-build`. The PR, its
reviewed head, the CI run and the merge sha are in the PR description and the receipt to the
coordinator; this file holds what was checked and how.

## Per criterion

| AC | Result | Evidence |
| --- | --- | --- |
| AC-9 | pass (local) | Node: `scripts/result-staging.test.mjs` (18 tests, seven of them added in review: the field contract; nothing picked without a choice, the choice remembered; a second press from a page holding an older record updates the cue the first made; only result fields written; a deleted cue and a graphic without the fields get a new cue with a note; Change then a pick moves the result and keeps the old cue; a catalog board's seeded cue adopted; Stop finalises and never adds; a refused or unlanded write says so and records nothing; a team merge keeps both questions' links; the staging modules import nothing that sends). Journey, offline, `e2e/production-audience.spec.ts`: "results reach air only as cues the operator takes" (choose, stage, a second press, Take, a stage with the cue on air, Stop, a question edit, a tab change, a reload, Update, a deleted cue; the Playout page's command log counted at each step: Go live, staging, Stop, edits, tab change and reload add no row; Take and Update add theirs; Stop writes "voting closed" into the cue while Program keeps "voting open" and the board's state chip does not move) and "a second operator tab updates the same result cue; a graphic without the fields gets a new cue". The older walks now pick, then stage: "a vote with nowhere to go offers a vote board", "a result staged while the rundown cannot save", the imported board in `e2e/import-svg-behaviour.spec.ts`, and `e2e/configured/audience-live.spec.ts`. |
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
- `npx tsc --noEmit -p tsconfig.json`, eslint on the changed files and
  `npx depcruise --config .dependency-cruiser.cjs src`: clean. (The first CI run on `4230b2e` found
  `src/control` importing `src/templates`; the field words moved to `src/model/voteFields.ts`.)
- Browser, local queue: `e2e/production-audience.spec.ts` and `e2e/import-svg-behaviour.spec.ts`
  filtered to the Interaction, vote, phone, join and message tests: 35 passed (j-0006); the AC-9
  journeys and the stale-phone journey again after the last changes.
- Capacity: `node scripts/e2e-capacity.mjs --changed origin/main`: no table change for the two
  offline files (+0.00 min); `check-e2e-protection`: OK, `production-audience.spec.ts` 29 to 30
  tests.
- Not run here: the configured suite and the catalog battery (the change moves the vote field
  words into `model/voteFields.ts`, which `vote.ts` imports, so `e2e-affected` reads as catalog-affecting); both run in the
  PR's CI gate.

## Review rounds

- `/check` review of `14631601` (delegated): 10 findings, 9 fixed (S17 to S20; one not reachable,
  the button only exists for a question's own round). Tests: the stored write decides the note,
  a pick is remembered when it lands on the existing cue, an unused seeded cue goes. Mutation:
  reporting the tab's plan instead of the stored one fails "the note reports what the stored write
  did".
- Codex review of `4230b2e`: three P2 findings, all fixed (S21 to S23). Tests: "Stop from a tab
  that has not heard of the link still finalises the stored cue" and "a stored pass with nowhere
  to write is reported as such" both fail on `4230b2e`'s `resultStaging.ts`; the same-named
  catalog board is pinned in the second-operator journey ("House Vote 2", the old graphic kept).
- Codex review of `fb8a835`: two P2 findings. The button now names the graphic the press would
  write to (S24; Node test "the button names where this question's press would write"). The
  concurrent first stage on a team production keeping two cues is S12 as written and agreed in the
  rules review; answered on the thread, not changed.
- CI on `4230b2e` and `fb8a835`: the Build lane's dependency check refused `src/control` importing
  `src/templates`; the field words moved to `src/model/voteFields.ts` in `86b6fd9`.
- Codex review of `b854d6b`: one P2 finding, fixed (S25). Node test "Go live finalises the round
  the press closed, read at the press" fails with the page-only choice; writing it also caught a
  hole in the first fix (the page's stale round was finalised too), fixed before push.
- Codex review of `b4d62b5`: one P2 finding (a snapshot read before a slow catalog-board add,
  written after a Stop closed the round). Second successive round of one family, so a fresh
  read-only review reassessed the rule model first (session in the PR); its S26 to S30 were built.
  Node tests "the closing sweep finds every closed poll round whose cue still says open" and "a
  staging write that read open closes the cue itself when the round closed before it landed"; the
  second fails with the re-check removed.
- Codex review of `6e258ef`: one P2 finding, fixed (S29 amended): a reopened question whose cue
  still said "closed" was skipped by the sweep. The sweep test now covers a reopened round under
  Stop and under Go live, and fails with the closed-by-this-call check removed.
