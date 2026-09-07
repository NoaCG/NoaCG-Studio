# The contract src/ai/AGENTS.md carried before it was compiled

**Recorded 2026-09-07**, the day the area moved into the rule store. The file verbatim as it stood
at `origin/main`, kept because rules written in new words lose the exact symbol names the prose
carried, and `npm run contract:migrate -- audit` reads it when checking that the migration lost
nothing.

**It is history, not a contract.** Where it disagrees with a rule in the store, the rule is right.

**What was deliberately NOT migrated**, and why, is the interesting part - it is the answer to the
owner ask in `docs/backlog/are-the-big-contracts-still-worth-loading.md`, and it is written up in
`docs/metrics/2026-09-07-ai-migrated.md`.

---

# src/ai - the SPX generation harness

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this
directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.
(The VIDEO harness is its own world: src/ai/video + src/video - see the repository map,
`docs/ARCHITECTURE.md` §8.)

**Six subdirectories own their own contract** - `lite/`, `pro/`, `spec/`,
`importAnalysis/`, `spike/` and `creative/`, each an `AGENTS.md` with a
thin `CLAUDE.md` importing it, loaded only when you work in that directory. A section that
describes ONE directory belongs there, not here: this file is read in full by every session
touching the harness, and `npm run check:shared-instructions` prints how much room is left. When
it runs short, MOVE a directory's section into that directory - and if the files it describes are
still loose in this folder, moving them into one is the fix, not shorter prose (`lite/` on
2026-08-26 is the worked example).

**Every `##` section states its STATUS in its first line:** **LIVE** (a user reaches it today),
**EXPERIMENT** (built, but flagged off or bench-only - no user reaches it), **RETIRED** (kept only
because code still names it). A section's status is not derivable from its content, and reading an
experiment as current strategy has already cost this project a paid round. Dead ends, what they
measured, and the conditions that would revive them are **`docs/AI_ATTEMPTS.md`** - read it before
proposing an approach that sounds new.

## The doctrine - adapt, do not invent

**LIVE.** The harness exists to make AI results reliably better than a plain model call - and it must
EARN that claim in `scripts/ai-compare.mjs`, never assume it.

**The strategy that won is ADAPT-FIRST** (`docs/ADAPT_FIRST_PLAN.md`): the model retrieves a proven
catalog design and adapts it - brand colours, a logo, the user's words, typography and proportions
inside a clamped range. **It does not invent a layout.** Five paid rounds measured cheap models
composing a broadcast graphic from a blank stylesheet and none produced one the owner would air; the
catalog is both the crutch and the moat. Retrieval is that doctrine in code, so it is the section
directly below.

**A generated graphic can only be a category the catalog already carries.** Lite's allowlist is a
subset of the catalog's categories (today: lower thirds), and no path widens it at generation time.
That constraint is not a limitation to route around: it is what guarantees a generated graphic is
**operable in the control panel through the same machine, fields and events as a hand-picked one**,
because it was assembled by the same `variant.create()` the wizard runs. A graphic outside those
categories would carry no machine the control layer knows how to drive.

The principles, in priority order:

1. **Ground engineering, not visual style.** The platform pins the SPX definition, field ids, the
   `:root` contract, auto-fit, zones, the NOACG_ANIM region + interpreter, and export readiness. The
   AI owns composition, typography, spacing, proportions, colour, shape language, motion character,
   density, and hierarchy.
2. **The brief and references define taste.** Prompts state reasoning criteria - never a fixed
   aesthetic. A news strap and a children's game show earn different answers. Uploaded references are
   read as a design SYSTEM that outweighs the generic rules.
3. **Different briefs must produce different designs** - "same layout, different colours" is a named
   failure. The compare rig's top-chassis counter is the sameness tripwire.
4. **The smallest harness that wins.** A catalog-fit generation costs ONE small model call; everything
   after it is deterministic. Stages that only add cost get cut.

Two rules the repo paid to learn, binding everywhere here:

- **A deterministic gate cannot catch a defect in a dimension it does not measure** - so either
  measure that dimension or forbid the construct. Machine-valid is not good.
- **Write a constraint as INSPECTION, never as a list of named failures**, and let ABSENCE be its
  first failure. A prohibition suppresses the behaviour it constrains. When a teaching change moves a
  rate, suspect the FRAMING before the rule.

## The tiers a user is offered (`settings.ts`, the ⚙ panel in AiStep)

**LIVE.** One door, and behind it three tiers - two of which a user can reach today.

