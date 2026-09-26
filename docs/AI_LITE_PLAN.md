# NoaCG Lite - the plan to the student release

**Status: written 2026-08-08 against a deadline that has passed.** Students went live and the
student release closed on 2026-08-22 (`docs/GOALS_ARCHIVE.md`); AI work is postponed behind the
2026-09-12 production, so nothing here is in flight. The doctrine and the four owner decisions in
§2 still stand and exist in no other file - read it for those, not for a schedule. This file is
the forward plan only - what must be true by that date, in what order, and how it is judged. Nothing
historical lives here: the OpenRouter-era rounds and route tables are `docs/AI_LITE_BENCHMARK.md`
Appendix C (parked), the dead ends and their retry conditions are `docs/AI_ATTEMPTS.md`, and the
doctrine and code contract are `src/ai/AGENTS.md` and `docs/ADAPT_FIRST_PLAN.md`.

## 1. Where Lite stands

| | |
|---|---|
| Production | ON since 2026-08-07, signed-in, quota'd. Anonymous access remains OFF (§6) |
| Transport | Vercel AI Gateway. Second attempt goes to the PRIMARY, not a weaker fallback |
| Cost | **$0.00034 per generation** - about 3% of the ~€0.01 ceiling. **Not a constraint** |
| Reliability | **30 of 30** briefs machine-usable, zero rejections, on `lite-lower-third-v13` (2026-08-09, `benchmarks/lite/ROUND-2026-08-09-V13.md`) |
| Scope today | lower thirds only, 13 measured semantic reference chassis, with 1-4 visible fields |
| The open problem | **quality**. The v14 real-model semantic round measured 6/8 visually usable; the esports zero-width-sample defect is fixed unpaid, while history ordering remains unresolved |

**Cost should stop being discussed.** There is 30-100x headroom, every candidate route fits, and
route choice is a QUALITY decision. The scarce resource is human review.

### 1.1 Semantic category system - DONE 2026-08-09, free

Lite now asks the existing constrained decision call for category inference, honest confidence
and alternatives, plus nine structured style-intent axes. A manually selected category is
authoritative. Auto mode proceeds only above the confidence and margin floors; ambiguity returns
category choices for the UI instead of forcing a lower third. Category words are no longer a
brittle regex refusal.

`CATEGORY_CONTRACTS` in `src/ai/lite/contract.ts` is the one registry for category structure. Its
complete lower-third entry owns supported graphic types, 1-4 visible fields, field kinds, named
content slots, compatible measured chassis, the type-owned linear state machine, and the standard
operator events. The model never writes fields, lifecycle code, or a second scene model.

Thirteen proven lower thirds now carry semantic style signals, measured geometry, field capacity,
and slot roles. Trusted server retrieval selects at most five relevant and diverse references and
narrows both the prompt and structured-output enum to the same set. The model ranks a primary
reference and up to two fallbacks; deterministic compilation tries them when runtime geometry,
contrast, brief fit, or generic-treatment checks reject a hold frame.

The locked provider-free bank covers history lecturer, fire/heat, university, public news,
documentary, luxury, technology, and esports. `npm run bench:lite:semantic` rendered all eight
through the production compiler and runtime bench: **8/8 category-correct, machine-valid, and
hold-clean**.

The real-model v14 round ran on 2026-08-10 under a US$0.08 ceiling. The paid frames measured
**6/8 visually usable**: history lecturer failed model slot ordering, and esports hid two
supporting fields despite a three-field machine-usable decision. The unpaid follow-up reproduced
the esports result with zero-width samples, disproved the catalog attribution, and added semantic
repair plus a compile-level refusal. Full attribution, spend, and gallery findings:
`benchmarks/lite/ROUND-2026-08-10-V14-SEMANTIC.md`.

## 2. The four owner decisions (2026-08-08)

These are binding and exist in no other file.

1. **Scope: all catalog categories, BEST EFFORT.** Not a curated subset. Lite's allowlist widens to
   the whole browse catalog and each category is taken as far as it goes; a category that cannot be
   made good in time ships as good as it got, or is switched off, but it is not quietly dropped from
   the plan. *(Count the union rather than quoting a number: `AssemblerId` in
   `src/model/wizard.ts` carries 22 browse categories once `imported-design` is excluded.)*
2. **Success test: the owner judges a GALLERY of real generations, per round.** Machine-valid is not
   the bar and never was. A bench and a judge have each already passed a graphic carrying a real
   clipping bug, so a round is not read until its frames are.
