---
v: 1
scope: src/components/wizard/steps/BrowseStep.tsx, src/components/wizard/steps/CommunityPacks.tsx, src/components/wizard/KitTray.tsx, src/templates/kit.ts
kind: invariant
fires: contract
status: active
since: 2026-10-02
supersedes: wizard/give-kit-door-top-browse-swaps
record: contracts/records/wizard/2026-10-02-give-kit-community-packs-shelf-door.md
---
Give the kit and the Community packs shelf ONE door each, at the top of Browse: `.wz-buildmode` swaps the step body between the design grid, KitPicker and CommunityPacks. A KIT SHOWS ITS CONTENTS - every row is a card with a settled MiniPreview of the real design, its name and its graphic type, with the checkbox still carrying `data-kit-item`. On the shelf, Install on a card is the only action: Next, Skip to finish, the brand chooser, the format picker and the rail's format read-back stand down.
