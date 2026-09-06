# Template taxonomy & discovery - proposal

**Status: ADOPTED & IMPLEMENTED** (all six §18 recommended decisions accepted; §17 stages 1-5
shipped on this branch - facet registries in `src/model/taxonomy.ts`, declared meta in
`src/templates/meta.ts`, derivation in `src/templates/templateMeta.ts`, the browse engine in
`src/templates/search.ts`, the wizard's Browse step in
`src/components/wizard/steps/BrowseStep.tsx`, factory assertions live - plus the mobile
filter drawer, the brand-family ranking context and the card detail panel. **All four §18
open questions are ratified** (§18, decided 2026-07-23). Still open from stage 6: the pack
"kit" surface - now settled as an Entry card, not built - the community/nightly publish
contract, and zero-result telemetry.) The sections below are kept as the design record.

**Original status: PROPOSAL - not implemented, not binding.** This document is the reviewable deliverable
for the "Start from template" faceted-discovery redesign. Nothing here renames existing
categories, changes code, or alters the catalog until the proposal is approved. Source of truth
for the domain: `live_format_graphics_needs.xlsx` (repo root, untracked - 60 formats, sheet
"Live Format Graphics"). Companion existing docs: `PACK_TAXONOMY.md`, `GRAPHIC_TYPES.md`,
`DESIGN_LANGUAGE.md`.

---

## 0. Summary

The workbook's 60 formats ask for ~470 distinct graphic phrasings, which normalize into **26
functional graphic categories**. The current wizard browses 11 category tiles with 3 ephemeral
filter chips and no search. The proposal:

- **Eight independent facets**: programme format, graphic category, structure, editable fields,
  capabilities, placement, visual style, motion. Facets combine like a storefront filter;
  programme format ranks rather than excludes.
- **Derive, don't duplicate.** Most facet values are computed from what the codebase already
  declares (types, packs, field schemas, machines, presets, zones). Only four things are newly
  declared per template: primary category, subtype, structure list, and field semantics.
  Hand-written duplication of derivable facts is the failure mode this design refuses.
- **One Browse step replaces Category + Template**: search bar, category tiles with counts,
  progressive "More filters", live result grid, existing preview pane untouched.
- The existing **12 packs stay** as the curated "kit" layer; the 60 formats become the
  programme-format facet, grouped under **12 programme families**.

What separates this document's claims:
- **[FACT]** - confirmed from the workbook or current code.
- **[PROPOSAL]** - a product decision recommended here, open to review.
- **[OPEN]** - a genuine unresolved question, listed in §18.

---

## 1. Confirmed facts (audit results)

### 1.1 The workbook [FACT]

- Sheet 1 "Live Format Graphics": 60 rows, two columns (`Format / genre`,
  `Graphics typically needed`). Sheet 2 "Notes": created 2026-07-08, rankings intentionally
  removed - so **no popularity data exists**; any "popular" sort would be fabricated.
- Splitting column B on `;` yields **469 distinct raw terms** after case/punctuation
  normalization. Highest-frequency raw terms: social handles (11), countdown (11), sponsor bug
  (9), ticker (7), topic cards (7), host/guest lower thirds (7), timer (7), speaker lower
  thirds (6), poll results (5), agenda (5), social hashtag (5).
- Counting by concept rather than raw string (the `GRAPHIC_TYPES.md` §6 method): lower third 52,
  sponsor bug 37, countdown 30, topic card 29, title card 23, agenda 22, social handle 17,
  poll 13, holding screen 9, ticker 8, scoreboard 5.

### 1.2 The current system [FACT]

- **Catalog**: `TemplateCategory` (12 ids, 11 browsable) in `src/model/wizard.ts`; 79 variants
  (48 type-compiled designs + imp01 + ~30 unclaimed hand-written).
  `TemplateVariant` metadata today: `id`, `typeId?`, `category`, `name`, `styleTag`,
  `description`, `maxLines`, `suggestedLines`, `logo`, `animationPresets`, `defaultPalette`,
  `defaultFontId`, `defaultZone`. **No tags, no pack pointer, no search index.**
- **Types**: 12 `GraphicType`s (`src/templates/types/registry.ts`) declaring structure, fields
  (with `role: line|data|hidden|logo`), machine, controls, capabilities, designs. The
  type × family matrix is full (48 cells).
- **Packs**: 12 `TemplatePack`s (`src/templates/packs.ts`) - curated type subsets with a default
  family; **every one of the 60 workbook formats maps to exactly one pack**, validated by
  `scripts/factory.mjs`. Packs have no wizard surface yet.
- **Style**: exactly one style axis, `StyleTag = minimal | sport | glass | noacg`, carried on
  variants, palettes, fonts, packs. Shape tokens per family in `src/model/themeTokens.ts`.
- **Motion**: 31 `AnimPresetId`s + 12 easing presets (`src/model/easings.ts`, tagged
  standard/playful/continuous). No intensity metadata.
- **Fields**: `FieldKind = text | lines | number | color | select | toggle | image`;
  `FieldDescriptor` is the one shared render contract. Field ids are positional `f0..fN`;
  types name fields logically and compile them.
- **Placement**: `Zone9` nine anchor zones, safe-area snapped by construction.
- **Wizard discovery today**: Category tiles (name + description + count), Template card grid
  with `MiniPreview` stills, three ephemeral filter chips (style family, logo, 3+ lines),
  no search, no sort control, filters reset on re-entry.
- **Gap list** (`PACK_TAXONOMY.md`): goal/progress bar, charts/maps, chat/alert overlays,
  frames, QR code, reveal moments, lineups/brackets/leaderboards, lyrics/captions,
  replay wipes/stingers - workbook asks, no type covers.

### 1.3 What the audit changes about the brief

The master brief assumes taxonomy must be built from scratch. It doesn't: **the programme-format
half already exists as machine-validated config** (packs), and the graphic-purpose half is
two-thirds built (types with measured frequencies). The real gaps are (a) a normalized
category list wider than the 12 wizard categories, (b) per-template facet metadata beyond
`styleTag`/`maxLines`/`logo`, (c) search, and (d) the browse UX.

---

## 2. The facet model - one principle

**A facet value is derived from an existing canonical source wherever one exists; it is
declared only where no source exists.** This is the same rule the state-machine model uses
("persist a machine only when the derived one is wrong") and it is what keeps 79 templates'
metadata from rotting.

| Facet | Source | Derived or declared |
|---|---|---|
| A. Programme formats | pack membership of the template's graphic category's types (+ extras by id) | **derived** (overridable) |
| B. Graphic category | new declaration (primary + optional extras + subtype) | **declared** |
| C. Structure | new declaration (small controlled list) | **declared** |
| D. Editable fields | compiled field schema (`SpxField[]` → `FieldDescriptor[]`) | **derived**; semantics declared |
| E. Capabilities | machine + type + preset + field schema | **derived**; a few declared extras |
| F. Placement | `defaultZone` + category coverage class | **derived** |
| G. Visual style | `styleTag` | **derived** (exists) |
| H. Motion | `animationPresets` + a new per-preset intensity table | **derived** |

Everything derived is computed once at registry build (module load), not at render time, and
`scripts/factory.mjs` grows assertions so declared metadata cannot drift from the code it
describes (e.g. a declared `two-person` structure on a template whose schema has one name
field fails the factory).

---

## 3. Facet A - programme families and formats

Answers "what are you making?". **[PROPOSAL]** 12 families, 60 formats. Family names are
user-facing and localizable; ids are stable kebab-case. Format names are normalized from the
workbook (source wording in §15 is preserved verbatim in the mapping; display names are
shortened for tiles).

The pack mapping (`packs.ts` `formats`) already ties every format to types; the facet reuses
that, but derives through the **graphic category**, not the individual `typeId`: *a template is
relevant to a format if the format's pack contains any type whose graphic category matches the
template's, or names the template's id in `extras`.* Category-level derivation is what gives
the ~30 unclaimed hand-written variants (classic lt01-lt13, cr04, ...) the same relevance as
their typed siblings - a per-`typeId` rule would leave them format-less and permanently
outranked. Manual widening stays possible via declared `extraFormats` (e.g. the versus card
for debate night even though vs01 sits in Match Day), and the factory caps it so hand-tagging
never becomes the norm.

Two bookkeeping rules that keep the derivation honest:
- **Format-id ↔ sheet bijection.** `packs.ts` stores the verbatim workbook strings; facet A
  introduces kebab ids. The format registry therefore carries `{ id, family, name,
  sheetName }` with `sheetName` the verbatim string, and the factory asserts a 1:1 mapping
  against the union of `PACKS[].formats` - a second 60-item list with no asserted bijection
  would be exactly the drift §2 forbids.
- **Universal graphics.** A future category that belongs everywhere (frames, QR/CTA) would
  either pollute every curated pack or derive nothing. A category may instead declare
  `relevance: 'all'` in the category registry - ranked below genuine format matches, above
  nothing. Packs stay curated kits; they are the *default* relevance source, not the only one.

| Family id | Display name | Formats (id - display name) |
|---|---|---|
| `sports` | Sports | `sports-broadcast` Sports broadcast · `amateur-sports` Amateur & local sports |
| `gaming` | Esports & gaming | `esports-tournament` Esports tournament · `gaming-stream` Gaming livestream · `tabletop` Tabletop & board games |
| `creator` | Streaming & creator | `just-chatting` Just Chatting · `irl-travel` Travel & IRL · `watch-party` Watch party & reactions · `coding-stream` Tech & coding · `art-stream` Art & design · `craft-stream` Craft & maker · `beauty-stream` Beauty & makeup · `cooking-stream` Cooking & food · `bts-production` Behind the scenes |
| `news` | News & current affairs | `news-live` News livestream · `election-night` Election night · `weather` Weather · `debate` Debate · `press-conference` Press conference |
| `talk` | Talk & podcasts | `talk-show` Talk show & panel · `podcast` Podcast & videocast · `live-qa` Live Q&A / AMA · `remote-interview` Remote interview · `morning-show` Magazine & morning show · `radio-style` Radio-style stream · `book-launch` Book launch & author event |
| `business` | Business & corporate | `webinar` Webinar · `conference` Conference & seminar · `town-hall` Town hall & internal · `product-launch` Product launch & keynote · `virtual-event` Virtual event · `finance-live` Finance & markets |
| `education` | Education & training | `lecture` Lecture & class · `school-tv` Student & school TV · `academic-conference` Academic conference · `workshop` Workshop & training |
| `entertainment` | Music, stage & entertainment | `concert` Concert & live music · `award-show` Award show & gala · `theatre` Theatre & performance · `dj-set` DJ set & club · `quiz-show` Quiz & game show · `reality` Reality & house stream · `red-carpet` Red carpet & premiere · `fashion-show` Fashion show |
| `commerce` | Commerce & fundraising | `live-shopping` Live shopping · `auction` Auction · `real-estate` Real estate · `fundraiser` Fundraiser & telethon |
| `ceremony` | Faith & ceremony | `church-service` Church service · `graduation` Graduation & ceremony · `wedding` Wedding · `memorial` Funeral & memorial |
| `civic` | Public info & professional | `council-meeting` Council & public meeting · `emergency-info` Emergency information · `public-cam` Public & security cam · `medical-info` Medical & health · `legal-info` Legal & public information |
| `wellness` | Health & wellness | `fitness` Fitness & workout · `meditation` Meditation & ambient · `nature-cam` Animal & nature cam |

