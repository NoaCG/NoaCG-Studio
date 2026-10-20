# Independent single-device Phase 2 check

**Verdict: FAIL**, 2026-10-20 UTC. This checker built none of the phase or repairs.
The owner requires one active authoring tab/device per account with serialized
handoffs. Three retained single-page duplicate-prevention assertions fail on the
exact Step 6 merge. There is no acceptance of the original multi-device criteria,
no Phase 3 or #1466 closure, and no revocation of Step 6's approved release.

## Source and isolation

Pinned source `32027cc2abd0ad7d50d8152ad2ebe83f1c95833b`, Git tree
`3580262e357bf9f1bfda643cef42d8fee4ad2b05`, includes #1528 and #1526. Own worktree
`/workspace/p2-single-device-independent`, evidence branch
`codex/p2-independent-single-device`. The documentation commit is an evidence
artifact; its identity is separate from this tested source.

The provider Git-data ref independently reports main
`331a98a919b21dad676d8729d254eb208db76ce0`. The provider comparison and local diff
both show only `scripts/e2e-traced.json` changed after the pin. This metadata drift
is recorded, not silently adopted as the tested state. The exact signed source
commit/tree had already been imported through the qualified provider Git-data
transport and was verified locally with `git rev-parse HEAD HEAD^{tree}`. This is
not a claim that CLI fetch recovered. Both Git and gh have recorded unchanged
401 denials; no login, credential/config change, proxy bypass or repeat of those
denials was attempted. Runtime observations are current/connected/enforced; that
alone does not qualify CLI writes or Actions dispatch. Cloud runtime guidance was
read at startup, and the executing network-policy snapshot was inspected.

Root and scoped rules, check/verify/queue-merge/cloud-delegate procedures, editor
plans, the six leave-reliability criteria and additions, owner deferral, repair-11,
repair8/9/10 limits, independent9/10 qualifications, immutable independent-12,
#1487's corrected receipts, #1509, #1515/#1519/#1520, #1522 and the terminal
#1528/#1526 owner receipts were independently inspected. Their judgments were
inputs, not an acceptance verdict. Worktree activity reported no other local work
in flight; the shared queue was empty. Provider open-PR/issue inventory and terminal
owner receipts supplement that local observation. Step 6's owner reports COMPLETE
and safe to archive; the old laptop heartbeat remains paused. No competing fixer
or worker was launched by this checker. The coordinator separately owns questions
about laptop availability and later work.

[Provider observations](provider-observations.json) record the exact-source run
list, metadata drift and open work. No current-source nightly appears in the
complete 11-run response for the pinned SHA. No new workflow trigger, old-source
rerun or unsupported dispatch was used to manufacture missing evidence.

## Fresh retained failure

The executing profile is four CPUs / 16 GiB machine totals, two browser workers;
hidden cgroup ancestors could not be read, so these are fallback totals. There
were no worker/count/floor overrides. Dependencies were reused through this owned
worktree's node_modules symlink. The run reached all three intended assertions
without resource, loading or skipped-suite failures.

Only the necessary canonical ninth spec was materialized temporarily, unchanged
from `9bef784b73fa979d24fe254da1dbc156cb7ba342`. SHA256:
`2e8fdba7d45b65a67649a4ce13cefe10707db157834b9af183079c1e92e00307`.
No old helper or workflow was imported. The file was removed from the final
tracked tree after preserving its source and results under ignored local evidence.

```sh
node scripts/execution-profile.mjs
node scripts/e2e-affected.mjs --list --files e2e/leave-ninth-checker.spec.ts
node scripts/jobs.mjs add "npm run test:e2e -- e2e/leave-ninth-checker.spec.ts --grep V-reservations --retries=0" --cap 5
node scripts/jobs.mjs log j-0004
```

Queue **j-0004**, cap 5, ran all three cases with two workers: **0 passed,
3 failed, 0 skipped, 0 retries**. Every failure is unchanged
`leave-ninth-checker.spec.ts:247:77`, expected one record, received two. Individual
case durations are 6.9 s (newer version), 6.3 s (corrupt), 5.0 s (missing). The
whole log, original assertions, exact command, screenshot hashes and all raw facts
are retained in [queue facts](queue-facts.json). All three screenshots were opened:
Home contains the original Riverlight graphic and a Second graphic with the same
rendered artwork. Local failure screenshots remain under this worktree's
`test-results/`; repository image policy is unchanged. Local tracing is off by the
unchanged configuration, so no trace is claimed.

