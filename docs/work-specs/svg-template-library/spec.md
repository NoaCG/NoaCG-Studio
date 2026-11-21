# SVG Template Library: one library, every graphic type, working with its feature

Authority: owner, 2026-11-21, in a planning session ("NoaCG: Unify SVG Templates and Examples").
Owner on scope: "Everything in this plan", then "create the spec and then give me a
second-opinion prompt". **Draft** until the owner agrees it after that second opinion. No
implementation is authorized yet.

## Owner brief (summary)

1. Stop treating Examples and Templates as two things. The common name is **SVG templates**; the
   collection is the **Template Library**. Keep previews. Several packages are fine; overlap is not
   a problem, and more templates are better, as long as they are consistent. Do not duplicate
   built-in graphics needlessly; show which looks are already in NoaCG and which are downloads.
2. A customizable SVG template for **every** graphic type NoaCG supports, in particular a Join card
   (QR, instructions), Voting and Results that match it, and Messages and Chat (pasted, live chat,
   Twitch), one flexible model if possible. Add the vote template and the corner game show
   countdown discussed earlier. The countdown pulses in the last 10 seconds and flashes boldly at
   zero.
3. Most important: a customized SVG works with the feature it was made for. Adding a Join card,
   staging results or showing a message lets the user pick their own design, with data and
   controls working.
4. One name per concept, everywhere.
5. Keep the Illustrator workflow: browse, preview, download, edit, import, use with the feature.
6. Review first, reuse the existing architecture, no parallel system. Do not redesign the import
   workflow (its long dropdown stays out of scope).

## What exists (review of 2026-11-21)

**The contract already exists and is the base.** An imported SVG gets its behaviour from its layer
names, through two mechanisms:

- **Behaviour recipes** (`src/templates/behaviours/registry.ts`, 17: quiz, score, ranking,
  countdown, vote, meter, alert, survey, list, lineup, puzzle, reveal, bingo, credits, switch,
  choice, clock). The import step scores every recipe against the role words in
  `behaviours/words.json` (`naming.ts` `bestProposal`) and proposes the best; the operator can
  override it. No match means a plain graphic: one field per text layer, on/off. Every SVG import
  is category `imported-design`, variant `svg01`; there is no type classification beyond recipes.
- **Feature contracts by field title**, with no recipe:
  - Join card: a visible non-text layer named `QR` draws a live QR code and adds a `Join link`
    field (`importedDesign/svgQr.ts`).
  - Messages (pasted, YouTube, Twitch all reach one inbox): a text layer titled Message, Comment,
    Text, Body, Request or Question, plus optional Name, Author, From, Sender, Handle or Asked by
    (`control/messageStaging.ts:29-30`).
  - Results: the vote recipe's emitted fields Question, Options, Vote count, Vote status, Live
    figures (`control/resultStaging.ts`, `behaviours/vote.ts:87-97`).
- **Variable-length text**: the svg01 fit ladder (`importedDesign/runtime/svgFit.js`, rules in
  `importedDesign/AGENTS.md`): fill the drawn box, optional growth, wrap, shrink to a floor,
  squeeze; never clip; overflow reported to the operator. The box is found from geometry.

**Gap 1: features never offer library designs.** Join, Results and Messages look only at
`show.graphics`. If none fits they offer hard-coded built-ins (jc01, pl01-pl14, four message
cards). A custom design works only after the user adds it to the production by hand. Join has no
picker: the first graphic with a `Join link` field wins (`ProductionAudienceWorkspace.tsx:223`).
A quiz import's `Question` field makes it a message destination by accident.

**Gap 2: two collections in two styles.** `docs/tutorials/svg-templates` (11, Manrope "Clean
Studio", hand-written SVG, previews with no generator) and `docs/tutorials/svg-examples` (22,
Oswald; 19 built by `scripts/illustrator/build-svg-examples.jsx` with `.ai` files, 3 hand-written).
Three stray sets: `docs/svg-samples` (24, old layer names, fail the layer check),
`public/docs/examples` (7), `docs/tutorials/talk-show-set` (5).

**Gap 3: coverage.** About 65 registered graphic types (`src/templates/types/registry.ts`) plus
kinds with no type (end credits cr01-cr13, versus, frames, picture). About 17 have a downloadable
SVG. The only gate (`scripts/check-svg-example-coverage.mjs`) checks one example per recipe.

**Gap 4: behaviours an SVG cannot get today.** Ticker crawl and rotation; sponsor rotation and
two-language notice rotation; transition or stinger (cover, hold, self-clear); stream
notification queue; word cloud; question queue; speaking timer (needs two clocks, the import
allows one); alert severity levels; bracket, map veto, match-up select and lock, player card
stats. The import's animation presets are entrance and exit only.

