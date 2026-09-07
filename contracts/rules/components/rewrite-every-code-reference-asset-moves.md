---
v: 1
scope: src/components/AssetsPanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-rewrite-every-code-reference-asset-moves.md
---
Rewrite every code reference when an asset moves: `blocks/assetOps.ts` `moveAsset` renames the file and patches the code in the SAME undoable apply, and the panel then fixes any sample value still holding the old path. Folders are path segments one level inside the bucket, and an empty user-created folder stays ephemeral component state on purpose, because assets sync as template JSON.
