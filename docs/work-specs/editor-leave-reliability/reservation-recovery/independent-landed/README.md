# Independent landed-source bounded Phase 2 check

2026-10-20 UTC. **PASS for this bounded independent engineering leg:** three
original recovery cases and all 197 maintained cases passed at retry zero.
**Overall Phase 2 and local acceptance remain HELD.** The original
shared-lab App.tsx module-load failure remains unresolved; no auth/sync repair was
made. This receipt provides no whole-acceptance or physical-device verdict.

## Source and isolation

Test source is the actual PR #1537 merge
`12eccdd8533ba710f0917cb3bcc78101070ecca8`, tree
`ebcba7a8b69d117842dcd29b917dbf6013042a6c`.
Own branch `codex/p2-landed-independent-20261020`, worktree
`/workspace/p2-landed-independent`; native subagent task
`/root/p2_revised_independent`, nonce
`p2-revised-independent-12ecc-20261020-0943`. Executing runtime is
`ccarenv_b64_Y2NhcmVudl8zZTEzNGIwYWJkZTg4MTkxOTc1NTlkYmU3NDY4OGQ3OQ`.
The original root owner binding is unchanged. The bounded window ends at these
two job terminal results and this receipt, no later than 2026-10-20T10:10:00Z.
There is no further job or retry. This is an independent same-VM engineering checker,
not a separately qualified native remote cloud-child launch. Dependencies reuse
the existing node_modules through a symlink. No dependency, credential, proxy,
TLS or environment configuration was changed. Root owns PR repair, landing and
all exact-merge automatic terminal results; this checker owns evidence only.

Root/scoped contracts, cloud-delegate/check/verify/queue-merge, the leave-editor
criteria/additions and prior independent bounded receipt were read. Cloud runtime guidance and environment status were read; the
status reports a connected runtime with current enforced restricted network policy. Its observed runtime binding differs from the preserved original
repository binding and proves no CLI environment mapping. Git origin/main and
Actions API read preflight passed with supported shell network permission. Known
denied review/status/log routes were not retried. The queue was empty before the
first job. No competing source fixer or browser job was launched.

[Integrity](integrity.json) pins UTC, source, branch and all eight maintained file
hashes. [Retained source comparison](retained-source-comparison.json) confirms all
src paths are unchanged from the prior independently checked source
`5b843f32d3df48bcd10ca64ea2c957ae7b2810c1`; the relevant reservation files,
ProductionPage, save helper and Playwright configuration are byte-identical.
The group file retains SHA256
`978d49bee880f4f31bbc73c994c975ce45c3c4415e512dcc7f378c9af2632a78`.
The seven prior maintained files are unchanged. Quiz matches the independently
reviewed repair head exactly.

## Independent quiz review

[Static review facts](static-review.json) cover exactly PR #1537 head
`5bb8f3fe5517a81eb0b9d5b70b2646d4ae14cf35` against base
`ca8a3fe0132782daf931fb4aa2718ad061230a56`: the maintained import spec and its
three quiz-targeting evidence files. No actionable finding was established.
The whole spec is exactly the original file after six locator substitutions.
All cases, behavioral assertion call sites, fixtures, timeout/slow controls and
output checks are preserved. ProductionPage renders the direct action as
`⚡ {label}`; named Next includes its own Next/key text. Exact accessible-name
matching selects the intended direct action without changing its enabled check
or downstream rendered outcomes. There is no product-source change.

The supplied logs demonstrate a forced matching strict-mode ambiguity and one
passing fixed challenge with zero retries. The precise temporary fault expression
is described rather than retained as a patch in that four-file artifact. This
review does not independently prove the natural timing window's cause. Those
logs and a quiz locator fix do not repair the original shared-lab module load.

## Unchanged three-case challenge

Only the canonical `e2e/leave-ninth-checker.spec.ts` was temporarily materialized
from `9bef784b73fa979d24fe254da1dbc156cb7ba342`, SHA256
`2e8fdba7d45b65a67649a4ce13cefe10707db157834b9af183079c1e92e00307`.
The complete file is byte-identical; only its three V-reservations cases ran.
No helper, assertion or 180-second case / 7-second expect limit changed.

```sh
node scripts/execution-profile.mjs
node scripts/e2e-affected.mjs --list --files e2e/leave-ninth-checker.spec.ts
node scripts/jobs.mjs add "npm run test:e2e -- e2e/leave-ninth-checker.spec.ts --grep V-reservations --retries=0" --cap 5
```

Queue j-0015: **3 passed in 17.7 seconds, zero failures/skips/retries**, exit 0.
Each retained the minted ID after reload with dirty true, asked no new name,
created exactly one record and retained the requested source. The newer-version
list stayed byte-identical. Raw facts: [newer](v-reservations-newer-version.json),
[corrupt](v-reservations-corrupt.json), [missing](v-reservations-missing.json).
[Whole log](canonical-run.txt), [queue record](canonical-queue.json).
Facts were copied outside the worktree before the broader run could replace
outputs. The temporary spec was removed before broader admission; source was clean.
The original failed independent challenge, where each case produced two records,
remains a failed historical result. These fresh results do not rewrite it.

