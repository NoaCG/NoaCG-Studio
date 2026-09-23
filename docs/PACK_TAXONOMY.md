Phase 3's taxonomy deliverable (docs/noacg-master-goals.md): the 60 live-program formats in
`live_format_graphics_needs.xlsx` (repo root, untracked) each map to exactly one **kit** (the code
calls it a pack) - a collection of graphics for one kind of production, in one Style. The
machine-readable half of this document is **`src/templates/packs.ts`**; `scripts/factory.mjs`
validates the two against the live registry on every run, so this mapping cannot silently rot.

**A kit is pure config.** Across the four PRODUCTION families (`noacg`, `minimal`, `sport`,
`glass`) the type x family matrix is full (docs/GRAPHIC_TYPES.md §6), so every `(type, family)`
cell a kit reaches for already names a shipped, gate-checked design. Declaring a kit is one entry
in `PACKS`, no new template work. `editorial` and `cinematic` stay BROWSE families: real style
families with their own designs and Browse chips, but no kit is built in them. The three game-show
families (`sticker`, `showtime`, `arcade`) cover exactly the eight quiz-show types, and each is a
quiz kit of its own.

- **A new kit = config.** Add the entry; the factory proves it resolves, that its starter can run
  a show, and that the format mapping stays exactly-once.
- **A new STYLE FAMILY ≠ config, deliberately.** It needs a `FAMILY_TOKENS` row and one design
  per type, each through the six gates. `validatePacks` fails a kit pointing at an unfilled cell.

### Kit consolidation: 12 kits, one Style each, about ten graphics (decided 2026-09-23)

The owner's brief: simplify "Start from a template". A kit is a collection of graphics for a type
of production; each kit has ONE default Style, and there is no Style dropdown in kit selection;
aim for about ten kits with production names, keeping the strongest quiz looks as kits of their
own; a kit may hold a large library but only about ten graphics are selected by default; editing
is not linear.

What that replaced, and why:

- **22 kits in four looks each.** Nine of the 22 were sports DISCIPLINE packs (Football, Ice
  Hockey, Basketball, Handball, Racket Sports, Motorsport, Athletics, Combat Sports, Club & School
  Sports): the same match types cut for one sport's habits. Those habits - clock direction,
  periods or sets - are FIELDS of the types, so one Sports kit carries all of them, with the
  timing tower in its library for racing. Shopping and Wellness were one person on camera running
  their own stream, so they merged into Creator Stream (the commerce cards and the health
  advisory are in its library). Classroom's lecture and training furniture is a conference's, so
  it merged into Corporate Event with its quiz and answer boards in the library.
- **The Look select made every kit four kits** by re-resolving it in another family. Now the
  family IS the kit's Style. Restyling happens on the Style step: per graphic, or across the kit
  with "Apply this Style to all". **What is lost:** building a kit in another family's DESIGNS
  (a glass Sports kit). The owner can revert this from git; nothing persisted a kit's family, so
  restoring it touches config and the picker only.
- **Visual variety** comes from the kits themselves: no two share both a family and a palette,
  and each kit card's COVER is its signature graphic (the starter's first) in its own Style.

**The palette rule measured on the way:** a light-paper palette (Porcelain, Broadsheet) is wrong
for a kit, because most minimal and glass cards set their type straight over the picture and dark
ink there disappears. Corporate Event's hub was mostly invisible in Porcelain; both it and Worship
& Ceremony use Mint instead, in different families.

### A kit gets a coherent default look (decided 2026-08-08)

> **A kit gets a coherent default look, and "look" means the whole system: palette AND typography,
> spacing, shape, layout language, image treatment and motion. These are DEFAULTS, never locks —
> the user still customises afterwards, exactly as they do today.**

With one family per kit this is now true of the SHAPE language: a kit's types all resolve in its
own family, whose `FAMILY_TOKENS` carry type, spacing, shape, image treatment and motion. The
palette is `TemplatePack.paletteId`, imposed on every kit graphic it is drawn for
(`kitPaletteFor`, src/components/wizard/kitPlan.ts): an off-family EXTRA keeps its own default,
because a palette is tagged for the families it reads in (`Palette.styleTags`).

