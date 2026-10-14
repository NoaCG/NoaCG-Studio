# AI wizard review & improvement plan

> **PARKED 2026-08-08 - superseded by `docs/ADAPT_FIRST_PLAN.md`.** Written before the pivot,
> when the question was how to improve open-ended AI generation rather than whether to do it at
> all. Retained for §5's rejection of image-generation-for-backgrounds, which
> `docs/NOACG_PRO_PLAN.md` §1 answers rather than ignores. Nothing here is current strategy.

**Status: ACTIVE PLAN (proposed 2026-07-24).** Nothing here is built. It reviews the
Create-with-AI wizard step as it stands today, names what is weak, compares against what the
rest of the market does, and proposes an ordered plan. Where a proposal costs real API money
to prove, that is stated in the phase.

Scope: `src/components/wizard/ai/AiStep.tsx` + `ai/MoreControlPanel.tsx` (the
surface) and `src/ai/` (the harness). The video harness (`src/ai/video/`) is referenced only
as the in-house comparison. Contracts it must not break: `src/ai/CLAUDE.md` (the doctrine),
`docs/DESIGN_LANGUAGE.md`, and the root `AGENTS.md` pillars.

---

## 1. What exists today (the honest summary)

The engineering underneath is strong and, as far as the research below reaches, ahead of the
category. One design-stage model call returns three complete design specs; catalog-fit specs
assemble through the *real* wizard assemblers, so the output is correct by construction and
editable by every panel; compositional parameters (typography ratio, density, alignment,
shape) apply as deterministic CSS overrides; off-catalog briefs go to a coder with a
validated, bounded repair loop; every result is exercised in a live playout bench before the
user can create it. The optional "More control" panel turns the whole thing into a typed
`GenerationSpec` with user locks. Preference learning quietly tunes the design stage.

The weakness is **not** the harness. It is the surface, the loop, and the taste input:

- the user picks between three designs **by reading their names**;
- the loop is one prompt → one result → one blind refine, with no history;
- the SPX design stage gets one paragraph of taste teaching while the video harness gets a
  skill library and 14 design-DNA reference cards;
- the unit of output is one graphic, while the unit broadcasters actually need is a package.

---

## 2. Critical findings

### F1 — Three designs are chosen from a text list (severity: high)

`AiStep.tsx:508-522` renders the alternatives as buttons reading
`✓ Option 1 — Election Strap`. Selecting one swaps the single live preview. To compare three
directions the user must click through them and hold the previous two in their head.

This is the single largest gap between NoaCG and every consumer-grade AI design tool, and it
undercuts the harness's best feature: the whole point of the alternatives call is that the
three differ in *real* visual decisions (chassis, composition, typography, density, motion).
None of that is visible at the moment of choice.

The components to fix it already exist: `MiniPreview.tsx` (settled-state render, framed on
the graphic, IntersectionObserver-gated) and `preview/frameGraphic.ts`. `MiniPreview` takes a
`TemplateVariant` (`MiniPreview.tsx:24`) and calls `variant.create()`; an AI alternative is
already a built `SpxTemplate`, so it needs a template-accepting overload, not a new component.

### F2 — Refining destroys the other two options **and** the preference signal (severity: high)

`run()` (`AiStep.tsx:174-187`) — the path every refine, convert and raw generation takes —
calls `setAlternatives(null)` and `clearStagedSelection()`.

Two consequences:

1. **The alternatives are gone forever.** A user who picks option 2, refines it once, and
   decides option 3 was better has to regenerate from scratch and gets three *different*
   designs. Nothing is recoverable.
2. **The strongest preference signal is thrown away.** `commitStagedSelection()` only fires
   on project create with a *staged* pick. Refining clears the stage, so a user who picks a
   direction and then improves it — the most engaged behaviour there is — contributes
   nothing. With `MIN_SELECTIONS = 8` and `MIN_SHOWN = 6` (`preferences.ts:17-19`),
   `preferenceHint()` may realistically never fire for exactly the users it is for.

Fix: keep the alternatives list across a refine (refine replaces the *selected* entry, the
others stay pickable), and re-stage the pick after a refine rather than clearing it.

### F3 — The loop has no memory (severity: high)

