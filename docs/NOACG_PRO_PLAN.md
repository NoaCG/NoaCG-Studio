# NoaCG Pro - the open broadcast graphics specialist

**OWNER-APPROVED DIRECTION AND ACTIVE ROADMAP.** This plan replaced the image-guided
reconstruction plan on 2026-08-10; on 2026-08-11 the owner promoted it from parked to active, with
**Phase 0 as the next implementation slice**. Pro will become a narrow open-weight specialist for
premium HTML broadcast graphics, not an attempt to make an open model equal a frontier model at
general reasoning.

The old concept-image -> interpretation -> raster reconstruction path is retired as a product
direction. Its code and fixtures remain an experiment until an implementation slice removes or
archives them deliberately. Its evidence remains in `docs/AI_ATTEMPTS.md` and
`benchmarks/pro/round-2026-08-08/`, `benchmarks/pro/round-2026-08-09/` and
`benchmarks/pro/round-2026-08-10/`; this document does not rewrite that history. Phase 0 is
bench-only and touches no Student release surface; product integration (Phase 5) still queues
behind the Student release. Every paid round, including the Phase 0 spike, still needs an explicit
owner OK with a stated cost cap before tokens burn.

This plan combines four mechanisms in one pipeline:

| mechanism | role in Pro |
| --- | --- |
| **2. Direct HTML generation by an open-weight model** | The model authors the actual visual HTML, CSS and SVG instead of describing a raster image that another model must reverse-engineer. |
| **3. A minimal broadcast intent contract** | A small transient plan carries only structural decisions NoaCG must compile; HTML/CSS/SVG remains the creative design language. |
| **4. Retrieval from excellent complete exemplars first** | The model starts from a few relevant, proven graphics. Decomposed design units are added only if an ablation earns them. |
| **5. A smaller fine-tuned specialist, eventually** | Accepted generations, failures and repairs become a licensed training set only after the system and evaluation harness prove what should be learned. |

These are not four competing architectures. They are stages in one system. The final artifact is
always an ordinary, clean `SpxTemplate`; no design plan, retrieval trace or model runtime is needed
to put it on air.

---

## 0. First falsification - does an open model already have the eye?

> **RUN 2026-08-12. OWNER VERDICT: GO, with logos as the named gap.** `moonshotai/kimi-k3`, 20 of
> 24 generations captured, $4.58 on the round's own ledger. The owner's read of the blind gallery:
> *"the graphics are fine if we can create this quality"*, plus two named defects (one strap's
> panel not aligned to its own accent line; one near-identical pair judged simple but acceptable)
> and one named gap: **there is no structure or plan for how a brand mark is placed so it fits the
> design, nor for animating it meaningfully and smoothly.** That gap is also the one defect every
> deterministic gate passed - the `portrait-logo` brief rendered a broken-image icon with its alt
> text showing. §0.3's transfer test went the right way: the no-exemplar arm completed 12 of 12 and
> was judged indistinguishable from the exemplar arm on the pair the owner singled out, so the pass
> is not paraphrased catalog taste - and the exemplar block has not yet earned its ~34,500 tokens.
> **Both planned checkpoints ran.** `alibaba/qwen3-coder` completed the identical protocol **24 of
> 24, all contract-clean, for $0.263** - against kimi-k3's 21 of 24 at $5.032, about 19x cheaper and
> more complete, because it spends no reasoning tokens and so never truncated or timed out. Neither
> checkpoint is separated by CAPABILITY; which of them designs better is a human comparison still
> to be made. kimi-k3's exemplar arm stopped at 9 of 12: two briefs never completed across four
> attempts, and `corporate.exemplar` truncated at both the 17,000 and 25,000 token ceilings.
> Full record: `docs/AI_ATTEMPTS.md`; archives `pro-phase0-kimi-k3-complete-2026-08-12/` and
> `pro-phase0-qwen3-coder-2026-08-12/`.

Before building a grammar, unit corpus, model tournament, visual critic or formal parity harness,
run one deliberately small research spike. Its only question is:

> When a strong open-weight model receives a good brief, a minimal NoaCG scaffold and a few
> excellent complete exemplars, does its rendered HTML show enough broadcast-design judgement to
> justify building the specialist system around it?

This is an early go/no-go experiment, not evidence of frontier parity and not a product prototype.

### 0.1 Reuse, do not build a second pipeline

The spike should be a thin bench-only wrapper over systems that already exist:

- before any token is spent, push one known-good hand-authored lower third through the complete
  wrapper - scaffold, render set, gates and gallery - as a zero-token control; if the control
  looks broken, the harness is broken. Two paid rounds have already been mis-read as model
  failure when the platform was at fault, so the control rerun is mandatory after any wrapper
  change;
- start from the existing 12-brief lower-third bank, adjusting only inputs that were specific to
  raster reconstruction; those 12 briefs are the complete run and the section 0.3 denominators;
- use `structuralIntent` and the lower-third type contract for fields and supported structure;
- use `creative/neutralSkeleton.ts` or an equivalently minimal generated scaffold for the root,
  field ids, style variables and authoring-region contract;
- run every brief through two arms: one with two or three excellent **complete** lower-third
  exemplars retrieved through `shortlistFor` (which already reuses `templates/search.ts`,
  `TemplateMeta` and the one structural-anchor table), and one with no exemplars at all. The
  no-exemplar arm is what separates the model's own eye from paraphrased catalog taste; without
  it a pass could be mostly transfer;
- make one initial call per brief and arm to a strong, pinned, commercially usable open-weight
  checkpoint, with decoding parameters pinned in the fixtures; a second pinned checkpoint may run
  the same protocol (section 0.3), never more than two;
- use the existing `shared/repairLoop.ts` maximum of two rounds for deterministic blocking
  findings only;
- validate through `productionSpxValidator`: `validateTemplate`, `benchTemplateRuntime`, safety
  and asset-integrity checks;
- render through `composeDocument` at 1920x1080 and reuse the fixture, screenshot, result-ledger
  and review-gallery patterns in `pro-bench.mjs` and `ai-bench.mjs`. One piece is new build, not
  reuse: virtual-clock scrubbing today lives only in the render compose path
  (`src/render/runtimeScript.ts`); the wrapper must wire it into the bench render for the motion
  strips, and the zero-token control run is what proves that wiring.

The spike does not need `BroadcastDesignPlan`, a visual critic, decomposed design units, best of
two, a new retrieval index, a new repair loop or product wiring. The wrapper either graduates into
the later harness or is deleted after recording the result.

### 0.2 What humans inspect

Every result is rendered at its actual final placement over neutral and video-like backgrounds.
Review the settled hold, entrance, update and exit, with normal and stress text. Motion is
reviewed from sequences captured through the virtual clock - the timeline scrubbed to fixed
timestamps for entrance, update and exit strips - because headless GSAP does not visibly tick on
requestAnimationFrame; a spike that inspects only settled holds has not reviewed motion. The
review gallery blind-mixes a few adapt-first outputs and strong catalog graphics among the
candidates, so "coherent, deliberate composition" is judged against visible anchors rather than
cold. The human notes are written **before** revealing the validator verdict or which arm and
checkpoint produced each result, so a green machine result cannot frame a broken graphic as
successful.

The read is intentionally direct:

- Does it show deliberate hierarchy, proportion, spacing and composition?
- Does it look like a real broadcast graphic rather than a tutorial component?
- Did it transform the exemplars into an appropriate answer instead of copying one?
- Does the motion support the composition?
- Would local CSS/SVG polish finish it, or would a designer have to start over?

### 0.3 Go/no-go rule

With a 12-brief run, continue only if human inspection finds all of the following:

- at least 6 results show a coherent, deliberate broadcast composition worth refining;
- at least 3 are airable or one localized repair away, not a redesign away;
- the set contains at least 3 genuinely different visual directions rather than one safe slab;
- at least 9 of 12 preserve the scaffold and live-field contract after the existing bounded repair
  loop;
- the promising results are not near-copies of an exemplar.

The gate is read on the exemplar arm of the better checkpoint. The no-exemplar arm does not have
to pass anything; it exists to interpret the pass. An exemplar arm that clears the gate while the
no-exemplar arm collapses into incoherence is a transfer result, not evidence of taste - treat it
as ambiguous, not as go. These thresholds answer only whether there is enough visual signal to
invest in the system. They do not establish a product success rate, a release bar or statistical
parity.

If the spike is clearly below the gate, stop. Record the renders and failure taxonomy, then revisit
only when a materially stronger open checkpoint or a specific falsifiable technique exists. Do not
build the grammar, unit architecture or critic in hope that infrastructure will manufacture taste.
If the result is narrowly ambiguous - because the chosen endpoint cannot follow the scaffold,
because taste sits just under the gate, or because the pass reads as transfer - the second pinned
checkpoint answers it. Two checkpoints are the ceiling; a third requires a new planning decision.
That is endpoint diagnosis, not an open-ended prompt program.

Estimated spend: 12 briefs, two arms, up to two checkpoints, inside the existing two-round repair
ceiling, is on the order of $5-15 at current hosted open-weight pricing - the flat concept-image
call that dominated the retired pipeline's cost does not exist here. The exact route and cap are
still approved explicitly, with the estimate restated, before the round runs. This document
schedules the spike; it does not authorize the spend.

---

## 1. The claim and the boundary

**The claim:** a specialized open-weight system can match or outperform general frontier models
inside one small world: premium broadcast design, HTML/CSS/SVG, SPX operation, deterministic
motion, and render-and-repair.

That claim is plausible because the platform can remove most general reasoning from the model's
job:

- NoaCG supplies the field contract, SPX definition, animation runtime, state-machine semantics,
  control generation, asset packaging, safe canvas and validators.
- Retrieval first supplies a few complete, excellent graphics instead of asking the model to
  rediscover broadcast design from first principles.
- A deliberately small intent contract carries only relationships the platform must compile;
  HTML/CSS/SVG keeps creative expression open.
- Chromium shows the system what it actually made. Deterministic measurements establish
  correctness, a separate visual critic can localize likely defects, and humans judge whether the
  rendered design is actually good.
- Fine-tuning eventually teaches the repeated successful transformations and repairs, not broad
  world knowledge.

This is a testable product hypothesis, not a guarantee. Success means parity on a predeclared,
blind, broadcast-graphics evaluation. It does not mean parity on coding benchmarks, conversation,
research, mathematics, arbitrary websites or general agent work.

### 1.1 Initial scope

Pro starts with **lower thirds** because that is the category with the deepest measurements, the
clearest placement contract and three paid rounds of failure evidence. It expands one graphic type
at a time only after that type has:

1. a declared field and structural contract;
2. deterministic SPX and state-machine compilation;
3. normal, long, empty and non-Latin content fixtures;
4. entrance, hold, update, next where applicable, exit and snap tests;
5. a category-specific blind quality round.

Likely expansion order is lower third -> info card and corner bug -> scoreboard and results board
-> multi-state graphics. Full-frame transitions, data-driven collections and arbitrary graphic
types are not silently included in a lower-third success.

### 1.2 Non-goals

- No general website or application generator.
- No attempt to reproduce a concept image pixel for pixel.
- No raster image as the graphic's hidden source of truth.
- No second persisted scene graph beside HTML/CSS/JS and `NOACG_ANIM`.
- No model-authored SPX dispatcher, control protocol or parallel animation runtime.
- No arbitrary JavaScript from the model in operator or lifecycle paths.
- No unbounded agent loop, autonomous paid cascade or silent fallback to a closed model.
- No fine-tune before the base system, evaluator and data provenance are sound.
- No claim of frontier parity from machine scores alone or from one 12-brief round.
- No large grammar, unit corpus, critic or formal comparison harness before the early spike says
  the model has enough visual ability to justify them.

---

## 2. Non-negotiable output contract

The specialist may own taste. The platform continues to own engineering.

### 2.1 Code and SPX

- The result is one normal `SpxTemplate`: readable HTML, CSS and JS plus its parsed definition.
- Each live field maps to its visible `id="fN"`; `update(data)` changes the painted graphic.
- `play()`, `stop()`, `next(data)` and `update(data)` retain the repository's SPX semantics.
- Data never causes a state transition. Events and timers follow the structural state-machine
  contract. `steps` remains derived from the default path.
- Operator controls are generated from fields and the machine. Pro does not write a special
  control panel or per-template command language.
- Dependencies, fonts and assets are local and exportable. Generated code contains no CDN or
  runtime network dependency.
- The output validates and operates in the same editor, preview, export and control surfaces as a
  hand-authored template.

### 2.2 One final 1920x1080 coordinate system

The graphic is designed in its production coordinate system from the first authored element:

- The canvas is a transparent 1920x1080 stage.
- The graphic's settled bounding box is already at its final sharp size and final coordinates.
- There is no operator transform required after generation and no root `--scale` used to make the
  composition fit.
- CSS and SVG are authored at final design-pixel dimensions. They do not have a raster-resolution
  problem.
- Raster user assets preserve aspect ratio and source pixels. They may downscale with an explicit
  asset fit, but never visibly upscale or stretch. An asset too small for the chosen use fails
  honestly or causes the platform to choose a smaller supported placement.
- Text, logos, masks, decorative geometry and motion share the same coordinates. A repair cannot
  move one layer while leaving its related mask, hit area or animation origin behind.

The model chooses **semantic composition intent** and may propose integer pixel bounds. The
platform resolves and clamps that proposal against the category, safe area, text capacity and
asset resolution. This keeps aesthetic placement with the specialist while making exact production
geometry deterministic.

### 2.3 Safe authorship regions

The platform emits the complete structural scaffold. The model may author or patch only marked
creative regions:

- semantic visual HTML inside the graphic root;
- CSS custom properties and selectors for those visual elements;
- inline or bundled SVG using the approved feature set;
- approved timeline/keyframe declarations through the motion grammar.

The model does not directly edit the SPX definition, field wiring, `NOACG_ANIM` interpreter,
control receiver, export glue or security markers. Changes to those areas happen only by changing
the structured plan and recompiling them deterministically.

---

## 3. The architecture

```text
brief + fields + brand + assets
        |
        v
structural intent and supported-type route
        |
        v
ONE shared retrieval engine -> a few complete, excellent exemplars
                              -> optional units only after a positive ablation
        |
        v
open planner -> minimal transient BroadcastDesignPlan, once earned
        |
        v
deterministic SPX scaffold + motion/state compiler
        |
        v
open code author -> creative HTML/CSS/SVG regions
        |
        v
render all test states at 1920x1080
        |
        +-> deterministic measurements
        +-> separate open visual critic for defect hypotheses
        |
        v
bounded code repair, maximum two rounds
        |
        v
production validation -> ordinary SpxTemplate -> editor/export/control

At every important research milestone: render the actual output -> human inspection -> decision
```

There is one pipeline and one result. The planner and coder may initially be the same open-weight
checkpoint with separate contexts, but the roles remain separate contracts so the best model for
each can be selected later. A visual critic presented as independent must use a different
checkpoint and be calibrated against human findings. The creator in a fresh context is only
self-critique; it may be useful, but it is not independent evidence.

### 3.1 Who owns each decision

| decision | owner |
| --- | --- |
| requested graphic type, fields and content roles | structural intent proposes; supported-type registry decides |
| relevant complete exemplars | the existing retrieval engine over declared metadata |
| whether decomposed design units exist at all | paired ablation after complete-exemplar retrieval |
| hierarchy, composition, shape language, palette and visual rhythm | open planner and code author |
| exact safe bounds, asset pixel limits and final canvas placement | planner proposes; deterministic normalizer decides |
| field ids, SPX definition and update wiring | platform compiler |
| state shape, lifecycle semantics and control legality | supported graphic type plus platform compiler |
| entrance character, sequencing, masks, stagger and easing | model through the motion grammar |
| GSAP/runtime implementation and snap behavior | platform compiler |
| correctness, overflow, asset safety and exportability | deterministic validators |
| likely visible defects and their locations | separate open visual critic, calibrated by humans |
| visual quality and whether the result is good enough | humans inspecting rendered graphics and motion |

### 3.2 The two authoring lanes are one system

Direct HTML generation and a structured intent contract can look contradictory. The resolution is
deliberate:

1. Existing structural intent supplies the graphic type, requested fields and supported structure.
2. If the spike earns further work, the open planner emits the smallest useful
   `BroadcastDesignPlan` for relationships the platform must compile.
3. A deterministic compiler creates the full SPX scaffold and marked creative regions.
4. The open code author writes the actual semantic HTML, CSS and SVG for those creative regions.
5. Motion intent compiles through the existing timeline/state vocabulary.
6. Repairs patch only the failing creative region or revise a plan value and recompile.

This keeps direct code generation expressive enough for premium work while preventing the model
from repeatedly spending reasoning on boilerplate or breaking operator behavior. The transient plan
is not saved as another editable format. Once code is emitted, code is the source of truth.

---

## 4. `BroadcastDesignPlan` - the smallest useful transient contract

The early spike runs without this contract. If the spike passes, v1 starts as a small versioned
wire object between the planner and deterministic compilers. It is normalized and discarded;
unknown versions fail honestly. It is never an editor format and never persisted beside code.

The existing `StructuralIntent` and graphic-type registry already own type, fields, repeating parts
and structural support. `BroadcastDesignPlan` must not copy that vocabulary. Its initial job is only
to carry the one decision creative code alone cannot safely coordinate with platform behavior:

- **placement:** final 1920x1080 anchor, intended settled bounds and growth direction;

That is the initial contract. Field behavior remains in the graphic-type and field contracts, and
the model authors motion through the existing marked authoring region that NoaCG already converts
to `NOACG_ANIM`. Add a field-behavior or motion-plan property only if rendered evidence later shows
that those existing seams cannot coordinate a required relationship.

In particular, the initial plan does **not** describe:

- DOM nodes, layer trees or component ids;
- panels, cards, accent bars or predefined shape pieces;
- colors, typefaces, font sizes, spacing, padding, radii or shadows;
- SVG paths, clipping geometry or CSS declarations;
- a catalog-unit assembly recipe.

HTML/CSS/SVG owns those creative decisions directly. A sports strap may use angled SVG, a glass
strap may use translucent CSS and an editorial strap may use only rules and type without the plan
learning three component families.

The platform normalizes placement and asset pixel limits, then emits field ids, the SPX definition,
safe scaffold, runtime and canonical `NOACG_ANIM`. Motion that cannot be represented in the existing
vocabulary is unsupported until that platform vocabulary grows; it is never hidden in arbitrary
lifecycle JavaScript.

### 4.1 Growth rule

Every added plan property needs evidence from rendered failures that:

1. the model cannot coordinate the relationship reliably in HTML/CSS/SVG alone;
2. NoaCG must know the value to compile, validate, edit or operate the graphic; and
3. adding it improves human-rated output in an ablation.

A schema property added because it seems useful is removed. If the contract starts describing how
the graphic looks rather than the small set of relationships NoaCG must own, it has become the
second scene graph this architecture forbids.

---

## 5. Retrieval - complete exemplars first

Pro extends the repository's **one shared retrieval system**. It does not build a second vector
store, catalog ranking engine or design-family format.

### 5.1 Initial retrieval

The existing brief terms, `TemplateMeta`, structural anchor and `browseTemplates` ranking produce a
small deterministic shortlist. The first specialist path retrieves only complete, proven,
appropriately licensed NoaCG graphics:

- two or three structurally compatible exemplars, best first;
- a different relevant visual family when the shortlist genuinely contains one;
- stable source id, version, provenance, license and human-readable retrieval reason.

The exemplars show coherent relationships among layout, type, shape and motion. That coherence is
exactly what premature decomposition could lose. The model is asked to design an answer to the
brief, not assemble pieces or repaint one of the examples.

The first retrieval ablation is **no exemplar vs complete exemplars**. Phase 0's paired arms give
the first read; the formal ablation on the development bank must still show a material human
quality improvement before exemplar retrieval becomes part of the specialist. The whole catalog is
never pasted into a prompt.

### 5.2 Copying and similarity

Similarity to a retrieved exemplar is primarily a provenance and copying alarm:

- flag unusually close layout, silhouette, decoration and motion combinations for human review;
- retain the exemplar ids and code versions used for every generation;
- reject unattributed near-copies and remove unsafe source material.

Do not optimize a graphic to be mechanically distant from its references. Lower thirds share
conventional anchors, type hierarchies and motion grammar for good reasons. A strong conventional
design is not worse because a distance metric says it is familiar. Human reviewers judge whether
the result is appropriately transformed and whether it is good.

### 5.3 Design units are conditional

Do not extract a large unit corpus up front. Decomposed units become a candidate only if complete
exemplars reveal a specific limitation, such as excessive copying, one-chassis sameness or an
inability to transfer a good motion or typography relationship across layouts.

Test that hypothesis with a tiny, human-curated set of units inside the existing retrieval path.
Compare complete exemplars against complete exemplars plus those units on the same briefs. Build
versioned unit metadata and compatibility rules only if the unit arm materially improves human-
rated quality or diversity without reducing coherence, correctness or provenance clarity.

If units earn a place, they remain source code plus metadata, never a hidden scene model. One
dominant complete exemplar still anchors coherence; units may inform a limited role, not turn the
generation into a collage.

### 5.4 Diversity without novelty theatre

The harness records exemplar and visual-family concentration across a brief set. A route that puts
most briefs on one safe composition has not met the Pro promise. This is a set-level diagnosis, not
a per-output demand for novelty. Relevant alternatives come from retrieval and human taste decides
whether the result is both appropriate and distinct enough.

---

## 6. Render, inspect and repair

The current repository can validate structure and measure rendered geometry. Pro adds a first-class
visual inspection loop around those existing systems.

### 6.1 Evidence hierarchy

The three kinds of evidence have different jobs and never collapse into one score:

1. **Deterministic checks establish correctness.** They answer whether fields paint, SPX operates,
   states are reachable, geometry stays safe, assets survive and exports run. They do not answer
   whether the design is premium.
2. **A visual critic finds and localizes likely defects.** It is an assistive instrument for paint,
   hierarchy, spacing and motion problems the deterministic checks do not measure. Its score is
   neither correctness nor taste.
3. **Humans establish visual quality.** People inspect the actual rendered frames and motion and
   decide whether the work is coherent, premium and airable. Model or critic confidence cannot
   override that read.

The historical Pro rounds make this ordering binding: 10/10 machine passes once accompanied 5/10
visibly broken frames, and the tight-placement round still had machine passes on broken outputs.

### 6.2 The render set

Every candidate renders in Chromium at 1920x1080 with transparency made visible by a neutral
checkerboard. Motion frames are captured by scrubbing the virtual clock to deterministic
timestamps, never by trusting live requestAnimationFrame playback in a headless renderer. The
harness captures at least:

- initial/off pose;
- entrance samples and settled hold;
- normal field values;
- long values at declared capacity;
- empty optional values;
- non-Latin and difficult numeral values;
- update while on air;
- each reachable default-path step and supported branch state;
- exit and snapped recovery pose.

The exact set is derived from fields and the state machine so a complex graphic cannot receive the
same shallow inspection as a two-field lower third.

### 6.3 Deterministic gates

Before visual judgement, a candidate must pass:

- template validation, SPX definition and runtime pairing;
- runtime exceptions and external-network screening;
- field coverage through real `update()` calls;
- state, event, timer, default-path, snap and control reachability;
- canvas bounds, safe-area and settled alpha-bounds checks;
- self-clipping, overflow, long-text capacity and minimum type floors;
- logo/image containment, aspect ratio and source-resolution checks;
- font and asset availability, export paths and engine compatibility;
- motion duration, stuck pose, large-frame jump and performance checks.

A critical deterministic failure rejects the candidate before it can be considered visually good.
Passing says only that the candidate is correct enough to inspect.

### 6.4 Assistive open visual critic

The critic receives the brief, relevant brand input, rendered state contact sheet, alpha view,
declared design plan and a DOM overlay naming elements. It returns localized findings, not one
opaque score:

- severity and category;
- affected state and element ids;
- image-space region and visible evidence;
- expected relationship;
- whether the issue is repairable in plan, HTML, CSS, SVG or motion.

It inspects hierarchy, composition, spacing, optical alignment, brand handling, legibility over
video, visual coherence, accidental artifacts, motion continuity and whether the brief is actually
answered. It may not declare structural correctness, define good design or edit code directly.

The critic is a different open checkpoint from the creator when independence matters, and is
calibrated against broadcast-designer labels. Agreement, false-negative rate on seeded defects and
false-positive rate on accepted human-authored graphics are recorded per pinned version. A same-
model fresh context is labeled self-critique and never counted as independent validation. A critic
finding is a hypothesis until deterministic reproduction or a human read confirms it; a critic
pass never establishes quality.

### 6.5 Bounded repair

The code repairer receives only the failing evidence, relevant source regions and allowed patch
contract. It gets at most **two rounds**:

1. patch the smallest responsible creative region or revise a normalized plan value;
2. recompile if needed, render every affected state, and rerun all gates;
3. keep the patch only if the stated defect improves without a new regression.

A repeated finding, no measurable improvement or new critical failure stops the loop and rejects
the candidate. Regenerating indefinitely is not repair.

### 6.6 Candidate count

The research harness starts with one candidate so model and compiler failures remain diagnosable.
Best-of-two generation becomes the intended quality mode only if an ablation proves that it
materially improves blind airability. The system gates both, the critic may rank the survivors and
repairs only the winner, but that ranking mechanism must first agree with human choices on a
calibration set. More than two requires separate evidence and a cost/latency decision.

### 6.7 Human visual milestone gates

Every important visual milestone produces reviewable 1920x1080 frames and motion, not just JSON:

- the early feasibility spike;
- the first minimal-plan outputs;
- complete-exemplar retrieval and every retrieval ablation;
- critic calibration and repair ablations;
- each model, prompt, fine-tune or quantization promotion;
- each new graphic-type expansion and the product-beta candidate.

The responsible human review happens before that milestone is called successful. Machine, critic
or model claims may help explain the output after it is seen; none may substitute for seeing it.

---

## 7. Open-model strategy

### 7.1 What "open" means here

A production Pro route must use a checkpoint whose weights are downloadable, whose exact version
is pin-able, whose license permits the intended commercial deployment after review, and which can
be self-hosted. A hosted inference service is acceptable during development or managed operation
only when it serves that same identifiable open-weight checkpoint. "Open API" without available
weights does not qualify.

Closed frontier models may be paid **evaluation baselines only**, with explicit approval for each
round. They are not runtime fallbacks, hidden teachers or required infrastructure. Training data is
owned, licensed, human-authored or explicitly opted in; it is not silently distilled from closed
model outputs or customer graphics.

Open-weight does not mean small, local or cheap. The strongest initial checkpoint may require a
remote multi-GPU host. Local deployment is a goal of the later specialist, not a false constraint
on the quality experiment.

### 7.2 Capability tournament

Model names change faster than this architecture. The early spike does **not** build a tournament:
a license and endpoint capability preflight selects one strong open-weight checkpoint, pins it and
tests the hypothesis cheaply. Only after a go decision are candidates systematically tested on:

- structured planning and schema adherence;
- HTML/CSS/SVG quality and disciplined patching;
- long-context use of retrieved examples without copying;
- tool use and recovery after compiler/validator errors;
- visual understanding for a separate critic candidate;
- deterministic decoding controls, latency, throughput, hosting availability and license;
- exact cost per accepted output, including failed candidates and repairs.

Planner, coder and repairer are independent route roles and one checkpoint may win several. A
critic claimed as independent must be a different checkpoint. Routes, prompts, the minimal plan
version and exemplar versions are pinned in every fixture and round.

### 7.3 Quality before inference optimization

The first route is the strongest open-weight combination that satisfies the license and can run
the harness. Development cost and inference convenience do not outrank visible quality. Assistive
roles are the one early exception: the critic and the repairer may be filled by cheaper open
checkpoints once calibration shows no loss against the strong checkpoint in that role - the
authoring roles are never downgraded for cost ahead of the locked quality gate. After parity is
demonstrated, distillation, quantization, caching and smaller checkpoints may reduce cost and
latency, but each optimization reruns the locked quality gate.

