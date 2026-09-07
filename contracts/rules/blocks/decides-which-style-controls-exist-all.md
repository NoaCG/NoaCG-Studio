---
v: 1
scope: src/model/cssVars.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-decides-which-style-controls-exist-all.md
---
`cssPaintsWith` decides which style controls EXIST at all, so treat it as a contract rather than a helper. It answers whether anything outside `:root` reads a role, follows the `:root` alias chain (`--label-color: var(--accent)`, and a design that paints its kicker reads only the alias) and strips comments first. It is CONSERVATIVE on purpose - a rule that reads the role but matches no element in this draft still counts, because the element arrives the moment the field is added.
