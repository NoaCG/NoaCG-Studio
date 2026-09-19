ss08, ss09, card52 

Phase 3's taxonomy deliverable (docs/noacg-master-goals.md): the 60 live-program formats in
`live_format_graphics_needs.xlsx` (repo root, untracked) each map to exactly one **pack** — a
curated subset of graphic types in a fitting style family. The machine-readable half of this
document is **`src/templates/packs.ts`**; `scripts/factory.mjs` validates the two against the
live registry on every run, so this mapping cannot silently rot.

**A pack is pure config.** Across the four PRODUCTION families the type × family matrix is full
(docs/GRAPHIC_TYPES.md §6), so every `(type, family)` cell a pack reaches for already names a
shipped, gate-checked design — declaring a pack is one entry in `PACKS`, no new template work.

**Four families, not six** — and as of 2026-08-08 the four are FULL: every registered type ships a
design in `noacg`, `minimal`, `sport` and `glass`, so all 21 packs resolve in all four looks
(`KIT_MATRIX_GAPS.md` §6 has the before/after). `editorial` and `cinematic` cover 6 and 5 types
and stay BROWSE families rather than KIT ones — real style families with their own designs,
tokens and Browse chips, but filling them for kits would mean ~118 designs each to serve a look
no pack declares. A surface that re-resolves a pack in another look must still MEASURE which
families work (`familiesFor`, `src/components/wizard/steps/KitPicker.tsx`) rather than assume:
the `validatePacks` cell gate only tests a pack's own declared family, which is exactly how the
gate stayed green through the years the other three were incomplete. That is the "catalog growth
is a config change" half of Phase 3's done-when, made true for the axis it is true on:

- **A new pack = config.** Add the entry; the factory proves it resolves and that the format
  mapping stays exactly-once.
- **A new THEME ≠ config, deliberately.** A fifth family needs a `FAMILY_TOKENS` row, one design
  per type (nineteen of them now, each through the six gates), and the wizard's family chip. The matrix
  fill measured that real cost at ~30 designed variants per two families; pretending a theme is
  a config knob would just move that work somewhere unreviewed. `validatePacks` fails a pack
  pointing at an unfilled family, which keeps the claim honest.
- **The pack's family is a default, not a constraint.** Any pack resolves in any of the four
  families — the family field is the curated taste pick a non-technical user starts from.

### A kit gets a coherent default look (decided 2026-08-08)

> **A kit gets a coherent default look, and "look" means the whole system: palette AND typography,
> spacing, shape, layout language, image treatment and motion. These are DEFAULTS, never locks —
> the user still customises afterwards, exactly as they do today.**

Binding, and not yet true of what ships. Three measured gaps between the decision and the code
(`CATALOG_VARIETY.md` §6):

- **19 of 21 packs declare no `paletteId`**, so a kit arrives in each design's own default — one
  of the four (family, palette, typeface) triples that cover 75% of the catalog.
- **A look is not a palette.** `TemplatePack.paletteId` repaints and nothing else; type, spacing,
  shape language, image treatment and motion have no per-kit carrier at all. Whatever grows one
  has to reach all seven, which is the same widening of `FAMILY_TOKENS` that a new design
  DIRECTION needs (`CATALOG_VARIETY.md` §4.2).
- **30% of declared extras are already off-family** (36 of 121): an `extras` entry is a fixed
  variant id and does not follow the family the kit was built in. A kit whose look is a promise
  therefore declares TYPES, and covers its roles with types only — which is what the core-six gate
  already requires, for the same reason.

**"Defaults, never locks" is the load-bearing half.** Every value stays a `:root` token the Style
panel writes, per-graphic customisation in the wizard is unchanged, and the tray's "use this look
for the rest" keeps applying to whatever the user has actually chosen.

### The wizard surface (built; the shape changed once)

A pack's SHAPE was first decided as **a "start from a kit" ENTRY CARD, not a third mode inside
Browse** (`TEMPLATE_TAXONOMY_PROPOSAL.md` §18, 2026-07-23, built 2026-07-29) - Browse produces
one graphic, a kit produces several, and a surface promising a single pick must not deliver
something else.

**That is reversed as of 2026-08-08: there is ONE door, and the outcome is a question inside
it.** The Browse step opens with a segmented control - ONE GRAPHIC or A WHOLE KIT - and the
answer swaps the step's body between the design grid and the KIT PICKER
(`src/components/wizard/steps/KitPicker.tsx`). The old decision's premise still holds; what it
got wrong was where the honesty has to live. A card on the front page has to be understood
BEFORE it is pressed, so a user who did not already know the word "kit" never found the set,
and a user who guessed wrong walked back to Entry to change their mind. A switch at the top of
the step it governs states the same fact at the moment it matters and costs one click to undo.