---

## 8. Evaluation - what "Opus-level" means

The claim is about the complete specialist system, not raw model intelligence. The comparison is
therefore final rendered graphics produced from the same briefs under declared, bounded workflows.
This formal evaluation begins only after the early spike passes; the spike is not a small parity
round.

### 8.1 Evaluation sets

- **Development bank:** visible briefs spanning broadcast genres, field shapes, brand inputs,
  capacity stress, logo/image cases and motion requests. Used for engineering, never for the final
  claim.
- **Locked holdout:** unseen brief families and brands, stored separately and opened only for a
  declared round. Minimum 40 joined items for a parity read; the final sample size is set by a
  power calculation before the round.
- **Adversarial bank:** long names, empty optional fields, literal `undefined`/`null`, multiline
  values, non-Latin text, difficult logos, low-resolution assets, extreme but valid brand colors,
  interrupted events and state recovery.
- **Category banks:** a new type receives its own holdout and cannot inherit a lower-third verdict.

Fixtures record brief, inputs, retrieval ids, plan, model/checkpoint hashes, prompts, code, every
rendered state, measurements, critic findings, repairs, usage, cost and human verdict.

### 8.2 Comparison arms

At minimum, a quality round compares:

1. excellent human-authored NoaCG graphics mapped to the same briefs as the quality anchor;
2. the strongest open Pro system;
3. the best current closed frontier baseline available through the same scaffold, tools, render
   evidence and maximum repair count;
4. the existing adapt-first product baseline.

The open system may use retrieval and specialization because those are the product. The baseline
receives the same NoaCG structural compiler and validation opportunities so the comparison does not
confuse broken boilerplate with design intelligence. The human anchor is the best structurally
appropriate catalog graphic populated for the brief; when the catalog has no excellent answer, a
designer authors the benchmark graphic. It establishes what excellent broadcast work in NoaCG
looks like, not merely what another model can do. Its code and screenshots are withheld from the
model's prompt, retrieval and training data for that scored item. All output galleries are blinded
and shuffled.

Frontier parity is useful evidence, but it is not the real finish line. If the frontier arm is
mediocre on a brief, matching it does not pass. Human-authored anchors calibrate an absolute premium
quality band, and the open system must enter that band as well as remain competitive with frontier
models.

### 8.3 Human judgement

At least three independent reviewers with broadcast-design competence rate each joined item. The
panel is the owner plus reviewers recruited from the teaching cohort and the broadcast community;
recruiting and onboarding them is Phase 2 work, not an afterthought - a gate that cannot staff
its panel gets silently weakened, which is worse than an honestly smaller gate. The
degraded-panel rule is predeclared: two reviewers produce a provisional verdict that cannot pass
a release gate; a single reviewer only triages. The primary question is: **would you take this
graphic to air after entering content and brand, without redesigning it?** Supporting reads
cover:

- brief and field correctness;
- premium visual quality and originality;
- typography and information hierarchy;
- composition and production placement;
- brand and logo handling;
- motion quality and state continuity;
- code/editability sampling after the visual verdict.

Reviewers see the rendered result and behavior before machine findings or model identity. Ties are
allowed. Disagreements are retained, not forced into consensus.

### 8.4 Release gates

Lower-third Pro does not enter product beta until all are true on the locked holdout:

- 100% export-valid, field-operable and control-operable results among accepted outputs;
- zero known baked-text ghosts, missing requested assets, visible upscaling, stretch, off-canvas
  placement or unresolved critical visible defect confirmed from the rendered output;
- at least 90% of supported holdout briefs return an accepted candidate without a manual repair,
  manual selection or user-triggered rerun;
- at least 95% accepted outputs judged airable after content and brand entry;
- human ratings reach the predeclared premium band calibrated by the excellent human-authored
  anchors; frontier parity alone cannot satisfy this gate;
- blind preference is statistically non-inferior to the frontier baseline within a predeclared
  five-percentage-point margin, with no material loss in motion or editability;
- it materially beats adapt-first on distinctiveness without losing adapt-first's correctness;
- cost, latency, failure and retry distributions are published with the result.

If a round misses, the failure taxonomy decides the next change. Re-rolling the same model and
calling the better sample progress is not allowed.

### 8.5 Ablations

Every major mechanism must earn its complexity. The harness compares:

- direct open code with the scaffold vs the same path plus the minimal plan;
- no exemplars vs complete-exemplar retrieval;
- complete exemplars vs exemplars plus a tiny unit set, only if a measured limitation justifies
  testing units;
- no critic vs critic only vs critic plus repair;
- one candidate vs best of two;
- base open checkpoint vs later specialist fine-tune.

An ablation uses identical briefs and pinned routes. Humans read the rendered graphics before the
machine explanation. A component that does not improve blind airability, correctness or useful
set-level diversity is removed rather than defended by theory. Exemplar similarity is reported as
a copying/provenance alarm, never optimized as a general quality or novelty objective.

---

## 9. Delivery plan and stopping gates

No phase is scheduled by optimism. Each begins only when the prior phase's artifact and gate are
complete. Each expensive or architectural assumption is preceded by the cheapest experiment that
can falsify it. Work remains bench-only until Phase 5.

### Phase 0 - small open-model go/no-go spike

**Build:** only the thin experiment in section 0: the zero-token control run, the 12-brief
lower-third bank, one or at most two strong open-weight checkpoints, the existing neutral
scaffold, paired exemplar/no-exemplar arms with two or three hand-vetted complete exemplars, the
shared repair loop, production validator, Chromium renderer with virtual-clock motion capture,
fixtures and the anchor-mixed review gallery. No plan schema, critic, unit corpus, tournament or
product path.

**Gate:** the control run renders correctly first; then humans inspect every rendered hold and
motion sample before reading machine verdicts. The go/no-go rule is exactly section 0.3.

**Stop if:** the model lacks visible hierarchy, proportion, composition or variety, or promising
frames need redesign rather than localized repair. Archive the evidence and spend nothing on later
phases until the underlying model capability materially changes.

### Phase 1 - minimal production spine and intent contract

**Build:** harden the existing scaffold boundary, final-canvas placement and safe creative regions.
Add only the minimal `BroadcastDesignPlan` properties in section 4, normalized into existing
`blocks`, state-machine, control and validation systems. Do not put a compiler in React and do not
persist the plan.

**Gate:** human-authored reference graphics and the promising spike cases compile to readable code,
survive editing/export, update every field, run every state/control, pass long/empty/non-Latin
cases, and match their approved 1920x1080 renders. No root scaling or visible asset upscale occurs.
Humans confirm the minimal plan did not flatten the visual expression that passed Phase 0.

**Stop if:** the contract needs DOM/layer/component descriptions, arbitrary-JS escape hatches or
becomes a second editor model. Remove unnecessary fields before adding more.

### Phase 2 - formal evaluation contract and human quality anchors

**Build:** the rubric, development bank, locked holdout process, fixture manifest, human review
form, cost ledger, excellent human-authored NoaCG anchors and frontier/adapt procedures - and the
reviewer panel itself, recruited from the teaching cohort and broadcast community per section 8.3.
Reclassify the existing paid Pro rounds as historical reconstruction evidence, not baselines for
the new architecture.

**Gate:** a dry run reproduces shuffled galleries, joins machine and human results, detects seeded
defects, prevents holdout leakage and calibrates the premium rating band against the human anchors.
No model spend is needed for the dry run.

**Stop if:** quality cannot be defined independently of model identity, the anchors are not
actually excellent, or reviewers cannot agree enough to support a useful decision.

### Phase 3 - robust open author and complete-exemplar retrieval

**Build:** the bench-only planner/coder/repair contracts, open-checkpoint tournament and
fixture-saving harness. Integrate two or three complete exemplars through the existing retrieval
path. Start with one candidate and deterministic repairs only so failure ownership stays clear.

**Gate:** on the development bank, the best open route produces a high majority of structurally
valid candidates, human review confirms the code retains the visual capability seen in Phase 0,
and the no-exemplar vs complete-exemplar ablation shows whether retrieval earns its place. Source
similarity catches copying but does not reward arbitrary visual distance.

**Stop if:** no available open checkpoint can follow the bounded contracts, complete examples
cause copying without a quality gain, or visual quality regresses behind the cheap spike. Keep the
evidence and revisit later rather than weakening SPX safety.

### Phase 4 - visual repair, conditional units and frontier comparison

**Build:** state contact sheets, deterministic visual measurements, a calibrated separate open
critic, bounded repair and optional best of two. Seed a defect suite containing the exact
historical failures: baked text, duplicate fields, wrong scale, lost logo/portrait, mismatched
masks, bad paint order, unsafe placement and overflow.

Only if complete-exemplar retrieval exposes a specific measured limitation, run the tiny design-
unit ablation in section 5.3. Do not build the unit architecture otherwise.

**Gate:** deterministic checks establish correctness, the critic shows useful localized defect
recall, and humans confirm that its repairs improve blind airability without more regressions. The
locked comparison meets section 8.4 against human-authored, open, frontier and adapt-first arms.

**Stop if:** critic and creator reward each other's artifacts while humans do not, repair success
depends on more than two rounds, or units reduce coherence. Critic scores never rescue a result
humans judge poor.

### Phase 5 - product beta

**Build:** Pro behind the existing Create with AI tier picker, using the shared gateway, telemetry,
entitlement and BYO/self-host paths. The user sees generation, render, inspection and repair status;
the accepted result enters the normal editor/export flow. A critical gate failure returns no result
and a specific reason. There is no concept-image card or separate Pro editor.

**Gate:** focused E2E, production SPX/CasparCG/OBS walkthroughs, build and CI; operational limits
cover concurrency, timeout, model unavailability and cost. The beta predeclares a
generation-to-accepted latency budget taken from Phase 3/4 measurements rather than discovering
it in production. No closed fallback exists.

**Stop if:** hosting economics require hiding the real price, or product behavior differs from the
bench harness that earned the quality claim.

### Phase 6 - fine-tune the specialist

This is mechanism 5 and deliberately comes last.

**Entry gate:** start fine-tuning when the data, not a calendar or magic count, shows that a
specialist can learn something reusable. Provenance must be complete; accepted and rejected traces
must cover the supported brief, style, field, motion and failure variation; family-disjoint
holdouts must exist; and a small diagnostic adapter must show a real learning curve rather than
memorization.

For planning and capacity estimates, expect roughly 500-1,000 de-duplicated human-reviewed accepted
traces and 1,000-2,000 localized repair or rejection examples before a serious deployment attempt.
Those are estimates, not thresholds. A diverse, high-signal corpus may justify an earlier pilot; a
larger repetitive corpus may still be inadequate. No count by itself authorizes promotion.

**Dataset record:** brief, structured fields, brand and asset metadata, retrieved complete-
exemplar ids and any optional unit ids, normalized plan, code, all state renders, deterministic
findings, critic findings, human ratings, rejected alternatives and successful repairs. Customer
content is excluded unless explicitly opted in and suitable for that use.

**Training sequence:**

1. supervised fine-tuning for brief + retrieval -> plan and plan + scaffold -> creative code;
2. a repair curriculum using real failures plus deterministic adversarial mutations;
3. preference training from blinded accepted/rejected pairs;
4. a separately trained or calibrated critic on localized visual findings;
5. quantization and serving optimization only after quality parity.

The planner/coder and critic do not need to be one model. A smaller specialist wins only if it
beats its untuned base on the locked holdout, preserves critical-defect recall and remains
non-inferior to the frontier baseline, and stays in the premium band calibrated by the human-
authored anchors. If it memorizes catalog families, loses diversity or merely optimizes machine
gates, the strongest base open route stays in service.

---

## 10. Cost, hosting and operations

The retired pipeline's roughly $1 per 12-brief round was dominated by image generation. This plan
removes that image call, but it does **not** promise that a frontier-scale open checkpoint with two
candidates and repairs is immediately cheaper. Open weights remove provider dependence, not GPU
cost.

The operating policy is:

- the Phase 0 spike is one or at most two pinned checkpoints, one candidate per brief and arm,
  the 12-brief bank in paired exemplar/no-exemplar arms and the existing two-round deterministic
  repair ceiling; no critic, model tournament or frontier arm is paid for first;
- human inspection of those rendered outputs decides whether later investment exists at all;
- after a go decision, quality selects the first viable route;
- every run records tokens, GPU/provider time, candidates, repair rounds, failures and cost per
  accepted output;
- one candidate and two repairs are hard defaults until an ablation authorizes more;
- paid evaluations and new hosted-model rounds require explicit owner approval with a stated cap;
- development may use a hosted open-weight checkpoint; the architecture must also support
  self-hosting the pinned weights;
- BYO/self-host is the first product funding posture unless a managed allowance is explicitly
  costed through the task registry - **done 2026-08-14**: `pro-generate` is a registered task
  with a reservation ledger, a per-generation ceiling booked server-side, and a small default
  quota (`docs/AI_TASK_REGISTRY.md`). It ships switched OFF (`AI_PRO_ENABLED`), so turning it
  on is a decision made against the measured $0.0777 rather than a deployment side effect. The
  route is deliberately engine-agnostic and does not have to change when §15's Phase A replaces
  the pipeline;
- no model is needed at playback or export time;
- the later smaller specialist, prompt-prefix caching and batching are cost optimizations only
  after quality is secure.

The product price is set from measured accepted-output cost after Phase 4, not invented in this
plan. A cheap output that cannot go to air has infinite effective cost.

---

## 11. Security, licensing and provenance

- Generated templates run through the existing safety and asset-integrity screens and in the
  existing sandboxed preview/export posture.
- Creative code cannot fetch remote scripts, fonts, images or data. URLs and unsupported browser
  capabilities are rejected.
- Brief text, retrieved source comments and rendered text are data, never instructions.
- Checkpoint license, training-data terms and hosting terms are reviewed and recorded before a
  route is allowed into a paid or product round.
- Every complete exemplar, and every later unit if units earn a place, has source and license
  provenance. Restricted real-world corpora may inform measurements but cannot become training or
  retrieval data unless their terms permit it.
- Generated traces retain model, minimal-plan, exemplar-corpus and compiler versions so a result
  is auditable.
- User assets and private customer graphics are not used for training by default.

---

## 12. Principal risks and planned falsification

| risk | how it is tested | response |
| --- | --- | --- |
| Harness bug reads as model failure | zero-token control run of a known-good template through the wrapper, rerun after wrapper changes | fix the harness before spending; a round judged on a broken wrapper is void |
| Spike passes on transfer, not taste | paired exemplar/no-exemplar arms in Phase 0 | treat as ambiguous, probe the second checkpoint; copied coherence is not visual signal |
| Open coder follows syntax but lacks taste | Phase 0 rendered spike | stop before building the specialist; revisit only for a materially stronger checkpoint or specific new hypothesis |
| Minimal plan is too weak | rendered human references and plan/no-plan ablation | add only the observed relationship NoaCG must compile; no arbitrary-JS escape hatch |
| Minimal plan becomes a hidden scene model | round-trip and editor-source review | delete visual-description fields; edits after generation operate on code |
| Complete exemplars cause sameness | exemplar/family concentration plus human review | improve the relevant shortlist first; test small units only if this measured limitation remains |
| Optional units cause collage | paired unit ablation and coherence ratings | do not build or keep unit architecture unless humans see a material gain |
| Similarity metric punishes good conventional design | compare flags against human provenance decisions | use similarity to catch copying, never as a novelty target |
| Critic misses obvious failures | seeded-defect recall | keep deterministic/image-diff tripwires, require human confirmation and remove the critic if its recall stays weak |
| Critic and creator agree on bad work | separate checkpoints plus blinded human labels | treat same-model review as self-critique; recalibrate or remove the critic; human verdict remains authoritative |
| Repair chases its tail | per-round finding and metric deltas | stop at two; reject no-improvement candidates |
| Motion looks correct only at hold | entrance/update/next/exit contact sheet and video review | category motion bank and state-derived capture set |
| Long or non-Latin text breaks hierarchy | adversarial field drive | platform fit/capacity gate; reject unsupported plans |
| Largest open model is uneconomic | accepted-output cost and throughput | fine-tune/distill a smaller specialist after data exists; BYO/self-host first |
| Fine-tune starts on a large but weak corpus | provenance, coverage and learning curves | treat counts as estimates; wait for diverse evidence and keep the base fallback |
| Fine-tune memorizes the catalog | family-disjoint holdout and retrieval-disabled ablation | de-duplicate, diversify, preference-train and keep base fallback |
| Bench quality does not survive product integration | identical fixture/replay path in product and bench | do not ship a separate product implementation |

---

## 13. What happens to the old Pro experiment

This document replaces its strategy immediately; it does not authorize code deletion in this
planning slice.

When implementation begins:

1. mark the raster reconstruction route retired in the AI area contract and attempt record;
2. keep its paid round folders immutable as evidence;
3. reuse generic gateway, telemetry, fixture and validation infrastructure only where it fits the
   new contracts;
4. remove Pro-specific concept, interpretation and reconstruction code once no test or migration
   needs it;
5. update `docs/GOALS.md`, `src/ai/AGENTS.md`, architecture edges and task registry in the same
   implementation phase that changes their live truth;
6. preserve the standard Create with AI entry and ordinary editor/export destination.

No new work or spend should improve the retired reconstruction path. Until Phase 5 replaces the
backend, the existing Pro tier entry in Create with AI stays as it is today; whether to relabel
or hide it earlier is an owner product decision recorded outside this plan.

---

## 14. First implementation slice - DONE 2026-08-12; what Phase 1 inherits

**Phase 0 ran and the owner's verdict was GO** (the banner in section 0). The wrapper is
`src/ai/spike/` + `scripts/pro-spike.mjs` + `scripts/spike-checkpoint-probe.mjs`, bench-only and
fenced off from the app by `.dependency-cruiser.cjs`. Phase 1 begins with three things owed from
this round, and one decision it should make early:

0a. **THE CODE IS THE DELIVERABLE, AND IT IS AN EVALUATION AXIS** (owner, 2026-08-12). Phase 0
   judged rendered frames alone and did not keep the emitted HTML/CSS/JS at all, which is backwards
   for a product whose artifact IS an HTML template: the frame is a derivative of the code, the
   code is what a user edits, exports and puts on air, and **code quality is part of choosing a
   winner, not a follow-up check.** Every round from here saves
   `code/<brief>.<arm>/{index.html,template.css,template.js}` (already implemented), the review
   reads the code beside the frames, and the ledger records what the code is like - not merely
   whether it validated. Concretely, the house contract in `src/ai/AGENTS.md` already names what
   good looks like and is what to score against: the `:root` variable contract with zero hardcoded
   colours elsewhere, every pixel size through `calc(N * var(--scale))`, the structure spine, the
   marked ANIMATION region in the authoring grammar, and simple readable ES5 with comments that
   explain WHY. A generation that renders beautifully and emits unreadable or uneditable code has
   failed the product, and Phase 0 could not have told the difference.

0. **THE PREMISE TEST COMES FIRST: brand, not generic quality** (owner, 2026-08-12). Phase 0 asked
   whether a strong open checkpoint can design a broadcast lower third. It can. But every brief in
   the bank is generic - no brand palette, no brand typeface, no real mark - so the round never
   asked whether it can design **this customer's** graphic, and the owner's reading of the output
   was that it looks like something the free template gallery could carry. That reading is correct
   and it is the whole problem: **adapt-first already delivers catalog-grade generic graphics for a
   fraction of a cent, so a paid Pro generation earns nothing by matching it.** Pro's premise is
   originality conditioned on a customer's own brand, and that has not been measured once.
   The next round is the same 12 briefs carrying a real mark (shape/backing/ink via
   `assets/assetInfo.ts` `probeMark`), a brand palette and a brand typeface, measuring two things:
   brand FIDELITY (mark placed legibly and unaltered, palette driving the design rather than
   decorating it) and brand-driven DIVERGENCE (different brands, same brief, visibly different
   graphics - the sameness tripwire adapt-first already lives under). On the chosen checkpoint that
   round costs about $0.26. Item 1 below is a precondition for it, not a parallel task.
   **RAN 2026-08-13: 30/30 for $0.63, owner-read blind. Verdict and the named follow-ups (the
   mark-surface "bounding box" defect, the catalog side-slot, animated motion review - the last
   of those BUILT 2026-08-13: every strip is also a looping real-speed webm in the blind gallery,
   the five stills and the mark-motion gate untouched) are the
   top entry of `docs/AI_ATTEMPTS.md`; archive `pro-brand-qwen3-coder-2026-08-13`. No four-tints
   sameness appeared; the exemplar arm's 12/12 editable timelines vs the no-exemplar arm's 0/18
   is the first measured evidence for the exemplar block.**