**Each managed tier has ONE stated promise** (also in `docs/GOALS.md`'s tier table - change both
or neither): **Lite** promises *a proven catalog design, carrying your brand and your words -
reliably, every time*; **Pro** promises *an on-air look designed for your channel - a palette,
type voice, accent form and motion character no shipped design carries - rendered by the
platform, so the layout is always sound*. Pro's promise deliberately names the LOOK and not the
composition: "a composition no catalog design uses" is the §15.4 premise three rounds measured
to fail, and the platform owns layout now. The wizard's example briefs
(`examplePrompts.ts` `LITE_EXAMPLE_PROMPTS` / `PRO_EXAMPLE_PROMPTS`) are written to these
promises and were verified by GENERATING them (2026-08-15): a Lite brief names no colours and
no zone (a model-invented palette is dropped by design, placement follows the chassis) and
states its two lines as an explicit stack; a Pro brief describes the look in the language
contract's own dimensions. A brief that reads well and renders as something else is the defect
those rules exist to stop - measured, not assumed.

| Tier | Stored id | Label | Price target per finished graphic |
|---|---|---|---|
| Lite | `lite` | NoaCG Lite | **100 graphics per €1** (~€0.01); measured **$0.00032** |
| Pro | `pro` | NoaCG Pro | **~€10 per 100** (~€0.10 each) |
| Bring your own key | `custom` | Bring your own key | whatever the user's provider charges |

Four rules, all of them things the shipped build got wrong before 2026-08-14:

- **The stored id is not the label.** `custom` is persisted per browser (`spx-gfx-ai`); renaming
  it silently resets everyone who chose it. Change copy freely, ids never.
- **A price target is a commitment about the ROUTE.** Missing it changes which model a tier
  calls, never what a user is charged. Lite has ~30x of headroom, so its route choice is a
  QUALITY decision (`docs/GOALS.md` NEXT).
- **The managed transport is never user-facing.** `AI_PROVIDER_IDS` (modelTypes.ts) is the
  transport set; `AI_PROVIDERS` (settings.ts) is the BRING-YOUR-OWN-KEY subset a user picks
  from - openai, anthropic, google, huggingface. They are deliberately two lists: collapsing
  them either sells our plumbing as a product or breaks every managed route. The BYO-key tier
  additionally MOVES a stored managed route onto a real user-key provider
  (`DEFAULT_BYOK_PROVIDER`), because a tier promising "your key" must not spend ours.
- **A managed tier names an OUTCOME, never a mechanism.** Lite and Pro name no vendor, model or
  transport, so replacing the engine behind one costs no copy - and cannot leave the door
  describing a pipeline that was retired, which is exactly how Pro shipped describing image
  reconstruction two months after it was dropped.
- **A NoaCG TIER RUNS ON NOACG'S OWN SERVICE OR IT IS NOT OFFERED** (owner, 2026-08-14). It
  never asks a customer for a key to reach our own models or harness. Pro is therefore offered
  on exactly two conditions, ANDed: the server says hosted Pro is available to this visitor
  (`GET /api/ai/pro-status`, `AI_PRO_ENABLED`) **and** the deployment carries the backend that
  route is metered through (`proOffered = proHosted && isBackendConfigured()`). Where either is
  false the tier is ABSENT - not greyed, and never degraded into a key request. **One door
  takes one switch:** there is no client flag for Pro and there must not be one, or a
  deployment meters it while showing no door, or shows one it will refuse. The key row in
  `AiProviderSettings` stands down on the managed route for the same reason.

**Every model row carries a price per 1M tokens and says which key pays it.** None of the three
direct provider APIs publishes a price with its listing (measured), so `aiModelDiscovery.ts`
reads the managed catalog as a PRICE BOOK, matched by `modelPriceKey` - which normalizes away
the vendor prefix, the dot-vs-dash separator and the dated snapshot suffix, and nothing else. An
ambiguous or unmatched model is left unpriced and unsuggested rather than guessed at; the model
box takes free text, so nothing is ever blocked by the book being wrong.

**A LISTING IS NOT AN ENTITLEMENT, and no filter can fix that** (measured on Google,
2026-08-14). `gemini-2.5-flash` and `gemini-2.5-flash-lite` appear in both of Google's own
listings, indistinguishable from live models in every published field, and answer 404 "no longer
available to new users" on a key created after their retirement. Discovery has nothing to filter
on, so the honest place to help is the ERROR: `providerFailure` maps that shape to "not available
on this account - the provider lists it but will not serve it". Two consequences worth keeping:
a curated fallback id in `settings.ts` must be one VERIFIED by a real call, not merely listed
(`gemini-3.1-flash-lite` is, as of that date), and `scripts/check-model-ids.mjs` cannot catch
this class at all - it checks presence, and presence is exactly what lies here.

**Verified end to end on real customer credentials 2026-08-14:** Hugging Face
(`Qwen/Qwen2.5-Coder-3B-Instruct`, 74 schema-capable routes listed for the token) and Google
(`gemini-3.1-flash-lite`), both returning schema-valid objects through the real adapters. HF
issues USER ACCESS TOKENS needing the **Inference Providers** permission, never API keys - hence
`credentialNoun` and the `HF_TOKEN` variable name.

## Retrieval - the shortlist of proven designs (`retrieval.ts`)

**LIVE, on the ADAPT route only.** The design stage used to be handed `catalogDigest()` - **430
variants, ~20,300 tokens, one flat list** - and asked to find the right design on the cheapest model
in the product, and that chassis choice is the one decision the whole grounded path rests on.

