# Catalog expansion plan

Date: 2026-07-30

## Executive decision

NoaCG does not primarily need more lower thirds. It needs better coverage of complete production
workflows.

The current catalog has 391 wizard variants across 22 wizard categories. The browse taxonomy maps
390 real templates into 26 graphic categories, but the distribution is highly uneven:

| Strong coverage | Count | Thin coverage | Count |
| --- | ---: | --- | ---: |
| Lower thirds | 82 | Sponsor panels | 2 |
| Bugs and corner logos | 41 | Maps and location | 2 |
| Scoreboards | 27 | Captions and lyrics | 3 |
| Reveals and matchups | 24 | Frames and layouts | 4 |
| Polls, voting, and quizzes | 22 | Stingers and wipes | 4 |
| Information cards | 20 | Calls to action and QR | 5 |
| Questions and chat | 20 | Goals and progress | 5 |
| Tickers and crawls | 20 | Statistics and data | 5 |

Template count also overstates visual variety. The July catalog audit reduced the then-current
387 variants to about 135 structural designs, with 200 variants belonging to pure style-reskin
groups. The current style distribution is similarly lopsided:

| Family | Variants |
| --- | ---: |
| Minimal | 112 |
| NoaCG | 93 |
| Sport | 86 |
| Glass | 85 |
| Editorial | 7 |
| Cinematic | 7 |

The graphic-type matrix is 229 of 378 cells filled. Of the 149 empty cells, 124 come from
editorial and cinematic having only the lower-third type represented. The other 25 are holes in
otherwise established families, especially calls to action, commerce, goals, brackets, players,
and winner graphics.

The expansion should therefore optimize for usefulness density:

1. Make existing graphics honestly discoverable.
2. Complete the two missing style families across the most-used graphic types.
3. Fill the streaming, sponsor, frame, transition, data, caption, and map holes.
4. Build coherent programme kits instead of accumulating unrelated variants.
5. Add new variants only when they represent a new operator job, layout, state flow, or
   production convention.

## What is missing

### 1. Discoverability is masking existing coverage

The taxonomy declares useful subtypes, but derived metadata often collapses a whole type family
onto one fallback subtype. Examples in the current catalog:

- All 20 audience graphics browse as `viewer-question`, even though Q&A cards, chat highlights,
  queues, and community requests exist.
- Brackets and result tables can browse as generic leaderboards.
- Holding screens all browse as `starting`, even though the files include breaks, technical
  pauses, and sign-offs.
- Credits all browse as `end-credits`, obscuring thank-you, donor-wall, and role-credit uses.
- Reveal metadata does not expose nominee, before-and-after, or sold subtypes.
- Frame metadata reports four webcam graphics and no split-screen, reaction, visualizer,
  background, or screen-share entries, even though some layouts attempt those jobs.

This is a product gap because a graphic the user cannot find by its real job is functionally
missing. Fix subtype declarations and search aliases before judging demand from browse usage.

The word `alert` also has a direct vocabulary collision:

- Broadcast users mean breaking news, weather warning, or civil emergency.
- Streamers mean follower, subscriber, membership, donation, gift, or raid notification.

Create a separate stream-notification concept. Do not mix streamer events into the public-warning
category.

### 2. Editorial and cinematic are not real packages yet

Both families have excellent binding design-language definitions but only seven catalog variants
each, concentrated in lower thirds. They need sibling graphics that could actually run in one
show.

Editorial should first cover:

- Show, session, and segment titles
- Topic, coming-up, quote, fact-check, and explainer cards
- News ticker, breaking strap, public notice, and source bug
- Agenda, results table, KPI board, and election result board
- Sponsor read, QR card, and credits

Cinematic should first cover:

- Show open, act or chapter title, and now-playing card
- Documentary quote, location card, and interview frame
- Concert holding screen, set list, lyrics, and credits
- Nominee, winner, award, and product-launch reveals
- Sponsor panel and restrained stinger

Do not mechanically clone the lower-third CSS. Each design must use the family tokens while
respecting the destination category's geometry and operator job.

### 3. The standard streamer pack is incomplete

NoaCG has creator-adjacent pieces, but not the package a streamer expects to install:

- Follower, subscriber, membership, donation, gift, and raid notifications
- A queued notification player with hold, skip, and replay controls
- Chat box and recent-event activity feed
- Goal bar and milestone celebration
- Emote or audience-reaction wall
- 16:9, 4:3, portrait, circular, gameplay-plus-camera, and chat-side frames
- Matching starting, BRB, technical-pause, and ending scenes
- Matching CSS and alpha-video stingers
- Optional sound hooks, with silence as the safe default

