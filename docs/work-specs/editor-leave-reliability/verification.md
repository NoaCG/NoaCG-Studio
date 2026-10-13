# Verification receipt

**PASS for the bounded leave-editor task.** This is engineering verification;
owner acceptance, broader comfort and deployment status remain separate.

## Scope and final evidence

Baseline `4508e133162cc65b6296b448e987f603fc17d479`. The exact independent
interaction receipt `dfdfe9f0a3f559f44a90dd4343a98797f18c080b` was cherry-picked
as `5f8c99de7ddfe39b29907b419a74d86323745361` and remains byte-identical.

[Final focused run 38459578040](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38459578040)
passes all seven lifecycle cases in 1.1 minutes, one Chromium worker, zero retries.
Its product and maintained-test source at
`aa91d015f274e06ac7b1900082f254d34e3b676a` matches the final worktree exactly.
[Run metadata](receipts/final-run.json).

| Acceptance | Result and evidence |
| --- | --- |
| Decide before Home or Open | Normal ZIP-import wizard and visual rectangle edit. Home and Open saved graphics keep the editor mounted and the destination absent until a decision. Cancel/Escape and cancelled naming preserve source/history. |
| Keep and reopen | First Save produces one record despite two synchronous submit events. The Home -> control -> Edit route reopens its exact source. Linked Save updates the same ID. |
| Discard without keeping an experiment | Discard restores a saved source or resets an unsaved catalog experiment. Library copies stay identical; reload does not revive the experiment. Opening a different saved graphic through Home restores its exact source without another save question. |
| Navigation and failures | Native history, direct hash navigation, first-decision preservation during naming, local-write refusal/retry and duplicate-submit protection pass. Pristine wizard results still leave without a question. |
| Preserve boundaries | Saved production copy stays identical after authoring Save. A signed-in localhost-backend task independently proves account source equality after Save and no account-record change after discard. |
| Reference and cumulative task | Two fresh pinned-reference tasks and four cumulative/native tasks pass. Desktop/laptop/native-125 captures were inspected; all nine SPX/CasparCG/OGraf browser outputs execute without errors. |

## Reproduction and failed attempts

The normal ZIP-import route, visual edit and Home action on the baseline fail
the editor-presence assertion in
[38445327031](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38445327031).
The captured destination is Home with no save decision, reproducing the October
6 timing problem without calling the guard directly.

[38446367624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38446367624) and
[38447255350](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38447255350)
ran the 54-case maintained selection: 46 passed, seven existing legacy-editor
cases skipped and the newly added Back test failed. Excluding that six-case
lifecycle file, 41 unchanged maintained cases passed. The selection covered
library, wizard-draft-guard, editor-layer-property-qualification,
editor-transform-qualification, editor-cli-round-trip and
editor-canvas-short-height. The second run's two reference tasks and four
cumulative/native tasks passed. No existing case was deleted or newly skipped.

Focused runs
[38447778696](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38447778696) and
[38448392642](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448392642)
passed five of six cases, including production independence and preservation of
the first pending destination during naming. Back first timed out waiting for
Playwright's load event; native history.back also found no decision. The retry
limit was reported and speculative fixes stopped.

[Diagnostic 38449150753](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38449150753)
and [its history receipt](receipts/browser-history.json) resolve the false setup
assumption. A preview rebuild leaves two adjacent editor entries at depth 3.
First Back moves browser index 5 to 4 with no parent route event. Second Back
reaches wizard depth 2; the guard restores depth 3 and opens the decision. The
coordinator authorized a deterministic test of both observed steps: the first
preserves surface/source/history, and the actual route traversal asks before
leaving. No preview behavior, timeout or outcome assertion was relaxed.

[38458517155](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38458517155)
passed both Back steps and stay choices, then exposed an over-specific added
assertion about the destination URL. CreationWizard's existing finishedWalk
contract explicitly restores the step where the walk ended, then replaces its
URL with Finish. Its separate regeneration notice remains intentional. The test
now checks that exact Finish route and notice, with no repeated confirm-switch.

