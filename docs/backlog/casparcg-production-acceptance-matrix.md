---
v: 2
source: derived
kind: finding
raised: 2026-09-13
state: parked
note: Consolidates the existing real-production acceptance work; no hardware pass claimed and no new renderer started.
found: Browser and fake-AMCP success do not establish real quiz/scoreboard output and recovery on the facility setup.
serves: NOW
size: standard
needs-owner: none
---

# Record the CasparCG quiz and scoreboard production matrix

**Filed:** 2026-09-13. **Source:** [full-stack plan](../OGRAF_FULL_STACK_PLAN.md), section 6.

## Why

Fall teaching and production use CasparCG. Reliable creation, animation, operator control and
recovery on that real output are more valuable now than selecting a native rendering engine.
The existing Stage 1 hardware acceptance remains open; this defines its evidence more precisely.

## What it would take

Extend existing scenarios in `BRIDGE.md`, `ACCEPTANCE_SPX_CASPARCG.md` and
`PLAYOUT_INTEGRATION.md`. Record installed server/CEF/client/OS versions, channel format,
consumer/card configuration and package hashes. Keep offline template export, hosted output URL
and any future OGraf host as separate paths. Reuse the local NoaCG AMCP agent.

Automate available browser/fake-AMCP legs through the machine queue. Prepare the real-hardware
runbook and route independently when a facility is unavailable; leave those rows explicitly
unrun. Hardware access is a dependency for those rows, not permission to substitute simulation.

## Acceptance and handoff

Student SVG -> fields -> quiz lock/reveal and scoreboard +1/-1 -> one layered production ->
actual output. Exercise rapid update/stop/replay, missing internet on the offline path, fonts,
clear of one target, controller reconnect, output refresh and agent restart. Preserve score and
timer baselines; do not air catch-up history or duplicate actions. Capture actual key/fill edges
and a representative show-duration run on the configured consumer. Link new evidence to existing
owner-queue records; do not create a duplicate claim that the owner has accepted the route.

## Evidence

[Existing connection measurements](../BRIDGE.md),
[matrix and boundaries](../OGRAF_FULL_STACK_PLAN.md#6-casparcg-acceptance-before-a-new-engine).

## Rows added on 2026-09-26, from the owner-queue cleanup

The owner-queue hardware items and three real-server checks were closed into this file, because an
agent on the machine with CasparCG installed can run each of them (`BRIDGE_REAL=1`,
`e2e/configured/bridge-real-server.spec.ts`), and none needs product judgment:

- **Clip Loop on a real server.** Take a short clip with **Loop** ticked and let it pass its end:
  it must restart with no black frame, and Out must stop it. Pinned so far only by
  `cli/test/playout.test.mjs` (the AMCP line) and `e2e/playout-cues.spec.ts` (the page sends
  `loop: true`).
- **The media picker on a deep real library.** Folder rows, cut-off file names and the Add button
  against a server media folder with subfolders; pinned so far against a fake library in
  `e2e/playout-cues.spec.ts`.
- **Two quick +1 presses landed out of order on the CasparCG renderer** in two of three runs of the
  2026-09-22 Bridge walk (PROGRAM showed 4, the channel 3). The renderer follows the same command
  log as every operator page, so this is a finding on the command roads, not on the Bridge.
- **Still unproven on real hardware:** SDI with key and fill, a second machine on the LAN, the
  venue's own box and network, and an SPX server (the `docs/GOALS.md` outcome 5 target).
