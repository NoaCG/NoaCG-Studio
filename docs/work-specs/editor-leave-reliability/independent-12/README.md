# Independent Phase 2 check, 2026-10-20 (Kyiv)

This checker built none of the phase or repairs. Repair receipts are inputs, not
acceptance. **BLOCKED:** the fresh pinned-source nightly has an unresolved editor
setup failure, the late-send release evidence is invalid, and nightly alarm #1498
remains open. Runtime results below are independent
engineering evidence; no owner, physical-host or native-comfort acceptance is claimed.

## Isolation and prerequisites

Fetched main `4e067b65674a9bf0a7632430b5dd0772c03a0331`; its only difference from
deep-link merge `ba5e72e37f3dd1771e40e87ce229cad3ff907402` is two cloud-workflow
documentation lines. The probe is
`codex/independent-p2-1466-check`, worktree `/workspace/independent-p2-1466`.
The documentation-only receipt is on `codex/independent-p2-1466-receipt`,
worktree `/workspace/p2-1466-receipt`. Neither branch is queued for merge.

Before execution, chat activity showed the repair owner idle. Its terminal handoff
explicitly ends ownership and claims no wake. Local worktree/branch inventory,
`origin/main...work`, open PRs and reservations were inspected separately because
the activity helper suppresses ahead-of-main comparisons without local `main`.
No other local task files were in flight; remote repair/evidence branches were
not treated as permission for competing fixes. Shared editor/save/store/router,
saved-data, preferences and CSS remain reserved.

Read root and scoped rules, check/verify/queue-merge/cloud-delegate workflows,
the six leave-reliability criteria, repair-11, independent-10/direct facts,
the blocked independent-11 receipt at `2c6e77395227af9193070fb00fc9eaa396954a2e`,
#1487's corrected terminal comments, #1509's matching-fault receipt, and both
prerequisite repair receipts and terminal comments. The blocked receipt was
retrieved from its immutable GitHub contents endpoint; it is not on current main.

Git/Actions network preflight passes. Actual worker: four CPUs, 16 GiB machine
memory, two browser workers; hidden cgroup ancestors are unreadable, so those
are fallback machine totals. One local browser job runs at a time through the
prescribed queue, named small selections capped at five minutes and one broader
selection capped at twelve. No local full suite or product build was run.

### Actual exact-merge results

All 45 main-CI shard logs were read, rather than inferring counts from colors.
Configured report ZIPs were downloaded, hashed and traversed through each test's
actual results and retry index. The three existing configured skips are two
external CasparCG server cases and the disabled OAuth-server case.

| Repair / actual merge | Full main CI | Configured actual result |
| --- | --- | --- |
| #1515 / `929d1f1f1137297e8763745f5217b48ee0370e6c` | 39287816751: 2,171 passed, 1 existing skip; no failed/flaky/retry markers; E2E retry skipped | 39287816358: **107 passed, 1 flaky, 3 skipped**. Deep-link failed at retry 0 and passed at retry 1; all three account cases passed at retry 0. This was not a clean cumulative run. |
| #1519 / `70714e8f594479aa064486c75bb58bb7cc47695c` | 39307315592: 2,185 passed, 1 existing skip; no failed/flaky/retry markers; E2E retry skipped | 39307315262: 108 passed, 3 skipped; all results retry 0. Deep-link was still quarantined here. |
| #1520 / `ba5e72e37f3dd1771e40e87ce229cad3ff907402` | 39312411561: 2,185 passed, 1 existing skip; no failed/flaky/retry markers; E2E retry skipped | 39312411520: 109 passed, 3 skipped; all results retry 0, no failures/flakes. All three account and all six deep-link cases ran normally. |

[Shard facts](ci-shard-facts.json) and
[configured per-case facts and hashes](prerequisite-configured-facts.json).
The latest offline combined HTML report ZIP independently hashes to
`808a60bae6649c87b0845d83f792579accae96664975473bf937eb69ccafd8e4`.
Its embedded per-file JSON contains 2,185 passed/retry 0 and one skipped/retry 0;
all 32 editor-group and 14 editor-key cases are present. The skip is
`catalog-baseline.spec.ts:392`, Windows-recorded font rasterization on Linux.
[Decoded facts](latest-offline-facts.json).

