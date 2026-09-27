# The catalog by programme: what each kind of show runs, and what the shelf is missing

Written 2026-09-04, against the catalog at `b7507bbf`: 494 designs as the sweep counts them,
441 of which are one file each and 53 of which live inside a type or layout file (the audience
pack, the stream notifications, the editorial and cinematic info systems, the structural frame
layouts and the transition archetypes). It answers the first two items of
`docs/backlog/catalog-variety-by-programme-type.md`, a survey of what each kind of show puts on
screen joined to what the catalog has, so a drawing session is handed a NAMED ABSENCE instead of
"make something different", and it PROPOSES the fourth, the recurring drawing slot (§9). The
proposal is not registered anywhere that fires; §9 says what would register it.

**Read §6 first if you are about to draw.** It is the ranked list. Everything before it is the
evidence, and everything after it is how the list is fed and kept true.

## 0. What this is held to

The owner, 2026-09-03: *"Most of the graphics we have look like the house graphics; they are
banners with an accent line."* And: the catalog *"should be the best the internet has seen and
it's still not there"*. He asked for research and a strategy before more drawing, because more
cards drawn the same way is the complaint.

Three facts shape everything below:

1. **The catalog is already organised by show, at the data level.** Sixty reference formats
   (`live_format_graphics_needs.xlsx`, 2026-07-08) map one-to-one onto twenty-one packs
   (`src/templates/packs.ts`), and every template derives `programmeFormats` from that
   (`src/templates/templateMeta.ts`). So "we have nothing for talk shows" is false. What is true
   is narrower and worse: a talk-show kit, a newsroom kit and a church kit resolve to graphics that
   share ONE silhouette and differ by panel treatment. The pack axis is complete; the DESIGN axis
   under it is not.
2. **Difference is what colour and animation cannot change.** The wizard already repaints and
   re-times every design, so two designs separated only by palette or entrance are one design.
   What is left is silhouette, placement, layout, typography and the STATES a graphic has. Every
   absence below is one of those, never a palette.
3. **An absence is not automatically a gap** (`docs/CATALOG_WORK_QUEUE.md`, paid for with the
   withdrawn side-column). So every named absence here carries who asks for it: the reference
   sheet row, a public package listing, or a format's own rules. Nothing is listed because an
   instrument said it was missing.

## 1. Method, and what is and is not verified

Three inputs, joined by hand:

- **What a show runs.** The reference sheet's "Graphics typically needed" column for the formats
  that belong to each of the owner's six genres, checked against public sources read this session
  (§11): format rules on Wikipedia for the game shows, the score-bug and ticker and DOG articles
  for the persistent furniture, package listings on Videohive and Envato for what a sold
  "broadcast package" contains, a podcast-overlay vendor's own list, and a documentary
  lower-third guide. Each genre section says which of its lines come from a FETCHED source, which
  from a search summary only (the page refused the fetch), and which from broadcast convention
  with no source found. **A line marked "convention" is unsurveyed** and should be read as my
  claim, not a fact.
- **What the catalog has.** A mechanical extraction of every design's id, category, family, name
  and description (441 files), classified by graphic KIND and by GENRE. The classification was
  delegated to Antigravity in four chunks (two on `gemini-3.7-flash-high`, two on
  `claude-sonnet-4-6`), then a sample was re-derived here against the source files before any of
  it was used; §4 records the agreement and the corrections. The 38 typed designs the extraction
  cannot see were classified here directly.
- **What the shelf looks like.** `scripts/card-look-sweep.mjs` over every category, reading
  rendered pixels for backdrop, accent hue and footprint. §7 says which numbers were measured
  tonight and which are quoted from `docs/backlog/template-variety-and-dedup.md`.

