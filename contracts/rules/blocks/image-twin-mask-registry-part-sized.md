---
v: 1
scope: src/blocks/designLayout.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-image-twin-mask-registry-part-sized.md
---
`addPlacedImageSlot` is the image twin of `addPlacedLine`: an `<img id="fN">` in the mask as a registry `image` part, a sized slot box with a dashed empty-slot mark keyed on `.has-image` that `setFieldValue` already toggles, and a filelist DataField; `slotSize`/`setSlotSize` are the corner handle's resize pair. Both adds are gated by `designBoxInfo` - a box whose unit carries `<prefix>-art` - and return null off-shape.