The picker is TWO moves, in this order because the second is an edit of the first: pick the
GENRE PRESET (the pack), then edit the set with checkboxes over `kitChoices` - the pack's own
contents plus every other type whose (type x family) cell resolves.

**The step's ONE search box works on both sides of the switch**, and what it searches follows
the answer: designs on the one-graphic side, and on the kit side the SHOWS plus the graphics a
kit can hold. That is the half of "the grid and the search stay visible either way" worth
having - twenty-one shows and about fifty addable graphics is exactly the list a search box
exists for, while the facets beside it are questions about ONE design (a field count, a style
family) and stand down. It is a plain normalized substring, deliberately not the
`templates/search.ts` engine: a show matches on its name, its description and the reference
FORMATS it serves, so "wedding" finds Church & Ceremony; a row matches on the design's name and
on its graphic TYPE, so "ticker" finds the minimal ticker design called Wire Rotator. Two rules
keep it honest: filtering hides rows but never unticks them, so the count on screen stays the
whole SELECTION and the panel says how many of the kit it is not listing; and a query matching
no show says so and offers to clear itself rather than showing an empty grid. From there a kit walks the
SAME six wizard steps a single graphic does, over the whole set, with two additions of its own:
the KIT TRAY (which graphic of the set - the second axis of progress, the step rail being the
first) and the LOOK QUESTION after the first graphic ("use this look for the other N?"), whose
"yes" is a deterministic transform over the `:root` style contract and nothing else
(`src/components/wizard/kitPlan.ts` `kitLookPatch`).
**Declining it is not a one-way door.** The question renders only while the answer is
undecided, which made "no" permanent: on the 36-graphic Esports kit - the flagship, and a
realistic first pick - one click committed the user to a hundred-odd steps with no way back.
The tray therefore carries **"Use this look for the rest (N)"** for as long as unbuilt graphics
remain after the one in hand. It is an ACTION always on offer rather than the question asked
again (the user declined a blanket propagation; re-asking each graphic would be nagging for a
different answer), it lives on the tray because it is about the SET, and everything already
configured by hand is KEPT - `buildRemaining` never rebuilds a graphic that already has one. It ends on a Finish that names a
PRODUCTION, shows every built graphic, and saves the whole set before either of its two doors -
open the production, or export the kit as one package, with the editor never involved.
Pinned by `e2e/wizard-kit.spec.ts`.

## The twelve packs

| Pack | Family | Types (curated order) | Extras |
|---|---|---|---|
| Match Day | sport | scorebug, match-board, match-status, match-event, fixtures, scoreboard, countdown, lower-third, ticker, sponsor-bug, title-card, holding-screen, now-next, notice-card, event-bug, live-bug, sponsor-strip, status-chip, roster, standings, winner-card | ls06, ls07, ls08, ls09, ls10, tk13, al10, vs01, cr03, ss11, cr12 |
| Esports | sport | title-card, holding-screen, countdown, now-next, agenda, notice-card, station-bug, live-bug, event-bug, status-chip, lower-third, social-bug, sponsor-bug, sponsor-strip, sponsor-rotator, transition, matchup, head-to-head, player-card, roster, esports-score, map-round, match-event, match-status, fixtures, standings, bracket, ticker, scoreboard, winner-card | mr04, ls11, ls06, ls13, tk13, cr12 |
| Creator | noacg | holding-screen, lower-third, topic-card, social-bug, sponsor-bug, countdown, poll, now-next, process-steps, station-bug, live-bug, logo-bug, chat-highlight, live-poll, viewer-question | ls03, ls31, ls32, al07, al10, ss06, ss08, ss09, ss12 |
| Newsroom | minimal | lower-third, ticker, topic-card, title-card, agenda, sponsor-bug, headline-card, key-facts, notice-card, station-bug, live-bug, status-chip, **alert-level**, **public-notice** | ls01, ls23, ls28, ls21, ls17, tk11, tk12, tk14, tk15, tk16, tk17, tk04, tk18, al09, pi02, pi03, ss08, card52 |
| Election | minimal | poll, lower-third, ticker, title-card, agenda, countdown, headline-card, key-facts, status-chip, live-bug, live-poll, **public-notice** | ls20, ls21, ls22, ls23, tk15, pi01, pi05, pi07, card52, cr05 |
| Talk Show | glass | lower-third, topic-card, poll, agenda, social-bug, sponsor-bug, countdown, key-facts, recap-card, station-bug, sponsor-rotator, viewer-question, qa-card, chat-highlight, question-queue, live-poll | ls02, ls04, ls24, ls25, card19, card35, ss07, ss12 |
| Corporate Events | minimal | agenda, lower-third, countdown, title-card, topic-card, poll, holding-screen, now-next, process-steps, recap-card, key-facts, event-bug, sponsor-strip, question-queue, qa-card, viewer-question, live-poll | ls17, ls18, ls19, ls24, al07, al08, pi04, pi06, ss13, cr05, cr07, cr09 |
| Classroom | noacg | quiz-board, countdown, lower-third, topic-card, agenda, scoreboard, process-steps, key-facts, recap-card, logo-bug, verdict-card, standings, answer-board-2, answer-board-3, live-poll, viewer-question | ls17, ls18, cr01, card58, ss13 |
| Church & Ceremony | minimal | title-card, lower-third, topic-card, holding-screen, countdown, agenda, statement-card, logo-bug, event-bug, community-request, viewer-question, question-queue | ls14, ls15, ls16, pi07, cr01, cr05, cr11, ss07, ss10, card50, card51, card54, card55, card57 |
| Stage & Music | glass | title-card, lower-third, holding-screen, countdown, social-bug, agenda, ticker, now-next, statement-card, notice-card, award-bug, event-bug | ls04, ls25, ls26, ls27, al10, cr02, cr09, cr12, ss07, ss11, card56 |
| Shopping | noacg | topic-card, countdown, lower-third, ticker, title-card, sponsor-bug, key-facts, sponsor-strip, sponsor-rotator | pi04, ss06, ss12, cr12 |
| Wellness | minimal | countdown, holding-screen, topic-card, lower-third, social-bug, process-steps, logo-bug | pi04, pi06, ss08, ss09, card52 |