`refineNow` (`AiStep.tsx:256-264`) sends one string, replaces the result, and clears the
input. There is no turn history, no "what changed", no revert to the previous result, no
before/after, and no way to attach an image to a refinement. `modify` receives the last
`DesignSpec` so a grounded refine re-assembles at spec level — good — but the user cannot see
that this happened, cannot undo it, and cannot branch from it.

Meanwhile the *video* shell treats chat as the primary authoring surface with every result as
an undoable snapshot. The two AI worlds in one product have opposite interaction models.

### F4 — Two disconnected conversation surfaces (severity: medium)

The brainstorm chat (`AiStep.tsx:379-420`) is a separate panel that produces a brief *string*
which the user then copies into the prompt box. It shares nothing with generation: the
generation never sees the conversation that produced the brief, and the refine box never sees
the brainstorm. Two chat-shaped things that don't talk to each other read as unfinished.

### F5 — Failure is a dead end (severity: medium)

`AiStep.tsx:553-566`: a failing result prints `✗ N check(s) failing — refine or regenerate.`
plus raw validator messages. For a non-technical user (a stated target) "Field f2 has no
matching element" is not actionable. The provider already knows how to run a findings-fed
repair round; the surface doesn't offer one. There should be a `⟳ Fix these` button that
feeds the exact findings back, which is precisely what the custom path does internally.

### F6 — The SPX design stage is taste-starved compared to the video one (severity: medium)

The SPX harness's entire visual teaching is `TASTE_REASONING` (`claudeProvider.ts:72-81`, one
paragraph) plus `catalogDigest()` (`designSpec.ts:251-274`, a structural listing: ids, line
counts, presets). The video harness gets `ai/video/skills.ts` (keyword-selected craft
fragments) and `ai/video/referenceCards.ts` (14 genre-scoped design-DNA cards with an axis
model and contrast selection in `ai/referenceSelect.ts`).

`referenceSelect.ts` already lives at `src/ai/` — outside `video/` — i.e. it was written to be
shared and never was. The SPX design stage is the natural second consumer: genre-scoped cards
would push the spec's compositional parameters apart far more than a generic instruction can.

Caveat that must be honoured: `docs/BROADCAST_DESIGN_SYSTEM_RESEARCH.md` shipped on
`SELECTION_MODE='legacy'` — contrast selection was measured and *rejected*. Any port must be
gated on `scripts/ai-compare.mjs` showing a win, per the harness's own decision rule.

### F7 — No brand ingestion, and no access to saved brand looks (severity: medium) — CLOSED by Phase 4

Brand today = one checkbox reusing the *current project's* palette and font
(`CreationWizard.tsx:341,537`), plus exact colour pickers inside More control. What's missing:

- **Extraction.** A user drops a logo or a still from their existing package; nothing derives
  a palette from it. Quantising an image for its dominant/accent colours is deterministic,
  free, offline, and needs no model — it fits the harness doctrine exactly.
- **Reuse.** Home already stores brand looks. The AI step cannot pick one.
- References are vision-only and reach the model as a prose `referenceSystem` string
  (`designSpec.ts:202-208`) — nothing structured survives into the assembled template.

Brand-first is table stakes for the design tools users compare this against.

### F8 — The output unit is one graphic; the need is a package (severity: high, strategic)

A channel needs a lower third, a ticker, a score bug, a fullscreen card and a stinger that
**share one design language**. Today that means running the AI wizard five times and getting
five unrelated designs, or matching by hand via the brand checkbox.

The harness architecture already permits the fix almost for free: one design spec carries
palette, font, typography, density, shape and motion character; `specToTemplate` assembles
*any* category from it. Generating a coherent kit is mostly a loop plus a package write —
and packages, `buildGraphicsZip`, and show export already exist.

Memory of the taxonomy work records a ratified decision that the kit surface is **its own
Entry card, not a Browse mode** ("Browse yields one graphic, a kit yields several"), shape
decided and unbuilt. AI generation is the strongest possible filling for that card.

### F9 — No cost or time expectation, before or after (severity: low-medium) — CLOSED by Phase 6