| Reservation-list shape | After reload | Naming | New records | Original minted source |
| --- | --- | --- | --- | --- |
| Newer version | graphicId null, dirty true | 1 | **2** | Preserved |
| Corrupt | graphicId null, dirty true | 1 | **2** | Preserved |
| Missing | graphicId null, dirty true | 1 | **2** | Preserved |

Each case uses **one page**. The recipe first refuses the reservation and link
slot writes (R and K), then reloads with an unusable/lost device-local reservation
list. These failures are within retained AC2/AC3; simultaneous authoring is not
involved. Further browser selections were stopped on this retained failure. No
broader selection, source mutation, repeated diagnostic, reference/browser/native
rerun, test repair or product repair was performed.

### Cause and qualification

Static evidence agrees with the observed failure: `templateStore.ts` initial
link logic only considers `reservedGraphicId` when `isOwnReservation` recognizes
it. `project.ts` obtains that ownership solely from the device-local list;
`deviceIds.ts` yields no owned ids for newer, corrupt or missing data. Consequently
the already minted record is not considered for relinking, and the next Save asks
for a name and mints another record. Source preservation is positive evidence,
but does not satisfy the no-duplicate assertion.

Repair-8 disclosed triple-refusal duplicates and multi-tab windows. Repair-9
explicitly disclosed duplicates if the new local list could not be written or
predated the build. Independent-9 extended that limit to lost/corrupt lists and
said “the brief allows”; independent-10 and independent-12 carried the limit.
These are precise historical qualifications, not an independently established
explicit owner waiver of all three retained assertions. The current owner decision
deferred concurrent authoring only. It does not defer these one-page cases. No
red assertion is renamed, dropped, weakened or called green here. Normal S6's
recorded pass remains required and is not disproved by these additional conditions.

The evidence establishes the missing-ownership cause, not that recovery is
impossible. Any future repair must preserve the other-device and other-tab
ownership protections: trusting a synced reservation or source equality alone
would need separate proof against #1443/#1402. Implementation belongs to a
separately authorized owner and a subsequent independent source check.

## Independent gate audit

All six supplied ZIPs were opened, SHA256 hashed and parsed directly. HTML reports
were decoded from their embedded ZIP, reading every full per-file JSON result;
configured JSON was traversed through each actual result/retry. The compact
[report summary](reports-summary.json) and linked per-run facts retain failures,
skips, attachment identities and selected case records.

| Source/run | Actual original result | Qualification |
| --- | --- | --- |
| #1526 merge, CI [39373347796](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39373347796) | **2,185 passed / 1 existing platform skip**, all 2,186 retry 0 | [Raw facts](step6-main-facts.json): all 32 groups, 14 keys, 18 wizard and 25 arrangement cases pass normally. |
| Same merge, configured [39373347849](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39373347849) | **109 passed / 3 existing skips**, all 112 retry 0, no flakes/failures | [Raw facts](step6-configured-facts.json): all 3 account, 6 deep-link and late-send cases normal. Completed before this checker launched. |
| #1528 merge, CI [39372052729](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39372052729) | **2,183 passed / 2 failed / 1 skip**, all retry 0 | [Raw facts](repair1528-main-facts.json): wizard deep-link goto 446:14 resource error and cold-open original 565:65 template-file remain failed. Owner's automatic retry reports 17 passed / 1 failed; not a repair. |
| #1528 merge, configured [39372052735](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39372052735) | **109 passed / 3 existing skips**, all 112 retry 0 | [Raw facts](repair1528-configured-facts.json): identical skip identities to Step 6. |
| Scheduled pre-Step6 nightly [39372122320](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39372122320) on b433aba4 | **2,184 passed / 1 failed / 1 skip**, all retry 0 | [Raw facts](scheduled-pre-step6-facts.json): cold-open failure; does not test 32027cc2. |
| Original late-send [39287029913](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39287029913) | **107 expected / 1 flaky / 3 skips** | [Raw facts](original-late-send-facts.json): retry 0 fails helper 237:8, caller 96:9, false predicate at 30 s; retry 1 passes. Only passing retry has a trace. |