### The core six — what makes a kit a kit

Every kit ships six graphics regardless of genre, and its genre add-ons on top of them: a lower
third, an opener or topic card, an info or bullet card, a ticker or bug, a countdown or holding
card, and a closing card. A kit does not need every category in the catalog; it needs to be
complete enough to RUN A SHOW.

**`validatePacks` enforces it** (`CORE_SIX` in `src/templates/packs.ts`, so the factory fails the
build on a kit that cannot run a show). Only TYPES satisfy a role, never `extras`: a type resolves
per family and therefore follows the look the kit was built in, while an extra is a fixed variant
id carrying its own. Mutation-tested when it landed - take one kit's closing card away and the
gate names it.

Measured against that bar 2026-08-08 (**`KIT_MATRIX_GAPS.md`**, the standing gap report), the nine
DISCIPLINE packs failed it — all nine were pure match furniture with no opener, no card that puts
a sentence on screen and no way to end. That was a declaration fault, not missing designs: every
type they needed already resolves in all four production families, so `title-card` and `key-facts`
joined all nine (and the countdown and hold joined Racket Sports, whose normal state is a break).
Newsroom and Talk Show still have no closing card, and that one IS a catalog gap — see below.

**The closing card became a real type the same day** (`sign-off`, `ss14`-`ss17`), and every kit
declares it. It had been answered by the `end-credits` extras and by `ss09` "Thanks for Watching",
which is not good enough for a core-six member: an extra carries its OWN look, because it is a
fixed variant id, so it does not follow the family the kit was built in and `paletteId` repaints
its palette but not its shape language. That is why frames enter a kit only where the frame's own family already matches
the pack's (Creator `fr01`, Esports `fr03`, Talk Show `fr02`, Corporate `fr04`) — a frame cannot
be a type at all, because its field count follows its camera count.

### Kit look unification (`TemplatePack.paletteId`)

A pack may declare a palette id, and the kit create path then builds EVERY graphic in the kit
with that palette imposed - the same `variant.create({ palette })` a wizard palette pick uses.
This is what makes a kit's graphics read as one package out of the box: measured 2026-08-04,
the newsroom kit's 32 graphics otherwise arrived in four different accent palettes (each
design's own default) and the talk-show kit's 24 in four. Newsroom declares `ivory`, Talk Show
declares `frost`. A pack WITHOUT a palette id keeps every design's own defaults - the Esports
kit relies on that, because its specialists' Volt look is authored into the designs themselves
(below). Curation rule the newsroom kit taught: an extra must not name a design a pack's TYPE
already resolves to in its family - the production pool is name-keyed, so the duplicate would
silently merge (`tk10` Wire Rotator was the case; the ticker type already resolves to it in
minimal). Both rules are pinned in e2e/wizard-kit.spec.ts.

