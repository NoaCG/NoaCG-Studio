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
  motion and the picture-slot templates. Carried from TL3: the batched browser sweep from "Tests
  and budget", its before and after minutes and its dated test-maintenance entry.
- **TL5. Recipe extensions** (CA; depends on TL2 and TL4; AC-3, AC-7, AC-9 per extension, AC-10 for Alert level, AC-5 for Poll result, deferred from TL4). Each
  extension lands with its template, controls, compatibility tests and export proof. Carried
  from TL1 (owner ruling 2026-11-22): a per-option count readout on the Vote results template.
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

### TL0 (inventory and gate)

- Previous verified `main`: `df0c7a0e15b7b8d87ced52c8db73120d85dc1965`. Revert: `git revert -m 1 <the TL0 merge commit>`.
- The matrix is `docs/template-library/coverage.json` (101 rows: 72 types, 8 untyped kinds, 17
  recipes, 4 contracts; 31 covered at TL0). `node scripts/template-coverage.mjs --write`
  regenerates it from the registries and keeps each row's assignment; the build gate is
  `scripts/template-coverage.test.mjs`. A phase that covers a row sets `status: covered`, its
  `templates`, and `proof` (`test`, `case` text that appears verbatim in that test, `inventory`
  when the test loops over one; the inventory must list each template with the row's `recipe`),
  and deletes `phase`. `observes` names only what that case asserts; what the route still owes
  is an `extensions` entry with its phase (Countdown Reset, Warning, Time up in TL4; Scoreboard
  New game, Live vote Close and Call the winner, Goal meter bar fill, columns layout in TL4;
  Standings focus and final/provisional in TL5). `coveredFloor` keeps every row once covered:
  demoting one fails, and so does a row covered on `origin/main` and not here. The case must be a
  `test(` title; each template's recipe is stated (`recipe` or `recipeBySlug`, null for none);
  `selects: "recipe"` marks the examples loop that skips templates without a recipe.
  `--complete` (TL7) also refuses open extensions. A quarantined proof spec fails its rows.
- Untyped catalog designs map through `looks` (category default, variant overrides with a
  capability) or a row's `variants` (end credits by form, read from each design's animation
  preset). A new untyped design fails until mapped; `imported-design` is excluded.
- Names: `docs/template-library/names.json`, checked by `scripts/concept-names.test.mjs` against
  the registries, the chip kind labels (`graphicKindLabel`) and the user-facing surfaces it lists
  (TypeScript comments are not scanned). Add a surface there when a phase adds one (the TL3
  gallery and package pages). Template display names changed, slugs kept: Game timer is
  Countdown, Show countdown is Show clock (it is the Clock recipe), Digital clock and timer is
  Clock. Test titles in `e2e/svg-*.spec.ts` follow inventory names.
- Illustrator exports are archived in `e2e/fixtures/illustrator-exports/` (19 files, byte
  identical; `scripts/illustrator-exports.test.mjs`). TL3 points `e2e/svg-examples.spec.ts` at
  them before moving `docs/tutorials/svg-examples`.
- Trap: editing an inventory, README or authored SVG in `docs/tutorials/svg-*` needs both zips
  repacked (`node scripts/illustrator/pack-svg-examples.mjs` and `--set templates`); the PDF print
  runs Chromium. `e2e/downloads.spec.ts` compares the zip to the repo.
- Trap: editing this spec changes `work.json`'s `specSha256`; TL0 updated it with the notes only
  (acceptance unchanged).

### TL1 (audience pilot)

- Previous verified `main`: `fba398c20eba8d875a256472dd30cda3761c93c3`. Revert: `git revert -m 1 <the TL1 merge commit>`.
- Pickers: `src/control/audiencePickers.ts` `pickerItems(show, library, kind)` lists production,
  saved, built-in for `join`, `results`, `message` and `words`, with the staging matchers; one
  `DesignPicker` in `ProductionAudienceWorkspace.tsx` renders all four (test ids
  `<prefix>-choose-graphic`, `-saved`, the old built-in ids, groups `<prefix>-group-<group>`).
  The library is `ProductionPage`'s `pickerLibrary`. A saved design is copied by
  `addSavedDesign`: reused by its `graphicId` link, else added under a free name; the pick fills
  the copy's seeded cue (`seededCue`), so there is no blank cue beside the staged one. The Word
  cloud picker already offers saved word clouds; its template is TL6's.
