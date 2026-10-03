---
v: 2
source: derived
kind: finding
raised: 2026-10-03
state: unstarted
found: "Prepare for Live checks that nothing is on air, then awaits a fetch of the output's own URL, then reloads without checking again, so a Take that lands during the fetch is cut by the reload."
serves: NOW
size: small
touches: src/output/prepare.ts, src/output/main.ts
needs-owner: none
---

# A Prepare for Live reload can cut a Take that lands during its probe

**Filed:** 2026-10-03. **Source:** the adversarial review of
[`work-specs/live-safe-migrations/spec.md`](../work-specs/live-safe-migrations/spec.md) L12.

## Why

An output must never reload itself while something is on air. Prepare for Live reads `onAir()`
(`src/output/prepare.ts:144-148`) and, when it is zero, calls `opts.reload()`, which is
`reloadIfServed` in `src/output/main.ts:138-149`: it awaits `fetch(window.location.href)` and then
calls `window.location.reload()` with no second look. A Take that reaches the output during that
round trip goes on air and is wiped a moment later. The window is one network round trip, and the
moment Prepare runs is by design a moment an operator may Take.

## What it would take

Read `onAir()` again after the fetch answers, immediately before `location.reload()`, and report
"waiting" when it is no longer zero. A unit test with a Take injected while the probe is pending;
the spec's AC-15 carries the same case end to end.

## Evidence

Code read at `358cb5035`: `prepare.ts:144-149`, `main.ts:138-149`.
