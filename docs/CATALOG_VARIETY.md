# Catalog variety — where the sameness comes from, what the orphans are, and what expansion costs

Investigation, 2026-08-09, against `main` at `a02d36b0` (459 designs, 65 graphic types, 21 packs).
**Nothing here was built at the time of writing.** It is the measurement, the triage, and a
proposal with a price on it.

**Re-measured 2026-08-18 (493 designs, 66 types, 21 packs).** Three things changed and each is
recorded where it belongs, not by rewriting the original numbers: the instrument was reading the
two full-frame categories blind and now is not ("How it was measured"); eleven designs have since
been built against §3's absence list, closing seven of the twelve lines in Browse and none of them
in any kit (§3, §4.5); and the orphan count is now 151 of 493 (§2). Undated figures in this
document are the 2026-08-09 ones.

It supersedes the measurement half of `LOOKS_AND_PALETTES.md`, which counted the three DECLARED
axes — style family, palette, typeface — and concluded the catalog ships "sixteen combinations".
That was true and too kind. Those are the axes a design RECORD carries; they are not the axes an
eye reads. This one reads the emitted code: what each stylesheet paints, what each markup builds,
what each `NOACG_ANIM` block moves.

**The owner's framing, which this document is held to:** it must not be possible to look at a
broadcast graphic and think "that is a NoaCG template". The catalog should read as if it came
from different broadcasters, shows, brands, sports productions, events, streams and designers.
This is not a palette problem, it is not solved by palette variations of one layout, and it is
not solved by generating hundreds of low-value near-duplicates. Today's number of Looks is not a
target.

## How it was measured

Two instruments, both free (no model calls), both reading the same registry the Create path runs:

- **`node scripts/catalog-sameness.mjs`** — builds every variant at `create({})` and reports the
  declared axes, a fourteen-decision LOOK VECTOR read off the emitted CSS and HTML, the motion
  vocabulary read off `NOACG_ANIM`, the orphan buckets, and a distinctness distance. `--json`
  writes the raw vectors.
- **`node scripts/palette-freedom.mjs`** — renders every variant TWICE at 1920x1080, once at its
  own defaults and once under a hostile palette, and reads back every painted colour and every
  text run's contrast. This is §5, the verification asked for by name.

Both need the dev server up, like `scripts/factory.mjs` and `scripts/l3-sweep.mjs`. Rendered
composition figures are quoted from `ADAPT_FIRST_PLAN.md` §1 (`scripts/catalog-geometry.mjs`,
430 variants) rather than re-measured — that sweep answers the placement question already.

**Instrument correction, 2026-08-18 — the two full-frame categories were measured BLIND.**
`catalog-sameness.mjs` reads a design's class prefix off the first element in `<body>`, and the
pattern it used only matched a root written with a SINGLE class. Both full-frame categories write
theirs with two (`<div class="credits credits--editorial">`), so the scan skipped the root and
landed on the next single-class element instead — the category's own full-frame background. Every
end-credits and every starting-soon design therefore reported the same two values: `panel:
solid-literal` (the background's opaque `#070a0f`) and `painted: ['-root']` (the background was the
only part the scan could see). **32 designs, one look, no signal.** With the pattern fixed, the
13 end-credits designs read back 12 distinct look signatures instead of 1 and the 19 starting-soon
designs read back 18; no other category's numbers move by a single design. Two consequences for
what follows:

- **§5.2's `solid literal` row is almost entirely that artefact.** Catalog-wide the `solid-literal`
  panel count falls from 33 to **1** once the prefix is read correctly. The row said 30 designs at
  the time of writing, when 29 designs were blind — so the joint panel-treatment table needs a
  `palette-freedom.mjs` re-run before its `solid literal` line can be quoted again. Every other row
  in that table is unaffected in kind, but the designs that were miscounted into `solid literal`
  belong in `none`, `panel-token` and `gradient` instead.
- **Every distance quoted for those 32 designs was a LOWER bound**, because collapsing their look
  vectors made them look more alike than they are. The gate in §4.3 could therefore have refused a
  genuinely distinct full-frame design; it could not have admitted a duplicate one.

**What the distance measure is, and what it is not.** Two designs are compared on fourteen visible
decisions, the set of parts each one paints, whether they move identically, and whether they sit in
the same zone. `0` means every one of those decisions matched. It cannot see hue, exact spacing, or
letterforms, so **a small distance is evidence of sameness and a large one is not proof of
difference.** Every claim below leans on it in the first direction only.

---

## 1. Where the repetition actually comes from

### 1.1 The declared axes are welded, and they were the least of it

35 distinct (family, palette, typeface) triples ship. **Four of them cover 344 of 459 designs
(75%)**; six cover 81%.

|  n  | family / palette / typeface |
|---|---|
| 100 | noacg / noacg / space-grotesk |
| 95 | minimal / ivory / inter |
| 76 | glass / frost / manrope |
| 73 | sport / volt / oswald |

The family explains **74%** of the palette choice and **79%** of the typeface choice (conditional
entropy: palette 3.01 → 0.78 bits, typeface 2.25 → 0.48). Pick a family and you have picked all
three, as `LOOKS_AND_PALETTES.md` said. That much is confirmed.

### 1.2 The finding: the style family is a panel switch, not a design direction

Of the fourteen decisions a viewer can actually see, the style family predicts **three**. The
graphic CATEGORY predicts most of the rest.