### The complete Esports tournament package

The Esports kit is intentionally larger than a competition-only collection. Its 36 graphics
cover the whole tournament rundown in one Volt look: opener and holds, running order, persistent
identity and status marks, player and caster straps, sponsor placements, a self-clearing cut
transition, pre-match comparison and map veto, live series and map operation, match events,
fixtures, standings, bracket, results rail, score board and champion reveal.

`map-round` still resolves to `mr01` Map Ladder for live coverage. `mr04` Map Veto is an extra,
because a production needs both jobs and they share the same cursor-driven operator structure
without duplicating it. The specialist lower thirds are likewise extras because tag-before-handle,
two-person commentary and a two-person analysis desk are genuinely different field shapes from the
ordinary lower third. Their defaults, plus the results and sponsor rails, use Volt and Oswald so
the one-click default kit reads as a single package before a user applies their own project brand.

The title/topic/information pack's seven types, the identity family's eight and the competition
pack's twelve (docs/GRAPHIC_TYPES.md §6) all joined the kits that were standing in for them: the
newsroom gets a real headline card and a public notice instead of a topic card carrying a
paragraph, corporate and classroom get the process/checklist and the recap, church and stage get
the bilingual statement, now/next lands wherever a programme runs to a schedule, match day and
esports get real rosters, standings, brackets and winner cards, and every pack picks up the
persistent marks it actually leaves on screen. No format's mapping moved — the packs describe
the same 60 formats with graphics that fit them better. The audience pack's eight joined the same
way, and the holding / credits / ceremony set ships as EXTRAS rather than types (see below).

## The nine DISCIPLINE packs (docs/SPORTS_PACK.md)

| Pack | Family | Shape it is cut for |
|---|---|---|
| Football | sport | count-up clock, subs and cards, the table, the weekend results |
| Ice Hockey | sport | period clock counting down, penalties, the period breakdown |
| Basketball | sport | quarter clock, the quarter-by-quarter board, team stats |
| Handball | glass | half clock, two-minute suspensions, the group table |
| Racket Sports | glass | set-by-set scoring (the stacked match board), the head-to-head |
| Motorsport | sport | the timing tower as a table, championship standings, session results |
| Athletics | glass | start lists, heat results, the medal table |
| Combat Sports | glass | round clock, the fight card, the tale of the tape, the decision |
| Club & School Sports | minimal | full club names, no crests needed, nothing that costs bitrate |

### The Quiz Show kit, and the three looks it lives in

| Pack | Family | Types (curated order) |
|---|---|---|
| Quiz Show | sticker (also showtime, arcade) | title-card, lower-third, quiz-show, duel-score, countdown, key-facts, logo-bug, sign-off |

The twenty-second pack, and the only one that resolves OUTSIDE the four production families. It
is a two-player game show in one look: the opener, the strap, the quiz board whose answer count
is a field, the running score, an answer clock, a how-to-play card, the show mark and the closing
card. `quiz-show` and `duel-score` ship designs only in `sticker`, `showtime` and `arcade`, so
those are the three looks the kit picker offers for it, and it offers them for no other pack.

It declares no `paletteId`: a pack palette is imposed on every graphic, and these three families'
palettes share nothing, so each design keeps its own default. And like the discipline packs it
claims no reference format. The sheet's "Quiz / game show livestream" row is Classroom's.

**A discipline pack declares NO reference formats, and that is the taxonomy point.** The sheet
counts FORMATS, and it has one row for "Sports broadcast / match coverage" and one for "Local
sports / amateur sports" — both owned by Match Day. A tennis kit is not a new format; it is the
same format cut for a sport that keeps score in sets and counts its clock the other way.
Claiming a format twice is an error `validatePacks` catches, and inventing rows the sheet does
not have would make its count meaningless. So the exactly-once mapping below is unchanged by
all nine.

This is also the first time the taxonomy has had two AXES: a pack can refine a format's kit
without owning the format. If more disciplines follow (cricket, rugby, cycling), they go here
the same way — config only, no new template work, because the matrix is full across the four
production families a pack can actually be declared in (above).

**Extras** are catalog variants outside the type registry that belong in the kit: the versus
card (vs01/vs02) for match-up reveals — also the sports pack's upcoming-match hero — and the
whole HOLDING / CREDITS / CEREMONY set: the
holding screens (ss05-ss13 - countdowns to a start time, breaks, technical pauses, sign-offs),
the list formats (cr05-cr12 - schedule boards, looping reels, thank-you and donor walls,
sponsor boards and crawls, ceremony rolls), and the set-piece cards (card50-card58 - readings,
lyrics, quotations, translations, orders of service, award, graduate, wedding and memorial).
They ship without a state machine beyond the derived one, which is correct for what they are.