The pinned main SHA's own CI 39313494301 was also checked independently, all
15 shard logs: 2,185 passed, one existing skip, no failed/flaky/retry markers.
Build, Factory, combined report, CI gate and After the gate passed; E2E retry
and failed-Build/Factory rerun skipped. Pinned configured 39313494376/job
118268888659 reports 109 passed, three existing skips, zero failures/flakes/retries.
[Pinned-source CI facts](pinned-source-ci.json). No new CI is substituted for
an older failed run.
Current classification has account, editor-keys and deep-link released. The
editor-key repair changes only its seek helper; AST comparison preserves all
12 original test calls (11 literal cases plus the three-width generated case,
14 executed cases). All five original deep-link case bodies are byte-identical;
one regression is additive. Eight real-module Node receipt/negative guards pass
freshly. The group spec is byte-identical to #1509, SHA256
`978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78`.

Reuse, without another diagnostic, account matching proof 39279909249: original
58:78 strict-mode ambiguity, identical-delay repaired pass, then three normal
passes, retry 0, source restored. Editor-key recorded matching-fault facts show
the drag against consumed request 11/time 0 while request 12/time 1 was pending;
the repaired gesture waits for receipt and rendered pose 12/time 1. Deep-link
baseline 39307804274 fails the unchanged 60-second assertion; identical fault
39309819955 and normal six-case 39309903933 pass. These establish the challenged
paths, not the historical runner's unique unrecorded scheduling. Earlier
ineffective probes remain ineffective; the corrected editor diagnostic is consumed.

## Fresh runtime ledger

Product, maintained tests/helpers, configuration, budgets, assertions and
quarantine data are unchanged. Probe `50cc4b895721ceeeccda700fc5ecd823e27f3a87`
adds the 19 unchanged carried spec paths from `9bef784b73fa979d24fe254da1dbc156cb7ba342`
and one disposable five-case Actions workflow. No old workflow or helper is
imported. Its isolated stack env/setup is copied byte-for-byte from current
configured-suite.yml; no production account or backend is used.

| Queue/run | Selection and independent result |
| --- | --- |
| j-0001, cap 5 | Maintained copy-arrival file, retries 0: **3 passed in 49.9 s**. Real waits: unedited 10,402 ms, edited 10,471 ms, chained 20,042 ms. Correct clean/dirty links, no naming on timeout, preserved source, retry into the right copy, 2/2/3 records and byte-equal winner. All three timeout pictures opened; Save failed remains in the editor and the newer rectangle remains selected in the edited case. |
| j-0003, cap 12 | **215 passed in 9.6 minutes**, no skips/retries. Named ten-file maintained selection: new-graphic guard, wizard draft, library, six save-transaction files, editor-groups. Includes all 49 main transaction-matrix cases and all 32 #1509 cases. Admission pins main `4e067b656`; subsequent probe additions change no selected file, helper, product or configuration byte. |
| j-0004, cap 5 | **6 pinned-reference cases passed in 19.0 s**, zero skips/retries. Primary Studio/Eyevinn rendered captures opened and inspected; fresh source hashes and binary hash above. |
| j-0005, cap 5 | **3 passed, 1 failed** in 49.4 s: nested ownership, desktop and laptop pass; 125% reaches its outer-window resize check, asks 1920×1080 and receives 1919×1079 at unchanged line 132 / 7,000 ms. The virtual display itself is exactly 1920×1080 (`xrandr`), so it constrains the requested window. This setup failure remains failed. Assertions/source/budgets remain byte-identical for any subsequent independently identified display run. |
| j-0006, cap 5 | **7 failed**, the same retained ninth-checker assertions: C-pull :117, C-overlap :158, V-superseded :199 twice, V-reservations :247 three times. Fresh facts and independent judgments below; never relabelled green. |
| j-0008, cap 5 | **33 passed in 2.0 minutes**: sixth 10, seventh 16, eighth 7, zero skips/retries. Includes #1383 S6 double refusal and #1402 H two-tab reservation ownership. |
| j-0009, cap 5 | **28 passed in 1.6 minutes**: original 3, second 4, third 10, fourth 11, zero skips/retries. |
| j-0010, cap 5 | **17 passed, 3 failed in 4.8 minutes**, zero retries/skips. Original fifth B1 times out at its unbounded absent-alert `textContent` (:263); F-hold/F-late time out at :464 waiting for a library row after cancelling the guarded Open. All three original failures remain red. |
| j-0011, cap 5 | Original carried B1-only bounded variant **1 passed in 9.3 s**, zero retries/skips. This is the existing separate recipe, not an edit of the failed original. |
| j-0012, cap 5 | Original actual-125 case on separate larger display `:98`: **1 passed in 23.1 s**, zero retries/skips. `xrandr` reports 2048×1536 rather than j-0005's 1920×1080 display boundary. The unchanged requested outer-window assertions now pass. Actual zoom starts/ends at 1.25, content 1093×545 / outer 1366×768; canvas 196 px, timeline 180 px, inspector 280 px. All three browser-executed exports pass; no page errors/failed requests. It does not convert j-0005 to a pass. |
| Actions 39321383510, probe `50cc4b895` | **4 passed, 1 failed** in 3.3 minutes, zero skips/flakes/retries, one dispatch-by-push. X-device, both S-concurrent orders and signed-in save/cloud/discard separation pass. R-departure fails only its original :281 expectation that pristine C asks/names. All five execute; the completeness guard passes and the overall run stays red. Isolated stack stopped without backup. Artifact 12219469232 hashes to `f502010b64a98ee93a70422a58db26708ad84ec8888a96780193805c3af711bf`. |

