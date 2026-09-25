# src/components/home - the Home surfaces

The save contract these surfaces obey - never report a save the storage layer has not agreed to -
stays there, because every surface owes it.

## Home (home/, docs/SAVED_CONTENT_MODEL.md)

- **home/HomePage** - `#/home[/<section>]`, PRODUCTIONS-FIRST (docs/GOALS_ARCHIVE.md "Student
  release" step 8): no section = the DASHBOARD (productions as CARDS, then a SHELF of the six
  most recent graphics, then recent videos); nav sections are productions / graphics / videos
  / looks, each with its count. The retired `recent` and `controls` sections land on the
  dashboard - every graphic row reaches its control panel through its ⋯ menu. The
  shell/nav/dashboard live here; the section bodies are `home/sections/*`.
  **THE DASHBOARD SHOWS, THE SECTION LISTS** (handoff §5a). Its question is "pick up where you
  left off", which a graphic answers by being RECOGNISED - so a shelf card is thumbnail + name,
  the whole card the door, no per-row controls. The library ROWS and every verb on them belong
  to the Graphics section, so a spec wanting a `.lib-row` opens the section first (one such
  walk, `e2e/render.spec.ts`, was caught only by CI - a Home change does not map to it).
  **The Graphics section's header is ONE row** (handoff §5b): title, search, sort, view
  toggle - a title on one line with the search on the next spent two bands of the fold on
  chrome. The search box lives there but the QUERY is HomePage's, since the dashboard searches
  with the same one. Under it, TYPE chips derived from the library (only types someone
  actually has; counts are of the whole search-filtered set, so picking one never renumbers
  the others), and they appear from two types - one type is not a filter.
  A graphic is `home/GraphicRow` in TWO containers off one `view` prop (`prefs.libraryView`,
  per device): `.lib-row--grid` is a CARD, `.lib-row--list` a row of the §5c TABLE - preview |
  name | type | edited | folder | actions, where `.lib-thead` and every row share ONE
  `--lib-cols` template whose two trailing columns are FIXED, because the heading cells are
  empty and `max-content` collapsed them to nothing, sliding every heading right of the values
  under it. The FOLDER cell and its track drop together (`showFolder` /
  `.lib-list--nofolder`): it is on only during a SEARCH, the one level that crosses folders -
  at the root every row is unfiled and inside a folder every row is in it, so the column
  printed one value twelve times. Dropping the cell without the track is the §5c defect.
  The CARD carries the same fact as a pill under the name, which has to `align-self: flex-start`
  or the column's stretch turns a tag into a full-width bar.
  Both carry Open, the "+ Production" popover and the `home/RowMenu` ⋯ overflow
  (control panel / export / rename / duplicate / publish / two-step delete).
  **SELECTION HAS NO CHECKBOXES** (handoff §5b): the item takes the click, shift-click extends
  over the VISIBLE order, a press on the container's own background clears, and `.lib-select`
  is a PIP reporting state rather than a control column beside every row - INVISIBLE at rest
  (by opacity, so it keeps its space, its focus order and its click target; an outline on every
  resting row is that checkbox column drawn faintly), and still what a shift-click lands on.
  The bulk bar renders AFTER the items, which is what lets `sticky; bottom` float it over the
  list - above them its natural place is the top, so it never lifts off.
  **FOLDERS GROUP THE VIEW** (docs/SAVED_CONTENT_MODEL.md §6, revised on the 2026-08-23 owner
  walk): `home/FolderItem` first - cards in the grid, rows in the table, ONE component so a
  folder can never do less in one view than in the other - then the graphics filed in none of
  them; opening one shows its contents alone under a breadcrumb carrying ← All graphics, the
  folder's ⋯ and its "+ Production". The band is not on screen at that level, which is why the
  head carries those verbs rather than sending you back out for them. A SEARCH stands the band
  down and lists every match across folders (the flat list is what an answer to "where is X"
  needs; it is what the chip row wrongly did at rest) - and it is GLOBAL from inside a folder
  too, owner-ratified 2026-08-23. It therefore owes two things: each match says where it lives
  (`showFolder` - the table's column AND the card's tag, since the card grid is the default
  view), and `folderFilter` is RETAINED rather than cleared, so clearing the query puts you back
  in the folder you searched from. Every folder verb is
  `setGraphicsFolder` over its members - there is no folder record - so a folder holding
  nothing cannot persist, and a newly named one lives in component state until something is
  moved into it. Emptying the folder you are STANDING IN walks you back to the root; a view
  parked inside a place that no longer exists reads exactly like an empty folder.
