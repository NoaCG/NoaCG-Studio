# The third review's fixes: per-graphic supersession, the panic mark, spread re-banks (D-t, D-x, D-y)

2026-09-30, preview branch B. Never production.

## What was applied to B, exactly

Through the Management API, B only, with the scratch runner `step2/sql.mjs`:

1. A dry run, rolled back: every Step 2 object dropped, then 0069, 0070 and 0071 as committed
   (2023c9795) applied whole, then a probe. Reached the probe with every self-check passing,
   including 0071's new steps: a late press on two graphics leaves the re-pressed one out and
   applies the other ((j2)); an All out leaves its panic mark, a press made before it is refused
   whole and writes nothing, a press after it applies ((j3)); the client insert policies pass
   0068's allow-list.
2. `panic-column-b.sql`: 0069's new column `control_heads.panic jsonb not null default '[]'` and
   its corrected table comment (0069 is applied nowhere else).
3. `supabase/migrations/0070_seq_topic.sql` again, whole (its allow-list check).
4. In one committed transaction: `control_send_seq` as committed, its grant, 0071's column
   comment and 0071's whole self-check block. Answered 201.

## What ran

Job j-2583 on B, this branch's app (02781e859's code, before its commit):

- `e2e/configured/command-sequence.spec.ts`, all six tests. The multi-batch test now has three
  parts, each driven through the operator page's own send module: (A) All out over five layers
  in two batches, the first held while the operator re-takes L5 (in the second), with an
  `applyHere` that records what the page's monitor was given; (B) an Out of nine graphics, not
  All out, in three batches, the first held while M6 (in the second) is re-taken; (C) a press on
  H held, a press {Take G, Update H} queued behind it, and an All out of H landing first.
- A temporary probe, not committed: two renderers on a production whose stage carries 26
  graphics, each holding a report banked at the head; 520 command rows written with no renderer
  open (a feed all day); the cap's 5 s let run out; both renderers booted, and a Take pressed 2 s
  after both followed. Then the production republished (its row deleted and inserted again, the
  log and head going with it), the new log's first row written, the operator page reloaded and a
  Take pressed. The `live` rows written in the 25 s after each were counted, with the most in any
  5 s.

## What was observed

- `command-sequence`: 6 of 6 passed.
  - (A) The All out answered `skipped: ["L5"]`; the recorded monitor held `L5:play` and never
    `L5:stop`, and did take `L1:stop`. Air: L5 on, L1 to L4 off.
  - (B) The Out answered `skipped: ["M6"]`, `superseded: []`. Air: M6 on; M1 to M5 and M7 to M9
    off (the second batch's other three Outs applied).
  - (C) The queued press answered `superseded` for G and H; G never aired; H went off.
  - The late Take (held 6 s, Out 1.5 s behind it) is now answered `ok` with `skipped: ["House
    Scorebug"]` and still writes nothing and never airs.
- Burst probe: the Take 2 s after the two renderers booted answered ok, as did the Take after the
  republish. After the boot, 28 report rows in 25 s, all within 5 s: those are the boot's own
  state reports (a graphic reported when the renderer first sees its state), not forced ones, and
  the send cap no longer counts them. After the republish, 27 report rows (26 graphics plus one;
  one renderer banked each graphic for both) spread over the forced delay, at most 14 in any 5 s.

## Limitations

- The monitor half of (A) was checked with a recording `applyHere`, not the page's own monitor.
- The boot's own state reports still arrive together; the old `control_send_many` and the data
  patch still count report rows toward the cap, so an old bundle's Take right at a two-renderer
  boot of a 26-graphic production could still meet "too many commands", as before Step 2.
- One probe run; without the fixes it was not re-run for comparison.