The SPECIALIST lower thirds (ls01-ls40) join the same way, and they are the extras a kit is
most likely to be opened for: a strap drawn for ONE production rather than for any show. The
`lower-third` TYPE stays in every pack that had it - it is the general strap, and it is what a
non-technical user should still land on first - so these sit beside it as the graphic that
already knows the format's convention. The mapping is by production context, not by style
family: the athlete and commentary straps to Match Day, tag-and-handle identities to Esports,
the worship set to Church & Ceremony, the party-colour straps to Election, the billing straps
to Stage & Music, the speaker credits to Corporate Events and Classroom, and the newsroom's
analysis kicker, live flag, dateline and other-city clock to Newsroom. Two of them close a
stand-in the mapping below records: ls25 "Now Playing" is the graphic the radio-with-video row
had been borrowing a topic card for, and ls30 "World Clock" is what a market show cutting
between exchanges needs instead of a time somebody typed.

A strap can serve more than one pack (extras are not exclusive the way FORMATS are - `card52`
and `cr05` already were): ls24 "Expert Panel" is a newsroom explainer, a long-form panel credit
and a medical/legal webinar's credit, so it is in all three. **Shopping and Wellness get no
specialist strap, deliberately** - a selling host and a fitness instructor are named by an
ordinary lower third, and forcing one in would only make those kits harder to read.

The PUBLIC-SERVICE pack (docs/PUBLIC_SERVICE_PACK.md) joined next, and unlike the straps it
brought TWO TYPES as well as extras - the follow-up that document's §11 deliberately left open,
because adding a type changes what an existing pack ships:

- **`alert-level` -> Newsroom only.** The four-level severity ladder is what an emergency
  broadcast IS, and Newsroom owns "Emergency information stream", "Weather broadcast" and
  "Security / surveillance-style public stream". Its designs fill all four families, so any
  pack COULD take it; none of the others has a format that earns it.
- **`public-notice` -> Newsroom and Election.** The two-language rotator, in the two registers
  where carrying a notice in both languages is an obligation rather than a courtesy. Note the
  hard limit: `public-notice` ships only a minimal (pi09) and a noacg (pi08) design, so a
  glass or sport pack listing it would fail `validatePacks` on an empty matrix cell - which is
  the check doing exactly its job.

Three of the notes in the mapping below are now out of date in the right direction, and are
corrected there: the emergency stream's multilingual cards ARE a type now, the market show has
a real market ticker, and the council's bilingual notices have a graphic. Two kits that had no
extras from the straps round got real ones here - Shopping takes the disclaimer strip (price
and affiliate small print is a legal obligation on a selling stream) and Wellness takes it
alongside the health advisory, whose helpline sits in its own high-contrast band.

The four alerts with no machine (al07-al10) spread widest, because an unplanned fault is not a
format: the technical notice and the standby card go to the productions that run longest with
the fewest hands - Esports, Creator, Corporate - and the standby card also to Match Day (a rain
delay) and Stage (a delayed set), where it says something a planned intermission screen cannot.

Family picks, briefly: sport carries both competitive packs; noacg (the house on-air look) goes
to the streamer-native packs where its amber control-room voice reads natively; glass suits the
premium conversational/stage registers; minimal serves every context where the graphics must
defer to the content (news, civic, corporate, worship, wellness). All taste — swappable per
project, and reviewable without touching the mapping below.

## The mapping — all 60 formats

Format names verbatim from the sheet. Notes only where the assignment was a judgement call.