The six genres are the owner's words: talk show, game show, podcast, sports, news, "film-type
stuff". Film is read as the four things a film channel or an entertainment desk streams: red
carpet and premiere, award show and gala, festival and review programme, and the documentary
register (which is where the catalog's `cinematic` family already lives). Esports, corporate,
church, commerce and wellness are NOT surveyed here; they are the next six (§9).

## 2. The vocabulary: what a graphic is FOR

Genres share most of their graphics. A name strap is a name strap in every genre, so the gap
table is genre x KIND, and kinds are jobs, not categories. These are the forty-five kinds the
inventory was classified into (plus `other`, which no design needed). §3 and §5 use the same
words, and §5 splits a kind into a finer row where one absence needs its own line: the
over-the-shoulder box is a `headline` job in the upper band, the money ladder is a `results`
job with states, the info bar is a `ticker` job carrying a clock; each finer row is an item of
§6, which says which kind it belongs to.

`name-strap` `two-person-strap` `specialist-strap` `locator` `live-flag` `ident-bug`
`sponsor-mark` `social-handle` `topic-bar` `headline` `coming-up` `opener` `chapter-title`
`quote-card` `fact-card` `agenda` `now-playing` `ticker` `breaking-banner` `warning` `notice`
`countdown` `game-timer` `scorebug` `match-board` `lineup` `standings` `results` `head-to-head`
`versus` `stat-panel` `poll-result` `quiz-question` `reveal` `goal-meter` `commerce-card` `cta`
`holding` `sign-off` `credits` `frame` `transition` `viewer-question` `stream-event`
`map-location`.

Status words used in every table:

- **HAVE (n)** - designs drawn for this job. Ids follow.
- **HOUSE-ONLY** - it exists, in one family, usually `noacg`, so a kit in any other look loses it.
- **STAND-IN** - nothing is drawn for the job; a general design can carry the words. This is
  the status the owner's complaint is about: the show runs, on a strap with an accent line.
- **ABSENT** - nothing carries it.
- **OUT** - deliberately not built (`docs/PACK_TAXONOMY.md` "Still open": maps and data-fed
  charts wait on external data).

## 3. What each kind of show runs

### 3.1 News (news livestream, election night, weather, debate, press conference, emergency)

The most furnished genre in the catalog and the one whose LOOK is furthest from convention. A
news package is built around persistent furniture: the two-tier strap, the ticker, the bug with
time and temperature, the breaking banner, and the over-the-shoulder box beside the anchor.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Anchor / reporter strap | name; role or place; sometimes org | two tiers; on a news desk usually a FULL-WIDTH band with a colour-coded top bar (BBC, Sky, CNN), otherwise a left strap | HAVE 101 straps; **one full-width band, on paper** (`lt63`). No dark full-width two-tier news band |
| Locator / dateline / LIVE | place, LIVE, local time | small chip top-left, or a cell on the strap | HAVE `ls28` `ls29` `lt30` `ls36` `bug33`-`bug36` `bug09`-`bug12` |
| Over-the-shoulder box | headline + picture, beside the anchor's head | upper corner box, roughly a quarter of the frame, opposite the anchor | **ABSENT** |
| Headline / story card | kicker, headline, body, byline | panel or full frame | HAVE `card22`-`card25` `card80` `card59` `card62` |
| Ticker / crawl / flipper | headlines, source cap | full-width bottom strip; crawl or one-at-a-time | HAVE `tk01`-`tk22` (22) |
| Breaking banner | BREAKING, headline, attribution | full-width red band, often a two-deck with the crawl | HAVE `al09` `al11` `lt12` `ls37` `ls38` `tk16` |
| Time and temperature | clock, temperature, place | in the bug, or in a bottom info bar | HOUSE-ONLY `bug02` `bug37` `lt62` |
| Info bar (the morning-show bottom bar) | clock + temp + headline in one strip | full-width composite bar | **ABSENT** (`tk20` is a two-deck crawl with no clock or temperature) |
| Weather forecast | day, condition, high/low | board; map | HOUSE-ONLY `ig37`; maps OUT |
| Election results | party, share, seats, swing, projection | bars, seat board, majority line | HAVE `ig07` `ig34`-`ig36` `ig38` `ls20`-`ls22` `pl02` `card64` |
| Two-box / remote interview | two names, two windows | split frame with nameplates | HAVE `fr02` `fr03` `ls01`-`ls03` |
| Quote / statement card | the words, who said them | panel | HAVE `card04` `card52` `ls33` `card69` `card34` |
| Source / attribution label | source, when measured | small corner label | HAVE `pi03` `pi10` |
| Explainer / key facts | term: value rows | panel | HAVE `ig14`-`ig17` `ig39` `card26`-`card29` |
| Fact check | claim, ruling | strap or desk card | HAVE `ls39` `card61` |
| Data chart (trend line) | a series over time | panel | **ABSENT** (bars and rings only: `ig02` `ig12` `ig13` `ig04`) |
| Map | | | OUT |
| Coming up / next | item, time | panel | HAVE `card18`-`card21` `card60` |
| Show open | programme name | FULL-FRAME animated open | STAND-IN `card05` `card07`-`card09` are panel title cards, not a full-frame open (§7 measures this) |
| Press conference set | org bug, statement headline, pool credit | | HAVE `bug05`-`bug08` `card22` `pi03` |
| Emergency set | alert level, instructions, bilingual notice, notice crawl | | HAVE `al05` `al06` `pi02` `pi07`-`pi09` `tk15` |

Sources: sheet rows 5, 15, 16, 27, 49, 50 (fetched); Wikipedia "News ticker", "Digital
on-screen graphic", "Breakfast television" (fetched); NewscastStudio's news-package glossary
(open, OTS, full screen) and the Nightly News OTS redesigns - search summary only, the pages
refused the fetch; the full-width two-tier band and the colour-coded top bar - convention.

### 3.2 Sports (match coverage, amateur and club sports; the nine discipline packs)

The best-covered genre by count, and the one whose gaps are SHAPES rather than kinds: the
catalog has every job a match runs, and draws almost all of them as a slab.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Scorebug | two teams, score, clock, period; possession, shot clock, cards by sport | compact, top-left; the 2025-26 trend is bottom-centre for phone clips, and CBS's full-width top "Eyebar" on a solid ground | HAVE `sb05`-`sb08` `sb23`-`sb25` (7); esports `es01`-`es04`. **No full-width top bar** |
| Match board / result | full score, halves, crests | centre panel | HAVE `sb09`-`sb16` |
| Match event | sub, card, goal, minute | strap | HAVE `sb17`-`sb20` |
| Goal flash | GOAL, scorer, minute | full-width slam that clears itself | **ABSENT** (the event card is a strap) |
| Player strap | name, number, club, stat line | strap led by a number block or crest | HAVE `ls08`-`ls10` `lt41` `lt44` `lt06` `lt07` |
| Line-up / team sheet | eleven names, roles | list | HAVE `rs01`-`rs03` `rs05` |
| Formation | eleven names ON THE PITCH | full-frame pitch or court shape | **ABSENT** |
| Head-to-head / stats compare | stat rows, share bars | panel | HAVE `h201`-`h204` |
| Player card | portrait, name, stats | panel with picture | HAVE `pc01`-`pc04` |
| Player of the match / MVP | portrait, name, the stat that earned it | panel | STAND-IN `pc01`, `nm01`-`nm04` |
| Champion / final result card | the winner, the score | full frame | HAVE `wn01`-`wn04` |
| Standings | table | panel | HAVE `st01`-`st04` |
| Fixtures / results | list; results crawl | panel; strip | HAVE `ig26`-`ig29` `tk13` |
| Timing tower | position, name, gap | tall side column | HAVE `tt01`-`tt04` |
| Bracket | knockout tree | full frame | HAVE `br01`-`br04` |
| Versus / match-up | two crests, VS, pick | full frame | HAVE `vs01` `vs02` `mu01`-`mu04` |
| Replay wipe | | full-frame stinger | HAVE `tr01`-`tr04` |
| Commentary pair | two names | strap | HAVE `ls06` `ls07` |
| Venue / fixture ident | competition, round, venue | bug | HAVE `bug27` `bug35` `card47` |
| Sponsor | | bug, strip, rotation | HAVE `bug17`-`bug24` `cr12` |
| Half-time team stats | possession, shots, cards for both | two-column panel | HAVE `h201`-`h204`; `ig20` as a list |
| Possession indicator | which side has the ball | a dot on the bug | **ABSENT** as a state (`sb06` carries a shot-style clock) |

Sources: sheet rows 1, 29 (fetched); Wikipedia "Score bug" (fetched: per-sport content,
top-or-bottom placement, the bottom-centre trend); keepthescore's 2026 network comparison
(fetched: the CBS Eyebar at the top on a solid ground); the SVG 2026-06-09 scorebug piece and
two Envato sports packages - search summary and fetched listing respectively (lower thirds,
player ID cards, lineups and formations, scoreboards, officials, opener, now/next, credits);
the goal flash and the on-pitch formation - convention, and the sheet's "goal/score animation"
and "lineups; formations".

### 3.3 Game show (quiz and game show livestream; the classroom quiz)

The genre with the most named absences, and the one the 2026-09-12 production runs. A game
show's graphics are its SET: full-frame, saturated, glossy, centred, with states (locked,
revealed, correct, banked). The catalog has twelve quiz boards that share one silhouette, a
timer, a verdict and two podium score strips.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Question board | question, two to four lettered answers; lock; reveal | full-frame or lower two-thirds; big colour fields | HAVE `qz01`-`qz12` (12), one silhouette: a mid panel with lettered rows (§7) |
| Money ladder / prize tree | prize per level, current level lit, safe havens marked | vertical ladder at one side, on screen beside the question | **ABSENT** |
| Contestant podiums | N names and scores; whose turn | a row along the bottom, or one plate per podium | HAVE `sb21` `sb22` (two; four contestants fixed) |
| Buzz-in / lock-in mark | who buzzed, who has locked | a flash on that contestant's plate | **ABSENT** (the podium spotlight is operator-moved, not a buzz state) |
| Round card | ROUND 2, its name and rule | full frame | STAND-IN `card12` `card05`-`card09` |
| Verdict | correct / wrong | full-frame tick or cross | HAVE `vd01`-`vd04` |
| Round timer | seconds | corner, or under the question | HAVE `gt01`-`gt06` |
| Category and value grid | six categories x five values, taken cells blank | full-frame grid | **ABSENT** |
| Survey board | numbered hidden answers that flip to text and points; strikes | full-frame board | **ABSENT** |
| Picture question | image + question | full frame | **ABSENT** (the quiz type has no image field) |
| Ask the audience | percent per answer | bars under the answers | HAVE `pl01`-`pl05` `ig11`-`ig13` |
| 50:50 | two answers greyed | a state on the question board | **ABSENT** as a state (the board has lock and reveal) |
| Leaderboard / final result | ranking; champion | full frame | HAVE `st03` `wn01`-`wn04` |
| Winnings card | "you have won", the amount | full frame | STAND-IN `wn01`-`wn04` (a champion with a score) |
| Contestant strap | name, hometown, occupation | strap | STAND-IN `lt22` `lt24` |
| Rules card | | panel | STAND-IN `card26`-`card29` `ig14` |
| Show furniture: ident bug, sponsor, holding, sign-off, stinger | | the universal set the classroom pack already carries | HAVE (every genre) |

