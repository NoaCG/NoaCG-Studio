# Independent bounded Phase 2 engineering check

2026-10-20 UTC. **Verdict: FAIL gated engineering acceptance.**
The fresh reservation and maintained selections pass, but exact-source main CI
has a retained full-shard failure and configured has a retry-0 sign-in failure.
Further acceptance execution stopped immediately;
only existing workflow evidence is collected to terminal results.
This fresh checker built none of the repairs and received only the acceptance brief,
without the builder conversation. Whole Phase 2 remains incomplete until the separate
local Review Phase 2 receipt exists. Step 6 is COMPLETE and its approved release remains effective.

## Source and independent isolation

Independently fetched and pinned landed PR #1530 source
`5b843f32d3df48bcd10ca64ea2c957ae7b2810c1`, tree
`490bc9177c452d348c0098e93eb7af629bfea431`. The source identity is separate from
this evidence commit. Own branch `codex/p2-bounded-independent-20261020`, worktree
`/workspace/p2-bounded-independent`; dependencies reuse the primary node_modules
through a symlink. All commands execute here. The source initially had no dirty paths.

Read root/scoped contracts, cloud-delegate/check/verify/queue-merge procedures,
the original six criteria and additions, the exact maintained table and independent
FAIL at `a03522403cf8086c8f27bc7849aa6ab6347cbef1`, repair receipt at
`f4b5c59b4dcbac807cccbf3b5b1990a7a4b146eb`, immutable independent-12, and
[PR #1528's terminal comment](https://github.com/NoaCG/NoaCG-Studio/pull/1528#issuecomment-6283599569).
Their judgments are inputs; the current verdict follows the fresh results below.
Fetching a035 populated its missing local objects; both requested exact-ref paths
were then readable. No alternate evidence identity was substituted.

Runtime/network policy was inspected with the cloud runtime skill. The selected
runtime is connected; its observed binding differs from the original preserved
repository binding and establishes no CLI environment mapping. This is a **same-VM
independent subagent**, not a separately qualified native remote cloud-child launch.
The network-enabled `node scripts/cloud-network-preflight.mjs` passed both Git
origin/main and GitHub Actions API reads. Fetch/read and the later evidence push
are qualified separately. No credential/config/proxy/TLS setting was changed.
Known denied commit-status and signed CLI-log paths were not retried.

Executing resource detection gives four CPUs, 16 GiB machine memory and **two
browser workers**, without overrides. Hidden cgroup ancestors could not be read;
these are fallback machine totals. The local queue was empty before the check.
Worktree/activity and open-PR inventories were re-audited: no competing source
fixer or browser job was started. The parent retains PR #1530 terminal ownership;
this checker owns evidence only. [Isolation facts](isolation.json).

## Fresh unchanged reservation challenge

Only `e2e/leave-ninth-checker.spec.ts` was temporarily materialized from canonical
`9bef784b73fa979d24fe254da1dbc156cb7ba342`, SHA256
`2e8fdba7d45b65a67649a4ce13cefe10707db157834b9af183079c1e92e00307`.
No helper or old workflow was imported. The original file, assertions, 180-second
case and 7-second expect limits were unchanged.

```sh
node scripts/execution-profile.mjs
node scripts/e2e-affected.mjs --list --files e2e/leave-ninth-checker.spec.ts
node scripts/jobs.mjs add "npm run test:e2e -- e2e/leave-ninth-checker.spec.ts --grep V-reservations --retries=0" --cap 5
node scripts/jobs.mjs log j-0005
```

Queue **j-0005: 3 passed in 20.9 seconds, zero failures/skips/retries**.
All three use one page and reach both original final assertions.

| Device-list challenge | Case duration | After reload | Naming | Records | Minted artwork |
| --- | --- | --- | --- | --- | --- |
| Newer version | 11.1 s | Minted ID, dirty true | None | 1 | Exact requested source |
| Corrupt | 9.6 s | Minted ID, dirty true | None | 1 | Exact requested source |
| Missing | 5.5 s | Minted ID, dirty true | None | 1 | Exact requested source |

The newer-version list stays byte-identical. Raw facts:
[newer](v-reservations-newer-version.json), [corrupt](v-reservations-corrupt.json),
[missing](v-reservations-missing.json), [whole log](canonical-run.txt).
Facts/logs were copied immediately to `/tmp/p2-independent-20261020` before the
temporary spec was removed and before broader admission could replace test-results.
They are retained here. The temporary spec is absent from the final tree.

## Ownership review and limits

Independent source review covers `project.ts`, `deviceIds.ts`, the boot relink in
`templateStore.ts`, and the maintained ownership/transaction assertions. Allocation
records the ID in both non-synced lists; either readable list can prove ownership.
Both retain version 1 and the 20-ID bound, and unknown newer versions remain
unmodified. Boot still requires ownership **and** the existing mint mark or exact
source match before relinking an existing record. A pulled slot strips its mint
mark and preserves an existing locally owned reservation; its synced ID alone
does not prove ownership. ID-taken rotation and conflict-copy handling remain.
No additional source defect is established in this bounded review.

This proves same-tab reload recovery under each challenged device-list failure.
Closing that tab with the device list also lost, both stores refusing ownership,
or ownership aging beyond the bounded list remain limits. The implementation
fails closed rather than trusting a foreign synced ID; duplicate-only degradation
under those separate conditions is not claimed repaired. Duplicated tabs can
inherit sessionStorage, so the preserved source/mint/ID-taken guards remain
necessary. Concurrent authoring is deferred, never accepted here.

All 19 carried source hashes were independently checked against their immutable
manifest; only the three specified ninth cases were executed afresh. All seven
broader files remain byte-identical to Step 6. The group spec matches required
SHA256 `978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78`.
[Integrity facts](integrity.json).

## Broader maintained selection

One relevant seven-file selection is admitted as **j-0006, cap 12**, with retries 0:
`save-transaction.spec.ts`, `editor-groups.spec.ts`, and the transaction holds,
leave, leave-modal, leave-shortcut and wizard files. It covers ordinary/double
refusals, reload/duplicate/crash ownership, foreign IDs, chained conflict copies,
newer edits during waits, guarded destinations and all 32 group cases.
The planner listed those seven files. The queue records the exact committed
source above and `kind: broader`; temporary probe removal and clean admission
preceded evidence writes. This is the only broader admission on this source.

Result: **159 passed in 8.0 minutes, zero failures/skips/retries**, exit 0.
This includes all 49 main save-transaction cases, all 32 group cases and 78 cases
across the five remaining files. [Whole log](broader-run.txt) and
[queue/source-pin/per-case facts](queue-facts.json). The queue is empty afterward.
No further browser selection, build or whole suite is run on this worker.

## Gate audit and criterion judgment

The supplied PR and merge-group report ZIPs were independently hashed, their
embedded per-file JSON decoded, and every actual attempt inspected. Each contains
**793 passes, retry 0, zero failures/flaky/skips** across the selected suite.
Neither contains group cases; neither is represented as a full-suite run.
[PR facts](pr-facts.json), [merge-group facts](merge-group-facts.json).

Exact-source CI `39389253794` has a failed original full shard 9/15,
job `118516608678`: **129 passed / 1 failed in 10.4 minutes**.
The unchanged `import-svg-behaviour.spec.ts:665` quiz first-option case fails at
**683:70**, `toBeEnabled`, 7,000 ms: `getByRole('button', { name: /Reveal correct/ })`
resolves to both `verb-next` and `cue-action-judge`. The complete job log was
independently fetched through the GitHub connector and read; no cause or repair
is inferred from the strict-mode signature. [Whole failed log](failed-shard-9.txt).
The already-existing automatic retry, job `118521742810`, subsequently passed
**38 cases in 4.0 minutes** on the identical source. Its whole log was independently
fetched/read and [retained](automatic-retry.txt). This is **fail-then-pass**, not a
repair; the original failure remains. [Failure/retry facts](failure-facts.json).
No manual retry, diagnostic, quarantine change or repair is launched by this checker.
The existing CI's After-the-gate automation proposed quarantine PR #1532 after
that fail-then-pass. The parent stopped its auto-merge to honor the owner's STOP;
the bot proposal is parked for a scope decision, **not acceptance or repair**.
Read-only reinspection finds it OPEN with no auto-merge or queue entry, head
`cf3fcb7f4041f2dbbc2f9e0d6442842cf7db8600`.
[Parent's hold receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1532#issuecomment-6286531375).
No classification or source change on main is used as a workaround.
The independently decoded original combined report, artifact `12249601819`,
contains **2,184 passed / 1 failed / 1 existing platform skip**, all **2,186
results retry 0**, no flakes. SHA256
`17261c4128eaacaeaaaaef434e6631aa2047b30df6da7b08d9ff67d274c89422`.
Metadata pins the exact landed source. All 32 groups, 49 main save-transaction,
14 keys, three copy-arrival, 18 wizard and 25 arrangement cases pass normally.
The sole skip is unchanged `catalog-baseline.spec.ts:392`, the Windows-recorded
font-rasterization baseline on Linux. [Full per-case facts](exact-main-facts.json).
The full workflow is terminal **FAILURE**, attempt 1; the original shard is its
only failed job. Authenticated configured `39389253761` is terminal SUCCESS,
but its actual report is **108 expected / 1 flaky / 3 existing skips**. Across
actual attempts: **109 passed / 1 failed / 3 skipped**, with 112 retry-0 results
and one retry-1 result. Artifact `12249839326` independently hashes to
`3abbf30d21dcf587b705086235f8eb5420d3eb79fa7c2c90725b3645ec2fbf04`.
The retained retry-0 failure is `shared-lab-computer.spec.ts:113`, at helper
`112:46`, caller `158:9`: `.auth-status` remains absent after the unchanged
20,000 ms visibility wait. Retry 1 passes. Its workflow color is not a clean
configured PASS. The complete existing job log was independently fetched/read;
[failure excerpt](configured-failure.txt) excludes setup environment values.
[Raw configured facts](configured-facts.json) preserve both attempts. No diagnosis
or manual rerun follows. The configured automation's quarantine proposal is not
used to repair or accept this source. Its bot PR #1533 is also parked by the
parent with no auto-merge or queue entry, OPEN at head
`b0a61914543dd9b31aac51a4e28648fece4ac148`.
[Parent's second hold receipt](https://github.com/NoaCG/NoaCG-Studio/pull/1533#issuecomment-6286793804).
Independent readback confirms both #1532 and #1533 remain held; no classification,
test or source change reached main, which still points to the checked source.

The three skips are unchanged and allowed: the two real CasparCG server cases,
`bridge-real-server.spec.ts:75` and `:242`, and the OAuth-disabled deployment case,
`connector-grants.spec.ts:200`. All three account, six deep-link and late-send
cases pass normally at retry 0. The unchanged completeness floor is 104;
109 cases ran, including the flaky case. Completeness does not clear that failure.
Configured-quarantine job `118529760871` succeeded as automation bookkeeping,
not runtime repair evidence.

CodeQL/Push-on-main `39389253588` succeeded. Exact-source
Post-landing `39389253758` and Quarantine `39389253777` succeeded; quarantine
is empty and runs no browser cases. Deployment verifier `39389568777` succeeded;
earlier deployment-status verifier runs remain skipped. All applicable exact-source
workflows are terminal; [terminal run/job facts](terminal-gates.json) preserve
every success, failure and skip. There is no overall gate or engineering PASS.

| Criterion | Independent disposition in the approved scope |
| --- | --- |
| AC1: wizard/import leave boundary, negative destination, Cancel/Escape/cancelled naming, source/selection/history | **PASS applicable unchanged maintained exact-main coverage**, supplemented by reused carried engineering evidence. Local native journey remains separate. |
| AC2/AC3: R/K refusal plus newer/corrupt/missing device list; reload and Save without duplicates | **PASS fresh:** all three unchanged canonical assertions, one retained exact-source record, no new naming. This replaces no earlier failed verdict. |
| AC2: ordinary Save/first Save/reopen; discard creates no record and preserves saved experiments | **PASS applicable fresh maintained coverage** in j-0006; prior unchanged carried engineering evidence retained. Local cumulative journey remains separate. |
| AC2: clean-copy timeout/retry, edits during wait, chained IDs and winner preservation | **PASS three normal real-timer exact-main cases**, supplemented by independent-12's original interpretation and matching evidence. No new reference or timing campaign. Concurrent copy creation/adoption remains deferred. |
| AC3: New/Open/Back/hash, failed write/double submission, no early navigation or resurrection | **PASS applicable fresh maintained coverage**, with prior carried evidence reused. No destination assertion, retry or limit changed. |
| Ownership: source/mint, ID-taken rotation, foreign IDs, duplicate/crashed-tab regression guards | **PASS fresh maintained regressions**; static guards preserved. Multi-tab execution in a regression does not authorize concurrent authoring. |
| AC4: pristine baseline, wizard-held walk, local library/cloud/production separation | Applicable maintained exact-main and account/deep-link/late-send cases pass normally; prior carried evidence reused. Configured shared-lab retry-0 sign-in failure is separately **retained**, not passed. Original R-departure failed result stays failed. |
| AC4: sequential isolated-profile handoff | **NOT CHECKED HERE:** belongs to the separate local receipt; not physical-device proof. |
| AC5: pinned Studio/Eyevinn lifecycle comparisons | **SATISFIED AS REUSED BOUNDED ENGINEERING EVIDENCE**, with original source/binary/hash qualifications. No equivalent reservation-recovery task or whole-editor parity. |
| AC6: cumulative text/artwork/animation/outputs, native file interaction, actual 125% | Prior browser evidence retained; **fresh final-source local receipt pending**. No cloud-native/physical-host acceptance. |
| Refused discard/newer edits, history/Undo/Redo, pending autosave, wizard Back/start-over, sequential exports | **PASS applicable fresh maintained coverage**, supplemented by prior carried engineering evidence; final exact-main report remains separately qualified. |
| All 32 #1509 group assertions including rendered cancellation/pose restoration | **PASS fresh** in the bounded selection and all 32 normal exact-main results, retry 0. Required byte identity independently verified. |
| Exact-source full CI and configured completeness/skips/classification | **FAIL:** original full shard 9/15 fails the unchanged quiz assertion, and configured shared-lab fails retry 0 before passing retry 1. Both original failures remain. Completeness and unchanged skips are verified; a green retry or workflow replaces neither failure. |
| Current-source project-wide nightly; historical late-send matching diagnosis; physical receiving host; broader comfort | **DEFERRED/UNRESOLVED, NEVER PASSED** by the present owner scope. Existing failed results retained below. |

The cumulative whole-Phase-2 verdict remains incomplete until the separate local
receipt exists, even if every approved cloud engineering row passes.

## Retained failure and deferred-work accounting

The prior exact-source independent check at `a0352240` remains **FAIL**: all three
original V-reservations results observed two records. Today's three normal passes
support the landed repair; they do not rewrite those earlier results. Original
fifth B1 :263 and F-hold/F-late :464, four other ninth assertions, and configured
R-departure :281 remain failed historical results. The separate B1 variant,
guard-cancel explanations and pristine no-question behavior do not turn red runs
green. The virtual-window 1919×1079 setup failure also remains failed.
Historical C-pull keeps its exact qualification: `alphaUnchanged:false`,
`alphaHoldsMine:false`, `copyHoldsMine:true`; do not describe its winner as
byte-equal or its reloaded editor as retaining the original device's draft.

Original CI `39250656173` remains failed. The #1528 exact-main `39372052729`
original report retains **2,183 passed / 2 failed / 1 skip**, all retry 0;
its automatic retry retains **17 passed / 1 failed**. Its later Step 6 normal
result is separate, never a replacement. Step 6's cold-open isolation is not proof
of the old Chromium resource-lifetime cause. Original late-send `39287029913`
retains retry-0's 30-second false predicate at helper 237:8/caller 96:9 and its
passing retry 1; only the passing retry has a trace. Later passes establish no
matching cause. The claimed twenty fresh quarantine passes remain unsupported;
the count-12 release classification supplies no repair evidence. Future-cycle
accounting repair does not retroactively validate that release.

Nightly `39201147576` failed its unchanged 5.50-second ceiling at 6.09 seconds.
`39323236011` passed the 3.88-second mean but failed arrangement setup before
resize; scheduled pre-Step6 `39372122320` passed 4.89 seconds but failed cold-open.
Neither has complete fresh trace coverage; the ineffective forced-GC diagnostic
remains ineffective. No new nightly, repeated reference execution or historical
diagnosis campaign is launched. Project-wide nightly qualification, late-send
matching diagnosis, broader comfort acceptance and physical receiving-host proof
are **DEFERRED/UNRESOLVED, never passed** within the owner's present bounded scope.

Pinned Studio official v0.17 / source `3142fc7d02934494931eb14e7dc255393e4110d0`
and Eyevinn `616841bd949e3a21137579451123f66c292543f0` lifecycle evidence is
reused from independent-12, including its six runtime cases, official binary and
17 source hashes. There is no comparable synced reservation-recovery task in
those references. No fresh reference parity or copied source is claimed.

The local Review Phase 2 chat separately owns native import/download, actual
browser 125%, cumulative text/artwork/animation, Save/cancelled naming/Cancel/
Escape/Discard/navigation/reload/reopen and sequential isolated-profile handoff.
None is cloud-native/device acceptance from this receipt. Profile handoff is not
physical-device proof. Whole Phase 2 cannot pass before that local receipt exists.

Actual read-only issue state: **#1466 is CLOSED**, automatically at 2026-10-20
04:54:34Z via PR #1528's closing reference, despite stale receipts saying open.
This is issue bookkeeping, not an acceptance verdict. **#1498 remains OPEN**.
No issue-state write, external comment, stamp transfer, PR creation, main landing,
gate bypass, quarantine workaround or Phase 3 is performed by this checker.

Evidence review and simplification ran inline over the evidence-only scope: source/
tree identities, per-case counts, original/retry/skip distinctions, unchanged hashes,
historical failures, scope and links. No further changes or product finding were
introduced by those documentation passes. The five reached documentation checks
pass: contract freshness/citations, docs index, client-secret scan and copy.
[Check log](evidence-gates.txt), [verification facts](verification.json).
JSON parsing, relative links and authored Markdown/JSON whitespace pass. The full
diff reports 49 trailing-space warnings in the preserved raw logs; those original
capture bytes are retained rather than represented as a clean whitespace result.
Final scope validation finds evidence files only. These checks validate the receipt, not product acceptance;
no stamp is issued or transferred. No production build is needed for evidence.