All local browser jobs are terminal. Both task-owned X servers were stopped.
The queue commands, every passing/failed case line and final summaries are in
[queue facts](queue-facts.json). Browser worker selection stays at two; no
assertion, timeout, retry policy or broader admission is changed to finish a run.

Setup disclosures: initial npm installation could not write its default cache
under `/home/agent/.npm`; installing into this owned worktree with an explicit
writable npm cache succeeded. One default-context Node launcher reported only
the wrapper file as passing; it is not counted as the eight-case proof. The
supported granted shell ran all eight named cases normally. A transport
disconnect after j-0001 admission obscured its acknowledgement; inventory found
it already running and the accidentally queued duplicate j-0002 was cancelled
before execution. j-0007 was likewise cancelled before execution to separate the
original fifth scope from the original recipe's B1-only bounded variant. Neither
cancelled entry ran tests or replaced an executed verdict.

### Fresh judgment of carried departures

[Ninth raw facts](ninth-facts.json) and [device report/facts](device-facts.json).
C-pull again reloads the other device's Alpha working slot:
`editorHoldsOtherDevice:true`, `editorHoldsMine:false`. The subsequent explicit
edit/Save changes Alpha (`alphaUnchanged:false`), while `alphaHoldsMine:false`
and `copyHoldsMine:true`. It is not this device's conflicted source overwriting
the winner. The account-wide singleton working-slot/source-replacement limit
remains explicit; do not claim Alpha byte-equal or the original draft retained
after that reload. C-overlap and both V-superseded cases have `alphaUnchanged:true`.
Their null-link assertions are superseded by the owner's clean-copy rule, not
removed. V-reservations retains the disclosed double-refusal plus unusable/lost
reservation-list duplicate limit, preserving the original minted source. The
normal S6 double-refusal case passes unchanged and is not waived by that limit.

Fresh X-device uses B's own record id, preserves Alpha byte-equal, and never
puts B's source over Alpha. Both S-concurrent orders keep B linked clean to its
copy; no Home question, and the leaves-at-once order also asks nothing at New
before/after reload. Gamma holds A's work; B has its own record. R-departure
strips the pulled mint mark, never adopts A's id into B's device list, and ends
with `cLeave:{asked:0,named:0}`, `cMinted:null`, `alphaFinalUnchanged:true`.
Pristine C correctly asks nothing under AC4. This explains the unchanged red
assertion without converting the red run to a pass or granting a new exception.