Sources: sheet row 40 (fetched); Wikipedia "Who Wants to Be a Millionaire?" (fetched: four
lettered answers, the money tree with safe havens, final answer, the three lifelines, the
2008 clock), "Jeopardy!" (fetched: six categories x five values, the clue full screen, Daily
Double, podium scores, Final Jeopardy wagers), "Family Feud" (fetched: concealed ranked
answers that reveal with points, three strikes); SPX Graphics' own game-show page (fetched:
questions, answers, player information, point calculation, prize amounts, time counters,
buzzer control, chaser and referee screens). The fandom pages refused the fetch and are not
relied on.

### 3.4 Talk show (talk and panel, morning and magazine, remote interview, radio-style, book launch)

The genre where the catalog has the WORDS and not the register. A talk-show package is
entertainment-grade: big warm type, photo-led guest cards, bright daytime palettes on a morning
show, and a segment bumper that fills the frame. The talk-show kit is glass and frost.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Host / guest strap | name, role; flagship size | big, warm; host smaller than guest | HAVE the straps, `ls04` `ls05` |
| Tonight's guests line-up | three or four names WITH PICTURES | full frame or a panel of portraits | **ABSENT** (`rs01`-`rs05` list names without pictures) |
| Topic bar | the subject on the table, persistent | thin strap that stays up under the shot | STAND-IN `card06` `card16` (topic PANELS); `lt12` |
| Coming up / after the break | the item, with a picture | panel with picture | HAVE `card18`-`card21` text only; **with a picture ABSENT** |
| Segment bumper | segment name | full-frame bumper | STAND-IN `card12`; `tr01`-`tr04` carry no words but a label |
| Two-up / split | | frame | HAVE `fr02` `fr03` |
| Viewer question / comment / queue | | panel | HAVE `aq01`-`aq04` `ch01`-`ch04` `qa01`-`qa04` `qq01`-`qq04` |
| Poll | | | HAVE `pl01`-`pl05` `ig11`-`ig13` |
| Quote | | | HAVE |
| Running order / agenda | | | HAVE `ig06`-`ig10` `card60` |
| Social handle / hashtag | | strap; a hashtag bug | HAVE `lt14`-`lt18` `ls31` `ls41`; a hashtag BUG is STAND-IN `bug13`-`bug16` |
| Caller / phone-in | caller, place, line | strap with waveform | HAVE `ls35` |
| Get in touch | phone, email, hashtag | strap | STAND-IN `lt55`-`lt58` |
| Now playing (radio-style) | track, artist | strap | HAVE `ls25` `card19` `card68` |
| Book / product card | cover, title, author | panel with picture | STAND-IN `card42` `card38` |
| Time and temperature, weather, ticker (morning) | | | HOUSE-ONLY `bug37` `lt62` `ig37`; tickers HAVE |
| Recipe / steps (morning) | | | HAVE `card26`-`card29` |
| Closing CTA / sign-off | | | HAVE `lt55`-`lt58` `ss14`-`ss17` |

Sources: sheet rows 7, 19, 22, 23, 32, 55 (fetched); Wikipedia "Breakfast television" (fetched:
time and temperature in the bug, the ticker with headlines, weather and scores); the
Videohive "Entertainment Broadcast Package" listing (fetched: bumper with full-screen
graphics, coming-soon promo with a side ticker, today promo with three text and video
placeholders, opener, lower third, end titles); the CBS Mornings 2024 package - search summary
only (a white-on-black bar most of the screen width with time and temperature at lower right).
The picture-led guests card and the persistent topic bar - convention.

### 3.5 Podcast (podcast livestream and videocast)

Covered well by count, because a podcast runs on the same straps and cards as a talk show. Its
three specific graphics are the three the catalog does not have, and two of them are motion.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Episode card | episode number, title, date, guests | full frame or panel | STAND-IN `card05` `card07` (no episode number) |
| Host / guest strap with handle | name, @handle | strap | HAVE `ls31` `ls41` `lt09` |
| Show logo bug | | corner | HAVE `bug13`-`bug16` |
| Chapter / topic card | chapter, what it covers | panel; a scrim | HAVE `card14` `card06` `card67` |
| Chapter progress bar | where in the episode, how long this topic runs | thin bar along an edge | **ABSENT** |
| Audio waveform / visualizer | that sound is happening | a frame element or a strip | **ABSENT** (`ls35` draws a waveform on a caller strap only) |
| Sponsor read | sponsor, tagline, promo code | panel | HAVE `card65`; `card40` `card41` `card74` `card75` |
| Quote / soundbite card | | full or corner card | HAVE `card04` `card52` `card69` |
| Comment / question overlay | | | HAVE the audience pack |
| Listen-on platform badges | Spotify, Apple, YouTube | small badge row | STAND-IN `lt14`-`lt18` (one platform per strap) |
| Two-up frame | | | HAVE `fr02` `fr03` |
| Live indicator | | | HAVE `bug09`-`bug12` |
| Starting / ending | | | HAVE `ss01`-`ss21` |

Sources: sheet row 8 (fetched); Videohead's podcaster page (fetched: lower thirds, quote
cards, chapter bumpers, audio visualizers, platform badges as calls to action, split-screen
frames, progress bars, social pop-ups); overlays.uno's podcast checklist (fetched: title
cards, logo, sponsor graphics, lower thirds for talking points and next episode). The episode
number card - convention.

### 3.6 Film and entertainment (red carpet and premiere, award show and gala, festival and review programme, documentary; theatre and concert alongside)

The catalog's `cinematic` family IS the documentary register and it is good at it: scrim,
hairline, wide light caps, the location and dateline slates. What is missing is the OTHER half
of "film-type stuff": the gala, the red carpet and the review desk, which are gold, glossy,
serif and picture-led, and the catalog has no design in that register at all.

