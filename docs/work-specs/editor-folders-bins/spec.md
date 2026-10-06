# R1.2b.7: folders, asset bins and hierarchy navigation

Baseline: fetched `origin/main` `ba8ad8738`, 2026-10-06, on fresh branch
`codex/editor-folders-bins-r1-2b-7` in this session's clean isolated worktree.
GitHub's latest production deployment succeeded for that commit; live
`/version.json` reports product revision `da8efaab1` (the intervening changes
are documentation/quarantine). No open PR or active worktree edits this scope.

## Why and goal

Organize a graphic's layers and bundled assets, and make leaving a nested group
obvious. Folders organize only; groups retain transform, parent bar and local
time. Source remains the saved artwork and the session registry owns atomic
history and stale-revision refusal.

## Reversible unattended decisions

- Persist bounded, versioned organization metadata in an inert HTML comment.
  Never wrap artwork for a folder. Folders contain layers or nested folders
  within one transform-group scope. Folder order affects the editor only;
  artwork order within a folder follows source stacking. Loose layers follow
  folders. Moving artwork across transform parents is outside this command.
- Folder selection is UI state, separate from artwork selection. A folder has
  no inspector transform or timing bar. Collapse retains artwork selection.
  Double-click or Enter renames inline; Escape cancels. Remove folder releases
  contents, never deletes artwork. Folder membership controls also accept a
  selected folder for nesting, with cycle refusal.
- Bins use existing bucket-relative asset directories and reference-safe move
  APIs. Empty bins persist in the same organization comment. Bin rename moves
  its assets atomically; collisions refuse rather than silently combine bins.
  Bucket roots remain fixed, files retain their bucket, bytes and ordering.
  Keep existing AssetsPanel callers compatible; enable bins only in the editor.
- Collapse and selection are transient UI state. Opening a containing folder
  reveals canvas selection. Persistent names/membership/order undo together;
  rename carries its opening revision and refuses if source/assets changed.
- Show an explicit Back to Composition button in group context, current
  location breadcrumbs, and parent/local time labels beside the visible stage.

## Non-goals

No account/save/sync changes, new storage/project model, production or playout
changes, reusable precompositions, loops, canvas typing, animated imports,
general drawing/transform/property polish or broader layer conventions.

## Observable acceptance

Owner authority: the unattended R1.2b.7 request in this chat;
[EDITOR_PLAN](../../EDITOR_PLAN.md) and
[owner hierarchy feedback](../../research/editor-owner-feedback-2026-10-06.md).

### AC-1: Baseline reproduction

Written-first browser cases reproduce absent folder/bin controls on the
   unmodified main product and confirm existing nested group navigation.
### AC-2: Layer organization preserves artwork

Create, inline rename, collapse, nest, release, order and move folder members
   in root/local group contexts. Folder/group icons and labels differ. Selection
   remains coherent across canvas/timeline; folders have no bar or transform.
   Source artwork, CSS, motion, fields and asset bytes remain exact.
### AC-3: Asset bins preserve ownership and references

Create/rename/collapse bins, move assets to/from them, retain empty bins,
   asset references and live field samples, preserve bucket and sound behavior.
### AC-4: Atomic history and exact refusal

Each organization edit has one exact undo/redo. Escape and input-owned keys
   cannot alter artwork. Stale source/assets, cycles, mixed scopes, duplicate
   names and unsupported metadata refuse without partial edits/history changes.
### AC-5: Real template and exported appearance

Complete a real template task using groups, folders and bins; save/reopen
   through existing APIs and execute SPX, CasparCG and OGraf packages. Compare
   rendered geometry and assets. Inspect desktop, laptop and 125% zoom proxy.
### AC-6: Regressions and isolated mutation checks

Run focused acceptance and relevant editor/asset regressions including
   anim-engine and inspector in one queued headless job with E2E_WORKERS=3.
   Mutation checks run alone, wait two seconds after edits/restores and restore
   byte-for-byte. Restore historical artifacts before build/commit.
### AC-7: Verified landing and honest continuation

Build, check, queue-merge, confirm queue entry/merge and deployed revision.
   Record evidence and a durable next-session handoff. Full B02/B04, owner
   judgment and physical receiving-host acceptance remain open.

## Evidence

Pending execution. This record makes no broader acceptance claim.
