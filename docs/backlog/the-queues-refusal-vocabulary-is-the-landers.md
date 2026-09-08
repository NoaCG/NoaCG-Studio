---
v: 2
source: derived
kind: finding
raised: 2026-09-08
state: unstarted
found: "scripts/jobs-store.mjs still classifies landing refusals by kinds only the retired laptop lander ever printed, and only one of the reading paths can still fire"
serves: NEXT
size: small
touches: scripts/jobs-store.mjs, scripts/night-report.mjs, scripts/land-watch.mjs
needs-owner: none
---

# The queue's refusal vocabulary is still the retired lander's

`classifyRefusal` reads a finished landing's log and names WHY it refused. It has three readers:
`REFUSAL_MARKER`, which is the literal string `auto-merge REFUSAL-KIND:`; a regex for the
merge-order block; and one for the pin, which this row re-pointed at `land-watch.mjs`'s wording.
`refusalSentence` then has a sentence for seventeen kinds.

Only the pin one can fire now. `land-watch.mjs` prints no marker, and both `ORDER_BLOCKED_REFUSAL`
and `SHARDS_SKIPPED_REFUSAL` name gates the merge queue does not have: order is queue order
(`contracts/retired.json`, "merge-order verdicts as a landing gate"), and the queue runs `ci.yml`
on the merge group, so a run that skipped every shard is the group's problem rather than a local
refusal a sweep re-dispatches.

## Why it is filed rather than fixed

The retry paths for those two kinds are live code with their own measured reasons - the twelve-hour
ordering hold, the one full-suite dispatch - and pulling them out changes how the queue recovers,
not what a thing is called. It wants its own row: decide what `land-watch.mjs` should state about a
refusal in a machine-readable line, keep the kinds that survive, and delete the rest with their
sentences and their retry arms in one commit.

## What is safe until then

Nothing lies to a reader. An unrecognised refusal classifies as null and gets the generic sentence,
which is the honest answer for a job record written by tooling that no longer exists - and old
records on disk still carry these kinds, so their sentences are still read.
