# Native recovery qualification, 2026-10-17

## Prior evidence and activity

Read #1301's body and all comments, including the later
[capability assessment](https://github.com/NoaCG/NoaCG-Studio/issues/1301#issuecomment-6232401281),
PR #1307 and both cloud-landing-recovery runtime receipts before probing. Reused #1305's Claude
identity/launch/landing evidence and the #1312/#1353 completion receipts. The owner selected
existing provider schedulers first in this session. No hosting, credentials or provisioning.

The local worktree activity scan found no competing local work. Work is isolated in
`codex/native-recovery-adapter`, `/workspace/noacg-native-adapter`; `run-wake*` stays untouched.
The first read-only fetch reconciled the branch with main
`3010e41134f1e3a6ebf3933582eb9b7e52055241`. After the idle wake, a fresh fetch and merge
reconciled `6d66070e19644cbaeca01531b951dd7188c65296`, preserving the concurrent work.
The earlier review-request against stale `origin/main` `1e9ff904` was discarded before review;
its 639-file scope was not treated as this change. No other run or PR owner was adopted.

## Guard checks

`native-recovery-contract.mjs` compares explicit native bindings, effective policy fingerprints,
fresh observations, exact action/request receipts and delivered-wake lineage. It makes no
provider calls and supplies no distributed lock. Permission and owner waits stay explicit.
An idle session with an uncertain turn remains unknown. A missing/ambiguous receipt never means
non-delivery. Re-arm admission retains the original policy, target and absolute deadline; an
overdue fire or missing re-arm produces an unknown verdict, without granting another owner.

Direct Node checks passed 7 contract tests and 6 context-reader tests; targeted ESLint passed.
Checks include permission expansion, pending turns, ambiguous/changed receipts, terminal states,
expired/extended windows, lost re-arm, copied Claude requests, Codex cumulative baselines/resets,
inherited-ID subagents, conflicting counters and unavailable first-request size. These tests
qualify the guards, not real provider idempotency, a fencing service or an independent alarm.

Unchanged compatibility checks: run-wake 13/13, plan-run 14/14, wave-launch 8/8 passed. Initial
default-sandbox supervisor and wave-recovery checks could not execute Node child commands:
even `spawnSync(process.execPath, ['-e', 'process.stdout.write(...)'])` returned EPERM/empty
output. This was isolated from the new guards; the targeted compatibility checks are retried
with supported per-command network permission for the runtime's child-process boundary. No
test, assertion or sandbox policy is weakened by the source change.

The supported-permission rerun passed supervisor **14/14** and wave-recovery **5/5**. This
confirms the initial failures were the runtime boundary: no source/test change was needed.
Together with the new and compatibility checks above, **67 targeted tests** passed.

## Real hosted Codex wake

Run `native-wake-20261017-0954`, original window 09:53:57.766Z to **11:15:00Z**. Native owner
`01a14608-30d3-7654-9c71-4d57555c505d`; hosted one-shot
`6ad345b6664c8191b783f603378f134b`. No child or competing coordinator.

1. `automations.create`, relative two-minute offset, exact schedule, Europe/Kiev: confirmed that
   same native thread and requested DTSTART 09:55:58Z. This acknowledgement was not delivery.
2. The prompt actually arrived in this coding thread. At executor time **09:55:04.389Z** it read
   the original `/tmp/noacg-native-recovery/probe.json`, verified the exact native owner/worktree,
   and wrote/read back an arrival record with Node v24.19.0. The permitted write was confined to
   the disposable probe. The session was active; this is not another idle/reclaimed-host proof.
3. Native read-back reported `last_run_time=09:54:30.349642Z` and the spent one-shot disabled.
   Both that timestamp and the executor observation predate the requested DTSTART. Preserve
   this timing discrepancy; no precise scheduling-latency guarantee is inferred.
4. An explicit UTC DTSTART update to 10:55:05Z was rejected: "Choose a time in the future."
   No re-arm was credited. The supported relative one-hour offset then succeeded at
   09:55:47.245325Z: **the same task and thread**, DTSTART **10:55:46Z**, before the unchanged end.
   The offset is one hour from the accepted update, about 41 seconds after arrival recording.
   It is not claimed to be exactly one hour from the fire. No duplicate automation was created.
5. The re-armed prompt actually arrived after this session's previous response ended, without
   an intervening human prompt. Native read-back reports the second run at **10:58:10.553853Z**,
   versus the requested 10:55:46Z. The resumed turn first read the original probe at executor
   time **10:58:16.249Z**. It verified the same native thread, worktree, Node version and preserved
   branch/commits, then wrote/read back the second delivery at **10:58:32.418Z**. This is real
   idle-session continuation and bounded re-arm evidence, not just an acknowledgement.
6. `automations.update(is_enabled=false)` confirmed the same task/thread disabled at
   **10:58:33.276341Z**, before the unchanged 11:15Z end. Scratch state is completed with two
   deliveries and `delivered-and-disabled`. No third wake, new worker or renewed window.

The resumed runtime reports the same managed environment as before the pause, current
observations and enforced restricted networking. No VM-reclamation or filesystem-replacement
event was established. Native AC-3's stated two-delivery/re-arm/stop scenario passes; the
broader parent recovery protocol remains partially unqualified.

Actual file access is observed, but no native effective-permission introspection or pending
approval continuation is exposed. Those parts of native permission equivalence remain open.
The tool cannot prove receiver fencing or idempotency of uncertain create/follow-up requests.
No denial retry against Codex's known cloud CLI authentication/catalog failure occurred.

## Context, #805

The real scheduled recovery prompt contains **1,825 UTF-8 bytes** (ASCII). Total loaded native
instructions/tools, retrieved context bytes, input/cache/output usage, and repeated-planning
turns are unavailable. The managed CODEX_HOME exposes no session rollouts, and no usage counters
are present in the native scheduler read-back. Missing usage is recorded as null, never zero.

`native-recovery-context.mjs` consumes explicitly supplied native transcript files and a recovery
window. It reuses the existing usage readers, deduplicates Claude message/request IDs across
files, excludes other owners/sidechains and rejects conflicting counters. Codex uses cumulative
deltas with a pre-window baseline, never sums repeated last-token counters, and refuses resets
or a mismatched native session. Bytes are not converted into tokens; planning turns require an
explicit observation. This phase cannot establish a before/after provider-context saving.

## Source CI and landing

Initial draft source CI [39023671160](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39023671160)
passed Build, Factory gates, E2E plan and CI gate. Browser/catalog jobs were skipped, not run.
The workflow concluded failure solely because Reviewed lacked the remote review status while
the PR was deliberately draft. The resumed owner read the whole failed job log (117370321941):
the missing-status wait ended after 149 seconds. No source assertion failed and no test was
changed. The final reviewed source receives a fresh stamp and uses the unchanged queue flow;
final CI/merge/post-land observations belong in the PR's sole-owner receipt.

## Remaining qualification

Real uncertain-submission reconciliation; effective native policy read-back and pending approval
continuation; Codex child-create/follow-up auth/catalog support; full external-state filesystem
reconstruction; remote owner/phase/launch fencing; independent detection of a stopped wake chain;
archive revival and provider usage counters remain open under #1301/#805. Claude's already
observed bounded re-arm chain is credited; it needs no repeat here. No hosted supervisor or
state/artifact service is provisioned. Existing provider schedulers remain the selected next path.