BYO-key users pay per generation. The settings block offers a model select with blurbs
(`AiStep.tsx:492-501`) and nothing else. `telemetry.ts` records tokens, stages, repair rounds
and route per run — all of it invisible in-product. Three alternatives + polish + a repair
round is a materially different cost from a raw one-shot, and the user picks between those
with a checkbox labelled only "(3 options)".

### F10 — Smaller items

- Example prompts (`examplePrompts.ts`) overwrite the prompt box with no confirmation
  (`AiStep.tsx:359`); a half-typed brief is lost on a curious click.
- The More-control spec persists as a cross-session draft (`AiStep.tsx:82-85`); a category
  pinned weeks ago silently constrains a later, unrelated generation. The `●` marker is the
  only tell.
- A dropped `.html` shows name + filename but no preview before the Convert/Open decision.
- The "Use NoaCG harness" checkbox exposes an internal implementation word to end users.
- Mobile layout of this step (long form + drop zone + accordion) is **mostly unverified**. The
  Phase 1 alternatives grid was checked at 390 px (one column, previews large enough to judge a
  design, all three reachable, nothing clipped); the rest of the step still wants a device pass.

---

## 3. What the market does better (and where NoaCG is already ahead)

**Broadcast graphics vendors are not the threat on this axis.** The 2026 AI announcements
from the incumbents are operational, not generative-design: Chyron's AI work is analytics,
auto-detection of goals/big plays for instant replay, and PRIME Translate for multi-language
output; Vizrt's is an AI Keyer and calibration speed-ups in Viz Arena 6 for AR sports. Neither
turns a written brief into an editable, exportable template. Loopic — the closest competitor
in shape — sells *no-code* template building (Template Definition Builder, OGraf schemas
without writing HTML/CSS/JS, Lottie support), not AI generation. Singular.live sells Composer
plus mobile-friendly Uno control surfaces. **A validated brief-to-template harness with a live
playout bench is genuinely differentiated in this category, and the plan below should protect
that lead rather than chase parity.**

**The bar is set by the general AI-builder tools**, which is where users' expectations are
formed:

| Pattern they've normalised | NoaCG today |
|---|---|
| Streaming output — you watch it build and spot problems early | One busy line, one long wait |
| Visual variant comparison side by side | A list of names (F1) |
| A durable chat thread with checkpoints and revert | One-shot refine, no history (F2, F3) |
| Attach an image mid-conversation | Images only at first generation (F3) |
| Brand kit ingestion, applied everywhere | One checkbox + manual colours (F7) |
| "Integration beats isolation" — the AI lives inside the workflow | Already true here (result lands as real code in real panels) — a genuine NoaCG strength worth stating louder |

The one thing consumer tools have that NoaCG deliberately should **not** copy: hiding the
code behind a scene model. That is a pillar, and the harness's grounded assembly is a better
answer than any of them have.

---

## 4. The plan

Ordered by (value ÷ risk). Each phase is independently shippable and independently verifiable.
Phases 1–2 need no model calls to prove; phases 3+ do.

### Phase 1 — Make the choice visual and the loop non-destructive — **BUILT 2026-07-24**

1. **Alternative thumbnails.** ✅ `MiniPreview` now takes either a `variant` (Browse, built
   lazily behind the IntersectionObserver) or a built `SpxTemplate` (the AI step, mounted
   at once — a lazy card below the fold of a scrolling step shows empty exactly when it is
   scrolled to). The three directions render as `[data-alt]` picker cards: live settled-state
   render, route mark, pass/fail mark, and the design's own words (density, heading weight,
   alignment, panel).
2. **Refine no longer destroys.** ✅ `alternatives` / `originals` parallel arrays; a refine
   replaces only the picked entry, and **↺ Undo refinements** restores the proposed design.
3. **Re-stage instead of clear.** ✅ `stagePick` — chosen facets from the direction as it
   stands, shown population from the originals; a lone result stages nothing.
4. **`⟳ Fix these` on a failing result.** ✅ The exact findings go back as the instruction, at
   code level, user-pressed (not an automatic loop on grounded assemblies).
5. **Example prompts confirm before overwriting.** ✅ Two-step arming ("Replace your brief?"),
   typing disarms.

