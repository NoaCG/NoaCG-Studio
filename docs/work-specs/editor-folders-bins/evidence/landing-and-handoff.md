# R1.2b.7: verified landing and next session

The bounded layer-folder, asset-bin and hierarchy-navigation slice is landed
and live. Folders remain inert source metadata; bins use existing asset
ownership, references and save APIs. Groups retain transforms and local time.
The editor now shows its location and an explicit Back to Composition control.

## Observed landing

| Observation | Evidence |
| --- | --- |
| Reviewed feature tip | `e0aad46c163df2c100586786a5cae4fe0dfd7dd6`; exact-tip stamp: review inline 13/13 fixed, simplify inline, verify inline, pass. |
| Local build | j-3592, exit 0, 2026-10-06 23:56:09 to 2026-10-07 00:05:59 UTC. [Full log](build.log): native gates 2,478 passed, three existing skips, zero failures; type checks, lint, dependency checks, bundle, prerender and final artifact gates passed. |
| Queue entry | [PR #717](https://github.com/NoaCG/NoaCG-Studio/pull/717), `added_to_merge_queue` at 2026-10-07 00:23:43 UTC; observed position 1, awaiting checks. |
| Merge-group CI | [Run 37551759913](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37551759913) passed on `b362712bc06d6622fd446c6a642ef2a2e478ddea`, combining the feature with current main. |
| Merge | PR #717 merged at 2026-10-07 00:41:58 UTC as `b362712bc06d6622fd446c6a642ef2a2e478ddea`. Landing watcher j-3593 finished with exit 0. |
| Provider outcome | [Vercel deployment](https://vercel.com/noacg/noacg-studio/GDKbwQ1Uf4APbhH36qqqDXnD2v9M) reported completion on that commit at 2026-10-07 00:44:44 UTC. |
| Live revision and pages | At 2026-10-07T00:47:14.5399428Z, [version.json](https://noacg.studio/version.json) served that exact main revision; [home](https://noacg.studio/) and [editor](https://noacg.studio/app) both returned HTTP 200. |
| Deployed browser routing | [Deep-link job](https://github.com/NoaCG/NoaCG-Studio/actions/runs/37553568143/job/112574471994) passed on the deployed bundle at 2026-10-07 00:45:38 UTC. |

The live marker observed directly was:

```json
{
  "commit": "b362712bc06d6622fd446c6a642ef2a2e478ddea",
  "ref": "main",
  "builtAt": "2026-10-07T00:42:33.434Z",
  "lastDeployAffectingCommit": "b362712bc06d6622fd446c6a642ef2a2e478ddea",
  "deployedCommitIsCurrent": true
}
```

The first poll still served the preceding release. The provider completion,
fresh marker and subsequent plain-URL response above confirmed promotion.
This receipt does not substitute a preview or migration bookkeeping status for
a production result. No automatic PR repair monitor was available; this session
and the normal landing watcher observed the queue through completion.

## Verified scope and remaining acceptance

The [criterion review](check.md), [focused acceptance](acceptance.log),
[full integration](regressions.log) and [isolated mutations](mutations.log)
retain the detailed evidence. Focused acceptance passed 20 cases; native
organization guards passed seven. One queued integration job used
E2E_WORKERS=3 and cap 120: 1,528 browser tests passed, 542 existing skips and
35 catalog checks passed, including editor/assets, anim-engine and inspector.
All eight isolated mutations were killed after a green control, with about
two-second edit/restore waits and byte-exact restoration.

The Hairline task saved/reopened through existing APIs and executed SPX,
CasparCG and OGraf outputs. Geometry agreed within 0.05px, the image resolved,
and its task/output page-error list was empty. All six committed desktop,
laptop and 125% viewport-proxy captures were visually inspected. Historical
generated artifacts were restored before commits and builds.

The [bounded ledger](../work.json) accounts for all seven criteria against the
immutable merged tree and hashed receipts. It closes this slice only.
Full B02/B04, owner workflow/taste judgment, actual OS/browser 125% zoom,
reusable precomposition instances and physical receiving-host acceptance
remain open. The [desktop judgment item](../../../acceptance/owner-queue/2026-10-07-editor-folders-bins.md)
remains unanswered. The configured authenticated suite was not run here.
The full integration's fixture logs are not a blanket zero-console-error claim.

At pre-landing inspection, main alarms #706 (nightly), #707 (dependency audit)
and #716 (configured suite) were open; this slice does not claim to fix them.
Account/save/sync, production/rundown and playout remain under their existing
ownership. Other sessions' work was not edited.

## Next session

Recommended next slice: reproduce persistent drawing-tool completion on current main, then correct it if the owner report still holds. The October 6 feedback asks to draw several objects with Rectangle or Pen without reselecting the tool after each object. Keep this bounded before broader transform/property/layer polish. Do not assign an invented release number.

Pasteable next-session prompt:
Reproduce the persistent drawing-tool feedback in docs/research/editor-owner-feedback-2026-10-06.md against fetched current main. Work in a fresh feature branch and isolated worktree. Read the editor plans, current folder/bin spec and landing receipt, applicable rules and live worktree/open-PR ownership before editing. Write a short spec and browser acceptance before implementation. If reproduced, retain the chosen drawing tool after object completion until the user switches tools, while preserving cancellation, path editing, group/root navigation, selection, exact source and atomic history. Keep transforms, general layer/property conventions, account/save/sync, production/playout and animated imports outside this slice. Verify the complete repeated-drawing task, rendered desktop/laptop/125% layouts and proportional regressions with E2E_WORKERS=3 through the queue. Restore historical generated artifacts, commit verified phases, build, /check and /queue-merge. Observe actual queue entry, merge and normal deployment; record an honest durable handoff. Broader B02/B04, owner judgment and physical receiving hosts stay open.