| # | Format | Pack | Note |
|---|---|---|---|
| 1 | Sports broadcast / match coverage | Match Day | |
| 2 | Esports tournament | Esports | |
| 3 | Gaming livestream | Creator | |
| 4 | Just Chatting / personality stream | Creator | |
| 5 | News / current affairs livestream | Newsroom | |
| 6 | Live commerce / shopping stream | Shopping | |
| 7 | Talk show / panel discussion | Talk Show | |
| 8 | Podcast livestream / videocast | Talk Show | |
| 9 | Webinar / expert presentation | Corporate Events | |
| 10 | Conference / seminar stream | Corporate Events | |
| 11 | Corporate town hall / internal broadcast | Corporate Events | |
| 12 | Education / lecture livestream | Classroom | |
| 13 | Music performance / concert livestream | Stage & Music | |
| 14 | Award show / gala | Stage & Music | nominee/winner reveals are a gap (below) |
| 15 | Election night / results program | Election | result bars = the poll type; maps/seat counts are a gap |
| 16 | Weather broadcast / climate update | Newsroom | forecast panels/maps are a gap; the strap/ticker/card core is Newsroom's, and the warning itself is now the `alert-level` type (al05) |
| 17 | Religious service / church livestream | Church & Ceremony | |
| 18 | Fitness / workout class | Wellness | interval timer = countdown; round counters ride its fields |
| 19 | Live Q&A / AMA | Talk Show | |
| 20 | Product launch / keynote | Corporate Events | |
| 21 | Charity telethon / fundraising stream | Creator | donation goal = the creator goal overlay pattern; totals bar is a gap |
| 22 | Remote interview show | Talk Show | |
| 23 | Magazine show / morning show | Talk Show | its ticker/weather inserts borrow from Newsroom |
| 24 | Cooking show / food livestream | Shopping | recipe/step cards + timers; secondary fit: Creator |
| 25 | Travel / IRL stream | Creator | |
| 26 | Watch party / reaction stream | Creator | |
| 27 | Debate / political discussion | Election | speaking timers = countdown; polls, topic cards |
| 28 | Student production / school TV | Classroom | end credits available via extras if wanted |
| 29 | Local sports / amateur sports | Match Day | |
| 30 | Theatre / live performance stream | Stage & Music | |
| 31 | DJ set / club stream | Stage & Music | |
| 32 | Radio-style livestream with video | Talk Show | now-playing card = topic card |
| 33 | Auction livestream | Shopping | lot/bid cards = topic card + countdown; live bid feed is a gap |
| 34 | Real estate / property livestream | Shopping | |
| 35 | Finance / market livestream | Newsroom | the market ticker IS the ticker type, and tk14 draws the delta with an arrow, a sign AND a colour rather than colour alone; charts/heatmaps are a gap |
| 36 | Tech support / coding livestream | Creator | |
| 37 | Art / design livestream | Creator | |
| 38 | Craft / maker livestream | Creator | |
| 39 | Tabletop RPG / board game stream | Creator | initiative/dice overlays are a gap |
| 40 | Quiz / game show livestream | Classroom | the quiz board's home format |
| 41 | Reality-style livestream / house stream | Creator | voting = poll |
| 42 | Security / surveillance-style public stream | Newsroom | label/timestamp/alert register — minimal's quiet voice |
| 43 | Animal cam / nature cam | Wellness | fact cards, calm register |
| 44 | Meditation / ambient livestream | Wellness | |
| 45 | Virtual event / metaverse event | Corporate Events | |
| 46 | Medical / health livestream | Corporate Events | disclaimer/source labels ride lower-third + topic-card fields |
| 47 | Legal / public information livestream | Corporate Events | |
| 48 | Municipal council / public meeting | Election | agenda items, speaking timer, vote result = poll; the notices themselves are pi01/pi05 and the bilingual obligation is pi07 + the `public-notice` rotator |
| 49 | Press conference | Newsroom | |
| 50 | Emergency information stream | Newsroom | the alert banner IS a type now (`alert-level`, four real severity states), and the multilingual card became one too (`public-notice`) - this row's original "cards are fields, not new types" was right until the graphics earned otherwise |
| 51 | Behind-the-scenes production stream | Corporate Events | schedule/labels register |
| 52 | Red carpet / premiere stream | Stage & Music | |
| 53 | Fashion show livestream | Stage & Music | |
| 54 | Beauty / makeup livestream | Shopping | product/shade cards, affiliate CTA |
| 55 | Book launch / author event | Talk Show | interview register; quote/excerpt = topic card |
| 56 | Academic conference livestream | Corporate Events | |
| 57 | Graduation / ceremony stream | Church & Ceremony | |
| 58 | Wedding / private event livestream | Church & Ceremony | |
| 59 | Funeral / memorial livestream | Church & Ceremony | |
| 60 | Hybrid workshop / training session | Corporate Events | |

## What the sheet asks for that no type covers (the gap list)

Recorded so the next type is chosen by evidence, not vibes — the same way the first twelve
were. Roughly by how many formats ask.

### Closed

Eight of the gaps below now ship, as eight types and two new categories (25 designs). Each
kept the rule the first twelve were built on — *persist a machine only when the derived one is
wrong* — so only the transition declares one.

