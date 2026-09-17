# Editor review follow-up, 2026-09-17

## Result and limits

One editor, two linked implementation plans. The animation rebuild owns base layout,
revision-ordered preview updates, a shared easing sampler, effective-time editing and the
fixed Studio benchmark. Starter Collections owns shared brands, TemplatePack selection,
reported application/provenance and safe production installation/revert. The owner accepted
Fable's review and these refinements in this task. The planning-only one-editor receipt is
closed; both implementation asks remain open.

Only product change in this follow-up: debounce the brand creator's three preview rebuilds
by 150 ms. Inputs and saving still use the immediate draft. No animation or collection
implementation was added. Existing branch work includes the standalone Home brand creator.

## Review decisions

All eleven review findings are addressed in the two plans or the debounce fix. Asset content
identity participates in preview revisions; ordered requests reject stale acknowledgements.
Collection matching uses stable collection/item ids and only explicit legacy name adoption.
Production revert detects later edits rather than overwriting them. Custom Bezier and new
ambient-loop authoring remain later scope. Phase 0 includes the owner walk on current main,
the six historical defect statuses and an actual interaction performance harness.

The merge consultation recommended preserving main's high-effort trial fix and combining
its prior P7 authorization with the newly approved workstreams. Applied. Regenerated contracts
after integration; no generated drift remained. No copy of Studio source was introduced.

## Review and verification

Review: inline. No dedicated callable code-review tool was available; checked the branch
scope from review-request rather than deriving it from local main. Fable's earlier review
was useful input, not a final review stamp for this changed tip. Simplify: inline; retained
a local effect with timer cleanup and existing shared controls, no new hook abstraction.
Corrected the stale Bezier cross-reference and Phase 2 easing prerequisite during review.
Taste: not applicable to generated graphic design changes; no generator or artwork changed.
The Home brand form and previews were visually inspected at 1366x768 and 1920x1080
after integration: alignment, readable controls, stable preview cards and visible Save/Cancel
remain intact. They still require their existing human acceptance walk.

Queued baseline j-1293 reproduced the unwanted immediate preview rebuild. j-1292 had a test
clock setup error and supplies no product verdict. Fixed j-1294 passed all five brand-editor
tests, including saving before the preview timer completes. Integrated `npm run build` completed with its own exit code 0: 1,798 tests passed,
one skipped, followed by TypeScript, lint, dependency checks, bundle, prerender and
client-secret scan. Browser integration j-1295 passed all 1,122 tests in 24.1 minutes; its separate catalog
gate passed all 35 checks in 3.8 minutes. Overall integration result: passed. No configured live-service or hardware test was
claimed; the changed brand feature is local/offline and introduced no backend changes.

## Next work

**Superseded by later owner direction, 2026-09-17:** the
[unified roadmap](../EDITOR_DELIVERY_ROADMAP.md) now governs continuation. Complete its
baseline and review before further product implementation. The paragraph below records
the earlier recommendation; it is no longer an instruction to start brand application.

After landing, start a fresh feature branch from current main. Finish shared editor brand
application as a single undo transaction, then collection customization under
STARTER_COLLECTIONS_PLAN.md. Animation work begins with the Phase 0 owner/reference walk
and measurement harness before the Phase 1 implementation. No permission or human action
is needed for the completed planning/debounce slice. Do not claim the editor rebuild,
collection installation or production acceptance complete.

## Scope checked

Branch: `codex/ograf-studio-architecture-research`. Review base: `63c4bbb7078616e74ea554dd9ad172a87d6432f7`.
The review request and branch diff agree; the final handoff is additionally reviewed as its
own documentation change. Deleted receipt was read from the integrated main version.

- `docs/ARCHITECTURE.md`
- `docs/BEHAVIOUR_AUTHORING_RESEARCH.md`
- `docs/BRAND_PLAN.md`
- `docs/CONTROL_PANEL_RESEARCH.md`
- `docs/EDITOR_REBUILD_PLAN.md`
- `docs/EDITOR_RESEARCH.md`
- `docs/GOALS.md`
- `docs/NATIVE_PLAYOUT_RESEARCH.md`
- `docs/OGRAF_ECOSYSTEM.md`
- `docs/OGRAF_FIRST_REVIEW.md`
- `docs/OGRAF_FULL_STACK_PLAN.md`
- `docs/OGRAF_STUDIO_RESEARCH.md`
- `docs/PROGRAMMES.md`
- `docs/README.md`
- `docs/STARTER_COLLECTIONS_PLAN.md`
- `docs/TIMELINE_INTERACTION_MODEL.md`
- `docs/WYSIWYG_PLAN.md`
- `docs/acceptance/owner-queue/2026-09-17-brand-creator.md`
- `docs/backlog/agent-authoring-revisions-evidence.md`
- `docs/backlog/casparcg-production-acceptance-matrix.md`
- `docs/backlog/editor-basics-rebuild.md`
- `docs/backlog/ograf-ecosystem-watch.md`
- `docs/backlog/ograf-form-oracle.md`
- `docs/backlog/ograf-lottie-ferryman-conventions.md`
- `docs/backlog/ograf-property-tracks-lifecycle.md`
- `docs/backlog/ograf-server-api-contract.md`
- `docs/backlog/ograf-studio-interop-matrix.md`
- `docs/backlog/starter-collections.md`
- `docs/research/2026-09-17-effort-trial-review.md`
- `docs/research/brand-creator-2026-09-17.md`
- `docs/research/ograf-2026-09-13.md`
- `e2e/brand-editor.spec.ts`
- `scripts/e2e-affected.mjs`
- `src/components/brand/BrandEditor.tsx`
- `src/components/brand/brand.css`
- `src/components/home/HomePage.tsx`
- `src/components/home/sections/LooksSection.tsx`
- `docs/backlog/one-editor-studio-benchmark-and-quick-templates.md`
