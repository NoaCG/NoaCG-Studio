# Relevant playout health and clear publishing

## Why and goal

Feedback points 1 and 2: an unused Bridge must not make a browser production look broken,
and the operator must understand what publishing does and what an extra readiness check adds.
Serve `docs/GOALS.md` outcome 5 with one workflow and no manual output mode.

## Non-goals

No changes to rundown editing, audio, undo, cue labels, output rendering or command delivery.
No automatic publishing, loading a CasparCG layer, or combining publishing with going on air.

## Decisions

- Infer Bridge relevance from server cues, known output engines/names, the output slot, and
  successful Put on air activity. A configured studio without any known browser output still
  intends CasparCG. Remember successful CasparCG output activity per production and target in
  existing local readiness memory so a lost Bridge and a reload do not erase intent. Successful
  Take off clears that activity. This adds no operator setting.
- A browser output plus server cues needs Bridge health but no unused graphics-slot warning.
  A browser output with no CasparCG activity/cues needs only its output health. Missing expected
  browser outputs remain visible through existing READY memory.
- Publish validates the production structure, snapshots graphics and embedded assets to the
  persistent output URL, and asks open outputs to prepare changed graphics. Output warm checks
  report scripts, fonts and images on the actual host. Publish success does not promise that
  an output is connected, that every asset loaded there, or that it is on air.
- Keep the deeper optional action as **Check readiness**: it can publish changes (said before
  pressing), rechecks outputs, pings the command path and checks relevant Bridge/server items.
  Keep the existing wire requests, stamps and safe version isolation. No new background ping
  or preparation mechanism. This contained change leaves combining actions for later.

## Observable acceptance

1. A known browser-only production with stale paired Bridge settings has no Bridge/slot fault,
   including its optional readiness check. No manual playout mode is offered.
2. A configured studio without browser evidence, server cues, or a previously aired CasparCG
   output keeps its relevant failure visible, including after reload and with an OBS output.
3. Mixed browser graphics/server media checks Bridge health without reporting an unused output
   slot; mixed browser/CasparCG graphics shows both relevant health signals.
4. The panel says published changes are available to outputs, explains automatic asset checks
   and safe version movement, and calls its extra action Check readiness with its added guarantees.
5. Existing publish/prepare, older outputs, image health and on-air version isolation checks pass.
   Capture and judge desktop and phone panel screenshots; record any unavailable host proof.

Revert: remove the relevance helper/call sites and optional readiness-memory field; restore
the old display words. Existing production records and output protocol are unchanged.
