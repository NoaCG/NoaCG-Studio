# src/ai/lite - the managed free profile

**Every `##` section states its STATUS in its first line** - the parent's rule, and it binds here
for the same reason.

The four moved in with the contract - `liteTypes.ts`, `liteContract.ts`, `litePipeline.ts` and
`liteClient.ts` are now `types.ts`, `contract.ts`, `pipeline.ts` and `client.ts`, the naming `pro/`
and `importAnalysis/` already used. The parent keeps a pointer plus the four rules that bind from
outside it.

## NoaCG Lite - the managed free profile

**LIVE in production since 2026-08-07; quality is the open problem and the deadline plan is
`docs/AI_LITE_PLAN.md`.** The catalog-only, one-result profile selected with `GenerateOptions.profile =
'lite'`. Its model-bound design call goes through the trusted `/api/ai/lite/generations` endpoint and
the compact allowlist in `lite/contract.ts`; the browser cannot supply a model, route, fallback, system
prompt, or cost policy. A ready response rejoins the `groundedResult` path above, so `specToTemplate`,
real catalog assemblers, deterministic adjustments, fields, NOACG_ANIM, assets, validation, runtime
checks, and exports stay shared. **That sharing is the control-panel guarantee** in the doctrine: a Lite
graphic drives through the same machine, fields and events as a hand-picked one because it IS a catalog
assembly.

Lite must never call `generateRaw`, `generateAlternatives`, custom code generation, polish, import
conversion, or code repair. `modify` is allowed only while the caller passes the grounded DesignSpec and
the template remains house-shaped. A grounded failure is reported to the server as a platform validation
failure. No model call may rewrite the compiled code. Unsupported scope returns a typed explanation and
simplification, never an automatic expensive fallback.

**`lite/pipeline.ts` is the ONE grounded compile path** - `normalizeLiteSpec` + `assembleGroundedTemplate`
(specToTemplate → applyDesignAdjustments → ensureSpecFonts → applySpecOutPreset) +
`productionSpxValidator`. `claudeProvider` is built FROM it and the benchmark runners compile through the
identical function; `scripts/ai-lite-bench.test.mjs` pins that no second copy exists.

**Lite category meaning lives in one `CATEGORY_CONTRACTS` registry.** A contract names the graphic
type, visible field range, allowed kinds, named slots, compatible measured chassis, type-owned
machine, and operator events. The same constrained model call returns category confidence and
alternatives plus structured style intent. Manual category is authoritative; auto mode proceeds
only above the confidence and margin floors, while ambiguity returns choices for the UI. Trusted
server retrieval shows at most five relevant, diverse compatible chassis and narrows the output
enum to the same ids. The compiler owns fields and state and may retry ranked fallback chassis
when the rendered hold rejects generic treatment, weak brief fit, overflow, or poor contrast.