- **Graphics production membership rule** - derive it from `productionsContaining`'s relation,
  never store it on the graphic. A graphic can belong to several productions, so show pills
  rather than grouping by production; filtering flattens folders exactly like search, and "Not
  in a production" keeps unassigned graphics reachable.
- **home/ProductionPicker** - THE "+ Production" door, shared by a library row, a folder, the
  bulk bar and `GraphicControlPage`. It CLOSES on a successful pick and flashes ✓ on the
  BUTTON, which is still on screen; a FAILED add keeps it open, because `onAdd` answers whether
  the write actually landed and a closing menu would report a save that did not happen. A
  folder and the bulk bar pool through ONE verb (`addListTo` -> `poolAll`), so the honest
  partial-failure report cannot fork per door.
- **home/LibMenu** - the popover SHELL: the popover class, how it CLOSES, and which WAY it opens.
  Direction is MEASURED in a layout effect, never assumed - the bulk bar floats at the bottom of
  the screen by design and the last row of a long library is there by arithmetic, so a downward
  menu was off-screen for both and bulk "+ Production" looked broken while it was working. What
  it measures against is `clipBounds`: the viewport TIGHTENED BY EVERY SCROLLING ANCESTOR, since
  an absolutely-positioned menu is cut off by its scroller exactly as it is by the fold (the
  production rundown's last cue was the case that proved it). The GAP is read off the drawn menu
  rather than restated in the module, so a surface with a different CSS offset cannot make the
  decision and the drawing disagree. A menu too tall for either side stays down and scrolls
  inside itself.
  It is not tied to the library's look: `surface` names the popover's base class (so
  `ProductionPage`'s links panel is `pd-links` through the same shell) and `role` says what the
  popover IS - a list of verbs is a `menu`, a disclosure panel of links and forms is not.
  **A surface owes the shell two CSS rules**: its own downward offset and a `<surface>--up`
  swapping `top` for `bottom`, plus a `max-height`. Every popover on Home AND on the production
  dashboard goes through it; hand-rolling one is how the dashboard's two came to open downward
  only.
  **An outside press is LISTENED FOR, never caught by a covering element.** There is no backdrop
  div and there must not be one again: a full-viewport catcher closes the menu by SWALLOWING the
  press, so the control the operator was reaching for needs a second one - between two popovers
  on one bar (bulk "+ Production" and Folder, the cue rundown's neighbouring `⋯`) that reads as
  a dead button. A document `pointerdown` in the CAPTURE phase closes it instead, and the HOST is
  treated as inside, because the trigger owns its own open state and closing here would race its
  toggle into reopening what the press meant to shut. Escape closes too - the keyboard route the
  backdrop never had.
  Icons are inline SVG from `components/icons.tsx` - no
  pictographic emoji on these surfaces (monochrome verb glyphs stay). Local-first, no auth
  gate - sign-in only adds sync. `#/package/*` is a retired route that lands on Home.
  Its topbar carries the **beta feedback door** (`area="home"`), as the wizard's header does
  (`area="wizard"`) - it existed only in the EDITOR shell, the surface the student release
  demotes, so the release's own user had no way to send anything. Both render nothing offline,
  and with a wizard open over a shell TWO are in the document: `data-area` names one.
- **home/sections/ProductionsSection** - production CARDS: a production has a state, a size and
  a set of graphics, and a one-line row showed none of them. Name + published badge, stats, a
  strip of its graphics, then Open dashboard / Output URL / export; the dashed last card makes
  one. Published tints GREEN - amber is preview and red is on air (Brand §3).
- **home/GraphicThumb** - a card's THUMBNAIL: the real graphic rendered small through
  preview/composeDocument and parked at its settled on-air state (the PlayoutSimulator settle
  recipe; a template with no builder contract falls back to its own play(), since a card has no
  Play button beside it). A LIVE render, deliberately not a picture stored on GraphicDoc: no
  persisted-format change, no migration, nothing extra to sync, and it can never disagree with
  the template it previews. The iframe mounts only when the card scrolls into view
  (IntersectionObserver). It is FRAMED ON THE GRAPHIC, not on the canvas
  (preview/frameGraphic.ts, shared with the wizard's picker cards): a lower third is a band
  across a fraction of a 1920×1080 frame, and at 144px the whole-canvas view was an unreadable
  smear of one. Measured after the settle, so nothing is framed mid-air.
- **home/GraphicControlPage** - `#/control/<graphicId>`: the saved graphic's operator
  panel, and the surface that AIRS (the editor's Rehearse tab is the preview-only twin) -
  live graphic + transport + machine event buttons (GREYED by controlModel `isEventLegal`
  against a 500ms poll of the graphic's own `noacgMachineState`, exactly as the editor's
  Rehearse panel, the event strip and the hosted page do) + a STATE CHIP naming the current
  state (the fact the greying is judged against, so a button is never greyed without the
  surface saying why) + ENTRIES (named data rows: add/duplicate/rename/delete/select-active,
  ▶ Play with an entry, ★ make an entry the template's default data via setFieldDefault) +
  the downloadable controlpanel.html with entries baked in (control/controlPanelHtml.ts
  opts.entries). Entry mutations compose through a read-fresh `patch(cur => …)` - two edits in
  one tick must never overwrite each other. An entry's ✕ is ARMED (two-step, like Home's
  graphic delete): typed-in data with no undo behind it, on a row someone drives live.
  The word ENTRY is DEFINED where it is used (`entries-explainer`) - one saved set of field
  values, played to take it on air, saved as you type. The paragraph under it says what the
  SURFACE is; neither answers the other's question, and a first visit needs the definition
  first (owner walk 2026-08-23: he had to guess).
  Its topbar carries **"+ Production"** (the shared home/ProductionPicker): this is where a
  graphic gets test-played, and "put it in the show" was reachable only by going back to Home
  and finding its row again.
  **MOTION** - the no-code IN/OUT picker (`components/MotionPresetPicker.tsx` over
  `blocks/motionPresets.ts`, the owner's animation road step 1, 2026-08-23): a `<details>`
  under the transport, CLOSED by default (the stage shares the column's height), its summary
  naming what the graphic does now - "In: Rise · Out: Fade · Normal" - read back from the
  TEMPLATE'S DATA every render (`currentMotionPreset`), never from component state; a catalog
  choreography or a timeline edit honestly reads "its own". Open: the ten cards + the wizard's
  Direction row (In and out / In only / Out only) + the speed knob (NOACG_ANIM.speed). A pick
  is ONE deterministic data edit saved through the same `patch` the entries use; the rebuilt
  document then DEMOS it once (play, hold, stop, re-settle - `demoAfterLoad`, no on-air tally)
  where a plain reload still lands parked. Absent only when the graphic has no NOACG_ANIM
  block. Pinned by e2e/motion-presets.spec.ts.

## The team door (docs/TEAMS_PLAN.md §6, contract in src/components/teams/AGENTS.md)

Two surfaces here mount it, and both must ask the SAME gate: **`useTeamsAvailable()`** -
`backendConfigured && status === 'signed-in'`.

- **sections/ProductionsSection** - "Share with a team…" as the production card's `RowMenu`. The
  menu is drawn ONLY when it has an item, so offline a card has no ⋯ at all. Delete stays a
  visible button; do not move it in to tidy up. Once the account is in a team the list splits:
  **My productions**, then **Shared with my teams**, one band per team (`TeamBands`). A team
  production is the same card plus the chip and "edited by", its ⋯ opens the team, and only the
  team's OWNER gets Delete. Your own list is capped on the dashboard; a team's never is - the
  invitation is the news.
- **sections/TeamsSection** - `#/home/teams`, listed in the nav only while the account is in a
  team: one card per team with its members, its productions and the join-code door.
- **ProductionPage** - the header button, beside Export… and a header's width from ■ All out. On a
  team production the Share button's place holds the TEAM's button instead, on the same width
  budget (its name stands down under 1440px like Share's word). Opened cold on a team production
  before the first team fetch, the page says "Loading" rather than "no longer exists".

**Never gate a team surface on `useAuthState().signedIn`** - it is TRUE offline (deliberately,
so a gate cannot trap a user in a build with no login), so that reading renders the door in
exactly the build that must grow ZERO team UI. `e2e/auth.spec.ts` pins the absence and is a
stage-3 evidence bar, not a nicety.

## Monitors (PayloadStage / ProgramStage)

- **home/PayloadStage** - ONE monitor component: `createOutputStage` over an `OutputPayload`,
  the same two functions the published output URL is built from, fed the same
  `ControlSendItem[]` the verbs send. Both monitors on both playout surfaces (the in-app
  production page and `components/HostedControlPage`) are one of these, which is what makes a
  monitor unable to disagree with air without the renderer itself being wrong.
  **It RE-ASKS for machine state once a second**, as `/output` always has (src/output/main.ts;
  the staleness it prevents is in PayloadStage.tsx's own comments - the ⚡ buttons grey against
  this state via `isEventLegal`). The guard is the SUBSCRIBER (`onState`), not mount-time
  config, so a preview monitor nobody reads state from costs one boolean per second. Pinned by
  e2e/production-controls.spec.ts.
  It also publishes **`data-plays`** on its root - entrances applied since this stage came up,
  reset per rebuild and counted only when a stage actually took the command. A DUPLICATE
  renderer command is the one fault that leaves no trace (a second `play` settles on the picture
  already showing), so this is the only handle a test has on it; mutation-test both halves of
  `e2e/configured/hosted-control-recovery.spec.ts` when touching either.
- **home/ProgramStage** is the app-side wrapper that builds the payload from the local show
  first (it was the rehearsal stage; rehearsal is retired - docs/PLAYOUT_DASHBOARD.md §6).

## Production data (docs/PRODUCTION_DATA_PLAN.md)

A production owns a tree of LIVE values; graphics bind fields to paths in it, so one change moves
every graphic that uses it and an external system never has to know which graphic is on air.
Phase 1 is built - manual, local, no API.

- **home/ProductionDataPanel** - the playground (the live tree, add/edit/delete, Reset to seed,
  Clear, Save as seed, Raw JSON) plus the BINDINGS table. It is domain-neutral BY CONSTRUCTION:
  the steppers are generated from whichever leaves happen to be numbers, so a score, a poll tally
  and a lap counter get the same affordance and no dataset is named anywhere in the file. It sits
  above the tables in `ProductionDataWorkspace`, whose own section is called "Tables" so
  "Production data" means exactly one thing on the surface.
  **Its head/actions classes are `.pd-live-head` / `.pd-live-actions`, not the tables section's**
  - `.pd-data-head .pd-data-actions` is measured by geometry in the empty-state spec, and a
  second element wearing those names would answer that measurement instead.
  A LIST value edits in a TEXTAREA, chosen by the value's TYPE and never by how many lines its
  text currently has: `<input>` sanitises newlines out of its own value, so a list rendered there
  comes back joined into one string, and a condition that moves while somebody types would swap
  the element under their caret. `reparseLeaf` reads an edit back in the type it already had.
  **Its text boxes are DEFERRED** - see `home/useDeferredEdits` below.
- **home/useDeferredEdits** - the hook that makes a text box cost ONE write per edit rather than
  one per keystroke, and keeps what is being typed safe from a store that moves underneath. Any
  box in this directory controlled by something persisted or shared belongs on it rather than on
  a fourth private copy of the idea; the file names the surfaces that still have their own.
- **home/ProductionDataWorkspace** - the Tables section. **Every destructive control on a table
  is ARMED** - the table, a COLUMN and a ROW alike: all three take typed-in values with no undo
  behind them, off a table someone may be reading rows from during a show. One `armed` state per
  card holds `'table' | col:<key> | row:<id>`, so arming any of them disarms the rest and two
  pending confirms can never sit on screen together. The table's button says the word
  ("Delete table?"); the column's and the row's swap ✕ for ✓ and carry the meaning in the amber
  and the tooltip, because both sit in tracks sized by that button and a word would widen the
  table under them (docs/PLAYOUT_DASHBOARD.md §2d, one surface over).
- **ProductionPage is being SPLIT, read-only pieces first** (docs/backlog/production-page-phases.md
  carries the state map and the five phases still to run). Out already: `home/ProductionLinks.tsx`
  (the links popover, with `LinkRow` and `BridgeAirRow`), `home/ActionLog.tsx` (the wire-log
  readout) and `home/CueOverflowNote.tsx` (the too-long line, plus `cueOverflowKeys` - the pure
  program-or-preview choice the page still needs for the field marks). All three are pure
  READOUTS: they hold no state and send nothing.
  **What may NOT move: `liveCue` and `selectedCueId`.** `liveCue` is a map keyed by graphic name
  and Take airs the selected cue's LAYER out of it, so splitting either across two owners changes
  what goes on air. That is why the links panel's MARKUP moved and its state did not - `unpublish`
  writes `setLiveCue({})`, so five values read nowhere else on the page still cannot travel with
  the popover they belong to.
- **ProductionPage owns the tree**, not the workspace - the one sender (`runVerb`) lives there and
  the Data tab unmounts the playout surface, so an edit made on Data would otherwise have no route
  to air. It holds the state, resolves bindings, diffs against what was last sent, and dispatches
  only the changes.
- **PUBLISHED vs UNPUBLISHED is one fact: does the production have a data key?** Unpublished, the
  tree is localStorage and this page resolves + dispatches it. Published, `control_shows.data` is
  the authority: edits go out as `PATCH /api/data/patch` (`control/productionDataApi.ts`), the
  RPC writes the log rows itself, and this page must NOT also dispatch or every write doubles.
  A `src:'api'` row on the log is the signal that a FEED moved the tree - re-read it there rather
  than subscribing to `control_shows` a second time.
  **`dataKey === undefined` means not-yet-resolved and the local dispatch waits for it**; reading
  it as "offline" makes a published production, opened cold, push its stale LOCAL tree to air for
  one render.
  A whole-tree replace (Reset, Clear, Raw JSON) goes through `replacementPatch` - a merge patch
  can only say what it NAMES, so every dropped key needs an explicit `null`.
- **THE RULE (plan §2.7): a bound field is not a cue value.** Take, ✎ Update and the PREVIEW all
  overlay the live tree over the cue's own values, so a cue prepared at 1-0 airs 3-2 if that is
  what the data says. The cue editor therefore renders a bound field READ-ONLY with its path - an
  editable box there would show a number nothing will ever air. **Manual override is Unbind**,
  deliberately, and there is no precedence hierarchy beyond that.
