# SVG Template Library: one library, every graphic type, working with its feature

Authority: owner, 2026-11-21, in a Claude Code session ("NoaCG: Unify SVG Templates and Examples").
**Draft.** The open decisions below wait for the owner. No implementation is authorized until the
owner agrees the plan.

## Owner brief (summary)

1. Stop treating Examples and Templates as two things. The common name is **SVG templates**; the
   collection is the **Template Library**. Keep previews. Several packages are fine; overlap is not
   a problem, and more templates are better, as long as they are consistent. Do not duplicate
   built-in graphics needlessly; show which looks are already in NoaCG and which are downloads.
2. A customizable SVG template for every graphic type NoaCG supports, in particular a Join card
   (QR, instructions), Voting and Results that match it, and Messages and Chat (pasted, live chat,
   Twitch). Add the vote template and the corner game show countdown discussed earlier. The
   countdown pulses in the last 10 seconds and flashes boldly at zero.
3. Most important: a customized SVG works with the feature it was made for. Adding a Join card,
   staging results or showing a message lets the user pick their own design, with data and
   controls working.
4. One name per concept, everywhere.
5. Keep the Illustrator workflow: browse, preview, download, edit, import, use with the feature.
6. Review first, reuse the existing architecture, keep scope on the template ecosystem. Do not
   redesign the import workflow (its long dropdown stays out of scope).

## What exists (review of 2026-11-21)

**The contract already exists and is the right base.** An imported SVG gets its behaviour from its
layer names, through two mechanisms:

- **Behaviour recipes** (`src/templates/behaviours/registry.ts`, 17 recipes: quiz, score, ranking,
  countdown, vote, meter, alert, survey, list, lineup, puzzle, reveal, bingo, credits, switch,
  choice, clock). The import step scores every recipe against the role words in
  `behaviours/words.json` and proposes the best one; the operator can override it. Nothing matched
  means a plain graphic: one field per text layer, on/off.
- **Feature contracts by field title**, with no recipe:
  - Join card: a non-text layer named `QR` becomes a live QR code and adds a `Join link` field
    (`importedDesign/svgQr.ts`).
  - Messages: a text layer named `Message` (or Comment, Text, Body, Request, Question), plus an
    optional `Name` (or Author, From, Handle) (`control/messageStaging.ts:29-30`).
  - Results: the vote recipe's fields (Question, Options, Vote count, Vote status, Live figures)
    (`control/resultStaging.ts`, `behaviours/vote.ts`).
- **Variable-length text** is handled by the fit ladder (`importedDesign/runtime/svgFit.js`): fill
  the drawn box, optional growth, wrap, shrink to a floor, squeeze; never clip; overflow is
  reported to the operator. The box is found from geometry, not a name.

**Gap 1: features never offer library designs.** Join, Results and Messages look only at graphics
already in the production (`show.graphics`). If none fits they offer hard-coded built-ins (jc01,
pl01-pl14, four message cards). A custom design works only after the user adds it to the
production by hand. Join has no picker at all: the first graphic with a `Join link` field wins
(`ProductionAudienceWorkspace.tsx:223`).

**Gap 2: two collections in two styles.** `docs/tutorials/svg-templates` (11, Manrope "Clean
Studio", hand-written SVG) and `docs/tutorials/svg-examples` (22, Oswald, 19 built by an
Illustrator script with `.ai` files, 3 hand-written SVG). Same slugs in both (lower third, quiz,
end credits). Three more stray sets exist: `docs/svg-samples` (24, old layer names, fail the layer
check), `public/docs/examples` (7), `docs/tutorials/talk-show-set` (5).

**Gap 3: coverage.** 65 registered graphic types. About 17 have a downloadable SVG. The only gate
(`scripts/check-svg-example-coverage.mjs`) checks one example per recipe, not per type. No
template has a `QR` layer or a `Message` layer.

**Gap 4: types an SVG cannot get the behaviour of today.** Ticker crawl or rotation, sponsor
rotation, transition or stinger, stream notification queue, word cloud, speaking timer (two
clocks), alert severity levels, bracket and map veto machines.

**Gap 5: naming.** Score tracker / Scoreboard; Credits roll / End credits / Credits; Countdown /
Game timer / Show countdown / Digital clock and timer / Timer; Live vote / Vote result / Poll
result; Standings / Results / Result table; Alert (self-clearing recipe) / Alert (severity type);
Lineup / Roster; Meter / Goal meter; name tag / Lower third; Holding / Holding screen / Be back
soon / Starting soon. Counts in docs are stale ("thirteen" behaviours, "Eleven" templates with 10
rows, "Nineteen graphics" for 22).

**Countdown animation.** Warning and Time up are show/hide only (`behaviourRuntime.ts:46-57`). The
built-in game timers animate with CSS keyed on classes. The smallest change is CSS keyframes on
the lit `warning` (pulse) and `expired` (flash) looks, opacity only, so drawn transforms and the
bar are untouched.

## Goal

One Template Library: every graphic type has a working SVG template in one house style, grouped
into packages by use, previewed on one page. A designer edits it in Illustrator, imports it, and
the feature it was made for (Join card, Results, Messages, Scoreboard, Countdown, Credits, and so
on) offers that design and drives it.