- Join: `Show.joinTarget` (additive, not published) and `model/joinCues.ts` `planJoinCue`; the
  write is `stageShowJoin` in `model/shows.ts`, rebased, one Join cue per card. Add Join card
  with no Join card and no saved design adds the built-in as before. A second press now updates
  the Join cue instead of adding a second one (`e2e/configured/audience-live.spec.ts` moved with
  it: after a rename, the one Join cue holds the new link).
- Message: `messageStaging.ts` `destinationFields` leaves out graphics with a Correct answer or
  Selected answer field; a remembered `messageTarget` on such a graphic keeps working.
- Templates: `join-card`, `live-vote`, `vote-results`, `message` in
  `docs/tutorials/svg-templates` (inventory fields `packages`, `alt`, `states`, `contract`). Layer
  names follow `layer-names.json`: the Join card's texts are `Label` and `Call to action` (the
  built-in Join card's titles), the Message's name is `From` (a lower third owns `Name`), and a
  moment such as `Vote badge` is drawn hidden.
- Library page prototype: `scripts/svg-files.mjs` `SVG_PACKAGES` renders an Audience package
  section (default preview plus each named state, alt text on every picture) above the two sets;
  public copies include the state previews. Package zips stay TL3's.
- Rules (state rules this phase sets; written after coding, so the final `/so` challenges them):
  - R1. A pick never replaces a pool graphic by name. A saved design reuses its linked copy
    (`graphicId`, not an OBS scene copy), else it and any built-in get a free name, computed on
    the production as stored.
  - R2. One pick, one cue: the pick fills the seeded cue of the design it brought in, and no blank
    cue is left beside it. For a saved design's copy, a retry after a failed write fills that
    same seeded cue on every road to the destination: picked, remembered, or the question's own
    graphic (`copySeededCue`). A built-in copy has no link to tell its seed apart, so a retry
    there behaves as on base (issue #2683).
  - R3. Join: the explicit pick, else the remembered `joinTarget` while it is a Join card, else
    the only Join card, else the operator is asked. An explicit pick that is no longer a Join card
    asks again. One Join cue per card: the cue labelled Join card, else one with no link yet
    (which is then labelled Join card); another cue holding a link is never overwritten.
    `joinTarget` is written by an explicit pick, or when the press adds the built-in Join card to
    a production that has none. It is not published.
  - R4. Messages: a graphic with a Correct answer or Selected answer field is not offered; a
    remembered `messageTarget` on one keeps working.
  - R5. Nothing airs from a pick: every path writes cues only.
- Trap: a text whose drawn centre is within 5% of its panel's centre is read as centred and grows
  both ways; the Join card states `text-anchor="start"` so its texts stay left of the QR.
- AC-4 row counts, owner ruling 2026-11-22, verbatim: "A" (asked on run issue #2678,
  https://github.com/NoaCG/NoaCG-Studio/issues/2678#issuecomment-7071540752; the answer is
  recorded there in comment 7075308815). Meaning, as asked: share plus total on air, with raw
  counts in the cue, meet AC-4 for TL1.
- Carry-over to TL5: add a per-option count readout to the Vote results template, after the TL2
  compatibility check (a new derived value in the imported-design runtime).

### TL1o (pilot round trip)

- TL1o was run by an agent at the owner's request (2026-11-22); the real Illustrator round trip moves to TL8.
- Evidence: `evidence/phase-TL1o.md`. One finding, issue #2691: Illustrator writes no
  `text-anchor`, so a vote's right-aligned `Percent n` grows right on air and the Winner mark
  cuts it. TL3 and TL5 should know it before more right-aligned figures ship.

### TL2 (runtime compatibility)

- Previous verified `main`: `60a92df384015ac6abf4273e3bbe56a081cca0a0`. Revert: `git revert -m 1 <the TL2 merge commit>`.
- Evidence: `evidence/phase-TL2.md`.
- For TL4, TL5 and TL6: a new word the runtime reads (a kind, a fact, a derivation, a kind spec
  key, a rule key or value, a table version) is one `READS_ADDED` entry in
  `src/templates/importedDesign/behaviourReads.ts`, in the commit that teaches the runtime. TL5's
  per-option count is `derive:share.count` (already pinned as refused under the frozen vote);
  TL4's countdown effect is a new rule key or `enter` value. `scripts/behaviour-reads.test.mjs`
  fails until READS and the kind code agree, and every recipe and option must compile to a table
  its own runtime reads. A runtime fix that adds no word needs nothing there.
- Decisions: the declaration is emitted in every behaviour graphic (one line of JSON) rather than
  a version number, so a saved graphic says itself what it reads and the build keeps no history
  table; `READS_ADDED` is additive by construction. A runtime emitted without the clock tick does
  not list `clock`. `axis` on a gauge rule was never read by any runtime and no recipe emits it,
  so a hand edit using it is warned about (C3a) and `docs/SVG_BEHAVIOUR_PLAN.md` no longer shows it. The fixtures live in `scripts/fixtures/pre-tl2` (under
  `e2e/fixtures` they would select the whole configured set with no spec reading them).
- Trap: the emit pins move whenever the runtime text moves (`svg-corpus-passes.json` emit `js`,
  `jev-svg-baseline.test.mjs` `appearance.js`). Re-record only the `js` hashes the change moves;
  a local Chromium other than the recorded one also differs in html, inventory and runtime
  records, and a control on `origin/main` shows the same.
- Rules (state rules this phase sets, written before any code and corrected by the Rules-first
  `/so` on a297952, AGREE WITH CORRECTIONS; the PR repeats them):
  - C1. A behaviour table's VOCABULARY is every word it asks a runtime to read, read off the raw
    JSON (never the typed shape, which ignores unknown keys): each top-level key; each field kind
    it names and each key of that kind's spec; each fact and derivation its tokens ask of a
    field's kind (resolved through `fields` and `kinds`; a field with no kind is `text`; a fact
    with an argument counts by its prefix, `is:` and `reached:`); each key of each paint rule and
    of its `when`; and the `enter`, `axis` and `default` values (`default` by its head:
    `row-highlight`, `row-mark`, `badge`). The table's version is a word too. Free text is not
    vocabulary: the names inside `options`, `rows` and `fields`, role and state names, row keys,
    and argument values.
  - C2. A runtime emitted from now on carries its own READS: one strict JSON declaration,
    `var NOACG_BEHAVIOUR_READS = {...};`, with its own `v` (1), the table versions it reads, and
    the words, written with the runtime and per variant (`clock` only where `clockPainted` is
    emitted, since a tick reaches the kind only through it). A saved runtime without READS
    (everything made before this phase) reads the frozen pre-TL2 vocabulary: a constant that
    never changes, extracted from the df0c7a0 runtime, cut to the kinds its code defines (both
    `noacgKinds.k =` and `noacgKinds['k'] =`), to `clock` only with `function clockPainted(`, and
    to `place` and the default treatments only where their functions are in its code. It
    includes the keys every pre-TL2 build emitted and the runtime ignores (`version`, `recipe`,
    `parts`, `options`). Documented limits: a word added inside an existing kind before TL2 is
    not told apart (the build always emitted those tables with their own runtime), and READS is
    trusted as written, so only a deliberate hand edit of READS can fake a pass.
  - C3. A table whose vocabulary has a word its template's runtime does not read is refused: the
    validator's `behaviour` rule reports each such word as an export-blocking error, beside the
    existing pairing error for a table with no runtime at all. A table version the runtime does
    not list is refused the same way. A table every word of which the runtime reads passes,
    whatever else changed in the runtime. READS of a `v` this build does not know is a warning
    that the check cannot be made, never a pass and never a rewrite.
  - C4. READS changes exactly when the vocabulary changes. A runtime change that adds no word (the
    readout alignment of #2691) leaves READS as it is, needs no version bump, and reaches a saved
    graphic only by reimport, which rebuilds the runtime. A new word (TL5's per-option count,
    TL4's countdown effect, TL6's kinds) is added to READS in the same commit as the code that
    reads it. A word is never removed while the table format stays version 1. A Node drift test
    checks, per kind, that every fact and derivation READS declares is a literal comparison in
    that kind's code (`name === 'w'`, `name.indexOf('w:') === 0`), and every key and value
    likewise, so a declared word the code does not read fails.
  - C5. Two writers put a table in a template: the build, which always emits the table with the
    runtime that reads it, and the Advanced-mode hand edit (the table's own header invites it),
    which C3 covers at export. Every recipe, with every option, compiles to a table its emitted
    runtime reads (a Node gate). Any later writer that puts a table under a runtime it did not
    emit in the same pass asks the same check first and refuses on a missing word.
  - C6. Versioning stays `docs/STATE_MACHINE_SCHEMA.md` section 5: an additive optional key keeps
    `version: 1` and still parses; a breaking change bumps the version and migrates on read in
    `parseBehaviourData` in the same commit, and adds the version to READS; an unknown version
    parses to null and the template's own runtime still plays it, refused at export only where
    its runtime does not list that version.
  - C7. A graphic made before this plan keeps working unchanged: its saved code is never
    rewritten (load and validate leave the saved JS byte for byte), it passes the check, its
    frozen runtime still paints from its fields, and an export made before this plan, imported
    again, passes the check and still plays. The fixtures are committed bytes built at df0c7a0,
    never regenerated. Every recipe with every option, compiled at df0c7a0, gives a table the
    frozen vocabulary reads (TL2 evidence).
  - C8. Reimport of edited artwork over a graphic made before this plan keeps every matched field
    id, so a cue's values (field id to value) recorded on the old graphic paint the same layers on
    the reimported one; the rebuilt table passes the check against its new runtime.
- Rules found after coding (from the final `/so` on 66471c6, A, AGREE WITH CORRECTIONS):
  - C3a. A KEY word (`table.`, `rule.`, a kind's spec key) that no runtime this build
    emits reads either (a gauge's `axis`, a note) is ignored by every runtime and the rule still
    paints: the export gate WARNS and passes, so a graphic hand-edited before this plan with such
    a key keeps exporting. A key word this build's runtime reads and the saved one does not (a
    future rule key) is refused like a meaning word. The error says to import again only when
    this build's runtime reads every refused word, and otherwise to remove the rules. The keys
    of a kind the runtime does not read are said by that kind's own word.
    A `when.` key is never a key word: a condition narrows when a look shows, so an unknown one
    is refused (delta `/so` on b2fc228). The same would hold for a future kind spec key that
    limits what a kind counts; none exists outside the frozen list. A missing table version says
    to set `version` to 1.
  - Note for TL6: C1 treats the VALUES of existing keys as free text, yet the runtime compares
    some of them (rank `order === 'asc'`, the row-mark argument `wrong`). A new value of an
    existing key would play as the old one and pass the gate; widen C1 for that key first.

### TL3 (one library)

- Previous verified `main`: `304adc72902f468d3d6b711b2e342f17ff9565d4`. Revert: `git revert -m 1 <the TL3 merge commit>`.
- Evidence: `evidence/phase-TL3.md`.
- One folder, `docs/tutorials/template-library/` (SVG/, Previews/, Illustrator/, README.md and
  its PDF, CLOCKS.md, EDITABLE-CREDITS.md), one inventory, `library.json`. Each entry: `slug` (the
  canonical id and file name), `name`, `style` (`studio` Manrope, `navy` Oswald, the old examples),
  `recipe`, `contract`, `source`, `packages`, `preview`, `alt`, `states`, `guide`, `formerly`.
  Every picture in Previews/ belongs to one entry (its `preview` or a state); the gate
  (`scripts/svg-files.test.mjs`) fails on an unlisted SVG, picture or `.ai`. The four slugs both
  sets used gained `-navy` on the navy side (lower-third, quiz, end-credits, live-vote; files,
  previews and `.ai`); every other id is the old slug. No SVG changed: 115 files are pure renames.
- Packages (`SVG_PACKAGES` in `scripts/svg-files.mjs`): audience, games, titles, clocks, credits;
  an entry may sit in several. TL4 to TL6 put each new template in its packages and in a coverage
  row; a new picture needs a `states` entry with a name and alt text.
- Downloads are made at build, never committed (D3): the `template-library-downloads` plugin in
  `vite.config.ts` serves them on the dev server and writes them into the build: each SVG and
  picture at `/downloads/svg/<name>`, the library zip `/downloads/NoaCG-Template-Library.zip`
  and one `NoaCG-Template-Library-<package>.zip` each (README, PDF, its own `library.json`,
  guides, SVG, previews, `.ai`). Because the build reads it, `docs/tutorials/template-library/`
  and `docs/template-library/coverage.json` are deploy-affecting (`DEPLOYED_DOCS` in
  `scripts/deploy-affecting-paths.mjs`). Editing the README needs
  `node scripts/print-library-readme.mjs` (Chromium); nothing else is repacked by hand.
- Old addresses: `docs/template-library/old-addresses.json` records all 124 file and zip
  addresses served at the base with their sha256; `vercel.json` redirects each (the old examples
  and templates folders to `/downloads/svg/`, the four renamed ones by name, both old zips to the
  library zip). The test follows the redirects and checks bytes, and that every SVG, picture,
  `.ai` and guide of the old zips is in the library zip unchanged. `#templates`, `#examples` on
  the library page and `#svg-examples` on /downloads still land.
- Built-in alternatives (D4): `template-coverage.mjs --write` now writes `builtIns` (catalog
  design names) on each type and untyped row; the page shows up to four names per template and
  never a count (`check-copy` design-count). A stale list fails the coverage gate.
- Coverage proofs that loop over the library name the style they run (`proof.style`); the
  validator refuses a template of the other style on that row.
- Decisions: the gallery is the five packages plus the whole-library zip; the navy set is not a
  separate section and its tiles say nothing about examples. The Import step's link now reads
  "SVG templates" and points at `/svg-templates` (AC-11: the steps are unchanged). Old zip
  addresses redirect to the full library rather than keep two extra copies (about 9 MB less
  deploy). Every picture has alt text and every template a unique name (the navy countdown is
  "Countdown, navy"); the gate refuses an empty alt or a repeated name.
- Not done here, carried to TL4 (its phase line says so): consolidating the per-template browser
  tests into one batched sweep. AC-1 and AC-11 do not need it, and TL4 adds most templates, so the
  sweep is best built once there. It retires tests, so it lands with the dated test-maintenance
  entry the spec asks for (a planned consolidation, not an entry written to pass a gate) and its
  minutes before and after. TL3's test counts are unchanged (the e2e protection check passes with
  no entry).
- Traps: the browser specs read `library.json` filtered by `style`; a spec that needs a template
  of a style must filter for it. `e2e/fixtures/illustrator-exports/` keeps the old names (map by
  `formerly`). `scripts/illustrator/build-svg-examples.jsx` still writes the old names; it is
  kept as the record of how the navy set was drawn, the SVG is the maintained source (Q1).
- Rules (state rules this phase sets; written after coding, so the final `/so` challenges them):
  - A1. Every address the two sets were served at on the base delivers usable content: each SVG
    and PNG the same bytes (directly or through one or two redirects), each old zip a zip that
    holds every SVG, picture, `.ai` and guide the old one held, with the same bytes. Inside the
    library zip the four navy files that collided carry their `-navy` names (`formerly` in
    `library.json` maps them).
  - A2. Nothing under `public/downloads/` is committed; every download is made from the library
    folder by the build, and the dev server answers the same bytes.
  - A3. A change to the library folder or the coverage matrix triggers a production build.
  - A4. Recipe ids, type ids, role words, field titles and persisted keys are unchanged; no
    template's SVG content changes.

### TL4 (templates on existing routes)

- Previous verified `main`: `66ab49d3db8058f0eb972414623e155ecabb71c0`. Revert: `git revert -m 1 <the TL4 merge commit>`.
- Evidence: `evidence/phase-TL4.md`.
- 28 studio templates (library 65): plain-field cards and bugs for the 17 plain types, Key facts
  and Recap card (list), Live bug (choice), two answer boards (quiz), End credits pages and still
  board (credits, playback by author choice), QR card, Versus and Framed picture (picture slots,
  `f:` images with an embedded placeholder) and Two-up frames (open windows). 66 of 101 rows
  covered. `end-credits-crawl` moved to TL6: the credits import plays roll, still and cards, and a
  crawl is the ticker crawl kind's.
- Countdown motion: a look rule's `enter` gains `pulse` (while the rule holds, on every repaint,
  so the clock's tick drives it) and `flash` (once, when the look appears), GSAP in the runtime
  (`noacgMove`), none under reduced motion; `READS_ADDED` lists both. The countdown recipe pulses
  its warning only while `clock/running` (a second warning rule keeps it lit when paused).
- OGraf non-real time: the gate (`validateOgrafOfflineCompatibility`) refused every imported
  design because the SVG namespace URI matched its network check. Known XML namespace names are
  now skipped; any other address is still refused. Imported designs can be sought from TL4 on.
- Tests: `e2e/svg-templates.spec.ts` and `e2e/svg-examples.spec.ts` run their templates in
  batches (by route, five at most, one page per batch, 120 s each); every assertion is kept. A
  new template joins its route's batch through `library.json` alone. Stand-alone cases: Live
  vote timing (AC-5), countdown motion (AC-6) and the motion in every export target (AC-7).
- For TL5: the Poll result template (AC-5's third case) needs the poll-rows extension, so it is
  TL5's (now on its phase line). Seek parity for imported designs other than the countdown is
  issue #2699. Picture slots need no runtime work: `f:` images are fields, and `update()` with an image
  replaces them on air.
- Traps: a template text drawn BESIDE another plate grows into it when retyped long (the Location
  chip and Sponsor strip did): stack a tag above or below its plate. A retyped value can wrap into
  tspans; read it line by line. Hidden-state previews are rendered with the state's groups shown.
- Rules (state rules this phase sets; written after coding, so the final `/so` challenges them):
  - M1. A look with `enter: 'pulse'` moves while a pulse rule for it holds and is at rest (no
    inline opacity or transform) the moment none holds; a paused countdown shows its warning still.
  - M2. A look with `enter: 'flash'` flashes once when it goes from hidden to shown, on any
    repaint, and then rests at opacity 1 and scale 1; a repaint that keeps it shown does not flash
    again. Reset, or the rule ceasing to hold, clears the motion.
  - M3. Under `prefers-reduced-motion: reduce` neither moves; the looks show and hide as before.
  - M4. Motion is GSAP driven, so an OGraf non-real-time seek lands on the same frame whatever
    order the seeks come in.

### TL5 (recipe extensions)

TL5 lands as several PRs; each adds its group here.

Group 1: Vote results count, Alert level, Public notice, Poll result (one PR, #2701).

- Previous verified `main`: `b06197d34fbd9c33e062690a908088128b9e3972`. Revert: `git revert -m 1 <the TL5 group 1 merge commit>`.
- Evidence: `evidence/phase-TL5.md`.
- The count readout is a new template, Vote results with counts: TL3's A1 pins the bytes of
  every old address, `vote-results.svg` and its pictures included, so a library file that an old
  address serves never changes. A later phase that wants to improve such a file adds a sibling.
- A `choice:` set with exactly one option drawn visible starts on it (`DesignSvgExtra.initial`,
  the choice's `options.initial` in the table). The layer check allows that one visible option.
- Trap: a live text inside the visible starting option becomes a text field named after its
  group, and the import then built no choice at all (no buttons, no option stamped). Name such a
  word `static:` (the Alert level does); issue #2700 tracks making the import say so.
- Rules (state rules this group sets; written after coding, so the final `/so` challenges them):
  - E1. A vote board that draws `Count n` prints that row's own count from the Options lines, and
    shows it exactly when that row's share shows (Show result, Call the winner, or Live figures
    live). A board with no count emits the table and words it emitted before.
  - E2. A choice with exactly one option drawn visible starts on it: its field's default is that
    option, it offers no empty value and has no "none" state, and every option is reachable from
    every other. With none or several drawn visible it starts empty, as before. (Found by the final
    `/so`:) on such a choice a value that names no option (an empty cue saved before the start
    existed, a host sending an empty level) shows the starting option, so it never airs empty.
    (Found by the automated PR review:) the starting option's button stays live, since data alone
    can show another option while the machine rests on the start; every other option is greyed
    while it shows.
  - E3. A saved poll binding without `count` and a saved choice without `initial` build the bytes
    they built before; a saved graphic keeps its own runtime and table (TL2 C7). Reimport of a
    choice whose artwork has exactly one option visible, whether drawn before or after this
    change, gains the start: field ids are unchanged, and a cue saved empty, which showed nothing,
    now shows that visible option.
  - E4. `derive:share.count` and the `row-pick` spec key `start` are in `READS_ADDED`; a table
    asking for either under a runtime that does not list it is refused at export, upgradable by
    importing again.
  - E5. A vote imported with Poll result ticked (`options.figures`, the poll binding's additive
    `options`) is the same table and words as the vote, with its `Live figures` field defaulting
    to live: typed figures show from the take, and the operator can still switch them to wait.
    Without the box the vote is byte for byte what it was. Staged from Interaction as Vote
    results, it follows the production's Live figures switch like every results board (the
    staging writes that field); the box sets only the default a typed board starts with.
- Decisions recorded from review: a choice's start applies to what is painted; data that sends
  an empty or unknown option shows the start while the machine stays where the last press put
  it, as every data-only choice update already does. The Poll result box is offered only where a
  figure or count is drawn. The proposal (AI/CLI) path carries no Poll result intent yet: an
  agent's import is a live vote until the author ticks the box. A row a new round leaves out keeps
  its old label (issue #2702, on main before TL5).

Group 2: Winner card and Award reveal.

- Previous verified `main`: `45fd2420091e422f1f07ace248579817a05bb3d9` (group 1 merged). Revert: `git revert -m 1 <the TL5 group 2 merge commit>`.
- Mechanism: existing recipes, no extension. The reveal gives Sealed, Reveal and the typed
  winner; the celebration is a `show:Celebration` switch beside it (Show and Hide Celebration),
  a field a data-only host can set. A first cut added a celebration role and group to the reveal
  recipe; review found it showed over a sealed card, was machine state no controller could see
  or set, and would capture visible confetti in old artwork on reimport, so it was dropped.
- The layer check holds studio templates to a role's taught name: the revealed text is `Price`
  in every reveal template, whatever it holds (README says so), and the cover is `Cover`.
- Labels: Reveal, Show Celebration, Hide Celebration; the built-ins' own words (Reveal result,
  Open envelope, Applause, Settle) are not carried, since no recipe changed.
- No state rule is set or changed: no recipe, runtime, persisted key or proposal changed.

## Test maintenance

- 2026-11-22 `e2e/svg-examples.spec.ts`: TL4's planned consolidation ("Tests and budget", carried from TL3 with the owner's standing permission on #2678): the 21 one-template tests are 6, five navy templates a test, each walked by the same function with every assertion it had (the show walk and the registry test unchanged); `playwright --list` names every template in a batch title and the coverage gate still finds each row's case; receipt and minutes before and after in `docs/work-specs/svg-template-library/evidence/phase-TL4.md`, owner miwco, expires 2026-12-22
- 2026-11-22 `e2e/svg-templates.spec.ts`: the same consolidation for the studio set: 15 one-template tests became 16 batches by route over 43 templates (geometry and clean air at every state, long text, hidden states, the credits roll at ten points, the QR decode and the score sizes kept, by the same function) plus three stand-alone cases (AC-5, AC-6, AC-7); receipt in `docs/work-specs/svg-template-library/evidence/phase-TL4.md`, owner miwco, expires 2026-12-22

## Non-goals

- Redesigning the import workflow or its dropdown.
- Changing built-in catalog designs.
- A second cue or control system.
- A file per untyped look (D9).
