# Deep-link pending-completion repair

Separate prerequisite-gate repair owner; no independent Phase2 acceptance. The owner authorized
only `src/backend/syncController.ts` and `src/backend/graphicWhenSynced.ts` after reviewing the
[matching fault and proposed patch](https://github.com/NoaCG/NoaCG-Studio/blob/7021d436a056707b383b2254600ac02aad6755bc/docs/work-specs/phase2-prerequisite-gates/pending-completion/README.md).
Implementation window: 2026-10-19 18:39:17–20:39:17 UTC (21:39:17–23:39:17 Kyiv).
Other product reservations remain in force.

## Problem and narrow change

`syncNow()` already waits for a pass that could see the caller's record. A completed pass can
leave newer unrelated writes pending, and its queued successor can replace the global phase
before the deep-link callback runs. Reading that global phase once loses the completed absent
answer; later sync completion does not notify the lookup. It then competes with its unchanged
60-second backstop and the original assertion's unchanged 60-second timeout.

The awaited call now returns its own completion receipt. A completed read can answer an absent
lookup even while a later pass is syncing. A skipped, thrown, or account-superseded pass cannot
report completion. Existing arrival listeners, account boundaries, serialization, state
classification, timers and retry policies remain unchanged.

This establishes the challenged pending-completion path; it does not uniquely establish the
historical scheduler sequence in run 39287816358. The healthy passive observation is not repair
proof. The original failed run and its passing retry remain recorded as a failure/flake.

## Coverage and focused checks

- The five original `deep-link-boot.spec.ts` case declarations/bodies were compared as TypeScript
  call expressions with main `70714e8f594479aa064486c75bb58bb7cc47695c`: byte-identical, including
  gestures, assertions and budgets. One additive case makes two real unrelated fixture writes
  during actual show listings and requires the absent answer within 10 seconds, before the
  unchanged 60-second fallback. Responses remain genuine; it asserts both writes reached pending.
- Eight real-module Node cases cover skipped/thrown reads, apply failures after a completed read,
  account supersession, coalesced waiter/pass identity, unavailable queued passes, the later
  global syncing phase, and continued record-arrival listening after unsuccessful passes.
  See [unit proof](unit-proof.txt).
- Mutation: replacing `if (receipt.completed)` with `if (true)` fails both unsuccessful-pass
  negative assertions (6 pass, 2 fail). Source was restored. See [mutation](guard-mutation.txt).
- Queue j-0004, cap 5, zero retries: sync engine, asset externalization and account-library
  isolation, 3 passed in 11.1 seconds. See [local browser proof](local-sync-proof.txt).
- ESLint for changed TypeScript and the maintained Node test passed; full src semantic TypeScript
  check passed. Reached gates passed (3 factory files, 42 cases, including the 8 receipt cases).
  These static checks are not browser repair proof.

## Browser proof ledger

- Baseline fault: source `b5d0b18054791589e02126ed794600a3d43bd3aa`, run
  [39307804274](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39307804274), job 118249308071:
  original production-missing assertion failed at its unchanged 60000ms budget (original115:60,
  diagnostic140:60). Two real unrelated writes changed syncing→pending; completed pending passes
  and a later synced pass did not answer the lookup. Artifact12215340278 SHA256
  `b70c55ec605b5cfcc05bd0db9d36c113e2b11a6d360107dbf47fa36c656ee7a7`.
- Identical-fault verification: source `0341d86913f2c97762cb7ec216b107eac46c9d18`, run
  [39309819955](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39309819955). Diagnostic spec,
  passive helper and isolated-stack workflow byte-identical to baseline b5d0b180; only the two
  authorized product files differ from the baseline product source. One dispatch, cap5, retries0.
  **PASS**: one original case in 18.5 seconds, retry0, no flakes/skips. Both real fixture writes
  changed syncing→pending; a completed pending result appeared at1792437904812. The UI answered
  missing at1792437904836, 82ms after absent navigation, while a later pass remained pending.
  Artifact12214904669 SHA256
  `e42c68b2cccaebd89f22a7e77289e37e2b92d642de35a0632b85ac6dc974bf94`.
  See [facts](repaired-fault-facts.json) and [raw state/network events](repaired-fault-events.json).
- Maintained normal file: source `a56fe245b095bfde3ebb9ef16f7189239fedc2ca`, run
  [39309903933](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39309903933). All five original
  cases plus one additive regression, no disposable observer or injection. Canonical isolated
  Supabase setup, selected file only, cap5, retries0. **PASS**: all6 in60.3 seconds; zero failed,
  flaky or skipped, every case retry0. Artifact12216070054 SHA256
  `839abceec32895511e5d610df23de213eba06a3561c2a6fd8c956ba0c8b31cbf`.
  Report and six trace archives read; zero page-error events. The regression final frame shows
  Production not found with the signed-in account. See [per-case facts](normal-facts.json).

Both artifact hashes were independently checked after download. Only after reading both complete
proofs, normal classification was restored for deep-link; unrelated quarantine/release entries
are unchanged. No count of static/documentation checks is used as repair proof. No disposable
instrumentation or workflow modifications are part of the repair branch. No #1466 closure,
Step6, Phase3, acceptance claim, or unrelated reservation release.