Counts per family: 2 / 3 / 9 / 5 / 7 / 6 / 4 / 8 / 4 / 4 / 5 / 3 = 60. ✓

Rules:
- A format has exactly one family (browse hierarchy); a **template** may match any number of
  formats (derived).
- Family tiles are the first browse level; a family expands to its formats; search reaches
  formats directly, so the hierarchy never blocks a user who knows the word ("church").
- Selecting a format **ranks, never hides** (§13) - untagged general-purpose templates stay
  discoverable.
- **Packs are not a facet.** A pack stays what it is: a curated starter kit (future "start
  from a pack" surface, still an open product decision per `PACK_TAXONOMY.md`). The facet and
  the packs share the format list, so they cannot drift.

Judgement calls worth flagging: finance sits in `business` not `news` (analyst register, not
newsroom); fitness in `wellness` not `sports` (class graphics, not match graphics); cooking and
beauty in `creator` (they are creator shows that *use* commerce graphics - the graphics stay
findable via facet B, which is the whole point of separating the axes).

---

## 4. Facet B - graphic categories

Answers "what graphic do you need?". **[PROPOSAL]** 26 normalized categories. Every template
declares exactly **one primary category** (predictable browsing), optional extra categories,
and one optional **subtype** from that category's controlled subtype list (no free-form tags).

Naming rule: functional, producer-friendly, no context words (`Lower thirds`, never
`Church lower thirds`) - context is facet A, arrangement facet C, look facet G.

| # | Id | Display name | Subtypes (controlled) | Today's home |
|---|---|---|---|---|
| 1 | `lower-third` | Lower thirds | speaker, two-person, name-tag, locator, live-tag | category `lower-third`, type `lower-third` |
| 2 | `bug` | Bugs & corner logos | sponsor, station, live, social-handle, award | category `corner-bug`, type `sponsor-bug`; type `social-bug` (whose designs live in the `lower-third` grid today - lt14 family) |
| 3 | `title` | Titles & openers | show-open, session-title, segment-title, event-title | type `title-card` (in `info-card`) |
| 4 | `topic` | Topic & chapter cards | topic, chapter, now-playing, coming-up | type `topic-card` (in `info-card`) |
| 5 | `info` | Information cards | explainer, spec, key-term, step, checklist, fact | part of `info-card` |
| 6 | `question` | Questions & chat | viewer-question, qa-card, chat-highlight, queue | - (gap) |
| 7 | `quote` | Quotes & statements | quote, scripture, excerpt, headline, fact-check | - (gap; near `topic`) |
| 8 | `scoreboard` | Scoreboards | match-score, simple-score, round-indicator | category `scoreboard`, type `scoreboard` (note: shipped sb designs carry team+score fields and flag/clock/result groups - no period/round field yet; the round-indicator subtype is taxonomy-ahead-of-catalog) |
| 9 | `results` | Results & standings | results-table, leaderboard, bracket, seat-count, vote-result, final-score | - (gap; poll bars cover vote-result) |
| 10 | `stats` | Statistics & data | stat-panel, kpi, chart, heatmap, trend | - (gap, needs data feeds) |
| 11 | `timer` | Timers & clocks | countdown, count-up, clock, interval, speaking-timer, deal-timer | category `game-timer`, type `countdown` |
| 12 | `ticker` | Tickers & crawls | news-ticker, market-ticker, crawl, rotator | category `ticker`, type `ticker` |
| 13 | `alert` | Alerts & status | breaking, warning, emergency, status, notice | - (gap; ticker/topic partially cover) |
| 14 | `list` | Lists & schedules | agenda, schedule, lineup, setlist, ingredients, program, order | type `agenda` (in `infographic`) |
| 15 | `poll-quiz` | Polls, voting & quizzes | poll-result, vote, quiz-question, answer-board | type `poll` (in `infographic`), category `quiz`, type `quiz-board` |
| 16 | `progress` | Goals & progress | donation-goal, progress-bar, milestone, stock-level | - (gap, top of gap list) |
| 17 | `product` | Products & commerce | product-card, price, lot-bid, property, comparison | - (gap) |
| 18 | `cta` | Calls to action & QR | qr, link, follow, donate, buy | - (gap; QR rides image fields today) |
| 19 | `sponsor` | Sponsor & partner panels | panel, logo-strip, sponsor-read, rotation | - (gap; `bug` covers corners) |
| 20 | `frame` | Frames & layouts | webcam, split-screen, reaction, visualizer, background, screen-share | - (gap) |
| 21 | `holding` | Holding & break screens | starting, ending, brb, break, intermission | category `starting-soon`, type `holding-screen` |
| 22 | `credits` | Credits & thanks | end-credits, thank-you, donor-wall, role-credits | category `end-credits` |
| 23 | `caption` | Captions & lyrics | lyrics, surtitle, translation, caption | - (gap, timed-text runtime) |
| 24 | `reveal` | Reveals & matchups | versus, winner, nominee, before-after, sold | category `versus`; quiz reveal machinery |
| 25 | `map` | Maps & location | map, map-pin, route, weather-map, zone-map | - (gap, needs data/asset work) |
| 26 | `transition` | Stingers & wipes | stinger, replay-wipe | - (gap) |

Design decisions baked in:
- **Contextual variants are NOT categories.** Pastor/teacher/caster/player lower thirds are all
  `lower-third` + facet A tags (+ field semantics). The workbook's ~60 lower-third phrasings
  collapse into one category with 5 subtypes.
- `title` vs `topic` stay separate (the shipped types already distinguish them; a title names
  the *show/session*, a topic names *what is being discussed now*).
- **Coverage is not a category**: "full-screen graphics" from the brief's provisional list is
  facet F. An emergency instruction card is `info` + placement `full-screen`.
- `scoreboard` (live score-keeping, operator controls) vs `results` (settled outcomes) vs
  `stats` (measured data) are three categories because their data behaviour differs, which is
  what a user is choosing between.
- Categories with no catalog content today (11 of 26) **exist in the taxonomy but render no
  browse tile** until content ships (§12) - the taxonomy is built for the catalog the gap list
  already commits to, so the next 20 types need no taxonomy rewrite.

**Migration of the 12 current wizard categories** (per-variant where a category splits):

| Current | New primary category |
|---|---|
| `lower-third` | split per variant: `lower-third` (most), `bug`/social-handle (the lt14-family handle straps) |
| `ticker` | `ticker` |
| `scoreboard` | `scoreboard` |
| `info-card` | split per variant: `title` (card05 family), `topic` (card06 family), `info` (rest) |
| `starting-soon` | `holding` |
| `end-credits` | `credits` |
| `corner-bug` | `bug` |
| `infographic` | split per variant: `stats` (ig01 Big Stat, ig02 Glass Bars), `results` (ig03 Gap Stack), `poll-quiz` (ig04 Poll Ring, ig07 Election Bars, ig11-ig13 polls), `progress` (ig05 Rising Total), `list` (ig06, ig08-ig10 schedules) |
| `game-timer` | `timer` |
| `versus` | `reveal`/versus |
| `quiz` | `poll-quiz`/quiz-question |
| `imported-design` | none (user content, not browsable) |

Where a current category splits, the complete per-variant assignment is finalized in migration
stage 3 (§17); the table above is the working assignment. A variant that somehow reaches the
browser without an assignment falls back to a **single** per-old-category default (`lower-third`
→ `lower-third`, `info-card` → `info`, `infographic` → `stats`) so the fallback is always
well-defined.

The wizard category stays as the **assembler/routing id** (it names which code builds the
template); the graphic category becomes presentation metadata on top. No file moves, no id
renames - see §17. *(2026-08-11: the type was renamed `TemplateCategory` → `AssemblerId` in
`src/model/wizard.ts` to make this split self-documenting; the ids themselves are unchanged.)*

### 4c. Category groups — ADOPTED 2026-08-16

By August 2026 every one of the 27 categories (26 + `notification`) had catalog content, so
the Browse dropdown carried 27 rows — back at the wall the one-dropdown decision was already
fleeing at 22, and this time no control survives it: a first-time user reads past two dozen
functional labels to find "Lower thirds". The fix is a **user-facing GROUP layer**, ten
shelves over the categories, derived from the catalog's real composition (counts of
2026-08-16, 458 designs — every shelf holds 23-82):

| Group id | Display name | Member categories |
|---|---|---|
| `lower-thirds` | Lower thirds | lower-third |
| `bugs` | Bugs & corner logos | bug |
| `cards` | Titles & cards | title, topic, info, quote |
| `tickers` | Tickers & alerts | ticker, alert, caption, notification |
| `scores` | Scores, results & reveals | scoreboard, results, reveal |
| `audience` | Polls, quizzes & questions | poll-quiz, question |
| `data` | Lists & data | list, stats, progress, map |
| `breaks` | Timers, breaks & credits | timer, holding, credits |
| `commerce` | Sponsors & commerce | sponsor, product, cta |
| `frames` | Frames & stingers | frame, transition |

The rules, in the spirit of §2:

- **The categories stay the canonical vocabulary.** Aliases, declared meta, subtypes, the AI's
  retrieval, the factory's assertions, the publish contract (§11) all keep speaking
  `GraphicCategoryId`. A group is BROWSE FURNITURE: the dropdown offers groups, the selected
  group's member categories render as chips (only when it has more than one), and the card
  still prints `category · subtype`.