**"Defaults, never locks" is the load-bearing half.** Every value stays a `:root` token the Style
panel writes, per-graphic customisation in the wizard is unchanged, and "Apply this Style to all"
applies whatever the user has actually chosen.

### The wizard surface: build the set, then edit any graphic (rebuilt 2026-09-23)

A kit's SHAPE was first decided as a "start from a kit" ENTRY CARD (`TEMPLATE_TAXONOMY_PROPOSAL.md`
§18, 2026-07-23). **That was reversed on 2026-08-08: there is ONE door, and the outcome is a
question inside it.** The Browse step opens with a segmented control - ONE GRAPHIC or A WHOLE KIT -
and the answer swaps the step's body between the design grid and the KIT PICKER
(`src/components/wizard/steps/KitPicker.tsx`).

The picker is TWO moves: pick the KIT, then edit the set with checkboxes. The kit's STARTER
(`TemplatePack.starter`, about ten) arrives ticked under "In the kit"; the rest of its library is
under "More for <kit>"; every other type that resolves in the kit's Style is behind a closed "Any
other graphic" disclosure. Sections are fixed by membership, never by the tick, so a card does not
jump when ticked. **The step's ONE search box works on both sides of the switch** (a plain
normalized substring, not the `templates/search.ts` engine): a kit matches on its name, its
description and the reference FORMATS it serves, so "wedding" finds Worship & Ceremony; a row
matches on the design's name and on its graphic TYPE. Filtering hides rows but never unticks them,
and a query matching no kit says so and offers to clear itself.

**Next BUILDS THE WHOLE SET** (`buildKit`, kitPlan.ts) and lands on the kit's Finish step, which is
its HUB: every graphic, built and rendered side by side, each one click from editing, the way back
to the contents ("Add or remove graphics"), and the production doors. Editing is not a walk:

- the ordinary Fields/Style/Animation steps edit whichever graphic is open;
- the KIT TRAY above them jumps to any other graphic on the SAME step, so comparing two graphics'
  Style is one click each way;
- every graphic keeps its own draft (`KitPlan.drafts`), so leaving one and coming back is lossless;
- Back from Fields and Done from Animation return to the hub;
- **"Apply this Style to all"** (on the tray) asks once through `WizardConfirm`, then carries the
  open graphic's Style to every other graphic through `kitLookPatch` - a deterministic transform
  over the `:root` contract, text and placement kept. It is a one-off, not a lock: any graphic can
  still be restyled on its own afterwards, and a graphic ADDED later arrives in that Style;
- changing the contents keeps every edited graphic still in the set (`reconcileKit`); switching to
  another kit over an edited one asks first.

It ends on the hub's two doors - open the production, or export the kit as one package - each of
which saves the whole set first, with the editor never involved. Pinned by `e2e/wizard-kit.spec.ts`.

## The twelve kits

