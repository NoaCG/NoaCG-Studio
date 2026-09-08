---
v: 1
scope: src/model/brand.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-brand-saved-look-points-instead-anonymous.md
---
A brand IS a saved look, so `defaultBrandId` POINTS at one instead of the anonymous singleton every wizard Create used to overwrite, and `loadBrand()` lives in `packets.ts` beside the store it reads - put it here and the two modules form an import cycle the dependency gate refuses. The legacy single-brand key is READ by the app (`legacyBrandOffer`, and `captureLookFromTemplate`'s style-family fallback) and written by NOTHING but the sync seam's put.
