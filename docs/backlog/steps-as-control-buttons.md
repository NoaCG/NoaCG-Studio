---
v: 2
source: owner
kind: ask
raised: 2026-09-30
state: unstarted
asked: "The steps that we put at some point need to become custom buttons in our layout system (because that's how we make a lot of the graphics). Sometimes we need to add different logic to the graphic and then each step could become its own button that you can jump to directly. Very late in the production; no hurry. (Paraphrase of a dictated message.)"
size: large
needs-owner: none
---
# Let a timeline Step become its own control button that jumps straight to it

**Filed:** 2026-09-30, owner, right after step authoring (R1.2a.4) landed.

## Why

Step authoring gives a graphic an ordered walk: the operator presses Next and it moves to the next
Step. Many NoaCG graphics are run from custom buttons instead, because their logic is not a line:
the operator needs to reach a particular state directly. Today a Step made on the timeline can only
be reached by walking to it, so a graphic that needs direct access has to be built as a machine by
other means, outside the editor that authored its motion.

## What it would take

- A way to mark a Step as a button, with its name as the label, in the editor that authors Steps.
- Behind it, an event per such Step that enters that Step's parked pose from wherever the graphic
  is. The binding contract already fits: every state is enterable by transition or by snap, a
  transition fires only where the author drew it, and control buttons are generated from the
  machine and fields, never from a category (the `src/blocks` and `src/templates` rules,
  `docs/STATE_MACHINE_SCHEMA.md`, `docs/CONTROL_LAYER.md`).
- Decisions for the owner at the time: whether a jump plays the target Step's own motion from the
  live pose or snaps to it, what Next does after a jump, and what Out does from a jumped-to Step
  (R1.2a.3's Out from any step is the starting point).
- The editor refuses step authoring on machine graphics today (`sequenceAuthoringReason`), and 44
  of the catalog's 48 stepped designs are machines, so this is also the road to authoring their
  motion in the new editor.

## Evidence

- R1.2a.4 receipt: [editor-r1-2a-4](../research/editor-r1-2a-4/README.md); the ordered walk and the
  control page's Play, Next and Stop were proven there on Clean Steps.
- The control page already renders one button per declared machine event
  (`e2e/control-panel-types.spec.ts`).
