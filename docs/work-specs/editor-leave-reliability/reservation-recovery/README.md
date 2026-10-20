# Same-tab reservation recovery repair

Attempt 1/3, 2026-10-20. **Proposed repair; not landed or Phase 2 acceptance.**
Base main `331a98a919b21dad676d8729d254eb208db76ce0` differs from the independently
checked Step 6 merge only in generated trace metadata. The independent checker
on `32027cc2abd0ad7d50d8152ad2ebe83f1c95833b` reproduced all three original
single-page V-reservations failures: two records where the unchanged assertion
requires one. These failures are retained under the single-device scope.

## Cause and change

Boot only considers a reserved record when `isOwnReservation` recognizes its ID.
The single device-local ownership list becomes unreadable after the newer-version,
corrupt or missing-list challenges. Even though the already minted record survives,
boot cannot recognize ownership, and the next Save mints another record.

Allocation now records ownership in both the existing localStorage list and a
tab-local sessionStorage mirror. Both use the existing versioned, bounded 20-ID
format; unknown newer versions remain unreadable and untouched. Either valid
local list can prove ownership. The synced working slot and matching source alone
never prove device ownership. The existing source/mint checks, ID-taken rotation,
conflict behavior, original assertions and all budgets remain unchanged.

The mirror survives reload of the same tab. It does not promise recovery after
closing the tab when the device list is also lost, or when both storage mechanisms
refuse writes. Those cases fail closed rather than trusting another device's ID.
A serialized device handoff still opens the intended saved record from Home;
this mirror does not transfer ownership to another device.

Studio v0.17 and Eyevinn do not sync/resume working-slot reservation ownership;
their pinned lifecycle runtime evidence is recorded in independent-12. There is
no comparable reservation-recovery task, and no new reference parity is claimed.

## Matching verification

- Fresh independent unchanged baseline: queue j-0004, **0 passed/3 failed**, all
  retry 0, expected one record/observed two. Artwork preserved.
- New Node ownership tests against original project code: **1 passed/4 failed**;
  against repaired code: **5 passed**, no skips. Both logs retained here.
- Repaired unchanged canonical ninth cases: queue j-0007, cap 5, two derived
  workers, **3 passed**, zero retries/skips, 16.1 seconds. All original assertions
  and 180-second per-case/7-second expectation limits are unchanged. The temporary
  probe was byte-identical to canonical `9bef784b73fa979d24fe254da1dbc156cb7ba342`
  (SHA256 `2e8fdba7d45b65a67649a4ce13cefe10707db157834b9af183079c1e92e00307`)
  and removed afterward. [Raw facts](matching-facts.json) and [whole log](matching-run.txt).
- j-0005/j-0006 failed before npm/browser-case execution in a restricted runner;
  logs contain only command/cwd headers. They remain failed, count as no browser
  verification and are not repair attempts. Matching j-0007 used the independently
  qualified network-enabled execution context; no assertions, helpers or retries
  changed to obtain its result.

One relevant broader `save-transaction.spec.ts` selection, queue j-0008 cap 12,
**49 passed in 2.7 minutes**, zero retries/skips/failures, on committed source
`d11f491f7`. This includes double refusals, reloads, duplicated/crashed tabs,
foreign-device ownership, conflict-copy arrival and chained-copy guards. The
maintained spec is unchanged (SHA256
`0fa5a3b7a8c1d989d8378281e1895444555c47737f4d2b983e06f21bae7e66cf`).
[Whole broader log](broader-run.txt). Inline review found no defects; simplify
made no further changes. Targeted ESLint, client TypeScript, whitespace and
changed gates passed (12 Node tests across two files). No production build
was required for this storage-only change; full suites remain in Actions.
Full source CI, exact-merge checks and a subsequent fresh independent acceptance
check do not exist for this unlanded source. CLI GitHub auth returned 401, and no
qualified commit-status/queue-helper dispatch transport is exposed. No direct
main write, queue bypass, Phase 3, #1466 closure, native/physical-host or owner
acceptance is claimed. Step 6's release remains effective; its owner completed
their terminal checks before this separate repair began.

The fresh [independent FAIL receipt](https://github.com/NoaCG/NoaCG-Studio/blob/a03522403cf8086c8f27bc7849aa6ab6347cbef1/docs/work-specs/editor-leave-reliability/single-device-acceptance/independent/README.md)
and its maintained parent table remain authoritative for the landed source.
This proposed repair supplies no new nightly, late-send fault proof, device or
serialized-handoff result. A new independent check is required after landing.