*Verified:* `npm run build` green (tsc + api tsc + eslint + dependency-cruiser + vite);
`e2e/ai.spec.ts` 14/14 with five new cases — live previews render and name their decisions,
refining keeps the other directions and still commits a preference selection, undo restores,
the fix button re-validates, an example never silently replaces a written brief. The affected
suite (`styles.css` selects the shared-core set) ran 505/505. Screenshot pass at desktop and
390 px through the mocked harness — **no API calls left the machine**.

*Found by looking, not by reading* — worth keeping in mind for the later phases:

- MiniPreview's lazy mount is WRONG below the fold of a scrolling step: the gate exists for
  Browse's whole-catalog grid, and in the AI step it showed empty boxes exactly when they
  were scrolled to. A ready-made `template` skips it.
- Per-card verdicts cannot reuse `.status-ok`/`.status-bad` — four elements then answer to
  the step's verdict locator and an existing spec breaks. Cards use `.wz-alt-mark.ok/.bad`.
- A bare text node inside a flex container is an anonymous flex item, which `text-overflow`
  cannot reach: a long design name was cut mid-letter with no ellipsis until the name got
  its own box.
- Joined design words broke "center-aligned" across two lines at its own hyphen; separate
  terms with a column gap fix it, and an explicit "·" between them lands at the START of a
  wrapped line, reading as a stray bullet.

### Phase 2 — One conversation, with history — **BUILT 2026-07-24**

6. **Merged brainstorm and refine into one thread.** ✅ One transcript (`.ai-thread`) and ONE
   composer. The brainstorm was a separate panel producing a string the user copied into the
   prompt box; the refine was a second input inside the result card. Now the same box
   generates, talks (**🗨 Talk it through**) and refines — the primary action follows the
   state (Generate with no result, Refine with one) — and every earlier generation stays in
   the thread as a compact `ai-past` card with its directions and **↩ Bring back**.
7. **The conversation is context.** ✅ `GenerateContext.conversation` (bounded to the last
   `CONVERSATION_TURNS = 10` talk turns) renders into `contextText`, `modifyContent` and the
   spec-refine prompt, so every path — including raw — reads the whole exchange. The
   brainstorm system prompt no longer claims "the generator never sees this chat", because
   it does.
8. **Attach images mid-thread.** ✅ `AIProvider.modify` gained a `context`, so a refinement
   carries attachments; they reach `toTemplate`, which means an attached image is **bundled**,
   not merely described. `contextFrom` merges the template's own images with the turn's, so a
   spec-level re-assembly loses neither.
9. **"3 more like this".** ✅ `GenerateContext.seed` carries the picked direction's spec into
   the design stage with instructions to keep its spirit and vary everything that is
   genuinely a choice.

