---
v: 2
source: derived
kind: finding
raised: 2026-10-02
state: unstarted
found: "a change to the production record (a cue, an added picture) that is changed back still reads Unpublished changes, because the record is compared by timestamp; only library graphic edits are compared by content"
serves: NOW
size: small
touches: src/components/home/usePublishDrift.ts, src/control/hostedControl.ts, src/control/payloadVersion.ts
covered-by: e2e/configured/live-prepare.spec.ts
---
# A cue change that is changed back still reads as unpublished

## Why

AC-5 of `docs/work-specs/studio-day-playout` says editing a library graphic, adding a picture or
changing a cue marks the production as having unpublished changes, and that undoing the change
clears it. Decision D5 says unpublished changes are judged by content. The library half does that:
`usePublishDrift` compares what a publish would write for each graphic against the published
digests, so an edit changed back reads clean again. The record half does not: `recordChanged` is
`show.updatedAt > show.publishedAt`, it is checked first, and every write to the production sets
`updatedAt` to now (`src/model/shows.ts`). There is no undo on the production page, so "undoing" is
the operator changing the cue or removing the picture again, which is another write. The status
then stays amber "Unpublished changes" until a publish that sends nothing new.

This is the safe direction (it never hides a real change), so it costs an operator a needless
publish and a status that says something is pending when nothing is.

## What it would take

Judge the record by the same version hash a publish would write (`ver.h`, R2 of `playout-ready`),
computed from the current production and library, as D5 says, and keep the timestamp only as the
fast path for "certainly changed". Pin it with a configured e2e step: change a cue, see amber, change
it back, see it clear.

## Evidence

`src/components/home/usePublishDrift.ts` (`recordChanged`, and `unpublished: changed || drift`);
`e2e/configured/live-prepare.spec.ts` covers the library edit and its mutation, not a revert. Found in
the convergence review, `docs/work-specs/studio-day-playout/evidence/convergence-review.md`.
