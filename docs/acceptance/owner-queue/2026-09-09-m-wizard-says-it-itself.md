---
kind: walk
date: 2026-09-09
serves: now
---
# The import wizard now says the three things only the guide said

Walking the SVG import road cold, to write the `#first-graphic` guide on `/docs`, turned up three
places where the screen needed a sentence it did not have. Your standard from 2026-09-03 is what
they were measured against: "Of course, it should be so intuitive that you can just use it without
reading anything." All three are on the screen now, each pinned by a case in
`e2e/import-svg.spec.ts`, and the file that filed them is deleted.

## The route, all three in under a minute

`/app` — press **Import graphic**, and before dropping anything read the header: **STEP 2 / 6**,
with **Prepare** and **Text** in the rail. Drop `docs/svg-samples/scorebug.svg`.

**1. Why the rail just renumbered.** The header is now **STEP 2 / 5** and two step names have
changed. Under "7 text layers found" on the Your design card:

> Five steps now, not six: an SVG has nothing to erase and its text is already placed, so Prepare
> and Text became the one Fields step.

Before, six steps became five under your hands with nothing on screen accounting for it.

**2. The alignment grid says its answer.** Press **Next**. Every text row's third control used to
be a 3x3 of unlabelled dots under the bare word `Aligned`; the answers were reachable only by
hovering one cell at a time. Each row now reads **ALIGNED left, middle** (or whatever that row's
drawing says), in the chosen dot's own words. Click a different dot and the words follow it. Press
the ⓘ beside **Editable text** for the part a row cannot afford to repeat seven times: what the
grid decides, and which of the two dot styles you are looking at.

**3. Two name boxes, two different names.** Press **Next** twice to reach Finish. Leave both name
boxes empty and choose **＋ New production…**. The production box's placeholder now reads
**Untitled production**, not the graphic's name, and the line under the picker says what a
production is called: "Name it for the show, like Friday Show or Class Quiz, not for this graphic."
Press **Add to the production**. The confirmation reads "**Imported SVG design** goes into this
production: **Untitled production**". Before, both of those were "Imported SVG design", and a
library that had been used for a week held three productions with graphic names on them.

Confirm it and the production page carries both names: the show, and the one graphic in it.

## What to look at

The third one is the only one that changed behaviour rather than copy. `Untitled production` was
already the app's answer for an unnamed production everywhere else, and the wizard was the only
door that never let that answer be reached. It is deliberately plain: a default that reads as a
deliberate name teaches nothing, where one that reads as "you have not named this yet" is the
invitation to name it. Say so if you would rather it guessed something warmer.

The second one was measured before it was written, because the mapping step has an exact
rows-on-screen budget: the answer takes the alignment column from 52 px to 112 and the two text
boxes from 165 px to 135 at 1280x720, and all seven scorebug rows still arrive whole at both pinned
window sizes.
