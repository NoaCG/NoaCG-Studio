# The NoaCG Pro Harness - any custom broadcast graphic, from a cheap model, as a real template

**Status: ARCHITECTURE RATIFIED BY THE OWNER'S BRIEF OF 2026-09-05; the loop core is BUILT and
proven at zero tokens; the first paid experiment is DESIGNED and awaits a stated cap.** Owner
direction, verbatim in spirit: stop teaching design one graphic type at a time; build general
graphics intelligence; make the loop evidence-driven rather than a blind "look again"; design
for cheap models on the funded gateway; and end with an ordinary, reusable NoaCG template.

This document is the architecture and the record. The code is `src/ai/pro/harness/` (its own
`AGENTS.md`), the zero-token control is `scripts/pro-harness.test.mjs` (in the build gate), the
browser bench is `scripts/pro-harness-spike.mjs`. Nothing here replaces the live Pro tier
(`docs/NOACG_PRO_PLAN.md` §15, Phase A): the language composer stays the standard lane for the
types it composes, and this harness is the road for everything it cannot.

---

## 0. The test this has to pass

> Can NoaCG Pro take a normal user's request for a custom broadcast graphic, use an inexpensive
> model, create something visually good and operationally correct, inspect its own rendered
> result, repair concrete problems, and turn it into a reusable NoaCG template, without the user
> knowing anything about models, prompts, APIs or graphics code?

Everything below is organised around that sentence, and §9 states the smallest experiment that
answers it with numbers.

## 1. What already exists, and where (the investigation)

The repo has been at this for two months and most of the harness already exists in pieces. The
table is what a session must know before adding anything; each row is reused, not rebuilt.

| What | Where | State |
|---|---|---|
| Design taste as prose (typography ranges, colour discipline, spacing, motion doctrine, family tokens) | `docs/DESIGN_LANGUAGE.md` | binding, lower-third flavoured |
| The twelve principles and the ranking of what moves a rate | `docs/DESIGN_PRINCIPLES.md` | binding: remove the decision > measure > boundary > ask |
| Legibility as numbers (owner size table, weight, stroke, safe area, contrast) | `src/model/designRules.ts` + `designRulesPromptBlock` | binding, one module, prompt generated from it |
| The owner's five taste axes + four text questions, calibrated on 16 blind frames | `docs/VISUAL_TASTE_REVIEW.md` | the structured critique contract, not yet a model schema |
| Per-family anatomy cards (strap, tower, board, split, bracket, card, ring, full-frame, strip) | `src/ai/creative/knowledgeCards.ts` | retired pilot, mineable |
| Generic taste reasoning paragraph | `TASTE_REASONING` in `src/ai/claudeProvider.ts` | live on the design-spec and coder prompts |
| The agent door's compact design notes | `cli/skill/noacg-graphic/references/design-notes.md` | opt-in for external agents |
| What a graphic IS: fields, machine, controls, parts, per type | `src/templates/types/` (60+ types) | binding registry |
| Operational notes per AI category (how a scoreboard is driven on air) | `src/ai/spec/categories.ts` `workflowNotes` | live |
| Deterministic gate | `validation/validateTemplate.ts` + `runtimeBench.ts` (+ `occlusion`, `fieldPaint`, `markLegibility`, `plateLegibility`, `readabilityCheck`, `tickerCheck`, `typeFloor`, `safety`, `assetIntegrity`) | live, the export gate |
| Geometry instruments (spacing, proportion, alignment near-miss, device, mark, taste rules) | `src/ai/spike/*Check.ts` | bench-only, calibrated on the catalog |
| The fail-closed iterate loop (findings + screenshot fed back, max 4 rounds) | `src/ai/pro/custom/loop.ts`, `src/ai/spike/iterate.ts`, `scripts/pro-iterate-spike.mjs` | productised behind `AI_PRO_CUSTOM_ENABLED`, off |
| The one-call design-language composer | `src/ai/pro/language/` | LIVE Pro tier, four composed types |
| The agent door: scaffold, validate, inspect, screenshot, save, as a CLI and one MCP tool | `cli/`, `src/bridge/bridgeApi.ts`, `docs/AGENT_CLI.md` | shipped, 25 of 25 airable |
| Neutral spines (a type's semantics without a look; a typeless spine from fields) | `src/templates/types/neutralDesign.ts` | shipped |
| The constrained-edit guard (css + root html, contracts refused) | `src/ai/polish.ts` `applyPolish` | live |
| Model transport, ZDR policy, cost ledger, reservation admission | `api/_lib/aiGateway.ts`, `aiProProfile.ts`, `pro/managedCall.ts` | live, raw HTTP to the gateway |
| The critic calibration | `benchmarks/design-rules/CRITIC-CALIBRATION-2026-08-19.md` | only `lineOnText` calibrated |

**The AI SDK is not in the repo.** `api/_lib/aiGateway.ts` speaks the gateway's OpenAI-compatible
`/v1/chat/completions` over raw `fetch`, with its own schema revalidation, retries, truncation
detection and cost normalisation. The SDK's current major is `ai@7.0.93` (`@ai-sdk/gateway`
4.0.75); its `ToolLoopAgent`, `prepareStep`, `stopWhen`, `Output.object` and file parts are what
the harness is built on (§5). The gateway's retention directives map one to one onto the SDK's
`providerOptions.gateway` (`zeroDataRetention`, `disallowPromptTraining`, `only`, `tags`), so the
policy `aiGateway.ts` enforces is expressible unchanged.