**Gap 5: naming.** Score tracker / Scoreboard; Credits roll / End credits / Credits; Countdown /
Game timer / Show countdown / Digital clock and timer / Timer; Live vote / Vote result / Poll
result; Standings / Results / Result table; Alert (self-clearing recipe) / Alert (severity type);
Lineup / Roster; Meter / Goal meter; name tag / Lower third; Holding / Holding screen / Be back
soon / Starting soon; Survey / Survey board. Stale counts: "thirteen" behaviours
(`SVG_AUTHORING.md:257`), "Eleven" templates with 10 rows, "Nineteen graphics" for 22.

**Countdown animation.** Warning and Time up are show/hide only (`behaviourRuntime.ts:46-57`,
`lookCss`). The built-in game timers animate with CSS keyed on root classes. `LookRule.enter:
'pop'` fires only on state repaints, never on clock ticks.

## Goal

One Template Library: every graphic type has a working SVG template in one house style, grouped
into packages by use, previewed on one page. A designer edits it in Illustrator, imports it, and
the feature it was made for offers that design and drives it with its data and controls.

## Decisions

Owner:

- **D1. Scope: everything.** A working template for every graphic type, including the Gap 4
  behaviours, which get new import routes in this plan (owner, 2026-11-21).

Taken by the planning session, recorded here so the owner can reverse them:

- **D2. One house style, SVG as the source.** Every template is a hand-written,
  Illustrator-safe SVG in the Clean Studio style (Manrope, free). The `.ai` files and the
  Illustrator build script retire; an SVG opens directly in Illustrator. The stray sets fold in
  or are removed, with redirects for any public URL.
- **D3. Packages by use plus a full zip.** One folder `docs/tutorials/svg-templates`, one
  inventory where each entry names its `package`. Packages: Show basics (titles, lower thirds,
  cards, bugs, holding screens, credits, transitions), Game show (quiz, scoreboards, countdown,
  reveal, puzzle, bingo, survey), Audience (join card, live vote, vote results, messages, Q&A,
  question queue, word cloud, notifications), Sport and competition (scorebug, clock, standings,
  lineup, bracket, match-up, map round, speaking timer), Info and commerce (tickers, notices,
  product, offer, lists, agenda). Single files from the preview page.
- **D4. Built in versus download.** Each library entry names the graphic type it customizes and
  says "Also built in" with the built-in designs when the catalog has that type.
- **D5. One name per concept** (label changes only; recipe ids, type ids and persisted data keep
  their ids): Scoreboard; End credits; Countdown (counts down); Clock (time of day, elapsed, or to
  a set time); Live vote; Vote results; Standings; Lineup; Goal meter; Lower third; Holding screen;
  Pop-up alert (the self-clearing recipe) and Alert level (the severity type); Join card; Message.
- **D6. Feature pickers.** Join card, Results and Messages each list "Your designs" (library
  graphics that meet the contract) beside the production's graphics and the built-ins; choosing
  one adds it to the production. Join gets a remembered choice (`Show.joinTarget`, additive
  optional field) like Results and Messages. The same pattern serves the new feature routes
  (notifications, question queue, word cloud).
- **D7. New behaviours are recipes.** Every Gap 4 behaviour is a declaration in the existing
  recipe registry with role words in `words.json`, plus the smallest runtime support it needs in
  the imported-design runtime. A behaviour an existing recipe already expresses (for example alert
  levels as a `choice:` group) reuses it instead of a new recipe.

## The contract (documented once, generated from the registry)

- **Purpose from layer names.** A recipe's role words, or a feature contract (`QR`;
  `Message`/`Name`; the vote layers). `behaviours/layer-names.json` gains the feature contracts so
  the docs page, the layer check (`scripts/check-example-layers.mjs`) and the agent skill read one
  source.
