# Persistent drawing tools

2026-10-08. R1.2b everyday-tool usability follow-up. Baseline: fetched
`b761d302fa59cb1fd9587f9cfee535c49faa86e0`; isolated worktree and branch
`codex/persistent-drawing-tools`. Research PR #723 is already contained in main.

## Why and goal

Drawing currently returns to Select after each object. Keep Rectangle, Ellipse,
Text and Pen selected across completed objects and cancelled drafts, so repeated
construction needs one tool choice. Follow the behavior observed in VectorCraft,
while retaining NoaCG's whole-path history and exact draft cancellation.

## Non-goals

No engine replacement, geometry expansion, permanent point-selection tool,
transform/layer/property polish, save/sync changes, new output or command API.
No full R1.2b or owner-acceptance claim. Shared command discovery/runtime schemas
and a deterministic human/agent task remain next, at the start of R1.3b.

## Decisions and seams

- `useArtworkGesture`: draft completion/cancellation clears gesture state, without
  replacing a chosen creation tool. Keep existing default sizes, Shift constraints,
  field builders, selection and source operations. Preserve Anchor conventions.
- `usePenGesture`: a finished path clears the entire draft and commits once. Escape
  discards a drawing draft and retains Pen. Existing-path Edit points remains a
  separate transient context; Escape leaves it in Select. Explicit toolbar choice
  cancels the draft and chooses exactly that tool. Starting point editing must
  first cancel any construction draft.
- `Canvas`: entering a group cancels drafts and chooses Select if a creation tool
  was active. Group creation stays forbidden, as required by the current contract.
  Returning to Composition stays Select; the user chooses the next creation tool.
- Keep session revision/asset and playhead guards, one creation/path per undo,
  atomic refusal, exact source and sample/default separation. No session/history
  format or operation registry change is planned.

## Observable acceptance and verification

1. Direct browser checks select Rectangle, Ellipse and Text once each, create three
   objects, assert the selected tool after each, normal selection/bar/fields,
   constrained/default geometry, and exact source snapshots through undo/redo.
2. Select Pen once, complete open, closed and curved paths successively. Assert
   Pen directly and one whole completed path per undo, with stable identities.
3. Escape, pointer cancellation and tool switches discard only active drafts,
   without IDs/fields/history. Source/asset/playhead/document guards continue to
   refuse stale work. Explicit Select and Edit points remain usable; switching
   into a group cannot create root artwork accidentally.
4. Prove persistence checks fail on unchanged product code, then pass with the
   fix. Run focused existing editor suites, affected browser checks and full build
   through shared jobs. Review/simplify/verify with check and stamp the final tip.
5. Walk cumulative wizard import/create, ordinary editing, defaults versus samples,
   keys and In/Next/Out, draft refusal, save/reopen and executable SPX/CasparCG/OGraf
   outputs. Inspect real rendered captures at 1920x1080, 1366x768 and 1093x614
   (the documented 125% laptop viewport proxy, not actual browser/OS zoom).
6. Commit verified phases, land through queue-merge and report actual merge/live
   revision. Preserve a runnable review task and the shared-command next step.

Coverage: E02/E06/E07 and bounded B02/B04/B06/B13 preservation. Existing imported
masks, assets, field exclusions and unsupported source remain untouched.