## 2. What the owner's feedback has already taught

These are the findings the harness is designed around. Each has a measured source; none is a
hunch.

1. **Remove the decision beats measuring it, which beats stating a boundary, which beats asking
   for judgement** (`DESIGN_PRINCIPLES.md`; NOACG_PRO_PLAN §15.3: none, large, largest). The
   harness therefore scaffolds the fields, machine, runtime and definition itself and lets the
   model touch three regions (§4).
2. **The harness carries quality; a model swap does not** (MODEL_VS_HARNESS_STUDY §5: harnessed
   cheap = harnessed frontier = 4.17, bare = 3.2). A cheap model is the design constraint, and
   the platform is what makes it enough.
3. **Findings are the signal on simple types; the picture is what converges on steppers, crawls
   and dense layouts** (§21.2 minimax findings-only 9/12 = gemini vision 9/12 on lower thirds;
   §22.1 3/21 vs 10/21 across seven types). So frames are captured and shown, and the critic is
   a second instrument, not a judge.
4. **The deliver signal leaked until the design rules blocked** (§22.1 12 of 24 clean cells
   airable; §23.1 after rules 19 of 19). Legibility findings block on the custom lane.
5. **A first refinement helps; further generic passes do almost nothing** (owner, 2026-09-05).
   The repair rule is evidence-driven: a round runs only when a finding is new or a previous
   repair failed to remove one (§7).
6. **Stop on convergence is only safe as a regression stop; a flat score is not** (§26.3: the
   rounds the owner cannot see are exactly the ones that clear the last machine finding). The
   loop keeps the BEST round, not the last (§26.2).
7. **A vision critic is at chance on subjective questions for a cheap model** (CRITIC-CALIBRATION:
   only `lineOnText` reached 100% precision). Critic answers advise; they never block.
8. **The platform seats the mark; the model never places a logo** (§17.1, §22.1). Unchanged.
9. **Text has to know its box** (owner 2026-09-02): every field lives in the shape drawn under
   it, the text owns alignment, the box owns growth. It is a knowledge card and the long-string
   frame is where it is judged.
10. **A prohibition suppresses the behaviour it constrains; write constraints as inspection**
    (`src/ai/AGENTS.md`). Every knowledge card states what earns a pass.
11. **The owner's failures are geometry, not colour or motion** (`DESIGN_PRINCIPLES.md`): the
    instruments that matter are spacing, alignment, proportion and growth under long text.

## 3. The knowledge layer - general intelligence once, semantics per type

### 3.1 Universal cards (`harness/knowledge.ts`)

Fourteen cards, each a subject rather than a graphic type, written as inspection: hierarchy,
composition and alignment, spacing and shape, typography, colour, motion, safe area and
placement, text and its box, brand mark and pictures, density, live numbers, package
consistency, how the result is judged, and the failure record (the owner's blind-read failures
as checks). The prose is extracted from `DESIGN_LANGUAGE.md`, `DESIGN_PRINCIPLES.md`,
`VISUAL_TASTE_REVIEW.md`, the creative pilot's cards and the agent door's design notes; a
change to a ratified number there is a change here in the same commit.