The offline skip is platform-bound `catalog-baseline.spec.ts:392`. The configured
skips are exactly the two external CasparCG-server cases and the OAuth-disabled
connector deployment case, matching the preceding configured run. None was added
here. Active quarantine is empty at the pinned source; account, keys and deep-link
are normal. Provider results confirm exact-source Post-landing 39373347903,
Quarantine 39373347866, Push-on-main/CodeQL 39373347435 and deployment verification
39373614624 succeeded. Empty quarantine executes no quarantined browser cases and
proves no fresh release history.

Step 6's fresh-page cold-open change keeps all nine slugs, both assertions and the
7-second expect budget. A cold open has no prior page state to preserve; the
same-renderer repeated-navigation stress is removed by isolation. This supports
its bounded cold-open contract on the new source, not the claim that the old
Chromium resource-lifetime cause or every old goto anomaly has a matching-fault
repair. Old runs remain red. #1524's automatic closure is a rolling CI observation,
not this checker's whole-phase acceptance.

#1528 repairs future release accounting by binding candidate history to the
entry's source cycle. #1516/#1517's claim of twenty fresh passes remains unsupported;
the count-12 released classification is not a runtime repair. The later normal
late-send pass is a regression observation. The original failure predates the
held-Take negative output assertion; neither an on-air leak nor a harness-only
cause is established. Matching diagnosis remains unproved.

The pre-Step6 nightly's recorded mean passes at **4.89 s / 5.50 s**, but its
workflow fails and only 231/232 specs have fresh traces (wizard retains an old
entry). Independent-12's nightly 39323236011 failed arrangement `open()` 15:14
before resize; its 3.88 s budget pass did not clear that failure. The coordinator's
single forced-GC diagnostic on b433 engaged but passed: **INEFFECTIVE**, not a
repair. No further GC or consumed editor-key diagnostic is authorized or run here.
#1498 remains open; **current-source nightly is unverified**. Current full CI
arrangement passes do not retroactively fix its earlier setup failure.

Account proof 39279909249, correlated editor-key matching/repaired proof, and
deep-link fault 39307804274 / identical-fault 39309819955 / normal-six 39309903933
are reused with their explicit historical-scheduler qualifications. They were
not rebuilt or rerun. Original CI 39250656173 stays failed, #1506 stays closed,
and all ineffective probes stay ineffective.

## Criterion-by-criterion judgment

“Satisfied” is limited to the stated engineering evidence. Historical execution
is identified as reuse, not a fresh task on this source. “Deferred” never changes
an executed failed result. Full acceptance needs every retained criterion and
gate; this check stops with a fresh retained failure.

