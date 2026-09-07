---
v: 1
scope: src/components/AssetsPanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-mark-every-asset-row-usage-tick.md
---
Mark every asset row with its USAGE - a tick, or the reference count - and derive the Information section through `src/assets/assetInfo.ts`, an async cached probe, so the stored model stays `{ path, data }`. Re-dragging a used asset adds another element instance, never a duplicate file.