| Graphic | What it says | Conventional shape and place | Catalog |
|---|---|---|---|
| Red-carpet guest strap | name; role IN the film; the film's title | glossy strap, often a picture | STAND-IN `lt22` `lt24` |
| Look / designer card (fashion, red carpet) | look number, designer, garment | strap or card | **ABSENT** |
| Award category title | category | full frame | HAVE `aw01`-`aw04` `card56` |
| Nominees | four or five names with film AND PORTRAIT | full-frame tiles with pictures | HAVE `nm01`-`nm04` text tiles; **with portraits ABSENT** |
| Winner reveal | | envelope beat | HAVE `nm` `wn` `aw` |
| Presenter strap | | | HAVE |
| Trophy / award bug | award word, category | bug | HAVE `bug29`-`bug32` |
| In memoriam | name, years, PHOTO | slow roll with pictures | HAVE `card55` (one card), `cr11` (names roll); **with pictures ABSENT** |
| Thank-you / credits | | full-frame roll | HAVE `cr01`-`cr09` `cr11`-`cr13` (`cr10` was retired 2026-08-28) |
| Voting / hashtag | | | HAVE `pl`, `lt14`-`lt18` |
| Film title / chapter card | | scrim, type-led | HAVE `card67` `card14` `card83` |
| Documentary name super | name, role; place and date | scrim, no panel | HAVE `lt32`-`lt35` `lt37` `lt38` `ls36` `card70` (`lt36` was retired 2026-08-28) |
| Documentary quote | | scrim | HAVE `card69` |
| Film fact box (review show) | title, director, cast, runtime, certificate, release date, verdict | panel with poster | **ABSENT** |
| Star rating | stars out of five | small mark | **ABSENT** |
| Screening schedule (festival) | | | HAVE `ig06`-`ig10` |
| Director Q&A strap | film title as headline, the person under it | strap | HAVE `ls19` as a stand-in (a session title over a speaker) |
| Act / scene card (theatre) | | | HAVE `card14` |
| Cast / role strap | | | STAND-IN `lt22` |
| Surtitle / translation | | strip | HAVE `card53` `card66` `ls34` |
| Intermission | | | HAVE `ss07` |
| Artist / song strap (concert) | | | HAVE `ls25`-`ls27` `card68` |
| Setlist | | | HAVE `ig06` |
| Lyrics | | | HAVE `card51` `card71` |
| DJ visualizer frame | | frame | **ABSENT** |

