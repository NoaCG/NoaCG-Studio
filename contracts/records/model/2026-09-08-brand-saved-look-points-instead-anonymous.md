# model/brand-saved-look-points-instead-anonymous

Rule: `model/brand-saved-look-points-instead-anonymous`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

From `src/model/AGENTS.md`: the payload shape is `ProjectBrand` - palette, typeface, shape tokens, plus the additive-optional `logo` asset and `notes` - the default id is 'spx-gfx-default-brand', the retired key is 'spx-gfx-brand', and `MAX_BRAND_LOGO_BYTES` was measured against real 512 px marks rather than chosen.

The contract said the old key is 'never written by the app again, only READ ... and carried by the sync seam'. Half right: `saveLegacyBrand` in `brand.ts` does write it, called from `src/backend/storage.ts` on the sync seam's put and removed there on delete. The module's own comment already scoped it correctly - 'the SYNC SEAM's put and nothing else' - so the rule now says written by nothing BUT that seam, which is the sentence a session reaching for the key needs.