| decision | values shipped | most common | explained by FAMILY | by CATEGORY |
|---|---|---|---|---|
| backdrop blur | 2 | no 58.6% | **79.5%** | 4.3% |
| skew | 2 | no 93.2% | **46.4%** | 16.8% |
| panel radius | 6 | token 47.1% | 28.5% | 20.4% |
| clip-path | 2 | no 98.9% | 25.0% | 40.7% |
| panel treatment | 7 | panel-token 57.5% | 16.7% | **49.7%** |
| gradient | 2 | no 77.3% | 8.1% | **54.2%** |
| uppercase | 2 | yes 88.5% | 8.1% | 22.9% |
| drawn parts | 6 | 2 parts 32.5% | 5.2% | **36.3%** |
| layout mode | 3 | flex 76.9% | 5.1% | **36.9%** |
| tracking steps | 5 | 2 50.5% | 4.7% | 30.1% |
| grid columns | 2 | no 96.3% | 3.2% | **46.8%** |
| display size | 8 | ~52px 20.9% | 2.6% | **39.4%** |
| weight steps | 5 | 2 40.3% | 2.5% | 26.1% |
| type size steps | 5 | 3 34.4% | 1.1% | 30.2% |

**Two rows carry the blind-instrument artefact** (2026-08-18, see "How it was measured"): the
`panel treatment` and `drawn parts` axes both read 32 full-frame designs as one constant value,
which is an axis a CATEGORY explains perfectly by construction. Re-measured over 493 designs,
panel treatment is family **19.5%** / category **37.6%** (was 16.7 / 49.7) and drawn parts family
**5.1%** / category **33.0%** (was 5.2 / 36.3). The finding is unchanged in direction and smaller
in size: the category still explains roughly twice what the family does.

Read the last three rows twice. **The style family explains 1–3% of a design's typography.** It
owns a blur, a skew and a radius. Composition, hierarchy, weight, tracking, drawn furniture — the
things that make one broadcaster's package unmistakable — are decided by *what kind of graphic it
is*, identically in every family.

That is precisely the "one designer" signature. A NoaCG lower third and a NoaCG scoreboard differ
because one is a strap and one is a score. A NoaCG lower third and a *rival's* lower third would
differ in ways this catalog has no axis for.

The corollary is the expensive one: **adding a style family buys another panel treatment.** At
~59 designs each (`KIT_MATRIX_GAPS.md` §1) that is a poor exchange, and §4 proposes a different
unit.

### 1.3 The families themselves overlap

Median distance from a design to the nearest design of another family, same category (§5b of the
instrument). The diagonal is each family's distance to ITSELF — its internal variety — and it is
the number every off-diagonal has to beat to count as a separate look:

|  | minimal | sport | glass | noacg | editorial | cinematic |
|---|---|---|---|---|---|---|
| **minimal** | *0.24* | 0.34 | 0.41 | 0.28 | 0.39 | 0.51 |
| **sport** | 0.34 | *0.24* | 0.37 | 0.31 | 0.41 | 0.45 |
| **glass** | 0.38 | 0.36 | *0.21* | 0.27 | 0.48 | 0.55 |
| **noacg** | 0.24 | 0.30 | 0.24 | *0.24* | 0.35 | 0.52 |
| **editorial** | **0.21** | 0.41 | 0.48 | 0.24 | *0.21* | 0.44 |
| **cinematic** | 0.31 | 0.38 | 0.44 | 0.44 | 0.31 | *0.10* |

Read the off-diagonal against the diagonal:

- **Editorial sits INSIDE minimal.** An editorial design's nearest minimal neighbour is 0.21 away;
  two minimal designs are 0.24 apart. It is not a sixth voice, it is minimal with a thinner rule
  and a wider kicker. This contradicts `LOOKS_AND_PALETTES.md` §4's "finishing ONE of them to kit
  grade is the cheapest new look we can ship" — measured, finishing editorial buys no new look.
- **noacg sits at minimal's own internal distance** (0.24) and at glass's (0.24). The house voice
  is separated by its amber and its mono label face, both of which are colour and font — the axes
  a user changes in the Style step in two clicks.
- **glass and sport are the two that hold separation** (0.36–0.41 from minimal). They are the
  catalog's only two structurally distinct looks.
- **cinematic is the most distinct family and the most internally uniform**: 0.31–0.44 from
  everything else, and its own 16 designs are **0.10** apart. Sixteen designs, one idea.

### 1.4 One graphic in four skins

For 65 types, the mean distance between a type's own family designs is **0.35**. Nineteen types
sit under 0.25 — four skins of one graphic — and only nine reach 0.45. **24 of 65 types move
identically in every family.** The tightest: `sign-off` 0.10, `agenda` 0.10, `chat-highlight` 0.15,
`holding-screen` 0.15, `poll` 0.15, `quiz-board` 0.16.

### 1.5 Motion is one bank, borrowed everywhere

64 distinct motion vocabularies across 459 designs, with line-count differences collapsed (a
3-line and a 5-line design that move the same way are one decision, which is what a viewer sees).
**The top five cover 42%; the top ten cover 64.5%; 21 vocabularies are used once.**

The largest cluster is the lower-third preset bank crossing five categories:

```
 63  Enter[#line:yPercent | .-accent:scaleX | .-box:clipPath+opacity] >> Out[…]
     lower-third x28 · info-card x28 · scoreboard x5 · alert x1 · public-info x1
 44  Enter[#line:opacity | .-box:opacity] >> Out[.-box:opacity]
     info-card x11 · lower-third x10 · corner-bug x9 · public-info x6 · frame x6 · alert x2
```

Four ease pairs cover 71% of the catalog (`power3.out → power2.in` 121, `expo.out → power3.in` 82,
`power2.out → power2.in` 71, `sine.out → sine.in` 51). The shared bank is a genuine engineering
win — one choreography source, convertible, exportable — and it is also why a glass card and a
sport strap arrive on screen the same way with a different curve.

### 1.6 Typography: six faces of seventeen, and not one serif

