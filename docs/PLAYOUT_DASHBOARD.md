# The playout dashboard — one operator surface, three deployments

Binding design contract for the surface an operator drives a production from. Owner-specified
2026-08-05 against desktop and phone reference designs (those mockup PNGs were planning
artefacts and are no longer in the repository), and the four INTERACTIVE blueprints in §8a. Three surfaces render it and **must not diverge**:

| Deployment | Code | Wire |
|---|---|---|
| In-app production page | `src/components/home/ProductionPage.tsx` | local (preview) + hosted log (air) |
| Hosted control page | `src/components/HostedControlPage.tsx` | hosted log |
| Exported controller | `src/control/productionControllerHtml.ts` | the bundled local relay |

**One deliberate difference, ruled 2026-09-15** (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f): the
production control profile's ARRANGE renders on all three, and its COMBINE renders on the two
hosted pages only. The exported controller says in one line that a production's combined
controls run from its hosted page, rather than carrying a second sequencer in vanilla JS. Shared
production data likewise stays on the hosted pages; the exported controller carries no tree.

Before this contract they were three different products: the exported one had PREVIEW/PROGRAM
monitors and a blue accent, the hosted one had no monitors at all and stacked one tall card per
graphic, the in-app one had a single preview and reordered layers with arrows. A student who
learned one could not operate another.

## 1. What the operator is doing (the 90% case)

**Choose a cue → look at it on PREVIEW → it is right → TAKE.** That is the job. Everything on
the surface serves it.

- **Selecting a cue in the rundown puts it on PREVIEW.** No separate "load" step: selection IS
  the preview gesture. Nothing about that touches air.
- **PREVIEW is a check of the graphic you are about to air**, not a viewport onto "the next
  item". It answers one question: is this the right graphic with the right words?
- **TAKE airs what is on preview.** It is the loudest control on the page and the only red one.
- Going straight to air is allowed (take without looking) — the gate is a courtesy, not a lock.
- Replacing a live graphic with a new one is the same gesture, which is why a rundown row can
  read ON AIR while another reads PVW.

## 2. Layout — desktop

Two columns in a fixed shell. **The CONTROL AREA under the monitors is the only scroller; every
block in it is content-sized.** The header, the stage head and the cue rail never move.

```
┌ header ───────────────────────────────────────────────────────────────────────┐
│ ▤ Show name  ● SHOW  00:42:17        ● output connected · N layers            │
│                                         [Publish/links]  [Export…]  [■ All out]│
├───────────────────────────────── main ──────────────────┬─── cue rundown ─────┤
│  ● PREVIEW  <cue name>        ● PROGRAM · ON AIR   L1   │  ⣿ 1 Presenter strap │
│  ┌───────────────┐            ┌───────────────┐         │      after the intro │
│  │  amber frame  │            │   red frame   │         │             L1 ON AIR│
│  └───────────────┘            └───────────────┘         │  ⣿ 2 Topic card  PVW │
│  [⟳ TAKE SPACE] [⟳ Re-take R] [✎ Update U] [» Next N]   │  …                   │
│  [■ Out 0]                          on air: ● <graphic> │                      │
│  ┌ EDITING PREVIEW CUE · <name> ─── switch to on-air ▾┐ │                      │
│  │ F0 · KICKER   F1 · TITLE   F2 · SUBTITLE           │ │                      │
│  │ [⚡ event] [⚡ event]                                │ │                      │
│  └────────────────────────────────────────────────────┘ ├──────────────────────┤
│  ▸ ACTIVITY  20:14:02  ⟳ Take · Presenter strap         │ [+ from library][+ …]│
└─────────────────────────────────────────────────────────┴──────────────────────┘
```

- **THE HEADER OPENS WITH NAVIGATION, and ends with the panic control** (owner walk,
  2026-08-29). Left to right: the logo (which is the Home door here), **＋ New graphic**, ← back
  to Productions, the production's name and mode, the clock, the workspace tabs - then the
  spacer, and only after it the authoring and air controls. The wizard door was in the right-hand
  cluster and is now the first control after Home, the same order every other shell uses
  (`src/components/AGENTS.md`, NewGraphicButton). That also puts the width of the header between
  it and **■ All out**: a hand reaching for the panic control must never land on navigation.
  **The output heartbeat is shown only when there IS an output** - see `docs/CLOUD_PLAYOUT.md` §3.