*Verified:* `npm run build` green; `e2e/ai.spec.ts` + `ai-depth` + `ai-more-control` +
`import-graphic` = 42/42, with four new cases (the thread carries both sides and the talk
reaches the generator; an earlier generation is restorable and the displaced one takes its
place; the seed reaches the design stage and only on the second call; an attached image
reaches the model by bundled path and lands in the created project's assets). The two new
context guards were **mutation-tested** — dropping `conversation` and `seed` from the context
fails all three of the specs that claim them. Screenshot pass on the thread. **No API calls
left the machine.**

*Found by looking:*

- The transcript was **out of order**: appending the new request before archiving the current
  result put the request above the result it superseded. Archive first, then record.
- Generating from a talk-derived brief with an empty box left **no trace in the thread** of
  what was asked for. The brief is now recorded as the request turn.
- With a result on screen the "Brief so far" strip is a **second copy** of a turn already in
  the thread — it now shows only while generating is still the next move.

*Deliberately not done:* the thread is **session-only** — it is not persisted with the
project and not kept as a cross-session draft. See the open question below.

### Phase 3 — Taste parity with the video harness *(SPENDS REAL MONEY: `scripts/ai-compare.mjs`)*

10. **Port the reference-card mechanism to the SPX design stage** via the existing
    `referenceSelect.ts`, genre-scoped, with an SPX-authored card set (the video cards are
    motion-first; SPX needs composition-first cards drawn from `DESIGN_LANGUAGE.md` §8 and the
    shipped families). Keep the legal contract intact: genres, never named works.
11. **Port the skill-fragment idea** for graphic *kinds* (a ticker, an alert, a score bug each
    have craft rules the catalog digest does not state).
12. **Gate both on `ai-compare`**, per the harness's own decision rule: a stage keeps its
    place only if it shows a clear improvement for its cost. If the compare rig says no —
    exactly as it said no to contrast selection — the cards do not ship, and that measurement
    is the deliverable.

*Cost note:* an `ai-compare` bank is roughly the $6–12 order per run recorded for the video
benches. Do not start this phase without an explicit go-ahead.

### Phase 4 — Brand-first — **BUILT 2026-07-24**

13. **Palette extraction from an uploaded logo/still.** ✅ `src/assets/paletteExtract.ts` —
    sample at ≤96px, bucket on a coarse RGB grid while accumulating real channel values (so a
    colour is its bucket's MEAN, not the grid corner), merge neighbouring buckets by weighted
    mean, then score for how likely a colour is to BE the brand: saturation squared × a
    lightness fit, with paper and ink scored out entirely. Pure arithmetic — no model call, no
    network, and **no randomness**, because k-means with a random seed would answer
    differently for the same file on every press.
14. **Saved brand looks selectable in the AI step.** ✅ `loadLooks()` feeds a picker; a look
    applies its exact palette and its font (uploaded or bundled).
15. **A structured brand block in the prompt.** ✅ **Already satisfied, nothing built** —
    `contextText` emits the exact `--accent/--text/--text-dim/--panel-bg` from `ctx.palette`
    (which `specPalette` fills from `brandColors`), and `fontsSection` in `spec/specPrompt.ts`
    already states the chosen families. This item was written from an incomplete read.

Both proposals land on `spec.brandColors`, the lock `applySpecLocks` already honours over
anything the model picks — so no new plumbing was needed to make brand win. Both only
PROPOSE: the machine cannot tell whether the red in a crest is the identity or the shirt
behind it, so the pick stays the user's.

*Verified:* build green; ai + ai-depth + ai-more-control + flows + video-project = 45/45,
with a new case driving a real 4×4 PNG (teal brand, tinted cream paper, tinted near-black
ink) through upload → swatches → pick → generate → create, asserting the exact hex reaches
the model AND survives into the created template's CSS. **Mutation-tested**: removing the
paper/ink lightness guard turns 1 offered colour into 3 and fails the spec. **No API calls.**

*Found by looking:* the uploaded-file chips were reusing `.wz-fid` — the **fixed 24px
field-id badge** — so every filename was crushed onto two cramped lines in the AI step, the
More-control panel and the video step alike. Filenames now have their own `.wz-file-chip`.

### Phase 5 — Generate a KIT, not a graphic *(the differentiator; SPENDS MONEY to evaluate)*

16. **One brief → a coherent package.** Design stage returns one shared design system plus a
    per-graphic spec list; each assembles through `specToTemplate`; the result lands as a
    package with N graphics, one create.
17. **Fill the ratified kit Entry card** with this (the shape is already decided: its own
    Entry card, not a Browse mode).
18. **Kit-level review surface** — the N thumbnails together, so the *coherence* is what the
    user judges, which is the whole point.

This is where no competitor currently plays, and it is nearly free architecturally because
the grounded assembly path is already category-agnostic.

### Phase 6 — Transparency and trust — **BUILT 2026-07-24**

19. **Cost/time expectation before Generate, actuals after.** ✅ `src/ai/runStats.ts` reads the
    telemetry ring the provider has always written: the median of up to the last 8 matching
    runs, split by harness-vs-raw because that IS the choice the checkbox offers. Below 2
    matching runs it returns null — a first-time user gets **no number rather than an invented
    one**. Actuals come from `lastRun()` after each run, never from `showChange` (picking a
    different alternative costs nothing, and charging the run's tokens to that click would be
    a quiet lie).
20. **On-air readiness report.** ✅ `src/validation/readiness.ts` groups findings that already
    exist into six operator-facing rows. It **adds no checks** — that is what lets a row say
    "not played, so not tested" honestly on the raw path instead of borrowing credit for a
    bench that never ran. Findings whose rule no row claims are surfaced verbatim rather than
    swallowed.
21. **Renamed the harness checkbox** ✅ to "Design 3 options and test them live"; the setting
    id and the e2e-pinned default are unchanged.

**No money is displayed, deliberately.** Per-token prices are not in this codebase and they
change; a stale figure presented as cost would be *believed*. Tokens and seconds are exactly
what was measured, and a BYO-key user maps them to their own bill.

*Verified:* build green; ai + ai-depth + ai-more-control = 28/28, with four new cases (a
passing result reports six real verdicts; the raw path reports three passes and three
untested; no history means no expectation while seeded history gives a median; a run whose
provider reported no usage says nothing about tokens). **Mutation-tested:** deleting the
untested-row guard makes the raw path claim all six checks and fails the spec.

*Found by looking:* the first render said **"0 tokens in / 0 out"** whenever the response
carried no `usage` block. Zero is a measurement claim, not an absence of one — the line now
reports the time it knows and stays silent about what it does not, and the e2e fixture grew
a `usage` block so it stops exercising the no-usage path by accident. `formatDuration` also
answered "0 s" for a sub-second run; it now says "<1 s".

---

## 5. Deliberately NOT proposed

- **Hiding the code / a visual-only scene model** — violates a pillar.
- **An image-generation model for backgrounds/textures** — pulls output away from clean,
  editable, exportable code and adds a runtime asset problem.
- **Auto-applying a taste critic's rewrite over a valid grounded result** — already deferred
  in `src/ai/CLAUDE.md` for the right reason; nothing here changes that.
- **Chasing incumbent AI features** (auto-replay detection, AR calibration, translation) —
  different products, different buyers.

---

## 6. Open questions

1. **Kit scope (Phase 5):** which graphics belong in a default kit — fixed list per genre, or
   AI-proposed from the brief and user-trimmed?
2. **Conversation persistence (Phase 2) — RESOLVED 2026-07-25: persist with the project.**
   The thread now travels with the created graphic. AiStep reports its talk turns up
   (`onThread`); `createFromAi` commits them to the store's `aiThread`, which rides the same
   rails as `aiSpec` — `SavedProject.aiThread` (autosave slot) and `GraphicDoc.aiThread` (every
   Save), synced. The editor's AI panel shows the carried conversation read-only ("Created from
   this conversation"). Only the talk turns travel; the `past` generation snapshots are a
   wizard-session affordance, heavy to persist and unshowable in the editor (`model/aiThread.ts`).

   **Correction to the cost stated when this question was raised:** it does NOT need a version
   bump or a migration. `aiThread` is an ADDITIVE OPTIONAL field, and rule 6 is explicit —
   "additive optional fields never bump the version." It is the exact pattern `aiSpec` already
   shipped under: `SavedProject` has no version field at all, and `GraphicDoc` stayed `version: 1`
   when `aiSpec` was added. Bumping `GraphicDoc` to 2 would have been wrong — every current build
   would treat new records as an unknown version and degrade them read-only for no reason.

   The two rejected options, for the record:
   - *Leave it session-only* (the Phase 2 default). No persistence, no staleness.
   - *Cross-session draft* (localStorage, like the More-control spec draft). Survives closing
     the wizard; a weeks-old conversation could then silently become context for an unrelated
     brief — the staleness (c) avoids by binding the conversation to its own graphic.
3. **Phase 3 budget:** is a real-token `ai-compare` run authorised, and at what bank size?
4. **Custom-brief machines:** should the AI ever propose states/events for an off-catalog
   brief, or does the operator model stay type-derived only?

Sources for §3: [Chyron AI in broadcast production](https://chyron.com/ai-in-broadcast-production-chyron/),
[Chyron PRIME Translate](https://www.tvtechnology.com/business/chyron-announces-prime-translate),
[Vizrt AI-powered AR sports features](https://www.tvtechnology.com/news/vizrt-launches-new-ai-powered-features-to-speed-up-ar-sports-production),
[Loopic](https://www.loopic.io/), [Singular.live features](https://www.singular.live/features),
[vibe-coding tools compared](https://www.epam.com/insights/ai/blogs/best-vibe-coding-tools-v0-lovable-bolt-replit-and-figma-make).