|  | |
|---|---|
| bundled typefaces | 17 |
| emitted anywhere in the catalog | **8** |
| ever chosen as a design's own typeface | **6** (inter 127, manrope 112, space-grotesk 105, oswald 82, archivo 29, bebas-neue 4) |
| emitted only as a label or numeral partner | 2 (jetbrains-mono 71, saira 30) |
| **never emitted at all** | **9** — playfair-display, source-serif-4, ibm-plex-sans, libre-franklin, sora, outfit, anton, big-shoulders, dm-sans |

**Zero designs are set in a serif**, though two serifs are bundled, licensed and paired for
numerals. 88.5% of designs shout somewhere in uppercase. Five designs of 459 use any weight at or
below 300.

### 1.7 The drawn vocabulary is thin, and it is the same thin everywhere

| technique | designs | share |
|---|---|---|
| backdrop blur | 190 | 41% |
| pill or circle | 78 | 17% |
| conic / radial gradient | 58 | 12.6% |
| skew | 31 | 6.8% |
| mask | 29 | 6.3% |
| grid columns | 17 | 3.7% |
| rotate | 16 | 3.5% |
| repeating gradient (texture, stripes, print register) | 7 | 1.5% |
| clip-path (any cut shape) | 5 | 1.1% |
| mix-blend-mode | 1 | 0.2% |
| vertical type (`writing-mode`) | **0** | 0% |
| background image | **0** | 0% |

76.9% of designs lay out with `flex`, 96.3% use no grid columns at all, and 93 designs draw
nothing beyond the generic box / accent / line ladder.

Composition is likewise pinned, and it was already measured: no category uses more than 6 of the 9
anchor zones, five categories use exactly one, and of the 226 designs that sit at any inset at all,
**219 sit at exactly 119 or 120 px** (`ADAPT_FIRST_PLAN.md` §1.2, 430 variants). 75.6% of lower
thirds are bottom-left.

### 1.8 What is NOT the cause

- **Palette count.** 14 palettes ship and the wizard offers all of them to every design. Adding a
  fifteenth changes one of fourteen decisions on the list in §1.2, and it is not one of the ones
  a viewer uses to tell two broadcasters apart.
- **Catalog size.** 459 designs is not too few. The four biggest triples covering 75% is the
  problem, not the 459.
- **The shared assemblers.** They are why a design costs a day instead of a week, and they are not
  what makes designs look alike — a shared assembler emits whatever CSS the design hands it. What
  makes them look alike is that the design records hand it nearly the same CSS.

---

## 2. The 119 kit-unreachable designs, triaged

**Now 151 of 493** (re-measured 2026-08-18): **D 76** (was 59), **A 52** (was 37), B 12 and C 11
both unchanged. Every count in this section is the 2026-08-09 one; the mechanisms and their order
are not affected, and the two config-shaped buckets absorbed all 32 additions — which is the
triage below holding, not being overturned. §3's status block accounts for eleven of the 32.

### 2.1 They are not a pile of near-duplicates

Measured against the same yardstick, in the same categories:

| | median distance to nearest neighbour | identical | near-duplicate | a real variation | a different direction |
|---|---|---|---|---|---|
| designs a kit CAN offer (340) | 0.18 | 20.9% | 49.1% | 27.1% | 2.9% |
| **orphans (119)** | **0.21** | 18.6% | 39.0% | **35.6%** | **6.8%** |

**The orphans are marginally MORE distinct than the designs a kit already offers.** 42% of them
are a real variation or better, against 30% of the reachable set. The catalog's duplication is
uniform; it is not concentrated in the unreachable half. "Fold the orphans in as near-duplicates"
is therefore the wrong default — it would delete the more distinctive half of the two.

### 2.2 Why they are unreachable — four mechanisms, measured

`KIT_MATRIX_GAPS.md` §3 attributed almost all of this to one mechanism (a type resolving to one
design per family, so every sibling is unreachable). Measured, that mechanism is **12 designs**.
The dominant one is different, and it is cheaper to fix:

| n | mechanism | where |
|---|---|---|
| **59** | **D.** a type-less design that no pack lists as an `extra` | lower-third 36, info-card 6, ticker 6, infographic 5, transition 3, game-timer 2, starting-soon 1 |
| 37 | **A.** a Browse-only family (editorial / cinematic) no pack resolves | lower-third 14, info-card 13, frame 3, transition 3, alert 2, ticker 1, public-info 1 |
| 12 | **B.** a sibling design of a type whose family cell another design holds | info-card 8, alert 2, ticker 1, results-board 1 |
| 11 | **C.** a category with no graphic type at all | frame 7, end-credits 3, imported-design 1 |

Buckets are exclusive, in that order. What each means for the work:

- **D (59) is a declaration gap, not a model limit.** Every one of these could be reached tomorrow
  by naming it in a pack's `extras` — config, no new designs. What stops that being a real fix is
  the wart `KIT_MATRIX_GAPS.md` §3 already records: **an extra carries its own look.** 36 of the
  121 extras packs declare today (30%) are already in a different family from their own pack.
  Adding 59 more would make the incoherence worse, not better. This is the bucket §6's decision is
  for.
- **A (37) is the editorial/cinematic decision.** §1.3 measured editorial as sitting inside
  minimal, so filling it for kits buys reach, not variety. Cinematic is genuinely distinct and
  genuinely uniform — 16 designs at 0.10 spread — which makes it the catalog's best evidence that
  a direction CAN read as its own thing, and its worst evidence that one direction needs internal
  variety too.
- **B (12) is the kit-model question** (`KIT_MATRIX_GAPS.md` §5 item 4): does a kit choice name a
  TYPE, or a type plus a design? Twelve designs ride on the answer, not fifty.
- **C (11) has no route but `extras`** — frames, credit rolls, the versus card and the import
  chassis have no type, and `GRAPHIC_TYPES.md` records why (a frame's field count follows its
  camera count).

### 2.3 Expand or fold: the two ends of the list

