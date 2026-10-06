# Inline review: R1.2b.7

Review scope starts at `ba8ad8738758c6a87580f40e35a34c05b88bee13`, from
`node scripts/review-request.mjs`, on `codex/editor-folders-bins-r1-2b-7`.
Review and simplification run inline because this session has no callable
independent review mode. The final scope and verification verdict are recorded
in the check receipt after required regressions/build complete.

## Confirmed findings, fixed

- Ungrouping replaces an outer folder's group member with its children, then
  releases local folders holding those same children. Duplicate membership
  makes metadata validation refuse a supported ungroup. Preserve the local
  folders under the group's former organizational parent instead.
- Folder creation clears artwork selection after the session records its
  after-view. Redo therefore restores the old selection. Clear it inside the
  existing atomic receipt.
- Timeline and AssetsPanel draft state can remain mounted when their document
  session changes. Discard the old controls' transient state on that change.
- The operation registry accepts arbitrary folder/bin-prefixed kinds through
  a cast; an unknown operation can become a no-op inside a partial batch.
  Admit only the known operations and retain the registry's existing refusal.
- Removing a folder releases its children without checking sibling names.
  Refuse a name collision before applying any source change.

The five findings above reproduced in j-3524 (`review-written-first.log`)
and passed after repair. Six further confirmed findings were fixed:

- Direct metadata writes could replace a future version. The shared writer now
  validates the existing header first; native tests reproduce and verify it.
- Asset information overflowed the narrow Project dock. Scoped layout stacking
  and width bounds preserve controls; screenshot and browser bounds were checked.
- Unsupported metadata still allowed asset moves. The UI disables the control
  and the shared operation/asset boundaries refuse, including drops (j-3539 red).
- Reopening the same saved graphic retained drafts because its document ID was
  unchanged. A session-instance key resets both controls (j-3542 red).
- Asset rewrites/reference counts treated folder labels as artwork references.
  Partition the inert header in shared helpers; preserve exact-string artwork
  rewrites and actual reference counts (j-3545/native probes red).
- Moving the last asset out of an inferred bin lost that empty bin. Snapshot
  inferred directories in the existing atomic registry before moves/removals.

All 11 findings passed their final coverage in j-3559 (19 tests) and the six
native organization tests. Initial reproductions and the corrected same-saved
identity case are retained as evidence; the earlier incorrectly reset-ID case
is not treated as proof.

Simplify: inline. Reuse the existing source parser, asset move/import APIs,
session transaction/history and saved graphic API. Share one guarded inline
name input and one inert-header partition helper. Compute group scope once per
member move rather than repeatedly parsing each member. No parallel scene or
storage model was introduced. Broader regressions and landing remain pending
until the check and landing receipts observe them.