- **Goal / progress bar** → the **goal-meter** type (`ig22` House Goal, `ig23` Frost Goal).
  Two numbers and everything else derived: the share, the grouped figures, the caption. The
  bar and the ring are one type because they differ only in where the derived share is drawn.
  A second measured builder (`infographicGoalRing`) and its `goal-ring` preset exist because a
  goal ring's angle and its counted figure are DIFFERENT numbers — reusing the poll board's
  `ring-fill` would draw a full ring at 3 % raised. `ig05` Rising Total stays a hand-written
  variant: it predates the type and has no unit field.
- **Milestones / tiers** → the **milestone-track** type (`ig24`, `ig25`), the goal meter's
  sibling question ("which tiers have we passed"). Nodes are spaced EVENLY and the line is
  interpolated between them, never plotted at current/max — see `infographics/dataRuntimes.ts`.
- **Frames** → a new **`frame` category** (`fr01`–`fr04`: webcam, two-up interview, split
  screen, screen-share + presenter inset). Chrome around a HOLE rather than a box holding its
  own content, so the interiors stay transparent and every design states its window rectangles
  in design pixels in its own header. It is a category and **not** a type: a frame's field
  count follows its camera count (2, 3 or 4 lines), and `GraphicType` declares one field list —
  see "Known limitations" below.
- **Replay wipes / stingers** → a new **`transition` category** (`tr01`–`tr04`) and the
  **transition** type, the first graphic whose whole content is its LIFECYCLE. Its entrance
  COVERS the frame and holds there (that hold is the cut point); a `timer` arrow from the
  entrance waypoint straight to the exit clears it, with `next` as the manual version. Nothing
  in it uses `setTimeout` — a timer inside a template is motion the timeline cannot see, the
  control page cannot pause and the render clock cannot drive.
- **QR code** → the **qr-card** type (`card44`, `card45`). Honest field model, NOT generation:
  NoaCG bundles no encoder and generated templates take no runtime dependency, so the code is
  an SPX image field the operator points at their own PNG, and the address beside it is real
  text (which is also what makes the card work for a viewer who cannot scan). The white tile
  and its padding are a scannability requirement, not styling. A bundled encoder remains a real
  option and is recorded as open below.
- **CTAs** (follow / donate / register / buy) → the **call-to-action** type (`lt55`–`lt57`).
  The verb is a FIELD, which is what stops this being four near-identical designs.
- **Commerce cards** → the **product-card** (`card38`, `card39`), **offer-card** (`card40`,
  `card41`) and **listing-card** (`card42`, `card43`) types. The listing card is one graphic
  for the auction lot, the property walk-through and the stock counter, because the only thing
  that differs is the value's LABEL — so the label is a field.
- **Sponsor / logo strips** → `card48` House Sponsors and `card49` Clean Partners
  (hand-written; see below for why they are not a type). Neither ROTATES, deliberately: the
  ticker type is the one that cycles and it earns it with a real machine, a timer armed at the
  end of a finite entrance, and a pause/resume an operator can reach. A CSS keyframe loop
  swapping slot opacity would be none of those.
- **Location / travel cards** → `card46` Frost Location and `card47` Volt Location
  (hand-written). The pin is a DRAWN MARKER: there is no map surface, no tiles and no
  projection anywhere in the product, so nothing here plots a coordinate — the picture is an
  image field the operator chooses and the coordinates are text they type.

### Still open

- **Data charts / maps** (weather, election maps, finance charts, heatmaps) — a real data-viz
  surface, out of scope for the current model; revisit with external data feeds (master goals
  §1.5). The location cards above deliberately do NOT approach this.
- **Chat / alert overlays** — ~~show-chat territory more than template territory~~ **SHIPPED**
  as the `chat-highlight` type (src/templates/audience). The product decision it was waiting on
  turned out to be a false choice: the graphic never needed a chat integration, because the
  operator types the comment, the handle and the SOURCE (plain text, never a platform logo) into
  ordinary fields. It self-dismisses on a real timer and can be held on air. Follower/donation
  ALERTS are still open — they are event-driven, which is the feed problem below.
- ~~**Reveal moments** (winner reveal, nominee cards, before/after)~~ — **CLOSED** by the
  competition pack (docs/COMPETITION_PACK.md): `nominee-reveal`, `winner-card`, `award-reveal`
  and `verdict-card` generalize the quiz board's reveal machinery, exactly as predicted here.
  Two more instances shipped with the audience pack — the `qa-card`'s answer and the
  `live-poll`'s winner call.
- **Audience questions and votes** — **SHIPPED** as the audience pack: `viewer-question`,
  `qa-card`, `chat-highlight`, `question-queue`, `community-request`, `live-poll`, and the two-
  and three-answer boards beside the existing four-answer one. They joined the `creator`,
  `election`, `talk-show`, `corporate`, `classroom` and `church` packs, which is pure config —
  the matrix was already full for them the moment their designs landed.
