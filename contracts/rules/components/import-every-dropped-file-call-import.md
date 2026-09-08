---
v: 1
scope: src/components/AssetsPanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-import-every-dropped-file-call-import.md
---
Import every dropped file in ONE `addAssets` call so the import is one undo step, cap a video at `MAX_VIDEO_ASSET_BYTES` because assets ride the saved template as data URLs, gate a `.json` on `looksLikeLottie`, and make each row a drag SOURCE carrying `ASSET_DRAG_TYPE` (`application/x-noacg-asset`) for the canvas drop and for folder-header drops.
