# SVG Template Library: one library, every graphic type, working with its feature

Authority: owner, 2026-11-21, in a planning session ("NoaCG: Unify SVG Templates and Examples").
Owner on scope: "Everything in this plan", then asked for an independent second opinion before
building. Two independent reviews (so1, so2, 2026-11-21, against draft 29155a0 on base 5de2f40)
both returned "agree with changes"; this revision applies every required change. **Agreed** by
the owner on 2026-11-21 ("the plan is agreed"). It runs as its own plan run.

## Owner brief (summary)

1. Stop treating Examples and Templates as two things. The common name is **SVG templates**; the
   collection is the **Template Library**. Keep previews. Several packages are fine; overlap is not
   a problem, and more templates are better, as long as they are consistent. Do not duplicate
   built-in graphics needlessly; show which looks are already in NoaCG and which are downloads.
2. A customizable SVG template for **every** graphic type NoaCG supports, in particular a Join card
   (QR, instructions), Voting and Results that match it, and Messages and Chat (pasted, live chat,
   Twitch), one flexible model if possible. Add the vote template and the corner game show
   countdown. The countdown pulses in the last 10 seconds and flashes boldly at zero.
3. Most important: a customized SVG works with the feature it was made for. Adding a Join card,
   staging results or showing a message lets the user pick their own design, with data and
   controls working.
4. One name per concept, everywhere.
5. Keep the Illustrator workflow: browse, preview, download, edit, import, use with the feature.
6. Review first, reuse the existing architecture, no parallel system. Do not redesign the import
   workflow (its long dropdown stays out of scope).

## What exists

**The contract base.** An imported SVG gets behaviour from its layer names through:

- **Behaviour recipes** (`src/templates/behaviours/registry.ts:27`, 17 recipes). A recipe declares
  roles, fields, states, controls and paint, and adds **no emitted JavaScript**
  (`behaviours/recipe.ts:17-19`): a behaviour that needs code is a new field **kind** in the
  imported-design runtime (`importedDesign/behaviourRuntime.ts`), added once for every recipe.
  The import step proposes the best-scoring recipe (`naming.ts:208-214`); the operator can
  override. Clock (`clock.ts:133`) and the self-clearing alert (`alert.ts:22-28`, no roles) are
  never proposed: the author chooses them. No match means a plain graphic.
- **Feature contracts by field title**: `QR` layer gives a generated code plus a `Join link` field
  (`importedDesign/svgQr.ts`); Message/Name titles (`control/messageStaging.ts:29-30`, first match
  wins); the vote recipe's emitted fields for results (`control/resultStaging.ts:62`, last match
  wins); the word cloud's own target (`control/wordStaging.ts:25`).
- **Variable-length text**: the svg01 fit ladder (`importedDesign/runtime/svgFit.js`): fill, grow
  if allowed, wrap, shrink to a floor, squeeze; never clip; overflow reported.

**Gaps.**

1. Features never offer saved designs. Join, Results, Messages and Word cloud look only at
   `show.graphics`, then offer hard-coded built-ins. Join has no picker: the first `Join link`
   field wins (`ProductionAudienceWorkspace.tsx:222-223`). A quiz import's `Question` field makes
   it a message destination by accident.
2. Two collections in two styles (`docs/tutorials/svg-templates`, 11, Manrope, hand-written;
   `docs/tutorials/svg-examples`, 22, Oswald, 19 native Illustrator exports with `.ai`). Three
   stray sets read by tests: `docs/svg-samples` (24), `public/docs/examples` (7),
   `docs/tutorials/talk-show-set` (5). Slugs collide: lower-third, quiz, end-credits.
3. Coverage: **72 registered types** (`src/templates/types/registry.ts:64-167`), plus untyped
   kinds (end credits cr01-cr09 and cr11-cr13, cr10 retired; versus; frames; production Picture,
   `templates/picture.ts:80`, not a catalog category) and individual untyped looks (Big Stat
   count-up, Turnout Dial, weather, election boards, breaking banners). About 17 types have an
   SVG. The only gate checks one example per recipe.
