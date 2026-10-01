---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: parked
note: "owner, 2026-10-01: not now; NoaCG graphics stay on the output slot unless several channels turns out cheap. Server media got Channel and Layer instead (docs/work-specs/studio-day-playout)."
asked: "NoaCG graphics on channel 2 would be very useful if technically reasonable; later: not asking for it now if it needs the heavier multiple-renderer architecture (paraphrase)"
---
# NoaCG graphics on more than one CasparCG channel

**Filed:** 2026-10-01. **Source:** the owner's studio-day feedback and his answer to question 1.

## Why

A studio with a key channel (into an ATEM DSK) and a fill channel (a normal input) may want a NoaCG
lower third on one and a NoaCG full-frame card on the other at the same time. Today every NoaCG
graphic draws inside one output page on one slot, so a graphic cannot pick its channel.

## What it would take

One output page per channel: `/output?production=<slug>&ch=2` builds only the graphics assigned to
channel 2 (an additive `channel` on each graphic of the published payload), Put on air loads an
output on each channel the production uses, READY counts each as its own output. The command path
needs no change: an output ignores a graphic it does not hold. Pictures would pick a channel per
picture group, as the layer works. Costs: one more renderer per channel, a channel pick on every
graphic, per-channel Prepare for Live.

## Evidence

`docs/work-specs/studio-day-playout/spec.md` (owner decision 1); the channel investigation of
2026-10-01 (`src/output/main.ts` reads no filter; `docs/BRIDGE.md` says a second output page on
another channel is a later slice).