| Kit | Style (family / palette) | Starter (the first is the cover) | Library adds |
|---|---|---|---|
| Sports | sport / royal | lower-third, scorebug, title-card, match-event, fixtures, standings, countdown, sponsor-bug, key-facts, sign-off | match-status, match-board, roster, scoreboard, timing-tower, holding-screen, now-next, agenda, notice-card, event-bug, live-bug, sponsor-strip, status-chip, ticker, winner-card; extras ls06-ls10, tk13, al10, vs01, vs02, cr03, ss11, cr12 |
| Esports | sport / (Volt, authored) | matchup, title-card, holding-screen, lower-third, esports-score, map-round, standings, notice-card, sponsor-bug, sign-off | the rest of the 31-type tournament package; extras mr04, ls11, ls06, ls13, fr03, tk13, cr12 |
| Talk Show | glass / frost | lower-third, topic-card, viewer-question, qa-card, poll, key-facts, countdown, station-bug, social-bug, sign-off | agenda, sponsor-bug, recap-card, sponsor-rotator, chat-highlight, question-queue, live-poll; extras ls02, ls04, ls24, ls25, fr02, card19, card35, ss07, ss12 |
| Newsroom | minimal / ivory | headline-card, title-card, lower-third, ticker, key-facts, live-bug, station-bug, alert-level, holding-screen, sign-off | topic-card, agenda, sponsor-bug, notice-card, status-chip, public-notice; 18 extras (straps, crawls, alerts) |
| Election | minimal / signal | poll, title-card, lower-third, live-poll, ticker, headline-card, key-facts, countdown, live-bug, sign-off | agenda, status-chip, public-notice; extras ls20-ls23, tk15, pi01, pi05, pi07, card52, cr05 |
| Corporate Event | minimal / mint | agenda, title-card, lower-third, topic-card, key-facts, now-next, countdown, event-bug, qa-card, sign-off | poll, holding-screen, process-steps, recap-card, sponsor-strip, logo-bug, question-queue, viewer-question, live-poll, qr-card, quiz-board, answer-board-2/3, verdict-card, scoreboard, standings; 18 extras |
| Creator Stream | noacg / noacg | holding-screen, lower-third, topic-card, process-steps, social-bug, event-notification, chat-highlight, live-poll, countdown, sign-off | the streamer set plus the commerce cards (product, offer, listing, qr, call-to-action, sponsor strip/rotator) and goal/milestone trackers; 14 extras |
| Stage & Awards | glass / orchid | nominee-reveal, title-card, lower-third, holding-screen, countdown, now-next, statement-card, award-reveal, event-bug, sign-off | social-bug, agenda, ticker, notice-card, award-bug; 11 extras |
| Worship & Ceremony | glass / mint | statement-card, title-card, lower-third, topic-card, agenda, countdown, holding-screen, logo-bug, sign-off | event-bug, community-request, viewer-question, question-queue; 14 extras |
| Sticker Quiz | sticker | quiz-show, title-card, lower-third, duel-score, countdown, key-facts, logo-bug, sign-off | - |
| Showtime Quiz | showtime | the same eight | - |
| Arcade Quiz | arcade | the same eight | - |

### The core six - what makes a starter able to run a show

Every kit's STARTER ships six graphics regardless of genre, and its genre graphics on top of them:
a lower third, an opener or topic card, an info or bullet card, a ticker or bug, a countdown or
holding card, and a closing card. A kit does not need every category in the catalog; the set a
user gets by default needs to be complete enough to RUN A SHOW.

**`validatePacks` enforces it** (`CORE_SIX` in `src/templates/packs.ts`), together with the rest of
the starter's contract: 6 to 12 graphics, every one in the kit's library, and any extra in it in
the kit's own family. Only TYPES satisfy a role, never `extras`: a type resolves in the kit's
family, while an extra is a fixed variant id carrying its own look. Measured 2026-08-08
(**`KIT_MATRIX_GAPS.md`**), the discipline packs failed this bar because they were cut as match
furniture with no opener and no way to end; the closing card became a real type (`sign-off`,
`ss14`-`ss17`) the same day, and every kit declares it.

### Kit look unification (`TemplatePack.paletteId`)

A kit may declare a palette id, and the kit build then creates every graphic it is drawn for with
that palette imposed - the same `variant.create({ palette })` a wizard palette pick uses. This is
what makes a kit's graphics read as one package out of the box: measured 2026-08-04, the newsroom
kit's graphics otherwise arrived in four different accent palettes. A kit WITHOUT a palette id
keeps every design's own defaults - Esports relies on that, because its Volt look is authored into
the designs themselves, and so do the three quiz kits. Curation rule the newsroom kit taught: an
extra must not name a design one of the kit's TYPES already resolves to - the production pool is
name-keyed, so the duplicate would silently merge (`tk10` Wire Rotator was the case).
`validatePacks` now refuses it, and `e2e/wizard-kit.spec.ts` pins one accent across every
palette-carrying kit's starter.

### The complete Esports tournament package

The Esports kit's library is intentionally larger than a competition-only collection. Its
graphics cover the whole tournament rundown in one Volt look: opener and holds, running order,
persistent identity and status marks, player and caster straps, sponsor placements, a
self-clearing cut transition, pre-match comparison and map veto, live series and map operation,
match events, fixtures, standings, bracket, results rail, score board and champion reveal. Its
starter is the ten a first tournament night needs; the rest are one tick away.