| Criterion | Scope | Disposition and evidence |
| --- | --- | --- |
| AC1 normal wizard/import; question before destination; Cancel/Escape/naming cancellation retain source, selection/history | Retained | **Satisfied engineering evidence:** maintained current full CI and independent-12 carried/maintained runs. No new exhaustive carried execution claimed. |
| AC2 exact Save/reopen, discard creates no record, saved experiment leaves its original record intact | Retained | Ordinary maintained paths pass in current CI and prior carried scopes. **Fails the cumulative no-duplicate requirement below.** |
| AC2/AC3 no duplicate after failed writes and reload | Retained | **FAILED:** fresh 3/3 V-reservations at unchanged 247:77, source retained but two records. Normal S6 historical pass stays visible. |
| AC2 clean-copy timeout/retry, edit during wait, chained id, winner preservation | Retained regression protection | **Satisfied current maintained CI plus reused independent-12 real-timer evidence**; no extra local selection after failure. Concurrent copy creation/adoption is separately deferred. |
| C-pull/C-overlap/V-superseded and simultaneous authoring | Explicitly deferred | Original four ninth null-link failures remain red. No original multi-device PASS. C-pull after reload changes Alpha (alphaUnchanged false) but keeps this device's source in its copy; do not call the winner byte-equal. |
| AC3 New/Open/Back/hash, refusal/double submission, no early navigation/resurrection | Retained | **Satisfied ordinary maintained engineering paths**, subject to the retained duplicate failure. Current CI does not execute the disposable V-reservations cases. |
| Reservation ownership across tabs/devices | Concurrent-authoring requirement deferred; ordinary durable recovery retained | Preserve #1402 H, #1443/X-device recipes and historical outcomes. Deferral does not authorize weakening their guards or waive one-page recovery. |
| AC4 pristine baseline, held wizard walk, library/cloud/production separation | Retained | **Satisfied engineering evidence:** current maintained/configured CI and reused independent-12 signed-in separation. R-departure's unchanged red 281 expectation conflicts with AC4: pristine C asked/named zero; that run remains failed. |
| Serialized device handoff | Retained under narrowed scope | **UNVERIFIED on final source:** save/backup on first device, close it, open intended record from Home on second and inspect contents before editing. Documentation and local Saved alone are not execution. |
| AC5 Studio official v0.17 / pinned source and Eyevinn lifecycle, hashes, comparisons, deliberate differences | Retained | **Satisfied only as reused bounded comparison evidence** in immutable independent-12 (six tasks, official binary and 17 source hashes). No fresh reference run here after failure. Neither reference implements this conflict-copy wait; no whole-editor parity claim. |
| AC6 desktop/laptop/actual 125%, cumulative text/artwork/animation/save/reopen and nine browser outputs | Retained | Prior browser engineering receipts retained; **fresh final-source independent cumulative/native journey UNVERIFIED** after source/CSS cleanup and this check's stop. First virtual-window setup failure stays red; larger-display 1.25 pass does not turn it green. |
| Native file interaction / physical receiver / owner comfort | Separate evidence classes | **UNVERIFIED here**, no new waiver or physical/native-host claim from virtual display. Preserve earlier receiver limits; do not broaden this phase to R1.5. |
| Refused discard and newer-edit repairs, history/Undo/Redo, pending autosave, wizard Back/start-over, sequential exports | Retained | **Satisfied maintained current-CI engineering coverage and prior carried scopes**; retained red assertions remain separately recorded. |
| All #1509 group cases and assertions | Retained | **Satisfied:** independently byte-equal to ce50f669, SHA256 978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78; all 32 normal/current CI/retry 0. |
| Exact-source full CI / configured completeness and existing skips | Retained | **Satisfied for 32027cc2** with counts above; no retry or quarantine substituted for a result. |
| Current-source nightly and valid late-send release/failure accounting | Retained | **UNVERIFIED / unresolved:** no exact-source nightly, #1498 open, old failures retained, historical release claim unsupported and late-send cause unproved. |

All 19 canonical carried spec paths were independently loaded from cached Git
and SHA256 checked against the maintained manifest. [Integrity facts](integrity.json)
record each source/path/hash plus the group byte equality. No test, assertion,
helper, skip, limit, classification or workflow is changed by the final receipt.

The original fifth B1 263 and F-hold/F-late 464 failures remain failed. The bounded
B1 variant supports the absent-alert contract. Cancel on guarded Open correctly
keeps the editor, so those two waits for a library row are incompatible with the
cancellation. Seven original ninth failures and R-departure 281 remain failed as
well: eleven original failed results across those selections. These explanations
do not erase raw failures. The virtual-window setup and nightly arrangement
failures remain additional failures. Immutable independent-12 retains their full
run identities and facts.

## Check and next work

Review and simplification run inline over the evidence-only diff. Review checks
source/tree identity, raw result counts, skipped/retry distinctions, canonical
hashes, failure visibility, scope and links. No product/source repair is proposed
as completed, and no acceptance stamp is issued. Documentation verification uses
the reached gates, relative-link check and whitespace check; their final results
are recorded with the evidence commit. No production build is needed for these
documentation/evidence changes. Known CLI denials are not retried by the usual
review-request fetch wrapper: provider current-main read/comparison plus local
merge-base against the API-qualified origin/main supply the explicit scope.

Next needs a separately reviewed repair or explicit owner decision for retained
duplicate recovery, matching diagnosis of the historical late-send failure,
a qualifying current-source nightly, and the applicable device/handoff/native
journey. New landed repairs require a fresh independent source check. The root
coordinator owns the existing laptop-availability question; no duplicate user
question is issued here. This receipt is **FAIL**, not a request to stop all work,
and grants no broad reservation release or #1466 closure.
