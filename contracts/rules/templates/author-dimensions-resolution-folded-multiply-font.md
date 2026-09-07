---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-author-dimensions-resolution-folded-multiply-font.md
---
Author dimensions as `calc(Npx * var(--scale))`, with resolution folded into `--scale` by `computeScale`, and multiply font sizes additionally by `var(--type-scale)`. Let only `font-size` consume `--type-scale`, and use the shared `TYPE_SIZE_STEPS` and graphic-size ladder rather than duplicating size constants.