1. **The logo contract is the named gap and the first real work.** The owner's own words: find a
   structure and plan for how a mark is placed so it fits the design, and how it animates
   meaningfully. The Lite side already solved the placement half in a shape worth copying rather
   than reinventing - **the design declares the slot and the compiler fills it; the model never
   places the mark** - with the declaration gated against a rendered measurement
   (`LiteCatalogEntry.logoSlot`, `scripts/ai-lite-brand-audit.mjs --check`, `docs/AI_LITE_PLAN.md`
   §7). A GENERATED design has no catalog slot to declare, so the equivalent contract for authored
   graphics is genuinely new, and the MOTION half has no precedent anywhere in the repo.

   **BUILT 2026-08-13 (`src/ai/spike/brand.ts`), and the brand-round harness with it.** The
   contract as shipped: the DECLARATION is part of the emitted design - one `filelist` field bound
   to an empty `<img id="fN">` whose geometry and surface are the model's decisions, taught with
   the mark's measured shape/backing/ink (`probeMark`, Lite's own vocabulary); the FILL is
   deterministic (`fillBrandMark`, the fillProLogoSlot recipe, inside the ground step so repair
   rounds re-validate a FILLED template with the as-is screen armed); the GATE is a rendered
   measurement (`measureRenderedMark`, the Lite brand audit's thresholds); the MOTION half samples
   the slot through the virtual clock (`markMotionState` - "did it move" is measured, "was it
   meaningful" stays the §0.2 human read). Beside it: the synthetic brand fixture
   (`benchmarks/pro/v1/spike/brands.json` + four measured marks), the divergence cell, the
   alignment-axis instrument calibrated over all 90 catalog lower thirds
   (`src/ai/spike/axisCheck.ts` + `benchmarks/pro/v1/spike/axis-calibration.json`: 3/90 base rate,
   text pairs flagged only when aligned on NO side), and the per-generation code audit
   (`scripts/spike-code-audit.mjs`, item 0a's countable half). Zero-token control green including
   a mark-fill control (`control-mark`: the kestrel wordmark filled into lt11's shared band and
   measured CLEAN). The paid round itself still needs the owner's explicit OK with a stated cap.

   **THE SURFACE HALF, ATTEMPTED STRUCTURALLY (owner decision 2026-08-13: "take it structurally
   like Lite"). The DECISION shipped; the DRAWING is blocked on placement, which is a product
   call.** `decideMarkSurface` now answers, deterministically and with no rendering, whether the
   design's own panel carries this mark's ink: an own-field mark never needs a surface, and a
   transparent one is compared against the design's declared `--panel-bg` - composited over black
   AND white where the panel is translucent, evaluated at every stop where it is a gradient, worst
   case wins. Which neutral a field would use is computed rather than assumed from "light ink" or
   "dark ink", because the mid-tone case breaks that assumption (the sunbeam roundel at 0.49 reads
   at 1.8:1 on the light neutral and 9.4:1 on the dark one). Measured over the ablation round's 15
   generations it fires on exactly the three the rendered gate flags for `ink-contrast` - the
   measurement and the need agree, and every record now carries the answer.
   **DRAWING the field failed twice, and both failures say the same thing.** A wrapper using
   `align-self: stretch` computed to `stretch` and was used at the mark's own height (the slot
   sits in the design's own flex container and the mark's `height: 100%` makes the cross size
   circular), so it hugged the mark - the defect it exists to remove - and its padding took two
   marks under the minimum legible size. A `display: contents` wrapper painting a bleeding
   `::before` kept every mark's size exactly and painted the band across the middle of the panel,
   over the text, because a pseudo-element with no box of its own resolves against whatever
   ancestor happens to be positioned; the rendered gate cannot see a pseudo-element either.
   **A surface can only be "a band of the composition" if the platform knows the composition.**
   Lite draws one because Lite owns PLACEMENT too - `applyLogoSlot` puts the mark in a grid column
   of a box it controls. **So the platform took placement (owner, same day) and the defect class
   closed.** The model declares the slot; the fill moves that `<img>` into a leading column of the
   box at the catalog's audited size, and because the column is a grid item the platform owns,
   `align-self: stretch` gives the mark's surface the full height of the text stack - a band, not
   a plate. Over the ablation round's 15 saved generations: clean 4 → **13**, not-painted 5 → 0,
   bounding-box-well 10 → 1, ink-contrast 3 → 0, and the mark still disappears when the operator
   clears the field on all 15. A design that already declares `.{prefix}-box.has-image` keeps its
   own placement - that is the catalog slot's signature, and the control caught the one commit
   where the platform laid its grid over the catalog's. What stays the model's: whether the
   composition leads with the mark or leans on the text, the panel's air, what the mark sits
   beside. What is now ours: the seat and what its ink reads against.

   **MEASURED WHOLE ON FRESH GENERATIONS, 2026-08-13 ($0.083, archive
   `pro-seated-round-qwen3-coder-2026-08-13`): 12/12 captured, 12/12 contract-clean, 12/12 seated,
   10/12 marks CLEAN, none unpainted, no contrast failures.** Across the three grammar-arm rounds
   on the same briefs and brands: clean marks 2/12 → 8/11 (teaching) → 10/12 (teaching + seat),
   unpainted 5 → 0, contrast failures 2 → 0. Item 1 is closed; the mark contract is a contract
   rather than an instruction. Editable timelines stayed 0/12, which is the grammar arm's own
   number and the exemplar ablation's business, not this one's.

   **WHERE THE CONTRACT STANDS AFTER THE 2026-08-13 ABLATION, and the one decision it now needs.**
   Two halves are settled and structural: the FILL guarantees a filled mark PAINTS (it stamps
   `has-image` on the root and the box and appends a scoped display rule, after 5 of 12 marks in
   that round never appeared - the designs hid their own `<img>` and their un-hide rule was keyed
   at the wrong level, following a prompt line that points at an example carrying no image field),
   and the MOTION half reads. **The SURFACE half is not settled and prose has not moved it:** the
   well-integration teaching was written after the brand round and measured on the ablation, and
   the boxed rate is 8/12 taught against 9/18 untaught - flat to worse, once the invisible marks
   are repaired and can be judged at all. **The decision owed is who owns the mark's surface.**
   Teaching it again is the option already tried twice. The alternative is the shape the rest of
   this contract already uses and Lite proved: the design declares the slot, the PLATFORM decides
   what the mark sits on, and the model never draws that surface - the only version of the rule
   that cannot be got wrong. Full measurement: `docs/AI_ATTEMPTS.md` top entry.
2. **The checkpoint is decided: `alibaba/qwen3-coder`** (owner, 2026-08-12), on a read of both
   galleries - better AND ~19x cheaper, 24/24 complete and contract-clean where kimi-k3 reached
   21/24 and could not finish three exemplar-arm briefs at all.
3. **Decide whether the exemplar block survives. DECIDED 2026-08-13: IT SURVIVES.** It costs
   ~34,500 tokens per call - about 80% of the round's spend - and on the pair the owner examined it
   produced a result indistinguishable from showing no exemplars at all. Section 5 treats
   complete-exemplar retrieval as a pillar, so the ablation was owed before Phase 3 built on it.
   **It ran for $0.215 of a $0.40 cap** (`pro-exemplar-ablation-qwen3-coder-2026-08-13`): the same
   12 briefs with a ~480-token region lesson in the block's slot (`src/ai/spike/grammar.ts`, the
   `grammar` arm) returned **1 of 12 editable timelines against the exemplar arm's 12 of 12**, and
   three exemplar re-runs reproduced the stored arm exactly on that axis, so the comparison is
   against a live arm. A worked example of the region conforms; a description of one does not, and
   the explicit "do not hand-write `NOACG_ANIM`" changed the rate of that behaviour by nothing.
   Full record: `docs/AI_ATTEMPTS.md` top entry.

**Four harness faults cost roughly $5 of the round's ~$16**, every one of them a case of the rig
measuring itself: a probe that asked a smaller question than the round, an output budget pinned
from that undersized probe, retries disabled on reasoning that did not survive the actual failure
mode, and a free control run that overwrote the paid ledger the cost ceiling counts from. All are
fixed and commented where they happened. The transferable rule is the one already in
`src/ai/AGENTS.md` about gates: **a bench that measures a smaller question than the round is not a
cheaper bench, it is a wrong one.**

---

The original scope, kept for the record: build
the thin bench wrapper, prove it with the zero-token control run, select one or two strong
open-weight checkpoints through a license/capability preflight, render the 12-brief bank in
paired exemplar/no-exemplar arms with the existing scaffold, validator and repair loop, and
inspect every result by eye against blind-mixed anchors. It changes no product path. Its model
spend still requires an explicit owner OK with a stated cap (estimated $5-15, section 0.3)
before the round runs.

Only a positive human go/no-go verdict unlocks Phase 1 - **given 2026-08-12**. The minimal plan and
every later mechanism must still earn its place through rendered evidence. This ordering was
intentional and it paid: falsify model taste before funding infrastructure, and never let
infrastructure's own scores certify the visual work it exists to improve. This round is the
argument for the second half of that sentence - every deterministic gate passed the frame with a
broken brand mark in it, and a human found it in seconds.

## 15. What Pro is FOR - the 2026-08-14 reckoning, and the plan that follows

Written after the third owner blind read in two days, at the owner's request: *"we are doing
minor changes to these graphics… we need to broaden our repertoire… we need a system where it
can reliably create all the graphics based on some rules, rather than us giving feedback to each
graphic."* That reaction is correct and the measurements agree with it, so this section replaces
optimism with what three rounds actually showed.

### 15.1 Where three rounds got us

| round | airable (owner) | what changed |
| --- | --- | --- |
| brand round (2026-08-13) | 14/30 | first brand conditioning |
| seated round | 6/12 | platform seats the mark |
| instruments round | **7/12** | spacing + proportion reporting |

**Airable moved 6 → 7 of 12 while three separate pieces of machinery were built.** The machinery
worked on its own terms - clean marks went 2/12 → 11/12, contract failures went to zero, every
mark is seated - but the owner's verdict barely moved, because the failures left over are not
the ones any of it addressed.

### 15.2 The five failures decompose into ONE thing

Every failed item in the instruments round is a PANEL-LAYOUT decision:

- text sitting on the design's own rule (2 items - the instruments catch these)
- text overflowing the panel onto the picture (1 - **the instrument reported roomy padding**,
  because it measures from children CONTAINED by the panel and silently drops anything that
  escapes; the worst case reads as the most comfortable)
- a composition stranding the text in a corner with the frame mostly empty (1 - nothing measures
  composition)
- furniture around the mark inflating the whole graphic (1)

**Not one failure was colour, typography, motion, or brand fidelity.** Those are working: the
palettes drive, the divergence cell shows four brands producing genuinely different designs, the
marks are clean. What is failing is the model composing a panel - and it has failed at roughly
the same rate through three rounds of teaching, measuring and repair.

Meanwhile the adapt-first anchors pass the owner's eye every single round, dismissed as "template
graphic", **because nothing on that path composes a panel at all.**

### 15.3 The one intervention that has ever moved a rate

Ranked by what actually happened (docs/DESIGN_PRINCIPLES.md carries the general form):

| approach | measured effect |
| --- | --- |
| ask the model to exercise judgement | none (9/18 → 8/12) |
| state a boundary | large (2/12 → 8/11) |
| **remove the decision** | **largest (→ 10/12), and it stays removed** |

Three rounds of evidence say the same thing the mark contract said: a defect class ends when the
platform owns the decision, not when the model is told about it.

### 15.4 So what is Pro FOR?

Lite is catalog-grounded, free, one graphic, about $0.0003 a generation, and its open problem is
SAMENESS. Pro costs real money and has to be worth it. Three candidate answers, scored against
what is measured rather than hoped:

1. **"The model composes an original graphic."** This is the current premise and it is the one
   failing. 5 of 12 still fail on layout after three rounds. It is also the answer that competes
   most directly with adapt-first, which already delivers catalog-grade output for a fraction of
   a cent - so even when it works it earns little.
2. **"The model designs for THIS customer's brand."** Measured and working: brand-conditioned
   palettes, typefaces and a real mark, with genuine divergence between brands. Lite cannot do
   this at depth - it carries a logo and a palette onto a fixed chassis.
3. **"The model designs a brand's on-air LOOK, and the platform builds every graphic in it."**
   Not attempted. A channel does not need one lower third; it needs a lower third, an info card,
   a ticker, a scoreboard and a holding screen that visibly belong to each other. The catalog
   already enforces sibling consistency through the project brand and the style families, and the
   type registry already carries 22 graphic types with their structure declared.

**The recommendation is 3, built on 2, and it retires 1.** Pro stops being "a model draws a
panel" and becomes "a model decides a design language, the platform renders that language across
every graphic type the show needs". That plays to what is measured to work, avoids what is
measured to fail, and is a thing Lite structurally cannot do - which is the only honest basis for
charging for it.

### 15.5 The plan

**Phase A - take the panel.** The platform owns each graphic type's structure and spacing; the
model supplies the design LANGUAGE as parameters (palette, type scale and weight, shape and
corner language, accent form and weight, density, motion character). This is `applyLogoSlot` and
`fillBrandMark` generalised from the mark to the whole composition, and it kills all five
remaining failure modes by construction rather than by inspection. The measurable claim: layout
failures go to zero and the round's verdict becomes a judgement about the LOOK.

**BUILT 2026-08-15, bench-only, no model call wired to a user** (`src/ai/pro/language/`, and
src/ai/AGENTS.md for the four rules that bind it). What the shape of it buys:

- **`contract.ts` carries no number the model can get wrong**, because it asks for none: enums,
  four hex colours and a bundled font id (read from the font registry, never transcribed). A
  geometry field here would be a panel decision under a different name. `normalizeDesignLanguage`
  never fails and never invents - every field is a value the schema offered or the house value -
  and `languageFallbacks` records which fields fell back, so a round can see a language that was
  mostly ours.
- **`structure.ts` composes in the units the instruments measure in.** Every size is a ratio of
  the primary type size, so each calibrated threshold can be stated as a margin rather than
  inspected for. **The numbers below were DERIVED when this was written and are now MEASURED -
  §18, and nine of the eleven moved.** Rendered over 582 compositions: tightest padding **0.33**
  against a 0.28 floor, opposite sides equal in every declaration (**1.00** rendered, 1.06 worst
  under one typeface, against a 2.6x limit), widest line gap **1.20** against a 1.4 ceiling,
  nearest rule **0.14** against a 0.02-0.12 crowding band, mark **1.56** type sizes against a 3.2
  ceiling - and footprint **0.14 against a 0.10 ceiling at the stress words, which breaches it**.
  Composing in the instrument's unit is what makes the margins knowable in one free sweep; it is
  not what makes them clear, and §18.3 is the one that is not.
- **`compose.ts` builds through the catalog's own assembler.** A Phase A graphic is an ordinary
  `TemplateVariant`, so it inherits the `:root` contract, the NOACG_ANIM region, the SPX
  definition, the shared logo slot, exports - and the auto-fit `width: fit-content` box, **which
  is why text cannot escape its panel: the panel is sized by its text.** §16 is the argument for
  routing through the assembler rather than authoring a document: Pro's own reconstruction lost a
  panel that was good.
- **`stub.ts` + `languageAnchors` are the zero-token control**, four deliberately far-apart
  languages through the identical function a model answer takes, measured on the free pass of
  `node scripts/pro-spike.mjs --control`.

**What the control run measured (2026-08-15, zero tokens), after two rounds of fixes it paid for
itself:**

| language | padding (T/R/B/L, type sizes) | type ratio | fill | footprint | findings |
| --- | --- | --- | --- | --- | --- |
| Harbour Nightly (solid, edge-bar, mark seated) | 0.46 / 0.61 / 0.46 / 0.61 | 0.48 | 0.62 | 0.06 | none |
| Volt Matchday (solid, accent block, compact) | 0.33 / 0.46 / 0.33 / 0.46 | 0.35 | 0.65 | 0.03 | none |
| Alder Quiet (no panel, underline, airy) | - (no panel by design) | 0.61 | - | - | none |
| Sunbeam Daytime (blurred, top rule, airy) | 0.61 / 0.85 / 0.61 / 0.85 | 0.48 | 0.57 | 0.06 | none |

Spacing, proportion AND alignment clean on all four, and the stress hold wraps inside the panel
rather than escaping it. **The control earned its keep three times over**, which is the argument
for running it before buying anything: it caught an accent rule that was INVISIBLE on two
languages (an empty div in a flex column has no width), a supporting line pushed 8px off the
primary line's axis by its own block's inset, and then - after the obvious repair - the same
near-miss moved onto the block's edge. None of the three is a model failure and all three would
have been read as one in a paid round.

Still owed before a paid round: the `--language` arm in the runner, and the calibration re-sweep
§15.6 names.

**Phase B - broaden the repertoire.** New brief banks per graphic type, starting with the ones a
show cannot go on air without. The type registry supplies the structure, so each new type costs a
brief bank and a calibration sweep rather than a new pipeline. **BUILT 2026-08-16 - see §15.9.**

**Phase C - package coherence.** One design language, N graphic types, judged as a SET. The
sibling rule the catalog already lives under becomes Pro's headline feature and its own gate.

**Throughout, the loop that replaces per-graphic feedback:** a blind read names a defect CLASS →
it becomes a removed decision or a measurement → the round reports a RATE → the next blind read
hunts only for NEW classes. Per-graphic feedback is the discovery mechanism; it was never meant
to be the fix mechanism, and this section exists because we ran it as one for three rounds.

### 15.6 Owed before Phase A

- **The panel-overflow bug - DONE.** `spacingCheck` counted only the children a panel
  geometrically CONTAINED, so a name hanging off the edge was not the panel's content at all: it
  was dropped from the union, the children that stayed home were measured against the far edge,
  and the worst overflow of the round reported the roomiest padding. Membership is now answered
  by the DOM as well as by geometry (`panelMembers`, shared with `proportionCheck`, whose panel
  FILL carried the identical blindness), every member's overflow is recorded per side, and live
  text outside its panel raises `text-escapes-panel`. Two things keep it honest: measurements now
  use the VISUAL rect - clipped down by every ancestor that hides its overflow - so text cut off
  inside a mask is not reported as text on the picture; and a DECORATIVE member running past the
  edge is recorded without a finding, because a bleed is a composition and an instrument that
  fails one teaches designs to be timid. `e2e/spike-instruments.spec.ts` pins all four cases and
  each was mutation-checked against the code it guards.
- **The seated-mark control - DONE, and it was the SEAT rather than the control.** The owner's
  three observations ("name in the top right, logo centred, empty space underneath") are one bug:
  the platform's mark slot spanned a fixed `grid-row: 1 / span 9` so the mark would centre against
  any design's text stack, and **nine rows means eight ROW GAPS**. A box that declares `gap: 20px`
  for its two text rows therefore got 160px of empty grid beneath them - the mark centred over the
  void, the words pushed to the top, and the panel a third taller than its content. Measured, not
  inferred: `gridTemplateRows` came back `41.8px 24px 0px 0px 0px 0px 0px 0px 0px` with the field
  225.8px tall, and the spacing instrument read a 4.38x top-to-bottom imbalance
  (`padding-lopsided`). `placeMark` now COUNTS the rows the text occupies and the slot spans
  exactly those. After: padding 0.63 top / 0.63 bottom, no findings, footprint 0.08 → 0.04.
  Pinned by `e2e/spike-instruments.spec.ts`, which asserts both the span and the symmetry.
  **The same CSS shipped on every seated generation of the 2026-08-13 round**, which is worth
  remembering when reading that round's verdict.
- **The calibration re-sweep - DONE, and the change is INERT on the shipped catalog.** Both
  sweeps over all 90 lower thirds, compared against the committed fixtures rather than against an
  absolute (`findPanel` still resolves for 45 of the 90, so the sweep measures half of what it
  lists - the same figure as before, which is itself part of the answer). Spacing: 1 design
  flagged before, 1 after, the same design and the same code; exactly ONE row moved at all (lt51,
  right padding 1.20 → 1.28); and **not one shipped design reports an escape**. Proportion: byte
  identical, 0 rows moved, every percentile unchanged. The instrument change fires on the defect
  it was built for and on nothing else.

### 15.7 What a Phase A round would cost

DERIVED from measured per-call costs on the same transport, not measured for this pipeline -
the runner arm does not exist yet, so treat this as the estimate a round is authorised against
rather than as a result.

A Phase A generation is **one forced structured text call and nothing else**: roughly 1.5-2k
input tokens (the system prompt, the brief, and a brand block when there is one) for ~300-500
output tokens of enum values. There is no image anywhere in it.

| | 2026-08-10 Pro round | a 12-brief Phase A round |
| --- | --- | --- |
| calls per graphic | 2 (a concept IMAGE + an interpretation) | 1 (text) |
| measured per graphic | $0.0777, of which $0.0671 is the flat-rate image | - |
| estimated per graphic | - | ~$0.001-0.003 on `PRO_STANDARD_ROUTES.interpret`'s own model |
| round total | $1.014569 (12 briefs) | **~$0.02-0.05**, or **~$0.16** on a frontier checkpoint |

The low figure is the interesting one and it is not a rounding artefact: **86% of the old bill
was one fixed charge for a picture the compiler then failed to keep** (§16), and Phase A does not
draw one. That changes what a round IS - a language round is cheap enough to run per checkpoint,
per brand and per brief bank rather than being rationed - and it is the first thing about Pro's
economics that argues for the tier rather than against it.

The estimate's honest limits: it assumes the standard interpret route's pricing, one call with no
retry, and no divergence cell. A four-brand divergence block on two briefs adds six calls (~$0.02).
Nothing here is spent until the `--language` arm exists AND the owner says yes.

### 15.8 The first Phase A round - 2026-08-15

`node scripts/pro-spike.mjs --generate --arms=language --divergence-arm=language
--route=vercel:google/gemini-2.5-flash --max-cost=0.25`. **18 cells - the 12-brief bank under
its assigned brands, plus the two-brief four-brand divergence block - for $0.0983, $0.0055 a
graphic.** Archived at `noacg-lite-eval-archive/pro-language-round-gemini25flash-2026-08-15`
(1281 files, copy proven). The gallery is `pro-lang-round/review.html`; **the human read is
owed and nothing here is a substitute for it.**

What the machine measured, over 18 of 18:

| | result |
| --- | --- |
| contract (scaffold + fields + declared slot) | **18/18**, zero blocking errors |
| runtime errors, repair rounds | **0**, **0** (there is no repair loop on this path) |
| spacing findings | **none** |
| alignment near-misses | **0** |
| text escaping its panel | **0** |
| proportion findings | 1 (`footprint-large`, 0.11 against a 0.10 ceiling, on the long-name brief) |
| fields the model failed to answer legibly | **0** - every language came back complete |
| palette furniture repaired for legibility | 3 (`palette_text_dim_lightness_clamped`) |
| mark unreadable on the language's own panel | 3 (`ink-contrast` / `bench-mark-unreadable`) |

**The layout failure classes §15.2 decomposed did not occur.** That is the phase's measurable
claim and it held, though the honest reading is that it held BY CONSTRUCTION - the platform is
composing, so this measures that the composer works rather than that the model improved.

**The divergence cell answers the sameness question.** The same brief under four brands returned
four different accents, four different typefaces, and different accent forms and densities - not
one look with the colours swapped, which is the named failure (src/ai/AGENTS.md).

**THE OWNER'S BLIND READ: 26 of 30 acceptable** (`pro-lang-round/notes.md`, verbatim). Four named
failures and one legibility note, and **every one of them is the PLATFORM's, not the language's** -
no palette, no typeface, no motion and no composition was called wrong. Ranked by what they buy:

- **The accent BLOCK form failed on both graphics that used it** (2 of 2 - one of them the
  hand-written control): *"black text on an orange background is not so good… the text is very
  small… the orange background should scale with the text length"*. Three faults in one form, all
  fixed by construction: the block now takes `width: fit-content` (the `align-self` it relied on
  is INERT once the shared logo slot gathers the lines into a plain block container, which is why
  a two-letter role sat in a full-width bar); its ink is MEASURED (`readableInkOn` - white or
  black, whichever reads on that accent) instead of being the panel colour, which is a design
  answer to a legibility question; and it carries its own size and weight floors, because a line
  set on a solid slab of the accent is a badge rather than a caption.
- **A thin supporting line is illegible even at full contrast**: *"the title is too thin and small
  for it to be legible"* - 26px regular that measured 4.6:1 and passed every colour check, because
  contrast was never the defect. The supporting weight got a floor that was a FUNCTION OF ITS SIZE
  (medium below 30px), reasoning that small text is read by its stem. **SUPERSEDED 2026-08-21 -
  the size condition was the wrong half of the lesson and §25.8.5 has the measurement**: `medium`
  is now the floor for the heading and the supporting line alike, at every size.
- **An invisible mark reads as an unfinished graphic**: *"has a place for a logo, so it is nice if
  there is a logo. Without one it looks unfinished."* The mark was there; its dark ink had nothing
  to read against on the dark panel the language chose. **This one needs an owner decision - see
  below.**
- **A banner wider than its shortest line** (the mildest note, on a graphic called fine):
  *"a little too much of a banner to the right… should wrap closer around the text"*. The panel is
  sized by its LONGEST line, so a short supporting line leaves a void under it. Measurable as a
  void ratio (panel area no line covers) rather than by the padding, which was 0.46 and healthy.
  Recorded, not fixed.
- **Not a defect, by the owner's own ruling**: the mark shrinking under stress text. *"If it is
  actually so long then that is what we live with."*

**THE MARK DECISION - ANSWERED BY A FREE A/B, AND THE ANSWER IS "THE TRIGGER, NOT THE POLICY".**
`markFieldFor` + `markFieldCss` are built and DEFAULT OFF, and the same three flagged cells were
re-composed from their saved `language.json` with the field off and on, for zero tokens
(`scripts/.mark-field-ab.mjs`, throwaway). What that showed:

| cell | mark ink on its panel | with the field |
| --- | --- | --- |
| the institutional MONOGRAM on its own navy | **1.00:1** - invisible | reads, and looks deliberate |
| the consumer ROUNDEL on a cream panel (×2) | 1.91:1 by the gate | **worse** - a black tile it does not need |

**The roundel reads perfectly without any field**, because it is a full-colour mark whose
mid-tone ink measures badly and looks fine - and the owner's own blind read agrees: both roundel
cells are inside the B16-B26 block he called fine, and the only one he named as unfinished is the
monogram. So a field wired to today's signal would have damaged two graphics he passed to repair
one he failed.

**This is the recorded Lite false-positive class arriving on the Pro side** (`src/ai/AGENTS.md`:
luminance flagged crests that render perfectly, "a blue crest on a red tile separates by hue").
`MarkProbe` carried aspect, backing and one alpha-weighted ink luminance - which cannot tell a
single-ink knockout wordmark from a coloured logo, and that distinction is the whole question.

**THE MEASUREMENT NOW EXISTS AND THE SEPARATION IS TWO ORDERS OF MAGNITUDE.**
`MarkProbe.inkSpread` (additive, optional) is the alpha-weighted standard deviation of the ink's
luminance, computed in the same pass as the mean. Over the four fixture marks:

| mark | backing | ink luminance | **ink spread** |
| --- | --- | --- | --- |
| volt wordmark | transparent | 0.7772 | **0.0021** |
| navy monogram | transparent | 0.0200 | **0.0004** |
| consumer roundel | transparent | 0.4910 | **0.2053** |
| editorial mark | own-field | 0.1820 | 0.3439 (excluded - own field) |

`MARK_SINGLE_INK_SPREAD = 0.05` sits 24x above the loosest single ink and 4x below the coloured
one. **Re-run on the same three cells, free: the monogram takes its field (1.01:1 → 13.61:1) and
both roundel cells are left untouched** - the trigger fires once in 18 instead of three times, and
on the one graphic the owner named. An older probe with no spread is treated as "cannot tell",
which means do not touch it. Pinned by `e2e/spike-instruments.spec.ts` as a BAND on each side, so
a drift that narrows the gap fails rather than quietly restoring the false positive.

**RULED ON 2026-08-15 (owner): the field is ON, and what was ruled on is the TRIGGER.**
`markField` now defaults to true in `composeFromLanguage`, so the product, the paid arm and the
zero-token control all compose the same graphic - a control that runs different code than the
product is not a control, which is the finding this file has already paid for three times.

The standing no-plate rule (2026-08-14) is not overturned; its premise no longer applies. It was
written for Lite, where the platform does NOT own the composition and a well can only ever be a
repair scar pasted over somebody else's design. Phase A owns the whole composition and knows the
mark's ink before the panel colour is chosen, so the field is a designed band - `align-self:
stretch`, `object-fit: contain`, a segment of the panel - rather than a rectangle behind a logo.

What makes it safe is `inkSpread`, and the numbers above are the argument: the trigger fires once
in 18 cells, on the monogram the owner named as making its graphic look unfinished, and leaves
both coloured roundels alone. A field wired to the older mean-luminance signal would have damaged
two graphics he passed in order to repair one he failed.

Pinned by `e2e/pro-language.spec.ts` as four cases - the single dark ink takes its field, the
coloured mark does not, a probe with no spread at all is treated as "cannot tell", and
`markField: false` still composes the un-repaired graphic for a future A/B. Mutation-checked: with
the default back at false the monogram case fails and nothing else does. The repair is recorded as
`mark_field_painted` and reaches the ledger row as `pro-mark-field`.

**The original framing, kept because the premise change stands.** The standing rule is *a mark carries NO PLATE* (2026-08-14),
and its reasoning was explicit: on Lite the platform does not own the composition, so a well is a
repair scar pasted over someone else's design. **Phase A changes that premise** - the platform now
draws the whole composition and knows the mark's ink BEFORE the panel colour is chosen, so a
reading field can be a designed band rather than a patch. Three options, in order of how much they
cost: (1) leave it - the mark is reported unreadable and the graphic ships with a hole; (2) the
platform gives the mark's own column a measured neutral field when its ink cannot read on the
chosen panel (this is `decideMarkSurface`, already written and already measured); (3) the platform
constrains the PANEL instead, refusing a surface the customer's mark cannot survive. Telling the
model about the ink is already done and did not bind - the prompt says "its ink is dark, it needs a
light surface" and the model chose the brand's navy anyway, which is §15.3's ranking arriving on
schedule.

**Two classes for the next round, both platform-side:**

- **A dark-ink mark on a dark panel disappears** (3 of 18). The model took each brand's own
  palette faithfully and the mark's ink then had nothing to read against. It is REPORTED and not
  repaired, which is the owner's standing decision (no plate behind a mark, 2026-08-14) - but
  Phase A changes the terms, because the platform now knows the mark's ink BEFORE the panel is
  chosen. The cheap version is a boundary in the prompt rather than a repair in the compositor.
- **`footprint-large` on the long-name brief.** The panel is sized by its text and the text was
  long; the cap that bounds it is the category's auto-fit width, not a footprint budget.

### 15.9 Phase B - the language drives a PACKAGE (2026-08-16)

Phase A's claim, and Pro's whole promise, is that *a model decides a design language and the
platform renders it across every graphic type a show needs*. It had been tested on ONE type. Until
a second one ran, Pro was a lower-third generator with a plan attached - and it is also the only
honest basis for charging for the tier, because a channel does not need a lower third, it needs a
lower third, a sponsor bug and a countdown that visibly belong to each other, which Lite
structurally cannot do (it adapts one proven catalog design at a time).

**THE TWO TYPES WERE PICKED FROM THE REGISTRY, NOT FROM TASTE.** `src/templates/types/` records
`GraphicType.frequency` - how many of the 60 reference formats ask for that graphic - and the
order is not a matter of opinion:

| type | frequency | why it is also the hardest test |
| --- | --- | --- |
| lower third | 52/60 | Phase A's subject; the type both instruments were calibrated on |
| **sponsor bug** | **37/60** | mark-led, ONE line, on screen LONGEST - so it sits beside every other graphic in the package, which is what makes incoherence visible |
| **countdown** | **30/60** | its primary element is not a line an operator types (the clock is painted by the shared runtime), and it carries a real MACHINE - a parallel pause/resume group |
| topic card | 29/60 | the next one, and a third word-in-a-panel type - it would have tested less |

Together the three span the package's whole footprint range (a corner mark a fifth of the frame
wide, a strap, an 80px display clock), which is the range a coherence claim has to survive.

**They are composed THROUGH THE TYPE REGISTRY, not merely through the category assembler**
(`pro/language/fromType.ts`). Each Phase A design is handed to `variantsFromType` as that type's
one design, so four things arrive as declarations rather than as claims: the field contract in the
type's own order, the REQUIRED-PARTS gate (`missingParts` throws when the composed design fails to
emit a part the type promised - a real measurement of the platform's composition), the compiled
machine (a Pro countdown gets the same pause/resume buttons the catalog's own timers get), and the
clamped content channel (`withContentValues` drops an illegal duration rather than writing it).
That is what makes a new type *a brief bank and a sweep* rather than a pipeline.

**What is shared across the package, and what is not.** Every ratio is expressed against a
per-type anchor (`GRAPHIC_METRICS`: 54px name, 24px caption, 80px clock) - holding three graphics
to one absolute size would be sameness, not coherence. But **the accent's thickness and the corner
radius are resolved against `PACKAGE_UNIT_PX` instead**, so they are one value for the whole set.
That is DESIGN_LANGUAGE §8's sibling rule made structural, and it is what the catalog already does
(lt11, gt05 and bug03 all draw their bar from one `--accent-weight`).

#### The calibration sweep, per type (`node scripts/pro-type-calibrate.mjs`, FREE)

Every threshold in `spike/{spacingCheck,proportionCheck}.ts` was read off the lower-third catalog.
Both instruments take an override for every one of them, so a per-type calibration is a set of
ARGUMENTS (`PRO_GRAPHICS[id].instruments`) rather than an edit to a shared gate - nothing about
how a lower third is judged moved. The sweep renders each type's SHIPPED catalog designs plus
Phase A's four stub languages, under both calibrations:

| | shipped designs flagged |
| --- | --- |
| catalog under the LOWER THIRD's thresholds | **7 of 14** |
| catalog under the TYPE's thresholds | **3 of 14** |
| Phase A's own compositions under the type's thresholds | **0 of 12** |

Three thresholds moved, each read off the catalog rather than chosen:

- **`markScaleCeiling` 3.2 → 5.5 (sponsor bug).** Measured, the shipped bugs run 1.67x-5.25x the
  caption; bug01 (5.25) and bug04 (4.81) are a small caption UNDER a mark, not a mark beside a
  headline. Phase A's own bugs come in at 2.1x-2.7x, so the ceiling bounds the catalog and never
  binds the composer.
- **`typeRatioThin` 0.28 → 0.18 and `paddingFloorRatio` 0.28 → 0.24 (countdown).** Three of four
  shipped timers step their label further down than a strap ever steps its role line (gt01 0.20,
  gt02/gt05 0.25), and gt05 - the HOUSE countdown - reads 0.26 of top padding against a 0.28
  floor. Phase A's step never goes below 0.36 and its tightest padding is 0.34.

**A FOURTH OVERRIDE EXISTED AND THE UNIT CHANGING UNDER IT REMOVED IT** - which is the honest
argument for re-running this sweep after every integration rather than trusting a threshold once.
`markGapFloorRatio: 0.10` was derived while `spacingCheck` divided the mark's gap by the MARK's
own height, where half the shipped bugs failed a 0.25 floor because a design giving its mark room
was divided by its own generosity. `claude/measured-debt-three-closures-d9ce04` then landed the
fix at the source: the gap is now reported in PRIMARY TYPE SIZES (floor 0.35). Re-measured on the
new unit, bug01 clears it outright and only bug02 is still flagged - by 0.02 (0.33 against 0.35),
which is one design and therefore not a calibration, exactly as gt01 and gt06 are not. **The
override was both unnecessary and stating a reason that had stopped being true**, so it is gone
and the reasoning is kept as a note in `graphics.ts`. Post-merge readings: catalog 3/14 flagged
under the type thresholds (all three deliberate), Phase A **0/12**.

**Two shipped readings are left flagged on purpose** (gt01's clock 0.11 type sizes from its accent,
inside the almost-touch band; gt06's label-to-clock gap 1.5 against 1.4) plus bug02's own layered
live clock, which the instrument correctly reads as overlapping text. One design is not a
calibration, and moving a threshold to silence a single design is how an instrument stops
measuring anything.

**A `panelFillFloor` override for the bug was WRITTEN AND THEN DELETED by the measurement.** The
reasoning was that a corner tile is mostly mark and mostly air; measured, the shipped bug fills
0.56 of its tile and Phase A's fill 0.70-0.78, so the strap's 0.18 floor was never near firing. An
override nothing needs is a second number that can drift from the one it was copied from.

#### What the free control run bought this time - two composer bugs, before any tokens

The zero-token control (`--control`, now 20 rows: the strap's four plus eight new-type rows through
`composeGraphic`) earned its keep again, and both findings were structural rather than cosmetic:

- **A padding unit that was not the unit the instrument measures in.** Padding was derived from the
  type's ANCHOR, and on two of three graphics the anchor IS the painted primary size, so this
  reduced to the same number and nothing showed it. On a sponsor bug it does not: the block accent
  form's own size floor raises what is painted above the anchor, and a compact block-accent bug
  came out at 8px of padding on a 30px caption - 0.27 against a 0.28 floor, `padding-tight`, on a
  composition whose entire premise is that the threshold is cleared BY CONSTRUCTION. The unit is
  now the largest PAINTED type size.
- **A tile tighter than its own mark's clear space.** The mark gate measures clear space in the
  MARK's height (0.25, the brand manual's) while a tile's padding is measured in its CAPTION's
  size, and on a bug those units are three times apart: a balanced-density tile put 15px between
  the mark and the accent bar against a 15.6px need. The floor is now the mark's - on this type
  the mark IS the graphic, so the tile's air belongs to it - which costs the two tightest densities
  their horizontal difference and is the right trade.
- **And a badge with 4px of air.** The strap borrows its block-accent padding from the gap between
  its two lines; a bug has ONE line, so that expression collapsed. The alignment instrument read it
  as a near-miss (the block's edge 4px past its own word); on screen it is a badge somebody forgot
  to finish. A bug's badge padding is now a function of its own text.

After all three: **20 control rows, zero spacing findings, zero proportion findings, zero alignment
near-misses, zero mark findings, and every row animates** (15 motion frames and three clips each).

**A fourth was found by LOOKING, which is the part no instrument was going to do.** The bug's
`top-rule` accent rendered BETWEEN the mark and the caption rather than across the top of the tile:
the shared logo slot injects the mark as the box's first child (it must - a first-child insertion
is what renumbers a design's own `nth-child` rules), and the rule is written after it, so source
order decided. Every instrument passed it, because a rule one clear space from the text is a rule
one clear space from the text wherever it sits. It is a coherence defect rather than a spacing one:
**the same enum value has to mean the same thing on every graphic in the package**, or the claim is
only ever about colour. Fixed with `order: -1` rather than by fighting the slot's insertion point.

#### The palette rule finally reaches Pro - and what that says about the 26/30

**A requested brand palette is copied VERBATIM by the platform, never returned as prose by the
model.** Lite has had this since 2026-08-13 (`docs/AI_LITE_BRAND_PLAN.md` §3.1) and Pro did not:
`proBrandSection` stated the four hexes to the model and the model returned a palette, so "exactly
the brand's colours" rode on an echo that could fail three silent ways - a near-miss hex, an
omitted palette letting a default carry, or the legibility repair deleting the package.

Now `proBrandPalette` (pro/brief.ts) carries `GenerationSpec.brandColors` as DATA and
`resolvePalette` (pro/language/paint.ts) applies Lite's own split through `applyLiteBrandPalette` -
identity (accent, panel) verbatim, furniture (text, textDim) legibility-owned - with every
divergence recorded as an adjustment that reaches the ledger. The prompt still DESCRIBES the brand,
because a language decision needs to know what world it is in; what changed is that the identity is
no longer the model's to return.

**This changes what the §15.8 verdict covers.** The owner's 26-of-30 blind read measured the PROSE
version, on a bench brand that states its colours as a brand BRIEF rather than as a filled-in
palette - so it says nothing about how faithfully a *stated* palette now lands, and a later round
should not be read as confirming that.

#### The paid round - the package-coherence question

`node scripts/pro-spike.mjs --generate --arms=language --divergence-arm=language
--route=vercel:google/gemini-2.5-flash --max-cost=0.20 --out=pro-spike-out-phaseb-set news-public`
(the `pro-spike-out*` prefix is what keeps a round's 400-odd captures out of the repo - and the
round still has to be ARCHIVED outside the worktree before any cleanup, because ignored files die
with it.)

ONE brief, under FOUR brands - four design languages - each rendered as all three graphic types.
**Twelve graphics for four model calls, $0.021 of the $0.20 ceiling** ($0.0043-$0.0065 a language,
$0.0018 a GRAPHIC), because composing is deterministic: the package is what the one paid call
already bought. That is the economic half of the Phase A argument arriving as a number rather than
as a claim - and it is the number that says a package is not three times the price of a graphic.

What the machine measured, over 4 languages x 3 types:

| | result |
| --- | --- |
| contract (scaffold + fields + declared slot) | **4/4**, zero blocking errors |
| set members composing clean (bug + countdown) | **8/8** under their own calibrated thresholds |
| repair rounds | **0** (there is no repair loop on this path) |
| fields the model failed to answer legibly | **0** - every language came back complete |
| palette furniture repaired | 1 of 4 (`palette_text_dim_lightness_clamped`, the navy brand) |
| code audit | spine ok, region ok, **timeline editable on all four**, es5-drift 0, comments 24-25% |

**The divergence held, and it held harder than §15.8's.** Four brands returned four typefaces
(source-serif-4, anton, outfit, ibm-plex-sans), four accents, three different accent forms and
three motion characters - and one of them (`Ledger Report`) chose a **LIGHT package**, `#8a8a85` on
`#fafaf8`, which is the one thing the catalog's own variety audit says a style family cannot do
(`docs/CATALOG_VARIETY.md`: 148 designs cannot take a light palette). Not one look with the colours
swapped, which is the named sameness failure.

**One reading to carry forward, and it is not new.** The navy-monogram brand reports
`mark-own-background, ink-contrast` on its strap - the mark field FIRED correctly
(`mark_field_painted` is in its adjustments) and the rendered mark gate then sees a background
behind the mark and says so. The gate cannot tell a platform-drawn field from a mark that brought
its own, which is the §15.8 trigger working and the instrument describing it in the only vocabulary
it has. It is on the lower-third path and predates Phase B.

Archived at `noacg-lite-eval-archive/pro-phaseb-package-gemini25flash-2026-08-15` (1012 files,
copy proven).

#### THE OWNER'S BLIND READ - 2026-08-16: 4 of 4 packages read as unified

**The Phase B claim holds on the only measure that counts.** Asked to judge the ROW rather than
the graphics, the owner called every one of the four paid packages coherent: *"the blue background
is clear; it looks like one graphic packet"*, *"also fine"*, *"solid. Same colors; it looks
unified"*, *"white and black - this is really easy; it's unified"*. No package was called a
mismatched set, and no palette, typeface or motion was called wrong.

Five classes came out of it. **Three are the PLATFORM's, one is the RIG's, and none is the
model's** - which is the same shape as §15.8's read and is worth noticing twice.

- **1. The accent bar is identical and does not READ that way** (on the countdown of a package
  otherwise called good). MEASURED on the saved code rather than argued: the bar is `16px` on all
  three members - the package constant doing exactly what it was built to do - but against each
  panel's own height it lands at 0.106 (strap), 0.110 (bug) and **0.073 (countdown)**, because the
  clock's panel is 219px tall where the strap's is 151px. Identical absolute weight is not
  identical perceived weight once panel heights differ by 45%. **`e2e/pro-language.spec.ts` asserts
  the three `accentPx` values are EQUAL, so the guard pins precisely the wrong invariant** - it
  would pass through the defect the eye caught.
  **RULED 2026-08-16 (owner): record it, change nothing.** One observation on one graphic is not
  enough to move a design-language rule, and the alternative - a bar whose px value differs per
  graphic - contradicts DESIGN_LANGUAGE §8's "reuse the exact token values across categories",
  which the catalog follows with a single `--accent-weight`.
- **2. One label voice, three sizes.** The countdown's label measures **1.46-1.53x the strap's
  supporting line at every type step** (26 vs 38px on a clear step; 33 vs 50px on a subtle one),
  because `supportingPx` is the per-graphic anchor times the step. The voice is consistent by
  RATIO and not by size, and at ~50px a label stops reading as a label - which is what
  *"the starting text also feels like it's different from the other texts"* is. Not ruled on;
  recorded with its measurement so a later round can decide whether the label voice should carry
  a size band across the package the way the accent carries a weight.
- **3. Same typeface, different voice** - *"the name typeface and bug typeface are quite
  different, but that's not so bad"*. Both are Anton; `--font-heading` is identical. What differs
  is 700 / no tracking / CAPS on the strap's name against 500 / 0.08em / sentence case on the
  bug's caption, which is the LABEL voice doing its job. Called acceptable, recorded not fixed.
- **4. The countdown carries no mark while the strap and bug do** - *"the timer does not have
  anything to do with the KSTRL logo, so it looks a bit different"*. Structural rather than a
  defect: `countdownType` declares `logo: 'none'`, so there is no slot to fill, and giving it one
  changes a catalog contract every shipped `gt0x` design compiles from.
  **RULED 2026-08-16 (owner): leave it - a clock is not a branded card.** The channel's mark lives
  on the persistent bug and on the strap.
- **5. A mark that does not suit its package - THE RIG's, not the design's.** Two CONTROL rows were
  called out for carrying a mark that fits neither (*"the KSTRL logo does not fit with this
  graphic"*, on the scholarly serif package and again on the warm daytime one). The control seats
  ONE mark - the volt sport wordmark, `brands[0]` - on all four hand-written languages, so those
  pairings are the harness's doing; the paid rows each carry their own brand's mark and drew no
  such note. **Stated rather than fixed, because this repo has twice read a rig fault as a model
  fault** (docs/AI_ATTEMPTS.md).
  It does leave a REAL question behind it, unanswered and not a patch: nothing checks whether a
  customer's mark suits the language the model chose. The model sees only the mark's shape,
  backing and ink - content-free by design - so a sport wordmark on a documentary package is
  invisible to it.

**THE GALLERY WAS LEAKING THE ANSWER, and the owner found it at the moment of reading.**
`setGalleryHtml` printed the language's NAME beside each blind id (`B-21 "Aldervale Nightly"`),
and a design language is named by the model after the brand it was designed for - so the one
artifact whose whole job is withholding which brand produced which row was announcing it in every
heading. `blindTheFrames` had already been copying the images to blind filenames for exactly this
reason; the row's own title was the last thing left. Fixed (the heading is the blind id alone) and
verified by rebuilding the real round for zero tokens. The read above was taken on a copy with the
names stripped, and is sound; **what it is not is a clean-room read** - this session had already
named the languages in conversation before the gallery was opened, which is the same leak class
recorded against the 2026-08-13 round.

**The deliverable is `set-gallery.html`**: one row per design language, three graphic types side by
side, so the coherence claim is read in one glance. It is BLIND like the main gallery - rows keyed
by blind id, images blind copies - because "do these three belong to each other" must be answered
before anyone knows which brand or checkpoint produced them. Judge the ROW, not the graphics:
every graphic in an incoherent package can be individually fine, which is exactly why no
per-graphic gallery can ask this question.

#### The wizard surface - a Pro generation IS a package (2026-08-16)

The engine composed three graphics and the wizard could ask for one, which is a tier whose
differentiator no user could reach. What the surface adds, and the reasoning behind each part:

- **A picker in the ⚙ Pro panel** (`AiSettings.proPackage`, persisted and normalized), with
  **every graphic ticked by default**. The whole package costs exactly one model call, so there is
  no cost argument for burying it behind an unticked box - and a differentiator nobody meets is
  not a differentiator. The FIRST member is the primary: what the live preview shows and what a
  refinement acts on, which is why the list is rebuilt in package order on every tick rather than
  appended to. The last tick cannot be removed; a generation that makes nothing is not a choice
  anyone means to express.
- **The members are composed the moment the result lands**, from the same language, and each goes
  through the SAME gate the primary did. A member the gate refuses is DROPPED and named
  (`pro-package-dropped`) rather than shipped or allowed to fail the generation the user has
  already paid for - the composer cannot emit invalid code, so a refusal there is a platform bug.
- **The result card renders the package** beside the language that produced it. A list of names
  cannot answer the only question a package raises, and this is the last surface before anything
  is created.
- **A package FINISHES INTO A PRODUCTION**, through the catalog kit's own `KitFinishStep` and its
  save path (`saveTemplateSet`, generalised from `saveKit`). The single-graphic ending offers
  "open in the editor", which for a set means picking one member for the user and abandoning the
  rest. The branch is on the SIZE of the set, never on the tier, so a Pro user who unticks
  everything but the strap gets exactly the ending they have always had. The step takes the
  user's own noun (`package`, not `kit`).
- **Every member is named for what it is** - `Harbour Nightly lower third`, `… sponsor bug`,
  `… countdown`. A composed graphic takes the design LANGUAGE's name, which is right for one
  result and useless for a set: three identical captions, three identical library rows, and three
  same-named folders inside one export. **The name is the export slug and the folder an operator
  reads in the playout server**, so this was found by looking at the Finish step rather than by
  any check.

**Verified on a configured deployment, for zero spend**
(`e2e/configured/pro-wizard.spec.ts`, "one call makes the whole package"): the door is offered,
every box is ticked, ONE stubbed model call produces THREE graphics, nothing is dropped, and the
set finishes into a production with each member named for its type. The offline suite cannot cover
it - hosted Pro is absent there by construction - which is the same reason the walk above lives
here.

**`PRO_SUPPORTED_CATEGORIES` still lists only the lower third**, and that is now the one honest
gap: it is the AI CATEGORY the brief is pinned to, not the package, and widening it is a
`spec/categories.ts` question rather than a Pro one.

---

## 16. The first REAL hosted generation - 2026-08-15, and what it settles

Hosted Pro went live for the owner and one cohort domain on 2026-08-14. The owner ran the first
real generation the next morning, from the wizard on a phone, using **one of the service's own
suggested prompts**. Ledger id `8e9a35eb-3df8-4d79-a089-083a7ed55c2b`.

**The verdict was UNUSABLE, and the gate said `usable`.**

### What arrived

The rebuilt panel - a name, a role, a dark rounded panel, a thin amber edge accent - was clean
and correct. **Behind it sat the same text baked into the artwork at roughly four times the
size**, clipped at both edges, with the tail of the name bleeding in from the right. The
familiar baked-text ghost.

### Why

The concept model draws the lower third AS PIXELS, text included. The compiler finds the text
regions, rebuilds the panel in CSS with live fields, and then tries to erase the baked original.
`eraseRegion` is a FLAT FILL: it erases where the backdrop is flat and refuses where it is not
(pinned by `e2e/pro.spec.ts`, "baked text outside panels is erased where the backdrop is flat,
refused honestly where not"). This ghost sat on a dark gradient, so the erase refused - honestly
- and left it. The rebuilt panel carries house type sizing while the ghost keeps the concept's
native scale, which is why the two disagree so violently.

### The part that is a defect rather than a limitation

`validation_rule_codes` came back EMPTY and the row says `usable`. **The compiler knew**: it
records the refusal in `ProCompileReport.warnings`, and nothing reads it. §14 already recorded
this for the benchmark - *a gate that measures the right dimension and discards the answer is a
scoring bug, not a blind spot*. This generation proves the same hole exists on the PRODUCT
surface, where the person on the other end is a student rather than a reviewer.

**The cheapest honest change: make an erase refusal blocking.** A graphic with un-erased baked
text outside its rebuilt panels must not be presented as usable. On the 2026-08-10 numbers that
would have caught three of the four broken frames. It does not produce a good graphic; it stops
the product asserting a broken one is fine.

### DONE 2026-08-15 - the refusal is a blocking code

`ProCompileReport` now records the refusal STRUCTURALLY (`bakedTextRefused`, the field labels;
`ringRefused`), and one seam - `validateProCompile` in `pro/compile.ts` - folds the
compiler's own findings into the injected gate's verdict. `pipeline.ts`, `stub.ts` and
`pro-bench.mjs` all go through it, so no engine can deliver a compile whose refusals were
never scored. Two codes, split by how badly the graphic is hurt:

| Code | Severity | What it means |
|---|---|---|
| `pro-baked-text` | ERROR, one per refused region | the concept's own words are still in the artwork under the live field - the graphic prints them twice |
| `pro-artwork-ring` | warning | a thin band of the concept's backdrop rides the edges over live video |

Consequences, in the order a user meets them: the wizard's result card says
`✗ N check(s) failing` instead of `✓ Passes SPX validation`, and the finding is shown as a
blocking ✗ rather than the ⚠ every unrowed finding used to wear; `reportProOutcome` sends
`failed` with `platform_validation` and the codes, so the ledger row carries
`validation_rule_codes = {pro-baked-text,…}` instead of nothing; and `pro-bench` scores it,
because `pass` reads `validation.ok`.

**Reproduced and measured on the checked-in fixture bank, free.** Before: 9/12 pass, and
`corporate` was one of them - two baked-text refusals in `report.warnings`,
`validationErrors: []`, `pass: true`, the §16 defect exactly. After: 8/12, `corporate`
failing on two `pro-baked-text` errors, `minimalist` and `multiline-title` (already failing
as SOURCE-LIMITED) now also naming the ghost, and **every one of the nine clean fixtures
unchanged**. Mutation-tested both ways in `e2e/pro.spec.ts`: dropping the error lets the
gradient case pass, and emitting a spurious one fails the flat case and the clean offline
pipeline.

**What this does NOT do.** It blocks nothing at the wizard's Create button and repairs
nothing - the compile is deterministic, so the honest advice stays "generate a new design".
And it is a browser-side verdict: the server records what the browser reports, which is the
same trust boundary every `pro-outcome` field already sits on (the SPEND is settled
server-side and is not affected).

### What it says about §15

**The panel the model designed was good.** Clean type, sensible hierarchy, restrained accent.
What wrecked the frame was the platform's reconstruction of it. §15.2 found that none of the
remaining failures were colour, typography, motion or brand; here even the composition was
sound. That is evidence FOR §15.4's option 3 - *the model decides a design language and the
platform renders it* - and against spending anything further on making raster reconstruction
work.

### Operational state

The cohort domain was cleared from the `arcada` plan the same hour, so no student can reach
Pro; the owner's own grant stands so the investigation can continue. The hosted ROUTE is
verified and correct and is not implicated: cost reconciled exactly (concept image $0.0671020 -
the documented flat rate - plus interpret $0.0184629, summing to the $0.0855649 on the
generation row), both settlements landed, the lease renewed, and the allowance moved.

**First real turnover: 62 s** (`runtime_ms` 61984). `AI_PRO_RETRY_SPACING_MS` is an unmeasured
8 s; Lite's own formula (turnover / retries) puts it near 31 s. One sample - re-derive after a
class rather than treating it as settled.

### SHIPPED 2026-08-15 - the composer IS the product path

`src/ai/pro/language/pipeline.ts` is now the only route from the wizard to a Pro graphic.
Pressing Create spends **one** forced structured text call on
`PRO_STANDARD_ROUTES.language` and then composes deterministically; nothing in the product asks
an image model for anything.

**Reproduced before it was rewired.** The shipped path was watched running through
`pro/stub.ts` into `compile.ts` (15 of 15 offline Pro specs green on the unmodified tree), and
`src/ai/pro/language/` confirmed to be imported by exactly two things, both bench-only:
`scripts/pro-spike.mjs` and `src/ai/spike/anchors.ts`. The rewire replaced that path rather
than adding beside it.

What ships with it:

| | before | after |
|---|---|---|
| model calls per generation | 2 (a concept IMAGE, then an interpretation) | **1** (text) |
| measured cost | $0.0777, 86% of it the flat image charge | ~$0.0055 (the §15.8 round's rate) |
| who composes the panel | the platform's raster reconstruction | the catalog's own assembler |
| browser cost ceiling | refuses the second call after the first overspends | **none, and none is possible** |
| ledger row on a repaired graphic | `usable`, `validation_rule_codes` EMPTY | `usable`, carrying the `pro-` codes |

**The browser ceiling is gone because the shape removed its job.** `PRO_MAX_GENERATION_COST_USD`
existed to stop the SECOND call once the first had spent the budget. With one call the money is
already spent by the time a browser could refuse it, and throwing then destroys a finished
graphic for no saving - the 2026-08-08 mistake exactly. The server's `pro-generate` booking
enforces the same constant and is the half a browser was never trusted with.

**The §16 hole is closed from the other side too.** `pro/language/gate.ts` is the one seam a
composed graphic is scored through, and it mints the platform's own divergences as findings:
`pro-palette-repaired`, `pro-mark-field`, `pro-language-fallback`, all WARNINGS, because each
describes a graphic that is airable *because* the platform intervened. `proRuleCodes` then sends
every ERROR unfiltered (an error is why a row says `failed`) and only `pro-` WARNINGS (the
runtime bench is chatty by design and the wire caps the list at 30, so bench noise would evict
the Pro-owned codes). A row can now tell a clean generation from a rescued one.

**Why the retired engine existed for one more day, and then did not.** It moved to
`src/ai/pro/reconstruct/` behind a build-time import boundary
(`retiredProEngineRestriction`, `eslint.config.js`) that refused it from every region of `src/`
a user can reach - mutation-checked from the UI and from `pro/language/`, and a per-file version
of the same rule was measured to be VACUOUS first, because the patterns match the import string
and missed the sibling form. It was carried rather than deleted because deleting reached into
`api/`, `scripts/` and `package.json` that the rewiring change did not own, and a live worktree
was editing two of those.

**DELETED 2026-08-15**, in the deliberate pass its own `AGENTS.md` specified, in that order:
the four `scripts/pro-*` runners and the `bench:pro` package script, the nine reconstruction
tests in `e2e/pro.spec.ts` (leaving the two that pin the tier DOOR), `concept` and `interpret`
from `PRO_STANDARD_ROUTES` and from the server's funded list, the interpretation half of
`src/ai/pro/contract.ts` with `api/_lib/proGeometry.test.ts` and the rewritten
`proCostCeiling.test.ts`, then the directory and the eslint block in the same commit as the last
import. The fixture bank was archived outside the repo first and the copy proven by sha256; the
paid rounds that produced it stay in `benchmarks/pro/round-2026-08-0{8,9,10}/`, and what those
rounds MEASURED is carried forward in `src/ai/AGENTS.md` rather than in the code that produced
it. The boundary went with the directory: a rule guarding a path that does not exist is a rule
nothing can violate and nobody can check.

**Owed, and deliberately not done here:**

- **A real hosted generation.** This is verified by build, by the offline composer gates and by
  the configured walk's route interception - not yet by a graphic a person looked at. The
  configured suite needs `VITE_SUPABASE_URL` and `E2E_EMAIL`/`E2E_PASSWORD`, which this worktree
  does not carry, so it skips here and must run where they exist.
- **Pro's own example briefs.** The step still offers Lite's, which describe one strap; Pro now
  decides a language for a whole channel. One line, waiting on `claude/tier-promise-briefs-0e4d77`
  (TODO in `AiStep.tsx`). Inventing briefs locally would fork the bank a round is measured against.
- **A requested brand palette is still a prompt, not a lock.** Lite's ratified rule is that
  identity colours are copied verbatim by the platform and never left to the model. Phase A passes
  them in the brief, which is what the 26/30 round measured; making them verbatim is a real
  improvement and a behaviour change no round has read yet.

### The first REAL generation on the new engine - 2026-08-15, and two defects it found

Owner-authorised, run through the wizard on a configured deployment with nothing stubbed: a real
reservation, a real managed call, a real outcome, real ledger rows.

| generation | calls | provider cost | runtime |
|---|---|---|---|
| `8e9a35eb` - §16's unusable one | 2 | $0.0855649 | 62.0 s |
| `9ebc84f0` | 2 | $0.0898749 | 73.5 s |
| **`f21d6e23`** | **1** | **$0.0043211** | **12.3 s** |
| **`0740a885`** | **1** | **$0.0034336** | **9.9 s** |

**One call, ~$0.0039 a graphic - 22x cheaper and 6x faster**, `status: usable`, and the composed
document carries `.lower-third-box` / `.lower-third-accent` / `#f0`: the composer's own structure,
not a reconstruction. The estimate in §15.7 was ~$0.001-0.003; the measurement is $0.0039, close
enough that the estimate stands as a planning number.

`validation_rule_codes` and `adjustments` came back EMPTY, and here that is the honest answer
rather than §16's silence: no palette repair fired, no mark was uploaded, no field fell back. The
codes have a rendered test of their own (`e2e/pro-language.spec.ts`).

**TWO GENERATIONS WERE SPENT, NOT ONE.** The harness spec asserted a locator that does not exist
AFTER the product had finished, and Playwright's retry bought a second graphic. Worth recording
because it is the cheap version of an expensive lesson this file already carries twice: the run
that spends the money must take its evidence FIRST and assert afterwards.

**NO VISUAL READ YET.** The picture was lost to that same locator and the trace was overwritten by
the next run; a third attempt was refused by the allowance and charged nothing. §16's whole lesson
is that a graphic can pass every gate and still be unusable, so the human read is still owed.

**Defect 1: the allowance read-back promised a generation the gate refused.** The panel said
*"1 generation(s) left today"* while Create was disabled under
*"Your current NoaCG Pro allowance has been used."* An allowance is TWO counters - starts and
successes - and the note read the starts one while successes were spent. This is exactly the drift
`api/_lib/lite/status.ts` warns about ("the panel promises an allowance the reservation will not
honour"), arriving on the read-back side rather than the gate side. Fixed: the note reports the
BINDING number. The configured spec's fixture now sets the two counters DIFFERENTLY, because a
fixture where they agree cannot tell a panel reading the right one from a panel reading either -
mutation-checked by flipping `min` to `max`.

**Defect 2: hosted Pro was gated on the RETIRED image route. FIXED 2026-08-15.** Availability
requires every route in the funded list to be priced, catalog-approved and not disabled from
`/admin` (`resolveProGate`), and that list was `[concept, interpret]`. Funding an unused route
costs nothing, but **de-listing or disabling the image model would have taken the whole tier down
for a pipeline that never calls it** - a foot-gun aimed at a classroom, on the one switch an
operator reaches for to stop spend on a model that has gone wrong.

The funded list is now `[language]`, read from `AI_PRO_LANGUAGE_PROVIDER`/`_MODEL`. `proTaskProfile`
declares no `imageRoutes` (no task does), `/api/admin/models` marks no image row in use and the
image tab says so outright, and the audited catalog entry stays as an AUDIT RECORD - deleting it
would delete a verified ZDR result. Pinned two ways in `api/_lib/pro/managedCall.test.ts`: the
retired route is refused at the spend seam before it is billed, and `routeDisabled` over
`profile.routes` - `resolveProGate`'s own expression - answers false with the image route
disabled and true with the language route disabled, so the gate is narrower rather than switched
off. Re-funding the image route fails both.

**Turning hosted Pro on locally needs three env vars `.env.example` does not group together:**
`AI_PRO_ENABLED`, `IP_HASH_SALT` (>= 16 chars, or the ledger reads unconfigured) and
`AI_LITE_GATEWAY_PROVIDERS` (the audited gateway allowlist Pro shares). With the last unset,
`taskConfigured` is false for every route and the status endpoint answers `not-configured` - which
names the deployment rather than the missing variable.

### The evidence round - 2026-08-16: the frames nobody could look at

§16's whole lesson is that a graphic can pass every gate and be unusable, so the human read is
the one step that cannot be skipped - and the first Phase A generation lost its picture to a bad
locator in a throwaway spec. Separately, the four lower thirds whose mark handling changed
(ls29, ls17, lt07, ls10) and the two the sweep found growing taller (lt49, lt53) were verified
NUMERICALLY and never displayed. Both are the same missing thing: a viewable frame.

**Everything below except the generations is free and repeatable.**

**The capture.** `scripts/spike-mark-clearance-sweep.mjs --capture` writes each render the sweep
already makes to a 1920x1080 PNG **with its alpha intact**. The shot is taken on a second page
rather than off the mounted iframe, because an element screenshot inside `/app` carries whatever
the app painted behind it: the composed document is self-contained by contract, so it is
`setContent` into a page parked on the dev origin, where relative `fonts/<file>` still resolves
and everything the design does not paint stays transparent. The measurements are unchanged - the
square-crest run reproduces the committed ledger exactly (ls18 and ls25 flagged, lt49 and lt53 the
two that grow), which is what makes the capture path safe to add to a rig a reading depends on.

**A square mark and a portrait mark were then swept separately, and that is the finding.** The
sweep had only ever run `badge-square`. Running it again with `shield-tall` produces **the same
box numbers on almost every design** - the well's rect does not depend on the artwork - and
visibly different frames. lt07 and ls10 read clean for so long for exactly that reason: the
number a portrait crest changes is not the number the sweep prints.

**The review page** (`scripts/pro-evidence-review.mjs` -> `benchmarks/pro/evidence/review.html`)
holds every frame at 1920x1080 over a backdrop it draws itself, with the words each render carried
and the raw measurement beside it. Four backdrops (dark studio, blown-out daylight, busy mid-tone,
checkerboard) plus black and white, and a zoom that magnifies the corner the graphic sits in rather
than capturing a second croppable picture that could disagree with the first. **The backdrops are
CSS and the page says so** - they stand in for footage, so a legibility call made against them is a
call about contrast. **The page carries no verdict, no pass/fail and no ranking**, deliberately:
a machine verdict printed next to a picture is how §16 happened.

**Hosted Pro now stands up locally.** The three variables above are in this checkout's `.env`, and
`/api/ai/pro-status` answers `enabled: true` with `reason: sign-in` - the refusal naming the
CALLER rather than the deployment, which is the difference the note above is about. The three
configured Pro specs then pass against it (`e2e/configured/pro-wizard.spec.ts`): the route is
reached and speaks the wire contract unstubbed, the door appears with the allowance read back off
the binding counter, one reservation pays for exactly one `emit_design_language` call, and a
configured backend alone is still not a door. **The walk was proved with a stub before a cent was
spent**, which is what the generations below then did not have to re-prove.

**Nine other configured specs failed in that same run, none of them Pro and none of them this
branch's** (this branch touches `scripts/`, `benchmarks/` and `.env` only): four in `feedback`,
plus `audience-live`, `moderator`, `production-links`, `quiz-output` and `scorebug-output`. The
shape is a locator that never appears - `[data-testid="beta-feedback-open"][data-area="wizard"]`,
`production-publish` - so they are worth a look on a branch that owns those surfaces. Recorded
here rather than fixed here, because a session capturing evidence should not also be editing the
surfaces it is measuring.

#### The round: 18 real generations, $0.1070, and what a person then SAW

`node scripts/pro-spike.mjs --generate --route=vercel:google/gemini-2.5-flash --arms=language
--divergence-arm=language --max-cost=0.12`, after the free `--control` pass. The plan is the
committed fixtures': the twelve-brief bank under its assigned brand, plus the divergence cell -
`news-public` and `entertainment` re-run under every OTHER brand - so all four synthetic brands
appear and two briefs appear under all four.

| | |
|---|---|
| generations | 18, one text call each |
| provider spend | **$0.1070** ($0.0038-$0.0097, mean $0.0059) |
| wall clock | 31-57 s per item, most of it the capture, not the call |
| validator | 0 errors, 0 failed field contracts, 0 repair rounds |
| ceiling | $0.12 asked for, $0.15 authorised - the run stopped short of both on its own |

Per-generation cost is **higher than §16's $0.0039** and lower than the $0.0777 the retired
engine spent: the bench conditions each brief on a synthetic brand, which is prompt the product's
own brief does not carry. Treat $0.004-$0.010 as the planning band rather than either single
measurement.

**What is on the frames** - description, not a verdict, because the verdict is the owner's read
and this file has twice recorded a machine calling a broken graphic fine:

- Every one of the 18 painted ONE strap in the lower-left carrying the brief's name and title.
  **Nothing prints its words twice** - the §16 ghost is structurally impossible here, because
  there is no artwork to erase.
- **The mark sits BESIDE the words in every branded generation**, never above them; no strap
  became a block. Marks render as marks (the KSTRL wordmark, the Aldervale crest, the Sunbeam
  sun, the Ledger glyph).
- **Under the stress values every panel GREW and kept its text inside it.** `long-name.kestrel`
  wraps a 46-character name onto three lines and the panel takes the height; read at full
  resolution, nothing is clipped. That is the `width: fit-content` box the composer inherits from
  the catalog assembler doing exactly what §15.5 claims for it.
- **Non-Latin renders**: `non-latin.aldervale` sets Greek and Japanese with no missing glyphs.
- **Four brands produce four visibly different straps from the SAME brief** - navy serif panel,
  black with a lime edge, plum with an orange sun, white with black slab - differing in palette,
  type voice, accent form and mark, not one look recoloured. Both divergence cells behave that way.
- **One platform intervention is visible in the frame**: `news-public.aldervale` paints a neutral
  field behind the crest inside its navy panel, so the mark sits on a light chip. That is
  `pro-mark-field` firing, and it is legible as an intervention rather than as a design choice -
  worth the owner's eye specifically.
- `minimalist.ledger` composed with **no panel at all**: mark and words sit directly on the
  picture.

**The frames are on the review page** (`benchmarks/pro/evidence/review.html`, served over HTTP -
`file://` will not load them), transparent, over the backdrop switcher, each with its brief, the
language the model named, its rationale, the palette, the platform's adjustments, the cost and the
validator's own words. **No verdict is printed anywhere on it.**

**Still owed after this**: a real HOSTED generation a person watched - these 18 ran through the
bench's route, not through `/api/ai/pro-generations`. The hosted WALK is now covered end to end
with a stub (above), and the entitlement gate is what stops the throwaway test account from
running the real thing locally: `ai.pro` is owner + `@arcada.fi` only, and granting it to a test
account to make a spec pass would be the gate telling itself what it wants to hear.

#### And the one that went through the PRODUCT - ledger `28807ce7`, 2026-08-16

The eighteen above ran through the bench's route. This one was typed into the wizard on a
configured deployment with **nothing stubbed** - a real reservation, a real managed call, a real
outcome, a real ledger row - and a person then looked at it.

| | |
|---|---|
| ledger row | `28807ce7-f385-422f-9417-0ae04a2bfe7a`, `status: usable` |
| model calls on the reservation | **1** |
| provider cost | **$0.0041359** |
| server runtime / wall clock to the result card | 12.4 s / 12.9 s |
| `validation_rule_codes` / `adjustments` | empty, and honestly so - no repair fired, no mark was uploaded, no field fell back |
| page errors | none |

The browser's whole `/api/ai` timeline, in order: `pro-status` → **`POST pro-generations`** →
**`POST generate`** → **`POST pro-outcome`** → `pro-status`. One reservation, one call inside it,
one settle, and the panel re-asking the server what is left rather than decrementing its own copy.

**What it looks like**: a navy panel with square corners, a thin gold rule fused to the leading
edge, the name in white Libre Franklin bold and the role in grey beneath it, bottom-left. One
strap. Nothing is printed twice. Under the stress values the panel grows and the name wraps to two
lines inside it. **The design language the model returned was "Election Night Watch"**, and the
result card says so along with what the platform decided from it (balanced density, 25/33px
padding, 11px line gap, accent outside the padding, reveal at measured pace).

**How it was run, because both rules here were bought with money.** The composed document and the
screenshots were written to disk BEFORE the first assertion, and the driver has no retry - the
2026-08-15 run lost its picture to a locator that failed after the product had finished and
Playwright's retry bought a second graphic. The whole walk was also driven once in `--dry` mode,
stopping at the Create button with the brief filled, so every locator was proved before a cent
moved. The runner is deliberately NOT a committed spec: a spec that spends real money is one CI
run away from spending it repeatedly.

**Two things about the account, stated plainly.** The tester account already held a permanent
`ai.pro` grant, so nothing was written to production to make this run. Its BINDING counter
(successes) was spent, so the run used `AI_PRO_OVERRIDE_USER_IDS` in the local `.env` - the
documented development override - which lifts the quota and leaves the reservation, the lease, the
settle and the ledger row exactly as real as they would be for a student. The allowance GATE is
therefore covered by the stubbed configured spec rather than by this run, which is the honest
division: this one exists to answer "what does the product actually produce", and it now has a
picture on the review page to answer it with.

---

## 17. The owner's first read of a Pro set - 2026-08-16

The read §16 was owed. The verdict on the set as a whole: **acceptable, and happier than before** -
"we can live with this", with continuous improvement expected rather than another premise change.
That is the first time a Pro round has been read without a layout failure being named, which is
what §15.5 predicted and what nothing until now had tested.

Five findings, all specific. Each one was checked against the source before being written here, and
each turned out to be the code doing exactly what was seen - none is taste against a defect that
does not exist.

### 17.1 The mark sits on a visible box, and it should not

**Named twice** - as `Aldervale Evening News`'s "A in the white box", and as a general rule: *the
background of a logo should always be transparent; the box should not be part of the graphic; the
mark should sit on the banner itself and look integrated.*

That white box is the platform's own repair - `pro-mark-field`, the field armed on 2026-08-14 after
the blind read flagged a dark monogram at 1.00:1 on a dark navy panel. It fires on one cell in
eighteen, and this is that cell. **So the objection is not to a bug; it is to the repair being
visible.**

The owner's own words carry the constraint that stops this being a simple removal: *"we can't have
a dark logo on a dark background and not see it… this works if we have a dark logo and a dark
background, so that's fine."* The field is accepted where it is the only thing making the mark
readable. What is rejected is a mark that reads as pasted onto a chip.

**Note what was NOT objected to:** `lt07`'s blue block and `ls10`'s red block, both of which put the
mark in a coloured well, were called out as liked. A well that the DESIGN draws is part of the
composition; a neutral field the PLATFORM paints is a patch. The distinction is the whole finding,
and it is the same one `src/ai/AGENTS.md` already records as "a mark carries NO PLATE" - `ls12`'s
fixed dark tile being the ratified exception because it is designed rather than repaired.

Directions worth measuring, cheapest first, none yet chosen: knock the mark's ink to the panel's
text colour instead of plating it (works only for a single-ink mark, which is exactly the case the
`inkSpread` measurement already isolates); shrink the field to the mark's INK box so no edge is
visible against the panel; or place the mark outside the panel entirely where the design allows.

### 17.2 A panel-less super has no legibility instrument at all

`Ledger Investigations` (`minimalist.ledger`) sets its words directly on the picture - the language
returned `shape.panel: "none"`, which is a legitimate answer and produces the sparest graphic in the
set. The composer's compensation is a text shadow (`0 2px 12px rgba(0,0,0,.75)` on the heading,
`0 2px 10px` on the supporting line, both in the saved CSS). Over the review page's busy mid-tone
backdrop the owner could not read the text at all.

**This is the §16 hole in a new place.** `validation/markLegibility.ts` measures a MARK against the
surfaces the design paints; a super with no surface has nothing to measure against, so no instrument
in the tree asks whether those words survive a picture. Every gate passed this graphic, and the
first busy plate defeated it.

The ask is explicit and is a gate, not an opinion: **check that it works on real images.** A
panel-less composition should be measured against a set of plates - at minimum a busy mid-tone and a
high-key one - and the finding should reach the same seam every other Pro divergence does
(`pro/language/gate.ts`). Whether the repair is a stronger shadow, a scrim, or refusing
`panel: "none"` for small supporting text is a decision to take AFTER the measurement exists.

### 17.3 `ls17` carries dead space under its accent

The side-by-side name-and-title row was called out as good variation and worth keeping. The strap is
too tall for what it holds: there is space under the yellow rule that reads as unnecessary.

Confirmed in `src/templates/lowerThirds/specialist/ls17.ts`: `.lower-third-accent` is
`margin: 15px 0 13px`, and its own comment says the bottom margin is kept deliberately so it "holds
even when the rule closes the strap with no institution under it". With no institution line (`f3`)
the render is exactly that case - 13px of accent margin plus the box's 26px bottom padding under a
2px hairline. **The design chose this; the read says the choice is wrong when the rule is last.**
Collapsing the bottom margin when the accent is the final child is the small version of the fix.

### 17.4 Accepted as they are

`lt07` (the mark's placement specifically called out as good, the blue "kind of out there but
fine"), `ls10`, `lt49`, `lt53`. The portrait-crest change these frames exist to show drew no
objection on any of them.

### 17.5 What this settles about the round

Nothing in the read named a palette, a typeface, a motion character or a composition as wrong -
the four things §15.4 moved to the model. Three of the five findings are PLATFORM behaviour (the
mark field, the missing plate instrument, a catalog design's margin), which is the same shape as
§15.2's decomposition and the reason Phase A was built. The premise holds; the work is now
ordinary improvement against named defects.

### 17.6 The mark ruling, implemented - 2026-08-16

**The owner's chain, verbatim:** try the ink knock first for single-ink marks; do not automatically
plate them; if a knock cannot preserve the mark, use a design-supported alternate placement where
one is available; full-colour marks keep their colours and are served by an intentional well the
DESIGN provides, never by the platform painting a generic repair field.

`markFieldFor` is gone. `markTreatmentFor` (`pro/language/paint.ts`) returns a `knock` or a
`none`, and there is no third answer that paints anything:

| the mark | what happens |
|---|---|
| single ink, reads on the panel | nothing |
| single ink, under the floor | its one ink is knocked to white or black, whichever measures better on that panel, and it sits ON the panel |
| single ink, under the floor, and no knock clears it either | **left exactly as supplied**, with `pro-mark-unreadable` naming the number |
| full colour (`inkSpread` over the single-ink band) | nothing - the colours are the identity |
| brings its own field | nothing |

**The third rung is honest rather than implemented.** The composed Pro graphic draws no second
placement for a mark today, so "a design-supported alternate placement" has nothing to select; the
code declines to alter the artwork and says why instead. When a Pro composition grows a second
mark position, that is where it plugs in.

**Measured on the exact graphic that produced the finding** (`news-public.aldervale`, recomposed
free from its own saved `language.json`): the monogram probes at ink luminance 0.0200 and
`inkSpread` 0.00038 - single ink by two orders of magnitude - and read **1.01:1** on the `#14264a`
panel. Knocked to white it reads **14.89:1 on the panel itself, with no field behind it**. The
ledger row carries `mark_ink_knocked` and `pro-mark-knocked`.

**It also fixed the other half of §17.1 for free.** The field was what set the mark's column to
`align-self: stretch`, so removing it returns the crest to the shared slot's own vertical
centring - the "not really centered on anything, aligned with the top line row" complaint. One
change, both halves.

### 17.7 The as-is screen now admits exactly one alteration

A knock is a CSS `filter`, and `assetIntegrity.ts` refuses every filter on a picture the user
marked "use it as it is" - so this ruling and that one collide, and the collision is real rather
than a technicality. Both are the owner's, and the resolution is to make the exception the
narrowest thing the screen can express rather than to loosen the screen:

- the selector must be the platform's own knock class (`.{prefix}-logo--knocked`), which only
  `markKnockCss` emits and which the shared slot only writes when the composer asks for it;
- the declaration must be exactly `brightness(0)`, optionally `invert(1)` - the two shapes that
  are pure recolours;
- the rule must declare NOTHING ELSE.

**Mutation-checked, 9 cases** (`local` runner, reproducible): both legal knocks admitted; a blur,
a `brightness(0.4)`, a drop-shadow, the knock on a non-knock selector, and the knock beside a
`clip-path`, a `border-radius` or an `object-fit: cover` all still raise their blocking errors.
The e2e spec runs the REAL screen over the REAL emit, so the two rules - written in different
files, for different reasons - are proven to meet.

**Why this is a recolour and not a distortion**, stated because it is the part worth arguing with:
what a brand manual protects a mark from is being cropped, squashed, masked or shadowed, and every
one of those is still refused. A single-ink mark supplied as a mono knockout is what broadcast has
always used, and the alternative on a dark panel is a mark nobody can see or a box the owner has
now twice objected to.

### 17.8 The plate instrument - 2026-08-16, and the constant that hid the defect

**The hole was one constant.** `BROADCAST_BACKDROP` (`model/cssVars.ts`) is a single near-black
card, `rgb(16, 18, 22)`, and every contrast number this repo computes is computed against it. A
near-white super measures 14:1 there and 1.1:1 over a bright sky. Nothing in the tree was asking
the second question, which is why `minimalist.ledger` passed every gate and lost to the first busy
plate a human put behind it. The file itself already said the stand-in was a stand-in; what was
missing was anything that measured the other end.

**Two instruments, because there are two situations.**

`src/validation/plateLegibility.ts` measures an ARBITRARY rendered graphic: it composites every
painted ancestor over each of three plates - a night exterior, a mid-tone shot, a blown-out sky -
and reports text that misses its WCAG floor. It has to infer the surface from the DOM, and it
under-detects: a panel drawn as a positioned SIBLING is invisible to an ancestor walk, which is
why `lt49` reads as surface-less when its frame plainly is not. **Its numbers are an upper bound
on findings, and it reports rather than gates.**

`platePlan` (`pro/language/paint.ts`) measures a PRO graphic, where nothing is inferred: the
composer chose the surface, so it composites its own ink over its own surface over the same three
plates. Exact. It reaches the ledger as `pro-plate-legibility`, a warning.

**Both mistakes I made building it are worth more than the instrument.**

- **A threshold invented instead of measured.** The first version asked whether an ancestor's
  background was opaque "enough" - a 0.92 floor this file made up - and called **62 of 90** lower
  thirds surface-less. `ls29`'s panel is `rgba(10, 12, 16, 0.86)`: plainly a panel, a tenth of a
  point under a number nothing supported. A translucent panel is not the absence of a surface; it
  is a surface that lets a computable amount of the picture through. Compositing replaced the
  threshold and there is now no floor to argue about.
- **A rule calibrated on the wrong distribution silenced the motivating case.** The second version
  required TWO failing plates, on the reasoning that one is an extreme a designer may accept -
  calibrated on the catalog, where failures cluster on the blown-out plate. `minimalist.ledger`
  sets a MID-GREY supporting line: **5.7:1 on a night exterior, 3.2:1 on a blown-out sky, 1.14:1 in
  the middle.** It fails the MIDDLE and passes both extremes - precisely the shape a single dark
  stand-in can never see - so the two-plate rule silenced the one graphic the instrument existed
  for. Any plate under the floor is now reported, and the finding names which one.

**Measured, after the fixes.** The graphic that produced the complaint: heading **1.22:1** and
supporting line **1.14:1** over a mid-tone shot, both reported. The two solid-panel graphics from
the same round that the owner accepted (`news-public.aldervale`, `sports-live.kestrel`): silent.
That pairing is the test - it fires on what a person could not read and stays quiet on what they
kept.

**What the catalog sweep says, as a REPORT and nothing more**
(`node scripts/plate-legibility-sweep.mjs`, free): of 90 lower thirds, 42 clear every plate, 9
miss only the blown-out extreme, 34 miss two, 5 miss all three - some of those five being the
sibling-panel blind spot above rather than real. **A large part of the catalog quietly depends on
the footage being dark**, which is a fact nobody had measured and not, by itself, a defect: glass
and panel-less designs are deliberate compositions. Nothing is gated on this. The number that
would justify gating does not exist yet.

### 17.9 ls17's dead space - 2026-08-16

Measured before touching anything, which is what made the fix a one-liner instead of a redesign.
`.lower-third-accent` carried `margin: 15px 0 13px`, and its own source comment defended the
bottom half: it "holds even when the rule closes the strap with no institution under it". With no
institution line (`f3` is emitted only when the design is created with four lines) the rule IS the
last child, so those 13px sat on top of the panel's own 26px of padding - **39px of nothing under
a 2px hairline.**

**The gap now belongs to the line it separates.** The rule keeps its air above; the 13px moved to
`.lower-third-extra`'s `margin-top`. A space owned by the element it sets apart cannot outlive it,
so no selector trick is needed - no `:last-child`, no `:has`, nothing an older CasparCG build
would have to support.

| | before | after |
|---|---|---|
| two lines (no institution) | strap 130px, 13px under the rule | **strap 117px, 0px under the rule** |
| four lines | strap 196px, 38px under the rule | **strap 196px, 38px** - byte-identical |

The rule is emitted unconditionally and stays that way: the animation data keyframes that node by
selector, so an element that came and went with a field would leave the timeline and the
line-reveal preset addressing something that is not there. That was already the right call and the
comment defending it is kept; only the margin moved.

**Catalog gates, all green after the change**: `type-floor`, `numerals`, `field-coverage`,
`overflow-sweep --baseline` and the lower-third `l3-sweep` (whose ls17 frame shows the four-line
composition unchanged).

**The baselines moved with it, and that is the point of them.** `e2e/catalog-baseline.spec.ts`
holds two: a SOURCE hash per emitted pane, expected to move when a design's CSS deliberately
changes, and a RENDER fingerprint of the settled graphic's computed styles and geometry, which is
the one that "must NOT move". Here it moved on purpose and the diff proves the scope: **two hashes
in the whole 460-variant catalog** - ls17's `css`, and the single element
`div.lower-third-mask[2]` whose box the margin left. Re-recorded with the documented flags
(`UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1`).

Worth noting for the next catalog change: the local affected plan ran the catalog calibration
TRIPWIRE (`catalog-bench`), which measures whether a graphic still passes its bench, and that is a
different question from `catalog-baseline`, which pins the emitted bytes and the rendered geometry.
CI caught the second one. A catalog edit wants both.

### 17.10 Correcting §17.8 - the blind spot was not the blind spot

§17.8 reported **48 of 90** lower thirds and blamed the residue on the instrument being unable to
see a panel drawn as a positioned SIBLING, naming `lt49` as the example. **That diagnosis was
wrong**, and the check that disproved it took two minutes: `lt49`'s panel is an ordinary ancestor
background, `rgba(8, 10, 20, 0.94)`, which the walk finds perfectly.

What was actually happening is a better bug. The instrument conflated two different failures:

- **the picture shows through** - white text at 19.91:1 over a night exterior and **1.08:1**
  against a blown-out sky (`lt01`). Legibility depends on the shot. This instrument's business.
- **the design's own surface is too close to its ink** - `lt49` and `ls18` set a saturated blue on
  a 94%-opaque panel and read 4.46 / 4.25 / 3.99, missing the 4.5 body floor on all three plates
  and barely moving between them, because an almost-opaque panel hardly lets any plate through.
  `lt55` sets a near-black ink on a near-black panel: 1.0 to 1.37 everywhere. **Not a plate
  finding at all** - that is the ordinary contrast question the runtime bench already asks.

Both instruments now require the picture to be what makes the difference: text that misses the
floor on EVERY plate, including the friendliest, is not reported here. Putting this instrument's
name on somebody else's finding is how an instrument stops meaning anything.

**Corrected number: 43 of 90** - designs that clear the floor on at least one plate and miss it on
another. 47 clear every plate; the five that failed all three (`lt49`, `lt55`, `ls11`, `ls18`,
`ls22`) are now correctly silent here and belong to the contrast gate instead.

**The sibling limitation is still real in principle and no longer claimed as a finding.** The
ancestor walk cannot see a panel painted by a positioned sibling; no design in this catalog was
shown to rely on one, and the case that was attributed to it turned out to be something else. If
a design ever does, `document.elementsFromPoint` at the text's centre is the browser's own answer
and the place to start.

### 17.11 The round, recomposed - 2026-08-16

The evidence page still showed the mark plate the owner rejected, because its frames were the
paid round's and the composer had changed underneath them. `scripts/pro-spike.mjs --recompose`
(free) rebuilds a finished round from each generation's saved `language.json` through TODAY's
composer and re-shoots it transparent.

**That is what makes a design ruling cheap to see across a whole round.** The language is the
artefact the money bought; everything after it is deterministic, so 18 graphics were re-rendered
for nothing after the knock landed. **One cell changed** - `news-public.aldervale`, from
`mark_field_painted` to `mark_ink_knocked`, exactly the graphic the read named - and the other 17
recomposed byte-for-byte in their adjustments.

**The paid frame is kept beside the new one wherever the answer moved**, captioned "as the paid
round produced it". A round's own record of what it produced is not something a later change gets
to overwrite, and a platform change that is visible as a CHANGE is worth more than a page that
quietly looks correct. For the same reason the validator rows on a recomposed cell are now
labelled "(the paid round, before the composer changed)": the graphic is new, that verdict is
not, and mixing the two eras silently is how a page starts lying.

## 18. The nine structure margins, measured - 2026-08-16

`structure.ts` states a margin against every calibrated instrument threshold, and that table is
the whole argument for Phase A's doctrine: the platform composes in the unit the instruments
measure in, so a threshold is cleared **by construction** rather than by inspection. §15.5 repeats
six of those numbers as the reason to believe the doctrine.

**Exactly one of them had ever been rendered.** That one - the mark's clear space - had already
come back 0.31 and 0.46 against a stated 0.4, wrong in both directions, which is what a derived
number does: it reports the CSS the composer writes rather than the box the browser paints.
Line-height leading, the mask idiom, a size floor firing above the anchor a ratio was taken from,
a block's own padding riding on a line gap and a fit-content panel sized by its own text all move
it. So the rest were rendered too.

### 18.1 The sweep

`node scripts/spike-structure-margins.mjs` - free, no model call, ~18 minutes. **582 cells**:
density x type step x accent form x panel treatment x graphic type x mark arm, each composed
through `composeGraphic` + `composeDocument` at 1920x1080 and read by the LIVE `measureSpacing` /
`measureProportion` with **that type's own thresholds** (`PRO_GRAPHICS[id].instruments`), at the
control's words and again at the stress words - **1164 readings**. Nothing is re-implemented: a
sweep that recomputed the ratios would be measuring the driver's opinion of the composer.

Three decisions in it are worth carrying to the next sweep of this shape:

- **The panel and corner axes are REDUCED, and the reduction is earned rather than assumed.** The
  grid sweeps `solid` and `none` and one corner; a separate pass re-measures all four of each at
  the extreme cells and fails the run if any geometric number moves. Both held.
- **The typographic voice is a second pass, not a grid axis** - all 17 bundled faces and all 12
  case/tracking combinations at the tightest and airiest cells. It found the only skew reading in
  the round that is not exactly 1.00.
- **The page is recycled every 40 cells.** The first attempt died at cell ~130 on renderer memory
  and would have reported a "worst" taken over the cells it happened to reach - the most dangerous
  shape a measurement can have, because it looks complete.

### 18.2 What each claim said, what it measured

| claim | threshold | stated | MEASURED (worst, whole package) | where |
| --- | --- | --- | --- | --- |
| `padding-tight` | floor 0.28 | 0.34 | **0.33** | strap, compact |
| `padding-lopsided` | limit 2.6x | "exactly 1.0x" | **1.00** on 790 of the 792 readings that have one, **1.06** worst | one bug in Oswald |
| `lines-adrift` | ceiling 1.4 | 0.83 | **1.20** | countdown, airy + block accent |
| `text-crowds-rule` | band 0.02-0.12 | 0.45 | **0.14** | countdown, compact + block accent |
| `type-ratio-thin` | floor 0.28 | 0.36 | **0.35** | strap, compact + strong step |
| `type-ratio-flat` | band 0.86-0.93 | 0.62 | **0.63** | countdown, subtle step |
| `panel-oversized` | fill floor 0.18 | ~0.47 | **0.34** | countdown, airy + strong step |
| `footprint-large` | ceiling 0.10 | ~0.071 | **0.08** control words, **0.14 stress - BREACHED** | strap, airy |
| `mark-oversized` | ceiling 3.2 | 1.2 | **1.56** strap, **2.67** bug (ceiling 5.5 there) | square crest at the slot's cap |
| `mark-crowded` | band 0.35-2.1 | 0.48 seated / 0.72 banded | **0.48** strap (confirmed), **0.83-0.87** bug | - |
| `text-escapes-panel` | - | "structurally impossible" | **zero escapes in the 792 readings that have a panel** (confirmed) | - |

**Two survived and nine moved.** What survived is the structural claim and the one reading anybody
had ever rendered. Two of the nine are worth more than their arithmetic:

- **`text-crowds-rule` was out by 3.2x, and the stated number was measuring the wrong thing.** A
  strap's own rules do sit at 0.44 and up, which is what 0.45 described. But the `block` accent
  form paints a slab, a slab is a rule the instrument measures text against, and the gap to it is
  the **line gap** (`DENSITY_SPACE.compact.lineGap` = 0.14), never `RULE_GAP_RATIO`. Two forms,
  two clear spaces; the table had read the constant instead of the frame. 0.14 against a band that
  ends at 0.12 is still clear, by 0.02 - so compact's line gap is now a number with a rule-gap
  consequence, and that is written where it lives.
- **`padding-lopsided`'s "exactly 1.0x" was a claim about CSS being read as a claim about
  pixels.** Opposite sides really are equal in every declaration this file writes. The instrument
  measures panel edge to the bounding box of what the panel holds, and a face whose ascent and
  descent sit asymmetrically in its line box moves that box without moving a declaration. 1.06
  against a 2.6x limit: free, and worth knowing the mechanism.

### 18.3 The one margin this composer does not have

`footprint-large` **is breached**, and it is recorded as a breach rather than retuned.

A long name and a 60-character role at airy density widen the fit-content panel to the auto-fit
cap, and the strap then covers **14% of the frame against a 10% ceiling** - on **59 of the 162
strap stress readings that produce a footprint at all** (36%; a panel-free super has none), 46 of
them airy, and **zero at the control's words**. For scale: the instrument's ceiling was calibrated where the
catalog's largest shipped design is 0.09 and the owner's own *"the box is way too big"* sat at
0.12. At the control's words nothing fires and the strap measures 0.07, which is why every
previous look at this number agreed with the claim.

Nothing here fails. `proportionCheck` REPORTS and does not gate, for the reason it states - a gate
that failed a deliberate full-bleed composition would be teaching designs to be timid - and this
round changed no threshold and added no gate. **What changed is that the file no longer claims a
margin it does not have.** Density is the lever (46 of 59 are airy) and whether an airy strap
should hold its width against a long role line is a design decision, not a threshold to move; it
is a question for a blind read, not for this sweep.

### 18.4 `markHeightPx` is read, and the strap's value is the wrong description

A handoff proposed deleting `markHeightPx` from `ResolvedSpacing` as unread. **It is read** -
`composeBug.ts:170` floors the tile's padding at a quarter of it, because on a sponsor bug the
mark is the graphic and the tile's air belongs to it. There the numbers are exact: the stacked
slot paints a fixed 64px with 20px beneath, and both are transcribed.

The strap's pair is a different matter and the sweep is what caught it. `gapPx` 26 is exact (the
slot's own `MARK_CLEAR_PX`), but `heightPx` 65 is one wordmark's rendered height from the §15.8
round, not the slot's rule: `logoSlot.ts` gives the side-by-side arrangement a **cap**
(`MARK_MAX_HEIGHT_PX` 84) with `height: auto`, so the artwork's aspect decides. A square crest
reaches the cap at **1.56 type sizes**, which is where the table's "mark 1.2" came from and why it
was wrong. Corrected in the comment rather than in the number: nothing spends the strap's
`heightPx`, and changing it would move a fallback for a type that never uses it while leaving the
one real caller untouched.

### 18.5 What this says about the doctrine

The doctrine holds and its statement was too strong. Composing in the instrument's own unit is
what makes every one of these margins **knowable** - eleven numbers, one free sweep, no model in
the loop, and each one attributable to a named constant. That is real, and no other engine this
project has built could produce that table at all.

But knowable is not clear, and "a threshold is cleared by construction" was doing the work of
"cleared, and here is the number" without anybody having rendered the number. Nine of eleven had
drifted from what paints, one of them past its ceiling. **A ratio derived from the CSS a composer
writes is an assertion wearing a measurement's clothes** - which is the same finding as
`bench-line-wrap`, as the gate that computed `pass` without reading its own warnings, and as the
control that did not run the code under test. The margin table now carries the cell that produced
each reading, so re-running it is one command and disagreeing with it needs a frame.

## 19. A second checkpoint, read blind beside the first - 2026-08-17

The accepted 2026-08-16 set (§17.4) had been read once, and nothing had ever been read against
it. `gemini-3.7-flash` was run through the identical bank - same 12 briefs, same synthetic
brands, same `assignment` and `divergence` fixture, same pinned decoding - so the two rounds
differ in the CHECKPOINT and in nothing else that was chosen. Both were then recomposed through
today's composer, which takes the composer out of the comparison as well, and put on ONE shuffled
page with the frames copied under their issued id so neither the round nor the brief is readable
from the page source (`scripts/pro-round-compare-gallery.mjs`, free).

**18 of 18 cells, `CONTRACT OK` on every one, 0 repair rounds, 0 fields fallen back to the house
language, $0.107.**

### 19.1 The owner's read - a whole-set pass, on both checkpoints at once

> "I think they all look good, no big problems! I like it!"

36 items, no defect named on any of them, no item singled out - and the owner did not know which
half was which, so the verdict does not divide by checkpoint. For the 2026-08-16 round that
**repeats its own accepted read through a composer that has changed since**, which is worth
having on its own. For 3.7-flash it is the first read of any kind and it names nothing either.

**This is the second consecutive Pro round with no layout, palette, type or motion failure
named.** Under the §15.3 ranking that is what "removing the decision" was supposed to buy, and it
is now holding across two different checkpoints rather than one.

### 19.2 What a per-item read structurally cannot see

**The entire machine difference between these two rounds is a BETWEEN-item property, and a
per-item read has no access to one.** 3.7-flash answered `solid` on 17 of 18 panels against 12
of 18, used 5 distinct accents against 6, and its accents sit **0.196 apart in OKLab against
0.282**. Every one of those graphics can be good on its own page while the ROUND is narrower than
the one beside it - the items are individually fine and collectively more alike.

That is not a hypothetical failure mode here: **sameness is Lite's open problem, and it was found
by a matrix, never by a gallery** (src/ai/AGENTS.md). A page that shows one graphic at a time is
the wrong instrument for it, and this read used that page. **"Is the narrower vocabulary a
problem?" is open, and 19.1 did not ask it.** The surface that would ask it is the two rounds'
set-gallery rows side by side, which nothing built yet.

### 19.3 What the numbers say, none of which the read contradicts

Full table in `benchmarks/pro/evidence/round-2026-08-17/language-diff.md`
(`scripts/pro-language-diff.mjs`, free, counts only, no verdict on it).

- **The two rounds billed the same money for opposite reasons** - $0.1070 against $0.1072 over 18
  generations each. 3.7-flash charges 1.5x the completion rate ($3.75/M against $2.50/M) and
  emits **21,141 output tokens against 38,652**, so rate and volume cancel almost exactly.
- **81% of 3.7-flash's output is reasoning** (17,220 tokens) for an answer that is ~200 tokens of
  enum values. `GeneratedLanguage.usage` carries `reasoning` from this round on; the 2.5-flash
  round has none recorded and the diff says so rather than printing a zero. A probe measured
  2.5-flash at 92% on the same brief.
- **Brand adherence 18/18 on accent, panel AND typeface**, against 17 of 18 each.
- **Neither round collapsed**: 18 distinct look signatures out of 18 cells on both sides.
- **`typography.step` is `clear` on all 36 cells across both rounds.** Neither checkpoint has
  ever returned `subtle` or `strong` - a third of that enum has never been exercised by a model,
  which no round had noticed because no round had counted.
- The composer repaired **1 cell of 18 here against 4 of 18 there** - one mark ink knock, against
  three text-dim clamps, a text clamp and the same knock.

### 19.4 The price, settled by arithmetic rather than by a price sheet

Vercel's model page says **$0.75 / $3.75** per million and OpenRouter says $0.375 / $1.875. The
gateway bills the former, and what settles it is a real billed call rather than either page:
`1113 x 0.75 + 1168 x 3.75` = **$0.00521475**, which is what the provider reported to the cent.
`internal_reasoning` priced at 0 does NOT mean thinking is free - reasoning tokens sit inside
`outputTokens` and bill at the completion rate, which is the whole reason 19.3's cost line lands
where it does.

### 19.5 `--recompose` is not byte-stable, and two runs are what proved it

Recomposing the 2026-08-16 round moved 3 of its 36 frames against the committed ones - all three
kestrel cells, the ones set in Anton. **Running the identical command again, with no code change
in between, moved 2 of the same 3 again** (0.43% and 0.37% of pixels at max channel delta 97 and
65), while the third reproduced exactly.

Two consecutive runs of the same code disagreeing is what settles it as run-to-run variation
rather than the composer moving. `results.json` was byte-identical across all three runs, so no
cell's `recomposedAdjustments` moved and §17.11's "recomposed byte-for-byte in their adjustments"
- a claim about the LEDGER - still holds. **The mechanism is not diagnosed and is deliberately
not guessed at here** - §20 is that diagnosis, measured the next day, and the frames named here
are the three it fixes. The rule it buys: *a recomposed frame diff is not evidence the composer
changed until the recompose has been run twice.* The committed frames were restored rather than
churned, since neither version is more correct than the other - which is what §20.3 revisits, once
one of the two versions had become the reproducible one.

## 20. Why a recomposed frame moved without the composer moving - 2026-08-17

`--recompose` rebuilds a finished round from each generation's saved `language.json` through
today's composer (§17.11), and the whole reason that is cheap evidence is the claim underneath it:
**the language is the artefact the money bought, and everything after it is deterministic.** A
frame that comes back different twice makes that a claim rather than a fact, and three frames did
- recomposing the 2026-08-16 round moved 3 of its 36 against the committed ones, and running the
identical command again moved them again.

### 20.1 The bisect: everything the platform decides was byte-identical

Five runs of the five kestrel cells (ten frames), hashing each stage:

| stage | across 5 runs |
| --- | --- |
| `language.json` | identical (it is read off disk) |
| `composeFromLanguage` html + css + js | **identical** |
| `composeDocument` srcdoc | **identical** |
| `result.adjustments` (the ledger row) | **identical** |
| every element's rect to 4dp + 19 paint-relevant computed styles | **identical** |
| the captured PNG | **3 of 10 moved; one cell produced 5 distinct files in 5 runs** |

So the composer is exonerated by measurement, not by argument, and the ledger claim §17.11 makes
("recomposed byte-for-byte in their adjustments") is confirmed a second time. The differences sit
only on **glyph and panel edges**, with the three colour channels moving together - the shape of
one raster of the same content against another, not of a layout that moved.

Four plausible causes were tested and are NOT it: Anton is a single-weight face asked for at
`font-weight: 700`, so every kestrel cell renders **synthetic bold** - forcing weight 400, and
separately `font-synthesis: none`, changed nothing; `--disable-gpu` changed nothing;
`--disable-lcd-text` changed nothing; a fresh page per shot rather than a reused one changed
nothing. Two consecutive shots 1.5 s apart **inside one page load are always identical**, with
GSAP's global timeline holding zero live tweens - so it is not an unsettled animation either.

### 20.2 What it is: a texture rasterised mid-entrance and never redrawn

`.lower-third-box` carries `will-change: transform, opacity`, so Chromium promotes it to its own
compositing layer for the life of the page. The entrance moves that layer. Chromium rasterises the
layer's texture **while it is moving**, and because the hint says more transforms are coming it
does not re-rasterise once the tween settles. The frame we keep is therefore a texture rastered at
whatever sub-pixel phase of the ~0.5 s entrance the last raster happened to catch, composited at
the settled transform - which is why the variation is continuous (5 runs, 5 files) rather than a
flip between two states, and why it is stable within a load.

Two independent interventions confirm it, and they agree **byte for byte**:

- **Drop the hint for one frame after the graphic has settled**, then restore it. That invalidates
  the layer, so the settled content is rastered once at the offset it rests at.
- **Fast-forward the entrance** (`gsap.globalTimeline.timeScale(1000)`), so the only raster that
  ever happens is the settled one.

Ten frames, five runs, byte-identical under either. The first is what ships in
`rasterSettledFrame` - the second would also fast-forward a timer graphic's own clock.

A third intervention stabilises the frames and is **wrong**: leaving the hint off through the shot.
A still painted straight into the page instead of into a layer switches text to sub-pixel
antialiasing, moving a glyph edge by up to **233/255** with the channels visibly disagreeing. That
is a different picture, not a stabler one - which is the trap in "the frames stopped moving, so it
must be fixed".

### 20.3 Blast radius on the recompose evidence that already exists

Two full `--recompose` runs of round-2026-08-16 are now byte-identical across all 36 frames, and
`results.json` is byte-identical to the committed one. Against the **committed** frames:

- **33 of 36 are byte-identical.** The fix costs nothing on evidence that never moved, which is
  the property that makes it safe to apply to a round a human has already read.
- **3 changed** - `sports-live.kestrel.hold`, `sports-live.kestrel.stress`,
  `long-name.kestrel.hold`, exactly the three that were never reproducible. Each moves 0.17-0.45%
  of pixels at max channel delta 59-91, the same band the run-to-run noise occupied, so no design
  ruling in §17 or the blind reads is disturbed. They are committed rather than restored this
  time: one of the two versions is now reproducible and the other was one draw from a continuum.

The rule §17.11 bought stays worth keeping - *a recomposed frame diff is not evidence the composer
changed until the recompose has been run twice* - but the reason has changed. It is no longer an
undiagnosed wobble; it is a promoted layer, and a run that still disagrees with itself now means
something new is wrong.

### 20.4 The product question this leaves open

Nothing above is specific to Pro. `will-change` is declared in CSS **permanently** on this box
and on animated elements throughout the catalog, and permanently-promoted layers are exactly what
the property's own guidance warns against. If Chromium keeps a mid-entrance texture for a
recomposed still, it keeps one **on air** too: the settled graphic goes on showing the softer
raster until something else invalidates the layer. That is a catalog-wide motion-CSS question -
whether the hint should be dropped when the entrance completes - and it is not answered here,
because measuring it belongs on a rendered graphic in playout, not on a screenshot runner.

### 20.5 The control run had the same defect, and now it is fixed

`captureHold` - the free `--control` run's capture, and the reference every paid round is judged
against - mounts, plays and settles exactly the way the recompose did, so it was measured the same
way, and it failed the same way: **two runs of the identical command disagreed on 7 hold frames.**
Three were named as the promoted-layer raster (`anchor-adapt-1.hold`, `anchor-adapt-1.stress.hold`,
`language-volt-matchday.hold`); the other four were `language-countdown-*` and were written off as
honest, on the reasoning that a live clock SHOULD differ between runs.

`rasterSettledFrame`'s step now runs inside `captureHold` too, written out inline because the
graphic lives in a same-origin srcdoc frame and there is no Playwright handle for that document,
only `win` from the parent.

**Measured 2026-08-17, four full `--control` runs into separate `--out` dirs on an otherwise idle
machine (~8.5 min each, no skips, no errors):**

| diff | identical | differ |
| --- | --- | --- |
| fixed run A vs fixed run B | 40 of 40 | **0** |
| fixed run A vs fixed run C | 40 of 40 | **0** |
| fixed run B vs fixed run C | 40 of 40 | **0** |
| fixed run A vs an UNFIXED run | 28 of 40 | 12 |

So the capture is reproducible across three runs spread over half an hour, and the fix is
**narrow**: it leaves 28 of the 40 holds byte-for-byte as they were, which is the same result the
recompose fix had - it costs nothing on evidence that never moved.

**The hold set is 40 frames, not the 42 recorded above** - 20 briefs, each shot normal and stress.

**And the four countdown frames were most likely never honest.** `src/templates/shared/clock.ts`
anchors on `Date.now()` and repaints every 250 ms, so the digits are a function of time ELAPSED
since `play()`, not of absolute wall time - and the hold is shot a fixed ~1.9 s after it, well
inside one whole second, so the same digit is drawn every run. Before the fix, 4 of the 8
`language-countdown-*` frames moved; after it, 0 of 8 move across three runs half an hour apart.
Four of eight is what a shared defect looks like sampled twice, not what a clock looks like. The
residual risk is real but different from the one recorded: if that ~1.9 s ever jittered across a
whole second the digit WOULD change, so a byte diff over this set still has to read a countdown
difference as inconclusive rather than as a regression.

The guard that parks browser work also counted `scripts/dev-bench.mjs` as a running sweep, because
`SWEEP_SCRIPTS` matched `[\w-]*bench[\w-]*` and that script is a long-lived dev SERVER, not a
finite job - so did `bench-dispatcher.mjs`, the module that server preloads and which therefore
shares its command line, which made one bench server report as two active jobs. Fixed first, as
its own commit: `SERVER_SCRIPTS` carves the three server scripts back out of the alternation.


## 21. The free-form coder round on four checkpoints - 2026-08-17, machine half only

Premise 1 (§15.4) had been measured to fail only on non-reasoning open-weight checkpoints, and
panel layout is a spatial-reasoning problem - so the untested argument was "a 2026 reasoning
model composes where those could not". Four checkpoints ran the identical protocol: the 12-brief
bank, the `none` arm (the free-form coder, no exemplars), assigned brands, pinned decoding, no
divergence cell, one out-dir per checkpoint, cheapest first. The blind page (64 items - all four
rounds interleaved with the accepted Phase A set, ids reissued) and `machine-columns.md` are in
the round archive; **the owner's blind read is OWED and nothing here is a verdict on the look.**

What the machine half already says:

- **The device proxy is approximately zero on every checkpoint** - 1, 1, 0 and 2 of 12
  (`deviceCheck.ts`, mutation-checked both directions before any spend). Four models across
  three vendors, one of them a frontier reasoning model, and the two live lines land as two
  rows in one plain box on ~92% of cells. Per the round's own pre-registered reading: when the
  device rate is flat across checkpoints INCLUDING the frontier ceiling, the SPINE is what
  flattens it, not the checkpoint - the structure-spine contract hands every model the same
  safe plain-panel answer. **A `bare` arm (drop the spine, keep the field contract) is the next
  session's build, with the editability trade written down.**
- **Contract compliance is no longer the differentiator**: 10, 10, 12 and 12 of 12 scaffold-ok,
  and claude-opus-5 needed zero repair rounds across the bank - the first checkpoint ever to.
- **Output volume answers the owner's second question, and rate-is-not-cost holds again**:
  ~6.6k/6.9k/6.7k/5.1k output tokens per graphic - nobody near the modelled 12k, and the
  frontier model emits the LEAST. Reasoning share where reported: 35% / 58% / 49% (the
  anthropic route reports no split, stated as not-recorded rather than zero). Cost per
  graphic: $0.0097 / $0.0274 / $0.0310 / $0.169-priced - 17x between cheapest and dearest for
  the same contract compliance and the same flat device rate.
- **grok-4.3 has a reasoning runaway**: `portrait-logo.sunbeam` and `non-latin.aldervale`
  truncated at a 25,000-token output ceiling and AGAIN at 41,000 after
  `REASONING_HEADROOM_TOKENS` was raised to the newly measured worst case - >41k tokens of
  thinking with no complete answer, twice, on briefs its siblings finish in ~7k. Its round is
  10 of 12 and says so.

### 21.1 The owner's blind read, and the verdict - premise 1 is RETIRED

The read came back the same day, 59 of 64 items rated, notes written before any reveal
(`notes.md` in the round archive holds them verbatim plus the join). Airable rates over rated
items: **the platform-composed Phase A control 14 of 15 - and the four coder arms 3/11, 2/9,
5/12 and 3/11 (~30% together)**, on one interleaved blind page, same briefs, same brands. The
frontier reasoning model is not an outlier: claude-opus-5 landed 3 of 11 beside minimax's 3 of
11 at 17x the price.

- **The dominant defect class was predicted by the instruments before anyone looked**: "the
  line is on top of the text" accounts for ~13 of the 30 coder failures, and `text-over-rule`
  had already fired on almost exactly those cells (grok 6 of 6, gemini 6 of 6). The remaining
  classes are mark plates (the class the composer's knock rule closed a round ago), junk
  furniture above the strap, and undersized or misaligned marks - plus minimax's two
  runtime-dead cells, which are exactly its two blocking-error cells. Machine and human agree
  everywhere they measure the same dimension.
- **A device did not buy a pass**: of the 5 coder cells carrying one, 1 passed - and the opus
  monogram-K device is one of the pieces of furniture the owner rejected by name. The §20
  spine question stands as a fact about the harness, but it no longer carries a product
  premise: even where a device exists, the composition fails on collisions and mark treatment.
- **So premise 1 (§15.4) retires on the strongest evidence it will ever get**: a 2026 frontier
  reasoning model, inside the shipped harness, with the repair loop, lands at a quarter of the
  platform-composed acceptance rate for 17-50x the cost of a Phase A language call. Phase A is
  not a compromise; it is the answer. The `bare` arm remains a research option for the spine
  question and is NOT a product path - running it would be spending money to refine the size
  of a gap the product has already routed around.

### 21.2 The iterate arm - the custom lane earns its test read, 2026-08-17

The owner redirected the retired premise the same day: Pro's custom lane should let the model
ITERATE - render, measure, fix - as long as it needs, fail closed on anything still flawed, and
cost little enough to beat opening a code assistant by hand. `src/ai/spike/iterate.ts` +
`scripts/pro-iterate-spike.mjs` are the smallest honest version: the one-shot coder protocol,
then up to four rounds of every instrument finding plus a downscaled screenshot of the model's
own frame, `deliverable: false` a first-class result. The loop's own control run proves the
collector is quiet on a known-good frame and loud on a forced overlap (moving a field inside
its own mask is INVISIBLE - the mask is what must move; the check failed honestly first).

**The blind read (42 items - both iterate arms + the accepted Phase A set interleaved):**

| round | blind-airable | cost/graphic | calls/graphic |
| --- | --- | --- | --- |
| Phase A composed set | 18 of 18 | $0.006 | 1 |
| gemini-3.7-flash iterate (vision on) | **9 of 12** | $0.128 | 2.8 |
| minimax-m2.7 iterate (findings only) | **9 of 12** | **$0.0155** | 2.7 |

Same models one-shot that morning: 5/12 and 3/12. Three readings that decide what gets built:

- **The findings ARE the signal.** Minimax, shown no screenshot at all, matched
  gemini-with-vision at an eighth of the price. The instruments' words move the model; the
  picture adds little the words did not already say. The custom lane can run on a cheap
  checkpoint.
- **The fail-closed gate is roughly calibrated but over-strict on marginal findings**: of 4
  dirty-stopped cells the owner failed 2 and forgave 2; of 19 delivered-clean cells the owner
  passed 15. The four escapes name the missing instruments, all measurable: junk furniture
  above the strap, a live field that never paints (compose `fieldPaints` into the spike
  validator - the Lite lesson repeating), the mark centred in its own white space (the read's
  most repeated nit), and a painted-text readability floor (size + contrast "for TV").
- **Phase A stays the standard lane untouched** - 18/18 on its third consecutive blind read,
  still 1 call and half a cent. The iterate loop is the CUSTOM lane behind the same Pro door,
  slower and ~3-25x dearer, for briefs the catalog's structures cannot carry.

## 22. The custom-lane TYPE SWEEP - 2026-08-18, machine half only

The §21.2 redirect asked whether the loop GENERALIZES: does render-measure-feed-back hold past
lower thirds, do the two surviving checkpoints separate on harder types, and does an emitted
multi-step graphic drive through the SHIPPED control layer. One night answered the machine
half; **the owner's blind read of the 49-item page is OWED and nothing here is a verdict on
the look.** Protocol: the same iterate loop, 21 fresh briefs over seven types (3 each:
lower-third, scoreboard, quiz-board, ticker, stat-panel, countdown, podium-score -
benchmarks/pro/v1/custom/briefs.json), six brands (two NEW: Pulse Arena, Boreal), max 4
iterations, fail-closed. The platform-authors-machines rule held: a stepper brief declares its
steps as the SPX default path, the model implements `window.next()`, no machine key exists
anywhere in the round. Round archive: `benchmarks/pro/evidence/round-2026-08-18-typesweep/`
(the frames and blind page are in the external eval archive, `typesweep-*-2026-08-18`).

Four instruments the §21.2 escapes named ran for the first time, each calibrated or
mutation-checked free before any spend: fieldPaints composed into the loop's validator (with a
sentinel step-walk where one state is not the whole answer), a readability floor - which the
control IMMEDIATELY recalibrated from 22px to 18px because lt27 ships a 20px supporting line,
the mark-gap lesson arriving on schedule - step capture along the declared path, and per-type
thresholds with spacing/proportion findings on uncalibrated types fed as ADVISORY so a
lower-third number cannot bully a scoreboard.

What the machine half says:

- **The loop generalizes unevenly, and the gap is the TYPE, not the contract.** Both models
  went 3/3 clean on scoreboards and stat panels - live fields through update() are the easy
  half of the custom lane. Both went 1/3 on podium reveals; minimax went 0/3 on quiz boards
  and tickers where gemini managed 1/3 and 2/3. Deliverable-clean overall: **minimax 10/21 at
  $0.0328/graphic (findings-only), gemini 14/21 at $0.1712/graphic (vision)** - the §21.2
  "findings are the signal" reading survives on the easy types and BREAKS on steppers and
  crawls, where the dearer model's extra rounds actually converge. Cost separation is 5.2x
  for a 4-cell advantage.
- **The backend-integration question has a measured answer: yes.** Every deliverable
  scoreboard took two score bumps and a clock write through the SHIPPED control page's own
  Update, and the quiz boards advanced their reveal walk on the panel's Next - 5 of 6
  quiz+scoreboard cells drivable in BOTH rounds, through fieldDescriptors + the implicit
  machine, nothing bespoke (`custom-lane-drive-spike.mjs`, drive-report.json per out-dir).
  The one refusal both rounds (qz-campus) genuinely does not advance its frame.
- **One instrument mis-signal, caught by the drive proof and recorded rather than hidden:**
  the step capture read `next()` returning undefined as "does not advance", but a
  hand-written next() may do its work and return nothing - two quiz cells the loop called
  step-broken drive fine under the real panel. The finding class needs a markup-diff check,
  not a return-value check, before the next round trusts it to block.
- **The dominant dirty-stop causes are now instrument classes, not runtime crashes**: minimax
  still loses cells to `buildInTimeline`/`animSpeed` referenced outside the region (5 cells
  with blocking errors vs gemini's 0), but the persistent stoppers on BOTH models are
  alignment near-misses on dense grids (quiz answer ladders, podium columns - up to 9 per
  frame, cosmetically marginal) and marginal mark-gap readings (cd-show stuck 0.34 vs 0.35
  floor for three rounds). Whether those stops were RIGHT is exactly what the blind read of
  the dirty cells decides - §21.2 measured the same gate over-strict on marginal findings
  once already.
- **The new instruments earned their place on the paid round itself**: the readability floor
  drove real fixes (11-17px labels raised to floor) on most cells that then delivered clean,
  and the ticker overflow class fed minimax's 0/3 - its crawls genuinely painted off-canvas.
  fieldPaints caught 4 unpainted-field rounds on minimax tickers, the §21.2 escape 2 class,
  before any human looked.


### 22.1 The owner's blind read, and what it decides - 2026-08-18

The read came back the same morning, all 49 items, notes written against the page before any
reveal (`notes.md` in the round archive holds them verbatim plus the join). Airable = "would
air" + "okay as-is":

| round | airable | of |
| --- | --- | --- |
| catalog anchors | 5 | 7 |
| gemini-3.7-flash iterate (vision) | **10** | 21 |
| minimax-m2.7 iterate (findings-only) | **3** | 21 |

- **The §21.2 minimax-parity reading does NOT survive the wider types.** On lower thirds
  alone, findings-only minimax matched vision gemini 9/12 vs 9/12; over seven types the read
  splits 3/21 vs 10/21. The words carry the easy types (both models 3/3 machine-clean on
  scoreboards and stat panels); on steppers, crawls and dense layouts the picture is what
  converges. The custom lane's checkpoint question is answered: it runs on gemini-class
  vision or it does not generalize.
- **The gate's DELIVER signal leaks on the new types; its STOP signal held.** Of 24
  delivered-clean cells the owner would air 12 (§21.2's lower-third round: 15 of 19); of 18
  dirty stops the owner agreed with 15 and forgave 3. Every escape names a measurable class,
  recorded in the round's notes.md: a collision finding demoted to advisory on uncalibrated
  types (the accent-over-text class, §21.1's dominant defect, let back in by the demotion
  policy), the logo breaking the composition (the sweep's dominant cross-type defect - the
  owner's ruling: SKIP the model-placed logo on the new types; mark placement is the
  platform's, the Phase A knock rule), a minimum-text-size RULE (18px calibrated to the
  catalog's smallest line is below what the owner calls readable for broadcast - one shipped
  catalog anchor took the same note), per-step GEOMETRY (a stepper whose boxes grow
  misaligned and overflow the background passed a paint-only step walk), the fixture stress
  frame being captured but never fed, tinted-on-tinted contrast, and ticker margins
  (full-bleed or equal both sides).
- **Two catalog anchors took notes of their own** - ig01's smallest text and tk01's
  red-on-black with uneven margins - so two of the seven classes bind the CATALOG, not just
  the lane.
- **What this round does NOT change**: Phase A stays the standard lane. The custom lane
  stays fail-closed and does not ship until the deliver-signal fixes above are built and a
  re-read clears; the next round runs no model-placed logos, blocks collision findings on
  every type, raises the size floor to the owner's broadcast rule, runs the instruments per
  step frame, and feeds the fixture stress capture.

## 23. The design-rules re-read - 2026-08-18, machine half only

The §22.1 escape classes became the DESIGN RULES program (docs/DESIGN_RULES_PLAN.md, ratified
the same day), and this round is its R1-R3 slice: one canonical rules module, the loop fixes
the read paid for, an audit before enforcement, a calibrated critic, and the SAME 21 briefs
re-run under the rules. **The owner's blind read of the 28-item page is OWED and nothing here
is a verdict on the look.**

What was built (R1, all mutation-controlled in `pro-iterate-spike.mjs --control`):

- **`src/model/designRules.ts`** - the owner's ratified size table (roles x standard/safe mode
  x viewing profile, % of the short side), weight/stroke/safe-area/contrast+protection rules,
  and `designRulesPromptBlock`, which rides the USER message - the frozen coder system prompt
  stays frozen. Math pinned by `scripts/design-rules.test.mjs` in the build gate. The
  readability instrument classifies roles and reads every floor from the module; a ticker
  instrument enforces full-bleed-or-equal margins; collisions block on EVERY type; the full
  instrument pass runs on EVERY step frame; the stress capture and a zero/empty/Nordic/
  all-caps edge frame FEED the loop; step advance is a markup diff, never next()'s return
  value; alignment near-misses group into one advisory; the custom bank runs NO model-placed
  logos (the brand still conditions palette, type and world).
- **The audit** (`scripts/design-rules-audit-sweep.mjs`, report
  `benchmarks/design-rules/AUDIT-2026-08-19.md`): 489 shipped variants + the 49 archived
  sweep cells re-rendered and joined against the §22.1 verdicts. Headline disagreements,
  stated while the table stays binding: the 50px primary floor fails **312 of 489 shipped
  designs** and would have stopped **14 of the 17 airable cells** (all four AIRs included);
  the 96px safe area stops two aired corner scoreboards; the collision rule scored **7 true
  positives / 0 false positives** on the sweep cells but fires on 21 shipped credits/ticker
  designs whose text legitimately crosses rules mid-travel; the 20px secondary floor is the
  one floor the catalog already meets.

  **SETTLED 2026-09-08 by owner ruling** (`docs/OWNER_RULINGS.md`): the primary floor is now
  type-aware and this question is closed. Re-measured through the instrument itself rather than
  off the CSS, the universal 4.6% row refused **322 of 503** shipped designs - and it contradicted
  `typeFloor.ts`, which had already ratified 16px for a corner bug while this row demanded 49.68px
  of the same element. Three bands on reading time (persistent / card / statement) now refuse
  **8 of 503**. The bullet above also needs one correction: "the 20px secondary floor is the one
  floor the catalog already meets" was not true for the 18 shipped corner bugs whose supporting
  line renders at 16px, which is why a category that names its own floor now governs every
  informational role rather than only the lead line.
- **The critic calibration** (`benchmarks/design-rules/CRITIC-CALIBRATION-2026-08-19.md`,
  $0.247 over the archived 49): only `lineOnText` calibrated (100% precision, 80% recall) and
  is wired as a once-per-round ADVISORY; logo/size/overflow/contrast/alignment questions sat
  at or near chance and stay out - the Lite-judge lesson repeats, and the deterministic
  instruments own those classes.

What the machine half of the re-read says (`rules-reread-{gemini,anchors,blind}-2026-08-19`
in the eval archive; $2.472, ~$0.118/graphic, gemini-3.7-flash vision only - minimax stayed
out per §22.1):

- **21 of 21 completed, 19 delivered clean** against §22's 14 of 21 - and the two dirty stops
  are both countdowns held by the CALIBRATED spacing thresholds (padding-tight, lines-adrift),
  not the new rules. Whether 19 clean ≈ 19 airable is exactly what the read decides; the §22
  target is delivered-clean ≈ airable.
- **The rules did real work in the loop**: per the escape-class columns
  (machine-columns.md), the size floor fed 49 blocking findings across the round, the stress
  frames 43, the safe area 33 (27 on podiums - the §22.1 X-24 class), contrast 12, step-frame
  geometry 5 (all on quiz boards), collisions 3. Ticker margins fed ZERO because every
  emitted ticker came back full-bleed or equal-margined - the prompt block alone closed the
  X-21 class before the instrument had anything to catch.
- **Drive proof: 5 of 6** quiz+scoreboard cells through the SHIPPED control page (§22's
  rate); qz-primetime is the one genuine refusal - its control page throws
  ("Cannot convert undefined or null to object") and paints nothing, a runtime-environment
  defect the loop's bench did not surface. One harness lesson recorded: a broken graphic
  WEDGED the shared drive page and read two healthy cells as undrivable; the spike now
  isolates every cell in a fresh page.
- **Cost went down while coverage went up**: $0.118/graphic against §22's $0.171, despite
  three extra captures per round and the critic call - the rules block up front means fewer,
  shorter repair rounds (33 total vs the sweep's heavier tails).

What is NOT settled here: whether the owner airs what the gate now delivers. The blind page
(21 cells + the same 7 catalog anchors, step frames, verdictless) is the accept gate; if the
read shows the primary floor forcing oversized type or the safe area fighting corner
graphics, the audit's named rows are what the owner re-ratifies. R4 (wizard viewing-target
UI, product validator warn-first, catalog migration notes) stays gated behind that read.

### 23.1 The owner's blind read, and what it settles - 2026-08-19

The read came back the next morning, all 28 items (verbatim notes + join: the round archive's
notes.md, `rules-reread-blind-final-2026-08-19`). Airable = "would air" + "okay as-is":

| round | airable | of |
| --- | --- | --- |
| gemini-3.7-flash iterate under the rules | **21** | 21 |
| catalog anchors | 5 | 7 |

- **The deliver signal no longer leaks.** All 19 delivered-clean cells were judged airable -
  §22 leaked 12 of 24, §21.2 leaked 4 of 19, this round leaked ZERO. The seven §22.1 escape
  classes were closed by measurement, and the owner's summary was "for the most part all of
  these pass - I'm happy." Every remaining note on a model cell is a nit (a glow, a
  banner-balance preference, first-frame real estate), not a defect class.
- **The stop signal is now the over-strict side.** Both dirty stops (cd-launch, cd-results)
  were AIRED: they stopped on the countdown's calibrated spacing thresholds (padding-tight
  0.11-0.23 vs floor 0.24; lines-adrift 1.55-1.92 vs ceiling 1.4). Two false stops, zero
  true ones - the countdown instrument numbers in PRO_GRAPHICS are the named thing to relax
  before the lane ships.
- **The catalog took the same two notes a THIRD time**: tk01 failed again on red-on-black +
  one-sided overflow (the ticker-margin rule the model cells now obey), and ig01's percent
  number is again "way too small". sb01 adds stress truncation + an uneven number backing.
  The rules the lane is held to now indict three shipped anchors - catalog fixes owed in R4.
- **One cell-level defect survives**: qz-primetime is airable on the page and NOT DRIVABLE
  through the shipped control page (runtime throw). The visual gate and the drive proof
  disagree; a control-page smoke belongs in the loop before the lane ships (the drive spike
  exists - compose it in).
- **What this settles**: the R3 accept gate is CLEARED. R4 (productize) is unblocked -
  viewing-target wizard UI, legibility-mode persistence, the product validator running the
  new checks warn-first on catalog/imported/community templates, and migration notes for the
  indicted catalog designs. The primary-size-floor disagreement (AUDIT-2026-08-19.md: 50px
  fails 312/489 shipped designs) did NOT bite the round - the models simply designed larger
  type and the owner liked it - but it still stands between the rules and the product
  validator until the owner re-ratifies the number for CATALOG enforcement.

## 24. R4 opening slice - the catalog fixes the read demanded, and the checks it exposed

The §23.1 read left four named debts; this slice pays them, all free (no model call).

**Two of the three "catalog" failures were the blind page's own field mapping.** The catalog
anchors assigned brief values to fields purely BY POSITION, and two briefs order their fields
differently from the designs they landed on: the scoreboard brief lists name/name/score/score
against sb01's name/score/name/score, so "NORTHBRIDGE ALBION" sat on a score chip while a
score stood bare in a name slot ("one number has a yellow background and the other doesn't");
the ticker brief leads with its label while tk01 declares its items textarea first, so the
whole headlines block landed in the 23px label and blew the strip 333px past the right edge
(5312px under stress) - the very frame the owner failed twice. `mapBriefValues`
(src/ai/spike/anchors.ts) now assigns by what each FIELD IS - textarea takes the multiline
value, a number field only a numeric one, text fields the words, order preserved within each
class - and the probe (`scripts/spike-catalog-fix-probe.mjs`) pins that the four anchors the
owner AIRED (lt27, gt05, qz01, sb21) map byte-identically under both rules. Measured on the
instruments: tk01's band goes L120/R-333.5 + `ticker-margins-uneven` + a text escape under the
positional map to L120/R120, no margin finding, no escape under the semantic one.

**The design fixes that remain real, with before/after readings:**

- **tk01** (FAIL twice: "red background, black text… overflows to the right"): the label ink
  was the family accent-ink (the panel hue) on the signal red - measured 4.46:1, and the
  owner's eye is the binding instrument here. The label is now light ink
  (`var(--text-color)`, 4.17:1 - bold ≥24px is LARGE text, floor 3:1), one size step up
  (23 -> 24px, clearing the secondary warning band), and BOUNDED: `max-width` + ellipsis on
  the label, `overflow: hidden` on the strip, so no operator value can push the band out of
  its equal margins again (stress reading: L120/R120 under both mappings, was R-5312).
- **ig01** (OK* twice: "the percent number is way too small… we need a minimum of what size
  text we can use"): the 21px label - where the blind data lands the percent - sat in the
  secondary warning band and fired `lines-adrift` on the design's own defaults (37px gap /
  21px type = 1.76 over the 1.4 ceiling). It is now held to the PRIMARY floor of the owner's
  table: 50px (4.6% of 1080). After: no size warning, no weight advisory, no lines-adrift -
  the label clears every band and a percent landing there reads.
- **sb01** (TWEAKS: "on the stress test the left text gets cut off"): a long club name
  wrapped and hard-clipped mid-glyph ("KESTR / CITY") because sb01 never adopted the sb06
  one-line clip. `clipOneLineCss('.scoreboard-team', 420)` now trims with a visible ellipsis;
  the uneven "yellow backing" half of the note was the mapping defect above - both scores sit
  on identical accent chips once scores land in score fields.

**The control-page smoke the drive proof demanded (§23.1's qz-primetime).** The iterate loop
now runs every round's emit through the SHIPPED control page - createGraphic, `#/control/<id>`,
the panel's own play press, in a fresh page (the drive spike's isolation lesson) - and a
failure is a BLOCKING finding ("the graphic breaks the shipped control page"). Detection is
two channels because the page's command handler deliberately swallows lifecycle throws: any
page-level error or a page that never renders, plus zero VISIBLY painted text after play
(computed visibility - opacity keeps innerText, so text is counted only when it actually
paints). Mutation-controlled in `--control`: a lifecycle that throws is loud, the shipped
anchor and all six type cells stay quiet.

**qz-primetime's throw, diagnosed.** Its emitted interpreter hand-writes
`noacgMachineState()` returning `{ stepsPlayed: 1 }` - no `groups` - and the receivers
forward that verbatim, so `formatMachineState`'s `Object.entries(state.groups)` threw
"Cannot convert undefined or null to object" and the whole React page died. NOT a pattern:
43 of the round's 44 emitted templates write the correct `{ groups: {} }` shape; one cell
invented its own. The prompt block therefore does not change; instead every consumer of a
reported machine state (`formatMachineState`, `isEventLegal`, the exported controlpanel.html,
GraphicControlPage, PlayoutSimulator, MachineGraph, the hosted receivers) now treats a
groups-less state as "the graphic has not answered yet" - chip absent, buttons live, page up -
and `PreviewMachineState.groups` is typed optional so the compiler holds the door shut. A
`--control` fixture pins the degradation: a groups-less state must leave the smoke quiet.

**The countdown thresholds, recalibrated on the whole shipped countdown family.** The R3
round's only dirty stops were two AIRED countdowns held by `padding-tight` (0.11-0.23 vs a
0.24 floor) and `lines-adrift` (1.55-1.92 vs the inherited 1.4 ceiling) - two false stops,
zero true ones. The 0.24 floor was read off the four gameTimers alone;
`scripts/spike-countdown-calibrate.mjs` now sweeps the catalog's whole countdown family
(game-timer + starting-soon, 25 shipped designs, the two clock-bearing `subtype: 'countdown'`
types). What it measures: panel padding 0.2-1.06 where a panel resolves, line gaps 0.33-3.3 -
TWELVE shipped designs space their lines past the strap's 1.4 ceiling, because a holding
screen parks its clock a long way under its title on purpose. The retuned numbers in
`PRO_GRAPHICS.countdown.instruments`: **paddingFloorRatio 0.1** (under the tightest
owner-AIRED reading, 0.11, above the 0.06 bleed cut - the catalog alone bottoms at ss06's
0.2, so the aired frames are the binding half of this calibration) and
**lineGapCeilingRatio 4.3** (the mark-gap rule's ~1.3x headroom over the widest shipped
reading, ss10's 3.3). Both are mutation-controlled from BOTH sides in
`pro-iterate-spike --control`: a fixture at the aired frames' own readings (0.12 padding,
1.9 gap) must be quiet under the countdown thresholds AND loud under the strap defaults, and
fixtures at 0.08 padding / 4.6 gap must still stop. Observed in passing, not acted on: the
sweep reads `text-over-rule` on gt03/gt04 (clock digits over their own decorative ring) -
a shipped-design instrument artifact to keep in mind if a collision ever stops an emitted
ring timer.

## 25. The owner's six taste rules as code, and the paid corpus re-judged - 2026-08-20

The owner read four galleries on 2026-08-19 and, across roughly sixty individual comments, named
the same small set of composition faults - a mark not centred in the square it sits in (ten of
thirty-six rows, the single most-repeated complaint in the corpus), secondary text "unacceptably
small", text "too thin" and "grey on black … unreadable", a mark eating a topic card's primary
real estate, and a package carrying its wordmark on two pieces of three. Until those are numbers,
the owner IS the gate and each verdict costs a human evening.

`src/ai/spike/tasteCheck.ts` is those six rules as measurements of a rendered frame, driven by
`scripts/pro-taste-rejudge.mjs`. It REPORTS and does not gate, like every instrument beside it,
and two of the six carry no pass/fail at all and say so where they are measured: rule 2 because
the owner stated it is conditional ("sometimes it can work, and that's kind of the problem"), and
rule 3 because the OWNER DECLINED THE FLOOR on 2026-08-22 (§25.5). An instrument that invents a
threshold to settle a disagreement has replaced the measurement with the opinion.

### 25.1 What the re-judge cost, and what it covered

**Nothing.** Every round it reads is already paid for and its code is committed, so the whole
corpus goes back through any instrument written afterwards for free - which is the only
affordable way to ask "would this have caught what the owner caught?". Re-judged: the 36 package
rows of `round-2026-08-16` + `round-2026-08-17` (the blind sets gallery the owner read), and the
4 language sets of `round-2026-08-19-topiccard`.

**One coverage hole was found by the first run and closed.** The 2026-08-16 round predates the
package surface, so its set members exist on disk as PNG frames and never as code. Judging only
what was on disk read 18 rows of three pieces against 18 rows of one and reported the older round
as CLEAN - a corpus half of which was never measured. A missing member is now REBUILT from the
saved `language.json` through the same `composeGraphic` the recompose path uses: deterministic,
free, and both halves of the corpus now go through one composer.

### 25.2 Rule 1 - the mark is centred in its container. REPRODUCED, 10 of 10

**Perfect recall on the owner's own rows.** The instrument fires on all ten the owner named
(S-01, S-02, S-05, S-06, S-07, S-11, S-17, S-19, S-20, S-33) and on fourteen more, and stays
quiet on twelve. The extras are not noise: every firing row is a SQUARE mark in a sponsor-bug
tile sized to its caption, and every quiet row carries a WIDE wordmark that fills that tile by
fitting. One construction, one defect, named by the owner on the examples a blind read stops at.

**FIXED 2026-08-20 - the composer centres the mark across the tile, and rule 1 goes to zero on
every row the composer rebuilds. §25.8.1 has the numbers.**

Two calibration decisions made this work, and the first version got both wrong:

- **The axes are asked separately.** Measuring both axes of the smallest surface above the mark
  read eight shipped catalog designs as 0.84-0.96 off centre, because a mark docked at one end of
  a broadcast-width strap is off-centre IN THE STRAP by construction. Restricting the container
  to one holding the mark ALONE then lost the owner's actual case, where the tile also carries
  "ON AIR". Both readings are recovered by asking which axis the flow did NOT decide: a container
  laying the mark beside its words leaves VERTICAL free, one stacking it over them leaves
  HORIZONTAL free, a well holding no words leaves both.
- **Disjointness is tested against painted TEXT only.** An accent bar down the tile's left edge is
  disjoint from the mark horizontally and is decoration on the container, not a peer the flow
  balanced against. Including it suppressed the one case the rule exists for.

Thresholds read off `pro-taste-rejudge --control` over the 25 mark-capable lower thirds, twice
(square crest, tall shield): on the axis the design chose, nine read 0.0, three read 0.03-0.04,
one reads 0.14 (ls29, 21px over against 28px under). `MARK_CENTRE_OFFSET = 0.12` ANDed with
`MARK_CENTRE_MIN_PX = 8` clears the whole shipped catalog with a pixel to spare, while the
owner's own named case - 20px from one tile edge, 45px from the other - is 25px, three times
above the floor.

### 25.3 Rule 5 - a mark never eats primary real estate. Reproduced on the case named

B27 is the row the owner named ("it takes valuable real estate - it should be on the same row as
the text"), and both rules fire on it: the topic-card mark shares 0.0 of a row with the headline
and sits 38px from the left edge against 400px from the right. All three mark-carrying topic
cards in that round read the same way.

It also fires on the SPONSOR BUG of 34 of the 36 set rows, which the owner did not name - and
that is a report, not an over-fire. Measured over the 28 shipped corner bugs, row share runs
0-1.0 with a median of 0.49 and the rule fires on two: **26 of 28 shipped bugs put the mark
BESIDE the caption, and Pro stacks it above.** Silencing that with a per-type override would be
moving a threshold to hide a design, which is the failure `PRO_GRAPHICS.countdown` already warns
about. It goes in front of the owner as a question instead.

**ANSWERED 2026-08-20 - the stack is legitimate, and the rule was rewritten around what is left of
the question. §25.8.3 has the ruling and the numbers.**

### 25.4 Rule 6 - a package's mark is on every piece or none. Reproduced, on every row

Fires on all 36 set rows and all 4 topic-card rows: the mark is on the lower third, the sponsor
bug and the topic card, and never on the countdown, because `PRO_GRAPHICS.countdown` declares
`takesMark: false`. The declaration is reported rather than treated as an exemption - the owner
was looking at a rendered set, not at the registry, and "this doesn't work; if you skip the logo
then it would fit" is a verdict on a platform decision, not on an accident.

### 25.5 Rule 3 - the secondary floor, restated as the SMALLEST INFORMATIONAL LINE

Read as "the second line's size", the measurement was null on **36 of 36 sponsor bugs** - a
one-line graphic has no second line, and its single caption classes as PRIMARY. The owner's words
for this rule are "ON AIR" and sponsor-bug wordmarks, so the rule could not see either of the
frames it was stated about. Restated as the smallest INFORMATIONAL line whatever its role, and
re-run: coverage goes from 72 of 108 pieces to **108 of 108**, and the corpus splits cleanly in
two - which is the useful part, because the two halves need different fixes.

**Half one: the sponsor bug is already measured, and ships anyway.** All 36 carry a single 24px
line, classed primary, and **all 36 are already flagged** by the ratified 50px primary floor -
the warning is on the round's own ledger. So "ON AIR is unacceptably small" is not an unmeasured
defect. It is a warning the platform raises on every sponsor bug it composes and then ships past,
which is a routing question (what does a warning that always fires actually do?) rather than a
missing instrument. Worth saying plainly: nothing here needs a new floor.

**Half two: the secondary line is measured and never flagged.** The other 72 pieces read 26px on
every lower third and 38px on every countdown, and **0 of 72 are flagged**, because the ratified
standard-mode secondary floor is 20px hard with a 22px warn band. The owner calls 24px "way too
small".

**So the re-ratification target is now a number rather than a range: a secondary floor that
changes anything in this corpus has to sit above 26px**, because 26px is the smallest secondary
reading anywhere in it. That was the decision put in front of the owner - it flags the lower
third's role line on every row, and leaves the countdown's 38px label alone.

#### DECIDED 2026-08-22: THE OWNER DECLINED THE FLOOR. RULE 3 STAYS REPORT-ONLY, PERMANENTLY.

The question was well formed and the number was well measured, and that is exactly what makes the
answer worth recording. **26px is a description of what this catalog happens to ship, not a
belief about how small a secondary line may be** - and a floor read off the catalog asserts that
the catalog is right. The owner holds no rule at that boundary, so the instrument has none to
measure against. It keeps its reading (`SecondaryTypeReading`, below) on every frame and mints no
finding.

This is the same closure rule 5 reached the day before, arrived at from the other direction:
there the threshold was calibrated, quiet and wrong; here it would have been calibrated, loud and
equally unheld. The test in both cases is **whether the owner holds the RULE, not whether the
number fits the data**. Do not re-open rule 3 with a better number - a better number is an answer
to a question nobody is asking. Re-open it only if the owner states a secondary floor himself, at
which point there is a rule to encode and no calibration to do.

Three of the six rules now carry no pass/fail (2, 3, 5), and that is a finding about the
instrument rather than a gap in it: what the owner's taste turned out to contain is fewer
thresholds and more readings than the first version assumed.

`SecondaryTypeReading` carries what the decision needs on every frame: `smallestPx`,
`smallestRole`, `smallestSnippet`, `singleLine`, and `smallestFlaggedOnSize` - the last one being
exactly the difference between the two halves above, and the reason the first version's summary
read as one finding when it was two.

### 25.6 Rule 4 - weight and contrast together. FRAMING RIGHT, FLOORS WRONG

The joint framing is the one the owner asked for: report text that clears its SIZE floor and
still fails on weight or contrast, because "a size-only legibility instrument passes text the
owner cannot read". Implemented, it fires on 2 of 36 rows (a countdown label at 38px, weight 400)
and on **none of the four rows the owner named** (S-03, S-14, S-20, S-33).

Measured, those four read: S-03's supporting line at 26px, **contrast 3.04:1** - which clears the
3:1 large-text floor by four hundredths; S-14's 54px name at **weight 400**; S-33's and S-20's
countdown labels at weight 400 with contrast 6.74. Corpus-wide the weakest readings are contrast
3.01:1 and weight 400.

**So the miss is in the floors, not in the joint reading**, and the instrument now carries the
numbers a re-ratification needs whether or not a floor fired: `TasteReport.weakest` reports the
frame's lightest and faintest informational text every time. A contrast floor the owner would
accept sits above 3.04:1; a weight floor sits above 400 for text this size.

**RATIFIED 2026-08-20 at 3.25:1 and 500, with 28px deciding which secondary lines the rule applies
to at all. §25.8.2 has the decision and what it caught.**

### 25.7 Two blind spots worth stating

- **A panel-free design is invisible to rules 1 and 5.** The minimalist language (B-28, S-09,
  S-10) resolves no surface at all, so `markCentre` and `markRow` are null on every piece of it -
  the same blindness §17.2 recorded for the panel-less super's legibility.
- **Rule 6 sees artwork, not wordmarks.** Presence is "the `filelist` field paints something",
  which is how the composer places every mark it places; a wordmark set as TEXT would read as
  absent.

### 25.8 Acting on the rules - three changes, each measured (2026-08-20)

The instrument had reported for a day; this is what was done with it. Every number below is a
re-judge of the SAME archived corpus - the 36 package rows of `round-2026-08-16` +
`round-2026-08-17`, plus the 4 rows of `round-2026-08-19-topiccard` - and it cost nothing, because
those rounds are paid for and their code is committed (§25.1).

**All of it was measured on ONE tree.** The branch started from a pre-merge `main` and was
fast-forwarded mid-session; that merge touched `preview/composeDocument.ts` and
`validation/validateTemplate.ts`, both of which the re-judge mounts through. The baseline was
therefore re-taken afterwards and compared reading by reading: **identical on every finding and
every gap in all 108 pieces**, so the merge is inert for this measurement and the before/after
below spans no tree change. Stating that is cheaper than trusting it - a comparison across two
trees is the failure AGENTS.md names about merges.

The corpus baseline, which reproduces §25.2-25.6 exactly:

| rule | baseline rows (of 36) |
|---|---|
| 1 `mark-off-centre` | 24 |
| 4 `legible-size-only` | 2 |
| 5 `mark-owns-a-row` | 34 |
| 6 `package-mark-mixed` | 36 |

#### 25.8.1 Rule 1 - the mark is centred in its tile

`composeBug.ts` gives the shared mark slot `align-self: center` inside the bug's tile. The tile is
`fit-content` around the WIDER of the mark and the caption, so a square crest under a longer
caption sat flush against the leading edge with all of the slack on the other side - the one
construction every firing row shared (§25.2).

**The MARK is centred, not the whole stack**, and both halves of that matter: the caption keeps the
reading edge the rest of the package is set to, and a wide wordmark that already fills the tile
does not move at all - which is exactly the twelve rows the rule was already quiet on.

| | baseline | after |
|---|---|---|
| rule 1, whole corpus | 24 rows | **12 rows** |
| rule 1, `round-2026-08-16` (members RECOMPOSED) | 12 of 18 | **0 of 18** |
| rule 1, `round-2026-08-17` (members SAVED AS CODE) | 12 of 18 | 12 of 18 |

**The split is the result, not the headline.** A composer change cannot reach a round whose package
members were saved as CODE - the re-judge mounts the artefact the money bought. On every row the
composer actually rebuilds, rule 1 goes to zero: each recomposed bug now reads offset `0.0` on its
free axis, with equal gaps to two decimal places (S-01: 21px against 47.94px, now 34.47/34.47).
The twelve that remain are August artefacts, unchanged by construction.

**Nothing was traded for it.** Rules 4, 5 and 6 are unmoved (2 / 34 / 36 rows, before and after),
and rule 2 - which is reported and never judged - moved from p50 0.80 to 0.79 with its min (0.33),
p90 and max unchanged. The direction is the part worth keeping: across all 72 pieces carrying an
accent, **no piece's gap to its accent got SMALLER** (6 grew, 66 unchanged). Rule 2's defect is
CROWDING - "if it's too close to the accent line, it feels like it's some mistake" - and a mark
that only ever moves away from the accent cannot commit it. The largest single balance move,
S-05's 0.95 → 0.59, is that gap growing from 21px to 34px against an unchanged 20px to the
caption; the ratio falls because the two numbers are a horizontal gap and a vertical one, which is
also why rule 2 carries no threshold.

The topic-card round is unchanged on every rule (3 / 1 / 3 / 4 rows), as it must be: all four of
its rows saved every piece as code.

#### 25.8.2 Rule 4 - the floors the owner ratified

**OWNER DECISION, 2026-08-20**, not read off a distribution and marked as such in the code: a text
this instrument calls readable clears **contrast 3.25:1**, **weight 500**, and - if it is a
SECONDARY line - **28px**. The owner explicitly declined 4.5:1, 600 and 32px: those stop being a
taste guard and start being a design constraint. §25.6 had already shown the joint framing was
right and the floors were the miss, so this is only the threshold moving.

**The 28px is an ELIGIBILITY floor, not a third failure axis, and the corpus is what decides
that.** Rule 4 asks which text was big enough and still could not be read. Measured on the
baseline, every lower third in the corpus sets its role line at 26px and **0 of 72** secondary
readings are flagged by the ratified table (20px hard, 22px warn). Read as an axis TO FIRE ON,
28px therefore fires on all 36 lower thirds - all 36 rows - and a rule that fires on the whole
corpus reports nothing, which is the exact complaint that sent rule 5 back to be rewritten one
rule over. Read as the answer to "big enough", it keeps the 26px role line out of rule 4 (where it
is a SIZE defect that rule 3 reports) and leaves the joint reading to say what it is for.

The comparison also moved INTO this file. Rule 4 used to pair `readabilityCheck`'s
`text-under-weight-floor` and `text-low-contrast` findings, which are the ratified table's
verdicts - correct while the table agreed with the owner, and silent on all four named rows the
moment it did not. The readings are still that instrument's; only the threshold is ours.

| | after 25.8.1 | after the floors |
|---|---|---|
| rule 4 `legible-size-only` | 2 rows | **26 rows of 36** |
| rules 1 / 5 / 6 | 12 / 34 / 36 | 12 / 34 / 36 (unmoved) |
| topic-card round | 1 of 4 | 3 of 4 |

**It catches all four rows the owner named** (§25.6), each on the axis measured there: S-03 on
CONTRAST - its countdown label at 38px reads 3.04:1, the reading that clears the ratified 3:1
large-text floor by four hundredths - and S-14, S-20 and S-33 on WEIGHT at 400. S-14 fires three
times, including its 54px name.

**And it names ONE construction rather than lighting up the corpus.** Of the 40 readings, **33 are
the countdown's own label** at 38px weight 400, 7 are lower-third primaries, and **none is a
sponsor bug** - the bug's 24px caption is already flagged on size by the ratified 50px primary
floor, so it never reaches this rule. By axis: 37 weight alone, 1 contrast alone, 2 both. Ten rows
stay quiet (S-04, S-05, S-06, S-12, S-13, S-15, S-18, S-21, S-35, S-36). **That is a finding with
an address**: the composer's supporting/label weight on the countdown is where 33 of 40 readings
live, and it is one number in `structure.ts` rather than 26 separate defects.

#### 25.8.3 Rule 5 - the real-estate rule, narrowed to the question inside it

**SUPERSEDED THE NEXT DAY - the threshold this section describes was WITHDRAWN on 2026-08-21 and
rule 5 now mints no finding at all. §25.8.7 has the ruling and why a calibrated threshold was still
the wrong thing to have. Kept because the calibration below is still what the rule MEASURES.**

**OWNER DECISION, 2026-08-20**, on the question §25.3 put to him: **a mark deliberately stacked
ABOVE its caption is a different composition, not a defect.** Rule 5 was firing on 34 of the 36
rows for that arrangement alone, and a rule that fires on almost everything reports nothing.

What survives is the HORIZONTAL question inside his own sentence about B27 - "it should be on the
same row as the text" - read as: **could it have been?** A stack the panel's width never allowed is
the composition the design was forced into. A stack with room to spare beside it is a mark taking a
row it did not need, which is what eating real estate means. Both sides are measured on the
rendered frame in the panel's own width, and the gap budgeted between mark and line is the ratified
0.35 primary type sizes rather than a number of this rule's own.

| | after 25.8.1 | after the rewrite |
|---|---|---|
| rule 5, corpus | 34 rows | **0 of 36** |
| rule 5, topic-card round | 3 rows | **0 of 4** |
| rule 5, shipped lower thirds (`--control`) | 1 of 25 (`ls18`) | **0 of 25** |
| rule 5, shipped corner bugs (`--control --category=corner-bug`) | 0 of 28 | **1 of 28** (`bug17`) |

**THE UNIT WAS THE WHOLE ARGUMENT, and the first version of this rewrite got it wrong in a way the
repo has already paid for.** Written as CROWDING - the gap between mark and line, measured in the
mark's own height, the brand manual's 0.25 - it fired on `ls18` in the shipped catalog: the exact
design `spacingCheck`'s 2026-08-15 recalibration cleared, because ls18 stretches an institution's
mark to the height of the card and was being divided by its own generosity (src/ai/AGENTS.md, "the
mark-gap unit is the primary type size"). An instrument whose false positives are the designs that
carry a mark best is one authors learn to ignore. So rule 5 does not re-ask crowding at all -
`spacingCheck` owns it in the ratified unit, and a second opinion here is either a duplicate or a
regression.

**Zero firings is not a vacuous rule, and it was checked rather than assumed**
(`scripts/spike-taste-rule5-mutation.mjs`, free, one page). Same stack, two panel widths: at 948px
with 502px of room left over beside the line it FIRES; at 288px, where the arrangement is 512px
short of fitting, it is QUIET. And it fires on a real shipped design - **`bug17`**, whose 96px mark
sits alone in a 424px tile, 30px from one edge against 298px from the other, with 143px to spare
beside its caption. That is a row anyone can look at.

**The reported half carries what a re-ratification would need.** Of the 72 pieces in the corpus
that resolve a mark row, 36 are stacked, and **none of them would have fitted beside its line** in
the width its panel already had (band fill min 0.17, p50 0.48, max 0.89). The topic-card round says
the same: 8 of 12 stacked, 0 that would have fitted. **So the owner's ruling is not only a taste
call - the geometry never offered the alternative anywhere in this corpus**, which is why the rule
now agrees with him by measuring rather than by exemption. There is no per-type override; the bug's
tile is `fit-content` around the wider of the mark and its caption, so side by side never fits and
the tile is quiet by construction.

**B27 is still caught, by rule 1.** Its topic-card mark sits 38px from one edge against 400px from
the other, which is `mark-off-centre` - and all three mark-carrying topic cards still fire it. The
orphaned mark the owner saw is reported where an orphaned mark belongs, once instead of twice.

**The blind spot is unchanged and worth restating**: 6 of the 8 stacked shipped corner bugs resolve
no panel at all, so rule 5 cannot apply to them - the same panel-free blindness §25.7 records for
rules 1 and 5 on the minimalist language.

#### 25.8.4 Where the corpus stands after all three

| rule | baseline | after |
|---|---|---|
| 1 `mark-off-centre` | 24 rows | 12 (0 of the 18 rows the composer rebuilds) |
| 4 `legible-size-only` | 2 rows | 26 |
| 5 real estate | 34 rows | 0 |
| 6 `package-mark-mixed` | 36 rows | 36 |

Rule 6 is untouched and still fires on every row: the mark is on the lower third, the sponsor bug
and the topic card and never on the countdown, because `PRO_GRAPHICS.countdown` declares
`takesMark: false` (§25.4). That is the next decision to put in front of the owner, and it is a
registry decision rather than a composer one. Rules 2 and 3 still carry no pass/fail; rule 3's
never will, because the owner declined the floor on 2026-08-22 (§25.5). Rule 4's 28px stays an
eligibility gate and was never a floor rule 3 judged against.

#### 25.8.5 Acting on rule 4 - the composer meets the ratified weight floor (2026-08-21)

§25.8.2 left rule 4 firing on 26 rows with an ADDRESS rather than a spread: 33 of its 40 readings
were text at weight 400, and the composer's own guard could not reach them.
`structure.ts` floored the supporting line at `medium` **only below 30px**
(`SUPPORTING_WEIGHT_FLOOR_BELOW_PX`), reasoning from the 2026-08-15 blind read that a hairline
stroke is a SMALL-text problem. Measured against the owner's own floor, that reasoning was the
wrong one: the countdown's label sits at **38px**, eight pixels above the boundary, and two of the
four rows he named are a **54px name** and an **80px clock**, both at weight 400. A floor that
exempts exactly the sizes he complained about is not a floor.

So the size condition is gone. `TYPE_WEIGHT_FLOOR` is `medium` (500) and applies to the HEADING as
well as the supporting line, at every size. It stays a boundary rather than a repair - the
language still chooses among four weights above it, and `semibold` was declined for the general
case for exactly the reason the owner declined 600.

| | after 25.8.2 | after the floor |
|---|---|---|
| rule 4 rows | 26 of 36 | **18 of 36** |
| rule 4 readings | 40 | **27** |
| …on `round-2026-08-16` (members RECOMPOSED) | 13 rows | **5** |
| …on `round-2026-08-17` (members SAVED AS CODE) | 13 rows | 13 (unreachable) |
| rules 1 / 5 / 6 | 12 / 0 / 36 | 12 / 0 / 36 (unmoved) |

**On the half of the corpus a composer change can reach, the weight axis is now empty.** Recomposed
countdown readings fall **16 → 3**, and weight 400 disappears from every one of them (weakest
weights 400/500/600/700 → 500/600/700). Every one of the 24 weight readings that remain belongs to
a piece mounted as SAVED CODE, exactly like the twelve rule-1 rows in §25.8.1 - August artefacts a
composer change cannot reach, not a fix that failed to land.

**What is left on the reachable half is CONTRAST, not weight.** The 3 remaining recomposed readings
are all contrast against the ratified 3.25:1, with no weight component (before: 1 contrast + 2
both; after: 3 contrast + 0 both). That is the palette furniture question rather than the type
question, and it is the next address rule 4 hands over.

#### 25.8.6 …and the contrast half, on Pro's own floor (2026-08-21)

§25.8.5 left rule 4 with three readings on the reachable half, all CONTRAST and none of them
weight. The repair was already there and pointed at the wrong number: Pro resolves its palette
through Lite's furniture ladder (`clampLitePalette`, imported rather than re-implemented, because
two ladders are two answers about one customer's colours), and that ladder repaired the supporting
tone to `LITE_CONTRAST_FLOOR.secondary` - **3:1**, WCAG's large-text floor. The line the owner
named on S-03 measures **3.04:1** and cleared it by four hundredths.

**THE LADDER IS SHARED; THE NUMBERS ARE NOT.** Raising `LITE_CONTRAST_FLOOR` would have moved
Lite on Pro's evidence, and the two are separate projects that do not share a quality bar
(`src/ai/AGENTS.md`) - a floor ratified on one tier's corpus says nothing about the other's. So
`clampLitePalette` and `applyLiteBrandPalette` take an optional floor pair, defaulting to Lite's,
and `pro/language/paint.ts` states `PRO_CONTRAST_FLOOR = { primary: 4.5, secondary: 3.25 }`. One
implementation, two ratified numbers. The primary rung is untouched: nothing measured names it,
and moving a floor no evidence names is how a threshold stops meaning anything.

| | after 25.8.5 | after Pro's floor |
|---|---|---|
| rule 4 rows | 18 of 36 | **16 of 36** |
| rule 4 readings | 27 | **24** |
| …from RECOMPOSED pieces | 3 (all contrast) | **0** |
| weakest recomposed contrast | 3.01:1 | **3.27:1** |
| rules 1 / 5 / 6 | 12 / 0 / 36 | 12 / 0 / 36 (unmoved) |

**Rule 4 is now silent on every piece the composer rebuilds** - both axes, after two changes. All
24 readings that remain belong to pieces mounted as SAVED CODE from August, the same
unreachable half as the twelve rule-1 rows in §25.8.1. To move those the round would have to be
recomposed, not re-judged.

`e2e/pro-language.spec.ts` pins the SEPARATION rather than the number: a tone found in the band
between the two floors comes back repaired for Pro and untouched for Lite, so collapsing the two
back into one constant fails there.

#### 25.8.7 Rule 5 withdraws its threshold - placement has no rule (2026-08-21)

§25.8.3 rewrote rule 5 around the horizontal question inside the owner's own sentence, and it read
0 of 36 on the corpus. Then the countdown gained a mark (§25.9) and it fired on **12 of the 18**
recomposed countdowns: a clock's panel is sized for its digits, so the mark had room beside the
label and the composer stacked it above.

Put to the owner as "is the placement wrong, or is the floor?", the answer was neither:

> **I cannot give you hard rules on where to place a logo. It depends on the design.**

**So rule 5 now mints no finding at all** - the third of the six to carry no pass/fail, beside rule
2 (the owner called it conditional) and rule 3 (a floor he declined the next day - §25.5). It still
measures the arrangement on every frame and judges none of it: `stacked` (which arrangement the
design chose), `besideSlackPx` (whether the width allowed the other one), `bandFill` (how much of
its band the mark uses).

**The withdrawn version is the one worth remembering, because nothing was wrong with its
measurement.** It was calibrated off the catalog, quiet on the whole corpus, mutation-checked, and
it re-flagged nothing it should not have. It was wrong because *"a mark takes a row of its own only
when the width leaves it no choice"* is a placement rule, and the owner does not hold one. **A
threshold can be perfectly calibrated and still assert something its author does not believe** -
which is a different failure from the ones this file already records, and the reason rules 2 and 3
were thresholdless from the start.

| | after 25.8.3 | after the withdrawal |
|---|---|---|
| rule 5 findings, corpus | 0 of 36 rows (12 of 18 once the countdown carried a mark) | **none, by construction** |
| rule 5 readings | the same | the same, on 90 of 108 pieces |
| rules 1 / 4 / 6 | 12 / 16 / 18 | 12 / 16 / 18 (unmoved) |

Corpus arrangement, now reported rather than judged: **54 of 90 pieces stack the mark over the
line, 36 stand it beside, and 12 of the stacked ones had room beside.**

`scripts/spike-taste-rule5-reading.mjs` (was `-mutation`) changed with it: a check that a
withdrawn finding FIRES is meaningless, so it now proves the GEOMETRY discriminates - the same two
frames, the same stack, +502px of room beside against -512px, and no rule-5 finding on either.

**Where the measurement belongs next.** Pro generates its designs, so "the design decides" needs
something deciding per graphic, and here the platform owns layout rather than the model. *Does the
mark fit beside this line in this panel's width?* is exactly what a composer needs in order to
PLACE one - and used that way it is not a rule, it is each graphic's geometry answering for itself.
Not started; it is a build, not a demotion.

## 26. The recreate loop's economics, and why its stress pass "missed" batch 1.4 - 2026-08-20

Three things came out of the owner's 2026-08-19 read of the recreate archives, and all three are
measured against `recreate-round-v4`…`v7` with `--replay`, which spends nothing.

### 26.1 The stress pass did not miss an overlap. There was none - and the one signal that
existed was thrown away

The owner rejected batch 1.4 for its right-hand clock box overlapping the score at three digits,
and the note asked why the stress arm did not fire. Reproduced against the archived round-3
template, mounted through the same `composeDocument` the round used:

- **There is no geometric overlap.** At three digits the score `#f5` paints x 844-1031; the clock
  panel's left edge is 1046 and the banner it sits on ends at 1048. At the stress value (four
  digits) the score still ends at 1031, because the banner's own auto-fit shrinks the type. The
  archived stress PNG and a fresh re-render agree to the pixel. What the owner is reading is a
  15px gap closed by an italic numeral's drop shadow, against a panel drawn 2px OVER the banner
  it abuts - a near-collision the composition reads as a collision, which no instrument here
  measures and none claimed to.
- **The bench's own overlap check could not have found one anyway.** `runtimeBench`'s
  `overlapIssues` pairs LEAVES, and `collectLeaves` keeps only elements that own text or are
  `<img>`. An opaque PANEL covering text is never in a pair. That is a real hole; it is simply
  not the hole that produced this frame.
- **THE DEFECT IS THAT THE LOOP DISCARDED THE WARNING.** Round 3 finished `ok: true` carrying
  exactly one finding: `bench-stress: #f7 extends past .scorebug-clock-panel, the nearest thing
  painted behind it, once every text value is doubled in length` - which names, by class, the
  element the owner rejected the graphic over. It was a WARNING, and the emit wrapper reduced
  `validation.warnings` to `.length`. No warning has ever reached the ledger, the gallery, or the
  model's repair round. The loop called that round CLEAN and stopped.

  Fixed: warnings are carried out of the wrapper and join the ADVISORY channel the readability
  findings already use - visible to the ledger, the gallery and the model, blocking nothing, for
  the reason that channel exists (a recreation answers to its reference, and a warning that
  blocked would deadlock the loop against its own ground truth). This is §16's argument arriving
  one directory over: a pipeline's own findings living somewhere the gate does not look.

  Worth stating beside it: `reactionFindings` exempts any field whose default value is numeric,
  which is right for "did the box grow" - a scoreboard's digit plate is supposed to be fixed -
  and means the two score fields contributed nothing there either.

### 26.2 The loop ships the BEST round now, not the last

"Round two looks better than round three" (batch 2.b). `bestRoundIndex` picks fewest findings,
then closest to the reference, then earliest - so a later round has to actually beat an earlier
one and a tie never discards the money the earlier round already paid for. `deliverable` is a
property of the round that SHIPS, and the importable file, the ledger's similarity and the
gallery's verdict all come off that one index.

Replayed over the four archives it moves the kept round on **five graphics**, every one of them in
the owner's favour: v4 batch-2-b keeps round 2 (1 finding, 51.1%) over round 3 (12 findings,
50.4%) - the owner's own case; v4 batch-1-2 keeps round 0 (56.1%) over round 3 (54.4%) at equal
findings, and round 0 is the one the owner called "already good enough"; v4 batch-2-e keeps round
2 over round 3; v5 batch-1-2 keeps round 2 (1 finding) over round 3 (2); v6 batch-2-b keeps round
1 (1 finding) over round 3 (3).

### 26.3 The convergence stop that IS safe, and the obvious one that is not

`stopAfterRound` stops only when a round has answered a NEARLY-CLEAN template with a worse one.
Once the model has been shown a template one finding from done and returns a worse one, the next
round is fed the worse template, and across the archives it never recovered the earlier round's
quality. The "nearly clean" cut is 2 findings, read off the corpus: every unrecovered regression
came off a round with ONE finding (v4 batch-2-b 1→12, v6 batch-2-b 1→13→3, v4 batch-1-2 1→3), and
the one regression that did recover came off a round with FOUR (v5 batch-2-b 4→7→1). One reading
each side, and that is stated rather than dressed up.

**Measured saving: 3 of 66 rounds across the four archives (4.5%, about $0.15 of $3.33), with no
deliverable result lost.** Modest, and it is the honest number.

The cut is mutation-controlled rather than asserted: raised to 10 findings the same replay saves
twice as much (4 rounds on v4 alone) and **loses a deliverable result**, which is what a cut set
too loose looks like. `--control` additionally runs both rules against archived fixtures from both
sides, including the two "must not stop" cases a score-based stop gets wrong.

**The obvious stop was replayed and is NOT safe, which is the more useful finding.** On every
round the owner could not tell apart, the reference score moves by 0.0-2.0 points, so "stop when
the score stops moving" looks perfectly separable. Replayed, it costs v5 batch-2-e its
DELIVERABLE result - a flat round at 48.3% was followed by a +5.5 point round that cleared the
last finding - and costs v5 batch-2-b its best round. **The rounds the owner cannot see are
exactly the rounds that clear the last machine finding**: cheap to the eye, and the whole verdict.
A frame-to-frame diff is no better: it reads two rounds the owner called identical at 51.5% and
two others at 99.9-100%, so it cannot express the owner's own criterion either.

### 26.4 The door's name

Recorded in `docs/IMPORT_MVP.md`: the wizard door is **"inspired by this design"**, never
"Recreate". Owner-decided on the evidence - the output is airable and is never the same graphic,
and the name is what makes that a promise kept rather than a promise broken.

## 27. Text painted over by a panel - the hole the overlap check cannot see - 2026-08-20

Found while reproducing batch 1.4 (§26.1). That frame turned out to carry no occlusion at all,
and the hole it sent me looking for was real anyway: **`overlapIssues` pairs LEAVES, and a leaf
is an element that owns a text node.** A panel owns none, so a panel is never in a pair, and text
can vanish under one completely while every geometry check in the bench passes. Nothing anywhere
in the repo asked the question.

`src/validation/occlusion.ts` asks it; `runtimeBench` wires it to `bench-occluded` in both the
settled pass and the stress pass; `scripts/occlusion-sweep.mjs` is the calibration.

### 27.1 Hit-testing, not geometry

"Painted on top" is paint order, and paint order is stacking contexts, `z-index`, positioning and
document order together. Re-deriving that from computed style is a well-known way to be subtly
wrong. `elementsFromPoint` already knows it, so the probe samples points and reads the stack -
with two consequences handled rather than hoped past:

- **Hit testing skips `pointer-events: none`**, and a decorative overlay is exactly the kind of
  element a design marks that way, so the probe would have been blind to the covers it is most
  likely to meet. It forces pointer events on for its own duration and removes the style in a
  `finally`, so a throw cannot leave the graphic's pointer behaviour rewritten.
- **Hit testing does not care whether an element paints**, so the stack is walked DOWN to the
  first element that actually does. Stopping at the top would report every graphic that wraps its
  composition in a positioned div as fully covered.

What is sampled is the TEXT, not its box: `Range.getClientRects()` gives the line boxes the
glyphs occupy, so an element whose rect is wider than its words is not diluted into looking half
visible.

### 27.2 What the shipped catalog reads, and the two bugs the sweep found in the probe

**Zero.** 502 designs at their own values: 0 with any covered text. 502 designs with every text
value doubled: 0. The rule cannot fire on anything the house ships, which is what makes an ERROR
band affordable at all. Bands mirror `OVERLAP_ERROR`/`OVERLAP_WARN` (0.5 and 0.05) so one defect
family reads one way.

Both readings are second readings. The first two runs each found a defect in the INSTRUMENT, and
both are worth keeping because both are the same mistake in different clothes - measuring
something other than what is on the screen:

- **Ten shipped tickers, 13-100% "covered".** Every one was a crawling item passing under the
  fixed label at the head of the crawl - the ticker idiom, and the same set `overlapIssues` and
  `overflowIssues` already exempt as measured motion. `measureOcclusion` now takes the bench's
  own `dynamicsRoots`, and `collectLeaves`/`dynamicsRoots` are exported so the calibration
  measures the frame the gate measures rather than its own idea of one.
- **es02, the one and only stress reading, at 16.3%.** `Range.getClientRects()` reports LAYOUT
  rects, and layout does not stop at a clip: under doubled values es02 lays "TEAM LIQUID TEAM
  LIQUID" out to x=974 while its own box ends at 698, and the glyphs past 698 are never painted.
  The probe walked those phantom glyphs straight under the score chip at 714. A screenshot
  settled it - the word is cut mid-letter at the box edge, and there is nothing under the chip at
  all. Line boxes are now cut down by every ancestor that clips, the same reading
  `spacingCheck.visualRect` takes one directory over.

### 27.3 The two false positives it must not have

A rule whose false positives are the good designs is one authors learn to ignore - this repo's
own argument, twice. Both are pinned from both sides, in `occlusion-sweep --control` and again as
fixtures in `e2e/bench.spec.ts`:

- **A tint.** The same opaque panel at 0.3 opacity must stay quiet; text reads through it.
- **A gradient scrim.** A scrim over the lower third of a frame is the commonest legitimate
  construction in broadcast and is a gradient that is transparent exactly where the text is. A
  raster `url()` background paints and counts; a gradient does not.

The positive fixture additionally asserts that `bench-overlap` stays SILENT on the same frame -
if that ever starts firing, the two checks have merged and one is redundant.
Mutation-controlled: raising `COVER_OPACITY_FLOOR` past 1 fails the positive fixture and leaves
the negative one passing.

### 27.4 Honest limits

- **A cover painted by a PSEUDO-ELEMENT is invisible to this.** `elementsFromPoint` returns
  elements, never their `::before`/`::after`, so a `::after` panel over text reads as the parent
  element - whose own background is checked, and is usually transparent. Checking the pseudo
  would over-report in the other direction (its box is not measurable, so a motif beside the
  words would read as a cover over them), and honest silence beats a finding the method cannot
  support.
- **`clip-path` is not consulted.** It cuts painted output with no overflow property anywhere;
  the instrument that owns that question is the bench's own clip check.
- **A `<canvas>` or inline `<svg>` cover with no background** is missed - only `<img>` with a
  resolved source and a painted background count as paint.
- **It runs in the settled pass and the stress pass, not after every operator event.** The
  branch pass runs once per event and the probe costs a hit test every few pixels of every line
  box, so wiring it there multiplies the bench's cost by the event count for a state the default
  path already walks. A defect that appears only inside one branch is out of reach today; the
  two passes that carry it are the ones the catalog gate measures.
