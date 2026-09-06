# Session G - use-case metadata on graphics

**Branch:** `claude/g-use-case-metadata` (not pushed, not queued - the orchestrator integrates it)
**Owner receipt:** `docs/backlog/graphic-use-case-metadata.md`, standing 8 days, now `advanced`
**Owner queue item:** `docs/acceptance/owner-queue/2026-09-06-g-finding-a-graphic-by-what-it-is-for.md`

## What landed

**Facet I - OCCASION**: a design can declare what MOMENT of a show it is for, and searching for
that moment finds it. Nine facets now instead of eight; the full record is
`docs/TEMPLATE_TAXONOMY_PROPOSAL.md` §21.

### The vocabulary, and the rule beside it (this was the decision)

**The axis is the show's own CLOCK.** Five values, in the order they happen: `pre-show`,
`coming-up`, `break`, `technical-problem`, `sign-off`. That framing is what keeps the list closed
- a value that is not a moment has nowhere to sit, so "award show" (a programme format), "lower
third" (a category) and "cinematic" (a style family) are all refused by the shape of the axis
rather than by taste.

**The admission rule** (full text beside `OCCASIONS` in `src/model/taxonomy.ts`, summary at §21.2)
is three tests: it is a moment on the clock; a confused person types it as their whole question,
and the phrases they would type are declared with it; at least three shipped designs honestly have
it and no existing facet value already gathers them. Plus a ceiling of eight.

**The rule is a GATE, not a paragraph.** `validateTaxonomy()` enforces the ceiling, the
three-design floor, a `VARIANT_OCCASIONS` id naming no real variant, a `TYPE_OCCASIONS` id
compiling no variant, and every phrase resolving to its occasion through `ALIASES`. Both failure
modes were mutation-tested to go red before landing.

**Refused, recorded so nobody re-litigates:** `show-open` (the title category's subtypes already
gather every opener), `awards` / `fundraiser` / `memorial` / `graduation` / `wedding` (already
programme FORMATS), `breaking-news` / `sponsor-read` (the §20.3 alias fan-out already handles
them).

### How it is wired

- **Declared** in `src/templates/meta.ts` as `TYPE_OCCASIONS` / `VARIANT_OCCASIONS`, deliberately
  SEPARATE from `DeclaredTemplateMeta` - that resolution is winner-takes-all, so folding occasions
  in would force a design to restate its category, structures and semantics to gain one word.
  Resolution is variant, else type, else NONE. **No category fallback**: half the holding shelf is
  a front door and half a sign-off, which is the confusion the facet ends.
- **Derived** onto `TemplateMeta.occasions` in `templateMeta.ts`; empty for anything undeclared,
  which is most of the catalog and behaves exactly as before.
- **Search** reads it through the ALIAS table, not the loose word index. Each occasion's phrases
  fold into `ALIASES` automatically, so the declaration IS the search behaviour; a match scores
  +35 in `aliasScore`, above the subtype's 25 and stacking on the category's 40.

### Measured, on the real catalog

| query | before | after |
|---|---|---|
| "thanks for watching" | 1 (ss09, found by its own NAME) | 11, ss09 first, **all eleven sign-offs** |
| "goodbye" | **0**, the word reported ignored | 11 sign-offs across two shelves |
| "be right back" | 21 holding screens at one score, BRB card **11th** | 5 break cards lead, front doors below |
| "technical difficulties" | 2, "difficulties" dropped | 3 across two shelves, nothing dropped |

The owner's literal phrase already worked by the accident of ss09 being *called* "Thanks for
Watching". The three rows under it are the same request one step out, where it did not - which is
why the test asserts those and not only his words.

## Population: 36 declared of 502, and what is owed

Declared: `pre-show` 11, `coming-up` 7, `break` 5, `technical-problem` 3, `sign-off` 11.
**Everything else is deliberately blank.** I declared every design I could place honestly and left
the rest, because a wrong moment puts a graphic in front of somebody at the wrong point in their
show. The five I could not place are named in `meta.ts` with the reason each is ambiguous (cr07 a
thank-you wall reads as well mid-telethon as at the end; cr08/cr09/cr12 sponsor acknowledgement
runs whenever the contract says; cr11 a memorial roll is gathered by the `memorial` FORMAT).

**Owed, for whoever picks this up:** the rest of the catalog has moments too - a bug is on air
during a segment, a scoreboard during play - but those are not moments a confused person SEARCHES
for, so growing the table needs the same rule applied, not enthusiasm.

## Decisions I made rather than asked

1. **The vocabulary is a clock** (above). The alternative was purpose words that fan across forms,
   which is what §20.3 already ruled the alias table should do - occasion had to be the axis
   aliases could finally POINT at, not a second copy of them.
2. **Occasions declared in their own tables**, not inside `DeclaredTemplateMeta` (reasoning above
   and in the file).
