# Phase 2 scoped closure, 2026-10-21

**Owner disposition: ACCEPTED under the bounded single-device scope.**
The owner approved this exact disposition on October 21 after the completed local
profile handoff and final scope review. The approval explicitly defers further
diagnosis of the original shared-lab module-load failure. This dated decision
supersedes the current BLOCKED disposition in the earlier contract; it does not
rewrite any historical verdict or accept the original concurrent-authoring campaign.

## Purpose and acceptance boundary

The goal is to close the approved bounded Phase 2 work with its final local proof,
while retaining failed results, operational restrictions and unresolved work.
This publication changes documentation only. It makes no product, test, workflow,
migration, budget or quarantine change, and authorizes no Phase 3 or default switch.

The accepted product source is exactly
`12eccdd8533ba710f0917cb3bcc78101070ecca8`, tree
`ebcba7a8b69d117842dcd29b917dbf6013042a6c`.
Newer main is not qualified by this local receipt. Reconciling this documentation
branch with current main and passing its publication checks does not move the
accepted product pin or repeat the acceptance campaign.

The operating restriction remains one active authoring tab on one device per
account. Save, retain an exported backup, close the first editor, then open the
intended saved cloud record from Home in the next isolated profile and inspect
it before editing. A Saved label alone is insufficient. This profile handoff is
not proof of a physical receiving device or concurrent authoring support.

Observable closure criteria are met: exact-source gated repair and fresh
independent checks are recorded; the approved native/local checklist and
sequential isolated-profile handoff are complete; temporary resources are cleaned
up; and the owner has explicitly accepted the scope and deferrals below.

## Evidence and qualifications

