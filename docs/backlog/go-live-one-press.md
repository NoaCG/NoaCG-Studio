---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: parked
note: "owner, 2026-10-01: later, once publishing, putting on air and preparing are proven separately in the one Playout panel (docs/work-specs/studio-day-playout)"
asked: "a Go Live convenience action that safely orchestrates the existing operations, but not yet (paraphrase)"
---
# A Go live press that publishes, puts on air and prepares

**Filed:** 2026-10-01. **Source:** the owner's answer to question 3 of the studio-day follow-up.

## Why

Going live takes three presses (publish, Put on air, Prepare for Live). One press would remove the
last setup friction, but each step fails differently and publishing has a cost, so the owner wants
the separate steps clear and reliable first.

## What it would take

One action in the Playout panel that runs the three existing operations in order, stops at the
first failure and says which step failed, and never retries a publish by itself.

## Evidence

`docs/work-specs/studio-day-playout/spec.md`, owner decision 4.