- **THE SCROLL MODEL (owner report 2026-08-19).** The surface used to be locked to the viewport,
  so a graphic with many fields could not make the page longer and the **editor** — the pane an
  operator changes scores, names and texts in mid-show — grew its own scrollbar instead.
  Measured on a 1080p monitor at 125% scaling (1536×814 CSS px) with an eight-field quiz:
  `.pd-editor` was 178px tall over 240px of content, `.pd-activity` 14 over 20, and the document
  could not scroll by a single pixel. Scrolling that little box during a show is the complaint.
  The rule now, in the owner's own words — *"I don't mind scrolling the whole page… I also don't
  want it too small"*:
  - **Nothing is shrunk to fit.** A complex graphic is allowed to make a long control area.
  - **ONE scroller, and it is not the page (owner, real production test, 2026-09-22).** The
    first cut of this model scrolled the whole PAGE and kept the header, the monitors and the
    rail on screen by making them STICKY. They held still in a plain wheel test, but the owner
    saw them *"still move or bounce when the control area is scrolled"*: anything that moves
    the document moves sticky blocks with it, a trackpad's overscroll bounce most visibly, and
    scrolling the rundown to its end chained into the page. Measured before the fix, the
    document scrolled 611px at 1366×768, 687px at 1280×720 and 238px at 1920×1080. Now the
    shell is `100dvh` with `overflow: clip`, the document has nothing to scroll (0px at all
    three), and `.pd-control-area` - the editor, the ⚡ actions, the ± live numbers, the
    controls panel and the activity log - is the one scroll container, with
    `overscroll-behavior: contain`. The stage head and the rail are plain grid areas that do
    not scroll and have no sticky positioning left to fail. Inside the control area,
    `.pd-editor`, `.pd-actions` and `.pd-activity` stay content-sized with no `overflow` of
    their own, so the 2026-08-19 complaint cannot come back: the editor is never a small box.
    `e2e/playout-fixed-panes.spec.ts` pins it at 1366×768, 1280×720 and 1920×1080 by sampling
    every frame while a wheel scrolls the area: the monitors, the verbs, the rail and the header
    move by 0px.
  - **The other scrollers, each because it has nowhere else to go:** the cue list inside the
    rail (a forty-cue rundown), the Data and Audience sub-pages (which take the whole body while
    open), and the `⋯` / links popovers. The lists and sub-pages are `overscroll-behavior:
    contain` too, so reaching the end of one never hands the wheel on.
  - **Both popovers go through `home/LibMenu`**, the shell Home's row menus use, so which WAY
    they open is MEASURED rather than assumed and each caps its own height. It measures against
    clipping ancestors, not only the fold: the cue list is its own scroller, so the last cue's
    `⋯` was cut off by the LIST while still clearing the bottom of the screen. Adding a popover
    to this page means using that shell and giving its class a `--up` rule, never hand-rolling
    one again (which is how both of these came to open downward only). The shell also decides
    how a popover CLOSES: an outside press is listened for, not caught by a covering backdrop,
    so moving from one cue's `⋯` to the next takes one press rather than two.
  - **The phone (≤900px) stacks and scrolls as one column, deliberately.** Same fixed shell, but
    there is no room to hold the monitors and the rundown still beside a scrolling control area
    - a phone would be left a sliver of editor. So `.pd-body` is the one scroller there, the
    monitors and the rundown scroll with it, and the verb bar is pinned to its bottom, because
    on a phone the verbs are what must never leave the screen.

  **Measured before and after**, same production and graphic, driven for the acceptance pack:

  | | monitor block | the editor | the page |
  |---|---|---|---|
  | 1920×1080 | 442px (41%) → **323px (30%)** | fit either way | did not need to scroll |
  | 1536×814 | 334px (41%) → **254px (31%)** | 62px hidden → **0** | could not scroll → did not need to |
  | 1536×560 | 334px (60%) → **188px (34%)** | 62px hidden → **0** | could not scroll → **scrolls 165px** |

  A VISUAL ACCEPTANCE PACK exists for this change (the contract is in
  `docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Verification contract"): five before/after pairs from the
  real app — the reported size, nominal 1080p, scrolled to the bottom of a short window, the Data
  tab, and the phone — with the repeat-by-hand sequence. It asked two things: whether the capped
  monitors are now too small to judge a graphic by, and whether the space they free to the right
  of PROGRAM reads as sized or as unfinished.

  **READ BY THE OWNER 2026-08-21. Both questions answered, and the read opened three more.**

  - **At 1536×814 the cap is RIGHT** — *"The gap and monitors are not too small; I think they're
    fine."* The empty column is accepted for now: *"Right now, I can't come up with anything for
    that area, so it's fine."* This size is settled; do not re-open it without a new complaint.
  - **At 1920×1080 the cap is WRONG, and it is the opposite complaint** — *"that actually looks
    pretty bad… I think that it has too much empty room at the bottom and the monitors are
    unnecessarily small."* A flat `26vh` answers the 814px window and wastes the 1080p one: the
    monitor block is 323px with over 500px of page below it doing nothing. **The rule the cap
    should express is not a fraction of the viewport, it is what is LEFT** — the monitors take the
    room nothing else needs, floored and ceilinged. Owner's tie-breaker when they compete:
    *"if the graphic needs controls, I would rather have the controls big than the monitors too
    big."*
  - **…but sizing off leftover room must not make the monitors twitch.** *"it's also important
    that the program and preview monitors don't jump between scales depending on what graphic we
    are looking at."* That is a constraint on the fix AND a defect that already exists: the cap is
    a grid track of `--pd-monitor-h * min(--pd-ar, 16/9)`, and `--pd-ar` is the PREVIEWED
    GRAPHIC's own ratio — so selecting a 9:16 or square cue narrows both monitors today. Whatever
    replaces the flat `vh` has to be computed per PRODUCTION (the pool's worst case), never per
    cue, or it trades one twitch for another.
  - **At 1536×560 the verb bar scrolling under the sticky monitors is a real hazard** — *"I think
    it's a bit scary that you scroll the monitors on top of the take buttons… I think the buttons
    should be visible."* Correct by this document's own §2 rule: what must never leave the screen
    is STICKY, not small — and the verb bar is the one block that carries TAKE and Out. It is
    currently neither sticky nor protected.
  - **The proposed answer to both, from the owner: put the verb bar in the empty column beside
    PROGRAM.** *"the buttons would fit to the right of the monitors."* It is one change that
    spends the dead width, takes the bar out of the vertical stack (so the monitors can grow into
    the height it frees at 1080p), and makes the bar part of the sticky monitor block instead of
    something that scrolls away. Treat it as a BREAKPOINT, not a move: below the width where a
    verb stack fits beside PROGRAM the bar returns underneath. `■ All out` stays in the header
    regardless — it is the panic control and its distance from the others is deliberate.
  - **THE MINIMUM SUPPORTED WINDOW IS 1366×768** — sanctioned and then set by the owner the same
    day (*"we don't have to fit everything on any size. We can have a minimum that we need to
    use."*). It is the budget school-laptop floor, which is the hardware the class runs on. Below
    it the phone breakpoint takes over. **1536×560 is therefore not a design target** — it is a
    resized browser, and what it owes is degrading without breaking, not fitting. The verb bar
    sits beside PROGRAM down to 1366 and returns underneath below it.

  **BUILT 2026-08-21, all three surfaces, and measured.** Three changes, each answering one of
  the findings above:

  1. **THE STAGE HEAD.** `.pd-stagehead` wraps the monitors AND the verb bar, and IT is what
     sticks. The bar can no longer scroll away under the monitors, which is §2's own rule applied
     to the one block carrying TAKE and Out.
  2. **The bar sits BESIDE PROGRAM at and above 1366px** — the minimum supported window, so the
     breakpoint and the floor are one number. It is two verbs across with TAKE spanning the pair
     on the first row, not a single column: six verbs stacked need ~294px, which is TALLER than
     the monitors at 1536×814, and the stack would then set the head's height instead of the
     picture. Below 1366 the bar returns underneath, unchanged.
  3. **The monitor cap grows with the window** —
     `clamp(170px, calc(26vh + (100vh - 768px) * 0.28), 38vh)` in place of a flat `26vh`, from
     the 768px floor of the minimum supported window. Viewport-derived on purpose: sizing it from
     what the editor leaves over would resize the monitors whenever a cue with a different field
     count was selected, which is the same twitch in another costume.

  **Measured, same production and graphic, before → after:**

  | | PREVIEW picture | sticky head | page scrolls |
  |---|---|---|---|
  | 1920×1080 | 281px → **368px** | 323px (30%) → **410px (38%)** | 0 → 0 |
  | 1536×814 | 212px → **225px** | 254px (31%) → **267px (33%)** | 0 → 0 |
  | 1536×560 | 188px → **170px** | 188px (34%) → **224px (40%)** | 165px → **148px** |

  The 1080p picture is a third bigger, which is the complaint. 1536×814 — the size the owner
  ACCEPTED — moves by 13px of picture and 13px of head, so what was accepted stays accepted. At
  1536×560, below the supported minimum, the head takes a larger share BY DESIGN: it now holds
  the verb bar, which is the point. No pane on any surface has a scrollbar of its own.

  **THE MONITORS ARE WIDTH-LIMITED, NOT HEIGHT-LIMITED — do not re-open this without new
  numbers.** 257px of the 1080p page is still empty below the last row, and the owner asked the
  obvious question: spend it on the monitors. It cannot be spent. Measured at 1920×1080, the
  stage column is 1540px and it is full — 1321px of monitor grid (two 655px frames), a 176px verb
  column, and the 380px cue rail beside it. A frame is `width: 100%` with the stage's
  `aspect-ratio`, so **every extra pixel of picture HEIGHT costs 3.56px of WIDTH** (two monitors
  at 16:9). With ~26px of width to spare before the verb buttons stop being readable, that is
  about seven pixels of picture. The same holds wider: at 2560×1440 the picture is 547px where
  the width would allow 559, so the 38vh ceiling binds by twelve pixels.

  The empty room is BELOW the page and the monitors cannot reach it. Growing them means taking
  width from the cue rail, from the verb column, or putting the verb bar back underneath — and
  the best of those is worth about 9%. **Owner decision 2026-08-21: leave it.** The pack measures
  `slackBelowLastRow` on every dashboard frame so the next person asking this question starts
  from the number rather than from the impression.

  **The cue's aspect ratio no longer sizes the monitors.** `--pd-ar` is the PRODUCTION's stage,
  derived exactly as `buildOutputPayload` derives it and as the exported controller already baked
  it, so all three surfaces agree on one canvas. Both frames wear that ratio and a differently
  shaped cue is LETTERBOXED into it — `Math.min` contain-fit, the arithmetic `src/output/stage.ts`
  has always used, so PREVIEW now behaves like the renderer it is previewing. PROGRAM's frame was
  hard-coded `16 / 9` and follows the same stage now, which is what a 9:16 production always
  needed.

  **Where that read was done: `docs/acceptance/owner-pack/index.html` §2** (rebuilt 2026-08-21 by
  `node scripts/acceptance-pack.mjs`). It carries both questions verbatim over frames of the real
  app at 1536×814, 1536×560 and 1920×1080, on **all three surfaces**. Each frame carries the
  geometry read off the live document at capture time, which reproduces the table above and adds
  the number the second question is actually about: the empty width beside the PROGRAM frame is
  **378px at 1536×814, 612px at 1536×560, 516px at 1920×1080**.

  **The three surfaces are now MEASURED not to diverge, not argued not to.** The hosted control
  page reports the identical geometry to the in-app page at both sizes — 254px / 31% / 378px at
  1536×814, 188px / 33% / 612px at 1536×560, no pane with a scrollbar of its own on either. It
  needs Supabase env plus a publish, which an offline checkout has by design, so the pack's
  `hosted` section builds the ordinary bundle with the env pointed at a stub origin and answers
  0008's RPCs from memory with the production's own `buildPanelSpec`/`buildOutputPayload`. It is
  captured OPENING onto a show already on air — the hosted page's own case — because the log
  follower tail-fills only when Realtime reports SUBSCRIBED, so nothing after the open moves in
  that rig, and the frame says so rather than implying otherwise. What it proves is the LAYOUT;
  the server side stays the live checklist's job.
- **Monitors are 16:9, side by side, equal, and CAPPED near 30vh** — owner, same report: *"we
  should rather make the preview and program screens a bit smaller… you see what's out all the
  time"*. Uncapped they took 41% of the height (442px of 1080). The cap is expressed as a grid
  TRACK WIDTH, not as a height: a frame is `width: 100%` with the graphic's own `aspect-ratio`,
  so clamping its height directly would letterbox the picture inside a box the component
  measured for something else. The track width that keeps both monitors under the cap is
  `--pd-monitor-h * min(stage ratio, 16/9)`, where `--pd-ar` carries the production's own ratio
  as a bare number. The pair stays flush LEFT, sharing an edge with the editor card below; above
  1366px the verb bar occupies the width the cap frees to their right, and below it the bar sits
  under them and shares that same left edge.
  **`--pd-ar` IS THE PRODUCTION'S STAGE, never the previewed cue's** (fixed 2026-08-21; it was
  the cue's, so selecting a non-16:9 cue narrowed both monitors — the "monitors don't jump between
  scales depending on what graphic we are looking at" rule, broken by the mechanism enforcing the
  cap). It is derived the way `buildOutputPayload` derives it, which is also what the exported
  controller has always baked in, so the three surfaces agree on one canvas. A cue of another
  shape is letterboxed into that stage rather than resizing it. PVW wears the amber frame, PGM the red one. PGM's header carries the layer
  badge of what is up.
- **A monitor is a monitor: `pointer-events: none` on its iframe.** A click that lands inside
  moves focus into a document that does not listen for the verb keys, so SPACE, N and 0 go dead
  with nothing on screen saying why. The exported controller always did this; the React surfaces
  did not, and the capped monitors are what put a monitor under the pointer where a gap used to
  be.
- **The verb bar shows its keyboard shortcuts** as chips: TAKE `SPACE`, Re-take `R`,
  Update `U`, Next `N`, Out `0`, and `↑`/`↓` walk the rundown. `■ All out` lives in the header,
  away from the others, because it is the panic control.
- **There is no PREVIEW verb on the two React surfaces** (owner, 2026-08-22 — "you can drop
  preview"). Selection already IS the preview gesture, and their PVW monitor is a local stage
  that follows it, so the button re-selected the cue that was already on it and its key `P` did
  the same. It was reading as the second-loudest control on a bar where everything else changes
  air. The EXPORTED controller keeps its `→ Preview`, where the word means something else
  entirely: it puts the cue on a real second output stream.
- **THE VERB BLOCK IS TWO COLUMNS WIDE AT EVERY SIZE, with TAKE spanning the pair.** It sits
  between the cue list and the monitors, and that space is not decoration — "this is a very
  important space on the screen, so it can't just be one small column that you can miss" (owner,
  2026-08-22). A tall window spends its slack on BUTTON HEIGHT, never on gaps and never by
  collapsing the block to a single narrow column, which is what it used to do above 960px.
- **The TAKE control is a TOGGLE, and the button IS the key** (owner decision, acceptance pass
  2026-08-06 — "put something on and take takes it off; it should go in and out with space" —
  corrected 2026-08-07 after a production: `SPACE` took a live cue OFF while the button beside
  it RE-TOOK, so one surface had two behaviours and the label read wrong to a hand already on
  the key). Following SPX, one control turns a graphic on and off: it reads **⟳ TAKE `SPACE`**
  off air and **■ TAKE OFF `SPACE`** while that cue is live, and the click does exactly what the
  press does. `0` means Out from either state. **Since 2026-09-16 the operator can choose a second
  mode for this one control** - SPACE previews first, then airs - and the button wears a third
  face for it; §2f is the contract.
- **RE-TAKE is a SECONDARY control** — Take on a cue that is already live: it sends the cue's
  current values and replays the entrance, which is the graphic's own reset. That makes it the
  gesture for airing the NEXT row onto a layer that is already up (load the row, `R`), which is
  how the quiz bank walks. Its own button and its own key, never the primary button's live state. Like every other verb it stays in place and greys out when it
  does not apply, so nothing on the bar moves sideways at the moment a cue goes live.
- **`↑`/`↓` walk the rundown**, selecting a cue exactly as clicking it does (to PREVIEW in the
  default mode, a cursor move in the other - §2f; nothing airs either way). With the toggle,
  that makes the whole surface operable from the keys alone — which is
  also what makes a **Stream Deck** work today, since one is a keyboard emulator by default. A
  dedicated plugin (WebSocket, live button state) is a separate project and is not started.
- **The keymap is ONE module, `src/components/playoutKeys.ts`**, read by both React surfaces
  (the exported controller carries its own copy because it ships without React). Written twice,
  it diverged: until 2026-08-18 the **hosted control page had no verb keys at all** — the page a
  class operates from was the one where `↑`/`↓` did nothing — and its TAKE re-took a live cue
  instead of taking it off, the exact behaviour §2 says one surface must never wear twice. A new
  key or a changed meaning goes in that module and in the controller's `keydown` block, never in
  a surface.
- **The editor edits the PREVIEW cue by default** and says so ("changes air on ⟳ Take"). A
  switch offers the ON-AIR cue instead, where ✎ Update pushes edits live.
- **An edit to the ON-AIR cue says it has not been sent.** Data never airs by itself — that is
  the staged-vs-take rule and it does not change — so the surface has to say when what is on
  screen is ahead of what is on air: the fate line names how many changes are waiting and ✎
  Update wears an amber dot. It compares against what was last SENT, never against the stored
  cue, since those legitimately differ. **On the hosted page "last sent" is read off the WIRE**,
  so an update somebody else aired clears the warning here too - the same fact, from the only
  source a shared surface can trust.
- **Activity is one collapsed line** at the bottom; it expands. Both React surfaces carry it, and
  it earns its place most on the HOSTED one: that is the multi-operator surface, where "did that
  take go, or was that somebody else?" is a real question. Those rows were already arriving there
  to drive PROGRAM and were being thrown away.
- **A production DATA row loads into the edited cue** where the Data workspace has a table whose
  column names match this graphic's field titles (`control/cueData.ts` - one matcher, including
  the A/B side gesture). The in-app page matches LIVE against the show; the hosted page renders
  rows the same matcher resolved AT PUBLISH TIME, which is the freshness contract its cues and
  entries already have: edit a dataset, publish changes.

### 2d. The cue editor's field grid — the one rule, and the open question

**The rule (binding).** `.pd-fields` is `repeat(auto-fit, minmax(<floor>, 1fr))`, and that floor
is a HARD track minimum: a control whose own min-content is wider than the floor does not widen
its track and does not shrink — it **overflows, and the next column paints on top of it**. So the
floor is the widest control's min-content, measured, never a round number that looked right beside
a text box. A number control is `−`(40) + value(64) + `+`(40) + the captioned step size(77) +
three 6px gaps = **245px**; the floor is 250px. Two structural backstops sit behind the
arithmetic, because the next control added here will not be in it: a control row inside
`.pd-fields` may **wrap** (a taller field is merely ugly; an overlapping one is unreadable and
silent), and `.row > .ctl-num` carries an explicit `flex-basis` rather than `auto` — a bare
`<input type=number>` reports ~170px of content, and a flex line breaks against BASE sizes before
anything shrinks, so an auto basis makes the backstop fire at widths where everything fits.
Pinned by `production-controls.spec.ts` at 1366/1536/1920/2560, as overflow rather than as a
screenshot: the column count changes with the window, so the invariant is "no field is wider than
its own track".

**The verbs beside PROGRAM stack in one packed column** once one fits — the threshold is the
arithmetic (6 buttons + 5×6px gaps + the chip against `--pd-monitor-h`), 960px of viewport height
— and the slack goes into the BUTTONS, never the gaps. `align-content: stretch` with nothing left
to stretch inflates the pitch instead, which is what put six 40px buttons on a 75px pitch at
1920×1000. Below the threshold the two-up grid stands, because six 44px verbs are taller than the
monitors on a short window.

### 2e. Grouping — the editor is a stack of BANDS

Owner, 2026-08-21: *"If we have a scoring system then everything that fits one team should be on
one row or one column and the other team is in the next row. There would be some logic in how we
build up the dashboard."* Before this the fields flowed in field order into whatever number of
columns the window afforded, so a scoreboard read as one long undifferentiated row — Team A,
Score A, Team B, Score B, Period, Clock, two colours, the note — with the playout layer left alone
on a second row.

**The rule, and it is the whole rule: grouping is DERIVED from the template, never authored.**
`control/cueFieldGroups.ts` knows about no graphic type, and the constraint is the owner's own next
sentence — *"we have no idea what kinds of graphics we will have in the future"*. It reads the same
A/B side tokens `control/cueData.ts` already reads to load a teams table into one half of a board:
if that rule is good enough to decide which fields a data row fills, it is good enough to decide
which fields belong beside each other. When it is not confident it returns ONE unlabelled band
holding every field, which renders byte-for-byte as the flat flow always did. **A wrong grouping is
worse than none** — it tells an operator two fields are related when they are not — so every guard
fails toward the flat flow:

- **Two fields a side, on both sides.** One "Team A" among eight unrelated fields is a coincidence.
- **The sides must MIRROR each other**: their titles with the side token removed have to overlap.
  "Camera A / Camera A note" against "Sponsor B / Sponsor B url" is an A and a B, not two halves.
- **A lettered LIST is not a board.** A quiz titles its fields "Answer A", "Answer B", "Answer C",
  "Answer D" — the same shape with the same first two letters. A single capital letter standing as
  its own word past B is the tell, and a two-sided board never has one.

Measured over the whole catalog on the day it shipped: **33 of 504 designs group** — every
scoreboard, match board, series bug, match-up and head-to-head — and 21 more carry side tokens and
are refused, every one of them a quiz or a bracket whose sides are a data column rather than a pair
of field sets. No false positive, no false negative.

**A band's heading is the operator's own word for that side** — the value of its first field, which
on every two-sided board we ship is the name. "ARC" over "YLE12" says which half of the board you
are editing in the language of the show; "Side A" over "Side B" only says that a split exists. It
falls back to `Side A` on an empty value or one longer than 20 characters (a heading is a glance,
and a wrapped one is worse than a generic one). The shared band is headed `Both`.

The heading sits in a 92px LEFT GUTTER so the bands read as rows across, and drops above its band
below 620px. A band's fields keep the auto-fit grid from §2d, **capped rather than `1fr`**: three
fields stretched across a 2560px band gave a team name a 663px box and pushed the three so far
apart the band stopped reading as one thing.

**Cue SETTINGS are not content.** The operator note (the cue's) and the playout layer (the
graphic's) sit under a hairline in their own strip, out of the field grid — neither is something
the graphic shows, and flowing them in beside the content fields is exactly what left the layer
alone on a second row looking like a field nobody finished.

Both React surfaces render this: the in-app editor and the hosted control page, one module,
docs/CONTROL_PANEL_PARITY.md §4.

**Still open**: a shared title PREFIX ("Team …", "Score …") as a weaker grouping for what the side
rule refuses. Nothing in the catalog needs it today, which is why it is not written.

### 2f. Two Space modes - the operator's checkbox (owner 2026-09-10, built 2026-09-16)

**The ask, in his words** (`docs/OWNER_RULINGS.md` ALIGN-2026-09-10-3): *"I think we need to have
a checkbox for this so the operator can choose for themselves. One is that you press Space and it
goes to the preview and then you press Space again and it goes to program. That would mean that
when you go up and down the queue list, nothing gets automatically put into the preview. If the
graphic that you have chosen is selected in the queue list and it's in the program, then when you
press space again, it disappears from the program and is just in the preview. It works like a cut
button on a mixer."* The other mode is today's toggle, unchanged.

**The setting.** A checkbox, **`SPACE` previews first**, in the verb bar under the on-air chip on
all three surfaces (`components/SpaceModeToggle.tsx`, and the controller's own copy). It sits
beside the key it changes, not on a settings screen, for the reason the playout layer sits in the
cue editor: the operator decides this with a hand on the key. Unchecked is the default. It is a
person's habit, so it is a device-level preference, `spaceMode` on `model/prefs.ts` beside the
other workflow defaults - per browser, never synced, unversioned: one word with a safe default,
and an unknown value reads as the default (`control/spaceMode.ts asSpaceMode`). The in-app and
hosted pages share it on one machine, read when a page opens and deliberately not followed live
across tabs (a mode arriving from another tab would move PREVIEW under an operator mid-show);
the exported controller keeps its own store on the relay's origin. The phone hides the checkbox
with the on-air chip: the mode names a key a phone does not have, and the TAKE button still
follows whatever a wider window set.

**The model (binding). SPACE always acts on the SELECTED cue, and reads that cue's state alone:**

| the selected cue is | `take` (default) | `preview-then-take` |
|---|---|---|
| on air | off air | off air, **and it becomes the cue on PREVIEW** |
| on PREVIEW, off air | airs | airs, and **stays on PREVIEW** |
| neither | cannot happen: selection is preview | **goes to PREVIEW**; nothing airs |

- **"On PREVIEW" is ONE cue on every surface, the last one put there, held synchronously** -
  page state on the React surfaces, a `stagedId` on the exported controller set the moment the
  preview rows are sent, never read back off its 400 ms log poll (a decision that waited for the
  poll previewed twice under the owner's two-press gesture and aired nothing). It is never
  stored: a check of what is about to air does not survive a reload, so a reloaded page starts
  with PREVIEW empty ("nothing in preview") and the button reading **→ PREVIEW**. The exported
  controller's PREVIEW is still the real second stream, one tally per layer; in
  `preview-then-take` mode staging stops the other graphics on that stream so it shows the one
  cue the label names, exactly as the React monitors do, and in `take` mode the stream keeps its
  accumulating behaviour, which SPACE never consults.
- **Staging REPLACES what was on PREVIEW.** A replaced cue that is on air stays on air: PREVIEW
  is a check, never a tally. So the cut from a cue the cursor had left - Anna on air, Ben staged,
  back to Anna, SPACE - takes Anna off and puts her on PREVIEW in Ben's place.
- **Off-air is one press in both modes, on purpose.** A hand that learned "SPACE takes a live cue
  off" in one mode must never find a second press between it and a clean screen in the other.
  `0` still means Out from either state and never touches PREVIEW.
- **The editor follows the SELECTION on all three surfaces** - what the exported controller has
  always done - and the PREVIEW monitor follows only the staged cue. The kicker reads **EDITING
  SELECTED CUE** while the cursor is ahead of the monitor, PREVIEW CUE once SPACE has caught it
  up; the too-long warning is shown only when the edited cue is the one PREVIEW measured; the
  hosted page's live-edit refreshes PREVIEW only while the edited cue is on it.
- **The button IS the key, so it has three faces**, all from one decision (`spaceAction`):
  **→ PREVIEW** (amber, the preview colour - never red, because the press airs nothing),
  **⟳ TAKE** and **■ TAKE OFF**. Ticking the box stages what was on PREVIEW so the picture stands
  still; unticking makes the selection the preview again.
- **A checkbox is not typing.** The verb keys stand down while the operator types, and a checkbox
  is an `INPUT` that keeps focus after a click, so the SPACE after ticking one (this box, or a
  toggle field in the cue editor) flipped it back instead of taking. `typingInto` in
  `components/playoutKeys.ts`, and the controller's copy of the rule, now count only inputs
  that take text; the verb handler's `preventDefault` is what stops the native toggle.

**Why this reading of "a cut button on a mixer".** A mixer's cut swaps PVW and PGM in one press.
His first two sentences make airing a separate press from previewing, so the swap's forward half
is not what he asked for; its return half is exactly his third sentence - what leaves PROGRAM
lands on PREVIEW. That is the cut here. A reading where SPACE on a live cue only staged it, and a
second press took it off, was rejected for the off-air reason above.

**Where it is decided, and pinned.** `control/spaceMode.ts` holds the decision (`spaceAction`),
the three faces' words (`SPACE_FACES`), the checkbox's tooltip and the empty-PREVIEW label;
`components/playoutKeys.ts` hands them to the React surfaces (`takeFace`, `useSpaceMode`), and
`control/productionControllerHtml.ts` interpolates them into the exported controller at
generation time, the decision as the table of its eight outcomes (`spaceActionTable`) - nothing
about the mode is written twice. Both modes are pinned
on the in-app page and the exported controller in `e2e/production-controls.spec.ts`, the storage
contract in `e2e/hosted-control.spec.ts`, and the hosted page's own walk in
`e2e/configured/hosted-space-modes.spec.ts`.

## 3. Layout — phone

One column: header (name · mode · All out) → the two monitors side by side, small → the cue list
(large touch rows) → the editor for the selected cue → **a fixed bottom bar: ⟳ TAKE · » Next ·
■ Out**. The monitors stay side by side on a phone: seeing preview and air together is the whole
point of the surface, and stacking them would put air below the fold.

**No visible scrollbar chrome on any pane, on any surface.** The desktop control area took over
the page's job and keeps a thin, dark bar where the page's own bar used to be; the cue list
scrolls without one. No horizontal scrollbar may ever appear — a surface
that scrolls sideways is a layout bug, not a scrolling affordance.

## 4. The cue rundown

One row per cue: drag handle, number, **bold label**, the operator note (or the graphic name)
under it, the **layer badge**, and the ON AIR / PVW tag. Full-width label — reorder, duplicate
and delete live behind the row's `⋯`, never as four permanent buttons that crush the name.

- **Every cue carries its own field values.** The same lower third is a different person at cue
  2 and cue 7; that is what a cue IS.
- **The cue's title is editable here**, in the operator surface — mislabelling "Guest lower
  third" as "Host lower third" is a live-show mistake and must be fixable without leaving.
- Reorder is a DRAG, not arrow buttons.
- **THE RUNDOWN IS THE ONLY LIST** of what a production holds (owner decision 2026-08-17, on the
  layer list this replaced): every pool graphic is present in it, named and wearing its layer, so
  nothing about the production hides in a second list. Two rules keep that true rather than
  merely tidy, and both live in the row's `⋯`:
  - **Removing a graphic's LAST cue removes the graphic** (`model/shows.ts` removeShowCue), and
    the menu item says so before it is pressed. Otherwise a pool graphic with no cues appears
    nowhere and still ships in the published payload, still loading as an iframe on its own layer
    — an orphan the operator could neither see nor reach.
  - **"Remove graphic and its N cues"** is the one gesture for taking a graphic out of the
    production, offered only where it differs from the item above (2+ cues). Both removals take
    the graphic OFF AIR first: the output page follows the log, not the payload, so a live pool
    entry deleted from under it would keep rendering with nothing left able to stop it.
  A removal that destroys typed content asks twice — the pictures graphic carries the uploads
  themselves, so its wording names the count ("Also deletes 3 pictures — confirm?").
- The rail's foot is how graphics GET IN: the library picker, `＋ New graphic for this
  production…`, `＋ Add pictures…`. Nothing else belongs there.

## 5. Layers — an explicit number, not an ordering game

**A pool graphic carries a layer NUMBER the operator types** (CasparCG layers 1–100), edited
beside the graphic's content, where the decision is actually made.

**They are DISTINCT by construction.** Counting starts at 20 — the first graphic is 20, the next
21, the next 22 — because two graphics on one layer replace each other on air and there is no
reason to begin from a state the operator then has to repair. Most productions never touch the
number; one that wants a particular stack just types it.

This replaces derived-from-pool-order layers and the ↑/↓ reorder buttons, which made the layer
an accident of ordering.

**There is no layer LIST** (owner decision, 2026-08-17: *"you should just be able to change the
layer from the actual options … that would free more space for our rundown"*). A panel in the
rail's corner listed the same graphics the rundown already lists, to show a number the operator
edits beside the graphic's content anyway — so the rundown gets that room. Each row wears its
graphic's layer, and every job the list had is somewhere the operator was already looking:
removal in the row's `⋯` (§4), what is up in the ON AIR tags and the header's `· N layers`, the
paint order in the number itself.

A duplicate can still be typed deliberately, so **the surface says when one exists** rather than
letting it be discovered live: the editor flags it inline with a one-click move to the next free
number, and **every rundown row on the shared number wears the warning colour**, naming its
partner on hover. Both rows, not just the one being edited — the point is which two graphics are
about to replace each other. All three surfaces mark it the same way.

## 6. What is NOT here

- **No Rehearse mode.** Preview is local and always available, published or not: choosing a cue
  shows it, ▶/■ drive it, and none of that reaches air. A separate rehearsal mode was a second
  way to do what the surface already does, and the one mistake it could cause — believing you
  were rehearsing while you were live — disappears with it.
- No per-graphic card stack. The editor follows the SELECTION.
- **No layer list** — see §5. The rundown is the only list of what a production holds.

## 7. Publishing and the links live here

If this surface replaces the production dashboard, it carries the dashboard's two jobs:
**Publish / republish**, and both capability links — the **output URL** (the browser source) and
the **control page URL** (to operate from another device). They belong in the header's menu, one
click from the operator, never on a page they have to navigate away to.

**ONE LINE PER CAPABILITY, the explanation behind its own ▸.** The panel grew a paragraph under
every row and became a page: five explanations between five rows put the CONTROL PAGE — the link
a class operates from — below an account of an SPX file most of them never download. So each
row's help collapses (`LinkRow`, ProductionPage.tsx), and the arrow sits in the same column down
the panel so it is found rather than hunted. Two rules the shape has to keep:

- **The audience row's help opens by default.** Every other explanation describes something
  PRIVATE; this one says "public", and that is the one omission here that could reach air.
- **A secondary capability is QUIET, never hidden.** The SPX template file is a smaller, dimmer
  row directly under the output URL it is a second form of — it belongs to the one playout host
  that cannot take a link, so it must stay findable without competing with the links copied
  every show. Same for the readable-name field. Hiding either behind a "more" would trade one
  crowded panel for a lost control.

## 7b. The ⚡ GRAPHIC ACTIONS block, in the operator's words

Two of its controls were unreadable to their first real operator (acceptance pass, 2026-08-06),
so both explain themselves ON the surface — a control that needs a document read to be understood
is a control that will not be used.

- **The ⚡ buttons fire the graphic's own beats on the layer that is on air, immediately.** They
  are not cue verbs: nothing here waits for a Take. Where a beat needs data it carries values
  from the selected cue, so the field is typed above first — and each button's tooltip names
  that field by its OPERATOR TITLE, never as `f7`. That is what makes an action like the quiz's
  **Show audience result** legible: it airs the "Audience results" field you typed above (a
  hidden holder like "34 | 52 | 9 | 5"), painted as a chip on each answer row. The percentages
  are DATA the whole time; the state is only what shows them.
- **"Snap to state…" is the RECOVERY picker**, not a way to drive a graphic. It jumps the live
  graphic straight to a state with NO animation, and it rides with a re-send of the cue's values
  because recovery is two operations (`docs/STATE_MACHINE_SCHEMA.md`: reset the visual state and
  reset the data are never conflated, and a lone snap replays intermediate states with
  suppressed callbacks, so call-painted looks need the trailing data write). Use it when air and
  the dashboard have got out of step — a renderer restart, a missed press. Normal operation is
  the ⚡ actions and » Next.
- **Both React surfaces carry the whole block** — header, snap, section grouping, help line.
  The hosted page used to render the ⚡ buttons as one flat row with no snap at all, which put
  the recovery control on every surface EXCEPT the one being operated from a phone, away from
  the machine running the renderer. Sections come from `controlModel.ts arrangeControls`, the
  author's own `machine.controls` metadata, grouped identically by all three deployments.

**A PRODUCTION MAY ARRANGE THE BLOCK, and only the block.** The control profile's ARRANGE half
(`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6b) orders, renames, pins and hides the ⚡ controls per
pool graphic: a pinned control sits above a hairline at the top, the rest keep their author's
sections under it, and a hidden one goes behind one collapsed **More** — behind, not gone, because
the machine still accepts it and an operator who needs it mid-show must not have to go back to the
authoring panel. One function decides it for all three deployments (`arrangeControls`), and the
exported controller reads the answer BAKED AT EXPORT rather than re-deriving it, because an
arrangement is authored state that cannot change while a package is offline. Nothing about a press
changes: the declaration still carries the payload, and the same table still greys the button, so a
hidden control is guarded exactly as a shown one is. The production page's **Controls** panel, under
this block, is where it is authored, and deleting the profile is one action that restores the
generated panel everywhere.

