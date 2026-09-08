# model/brand-saved-look-default-brand-pointer

Rule: `model/brand-saved-look-default-brand-pointer`. Recorded 2026-09-08 on `claude/a-model-contract` at 20864d1f.

From `src/model/AGENTS.md`: the payload shape is `ProjectBrand` - palette, typeface, shape tokens, plus the additive-optional `logo` asset and `notes`. The keys are 'spx-gfx-default-brand' (`DEFAULT_BRAND_KEY`) and the retired 'spx-gfx-brand'; `MAX_BRAND_LOGO_BYTES` was measured against real 512 px marks rather than chosen.

Two corrections against the code, both caught reviewing the first draft of this rule. The contract said the old key is 'never written by the app again, only READ ... and carried by the sync seam': `saveLegacyBrand` does write it, called from `src/backend/storage.ts` on the sync seam's put and removed there on delete, which is what the module's own comment says. And the contract named `defaultBrandId` and `legacyBrandOffer` as the identifiers to reach for. `defaultBrandId` is prose - the exported API is `getDefaultBrandId`/`setDefaultBrand` - and `legacyBrandOffer` has NO callers anywhere in the repository: the live read path is `loadLegacyBrand`, used by `packets.ts` and `src/backend/storage.ts`. The brand creator's offer-the-old-look flow was designed and never wired, so a rule naming `legacyBrandOffer` would send the next session looking for a surface that does not exist.