## Maintained selection and budget

The executing profile derives four CPUs, 16 GiB machine memory and **two browser
workers**, with no override. Hidden cgroup ancestors could not be read; machine
totals are the documented fallback. [Profile](profile.txt).
The planner listed exactly the [three-case probe file](probe-plan.txt) and the
[eight maintained files](maintained-plan.txt) before admission. A current profile
and recent same-VM runs estimated the seven prior files at 478.55 seconds and
quiz38 at 132 seconds: combined about 610.55 seconds, leaving 109.45 seconds
inside the unchanged twelve-minute cap. The [admission assessment](admission-assessment.json)
retains that estimate and its limits. No duration table, budget or worker policy changed.

Queue j-0016 admits the eight files once, as a broader selection pinned to the
exact test source above, cap12, retries0. It follows j-0015 serially through the
same queue. Its exact command is:

```sh
node scripts/jobs.mjs add "npm run test:e2e -- e2e/save-transaction.spec.ts e2e/editor-groups.spec.ts e2e/save-transaction-holds.spec.ts e2e/save-transaction-leave.spec.ts e2e/save-transaction-leave-modal.spec.ts e2e/save-transaction-leave-shortcut.spec.ts e2e/save-transaction-wizard.spec.ts e2e/import-svg-behaviour.spec.ts --retries=0" --cap 12
```

Result: **197 passed in 10.1 minutes**, zero failures/skips/retries, exit0.
The queue wall duration is 608.057 seconds, within cap12.
[Whole log](broader-run.txt), [queue record](broader-queue.json),
[per-case and timing facts](queue-facts.json).

| Maintained file | Actual passed cases |
| --- | ---: |
| `e2e/editor-groups.spec.ts` | 32 |
| `e2e/import-svg-behaviour.spec.ts` | 38 |
| `e2e/save-transaction-holds.spec.ts` | 20 |
| `e2e/save-transaction-leave-modal.spec.ts` | 18 |
| `e2e/save-transaction-leave-shortcut.spec.ts` | 15 |
| `e2e/save-transaction-leave.spec.ts` | 19 |
| `e2e/save-transaction-wizard.spec.ts` | 6 |
| `e2e/save-transaction.spec.ts` | 49 |

All 32 group cases and all 49 main save-transaction cases ran unchanged. The
queue was empty afterward. No build is needed for locator/evidence-only changes,
and no further browser job, whole-suite, historical diagnosis or nightly is
launched here.

The queue inventory also named rolling alarm #1538. Before browser execution, root
reconciled it to prior-source `0b0e4dc6` CI `39402519656`: cancellation at the time
limit, with no assertion failure or test verdict. It supplies no passing evidence
and is separate from this landed-source run.

## Scope and retained qualifications

Only this bounded fresh engineering leg can pass. Root's separately collected
PR/main/merge/configured/post-land/deployment results are not independently audited
or replaced here. At receipt close, root confirms exact-source configured run
`39402553595` remains IN_PROGRESS. Its terminal report is pending root; this
receipt makes no passing configured-suite claim. No retry or repair follows here. The earlier strict-mode and shared-lab failures remain in their
original logs; a workflow color, diagnostic baseline pass or controlled failure
cannot erase them. #1532/#1533 remain held. Step 6 is COMPLETE; #1466 is CLOSED
through #1528; #1498 is unresolved. All original deferrals and failures remain
qualified by the [prior independent receipt](https://github.com/NoaCG/NoaCG-Studio/blob/6e8e88f4013d1134b40e680b7bb3c6e1894a571f/docs/work-specs/editor-leave-reliability/reservation-recovery/independent-bounded/README.md);
no Phase 3 is authorized.

The earlier ownership source/mint/ID-taken guards and limits remain applicable:
these cases prove same-tab reload under the three device-list challenges. They
do not prove recovery after both ownership stores are lost/refused, beyond their
bounded retention, or under concurrent authoring. The single active authoring tab
per account workaround remains. Separate local native import/download, actual
125%, cumulative artwork/animation/save journeys and isolated-profile handoff
are not performed here. Profile handoff is not physical-device proof. Pinned
reference evidence is reused only within its prior qualifications; no new
reference, receiving-host or comfort-acceptance campaign is claimed.

No product/test/workflow/classification change, source repair, stamp, PR, issue
write, gate bypass or merge is performed by this evidence checker.


## Receipt verification

Evidence review and simplification ran inline over this evidence-only scope:
source/tree/nonce, complete per-case results, original failures, retry/skip
accounting, scope limits and links. No actionable evidence defect or additional
product finding was established. JSON parsing, relative links, authored Markdown/
JSON whitespace, retained source hashes and temporary-probe absence pass.
The five reached documentation checks pass: contract freshness/citations, docs
index, client-secret scan and copy. [Check log](evidence-gates.txt),
[verification facts](verification.json). These validate the receipt, not whole
product acceptance. No stamp is issued or transferred.
