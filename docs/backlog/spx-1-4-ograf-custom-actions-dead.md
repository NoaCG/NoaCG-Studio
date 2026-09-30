---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "SPX 1.4.1 turns each OGraf custom action into a button that throws customActionHandler is not defined, so NoaCG's quiz and scoreboard actions cannot be used from SPX; every button also names layer 1 (docs/SPX_ON_A_REAL_SERVER.md §3)"
serves: NOW
size: small
touches: src/export/targets/ograf.ts
needs-owner: none
---

# OGraf custom actions do nothing in SPX 1.4.1

**Filed:** 2026-09-30. **Source:** measurement on a real SPX 1.4.1 server,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §3.

## Why

A NoaCG quiz reveals its answer and a scoreboard starts its clock through custom actions. In SPX
1.4.1 each shows up as a button, which invites the operator to press it on air, and nothing
happens. The OGraf package should say so rather than let the operator find out live.

## Reproduction

Import Clean Quiz's OGraf package into an OGRAF-format SPX 1.4.1 project, set its layer, play it
and press Reveal correct: the controller throws `ReferenceError: customActionHandler is not
defined`. The same for every custom action button.

## Cause (SPX's)

The importer writes `fcall: customActionHandler('<id>', '<layer>')`
(`routes/routes-application.js`), and no file in SPX 1.4.1 defines `customActionHandler`. The
layer in the call is `v_spx.webplayout || "1"` from the manifest, never updated afterwards, so
every NoaCG button says layer 1 while the graphics it belongs to played on 2 and 3; even once the
function exists it would reach the wrong graphic. A `v_spx` layer in the manifest
(`ograf-package-does-not-play-in-spx.md`) fixes the import-time value only. The renderer side exists
(`case 'customAction'` calls `customAction({ id })`, without a payload).

## What it would take

- In the OGraf package's README, a short "In SPX 1.4" section: custom actions do not work there
  yet; a stepped graphic's Continue does, and fields reach the graphic on Play.
- Recheck on the next SPX release, and note there that SPX sends no payload, so an action that
  needs one (the quiz's Select answer) will need its value from a field.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §3.
