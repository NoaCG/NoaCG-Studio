---
kind: agent
date: 2026-09-06
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Its own route says nothing in the UI changed and this is a 'does it still behave' look. Four
corner bugs animating and keyframing as before is a regression claim an agent drives.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# An animation NoaCG converted could throw the first time an operator pressed Take

**Date:** 2026-09-06 · **Branch:** `claude/noacg-pro-harness-comparison-5c7fa0`

## What changed

Paying a cheap model to design graphics through the Pro Harness turned up a fault in the
timeline importer that had nothing to do with AI, and it is the half worth your eyes.

When a hand-authored animation region is converted into NoaCG's keyframe data, the importer
reads each tween's target out of the code as text. It only ever recognised a SINGLE-quoted
selector. Both quote styles are ordinary JavaScript and nothing in the authoring grammar names
one - our catalog simply happens to be written the other way, so the other branch had never been
exercised. When it could not read a target it substituted the literal string `?`, which looks
like a selector the whole way through, passes validation, and then throws inside GSAP the moment
the graphic plays. The template saved, exported and reported clean; it just died on air.

That reaches anything driving the same door, including the `noacg` CLI's own normalize step, so
it was not only a bench problem.

An unreadable target is now refused, which keeps the author's code and shows the motion
read-only on the timeline - the behaviour the contract already promised. A tween that readably
targets nothing (`tl.fromTo([], …)`, which four corner bugs use deliberately) still converts
exactly as before.

## The route, in under a minute

Nothing in the UI changed, so this is a "does it still behave" look rather than a new screen.

1. `npm run dev:worktree`, open **/app**.
2. Open any **corner bug** from the catalog (Browse -> Corner bug -> any of bug13-bug16, the
   four the first version of this fix wrongly broke).
3. Press **Take**, then **Out**, and watch the entrance and exit play.
4. Open the **timeline** dock and confirm it shows editable keyframes, not the read-only
   legacy strip.

## What to look at

- The four corner bugs animate exactly as they always have, and their timeline is still
  editable. That is the thing the first version of this fix broke, and it is why the check is
  here rather than in a test alone.
- If you want the other half: any lower third also plays and keyframes normally. All 504
  catalog designs emit byte-identical code, measured, so nothing else should have moved.

## What I could not answer

Whether the graphics the harness now produces are any GOOD. The round found these faults before
it measured a single design decision, and the blind read of the finished bank is still owed -
the bank is resumable and 3 of 21 cells are recorded.