The first version can be operator-driven and export cleanly without a platform feed. A later
connector layer can translate Twitch, YouTube, or another provider's event into the same stable
template event and data contract.

### 4. Sponsorship is underbuilt

Sponsor panels have only two browse entries even though sponsorship is central to amateur sport,
local television, events, education, worship, and fundraising.

The target sponsor family should include:

- Persistent sponsor bug
- Single presenting-partner plate
- Multi-logo strip
- Full sponsor wall
- Timed sponsor rotation
- Sponsored-segment intro and outro
- Presenter-read card with talking points
- Match, replay, weather, and results sponsorship variants
- Donor wall and funding-goal pairing

Rotation must be a real state-machine timer with pause, next, previous, and snap recovery. It must
not be an unreachable CSS opacity loop.

### 5. Frames, holding scenes, and transitions are placeholders

Four frames and four CSS transitions are not a credible package. Many holding graphics also paint
only a small card on transparency when the operator expects a full-frame scene.

Build layout archetypes before style variants:

- One-camera 16:9 and 4:3
- Portrait guest
- Circular presenter
- Two-up interview
- Three-person panel
- Four-person grid
- Screen share with presenter inset
- Gameplay with player camera
- Reaction layout
- Vertical programme layout
- Sponsor-rail layout
- Full programme frame with safe lower-third and bug zones

Then build transition archetypes:

- Brand wipe
- Replay wipe
- Score or goal wipe
- Chapter transition
- Sponsor bumper
- Glitch cut
- Light sweep
- Paper or editorial page turn
- Cinematic iris or matte reveal

CSS/SVG versions should remain first-class and offline. Add an alpha-video asset layer for richer
stingers without making video mandatory.

### 6. Data graphics are too shallow

The `stats` category has five entries, all currently classified as stat panels. Real programmes
need:

- Horizontal and vertical bar charts
- Line and area trends
- Donut and proportion graphics
- KPI grids with deltas
- Comparison tables
- Election seat counts and swing
- Finance price, delta, volume, and sparkline panels
- Sports shot, possession, and player-comparison boards
- Fundraising totals over time
- Weather day cards, warning zones, and forecast strips
- Heatmaps and simple zone maps

Start with operator-entered, structured data and deterministic inline SVG. This adds useful
graphics without waiting for external feeds. Later, bind the same fields to Google Sheets,
JSON/REST, RSS, or provider connectors. Do not add a hidden chart scene model.

Maps need an honest boundary:

- Imported map artwork plus editable labels, routes, pins, and zones can ship offline now.
- Geographic projections, tile services, and live weather radar belong to a later data-source
  layer.
- Every export must remain self-contained and must not depend on a CDN.

### 7. Captions and timed text barely exist

The taxonomy has three entries, all translations. Add:

- Single-line live caption
- Two-line broadcast caption
- Speaker-labelled caption
- Bilingual caption
- Song lyric and worship lyric
- Theatre surtitle
- Karaoke-style current-line highlight
- Prepared quote or scripture sequence

The first useful version can be operator-stepped through a list with `next()` and `previous`
events. Feed-driven captions and automatic speech transcription are separate integration work.

### 8. Vertical is a layout system, not a resolution toggle

Every high-priority family should eventually ship at least one 9:16 layout for:

- Creator alerts and chat
- Sports scorebug and player card
- News headline and live location
- Product card and offer countdown
- Speaker lower third and captions
- Poll, question, and goal

Do not scale a landscape island into a portrait frame. Vertical variants need new wrapping,
anchoring, camera holes, safe areas, and information hierarchy.

## Programme kit requirements

### Sports and amateur sport

- Scorebug for period, set, inning, leg, or round
- Match clock, shot clock, penalties, possession, and timeout state
- Team and athlete introductions
- Starting lineup, formation, fixtures, standings, bracket, and timing tower
- Player comparison, match stats, substitutions, injuries, and final score
- Replay wipe, goal or point moment, sponsor bug, and sponsored replay

Discipline-specific scoring should be configuration where the field model is the same. Create a
new graphic type only when the operator flow or structure actually differs.

### Esports and gaming

- Series score, map or round indicator, map veto, draft or pick-ban
- Team roster, player card, head-to-head, economy or objective panel
- Gameplay-plus-camera frame and sponsor rail
- Tournament bracket, standings, MVP, winner, and next-match card
- Stream notifications, chat, activity, goals, and glitch stinger
- Tabletop initiative tracker, turn indicator, dice result, and character status

