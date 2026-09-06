# AI attempts - what was tried, what it measured, what would make it worth retrying

The graveyard. One entry per approach this repo paid to learn about and then stopped using, so a
session cannot mistake an abandoned approach for current strategy, and cannot re-propose one from
scratch when the only thing that changed is a model.

**Read the RETRY WHEN line, not the verdict.** "qwen3.7-flash failed" is history; "retry when a
sub-$0.20/Mtok route serves real JSON Schema" is a standing instruction that fires itself. An
entry whose answer will not change says `never` and why.

Live contract: `src/ai/AGENTS.md`. Deadline plan: `docs/AI_LITE_PLAN.md`.

---

### The model-vs-harness four-arm study
**2026-08-15 · `alibaba/qwen3-coder` + `anthropic/claude-sonnet-5` · 24 of 24 captured,
~$2.70 of a $4 authorization · OWNER'S BLIND VERDICT: A ≈ B and D >> A - NOT the
checkpoint, and the harness CARRIES quality rather than suppressing it.** Both harness
arms 4.17 mean quality and 6/6 would-air against the bare arms' ~3.2 and 3-5/6; the
checkpoints TIE both bare and harnessed, while frontier-harnessed cost ~20x open-harnessed
($2.07 vs $0.11 for the same six briefs). So no model swap fixes anything, the §6
selection-for-plainness hypothesis is refuted as the cause of the gap (constrained output
scored a full point HIGHER), and the owner's most-repeated bare-arm defect - a fixed-width
banner that "should scale with the text", four of six items - is exactly the house
fit-content contract the harness enforces. Owner's closing read: this is how our templates
should look; what is missing is VARIETY and brand adaptation ("the real test is how to
modify it to a color scheme and logo or a theme"), which is the Pro §15 design-language
premise and Lite's brand work, unchanged. Full outcome + the voided-and-re-judged first
ballot: `docs/MODEL_VS_HARNESS_STUDY.md` §5. The
experiment `docs/LOWER_THIRDS_REFERENCE_CORPUS.md` §7 designed: the same six no-logo Pro
briefs through a BARE arm (the product's own `RAW_SYSTEM` baseline plus the f0/f1 field
contract - one call, no repair, no conversion, rendered verbatim) and the FULL HARNESS arm
(the spike's exemplar configuration) on both checkpoints, pinned decoding, all 24 rendered
identically over one real-footage bed and captured with the shared Lite lifecycle rig.
Blind flat-shuffled gallery; predeclared readings and their operationalization are
`docs/MODEL_VS_HARNESS_STUDY.md` §3 (written before the ballot); rig
`scripts/model-vs-harness.mjs`; archive `noacg-lite-eval-archive/model-vs-harness-2026-08-15`.

Machine facts that are safe to state before the ballot: both harness arms 6/6
contract-clean with 6/6 EDITABLE timelines - the exemplar block converts the frontier
checkpoint's regions too - and both bare arms 0/6 against the house editability contracts
by construction, which is precisely the product trade the gallery prices. One repair round
fired in 24 generations (`long-name` on the frontier harness arm, and its repair re-sends
the whole exemplar prompt: $0.79 of the round's $2.44 is that one brief).

Four traps paid for and kept: **the gateway reports $0.0000 for anthropic routes**, so a
cost ceiling fed the reported number never trips - frontier rows are priced locally from
usage tokens and labeled `estimated`; **a frontier bare emit writes an SPX-definition
SHAPE the parser rightly rejects** (`dataFields`/`id`/`type` for `DataFields`/`field`/
`ftype`), so the capture drive falls back to the pinned f0/f1 contract rather than
un-driving one arm and breaking the §7 viewing-conditions control; **the open checkpoint's
bare emits declare fields as `name:` and parse to EMPTY ids**, which keyed the drive by
`''` and let every template's own `update()` erase its baked text - the whole bare-open
arm was voided in the first ballot, re-filmed for zero tokens from saved code (the seeded
shuffle kept the blind codes, so only six items were re-judged), and the six systematic
"no text" notes were the tell that it was the rig, not six designs; and the corpus reel
never leaves a clean multi-second window, so the shared footage bed is three delogo'd
graphic-free frames with a slow push - a recorded compromise, identical across arms,
which is the variable that matters.

SEPARATELY, the owner's ask: the frontier checkpoint narrated its full design process for
one creative brief before writing code (~$0.21, `reasoning-entertainment.md` in the
archive) - 14 ordered decisions, decomposed in `docs/MODEL_VS_HARNESS_STUDY.md` §6 into
proposed platform STAGES ranked by `docs/DESIGN_PRINCIPLES.md` (the device-exists proxy,
the one-brightest-element and idle-motion-budget measurements, platform-injected auto-fit
and seated placement). Nothing ships from it: it is the ablation menu for the `A >> D`
reading.
**RETRY WHEN** a materially different checkpoint CLASS exists to test (the two here tied
twice, so a third similar model answers nothing), or the harness changes enough that the
D-vs-A comparison could plausibly invert - and then re-run THIS rig with the same briefs
rather than designing a new one. The variety and brand questions the verdict leaves open
are not retries of this experiment; they are the Pro §15 and Lite brand programs.

### The brand round - originality conditioned on a customer's own brand
**2026-08-13 · NoaCG Pro Phase 1 · `alibaba/qwen3-coder` · 30 of 30 captured, $0.63 of a $1 cap ·
OWNER READ: roughly half airable, and the new named defect is the MARK'S SURFACE, not its
placement.** This is the round the entry below scheduled, run through the logo contract
`docs/NOACG_PRO_PLAN.md` §14 item 1 shipped first (declare an empty slot / deterministic fill /
rendered gate / motion sampled through the virtual clock).

Protocol: the same 12 briefs, each conditioned on one of four SYNTHETIC brands
(`benchmarks/pro/v1/spike/brands.json` - invented organisations; marks measured by `probeMark`),
both arms, plus a DIVERGENCE cell re-running `news-public` and `entertainment` under every other
brand on the no-exemplar arm. Owner's verbatim read: the archived `notes_filled.md`.

**The machine half:** 29/30 contract-clean (the one failure is `assetIntegrity` catching rounded
corners on the mark's container - the screen working); **30/30 declared a usable slot**, so Phase
0's broken-image defect class did not recur at the contract level; 21/30 passed the rendered mark
gate; 30/30 animate the mark in AND out. Four wrote their own `src` against the contract
(repaired deterministically, recorded). Repairs fired on 17/30 against Phase 0's 1/24 - the mark
contract works the loop hard.

**The owner half: 14 airable (2 conditional), 11 one localized repair away, 3 not acceptable, 2
unmarked.** The cross-cutting rules, written blind: lower thirds stay vertically COMPACT (mark
BESIDE the text, never stacked above/below); a mark-sized white box around a transparent logo
"looks like a JPEG pasted on top - not acceptable"; line-to-banner alignment can make a graphic
unusable; thin hairlines are broadcast-risky; dark text needs a backing or outline; and stills
cannot judge motion - the next round owes ANIMATED strips.

**THE NEW NAMED DEFECT - the well that reads as a bounding box.** The contract taught "give the
mark's ink a surface it reads on", and the model answered with mark-sized white plates on ~7
results - technically contrast-correct and visually "broken alpha". The SAME white surface
INTEGRATED into the composition (a real banner segment) was praised twice. So the teaching is
half right: the missing half is that a well must be a compositional element, not a bounding box -
and the owner explicitly asked for a machine check. It is measurable: a surface whose rect
tracks the mark's rect within a small margin is a pasted box; one that joins the panel system is
a design. The ink-contrast gate fired 6 times and measured the right area's WRONG dimension: the
owner never objected to contrast, only to the box.
**THE CHECK IS BUILT AND CALIBRATED (same day, free - the round's code was saved):**
`measureRenderedMark` now reports `mark-own-background` (the img paints its own background -
transparency defeated at the source) and `bounding-box-well` (the nearest painted surface hugs
the mark within 0.6x its height on every side). Scored against this round's own blind labels by
`scripts/spike-well-calibrate.mjs`: **7/7 owner-flagged items caught, 4/6 praised items clean** -
and the two disagreements are the finding's honest limit, measured: the identical ~12px-margin
gradient plate on a dark panel was praised on `long-name` and `gradient-accent` and called
"visibly exposed" on `news-public`. Same geometry, same tones; what changed is the brief's world.
So the check REPORTS and never gates, and the prompt now teaches the surface as a compositional
element ("if deleting the mark would leave a floating plate that belongs to nothing, the mark
has a bounding box, not a place in the design") - **which was then measured and does not work;
see the ablation-round paragraph near the end of this entry before treating it as a fix.**

**The own-field mark wins on today's contract.** The Ledger brand (a mark that brings its own
field) took 6 of its 8 items to airable - no well decision to get wrong. The transparent
dark-ink monogram (needs a light surface) collected most of the white boxes.

**The compactness rule indicts the CATALOG's shared slot too.** The blind set included the
hand-authored control with `applyLogoSlot`'s band - the mark ABOVE the text - and the owner gave
it the same note as the generations: too tall, put it beside. `templates/shared/logoSlot.ts`
needs a side-placement option; that is catalog work, not spike work.

**Instruments earned their keep.** The alignment-axis instrument's ONE flagged near-miss
candidate is exactly the item the owner called "currently unusable" for line-to-banner
misalignment (`sports-live.kestrel.exemplar`; catalog false-positive base rate 3/90). The
rendered gate's `not-painted` is the owner's "placeholder square". And **the code axis separated
the arms where frames could not: exemplar arm 12/12 editable data-block timelines, no-exemplar
arm 18/18 read-only.** The exemplar block's ~34,500 tokens buy the CONVERTIBLE authoring grammar
- the first measured evidence FOR it, invisible to Phase 0's frame-only read. The cheaper
falsification worth trying before Phase 3 leans on retrieval: teach the grammar-conformance
lesson without three complete designs and see if conversion holds.

**The 12/12-vs-0/18 claim is confirmed, and the ledger field that looked like it disagreed was
the broken one (2026-08-13, free).** `codeAudit.region.converted` called 10 of the 18
no-exemplar results converted while the validator demoted every one to a read-only timeline.
Re-parsing all 30 saved templates with the real `parseAnimData` settles it: 12/12 and 0/18,
agreeing with the demotion on 30 of 30. The audit field was a REGEX for the string `NOACG_ANIM`
- and what those ten models did is write a block SHAPED like the data block that the parser
rejects, which `convertEmittedRegion` cannot rescue (its own parse fails, so it restores the
model's code verbatim: text present, nothing editable). That is a sharper finding than "they do
not know the grammar" - unprompted, the model imitates the OUTPUT form it can see in the
contract's name instead of writing the authoring GSAP the prompt asks for, so the ablation's
lesson should forbid hand-writing `NOACG_ANIM` as explicitly as it teaches the builders. The
audit now takes the parser's verdict from the page and reports `null` where nothing parsed it;
a regex may not answer a parser's question.

**Divergence: no four-tints failure.** Same brief under four brands produced genuinely different
designs (`divergence.html`). The round's only NOT-ACCEPTABLE results are world-crossed pairings
(`entertainment` under the sport and institutional brands) - brand-brief coherence degrades
output before sameness ever appears.

**Harness lesson, paid for mid-round:** a generated template threw inside its own
`buildInTimeline` and the capture rig let it kill the round at 11/30 - and the code-save sat
AFTER the captures, so that generation's paid code was lost. Fixed the same hour: a lifecycle
throw is a recorded RESULT, and the deliverable lands on disk the moment it exists.

**ANIMATED REVIEW IS BUILT (2026-08-13, free).** Each strip is now also encoded to a looping webm
the blind gallery plays in place, sampled on the same virtual clock at exactly one playback frame
per step so it runs at the graphic's real speed. The five stills are untouched - the mark-motion
gate was calibrated on them - and the clip is what the §0.2 read now judges motion from. Two
things the build had to get right: an early version fitted its grid across the phase AND folded
the stills into the sequence, which made a 1340 ms entrance play as a 1.60 s clip (easing is read
from timing, so a clip that misreports it is worse than none); and the update strip's five stills
start at the instant `update()` fires, so its clip leads in 300 ms to show the swap happen rather
than 900 ms of a frozen frame. Native `controls` are off - the bar lands exactly on the lower
third. ffmpeg is optional; without it the gallery falls back to stills.

**THE ABLATION RAN, AND THE EXEMPLAR BLOCK SURVIVES IT (2026-08-13, $0.215 of a $0.40 cap;
archive `pro-exemplar-ablation-qwen3-coder-2026-08-13`).** Same 12 briefs, same brands, same
pinned decoding, same `alibaba/qwen3-coder`, with a ~480-token lesson in the exemplar block's
slot: what the ANIMATION region is for, the shape the importer reads, and an explicit
instruction not to hand-write `NOACG_ANIM`. **1 of 12 editable timelines, against the exemplar
arm's 12 of 12** - and three exemplar re-runs reproduced the stored arm exactly on that axis
(retrieval identical, timelines editable 3/3), so the comparison is against a live arm, not a
stale one. The ~34,500 tokens buy something a lesson does not teach.

Two things worth carrying beyond this round. **The prohibition did not suppress the behaviour
it named:** 6 of 12 wrote a `NOACG_ANIM`-shaped block anyway (the un-taught arm was 10 of 18 -
the same rate), which is the §"write a constraint as INSPECTION" rule reappearing as a null
result. And **the remaining 6 failed differently** - no block at all, authoring GSAP the
importer still could not read - so the arm did not trade one failure for another, it simply
did not move either. A worked example of a region conforms; a description of one does not.
Cost stayed honest: $0.011 a generation against the exemplar arm's $0.028-$0.038.

**THE WELL-INTEGRATION TEACHING DOES NOT WORK, MEASURED (2026-08-13, free).** The ablation
round is its first paid outing, and re-measuring both rounds from their saved code with the
SAME check says it moved nothing: the untaught no-exemplar arm was 9/18 boxed (50%), and the
taught grammar arm is **8/12 (67%)** once the dead marks below are repaired and can be judged
at all. Like-for-like on the exemplar arm, 8/12 before and 2/3 in the drift re-runs - flat.
The rate looked like it had improved (5/12) only because five marks were invisible, and an
invisible mark cannot be flagged for its surface.

So the teaching has now been written twice and measured once, and prose is not what is missing.

**TAKING IT STRUCTURALLY WAS TRIED (owner decision, same day): the DECISION shipped, the
DRAWING did not, and the reason is the interesting part.** Deciding whether a mark needs a
surface turns out to need nothing from the design - `decideMarkSurface` compares the mark's
probed ink against the design's declared `--panel-bg`, compositing a translucent panel over
black AND white and evaluating every stop of a gradient, worst case wins; which neutral a field
would use is computed rather than assumed, because a mid-tone mark breaks the "light ink wants a
dark field" rule (the sunbeam roundel reads 1.8:1 on the light neutral and 9.4:1 on the dark).
Over the ablation's 15 generations it fires on exactly the three the rendered gate flags for
`ink-contrast`. **Drawing the field failed twice**: a wrapper with `align-self: stretch` was used
at the mark's own height (the slot sits in the design's own flex container and the mark's
`height: 100%` makes the cross size circular), so it hugged the mark and its padding took two
marks under the minimum legible size; a `display: contents` wrapper with a bleeding `::before`
preserved every mark's size and painted the band across the middle of the panel over the text,
because a pseudo-element with no box of its own resolves against whatever ancestor happens to be
positioned - and the rendered gate cannot see a pseudo-element in the first place.
**The transferable rule: a surface can only be "a band of the composition" if the platform knows
the composition.** Lite can draw one because Lite owns PLACEMENT too. Taking the surface while
leaving placement to the model asks the platform to draw a shape inside a layout it has never
seen, which is why the same mistake produced two different-looking failures.

**SO THE PLATFORM TOOK PLACEMENT (owner, 2026-08-13), and the defect class closed.** The model
still declares the slot - the filelist field and the `<img id="fN">` are its emit, so the SPX
field contract stays the operator's - and the fill MOVES that img into a leading column of the
box, at the catalog's own audited size (fixed height, free width, wordmark cap). The column is a
grid item, so `align-self: stretch` finally means something: it runs the full height of the text
stack, which is what makes the mark's surface a band of the composition rather than a plate, and
the same property did nothing one commit earlier because the platform did not own the container
it was asking. Re-measured over the ablation round's 15 saved generations, filled and then
cleared:

| | before | after |
| --- | --- | --- |
| clean | 4 | **13** |
| not-painted | 5 | 0 |
| bounding-box-well | 10 | 1 |
| ink-contrast | 3 | 0 |
| hides when the operator clears the field | 15 | 15 |

The two residuals are honest and both are geometry no placement fixes: `empty-optional` is a
two-line strap whose panel is barely taller than the mark, so a full-height column and a
mark-sized box are the same rectangle; `sports-live` reports a collision between the mark's rect
and a SKEWED accent rule that visually passes between mark and text (the rect-vs-skew limit the
axis instrument already documents).

**AND THE FIRST GENERATIONS UNDER THE NEW CONTRACT (2026-08-13, $0.145 of a $0.30 cap, archive
`pro-placement-round-qwen3-coder-2026-08-13`; 11 of 12 captured, one lost to the output-token
ceiling). Clean marks 2/12 → 8/11, dead marks 5 → 0.** Same 12 briefs, brands, decoding and
checkpoint as the ablation's grammar arm, so the comparison is like-for-like.

**And it inverts the "teaching does not work" finding - because it is a different teaching.** The
one that failed asked the model to DRAW a good surface (a judgement); this one tells it not to
draw one at all and that the seat belongs to the platform (a boundary). A rule that removes a
decision lands where a rule that refines one did not. **What it does not do is make the outcome
independent of the model:** 8 of 11 complied, and compliance is what placement exists to stop
depending on.

**The round did not actually exercise placement, and the reason is worth more than the round
was.** The guard meant to spare hand-authored CATALOG designs sniffed the CSS for
`.{prefix}-box.has-image` - and every one of the 11 generated designs writes that rule, because
reacting to the mark's presence is ordinary CSS. So the guard matched 11 of 11 and the platform
placed nothing, in the round run to measure placing. Whether the platform owns a design's
placement is now the CALLER's answer (`fillBrandMark(..., { place })`): a candidate is generated,
an anchor is hand-authored, and neither is a thing to infer from a stylesheet. Re-measured over
the same saved generations with the guard fixed: 11/11 placed, 8 clean, contrast failures 1 → 0,
and the mark still hides when the field is cleared on all 11.

**THE THIRD BLIND READ SAYS THE PREMISE IS WRONG, NOT THE POLISH (2026-08-14, owner, on the
instruments round).** 7 of 12 airable - against 6 of 12 the round before and 14 of 30 in the
brand round - while three separate pieces of machinery were built and every machine measure
improved (clean marks 2/12 → 11/12, contract failures to zero, every mark seated). The owner's
words: *"we are doing minor changes to these graphics… we are not at the stage where it's just
minor changes that are going to fix it… we need a system where it can reliably create all the
graphics based on some rules, rather than us giving feedback to each graphic."*

**Every one of the five failures is a PANEL-LAYOUT decision** - text on the design's own rule
(2), text overflowing the panel onto the picture (1), a composition stranding the text in a
corner (1), furniture around the mark inflating the graphic (1). **None was colour, typography,
motion or brand fidelity**, all of which are working. And the adapt-first anchors pass the
owner's eye every round, dismissed as "template graphic", because nothing on that path composes
a panel at all. Three rounds of teaching, measuring and repairing the model's composition moved
the human verdict by one item.

**The instruments caught 2 of the 5, and one MISS is an instrument bug worth the entry:**
`spacingCheck` reported 3.92 type sizes of right padding - a roomy number - on the graphic whose
name hangs off the panel onto the footage, because it measures padding from children CONTAINED
by the panel and silently drops anything that escapes it. **The worst case read as the most
comfortable.** Fourth measurement in this rig to answer a flattering version of its own question.

The conclusion and the plan are `docs/NOACG_PRO_PLAN.md` §15: Pro stops being "a model composes a
panel" (the failing premise, and the one that competes hardest with a path costing a fraction of
a cent) and becomes "a model decides a design LANGUAGE, the platform renders it across every
graphic type a show needs" - built on brand conditioning, which is the half that measures well.

**THE MARK CONTRACT MEASURED WHOLE, ON FRESH GENERATIONS (2026-08-13, $0.083 of a $0.35 cap;
archive `pro-seated-round-qwen3-coder-2026-08-13`).** 12 of 12 captured, 12 of 12 contract-clean,
12 of 12 seated by the platform. The three grammar-arm rounds, same 12 briefs, same brands, same
pinned decoding and checkpoint throughout:

| | clean marks | never painted | box-well | contrast fail | cost |
| --- | --- | --- | --- | --- | --- |
| no teaching, no seat | 2/12 | 5 | 5 | 2 | $0.215 |
| teaching only | 8/11 | 0 | 1 | 1 | $0.145 |
| **teaching + platform seat** | **10/12** | **0** | **2** | **0** | **$0.083** |

Cheaper as well as better, and for a reason worth keeping: the void round below spent three
times as much because it burned two repair rounds on every brief fighting a definition it had
itself deleted. **A harness bug is not only a wrong measurement, it is a bill.**

The two residual box-wells are the honest floor already described - a panel barely taller than
its mark leaves a full-height column and a mark-sized box the same rectangle. **What the round
does NOT change: editable timelines are 0/12**, exactly where the grammar arm has always sat
(1/12, 1/11). Seating a mark was never going to buy a convertible region, and the exemplar
ablation above already said what does.

**THE SEATED ROUND BEFORE IT IS VOID, AND IT COST $0.25 TO LEARN THE OLDEST LESSON HERE AGAIN** (archive
`pro-seated-round-VOID-definition-lost-2026-08-13`). The first round with placement actually
live captured 12 of 12, seated 12 of 12, and produced the best mark findings of any round -
11/12 CLEAN - **on twelve templates that were all invalid.** The move serialized the document's
BODY, and an SPX definition lives in a `<script>` outside it, so every generation came back
with no `SPXGCTemplateDefinition` and no DataFields: the field list the operator drives the
graphic by, deleted by the step that moves an image. Nothing else in the round was wrong.

**The control could not have caught it, and that is the finding.** The rig's whole first mode
exists so a paid round never measures the harness - but the only marked control runs the
CATALOG slot with placement OFF, so the seat had no zero-token coverage at all and the paid
round was the first thing ever to execute it. **A control that does not run the code under test
is not a control.** `control-seated-mark` now exercises the platform's seat every free run, on
a hand-authored GENERATION-SHAPED document (full head, real definition, its own logo container
to empty), and throws rather than reports on each property that round lost: the mark placed,
the definition intact, three DataFields surviving, the doctype and stylesheet link kept, the
emptied container gone. A broken harness must stop a run, not score it.

**A third measurement bug of the same shape, caught by the same round.** The code audit read all
11 as `spine: BROKEN` when nothing was broken: its box and root patterns demand the class
attribute hold the prefix ALONE, and the platform's own `has-image` stamp sits beside it - while
the real detector (`model/structure.ts` `detectPrefix`) parses the DOM and whose own comment says
the prefix is "a DOM fact, not a text pattern". Three regexes now (`region.converted`, the box,
the root) have answered a structural question wrongly in the flattering or the alarming
direction. **A pattern over markup is a guess about markup.**

**The control earned its keep again, mid-change.** `control-mark` went CLEAN → `collision` with
its clear space at 0: the mark-fill anchor is a hand-authored CATALOG design that already carries
`applyLogoSlot`'s slot, and the platform had laid its grid over the catalog's. A design whose CSS
already declares `.{prefix}-box.has-image` - the catalog slot's own signature - now keeps its own
placement. Two placement systems on one box is not a stricter contract, it is a broken one.

**AND THE MARKS WERE NOT EVEN PAINTING - 5 of 12, now repaired (free).** Every one the same
construction: the design hid its own `<img>` "until an image is provided" and wrote a second
rule to bring it back - four keyed `has-image` on the ROOT where the shared runtime toggles it
on the img's PARENT, and the fifth keyed the right element but set the CONTAINER's display and
never touched the img. The prompt tells the model to use "the has-image pattern from the
example" and the neutral skeleton in the example slot HAS NO IMAGE FIELD, so where the class
lands was always a guess - dead teaching of exactly the kind the Lite side already names. The
fill now stamps `has-image` on the root and the box and appends a scoped display rule for the
filled id; the empty state is untouched, because the runtime sets `display` inline and inline
wins. Measured over all fifteen saved generations: 5 repaired, 0 regressed, and the mark still
disappears when the field is cleared on all 15.

**RETRY WHEN** - not a retry; Phase 1 continues on this evidence. Owed next: the owner's call on
who owns the mark's surface (above), and nothing else from this round - the catalog side-slot
shipped and the exemplar question is closed for Phase 3's purposes. If the exemplar question is
reopened, the cheap thing left untried is ONE authoring-shape region shown as code without the
three complete designs around it.

### Models designing a broadcast graphic unaided
**2026-08-12 · NoaCG Pro Phase 0 · `moonshotai/kimi-k3` · 20 of 24 captured, $4.58 · OWNER READ
IT AS A PASS, WITH LOGOS AS THE NAMED GAP.** The 2026-07-31 verdict below is superseded for
STRONG OPEN-WEIGHT checkpoints; it stands for the cheap ones it measured.

12 briefs x 2 arms (three hand-vetted complete exemplars retrieved through `shortlistFor` from
the measured Lite chassis / no exemplars at all), one initial call each, the shipped coder
prompt around `neutralSkeleton`, the shared two-round repair loop, `productionSpxValidator`, and
a blind gallery mixing in the control, three catalog designs and two adapt-first compiles.
Owner's verbatim read is in the archived `notes.md`: *"the graphics are fine if we can create
this quality"*, with two named defects and one named gap.

**The transfer question answered, and it went the right way.** §0.3 says an exemplar arm that
passes beside a COLLAPSING no-exemplar arm is transfer rather than taste. The opposite happened:
the no-exemplar arm completed 12 of 12, and on the one pair the owner singled out - `news-public`
- the exemplar and no-exemplar results were judged indistinguishable ("B7 and B8 look the same
but they are fine, just quite simple/boring"). Three complete catalog designs in the prompt bought
essentially nothing over none. That is evidence of the model's own eye, and it also means the
exemplar block is not yet earning its ~34,500 tokens per call.

**Zero repair rounds fired across the whole round** - every result cleared the deterministic gate
on its first emit. Three carry an unreadable ANIMATION region (playable and exportable, read-only
timeline), which the product path also demotes on a fresh build.

**THE ONE DEFECT EVERY MACHINE GATE PASSED IS THE LOGO.** `portrait-logo` on the no-exemplar arm
rendered a broken-image icon with its alt text *"Channel mark"* visible in the finished frame -
the model referenced a mark nothing bundled - and static validation, the runtime bench and the
field-contract check all reported it fine. The owner named the same thing independently as the
work to do next: *"find a good structure and plan for how to implement the logos so they fit the
design And that they animate in a meaningful and smooth way."* The answer already has a precedent
to copy rather than invent: on the Lite side **the design declares the slot and the compiler fills
it - the model never places the mark** - and the declaration is gated against a rendered
measurement (`LiteCatalogEntry.logoSlot`, `scripts/ai-lite-brand-audit.mjs --check`,
`docs/AI_LITE_PLAN.md` §7). A generated design has no catalog slot to declare, so Phase 1 owes
the equivalent contract for authored graphics, plus the motion half nothing measures yet.
Second named defect, local: one strap's panel is not aligned to its own left accent line.

**Honest limits of this round.** The exemplar arm holds 8 of 12 briefs - `sports-live`,
`corporate`, `portrait-logo` and `long-name` were lost to repeated gateway `unavailable` errors -
so §0.3's counts cannot be read at full denominator; the verdict above is the owner's judgement on
what rendered. Only ONE checkpoint ran: `alibaba/qwen3-coder` was chosen as the second and never
executed. And the round cost more than it should have - four separate harness faults, each
recorded in the commits, burned roughly $5 of the ~$16 total on findings rather than results.
**SECOND CHECKPOINT, same day: `alibaba/qwen3-coder` ran the identical protocol and finished it.**
**24 of 24 captured, 24 of 24 contract-clean, $0.263** - against kimi-k3's 21 of 24 at $5.032, so
about **19x cheaper and more complete**. It carries no reasoning tokens, which is the whole
difference: nothing truncated, nothing timed out, and the round needed no resume. One repair round
fired across 24 generations (kimi-k3: zero). Four results carry a read-only timeline (kimi-k3:
three). The two checkpoints are therefore NOT separated by whether they can do the job - both
produce contract-clean broadcast lower thirds - and the visual comparison between them is a human
read that has not been done yet.
**kimi-k3's exemplar arm finished at 9 of 12.** `sports-live.exemplar` and `long-name.exemplar`
never completed across four attempts (gateway `unavailable`), and `corporate.exemplar` truncated at
BOTH the 17,000 and the 25,000 token ceiling - twice, exemplar arm only, so it is a repeatable
property of that brief on that checkpoint rather than a blip. qwen3-coder ran all three without
incident.
**CHECKPOINT DECISION (owner, 2026-08-12): `alibaba/qwen3-coder`.** Better on the owner's read of
the two galleries and ~19x cheaper, so it is the checkpoint later phases build on. **`moonshotai/
kimi-k3` is DROPPED on cost** - $5.03 against $0.26 for a round it could not even finish. It stays
a valid checkpoint; it is not worth 19x for output the owner rated no higher.
**RETRY WHEN** a round needs a second opinion that qwen3-coder cannot give, and the question is
worth roughly twenty times the price of asking it.

**THE ROUND SAVED NO CODE, AND THAT IS THIS ENTRY'S MOST EXPENSIVE MISTAKE.** Forty-five paid
generations were reduced to PNG frames: the ledger kept verdicts, costs and pictures, and none of
the emitted HTML/CSS/JS. The standing instruction two entries below - *"a paid round must pass
`--save-fixtures`"*, written after the 2026-08-08 Pro round lost its twelve interpretations the
same way - was in this file the whole time and was not followed. The immediate cost: the alignment
defect the owner named cannot be diagnosed from its own CSS, and nothing can be re-rendered,
re-measured or turned into a fixture without paying for the round again. `pro-spike.mjs` now writes
`code/<brief>.<arm>/{index.html,template.css,template.js}` per generation. **The rule generalises
past fixtures: the model's OUTPUT is the irreplaceable artifact of a paid round, and a frame is a
derivative of it.**

**RETRY WHEN** - not a retry; this is a GO into Phase 1 on the owner's read. What is still owed:
an ablation settling whether the exemplar block survives at all - it costs ~34,500 tokens per call
and, on the pair the owner examined, changed almost nothing - and the round that actually matters,
below.

### What Phase 0 did NOT test: brand
**RAN 2026-08-13 - the verdict is the brand-round entry at the top of this file.**
**2026-08-12 · the owner's framing, and the real question.** Every brief in the bank is generic:
two text lines, no brand palette, no brand typeface, and no actual mark - `includeLogo` is a
boolean that asks for an empty slot, and the one brief that set it rendered a broken image. The
prompt passes no colours, no logo file and no brand system, so the round measured *"can a strong
open checkpoint design a broadcast lower third"* and never asked *"can it design THIS customer's
lower third."* The owner's verdict on the output was that it looks like something the free template
gallery could carry - which is the correct reading of what was tested, and the reason the result
does not yet justify a paid tier: **a generic graphic is not worth a paid generation when the
catalog already ships 59 of them.**
**THE NEXT ROUND IS BRAND-CONDITIONED**, and it is cheap on the chosen checkpoint (~$0.26 for 24
generations): the same 12 briefs, each carrying a real mark (shape, backing and ink measured by
`assets/assetInfo.ts` `probeMark`, the content-free contract Lite already uses), a brand palette
and a brand typeface. Two things get measured that this round could not: whether the output is
BRAND-FAITHFUL (the mark placed legibly and unaltered, the palette actually driving the design
rather than decorating it), and whether outputs are DIFFERENT FROM EACH OTHER when the brand
changes and the brief does not - the sameness tripwire the adapt-first route already lives under.
**RETRY WHEN** - not a retry, this is the scheduled next experiment. It is also the honest test of
the whole Pro premise: adapt-first already delivers catalog-grade generic graphics for a fraction
of a cent, so Pro earns its cost only on originality conditioned by a customer's own brand.

### Cheap models designing a broadcast graphic unaided
**2026-07-31 → 08-02, five paid rounds · SUPERSEDED by adapt-first.** Cheap open routes composing a
lower third from a blank stylesheet: blind pairwise **0 of 5** and **0 of 6** decisive pairs against
the frozen control, with **9-11 of every 12-16 pairs airable on neither side**. The repeating fault
was proportion and spacing - relationships between panel, text and type size, which no clamp
produces. Four rounds of correctness fixes yielded correct, plain graphics; correctness was never
what was missing. Stated honestly because it changes the reading: two platform bugs (the gateway
rejecting string-encoded structured output; `position: absolute` on `.creative-box` collapsing the
root to 0x0) invalidated everything before 2026-08-02, and with both fixed a FRONTIER arm
(`claude-sonnet-5`, 8 briefs, **$0.7272**, ~40x the staged arm) produced 4 of 8 the owner would use -
unblinded, single-arm, not comparable to the pairwise numbers.
**RETRY WHEN** a route at ~$0.01/generation beats the frozen control on a blind pairwise of **20+
joined items**. Frontier models already clear quality and fail price - that is Extreme, not this.

### `zai/glm-5.2` as a Phase 0 authoring checkpoint
**2026-08-12 · 0 of 2 arms, nothing emitted at all · DISQUALIFIED for this task.** Chosen as one
of the two pinned checkpoints on lineage diversity and a capability probe it passed in 34 s. The
probe was the problem: it used a short brief and a small budget. Given the ROUND's real prompt -
the shipped coder system prompt plus a ~34,500-token exemplar block - glm-5.2 spent **the entire
17,000-token budget on reasoning tokens and returned `finish_reason: length` with no answer**, on
the exemplar arm AND the bare no-exemplar arm, ~265 s each. At an 8,000 budget it did the same
thing sooner. This is not latency and no timeout fixes it: a larger budget buys more thinking. On
the same prompt `moonshotai/kimi-k3` spent 7,179 reasoning tokens and answered, and two
coder-tuned checkpoints (`alibaba/qwen3-coder`, `moonshotai/kimi-k2.7-code`) spent ZERO and
answered in 34 s and 9.5 s.
**RETRY WHEN** its thinking can be bounded independently of the answer budget (a reasoning-effort
control, or a non-thinking sibling). **Standing instruction, and the reason this entry exists:** a
capability probe must ask the SAME SIZE question as the round - same system prompt, same
retrieval volume, same output budget - or it certifies a checkpoint the round cannot use.
`scripts/spike-checkpoint-probe.mjs` was rewritten to do exactly that.

### Reaching an open-weight checkpoint through the generic proxy's `json_schema`
**2026-08-11 · 0 of 2 checkpoints, then 2 of 2 · BLOCKED on the transport, not the models.** The
Phase 0 capability probe refused both pinned checkpoints (`moonshotai/kimi-k3`, `zai/glm-5.2`) with
`malformed_response`. They are not incapable: `POST /api/ai/generate` is the only path a browser
harness has, `surfaceRoutePolicy` never sets `structuredOutputMode`, so every generic gateway call
goes out as `response_format: json_schema` with **`strict: false`** - a hint these endpoints do not
honour. Asked the same question both ways against the gateway directly: under json_schema glm-5.2
returned `{emit_template: {…}}` and kimi-k3 invented a whole SPX-definition-shaped object
(`playserver`, `DataFields`, `dataformat`); under a **forced function tool** both returned exactly
`name,type,summary,html,css,js`. The repo already believed this - `providerAllowlistFor` filters
gateway endpoints on `tools` support and `src/ai/AGENTS.md` says forced-function tool use "is the
capability the structured call actually rides on" - but the transport asks for the other thing.
**RETRY WHEN** never as stated: json_schema is not the capability. The fix is a mode the generic
proxy can express, and it is a shared-contract change (`AiGatewaySurface`, `surfaceRoutePolicy`,
or the vercel adapter's default) that has to be verified against the paths already using it -
Lite and import-analysis pin their own mode and are unaffected. **Standing instruction:** a probe
that reports REFUSED must say which of the two it measured, because "the endpoint cannot serve
structured output" and "we asked for the wrong kind" look identical from the caller.
`NOACG_DEBUG_STRUCTURED=1` prints the rejected paths server-side and is what separated them here.

### `alibaba/qwen3.7-flash` as a Lite route
**2026-08-08 · 0 of 6 · DISQUALIFIED.** Cheapest text route on the gateway (0.03/0.13), 991k context,
and it cannot serve Lite at all: the endpoint downgrades `response_format: json_schema` to
`json_object`, then refuses ("'messages' must contain the word 'json'"). Price and context are not
capability.
**RETRY WHEN** a sub-$0.20/Mtok route serves real JSON Schema end to end, proven by a probe against
the actual Lite schema - never by a listing. It is a property of the endpoint, so re-check on any
endpoint change.

### `openai/gpt-oss-20b` as Lite's second attempt
**2026-08-07 → 08-08 · 2 of 4 on the contract vs the primary's 27 of 30 · RETIRED.** Chosen on price
and catalog approval alone, never measured against the contract it existed to satisfy. Lite runs
`retryLimit: 0`, so a retryable `malformed_response` did not re-roll the primary - it handed
straight here, turning a stochastic miss into a user-visible failure. The second attempt now goes
to the primary again: two rolls of a 27-in-30 model beat one roll each of that and a coin flip.
**RETRY WHEN** a candidate scores ≥90% as a PRIMARY on the 30-brief bank. A fallback is never
promoted on price, and a route nobody has run as a primary is not a fallback.

### Lite's cost ceiling computed from the audited catalog price
**Broke Lite twice, same route (`qwen/qwen3-coder-next`) · KEPT, pinned by a test.**
`liteGatewayPolicy` derives `maxInputPerMillion` from the audited catalog snapshot, so when the real
price moves above the cap every generation dies on `cost_ceiling` **before a model is called** and
the deployment looks healthy. Once on OpenRouter (audited 0.11/M in, cheapest live endpoint 0.12),
again on the move to Vercel AI Gateway (same model 0.50/1.20, not 0.11/0.80).
**RETRY WHEN** never - failing closed is correct and the failure mode is staleness. Gate: the
defaults test in `api/_lib/aiLite.test.ts`; re-audit the price in the same commit as any route or
transport change.

### A NUMERIC enum in Google's structured output
**Through prompt v6 · a 400 on every Lite call · DISQUALIFIED, gated by a schema walk.**
`spec.animation.speed: { type: 'number', enum: [0.75, 1, 1.5] }` is legal JSON Schema and the server
validator accepts it, but Google's `response_schema` accepts `enum` **only on a string** - Gemini
rejected the whole request with a 400 *before generating anything*, so one property took down every
Lite call the moment the managed transport routed that model to Google. Invisible to every gate,
because the failure exists at one provider. v7 replaced it with bounds plus the legal values in the
property description.
**RETRY WHEN** never for Google. `aiLite.test.ts` walks both shipped schemas for a non-string enum;
a new backend earns one only by being proven to express it.

### Deleting a dead property from a closed Lite schema
**2026-08-08, prompt v9 · 29/30 → 26/30 · REVERTED (v10, v11).** `zone` and `animation.presetId`
decide nothing (`bottom-left` on 47 of 47; `presetId` never once legal), so both were deleted. The
spec object is `additionalProperties: false`, so a property the model still EMITS becomes a refusal
rather than a no-op: three `malformed_response` where v7 and v8 had none. Restoring `zone` recovered
two; the residual was unattributable from one roll each, so `presetId` came back too. Both sit on
the wire with *"omit this field"* in their description, ignored by the compile. Moving a decision to
the platform and removing the field from the wire are two changes with two risks.
**RETRY WHEN** the emission rate reads zero across **more than one round**. Teach it away in the
description first (that took `presetId` from 9/29 to 0/29), then delete. Pinned by PRESENCE.

### Adding prompt lines to raise the Lite skin's `briefFit`
**Four paid rounds, one variable each · 47% → 33% → 27% pass, v5 taking legibility with it ·
ABANDONED.** Every added line was defensible alone and drawn from the judge's own words; the block
went from ~6 simultaneous requirements to 11 and every axis degraded, including untargeted ones. Two
rules survive: **prefer replacing to adding** (v3, the one clear win, deleted as much as it wrote -
a prompt at this length is a fixed budget, not an append-only log) and **watch the axis you are not
targeting**. `AI_LITE_BENCHMARK.md` §6c records the caveat: `briefFit` was partly unwinnable (it
scored brief nouns including scene elements a strap cannot hold), so 2.60 measures the axis as much
as the model.
**RETRY WHEN** a round completes on the rewritten axis - and then try worked EXAMPLES (a high-scoring
skin shown, not described), not more sentences.

### A prohibition as a way to enforce strap geometry
**Prompt v2 · skin emission rate halved · REPLACED by inspection language (v3).** Shipped as "STRAP
SHAPE IS NON-NEGOTIABLE" and "a wrapped name is a failed skin": given a documented way to fail and a
documented way out (`omit skin`), the model took the way out. The same geometry restated as the shape
being painted, with omission named as the likelier mistake, restored the rate. The judge side is the
mirror image - an axis phrased as a taxonomy of wrong shapes scored **5** on a frame with no strap,
because nothing on the list matched.
**RETRY WHEN** never. The rule is live in `src/ai/AGENTS.md`: state what to look at and what earns a
pass, never a list of named failures. When a teaching change moves a rate, suspect the FRAMING first.

### The Lite skin vision judge as a production gate
**Rounds d-j · judge-vs-human agreement 3 of 6 · EXPERIMENT, flagged OFF; only the eval rig calls it.**
3 of 6 is chance. `strapShape` scored 5 on a graphic with no strap; `legibility` scored 5 on a frame
with a word sliced off by a `clip-path`. Four axes have been rewritten since and **no paid round has
scored the rewrite**. The asymmetry decides it: a false revert costs a skin, a false accept **airs** -
and the durable fix for the one defect it demonstrably missed was a deterministic detector plus a
construct ban, not a stricter prompt.
**RETRY WHEN** a completed round yields **20+ joined items** and the judge catches something no
deterministic gate can. Until then the spend goes into gates.

### Correcting Lite's capacity metadata to stop wrapped identity lines
**2026-08-07, prompt v4 · mean capacity of the CHOSEN chassis 48.6 → 49.3 chars · true and inert.**
`textCapacity: 'medium' | 'high'` was hand-authored and ranked the designs almost backwards (both
"medium" entries measure widest; the loudest "high" holds the fewest of all six), so it became the
measured `supportingLineChars`. Telling the model the truth changed the metadata and not the
behaviour: +0.7 chars is inside round A's own variance, and the failing brief still picked the
39-character chassis in two runs of three. The actual cause was `applyDesignAdjustments` **rewriting
the very property the number measures** - `scaleRatio: 1.2` cuts lt25 from 47 characters to 19.
**RETRY WHEN** never as stated. Transferable: before teaching a model a fact, check whether the
pipeline downstream overwrites it. The measurement survives as `scripts/lite-line-capacity.mjs --check`.

### Shrink-to-fit for Lite's supporting line
**2026-08-07 · BLOCKED by two measurements, not by taste.** `textFit` shrinks by font-size, and lt25
and lt32 set their supporting line at exactly the 20px category type floor - **zero headroom on
precisely the two designs that need it** (the other four have 9-26%, worth a handful of characters).
And every design wraps at the same **806px**, the SHARED auto-fit cap `min(42% of frame, safe area)`
rather than a per-design limit - and 42% already sits above the catalog's own 20.8-30.5% width band.
What is left is the designs' honest capacity.
**RETRY WHEN** the catalog's tracked-uppercase supporting lines are redrawn (catalog work - tracked
uppercase costs about a third of the characters a reader expects), or the supporting-line type floor
is deliberately lowered. Meanwhile the residue is measured, not silently reflowed: `bench-line-wrap`.

### Pro's interpret → compile reconstruction
**2026-07-31 → 08-08 · visibly broken on 5 of 12 while the gates reported 11 of 12 passing ·
RETIRED as product direction 2026-08-10 (`docs/NOACG_PRO_PLAN.md` §13 - the plan replaced this
direction with the open specialist).** The image model designs well - 11 of 12 credible concepts.
The rectangle-rebuilding compiler cannot keep what they design. Lite delivered a usable graphic on
12 of 12 of the same briefs, at 1/250th the cost.
**Re-diagnosed 2026-08-09** (`benchmarks/pro/round-2026-08-08/DIAGNOSIS.md`, free):
**the approach was never fairly tested.** The compiler renders every design at **0.72x** the size it
was drawn (the 1376x768 concept's pixels used as design pixels in a 1920x1080 frame), places live
text at **0.59x** the baked text it replaces (`boxH * 0.72` compounding with the same error), paints
rebuilt panels in colours the pixels do not contain (mean rgb distance 131 over 17 regions, within
20 on zero), and discards the designed position for a nine-way zone bucket. A fifth brief broke in
the concept PROMPT, which renders its two values inside its own bullet scaffolding. Only
`sports-live` is the named rectangle limit - and there the model SAW the angled panels and warned
about them, because `ProPanelGeometry` has no polygon to put them in. So "a better image model makes
this worse" is unsupported: those defects hit the six usable briefs equally and merely failed to
break them.
**And the gate was not blind.** `ProCompileReport.warnings` separates broken from usable on 11 of 12;
`pro-bench.mjs` records them and computes `pass` without reading them. `artDropped` fired on 3 of 12
and all three are usable.
**RETRY WHEN** the four measured defects are fixed and a re-run measures the approach as designed -
`node scripts/pro-geometry-audit.mjs` is the free gate for the first four. Independently: a polygon
in the panel contract, **or** an image-edit clean-plate capability. Neither is needed for the half
that measured well: feed the CONCEPT back as a `layout` reference into the grounded adapt path.
**Standing instruction from this one:** a paid round must pass `--save-fixtures`. The 2026-08-08
interpretations were not kept, so the twelve model outputs behind the twelve frames are gone and the
per-brief attribution had to be reconstructed from pictures and code.

### Creative Mode as a parallel creation architecture
**2026-07 → 08-02, four ablation arms · RETIRED 2026-08-09, superseded by Pro (owner decision).**
The staged CREATE pipeline (concepts → creative spec → scaffold compile → style → critique) was
built to make cheap open models compose off-catalog graphics. Adapt-first won the strategy question
before it landed, and Pro now owns "the model proposes the appearance, the platform owns the
engineering". It is not a second architecture to carry: **stop reading `docs/CREATIVE_MODE_PLAN.md`
as live strategy, and mine it.** What survives, and where it should go, is that plan's RETIRED
banner. `scripts/creative-route-bench.mjs` and `e2e/creative-routing.spec.ts` are NOT part of this -
they cover the LIVE Phase-A routing stage and stay.
**RETRY WHEN** never as a parallel path. The individual mechanisms retry on their own merits inside
Pro: the inspection-question critic, the scaffold/style split, the knowledge cards, and the
one-vision-call-to-text reference bridge.

### The Pro Harness animation region, and the two platform faults under it
**2026-09-06 · `vercel:google/gemini-2.5-flash` through `scripts/pro-harness-spike.mjs` · $0.42 of a
€3 authorization · NOT a model failure: both walls were ours.** The first paid round of
`docs/PRO_HARNESS_PLAN.md` §10 refused its first cells on the ANIMATION region and never on design.
The model wrote clean timelines - valid selectors, sane timing, the right shape - and the platform
threw them away twice, for two different reasons.

- **The finding restated the grammar instead of naming the breach.** `animation-unconvertible` said
  "stay inside the authoring grammar", which is the grammar the model believed it had written. On
  `lt-markets` the entire defect was two absent declarations: pasting `var easeIn` and `var easeOut`
  back into the model's own bytes makes the identical code parse. It spent four rounds and $0.072
  guessing, then stopped, reporting that the requirements contradicted each other. `animationBreach`
  (`src/ai/pro/harness/patch.ts`) now walks the importer's seven preconditions in the importer's own
  order and returns the first unmet one, quoting the form required - which is what §6 already
  required of every blocking finding, and what THIS FILE's own standing instruction asked for.
- **Behind it, the importer read single-quoted selectors only, and invented one when it could not
  read a target.** `tl.to(".lower-third-box", …)` is ordinary JavaScript and the authoring grammar
  names no quote style; the catalog simply happens to be written the other way, so nothing had ever
  exercised the branch. The fallback was the literal string `'?'`, which reads as a selector all the
  way through the importer, survives `parseAnimData`, and throws `'?' is not a valid selector`
  inside GSAP the first time the graphic plays - a converter failing OPEN in the one place whose
  contract is to keep the author's code byte-identical when it gains nothing. It reaches every
  caller of that door, `bridgeApi.normalize` and so the agent CLI included, not just this bench.

**The first fix for the second fault was wrong, and the catalog gate is what said so.** Refusing any
tween with an empty target list took four shipped corner bugs down with it: `tl.fromTo([], …)` is
what the emitters write for a design with no lines to stagger, and it has always converted correctly.
The rule turns on whether the target list could be READ, not whether it was empty. All 504 designs
emit byte-identical code, and the graphics this round refused convert with valid selectors and play.

**What it says about the harness.** The architecture held: `lt-caster` delivered through the
untouched loop - clean gate, one critique, one advisory repair - at **$0.0298**, a quarter of the
iterate loop's $0.118 per graphic. After both fixes the two cells that had consumed $0.18 producing
nothing delivered at $0.039 and $0.041, in two rounds and one. The failure was never composition,
spacing or typography, which is the dimension the round was meant to test and did not get to.

**A caveat the numbers carry.** The §23.1 baseline (19 of 21 clean, 21 of 21 airable, $0.118) was
measured on `gemini-3.7-flash`; this round runs `gemini-2.5-flash`, the route hosted Pro actually
spends on. That is the right model for the product question and the wrong one for a clean
harness-versus-iterate comparison - the round changes two variables at once, and no rate from it
should be read as the harness alone.

**A THIRD fault, and this one would have corrupted the owner's read rather than a rate.** The
bench settled for a flat 1800ms before measuring and photographing. `lt-latenight` wrote a 2.9s
entrance whose title line only arrives at 2.2s, so every instrument measured - and the frame kept -
a graphic one line short, with dead space in the panel where the missing line belongs. The cell
still DELIVERED CLEAN, because the template is fine; it is the instrument that was early. A blind
reader handed that frame marks the cell down for a defect that is not in the graphic, which is the
deliver-signal leak §23.1 drove to zero, arriving from the opposite direction. The settle now comes
from the graphic's own entrance duration in its data block, bounded to [1800ms, 6000ms].
**Consequence for the frames already on disk: they were shot under the flat wait and must be
re-captured before any blind read.**

**A FIFTH fault, found on the resumed bank: the STEP-CONTRACT CHECK is mis-calibrated for a
machine-driven type.** Every quiz-board cell refuses on `runtime:step-contract` - "step 2 of 3
changed nothing on screen after next()" - in every round, and the model cannot clear it, because
quiz-board carries a machine and the workbench therefore refuses it the ANIMATION region ("the
region is platform-owned here"). Unwinnable by construction, the class this file already names.

**The measurement settles where the fault is, and it is NOT the scaffold.** The graphic's middle
step, named "Reveal", carries zero layers, zero reveals and zero hides - and so does the middle step
of **all 12 shipped catalog quiz boards**, measured through their own emitted data. A quiz board's
reveal is a MACHINE transition, not step keyframes; the empty middle step is how the whole family is
built. So the check that fails these cells would fail every quiz board the catalog ships, which is
the signature `src/ai/pro/AGENTS.md` names: *an instrument whose false positives are the good
designs is one authors learn to ignore.* The instrument advances the default path with `next()` and
diffs the markup, and that is the wrong question for a type whose visible change comes from an
operator EVENT.

The model diagnosed it correctly before stopping ("step 2 not changing (likely a state machine
issue)"), which is the third time in this round that the cheap model was right about a platform
fault the gate reported as its failure.

**A first attempt at this entry blamed the neutral scaffold**, before the catalog was measured. It
did not; the catalog agrees with it exactly. Check the instrument against the shipped corpus before
concluding a scaffold is wrong - the rule at the end of `src/ai/AGENTS.md` says this and it was
still worth re-learning here.

**A SIXTH fault: the unpainted-field check does not honour `noacg-data-source`.** A countdown
refused on `runtime:bench-field-unpainted` - "Field Timer (minutes) (f1) ... reaches no pixels in
ANY of the graphic's states". The model had written it EXACTLY as the root `AGENTS.md` prescribes:
`<span id="f1" class="noacg-data-source">`, with the rule in the stylesheet and no inline
`display:none`. That contract names this very case - *"An input-only value (e.g. a countdown
duration) may live in a hidden holder"* - because the value is INPUT to the clock engine and the
clock is what paints. All 6 shipped designs in the `game-timer` family do the same thing.

`unreachableFields` (`src/validation/fieldPaint.ts`) exists for a real defect - the 2026-08-01 pass
shipped 88 fields structurally impossible to draw - but it cannot tell a hidden holder NOTHING
reads from a hidden holder the runtime reads as input, and the `noacg-data-source` class is exactly
the declaration of which one this is. The check does not look at it. So a graphic built to the
contract is refused for obeying it, and `fieldPaints` is an AI-lane option, so the catalog never
exposes the false positive.

**RETRY WHEN** the bank finishes on the fixed harness - the run is resumable
(`--resume --out=pro-harness-out-gemini-v3`) and 2 of 21 are recorded. The standing instruction this
round adds: **when a harness round refuses work that looks correct, reproduce the refusal in the
browser before concluding anything about the model** - both faults here were invisible to the
ledger, which recorded finding ids without their messages, and `runtime:play-threw`'s message IS the
exception.

### Teaching the free-form coder its structure spine by example
**Through 2026-07-17 · every result converted the moment a `-box` class was injected · FIXED by
naming the contract.** The coder followed the authoring grammar perfectly and `parseTimeline` read
every region, but `importAnimData` bails on `detectPrefix` first, and `detectPrefix` keys entirely
off `class="{prefix}-box"` - which the prompt never named. The example merely SHOWED it, and models
generalize the idea, not the literal class. Worse, the bench's repair message told the model to
"give the root a single class and prefix every child class", which does not satisfy the check - so
the custom route's repair rounds were **unwinnable by construction**.
**RETRY WHEN** never. Standing instruction: if an editability finding looks model-shaped, suspect the
teaching message before the model, and state a machine-checked precondition as a requirement rather
than showing it in an example.