4. Many types have controls no existing recipe gives (list below, "Recipe extensions"), and five
   need new runtime kinds (word cloud, ticker crawl, notification queue, speaking timer, sponsor
   rotator with image writes).
5. Naming: Score tracker / Scoreboard; Credits roll / End credits / Credits; Countdown / Game
   timer / Show countdown / Digital clock and timer / Timer; Live vote / Vote result / Poll result;
   Standings / Results / Result table; Alert (self-clearing recipe) / Alert (severity type);
   Lineup / Roster; Meter / Goal meter; name tag / Lower third; Holding screen family; Survey /
   Survey board. Stale counts in docs.
6. Countdown warning and time-up are show/hide only. OGraf export rejects CSS animation
   (`export/targets/ograf.ts:579-581`); motion must be GSAP so `goToTime` can seek it.

## Goal

One Template Library: every registered type, untyped kind, recipe and feature contract has a
working SVG template in one visual family, grouped into packages by use, previewed on one page. A
designer edits it in Illustrator, imports it, and the feature it was made for offers that design
and drives it with its data and controls.

## Decisions

Owner:

- **D1. Scope: everything** in this plan, including new runtime kinds (owner, 2026-11-21). Engine
  behaviours land last (Phase 6) so the library and existing-route templates are not held back.

Planning session, reversible:

- **D2. One visual family, SVG as the maintained source.** Layouts suit each graphic; one type
  system (Manrope, OFL, licence and install note shipped in every zip). New templates are
  hand-written, Illustrator-safe SVG. The 19 native Illustrator sources stay downloadable as
  legacy until an edited replacement proves live text, hidden groups, embedded images and
  off-artboard credits survive Illustrator (owner Q1: yes). Real
  Illustrator exports are archived as importer fixtures in `e2e/fixtures/` before any folder
  moves; they are the only coverage for `unwrapLookWrappers` (`e2e/svg-examples.spec.ts:8-10`).
- **D3. Packages by use plus a full zip**, generated from one inventory where an entry may sit in
  several packages. Zips are built at build time, not committed. Measure preview, zip and deploy
  bytes in Phase 3.
- **D4. Built-in alternatives.** Each entry names the type it customizes and lists "Built-in
  alternatives" when the catalog has designs of that type.
- **D5. One name per concept, labels only.** Recipe ids, type ids, role words and aliases, field
  titles and persisted keys stay. Names: Scoreboard; End credits; Countdown (counts down from a
  duration, game timer); Clock (count-up, duration, or countdown to a set time; not time of day,
  `clock.ts:34-40`); Live vote; Vote results; Poll result stays distinct (it consumes Question and
  Options rows, `types/dataBoards.ts:128`); Standings; Lineup; Goal meter; Lower third; Holding
  screen; Pop-up alert (self-clearing recipe) and Alert level (severity type); Join card; Message.
  Different controls never share a name. Numeric design counts are removed from pages
  `check-copy` treats as selling the catalog (`scripts/check-copy.mjs:118-127`).
- **D6. Feature pickers.** Join card, Vote results, Messages and Word cloud list, in order: the
  production's compatible graphics, the active user's saved compatible graphics, built-ins. See
  "Pickers and targets".
- **D7. Mechanism per behaviour, not "every behaviour is a recipe".** Pure recipe where states,
  controls and paint suffice; a recipe extension where an existing recipe almost fits; a new
  runtime field kind (code in the imported-design runtime, gated by the runtime compatibility
  rule) where code is needed. Each row in the matrix names its mechanism.
- **D8. QR card keeps its built-in behaviour**: an operator-supplied QR image (`f:` picture slot,
  `types/commerce.ts:288-312`). The live `QR` layer stays the Join card's and keeps its `Join link`
  title, so a QR card never appears in the Join picker.