`shortlistFor(brief, intent, options?)` narrows it with **no new model call and no second retrieval
system**: the ranking is the Browse storefront's engine (`templates/search.ts`), the structural filter
is the ONE anchor table, and both read what the intent stage already produced. Four measured
properties make it usable rather than merely shorter - a brief is a SET of terms (token-AND); each
term is weighted by how RARE it is in the pool; the cut is RELATIVE to the best match (a nonzero score
is not relevance); and the floor of four is filled in BANDS, selectively-named designs first, the
residue last. `Shortlist.reason` states the split, so a shortlist never reads as four answers when two
are floor-filling. The measurements are `docs/ADAPT_FIRST_PLAN.md` §3.1.

Everything degrades rather than empties: an over-tight field bucket is dropped, a query matching
nothing falls back to catalog order, no resolvable anchor returns `FULL_CATALOG`.
**`variantSatisfiesAnchor` answers TRUE for an anchor that no longer resolves** - right for the
satisfaction check, meaningless for a shortlist - so retrieval checks `anchorResolves` first.

`catalogDigest(only?)` and `narrowVariantTool` are the two seams: the prompt shows the shortlist and
the schema accepts exactly that set. **Shown-but-illegal is a chassis the model picks and
`resolveVariant` silently swaps - the wrong graphic delivered as a success.** A CREATE route keeps the
full digest. The offline stub picks from the same shortlist deterministically, which makes the path
e2e-testable without tokens (`e2e/adapt-first.spec.ts`, `e2e/ai-retrieval.spec.ts`).

**A spec-level REFINEMENT retrieves too, and `ShortlistOptions.keep` makes that safe.** `specRefine`
takes its anchor from the spec it is editing and its terms from the request PLUS what the graphic
already is - "warmer colours" places nothing in a design index. `keep` pins the design in use into the
shortlist, because narrowing collapses the `variantId` enum and a colour request would otherwise swap
the user's graphic out from under them. It is matched against the ANCHOR, not the narrowed pool, and a
`keep` from another structure is refused.

**A catalog chassis is assembled at the zone it was DRAWN for** (`AssembleOptions.keepChassisZone`).
Measured over 89 lower thirds: rendered side agrees with declared `defaultZone` 89 of 89, 87 sit at
exactly 119px from the edge. The catalog ships left-, right- and centre-drawn designs as SEPARATE
members because re-siding a strap means re-siding its accent - so placement is expressed by picking a
differently-anchored member, which retrieval puts in front of the model, and by the Style panel
afterwards. Retrieval therefore matches a requested side against `variant.defaultZone`, the one place
a side is declared; the text index cannot answer it (of twelve right-anchored lower thirds only three
carry the word in their name).

**The policy is an ARGUMENT to `groundedResult`, not a constant** (`keepChassisZone`,
`sizeScaleRange`), because **NoaCG Lite reaches that same function** with `profile` stripped, so
nothing inside can detect Lite - and Lite must compile under its own declared contract (its schema
allows `sizeScale` 0.7-1.4 where the harness tool says 0.85-1.2). Clamping every caller to the
harness's numbers told the Lite model 1.35 was legal and discarded it at compile: the shown-but-illegal
mismatch `narrowVariantTool` exists to prevent, one field over.

## The pipeline (`claudeProvider.generate` - one harness run)

**LIVE.**

1. **Design spec** (`designSpec.ts`, forced `emit_design_spec`) - the only mandatory model call and the
   ROUTER. Returns `fit: 'catalog' | 'custom'` plus every design parameter: chassis (`variantId`),
   lines, palette/font/zone/size, animation preset, real COMPOSITIONAL parameters (typography scale
   ratio/weight/tracking, density, alignment, shape/panel), `referenceSystem`, and an optional
   `flourish`.
2. **Grounded assembly** (`specToTemplate`) - catalog-fit specs run through the REAL wizard assemblers
   (`variant.create`): correct by construction, timeline- and Style-panel-editable. Every out-of-range
   value CLAMPS to the nearest legal one; the project brand palette wins.
3. **Design adjustments** (`designAdjust.ts`) - the compositional parameters apply as a marked CSS
   override block (cascade beats the design CSS; contracts untouched; every adjustment guarded on the
   structure existing). This is what keeps grounded output diverse.
4. **Polish** (`polish.ts`, only when the spec carries a flourish) - ONE bounded call. Writable:
   appended override CSS + the root element's inner HTML. `applyPolish` rejects patches touching
   `:root`/`@font-face`/scripts or losing a field id or an anim-data selector; a rejected or
   bench-failing patch REVERTS. Polish never makes a result worse.