**The field bands are NOT arrangeable, deliberately.** §2e's grouping stays DERIVED from the field
titles, on the owner's 2026-08-21 rule and its own next sentence — *"we have no idea what kinds of
graphics we will have in the future"*. ARRANGE is keyed by control id and has no vocabulary for a
field at all, which is what keeps that true by construction rather than by agreement. A production
that wants its fields in a different order has found a request about the GRAPHIC, not about the
show.

## 7c. The ± LIVE NUMBERS block — the one data write that airs immediately

Under the ⚡ actions, same doctrine, opposite direction: the ⚡ buttons are STATE that carries
data, these are DATA with no state at all. One press bumps a `number` field on the live graphic
— a score, a goal total, a stock count — as a **PARTIAL update carrying just that field**,
mirrored into the edited cue so the cue and the air never drift. Partial is the load-bearing
word: ✎ Update sends the cue's whole value set, so riding it would also publish every other
staged edit, and a score bump must never air a half-typed name. Receivers write exactly the
fields a message carries and the logs merge partial data, so recovery replays it correctly
(`docs/CONTROL_LAYER.md`).

Three derivation rules, all template-driven (no category is ever consulted):

- Any graphic with an operator-visible `number` field gets the block — scoreboards, podium
  boards, goal meters — with no per-graphic code.