- **D9. Untyped looks map to a family.** Big Stat, Turnout Dial and similar looks are recorded as
  a capability of a family template (count-up, dial) without a file per look. AC-2 covers the 72
  types, end credits (scroll, columns, pager, crawl, static board), versus, frames, Picture, the
  17 recipes and the feature contracts.

## Coverage model

Phase 0 generates the matrix from the registries; the check reads it. Each row has: id, kind
(type, untyped kind, recipe, contract), template file(s), mechanism, status (`covered` or
`planned`), and the **observable proof**: a field update, control or output a test drives. The
check fails if a `covered` row loses coverage or a new id appears without a row. Complete
enforcement (no `planned` rows) switches on when the last gap closes.

The 72 type ids:

lower-third, sponsor-bug, countdown, topic-card, title-card, agenda, social-bug, poll,
holding-screen, sign-off, ticker, scoreboard, speaking-timer, podium-score, quiz-board, quiz-show,
duel-score, now-next, headline-card, process-steps, notice-card, statement-card, key-facts,
recap-card, station-bug, live-bug, logo-bug, sponsor-strip, sponsor-rotator, event-bug, award-bug,
status-chip, transition, call-to-action, product-card, offer-card, listing-card, goal-meter,
milestone-track, qr-card, esports-score, map-round, matchup, head-to-head, player-card, roster,
standings, bracket, timing-tower, nominee-reveal, verdict-card, winner-card, award-reveal,
answer-board-3, answer-board-2, live-poll, result-board, viewer-question, qa-card, chat-highlight,
question-queue, community-request, join-card, word-cloud, alert-level, public-notice,
event-notification, scorebug, match-board, match-status, match-event, fixtures.