**Loading is modular.** `knowledgeForRequest` picks six core cards for every request (about
1,600 tokens) and adds the rest by trigger: number fields load live numbers, an image field or a
mark loads the mark card, brand colours load colour, more than four text fields or a list load
density, a package loads consistency, a ticker or corner brief loads placement. Motion always
loads because the animation region is writable. The model can read any card by id with
`inspectDesignKnowledge`. There is deliberately no single giant prompt.

### 3.2 Type semantics (`harness/typeSemantics.ts`)

A type adds what it MEANS and how it is OPERATED, never a private design lesson: fields with
kinds and roles, operator events and what they carry, default-path steps, default zone, logo
slot, the router's scope note, and the category's on-air workflow notes. All read live from the
registry and `AI_CATEGORIES`, so a new type or a changed control reaches the model with no edit.
The model reads them with `inspectGraphicType` and `listGraphicTypes`.

### 3.3 Where each kind of knowledge lives

| Knowledge | Form | Why there |
|---|---|---|
| Legibility floors, contrast, safe area, weight, stroke | numbers in `designRules.ts`; prose generated from them; instruments read them | one module, zero drift; measured, never argued |
| Fields, machine, controls, steps, parts | the type registry; scaffolded, never described to the model as a target | the model cannot get wrong what it does not write |
| The `:root` contract, the spine, the ANIMATION markers, ES5, no network | the scaffold plus the patch guard's refusals | structural: refused before a render |
| Overlap, overflow, escape, occlusion, unpainted field, lifecycle, replay, stress | the runtime bench and the instruments, as blocking findings | deterministic, calibrated on the catalog |
| Spacing, proportion, alignment near-miss | instruments; block on collisions everywhere, advise where the type is uncalibrated | measured, but the owner's verdict flips per brief |
| Hierarchy, composition, restraint, coherence, on-air quality; centred, inside, aligned, grows | knowledge cards (before) and the structured critique (after), advisory | subjective; the critic is at chance on most of them for a cheap model |
| The catalog's taste (family tokens, ratified ranges) | the cards' numbers, and later exemplar retrieval per type | prose ranges are what a model can apply |
| What failed before | the failure record card | the owner's own verdicts, phrased as checks |

## 4. The representation the model manipulates

The model never emits a whole template and never writes the runtime. The platform scaffolds and
the model designs INTO the scaffold.

### 4.1 Scaffold first

`startGraphic` builds a valid graphic on a spine before any design exists:

- from a **type** (`neutralDesignFor` + `variantFromType`): the type's fields, state machine,
  controls, runtime, SPX definition and NOACG_ANIM region, with a plain look. A type whose
  category has no neutral spine yet scaffolds on its first catalog design and says so;
- **typeless** (`neutralSpineFor`): the declared fields on the blank spine, with the implicit
  Take/Update/Next/Out machine.

This is the agent door's `noacg scaffold`, called as a tool. The catalog is not shown to the model
(the anti-anchoring rule holds); the semantics are.

### 4.2 Three writable regions (`harness/patch.ts`)

| Region | What it is | The guard refuses |
|---|---|---|
| `css` | the design stylesheet, applied under one marker and REPLACED whole each round | a `:root` block, `@font-face`, `@import`, remote `url()`, scripts |
| `boxHtml` | the markup inside `<div class="PREFIX-box">` | a dropped or duplicated `id="fN"`, an invented field id, scripts, inline handlers, inline `display:none` |
| `animation` | the marked ANIMATION region in the authoring grammar (`buildInTimeline` / `buildOutTimeline`, `tl.set/to/fromTo`) | DOM measurement, network, `const`/`let`/arrows/template strings; and the whole region when the type's machine lives in it |

The workbench converts the authored region to keyframe data with the same importer every wizard
category uses (`convertEmittedRegion`) before rendering, and an unconvertible region is a
blocking finding. A refused patch costs no render and no round; its reasons come back as
`harness` findings.

