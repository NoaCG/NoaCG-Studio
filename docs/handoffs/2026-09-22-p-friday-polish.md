# P - Friday polish: Reveal choice, the empty activity log, the wizard's dashes

Branch `claude/p-friday-polish`, worktree `.claude/worktrees/agent-a744e1196ebd1bef9`, forked
from `17a51923`. The three operator-facing leftovers from row E's rehearsal
(`docs/handoffs/2026-09-21-e-demo-rehearsal.md`, "For row G" 6 and 7, and the wizard em dashes)
that row G2 left. Owner walk: `docs/acceptance/owner-queue/2026-09-22-p-friday-polish.md`.

## What changed, and what I decided

1. **Reveal choice: explained, not hidden.** I chose the docs route. The button is not tied to
   "choice layers". It is the answer board's hidden-pick road (lock from the question without
   Select, then reveal the pick as its own beat, `sealed` in `answerBoard.ts`), pinned by
   `e2e/quiz-pilot.spec.ts`. Hiding it would remove a working feature from every quiz. The docs'
   quiz Buttons section (`docs.html#quiz-run`) now has a paragraph on when it lights up. The
   greyed-out tooltip on the production dashboard and the graphic control page names the button in
   plain words through `illegalEventTitle` (`src/control/controlModel.ts`). The old tooltip named the
   machine's event id. `ControlPanel.tsx` and `timeline/PlayoutSimulator.tsx` still use the old
   wording. They sit outside this row's files and are editor surfaces, not the demo road.
2. **The empty activity log says why.** Row C pinned that a reload of an unpublished production
   brings nothing back on air, so the log keeps the same rule. It lives only in the tab. The empty
   line on such a production now says it is not published and the list starts empty each time
   the page opens. A published production with a backend keeps the old line, because its history
   is read back (`ActionLog` `published` prop). The reload leg of `e2e/dashboard-operator-walk.spec.ts`
   pins it, and so does a Reveal choice title assertion after the take.
3. **No em dashes left in `src/components/wizard/`** (72 lines, `WizardPreview.tsx` not touched,
   since row M owns it). They became plain sentences: "Add to the production and go live", "Auto
   (recommended)", and the Entry cards. The import card is shorter than before, inside
   `wizard-entry-fit`'s height budget. Also changed: the dashboard's "not on air. Take the cue
   first." tooltip, the tutorial's button name, the client-neutral allowlist line for the Finish
   export door, and the re-recorded copy baseline. Three specs had asserted old strings, and I
   updated them.

## Left, and why

- `GraphicControlPage.tsx:875` still reads "Auto — recommended". It is home copy, outside the
  wizard scope.
- The docs' wizard screenshots (`public/docs/*.png`) may show the old Entry-card and Finish copy.
  Re-shoot them with `scripts/docs-shots.mjs`, which is browser work for the job queue.

## The check

`review: delegated`. The code-review skill got the `review-request.mjs` scope (base `17a51923`, 34
files) and reported the same base and all 34 files, so the scope matched. It had three low
findings, and I fixed all three: the tooltip on the graphic control page, the import card
growing by one character, and `published` ignoring `backendConfigured`.
`simplify: inline`. The skill returned fan-out instructions, so I did it here. The duplicated
tooltip string became the one `illegalEventTitle` helper.
`verify: inline`. `npm run build` exit 0 at `6afec220`. Job `j-1707` ran 79 of 79 green
(dashboard-operator-walk, production-controls, import-prepare, agent-made-graphics,
student-rehearsal, wizard-entry-fit, wizard-kit) on `c25e0b8b`. `j-1711` re-ran the two specs the
follow-up touches on `6afec220`, and 20 of 20 green. The full affected set is CI's.
`taste: not applicable`. No graphic's rendering changed, only chrome copy and tooltips.

## Commits

`c25e0b8b` the three items and their specs, `6afec220` the review's follow-up, then this handoff.