3. **The occasion does NOT go on the Browse card** (§21.5). Two reasons, and the second is real:
   the card is `src/components/wizard/steps/BrowseStep.tsx`, owned by another row tonight; and the
   only version worth shipping shows it when it DISTINGUISHES and hides it when every card on
   screen says the same word - otherwise it becomes exactly the second style label the owner
   already rejected ("it's not really helping that much"). The rule for it is written at §21.5.
4. **The vocabulary constant lives in `src/model/taxonomy.ts`, not `model/wizard.ts`** (the prompt
   guessed wizard.ts and hedged). taxonomy.ts is where facets A-H already live, search reads its
   labels, and `ALIASES` is composed there - a facet vocabulary anywhere else would invert the
   layering (`meta.ts` imports types FROM taxonomy.ts).

## Verification

- `npm run build`: **green**, stamped `claude/g-use-case-metadata` (checked - a build in the wrong
  worktree stamps a different branch).
- `npm run test:use-case-search`: **9/9**, new. It runs the real engine over the real catalog in a
  blank Chromium page (the search index is built out of CREATED designs, and creating one parses
  the html it just emitted - hence a DOM). Carries `validateTaxonomy()`, so the admission rule is
  gated by a test rather than only by the factory.
- Regression sweep over every alias I touched (`intermission`, `outro`, `roll`, `starting soon`,
  `countdown`, `credits`, `paus`, `taukokuva`, `closing credits`) plus unrelated controls
  (`lower third` 93, `scoreboard` 34): no result set shrank; several improved as a side effect
  ("intermission" now leads with the design called Intermission, "outro" with the sign-offs).
- **E2E not run** - no browser suite budgeted in this cloud container. The wizard's Browse UI is
  unchanged (no component file touched), so the exposure is search RANKING, which the node test
  covers directly and `e2e/wizard-filters.spec.ts` exercises through `browseTemplates` in the same
  way. Worth a `test:e2e:affected` on a machine that has one.

### /check - what each leg did

- **review: delegated.** Scope-checked against phase 1 (this worktree, this branch, these 12
  files) before acting. Three findings, all confirmed by my own measurement and all fixed:
  - **A real bug I had shipped.** Alias expansion CONSUMES its phrase, and facet I mints a key for
    every phrase a person might type - so it silently ate ordinary English words the catalog was
    already using. Measured: `"halftime"` lost ig20, the half-time notes board and the ONLY design
    that answers the word; `"standby"` lost the four live bugs. This is the exact hazard
    `taxonomy.ts` documents ("bare 'logo', 'text' and 'super' are NOT keys") and I walked into it.
    **Fixed structurally, not by deleting the words**: an alias key that exists ONLY because an
    occasion minted it is now NON-CONSUMING - it adds the purpose and leaves the word to match
    whatever carries it. A key that meant something before facet I ("intermission") keeps
    consuming exactly as it did, so nothing that worked yesterday answers differently. The typo
    path had to be fixed too - a one-word occasion key matches ITSELF at distance zero, so it
    swallowed the very token it came from.
  - **A defect the fix then exposed**: a non-consumed word still faces the unreachable-token drop,
    so the step announced "we ignored: goodbye" over a full page of cards that word had just
    produced. `ParsedQuery.spentWords` now keeps a word an occasion spent out of `ignored`.
  - **`TYPE_OCCASIONS` keys unvalidated** (the more dangerous of the two tables - a typo strips
    four sign-offs and the floor still passes on the seven `cr*` beside them). Now gated.
  - Both collisions are now regression tests in the gate, because the gate missed them once.
- **simplify: inline** (the skill returned fan-out instructions, so it did not run as a delegated
  pass). Three fixes: dropped `OCCASION_LABELS` and `occasionById`, exported with no consumer -
  dead knobs, and `Occasion.name` already carries the label the card will want; `validateTaxonomy`
  derived the 502-entry catalog five times and now derives it once; the three id/count walks
  merged into one pass.
- **verify:** `npm run build` green; `npm run test:use-case-search` 9/9. **e2e: not run** (no
  browser budget in this container - see above).
- **taste: not applicable.** Nothing here can move what a graphic looks like: no design file, no
  shared template machinery, no fit or alignment code. The change is discovery metadata, the
  search engine and docs.

## The one gap worth naming

**`npm run test:use-case-search` is in no CI workflow.** It is outside `npm run build` for the
same reason `check:catalog-emit` is - it needs Chromium - but `check:catalog-emit` IS wired into
`ci.yml`, `nightly.yml` and `catalog-gates.yml`, and mine is not. The `validateTaxonomy()` half
does reach CI through `scripts/factory.mjs`; the search-RANKING half - the only thing that would
have caught the alias-consumption bug - runs only when somebody types the command. I left the
workflow files alone because CI config was outside this row's scope and three other rows were
landing tonight. **One line in `ci.yml` beside `check:catalog-emit` closes it.**
