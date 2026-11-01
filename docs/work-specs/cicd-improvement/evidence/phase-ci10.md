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
- `test.setTimeout(360_000)` is the unchanged existing line. A merged test measured 103 to 109 s here
  (section 5), so the ceiling is not near.
- The editor-model-proposals README's run command names the merged file.

## 4. Fault matrix (acceptance a)

No recorded defect exists for these walks to replay, so each behaviour family was injected as a
source patch on this machine, one at a time: the old pair (copies of `main`'s two files beside the
new one, untracked) and the merged spec each ran in one queued `--cap 5` job, then the patch was
reverted (tree clean at the end). F0 is the fix: no patch.

FAULT_TABLE

## 5. Before and after: time and runner cost (acceptance a)

TIME_TABLE

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

SELECTION

## 8. Decisions and traps

DECISIONS

## 9. Verification

VERIFICATION

## 10. Phase notes

- Previous verified main: `b2f335fb353f799dc7866f23ca9200168205faad` (ci09 merge #1913; its full CI
  run 41306864314 passed).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It restores the
  two files and the README line.
