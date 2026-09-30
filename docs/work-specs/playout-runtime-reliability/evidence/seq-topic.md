# The numbered log on its own topic: a Presence close costs no Take, a failed first join heals in seconds (D-s, D-w)

2026-09-30, preview branch B. Never production.

## What was applied to B, exactly

B carried 0068 (the version on `claude/p6-step1-presence-migration` at 59f798a3e, whose policies
are main's; only its timeouts differ), 0069, and the sequence file as it was (then named 0070,
frames on `live-`). Through the Management API, B only, with the scratch runner `step2/sql.mjs`:

1. `supabase/migrations/0070_seq_topic.sql` as committed (9a669d51b): the `seq_topic_readable`
   policy and its self-check. Answered 201.
2. A dry run, rolled back: every Step 2 object dropped (both triggers, the report function, the
   `seq` column, `control_heads`), then 0069, 0070 and 0071 applied whole as they are in the tree,
   then a probe. Reached the probe (`reapply-reached-end`) with every self-check passing.
3. In one committed transaction: 0071's column comment, `control_events_frame` as committed (it
   sends the frame to `seq-`), its revoke, and 0071's whole self-check block. Answered 201. The
   self-check wrote a throwaway production's Take and counted 1 `seq-` frame, as the tree's file
   asserts.

B's policies on realtime.messages afterwards: `control_commands_readable`, `control_log_readable`,
`live_topic_readable`, `live_topic_presence` (INSERT, Presence only) and `seq_topic_readable`.
`control_events_frame`'s definition names `seq-`. Earlier the same day, the review-2 changes to
`control_send_seq`, `control_output_report_seq`, `control_head_legacy` and `control_tail_seq_for`
had been applied the same way (`review2-sql.md`).

## What ran

Job j-2558, `e2e/configured/command-sequence.spec.ts` on B with this branch's app (abb6c01), among
the other configured specs:

- "a Presence channel closed by the server mid-burst costs the renderer no Take": a renderer on
  the production, its Realtime socket routed through Playwright. After the first of five Takes
  (Take, then Out, 800 ms apart), the test sent the page the server's close of its `live-`
  channel: a `system` message "Client presence rate limit exceeded", then `phx_close`, with the
  channel's own join ref. The renderer's debug line went to "presence: NOT JOINED"; every Take was
  timed from the click to the renderer's `data-plays` moving.
- "a renderer whose first numbered join fails joins again within seconds, and a Take reaches air":
  the renderer's first join of `seq-` answered with an error reply; once the debug line read
  "realtime: NOT JOINED", the operator pressed Take.

Job j-2563: the quick-rejoin test with the fix taken out (mutation): the first retry at 15 s.

## What was observed

- Presence close: passed. All five Takes aired within 2 s of the press (the assertion's bound),
  the close was delivered once, and the renderer kept "realtime: following" on `seq-` throughout.
  With the frames on `live-` (tip 9b72891, the orchestrator's A/B run), the same kind of close
  left a third of the Takes during the rejoin gap unplayed.
- Quick rejoin: passed. The refused join was the only one, and the Take reached air in under 8 s
  from the press (the bound), which only the 1 to 5 s first retry and its refill can meet.
- Mutation (j-2563; j-2562 never ran, its test filter broke on the shell): with the first retry at
  15 s, the quick-rejoin test failed on its bound, the Take reaching air 16,010 ms after the press
  (the 15 s retry and its refill). The fix restored, the test passes (j-2558).

## Limitations

- The close was injected at the page's socket, not produced by Realtime's own limiter; what
  Realtime does to the other channels on the socket when it closes one for Presence is its
  behaviour, and the A/B run observed only the `live-` channel close.
- Five Takes, one renderer. The latency of the numbered road against the id road is the
  orchestrator's A/B measurement (K13).