This is `applyPolish`'s contract widened to the animation region and freed from the DOM, so it
runs wherever the loop runs. It is also the reason the result is a standard template (§8):
everything a template needs to be editable, controllable and exportable is either scaffolded by
the platform or refused when a patch reaches for it.

### 4.3 Where the language tier still wins

Phase A (one enum call, platform composes) measures 18 of 18 airable at half a cent for the
types it composes. The harness does not replace it: a request that resolves to a composed type
stays on the language lane. The harness is the road for a type with no composer, a typeless
graphic, and later a package the composer cannot carry. The two share the scaffold, the gate
and the template contract; they do not share a prompt.

## 5. The AI SDK loop (`harness/agent.ts`, `harness/tools.ts`)

Built on `ai@7`'s `ToolLoopAgent`. The SDK carries the model-tool-model loop; the harness
supplies the tools, the gating, the stop rules and the ladder.

### 5.1 The tools

| Tool | Does | Platform half |
|---|---|---|
| `inspectDesignKnowledge({ids?})` | the card index, or the named cards | `knowledge.ts` |
| `listGraphicTypes()` | every registered type, one line each | the registry |
| `inspectGraphicType({typeId})` | fields, events, steps, zone, scope, on-air notes | `typeSemantics.ts` |
| `startGraphic({name, typeId? \| fields?, zone?, fontId?})` | scaffolds once; returns the operator contract and the three regions | `Workbench.scaffold` |
| `applyDesign({css?, boxHtml?, animation?, addresses?, rationale})` | guards the patch, then renders, validates, benches and measures WITHOUT being asked; returns every finding with a stable id, the diff against the last round, and the frame | `Workbench.apply` + `Workbench.inspect` |
| `finishGraphic({summary})` | hands the template in; offered only when the measurement is clean | `Workbench.finish` |
| `stopGraphic({reason})` | the honest stop; the best measured round is kept and reported as not ready | the loop |

Inspection is folded into `applyDesign` on purpose: a cheap model never has to remember to look,
and the loop never has an un-measured state.

### 5.2 Phase gating with `prepareStep`

`toolsForPhase` decides what the model is OFFERED at each step and `prepareStep` applies it as
`activeTools` and `toolChoice`:

| Phase | Offered | Forced after dithering |
|---|---|---|
| understand | knowledge, types, one type, start | `startGraphic` after two reading steps |
| design | knowledge, apply | `applyDesign` after one |
| repair | knowledge, apply, stop | `applyDesign` after one |
| finish | `finishGraphic` only | at once |
| refuse | `stopGraphic` only | at once |

So the model cannot finish before the measurement is clean, cannot redesign after it is, and
cannot read cards forever. None of this is prompt text asking it to behave.

### 5.3 Stop conditions

`stopWhen: [isStepCount(maxSteps), hasToolCall('finishGraphic', 'stopGraphic'), spent >= maxUsd]`,
defaults 12 steps, $0.15, 4 rounds, one critique. The round rule (§7) is applied inside the
`applyDesign` result and sets the phase; the SDK's conditions are the outer bound under it. A
model that ignores a forced tool raises `ToolChoiceViolationError` inside the SDK; the harness
catches every exception and returns the best round as a refusal, so paid rounds are never thrown
away (the 2026-08-08 lesson, NOACG_PRO_PLAN §16).

### 5.4 Where the loop runs

The loop is environment-agnostic: the `Workbench` interface is the only thing that touches the
platform, and three implementations are planned.

- **Bench** (built): Playwright over the dev server, the iterate spike's measure core, real
  screenshots. `scripts/pro-harness-spike.mjs`.
- **Bridge** (next): the `/bridge` page's own functions driven headless, which is what the
  `noacg` CLI does today. A server-side run in a Vercel Sandbox with Chromium is the same shape
  the render worker already uses; this is the candidate for hosted Pro, and its cost per graphic
  (sandbox seconds, not tokens) is the number to measure before deciding.
- **Product** (later): the wizard's injected validator and iframe, findings-only until the
  browser can rasterise its own frame. Findings-only is measured adequate on lower thirds and
  inadequate on steppers and crawls (§2 item 3), so the product path either captures frames
  server-side or limits itself to the types where words suffice.

