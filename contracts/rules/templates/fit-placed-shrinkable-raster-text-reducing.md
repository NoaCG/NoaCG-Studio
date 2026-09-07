---
v: 1
scope: src/templates/shared/textFit.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-fit-placed-shrinkable-raster-text-reducing.md
---
Fit placed shrinkable raster text by reducing font size within its wrapper, never by distorting the typeface, and retain the fifty-five-percent floor. Keep `fitPlacedText()` outside the animation region, inject it idempotently, and refit on updates, DOM readiness, and `document.fonts.ready`.
