# Kit matrix gaps — the no-orphan-graphics work order

Measured 2026-08-08 against `main` at `5b1fdff4` (the unified kit flow, `KitPicker.tsx`, had
just landed). Companion docs: `PACK_TAXONOMY.md` (what a pack IS), `GRAPHIC_TYPES.md` (what a
type IS and the six promotion gates), `src/templates/AGENTS.md` (`kit.ts` / `packs.ts`).

> **Since 2026-09-23 a kit has ONE Style** and is never re-resolved into another family
> (`docs/PACK_TAXONOMY.md` "Kit consolidation"), so the pack x family reach measured below is
> history. What a kit can offer now is its own library plus every other type that resolves in its
> one family (`kitChoices`, `src/templates/kit.ts`).

**The goal this serves:** no orphan graphics. Every design we ship belongs to a kit, so a user
finds a complete, visually consistent set rather than one lonely lower third.

## How it was measured

The live registry, read through the running dev server — the `scripts/factory.mjs` contract, and
for its reason: a type's `structure.category` is kebab-case and a source-parsing pass has already
produced one confident wrong answer here. The probe imports `packs.ts`, `types/registry.ts`,
`catalog.ts` and `kit.ts` in the page and asks them, so every number below comes from the same
`resolvePack` the Create path runs. Two coverage questions are asked separately, and the
difference between them is a finding rather than an accounting detail:

- **declared** — the designs a pack's own `types` + `extras` resolve to, in every family the pack
  resolves in. 430 catalog variants, **169 in no pack**.
- **offered** — what the kit PICKER can put in front of a user: `kitChoices`, i.e. the pack's
  contents plus every *other* graphic type whose cell resolves. 430 variants, **123 reachable
  from no kit in any look**.

Everything below uses the second, stricter number, because the picker is the surface the goal is
about.

## 1. Pack x family: the 2026-07-29 claim, re-measured

**Still true in shape, materially better in size.** No pack resolves in all six families;
`editorial` and `cinematic` resolve for **none**. What changed is how close the four production
families are to done: 17 of 21 packs now resolve in all four, and the four that do not are held
up by **ten designs in total**.

Per-family type coverage (64 registered types): noacg 63, sport 58, minimal 55, glass 55,
editorial 6, cinematic 5.

#### Pack x family

| Pack | Declared look | Resolves in | Blocked by |
|---|---|---|---|
| Match Day (`match-day`) | sport | noacg, sport | `winner-card`/minimal; `roster`/glass |
| Football (`football`) | sport | noacg, minimal, sport, glass | - |
| Ice Hockey (`ice-hockey`) | sport | noacg, minimal, sport, glass | - |
| Basketball (`basketball`) | sport | noacg, minimal, sport, glass | - |
| Handball (`handball`) | glass | noacg, minimal, sport, glass | - |
| Racket Sports (`racket-sports`) | glass | noacg, minimal, sport, glass | - |
| Motorsport (`motorsport`) | sport | noacg, minimal, sport, glass | - |
| Athletics (`athletics`) | glass | noacg, minimal, sport, glass | - |
| Combat Sports (`combat-sports`) | glass | noacg, minimal, sport, glass | - |
| Club & School Sports (`club-sports`) | minimal | noacg, minimal, sport, glass | - |
| Esports (`esports`) | sport | noacg, sport | `player-card`/minimal, `map-round`/minimal, `bracket`/minimal, `winner-card`/minimal; `head-to-head`/glass, `roster`/glass, `bracket`/glass |
| Creator (`creator`) | noacg | noacg, minimal, sport, glass | - |
| Newsroom (`newsroom`) | minimal | noacg, minimal | `public-notice`/sport; `public-notice`/glass |
| Election (`election`) | minimal | noacg, minimal | `public-notice`/sport; `public-notice`/glass |
| Talk Show (`talk-show`) | glass | noacg, minimal, sport, glass | - |
| Corporate Events (`corporate`) | minimal | noacg, minimal, sport, glass | - |
| Classroom (`classroom`) | noacg | noacg, minimal, sport | `verdict-card`/glass |
| Church & Ceremony (`church`) | minimal | noacg, minimal, sport, glass | - |
| Stage & Music (`stage`) | glass | noacg, minimal, sport, glass | - |
| Shopping (`shopping`) | noacg | noacg, minimal, sport, glass | - |
| Wellness (`wellness`) | minimal | noacg, minimal, sport, glass | - |

**Editorial and cinematic stay BROWSE families, not kit families — decided, not deferred.**
Filling them means 58 and 59 designs respectively, at the six promotion gates each, to serve a
look no pack declares and no evidence asks for. They keep their designs, their `FAMILY_TOKENS`
row and their Browse chips; a kit is not the only thing a style family is for. Revisit only if a
user asks for an editorial kit by name.

