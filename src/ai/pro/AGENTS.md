# src/ai/pro - the design-language tier

Loaded alongside the root `AGENTS.md` and `src/ai/AGENTS.md` when working in this directory
(Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly). Keep it
accurate. **Every `##` section states its STATUS in its first line** - the parent's rule, and it
binds here for the same reason.

Split out of `src/ai/AGENTS.md` on 2026-08-26: at 17 KB the tier's three sections were the
largest block of a file EVERY harness session loads, and every file they describe already lived
here. `proTypes.ts` came with them as `pro/types.ts`. The parent keeps a pointer, plus the
paragraph that binds BOTH tiers - Lite and Pro are separate projects, and that rule is not this
directory's to state.

## NoaCG Pro - the design-language tier (`pro/`)

**LIVE since 2026-08-15 (hosted deployments where `AI_PRO_ENABLED` is on).** Pressing Create on the
Pro tier runs **ONE text call for a design LANGUAGE**, then the platform composes **every graphic
the user asked for** in it - a lower third, a sponsor bug and a countdown by default
(`pro/language/graphics.ts`, docs/NOACG_PRO_PLAN.md §15.9). The package is the tier's promise and
it costs what one graphic costs, because only the language is generated; the wizard's own picker
and the set-shaped Finish are src/components/wizard/AGENTS.md's. The composer:
`pro/brief.ts` maps the shared wizard brief onto it, `pro/language/pipeline.ts` is the one route
from the wizard to a Pro graphic, and `pro/language/gate.ts` is the one seam it is scored through.
The Phase A section below holds the four rules that bind the composer.

Three things this shape changed, all of them consequences rather than choices:

- **There is no browser cost ceiling on the live path.** `PRO_MAX_GENERATION_COST_USD` guarded a
  TWO-call pipeline - it existed to stop the second call once the first had spent the budget. With
  one call the money is already spent by the time a browser could refuse it, and throwing then
  destroys a finished graphic for no saving (the 2026-08-08 lesson). The server's `pro-generate`
  booking is the bound that still binds, against the same constant.
- **The ledger row carries WARNINGS as well as errors**, filtered to a `pro-` prefix
  (`proRuleCodes`). Errors stay unfiltered because an error is why a row says `failed`; warnings
  are filtered because the runtime bench is chatty by design and the wire caps the list at 30, so
  bench noise would evict the Pro-owned codes. Sending errors alone is what let a repaired graphic
  write an EMPTY `validation_rule_codes` beside `usable` (§16).
- **THE MARK IS KNOCKED, NEVER PLATED** (owner, 2026-08-16, after reading the first accepted Pro
  set - `docs/NOACG_PRO_PLAN.md` §17.1). A single-ink mark that measures under the contrast floor
  on the chosen panel has its ONE INK recoloured to white or black, whichever reads, and sits on
  the panel itself; a full-colour mark keeps its colours and waits for a well the DESIGN provides.
  **The platform paints no repair field at all any more.** The read that produced the rule is
  subtler than "no boxes": lt07's blue well and ls10's red well were both liked, because a well a
  design DRAWS is composition while a neutral field the platform paints around the artwork is a
  patch. `markTreatmentFor` still fires only on a measured single ink (`MarkProbe.inkSpread`), and
  a knock that cannot clear the floor is NOT applied - the mark is left exactly as supplied and
  `pro-mark-unreadable` says so, because recolouring somebody's logo to something still unreadable
  spends the alteration and buys nothing.
  **A knock is a `filter`, and the as-is screen refuses every filter on a protected picture** - so
  `assetIntegrity.ts` admits exactly one shape on exactly one platform-owned class
  (`…-logo--knocked`), with nothing else in the rule. Mutation-checked: a blur, a partial
  brightness, a drop-shadow, the same filter on another selector, and the knock smuggling a
  `clip-path`, `border-radius` or `object-fit: cover` beside it are all still blocking errors.
  Pinned by `e2e/pro-language.spec.ts`, which measures the emit through the REAL screen.

**The concept-and-reconstruct engine is DELETED (2026-08-15).** `pro/reconstruct/` held it behind
a build-time import boundary for one day, and both went in the same change once the last thing
reading it - a fixture bank, four `scripts/pro-*` runners and nine `e2e/pro.spec.ts` tests - had
somewhere else to be. The fixture bank was archived outside the repo first; the paid rounds that
produced it stay in `benchmarks/pro/round-2026-08-0{8,9,10}/` and in `docs/AI_ATTEMPTS.md`,
because they are the measurement Phase A rests on.

