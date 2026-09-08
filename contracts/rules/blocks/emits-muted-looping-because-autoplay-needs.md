---
v: 1
scope: src/blocks/assetOps.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-emits-muted-looping-because-autoplay-needs.md
---
`insertVideoElement` emits a muted, looping, `playsinline` `<video id="vid-*" data-gfx>` because autoplay needs muted in every playout browser and .webm keeps alpha; `insertImageElement` is its `<img id="img-*" data-gfx>` twin. Video assets are capped at import by `MAX_VIDEO_ASSET_BYTES` - they ride the saved template as data URLs.