## 2. Empty cells, ranked by what they block

Across the four production families there are **25 empty (type x family) cells**, and only ten of
them block a pack today. The other fifteen block a pack we should be declaring (§4).

#### Empty cells, the four production families

| Packs blocked | Cell | Which packs |
|---|---|---|
| 2 | `public-notice / glass` | newsroom, election |
| 2 | `public-notice / sport` | newsroom, election |
| 2 | `roster / glass` | match-day, esports |
| 2 | `winner-card / minimal` | match-day, esports |
| 1 | `bracket / glass` | esports |
| 1 | `bracket / minimal` | esports |
| 1 | `head-to-head / glass` | esports |
| 1 | `map-round / minimal` | esports |
| 1 | `player-card / minimal` | esports |
| 1 | `verdict-card / glass` | classroom |
| 0 | `award-reveal / minimal` | (no pack lists this type yet) |
| 0 | `call-to-action / minimal` | (no pack lists this type yet) |
| 0 | `goal-meter / minimal` | (no pack lists this type yet) |
| 0 | `goal-meter / sport` | (no pack lists this type yet) |
| 0 | `listing-card / glass` | (no pack lists this type yet) |
| 0 | `listing-card / sport` | (no pack lists this type yet) |
| 0 | `milestone-track / glass` | (no pack lists this type yet) |
| 0 | `milestone-track / minimal` | (no pack lists this type yet) |
| 0 | `nominee-reveal / sport` | (no pack lists this type yet) |
| 0 | `offer-card / glass` | (no pack lists this type yet) |
| 0 | `offer-card / noacg` | (no pack lists this type yet) |
| 0 | `product-card / minimal` | (no pack lists this type yet) |
| 0 | `product-card / sport` | (no pack lists this type yet) |
| 0 | `qr-card / glass` | (no pack lists this type yet) |
| 0 | `qr-card / sport` | (no pack lists this type yet) |

**Twenty-five designs finish the production matrix**, and after that every pack can list any type
in any of the four looks — which is what makes a declaration fix in §4 free rather than a
resolution failure. That is the single highest-value build in this report, and it is small.

## 3. Orphans: 123 designs no kit can reach, and why more designs will not fix it

#### Orphans by category

| Category | Orphans | Ids |
|---|---|---|
| lower-third | 50 | lt12 lt13 lt50 lt51 lt52 lt53 lt54 lt01 lt03 lt04 lt19 lt20 lt21 lt22 lt23 lt24 lt25 lt26 lt27 lt28 lt29 lt30 lt31 lt32 lt33 lt34 lt35 lt36 lt37 lt38 lt06 lt07 lt39 lt40 lt41 lt42 lt43 lt44 lt08 lt09 lt10 lt45 lt46 lt47 lt48 lt49 ls05 ls12 ls29 ls30 |
| info-card | 27 | card04 card10 card11 card12 card13 card14 card15 card16 card17 card46 card47 card48 card49 card53 card59 card60 card61 card62 card63 card64 card65 card66 card67 card68 card69 card70 card71 |
| frame | 14 | fr01 fr02 fr03 fr04 fr05 fr06 fr07 fr08 fr09 fr10 fr11 fr12 fr13 fr14 |
| ticker | 8 | tk05 tk06 tk20 tk01 tk02 tk03 tk19 tk21 |
| transition | 6 | tr05 tr06 tr07 tr08 tr09 tr10 |
| infographic | 5 | ig01 ig03 ig04 ig05 ig07 |
| alert | 4 | al05 al06 al12 al11 |
| end-credits | 3 | cr04 cr06 cr08 |
| game-timer | 2 | gt03 gt04 |
| public-info | 1 | pi10 |
| starting-soon | 1 | ss05 |
| results-board | 1 | rs04 |
| imported-design | 1 | imp01 |

> **Re-measured 2026-08-09 (`CATALOG_VARIETY.md` §2.2), and mechanism 1 below is much smaller than
> it reads.** Bucketing all 119 orphans exclusively: **59** are designs belonging to no graphic
> TYPE that no pack lists as an `extra` (a declaration gap — config, if the look problem is
> solved), **37** are editorial/cinematic, **12** are the sibling mechanism 1 describes, and **11**
> are the four type-less categories. So the sibling question decides twelve designs, not fifty.
> The same pass also measured the orphans as marginally MORE distinct than the designs a kit can
> already offer (median nearest-neighbour distance 0.21 against 0.18), so folding them in as
> near-duplicates would delete the more distinctive half.