- **One home each, total by type.** `CATEGORY_GROUP_OF` (`src/model/taxonomy.ts`) is a
  `Record<GraphicCategoryId, CategoryGroupId>` — the `PRESET_MOTION` pattern — so a new
  category without a shelf is a compile error, never a browse fallback; `CATEGORY_GROUPS`
  derives its member lists from it, so the two cannot drift.
- **Groups never touch behaviour.** Playout controls are GENERATED from the machine + fields
  inside the template (`docs/CONTROL_LAYER.md`); nothing at playout reads a category, and
  nothing anywhere reads a group but the Browse surfaces (`browsableGroups`, the `group`
  strict facet in `search.ts`).
- Two memberships lean on evidence already in §14's alias table: *countdown* resolves to
  timer + holding (they share the `breaks` shelf), and *sponsor* fans across bug + sponsor
  (the corner mark stays under `bugs`, the panel under `commerce` — search still reaches both
  from the one word).

---

## 5. Facet C - graphic structure

Answers "how is the information arranged?", independent of purpose. **[PROPOSAL]** 16 values,
declared per template (typically per type, inherited by its designs), multiple allowed:

| Id | Display name | Example |
|---|---|---|
| `single-line` | Single line | one-name strap, track ID |
| `multi-line` | Multi-line text | scripture card, statement |
| `name-role` | Name + role | classic lower third |
| `image-text` | Image + text | product card, guest photo strap |
| `logo-text` | Logo + text | sponsor read, team strap |
| `two-person` | Two people | interview double strap, versus |
| `multi-person` | Several people | lineup, panel board |
| `rows` | Repeating rows | agenda, lineup, results table |
| `table` | Table | standings, comparison |
| `grid` | Grid | product grid, nominee wall |
| `bars` | Bars & meters | poll bars, progress bar |
| `full-panel` | Full-screen panel | holding screen, explainer |
| `strip` | Horizontal strip | ticker, logo strip |
| `corner-chip` | Corner chip | bug, social handle |
| `side-panel` | Vertical panel | side stats, queue |
| `media-frame` | Video / webcam frame | webcam frame, split screen |

Rules: user-facing names only (never `flex-column`); a structure is about *information shape*,
so `rows` is the one that matters for "repeating players" whatever the graphic is; the factory
asserts declared structures against the schema where mechanically possible (`two-person` ⇒ ≥2
name-semantic fields; `rows` ⇒ a repeating/lines field).

---

## 6. Facet D - editable data fields

The user filters by **what they need to control**, not visual lines.

### 6.1 Derived counts [PROPOSAL]

From the compiled default schema (`variant.create()` → `SpxField[]` → `FieldDescriptor[]`),
computed at registry build, never hand-written:

```ts
fieldCounts: {
  visible: number    // operator-facing content fields; hidden config inputs EXCLUDED
  total: number      // everything operator-editable, hidden inputs included
  text: number       // kind text | lines
  number: number
  image: number      // kind image, logo excluded
  logo: number       // 0|1, from LogoSupport !== 'none'
  choice: number     // kind select | toggle | color
  repeating: number  // fields whose value is a delimited list (ticker items, agenda rows)
}
```

**Buckets count `visible`, not `total`** - operators think in the fields they see; a holding
screen's hidden countdown-minutes input must not push it from "2 fields" to "3". `total`
stays in metadata for the detail popover.

Filter buckets (facet UI): **1 · 2 · 3 · 4-5 · 6+ · repeating**. Both "exactly" and "at
least" is over-engineering for the initial release - **[PROPOSAL]** an "at least" mode ships
only if zero-result telemetry ever justifies it.

Bucket matching is **range intersection**, and that must be understood explicitly: `maxLines`
≠ line count, so a variant's reachable visible-field range is `defaults..(maxLines + extras)`.
A lower third with default 2 and maxLines 5 matches buckets 2, 3 AND 4-5 - one template can
sit under several chips, and bucket counts intentionally sum to more than the catalog. The
card disambiguates by showing the real numbers: "2 fields (up to 5)".

### 6.2 Field semantics [PROPOSAL]

New controlled vocabulary `FieldSemantic` (23 ids):

`name` · `role` · `organization` · `headline` · `description` · `topic` · `question` ·
`answer` · `score` · `team` · `price` · `discount` · `percentage` · `location` · `date` ·
`time` · `duration` · `url` · `social-handle` · `qr-content` · `image` · `logo` · `items`
(repeating source)

Where declared: `TypeField` gains optional `semantic?: FieldSemantic` (12 types cover 48 of 79
variants); the ~30 unclaimed hand-written variants declare a positional `fieldSemantics` array
in their meta entry, and the factory asserts its length equals the compiled schema length so a
field insertion fails loudly instead of silently shifting every semantic by one. Used for: search ("football score" hits `score`), the card's field summary
("2 names + 2 roles"), and future AI/brief matching. Not a filter chip in v1 - counts and
kinds filter; semantics search.

---

## 7. Facet E - functional capabilities

**[PROPOSAL]** Controlled `CapabilityId` list; derivation first, declaration for the rest:

| Id | Display | Derived from |
|---|---|---|
| `multi-step` | Step-by-step reveal | derived steps > 1 |
| `operator-states` | Operator-controlled states | machine has authored events beyond the walk |
| `loop` | Automatic loop | preset family (marquee, hold-loop, rotator) |
| `countdown` | Countdown | type `countdown` / timer semantics |
| `count-up` | Count-up timer | preset/type variant |
| `clock` | Clock | parallel `clock` group |
| `score-controls` | Score controls | scoreboard controls (increment/decrement) |
| `progress` | Progress bar | bars-grow/ring-fill runtimes on a goal value |
| `repeating` | Repeating list | repeating field present |
| `ticker` | Ticker / marquee | ticker runtime |
| `poll-states` | Poll & voting states | poll type |
| `quiz-states` | Correct / incorrect / lock | quiz-board branches |
| `winner-reveal` | Winner reveal | reveal branch (future type) |
| `alert-state` | Alert state | declared (future) |
| `image-upload` | Image upload | image field in schema |
| `logo-upload` | Logo upload | `logo !== 'none'` |
| `qr` | QR code | declared (image field today; generated later) |
| `live-data` | Live-updating data | declared (none today - honest zero) |
| `sponsor-rotation` | Sponsor rotation | declared (future) |
| `pause-resume` | Pause / resume control | machine controls |

Wizard exposes **at most 8** as filter checkboxes (multi-step, countdown, clock,
score-controls, progress, repeating, loop, image-upload); the rest stay searchable metadata
until they have catalog mass. Capability filters are **strict** (§13) - "has countdown" means
has countdown.

---

## 8. Facet F - placement & coverage

Derived: `defaultZone` (Zone9) gives the anchor; a **coverage class**
(overlay | strip | panel | full | frame) combines with it so zone + coverage → placement ids.
Coverage is declared **per type/design, not per category** - `reveal` spans full-frame versus
slams and card-sized nominee straps, `title` spans full-screen openers and small segment
labels, so a category-level class would misclassify half its members. The category supplies
only the *default*; a design overrides it the same way it overrides `defaultZone`. (Longer
term the bench already measures each graphic's box - coverage can then be derived from the
measured footprint and the declaration disappears.)

`full-screen` · `lower` · `upper` · `left` · `right` · `center` · `corner` · `side-panel` ·
`background` · `frame`

- A zone-movable overlay (most straps/cards) matches every zone placement, with its default
  ranked first - placement filters on *where it can sit*, defaulting is facet-neutral.
- Safe-area compliance is a platform invariant [FACT: zones are safe-area snapped by
  construction], not a filter.
- **Aspect ratio**: canvas format is a project-level choice in the wizard today [FACT]; all
  catalog templates are 1080p-authored and scale. **[PROPOSAL]** defer per-template
  `aspectRatios` metadata until vertical/square-specific designs exist; the schema reserves the
  field so adding them is additive. Filtering on aspect before any template differs by aspect
  would be a facet of nothing.

---

## 9. Facet G - visual style

Audit verdict [FACT, at proposal time]: the codebase has exactly one style system - then four
families - with palettes, fonts and shape tokens hanging off it. The brief's 22 adjectives
would be a second, unenforced vocabulary drifting beside it.

**[PROPOSAL]**
- The **filter** is the style-family axis itself, whatever its arity, presented with fuller
  labels; ids frozen, display names reviewable.
  **Superseded in fact 2026-07-23**: `editorial` and `cinematic` shipped as real families
  (36 core lower thirds, main), so the axis is now SIX - and the design held without
  amendment, which is the point of filtering on the axis rather than on a fixed list. The
  live labels are `STYLE_FAMILY_LABELS` in `src/model/taxonomy.ts`.
  **Amended 2026-08-26**: "fuller labels" was the wrong instinct and is withdrawn. The pairs
  the fuller labels grew into ("Minimal & clean", "Sport & energetic", "Bold & on-air") read as
  AI copywriting to the owner; the axis is now ONE PLAIN WORD per family, with the chip row
  carrying a "Style:" caption so the shorter words still say what kind of answer they are.
  Reasoning and the owner's words are in §18's reversed ruling.