**Routes by mechanism** (planning view; Phase 0 confirms each against the type's file):

- **Plain fields, existing**: lower-third, social-bug, call-to-action, title-card, topic-card,
  headline-card, statement-card, now-next, sign-off, station-bug, logo-bug, event-bug, award-bug,
  status-chip, sponsor-strip, sponsor-bug (static), product-card, offer-card, listing-card,
  viewer-question, community-request.
- **Picture slots**: qr-card (D8), frames (transparent camera windows), versus (two replaceable
  logos), Picture (asset-backed file picker; a customized Picture must not take over the
  production upload's own unlinked Picture graphic, `templates/pictureTarget.ts:22`). The
  authored-SVG check gains an allowed picture-slot rule (`check-svg-example-coverage.mjs:35`
  rejects every image today).
- **Existing recipe, as is**: quiz-board, answer-board-3, answer-board-2 (quiz); scoreboard,
  duel-score (score); countdown (countdown); holding-screen (clock, author's choice); standings
  (ranking); live-poll, result-board (vote); goal-meter (meter); process-steps, key-facts,
  recap-card (list); roster (lineup); winner, verdict, nominee and award reveals start from the
  reveal recipe and gain their own controls as recipe extensions; live-bug (choice); end credits (credits); survey, puzzle,
  bingo, switch, Pop-up alert (their recipes).
- **Feature contracts**: join-card (QR + Join link); Message model for viewer-question,
  community-request and pasted, YouTube and Twitch messages (Message, Name; optional public
  source badge as its own authored field; Source and Reference stay off air).
- **Recipe extensions** (controls the built-ins have and existing recipes lack):
  notice-card Urgent/Standard (`types/briefings.ts:423-467`); public-notice language hold and
  resume (`types/publicNotice.ts:98`); milestone-track tiers from threshold lines
  (`types/goals.ts:243-255`); poll rows (`types/dataBoards.ts:128`); fixtures and agenda
  structured rows (`types/sportsBoards.ts:30`, `types/dataBoards.ts:41`); timing-tower focus,
  session and no re-sort, standings focus and final/provisional
  (`types/competitionBoards.ts:229, 405-523`); nominee-reveal suspense, verdict choice and clear,
  winner and award celebration (`types/reveals.ts:82, 192, 318, 428`); qa-card Show answer,
  chat-highlight Hold and Dismiss (`types/audience.ts:116-190`); podium-score spotlight
  (`types/podiumScore.ts:27-134`); quiz-show live 2/3/4 answers (`types/quizShow.ts:96`); scorebug
  interval, resume and full time (`types/sportsBugs.ts:177`); match-board, match-status,
  match-event payloads; alert-level with a visible initial level, direct selection of every
  level and no empty value (`types/alertLevel.ts:161`, `behaviours/choice.ts:36`); transition
  cover, hold and self-clear on timer edges (`types/transitions.ts:55`); ticker rotate mode;
  question-queue editable list with Next and Previous (`types/audience.ts:262`); bracket,
  map-round, matchup, head-to-head, player-card, esports-score payloads and controls
  (`types/competitionBoards.ts:345`, `types/esports.ts:253`, `types/matchups.ts:111, 332`).
- **New runtime kinds**: word cloud layout fed by staged counts (`templates/audience/wordCloud.ts`,
  `control/wordStaging.ts:28`); ticker crawl measured on the artwork (`types/ticker.ts:7-16,149`);
  notification FIFO of complete payloads (`streamNotifications/shared.ts:135-186`); speaking timer
  with two clocks and one floor (`scoreboards/debateFloor.ts:74`; `importedDesign/behaviour.ts:481-493`
  refuses a second clock today); sponsor rotator with image writes (`behaviourRuntime.ts:1008`
  writes text only; `types/identityBugs.ts:498`).

Recognition is recorded per template: **automatic** (untouched file is detected) or **author
choice** (Clock direction, Pop-up alert, any recipe without distinctive evidence), and the CLI
(`noacg scaffold --svg`, shared import defaults in `components/wizard/import/svgDefault.ts`)
follows the same record. New role words are run against old, ambiguous and plain SVGs (the
existing sweep, `scripts/svg-import-sweep.mjs`) because one best-scoring recipe wins.

## Pickers and targets

- **Candidates.** One pure helper over the production's graphics and the active user's saved
  graphics (`model/library.ts` `loadGraphics()`, personal), using the existing matchers. The
  library list is passed into `ProductionAudienceWorkspace` (`ProductionPage.tsx:750, 4769`).
  Node-tested.
- **Copy and save.** Choosing a saved design copies it into the production. An existing
  production copy is reused by identity (a library backlink), never by name: a same-name add
  replaces a design under existing cues (`model/shows.ts:888-924`). The saved target is the
  production graphic id, not the library id. Collisions, duplicate clicks, failed saves and retry
  leave no blank or duplicate cue. A team shares the production copy; personal libraries stay
  private (`docs/SAVED_CONTENT_MODEL.md:34`, `docs/TEAMS_PLAN.md:17, 35`).
- **Targets.** `Show.joinTarget` is optional and additive, added to `NOT_PUBLISHED`
  (`model/publishedRecord.ts:27`) like `resultTarget` and `wordTarget`. An old show with zero Join
  cards offers the built-in; with one, uses it; with several, asks once. Precedence is kept: the
  per-question result cue before the remembered result target (`model/resultCues.ts:63`), explicit
  changes of destination, independent `wordTarget`. Reload, deletion, replacement and team sync
  each have a test. A Join cue encodes the current production link; nothing airs until Take.
- **Message matching.** A graphic with positive quiz evidence (Correct or Selected answer fields)
  is not a message destination; a Question-only card still is, and saved `messageTarget` choices
  survive. Prepare and the cue editor's Fill apply one rule. First-match body and name, last-match
  vote and Join, bound-field rejection, and vote and word-cloud exclusions are unchanged. Field
  titles and machine tokens stay English and stable; visible artwork text may be translated.

## Runtime compatibility (before the first new kind)

The pairing check looks only for `noacgRepaint` (`behaviourRuntime.ts:59-62`) and the table reader
accepts any string as a field kind (`blocks/behaviourData.ts:15, 255`). Before Phase 5 writes a
new kind: a capability or version check refuses to write a kind an old interpreter cannot read;
additive changes stay readable; breaking formats migrate on read. Tests: a frozen old import, an
old export, and a reimport over edited artwork keeping field ids and cue values
(`importedDesign/reimport.ts:126`).

## Countdown motion

Part of the corner game timer template and the countdown recipe, not shared `lookCss`. GSAP in the
runtime so OGraf `goToTime` seeks it (`export/targets/ograf.ts:2092`): a pulse while `warning` is
lit (the recipe's existing 10-second `warnAt`), one bounded, non-strobe flash when `expired`
lights, then a readable resting state. Reduced motion shows the states without motion. Pause,
Reset, snap and shuffled seeks are tested. `LookRule` gains the effect so it fires on clock-tick
repaints, which `enter: 'pop'` does not today.

## Exports

Every new mechanism records its supported modes per target and is proven through the host
interface: OGraf fields, actions and `goToTime` where advertised; SPX fields, Continue and Stop;
CasparCG XML/JSON updates and Next (`e2e/exports.spec.ts:83, 389, 453, 597`).

## Tests and budget

Within `docs/work-specs/e2e-suite-budget` (November amendment distinguishes new spec files from
edits): Node for registry completeness, packaging and pure matching; one batched real-browser
import and render sweep over all templates instead of one browser test per template
(`e2e/svg-templates.spec.ts:156`, `e2e/svg-examples.spec.ts:305`); the existing audience journeys
(`e2e/production-audience.spec.ts`) for picker to air. Geometry, long text, hidden states, credits
and export assertions are preserved when consolidating. Minutes are measured before and after,
with a dated test-maintenance entry.

## Old addresses

Fragment aliases on the gallery and Downloads (`#examples`, `#svg-examples`); old SVG, PNG and ZIP
URLs (`/downloads/NoaCG-SVG-examples.zip`, `/downloads/svg/examples/*`, `vercel.json:20` chain)
still deliver usable files. Canonical ids are allocated before merging, with an old-to-new map
tested against downloaded contents.

## Consumers moved in the same landing as the change they depend on

`e2e/downloads.spec.ts`, `e2e/svg-examples.spec.ts`, `e2e/svg-templates.spec.ts`,
`e2e/import-svg.spec.ts:24, 147`, `e2e/import-svg-centred-title.spec.ts`,
`e2e/score-tracker-moments.spec.ts`, `e2e/configured/imported-quiz-output.spec.ts`,
`e2e/docs.spec.ts:272-343`, `e2e/_svg-import.ts:16-17`, `scripts/check-svg-example-coverage.mjs`
and test, `scripts/svg-files.mjs` and test, `scripts/illustrator/pack-svg-examples.mjs`,
`scripts/e2e-affected.mjs` and test, `covers:` headers, `scripts/check-example-layers.mjs:658-667`,
`scripts/behaviour-docs.mjs`, `scripts/svg-figure-fit.test.mjs`, `src/downloads/links.ts`,
`downloads.html`, `svg-templates.html`, `docs.html`, `ImportDesignStep.tsx`, `vercel.json`,
`.gitattributes`, the authoring docs, the local skills, both distributed skill copies
(`check:skill`), `cli/README.md`.

## Phases

Each phase lands on its own through `/queue-merge`, leaves `main` consistent, and adds what the
next must know to "Phase notes". Ids are the run's ids. CA: a qualified cloud worker plus GitHub
Actions. OW: the owner, with Illustrator on their own computer.

- **TL0. Inventory and gate** (CA; AC-2 gate with `planned` rows allowed, AC-8). Generated
  coverage matrix with `covered` and `planned` rows and observable proofs; gate against losing
  coverage. Archive the real Illustrator exports as importer fixtures. D5 labels with their text
  assertions and copy checks.
- **TL1. Audience pilot** (CA; depends on TL0; AC-4 for Join card, Vote results and Message, AC-10 for the pickers, AC-3 for the four pilot templates,
  AC-9 for saved targets). Join card, Live vote, Vote results and Message templates in the house
  style; pickers, copy and save, `joinTarget`, message matching. Library page and package format
  prototyped on these four.
- **TL1o. Pilot round trip** (OW; depends on TL1). The owner downloads the four pilot templates,
  edits them in Illustrator, imports, saves, picks each in its feature and takes it. The owner's receipt
  settles house style, gallery and packages, and confirms SVG as the maintained source (Q1).
- **TL2. Runtime compatibility** (CA; depends on TL0; AC-9). The capability check and its three tests.
- **TL3. One library** (CA; depends on TL1o; AC-1, AC-11, tests and budget section). Merge
  inventories with canonical ids, packages built at build time, gallery by package, built-in
  alternatives, old addresses, test consolidation and budget measurement, every consumer listed
  above.
- **TL4. Templates on existing routes** (CA; depends on TL3; AC-3, AC-5, AC-6, AC-7 for the
  countdown motion). Every type whose route exists, including the corner game timer with its
  motion and the picture-slot templates.
- **TL5. Recipe extensions** (CA; depends on TL2 and TL4; AC-3, AC-7, AC-9 per extension, AC-10 for Alert level). Each
  extension lands with its template, controls, compatibility tests and export proof.
- **TL6. New runtime kinds** (CA; depends on TL5; AC-3, AC-7, AC-9 per kind, AC-4 for the Word cloud template). Word cloud, ticker
  crawl, notification queue, speaking timer, sponsor rotator. Any new feature hookup (for example
  a notification inbox) is specified separately before it is built.
- **TL7. Close** (CA; depends on TL6; AC-2 complete, AC-8). Complete-coverage enforcement on, no
  `planned` rows; final names and counts check.
- **TL8. Owner confirmation** (OW; depends on TL7). The owner confirms one sample per package in
  Illustrator and on air.

## Acceptance criteria

### AC-1: One Template Library page and one downloads card; no user-facing "Examples" set; every old URL, file and anchor still delivers.

### AC-2: Every row of the coverage model (D9 scope) is `covered`, with its observable proof passing; the check fails otherwise.

### AC-3: Every template imports with its recipe or contract detected, or, where recorded as author choice, works after that documented choice; controls work; one visual family; a default preview plus named operator-visible states with descriptive alt text.

### AC-4: Join card, Vote results, Message and Word cloud templates, imported unchanged and saved, appear in their picker; choosing one stages a working cue without duplicate or blank cues (QR encodes the current link; results show row counts, open and closed status, reveal, and a repeated stage of the same round updates one cue; message shows body and name).

### AC-5: Live vote, Vote results and Poll result pass separate cases (imported vote has no automatic close; Figures selector versus Live figures timing).

### AC-6: Countdown pulses in the last 10 seconds and flashes once at zero; Pause, Reset, bar, reduced motion and OGraf seeks behave.

### AC-7: Each mechanism plays in every export target with its supported modes recorded.

### AC-8: One name per concept across app, docs, templates and inventories; ids unchanged.

### AC-9: Graphics and exports made before this plan keep working; reimport keeps field ids and cue values.

### AC-10: Pickers are keyboard-operable with distinct accessible names; samples with long translated names and instructions fit; Alert level is readable without colour or flashing.

### AC-11: The import workflow's steps are unchanged apart from names and new recipe options.

## Owner questions

- Q1. Once the pilot passes the owner's Illustrator round trip, SVG is the only maintained source
  for templates, and the existing `.ai` files stay as legacy downloads. Owner, 2026-11-21: "yes".

## Phase notes

(Each phase adds what the next must know.)

## Non-goals

- Redesigning the import workflow or its dropdown.
- Changing built-in catalog designs.
- A second cue or control system.
- A file per untyped look (D9).