- A number field an ⚡ event carries as PAYLOAD is excluded (the podium's spotlight index, a
  focused row): it is set by its own action, and a second road to it would air a value without
  the state that gives it meaning. A field an ⚡ event ADJUSTS (a scoreboard's goal moving that
  side's score by one, `docs/CONTROL_LAYER.md`) is NOT excluded: the goal is the road a score
  normally takes and the stepper is its correction - a disallowed goal comes off here, and the
  next goal counts from the corrected figure.
- The buttons enable only while the edited cue is the one on air — the same legality wording as
  the ⚡ buttons ("Take the cue first").

**All three deployments carry it** — `ProductionPage`, `HostedControlPage` (the cloud-first
surface a class drives from a phone) and the EXPORTED production controller, the fallback a show
drops to when the network dies. The exported page has no separate block: it is a third renderer
under the one-control doctrine, so its number field's own −/+ pair IS the block — same partial,
same exclusion, and the same "only while the edited cue is the one on air", greying off air with
"This cue is not on air. Take it first." and carrying the *act on air* mark beside the field's
name. It briefly staged off air instead, which is the one thing this control must never do: a
second meaning with no feedback at all, where the figure moved on screen and nothing said it had
not aired. An excluded (⚡ payload) field's pair is never greyed — it stages at all times, and
greying it would strand the only stepper that field has.

Two things follow from that on the exported page, and both were wrong before it carried the
rule: EDITING A FIELD STAGES (it used to push the whole value set on every keystroke of a live
cue, so a name reached air letter by letter, while the editor's own header promised "changes
push live on ✎ Update"), and a cue that is on both streams shows the STAGED version on PVW while
PGM keeps what is aired.

**A BOUND FIELD TAKES THE OTHER ROAD** (2026-09-16, `docs/PRODUCTION_DATA_PLAN.md` §2.9). When the
production has bound a field to its data tree, the figure is not that graphic's to own: it is one
shared value several graphics follow. So on the two REACT surfaces a ± press - and an ⚡ event's
`adjust` on the same field - patches the tree instead of writing the field, and every graphic bound
to that path follows through the diff production data already had. Three things follow:

- the press counts from the TREE, never from the wire or the cue, because a feed may have moved the
  value since either was written;
- nothing is mirrored into the cue or into the hosted staging buffer, since a bound field is never a
  cue value (§2.7) - which is also why the box reads out with its path instead of editing;
- an event whose every moved field is bound fires BARE, and its figures arrive as the tree's own
  update rows.

**The EXPORTED controller is untouched by that**, and deliberately: it carries no tree and no
bindings, so its field stepper is the field stepper described above
(`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f, the owner's 2026-09-15 boundary ruling). An unbound field
is unchanged on all three.

Pinned by `e2e/production-controls.spec.ts`: "± LIVE NUMBERS bumps a figure on air" for the
React surfaces, and "± LIVE NUMBERS on the EXPORTED controller" for the package — that one reads
the rows off the relay and asserts the PAYLOAD SHAPE, because what an exported surface puts on
the wire is the contract, and a screen that looks right can still ship the wrong payload.

## 7d. COMBINED controls — one press, several rows, some of them later

The third section of the ⚡ block, and the only one a PRODUCTION makes rather than a graphic
(`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6b; the format is `src/model/profile.ts`, the runtime
`src/control/combine.ts`). A combined control is a name and an ordered list of STEPS, each of them
exactly one thing this surface can already send: an operator event on a named pool graphic, a
lifecycle verb on a cue, or a data patch. It cannot invent an event, and there is no condition, no
comparison, no variable, no loop and no wall clock — the format refuses those by name.

- **One row per step, on the one command log**, sent as a single batch and attributed to the
  operator who pressed. A step the machine would drop is dropped ALONE: the rest proceed, and the
  activity feed names the step, the control it belongs to, and why it did not apply.
- **A step is resolved when it FIRES, not when the button was pressed.** A delayed `+1` therefore
  reads the figure on the wire at that moment and counts from what the audience is looking at. The
  moved figures are mirrored back into the target graphic's on-air cue, exactly as a single ⚡ press
  does, so ⟳ Take and ✎ Update cannot regress them.
- **`after N s` waits, visibly.** The button counts the wait down and wears the on-air accent while
  it does. A step marked `after 0` (or unmarked) fires WITH the step before it, and the waits
  ACCUMULATE — "five reveals a beat apart" is five steps each marked `after 2 s`. What it costs,
  stated so nobody meets it live: **the wait lives in the browser tab that pressed.** Reloading that
  tab loses whatever has not been sent, nothing is retried behind anyone's back, and the operator
  presses it again by hand. The button's own hint says so.
- **The countdown IS the cancel.** Pressing an armed control stands the rest of it down, and so
  does any Out on this surface — one control shows the wait and stops it, rather than a second
  control beside it. The feed says what was dropped and by which gesture.
- **`ask` offers a step as a tick beside the button**, with a declared default. It is a tick and
  never a value: the whole of what one press may vary by is which of its steps go.
- **It greys while its FIRST step is illegal**, and the hover says which step and why. Not while
  any step is: a walk's later steps are routinely illegal at the moment the first is pressed, which
  is what the walk is for, and a button greyed by a step three seconds in the future would be
  unpressable all night.

**Where it renders.** The two NoaCG-hosted surfaces — the in-app production page and the hosted
control page — under a **Combined** heading at the foot of the ⚡ block, drawn by one component
(`src/components/control/CombinedButton.tsx`) over one resolver (`src/control/combineSend.ts`), so
neither can grow a second opinion about what a `+1` carries. On the hosted page the rows go out
through the batch RPC every verb there uses, attributed to whoever pressed, and a moved figure is
mirrored into the SHARED staging buffer rather than into a stored cue — that is where an
operator's values live on that surface, and it is what makes every open page count from the same
figure. Its baseline is the WIRE, so a delayed step fired from one phone counts from what another
operator's press just put up.

**The EXPORTED production controller does not get it.** A sequencer with delays and ticks, inlined
a second time in vanilla JS, is the second production runtime the owner ruled against on 2026-09-15
(§6f of the plan). Where a production has combined controls the package shows one line where the
Combined section would be — *“This production's combined controls run from its hosted control
page”* — and carries nothing else of them: the zip holds one boolean, never a control's name, its
steps or its timings. ARRANGE does render on all three, because it is presentation of the contract
rather than behaviour above it.

**Against the no-second-clock ruling (§8a, ruling 2, owner 2026-08-09).** That ruling forbids a
per-play timer FIELD that could disagree with an arrow's authored `after` INSIDE a graphic. A
combined control's wait is the controller pacing its own sends: it never touches a graphic's timer,
the graphic still sees ordinary rows arriving in order, and the armed wait is visible and
cancellable, which is the other half of the same ruling.

**Authored on the production page**, in the Controls panel under this block: name it, then add
steps by picking what each acts on, what it sends, its wait and whether it is a tick. Every box but
the name and the seconds is a SELECT over what the production already declares, which is what makes
"a profile can only combine what a graphic exposes" a mechanism rather than a rule. A patch step's
values are not composed there and deliberately so — that would be a text box taking a value.

Pinned by `e2e/production-controls.spec.ts`: the proof case composed, pressed with two of five
ticks on and read off the wire; the countdown cancel and the Out cancel; a dropped step landing
beside one that proceeded; and the exported controller's line, with the package checked for the
absence of everything else. The hosted half is pinned by `e2e/hosted-control.spec.ts` over the
PUBLISHED bytes — the wire baseline, the drop report and the greying — as far as an offline spec
reaches: that page cannot be mounted without a configured backend, so its ⚡ Combined section is
step 9 of the live-verify checklist in `docs/CONTROL_LAYER.md` with the rest of that surface.

## 8. Built to grow (interactive graphics)

The area under the monitors is deliberately not full. Interactive graphics — polls, Q&A, chat
highlights, audience questions — bring operator actions that are not "play this cue": approve a
question, push a poll result, promote a message. Those arrive as **modules under the verb bar,
scoped to the selected graphic**, alongside the state machine's own event buttons (which already
work this way — "graphic-specific actions travel with the graphic").

An **incoming feed** lands in the same region: a module that shows what viewers sent and puts
approved items into a cue. The audience plane that feeds it is built (the `/join` page and the
production's Audience workspace - `docs/INTERACTIVE_PLAYOUT_PLAN.md` Phases 5-6); the standalone
showchat surface lives at `src/showchat/`. Keep the region's height flexible and its contents
graphic-scoped; do not fill it with chrome.

## 8a. The interactive blueprints — what §8's modules actually look like

Four approved mockups landed 2026-08-09 and no doc referenced them, so they are named here.
Read them before building anything in the §8 region; the vocabulary is binding, the pixel detail
is not (the two quiz frames already disagree over field numbering and whether the actions sit in
one row or a two-column block — treat that as drawing, not as contract).

| File | What it specifies |
|---|---|
| `playout-control-panel-blueprint-vision.png` | The whole picture: the dashboard unchanged, plus the FOUR other operator views and the data-flow between them. |
| `playout-control-panel-quiz-example.png` | The quiz cue's field editor + its ⚡ ACTIONS block. |
| `playout-control-panel-poll-example.png` | The live-vote cue: Poll / Results / Chat tabs, per-option vote counts, a CONTROLS column, live chat beside it. |
| `playout-control-panel-audience-question-example.png` | The Q&A cue: original submission vs BROADCAST VERSION, approve / reject / edit, and a questions queue. |

**The founding rule, in the owner's words on the vision frame:** *"Your current playout view stays
the core. We add power underneath and to the side, not on top of it. We don't break what works.
We extend it."* And, on the flow diagram: *"Nothing bypasses the operator. Everything becomes a
cue."* Both restate contracts this doc already holds (§1, and the staged-vs-take rule) — which is
the useful signal: the blueprints are an EXTENSION of this surface, not a redesign of it.

The four other operator views it names — Data Hub, Audience Inbox, Public Participation Page,
Presenter View — are `docs/INTERACTIVE_PLAYOUT_PLAN.md`'s planes, largely shipped
(`ProductionDataWorkspace`, `ProductionAudienceWorkspace`, `/join`, the presenter view). Nothing
here asks for a new plane; it asks for the CUE EDITOR to show the right controls per graphic type.

### Two places the blueprints and the shipped contracts disagreed — DECIDED 2026-08-09

Both were decisions rather than defects, so they went to the owner. The rulings:

1. **The graphic's STATE: the blueprint's PLACEMENT, §7b's SEMANTICS.** The quiz frames put a
   `QUIZ STATE` dropdown (reading "Waiting for contestant", "Question card") in the field editor
   beside F0–F6, where §7b says in as many words that *"Snap to state… is the RECOVERY picker, not
   a way to drive a graphic"*.
   **Ruled:** show the state where the blueprint puts it — a labelled row in the field editor, in
   the author's words — but jumping to one stays a RECOVERY action and is labelled as such.
   **Why the drawing does not win outright:** driving by picking from a list skips the arrows, and
   the structural guard is the model's central claim — after `lock` there is no `select` arrow, so
   a late pick is *impossible* rather than refused (`docs/STATE_MACHINE_SCHEMA.md` §3). A free
   dropdown would make that guard cosmetic, and the ⚡ buttons' greying would stop being the whole
   truth about what can happen. Normal driving remains the ⚡ actions and » Next.
2. **A per-play TIMER value: NO second clock.** The quiz frames carry a `TIMER (SEC)` stepper as
   an operator field; the state model says a timer transition's delay is authored data ON THE
   ARROW, and both timer types decline a per-play field in their own files (`types/livePoll.ts`:
   *"the window's length is AUTHORED data on the arrow … not a field the operator sets per play"*).
   **Ruled:** the arrow stays authoritative, and the real need behind the drawing is answered
   instead — **an armed timer must be VISIBLE**. Today the live vote closes itself after 20 s with
   nothing on any operator surface saying it will, which is the actual complaint
   (`CONTROL_PANEL_PARITY.md` §5.5); ending a window early stays the manual button that already
   exists ("Close voting"). Not built yet — it is the open item those sections now point at.