`map-round` still resolves to `mr01` Map Ladder for live coverage. `mr04` Map Veto is an extra,
because a production needs both jobs and they share the same cursor-driven operator structure
without duplicating it. The specialist lower thirds are likewise extras because tag-before-handle,
two-person commentary and a two-person analysis desk are genuinely different field shapes from the
ordinary lower third.

## The sports disciplines, inside one Sports kit (docs/SPORTS_PACK.md)

Until 2026-09-23 each of these was a pack of its own. They are now what the Sports kit's library
and fields cover:

| Discipline | What it needs from the Sports kit |
|---|---|
| Football | count-up clock, subs and cards (match-event), the table, the weekend results (fixtures) |
| Ice Hockey | period clock counting down, penalties, the period breakdown (match-board) |
| Basketball | quarter clock, the quarter-by-quarter board, team stats |
| Handball | half clock, two-minute suspensions, the group table |
| Racket Sports | set-by-set scoring (the stacked match board), the head-to-head (vs02) |
| Motorsport | the timing tower, championship standings, session results |
| Athletics | start lists, heat results (timing tower), the medal table |
| Combat Sports | round clock, the fight card (vs02), the decision |
| Club & School Sports | full club names, no crests needed |

### The three quiz kits

Sticker Quiz, Showtime Quiz and Arcade Quiz are each a two-player game show in one look: the quiz
board (the cover) whose answer count is a field, the opener, the strap, the running score, an
answer clock, a how-to-play card, the show mark and the closing card. `quiz-show` and `duel-score`
ship designs only in these three families, and the looks were drawn as sets, so each look is its
own kit rather than one kit with a look switch. None declares a `paletteId`: the three families'
palettes share nothing, and each design's own default already IS its family's palette. Sticker
Quiz owns the sheet's "Quiz / game show livestream" row (it was Classroom's); the other two claim
no format, because a format belongs to exactly one kit.

## How the libraries' extras were curated

The history below names the kits as they were before the 2026-09-23 consolidation: Match Day and
the discipline packs are now Sports, Creator, Shopping and Wellness are Creator Stream, Corporate
Events and Classroom are Corporate Event, Stage & Music is Stage & Awards, and Church & Ceremony
is Worship & Ceremony. The merged kits' extras were kept, deduplicated, in the merged library.

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

Family picks, briefly: sport carries both competitive kits; noacg (the house on-air look) goes
to the streamer kit where its amber control-room voice reads natively; glass suits the premium
conversational, stage and ceremony registers; minimal serves every context where the graphics
must defer to the content (news, civic, corporate). All taste - reviewable without touching the
mapping below, and restylable by the user on the Style step.

## The mapping — all 60 formats

Format names verbatim from the sheet. Notes only where the assignment was a judgement call. The kit
names are the 2026-09-23 consolidation's; the merged kits' formats moved with them.

