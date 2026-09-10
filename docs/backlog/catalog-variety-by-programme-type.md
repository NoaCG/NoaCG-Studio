---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
asked: "we need to have a strategy on how to create those so they don't end up looking the same ... research what kind of graphics different programs need ... the default color and default animations for different graphics should be different"
note: docs/CATALOG_BY_PROGRAMME.md answers items 1 and 2, the genre survey and the ranked list of absences; item 3, the per-design default palette and entrance, and item 4, the cadence, are open
---
# A catalog strategy: research what each kind of show needs, then build packages that differ by default

**Filed:** 2026-09-03. **Source:** owner walk of the Style step.

**Where it stands, 2026-09-04.** Items 1 and 2 below are answered in
`docs/CATALOG_BY_PROGRAMME.md`: the survey of six genres (§3), the gap table (§5), the ranked
list of named absences that a drawing session takes in order (§6), and the measured look of
every category (§7). Item 4, the cadence, is PROPOSED there (§9) and not registered: no routine,
wave file or script reads §6 yet, and §9 names the three mechanisms that would. Item 3, the
per-design default palette and entrance, is still open; that document's §8 is its input, the
conventional palette and entrance per genre, and it says which two registers (the gala's gold,
the morning show's warm daytime) have no palette at all. This file stays until items 3 and 4
land.

## Why

The owner measures the catalog against competitors who have been at this for years and ship large
downloadable packages, and he does not think we are on that level:

> There is still a small problem. I think that we don't have the width of the template gallery that
> we need. Our competition has years in the business, and they have big catalogs with different
> kinds of packages that you can download. I feel like we're not on that level yet.

> We need more and different graphics, but right now we need to have a strategy on how to create
> those so they don't end up looking the same. Most of the graphics we have look like the house
> graphics; they are banners with an accent line.

`template-variety-and-dedup.md` already carries "add designs that look different, delete the
near-duplicates", and it is still right. **This row is the three things in his 2026-09-03 words
that it does not carry**, and they are what turn drawing more cards into a strategy.

### 1. Research what each kind of show actually needs, before drawing anything

> this could be added to the to-do list to research what kind of graphics different programs need.
> The variety is so big; there are so many different programs. We have to be able to do talk shows,
> game shows, podcasts, sports, film-type stuff.

Today the catalog is organised by graphic type (lower third, stat card, ticker). It is not
organised by the show that needs it, and nobody has written down what a game show needs that a
podcast does not. That survey is the input to every drawing session that follows, and without it
each session invents its own idea of what is missing.

### 2. Difference has to be what colour and animation CANNOT change

> They should be different, as I said, so that you can then modify the colors. Difference is not
> just different colors; those we can change. Animations we can change inside a wizard - that's how
> it's thought.

The wizard already changes colour and animation, so any two designs separated only by those are one
design. What is left is silhouette, layout, type and structure. `card-look-sweep.mjs` is the
instrument that reads this (rendered pixels, not CSS decisions) and the 96% `strap/thin` finding in
`template-variety-and-dedup.md` is what it measured.

### 3. The DEFAULTS have to differ too, or the shelf still looks like one designer

> also the default color and default animations for different graphics should be different so that
> we don't have the same colors on every thumbnail when you look through the graphics. You know
> that's also bad.

This is a distinct defect from sameness of design, and it is cheaper to fix. Two genuinely
different designs that both ship with the house amber and the same wipe-in read as a set on the
Browse page, which is the only page where the catalog is judged. A design's default palette and
default entrance should be chosen for that design, and the spread across defaults should be
measured on the first page the way `spreadFirstPage` already spreads hue and family.

## What it would take

1. **The survey.** One durable doc: for each show genre he named - talk show, game show, podcast,
   sports, film/entertainment - what graphics that genre runs, what each one has to say, and which
   of them the catalog has nothing for. Desk research against what comparable products ship, in the
   method `more-behaviours-than-poll-and-quiz.md` already establishes: derive the conventional
   answer rather than asking him.
2. **A gap table** off that survey, joined to what exists, so a drawing session is handed a named
   absence instead of "make something different".
3. **Per-design defaults.** Default palette and default entrance become a real design decision per
   design, with a first-page spread measurement that fails when the thumbnails converge.
4. **A cadence.** His words: *"We need to keep on adding templates; it could be once a week or each
   night we add something, so we end up with a catalog full of high-quality, different types of
   graphics, and they should be innovative and beautiful."* A recurring drawing slot, fed by the
   gap table, is what makes the catalog grow without a person deciding each time what is missing.

## 2026-09-10 addendum: named genres, and not a requirement for the 25th

Asked at the weekly alignment session whether the catalog needs to look broader for the 25th, or
whether the day rides entirely on someone importing their own graphic. Paraphrased from speech, so
the intent binds and the wording does not - full answer in `docs/OWNER_RULINGS.md` §ALIGN-2026-09-10-2.

> ... it's not a requirement for the day. It's more maybe just a vanity thing. ... For example
> there are many types of graphics or looks that we don't have. We are going quite strong with the
> streamer look and YouTube look but if you look at news, the UFC, the NFL, or night shows, I don't
> think we have all those kinds of looks.

So the survey in item 1 above names **news, UFC, NFL and night shows** as looks the catalog
currently has nothing for, next to the streamer and YouTube looks it leans on - feed these into
`docs/CATALOG_BY_PROGRAMME.md`'s gap table rather than treating them as a separate ask. And the
26th's acceptance does not depend on this item: SVG import and playing out a custom graphic with
working data fields is what the day rides on, not catalog width.

He also raised a new capability while answering the same question, distinct from this item's scope:

> One thing that I want to look into more is having animated backgrounds in the graphics. We don't
> have a way to do it yet but we need to add it to our to-do list so that we can create animated
> backgrounds. Through generating our own graphics templates we could create looping animations for
> our graphics. ... we need to research, get references, and then create our own versions of those.

That is a rendering capability (looping animated backgrounds), not a genre-variety gap, so it does
not belong in this file's survey - noted here only so the ask is not lost; it wants its own backlog
item if nobody files one first.

## Evidence

Owner walk 2026-09-03, verbatim above. He set the review point himself: *"let's see again after
this wave how I feel about it."*

Prior art: `template-variety-and-dedup.md` (variety and dedup, with the 96% `strap/thin`
measurement), `unique-first-catalog.md` (one unique card per design, skins behind it),
`docs/CATALOG_VARIETY.md`, `docs/LOWER_THIRD_SHAPES_BRIEF.md`, `docs/KIT_MATRIX_GAPS.md`.
The instrument is `scripts/card-look-sweep.mjs`; `catalog-sameness.mjs` cannot see this and rated a
page 11-distinct-of-12 that the owner called identical.