### What the retired engine measured, kept because Phase A rests on it

**RETIRED - the reconstruction path was PARKED on measurement (2026-08-08), replaced
(2026-08-15) and deleted the same day.** The concept stage worked and the compiler could not keep
what it designed: visibly broken on 5 of 12 while the gates reported 11 of 12 passing. The three
findings worth carrying forward, none of them about images:

- **A gate that measures the right dimension and DISCARDS the answer is a scoring bug.** The
  compiler's own `ProCompileReport.warnings` separated broken from usable on 11 of 12, and the
  bench computed `pass` without reading them. The same bug reached production a layer nearer the
  student: the first real hosted generation shipped a graphic printing its own words twice with
  `validation_rule_codes` EMPTY and the ledger row saying `usable`. That is why `pro/language/`
  has exactly ONE scoring seam (`gate.ts`) and why the ledger row now carries `pro-` warnings as
  well as errors.
- **No gate asked whether the compiled graphic RESEMBLED the concept**, so a wrong graphic scored
  `editability 1.00`. A deterministic gate cannot catch a defect in a dimension it does not
  measure - the doctrine at the top of this file, paid for here.
- **A control that does not execute the product path is not a control.** Two paid rounds were
  mis-read as model failure while the platform was at fault (`docs/AI_ATTEMPTS.md`), and for two
  months the product ran an engine the plan had already replaced while the composer nobody could
  reach scored 26 of 30.
**A Pro generation is capped at `PRO_MAX_GENERATION_COST_USD` = $0.15** (`pro/contract.ts`),
booked by the server's `pro-generate` reservation. The number was sized against the retired
engine's measured $0.0777; Phase A measures $0.0039, so it is now loose by roughly 38x and
catches only a runaway - stated in the constant's own note rather than quietly retuned, because
too low a ceiling destroys a finished graphic somebody was already billed for. There is no
browser ceiling any more: with one call the money is spent before a browser could refuse.

**HOSTED Pro is a server BOOKING** (`AI_PRO_ENABLED`, default off; `docs/AI_TASK_REGISTRY.md`).
`src/ai/pro/session.ts` opens ONE reservation per generation (`POST /api/ai/pro-generations`) and
the pipeline forwards `proGenerationId` on every model call; `/api/ai/generate` admits each call
against it and settles the provider's real cost into `ai_generations` (migration 0044). **A
`session` of null is the bring-your-own-key and offline-stub path, unchanged** - a caller
spending their own key is never metered.