3. **Control-panel parity is REQUIRED for the deadline.** A Lite quiz must drive through the same
   backend, machine and control page as a catalog quiz. **Verify end to end - build one, save it,
   open `#/control/<id>`, drive it - never assume.** The mechanism that should make this free is in
   `src/ai/AGENTS.md`: Lite compiles through the same `variant.create()` the wizard runs, so parity
   ought to follow by construction. "Ought to" is not a verification.
   **Verified 2026-08-09** on a lower third and on one graphic of every interactive type
   (`docs/CONTROL_PANEL_PARITY.md`): the mechanism does hold - `create()` is the wrapper that calls
   `attachMachine`, so the machine, its controls and its labels arrive whatever asked for the
   template. The obstacle to a Lite quiz turned out not to be the machine at all: `specToTemplate`
   slices lines to `variant.maxLines`, which is 1 on a compiled quiz against five declared line
   fields, so a Lite decision declaring any lines yields a board with four blank answers (§7 there).
4. **This consolidation happens before further Lite work.** Done: `src/ai/AGENTS.md` reordered and
   status-labelled, `docs/AI_ATTEMPTS.md` written, six docs parked.

## 3. The honest read on scope, and the recommended sequence

**All categories, plus mandatory control-panel parity, plus per-round gallery judging, is a large
two weeks.** Stated as a flag, not as a refusal - the scope is the owner's call and the work below
is planned for it in full. What makes it large is not the category count: it is that decisions 2 and
3 both bind *per category*. Every widening step needs frames read by a human and a control page
driven by hand, and that is the reviewer-fatigue constraint the loop in §4 is built around, not a
model constraint.

**Recommendation: sequence the INTERACTIVE categories first** - `quiz`, `poll`, `game-timer`,
`scoreboard` / `esports-score`, `starting-soon`. Two reasons, and the second is the one that
matters:

- They are the categories with real state machines and real operator events, so they are where
  decision 3 can actually fail. A lower third has one step and two fields; parity there proves
  almost nothing about parity for a quiz.
- **Failure in these categories is invisible until air.** A strap that is slightly wrong is visibly
  slightly wrong on the Finish step. A quiz whose reveal event never reaches the control page looks
  perfect in preview and fails in front of an audience. Test the ones that can embarrass a student
  live, first.

Static categories (`info-card`, `corner-bug`, `ticker`, `infographic`, `end-credits`, `frame`,
`alert`, `public-info`, `stream-notification`, `versus`, `matchup`, `results-board`, `reveal`,
`transition`, `audience`) follow, and are expected to be cheaper per category because they mostly
inherit the lower third's already-measured shape.

## 4. The loop

```
frozen brief bank  →  one round (~$0.010)  →  FRAMES READ BEFORE any gate output
   →  every rejection gets a MECHANISM and an OWNER
        model     →  remove the decision, or clamp it in the SCHEMA
        platform  →  a deterministic gate, or corrected metadata
        catalog   →  design work
   →  re-run
```

**The invariant: a defect leaves the list only when something makes it unrepeatable - never when a
prompt sentence says not to do it.** Three supporting rules, all learned expensively:

- **Attribute before fixing.** Rounds have twice read as "the model cannot design" and been platform
  bugs. A headline defect once looked like model taste and was three lines of catalog CSS.
- **Machine-usable is not a quality signal.** 18/18 with zero rule codes, alongside a five-line
  strap.
- **A pass COUNT is not a diagnosis - read the ledger's `rejection_reason`.** 29/30 was the score in
  four different rounds that failed for three different reasons, and the v13 fix was invisible in
  the count until the column named it. `ai_generations` grouped by `prompt_version` and
  `rejection_reason` separates a schema refusal from a semantic one; the runner's own tally cannot.

**The gallery clips swap their text on purpose - the graphic is not broken.** Every `.webm` spans
entrance → hold → **update** → exit, because the runner fires a second `update()` with different copy
once motion has settled (`scripts/ai-lite-eval.mjs`, the `updateData` call after the hold frame);
`stop()` follows 600 ms later, so the swap can never overlap the exit tween. `update()` writes
`textContent` and nothing else (`src/templates/shared/base.ts`) and no shipped Lite lower third arms
a timer transition or calls `next()` itself, so on air the copy changes only when an operator sends
it. **Clips need a caption saying so** - two readers have now asked.

What makes the loop affordable is structural: **Lite's model writes no code.** Every failure is
either a *decision* (fixable by narrowing the schema - free, permanent, applies to every future
generation) or a *compile/catalog* issue (fixable once, for everyone). Nothing here is fixable only
by paying for a bigger model.

## 5. Build order

