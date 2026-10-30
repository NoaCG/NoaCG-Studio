# E8.1b: the 60-minute election endurance run

Row 44 of the production-page run (E8.1b, project phase 49), E8 AC-2's endurance part: the
operating envelope run for an hour through `endurance.yml` (`script: endurance:election`,
`minutes: 60`, `local-supabase: true`) and judged by `scripts/endurance-judge.mjs`. The walk is
`e2e/endurance/election-endurance.ts`, the entry `scripts/endurance-election.mjs`, the fixture
and schedule `scripts/endurance-fixture.mjs`.

## The run on the reviewed head

- **Reviewed head:** `e71ff75e35638d5e90108b0308412ffabce936e4`. The commit that adds this record
  touches only evidence files (parent §6), so the run stays the head's evidence.
- **Run:** [40728515115](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40728515115),
  success, "60 min: passed", 3,601 s of 3,600 s. Artifact `endurance-40728515115`
  (`fixture-size.json`, `record.json`, `summary.json`; sha256
  `980db666feba62d9d2164cf1a781013e544a545c7f771d7c410c9468a753736d`).
- **Fixture against the ingress limits, measured before the run:** 1,000 candidates at revision
  737 (the run's minutes plus ten). Request body 150,834 bytes; the payload as Postgres measures
  it (octet_length of its jsonb text, as migration 0102 does) 164,530 bytes; cap 262,144
  (256 KiB, E4). Headroom 0.425. The largest revision accepted during the run was 164,525 bytes.
- **The envelope as run:** a source step every 5 s; a cue switch every 15 s (240 Takes); the
  provider's duplicate, older and malformed steps on a fixed schedule; in each ten-minute cycle a
  30 s Pause, a controller reload, a 20 s output disconnect and a reader handover (release and
  crash in turn, six in all); a foreign typed action through E6 every 60 s, every fifth sent twice
  with one id and keyed to an instance not on air.

Every one of the verdict's 44 checks passed (`summary.json`). Among them: no unhandled error; no
wrong-person frame in 4,478 output frames; one play row per Take (240 for 240); every foreign
action ran once, the duplicate once, the one keyed elsewhere refused as stale ("the cue on Board
changed"); epoch and accepted revision never went back, and every handover moved the source to a
newer owner (1 to 7) while each woken old owner was refused; Pause held every graphic and Resume
sent one row per moved graphic; the output went dark and caught up within 20 s of each reconnect
(139 to 193 ms); the scorebug clock counted 3,599 s over 3,598 s with no gap over 30 s; 0 of 501
published revisions stalled; the count bug followed 39 of 39 counts within 15 s; and no value
applied in a steady moment failed to reach the output in time.

## Steady-state windows

Six ten-minute windows; the first is warmup. Medians after a forced garbage collection:

| Series | 10-20 | 20-30 | 30-40 | 40-50 | 50-60 min |
| --- | --- | --- | --- | --- | --- |
| controller heap (MB) | 68.7 | 68.8 | 69.2 | 68.9 | 69.4 |
| output heap (MB) | 19.43 | 19.52 | 19.62 | 19.71 | 19.80 |
| controller nodes / listeners / documents | 9,050 / 347 / 10 | 9,050 / 347 / 10 | 9,051 / 347 / 10 | 9,050 / 347 / 10 | 9,050 / 347 / 10 |
| output nodes / listeners / documents | 1,087 / 113 / 11 | same | same | same | same |
| agent RSS (MB) | 146.6 | 135.5 | 142.3 | 136.0 | 154.0 |

**Reading.** DOM nodes, listeners and documents are flat on both pages. The controller's heap is
flat inside each ten-minute lifetime between reloads (67 to 71 MB), and the agent's RSS stays
inside its allowance in every lifetime (128 to 153 MB; it restarts at each handover). Queue depth
held at its bounds: provider reads in flight at most one per source over 361 samples, the agent's
requests at most a report, a renewal and a sample, the controller's tree reads in flight 2 to 3
and back to none, and subscriptions and graphic instances (9 to 9) back at baseline after every
reconnect and reload.

The **output page's heap** rises in every window, by 0.37 MB (1.9%) across the steady span, a
fitted 10 KB a minute. That is inside the check's thresholds (20% plus 2 MiB, and 5% for a rise in
every window). The two earlier full hours show the same rise at the same rate (19.28 to 19.67 MB
and 19.19 to 19.57 MB, about 10 KB a minute each), so it is a real, repeatable slope, not noise.
It is the only series that moves one way. Carried forward it is about 14 MB a day: inside this
hour's envelope, and named as an open finding for a longer run, not counted as a pass of one.

## Timings, each road on its own (ms)

| Road | n | p50 | p90 | max |
| --- | --- | --- | --- | --- |
| Take dispatch (click to play row) | 183 | 442 | 740 | 1,346 |
| Take to air | 183 | 654 | 942 | 1,466 |
| fetch to apply | 483 | 2,137 | 4,153 | 4,233 |
| provider move to apply | 483 | 2,639 | 4,794 | 6,110 |
| apply to render, bound field | 484 | 155 | 292 | 6,555 |
| provider move to render, bound field | 484 | 2,833 | 5,047 | 9,824 |
| apply to render, candidate card | 388 | 433 | 610 | 1,142 |

Ceilings (E7.2b's): a Take on air within 10 s, a bound field within 10 s of the provider's move,
a candidates-only change within 13 s. Parent §7's laptop comparison is not measured here (O-1).

**Excluded** (the value starts inside a fault that stops its road, or has under 2 s of room before
one): dispatch 57, fetch and provider to apply 45, bound render 44, card 74 plus 66 with under 2 s
before the next Take or a stopping fault. Each road is excused only by the faults that stop it:
applying by a Pause or a handover; a bound field already applied by an output disconnect; the card
by a disconnect or a reload (the page holds its correction after a reload until the next Take); a
Pause does not excuse the card.

**The slowest judged bound value (9,824 ms, apply to render 6,555 ms) is an open finding.** The
Party totals row applied at 2,044.4 s, during the controller reload of 2,043.0 to 2,045.1 s, was
never shown by the output: it kept 277,440 until the next row (applied 2,050.6 s) put 277,760 on
air at 2,051.0 s, and no `live` report was written for 277,600. A reload does not stop the
output, so the judge holds the value to its ceiling, and the next value met it. Across the three
full hours (this run, 40701982013 and 40713433712), it is the only applied value the output never
showed outside an output disconnect: once in 18 reloads. Within the envelope it passes; for a
final value with no next update it would be a stale field, so it is passed to the coordinator as
a finding on the output's delivery during a controller reload, not excused.

## Run 40713433712's miss at 3,362,835 ms, and why the judge changed

That run (head `c426c3ea`) failed one check on one value:
`{"road":"candidates","at":3362835,"person":"Sara Example","want":1903,"room":12214}`. From its
record (times from t0, in ms):

- 3,362,835: the agent applies a Party totals row (the card is judged from board rows).
- 3,363,042: the scheduled output disconnect begins, 207 ms later; it ends at 3,383,114.
- 3,363,085: the page writes Sara's card update with 1,903, 43 ms after the output went offline.
  Sara's Take was at 3,360,167, and 1,902 went live at 3,361,508.
- The output never shows 1,903: every Sara frame up to 3,382,632 shows 1,902.
- 3,375,049: the next Take (Aino) replaces the card while the output is still offline.
- 3,383,232, 118 ms after the reconnect: the output shows the current state (Aino 5,384), and the
  reconnect check passes.

The page sent on time and the output was offline by schedule: neither was at fault, and it was not
a late card. The `c426c3ea` judge excused a value only if it was applied inside a fault's window,
so it owed this one to the next Take, straight through the disconnect. The judge now owes each
road's value until its own ceiling or the start of the first fault that stops that road,
whichever is first. Here that is 207 ms, under the 2 s minimum room, so the row is counted apart
as an exclusion, not passed. Run on that record, the current judge passes it with 0 failed
checks.

This is not a widened excuse. The disconnect is a scheduled envelope fault and the reconnect check
judges it. A value whose deadline passed before a fault began is still owed (a red test). A Pause
no longer excuses the card, and the 2 s room is about twice the slowest card render seen (1,142
ms). No ceiling (dispatch 10 s, bound 10 s, candidates 13 s), recovery bound (20 s), record count
(1,000), cadence (5 s) or 60-minute schedule changed: `schedule(60)` is byte-identical between
`c426c3ea` and the reviewed head. An independent `/so` on exactly this point read that record and
found it the honest reading, not a late card.

## Every check can fail

`scripts/endurance-judge.test.mjs` builds a healthy 40-minute record as the walk writes one and
turns every check red with the defect it names, each failing exactly the check it names; healthy
records of 15, 25 and 30 minutes pass. With `scripts/external-data-connector.test.mjs`, 141 tests
pass. Among the mutations: a double play, a wrong person on the card, an older revision on air, a
foreign action run twice, an old owner's write, a Pause that lets a row through, a Resume that
sends twice, an output that never reconnects, a clock that resets or goes unreadable, an agent
that stops reading, a stalled source, a stuck count bug, a correction that never renders, a bound
value missed 11 s before a disconnect (the bound road looks ahead its own 10 s), a value whose
deadline passed before a fault, a stall around a reload, memory never measured, memory rising in
every window, and a credential in a log. Against the product on the local stack, a doubled play,
a throwing output and a slowed candidate road each failed the run.

A run shorter than 15 minutes is refused before anything starts: below about 12 minutes too few
steady values are owed for the verdict to judge memory, the count bug and freshness.

## Departures from the envelope's wording

- **No clips.** The election package has none; clip playout is E5's and judged there.
- **A quiz beside the scorebug clock, with no reveal.** The AC-2 reveal rests on
  `e2e/production-data.spec.ts:933`.
- **Pause by its database call** (`control_data_pause_by_slug`), the route the page's own control
  uses, not by clicking it.
- **Cue switches by page click**, every 15 s.
- **The foreign action keyed elsewhere targets a cue never aired**, so it is stale by construction
  and checked to be refused with its note.
- **Unknown legality is not exercised** here; E8.1a covers it.

## Residuals

- The Board's event count is not tied action by action to the foreign actions sent.
- A malformed step is checked to be served and held, not paired to its own invalid read line.
- What is not measured, as the verdict prints it: a leak slower than its allowance that a cycle's
  reload or restart clears (judged within each ten-minute lifetime); the Vite dev server that
  hosts `/api/data/source`; Postgres and the rest of the local stack; the replay server (recorded
  as driver RSS, not judged); the output page's own request backlog; parent §7's laptop timing
  comparison (O-1).
- The output's dropped value during a controller reload, and its slow heap rise, above.

## What the full hours found in the judge

Three full hours ran before this one passed. 40701982013 (`b49303e0`) failed on two
misattributions: a Take's correction timed from the Take's air rather than its click, and a woken
old owner's expected "the sender failed" line. 40713433712 (`c426c3ea`) failed on the card value
above. Both are recorded with what changed, and both records pass under the current judge with
no failed check. The two runs on `b52cbf95` and `cdf2e5a5`, and the ones on `c07c9c5e` and
`75a99e0d`, were cancelled when a review changed the judge; none was judged.

## Review

`/so` grades, in order: A on `b49303e0`; A- on `b13359eb`, fixed; A on `c426c3ea`; B+ on
`8f250530`, fixed; A- on `b52cbf95`, fixed in `cdf2e5a5`; A- on `cdf2e5a5` (a Pause excused the
card), fixed in `c07c9c5e`; A- on `c07c9c5e` (a run under 3.75 minutes hung), fixed in
`75a99e0d`; A- on `75a99e0d` (a 1 to 2 minute run could only fail), fixed in `e71ff75e`; **A on
`e71ff75e`**, the reviewed head. A separate `/so` on the 3,362,835 ms point agreed with the
reading above. The Codex review bot found no issues on `e71ff75e`; every earlier finding was fixed
and its thread resolved, the Ticker one answered (editorial in this package: nothing binds it).
