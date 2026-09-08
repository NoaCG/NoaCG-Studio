---
v: 1
scope: src/components/wizard/steps/BrowseStep.tsx, src/components/wizard/KitTray.tsx, src/templates/kit.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-give-kit-door-top-browse-swaps.md
---
Give the kit ONE door, at the top of Browse: `.wz-buildmode` swaps the step body between the design grid and KitPicker. A KIT SHOWS ITS CONTENTS - every row is a card with a settled MiniPreview of the real design, its name and its graphic type, with the checkbox still carrying `data-kit-item`.