Fifth B1's bounded existing variant independently confirms that an absent app
storage alert is the required product behavior. F-hold/F-late press Cancel on
guarded Open and correctly remain in the editor; waiting for the subsequent
library row is incompatible with that cancellation and would reopen #1392 if
allowed. The maintained navigation/in-flight cases exercise the actual guard.
These judgments retain every original failed assertion and budget.

## Independent gate findings and proposed owner scope

### Late-send release did not earn its claimed fresh passes

#1516 merged `30934c50fc0f548cbb60a3acffc2062021d9e4cb` at 17:15:55 UTC.
#1517 was opened at 17:18:33 UTC, only 158 seconds later, and merged at 17:29:27.
Only one new main quarantine run existed before its creation: 39292623613.
Thus its claim of twenty fresh consecutive passes is unsupported. Its diff only
moves the count-12 entry to `released`; there is no test or product repair.
The P1 review comment correctly identifies reuse of earlier quarantine cycles.

Static mechanism: `passHistories` in `scripts/e2e-quarantine.mjs` scans historical
main runs without the current entry's boundary; `consecutivePasses` ignores nulls,
and `dueForRelease` receives only these verdicts. The triggering configured
failure need not itself be a quarantine status to reset this history. This
permits the same known flaky spec to be released from older success statuses.

The full original late-send log (39287029913/job 118176652285) fails at
`e2e/configured/_helpers.ts:237`, called by `late-send-abandoned.spec.ts:96`:
the 30-second `watchLogReads` level predicate expected true, received false.
This is before the held-Take negative output assertion. Its retry passed.
Neither an on-air leak nor a harness-only cause follows from that observation.
Later normal configured passes are regression observations, not a matching-fault repair.

Proposed separate owner scope: `scripts/e2e-quarantine.mjs` and its existing
`scripts/e2e-quarantine.test.mjs` should bind release history to the current
entry/triggering failure and prove older statuses cannot satisfy a new cycle.
The existing entry's `run` URL identifies the triggering run; a calendar date
alone cannot distinguish this same-day re-entry. Count only unique qualifying
post-entry main results, fail closed when that boundary is unproved, and cover
twenty old successes plus one fresh success, later failure, duplicate statuses,
and twenty genuinely fresh successes in the existing regression fixtures.
Separately diagnose the exact `watchLogReads` failure through
`e2e/configured/_helpers.ts` and `e2e/configured/late-send-abandoned.spec.ts`.
Do not change assertions, quiet-window/time budgets or classification to obtain
a pass. If diagnosis identifies a product defect, propose the precise product
paths for another reservation decision before implementation.

### Nightly budget restored on pinned source; rolling alarm remains open

#1498 remains open. Original scheduled nightly 39201147576 on `bb82c4dfc` has all 14 E2E
shards green and traces 231/231 files to completion, but combined job 117898781644
fails: **mean per-test time 6.09 s exceeds the unchanged 5.50 s ceiling**.
That failed source predates the landed trace-runtime change. The fresh pinned
verification below independently checks the current profile. No ceiling increase,
classification change, alarm closure or retry of the original nightly occurs here.

Because that nightly predates the landed runtime repair, a new-source
verification of the unchanged nightly workflow was admitted once on pristine
branch `codex/independent-p2-1466-main-checks`, worktree
`/workspace/p2-1466-main-checks`, pinned to the same `4e067b656` source. This
branch contains none of the disposable carried additions. The prescribed
`verification-dispatch.mjs -- workflow run nightly.yml --ref <branch>` first
reported advisory `UNRESOLVED` (dispatch input/default identity), then dispatched
once: run 39323236011, attempt 1. No old run is retried and no workflow, limit,
selection or source is edited. A branch
dispatch does not close main's rolling alarm.

