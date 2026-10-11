---
v: 1
scope: src/components/wizard/steps/BrowseStep.tsx, src/components/wizard/steps/CommunityPacks.tsx, src/components/wizard/KitTray.tsx, src/templates/kit.ts
kind: invariant
fires: contract
status: active
since: 2026-10-08
supersedes: wizard/give-kit-community-packs-shelf-door
record: contracts/records/wizard/2026-10-08-put-door-each-kit-community-packs.md
---
Put ONE door each for the kit and the Community packs shelf at the top of Browse, where `.wz-buildmode` swaps the body between the design grid, KitPicker and CommunityPacks; a kit row is a card with a settled MiniPreview, its name and type, still carrying `data-kit-item`. On the shelf a visitor's one card action is Install, its giving half (Submit a pack, Your packs, an admin's review) sits beside the cards, and Next, Skip to finish, the brand chooser and the format controls stand down.
