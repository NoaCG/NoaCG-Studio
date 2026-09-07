---
v: 1
scope: src/components/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-keep-selection-out-document-editor-state.md
---
Keep SELECTION out of the document: it is editor UI state only, in the store's `selectedParts`, and the canvas, the timeline and the Inspector are three consumers of one selection. None of it is ever written into the template.