**Terminal result: FAILURE**, source `4e067b656`, attempt 1. The complete report
has **2,184 passed, 1 failed, 1 existing platform skip; zero flaky/retries**.
Every actual result has retry index 0. All 32 editor-group and 14 editor-key
cases pass. Artifact 12221474022 independently hashes to
`67dad5600a068c73e8360addd36ffa65ae1e62793a53acf22fc674cd6ed7d7e2`.
[Complete-count/per-case facts](fresh-nightly-facts.json).

The **time-budget step passes: mean 3.88 s against the unchanged 5.50 s ceiling**.
Catalog calibration passes 61 cases, and all five catalog quality gates pass.
Combined report job 118308513931 succeeds; Nightly verdict 118308791367 fails
because of the E2E setup failure below. The traced map reports **231/232 fresh
completed specs**, retaining the previous editor-arrangement entry; no complete
fresh trace-map coverage is claimed for that file. The original 6.09-second
failure stays failed and #1498 stays open; no further performance source repair
or budget change is proposed from this passing current-profile measurement.
[Terminal job evidence](nightly-terminal.json).

### Fresh pinned-source editor-arrangement gate failure

New nightly 39323236011, shard 7/15, job 118302580795, finished **152 passed,
1 failed**, zero retries. The case `animated resize preserves its earlier scale
key and refuses shared-axis conflicts` (`editor-arrangement.spec.ts:277`)
fails in its `open()` helper at **line 15:14**, called by line 278:3:
`page.evaluate: Execution context was destroyed, most likely because of a navigation.`
The animated-resize assertions have not executed. Editor-arrangement is in
`released` on this exact source, not hidden in quarantine.

The whole failed job log was read. [Signature](nightly-arrangement-failure.json).
Artifact 12221976050 independently hashes to
`4e41255e6ec22b2e96078f5fbd4599f962dc0637f078c6512fa98064f380c13d`.
Its screenshot and trace were opened/read. The editor remains mounted with the
Hairline fixture and Preparing preview. The trace records initial goto, then
the failing applyTemplate evaluate, which rejects after about 37 ms. That
observation does not establish why its execution context stopped answering.
The helper awaits an `applyTemplate` mutation as its last page-side act and
returns immediately. The scoped `e2e/async-whose-last-act-starts-work` contract
requires answering from a later task after work that starts a render. That is
a concrete diagnostic candidate; the generic execution-context error alone
does not prove whether a navigation, context lifetime or another mechanism
caused this occurrence. Do not infer a product animation defect or a completed
harness repair from that static match.

Proposed owner scope: **`e2e/editor-arrangement.spec.ts`, `open()` at lines 11–16**,
with the existing case at line 277, assertions, source fixture and budgets preserved.
Inspect this trace and establish a matching proof before a coverage-preserving
helper repair. Broader helper/product paths remain reserved pending a precise
additional finding. No rerun, quarantine, helper edit or product fix is performed
by this checker. Existing in-flight nightly jobs are followed to terminal results.

Original CI 39250656173 remains failed despite its same-source retry. #1506 is
closed unmerged. #1509's 32 cases and assertions remain. No release, retirement,
helper weakening, green-retry substitution, #1466 closure, Step 6 or Phase 3 occurs.

## Reference and acceptance limits

