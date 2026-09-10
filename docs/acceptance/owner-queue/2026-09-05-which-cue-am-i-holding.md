---
kind: agent
date: 2026-09-05
serves: now
answered: true
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The ring's weight is a design default - a selection affordance has to be visible without taking a
meaning the tally already owns, which is why it is neutral rather than amber. Both halves are
pinned by e2e/production-controls.spec.ts, so what remains is a claim an agent drives.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# You can tell which cue is selected, even when it is on air

**Date:** 2026-09-05 · **Branch:** `claude/new-session-54bf87`

## What changed

Your report: *"if you have three graphics on air, you do not know which one you have selected in
the queue, so you don't know what graphic you are adjusting."*

It was a one-line CSS accident. Selection was drawn as `border-color` and nothing else, and both
tally rules - red for program, amber for preview - set the same property further down the same
stylesheet. So a selected row that was on air was pixel-identical to one that was not.

Selection now takes an **outline** and a left rail, which no tally touches, so the two stack: red
still says what the cue is doing, the ring says which one you are holding. The selected row's name
is also the brightest text in the list, so the answer does not depend on colour. And because two
cues of one graphic carry the same name AND the same tally, the editor's header now names the cue
by its number in the rundown: **EDITING ON-AIR CUE · 2**.

## The route, under a minute

1. Open any production with two cues, or duplicate one from a row's ⋯ menu.
2. Take both, so two rows are red.
3. Click between the two on-air rows.

## What to look at

- **The ring follows you, the red does not move.** Both rows stay red; exactly one wears the light
  ring and the rail.
- **The header counts.** It should read `EDITING ON-AIR CUE · 1` and `· 2` as you move, which is
  the half that settles two cues of the SAME graphic.
- Whether the ring is the right weight on your monitor. It is deliberately neutral rather than
  amber, because amber is already the preview tally and a second meaning for it would be worse
  than none - but its brightness is a taste call and one line changes it.

Gated by `e2e/production-controls.spec.ts`, which asserts both halves on one row: the ring is
drawn AND the red border survives. The second assertion exists because the obvious fix - giving
selection a border-color again - passes the first and silently takes the tally away.

## Not this item

The lag you reported in the same message is a separate investigation, filed with the measurements
taken so far in `docs/backlog/playout-lag-when-working-the-queue.md`. It did not reproduce here.