5. **Custom path** - briefs whose STRUCTURE no catalog family carries go to the free-form coder: house
   contracts + the NEAREST catalog variant's real `create()` output as the canonical example + the
   design stage's direction, then the validated repair loop (`shared/repairLoop.ts` - THE one bounded
   errors-back loop both the SPX and video coders drive: `MAX_REPAIR_ROUNDS = 2`, RE-VALIDATED every
   round; what counts as BLOCKING stays each caller's policy, injected as a filter).
   **The region contract is authored, not emitted:** the example's ANIMATION region is shown in its
   AUTHORING shape (`emitPresetRegion`) and the prompt teaches that grammar - natural GSAP the model is
   reliably good at, instead of the strict-JSON data block it reliably got wrong. Every emit runs
   `convertEmittedRegion` (canonicalize a drifted marker, then `convertToDataRegion`, the same
   parity-proven importer every wizard category uses). **The STRUCTURE SPINE is that conversion's
   precondition, so the prompt states it as a hard requirement** - root `<div class="PREFIX">` holding
   `<div class="PREFIX-box">`, that `-box` class ALONE on the element, `PREFIX-mask` around each `#fN`,
   `PREFIX-accent`. An unconvertible region keeps the model's own code (honest hand-crafted output,
   read-only timeline) and its `bench-editability` findings DEMOTE TO WARNINGS at the end - except when
   a modify started from a data-shaped template, where losing the block is a regression and the repair
   loop fights it.