Studio official v0.17 binary SHA256
`9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681` was freshly
downloaded and checked. Source pins remain Studio
`3142fc7d02934494931eb14e7dc255393e4110d0` / release
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`, and Eyevinn
`616841bd949e3a21137579451123f66c292543f0`.
All 17 source paths were freshly hashed; the 16 hashes listed in the canonical
reference JSON match, and Studio's tenth history-store file is release-identical.
Menubar → fileIO → projectStore/useAutosave, Eyevinn TemplateManager storage and
preview wiring, and corresponding file/model/lifecycle tests were inspected.

Studio explicitly downloads/saves a project and separately autosaves after
500 ms; New asks even after Save. Eyevinn stores template edits automatically
and deletion is explicit. Neither reference has this cross-device conflict-copy
arrival wait; the NoaCG save/link contract is its direct oracle. No upstream
source is copied and no whole-editor equivalence is claimed.

Browser cumulative/output evidence and a dummy-display browser zoom exercise
cannot qualify a physical receiver, the owner's desktop/laptop, native file
pickers or comfort at 125%. Those judgments and owner acceptance remain separate.

The cleanup disposition inventory remains 476 rows: 268 G, 92 C, 116 R.
Historical repeated-run and mutation receipts are retained as historical evidence;
no fresh product-source mutation is authorized or performed by this checker.

## Scope review and coordinator boundary

Inline source review inspected #1487's `saveLinked` initial-clean guard and per-id
arrival loop, #1519's correlated receipt/rendered-pose wait, #1520's per-pass
completion receipt, failure/account-supersession paths, and the lookup's retained
arrival listener/backstop. No additional product defect is established by that
review. The fresh runtime challenges above, rather than this static review or
the receipts alone, support the repaired behavior.

The Step 6 coordinator's owner-authorized message requests one pinned source and
a conditional narrow cleanup release only after an explicit successful verdict.
This check changes no product source and observed no competing editor-path edit.
**A BLOCKED verdict preserves all shared reservations; Step 6 cannot start from
this receipt.** Phase 3 and broader product work are not authorized here.
The chat-send tool is absent from this session's exposed tool inventory; no
cross-chat message is claimed. The maintained receipt records the verdict for
coordinator chat `01a152c8-9a1f-7452-a356-5539c360b642` to retrieve.

## Criterion-by-criterion independent judgment

| Criterion | Fresh evidence and limit |
| --- | --- |
| 1. Question over editor; cancel keeps source/selection/history | Maintained guard plus original–eighth carried scopes preserve negative destination checks, cancelled naming, Escape and Undo/Redo. No source mutation or guard exception is introduced. |
| 2. Exact Save/discard; no delayed question, duplicate or winner overwrite | All three real-timer copy-arrival/retry cases pass, including an edit during the wait and chained copies. Both real-backend S-concurrent orders pass. C-pull's account-wide-slot replacement and the degraded-storage double-refusal/list-loss duplicate limit remain qualified above, with red assertions retained. |
| 3. New/Open/Back/hash; refusal/double submission; reload | Maintained 215-case selection and original–eighth carried scopes preserve each boundary, working-slot refusal, in-flight dialogs, duplicate prevention, no resurrection, S6 and H. No new source-loss or winner-overwrite finding is established. |
| 4. Pristine baseline, wizard-held walk and local/cloud/production separation | Wizard draft and pristine baseline maintained cases pass. Fresh configured signed-in source/cloud/discard task passes; R-departure's unchanged red :281 assertion again observes the required pristine no-question behavior. Existing production-copy assertions and exported output checks remain. |
| 5. Pinned references, lifecycle, hashes and source comparison | Six fresh runtime tasks pass; official v0.17 binary and 17 inspected source hashes are recorded. Deliberate save/autosave/deletion differences remain explicit. No reference equivalent exists for this conflict-copy arrival wait. |
| 6. Desktop/laptop/125%, cumulative preservation and outputs | Desktop/laptop, nested ownership and the separately identified larger-display actual-125 execution pass; all nine SPX/CasparCG/OGraf outputs execute without errors. All three viewport captures were inspected: authored text/artwork, handles, timeline and inspector remain; Fit artwork is small and Properties requires scrolling at 125%. The first native-window setup failure remains failed. No physical-host, native-picker or owner-comfort acceptance follows from these browser checks. |

These functional observations do not clear the release-evidence failure or
the fresh editor-arrangement failure, or substitute workflow colors for gate evidence.
The final independent Phase 2
verdict is **BLOCKED**, with source reservations preserved.

Receipt review and simplification ran inline: source/merge identities, per-case
results, retained red assertions, environment differences and every stated limit
were checked against their evidence. No product repair was made. The reached
documentation gates pass (contract freshness/citations, docs index, client-secret
scan and copy), and git whitespace checks pass. These checks validate the receipt,
not Phase 2 acceptance. The receipt is committed/pushed on its own documentation
branch; no PR, auto-merge, merge-queue submission or acceptance stamp is created.
All owned runtime checks are terminal; no monitor or unattended repair is claimed.