**Furthest from anything a kit offers — expand these into a family** (each is a real idea with no
siblings): `gt04` Stage Ring 0.55, `lt12` House Breaking 0.54, `gt03` Sunny Pop 0.51, `card68` Now
Playing Scrim 0.51, `card49` Clean Partners 0.49, `al12` Quiet Warning 0.48, `pi10` Source Folio
0.48, `card46` Frost Location 0.47, `al11` Breaking Edition 0.44, `lt48` Glass Tag 0.42, `ig07`
Election Bars 0.41, `lt06` Split Bar 0.41.

Note what that list is: a countdown that is a ring, a breaking-news strap, a now-playing scrim, a
sponsor wall, a location card, a source folio, an election bar chart. **Eight of the twelve are
bucket D — designs belonging to no graphic type**, so nothing in the model can give them a family
of siblings; the other four are bucket A, distinctive precisely because they are editorial or
cinematic. Either way they are missing PRODUCTIONS, not missing skins: a user falls in love with
`gt04` Stage Ring and there is no show built around a stage timer.

**Closest to something a kit already offers — fold in** (identical decision set to a reachable
sibling): `lt53`/`ls19`, `lt29`/`lt02`, `lt10`/`ls16`, `card10`/`card07`, `cr06`/`cr10`,
`tk05`/`tk07`, `ss05`/`ss01`, `rs04`/`rs03` at 0.00, then `lt25`, `lt07`, `lt49`, `ls29`, `card13`,
`tk01`, `tk02`, `tk03`, `tk19` at 0.04. Folding means the kit offers the one that is already
reachable and the orphan stays in Browse — nothing is deleted, because a design that is a poor kit
member can still be the right single graphic for someone.

Twenty-two orphans sit under 0.10 from a reachable sibling. **Ninety-seven do not.**

---

## 3. What is missing entirely

Read off §1.6 and §1.7 — every line here is an absence the measurement found, not a wish list.

**Status, re-measured 2026-08-18 against 493 designs** (the original numbers below are from 459;
`scripts/catalog-sameness.mjs` with the prefix fix above, plus a per-absence sweep of the emitted
CSS). Ten designs have since been built AGAINST this list — `lt59` `lt60` `lt61` (lower thirds),
`card80`–`card83` (info cards), `ss18` `ss19` (starting soon), `cr13` (end credits) — and one more,
the quote strap `ls33`, closed two of the same lines from the unrelated broadcast-journalism
round. Together they move seven of the twelve:

| absence | was | now | what closed it |
|---|---|---|---|
| **1. a serif** | 0 | **5** | `lt59` `ls33` `card80` `ss18` on playfair-display, `cr13` on source-serif-4 — the two bundled serifs are finally in use |
| 2. a light, airy voice | 5 designs at weight ≤ 300 | 7 | only `lt60` was built for this line; still effectively open |
| **3. a quiet, lower-case voice** | 88.5% force capitals somewhere | 88.2% — **unmoved** | the aggregate is the wrong measure here: `lt60` `card81` `cr13` `ss18` are the first four designs whose whole hierarchy is stated as a no-capitals decision in their own file |
| **4. condensed-poster typography** | 4 | **8** | `lt61` `card82` `card83` `ss19` on anton / big-shoulders |
| **5. a light package** | 0 designs, 2 palettes | **6 designs drawn on paper** | `lt59` `ls33` `card80` `card81` `ss18` `cr13` repaint the reading surface itself rather than take a light palette |
| **6. print and texture** | 7 repeating gradients, 1 blend | **14** repeating gradients, 1 blend | the print register on `lt59` `lt61` `card80` `card82` `ss18` `cr13`; still 0 image surfaces |
| 7. a column grid | 17 | 28 | partly: `lt59` `lt60` `card82` `card83` `ss18` `ss19` `cr13` set real tracks, but no fixture table or contents page |
| **8. type as the composition** | 16 over 110 px | **20** | `card82` 168 px, `card83` 240 px, `ss19` 280 px |
| **9. vertical or rotated type** | `writing-mode` 0, rotate 16 | **1**, rotate 17 | `card83`'s spine label |
| 10. asymmetry and off-grid | — | — | not addressed |
| 11. a picture in the composition | 0 | 0 | not addressed |
| 12. motion beyond a masked line and a fade | — | — | not addressed |

**What is NOT closed, and matters more than the ticks.** Every one of those eleven designs is a
**kit-unreachable orphan** — six because `editorial` is a Browse-only family no kit resolves
(mechanism A: `lt59` `ls33` `card80` `card83` `ss18` `cr13`), five because they belong to no
graphic type and no pack lists them as an extra (mechanism D: `lt60` `lt61` `card81` `card82`
`ss19`). So the absences are answered in BROWSE and in no kit: a user who picks a pack still
cannot get a serif, a paper surface or a poster numeral. That is §4.2(a), the widened family
contract, and it has not landed. Total orphans are now **151 of 493**, up from 119 of 459 — these
eleven are eleven of the 32 added, which is what §2.2 predicts for anything built in `editorial`
before the contract widens.

**Typographic voices with no design at all**

1. **Anything set in a serif.** 0 of 459. Two serifs bundled and unused. This removes at a stroke:
   the broadsheet/masthead voice, the culture and arts package, the documentary title card, the
   heritage sports package, the church and ceremony programme, the awards show.
2. **A light, airy voice.** 5 designs use any weight ≤ 300; the catalog's centre of gravity is
   600–800. Nothing in it reads as a fashion, wellness, luxury or arts channel.
3. **A quiet, lower-case voice.** 88.5% shout somewhere. There is no design whose whole hierarchy
   is built without capitals.
4. **Condensed-poster typography.** anton, big-shoulders and bebas-neue are bundled to do this;
   4 designs use any of them.

**Tonal directions with no design at all**

5. **A light package.** Every one of the 459 designs is drawn for light text on dark. §5 measures
   what happens when you ask for the opposite. There is no *design* whose reading surface is
   paper: 12 of 14 palettes are dark-panel, and the two light ones are palettes, not designs.