| # | Format | Kit | Note |
|---|---|---|---|
| 1 | Sports broadcast / match coverage | Sports | |
| 2 | Esports tournament | Esports | |
| 3 | Gaming livestream | Creator Stream | |
| 4 | Just Chatting / personality stream | Creator Stream | |
| 5 | News / current affairs livestream | Newsroom | |
| 6 | Live commerce / shopping stream | Creator Stream | |
| 7 | Talk show / panel discussion | Talk Show | |
| 8 | Podcast livestream / videocast | Talk Show | |
| 9 | Webinar / expert presentation | Corporate Event | |
| 10 | Conference / seminar stream | Corporate Event | |
| 11 | Corporate town hall / internal broadcast | Corporate Event | |
| 12 | Education / lecture livestream | Corporate Event | |
| 13 | Music performance / concert livestream | Stage & Awards | |
| 14 | Award show / gala | Stage & Awards | nominee/winner reveals are a gap (below) |
| 15 | Election night / results program | Election | result bars = the poll type; maps/seat counts are a gap |
| 16 | Weather broadcast / climate update | Newsroom | forecast panels/maps are a gap; the strap/ticker/card core is Newsroom's, and the warning itself is now the `alert-level` type (al05) |
| 17 | Religious service / church livestream | Worship & Ceremony | |
| 18 | Fitness / workout class | Creator Stream | interval timer = countdown; round counters ride its fields |
| 19 | Live Q&A / AMA | Talk Show | |
| 20 | Product launch / keynote | Corporate Event | |
| 21 | Charity telethon / fundraising stream | Creator Stream | donation goal = the creator goal overlay pattern; totals bar is a gap |
| 22 | Remote interview show | Talk Show | |
| 23 | Magazine show / morning show | Talk Show | its ticker/weather inserts borrow from Newsroom |
| 24 | Cooking show / food livestream | Creator Stream | recipe/step cards + timers |
| 25 | Travel / IRL stream | Creator Stream | |
| 26 | Watch party / reaction stream | Creator Stream | |
| 27 | Debate / political discussion | Election | speaking timers = countdown; polls, topic cards |
| 28 | Student production / school TV | Newsroom | a school TV is a newsroom in miniature (moved from Classroom 2026-09-23) |
| 29 | Local sports / amateur sports | Sports | |
| 30 | Theatre / live performance stream | Stage & Awards | |
| 31 | DJ set / club stream | Stage & Awards | |
| 32 | Radio-style livestream with video | Talk Show | now-playing card = topic card |
| 33 | Auction livestream | Creator Stream | lot/bid cards = topic card + countdown; live bid feed is a gap |
| 34 | Real estate / property livestream | Creator Stream | |
| 35 | Finance / market livestream | Newsroom | the market ticker IS the ticker type, and tk14 draws the delta with an arrow, a sign AND a colour rather than colour alone; charts/heatmaps are a gap |
| 36 | Tech support / coding livestream | Creator Stream | |
| 37 | Art / design livestream | Creator Stream | |
| 38 | Craft / maker livestream | Creator Stream | |
| 39 | Tabletop RPG / board game stream | Creator Stream | initiative/dice overlays are a gap |
| 40 | Quiz / game show livestream | Sticker Quiz | the quiz board's home format; the Showtime and Arcade quiz kits serve it too (moved from Classroom 2026-09-23) |
| 41 | Reality-style livestream / house stream | Creator Stream | voting = poll |
| 42 | Security / surveillance-style public stream | Newsroom | label/timestamp/alert register — minimal's quiet voice |
| 43 | Animal cam / nature cam | Creator Stream | fact cards, calm register |
| 44 | Meditation / ambient livestream | Creator Stream | |
| 45 | Virtual event / metaverse event | Corporate Event | |
| 46 | Medical / health livestream | Corporate Event | disclaimer/source labels ride lower-third + topic-card fields |
| 47 | Legal / public information livestream | Corporate Event | |
| 48 | Municipal council / public meeting | Election | agenda items, speaking timer, vote result = poll; the notices themselves are pi01/pi05 and the bilingual obligation is pi07 + the `public-notice` rotator |
| 49 | Press conference | Newsroom | |
| 50 | Emergency information stream | Newsroom | the alert banner IS a type now (`alert-level`, four real severity states), and the multilingual card became one too (`public-notice`) - this row's original "cards are fields, not new types" was right until the graphics earned otherwise |
| 51 | Behind-the-scenes production stream | Corporate Event | schedule/labels register |
| 52 | Red carpet / premiere stream | Stage & Awards | |
| 53 | Fashion show livestream | Stage & Awards | |
| 54 | Beauty / makeup livestream | Creator Stream | product/shade cards, affiliate CTA |
| 55 | Book launch / author event | Talk Show | interview register; quote/excerpt = topic card |
| 56 | Academic conference livestream | Corporate Event | |
| 57 | Graduation / ceremony stream | Worship & Ceremony | |
| 58 | Wedding / private event livestream | Worship & Ceremony | |
| 59 | Funeral / memorial livestream | Worship & Ceremony | |
| 60 | Hybrid workshop / training session | Corporate Event | |

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

- `scripts/factory.mjs` (dev server up) validates on every run: kit ids unique, every type id
  known and filled in the kit's family, every extra in the catalog and never a design a type
  already resolves to, every starter 6 to 12 graphics from the library that satisfy the core six
  in the kit's own Style, and the format list covering exactly `REFERENCE_FORMAT_COUNT` (60) with
  no double-mapping.
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