- The brief's adjectives become **style aliases** for search, mapped many-to-one:
  corporate/editorial/broadcast-news/flat/light → `minimal`; esports/gaming/energetic/bold →
  `sport`; luxury/cinematic/glass/futuristic/tech → `glass`; playful/youthful/retro? → `noacg`.
  (Alias table in §14; `retro` maps nowhere honestly - it's dropped rather than lied about.)
- A further family remains what `PACK_TAXONOMY.md` says it is: ~12 designed variants of real
  work, never a config knob. The taxonomy needs nothing new to absorb one - borne out when
  `editorial` and `cinematic` landed and cost this document one label list, no model change.
- Palette light/dark is **not** a style facet (palettes are swappable per project in the Style
  step - filtering templates by a thing the next step freely changes would mislead).

---

## 10. Facet H - motion

Motion facts live in the preset registry, so the facet derives from `animationPresets`:

- **[PROPOSAL]** New per-preset table (one place, ~35 rows): each `AnimPresetId` gets
  `intensity: 'none' | 'subtle' | 'medium' | 'strong'` and `motionStyles: MotionStyleId[]`
  from `reveal` · `wipe` · `slide` · `pop` · `scale` · `blur` · `roll` · `loop` · `flip`.
- A template's motion facet = union over its offered presets; its **default intensity** = its
  default preset's intensity. Filter chips: intensity and, under More filters, motion style -
  and like category tiles, **only values with catalog mass render** (no preset ships intensity
  `none` today, so that chip simply doesn't appear rather than being a guaranteed-zero trap).
- Easing stays out of discovery (it's a per-project knob with its own doctrine
  [`DESIGN_LANGUAGE.md` §4]); "No animation" maps to intensity `none` (no preset today ships
  that - honest zero until one does).
- Motion intensity is deliberately disjoint from facet G: a minimal graphic can enter with a
  strong snap; the two axes never share ids.

---

## 11. The metadata model

**[PROPOSAL]** Adapted to the real architecture - the brief's flat `TemplateMetadata` is split
into the declared sliver and the derived bulk, because the catalog is *code*, not documents:

```ts
// ---- declared, per template (on GraphicType for typed variants,
// ---- in templates/meta.ts for unclaimed hand-written ones)
interface DeclaredMeta {
  graphicCategory: GraphicCategoryId          // the ONE primary category
  extraCategories?: GraphicCategoryId[]       // rare; browsing shows primary only
  subtype?: string                            // from the category's controlled list
  structures: StructureId[]
  fieldSemantics?: FieldSemantic[]            // positional; on TypeField as `semantic` instead
  extraCapabilities?: CapabilityId[]          // only the non-derivable ones (qr, live-data...)
  extraFormats?: ProgrammeFormatId[]          // widen beyond pack-derived relevance
  keywords?: string[]                         // controlled additions feeding search only
}

// ---- derived at registry build; factory-asserted; never hand-written
interface TemplateMeta extends DeclaredMeta {
  id: string                                  // the variant id (stable)
  name: string; description: string           // from the variant
  programmeFamilies: ProgrammeFamilyId[]      // from formats
  programmeFormats: ProgrammeFormatId[]       // pack membership of typeId + extraFormats
  fieldSchema: FieldDescriptor[]              // compiled default schema
  fieldCounts: FieldCounts                    // §6.1, incl. reachable line range
  capabilities: CapabilityId[]                // derived ∪ extraCapabilities
  placements: PlacementId[]                   // §8
  aspectRatios: AspectRatioId[]               // reserved; ['16x9'] for all today
  styleFamily: StyleTag                       // = styleTag
  motion: { intensity: MotionIntensity; styles: MotionStyleId[] }
  complexity: 'simple' | 'standard' | 'advanced'  // derived, §12.4
}
```

Requirements honoured:
- **Stable ids everywhere**; display labels live in one label map per facet (localization-ready,
  renames never touch stored ids).
- **No status field**: the catalog has no draft/beta lifecycle today - shipping variants are
  ready by definition (the factory gates them). Reserved for the community/nightly-library
  pipeline, where publish payloads will need `metaVersion` + status; **that** boundary gets the
  repo's standard version-and-migrate treatment. The in-repo catalog needs no migration
  machinery because meta is rebuilt from source every build.
- **The scale boundary is specified now, even though implementation is deferred.** Community,
  AI and nightly-generated templates have no `GraphicType` and no pack membership, so nothing
  derives for them unless the publish path enforces it. The contract: (a) every published
  template carries a versioned `TemplateMeta` payload; (b) `graphicCategory`, `subtype`,
  `structures` and semantics must come from the same closed id registries (unknown id =
  publish rejected, exactly like `validateTemplate` errors); (c) the derivable half
  (fieldCounts, capabilities from the parsed machine, placement, motion) is **recomputed
  server/import-side from the template code, never trusted from the payload**; (d) the
  generator prompt assigns the declared half and the nightly gate runs the same assertions the
  factory runs in-repo. This is where "Best for {format}" would otherwise starve and category
  assignment would otherwise go unpoliced at exactly the scale the product is committed to.
- **No free-form tags**: `keywords` is the one escape valve, feeds search only (never a
  filter), and the factory rejects a keyword that duplicates an existing facet value's label or
  alias - the "uncontrolled adjectives" failure mode is machine-blocked.
- **Multiple formats per template, one primary category** - both structural.
- Field counts derive from the real schema (§6.1), with the `maxLines` range nuance handled.

---

## 12. The Start-from-template browser

> **SUPERSEDED IN PRESENTATION, NOT IN MODEL (2026-08-09).** Every facet below still exists and
> still narrows the same way - `src/templates/search.ts` is unchanged. What the shipped step
> DRAWS is `re-design/handoff.md` §2b, which is binding where the two disagree, and it differs
> in three places: the category tiles are ONE dropdown with the same live counts (22 tiles was
> a wall at any per-tile height), the specialist facets sit behind one Filters disclosure at
> every width rather than a desktop `More filters` inside a mobile drawer, and **the results
> are a first page of 12 plus "Show 12 more"** - the sketch below renders every match, which
> at today's catalog is 429 cards and 30,215px of scroll. The living description of the shipped
> surface is `src/components/wizard/AGENTS.md`, section **Browse**; the catalog-side vocabulary
> behind it is `src/templates/AGENTS.md`, "Discovery metadata".

### 12.1 Flow [PROPOSAL]

The Entry step is untouched. "Start from a template" opens one **Browse step** replacing
today's Category → Template pair (the wizard keeps Fields → Style → Animation after a pick;
step hard-coding in `CreationWizard.tsx` is a §17 implementation concern):

```
┌──────────────────────────────────────────────┬────────────┐
│ [🔍 Search all templates…                  ] │            │
│ What are you making? (optional)              │            │
│ [Sports ▾][Gaming ▾][News ▾]…  (families)    │  existing  │
│                                              │  live      │
│ Category tiles: [Lower thirds 18][Timers 6]… │  preview   │
│                                              │  pane      │
│ Fields: [1][2][3][4-5][6+][↻]  Style: [4]    │  (WizardP.)│
│ ▸ More filters (structure·capabilities·      │            │
│    placement·motion)                         │            │
│ ── results ──────────────  n results  [sort] │            │
│ [card][card][card][card]…                    │            │
└──────────────────────────────────────────────┴────────────┘
```

- **Default visible**: search, programme family/format (optional, collapsible), category tiles
  (with live counts, only categories that have content), field-count buckets, style family.
- **More filters**: structure, capabilities, placement, motion intensity. Aspect joins when
  aspect-specific templates exist.
- Category tiles double as the browse entry: no filters at all shows the tile grid first
  (today's mental model preserved); any search/filter input switches to the result grid.
- **Mobile (≤768px)**: filters collapse into a drawer button with an active-count badge; the
  established stacked preview behaviour stays.
- Result count always visible; active filters render as removable chips with "Clear all".
- Selecting a template proceeds to Fields exactly as today (`draft.variantId`); Back returns
  with filters intact (state lives in the draft for the wizard session, not ephemeral
  per-step as today's chips are).

### 12.2 Sorting [PROPOSAL]

`Relevance` (default, §13.3) and `Simplest first` (complexity, then visible-field count). **No
"Popular"** - the workbook stripped rankings and no usage data exists [FACT]; fabricating it
is refused. **No "Newest"** - variants carry no date; if wanted later, an `added:
'YYYY-MM'` field starts accruing from adoption day (backfill would be guesswork).

### 12.3 Template cards [PROPOSAL]

Existing `MiniPreview` still + name, plus a strict info budget:

```
[MiniPreview still]
House Schedule                        ← name
Lists & schedules · agenda            ← primary category · subtype
Business · Education                  ← top 2 families (by rank), never all
2 fields: heading + repeating rows    ← from fieldCounts + semantics
↻ repeating · ⏱ steps                 ← max 3 capability badges
Standard · NOACG                      ← complexity · style family (dim, one plain word)
```

**Amended 2026-08-26**: the style family used to sit on the FIRST line, opposite the name and
in a per-family accent colour. It has moved to the last line and lost the colour - see §18's
"the style family is not a card TITLE". The card's info budget is otherwise unchanged: what
moved is which line the eye lands on second, and the answer is now the category.

(Example is the real ig08; a made-up flagship would be exactly the fabrication this doc bans.)

Nothing else. Full field schema, all formats, presets etc. live in a hover/long-press detail
popover, not the card.

### 12.4 Complexity (derived)

`advanced` = machine has branches or parallel groups (quiz, scoreboard, ticker rotator,
clock-bearing holds) · `standard` = multi-step, timer, or >3 **visible** fields · `simple` =
rest. Logo support deliberately does not raise complexity (a built-in corner bug is the
simplest graphic in the catalog). Factory-computed, shown as a badge, filterable under More
filters.

---

## 13. Filter and ranking logic

### 13.1 Combination rules [PROPOSAL]

- Different facets: **AND**.
- Choices within one facet: **OR** (`church-service OR conference`).
- **Strict facets** (hide non-matches): category, field bucket, structure, capabilities,
  placement, style family, motion.
- **Ranking facet** (reorder, never hide): programme format/family. Results split into two
  labelled sections: "**Best for {format}**" (templates whose derived formats include it) and
  "**Also works**" (everything else passing the strict facets). A family-only selection uses
  the family form ("Best for sports productions") with derived-family matching. General-purpose
  templates are never buried by an untagged-means-invisible rule.
- Field bucket = range intersection over the reachable visible-field range (§6.1).

### 13.2 Zero results

Strict facets are never silently relaxed. The empty state says which chip(s) killed the result
set ("No lower thirds with a countdown - remove one?"), offers one-tap removal of the most
restrictive chip (defined mechanically: the chip whose removal restores the largest result
count), and always offers **Create with AI** carrying the active facet selection as
the brief seed. If the *taxonomy* matches but the *catalog* has no template (a `product` search
today), the empty state says that honestly - "No product cards yet" - not "nothing matches".

### 13.3 Relevance ranking

Deterministic, documented, no learned magic:

1. Search-text score (field-weighted, §14) - only when a query exists.
2. Programme-format match (selected format in derived formats): large boost; family-only
   match: smaller boost.
3. Pack curation order as the within-tier tiebreak (the packs' curated type order is the one
   editorial ranking that exists), then catalog order (stable).
4. Brand match (existing `matchBrand` behaviour - saved brand's family first) folds in as a
   small boost, replacing today's hard resort.

---

## 14. Search

### 14.1 Index

Client-side, built with the registry (78-few-hundred templates - no infra needed). Indexed
text per template, by weight: name (10) · category display name + subtype + aliases (8) ·
field semantics labels (6) · capability labels (5) · programme format/family names + aliases
(4) · structure labels (4) · keywords (3) · description (2). Normalization: lowercase,
diacritics folded, trivial plural fold (s/es). **Multi-word aliases match as phrases first**
("name tag", "starting soon" are looked up whole before tokenizing - a pure token-AND rule
would make "name tag" hit any template with "name" and "tag" anywhere in its index); remaining
tokens then AND across the index, each matching any field, prefix match on the last token for
as-you-type.

### 14.2 Alias table (the synonym mapping, deliverable 10)

Controlled, versioned in code beside the facet ids. Seed set - left side is what users type,
right side is the facet value it expands to:

| Alias | Resolves to |
|---|---|
| name graphic, name tag, nameplate, strap, super, chyron, L3 | category `lower-third` |
| corner logo, watermark, DOG, station id | category `bug` |
| viewer question, chat question, ama | category `question` |
| verse, scripture, bible | category `quote`/scripture |
| score, scorebug, score box | category `scoreboard` |
| standings, league table, leaderboard, bracket | category `results` |
| clock, stopwatch, timer | category `timer` |
| countdown | categories `timer` + `holding` (a "countdown to start" usually means a starting-soon screen) |
| sponsor | categories `bug` + `sponsor` (corner vs panel - the user shouldn't need to know the boundary) |
| award, winner, trophy | categories `reveal` + `results` + `bug`/award |
| crawl, marquee, headline bar | category `ticker` |
| breaking, breaking news | category `alert` + subtype breaking |
| agenda, schedule, running order, lineup, rundown | category `list` |
| vote, voting, poll, survey, quiz | category `poll-quiz` |
| donation bar, goal bar, fundraising meter, sub goal | category `progress` |
| price card, offer, deal, sale | category `product` |
| qr, link card | category `cta` |
| starting soon, brb, be right back, intermission, stream ending | category `holding` |
| outro, roll, credit roll | category `credits` |
| lyrics, surtitles, subtitles | category `caption` |
| versus, vs, head to head, matchup, face-off | category `reveal`/versus |
| stinger, wipe, transition | category `transition` |
| two person, double, dual, interview strap | structure `two-person` |
| church, worship, sermon | format `church-service` |
| football, soccer, basketball, hockey, handball | family `sports` |
| twitch, streamer, obs | family `creator` |
| corporate, business news, editorial, flat | style `minimal` |
| esports, energetic, gaming look | style `sport` |
| luxury, elegant, cinematic, futuristic, tech | style `glass` |
| playful, youthful | style `noacg` |

Growth rule: an alias is added when observed (support, chat logs, zero-result telemetry),
reviewed like config, and must resolve to existing facet values - the table cannot invent
taxonomy. **An alias may resolve to a set** (see countdown, sponsor, award): when a producer's
word legitimately spans categories, search fans out across all of them rather than forcing the
taxonomy's internal boundary onto the user.

### 14.3 Understanding the brief's examples

`name graphic` → alias → lower thirds. `corner logo` → alias → bugs. `viewer question` →
alias → questions. `football score` → alias family sports + semantic `score` → scoreboard
ranked for sports. `church verse` → format church + alias verse → scripture quotes ranked for
church. `two-person interview` → structure two-person + format remote-interview.

---

## 15. Workbook term mapping (deliverable 15 - all 469 raw terms)

Presented category-first: every raw term from the sheet (lower-cased, trailing period
stripped) maps into exactly one primary category below; context goes to facet A, arrangement
to facet C, behaviour to facet E. Parenthesised numbers are raw-term frequencies > 1.

**lower-third** - every "* lower third(s)" phrasing: host/guest (7), speaker (6+3), host (5+2),
player (2), anchor and guest, caster, executive, teacher, instructor, artist, analyst, expert,
creator, author, moderator, demo, crew, contestant, presenter, red-carpet, regional,
candidate/party, speaker/pastor, speaker/reader, host/auctioneer, guest/host, avatar/speaker,
agent, facilitator, cast/role, "lower thirds for speakers if needed", simple lower third;
guest name; dj/artist name; couple names; participant name tags; department/location labels;
department/party/role label; location tags, location tag, live/location tag, stage/location
tag, venue/location tag, location/time-zone tags, camera/location labels (locator subtype);
role/credit label; affiliation; model name.

**bug** - sponsor bug (9), live bug (3), sponsor/brand bug (3), sponsor/partner bug (3),
sponsor/venue bug (2), station bug, show logo bug, minimal logo bug, production logo bug,
sponsor/school bug, sponsor/travel partner bug, sponsor/publisher bug, organization/agency
bug, trophy/award bug, lower-third topic bug; social handles (11), social hashtag (5)
(social-handle subtype); camera name, camera label (station-id register - the standalone
camera identifier of security/nature cams; the reality-show "camera/location labels" naming
where a shot is stays a *lower-third* locator).

**title** - event title (3), session title (2), stream title (2), segment titles (2), project
title (2), episode title card, episode title, show opener, show logo/opener, segment openers,
keynote opener, company-branded opener, course title, service title, sermon title, production
title, ceremony title, workshop title, paper/session title, recipe title, film/show title,
designer/collection title, runway segment title, name/date memorial title card,
date/location title card, venue/title card, game/category label (title-ish label),
music/playlist label, track/ambient sound title, mood/theme label.

**topic** - topic cards (7), topic card (2), topic/chapter cards, code topic/chapter cards,
lesson/chapter cards, chapter cards, chapter/segment labels, topic/round cards, analyst topic
cards, topic/agenda cards, case/topic labels, show/episode/topic card, now-playing card,
track id/now playing, song/hymn titles, readings/song titles (now-playing register),
agenda/coming-up card, next-up card, next item preview, next exercise preview, schedule/next
dj card, schedule/next designer card, next-session card.

**info** - step cards (2), feature callouts (2), headline cards, full-screen explainer
graphics, diagram/explainer panels, key-term cards, fact cards, local fact cards,
fact-check cards, product name/spec cards, garment details, cause/story cards, recap card,
recap/quest objective card, recap/action items, closing summary card, closing action items,
step/process labels, step labels, step-by-step process cards, instructions checklist,
breakout group instructions, exercise/task cards, assignment/deadline reminders,
assignment/show info, internal announcements, event announcements, character cards,
status/relationship cards, abstract/key-point card, emergency guidance card,
shelter/evacuation info, multilingual cards, rules graphic, rules card, safety note,
allergen note if needed, financing note if needed, medication/procedure labels,
motion/amendment text, weather insert, icons.

**question** - question cards (4), q&a cards (3), q&a card (3), question card, q&a question
card, interview question card, viewer question graphics, chat highlight (3), chat highlights,
chat question highlight, quote highlight → *quote*, chat/question overlay, chat/q&a overlay,
chat/q&a cards, chat overlay, queue/next question, public comment queue, question source
label, user name/source labels, call-in/message info, prayer request card.

**quote** - quote cards (4), quote/excerpt card, scripture verses, statement headline.

**scoreboard** - scoreboard, simple scoreboard, match scoreboard, game clock (2) (rides the
scoreboard's clock group), period/half/quarter indicator, period/half indicator, map/round/game
indicators, round/set counter, team names/logos/colours, team names/logos, team/player names
and logos, penalties/cards/fouls, penalties/cards, substitutions, score/decision panel,
current bid + bid increment (auction score register - also *product*), goal/score animation.

**results** - results tables, score table, final results screen, final score card, full-time
result graphic, leaderboard, brackets, seat counts, winner projection banner, vote result
graphic, precinct/reporting progress, swing/change indicators.

**stats** - statistics panels, mvp/player stats, kpi panels, data charts, climate/data charts,
price charts, heatmaps, index panels, earnings/calendar cards, percentage bars, audio level or
now-live indicator, issue/task status, bidder status, time-lapse/progress marker.

**timer** - countdown (11), timer (7), challenge timer (2), countdown timer, countdown deal
timer, schedule/countdown, speaking timers, rebuttal timer, interval timer, cooking timers,
rest/work indicator, time/date (2), timestamp (2), clock/time signal, time/weather tag,
countdown to live/take, breathing guide (timed-guidance register).

**ticker** - ticker (7), market ticker (market-ticker subtype; chart-bearing finance panels
stay in *stats*).

**alert** - breaking-news banner, alert/breaking move banner, urgent alert banner, alert
banner, warning alerts, alerts, event alert such as feeding/nesting, status indicator, status
updates, safety/status notices, privacy/safety notice, spoiler warning, connection-status
fallback, terminal warning/focus card,
official source labels, source labels, source/disclaimer labels, legal/disclaimer/source
labels, data source label, source/reference labels, citation/source labels, source/reading
citation card, document/source labels, pool/source credit, legal disclaimer, disclaimer (2),
sponsor disclosure, legal/fair-use/source reminder (label/compliance register - subtype
`notice`).

**list** - agenda (5), schedule (3), agenda cards, session agenda, session schedule, program
schedule, service program, program section cards, setlist card, ingredient list, materials
list, arrivals schedule, open-house schedule, initiative/order tracker, act/scene cards,
scene/shot card, ceremony section labels, music/procession cards, room labels,
navigation/room labels, room/stage identifier, room/track identifier, equipment labels, tool
labels, tool/brush/software label, exercise name, intensity/modification tags,
temperature/measurement callouts, lineups (2) (lineup subtype, rows structure).

**poll-quiz** - poll results (5), poll/vote graphics, voting/poll graphics, voting/hashtag
graphics, poll/quiz results, quiz/poll graphics, q&a/poll graphics, answer options,
correct/incorrect animations, round graphics, "package-specific graphics such as quiz,
scoreboard or q&a" (meta-mention).

**progress** - donation goal (2), donation/subscriber goal, donation/subscriber/follower
goal, donation/goal overlay, goal progress bar, progress bar, donation total, progress stage,
challenge/goal graphic, milestone celebration animations, inventory/limited stock indicator
(stock-level subtype).

**product** - product card (2), recipe/product cards, product/sponsor cards,
product/affiliate card, item card, lot number, price, price and discount graphic,
shade/name/price, pricing/availability, product carousel, product comparison, comparison
table, comparison tables, fashion/designer card, book title/cover card, property
title/address area, floor plan, order confirmation or social proof overlay, company logo
cards.

**cta** - qr code (2), donation/merch cta (2), buy-now cta, shopping cta, social/commerce
cta, donation/cta, donation/subscribe cta, donation/conservation cta, donation/charity cta,
donation/offering qr code, qr/payment cta, qr/payment link, qr recipe link, qr listing link,
qr instructions/download link, affiliate/qr link, resource/qr link, resource links/qr,
cta/qr code, cta/qr, cta/registration link, cta/follow-up link, cta for
appointments/resources, contact/cta, contact/resource cta, closing contact/resource card,
purchase/qr link, hotline/url/qr, commission/cta, closing cta.

**sponsor** - sponsor panels (4), sponsor panel, sponsor read graphic (2), sponsor/read
graphic, sponsor loop, sponsor tags, partner logos, sponsor/partner logos, sponsor/partner
logo strip.

**frame** - webcam frame, simple background frame, split-screen frames, split-screen frame,
reaction frame, player frames, visualizer frame, screen-share frame, controller/key input
overlay, dice roll overlay.

**holding** - starting/ending/brb screens (2), stream starting/ending screens,
starting/ending screens, starting/ending screen, be-right-back screen, break screen (2),
intermission screen, interval/intermission screen.

**credits** - end credits (3), full-screen thank-you/end credits, thank-you graphics,
thank-you/end screen, closing blessing/end screen, closing/end screen, encore/end card,
event closing card, opening/closing cards, student role credits, donor names, graduate name
cards, certificate/next-session reminder, photo/memory cards (2).

**caption** - lyrics or captions if used, song lyrics, captions/surtitles if used, discreet
captions, translation/caption label. (Note: song/hymn **titles** are NOT captions - a title
naming what is playing is a shipped now-playing topic card, mapped under *topic* - only
timed-text lyric/caption playout sits in this gap category.)

**reveal** - winner reveal, winner screen, nominee cards, category title (award reveal
register), launch reveal animation, before/after cards, before/after, before/after plate
reveal, prize graphic, sold/unsold graphic (sold subtype), award/honour graphics, player
cards (esports reveal/profile card - also *info*).

**map** - maps (2), weather maps, map pin, route/progress map, map/location card,
map/location zones, map/scene card, map/sensor panel, radar/satellite labels, live location
tag, species/location label, location label, forecast panels, temperature/wind/rain graphics,
timeline/forecast strips.

**transition** - stingers (3), stinger/transition, transition stingers, replay wipe (2),
replay/highlight wipes.

Coverage check: every sheet phrase maps to exactly one primary home above (a few are
cross-referenced where the sheet's compound wording genuinely spans two, marked "also *x*").

Term-first sample in the brief's format:

| Source term | Normalized category | Subtype/context | Likely capabilities |
|---|---|---|---|
| speaker/pastor lower thirds | lower-third | speaker · format church-service | - |
| sponsor bug | bug | sponsor | logo-upload, sponsor-rotation (future) |
| scripture verses | quote | scripture · format church-service | multi-line |
| match scoreboard | scoreboard | match-score · sports/esports | score-controls, clock, operator-states |
| donation goal | progress | donation-goal · fundraiser/creator | progress, live update |
| question card | question | viewer-question | question + name + source semantics |
| product card | product | product-card · live-shopping | image-upload, price semantics |
| winner reveal | reveal | winner · award-show | multi-step, operator-states |
| interval timer | timer | interval · fitness | countdown, pause-resume |
| caster lower thirds | lower-third | speaker · format esports-tournament | - |

---

## 16. Validation - the 20 searches

Facet path → expected behaviour. "Catalog: ✓" = shipped templates match today; "gap" = the
taxonomy resolves but the catalog has no template - the honest empty state + AI hand-off
(§13.2) fires. Gap alignment with `PACK_TAXONOMY.md`'s list is noted - the taxonomy never
needed a rewrite to accommodate them.

| # | Request | Facets | Outcome |
|---|---|---|---|
| 1 | Two-field church speaker lower third | format church-service · cat lower-third · fields 2 | Catalog ✓ (lt*, minimal ranked via Church pack family) |
| 2 | Football scoreboard, clock + period | family sports · cat scoreboard · cap clock | Partial: score + clock ✓ (sb designs, parallel clock group); a period/round field ships on no sb design yet - soft gap the type's fields absorb without taxonomy change |
| 3 | Esports player card, image + stats | format esports · cat reveal/player or info · fields image+number | **gap** (player card - gap list "lineups/stats") |
| 4 | One-field minimal lower third | cat lower-third · fields 1 · style minimal | Catalog ✓ |
| 5 | Two-person remote interview layout | structure two-person · cat frame or lower-third | lower-third two-person: **gap**; frame: **gap** (gap list "frames") |
| 6 | Viewer question card, username + platform | cat question · semantics name+source | **gap** (question type - natural next type) |
| 7 | Full-screen emergency instructions | cat info/checklist · placement full-screen · format emergency-info | **gap** (topic/title cards near-miss; honest state) |
| 8 | Product card, price + discount + QR | cat product · caps qr | **gap** (gap list "QR") |
| 9 | Scripture, long multi-line | cat quote/scripture · structure multi-line | Partial: topic/info cards with textarea serve; dedicated quote design is a soft gap |
| 10 | Quiz question, 4 answers + timer | cat poll-quiz/quiz-question · cap countdown | Partial - and a strictness proof: quiz boards (qz*) have selected/locked branches but NO countdown, so the strict capability chip honestly empties the result; dropping the chip finds qz*, and countdowns live in `timer` (gt*) as a second graphic. A timed quiz board is a soft gap |
| 11 | Donation goal, live progress | cat progress · cap progress | **gap** (gap list #1 - goal type) |
| 12 | News ticker with breaking state | cat ticker · cap alert-state | Ticker ✓; breaking *state* gap (alert-state on ticker = future machine branch) |
| 13 | Conference agenda, repeating rows | cat list/agenda · cap repeating · format conference | Catalog ✓ (ig08 family) |
| 14 | Podcast now-playing card | format podcast · cat topic/now-playing | Catalog ✓ (topic cards ranked for Talk pack) |
| 15 | Property card, image + price + contact | cat product/property | **gap** |
| 16 | Municipal vote result | format council-meeting · cat poll-quiz/vote | Catalog ✓ (ig11 poll; PACK_TAXONOMY maps council → Election pack) |
| 17 | Lower third for IRL chat stream | format irl-travel or just-chatting · cat lower-third | Catalog ✓ (noacg family ranked via Creator pack) |
| 18 | Three-field academic speaker lower third | format academic-conference · cat lower-third · fields 3 | Catalog ✓ (maxLines ≥ 3 straps; range match §6.1) |
| 19 | Sports lineup, repeating players | family sports · cat list/lineup · cap repeating | Partial: agenda rows serve; dedicated lineup is a gap-list item |
| 20 | Full-screen graphic, exactly two text fields | placement full-screen · fields 2 | Catalog ✓ (holding screens, full-screen title cards). Two rules earn this row: coverage class makes "full-screen" answerable, and visible-field counting (§6.1) keeps a holding screen's hidden minutes input from pushing it out of bucket 2 |

Failure-mode review the brief asks for:
- **Zero results**: 7 of 20 are catalog gaps - and they cluster exactly on the pre-existing
  gap list, confirming the taxonomy is ahead of the catalog, not mismatched to it. The
  empty-state contract (§13.2) turns each into an honest answer plus an AI hand-off.
- **Too many results**: "lower third" alone returns ~20 - the format ranking sections plus
  field buckets cut that in one gesture; primary-category-only browsing keeps a variant from
  appearing under three tiles.
- **Misleading matches**: the two known traps are handled structurally - coverage class keeps
  corner bugs out of "full-screen" (#20), and strict capability semantics keep a static
  countdown *image* from matching "has countdown" because `countdown` derives from the type's
  clock group, not from a keyword.

---

## 17. Migration & rollout plan

Ordered so every stage ships green on its own; no stage renames existing ids.

1. **Facet registries** (pure additive code): facet id unions + label maps + alias table +
   per-preset motion table + coverage classes. No behaviour change.
2. **Derivation layer**: `templateMeta(variant)` computing §11 at registry build;
   `factory.mjs` gains the meta assertions (declared-vs-schema consistency, keyword rules,
   every variant resolves a primary category).
3. **Declared meta**: `semantic` on the 12 types' fields; a `templates/meta.ts` table for the
   ~30 unclaimed hand-written variants (primary category, subtype, structures, positional
   semantics). The per-variant splits of `lower-third`/`info-card`/`infographic` (§4) are
   finalized here as metadata - `TemplateCategory` and all file layout stay untouched.
4. **Search + Browse step** behind the existing wizard: new BrowseStep replaces
   CategoryStep+TemplateStep for `mode==='template'`; the hard-coded step indices in
   `CreationWizard.tsx` are re-based once (audit located every literal). MiniPreview, WizardPreview,
   draft flow, `variant.create(options)` contract: unchanged.
5. **E2E**: new browse/filter/search specs; `wizard-filters.spec.ts` migrates to the new chips.
6. **Later, separately**: pack surface ("start from a kit"), the community/nightly publish
   contract of §11 (versioned payload, closed-registry validation, server-side recomputation
   of the derived half), zero-result telemetry, alias growth loop, new types for the gap
   categories (question, goal/progress, product, QR, reveal - the gap list already orders
   them by evidence).

Fallback behaviour: a variant with no declared meta gets a derived-only record (category from
its current `TemplateCategory` via the §4 mapping table, no subtype/structures) - the browser
never crashes on a lazy variant; the factory just flags it.

---

## 18. Risks, ambiguities, recommended decisions

**Recommended decisions (need a yes/no):**
1. **26-category set + per-variant split of `info-card`/`infographic`** (§4). Alternative: keep
   the coarse 12 and add only subtypes - cheaper, but "Questions", "Products", "Progress" then
   have no browsable home when their types ship, and the split would happen later anyway.
   Recommend: adopt 26 now, tiles render only non-empty (11 tiles day one - same visual
   density as today).
2. **Programme format = ranking, not filter** (§13.1). The strongest single UX decision in
   this proposal; the alternative (strict filter) hides every general-purpose template and
   makes 60 formats × sparse tagging a zero-result machine.
3. **Field buckets are exact ranges over the reachable range** (§6.1), no at-least/exactly
   toggle in v1.
4. **No Popular / no Newest sort** (§12.2) until real data exists; `added` field starts
   accruing on adoption if Newest is wanted.
5. **Style filter stays the 4 families**; adjectives are aliases (§9). A style-vocabulary
   rewrite is a design-system project, not a discovery project.
6. **Meta lives on types + one sidecar table**, derived bulk computed at build (§11) - not a
   parallel hand-written JSON per template.

**Risks / ambiguities:**
- **Two category systems during transition** (assembler `TemplateCategory` vs graphic
  category). Mitigated: one mapping table, factory-asserted, and `TemplateCategory` is
  explicitly demoted to a routing id - but every doc touching "category" needs a pass at
  implementation time.
- **Packs do double duty** (curated kit + relevance source). Category-level derivation and
  `relevance: 'all'` (§3) remove the worst failure modes (format-less classics, universal
  types forced into every kit), but the tension is permanent: adding a type to a pack now
  also changes discovery ranking. Review pack edits with both hats on; `extraFormats`
  over-use would recreate hand tagging, so the factory caps declared widening.
- **`question`/chat-highlight overlaps show-chat territory.** `PACK_TAXONOMY.md` explicitly
  left chat/alert overlays as a product decision near `src/community/showchat`. The category
  exists in the taxonomy either way; whether its chat-highlight subtype eventually *binds*
  show-chat data or stays a hand-filled template is that same open decision - the taxonomy
  does not preempt it.
- **Semantics on positional fields** for hand-written variants is order-fragile; the factory
  must assert length == schema length so a field insertion fails loudly.
- **The alias table is English-first.** Ids are stable and labels localizable, but alias
  quality in other languages is future work (per-locale alias sets slot into the same table).
- **Search over ~80 templates is trivial; over a nightly-generated library of thousands**
  (the committed direction) the same index + facets hold, but ranking will need the telemetry
  loop - flagged so nobody assumes the v1 ranking is the end state.
- **Zone9 `defaultZone` under-specifies placement for full-canvas graphics** - the coverage
  class per category fixes it, but imported designs have neither; they stay outside browse
  (correct: they're the user's own content).

**The four open questions - RATIFIED 2026-07-23.** Each was decided on the evidence noted;
none needs revisiting unless that evidence changes.

- **The pack ("kit") surface is its own Entry card, not a third Browse mode.** Browse
  produces ONE graphic; a kit produces several. A "Kits" tab inside Browse would promise a
  single pick and deliver a different outcome, so the surface follows the outcome. (Closes
  the question `PACK_TAXONOMY.md` left open.) **BUILT 2026-07-29**: the "Start from a kit"
  Entry card → `wizard/steps/KitStep.tsx`, which creates every graphic in the pack into one
  new package and lands there, never in the editor. Pinned by `e2e/wizard-kit.spec.ts`.
  **Measured while building it: the (type × family) matrix is NOT full** - no pack resolves
  in all six families, and `editorial`/`cinematic` resolve for none - so the step offers only
  the looks a given kit can actually be built in. `src/templates/packs.ts` still describes the
  matrix as full; that comment is now wrong and the gap is real catalog work, not a doc fix.

  **REVERSED 2026-08-08 — ONE DOOR.** The separate Entry card is gone; "one graphic or a whole
  kit" is a SEGMENTED CONTROL at the top of the Browse step, and picking a kit swaps the step's
  body from the design grid to the kit picker (`wizard/steps/KitPicker.tsx`). The premise above
  was right and the conclusion did not follow from it. Two things measured against it:
  **a front-page card has to be understood before it is pressed** - "kit" is a word the product
  is teaching, so the set was only ever found by someone who already knew to look for it - and
  **an Entry card is expensive to change your mind about**, because correcting the guess means
  walking back to the front page. A switch at the top of the step it governs makes the same
  promise at the moment it is actionable, and costs one click to undo. What protected the old
  decision's honesty is kept structurally instead: the switch's two sides each say what they
  produce, the rail's words follow the answer, and the count on the picker is the count that
  gets built. A kit then walks the SAME six steps a single graphic does - which is the part the
  separate card could never offer, since customizing a kit's graphics was not a thing it did at
  all. Full shape in `PACK_TAXONOMY.md`, "The wizard surface"; pinned by `e2e/wizard-kit.spec.ts`.
- **`title` and `topic` keep separate browse tiles.** They answer different producer
  questions - what the SHOW is versus what is being discussed NOW - and the workbook demands
  both heavily (23 and 29 formats). Today's 4 + 4 designs look thin, but the pending pack
  work (card10-card18) grows both; merging now and re-splitting later is churn.
- ~~**The house family stays labelled "Bold & on-air".**~~ **REVERSED 2026-08-26 — the whole
  label row is one plain word each.** The original call recorded itself as "a taste call with
  no evidence either way". The evidence arrived: the owner read the Browse grid cold looking
  for a credit roll and named the labels unprompted - "Bold & on-air, Sport & energetic… I get
  the AI slop feeling with those names… it makes me feel that it's AI-generated and not
  genuine. We don't want any hype AI words here anywhere; it should just be simple and good."
  The tell is the SHAPE, not the individual words: in every pair the second half is an
  adjective doing no work, because the family is already named by the first, and six of those
  in a row reads as copywriting. `STYLE_FAMILY_LABELS` is now Minimal / Editorial / Cinematic /
  Sport / Glass / NoaCG - which is what the older Template step had printed all along, so the
  rename removed a second vocabulary rather than inventing one. (`noacg` remains the stable id;
  the public template pages print the label, never the id.)
- **The style family is not a card TITLE.** It sat opposite the design's name in the caption,
  in a per-family accent colour, which made a filter value the second-loudest thing on every
  card. It is now a dim tag on the card's last line beside complexity, and the line under the
  name is the CATEGORY. Same session, same reading: a search for "credit" returned thirteen
  credits designs called Crawl, Pager and Column Roll, and the word "Credits" was in the dim
  block rather than where a reader was looking.
- **Light/dark stays OUT of discovery.** `porcelain` is a genuinely light palette, but
  palettes are swapped freely in the Style step immediately after picking - filtering
  templates by a knob the very next step changes would mislead.

---

## 19. RULING REQUEST - how many finding mechanisms does Browse offer? [ANSWERED: Option A, owner 2026-08-27; shipped 2026-08-28 - see §20]

**Who this is for: the owner.** Nothing below is built. It is one decision with a recommended
option, raised because the owner tried to make a credit roll for his own programme, could not
find one, and named the cause while looking at the step.

### What he said

- "I think the search is what people will use the most."
- On the type dropdown: credits is buried third inside "Timers, breaks and credits".
- On the chip row under it ("timer clocks, holding screens…"): "a third way of looking at
  things… I think those tabs might be unnecessary."

### What is actually there [FACT, measured]

Three controls, and they are NOT three parallel axes - two of them are one question asked in
two levels:

1. **Search** (`.wz-browse-search`) - the whole catalog, alias-aware. A genuine axis.
2. **The type SELECT** - the ten category GROUPS (§4c), each with a live count.
3. **The chip row under it** (`.wz-browse-cats`) - the SELECTED group's member categories.
   It renders only when the group has more than one member, and it disappears when the group
   is cleared. This is level two of control 2, not a control of its own.

The reason it reads as a third mechanism is drawn, not structural: it is a row of `.wz-filter`
pills sitting directly above the STYLE row, which is a different facet drawn with the same
pills. Two identical chip rows, neither captioned. Shipped tonight as the cheap half of the
fix: each row now carries a caption ("Inside Timers, breaks & credits:" and "Style:"), so the
hierarchy is visible without moving any control.

### The open question

Should level two become part of the dropdown - the two-level "main category → sub-kind" shape
the owner sketched - or stay chips?

- **Option A (RECOMMENDED) - one select, two levels, `<optgroup>`.** The single control offers
  the ten shelves as group headings with their member categories as options under them, so
  "Credits & thanks · 13" is a row a reader can SEE while scanning, not a chip that only exists
  after picking the right shelf. The chip row disappears; the style row is then the only chip
  row on the step and cannot be mistaken for a second axis. Cost: one control rewrite plus the
  `chooseType` helper in `e2e/_browse.ts`; no taxonomy change, no re-categorization.
- **Option B - two selects side by side** (shelf, then kind). Explicitly two levels, but it is
  two controls to operate for one question and the second is empty until the first is answered.
- **Option C - keep the chips, now captioned.** What ships tonight. Costs nothing further; the
  member categories stay invisible until a shelf is picked, which is the part that made
  "credits" hard to find in the first place.

**What the answer does NOT depend on any more:** categories no longer bind the playout backend
(any graphic can have any field), so a category exists ONLY for finding. That removes the one
argument for keeping the vocabulary conservative - this is now purely a question about reading.

### Not raised here, deliberately

**The credits designs' NAMES.** "Classic Roll", "Column Roll", "Pager", "Crawl", "Credit Reel"
are what the owner read as "reels and crawls". Renaming them is the honest fix and it is not a
Browse change: the name slugs the public template page's URL, and `e2e/end-credits.spec.ts`,
`images.spec.ts`, `package.spec.ts` and `holding-pack.spec.ts` all reach designs by it. It
belongs to a session that owns the credits pack, with the redirect question answered.

## 20. THE STUDENT'S SEARCH, MEASURED - and what shipped [DONE, 2026-08-28]

The owner's two complaints on 2026-08-27 - "I'm not that satisfied on how I'm searching for
graphics" and kits are "buying a pig in a bag" - were taken as measurements to make rather than
opinions to act on. `node scripts/spike-search-journey.mjs` runs the terms a student types
through the real `browseTemplates` inside the dev server and prints what each returns;
`scripts/spike-token-probe.mjs` answers one query at a time.

### 20.1 What the journey measured [FACT, 2026-08-27]

Eighteen English, twenty Swedish and twenty Finnish terms, over 507 browsable designs.

- **English mostly worked.** "lower third" 97, "credits" 13, "stinger" 18, "scoreboard" 34,
  "quiz" 23, "ticker" 23, "break screen" 21 - each landing on its own shelf.
- **A single unreachable word emptied the whole result.** `textScore` is token-AND, so
  **"big title" returned NOTHING** while "title" returned 71: no design is both "big" (Big
  Stat) and "title". The reader typed two words, one of them was right, and the step answered
  with an empty grid. "my show name graphic" failed the same way, on "my".
- **38 of the 40 Nordic terms returned ZERO.** The catalog, the category labels and the field
  titles are English, so a Swedish or Finnish word had nothing in the index to match.
- **The two that returned anything were worse than zero.** Finnish "logo" is the English word
  and returned 203 designs across four shelves; Swedish "paus" (a break) folds to a prefix of
  the English "pause", which scoreboard descriptions use for the clock, so it returned
  **scoreboards** to somebody looking for a break screen.
- **The kit step showed 33 checkbox labels and no pictures** - "Volt Scorebug", "Slab Bug",
  "Pager", "Doors Open". Nothing on that screen says what any of them looks like.

### 20.2 What shipped [DONE, 2026-08-28]

- **Option A, as ratified.** ONE type dropdown carrying both levels: the ten shelves as
  SELECTABLE heading rows, their member categories NBSP-indented under them, each with its
  live count. The first cut used `<optgroup>` headings plus an "All <shelf>" row (an optgroup
  label is not selectable); the owner read that pair as "written there double" on the
  2026-08-28 walk, so the heading row itself is now the whole-shelf answer and the duplicate
  is gone. A one-member shelf stays a plain option. The member-category CHIP ROW is gone -
  it was level two of this same question drawn as a second row of pills over the style pills,
  which is what read as "a third way of looking at things". The active-filter row shows ONE
  chip for the whole type answer. Option values are `group:<id>` / `cat:<id>`, which is what
  `chooseType` (`e2e/_browse.ts`) now selects in a single action.
- **Swedish and Finnish alias tables** (`model/taxonomy.ts` `ALIASES_SV` / `ALIASES_FI`,
  ~300 phrases), merged into the one `ALIASES` with their keys folded through the shared
  `normalizeSearchText` - the same fold search runs over the query, so a table can be written
  in the spelling people actually type. **Zero dead terms afterwards**, and "paus"/"tauko" now
  return the 21 holding screens instead of 24 scoreboards. Extended 2026-08-28 after the
  owner's re-walk with the words broadcasters actually TYPE, not category translations -
  Finnish control-room slang `tg`, Swedish `namnplansch`, and their siblings per major
  category - pinned by the owner-words test in `e2e/wizard-filters.spec.ts`.
- **An unreachable word is set aside, not fatal.** `catalogVocabulary()` answers "can this
  token reach any design at all"; one that cannot is dropped from the AND and NAMED BACK to the
  reader ("ignoring “my”", `data-testid="wz-browse-ignored"`). A query made only of unreachable
  words still honestly returns nothing.
- **Kits show their contents.** Every row in the kit picker is a card with a real settled
  MiniPreview - the same component the Browse grid uses, intersection-gated so a 33-graphic kit
  is not 33 live timelines on arrival - plus the design's name and its graphic type. Choosing a
  kit is a look now, not a gamble. Pick-and-choose was already there and is unchanged: the
  checkboxes still carry `data-kit-item`.
- **Links are amber** app-wide (owner, 2026-08-27) - one rule on `a` in `src/styles/base.css`, because an
  in-app link to the docs was rendering in the browser's default blue.

### 20.3 The category-vs-tag ruling [DECIDED, 2026-08-28]

**A category says what a graphic IS (its form); a purpose says what it is FOR.** A purpose is
served by several forms - a sponsor is a corner mark AND a panel, a fundraiser is a meter AND a
call to action - so a purpose must never be modelled as one category, and a purpose WORD must
reach every form that serves it.

What that changes, and what it deliberately does not:

- **Implemented now, in the alias table.** Purpose words fan across forms: `sponsor`,
  `partner`, `donate`, `donation`, `fundraiser`, `charity`, `follow us`, `subscribe`. Before
  this, "sponsor" reached both (44 bugs, 3 panels) by luck, and "donate"/"fundraiser" reached
  NOTHING in English even though the Swedish and Finnish words for them were declared.
- **NOT implemented, deliberately.** Two shelves are named for a purpose rather than a form -
  `sponsor` ("Sponsor & partner panels", 3 designs) and `cta` ("Calls to action & QR", 8) - and
  `bug`'s subtype list is purposes of one form (`sponsor`, `station`, `award`, `source`,
  `social-handle`). Re-categorizing any of it moves `meta.ts`, `e2e/catalog-baseline.json`,
  `e2e/catalog-render-baseline.json` and `scripts/overflow-baseline.json` for 500+ designs,
  which is a wave of its own and buys a student nothing the alias fan-out does not already buy.
  **This goes to the morning questionnaire** as a shelf question, not a code one: is
  "Sponsors & commerce" a shelf a student looks under, or is a sponsor bug something they find
  by typing "sponsor"?

### 20.4 Still open

- **"logo" returns 203 designs** across four shelves, because the word is in the field titles of
  every design that can take a mark. The RANKING is right (corner bugs lead); the total is not a
  search. Not fixed here: making it an alias would consume the word and change what an English
  query means, which needs its own measurement.
- **The credits designs' names** ("Classic Roll", "Column Roll", "Pager", "Crawl", "Credit
  Reel") are still what the owner read as "reels and crawls" - unchanged from §19, and still a
  job for the session that owns the credits pack, because the name slugs the public template
  page's URL.

---

## 21. Facet I - OCCASION: what a graphic is FOR [SHIPPED, 2026-09-06]

The ninth facet, and the first one added since the original eight. It answers the question a
confused person actually arrives with, which none of the others could: **what part of my show is
this for?** Category answers what a graphic IS, programme format answers what SHOW it belongs to,
style family answers what it LOOKS like. Purpose had nowhere to live.

**Where it came from.** Owner receipt `docs/backlog/graphic-use-case-metadata.md`, from the
2026-08-28 walk: *"if they're searching for a specific 'thanks for watching', they might not find
it if we don't mention that... we should look into what kind of metadata we can have in the
graphics - use cases and stuff like that, so if someone is confused and not really sure what they
want, they can find guidance."* The same walk ruled STYLE LABELS the wrong tool for it - *"if I
want a nice-looking graphic for my late-night show, which one of these do I choose? It's not
really helping that much"* - so occasion is its own axis and adds no adjective anywhere.

### 21.1 The axis is a clock

Every value is a moment in a broadcast, in the order they happen. That is what keeps the list
closed: a value that is not a moment has nowhere to sit.

| id | name | example designs |
|---|---|---|
| `pre-show` | Before the show | ss01-ss05, ss10, ss11, ss18, ss20, ss21, cr05 |
| `coming-up` | What is next | card18-card21, card60, card68, ss13 |
| `break` | During a break | ss06, ss07, ss12, ss13, ss19 |
| `technical-problem` | Something has gone wrong | ss08, al07, al10 |
| `sign-off` | The end of the show | ss09, ss14-ss17, cr01-cr04, cr06, cr13 |

### 21.2 THE RULE for admitting a new occasion

All three, or it does not go in. The full text lives with `OCCASIONS` in
`src/model/taxonomy.ts`; this is the summary.

1. **It is a MOMENT ON THE SHOW'S CLOCK.** Not a form (that is the graphic category), not a show
   type (that is the programme format), not a look (that is the style family). If you cannot say
   *when in a broadcast* it happens, it is not an occasion.
2. **A confused person types it as their whole question**, and the phrases they would type are
   declared with it. An occasion nobody types is a filing word, and filing words belong to the
   category tree.
3. **At least three shipped designs honestly have it, and no single existing facet value already
   gathers them.** One deliberate exception: a moment on the same clock as an occasion already
   admitted (`break` is served only by holding screens today, and its category's subtype list
   could almost carry it - but splitting one axis across two facets is the rot this list exists
   to prevent).

Plus a ceiling of **eight**. A show's clock has a handful of moments on it; a list past eight has
stopped being a clock and become the free text §11 refuses.

**The rule is a GATE, not a paragraph.** `validateTaxonomy()` enforces the ceiling, the
three-design floor under every value, a declared id naming no real variant, and every phrase
resolving to its occasion through `ALIASES`. `npm run test:use-case-search` runs it beside the
real search engine over the real catalog; both mutations were checked to fail it before landing.

**Refused, so nobody re-litigates them:** `show-open` (the `title` category's `show-open` /
`session-title` subtypes already gather every opener - rule 3), `awards`, `fundraiser`,
`memorial`, `graduation`, `wedding` (all programme FORMATS already - rule 1), `breaking-news` and
`sponsor-read` (purpose words §20.3's alias fan-out already handles - rule 3).

### 21.3 How it is declared, and how search reads it

- **Declared** in `src/templates/meta.ts` as `TYPE_OCCASIONS` / `VARIANT_OCCASIONS`, deliberately
  SEPARATE from `DeclaredTemplateMeta`: that resolution is winner-takes-all, so folding occasions
  into it would force a design to restate its category, structures and semantics to gain one
  word. Resolution is variant, else type, else NONE - **no category fallback**, because half the
  holding shelf is a front door and half is a sign-off, which is the confusion the facet ends.
- **Undeclared is the default.** 36 designs of 502 declare an occasion; the rest have an empty
  list and behave exactly as they did before the facet existed. A guess is worse than a gap - a
  wrong moment puts a graphic in front of somebody at the wrong point in their show. The gaps are
  written down beside the table (cr07, cr08, cr09, cr11, cr12).
- **Search reads it through the ALIAS table**, not the loose word index. Each occasion's phrases
  are folded into `ALIASES` automatically, so the declaration IS the search behaviour; a matching
  design scores +35 in `aliasScore`, above the subtype's 25 and stacking on the category's 40.
  Phrases in the *text* index would have scored every design carrying "show" or "back", which is
  the uncontrolled-adjective failure §11 refuses.

### 21.4 What it measured, before and after

Run on the real catalog, 2026-09-06:

| query | before | after |
|---|---|---|
| "thanks for watching" | 1 result (ss09, found by its own NAME) | 11, ss09 first, **all eleven sign-offs** |
| "goodbye" | **0 results**, the word reported as ignored | 11 sign-offs across two shelves |
| "be right back" | 21 holding screens at one score; the BRB card **11th** | 5 break cards lead, front doors ranked below |
| "technical difficulties" | 2, and "difficulties" dropped as unreachable | 3 across two shelves, nothing dropped |

The owner's literal phrase already worked, by the accident of ss09 being *called* "Thanks for
Watching". The three rows under it are the same request one step out, where it did not.

### 21.5 The Browse card - DECIDED: not yet, and why

**The occasion does not go on the Browse card in this change.** Two reasons, and the second is
the real one:

- The card is `src/components/wizard/steps/BrowseStep.tsx`, owned by another session on the night
  this landed.
- **The only version worth shipping is the conditional one.** A label every card on a shelf
  carries is noise - which is exactly why the style label failed the owner ("it's not really
  helping that much"). An occasion earns its place on a card only when it DISTINGUISHES: shown
  when the visible result set is not uniform in it, hidden when it is. On a "thanks for watching"
  search every card would say Sign-off and none of them would be telling the reader anything; on
  the holding shelf browsed cold, "Before the show" against "During a break" is the whole answer.

Next step for whoever owns the card: render `meta.occasions` as one quiet line, gated on the
result set carrying more than one distinct occasion. Nothing else about the facet has to change.