Each step is free unless marked. Steps 1-3 are the parity and instrumentation work that must be true
before widening; 4-6 are the widening itself.

1. **Verify control-panel parity end to end on a lower third. DONE 2026-08-09** - and widened to one
   graphic of every interactive type the catalog ships, driven field by field and event by event on
   `#/control/<id>`. **`docs/CONTROL_PANEL_PARITY.md` is the result**: parity holds structurally
   (every type's machine survives `variant.create()`, produces its declared buttons and greys them
   by the structural guard), and what was weak was the operator surface. Four defects fixed, four
   gaps left recorded there. Pinned by `e2e/control-panel-types.spec.ts`.
2. **Widen the field-paint drive past one state. DONE 2026-08-09.** `validation/fieldPaint.ts` read
   ONE state, which was safe only because Lite ships single-step lower thirds; measured against a
   catalog quiz it falsely reported the audience-percentage field unreachable. It now snaps through
   the machine's states and unions what each shows, stopping as soon as every field has been seen.
   **No longer a blocker on step 4.**
3. **Decide what a multi-state Lite decision even contains.** Today's schema describes a chassis,
   lines, palette and typography. A quiz needs steps and events. `docs/GOALS.md` records the shape
   this should take - a structured MACHINE stage spliced in deterministically, the way `designSpec`
   already works - and notes that **no generation path in the repo currently asks any model for a
   machine.** This is the single largest unknown in the plan and it is not a Lite-only problem.
4. **Widen to the interactive categories, one at a time**, each with a gallery round and a driven
   control page before the next starts. *(~$0.010 per round.)*
5. **Widen to the static categories**, batched where their shapes match.
6. **Then, and only then, consider the route.** With a scorecard that measures frames rather than
   compilability, run the open-weight candidates. *(~$0.010 per candidate.)*

Deliberately **not** on this list: the skin path, the vision judge, and any prompt rewrite. The
first two are server-flagged off and gated on the loop producing a trustworthy scorecard
(`docs/AI_ATTEMPTS.md`); the third is the least effective lever measured so far.

## 6. Open, and the owner's to decide

- **Anonymous access.** `ANONYMOUS_PLAN['ai.lite'] = false` puts spend behind an account. The
  per-user quotas (3 successes, 6 starts/day) are the real spend control and they key off a user id;
  an anonymous caller has no identity to bind to, leaving the $25/day fleet ceiling - a *budget*,
  not a limiter, shared with every other Lite user. **Recommendation if wanted: ship it behind a
  device-scoped quota first** (the audience plane's device-token pattern,
  `docs/INTERACTIVE_PLAYOUT_PLAN.md`), never on the fleet ceiling alone.
- **What "best effort" means at the deadline for a category that is not good.** Ship it, or switch it
  off? Decision 1 says best effort; it does not say which of those two a bad category gets.

## 7. Brand integration - a user's logo and colours in a Lite graphic

**The forward MASTER PLAN for the brand push - the value-vs-templates kill test, the
exact-colour contract, and the Ling 3.0 Tiny free-window campaign - is
`docs/AI_LITE_BRAND_PLAN.md` (proposed 2026-08-12). This section stays the record of what is
already built and measured.**

**Status: DESIGNED, MEASURED and BUILT to step 3 on 2026-08-09. No round paid for.** This
is the product promise the plan has never tested. v13 proved Lite can REPRODUCE a template;
nobody has ever asked it to ADD something, and "a channel's own graphic" is the whole difference
between this and a catalog browser.

### 7.1 What "coherent" means, as a claim a render can refute

Nine measurements, all taken off the painted frame, none inferable from the CSS. Thresholds and
their reasoning are `RULES` in `scripts/ai-lite-brand-audit.mjs`; the two that are borrowed
verbatim from `NoaCG-Brand-Kit/BRAND-MANUAL.md` are the lockup width and the clear-space idea.

1. **The slot exists** - a `filelist` field bound to an `<img id="fN">` that paints. (`no-slot-*`)
2. **The mark is painted at all** once a file is in it. (`not-painted`)
3. **Not distorted** - painted aspect within 2% of the source's. (`aspect-distorted`)
4. **Not cropped** - no `object-fit: cover`, no clip. (`cropped`)
5. **Big enough**: a crest-shaped mark >= 32px painted height, a lockup (>3:1) >= 96px painted
   width, at 1920x1080. The manual's own floors are 16px and 96px; the mark's is doubled because
   16px at 1080p is 1.5% of frame height. **Which dimension decides is the MARK's aspect** - a
   wide lockup dies on width long before it dies on height, and measuring only height is how a
   6px hairline reads as a pass. (`below-min-size`)