There are **three separate mechanisms** here, and only one of them is a missing design:

1. **A type resolves to exactly ONE design per family, so every sibling is unreachable.** The
   `lower-third` type ships `lt11`/noacg, `lt02`/minimal, `lt05`/sport, `lt15`/glass,
   `lt25`/editorial, `lt32`/cinematic — six designs out of eighty-nine lower thirds in the
   catalog. A kit that offers "a lower third" can only ever offer those six. This accounts for
   almost all of the lower-third, info-card and ticker rows above, and **no amount of new design
   work closes it**: 257 of 430 catalog variants are type designs at all, and a kit's ceiling in
   one look is roughly 63 type cells plus 78 extras. Closing this is a change to what a kit
   OFFERS (pick the type, then pick which design of it), not to what the catalog contains.
2. **Four categories have no type at all** — `frame`, `end-credits`, `versus`, `imported-design`.
   Frames are the interesting one: 14 designs, and `GRAPHIC_TYPES.md` records why they cannot be
   a type (a frame's field count follows its camera count, and a type declares one field list).
   The only route into a kit for those is `extras`, which is config.
3. **Every editorial and cinematic design is an orphan** — 21 + 16 = 37 of the 123 — purely
   because no pack resolves in those families. §1 decides that stays true.

**Extras carry their own look, and that is a real wart the goal will meet.** An `extras` entry is
a fixed variant id; it does not follow the family the kit was built in, so a glass kit that lists
`cr01` (minimal Classic Roll) gets a minimal credit roll. `TemplatePack.paletteId` repaints the
palette but not the shape language. Any plan that fills kits out of `extras` should read that
sentence twice.

## 4. The core six, and where the declarations disagree with it

Target shape (the work order's Phase 2): every kit ships a lower third, an opener/topic card, an
info or bullet card, a ticker or bug, a countdown/holding card and a closing card — then its
genre add-ons.

#### The core six, per kit

| Kit | Graphics | Missing from the core six |
|---|---|---|
| Match Day | 32 | - (complete) |
| Football | 10 | opener / topic card, info or bullet card, closing card |
| Ice Hockey | 8 | opener / topic card, info or bullet card, closing card |
| Basketball | 8 | opener / topic card, info or bullet card, closing card |
| Handball | 8 | opener / topic card, info or bullet card, closing card |
| Racket Sports | 8 | opener / topic card, info or bullet card, countdown / holding, closing card |
| Motorsport | 9 | opener / topic card, info or bullet card, closing card |
| Athletics | 8 | opener / topic card, info or bullet card, closing card |
| Combat Sports | 9 | opener / topic card, info or bullet card, closing card |
| Club & School Sports | 9 | opener / topic card, info or bullet card, closing card |
| Esports | 36 | - (complete) |
| Creator | 24 | - (complete) |
| Newsroom | 32 | closing card |
| Election | 22 | - (complete) |
| Talk Show | 24 | closing card |
| Corporate Events | 29 | - (complete) |
| Classroom | 21 | - (complete) |
| Church & Ceremony | 27 | - (complete) |
| Stage & Music | 23 | - (complete) |
| Shopping | 13 | - (complete) |
| Wellness | 12 | - (complete) |

**The nine discipline packs are the finding.** Each is 8-10 graphics of pure match furniture: a
scorebug, a match board, fixtures, a strap, a sponsor bug. None can open a show, none can put a
sentence on screen, and none can end. They were cut as REFINEMENTS of Match Day (`PACK_TAXONOMY.md`:
"the same format cut for a sport whose clock counts the other way"), and that framing is exactly
what produced kits that cannot run a show on their own. Every type they need already resolves in
all four production families — `title-card`, `topic-card`, `key-facts`, `countdown`,
`holding-screen` — so this is a **declaration fix, not a build**.

**The closing card has no type at all.** It is answered today by `end-credits` extras (`cr01`-`cr12`)
and by `ss09` "Thanks for Watching", both of which carry their own look (§3). Two kits have
neither: Newsroom and Talk Show. Decision: a **sign-off card type** with a design in each of the
four production families is the right answer, because the closing card is core-six for every
genre and an extra cannot follow the kit's look.

Ten registered types are listed by no kit at all — the commerce set, the goal/milestone pair, the
QR card, the CTA, the two reveals and the event notification:

#### Types no kit lists

| Type | Ships in |
|---|---|
| `call-to-action` Call to action | noacg, sport, glass |
| `product-card` Product card | noacg, glass |
| `offer-card` Offer card | minimal, sport |
| `listing-card` Listing card | noacg, minimal |
| `goal-meter` Goal meter | noacg, glass |
| `milestone-track` Milestone track | noacg, sport |
| `qr-card` QR card | noacg, minimal |
| `nominee-reveal` Nominee reveal | noacg, minimal, glass |
| `award-reveal` Award / launch reveal | noacg, sport, glass |
| `event-notification` Event notification | noacg, minimal, sport, glass |

Each has an obvious home — commerce and QR in Shopping, the goal meter and milestone track and
CTA in Creator, the two reveals in Stage & Music, the event notification wherever a stream
announces itself — and each is blocked from being declared there only by the 0-pack cells in §2.
That is why those fifteen cells are worth building even though nothing is blocked today.

## 5. The work order

Ranked by value per unit of work. Items 1-2 are design volume (delegate); 3-5 are config and
decisions (do here).

1. **Fill the ten blocking cells.** `winner-card`/minimal, `roster`/glass, `public-notice`/sport,
   `public-notice`/glass, `player-card`/minimal, `map-round`/minimal, `bracket`/minimal,
   `bracket`/glass, `head-to-head`/glass, `verdict-card`/glass. Effect: all 21 kits resolve in all
   four production looks, and `familiesFor` stops being a list of four different answers.
2. **Fill the remaining fifteen, and add the sign-off type (4 designs).** Effect: the production
   matrix is genuinely full, every type is declarable in any kit, and the core six has a type for
   its sixth member.
3. **Declaration fixes (config only, no new designs):** the nine discipline packs get the core six;
   Newsroom and Talk Show get a closing card; the ten unlisted types are declared where they
   belong; frames enter the kits that want a camera window as `extras`.
4. **Decide the sibling-design question.** §3 mechanism 1 is the whole orphan story and it is a
   kit-model decision, not a build: does a kit choice name a TYPE (today) or a type plus a design?
   Until it is answered, "no orphan graphics" is not reachable — 50 lower thirds stay unreachable
   no matter how many more we draw.
5. **Editorial and cinematic stay Browse-only** (§1). Recorded so it is not re-litigated by
   whoever next reads "no pack resolves in all six families" as a defect.

Nothing here changes a persisted format, so nothing here needs a migration. `scripts/factory.mjs`
validates the pack config on every run and will catch a declaration that points at an empty cell,
which is the gate items 1-3 are held to.

## 6. What was done, and what the numbers are now (2026-08-08, same day)

Items 1, 2, 3 and 5 are **done**; item 4 is the one that remains, and it is a decision rather than
work. Re-measured with the same probe:

| | before | after |
|---|---|---|
| kits resolving in all four production looks | 17 of 21 | **21 of 21** |
| empty cells, production families | 25 | **0** |
| graphic types no kit lists | 10 | **0** |
| catalog variants no kit can offer | 123 of 430 | **119 of 459** |

Twenty-five designs filled the matrix, and a **`sign-off` type** (`ss14`-`ss17`) gave the core
six's closing card a home that follows the kit's look, so every one of the 21 kits now declares
one. `ss09` "Thanks for Watching" was NOT promoted into it: it emits three text lines and
`logo: 'none'` against the type's logo slot, and widening the type to fit an existing card would
have been the promotion tail wagging the type (`GRAPHIC_TYPES.md` §5).

**The orphan count barely moved, and that is the finding, not a disappointment.** Filling every
cell adds one design per (type, family) — the ceiling a kit can reach — while the orphans are
overwhelmingly SIBLING designs of types that already resolve (§3 mechanism 1), the four
type-less categories, and the two Browse-only families. **"No orphan graphics" is not reachable
by drawing more designs**; it needs the kit model to let a choice name a design as well as a
type. That is item 4, and it is now the only thing between here and the goal.

**The core six is now a gate, not a measurement** (`CORE_SIX` + `validatePacks`, run by
`scripts/factory.mjs`): a pack that ships no opener, no info card, no ticker-or-bug, no
countdown-or-hold or no closing card fails the build. It caught one thing the day it landed -
**Newsroom declared no `holding-screen` type**, covering the role with the `ss08` extra, which is
minimal and so matched this kit's look by luck rather than by resolution. Roles are satisfied by
TYPES only, for that exact reason.

Two things measured on the way that belong to nobody's feature:

- **The type-floor gate had never run.** Its reader lost the backslashes in `\s`/`\d`, so it
  threw before measuring anything (repaired here). A gate that fails loudly is fine; this one
  failed loudly at a point nobody was looking, which is how it stayed dead across a release.
- **`lt05` and `card02@image` flip their overflow measurement between runs** — observed three
  times, twice recording a clip that the next run did not reproduce. Left OUT of the baseline
  deliberately, because a blanket `--update-baseline` absorbs exactly this and then nothing can
  ever see it again.