**A FLEET SLOT FOLLOWS THE WORK, NOT THE CLOCK, and that is what makes Pro usable by a class.**
Thirty students press Create within seconds of each other. Two things were wrong together: the
reservation answered `shared_capacity` on its first observation, and it booked the slot for the
profile's whole 15-minute expiry - so most of the room got an error, waiting on slots that did
not turn over. Now the admission RETRIES the shared slot with jitter (`reserveProCapacity`,
Lite's shape), and the reservation is taken on a lease covering ONE call which every settled call
renews (`proCapacityRetryPlan`, migration 0046). A live generation keeps its seat; an abandoned
tab frees it within a lease instead of a quarter of an hour. **Only the fleet slot is retried** -
a quota, the user's own overlap, the spend ceiling and a duplicate are durable answers, and
re-asking them would just spend the classroom's request budget.

**The retry SPACING follows the first measured turnover** - 62 s for a real slot cycle, so the
default is ~31 s (half the cycle, Lite's rule; three attempts straddle one full turnover).
`AI_PRO_RETRY_SPACING_MS` moves it without a deploy, and `/api/ai/pro-outcome` keeps recording
`runtime_ms` so the number keeps following the fleet.

**AN UNSPENT RESERVATION IS RELEASED, so infra failure costs no allowance and no fleet budget.**
A reservation books the whole $0.15 ceiling; only the first SETTLED call replaces it with real
spend. A run with ZERO settled calls (a 503, a timeout, an abandoned tab) provably paid for
nothing - `pro_call_count` is server truth - so once it is terminal or its lease runs out it
stops counting toward the daily starts and the fleet spend sum (migration 0049 in
`ai_task_usage`; the same rule mirrored in the memory store, and `/api/ai/pro-outcome` zeroes
the row and expires the reservation on `failed`). A run with ANY settled call keeps its start
and its real cost - a validation failure spent real money and counts. The browser adds ONE
bounded in-session retry on a provider outage only (`shouldRetryModelCall`, modelTypes.ts):
safe because an unsettled call left the reservation's budget untouched, and a retry is a new
admission against the SAME booking - never a re-POSTed reservation
(`api/_lib/pro/reservationAccounting.test.ts` pins all of it, both directions).

**`PRO_STANDARD_ROUTES` (`pro/contract.ts`) is ONE route, pinned so a normal Pro user never picks
models**, and `api/_lib/aiProProfile.ts` funds exactly that one. **The funded list is ANDed by
`resolveProGate`** - every entry must be priced, catalog-approved and not switched off from
`/admin`, or hosted Pro is unavailable to everyone - so a route the product does not spend on is
a live foot-gun rather than a harmless leftover. It carried the retired image route until
2026-08-15, where disabling a model nothing called would have taken the whole tier down. Do not
add a route Pro does not spend on. The audited image entry stays in `aiModelCatalog.ts` as an
audit record and is marked in use by nothing.

## The Pro Harness (`pro/harness/`)

**EXPERIMENT - bench-only.** The evidence-driven tool loop the owner asked for on 2026-09-05: a
cheap model designs into a scaffolded spine through three writable regions, the platform renders,
validates and measures after every patch, and a repair round runs only on new evidence. Its
contract is **`src/ai/pro/harness/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you
work in that directory; the architecture and the first experiment are `docs/PRO_HARNESS_PLAN.md`.
One thing binds from out here: the harness is the road for types the language composer does
NOT compose - it never replaces the Phase A lane below for the types it does.

## NoaCG Pro PHASE A - the design language (`pro/language/`)

**LIVE since 2026-08-15 - this is what a Pro user gets.** The premise change in
`docs/NOACG_PRO_PLAN.md` §15: **the platform owns each graphic type's structure and spacing, and
the model's entire contribution is the design LANGUAGE** - palette, type scale and weight, shape
and corner language, accent form and weight, density, motion character. Three paid rounds moved
the owner's verdict 6 → 7 of 12 while every machine measure improved, and all five remaining
failures were panel layout; §15.3 ranks what has ever moved a rate (asking for judgement moved
nothing, a boundary moved a lot, **removing the decision** moved most and stayed removed).

Five rules bind anyone editing it:

- **ONE ENGINE, AND THE PRODUCT IS ON IT.** `pipeline.ts` is the only route from the wizard to a
  Pro graphic and `gate.ts` the only seam a composed graphic is scored through - product, bench
  and control alike. Both exist because the alternative was measured: for two months the product
  ran an engine the plan had already replaced, and the composer nobody could reach scored 26/30
  while the live one shipped a graphic printing its own words twice.
- **THERE IS NO NUMBER IN THE MODEL'S ANSWER.** `contract.ts` is enums, four hex colours and a
  bundled font id. A geometry field would be a panel decision wearing a different name, and the
  five failure classes would come straight back through it. `normalizeDesignLanguage` never fails
  and never invents: every field is one of the values the schema offered or the house value, so
  the composer downstream has no defensive branches.
- **THE PLATFORM COMPOSES IN THE UNITS THE INSTRUMENTS MEASURE IN, WHICH MAKES EVERY MARGIN
  KNOWABLE - NOT CLEAR.** Every size in `structure.ts` is a ratio of the primary type size, the
  same unit `spacingCheck` and `proportionCheck` report in, so the file can state a margin against
  each threshold and one free sweep can check it. **`node scripts/spike-structure-margins.mjs` did
  (2026-08-16, 582 compositions, 1164 readings) and nine of the eleven stated margins moved**
  (docs/NOACG_PRO_PLAN.md §18): a DERIVED ratio is the CSS the composer wrote, not the box the
  browser painted, and leading, the mask idiom, a size floor firing above its anchor and a
  fit-content panel all move it. `text-crowds-rule` was stated at 0.45 and measures 0.14 - the
  `block` accent's slab is a rule too, and the gap to it is the LINE gap, not `RULE_GAP_RATIO`.
  **`footprint-large` is BREACHED** at the stress words (0.14 against a 0.10 ceiling, on 59 of the
  162 strap stress readings that have a footprint, and none at the control's words); the
  instrument reports and does not gate, so what changed is that the file no
  longer claims a margin it does not have. `padding-lopsided` and `text-escapes-panel` are the two
  that hold - opposite sides are equal in every declaration, and no text escaped its panel in any
  of the 792 readings that have one. **State a margin only with the frame that produced it.**
- **IT COMPOSES THROUGH THE CATALOG'S OWN ASSEMBLER.** `compose.ts` builds a real `TemplateVariant`
  through `defineVariant`, so a Phase A graphic inherits the `:root` contract, the auto-fit
  `width: fit-content` box (**which is why text can never escape its panel**), the mask idiom, the
  NOACG_ANIM region, the SPX definition, the shared logo slot and export readiness. §16 is the
  argument: Pro's own document-building lost a GOOD panel in reconstruction.
- **THE CONTROL RUNS THE CODE UNDER TEST.** `stub.ts`'s four hand-written languages go through
  `composeFromLanguage` - the identical function a model answer will - and ride the spike's free
  pass (`languageAnchors`, `node scripts/pro-spike.mjs --control`), measured by the same
  instruments a paid round is scored by. A control that does not execute the path is not a control,
  and this repo has paid for that finding three times.
- **AN INSTRUMENT MEASURES THE BOX ITS QUESTION IS ABOUT, and the two mark boxes are the
  precedent.** `spacingCheck` reported the mark's clear space off the `<img>`'s BORDER box, so a
  design expressing that clear space as image padding had it counted as zero. An instrument whose
  false positives are the good designs is one authors learn to ignore, which is worse than no
  instrument. It now measures the INK (`markContentRect`, inset by padding and border), and
  `proportionCheck` deliberately does NOT follow: `mark-oversized` asks how much ROOM the mark
  takes and a padded well takes all of it, which is also what `MARK_SCALE_CEILING` is calibrated
  on. Two questions, two boxes, each stated where it is read.
  **Measured over all 24 mark-capable lower thirds with a square crest**
  (`node scripts/spike-mark-clearance-sweep.mjs`, which reports the border-box control and the ink
  reading off ONE render): exactly three designs move and all three move up - lt07 0.22 -> 0.36,
  lt41 0.31 -> 0.52, ls10 0.25 -> 0.56 - and the other 21 are byte-identical, because only those
  three pad the image itself. lt07 was the only reading the artifact was pushing under the 0.25
  floor. **The absolute ratios depend on the MARK**, since a slot that sizes itself from the
  artwork's aspect paints a different height for each one; the set that MOVES does not.
- **THE MARK-GAP UNIT IS THE PRIMARY TYPE SIZE, and it used to be the mark's own height - which
  divided a design by its own generosity.** Under the old unit ls18 was called crowded at
  **22px** of clear space while lt08 passed at exactly 22px, and ls25 at **30px** while lt15
  passed at 26px; in both pairs the flagged design had the same or a LARGER gap and a much taller
  mark (135px and 130px against 75px and 84px). Neither was a spacing defect - ls25 is a
  `picture` well holding square cover art, ls18 stretches an institution's mark to the height of
  the card - and this file's own doctrine is that an instrument whose false positives are the
  good designs is one authors learn to ignore. **Recalibrated 2026-08-15 against the catalog**,
  the way `spike-spacing-calibrate.mjs` requires and the way every OTHER ratio in `spacingCheck`
  already worked: floor **0.35** type sizes (under the catalog's tightest shipped pairing, lt08
  at 0.41, and inside a real gap - the next reading is 0.45), ceiling **2.1** (the same ~1.3x
  headroom over the widest shipped lockup, lt54 at 1.61, that the old ceiling carried). In type
  sizes the 24 mark-capable lower thirds run 0.41-1.61 and neither previously-flagged design is
  an outlier: ls18 is 8th of 24, ls25 is 13th. The unit also clusters far tighter - p95/p05 is
  **2.9x** against the mark-height unit's **4.3x**, and a distribution spread four-fold has no
  floor to put under it. **Nothing is lost by dropping the mark's height as the unit**, because
  `proportionCheck`'s `mark-oversized` still measures it (ceiling 3.2, on the BORDER box), so a
  design cannot dodge the gap floor by growing its mark - it hits that ceiling instead. The
  finding now carries all three raw numbers (`22px from 43px type, mark 135px`).
