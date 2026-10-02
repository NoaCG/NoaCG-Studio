---
v: 2
source: owner
kind: ask
raised: 2026-09-22
state: advanced
note: >-
  The review and plan landed in docs/research/control-surfaces-review-2026-10-02/README.md
  (2026-10-02, with a Fable design consult). Still missing: the eight slices it orders. Slices 1-3
  are ready for the playout session; 4 is ready and needs the owner's look; 5-8 wait on one owner
  answer each or on the hardware-panel R1 work.
asked: >-
  "After Friday, have Fable review and propose a plan for: unifying quiz and graphic controls,
  ensuring live data always stays synchronized, removing duplicate ways of controlling graphics,
  reviewing whether Combine Controls and Next Steps are actually useful or can be simplified or
  removed, keeping the playout experience extremely simple, and checking whether the playout page
  has accumulated unnecessary complexity or code. The goal is consistency and simplicity, not a
  large redesign."
serves: NOW
size: standard
touches: src/components/home/ProductionPage.tsx, src/components/home/CueRundown.tsx, src/components/HostedControlPage.tsx, src/control/controlModel.ts, src/control/controlPanelHtml.ts, src/control/productionControllerHtml.ts, src/components/home/GraphicControlPage.tsx
needs-owner: none
---

# One place to control a live graphic: a Fable review of the control surfaces

**Reviewed 2026-10-02:** [the review and plan](../research/control-surfaces-review-2026-10-02/README.md).
It lists every control route (§1), the duplicates (§2), six ways live data drifts (§3), why the
quiz feels different (§4), Combined and » Next (§5), the playout page's size (§6), the Fable
judgement (§7) and eight ordered slices (§8). For the playout session:

- **Ready now:** 1, the ON AIR row says when air is behind an edit, and bound fields stop showing a
  false amber; 2, » Next names its target ("» Next: Reveal correct") and "↷ Next" becomes "Load next
  row"; 3, one verb vocabulary on the exported panels; the first half of 5, the graphic control
  page stops claiming ON AIR.
- **Ready, needs the owner's look:** 4, live actions above setup fields, pin and hide on the ⚡
  buttons, the separate Controls panel gone (also serves
  `operator-page-buries-live-actions-under-setup-fields.md`).
- **After the hardware-panel R1 work lands:** 7, one set of values across the dashboard and the
  hosted page.
- **One owner answer each:** remove the graphic control page (5), keep a Lock beat on the answer
  boards (6), freeze or delete Combined controls (8).

The rest of this file is the ask as filed.

**Filed:** 2026-09-22. **Source:** the owner's real production test on 2026-09-22. **Not before:**
Saturday 2026-09-26. The owner asked for no major control-system change before his lecture and
demo on Friday 2026-09-25.

## Why
The owner ran the Arcade quiz and the docs example quiz in a real production. Core playout worked,
but the controls did not feel like one product. The two quizzes are operated differently. Arcade
still uses older answer-selection controls. Live graphics can be controlled from both the
template editing area and the playout area. A correct answer changed while the graphic is live
does not always reach air. Every one of those is a second way to do the same thing, and each
second way is where live data drifts out of sync. His words for the goal: consistency and
simplicity, not a large redesign.

## What it would take
A design consult (`design-consult`, Fable) that reads the code and proposes a plan. Implementation comes
after the owner has seen the plan. The review answers six questions:

1. How do quiz controls and every other graphic's controls become one model with one set of
   verbs, so a quiz is not a special case on the dashboard?
2. How does live data always stay synchronized? A value changed while a graphic is on air must
   reach air or say plainly that it did not. That covers the cue editor, Update, Re-take, the
   hosted control page and a reloaded tab.
3. Which duplicate ways to control a live graphic can go? Today there are controls in the
   template editing area, the graphic control page, the hosted control page and the production
   dashboard. The owner wants one obvious place.
4. Do Combine Controls and Next Steps earn their place, or can they be simplified or removed?
   Measure who uses them and what breaks without them before proposing either.
5. What keeps the playout experience extremely simple for a student operator?
6. Has the playout page (`src/components/home/ProductionPage.tsx` and what it pulls in)
   accumulated code nobody needs? List it with sizes and what removing each part would cost.

Inputs to read first: `docs/CONTROL_PANEL_ANY_GRAPHIC.md`, `docs/PLAYOUT_DASHBOARD.md`,
`docs/GRAPHIC_BEHAVIOUR_PLAN.md`, the 2026-09-21 G and G2 handoffs (Update and Next after a
reveal), and the 2026-09-22 row U handoff on quiz live consistency, which records what was
deferred to this review.

Boundary: the review proposes. Scope edges go back to the owner, per the retired programme register.

## Evidence
The owner's test notes of 2026-09-22 cover the Arcade quiz (`src/templates/quiz/qz15.ts`) and the
docs example quiz (`public/docs/examples/quiz.svg`): select, lock and reveal felt slower than
normal graphics, the controls were inconsistent, and a correct-answer change did not always reach
air. The part that could be fixed safely inside the templates before Friday is row U,
`claude/u-quiz-live-consistency`.