### News, weather, election, and finance

- Breaking strap, live locator, source and verification bug
- Headline stack, quote, fact-check, explainer, and timeline
- News ticker and market ticker
- Weather now, multi-day forecast, warning zone, and map
- Candidate lower third, seat count, vote share, swing, and result map
- Market KPI, price chart, index heatmap, and session clock
- Debate speaking timer and press-conference question card

### Talk shows, podcasts, and radio

- Single and two-person lower thirds
- Remote interview frames, topic card, chapter card, and coming-up
- Viewer question, Q&A reveal, chat highlight, and poll
- Quote or excerpt card, now-playing card, and guest social CTA
- Sponsor read, break bumper, clock, and end credits

### Corporate, conference, and education

- Event opener, session title, speaker lower third, and moderator panel
- Agenda, chapter, key term, process, checklist, and recap
- KPI, comparison, quote, QR, and call to action
- Screen-share frame, remote panel, question queue, and speaking timer
- Captions, translations, sponsor partners, certificate or thank-you closing

### Music, stage, awards, and fashion

- Artist or performer lower third, now playing, set list, and lyrics
- Act, scene, or chapter title and surtitle
- Nominee, winner, award, and red-carpet identification
- Run of show, intermission, sponsor bumper, and credits
- Cinematic frames, ambient holding scenes, and stingers

### Commerce, auction, real estate, and fundraising

- Product hero, price, variant, comparison, and stock
- Offer countdown, QR, buy CTA, and legal disclaimer
- Auction lot, current bid, next bid, bidder status, and sold reveal
- Property hero, specifications, map or area, price, and agent CTA
- Donation goal, milestones, recent donors, sponsor wall, and thank-you

### Worship, graduation, wedding, and memorial

- Service or ceremony opener, order of service, and officiant lower third
- Scripture, reading, lyrics, prayer, and bilingual text
- Graduate, couple, honoree, or memorial identification
- Programme, donor or partner thanks, photo-backed holding scene, and credits

### Civic, medical, legal, and emergency

- Severity-aware alert, official notice, instruction steps, and helpline
- Source, update time, location, map zone, and bilingual panel
- Agenda, speaking timer, vote result, and public-comment queue
- Disclaimer, fact panel, accessibility caption, and sign-off

### Fitness, wellness, and ambient programmes

- Exercise name, coach lower third, interval timer, round and rep counter
- Current and next move, effort zone, progress, and milestone
- Safety note, music or meditation chapter, nature fact, and clock
- Calm full-frame holding scenes with subtle idle motion

## Delivery sequence

### Phase 0 - Catalog truth and integration rules

1. Correct subtype metadata for existing audience, results, holding, credits, reveal, frame, and
   caption graphics.
2. Update stale planned counts.
3. Separate broadcast alerts from stream notifications in naming and search aliases.
4. Add a catalog report that fails when a declared subtype is unexpectedly empty or when a type
   family collapses to the wrong fallback.
5. Record file ownership for each parallel worktree. Keep shared registry edits in one integration
   worktree when possible.

Exit criteria:

- Search for "chat highlight", "bracket", "BRB", "donor wall", and "screen share" returns the
  correct existing graphics.
- `validateTaxonomy()` and the new subtype report are green.

### Phase 1 - Make editorial and cinematic usable

Build 16 high-value siblings per family, prioritizing title, topic, info, ticker, alert, results,
holding, credits, sponsor, frame, transition, question, caption, and reveal jobs.

Then fill the remaining 25 holes in minimal, sport, glass, and NoaCG for calls to action, commerce,
goals, competition, and winners.

Exit criteria:

- A complete editorial Newsroom kit and cinematic Stage kit can be assembled without borrowing
  another family's design.
- Every new variant names and visually matches its lower-third sibling.
- The factory matrix shows material progress without weakening any conformance gate.

### Phase 2 - Ship a complete streaming pack

Build one coherent 24-32 design pack spanning notifications, chat, activity, goals, frames,
holding scenes, and stingers. Use a small number of reusable stateful types rather than one type
per event label.

Exit criteria:

- An operator can manually trigger and queue every event without a provider connection.
- Notifications can hold, skip, replay, time out, snap hidden, and recover deterministically.
- The pack exports and works in OBS/vMix and the existing broadcast targets.

### Phase 3 - Deepen the thin broadcast utility categories

Targets:

- Sponsor panels: 2 to at least 12
- Frames: 4 to at least 16 structural layouts
- Transitions: 4 to at least 12
- Captions: 3 translations to at least 10 timed-text layouts
- Maps: 2 pins to at least 8 imported-map and route/zone layouts
- Statistics: 5 stat panels to at least 16 chart and KPI layouts

Counts are floors, not quotas. A design must add a new job or structure.

### Phase 4 - Programme-specific depth

Build the highest-value missing operator graphics:

1. Sports discipline overlays and sponsor moments
2. Weather, election, and finance data boards
3. Commerce, auction, property, and fundraising live states
4. Tabletop initiative and turn graphics
5. Captions, lyrics, and surtitles
6. Fitness interval and rep systems

### Phase 5 - Data connectors and richer media

After the field and event contracts have proven stable:

- Bind FieldDescriptors to Google Sheets, JSON/REST, and RSS.
- Add provider adapters for stream notifications.
- Add alpha-video assets and sound hooks.
- Add optional offline QR generation.
- Add feed-driven timed text.

These integrations should feed the same graphics built in earlier phases, not create a second
template model.

## Worktree boundaries

The first parallel wave should use four worktrees:

| Worktree | Owns | Avoids |
| --- | --- | --- |
| Stream notifications | New stream-notification directory, its type/runtime, and the one taxonomy integration | Existing frame, holding, sports, and info-card implementations |
| Editorial/cinematic information systems | Info cards, tickers, public info, alerts, captions | Full-frame scenes, frames, transitions, sports |
| Full-frame and layout systems | Holding screens, frames, transitions, end credits | Taxonomy redesign and data boards |
| Competitive programme depth | Scoreboards, game timers, competition boards, sports infographics | Streaming alerts and full-frame scenes |

Merge those before starting sponsor/commerce and general data-viz work, because those later passes
need to touch several of the same info-card and infographic registries.

## Model recommendation

Use `gpt-5.6-sol` for all creative catalog worktrees, with high reasoning as the default. Use
xhigh for new state-machine types, animation runtimes, data-viz primitives, or cross-category
contracts.

This is a quality-first recommendation, not a claim that smaller models cannot do the work.
OpenAI's current model guidance identifies `gpt-5.6-sol` as the flagship-capability model and
specifically calls out stronger frontend aesthetics, layout, visual hierarchy, and design
judgment. Those are the exact failure modes this catalog expansion must solve.

`gpt-5.6-terra` is reasonable for later mechanical family fills after a gold-standard sibling and
strict visual references exist. It is not the preferred starting model for defining a new graphic
language. `gpt-5.6-luna` is better reserved for high-volume classification or metadata cleanup,
not final creative template authorship.

Official source:
[OpenAI - Using GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model)

## Ready-to-paste worktree prompts

### Prompt 1 - Streaming notifications and activity

```text
Build NoaCG Studio's first complete streaming notification and activity pack.

Use gpt-5.6-sol with high reasoning. Work only on a feature branch in this worktree. Read the
root instructions, docs/DESIGN_LANGUAGE.md, docs/GOALS.md, docs/STATE_MACHINE_SCHEMA.md, and the
nested AGENTS.md files for templates, model, blocks, and components before editing.

Create a distinct stream-notification concept instead of adding follower events to the existing
broadcast alert category. Cover follower, subscriber/member, donation, gift, and raid through one
parameterized event-notification type. Add a deterministic hidden -> enter -> hold -> exit machine
with manual hold, skip, replay, snap recovery, and an internal serial queue. Fields should cover
event label, actor, amount/count, message, and optional avatar/icon. Add sound hooks only if they
degrade safely to silence and remain self-contained.

Also add a compact recent-activity list and a persistent chat-box layout if they can share the
same event/data contract cleanly. Start with four genuinely different visual designs: NoaCG,
minimal, sport/gaming, and glass. Do not make four palette reskins.

Preserve code as the single source of truth, ES5 template JS, marked animation regions, direct
field-to-DOM mapping, offline exports, and the existing control generator. Do not add provider
APIs in this worktree.

Verify with npm run build, the type and factory gates, the affected category sweep, runtime bench,
type-floor and overflow checks, focused Playwright coverage for queue/hold/replay/snap behavior,
and critical screenshot review at 1920x1080. Commit the verified phase to the feature branch and
stop without merging.
```

### Prompt 2 - Editorial and cinematic information systems