6. **Print and texture.** 7 designs use a repeating gradient, 1 uses a blend mode, 0 use an image
   as a surface. There is no risograph, no newsprint register, no film grain, no halftone.

**THE LOWER THIRDS, MEASURED OFF THE RENDERED CARD (2026-08-21)**

The owner's read of the storefront - *"all the graphics there look the same"* - was ratified as a
catalog-design ask, and `scripts/card-look-sweep.mjs` is the axis it needed. It measures what an
eye reads at card size, off the PIXELS: backdrop (dark/light/none), the dominant saturated hue,
and the ink's footprint. The CSS-decision vector in `catalog-sameness.mjs` could not see any of
it and scored the same page 11-distinct-of-12.

**The ask splits in two, and only one half is a drawing problem.**

*Buried, not absent - the COLOUR variety is already there.* Across 103 designs the shelf carries
nine accent hues (orange 28, red 11, amber 10, rose 8, azure 5, cyan 5, violet 4, spring 1) plus
31 with no coloured accent at all, and 7 light backdrops against 73 dark and 23 none. **The first
twelve are 10 dark + 10 orange.** So page one shows almost none of what the category has, which
is a DISCOVERY failure and a cheap fix - order the first page across this axis instead of by
registry position.

*Genuinely absent - the SHAPE.* **99 of 103 designs are `strap/thin`: 96%.** Only lt61 "Poster
Slab", ls05 "Studio Pair", ls33 "Quote Strap" and ls39 "Fact Check" break it, and only to
`strap/mid`. There is no full-width band, no tall panel, no side column, no corner block. Colour
can be re-ordered; a silhouette the catalog does not contain has to be drawn.

Re-run: `node scripts/card-look-sweep.mjs lower-third --json out.json` (any category).

**The ordering half is BUILT and the drawing half is scheduled.** `spreadFirstPage`
(`src/templates/search.ts`, 2026-08-21) fills Browse's fold by spreading accent hue with style
family breaking ties, so what the category already has is now what the first page shows. It keys
on the DECLARED palette accent because that predicted the rendered hue 72/72; the declared panel
predicted the rendered backdrop only 60/80, so **backdrop is deliberately not an ordering axis** -
spreading on it would need the measurement shipped as a baseline. The six missing silhouettes are
briefed in `docs/LOWER_THIRD_SHAPES_BRIEF.md`; the whole catalog queue is
`docs/CATALOG_WORK_QUEUE.md`.

**The owner's standing position, ratified the same day and binding on catalog work:** *"No one
wants to use a design that other people also use. It's better to have a unique variety, and if we
don't have a lot of graphics that are unique and very good, then we are doing something wrong."*
Sameness is a defect, not a house style - and no design is pinned to the first slot because of it.

**Compositional grammars with no design at all**

7. **A column grid.** 17 designs of 459 use grid columns. There is no editorial two-column card,
   no fixture table that reads as a printed table, no magazine contents page.
   *2026-08-19: the printed-table half is answered.* `ig39` "Key Figures" is the catalog's first
   two-column STAT LIST - a header band, `label | figure` rows in one grid, a footer rule with
   the source and the date - and it took a repeating runtime of its own to get there, because
   every existing rows runtime nests the figure inside a growing bar and so cannot express a
   second column at all (src/templates/AGENTS.md). The contents page and the two-column card
   are still absent.
   **READ AND ACCEPTED by the owner, 2026-08-21** (`docs/acceptance/owner-pack/index.html` §1):
   *"iG39 key figure catalog list looks good. I don't see a problem why we couldn't use this."*
   The four designs shown beside it were accepted in the same read — ig37 and ig36 good and
   replacing nothing, ig38 liked, ig01 *"stylish so it can be used if this is what the customer
   wants"* but explicitly NOT a substitute for ig39, because it carries a percentage and a text
   where ig39 carries a list. **The read also settled the question the frames could not ask:
   these five look DIFFERENT from each other, and the owner said so unprompted** — which is the
   thing this whole document exists to measure.

   **Two findings came OUT of that read rather than into it.** Both are recorded here because
   they are about the shelf, not about a design:

   - **ig01 "Big Stat" does not belong on the Statistics & data → stat panel shelf.** Owner, on
     seeing the eight cards together: *"the big stat with just the percentage and audience share
     does pop out. It feels like that's not part of this family because that's just one big
     number and not a real list."* The taxonomy already has the right home: `stats` carries a
     `kpi` subtype beside `stat-panel` (`src/model/taxonomy.ts`), and ig01 is a KPI by every
     reading — one figure, one label, no rows. Re-filing it is a one-line `src/templates/meta.ts`
     change plus the catalog baselines it moves. NOT done here; it is a `src/` change and the
     session that found it was pack-only.
   - **The lower-thirds shelf has the opposite problem, and it is the bigger one.** Owner, same
     read: *"We have that problem with the lower thirds right now that when you open it up all
     the graphics there look the same."* The stats shelf passes precisely because its eight cards
     are genuinely different offers. **What that asks for is a session on the DEFAULT graphic each
     category shows** — the first page of twelve is the whole storefront for most people, and a
     category whose first twelve are variations of one design reads as a catalog with one design
     in it. This is a discovery/curation question about which designs surface first, not a request
     for more designs.
8. **Type as the composition.** The catalog's display size tops out around 52 px for 21% of
   designs; 16 designs go over 110 px. There is no oversized-numeral scoreboard, no full-frame
   word, no type-that-bleeds-off-frame opener.
9. **Vertical or rotated type.** `writing-mode` 0, rotate 16. No spine label, no vertical rail,
   no angled banner.
10. **Asymmetry and off-grid.** 76.9% flex, 219 of 430 at the identical 120 px inset. Nothing is
    deliberately off the safe grid, nothing overlaps its own frame edge, nothing hangs.