The model calls themselves go through the SDK's gateway provider with the same
`providerOptions.gateway` policy `aiGateway.ts` sends today. Whether hosted Pro keeps calling
the raw adapter through `/api/ai/generate` or moves to the SDK is a transport decision the
reservation accounting (`pro/managedCall.ts`) has to survive; the harness does not depend on it.

## 6. Deterministic validation, then inspection (`Workbench.inspect`)

Every accepted patch is measured on four states, and every reading becomes a `Finding` with a
stable identity (`source:code:frame:locus`) so it can be followed across rounds.

| State | What is measured | Instruments |
|---|---|---|
| hold (sample values) | the static gate; the runtime bench (binding, pre-play, entrance, overlap, overflow, occlusion, unpainted field, exit, replay, editability); spacing, proportion, alignment, readability, ticker margins | `productionSpxValidator`, `spacingCheck`, `proportionCheck`, `axisCheck`, `readabilityCheck`, `tickerCheck` |
| long (every text 1.7x, the containment gate's recipe) | the same instruments; this is where text-and-its-box is judged | same |
| edge (Nordic caps, an emptied optional, zeros) | the same instruments | same |
| each step along the default path | advance measured by markup diff, then the same instruments | same |

Severity follows the calibrated policy: static and runtime errors, text escaping its panel,
collisions (`text-over-rule`, `lines-crowded`), unpainted fields, blocking readability and
ticker margins BLOCK on every type; calibrated spacing and proportion thresholds block on the
types they were measured on (lower third, countdown) and advise elsewhere; alignment near-misses
group into one advisory. Everything blocking is a sentence with the number that produced it and,
where the platform can state one, one fix hint.

Two frames come back as downscaled JPEGs when capture is on: the hold and the long. The model
sees them as a tool result (a file part), which is how the SDK carries images back to the model.

## 7. The structured critique, and the repair rule

### 7.1 The critique (`harness/critique.ts`)

Nine questions, `VISUAL_TASTE_REVIEW.md`'s five axes and four text questions, answered by a
vision model as `yes / no / cannot-tell` with one sentence of evidence each, through
`Output.object`. Every NO becomes an advisory finding carrying the evidence; `cannot-tell` is
dropped. Three rules: it runs only after the deterministic gate is clean, its answers advise and
never block, and it runs once per generation by default. The calibration that would let a
question block is the one `CRITIC-CALIBRATION-2026-08-19.md` describes, and only one question
(a line drawn over text) has passed it; that class is caught deterministically anyway.

### 7.2 The repair rule (`harness/findings.ts` `verdictFor`)

After every inspection:

- **delivered** when nothing blocks;
- **repair** when blocking findings remain, the last patch changed something measurable (fixed
  or introduced a finding), and rounds and money remain;
- **stalled** when the last repair fixed nothing and introduced nothing: the same defects twice
  is the oscillation the owner measured, and the loop refuses it;
- **regressed** when a nearly clean round (two or fewer blocking) is answered by a worse one:
  the best round ships (§26.2, §26.3);
- **refused** when rounds or money run out.

One exception admits a round without a blocking finding: a clean gate whose critique named a
defect, once. After that repair the next clean measurement finishes regardless. The best round
is fewest blocking, then fewest advisories, then earliest, so a tie keeps the money already paid.

The model names the finding ids its patch addresses; the diff is read against that claim, and
the round's feedback tells it what its last change fixed, left and introduced. That is what makes
the second and third rounds cheap for a cheap model: it repairs a named list instead of
re-reading a graphic cold.

## 8. The model ladder and the cost controls

- **cheap** designs and repairs. The bench default is the funded route Pro already spends on
  (`google/gemini-2.5-flash`, vision-capable, ~$0.0039 per language call).
- **strong** is optional and takes over for exactly one round, only when a repair fixed nothing
  (the stall). Which model ran each step is recorded (`modelByStep`), so a round's cost and
  outcome are attributable.
- **vision** answers the critique, once.

Bounds, all of them binding at once: rounds (4), steps (12), money ($0.15, the existing
`PRO_MAX_GENERATION_COST_USD`), critiques (1). Cost is read from the gateway's reported cost when
present and estimated from a price table otherwise, per step, and the money bound is a
`stopWhen` condition, not prompt text. In hosted Pro the same numbers are the server's
`pro-generate` reservation; the harness reports what it spent so the booking can be settled.

## 9. The finished graphic is a standard NoaCG template

Nothing the model returns is a template. The scaffold is a real `variant.create()` output; the
patch guard keeps every field id, the `:root` contract, the definition, the runtime and the
machine; the authored animation converts through the same importer every catalog design goes
through; `finishGraphic` hands back an `SpxTemplate` that:

- validates through the export gate (it was benched clean to get here);
- carries its fields in the SPX definition and one element per field;
- carries its machine (a type's) or the implicit lifecycle machine, so the control page derives
  its buttons the ordinary way;
- keeps the Style panel's contract and the timeline's keyframe data, so a user can edit it;
- saves, exports and plays exactly as a wizard-made graphic, with no marker saying a model made
  it.

The bench writes it to `code/<brief>/`; the bridge workbench will hand it to `createGraphic`
exactly as `noacg save` does.

## 10. The smallest real experiment

**Question.** Does the harness make the funded cheap model deliver clean, airable graphics on
the custom bank at a cost the Pro target allows, and does the evidence-driven loop spend fewer
rounds than the iterate loop for the same or better result?

**Protocol.**

1. `npm run test:pro-harness` (in the build) - the loop mechanics at zero tokens.
2. `npm run queue -- "node scripts/pro-harness-spike.mjs --control --out=pro-harness-out"` -
   the workbench at zero tokens: scaffold, a known-good spine measures clean bar the owner size
   table, a forced overlap measures as a blocking finding, a `:root` patch is refused, the whole
   loop runs on a scripted model in a real browser. Run after any workbench change.
3. The paid round, ONLY after an owner OK with a cap stated in the same message:
   `node scripts/pro-harness-spike.mjs --generate --route=vercel:google/gemini-2.5-flash --vision --max-cost=3 --out=pro-harness-out-gemini`
   over the 21-brief custom bank (`benchmarks/pro/v1/custom/briefs.json`), the same briefs the
   iterate loop was read on. Frames land in `shots/`, code in `code/`, the ledger in `results.json`.
4. A blind page from the frames, the owner's read, the verdict into `docs/AI_ATTEMPTS.md`.

**Numbers to beat** (the iterate loop under the rules, §23.1): 19 of 21 delivered clean, 21 of
21 airable, $0.118 per graphic, ~2.7 model calls per graphic. The harness adds tool calls, so
the honest comparison is cost and rounds per DELIVERED graphic, not calls.

**Estimated cost.** A round is one tool-calling step of roughly 6-9k input tokens (the first
message, the scaffold and the findings) and 2-4k output; at the funded route's price a
four-round worst case is about $0.03 and a typical two-round run about $0.015, plus one critique
call. Twenty-one briefs sit under $1; the cap in the command above is a ceiling, not a forecast.

**What would falsify the design.** A delivered-clean rate below the iterate loop's on the same
bank, or the same rate at more rounds, says the tool loop costs a cheap model more than the
findings-in-a-message shape did. Then the finding to keep is the knowledge layer and the stop
rule, both of which the iterate loop can adopt without the tool loop.

## 11. What is built, what is next

**Built (this branch):** `src/ai/pro/harness/` - findings and the stop rule, the patch guard,
fourteen knowledge cards and their selection, type semantics from the registry, the critique
schema, the `Workbench` interface, the seven tools, the `ToolLoopAgent` with phase gating,
escalation and cost accounting; `scripts/pro-harness.test.mjs` (22 tests, in `npm run build`);
`scripts/pro-harness-spike.mjs` with `--control` and `--generate`; `ai` and `zod` as
dependencies.

**Not built, in order:**

1. The paid round of §10 and the owner's read of it.
2. The bridge workbench, so the harness runs off the same door the CLI uses and can be hosted.
3. Exemplar retrieval per type: the nearest catalog designs' MEASURED numbers (type sizes,
   paddings, gaps in the instrument's units) as a card, never their code.
4. The product path: a Pro request that resolves to no composed type routes to the harness,
   inside the existing reservation, with the wizard's Finish unchanged.
5. Agent-authored machines when no type fits (the P2 question) - the `animation` region stays
   platform-owned until then.