6. **Clear space** >= 0.25 x the mark's own painted height to the nearest painting neighbour,
   and never an overlap. (`clear-space`, `collision`)
7. **Placed, not floating** - inside the design's own `-box` and inside title-safe.
   (`outside-box`, `outside-safe-area`)
8. **Legible against the surface the slot actually paints.** Two different floors, because they
   are two different physical questions: a TRANSPARENT mark composites its ink onto the surface
   and can vanish (3:1, WCAG's non-text floor); a mark carrying its OWN field cannot vanish and
   can only fail to separate (1.5:1). (`ink-contrast`, `field-separation`)
9. **The accent came from the brand and the house amber did not survive it** - no painted colour
   within tolerance of `#f6a623` under a brand palette carrying none. (`house-accent-survives`)

Deliberately NOT claimed as measurable: whether the mark is in the *right* slot for the brief.
That is taste, it goes to the gallery, and pretending to grade it is how a bench passes a graphic
with a real clipping bug (§4).

### 7.2 The mechanism: the DESIGN declares the slot, the compiler fills it

**Decided. The model does not place the logo.** Its only logo decision stays the one it already
has - `useLogoSlot`, plus which chassis - and everything about where, how big, how clear and on
what surface is the design's own drawn geometry, measured and gated.

The evidence is three findings, in order of weight:

- **Lite cannot place a mark at all today.** All six audited chassis are `logo: 'none'`;
  `--lite` reports 30 of 30 `no-slot-field`. There is no model decision to improve, because no
  model choice reaches a slot that does not exist. The first work is catalog work.
- **The Pro re-diagnosis says the failure mode is arithmetic, not taste**
  (`benchmarks/pro/round-2026-08-08/DIAGNOSIS.md`, `src/ai/AGENTS.md`): the concept stage saw the
  design correctly, and the compiler rendered it at 0.72x, placed live text at 0.59x and
  re-bucketed the position into one of nine zones. A model asked to place a mark in coordinates
  would be handing its answer to the same class of arithmetic. A model asked to pick a design
  that already contains a drawn slot hands over nothing.
- **The slots that exist get it wrong in ways a model could not have fixed.** 14 of 65 pairs
  absorbed the mark; 0 of 13 chassis were clean on all five shapes; and **0 of 13 could carry a
  wordmark or a horizontal lockup at legible size**, which is what most real brands are. That is
  a drawing problem with a measurable target, not a prompting problem.

The cost of the decision, stated plainly: **placement stops being creative.** A brand graphic
will be a catalog design with the brand's mark in the slot its designer drew, not a composition
arranged around the mark. That is the same trade adapt-first already made and won
(`docs/ADAPT_FIRST_PLAN.md`), and the escape hatch is the same one: the way to place a mark
differently is to DRAW a design that places it differently, and let retrieval put it in front of
the model.

### 7.3 The free proof, and what it found

`node scripts/ai-lite-brand-audit.mjs` (+ `--lite`, `--all`, `--ids`, `--marks`, `--palette`,
`--check`, `--json`). Renders the real template through the real assembler with a real mark,
settles, and reads the frame back - the `lite-line-capacity.mjs` method turned onto geometry.
Spends nothing. The mark bank is authored SVG committed in `scripts/ai-lite-brand-fixtures.mjs`,
never an uploaded file, so the audit measures mark SHAPES rather than whatever somebody had.

Full round: **`benchmarks/lite/BRAND-AUDIT-2026-08-09.md`**. The three results that change the
build order:

- **No catalog lower third can carry a wordmark or a wide lockup.** 0 of 13, twice. The slots are
  near-squares of 52-140px; a 10:1 rail contains down to a 6-14px hairline.
- **The shared logo slot violates the platform's own as-is screen.**
  `templates/shared/logoSlot.ts` - inherited by every future `logo: 'optional'` design - puts a
  `border-radius` on the mark, and `lt08` adds `object-fit: cover`. `src/ai/assetIntegrity.ts`
  rejects exactly those on a picture the user marked "use it as it is". Two live contracts that
  have never met, because no path has yet sent a protected upload into a catalog slot.
- **The palette that fights a mark is chosen by the surface the SLOT paints**, not by the
  package's lightness. Nearly every logo well is painted in the accent, so a knockout mark on a
  "light package" was still landing on something dark and the contrast column came back clean.
  It took a pale-ACCENT brand to make the check fail. The audit's first run was wrong in the
  direction that flatters.

### 7.4 Build order, and none of it needs a model

Free unless marked. Each step ends with the audit re-run, so the next one starts from a number.

1. **Fix the two as-is violations. DONE 2026-08-09.** The shared slot no longer rounds the mark
   and `lt08` no longer crops it; `cropped` went from 9 failures to 0. `ls25` declares
   `imageSlot: 'picture'` (`model/wizard.ts`) because its slot is release artwork, not a mark,
   and cropping it is the design being right.
2. **Draw the lockup case. DONE 2026-08-09.** The shared slot is a BAND now - sized by height
   with the width free and a cap - so a mark takes the room its own shape needs and only
   something past ~4:1 letterboxes. On the Lite chassis `below-min-size` went from 33 failures
   to 0: the wordmark paints 256x64 where it used to paint a 20px strip.
3. **Give the six Lite chassis slots, with measured metadata. DONE 2026-08-09.**
   `types/lowerThird.ts` declares `logo: 'optional'` - a compiled variant takes the TYPE's
   capabilities, so flipping the design files alone would have emitted a slot the wizard never
   offers. `--lite` went from **0 of 30 pairs to 21 of 30**, five of six chassis clean on every
   mark shape geometrically. `LiteCatalogEntry.logoSlot` carries the measurement (`fits` =
   geometry, `surface` = tone), gated by `--lite --check` and mutation-proved. Full account:
   `benchmarks/lite/BRAND-AUDIT-2026-08-09.md` §6.
4. **Only then, one paid round** over the eight briefs in `scripts/ai-lite-brand-fixtures.mjs`
   (five lower thirds servable today, three in categories §3 widens to). The schema change is
   expected to be nil-to-tiny: `useLogoSlot` already exists on the wire and the request already
   carries `hasLogo`. **The version this round mints is earned by the metadata, not by a
   sentence** - step 3's `logoSlot` is measured but nothing in the PROMPT reads it yet, and
   putting it in the chassis digest is what changes the model's chassis choice when a mark is
   present. A bump whose only content were a plea for better logo placement is precisely the
   lever §4 records as the least effective measured so far.

*(~$0.010 for a round of 8, at v13's $0.00034 per generation. Cost is not the constraint here and
was not the reason to stop.)*

### 7.5 The gap step 3 exposed, and how it was closed. DONE 2026-08-09, free

`logoSlot` was measured and the model could not act on it, because the request never said what
the user's mark IS: `LiteGenerationRequest.hasLogo` was a BOOLEAN. The model could be told lt02
holds every shape on a dark surface and still had no way to know whether the file in the user's
hand was a knockout wordmark that reads there or a dark-only one that vanishes - and `--lite`
measured that exact failure three times.

Both missing facts are free, deterministic and need no model, so both are now measured in the
browser before anything is sent (`assets/assetInfo.ts` `probeMark`, one image, one 64px canvas
pass) and sent as `LiteGenerationRequest.mark`:

- **shape** - `markShapeFromAspect` buckets the natural aspect into `portrait` / `square` /
  `wordmark` / `rail`. The cuts live in `lite/types.ts` alone; the audit's fixture bank declares
  its five marks against them rather than re-deriving them.
- **backing** - `own-field` or `transparent`, from the share of fully opaque pixels. A logo
  flattened onto a white tile is opaque and genuinely does bring its own field.
- **ink** - `light` or `dark`, from the alpha-weighted mean luminance, and only for a
  transparent mark. The 0.35/0.65 cut is wide of the middle on purpose: a mid-grey mark has no
  honest answer, so it gets none rather than a tone that might be wrong.

Content-free by construction - a bucket, an opacity fact and one word. No bytes, no name, no
dimensions. `hasLogo` stays beside it: it is what the quota check reads, and the request
validator is a strict key allowlist, so a browser tab loaded before a deploy still works.

`logoSlot` reaches the model on the digest line that already said `logo:yes`, and the constraint
rides the existing chassis-selection line rather than becoming a line of its own - §6c of the
benchmark measured that every line added to this prompt degrades the axis it targets along with
the ones it does not. Two structural pins in `scripts/ai-lite-bench.test.mjs`: the aspect cuts,
and **no mark shape servable by only one chassis** - the same rule the intent kinds are under,
for the same reason.

**Step 4 now has a paid semantic round. The esports failure is fixed unpaid; history ordering is
the remaining real-model failure recorded in
`benchmarks/lite/ROUND-2026-08-10-V14-SEMANTIC.md`.**

## Standing decisions

Owner decisions that still bind this plan (moved from the retired rulings file, 2026-09-26).

- The AI door invites people to create an account, not only to sign in.
- Lite covers the useful catalog; the category list in code is the only count, so docs never hand-count categories.