## Decisions (open, recommendations marked)

- **D1. What "every graphic type" means.** Recommended: one template per *behaviour or feature
  contract*, and the library lists every one of the 65 catalog types against the template that
  customizes it. Types whose behaviour has no import route today (Gap 4) are listed as "Built in,
  not yet customizable" and go to a follow-up plan, rather than growing this plan with new
  runtime engines.
- **D2. One house style, SVG as the source.** Recommended: every template is a hand-written,
  Illustrator-safe SVG in the Clean Studio style (Manrope). The `.ai` files and the Illustrator
  build script retire; an SVG opens directly in Illustrator. The stray sets (svg-samples,
  public/docs/examples, talk-show-set) fold in or are removed.
- **D3. Packages.** Recommended: one folder `docs/tutorials/svg-templates`, one inventory with a
  `package` per template, and these zips plus a full one: Show basics (titles, lower thirds,
  holding screens, credits), Game show (quiz, scoreboards, countdown, reveal, puzzle, bingo,
  survey), Audience (join card, live vote, results, message, chat, Q&A), Sport and competition
  (scorebug, clock, standings, lineup). The page and zips are generated from that inventory.
- **D4. Built in versus download.** Recommended: each library entry says "Also built in" with the
  built-in design names when NoaCG already has that type, so a user who only needs the look picks
  it in the app and a user who wants their own design downloads the SVG.
- **D5. Names.** Recommended canonical names, used in recipes, app labels, docs and templates:
  Scoreboard; End credits; Countdown (counts down, game timer); Clock (time of day, elapsed, or to
  a set time); Live vote; Vote results; Standings; Lineup; Goal meter; Lower third; Holding screen;
  Pop-up alert (the self-clearing recipe) versus Alert level (the severity type); Join card;
  Message.
- **D6. Feature pickers.** Recommended: Join card, Results and Messages each list "Your designs"
  (library graphics that meet the contract) beside the production's graphics and the built-ins.
  Choosing one adds it to the production. Join gets a remembered choice like Results and Messages
  already have.

## The contract (to document once, generated from the registry)

- **Purpose is read from layer names.** A recipe's role words, or a feature contract (`QR`,
  `Message`/`Name`, the vote layers). One source: `behaviours/layer-names.json` gains the feature
  contracts so docs, the layer check and the agent skill read the same words.
- **Fallback.** No match is a plain graphic with one field per text layer. Unchanged.
- **Dynamic elements.** Named text layers become fields; hidden groups in `Moments` are states;
  `QR` is a generated code; bars are gauges.
- **Text length.** The fit ladder, documented per template with the longest sample the design is
  drawn for.
- **New types.** A new type is a recipe declaration or a feature contract entry plus one template;
  the library check fails if a recipe or contract has no template.

## Phases

1. **Names and contract.** Apply D5 in recipe names, words.json, app labels, docs. Add feature
   contracts to layer-names.json. Countdown pulse and flash (CSS in `lookCss`).
2. **Feature pickers.** D6: library candidates helper (pure, tested), pickers in
   `ProductionAudienceWorkspace.tsx`, `Show.joinTarget`. Tighten message matching so a quiz's
   `Question` is not offered as a message destination.
3. **One library.** Merge folders and inventories, packages, page sections by package, "Also built
   in" labels, downloads card with the package zips, tests and checks moved to the new paths
   (`e2e/downloads.spec.ts`, `e2e/svg-examples.spec.ts`, `e2e/svg-templates.spec.ts`,
   `check-svg-example-coverage.mjs`, `svg-files.mjs`, `e2e-affected.mjs` regexes, `vercel.json`
   redirect, old anchors kept).
4. **Templates.** Restyle the examples into the house style and add the missing ones: Join card,
   Live vote and Vote results matching it, Message (one model for pasted, chat and Twitch, with
   optional Name and source badge), Q&A, Corner countdown (game show), and every recipe and
   static type family without one. A preview script renders each state with Playwright, so
   previews are reproducible.
5. **Proof.** Each template imported, detected, and driven by its feature in e2e; the Join card,
   Results and Message templates picked from the feature pickers end to end.

## Acceptance criteria

- AC-1. One Template Library page, one downloads card; no user-facing "Examples" set remains;
  old links land on the library.
- AC-2. Every recipe and feature contract has at least one template; a check fails otherwise.
  Every catalog type is listed with its template or as "Built in, not yet customizable".
- AC-3. Every template imports with the expected recipe or contract detected and its controls
  working (e2e), in one house style, with previews of each state.
- AC-4. A Join card, Vote results and Message template, imported unchanged, appear in their
  feature's picker, and choosing them stages a working cue (QR scans to the link, results show
  counts, message shows body and name).
- AC-5. The countdown pulses while in the last stretch and flashes at zero; Pause, Reset and the
  bar still work.
- AC-6. One name per concept across app, docs, templates and inventories (D5); stale counts fixed.
- AC-7. The import workflow's steps are unchanged apart from names.

## Non-goals

- Redesigning the import workflow or its dropdown.
- New runtime engines for Gap 4 types (follow-up plan, if D1 is agreed).
- Changing built-in catalog designs.
