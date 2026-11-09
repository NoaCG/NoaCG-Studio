# Phase 1 evidence: questions and their lifecycle

Spec: `docs/work-specs/interaction/spec.md`, phase 1 (AC-1, AC-2, AC-3, AC-4, AC-7, AC-8), with the
Rules R1 to R27 in its phase notes. Base: `3985c140631173c267c5e93b37741a15bab8d88c`. Branch:
`claude/plan-interaction-1-build`. The PR, its reviewed head, the CI run and the merge sha are in
the PR description and the receipt to the coordinator; this file holds what was checked and how.

## How the rules were set

The phase changes who may open, close and count a round, so the Rules were written and pushed
before any code (`5f32dfa`) and challenged by a fresh read-only `/so` session. Its verdict was
AGREE WITH CORRECTIONS; every correction went into the Rules (`80f2160`) before the build: the old
door and round writers refuse (R18), the old phone signatures go (R19), Stop names its round (R4),
deleting the live question stops it first (R10), the local room is kept so a paste keeps its
question (R15), and Twitch's door is stated (R20). R22 to R24 were found in the code review and
are listed apart.

## Per criterion

| AC | Result | Evidence |
| --- | --- | --- |
| AC-1 | pass (local) | Node: `scripts/interaction-questions.test.mjs` "the Interaction view keeps its persisted key and its inbox key". Journey: `e2e/production-audience.spec.ts` "questions are written, browsed and changed safely..." (Setup says `Interaction…`, the view's heading says Interaction, no `Messages…`); `e2e/production-views.spec.ts` (tab and Setup labels). Links points to Interaction from the audience link's row (`links-interaction-open`, pinned in `e2e/production-persistence.spec.ts`, which also keeps Links free of explanations). |
| AC-2 | pass (local); configured in CI | Node: `scripts/interaction-questions.test.mjs` (add, edit, reorder, duplicate, delete, locks, type never changes) and `scripts/interaction-lifecycle.test.mjs` (reopen continues the count, a vote changes rather than adds, duplicate starts from zero, Clear results refused while live and leaves nothing). Journey: the questions test above, including a reload. Configured: `e2e/configured/audience-live.spec.ts` "questions on the server..." (reopen and clear against 0111). |
| AC-3 | pass (scratch database, local); configured in CI | `scripts/interaction-lifecycle.test.mjs` (Go live and Stop, MC to Open closes, Stop names its round, two providers racing). Scratch Postgres 16 with 0035, 0036, 0095, 0098 and 0111 applied: the migration's own self-check passes, and two sessions pressing Go live on different questions ended with one open round and the state pointing at it. Configured: the same from two pages, and refusal after Stop and after another question goes live. |
| AC-4 | pass (local); configured in CI | Journey: "a stale phone keeps its words, sees the new question, and files nothing until it sends again" (operator page plus a rehearsal phone page with a held clock; refused send keeps the text and shows the new question; old options refused after Stop, Clear, edit and Go live). Configured: stale revision refused by the server. |
| AC-7 | pass (local); configured in CI | Node: lifecycle test "answers are filed under the round they were sent to". Journey: the stale-phone test (paste defaults to the live Open question, changes to none; switching the live question moves nothing). Configured: `round_id` on `audience_list`, and an answer aimed at a closed vote's round refused. |
| AC-8 | pass (local) | Journey: "unpublished, Interaction offers Publish where phones would join and publishes nothing by itself" (offline: Publish disabled with its reason, no sign-in prompt, questions, Go live, preview, paste and Simulate work, no slug minted). `e2e/auth.spec.ts` offline production test extended to the Interaction view (zero auth UI). |

## Checks run on this machine

- `npm run gates -- run --changed origin/main`: 356 tests, 0 failed (after recording the tighter
  copy baseline: the panel's em dashes went from 13 to 1).
- Browser, local queue: `e2e/production-audience.spec.ts`, `e2e/production-chat-intake.spec.ts`,
  `e2e/production-views.spec.ts`: 33 passed. `e2e/auth.spec.ts` (offline production test) and
  `e2e/import-svg-behaviour.spec.ts` (imported vote board): 2 passed.
- Migration: `classifyMigration` on 0111 reports no blocked statement and no live-path statement;
  the self-check fails when Go live stops closing other rounds or when the revision check is
  removed (mutation runs on the scratch database).
- After the Codex review of the first head: 0111 re-run twice from the top on the scratch database
  (concurrent index builds, key validated after), and the send-versus-Go-live deadlock check re-run
  clean. The cross-tab test fails when the Web Lock is removed.
- Node lifecycle test mutations: removing the revision check fails one test; removing "close the
  other rounds" fails four.
- CI on the first head (`5e63c36`) failed one test, `production-persistence.spec.ts` "Links… holds one row per capability, with no explanations": the first Links pointer was a sentence. It became a button in the audience row (`94452a0`), and the test passes locally with the pointer pinned.
- The migration's self-check skips (with a notice) on a database where no account may use the
  audience feature, which includes CI's local stack, whose seed creates no users; there the
  configured test above is the database proof. On the hosted projects, which have accounts, the
  self-check runs.
- The final review of `dc19c95` (grade B) found that a round an older page left open would still
  reach phones with no row to Stop it. 0111 now closes such rounds and its self-check asserts none
  is left (tested on the scratch database with a round opened through the old function), and the
  configured test now shows the paste door refusing another production's round.
- CI on `dc19c95`: the Build job's e2e-protection step failed listing the base tree's specs (a
  `_create` export it reported missing exists on main, on that head and on its parent; the same
  command passed locally against the same base). On the next head, with no change to that check or
  the helpers, the step passed. Recorded as an intermittent fault in the check, not in this change.
- Codex on `ecd6c56` found that Delete trusted the page's last reading of whether the question was
  live (R27, R10 amended). The journey now removes a live question from another tab and shows the
  Stop that remains, which returns phones to the waiting text. The rule was reassessed by a fresh
  read-only review first (AGREE WITH CORRECTIONS: Delete goes ahead once the round is closed by any
  means). The R27 line is shown by the same panel code for both providers; it was walked on the
  local provider only (the configured test calls the server functions, not this line).
- Codex on `ffea2ac` found the room lock was per production while the store is one value for all
  productions; the lock now covers the store, and the lifecycle test races two productions too.
- The final review of `ffea2ac` graded A. Of its two follow-ups, Delete is now off while another
  action runs (it could otherwise do nothing without a word); the other, a test of Delete's branch
  where another question went live between the read and the Stop, is not written: the journey covers
  Delete of the live question and the Stop line that catches any round left behind.
- CI on `30bcf33`: the configured test "a message Sheet on a published production imports through
  the operator door, once per row" timed out twice picking the Sheet source, which this phase moved
  into the folded "More ways in". The test now opens that fold first, as the local chat intake
  journeys already do; no assertion changed.
- Not run here: the configured suite (needs the local Supabase stack, which this container cannot
  start; CI runs the selection), the production build (CI), and specs outside the audience flow
  that `shows.ts` maps to (CI).
