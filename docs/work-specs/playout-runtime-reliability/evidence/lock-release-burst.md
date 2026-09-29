# The lock-release burst ends on the operator's last press (AC-13, AC-15's row shape)

2026-09-30, preview branch B (migrated with 0069, the live- read policy and 0070). Never production.

## What ran

Job j-2462 through the machine's job queue: the scratch script `step2/verify-b.mjs --scenarios
burst` (session scratchpad), through the preview-branch wrapper with `branch-b.env`. The app was
this branch's worktree (Vite, Chromium from its Playwright), one new `/output?...&debug=1` and one
new hosted control page on the harness production `p6-harness main`, House Scorebug's cue selected.

Per trial: air cleared; a 15 s hold started through the Management API (`begin; <hold>;
pg_sleep(15); commit;`); from 1 s after it began, the operator pressed Take and Out alternately
every 700 ms until 14.3 s (17 or 18 presses); 9 s after the hold ended, air (opaque pixels of the
output page), the server's summary for the graphic (`control_show_resolve`) and the operator's
chip and notice were read. Three trials of each hold:

- **heads**: the production's `control_heads` row held by an ordinary UPDATE. This is the new
  send's own lock, so it is the worst case for the new path: every press waits for it.
- **shows**: the production's `control_shows` row held by an ordinary UPDATE, the research §5.3
  shape (a publish or a renderer report). Before Step 2 every Take and Out failed after about
  3.1 s under it and the ones waiting at the release aired in any order.

## What was observed

| Hold | Trial | Presses | Last press | Air at the end | Server `on` | Chip | Send answers | Slowest send |
|---|---|---|---|---|---|---|---|---|
| heads | 1 | 18 | Out | nothing (0 px) | false | nothing on air | 9x 200, 9x 500 (55P03) | 2,164 ms |
| heads | 2 | 18 | Out | nothing | false | nothing on air | 9x 200, 9x 500 | 2,158 ms |
| heads | 3 | 18 | Out | nothing | false | nothing on air | 9x 200, 9x 500 | 2,079 ms |
| shows | 1 | 17 | Take | graphic up (104,430 px) | true | on air | 17x 200 | 128 ms |
| shows | 2 | 17 | Take | graphic up | true | on air | 17x 200 | 183 ms |
| shows | 3 | 18 | Out | nothing | false | nothing on air | 18x 200 | 203 ms |

- Every trial of both holds ended on the operator's last press, on air and on the server, and the
  operator's chip agreed. No notice was left on the page at the end.
- Head held: presses waited at most the send's own 2 s lock timeout, answered 55P03, and were
  sent again (the send is idempotent); the per-graphic queue let the next press leave after
  1.5 s. When the hold released, the presses still in flight landed in whatever order the lock
  gave them, and the server's chain rule refused any earlier press arriving after a later one, so
  none could put the graphic back.
- Row held (the §5.3 shape): no send waited for it. 52 of 52 answered 200 while the row was held,
  the slowest in 203 ms: the new send takes the row only at KEY SHARE, which an UPDATE's NO KEY
  UPDATE does not block.

## Limitations

- One operator page. Two operators pressing into the same held head are covered by the stale
  rule (`two-senders-race.md`, `e2e/configured/command-sequence.spec.ts`), not by this run.
- With the head held, half of the presses of each trial answered 55P03 before landing on a
  resend; an operator would have seen "the server did not answer" notices during the hold. That
  is the honest ending of a 15 s stall of the production's own head, and nothing in production
  holds a head for more than a send.
- The hold was a Management API transaction; its end is known only to about the API's round trip.