```text
Turn editorial and cinematic from lower-third-only looks into usable information
systems.

Use gpt-5.6-sol with high reasoning. Limit ownership to info cards, tickers, alerts/public-info,
and captions so this worktree can run beside full-frame and sports work. Read the applicable
contracts first.

Build editorial siblings for session/segment title, topic/coming-up, quote/fact-check, explainer,
news ticker, breaking strap, public notice, source attribution, agenda/results board, sponsor read,
and prepared caption. Build cinematic siblings for chapter title, now playing, documentary quote,
location, prepared caption/lyric, and restrained alert where the category is appropriate.

Each variant must name its lower-third sibling and reuse the exact family tokens in
docs/DESIGN_LANGUAGE.md. Editorial uses printed rules, hierarchy, flat surfaces, and whitespace.
Cinematic uses scrims, light wide type, hairlines, and restrained sine motion. Do not reproduce
dark rounded glass cards with a different palette.

Prefer existing graphic types and shared assemblers. Add a type only when the state flow or field
contract is genuinely new. Keep all text auto-fitting and above the type floor.

Verify with npm run build, factory matrix, taxonomy validation, affected sweeps, type-floor,
overflow, catalog capacity bench, and screenshot contact sheets reviewed as coherent packages.
Commit and stop without merging.
```

### Prompt 3 - Full-frame scenes, frames, and transitions

```text
Rebuild NoaCG's full-frame offering so holding scenes, camera layouts, and transitions
look like premium package assets.

Use gpt-5.6-sol with xhigh reasoning. Own only src/templates/startingSoon,
src/templates/frames, src/templates/transitions, src/templates/endCredits, their direct presets,
and focused tests. Read the template, model, block, preview, and export contracts before editing.

First reproduce the audit finding that several holding screens render as a small card on
transparency. Upgrade every intended full-frame holding/BRB/intermission/ending design to paint an
intentional background with subtle idle motion. Preserve transparent holes only where a camera or
screen source belongs.

Add structural frame layouts for 16:9, 4:3, portrait guest, two-up interview, three-person panel,
screen share plus presenter, gameplay plus camera, reaction, sponsor rail, and a 9:16 programme.
Add transition archetypes for replay, sponsor bumper, chapter change, sport impact, editorial page
turn, and cinematic matte/iris. CSS/SVG must remain first-class and offline. Do not add a runtime
CDN.

Hold the rendered UI to a pixel-perfect bar. Inspect camera-hole geometry, safe areas, labels,
ambient motion, transition cut point, self-clearing behavior, replay, and snap recovery.

Verify with npm run build, category sweeps, runtime bench, type-floor, overflow, catalog bench,
focused transition/frame Playwright tests, and screenshots at landscape and portrait sizes.
Commit and stop without merging.
```

### Prompt 4 - Competitive programme depth

```text
Add the highest-value missing sports, esports, and tabletop operator graphics without
duplicating the existing competition pack.

Use gpt-5.6-sol with high reasoning. Own scoreboards, game timers, competition boards, and sports
infographics. Read docs/SPORTS_PACK.md, docs/COMPETITION_PACK.md, the state-machine schema, design
language, and nested contracts first.

Audit existing coverage before coding. Then add only structures that are genuinely absent:
discipline-aware score states, penalties/timeouts, substitution or match-event card, player stat
comparison, possession/shot board, sponsored replay plate, map veto or pick-ban, objective/round
status, and a tabletop initiative/turn tracker. Prefer parameterized data over near-identical
states. A sport variation is configuration when the operator flow and field shape are the same.

Every graphic must degrade to a useful default path, support snap recovery, use direct field DOM
ids, and remain exportable offline. Use sport motion deliberately: short snap-stingers, controlled
skew, and strong hierarchy. Add no decorative statistic that cannot be edited by an operator.

Verify with npm run build, the factory and type gates, affected category sweeps, runtime bench,
type-floor, overflow, catalog capacity bench, focused Playwright state-flow tests, and screenshot
review using realistic long team/player names. Commit and stop without merging.
```

## Definition of done for every catalog worktree

- The work adds an operator job, structural layout, state flow, or meaningfully distinct art
  direction.
- It names its sibling package and looks coherent beside it.
- It uses the shared `:root` tokens and both scale knobs.
- Text survives long values, broadcast compression, and the category capacity bench.
- Motion is choreographed, deterministic, pauseable where continuous, and recoverable by snap.
- Generated code is readable, commented, ES5-flavored, and self-contained.
- SPX validation and every export gate remain authoritative.
- `npm run build` is green.
- Relevant sweeps, benches, E2E flows, and rendered screenshots are green and inspected.
- The feature branch is committed and not merged to `main`.