**Lite composes its OWN validator** (`claudeProvider.liteValidator`), for the same reason it passes its
own `AssembleOptions`: `ProductionBenchOptions` can only be answered from the DECISION - which lines must
hold one line (`singleLineIdentityFields`, off the spec's declared roles) and which category's type floor
the ADJUSTED result is held to - and the browser builds its injected validator in AiStep long before a
decision exists. While they were unset, `bench-line-wrap` and `bench-type-floor` were findings every
BENCHMARK measured and no user ever did: **the round scored a stricter gate than the product ran.** All
three are WARNINGS, so composing them in cannot fail a generation that used to pass. Pinned by
`e2e/lite-line-fit.spec.ts`.

**Lite gets NO structural check, which is why field paint is composed in explicitly.**
`withStructuralFindings` returns early without a `StructuralIntent` and Lite runs no intent stage, so the
one question that measures whether a declared field REACHES THE SCREEN never ran on the one path with no
repair loop. The 2026-08-08 quality round produced the proof: a strap that painted its name, reserved a
band under it, drew nothing there, and answered `update()` with fresh data by changing nothing -
`fieldCount: 2`, every rule code silent. The drive lives in `validation/fieldPaint.ts`, shared by the
structural check and the bench's opt-in `fieldPaints`, which `liteValidator` and `compileLiteDecision`
both turn on. **It reads ONE state** (the settled default path), which is why it is opt-in: a field a
later operator event reveals would read as unpainted, and Lite is safe today only because it ships
single-step lower thirds. **Widening Lite past those revisits this note first.** Pinned by
`e2e/lite-field-paint.spec.ts`.

**A chassis's fit metadata is MEASURED where it can be, and `supportingLineChars` is the precedent.** It
was a hand-authored adjective that ranked the designs almost backwards - three of them set their
supporting line in tracked uppercase, costing about a third of the characters a reader expects, and **no
gate in the tree can see the consequence** because a wrapped line does not escape its frame. The number
comes from `node scripts/lite-line-capacity.mjs --check` - run it after any change to a Lite chassis, its
stylesheet, or the bundled fonts. A claim ABOVE the measurement fails as the defect it is; one more than
four characters below fails as stale. **An adjective is what a chassis may say only where nothing can
measure it.**

**A STRAP SPENDS WIDTH, NEVER HEIGHT, and a mark carries NO PLATE** (owner, 2026-08-14 - the
rule the matrix gallery bought). The shared slot places a lower third's mark BESIDE the words:
stacking it made `lt02` 83% taller, `lt11` 57%, and lt11 served 44% of the volume matrix, so most
branded output was a strap turning into a block (`docs/AI_LITE_BRAND_PLAN.md` §3.7,
`src/templates/AGENTS.md` for the injection rules). The platform's painted well is REMOVED with
it: a dark-ink mark on a dark package is the USER's palette defeating the mark, no chassis re-pick
can fix that, and the two remaining moves - dropping the customer's mark or pasting a white box
over the design - are both worse than the defect. The mark ships where the design puts it and the
pairing is recorded (`logo_ink_unreadable_on_surface`). `ls12`'s fixed dark tile is the one
ratified exception, because it is a designed part of that composition rather than a repair.

**RECORDING IT WAS NOT ENOUGH, and the value gate is what proved it** (owner's blind ballot,
2026-08-14 - `docs/AI_LITE_BRAND_PLAN.md` §2.2). A ledger column is not a place anyone looks: a
knockout mark on a light package shipped invisible on the generated arm AND on the arm a person
branded by hand, where nothing was recorded at all. `validation/markLegibility.ts` now MEASURES it
on the rendered frame - the mark's ink probed with the same `probeMarkElement` a real upload goes
through, against every surface it could be composited over - and says so twice: as the always-on
`bench-mark-unreadable` warning in the runtime bench, and live in the wizard's Style step, beside
the palette that broke it. Still no repair, for the reasons above; the change is that the person
who can fix it is told. **Judged for TRANSPARENT ink only**: swept over all 23 mark-capable lower
thirds, luminance flagged 2 own-field crests that render perfectly (a blue crest on a red tile
separates by hue), and a gate whose false positives are the designs that carry a crest best would
teach authors to ignore it. Pinned by `e2e/mark-legibility.spec.ts`, including the wizard path.

**A BRAND MARK is under the same rule, and `LiteCatalogEntry.logoSlot` is the measurement.**
`node scripts/ai-lite-brand-audit.mjs --lite --check` renders a real mark into a real slot and
reads the frame back - size, aspect, crop, clear space, containment, ink contrast against the
surface the slot actually paints - and gates the declaration against it. **The design declares
the slot and the compiler fills it; the model never places a mark.** The declaration is split
because the halves go stale differently: `fits` is GEOMETRY (which mark shapes land legibly; no
palette changes it) and `surface` is TONE - `palette` when the slot sits on the design's own
panel, `dark` when it sits on the picture, which means a brand owning only a dark version of its
mark cannot use that chassis at all. **The other half of the answer is the REQUEST**: `hasLogo`
was a boolean, so the model knew a mark existed and nothing about it. `LiteGenerationRequest.mark`
now carries shape, backing and ink, all measured in the browser by `assets/assetInfo.ts`
`probeMark` and content-free by construction; `hasLogo` stays beside it because the quota check
reads it and the request validator is a strict key allowlist. **Retrieval itself narrows a
marked request to slot-carrying chassis** (`retrieveLiteReferenceSet`, and by shape when the
descriptor names one) - the 2026-08-13 baseline traced three of five brand failures to slotless
chassis being shown to marked requests after the semantic round added seven chassis without
slots (`benchmarks/lite/BRAND-BASELINE-2026-08-13.md`). **All thirteen chassis now carry a
measured slot** (2026-08-13): two already drew a well and only the metadata denied it, five had a
well designed for them, and `--lite --check` agrees with the render on every one. A `surface` of
`dark` now covers TWO different facts - a slot sitting on the picture, and `ls12`'s well, which is
painted a fixed opaque dark whatever the package says so a knockout-only brand can use a light
package with no repair (`docs/AI_LITE_BRAND_PLAN.md` §3.4). The validator needs no new vocabulary
for the second: both mean "a surface the palette cannot repaint". Design, findings and the catalog
work they bought: `docs/AI_LITE_PLAN.md` §7, `benchmarks/lite/BRAND-AUDIT-2026-08-09.md`.

**A REQUESTED palette is the platform's to apply, not the model's to return** (`applyLiteBrandPalette`).
Colour splits in two: **identity** (accent, panel) is copied verbatim from the REQUEST - never
altered, never dropped - and **furniture** (text, textDim) is legibility-owned, repaired by a
three-rung ladder (re-map the two furniture slots, clamp lightness with hue and saturation
untouched, neutralize to white or black). The old repair dropped the whole bespoke palette when
the clamp could not reach, and the compile read the MODEL's echo of the palette rather than the
request - so "exactly the brand's colours" could fail three silent ways at once: a near-miss hex,
an omitted palette, a legibility floor deleting the package. Every divergence is now an
`adjustments` code, and those reach `ai_generations.adjustments` (migration 0043) because a repair
the ledger cannot count is a promise nobody can check. The audit's positive twin is
`brand-accent-verbatim` at TOLERANCE 0 - a near miss is the defect, not a pass. A palette nobody
requested is still dropped: the contract widened for the user's colours, not for the model's.
Design and what is deliberately NOT built (chassis re-pick and well, which need §3.3's measured
per-chassis surface metadata): `docs/AI_LITE_BRAND_PLAN.md` §3.1-3.2.

**`zone` and `animation.presetId` stay in the schema although both decisions are dead.** The Lite spec
object is `additionalProperties: false`, so a property the model still EMITS becomes a refusal rather
than a no-op - deleting them cost 29/30 → 26/30. Teach a field away in its DESCRIPTION first, measure the
emission rate reach zero across more than one round, then delete. Pinned by PRESENCE in
`api/_lib/aiLite.test.ts`; the account is in `docs/AI_ATTEMPTS.md`.

`lite/types.ts` is intentionally dependency-light because both the browser and API TypeScript trees import
it - do not import catalog or DOM-bearing model modules from it. Model/provider configuration, quota,
price, privacy, and endpoint policy live only in `api/_lib/aiLiteProfile.ts`; the server task registry
(`api/_lib/aiTaskRegistry.ts`, `docs/AI_TASK_REGISTRY.md`) re-expresses that profile as task
`lite-design-spec` and fails closed unless every managed route is in the approved-route catalog. The
generated template carries no profile marker or generation ledger id.

The first quality release is LOWER-THIRD-ONLY: 13 measured chassis with positive and negative fit
metadata, semantic style signals and geometry, a broad intent facet, and an explicit named slot for
each of one to four visible lines. Server semantic validation
enforces requested roles and custom-palette contrast before deterministic compilation. **Do not widen the
category or variant allowlist without the versioned lower-third benchmark and human visual review.**

Lite's improvement signal is content-free: the ledger keeps only the resolved chassis, broad intent
facet, accepted/discarded outcome, and an optional enumerated discard reason. Aggregate per-intent
outcomes enter the trusted prompt only after the server-configured sample threshold and only as a subtle
tie-breaker. Prompts, templates, screenshots, generated code, and full DesignSpecs never enter it.

## The Lite SKIN and its vision JUDGE

**EXPERIMENT - both server-flagged OFF by default (`AI_LITE_SKIN_ENABLED`, `AI_LITE_JUDGE_ENABLED`). No
user reaches either; only the eval rig calls the judge, whose agreement with a human is 3 of 6, which is
chance.** Not strategy. Mechanics, thresholds and rulings: `docs/AI_LITE_BENCHMARK.md` (parked)
Appendix B. Verdicts and retry conditions: `docs/AI_ATTEMPTS.md`.

Three rules bind anyone touching the code even while the flags are off:

- **A skin can decline to land, never cost the user a working result.** Any failure - an illegal patch
  (`liteSkinPatchErrors`), a gate rejection, a failing bench - REVERTS silently to the spec's house
  chassis. With the flag off the schema, prompt and behaviour are byte-identical to before the skin
  existed, and a skin a model emits anyway is stripped server-side.
- **A skin may not use `clip-path`, because our checks measure LAYOUT and it changes PAINT.** Two skins
  lost their secondary line's last letter to an angled cut; the runtime bench read a perfectly placed
  box and passed, and so did the judge. `background-clip: text` stays legal.
- **The judge passes admission of its OWN** (`store.reserveJudge`, migration 0013): ownership, liveness,
  the per-generation cap (attempts, not successes) and the daily fleet ceiling are decided ATOMICALLY in
  one RPC under the same advisory locks `reserve_ai_lite_generation` takes, and the worst-case cost is
  BOOKED before the call. **A new paid Lite route repeats this shape** - the per-IP burst limiter is
  pre-body protection, never an entitlement.