| Requirement | Evidence and result |
| --- | --- |
| Reservation repair through normal gates | [#1530 terminal owner receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1530#issuecomment-6285915391), landed source `5b843f32d3df48bcd10ca64ea2c957ae7b2810c1`. The unchanged three canonical reservation assertions pass after the demonstrated repair. Original failures remain recorded. |
| Quiz targeting repair and exact-source gates | [#1537 terminal owner receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1537#issuecomment-6287917391), landed `12eccdd`. Six exact accessible-name locator substitutions repair the demonstrated targeting failure. Main CI [39402553562](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39402553562): 2185 passed, one existing platform skip, all 2186 retry 0. Configured [39402553595](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39402553595): 109 passed, three existing skips, all 112 retry 0. No failed or flaky result is counted as passing. |
| Fresh independent canonical and broader execution | [Immutable independent landed receipt](https://github.com/NoaCG/NoaCG-Studio/blob/69e55975cf05e1da3174b5c0c423e9afa4269bbd/docs/work-specs/editor-leave-reliability/reservation-recovery/independent-landed/README.md): 3 passed in 17.7 seconds and 197 passed in 608.057 seconds, within the original five/twelve-minute limits, no retries or skips. Its initial configured-CI hold was resolved by the later #1537 terminal receipt, not by editing that earlier receipt. |
| Native import/download, actual browser 125%, cumulative editing and save/leave persistence | [Manual follow-up](../local-acceptance/manual-followup.md), [structured observations](../local-acceptance/manual-followup.json) and [archive inspection](../local-acceptance/archive-inspection.json). Owner reported usable Save, Home, inspector and timeline at actual Chrome 125%; Escape, Cancel, cancelled naming, Discard, navigation, reload/reopen and native Windows picker observations remain attributed separately. Cumulative text/artwork/animation and saved position/tilt are preserved. |
| Executable backup and animation preservation | Downloaded/imported `p2_local_12ecc_spx.zip`, 285733 bytes, SHA-256 `e3e8fbb191e379f018ff8e63420a138514be70d7f1f1e5841c126e496f55fec4`. Source inspection retains the original assets and the Name layer's 5-degree rotation key at 1.26 seconds, with layout X offset 12 px. Rendered start and held animation states were inspected in the recorded local continuation. Existing SPX/CasparCG/OGraf and reference evidence retain their original qualifications; no fresh physical receiver execution is claimed. |
| Sequential isolated-profile handoff | [Successful owner-present receipt](../local-acceptance/ready-handoff.json), [terminal queue record](../local-acceptance/ready-handoff-queue-final.json) and [manual log](../local-acceptance/ready-handoff-log.txt). Job `j-4663` completed exit 0 in 469473 ms under the unchanged twelve-minute cap. After Save and independent cloud readback, the first authoring tab closed. The owner signed into Chrome Incognito, opened `P2 handoff ready 12ecc` from Home, chose Edit graphic, inspected before editing and replied “All three confirmed”: text/position/tilt, the 1.26-second rotation key and no error. This is owner-operated local profile evidence, not independent controller observation or physical-device proof. |
| Resource cleanup | The successful server and owned runner stopped, with no live queue job. After the owner's specific deletion confirmation, the disposable branch was deleted. At 10:44:59 UTC, fresh connector and dashboard observations showed only default main, with no preview branches. Earlier temporary branches were also deleted. Brief prior compute usage may still be billed. |

The first no-effect numeric Save input and the observation transport timeout in
the successful admission remain disclosed in the local receipt. Current accessible
Save targeting then opened naming and one modal Save completed. No application
cause was established for the no-effect input; no maintained test or profile
assertion was retried. Earlier stopped, failed and timed-out local jobs
`j-4653`, `j-4660`, `j-4661` and `j-4662` remain unchanged. Successful handoff does
not repair those controller or admission results.

The manual admission exceptions were explicitly approved for these bounded local
runs, ultimately retaining a 1536 MiB floor, one Chrome and one local server.
They did not change repository defaults, test timeouts, assertions or budgets.
No headless suite or Docker startup was used. For the admitted handoff
continuations, the normal pinned migration wrapper applied nineteen migrations
once per fresh branch, with its existing guards and approved branch-only 0085
allowance. The separate automatic branch
pipeline's `MIGRATIONS_FAILED` result remains failed; no auth, sync, migration
pipeline or clean-advisor repair is claimed.

## Preserved failures and unresolved deferrals

All original assertions, all 32 group cases, limits, failures and existing skips
remain intact. At the accepted pin the group spec Git blob is
`035859b447db3f297f2451f4ec8b925b7656799a`; its LF source SHA-256 is
`978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78`.
This publication does not edit that spec or transfer its exact-byte qualification
to later main. Original concurrent-save, degraded-storage, pristine-baseline,
nightly and local failures retain their original sources and verdicts in the
[historical acceptance table](../single-device-acceptance/README.md) and
[immutable independent FAIL](https://github.com/NoaCG/NoaCG-Studio/blob/a03522403cf8086c8f27bc7849aa6ab6347cbef1/docs/work-specs/editor-leave-reliability/single-device-acceptance/independent/README.md).
Later repairs are separately evidenced, not retroactive green results.

| Unresolved work | Approved disposition |
| --- | --- |
| Original shared-lab module-load cause | **Further diagnosis explicitly deferred by the owner on 2026-10-21 for this scoped closure.** The [three revised diagnostic attempts](https://github.com/NoaCG/NoaCG-Studio/blob/bde0db425833e6c5393d33c07bef019b544fd1d2/docs/work-specs/editor-leave-reliability/gate-failure-diagnosis/revised-results/README.md) are spent. Module-load abortion was demonstrated sufficient to produce the signature, but its actual original cause remains unknown. A later retry-0 pass does not demonstrate an auth/sync fix. No new allowance is granted. |
| Extra project-wide nightly qualification on the accepted pin | Existing deferral retained. No new nightly campaign is required or claimed by this decision. |
| Historical late-send diagnosis | Existing deferral retained, original failures unchanged. |
| Repeated reference execution | Existing deferral retained. Reuse the pinned reference receipts only within their stated source and runtime limits. No new whole-editor parity claim. |
| Physical receiving-host and broader comfort acceptance | Existing deferral retained. Actual local zoom/native interaction and isolated-profile inspection do not replace this evidence. |
| Concurrent account authoring and original full multi-device campaign | Existing deferral and one-active-authoring-tab/device restriction retained. No concurrent-authoring acceptance is inferred. |

The earlier bounded-scope deferrals are recorded in the
[#1530 scope decision](https://github.com/NoaCG/NoaCG-Studio/pull/1530#issuecomment-6285915964).
No historical campaign restart, quarantine workaround, weakened gate, expanded
budget, automatic issue closure or Phase 3 follows from this decision.

## Coordination and issue state

Step 6 is **COMPLETE** and its approved release remains effective. Shared editor
source and account authoring remain serial. The final local audit found no
competing editor owner, live acceptance job or active authoring tab; this
documentation publication starts no product fixer or further account session.
Git and Actions preflights and supported repository/PR GraphQL reads were
qualified separately in the local receipts. REST success is not GraphQL or
write/dispatch qualification; publication operations must establish their own
results.

GitHub state was rechecked during the final review:

- #1466 is CLOSED via #1528. This publication does not close it again.
- #1498 was externally CLOSED by `github-actions` on October 21. Its
  [closure comment](https://github.com/NoaCG/NoaCG-Studio/issues/1498#issuecomment-6308571964)
  cites successful retry-0 [nightly 39546610352](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39546610352)
  at `0ca7742690e23673581c18ebe5113183e5f0ab9e`, a different source. This
  corrects the earlier “open” status, without claiming pinned-source nightly
  qualification or resolving the historical diagnostic deferral.
- #1532 and #1533 are CLOSED UNMERGED. The held quarantine proposals remain
  unused; they are not reopened, landed or used to pass this scope.

Historical documents and local receipts keep the decisions effective when they
were written, including their then-BLOCKED or incomplete verdicts. This dated
owner decision is the current scoped acceptance record. It accepts no newer main,
physical-device campaign, auth/sync fix, global editor milestone or Phase 3.
