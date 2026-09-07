---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-implement-data-measured-motion-named-builders.md
---
Implement data-measured motion as named builders outside the marked animation region that measure the DOM and return GSAP objects. Have presets call those builders through `tl.add()` so the importer can represent each segment as `dynamic`; never inline measured math in the region.