- ~~**Lineups / brackets / leaderboards / stats panels** (sports & esports depth)~~ — **CLOSED**
  by the same pack: `roster`, `standings` (leaderboards and result tables are the same board
  with different columns), `bracket`, `head-to-head` and `player-card`, plus `esports-score`
  and `map-round` for the series itself.
- **Lyrics / captions / surtitles** — timed-text playout is a different runtime problem; out
  of scope until external feeds exist.
- **A bundled QR encoder** — the qr-card type covers the FORMAT with an image field. Generating
  the code from a URL field would need an encoder inlined into every export (non-negotiable 3
  forbids a CDN call at playout), which is a real, self-contained piece of work and a real size
  cost. Worth doing when the field model proves the demand.

None of these block a pack: every format's CORE need is covered by the shipped types, which is
what the mapping above records.

## Known limitations this round surfaced

- **A graphic type declares ONE field list, so a family whose field COUNT varies cannot be one
  type.** Three families in this pack are affected and stay hand-written variants (which the
  catalog has always allowed — `card04`, `vs01`, `ig01`–`ig07` are all in that class):
  - **camera frames** — 2 fields for a single camera, 3 for a screen share, 4 for a two-up;
  - **sponsor strips** — `card48` carries 4 slots, `card49` carries 6;
  - **location cards** — `card46` has a picture slot, `card47` has no room for one.
  Fixing it properly means letting a type declare OPTIONAL fields (and teaching the factory's
  fields gate to compare against a range), which is a change to the type contract and belongs
  in its own round rather than being bent around here.
- **An individual camera window is not a registry part.** A split design carries several
  `.frame-window` elements under one class so a single preset drives one camera or four, and
  `model/structure.ts` requires single-match selectors for identity. The root, the stage and
  every text line ARE parts, which is what the timeline and canvas need; addressing one window
  of four would need numbered selectors the way the quiz's answer rows have them.
- **The runtime bench measures little of a self-clearing graphic.** Its layout checks run at
  the settled state, and a transition has cleared itself by then (the bench accelerates GSAP
  20×, and the timer with it), so a transition passes the entrance, exit, replay and binding
  checks but its covered pose is measured only by the catalog render baseline. The entrance
  check itself was moved to poll BEFORE the settle wait so it asks the question while the
  entrance is playing — otherwise every self-clearing graphic reads as "never appeared".

## Keeping this true

- `scripts/factory.mjs` (dev server up) validates on every run: pack ids unique, every type id
  known, every `(type, family)` cell filled, every extra in the catalog, and the format list
  covering exactly `REFERENCE_FORMAT_COUNT` (60) with no double-mapping.
- Editing the sheet means updating `packs.ts` formats and this document together; the count
  assertion catches a drift in either direction.
- The pack lineup itself (names, family picks, which formats cluster) is a taste layer over a
  mechanical core — review it like a design, change it like config.

## Merging a pack branch that predates the taxonomy

Learned merging the pack backlog (2026-07-24: packs 10, 7, 9, 5 landed in that order).

**Recompute id collisions against CURRENT main, not against a handoff's snapshot.** The handoff
said only pack-5 collided on `card10-18`; by the time it merged, main had absorbed more packs and
pack-10 collided too (card10-21, ig14-17, lt19-21). For each pack, diff its added
`src/templates/**/idNN.ts` against its merge-base, then test each id with
`git cat-file -e main:<path>` - an add/add conflict means two DIFFERENT graphics share an id.

**Renumber on the branch FIRST, then merge main.** That turns a pile of add/add content conflicts
into a couple of list-file conflicts. Renumber with exact-token sed (`\bcardNN\b`) across the
template files, the category `index.ts`, the graphic-type files and the docs, then `git mv`. Pick
a target range disjoint from the source range so the ordering never chains. (Landed: pack-10
card10-21 -> 38-49, ig14-17 -> 22-25, lt19-21 -> 55-57; pack-5 card10-18 -> 50-58.)

**A pack predating the taxonomy fails the build on exactly three TOTAL Records** - `tsc` enforces
them, which is the design: `OLD_CATEGORY_FALLBACK` and `PRESET_MOTION` in `src/model/taxonomy.ts`,
plus the pack's own entry.

**The append-union resolver DUPLICATES.** Resolving a list-file conflict by taking both sides
appends the same entry twice when the two branches added it independently; the build does not
always object. After any pack merge, check the category `index.ts` and the pack tables for repeated
ids before trusting a green gate.
