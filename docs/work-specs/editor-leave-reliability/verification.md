# Verification receipt

## Scope and current result

Product baseline `4508e133162cc65b6296b448e987f603fc17d479`. The exact
independent interaction receipt `dfdfe9f0a3f559f44a90dd4343a98797f18c080b`
was cherry-picked as `5f8c99de7ddfe39b29907b419a74d86323745361` before edits.

Home/Open, save, cancelled naming, discard, durable reopen, account sync and
production-copy independence pass. Native browser Back is unresolved; the
verification retry limit was reported to the coordinator before further fixes.
This is not a passing final check stamp or a queued slice.

## Reproduction and changed behavior

The normal ZIP-import wizard route, visual rectangle edit and Home action on the
baseline fail the assertion that the editor remains mounted before a decision:
[38445327031](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38445327031).
The captured destination is Home with no save decision. This reproduces the
October 6 timing problem without calling the guard directly.

The corrected Home boundary keeps the editor and URL in place until Save,
Discard or Cancel. First-save naming can be cancelled without source/history
loss. Two synchronous submit events produce one library record. Saving a linked
edit retains its ID; its existing production copy remains identical. Discard
restores an existing saved source or resets an unsaved experiment without
creating/deleting a library graphic. Reload and the next New door do not revive
or re-question the discarded experiment. An injected local storage refusal
keeps the editor and permits a successful retry.

## Executed checks

- Targeted ESLint on changed TypeScript and `npx tsc --noEmit -p tsconfig.json`:
  pass. `npm run gates -- run --changed origin/main`: pass, including ten shared
  instruction tests. `git diff --check`: pass. No full build or browser ran on
  the shared machine; observed available memory fell below the unchanged 4 GB floor.
- [38446367624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38446367624):
  the 54-case maintained selection had 46 passes, seven existing legacy-editor
  skips and the new Back failure. Both reference tasks and the cumulative/native
  step passed. Selection: new-graphic-guard, library, wizard-draft-guard,
  editor-layer-property-qualification, editor-transform-qualification,
  editor-cli-round-trip, editor-canvas-short-height.
- [38447778696](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38447778696) and
  [38448392642](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448392642):
  five of six focused cases pass, including first-decision preservation during
  an open naming dialog and unchanged production revision. Back fails: the
  Playwright load wait timed out; native `history.back()` also produced no dialog.
  Assertions were not skipped, relaxed or given extra time. A bounded diagnostic
  [38449150753](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38449150753)
  records top-level history and events to distinguish frame history from routing.
  [Its receipt](receipts/browser-history.json) shows two adjacent editor entries
  at depth 3. First Back moves CDP index 5 to 4 with no top-level route event.
  Second Back reaches wizard depth 2; the guard restores depth 3 and opens the
  decision. The test assumes one Back leaves the editor, but the browser actually
  traverses a preview-frame entry first. No speculative preview change or test
  relaxation was made after the retry limit. The coordinator reviewed that evidence and authorized a deterministic setup
  correction: assert the duplicate editor entries, verify the first traversal
  preserves source/history/surface, then test the actual route traversal with
  Escape, Cancel and Discard. The original hash and pre-destination assertions
  remain, and native discard replay/no-repeat coverage is added. No preview
  behavior is changed. The corrected test awaits execution.
- [38447255350](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38447255350):
  fresh cumulative desktop, laptop and actual native 125% tasks, plus nested-copy
  ownership, pass. They cancel the leave dialog before completing source/text,
  animation, history, save/reopen and executable SPX/CasparCG/OGraf outputs.
  All three task receipts have empty console-error and failed-request lists.

- [38448397968](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448397968):
  mutation check passes by removing the route guard and observing the required
  editor-presence assertion fail. An earlier harness run stopped at a missing
  output directory before executing the test; creating that directory corrected
  the harness without changing its assertion.

## Signed-in account and revision boundaries

[38448402526](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38448402526)
passes the normal signed-in Home -> import -> edit -> Home decision -> first Save
-> library -> control -> Edit -> discard -> reload path. It uses the existing
configured-suite bootstrap, a synthetic account and an ephemeral localhost
Supabase instance on GitHub's runner. The test explicitly refuses a non-local
backend. Cloud assets are downloaded from the local storage service and hydrated
before byte/source comparison. The raw saved account record stays identical
after discard. Local durable Save, asynchronous cloud sync and production copies
remain separate boundaries.

The first account assertion incorrectly compared storage references with local
asset bytes. Hydrating the actual stored assets corrected the comparison; no
product behavior or assertion of source equality was weakened. The workflow's
always-run teardown stops local Supabase without backup. No hosted account,
production backend, migration or security boundary was changed; no hosted
backend cost was incurred. CI uses the repository's existing Actions runners.

## Rendered judgment and limits

Inspected desktop 1920x1080, laptop 1366x768 and native-125 leave-dialog captures
from run 38447255350, plus the saved reference-editor captures. The dialog is
legible, its three choices remain visible, and the editing surface is present
behind it. No new copy or layout design was introduced. The native receipt has
zoom 1.25, outer 1366x768, content 1093x545, DPR 1.25 and visual scale 1. Its canvas,
timeline and inspector remain 196px, 180px and 280px respectively. Small Fit
artwork and Properties scrolling remain known comfort limits, not acceptance.

Reference source and runtime comparison are in [reference.md](reference.md).
The Studio and Eyevinn unit suites were inspected, not run. Browser-export
execution is not a claim about physical SPX, CasparCG or OGraf receiving hosts.
Owner acceptance, wider workflow comfort, cloud-status redesign and the editor
default switch remain outside this slice. The pre-existing #987 hosted latency
alarm is distinct from this lifecycle work.

## Checkpoint and reproduction

Review ran inline because no callable review/simplification execution capability
was available. It found and corrected replacement of the pending destination
while a naming dialog was already open. Simplification was inline and retained
the existing save-store boundary. Verification is incomplete because the native
Back test remains red. No passing stamp or merge queue entry is claimed.

[Disposable probe patch](ci-probe.patch) contains the CI recipes and authored
reference/cumulative/account/history probes. Apply only on a fresh disposable
branch based on this checkpoint. Dispatch deploy-verify with focused, mutation,
complete or history; configured-suite runs the localhost account task. Never
open or queue the probe branch as a product PR. The history diagnostic has no
behavior verdict; it records three ordinary Back attempts and their events.

### Resumed targeted check

The coordinator explicitly authorized the evidence-backed history setup
correction after the stopped report. ESLint and whitespace pass for that test
change. Local job j-4386 was held at the unchanged 4 GB memory floor and cancelled before launch; the last free-memory reading was 1.18 GB. Automatic
approval review twice refused the disposable public-branch publication and CI
dispatch, even after verifying the existing public origin and reviewed payload.
No denied export was performed or routed around the review. Execution and a
passing stamp remain pending. Current-main merge-tree reconciliation is clean.
