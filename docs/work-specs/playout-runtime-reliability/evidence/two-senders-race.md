# Two senders racing on one graphic: one lands, the other is refused as stale

2026-09-30, preview branch B. Never production.

## What ran

Job j-2462, scenario `race` of the scratch script `step2/verify-b.mjs` (session scratchpad),
through the preview-branch wrapper with `branch-b.env`. Five trials, each: read the server's
revision of House Scorebug on `p6-harness main`, then fire two `control_send_seq` calls at once as
anon from two fresh senders, both carrying that revision as their base, both a Take (or both an Out
when the graphic was up).

## What was observed

All five trials: exactly one answered `ok` and the other `refused: 'stale'` (outcomes "ok+stale" x5).
The loser's answer carried the graphic's current summary, which is what a page learns from before
its operator presses again.

The same race through the real pages, with the operator's notice, is
`e2e/configured/command-sequence.spec.ts` ("a press another screen overtook is refused, writes
nothing, and the operator is told"); its run is recorded in `configured-specs.md`.

## Limitations

- The two calls were concurrent from one Node process, so they reached the database close together
  but not necessarily in the same millisecond; which one won is the lock queue's choice, and only
  "exactly one" is asserted.
