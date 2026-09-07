# components/render-comments-control-view-preference-normal

Rule: `components/render-comments-control-view-preference-normal`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

Stripping comments from the text would change what an export ships and what undo restores. Decorations keep the document identical whatever the reader is looking at. Pinned by e2e/comments.spec.ts.
