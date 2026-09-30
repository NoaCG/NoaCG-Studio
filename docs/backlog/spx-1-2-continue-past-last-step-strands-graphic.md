---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "On SPX 1.2.1 a Continue past a NoaCG graphic's last step marks the item stopped in the controller while the graphic stays on screen, so Stop is no longer offered for it; on 1.4.1 the same press takes it out (docs/SPX_ON_A_REAL_SERVER.md §2)"
serves: NOW
size: small
touches: src/export/targets/spxStarter.ts
needs-owner: none
---

# One Continue too many strands a NoaCG graphic on SPX 1.2

**Filed:** 2026-09-30. **Source:** measurement on a real SPX 1.2.1 server,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §2.

## Why

Pressing Continue once more than the graphic has steps is an ordinary operator slip. On SPX 1.2 it
leaves a graphic on air that the rundown says is off, and the operator's Stop button now reads Play.

## Reproduction

On SPX 1.2.1, play Clean Quiz from the native export (`steps: 2`), press Continue twice: the answer
is revealed, then the controller shows the item as stopped (`data-spx-onair=false`) while the
renderer still shows the quiz. The walk did not try a recovery. On 1.4.1 the second Continue sends
`stop` (`nextItem` in `static/js/spx_gc.js`) and the quiz plays out.

## What it would take

- Find out what 1.2.1 sends on that press (its renderer's socket messages): a `next` that our
  `next()` ignores at the last step, or a `stop` our template does not act on.
- If it is a `next`, decide whether a NoaCG template should play out on a `next` past its last step,
  as 1.4 does from the controller side, and pin it for the SPX export.
- Either way, the SPX README can say: on SPX 1.2, use Stop, not a further Continue, to take a
  stepped graphic out.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §2 (the Continue row).