**Image treatment with no design at all**

11. **A picture as part of the composition.** 87 designs emit an `<img>` and nearly all of it is a
    logo in a slot at `height: 100%`. There is no cut-out player, no duotone portrait, no
    photo-led title card, no image plate with a text overhang. `ADAPT_FIRST_PLAN.md` §1.5 measured
    115 designs carrying a picture; what none of them do is *design around* one.

**Motion signatures with no design at all**

12. **Anything but a masked line and a fade.** Four ease pairs cover 71%. There is no letter-by-
    letter reveal, no physics or inertia, no camera push, no SVG stroke draw, no shape morph, no
    hard cut. `credits-board` is the catalog's only deliberately motionless design.

Two of these absences are correct and should stay: a background image on an OVERLAY is wrong
(the video is the background), and no runtime dependency may enter a generated template. Neither
applies to the full-frame families — holding screens, title cards, reveals, matchups, transitions,
credit rolls — which is where 74 of the 430 measured designs live (`ADAPT_FIRST_PLAN.md` §1.2).

---

## 4. The proposal: design directions, scoped to a kit, with a distinctness gate

### 4.1 What a direction is

A **direction** is a complete look system — the thing a rival broadcaster's package IS. It owns
seven decisions, and it owns them TOGETHER:

1. **composition grammar** — how the block is built (rules, panels, columns, offset blocks, a
   bleed) and where it sits, including whether it obeys the 120 px inset
2. **type system** — the typeface pairing, the size ratio, the case, the tracking, the weight range
3. **spacing rhythm** — one spacing scale the whole direction measures in
4. **shape and edge vocabulary** — the cut, the corner, the keyline, the texture
5. **image treatment** — how a picture enters the composition, not just where the logo parks
6. **motion signature** — its own choreography, ease band and durations
7. **a default palette** — one of seven decisions, not the headline

A style family, as the code models it today, owns items 4 and part of 3. That is the gap §1.2
measured, and it is why "add a family" and "add a direction" are not the same request.

### 4.2 Two changes to the model, then designs

**(a) Widen what a family carries.** `FAMILY_TOKENS` (`src/model/themeTokens.ts`) holds thirteen
shape tokens; §1.2 shows three of them do any distinguishing work. A direction needs the family to
also carry a **type scale** (the display:secondary ratio, the case policy, the tracking band, the
weight range), a **spacing unit**, and a **motion row** — the ease pair, duration band, travel
distance and stagger its designs share. The motion row is the highest-value single addition: the
shared preset bank is prefix-parameterized already, so parameterizing it per family turns one bank
into as many signatures as there are directions, with no new choreography code.

This is not free and must not be smuggled in. Widening the family contract changes what every
existing design emits, so it moves `catalog-baseline.json`, the render baseline and the overflow
baseline. It is a deliberate, reviewable diff — the same posture `LOOKS_AND_PALETTES.md` §4 item 2
takes for per-design palette defaults — and it should land on its own, before any new direction.

**(b) Scope a direction to a KIT, not to the whole matrix.** This is the cost lever. A style family
must fill a cell for every type a pack DECLARES; `validatePacks`' cell gate tests a pack's own
declared family, and `familiesFor` measures the rest rather than assuming. So a direction built to
serve one show needs that show's types, not all 65:

