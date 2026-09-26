---
v: 2
source: owner
kind: ask
raised: 2026-08-26
state: active
programme: "P2 Behaviour & Control (the retired programme register), design rounds"
asked: "the quiz and scoreboard logics exist; the system goal is every common graphic (paraphrase)"
---
# Playout logic for every common graphic, not just quiz and scoreboard

**Filed:** 2026-08-26. **Source:** owner ruling, in session.

**Road plan (2026-08-27):** the per-type operator-story instrument and the proving-round shape a
session runs are in `docs/CONTROL_PANEL_ROAD.md` §8; the sequencing below stands.

The owner's words: **the quiz and scoreboard logics exist; the system goal is every common graphic
playable.** Two graphics were picked to decide the 2026-09-12 production because two is what a
deadline can prove. The goal was never two.

## Why

The state-machine model (`docs/STATE_MACHINE_SCHEMA.md`) and the generated control layer
(`docs/CONTROL_LAYER.md`) are general by construction: states, structural guards, events, a queue
inside the template. Quiz (lock / reveal) and scoreboard (score + / -) are the first two graphic
types to have their behaviour actually authored against it.

The gap is therefore not the model, it is COVERAGE. Every common graphic a student or a channel
reaches for has an operator behaviour somebody has to sit down and author once:

- a **clock or countdown** that pauses, resumes and can be corrected mid-run;
- a **ticker** that adds, removes and reorders items while it is on air;
- **results and standings** that step through pages;
- a **poll or vote** that opens, closes and reveals;
- a **timer with a limit** that changes appearance as it runs out;
- **credits** that scroll, pause and resume.

Until each of those has a machine, a user meeting one of them is back to "the graphic looks right
and cannot be operated" - which is the exact failure the whole state-machine push exists to end,
and the one thing a wizard cannot paper over.

## What it would take

One graphic type at a time, and each one is genuinely small once the pattern is followed:

1. Decide the states and the arrows a real operator needs. This is the design work, and it is the
   part that must not be guessed - the memory rule `category-field-logic-and-playout` says prove
   it in cloud, dashboard AND offline export, one category at a time.
2. Persist a `machine` on the graphic type only where the derived linear one is wrong
   (`docs/GRAPHIC_TYPES.md`).
3. Let the control page generate itself, then walk it: every event a button, legality as greying.
4. An owner-queue item per graphic, because "operable" is a judgement a person makes by operating
   it.

Sequenced after the 2026-09-12 production, since the two chosen graphics are what that date is
judged on.

## Evidence

- Owner, 2026-08-26, in session: quiz and scoreboard logics exist, the system goal is every common
  graphic playable.
- Root `AGENTS.md`, current push: two graphics "decide it", which is a proof, not a scope.
- `docs/STATE_MACHINE_SCHEMA.md` and `docs/CONTROL_LAYER.md` - the mechanism is already general;
  what is missing is an authored machine per graphic type.