Sources: sheet rows 13, 14, 30, 31, 52, 53 (fetched); the Videohive "Awards Show Pack" listing
(fetched: opener, nominees, award categories, winner, two and four screens, lower third,
transition, closing credits); a documentarian's lower-thirds guide (fetched: name and
occupation, restraint, sans type, discreet motion, appearing only on introduction); the
MasterClass and StudioBinder pieces - search summary (a lower third also establishes time and
place: "Jane Doe's residence, July 15th, 1988"). The film fact box and the star rating -
convention (the review programme's standing furniture, e.g. Film 2000-era BBC review shows);
the look-number strap - convention and sheet row 53.

## 4. The catalog inventory, and how it was checked

The classification of 441 designs by kind and genre was delegated in four chunks of about 110
rows. The first attempt, one call for all 441 rows with a `why` field, was cut off at the
model's output limit and returned nothing usable; the split with a one-line-per-design output
contract is what worked. Each returned file was checked two ways before use:

1. **Shape.** Row count equals the chunk's count, every id is in the chunk in order, every kind
   and genre is in the vocabulary.
2. **A re-derived sample.** Thirty-five ids across the four chunks, classified here from the
   design's own name, description and file header before the delegation's rows were read,
   then compared. **Kind agreed on 31 of 35, genre on 27 of 35.** Two kind readings were
   wrong and are corrected in the join: `bug29` House Award Bug is an award BUG, not a reveal;
   `card55` In Memoriam is a memorial card, not an opener. Two were defensible either way
   (`card19` Frost Now Next carries a track AND a coming-up line; `sb21` Volt Podiums is a
   score strip that the delegate called a scorebug). All eight genre disagreements were on
   designs whose words name no show: the delegate read a family or a pack into them (`lt32`
   Scrim as `any`, `st03` Frost Leaderboard as `sports`, `card46` Frost Location as `creator`),
   which is exactly the reading §0 warns against, so the genre column is used only where the
   design's own words name the show. The shape check found one defect: the Sonnet chunk
   wrapped its rows in eight lines of commentary that had to be filtered; all 108 rows were
   present and in order.

What the delegation says about the shelf, and it is a finding in itself: **138 of 441 designs
(31%) name no show at all** in their own words, and the delegate could only call them `any`.
Sports names 108, news 64, game show 23, film and entertainment 21, talk show 8, podcast 0.
That is the pack axis and the design axis disagreeing: the talk-show pack resolves to a full
kit, and eight designs in the catalog were drawn FOR a talk show.

The join in §3 was made from the delegation's kind column corrected as above and by the
category-level reading in §3 itself; where the two disagreed about a single design, the design
file was opened. The 38 typed designs (`aq` `ch` `qa` `qq` `rq` `sn` and `card59`-`card71`,
`ltc01`) were classified here without delegation: audience kinds, stream events, and the
editorial and cinematic info systems. Both delegation outcomes are on the ledger
(`npm run outcome`, labels `h-catalog-inventory-gemini` and `h-catalog-inventory-sonnet`).

## 5. The gap table: genre x kind

Codes: **H** have (drawn for the job), **h** house-only or one-family, **S** stand-in, **A**
absent, **O** out of scope, blank = the genre does not run it.

| Kind | News | Sports | Game show | Talk show | Podcast | Film / entertainment |
|---|---|---|---|---|---|---|
| name-strap (genre register) | H, no full-width dark band | H | S (contestant) | H, no flagship-warm | H | S (red carpet: role in film) |
| two-person-strap | H | H | | H | H | |
| specialist-strap | H | H | S | H (caller) | H (handle) | A (look / designer) |
| locator / live | H | H | | H | H | H (documentary) |
| ident-bug | H | H | H | H | H | H |
| sponsor-mark | H | H | H | H | H | H |
| social-handle | H | H | | H | H, badges S | H |
| topic-bar (persistent) | S | | | S | | |
| over-the-shoulder box | A | | | A | | |
| headline / story card | H | | | | | |
| coming-up (with picture) | H / A | H | | H / A | | |
| opener (full frame) | S | S | S | S | S | S |
| chapter-title | | | S (round) | S (segment) | H | H |
| quote-card | H | | | H | H | H |
| fact-card / explainer | H | H | S (rules) | H | | A (film fact box) |
| agenda / schedule | H | H | | H | | H |
| now-playing | | | | H | | H |
| ticker | H | H | | H | | |
| breaking-banner | H | | | | | |
| warning / emergency | H | | | | | |
| info bar (clock+temp+headline) | A | | | A | | |
| time and temperature | h | | | h | | |
| weather board | h | | | h | | |
| countdown / holding | H | H | H | H | H | H |
| game-timer | | | H | | | |
| scorebug | | H, no full-width top bar | | | | |
| match-board / event / goal flash | | H / H / A | | | | |
| lineup / formation | | H / A | | | | |
| standings / results / tower / bracket | H (election) | H | H | | | |
| head-to-head / player card | | H | | | | |
| versus | | H | | | | |
| stat-panel (trend chart) | A | H (bars) | | H (poll) | | |
| poll-result | H | | H | H | H | H (vote) |
| quiz-question | | | H, one silhouette | | | |
| money ladder | | | A | | | |
| contestant podiums | | | H (2, four contestants fixed) | | | |
| buzz-in / lock state | | | A | | | |
| category grid / survey board | | | A / A | | | |
| picture question | | | A | | | |
| reveal (verdict / winner / nominee) | | H | H | | | H, nominees without portraits |
| in memoriam with pictures | | | | | | A |
| guest line-up with pictures | | | | A | | |
| goal-meter | | | | | | |
| commerce-card | | | | S (book) | | |
| cta / qr | H | H | | H (get-in-touch strap S) | H (platform badges S) | H |
| holding / sign-off / credits | H | H | H | H | H | H |
| frame (two-up, share) | H | H | | H | H | |
| waveform / visualizer | | | | | A | A (DJ) |
| chapter progress bar | | | | | A | |
| transition / stinger | H | H | H | H | | H |
| viewer-question | H | | | H | H | |
| stream-event | | | | H | H | |
| map | O | | | | | |

Read down a column to see what a genre lacks; read across a row to see how many genres one
drawing would serve. The rows that cross three or more columns are the ones §6 ranks first.

## 6. The named absences, ranked: the drawing queue

Ranked by how many of the six genres ask for it, times how far the shape is from a strap. Each
entry names who asks, what the graphic has to say, the silhouette and where it sits, the STATES
it needs, what stands in today, and the footprint bucket the sweep must show for the shape claim
to hold. **Take them in order; a slot that skips one says why in its handoff.**

1. **The over-the-shoulder box.** News, talk, morning. Sheet rows 5 and 23; the NewscastStudio
   package glossary lists it beside the open and the full screen. Says: a headline (two lines),
   a kicker, a picture. Sits in the upper half, opposite the presenter, about a quarter of the
   frame, and STAYS while the strap comes and goes beneath it. States: shown, swapped (the next
   story slides in), cleared. Stands in: nothing; a topic card is a mid-frame panel. Sweep: an
   upper-band box (`box.y + box.h / 2 < 0.4`) that is `strap/mid` or wider; today the upper band
   holds nothing but bugs, scorebugs, towers and clocks (§7).
2. **The money ladder.** Game show. Sheet row 40 ("prize graphic"); the Millionaire format.
   Says: N prize levels, the current level lit, the safe havens marked. A tall column at one
   side that stays up beside the question board. States: level up, level down (a wrong answer
   falls to the last safe haven), banked. Stands in: nothing. Sweep: `strap/tall` or a box with
   `h > 0.5` and `w < 0.25`. **Draw it as a package with the question board and the podiums it
   sits beside**, in one game-show look, not as a lone card.
3. **People with pictures: the guest line-up, the nominees, the team sheet.** Talk show, film,
   sports. Sheet rows 7, 14, 1; the Awards Show Pack's "Nominees"; `docs/CATALOG_VARIETY.md`
   absence 11 ("a picture in the composition: 0") still open. Says: three to five names, each
   with a role or film and a portrait. Full-frame tiles or a panel row. States: one tile lifted
   (the winner, the guest now on), all level. Stands in: `nm01`-`nm04` (text), `rs01`-`rs05`
   (text), `pc01` (one person). One structure, three genres' words. Sweep: `full-width/mid` or
   `full-width/tall`.
4. **A full-frame show open.** Every genre's sheet row lists one; every sold package leads with
   it. Says: the programme name, an episode or date line, the mark. Fills the frame, plays for
   three to six seconds, clears itself (the transition category already owns that lifecycle).
   Stands in: the panel title cards `card05` `card07`-`card09`. This is the graphic a
   non-technical user reaches for FIRST and the shelf answers with a panel. Sweep: `full-width/
   tall` with `density > 0.35`, in a category that today has none.
5. **The formation.** Sports. Sheet rows 1 and 29 ("lineups; formations"); the soccer package
   listing ("team lineups and formations"). Says: eleven names at eleven positions on a pitch
   or court shape, with a formation label. Full frame. States: shown, one player spotlit, a
   substitution swaps two names. Stands in: `rs01`-`rs05` as a list. Sweep: `full-width/tall`.
6. **The category grid and the survey board.** Game show. Jeopardy's six-by-five board and
   Family Feud's ranked hidden answers. Two full-frame boards whose whole point is STATE: a cell
   taken goes blank; a numbered answer flips to its text and points; a strike lands. Stands in:
   nothing. These are the two boards a classroom quiz reaches for after the four-answer one.
   Sweep: `full-width/tall`.
7. **The goal flash and the full-width top scorebug.** Sports. Sheet row 29 ("goal/score
   animation"); keepthescore on the CBS Eyebar. Two shapes the sport shelf lacks: a full-width
   slam that says GOAL and the scorer and clears itself, and a bug that runs the full width of
   the TOP of the frame on a solid ground. Stands in: `sb17`-`sb20` (a strap), `sb05`-`sb08`
   (a corner bug). Sweep: `full-width/thin` at `y < 0.1`; `full-width/mid`.
8. **The waveform and the chapter progress bar.** Podcast, DJ set. Videohead's list; sheet
   rows 8 and 31. Two thin elements: a visualizer strip (drawn bars driven by a timer, since
   the template takes no audio input) and a bar along one edge that shows where the episode
   is. Stands in: nothing (`ls35`'s waveform is inside a caller strap). Sweep: `full-width/
   thin` at the frame's edge with `density < 0.35`.
9. **The morning-show info bar.** Talk (morning), news. Sheet rows 23 and 5; the CBS Mornings
   bar. Clock, temperature and one headline in one full-width bottom bar that stays up for the
   whole segment. Stands in: `tk20` (two decks, no clock), `bug37` (house temperature). This is
   also the first design that would give the time-and-temperature job a non-house family.
   Sweep: `full-width/thin` with `density > 0.35`.
10. **The film fact box and the star rating; the look card.** Film. Sheet rows 52 and 53;
    convention for the review desk. A panel with a poster slot and a fixed field set (title,
    director, cast, runtime, certificate, release date, verdict), a star mark, and a fashion
    strap that says "Look 12 - Designer". Stands in: `card42`, `lt22`.
11. **The buzz-in state and N-contestant podiums.** Game show. SPX's game-show page ("buzzer
    button controls"); sheet row 40. Less a drawing than a behaviour: a podium score strip
    whose contestant count is a field (two to six) and which has a BUZZED state the operator
    fires per contestant. `sb21` `sb22` fix four and move a spotlight by hand. This belongs with
    `docs/backlog/more-behaviours-than-poll-and-quiz.md` as much as here.
12. **The gala register.** Film. Not a kind, a LOOK: gold or champagne on black, a serif, slow
    fades, full-frame reveals with pictures. The awards pack's whole shelf is sold this way and
    the catalog has five serif designs and no gold. This is what items 3 and 4 should be drawn
    IN when they are drawn for film, rather than a thirteenth card.

Declined, with the reason, so nobody redraws them: a **map** (out until there is data to put on
it); a **line chart** (same); the **side column** (retired 2026-08-23, turned type does not
read); a **full-frame name card** for one person (declined 2026-08-28 as a title-card overlap).

## 7. What the shelf looks like, measured

`node scripts/card-look-sweep.mjs <category> --json <out.json>` over the catalog, rendered
full-frame over black at `create({})`, read back for backdrop, dominant saturated hue and the
ink's footprint (the path after `--json` is required for the per-design file; without it the
script prints the summary only). It
reports; it gates nothing. **Every row was measured tonight** on this branch's dev server; the
lower-third row is also the number `docs/backlog/template-variety-and-dedup.md` quotes (99 of
103 `strap/thin`, 2026-08-21), re-measured here at 101 designs after the six retirements and
the two new shapes.

| Category | n | backdrop dark / none / light | top accent | footprint: the one silhouette, share | distinct card looks |
|---|---|---|---|---|---|
| lower-third | 101 | 73 / 19 / 9 | orange 28, none 27, red 10, amber 10 | `strap/thin` **93%** (`strap/mid` 5, `full-width/thin` 1, `strap/tall` 1) | 21; the commonest (dark, orange, strap/thin) is 24% |
| info-card | 83 | 52 / 24 / 7 | orange 34, none 14, amber 14, cyan 11 | `strap/mid` 42%, `strap/thin` 25%, `wide/thin` 19%, `wide/mid` 12%, `strap/tall` 1 (`card83`). **No `full-width` and no `tall` but one**: nothing in this category fills the frame | 29; the commonest is 10% |
| scoreboard | 26 | 24 / 2 / 0 | orange 12, cyan 5, amber 4 | `strap/thin` 42%, `wide/thin` 27%, `strap/mid` 19%, `wide/mid` 12%. **No `full-width`.** 11 sit in the upper band (the bugs), 8 middle, 7 lower | 14; the commonest is 12% |
| ticker | 22 | 21 / 0 / 1 | orange 10, rose 3, amber 3, none 3 | `full-width/thin` 82%, `wide/thin` 18%; 20 lower, 2 upper (`tk12` `tk04`) | 9; the commonest (dark, orange, full-width/thin) is 45% |
| corner-bug | 37 | 26 / 7 / 4 | orange 14, amber 7, none 7, cyan 5 | `strap/thin` **100%**; 21 upper, 16 lower | 12; the commonest is 19% |
| infographic | 39 | 33 / 5 / 1 | orange 15, amber 7, cyan 6 | `strap/mid` 59%, `wide/mid` 21%; one `strap/tall` (`ig38`); one upper (`ig03`) | 21; the commonest is 18% |
| quiz | 12 | 12 / 0 / 0 | orange 6, cyan 3, amber 2, azure 1 | `wide/mid` **100%**, all mid-frame | **4** distinct looks; the commonest is 50% |
| matchup | 12 | 9 / 3 / 0 | orange 6, amber 3, cyan 3 | `full-width/tall` 75% | 5; the commonest is 25% |
| poll | 5 | 5 / 0 / 0 | orange 3 | `strap/mid` 4, `full-width/mid` 1 (`pl05`) | 4 |
| audience | 20 | 20 / 0 / 0 | orange 9, amber 5, cyan 5 | `strap/mid` 10, `strap/thin` 8, `wide/mid` 2 | 9; the commonest is 20% |
| results-board | 17 | 12 / 5 / 0 | orange 7, amber 4, cyan 4 | `wide/mid` 65%, `strap/mid` 5 (the four timing towers, upper), `wide/tall` 1 | 10; the commonest is 18% |
| reveal | 16 | 12 / 4 / 0 | orange 7, cyan 3 | `full-width/tall` 69%, `strap/tall` 2, `strap/thin` 2 | 11; the commonest is 25% |
| starting-soon | 21 | 20 / 0 / 1 | none 8, orange 6, amber 4 | `full-width/tall` **100%** | 6; the commonest (dark, no accent, full) is 33% |
| end-credits | 12 | 11 / 0 / 1 | orange 5, amber 2, cyan 2 | `full-width/tall` **100%** | 6; the commonest is 42% |
| alert | 13 | 11 / 1 / 1 | **azure 7**, rose 2 | `full-width/thin` 5, `wide/thin` 2, `strap/mid` 2, `wide/mid` 2, `full-width/mid` 1, `strap/thin` 1 - the widest spread of any category, and the only one where amber is not the top accent | 11 of 13 distinct |
| public-info | 12 | 10 / 0 / 2 | orange 4, none 3 | `wide/mid` 67%, `full-width/thin` 1 (`pi04`) | 8; the commonest is 33% |
| game-timer | 6 | 4 / 1 / 1 | none 2, orange 2, red 1, azure 1 | `strap/thin` 4, `strap/mid` 2; four upper | 6 of 6 distinct |
| versus | 2 | 1 / 1 / 0 | azure 1, rose 1 | `full-width/tall` 2 | 2 of 2 |
| frame | 15 | 9 / 6 / 0 | orange 7, cyan 2, amber 2 | `full-width/tall` **100%** (a surround is full-frame by construction) | 10; the commonest is 27% |
| transition | 10 | 8 / 0 / 2 | orange 3, none 3 | `full-width/mid` 6, one each of `full-width/tall`, `strap/tall`, `wide/tall`, `full-width/thin`; shot 2.2 s in, so mid-wipe | 8; the commonest is 20% |
| esports-score | 9 | 7 / 2 / 0 | orange 4, amber 3, cyan 2 | `wide/thin` 4, `strap/mid` 4; five upper | 7; the commonest is 22% |
| stream-notification | 4 | 3 / 1 / 0 | one each | `strap/thin` 4, all lower | 4 of 4 |

The vertical position is read off the same JSON (`box.y`), which the sweep computes and does
not print; "upper" here means the ink's centre sits above 40% of the frame.

What the numbers say, read together with §3:

- **Lower thirds: 93% one silhouette, still.** Four shapes were added, two on 2026-08-23 and two
  on 2026-08-28, and six near-duplicates retired; the share moved from 96% to 93%, which is the
  honest size of four designs against 101. Colour is spread (nine hues, and `spreadFirstPage` shows them);
  shape is not, and the news band, the flagship talk strap and the red-carpet strap in §3 are
  three more shapes, not three more colours.
- **The quiz shelf is ONE design in four families.** Twelve boards, one footprint bucket, one
  vertical position, four distinct card looks. The game-show column of §5 is short of shapes
  before it is short of kinds, and the ladder, the grid and the survey board in §6 are the
  shapes.
- **Only the categories that are full-frame by definition fill the frame**: holding screens
  (21 of 21), credit rolls (12 of 12), versus cards (2 of 2), reveals (11 of 16) and match-ups
  (9 of 12). Info cards, the category that holds every title card and opener, have no
  `full-width` design and one `tall` one. That is the measurement behind §6 item 4: the shelf
  has no full-frame open because the category that would hold it is drawn as panels.
- **The upper band is empty of anything but furniture.** Across 494 designs measured, the ink
  sits in the upper band on 60: 21 corner bugs, 11 scorebugs, five esports strips, four timing
  towers, four game timers, two tickers, two clocks (`ls30` `ls36`), one standings stack
  (`ig03`), one comparison (`h201`), one name block (`lt66`), and eight transitions caught
  mid-wipe. Nothing with a headline and a picture sits there, which is §6 item 1's position.
- **The house amber is still the single largest accent in every category measured** (orange
  plus amber: 38 of 101 lower thirds, 48 of 83 info cards, 8 of 12 quiz boards, 21 of 37 bugs).
  A design's default palette is a per-design decision the backlog's item 3 owns; §8 says what
  each genre conventionally carries, so that decision has an input.

## 8. What each genre's defaults conventionally are (input to the per-design defaults work)

The backlog's third item is that a design's default palette and default entrance should be
chosen FOR that design, so the thumbnails stop converging on amber and a wipe. This section is
the conventional answer per genre, from the same sources as §3, so that work starts from a
reference instead of a preference. The wizard's fourteen palettes (`src/model/wizard.ts`
`PALETTES`) cover four of the six registers as they stand: news has `royal`, `signal`, `ivory`
and `porcelain`; sports has `volt`, `inferno`, `signal` and `royal`; game show has `royal` and
`orchid`; podcast has `noir` and `porcelain`; the documentary half of film has `noir`. **Two
registers have no palette**: the gala's gold or champagne on black (`ember` is the nearest and
reads as amber, which is the house colour again), and the morning show's warm daytime coral,
teal or yellow on cream (`porcelain` is light and has no warm accent). Those two are new
palettes, one entry each in `PALETTES`, and are the only part of the defaults work that is not a
per-design config line.

| Genre | Conventional palette | Conventional entrance | Type register |
|---|---|---|---|
| News | cool navy or blue ground, RED reserved for breaking; light desks use white and blue | a fast mask wipe or a cut-in, 0.4-0.6 s; nothing bounces | neutral sans, tight, two weights; the flipper ticker holds still |
| Sports | TEAM colours carry the bug; one broadcaster hue for furniture; solid grounds read on grass | snap slides and slams, 0.3-0.5 s; the goal flash overshoots | condensed heavy caps for scores, tabular figures |
| Game show | saturated blue, violet and gold with glow; big colour fields, bevels and rings | pops with overshoot, flashes on reveal, a drum-roll hold before a verdict | large rounded display type; numerals huge |
| Talk / morning | warm and bright: coral, teal, yellow on white or cream by day; deep warm by night | soft slides and rounded reveals, 0.6-0.9 s | friendly wide sans, flagship 65-92 px names (`docs/DESIGN_LANGUAGE.md` §1) |
| Podcast | ONE bold hue on black or white; mono or geometric | typographic: masks up, words land in sequence | geometric or mono; lower case is common |
| Film / awards | gold or champagne on black; documentary: no panel, a scrim | slow fades 0.8-1.2 s, nothing travels far | a serif for the gala; wide light caps for the documentary |

The catalog's current defaults per pack: newsroom `ivory`, talk-show `frost`, everything else
each design's own, which is amber for a third of the shelf.

## 9. The recurring drawing slot

The owner asked for it in these words: *"We need to keep on adding templates; it could be once
a week or each night we add something, so we end up with a catalog full of high-quality,
different types of graphics, and they should be innovative and beautiful."*

**Weekly, not nightly, and a package, not a card.** A nightly single card is the process that
produced 101 straps: each session invents its own idea of what is missing and draws the shape
it knows. The complaint is sameness, and sameness is what many small independent draws
converge on. So:

- **Cadence.** One drawing row per week, on the orchestrator's Tuesday rhythm, routed as a
  design row (`opus high`, consulting `design-consult` for the taste call: a judgement about a
  look, not volume).
- **Input.** The top unclaimed item of §6. The row's prompt names the item, the genre, the
  reference convention from §3 and the register from §8. It does not say "make something
  different"; that is the sentence this document exists to retire.
- **Output, per week.** One named absence closed as a SET that runs a show: the new silhouette
  plus the two or three siblings it is always on screen with, in one genre-appropriate look
  (item 2 is the model: ladder + question board + podiums, one game-show look). Three to four
  designs, not one, and not twelve skins.
- **Proof, before review.** The sweep row the item names (§6 gives the bucket per item): if the
  footprint bucket the design claims does not appear when `card-look-sweep` runs on its
  category, the shape claim failed and the design is not done. Then `taste-frame-review` and
  `docs/VISUAL_TASTE_REVIEW.md` answered in writing, as `/check` already requires for anything
  that moves a graphic's look. Then the owner-queue file with a route: he sees every one
  (`docs/acceptance/owner-queue/`, nothing expires).
- **Bookkeeping.** The row updates §5's cell and §6's entry from ABSENT to HAVE with the ids,
  in the same commit as the designs. A gap table nobody updates becomes the next thing to
  re-survey.
- **When §6 is empty.** The row re-runs §3 for the next six formats off the sheet (esports,
  corporate and webinar, church and ceremony, commerce, education, wellness) and refills the
  list. The sheet has sixty rows; this document did six genres' worth.
- **What a nightly slot is for instead, if one is wanted.** Config, not drawing: the per-design
  default palette and entrance (§8, backlog item 3) is one line per design and can be walked
  through the catalog a category a night, with the first-page spread measured after each. This
  does not unpark the nightly graphics library `docs/GOALS.md` parks; it is the defaults work
  under a different clock.

**What would register this, and is not done here.** This section is a proposal, and a proposal
is a memory-only trigger until something reads it (`docs/MISTAKE_TRIGGERS.md`). Three
mechanisms would make it fire without anyone remembering: a row in `docs/ROUTINES.md` for the
weekly drawing row, whose prompt is generated from the top unclaimed entry of §6; a check, in
the shape of `scripts/check-docs-index.mjs`, that every design id this document names as HAVE
resolves in the catalog and that no id it names as ABSENT has since been filled, so §5 cannot
go stale silently; and the §6 entry moving to HAVE in the same commit as the designs, which the
routine's prompt states as an acceptance condition rather than a courtesy. The orchestrator
accepting the cadence owns the first; the second is a half-day script and is filed in the
handoff as the next mechanical row.

Twelve items at one a week is a quarter. The owner set his own review point: *"let's see again
after this wave how I feel about it."* Item 1 and item 2 are the two to show him first, because
one is the graphic every news and talk desk lacks and the other is the graphic his own
2026-09-12 production is.

## 10. What this survey did not do

- It did not draw anything. The product is §5 and §6.
- It did not register the cadence. §9 is a proposal and names the three mechanisms that would
  make it fire; none of them is in this change.
- It surveyed six genres, which is twenty-two of the sheet's sixty rows. The other thirty-eight
  are joined to packs but not to kinds.
- Three sources refused to be fetched and are quoted from search summaries only:
  NewscastStudio's package glossary and OTS pieces, the SVG scorebug article, and the CBS
  Mornings bar. The lines that rest on them are marked in §3.
- Lines marked "convention" have no source behind them but broadcast literacy. There are
  seven: the full-width two-tier news band, the goal flash, the on-pitch formation as a
  graphic, the picture-led guest line-up, the persistent topic bar, the episode number card,
  and the review desk's fact box and stars. Each is also asked for by a sheet row, which is
  why it is listed at all.
- The kit-model question (`docs/KIT_MATRIX_GAPS.md`: 151 orphans no kit can offer) is untouched.
  Every new design drawn against §6 that has no graphic TYPE joins the orphans unless it is
  named in a pack's `extras`; the drawing row should do that in the same commit.

## 11. Sources read this session

Fetched and read: `live_format_graphics_needs.xlsx` (repo root, untracked, 2026-07-08, 60
rows); Wikipedia "Score bug", "News ticker", "Digital on-screen graphic", "Breakfast
television", "Who Wants to Be a Millionaire?", "Jeopardy!", "Family Feud";
keepthescore.com "Broadcast Scorebugs by Network" (2026); spx.graphics/game-shows;
videohead.io/for/podcasters; resources.overlays.uno podcast checklist;
soundstripe.com "A Documentarian's Guide to Lower Thirds"; videohive.net items 13256511
(Awards Show Pack) and 22161723 (Entertainment Broadcast Package); elements.envato.com items
V75FE8V (sports TV package) and VXBZLEU (soccer on-air package).

Search summary only (fetch refused): newscaststudio.com "TV news graphics package" and the
NBC Nightly News OTS pieces; sportsvideo.org "Designing the Modern Scorebug" (2026-06-09);
newscaststudio.com on CBS Mornings (2024); the gameshows and millionaire fandom pages.

Repo: `docs/CATALOG_VARIETY.md`, `docs/CATALOG_WORK_QUEUE.md`, `docs/LOWER_THIRD_SHAPES_BRIEF.md`,
`docs/PACK_TAXONOMY.md`, `docs/KIT_MATRIX_GAPS.md`, `docs/TEMPLATE_TAXONOMY_PROPOSAL.md`,
`docs/DESIGN_LANGUAGE.md`, `docs/COMPETITORS.md`, `docs/COMPETITOR_MXMZ.md`,
`docs/backlog/template-variety-and-dedup.md`, `docs/backlog/unique-first-catalog.md`,
`docs/backlog/more-behaviours-than-poll-and-quiz.md`.

## 10. Ratified, with two amendments and one precondition (owner, 2026-09-04)

He read §6 and §9 and settled the cadence:

> I totally agree that we need to be coordinated when doing this... I agree that a weekly package
> of three or four designs is a good pace.

And retired his own earlier phrasing, which §9 had argued against:

> you shouldn't take me literally when I say "every night." It's just representing the amount of
> work I believe it will take to fill our template gallery with every graphic that people will
> need.

**Amendment 1: the twelve are not the whole job.** He accepted all twelve and added a thirteenth
kind of work that §6 does not contain, because §6 only ranks ABSENT silhouettes:

> We should also create more of the graphics that we already have, for example, lower thirds. Even
> though we have many lower thirds, there are so many different types of lower thirds that one
> could have that we need to have a bit of a broader repertoire in those too, because we used kind
> of the same default look. This is very difficult. We need to be creative and look at references
> and stuff like that, and it takes time.

So variety WITHIN a kind is its own strand, and §7's measurement is the evidence for it: 93% of
lower thirds are one silhouette. A weekly row that only ever closes a §6 absence never touches
that. Filed as `docs/backlog/variety-within-a-kind-not-only-absent-ones.md`.

**Amendment 2: drawing is the FILLER, and it yields.** This is a scheduling ruling and it binds the
orchestrator, not this document:

> we should add graphics when we have time and space in the nightly waves. If we have more
> important work, bugs that need to be fixed, or features that need to be implemented, we can skip
> these graphics.

A skipped drawing row is therefore correct behaviour, not a missed commitment, and needs no
explanation in a handoff. The weekly cadence in §9 is a ceiling, not a floor.

**The precondition, and it gates the whole cadence:**

> one thing I want to make sure of before we implement more graphics is that it won't make our site
> heavier. It won't make our CI and E2E tests take even longer, because right now iteration speed
> is still more important than a broad template gallery.

**ANSWERED 2026-09-04, and the cap it carried is lifted.** Run `npm run check:catalog-cost` for
today's numbers; the reasoning and the measurement are in `docs/TEST_SELECTION.md`, "What one more
graphic costs". At 502 designs:

- **Ordinary CI is safe, and that is what he proposed himself.** `scripts/catalog-affected.mjs`
  exists for exactly this reason - it was built after his 2026-08-28 complaint that any template
  change "takes a lot of effort from the computer". A change touching one design measures that
  design and the designs that import it, not the set, and that run is half a minute however large
  the catalog is. His remedy - *"cut all graphic templates from all the runs, so we can add to them
  and then, at some point, run them all together"* - is what this already does.
- **The prerender costs about 1 ms per design**, measured live by the check. Design 503 adds a
  millisecond to every build.
- **A FULL sweep costs 1.25 s per design**, and only happens when a SHARED file changes: 10.9
  minutes today, 13.0 at 600 designs. This is the only line that grows, so it is the one to
  re-measure - two dispatches of `catalog-gates.yml`, about fifteen minutes, no laptop.
- **The landing page and the studio are not heavier for a design nobody opens**, but `/ograf` and
  `/bridge` are: those two pull the catalog chunks from their own entry scripts, 3.7 MB and 2.3 MB,
  at about 7 KB per design. `/app` reaches its catalog chunk through a dynamic import after boot
  and `/` reaches none. That is a chunking fault on two pages rather than a reason to draw fewer
  graphics, and it is filed as `docs/backlog/ograf-and-bridge-ship-the-whole-catalog.md`.

So three or four designs a week is inside the noise for years rather than for a quarter, and the
cadence is a ceiling for the reasons in §9 alone.