| pack | types it declares | a direction scoped to it costs |
|---|---|---|
| wellness | 8 | 8 designs |
| ice-hockey · basketball · handball · athletics | 11 | 11 designs |
| election · church | 13 | 13 designs |
| newsroom | 16 | 16 designs |
| talk-show · classroom | 17 | 17 designs |
| creator | 20 | 20 designs |
| match-day | 22 | 22 designs |
| esports | 31 | 31 designs |
| **the whole matrix (today's model)** | **65** | **~59 more designs** (editorial covers 6, cinematic 5) |

Median pack: **13 types**. That is the honest unit of a new visual direction — thirteen designs,
not fifty-nine — and it arrives as a coherent show rather than as scattered cells.

**A direction-scoped kit declares TYPES and no `extras`.** The core-six gate already satisfies
roles from types only, for exactly this reason (`KIT_MATRIX_GAPS.md` §6), and it is what keeps the
direction from inheriting another family's shapes through the back door.

### 4.3 The gate that stops near-duplicates

Add a **seventh promotion gate: distinctness.** `scripts/catalog-sameness.mjs` already computes it.

> A new design whose nearest neighbour in the same category sits **below 0.25** does not ship
> unless the author declares why, in the design's own file, the way `TypeDesign.semantics`
> acknowledges a semantics signal today.

Calibration comes from §2.1: 0.25 is the boundary between "near-duplicate" and "a real variation",
70% of the designs a kit offers sit below it, and a direction that cannot clear it is a re-skin. Two
extra rules keep the gate honest:

- **Measure against the WHOLE catalog, not the direction.** A direction's own designs are supposed
  to be siblings; the floor applies to the nearest design of the same category anywhere.
- **The gate can only refuse, never approve.** A small distance proves sameness; a large one does
  not prove quality. Every design still faces the six gates, the five catalog gates, `l3-sweep`,
  and sibling judging against its lower-third counterpart (`DESIGN_LANGUAGE.md` §8).
- **A blind axis makes the gate strict, not lax** (added 2026-08-18). While the two full-frame
  categories were measured blind, `cr13` read 0.250 against `cr02` — clearing the floor by nothing
  at all — and `ss18` read 0.286. Re-measured with the prefix fix they are **0.379** and **0.326**,
  and `ss19` moves from 0.279 to **0.430**; all three are now the furthest design from anything in
  their own category. A collapsed axis can only make two designs look MORE alike, so a blind gate
  refuses good designs and never admits duplicates. That is the safe direction to fail in, and it
  is still a reason to re-measure a category's numbers after touching the instrument: the same
  fix moved end-credits' median nearest-neighbour distance from 0.171 to 0.245.

### 4.4 The cost of one direction, honestly

For a 13-type direction, in the units this repo already measures work in:

| item | cost |
|---|---|
| `FAMILY_TOKENS` row + the new type/spacing/motion rows | config; lands with (a), not per direction |
| a palette, measured not chosen (contrast on the panel it sits on, at the smallest size using it) | config, ~half a day |
| Browse chip + `styleTags` on the faces it uses | config |
| **13 designs** | the real cost |
| per design: parts · fields · machine+motion · capabilities · samples · semantics | the six gates (`GRAPHIC_TYPES.md` §5) |
| per design: distinctness ≥ 0.25 | the new gate |
| per category touched: `type-floor` · `overflow-sweep --baseline` · `test:e2e:catalog` · `field-coverage` · `numerals` · `l3-sweep` | the five catalog gates plus the sweep |
| baselines re-recorded | `catalog-baseline.json`, render baseline, overflow baseline |

The three gates that actually bite on a NEW family design, from the record of the last twenty
promotions: **capabilities** (a type declaring one preset list rewrites the motion of every design
it promotes — six drifted their default entrance and four lost presets outright), **samples** (a
design must keep its own words), and **semantics** (the labels must mean what the type's fields
mean). All three have a `TypeDesign` escape hatch and none of them is caught by a baseline taken
from output.

### 4.5 What to build first, and what not to

1. **(a), the widened family contract.** Nothing else is worth doing first: without it, direction
   two is family five with a different blur.
2. **The distinctness gate.** It is one flag on a script that exists. Land it before the designs it
   is meant to police, or it will be calibrated to excuse them.
3. **Then one direction, end to end, against one pack**, chosen from §3's absences where the gap is
   widest and the show is real. On the measurement, the strongest first candidate is a **printed /
   broadsheet direction on Newsroom** (16 designs): it takes absence 1 (serif), 5 (light package),
   6 (print texture) and 7 (column grid) at once, all four of the unused editorial faces exist and
   are paired for numerals, and Newsroom is the pack that already declares a `paletteId`. It also
   settles editorial's fate — §1.3 says editorial as it stands is minimal, so this is the version
   of that family that would have been worth building.

   **Status 2026-08-18: half of this is built, and it is the wrong half.** Six paper designs now
   exist (`lt59` `ls33` `card80` `card81` `ss18` `cr13`) and between them they take absences 1, 5,
   6 and part of 7 exactly as this line predicted. What does NOT exist is the DIRECTION: they are
   `editorial`-family designs on the Broadsheet and Porcelain palettes, Newsroom is still
   `family: 'minimal'` with `paletteId: 'ivory'`, and no pack lists any of the six. A kit cannot
   offer one, so the printed voice reaches only a user browsing the whole catalog. Order (1) was
   skipped and the designs were built first, which is the failure mode this list was written to
   avoid — the remaining work is the family contract, not more paper designs.
4. **Do NOT finish editorial or cinematic to kit grade as they are.** §1.3 measured editorial
   inside minimal, and cinematic's own designs at 0.10 from each other. Reaching kit grade would
   cost ~59 designs each and deliver, respectively, no new look and one very narrow one. Their
   designs stay in Browse, as `KIT_MATRIX_GAPS.md` §1 already decided.
5. **Do NOT mass-generate.** The distinctness gate makes the failure mode measurable, but the
   cheapest way to fail it is to try to fill a matrix. Thirteen designs that read as one broadcaster
   beat sixty that read as one product.

---

## 5. The verification asked for: can every template take arbitrary colours?

**Instrument:** `node scripts/palette-freedom.mjs`. Every one of the 459 designs is rendered twice
at 1920x1080, settled, and read back element by element — once at its own defaults, once under a
hostile palette with Porcelain's tonal shape (a near-white panel, near-black text — a shipped,
offered option) and a loud accent no family was drawn around, so "the accent moved" is unambiguous.
Contrast composites every ancestor background down to the broadcast backdrop `rgb(16,18,22)`
(`model/cssVars.ts`), and a text run is judged at WCAG AA for its own rendered size and weight.

**459 measured, 0 failed to build.**

| | designs |
|---|---|
| the new accent never reaches the graphic | **0** |
| the ORIGINAL accent survives the swap | **14** |
| text that read at defaults stops reading | **337** |
| clean on all three | **121** |

### 5.1 The accent is genuinely free — with fourteen exceptions

Every design that paints an accent surface at its defaults adopts the new one. Thirty-six designs
paint no accent surface at all (10 transitions, 4 alerts, and singles elsewhere) — a design
decision, not a defect.

Fourteen designs keep a piece of their original accent, and the mechanism is visible in the
property it survives on:

| designs | what survives |
|---|---|
| `tk04` (24 paints) | market up/down colours as literal `rgba()` — **semantic**, correct to keep |
| `ss04` `ss06` `ss09` `ss13` `ss17` `cr06` `cr09` | a `background-image` gradient carrying `rgba(246,166,35,0.05)` — the house amber, hand-typed into a wash |
| `sb05` `sb13` `sb15` | one `background-color` |
| `lt04` `ls14` `al07` | a `color` |

Only the first is intentional. The other thirteen are the same bug in three shapes — a gradient
stop, a background and a text colour written as a literal instead of through
`color-mix(in srgb, var(--accent) …)`. Thirteen designs is a bounded, nameable fix.

### 5.2 Tonal freedom is where the catalog is welded

337 designs lose text that read at their defaults. They split cleanly, and the split matters:

| | designs | cause |
|---|---|---|
| **catastrophic** (worst ratio < 1.6:1 — the text vanishes) | **148** | the design has no reading surface a palette can repaint |
| marginal (1.6–4.5:1) | 189 | of which **173 fail on one thing only**: the secondary text line at **2.99:1** |

