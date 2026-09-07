---
v: 1
scope: src/components/StylePanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-render-style-contract-wherever-human-edits.md
---
Render the `:root` style contract with `style/StyleControls` wherever a human edits it - the editor's Style panel and the wizard's Style step - so the two surfaces cannot drift. `StylePanel` is the store adapter around those controls and renders the SAME `wizard/FontPicker` the wizard does, so both search one library and reach the same installed faces; a typeface imported after creation still lands in `template.assets` and shows in the Assets panel.