- **Fallback.** No match is a plain graphic, one field per text layer. Unchanged.
- **Dynamic elements.** Named text layers are fields; hidden groups in `Moments` are states;
  `QR` is a generated code; `Bar N` is a gauge; new recipes add their own roles (for example a
  ticker's `Story` line and `Crawl` box).
- **Text length.** The fit ladder; each template states the longest sample it is drawn for.
- **Layout options.** Existing per-box alignment and growth; recipe-owned fields for
  behaviour options (as `warnAt` today).
- **Extending.** A new type is one recipe declaration or contract entry plus one template; the
  library check fails if a recipe, a contract or a catalog type has no template.

## Coverage matrix

Phase 0 generates the authoritative matrix from `types/registry.ts`, the recipe registry and the
contracts, and the library check reads it. Planning estimate by family:

| Family | Catalog types | Route |
|---|---|---|
| Static text cards and straps | lower third, social handle, call to action, title card, topic card, headline, notice card, statement card, now/next, sign-off, versus | plain fields |
| Bugs and identity | station bug, logo bug, event bug, award bug, location chip, sponsor strip | plain fields, `f:` picture slot |
| Frames and picture | frames, picture | plain, transparent hole |
| Commerce and data | product, offer, listing, milestone track, fixtures, poll result | plain fields; milestone uses meter |
| Quiz | quiz board, quiz show, answer board 3, answer board 2 | quiz |
| Scores | scoreboard, two-player score, podium scores, scorebug | score (+ clock) |
| Timers | countdown, holding screen | countdown, clock |
| Results tables | standings, timing tower | ranking |
| Vote | live vote, vote results | vote |
| Progress | goal meter | meter |
| Lists | process steps, key facts, recap card, agenda, roster | list, lineup |
| Reveals | winner, verdict, nominee reveal, award reveal | reveal |
| Status | live bug, sponsor bug, alert level | choice, switch |
| Credits | end credits (scroll, columns) | credits |
| Game extras | survey, puzzle, bingo | survey, puzzle, bingo |
| Audience | join card, QR card, viewer question, Q&A card, chat highlight, community request | QR, Message contracts |
| New routes | ticker, sponsor rotator, two-language notice, transition, event notification, word cloud, question queue, speaking timer, bracket, map round, match-up, head-to-head, player card, esports score, match board, match status, match event | new recipes (D7) or composition of existing ones |

## Phases

Each phase lands on its own through the merge queue.

0. **Matrix and names.** Generated coverage matrix (script plus check). D5 labels across recipes,
   words.json, app labels, docs, check-copy. Fix stale counts.
1. **Contract and pickers.** Feature contracts in layer-names.json. D6 pickers: a pure library
   candidates helper (Node-tested), pickers in `ProductionAudienceWorkspace.tsx`,
   `Show.joinTarget`. Message matching no longer takes a quiz's `Question`.
2. **Countdown animation.** Pulse while `warning` is lit, bold flash when `expired` lights, opacity
   keyframes in `lookCss`; reduced-motion and non-real-time render behaviour decided and tested.
3. **One library.** Merge folders and inventories, `package` field, page sections by package,
   "Also built in" labels, downloads card with package zips, preview generator (Playwright renders
   each state), old URLs and anchors redirected, tests and checks moved: `e2e/downloads.spec.ts`,
   `e2e/svg-examples.spec.ts`, `e2e/svg-templates.spec.ts`, `check-svg-example-coverage.mjs`,
   `svg-files.mjs`, `e2e-affected.mjs` path regexes, `vercel.json`, `.gitattributes`,
   `ImportDesignStep.tsx` link, `docs.html`.
4. **Templates on existing routes.** One house-style template per type in the matrix whose route
   exists, including Join card, Live vote and Vote results matching it, Message (one model for
   pasted, chat and Twitch, optional Name and source badge), Q&A, Corner countdown.
5. **New routes.** One recipe per Gap 4 behaviour (D7), each landing with its runtime support,
   its export behaviour (OGraf, SPX, CasparCG), its feature hookup where it has one
   (notifications, question queue, word cloud) and its template.
6. **Proof.** Every template imported, detected and driven; Join card, Vote results and Message
   templates picked from the feature pickers end to end; an owner Illustrator round trip on a
   sample per package.

## Acceptance criteria

- AC-1. One Template Library page and one downloads card; no user-facing "Examples" set remains;
  every old URL and anchor lands on the library.
- AC-2. Every catalog type, recipe and feature contract has at least one template; the library
  check fails otherwise.
- AC-3. Every template imports with its expected recipe or contract detected and its controls
  working, in one house style, with a preview of each state.
- AC-4. A Join card, Vote results and Message template, imported unchanged, appear in their
  feature's picker, and choosing one stages a working cue (QR encodes the link, results show the
  counts, message shows body and name).
- AC-5. The countdown pulses during the last stretch and flashes at zero; Pause, Reset and the bar
  still work.
- AC-6. One name per concept across app, docs, templates and inventories; stale counts fixed.
- AC-7. Each new recipe plays correctly in every export target NoaCG supports.
- AC-8. The import workflow's steps are unchanged apart from names and new recipe options.
- AC-9. Graphics imported before this plan keep working unchanged.

## Risks to settle before building

- **E2E budget** (`docs/work-specs/e2e-suite-budget`). Roughly 65 templates must not mean 65 new
  browser imports per landing. Prefer Node-level detection checks for all, and browser tests per
  route rather than per template.
- **Emitted runtime.** `lookCss` and every new recipe change the runtime baked into exported
  graphics; the frozen-interpreter pairing and versioning must hold, and old exports keep their
  runtime.
- **CSS animation** does not follow motion speed, reduced motion, or OGraf non-real-time
  `goToTime`; a snap replays it.
- **Repo weight.** Previews and several zips that repeat the same bytes; consider building zips at
  deploy instead of committing them.
- **Taste at scale.** A sample set per package is judged before the rest is drawn.
- **Illustrator safety** cannot be checked in a cloud container. `check-example-layers.mjs` is the
  machine proxy; the owner's round trip (Phase 6) is the real check.
- **Message matching change** may drop a destination an existing production relies on.
- **Label renames** may break copy checks and tests that select by text.

## Non-goals

- Redesigning the import workflow or its dropdown.
- Changing built-in catalog designs.
- A second cue or control system: new behaviours use the existing recipes, controls and rundown.