**The 173 are one fix, not 173.** 286 of the 1028 newly-failing runs land on exactly 2.99:1 — the
signature of `--text-dim` at 0.70 alpha over a light panel. The shipped Porcelain palette uses 0.65
and Broadsheet 0.62, so **the two light palettes we already offer are themselves under AA for
secondary text.** That is a palette definition to re-measure (`LOOKS_AND_PALETTES.md` already
records the standard: measure against the panel it will actually sit on, at the size the smallest
text using it will actually be), not a catalog of broken designs.

**The 148 are real, and the mechanism is the reading surface:**

| panel treatment | designs | catastrophic | marginal | clean |
|---|---|---|---|---|
| `--panel-bg` token | 264 | 14 | 165 | 85 |
| **none** (no panel at all) | 108 | **83** | 7 | 18 |
| **gradient** (a hand-drawn scrim) | 38 | **32** | 5 | 1 |
| ~~solid literal~~ (see below) | ~~30~~ | 14 | 11 | 5 |
| scrim (transparent-to-dark) | 15 | 2 | 1 | 12 |
| tint-dark | 3 | 3 | 0 | 0 |

**The `solid literal` row is an instrument artefact and must not be quoted** (2026-08-18). 29 of
those 30 designs were the blind full-frame categories described under "How it was measured": the
panel reader was looking at the category's opaque `#070a0f` background instead of the design's own
box. Catalog-wide the count is **1** with the prefix read correctly, and those designs belong under
`none`, `panel-token` and `gradient` instead. Their 14 catastrophic / 11 marginal / 5 clean split
is a real `palette-freedom.mjs` result and still stands as a fact about those 30 designs; what is
wrong is the reason the table gives for it. Re-cutting the joint table needs a `palette-freedom`
re-run, which has not been done.

Three named restrictions, which is the answer to the question:

1. **A panel-less design is welded to a dark backdrop.** 83 of 108. Its legibility IS light text
   over video; give it dark text and there is nothing to read against. This includes the whole
   minimal hairline family, the editorial rule designs and the cinematic supers — 74 of the 148
   catastrophic designs are `minimal`. It is not a bug in those designs; it is a fact about
   panel-less broadcast design, and the product currently offers a light palette to them anyway.
2. **A hand-drawn gradient scrim does not follow the palette.** 32 of 38. The scrim is authored
   as literal dark stops, so it stays dark under a light palette and then dark text sits on it.
   Unlike (1) this IS fixable — the stops can be `color-mix` over `var(--panel-bg)`.
3. **A literal fullscreen plate does not follow the palette.** The `#070a0f` credits background
   (12 designs), `#080b10` on starting-soon, `#0b0d11` on `tk15`, and the white `#ffffff` QR tile
   on 4 cards. The QR tile is a scannability requirement and correct; the rest are welds.

For completeness: **13 designs already fail contrast at their OWN defaults** (quiz 3, lower-third
2, and singles in ticker, scoreboard, starting-soon, corner-bug, infographic, versus, poll,
public-info). That is a separate, smaller finding, and nothing measures it today.

### 5.3 The honest summary of §5

**Colour is free; tone is not.** Any design will take any accent — that half of the `:root`
promise holds, with eleven literal-value bugs against it. But **148 of 459 designs (32%) cannot be
given a light palette at all**, because they were drawn on the assumption that the picture behind
them is dark, and the Style panel offers them Porcelain and Broadsheet regardless. Add the 173
that fail only on the light palettes' own under-AA secondary colour and **the product currently
offers a light palette to 321 designs that cannot honour it.**

Three things follow, and none of them is "fix 321 designs":

- **Re-measure the two light palettes' `textDim`.** One config change clears 173 designs.
- **Route the eleven literal accents and the scrim stops through the tokens.** Bounded and named.
- **Say what a design can take.** A design either has a reading surface a palette can repaint or it
  does not, and that is knowable from the CSS. The Style step should not offer a light palette to a
  panel-less design — or, better, a light package should be a DIRECTION (§3 absence 5) that draws
  its own paper surface, rather than a palette bolted onto designs drawn for the dark.

---

## 6. Decided: a kit gets a coherent default look

Recorded here as a decision, 2026-08-08. The binding statement lives in `PACK_TAXONOMY.md`.

> **A kit gets a coherent default look, and "look" means the whole system: palette AND typography,
> spacing, shape, layout language, image treatment and motion. These are DEFAULTS, never locks —
> the user still customises afterwards, exactly as they do today.**

What it settles, against what ships now:

- **19 of 21 packs declare no `paletteId`**, so a kit arrives in each design's own default — which
  is one of the four triples in §1.1. Every pack gets a look.
- **A look is not a palette.** `TemplatePack.paletteId` repaints; it does not carry type, spacing,
  shape or motion. Whatever carries a kit's look has to reach all seven decisions in §4.1, which is
  the same widening §4.2(a) asks for. One mechanism serves both.
- **30% of declared extras are already off-family** (36 of 121). A kit's look cannot be honoured
  while its members are fixed variant ids from other families; §4.2(b)'s "types, no extras" rule
  is the same decision seen from the kit side.
- **Defaults, never locks** is the load-bearing half. Every value stays a `:root` token the Style
  panel writes, the wizard's per-graphic customisation is unchanged, and the kit tray's "use this
  look for the rest" keeps working on whatever the user has actually chosen.

---

## 7. What this document does not do

- It does not schedule anything. §4.5 is an order, not a plan with dates.
- It does not judge quality. Every distance here is a measure of SAMENESS; a design that is far
  from everything can still be a bad design, which is what the six gates and sibling judging are
  for.
- It does not touch the catalog. No design, pack, palette or token changed in the branch that
  produced it; the two scripts and this document are the whole diff.