[38459025084](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38459025084)
passed the complete native Back/stay/discard task. Its later hash case failed
because page.goto changed only the hash while the wizard's existing regeneration
notice remained open. Giving that independent hash case a fresh Playwright
fixture preserves all its assertions and avoids unrelated modal state. The
final seven-case run passes. No wizard or preview product code changed in these
setup corrections; no test-maintenance entry or budget exception was added.

[Mutation 38448397968](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448397968)
passes by removing the route guard and observing the required editor-presence
assertion fail. An earlier harness run stopped before testing because its output
directory was absent; creating the directory corrected that harness.

## Signed-in account and revision boundaries

[38448402526](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448402526)
passes the signed-in Home -> import -> edit -> Home decision -> first Save ->
library -> control -> Edit -> discard -> reload path. It uses the configured-suite
bootstrap, a synthetic account and ephemeral localhost Supabase on GitHub's
runner. The test refuses a non-local backend. Local storage assets are downloaded
and hydrated before exact source comparison. The raw account record remains
identical after discard. [Account receipt](receipts/account-lifecycle.json).

The first account assertion compared storage references with local asset bytes.
Hydrating the actual stored bytes corrected the comparison, retaining exact
source equality. The always-run teardown successfully stopped Supabase without
backup. No hosted account, production backend, migration or security boundary
changed, and no hosted backend cost was incurred. CI used the existing Actions
runners. Local durable Save, asynchronous cloud sync and production copies remain
separate; this is not a claim about actual hosted cloud-status notices.

## Rendering, reference and limits

Inspected fresh desktop 1920x1080, laptop 1366x768 and native-125 editor and
leave-dialog captures, plus both reference-editor captures and the signed-in
dialog. The dialog's three choices remain legible and visible over the editor.
Existing layout and decision labels are reused; in-flight and failed-write
feedback are added. [Capture hashes](receipts/captures.json).

Native zoom is 1.25 at both ends, outer 1366x768, content 1093x545, DPR 1.25 and
visual scale 1. Canvas, timeline and inspector remain 196px, 180px and 280px.
Small Fit artwork and Properties scrolling are known comfort limits. All three
cumulative receipts have empty console-error and failed-request lists and three
successful browser outputs each. Deliberate zoom/pan survives native resize
without source/history changes. [Desktop](receipts/desktop.json),
[laptop](receipts/laptop.json), [native 125%](receipts/actual-125.json),
[camera](receipts/native-camera.json).

[Reference comparison](reference.md) records exact Studio and Eyevinn revisions,
source paths, hashes, event-to-mutation-to-preview/test trace, executed tasks and
intentional differences. Upstream unit suites were inspected, not executed; no
upstream AGPL code was copied. Browser exports do not establish physical SPX,
CasparCG or OGraf receiving-host acceptance. Owner acceptance, broader comfort,
cloud-status redesign and the editor default switch remain outside this slice.
The pre-existing #987 hosted-latency alarm is separate.

## Check and reproduction

Review ran inline because no callable review/simplification execution capability
was available. It found and fixed replacement of the first pending destination
while a naming dialog was open. Inline simplification retained the existing
save-store boundary. Final inline verification passes: targeted ESLint,
TypeScript, affected gates including ten shared-instruction tests, whitespace,
exact probe/product-source comparison and the seven focused browser cases.
Full build and suites remain pull-request/merge-group CI work.

No local browser or full build ran. Job j-4386 was cancelled before launch at the
unchanged 4 GB floor, with 1.18 GB free. Automatic approval review initially
refused public CI publication; no denied export was bypassed. The human then
explicitly approved publication and CI for this editor run, after which the
approved disposable runs executed. No local test process remains running.

[Disposable probe patch](ci-probe.patch) contains CI recipes and authored
reference/cumulative/account/history probes. Apply it only to a fresh disposable
branch based on the final product revision. Dispatch deploy-verify with focused,
mutation, complete or history; configured-suite runs the localhost account task.
Never open or queue a probe branch as a product PR. The diagnostic records history
events rather than asserting a behavior verdict.
