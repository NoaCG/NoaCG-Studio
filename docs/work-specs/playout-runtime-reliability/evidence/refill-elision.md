# A renderer that missed frames heals from one read and animates only the final entrance (AC-16)

2026-09-30, preview branch B (migrated). Never production.

## What ran

Job j-2462, scenario `refill` of the scratch script `step2/verify-b.mjs` (session scratchpad),
through the preview-branch wrapper with `branch-b.env`, this branch's app. Three trials, each:

- A new `/output?...&debug=1` on `p6-harness main` with its Realtime WebSocket routed through
  Playwright (`page.routeWebSocket`), which forwards every server frame except, while "dropping"
  is on, the `batch` frames of the `live-<show>` topic. The socket itself stays up, so nothing
  but those frames is missed and no rejoin refill happens.
- A new hosted control page; air cleared first.
- Dropping on; the operator pressed Take, Out, Take on House Scorebug 1.2 s apart; dropping off;
  the operator pressed Update. The Update's frame arrives with a gap in front of it, which is what
  starts the refill.
- 4 s later: the renderer's `data-plays` (entrances it animated), its opaque pixels, how many
  `control_output_tail_seq` reads it made, its debug `last row`, and the server's head seq.

## What was observed

| Trial | Frames dropped | Entrances animated | Tail reads | Air | Renderer last row / server head |
|---|---|---|---|---|---|
| 1 | 3 | 1 | 1 | graphic up (104,430 px) | 376 / 376 |
| 2 | 3 | 1 | 1 | graphic up | 390 / 390 |
| 3 | 3 | 1 | 1 | graphic up | 404 / 404 |

- Each trial healed with exactly one tail read and ended level with the server's head.
- The two Takes and the Out in between arrived in one refill; the first Take's entrance and the
  Out's exit were not animated (a later play/stop of the same graphic replaced each), every row was
  still applied, and the graphic ended on air with one entrance. Without the elision the same
  refill animates two entrances and an exit on air.
- The Update's frame, held while the gap in front of it was open, was covered by the refill's
  answer; the renderer's cursor ended on the server's head. (That it was not applied twice is the
  follower's and the oid claim's job, asserted in `scripts/seq-follow.test.mjs`, not measured here.)

## Limitations

- The frames were dropped in the browser, not lost on the network: the socket stayed joined. A
  real drop also goes through the rejoin refill (spread over up to 5 s); that path is the same
  follower code and is covered by `scripts/seq-follow.test.mjs`, not by this run.
- Only play/stop elision was exercised. That an `event`, `next` or `snap` between them keeps both
  animations is covered by the unit tests only.
- Pixels were counted, not compared to a reference frame: "up" means the stage painted the
  graphic, not that it painted the right data (the Update's data, here).