`modify` refines a grounded result at SPEC level while it is still house-shaped (the caller passes the
result's `spec` back via `GenerateOptions.spec`); anything else refines at code level. `convertImport`
= deterministic import first (`model/importTemplate.ts`), then the validated conversion - the AI only
ever sees parsed code, never raw bytes.

## Phase-A routing - the mode + intent stage (`structuralIntent.ts`)

**LIVE.** `GenerateOptions.mode` (`adapt` | `create` | `auto`, default auto) plus `structuralIntent`
run BEFORE the design call in `generate` and `generateAlternatives` (never for Lite, raw, or modify):
one small forced `emit_structural_intent` call on the provider's `role:'fast'` model ->
`normalizeIntent` -> `routeIntent` (deterministic; `structuralFit` checks the type registry + catalog
LIVE, so catalog growth updates routing by itself).

An explicit mode is never overridden. Auto routes CREATE only on originality words in the brief, no
structural fit, a low-confidence/novel/hybrid classification, or a BEYOND-SCOPE match
(`intent.beyondScope`: the brief matches a listed structure but requires structure its
`GraphicType.structuralScope` note excludes - a double-elimination brief on the single-elim bracket
type. The REGISTRY declares the scope, the intent stage judges the brief with evidence, `routeIntent`
decides deterministically). Explicit adapt skips the intent call entirely (one-call economy) and
narrows the spec tool's fit to catalog; a CREATE decision narrows it to custom (`narrowFitTool`).
Decision + intent land on `AiTemplateChange.routing`/`.intent` and the telemetry record, which the
routing benchmark (`scripts/creative-route-bench.mjs`, SPENDS TOKENS) reads rather than reconstructs.

**The anchor vocabulary is ONE table** (`templates/structuralAnchor.ts`): the family words,
`resolveAnchor`, `structuralFit`, `intentCoversFrame`, and what a variant satisfies. It lives in
`templates/` because the router and the satisfaction check need the same answer and `validation` may
not import `ai`. A second copy is how the two come to disagree - the router sending a brief down the
catalog path while the check has no idea what was promised.

## The structural-satisfaction check (`validation/structuralIntentCheck.ts`)

**LIVE, on both routed paths.** Asks whether the result is the graphic that was asked for:

- **Kind** (`structuralKindFindings`) - does the assembled variant carry the anchor the intent
  promised? Answered by IDENTITY against `spec.variantId`. The defect every other gate was blind to: a
  stinger brief routes to the catalog path CORRECTLY, the design stage returns a lower third, and
  static validation, the runtime bench and the parts checks all pass - a lower third really does have a
  headline and really does sit bottom-left. Every measurement agreed and the user got the wrong
  graphic. It reports only when BOTH sides are known.
- **Parts** - list data as a textarea, field capacity, states vs machine/steps statically, plus
  repeating groups and zone placement measured in a rendered iframe. It DRIVES every text-bearing field
  to a sentinel and re-reads the painted frame, because reading the markup for `id="fN"` cannot see a
  standings row, ticker item or credits line a runtime BUILDS from one field. It ignores opacity on
  purpose: a region the machine reveals in a later step is transparent during the entrance and
  perfectly reachable.

Browser-only, injected as `GenerateOptions.structuralCheck`. PARTS findings land as WARNINGS (rule
`structural-intent`) - they measure presence, not quality. KIND findings (`structural-kind`) land as
blocking ERRORS on grounded results (owner decision 2026-07-31): a wrong-kind assembly fails closed and
is surfaced for refine/regenerate, never delivered as a success. Grounded assemblies have no repair
loop, so blocking there changes no repair rounds. `groundedResult` reports the RESOLVED chassis
(`pickVariant` clamps an unknown one), which is also what makes a spec-level `modify` refine the graphic
the user is looking at. Free coverage: `e2e/creative-routing.spec.ts`.

## NoaCG Lite - the managed free profile (`lite/`)

**LIVE in production since 2026-08-07; quality is the open problem and the deadline plan is
`docs/AI_LITE_PLAN.md`.** The catalog-only, one-result profile selected with
`GenerateOptions.profile = 'lite'` moved to **`src/ai/lite/AGENTS.md`** (with its thin
`CLAUDE.md`), which loads when you work in that directory; the Lite SKIN and its vision judge
went with it. Four things about it bind from out here:

- **A ready response rejoins the `groundedResult` path above**, so `specToTemplate`, the real
  catalog assemblers, deterministic adjustments, fields, NOACG_ANIM, assets, validation, runtime
  checks and exports stay shared. **That sharing is the control-panel guarantee** in the doctrine:
  a Lite graphic drives through the same machine, fields and events as a hand-picked one because
  it IS a catalog assembly.
- **`lite/pipeline.ts` is the ONE grounded compile path**, and `claudeProvider` is built FROM
  it - the benchmark runners compile through the identical function, and
  `scripts/ai-lite-bench.test.mjs` pins that no second copy exists.
- **Lite must never call** `generateRaw`, `generateAlternatives`, custom code generation,
  polish, import conversion, or code repair. No model call may rewrite the compiled code, and
  unsupported scope returns a typed explanation, never an automatic expensive fallback.
- **`lite/types.ts` is dependency-light on purpose**, because both the browser and the API
  TypeScript trees import it - do not import catalog or DOM-bearing model modules from it.


## The alternatives path and the raw off switch

**LIVE.** The 2026-07-17 benchmark proved the harness a clean win on reliability, editability, overlaps
and cost (5/5 clean vs the baselines' 3/5, 0 overlaps, ~3x fewer output tokens, fastest).

- **Default (`AiSettings.useHarness` true): `generateAlternatives`** - one design-stage call (forced
  `emit_design_alternatives`) returns THREE genuinely different directions; each assembles like a single
  harness generation. The AI step offers the pick.
- **Off switch: `generateRaw`** - ONE model call with `RAW_SYSTEM` (format basics only, no taste
  teaching, no worked example), statically validated for display, NO bench and NO repair loop. **Keep
  this path pure:** it is the baseline the harness is measured against, and diluting it makes the
  comparison dishonest.
- **Preference learning (`preferences.ts`)** - the pick is staged on selection and COMMITTED when the
  project is created: aggregated shown/chosen facet counters, localStorage-only. `preferenceHint()` feeds
  the design prompt a SUBTLE tie-breaker only after ≥8 selections and ≥6 shows per facet; it never
  overrides the brief and never reacts to a single click.

## The quality gate (injected, not owned)

**LIVE.** The provider is UI-free: callers inject `GenerateOptions.validate` (an `SpxValidator`) - the
app wires `validateTemplate` + `benchTemplateRuntime` (`src/validation/runtimeBench.ts`: live-iframe
lifecycle, field binding, overlap/overflow, doubled-text stress, and the house editability contract).
Bench findings are teaching messages that drive repair rounds. A result that still fails is returned WITH
its validation attached - surfaced, never auto-applied. **Grounded assemblies get NO repair loop:** one
failing its own bench is a platform bug worth surfacing. On the free-form path the editability contract
is enforced deterministically first (`convertEmittedRegion`), so repair rounds only fire on FUNCTIONAL
findings.

## The safety screen (`safety.ts`) - what the code DOES, not whether it is correct

**LIVE.** Nothing in the quality gate asks what the generated JavaScript *does*, and the model does not
read only the user's brief: it reads uploaded REFERENCE IMAGES (text inside a picture is instructions to
a vision model) and, on modify/convert, a whole HTML file the user may have been handed by someone else.
`safetyFindings` screens the emitted JS for network calls, browser storage, runtime code building and
cross-frame reach, sharing its construct list with the community share gate
(`validation/templateBench.ts` `unsafeJsConstructs`) - one question, one answer, one place to update.

It blocks rather than warns because a generated template is EXECUTED automatically: the runtime bench
loads it the moment a result lands, before anyone has looked at it, in an iframe that today shares the
app's origin.

- **`withSafetyChecks`** wraps the INJECTED validator, so a finding reaches the repair loop.
- **`mergeSafety`** screens again where a result is SHOWN (AiStep's `showChange`, AIPromptPanel) -
  `generateRaw` validates itself and never runs the injected validator, so the screen meets that path at
  the consumer instead.
- **`source`** is the template a modify/convert started from, and only constructs the result ADDED are
  reported: a graphic already carrying a Live data or Show chat block legitimately calls `fetch()`. A
  generate passes no source.

Honest limit: a regex screen refuses the obvious, not the determined (`window['fetc'+'h']`). The
containment that would actually hold is denying the preview iframe the app's origin.

## The structured setup (`spec/` - the "More control" panel)

**LIVE.** The panel authors a `GenerationSpec` (schema in `src/model/generationSpec.ts` - MODEL
layer, because SavedProject/GraphicDoc persist it as `aiSpec`) that rides `GenerateContext.spec`
as TYPED data, never flattened into prose early. The registry, the prompt sections, the pinning
and the spec validators moved to **`src/ai/spec/AGENTS.md`** (with its thin `CLAUDE.md`), which
loads when you work in that directory. One thing about it binds from out here: **an empty spec
injects nothing** - the prompt-only flow is byte-identical, so no path may start reading the spec
unconditionally.

## What an uploaded picture is FOR (`model/imagePurpose.ts`)

**LIVE.** A dropped image carries FOUR unrelated intents wanting opposite treatment, so the user says
which; the vocabulary lives in the MODEL layer because VideoProject persists it.

- **`asset`** - "use it as it is". The ONLY purpose that bundles: a real file, referenced by path,
  exported. Rides `GenerateContext.images`. `fixedAssetPaths` says the operator gets NO field for it -
  permanent brand furniture rather than content.
- **`layout`** - "make one like this": composition, hierarchy, density, shape language; never the
  artwork. A SKETCH is a diagram of what to build, not a look to imitate.
- **`mood`** - "take the look and feel": colour, texture, weight, motion energy; layout ignored.
- **`plate`** - "make it work over this": the REAL background the graphic will sit on - never placed,
  never imitated, read for legibility and safe placement.

The last three ride `GenerateContext.references` as `{asset, use}` and are vision-only.
`attachmentSections` builds ONE numbered manifest plus a block per purpose present, and `imageBlocks`
sends the pictures in that order, so "attachment 3" means the same picture in the text and the vision
blocks. `modifyContent` reuses the same function. The preselect only ever guesses `asset` vs `mood`;
`layout` and `plate` are intents no pixel reveals.

**The as-is screen (`assetIntegrity.ts`)** is the protection "use it as it is" promises: a design putting
a filter, crop, mask, `object-fit: cover`, rounded corners or an uneven scale on a protected picture is
REJECTED. It reports through the injected validator (composed in `productionSpxValidator`, beside the
safety screen), so a violation reaches the repair loop rather than only the result card. Same honest
limit as `safety.ts`: it reads CSS text, not the resolved cascade. **It finds a protected picture by its
`<img src>`, so anything that bakes a `src` must run BEFORE it** - a gate that runs before the last
deterministic step measures a document nobody will ever see.

## The conversation is part of the brief

**LIVE.** `GenerateContext` carries two more typed inputs, both rendered by `contextText` (so EVERY path
reads them, including raw) and mirrored into `modifyContent` and the spec-refine prompt:

- **`conversation`** - the talk turns that led here, oldest first. A brief refined over three turns IS
  all three. **The caller bounds this** (the AI step sends the last 10 turns); the provider never re-reads
  a session.
- **`seed`** - "three more like this": the design spec of a direction the user picked. The design stage
  keeps its category, typographic voice and colour character and varies what is genuinely a choice. A
  starting point, never a template to return three tints of.

**`modify` takes a context** (`modify(prompt, template, context?, options?)`), which is what makes an
image attached mid-conversation real: the context reaches `toTemplate`, so the asset is BUNDLED, not
merely mentioned - a referenced-but-missing asset is the dangling-reference defect class that ships broken
exports. `contextFrom(template, outer)` merges the template's own images with the turn's attachments,
deduped by path. An attachment does NOT force the code level: the design stage sees the image and routes
to `custom` itself when the catalog has nowhere to put it.

## Telemetry & the value proof

**LIVE.** `telemetry.ts` records every run locally (stages, tokens from the API usage block, repair
rounds, route, diversity fields; localStorage ring, JSON-exportable). The VIDEO harness records through
the same ring (kinds `video-generate`/`video-refine`); consumers filter by kind, so SPX statistics never
mix with video runs.

- `scripts/ai-compare.mjs` - same brief, same model, four arms (raw / raw+self-critique / pre-harness /
  the harness), neutral scoring plus cost/latency/diversity. **The decision rule: each stage keeps its
  place only if it shows a clear improvement for its cost.**
- `scripts/ai-bench.mjs` - the single-arm brief bank + review gallery for prompt iteration.

Both need the dev server + a real key and SPEND TOKENS - never CI.

**Run `npm run bench:preflight -- <models>` before any paid round.** It is free, reaches no network, and
answers what the paid runner structurally cannot: given this `.env` and these candidates, what would each
arm ACTUALLY serve? `api/_lib/aiBenchPreflight.ts` resolves every arm through the REAL `liteProfile` +
task registry (never a model of their rules - a preflight that reimplements the server drifts from it and
then certifies runs the server will refuse), and refuses a plan whose arms are overridden, unapproved,
unconfigured, or not pairwise distinct. Each of those wasted a real round: they are invisible in the
OUTPUT, because a comparison whose arms resolve to one model still produces differences - sampling noise
reads as model character.


## Import analysis - the proposal-only vision task (`importAnalysis/`)

**EXPERIMENT - flag `AI_TASK_IMPORT_ANALYSIS_ENABLED` off by default.**
`imported-graphic-analysis` (`docs/AI_TASK_REGISTRY.md`) assists the MANUAL Import Graphic flow
and never replaces it. The schema, the downscale-before-it-leaves rule and the deterministic
normalizer moved to **`src/ai/importAnalysis/AGENTS.md`** (with its thin `CLAUDE.md`), which
loads when you work in that directory. Two things about it bind from out here: it is
PROPOSAL-ONLY (no auto-apply, no code generation, no second representation), and an accepted
suggestion applies through the exact transforms manual placement uses.

## NoaCG Pro - the design-language tier (`pro/`)

**LIVE since 2026-08-15 (hosted deployments where `AI_PRO_ENABLED` is on).** Pressing Create on
the Pro tier runs **ONE text call for a design LANGUAGE**, and the platform composes **every
graphic the user asked for** in it. The tier, its Phase A composer (`pro/language/`), its server
booking and the findings the deleted concept-and-reconstruct engine paid for moved to
**`src/ai/pro/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in that
directory. Two things about it bind from out here: `pro/language/pipeline.ts` is the ONE route
from the wizard to a Pro graphic and `pro/language/gate.ts` the ONE seam a composed graphic is
scored through, and `pro/types.ts` is the wire vocabulary both TypeScript trees compile against
- dependency-light for the same reason `lite/types.ts` is.

**Lite and Pro are SEPARATE PROJECTS with different purposes and constraints (owner decision,
2026-08-09).** Pro is not the continuation of Lite and Lite is not a reduced Pro. Lite is a
managed, free, catalog-grounded profile whose constraints are cost per generation, quota safety
and control-panel operability, and whose open problem is SAMENESS. Pro's open problem is
CORRECTNESS. A change that serves one is not evidence for the other, they do not share a quality
bar, and neither's benchmark scores the other. What they DO share is deliberate and narrow: one
Create-with-AI entry point (`AiSettings.tier` picks lite/pro/custom), one user-facing brief, and
one deterministic mapping seam - `pro/brief.ts` maps that shared brief onto the design-language
call so there is no parallel brief vocabulary. That is a UI and contract economy, not a shared
strategy.


## The TASTE instrument (`spike/tasteCheck.ts`) - the owner's six rules as numbers

**EXPERIMENT, bench-only** (the same deletion condition as the four instruments beside it,
`spike/exemplars.ts`). Driven by `scripts/pro-taste-rejudge.mjs`, which is FREE: it mounts saved
code from finished rounds and measures it. The six rules, the three that deliberately carry no
pass/fail, and the owner rulings behind each moved to **`src/ai/spike/AGENTS.md`** (with its thin
`CLAUDE.md`), which loads when you work in that directory; the full account with the numbers is
`docs/NOACG_PRO_PLAN.md` §25. One thing about it binds from out here: **it REPORTS, and a rule
that fires on a shipped design is a question for the owner, never a threshold to move.**

## Phase-C creative pilot (`creative/`)

**RETIRED 2026-08-09 (owner decision): Creative Mode is superseded by NoaCG Pro and is no longer
carried as a parallel architecture.** Nothing in the product reaches this code. The pilot's
record, what to MINE from it and what removing it would and would not include moved to
**`src/ai/creative/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in that
directory.

Two rules reach outside the pilot and bind here:

- **THE CUSTOM CODER IS THE BENCHMARK CONTROL: its catalog example, `designNotes` and repair policy stay
  byte-identical, and routing changes WHICH briefs reach it, never what it is shown.** The freeze on its
  SYSTEM PROMPT was lifted for exactly one edit - the ratified corpus motion numbers, which a control
  cannot keep contradicting once it is also production code. **Arm A results from 2026-08-02 and earlier
  are therefore not comparable with later rounds; re-baseline the control rather than reusing them** (arm
  B reuses `coderSystemPrompt`, so it moved too). No further prompt change without the same explicit
  trade written down.
- **The anti-anchoring rule is absolute: no catalog design code reaches any CREATE prompt.**
  `neutralSkeleton.ts` is what the coder arm studies instead. Free coverage:
  `e2e/creative-pilot.spec.ts`.

## Other files

**LIVE.**

- `modelTypes.ts` + `modelGateway.ts` - the provider-neutral model-call contract and browser client. The
  server adapters in `api/_lib/aiGateway.ts` implement Vercel AI Gateway (the MANAGED transport, and the
  only one NoaCG funds), plus Anthropic, OpenAI Responses, Google's OpenAI-compatible surface and
  compatible Hugging Face Inference Providers as bring-your-own-key routes - without branching the
  harness. A new BYO-key adapter is modelled on the Hugging Face one: same chat-completions shape, same
  parser, no second structured-output dialect. Retention is TWO filters, ANDed by the
  gateway: `disallowPromptTraining` is free on every plan and pinned on for every managed call, and
  `zeroDataRetention` is the Pro/Enterprise superset - so a task requiring ZDR fails closed with
  `zdr_unavailable` rather than degrading quietly. The per-request price cap OpenRouter enforced has no
  gateway equivalent and now lives entirely in the approved-catalog snapshot and each task's cost booking
  (`docs/AI_PROVIDER_GATEWAY.md`). `modelCatalog.ts` reads only the normalized server discovery endpoint.
  Structured output, usage, costs, errors, retries and explicit fallbacks normalize here. `cacheSystem`
  remains an Anthropic hint.
- **A ROUTE IS REACHABLE IN DEVELOPMENT BECAUSE THE TREE SAYS SO, never because a list does.**
  `scripts/aiDevPlugin.mjs` mounts the real `api/ai` handlers, and it used to decide which paths
  existed from a hand-kept allowlist. That list hid a whole surface three times: the
  imported-graphic-analysis task shipped with no entries, hosted Pro was a dev 404 in every dev
  server and the entire e2e suite while production served it (so `loadProStatus` read "this
  deployment has no Pro" and the door never appeared locally), and `/api/ai/consent` had never been
  routed at all. It is gone. `scripts/apiRouteTable.mjs` derives the function table from the api/
  tree and applies the deployment's own measured rule - a `[...path].ts` routes exactly ONE segment
  - so an unknown NAME is answered by the real dispatcher in its own error vocabulary and an
  unroutable DEPTH is refused exactly as the platform refuses it. `npm run check:api-route-depth`
  certifies every `/api/` path our client names through that SAME resolver, so the gate and the dev
  server cannot hold different opinions. **Every other AI spec mocks these routes at the network
  level, which is why none of the three defects was ever caught** - `e2e/ai-dev-routes.spec.ts`
  deliberately does not mock, and is the only thing here that proves a route is reachable.
- `stubProvider.ts` - the offline provider: keyword -> DesignSpec -> the SAME `specToTemplate` pipeline, so
  offline results are catalog-grade. It honors the structured setup through the same `applySpecLocks`/
  post-passes, which keeps the whole More-control flow e2e-testable without tokens.
- `settings.ts` stores only non-secret provider/model/routing preferences and server-reported credential
  availability. Raw keys never enter localStorage. `index.ts` (`getAiProvider`), `brainstorm.ts`,
  `examplePrompts.ts` and `presets.ts` keep their existing roles.

The binding gateway and key-handling contract is `docs/AI_PROVIDER_GATEWAY.md`. Provider adapters never own
DesignSpec, validation, repair, preference learning, or graphic-type context. New providers enter below
`AIProvider`, never beside it.

The versioned video matrix and brief bank live in `benchmarks/video/v1`; its runner must drive
`src/ai/video` through the application, never call a model with a benchmark-only prompt pipeline. The
binding experiment and artifact contract is `docs/VIDEO_MODEL_BENCHMARK.md`.

**Deferred (benchmark-gated, deliberate):** a selective vision taste critic (free-form path only,
evidence-based findings, never auto-rewriting a valid grounded result), a curated taste library with
per-brief retrieval, and a nightly taste-analysis task producing reviewable proposals. Add them only when
the compare rig shows they pay for themselves.

## A harness bug reads as model incapacity - state which faults were live in any round

Two consecutive PAID Creative Mode rounds (2026-08-02) produced numbers that looked like the model
could not design. Both were platform faults:

1. **Structured output refused for being ENCODED, not wrong.** Anthropic tool use returns a nested
   array as a JSON string, sometimes re-wrapping the whole tool envelope inside the property
   (`{"concepts":"{\"concepts\":[…]}"}`). `api/_lib/aiGateway.ts` schema-checked it, called it
   `malformed_response`, and retried to exhaustion. 7 of 8 briefs died with three usable design
   directions sitting in every rejected payload. Fixed by running `decodeStructuredOutput` BEFORE
   validation - which had also been breaking every BYO-Anthropic user in the product, not just the
   bench.
2. **A style patch giving `.creative-box` `position: absolute` collapsed the root to 0x0.** The
   root is absolutely positioned in its zone and sized by its content, and the box is its only
   in-flow child. Sonnet did it in 8 of 8 stylesheets (blank frames); qwen in 4 of 8 (content
   survives, re-anchors to the collapsed root, drifts to the frame edge). Fixed by
   `keepStructureInFlow` in `src/ai/creative/style.ts`.

**The second one retro-invalidated a human verdict.** The owner's blind review that evening judged
frames of which half carried the bug, and its "content on the frame edge" note was the bug, not
taste. So: **any conclusion drawn from a round must state which platform faults were live during
it**, and a round whose harness changed underneath it is not comparable to one that ran before.

The general form is the same as the runtime bench's (`docs/VERIFICATION.md`): check the instrument
before concluding anything about what it measured.
