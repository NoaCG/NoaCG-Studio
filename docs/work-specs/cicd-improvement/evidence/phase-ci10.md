# Phase ci10: maintenance candidate three, the overlapping editor qualification walks

Row ci10 of the [cicd-improvement spec](../spec.md) (P3; AC-5). Built 2026-11-01 by the ci10
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`b2f335fb353f799dc7866f23ca9200168205faad` (ci09 merge, #1913).

## 1. The choice

The spec's third candidate is the overlapping editor qualification walks
([candidates.md](../../e2e-suite-budget/evidence/candidates.md) items 1 to 3). ci08 (geometry
cases, `e2e/editor-arrangement.spec.ts`) and ci09 (playout setup, `e2e/playout-folders.spec.ts`)
are not counted here.

The inventory's action for the walks is to move them to a scheduled walk. This row may not move
protection to scheduled cadence, so it takes the one overlap that can be removed with every walk
staying pre-merge: item 1, `e2e/editor-proposal-task.spec.ts` and `e2e/editor-command-task.spec.ts`.
They are the two largest editor walks in the durations table (3.47 and 2.92 table-minutes) and differ
by 34 lines. Each test of each file runs two complete authoring walks in fresh browser contexts at
one of three viewports, and requires the second to reproduce the first exactly:

| File | Walk 1 | Walk 2 |
|---|---|---|
| `editor-proposal-task.spec.ts` | **UI**: the reference, by mouse and keyboard | **proposal**: the same edits as reviewed model proposals (Assistant, Propose, Apply) |
| `editor-command-task.spec.ts` | **UI**: the same reference, line for line | **semantic**: the same edits through the shared command handler |

So the UI walk ran twice per viewport, six times per full run, with identical code and inputs. That
duplicate is the saving. Items 2 and 3 (drawing task, transform and layer-property qualification)
were not changed: their overlaps are with focused specs at a different layer, and the inventory's
answer for them is the scheduled walk this row may not use. No saving is claimed for them.

JEV overlap, checked 2026-11-01 before editing: no open pull request and no `claude/plan-jev-*`
branch on the remote; the JEV recovery ref carries plan state only and names neither file. The
walks go through the wizard (SVG drop, mapping, finish), and nothing in the wizard changes here.

Production-page studio acceptance: these walks never open the production page. They end in the
SPX, CasparCG and OGraf packages played in a browser page, which stays exactly as it was; the
production-page plan's pending receipts (actual playout output) are untouched and not claimed.

## 2. Inventory: what each walk step protects (acceptance a)

Every step is in all three walks unless the mode column says otherwise. "Boundary" is the layer that
makes the step real.

| # | Step | Failure it catches | Modes | Boundary |
|---|---|---|---|---|
| B1 | SVG drop through the wizard, untick a text row, Fade, finish to the editor | the door or mapping into the editor broken | all | wizard UI, import |
| B2 | inspection discovers the public field and the excluded static text | capability or field discovery wrong | all | command handler |
| B3 | rectangle, ellipse and text created (UI tools; geometry replayed in the other modes) | creation geometry or tool state wrong | all | canvas UI / command handler |
| B4 | text set on the new text, the public field and the static note (promotes a second field) | text writes or field promotion wrong | all | text editor UI / command handler |
| B5 | a model proposal leaves source and history untouched until Apply | proposals commit before review | proposal | Assistant panel, proposal review |
| B6 | Cancel of a reviewed proposal leaves the source as it was | Cancel commits | proposal | Assistant panel |
| B7 | a pending gesture or draft refuses commands (`busy`) and its cancel restores source and history | a command lands under a gesture | all | session |
| B8 | Out at playhead, Position X keys at 0 and 1 s, a Step at 0.6 s; held values | animation authoring wrong | all | timeline UI / command handler |
| B9 | stale context, an unknown target in a batch, an unsupported target: refused, source unchanged | partial or stale writes | all | command handler |
| B10 | undo then redo returns the same source | history broken | all (UI buttons; command history in the others) | session / command handler |
| B11 | playback from 0, from Next, and Out reach the held poses and hide | preview runtime wrong | all | preview iframe |
| B12 | validation passes; save; reload; source, fields, assets and the sample identical | save or reopen loses work | all | durable store |
| B13 | layout at 1920, 1366 and 1093 (125% zoom): canvas height, timeline in view, screenshot | layout breaks at a viewport | all | rendered page |
| B14 | SPX, CasparCG and OGraf packages play, Next and stop in a browser page with the text | exported graphic wrong | all | export packages |
| B15 | the whole record (every phase's source, history, patch files, saved source, poses) is identical to the UI walk's | the two editing paths diverge | semantic, proposal | cross-walk parity |

What the duplicate UI walk added: nothing B1 to B14 does not already do in the one UI walk, since the
code and inputs were identical. What it did give is a second sample of the same walk, which is a
flake detector, not protection. B15 compared semantic with one UI run and proposal with another; it
now compares both with the same run, which also makes semantic and proposal equal to each other.

## 3. The change

- `e2e/editor-command-task.spec.ts` now runs three walks per viewport: UI, semantic, proposal, each in
  its own browser context as before. `apply` dispatches to the direct command call (semantic) or the
  reviewed proposal (proposal). The proposal-only steps (B5, B6, the Evening report screenshot) are
  guarded by the proposal mode; everything else is the old line, unchanged. The end requires
  `compared[1]` and `compared[2]` each to equal `compared[0]`.
- `e2e/editor-proposal-task.spec.ts` is removed. Its every assertion is in the merged file: the
  `reviewed` helper is copied verbatim, and a diff of the two old files was the 34 proposal-only lines
  (section 1) and the mode name.
- Test titles: one `for (...) test(` line declares the three viewport tests, as before.
- `test.setTimeout(360_000)` is the unchanged existing line. A merged test measured 103 to 114 s on the cloud
  worker and ACTIONS_PER_TEST on Actions (section 5).
- The parity check is one assertion over both modes, so a divergence of the semantic path no longer
  hides a divergence of the proposal path (review finding; each old file had one parity check).
- The editor-model-proposals README's run command names the merged file. Its `check.md` lists the
  old file among the files a past check reviewed; that is a record of that check and stays as it was.

## 4. Fault matrix (acceptance a)

No recorded defect exists for these walks to replay, so each behaviour family was injected as a
source patch on this machine, one at a time: the old pair (copies of `main`'s two files beside the
new one, untracked) and the merged spec each ran in one queued `--cap 5` job, then the patch was
reverted (tree clean at the end). F0 is the fix: no patch.

| Fault | Patch | Old proposal-task | Old command-task | Merged spec |
|---|---|---|---|---|
| F0 none (the fix) | none | pass (3) | pass (3) | pass (3) |
| F1 command handler writes other text (B4 in the command path) | `commands.ts` `operation`: `text.set` appends `.` | **fail** 3/3, text in the preview | **fail** 3/3, same | **fail** 3/3, same assertion |
| F2 command history: redo does nothing (B10) | `commands.ts` `history`: redo removed | **fail** 3/3, source after undo/redo | **fail** 3/3, same | **fail** 3/3, same assertion |
| F3 proposal review refuses a supported command (B5) | `proposals.ts` `reviewProposal`: `out.set` refused | **fail** 3/3, no Apply edits | pass | **fail** 3/3, same assertion |
| F4 proposal commits on Propose, before review (B5) | `proposals.ts`: `prepare` becomes `apply` | **fail** 3/3, source changed before Apply | pass | **fail** 3/3, same assertion |
| F5 Cancel commits the pending proposal (B6) | `ProposalPanel.tsx` `cancel` applies it first | **fail** 3/3, source after Cancel | pass | **fail** 3/3, same assertion |
| F6 UI text editing writes changed text (B4 in the UI path) | `ArtworkTextEditor.tsx`: Apply text uppercases | **fail** 3/3, field text in the preview | **fail** 3/3, same | **fail** 3/3, same assertion |

Every fault each old file catches, the merged spec catches, at the same assertion and on all three
viewports (the failing line and message were compared from each report). F3 to F5 are the
proposal-only behaviours, which only the old proposal file held: they moved with it. F1, F2 and F6
were caught twice before (once per old file) and once now; that is the duplicate this row removes.
The six faults are the families the inventory names (the command apply path, the proposal
normaliser, review, Cancel, history and the UI path), not every possible fault.

Blind spot, said plainly: `scripts/check-e2e-protection.mjs` counts `test(` lines and does not count
tests declared inside a loop (#1911). Both files declare their three tests in one `for (...) test(`
line, so the check sees no declaration change at all; its finding here is the deleted file (section
8). The per-line review of the diff and this matrix are the control, not the check's count.

## 5. Before and after: time and runner cost (acceptance a)

Per-file time is the sum of the files' test durations from Playwright's JSON report, so it does not
depend on how workers share the tests. The comparable figure is the same-machine alternating pair:
same cloud worker, same queue, two workers, old pair and merged spec run back to back in both orders.

| Sample, one cloud worker (4 CPUs, 2 browser workers) | Before: both old files (6 tests) | After: merged (3 tests) | Change |
|---|---|---|---|
| Pair 1, before first (j-0002, j-0003) | 430.3 s (199.2 + 231.1) | 321.3 s | -109.0 s, -25.3% |
| Pair 2, after first (j-0016, j-0017) | 447.6 s (207.0 + 240.6) | 332.2 s | -115.4 s, -25.8% |

The saving is the removed UI walk at each viewport: the old proposal and command tests took 77 to 81
and 64 to 71 s here, the merged test 103 to 114 s, so one UI walk is about 33 to 37 s per viewport.
Each merged test stays well inside its unchanged 360 s timeout, and under the gate's 120 s
per-test ceiling on this worker too.

Actions, before (the same two files in three full main runs, shards 3/15 and 4/15, each a 16-spec
shard on one worker; blob reports merged per shard):

| Main run (head) | proposal-task, shard 3 | command-task, shard 4 | Sum |
|---|---|---|---|
| 41306864314 (`b2f335fb`) | 205.6 s | 174.1 s | 379.7 s |
| 41305901072 (`a961bec0`) | 209.1 s | 153.5 s | 362.6 s |
| 41294635431 (`23742966`) | 182.2 s | 158.5 s | 340.7 s |

ACTIONS_AFTER

Runner cost. The offline shards run on standard Linux runners, billed by the minute. At the
same-machine ratio (25% of the pair's 361 s mean on Actions, about 90 runner-seconds) the change
saves about 1.5 runner-minutes each time the walks run: every full main run (once per landing) and
every pull request plan that selects them, which the inventory measured at 11 to 19% of landings.
It also takes one 3.5-table-minute spec out of the packer's input; the durations table keeps
`editor-command-task` at 2.92 until its next refresh records the merged file.

Growth controls, `node scripts/e2e-capacity.mjs --changed origin/main`: execution reads 158.3 table-minutes on this branch against 161.7 on
`main` (-3.4: the deleted file's 3.47, with the merged spec still read at its old 2.92 until the table
refresh, when it should read about 1.5 more, for a net of about -1.6 table-minutes). Per tier: offline
OK 410/535 per landing, backend WARN 107.4/117, graphics OK 7.8/10, overhead OK 84/105, the same on
both trees: the tiers are judged on the frozen seed until the weekly growth report runs, so this
change shows up in them only after it is measured. No spec, exception or budget line is added. The
backend WARN, the 13-day-old durations table and the missing weekly report are the plan's existing
warnings, not this change.

## 6. Integration kept (acceptance b)

- **UI, rendering and output**: every walk still boots the real app, imports through the wizard,
  edits the real editor, saves, reloads and plays the three export packages in a browser page. The
  UI walk runs once per viewport instead of twice; no step, assertion or viewport was dropped.
- **Persistence**: B12 runs in every walk, as before.
- **Scheduled cadence**: nothing moves to a scheduled or nightly run. The merged spec runs where the
  two ran: every full main run and every pull request plan that selects it.
- **Critical set and contract map**: neither file is a `// critical` journey, neither is named in
  `scripts/e2e-contracts.mjs`, and neither carries `// focus`. Both declared the same single line,
  `// covers: src/components/editorFoundation/**`; the merged file keeps it.

## 7. Selection and the audit reset (acceptance b)

Selection is unchanged in substance. A sweep of the planner (`planFor` with the traced map, every
tracked file outside `docs/` as a one-file change) on base and head: 1,007 files plan the full
suite on both; the 24 that planned both walks on base plan the merged spec on head; every other file
plans neither on both. The only difference is the deleted file itself. No file selected one old spec without the other except each
spec's own path. Neither file carried `// focus` or `// critical`; `scripts/e2e-contracts.mjs` and
its contract map are untouched.

Classification: **an audit reset by the reset reader's rule.** `node scripts/e2e-selection-misses.mjs
resets --ref HEAD` reads this branch's first commit as a reset ("protection removed or changed: 1
covers line(s)"): deleting a spec removes its `// covers:` line, and the reader counts every removed
covers line, without asking whether another spec carries the same line. The runbook resets a removal
"when it changes which existing contracts are selected", which the sweep says it does not; the reader
is the recorded definition, though, and this row does not argue with it or edit it. So the merge
commit of this PR is the latest actual reset, replacing `06d3836c` (ci07, 2026-11-01T07:53:03Z):
the 14-day clock restarts at this merge, a few hours after the last one. No commit carries a
`Selection-audit-reset` trailer. Row completion alone does not reset or begin the clock; the merge
commit's landing does, and the coordinator records its SHA and time from the reader.

## 8. Decisions and traps

- **Merge, not a shared reference file.** The UI walk is the reference both other walks must equal,
  and it captures the creation geometry they replay, so it has to run in the same test as them. A
  reference recorded once and read by a second file would make one test depend on another's output.
  One file with three walks per viewport keeps each test whole.
- **The merged file is `editor-command-task.spec.ts`.** Both reviewed proposals and direct commands
  go through the shared command handler, which the name already says; `scripts/e2e-affected.test.mjs`
  also names this file as a reader of `e2e/fixtures/fidelity-nested.svg`, so it stays true unchanged.
- **One test-maintenance entry, and why it is not a gate workaround.** Deleting a spec file is
  removed protection to `scripts/check-e2e-protection.mjs`, whatever moved where, and it requires a
  line under `## Test maintenance`. The brief says not to write one "to pass a gate". The rule's
  intent is that a repair never hides a loss of protection behind an entry; the check's own header
  says the entry exists for tests "moved, merged and retired" on purpose, read by a reviewer like any
  claim. This is that case: nothing is lost (sections 2 and 4), and the entry in
  `docs/work-specs/e2e-suite-budget/spec.md` names what protects each behaviour now and points here.
  It names a deleted file, so unlike an entry for a living file it cannot cover later edits to it. The
  departure from the brief's wording is stated in the pull request for the coordinator to judge.
- **What is weaker, said plainly.** The UI walk now runs once per viewport, not twice: a flaky step
  in it has one chance to show per run instead of two. A failure in the UI walk now also stops that
  viewport's semantic and proposal walks (they need its geometry), as it already stopped the second
  walk in each old file. Likewise a semantic-walk failure now stops that viewport's proposal walk
  before it starts, where the old proposal file ran on its own: the test still fails, but a second,
  simultaneous proposal regression shows only after the first is fixed. And one quarantine of a
  merged test takes out both paths at that viewport, so it is an affected-protection incident under
  the runbook's quarantine rule, not a routine entry.
- The test titles change (to `shared UI, semantic and reviewed-proposal authoring, reopen and output
  task <viewport>`), so title-keyed history (durations, flake samples) starts afresh for them.
- The durations table is not hand-edited (only `record:e2e-durations` writes it): until its next
  refresh it lists the deleted file and weighs the merged file at the old 2.92 minutes, about 1.5
  under what it takes, so the packer under-weights one shard by that much against its 20-minute cap.
- Trap for later rows: running a queued Playwright job while patching `src/` taints the run; the
  first baseline here was discarded for that reason and re-run on a clean tree. Old specs for a
  before/after comparison run from untracked copies beside the new file, never from a file that is
  being deleted, and nothing in `e2e/` is moved while a job runs.
- Items 2 and 3 of the inventory (drawing task, transform and layer-property qualification) are left
  as they are: removing their overlap would mean moving walks to the scheduled cadence this plan does
  not allow yet, or replacing a journey with a lower layer without a faithful check for its boundary.

## 9. Verification

VERIFICATION

## 10. Phase notes

- Previous verified main: `b2f335fb353f799dc7866f23ca9200168205faad` (ci09 merge #1913; its full CI
  run 41306864314 passed).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It restores the
  two files and the README line.
