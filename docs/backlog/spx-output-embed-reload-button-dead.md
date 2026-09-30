---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The output embed's Reload output button does nothing in SPX: an SPX button runs its fcall in the controller page, where noacgReloadOutput is not defined (docs/SPX_ON_A_REAL_SERVER.md §4)"
serves: NOW
size: small
touches: src/export/outputEmbed.ts
needs-owner: none
---

# The output embed's Reload button is dead in SPX

**Filed:** 2026-09-30. **Source:** measurement on a real SPX 1.4.1 server,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §4.

## Why

A control that does nothing on air is worse than no control: the operator presses it at the
moment something is stuck and learns nothing. The button promises a recovery the file cannot give
in SPX.

## Reproduction

Add the embed to an SPX rundown, open the item, press Reload output. The controller page throws
`ReferenceError: noacgReloadOutput is not defined`; the renderer is untouched.

## Cause

An SPX `button` field's `fcall` is evaluated in the controller page, not in the template's
document. The embed defines `window.noacgReloadOutput` in the template, which the controller cannot
reach. SPX's way into a template, `invokeTemplateFunction`, answers 501 in Solo (read from 1.4.1's
`routes/routes-api-v1.js`).

## What it would take

- Remove the button and its divider, and say in the instruction field that the output recovers by
  itself and that Stop and Play, or the renderer's reload, is the manual way.
- Or, if a manual reload matters: reload when the Output URL field changes, which SPX delivers
  through `update()`, and say so. Either way, a test that the definition has no button whose
  function lives in the template.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §4; SPX 1.4.1 `views/view-controller.handlebars` (the `button`
field renders `onClick="{{fcall}}"` in the controller).
