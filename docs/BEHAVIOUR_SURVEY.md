# What other products ship as standard graphic behaviours

**Run:** 2026-09-05, before the fourth behaviour was chosen
(`src/templates/importedDesign/timerBehaviour.ts`). **Why it exists:** the owner's method, stated
twice. *"We just need to follow how other programs do them"* (2026-09-03,
`docs/backlog/more-behaviours-than-poll-and-quiz.md`), and the standing rule behind it - a design
default is NOT a taste question (`docs/acceptance/OWNER_QUEUE.md`). So this page is the derivation
the fourth behaviour was picked from, kept so the fifth is not argued from scratch.

"Behaviour" is used in the sense of `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §3: a state machine, the
operator buttons generated from it, and a way the graphic paints its states onto artwork somebody
else drew.

**Its companion is `docs/SCORE_CONTROL_SURVEY.md`**, which asks a narrower question - how products
shape the controls of ONE behaviour - and answers it in more detail than anything here. This page
asks which behaviours exist at all. Read that one before changing a score board's buttons; read
this one before adding a behaviour.

## How to read this, and what is not in it

Product documentation and vendor support portals, fetched and read. Three sources refused
automated fetch and are used only through search excerpts, which is said again at each claim:
`support.singular.live` (403, already recorded in `docs/CONTROL_PANEL_RESEARCH.md` §3),
`docs.spx.graphics` (TLS handshake failure - the `spxgc.tawk.help` mirror of the same article was
read instead), and the SPX countdowns pack page (404 since the move to `spxgraphics.com`).

**Stated as UNVERIFIED, and left that way rather than guessed:** Chyron's per-button operator
vocabulary, LiveU Studio's scoreboard controls and sport list, Ecamm's widget inventory,
StreamElements' full built-in widget list, and the option list inside the SPX countdowns pack.
That paragraph exists because `docs/SCORE_CONTROL_SURVEY.md` had to be rewritten once when a
delegated run wrote up areas it had never actually read, with constructed quotations. The rule
that came out of it holds here: a product whose controls are not published gets a row saying so.

**What the repo already held, cited rather than re-derived:** `docs/COMPETITOR_MXMZ.md` and
`docs/CONTROL_PANEL_RESEARCH.md` §2 (MXMZ end to end), §3 (Singular's control-node model and its
thirteen node types), §4 (the OGraf v1 manifest and what it cannot express);
`docs/COMPETITORS.md` (Zero Density, Loopic, Rive); and
`docs/backlog/playout-logic-for-all-common-graphics.md`, which already names six uncovered
behaviours from the owner's own ruling. The frequency table below is the market evidence that
list was missing.

---

## 1. The frequency table

Counted across seventeen graphics products. Sports data feeds and MixEffect are excluded, for the
reason each row gives in §2. A cell counts only where the behaviour is a named, shipped thing with
operator controls - never where it could be built.

| Rank | Behaviour | Products | Which |
|---|---|---|---|
| 1 | On air / off air with animation | 17 | every product, and therefore not interesting |
| 2 | **Countdown or count-up timer with start, pause and reset** | 10 | SPX, vMix, Singular uno, XPression, Vizrt, Chyron, H2R, the OBS scoreboard plugin, NewBlue, StreamElements |
| 3 | **Score plus and minus, per team** | 11 | SPX, vMix, uno, XPression, Chyron, H2R, OBS plugin, LiveU, NewBlue, the OGraf reference, LIGR |
| 4 | Ticker or crawl of items | 7 | SPX, vMix, Viz Ticker, H2R, Streamlabs, Tagboard, Ecamm |
| 5 | Stepped reveal along a fixed path | 6 | SPX `next`, CasparCG `CG NEXT`, Viz Trio Continue, XPression Sequencer, OGraf steps, Tagboard slides |
| 6 | List or table paged by the operator | 6 | vMix Data Sources, Vizrt Control List, XPression DataLinq, H2R, Singular, Tagboard |
| 7 | Game clock tied to a period or half | 6 | SPX, uno scorebugs, XPression, Viz Control Clock, NewBlue, the OGraf reference |
| 8 | Progress bar or goal meter toward a target | 4 | Streamlabs, StreamElements, Flowics, H2R |
| 9 | Poll or vote with open, close and reveal | 4 | Flowics, Tagboard, Streamlabs, StreamElements |
| 10 | Social or chat moderation queue | 4 | vMix Social, Flowics, Tagboard, StreamElements |
| 11 | Time of day clock | 4 | H2R, Vizrt, XPression, Chyron |
| 12 | Credits roll with speed control | 3 | H2R, Streamlabs, Viz Ticker |
| 13 | Alert or event queue that auto-dismisses | 3 | Streamlabs, StreamElements, H2R |
| 14 | Data binding that updates without an operator | 6 | vMix, XPression, Vizrt, Singular, Flowics, LIGR |
| 15 | Hide an element when its value is empty | 2 | Vizrt Control Hide on Empty, H2R implicitly |
| 16 | Rotating sponsor or banner cycle | 2 | Streamlabs, SPX |
| 17-20 | Now/Next/Then, checklist on air, swap the two teams, novelty widgets | 1-2 each | H2R, the OBS plugin, Streamlabs |

**The honest reading.** Rows 2, 3 and 4 are table stakes. Rows 5 to 7 are what separates a
broadcast product from a streaming one. Rows 17 to 20 are single-vendor differentiation nobody has
copied, and a product that leads with them is guessing.

## 2. Per product

### SPX Graphics

The starter pack is lower thirds and tickers. SPX names its own categories as lower thirds,
tickers, sport tables, scoreboards, countdowns, news, channel branding and elections
([templates](https://spxgc.tawk.help/article/where-can-i-get-templates-for-spx-gc)).

The one piece of shipped, named logic is the **Scoreboard extension**: a launch button and four
templates (Bug, Strap, Cards, Blanco). Its operator surface is score buttons defaulting to
`-1, +1, +2, +5`, a clock that plays and stops and is configured count-up or count-down, team
dropdowns, and play/stop buttons labelled IN and OUT. Optional extras add Period, Penalty, Sponsor
and Scoreboard Style. Timeout and possession are not built in
([SPX Scoreboard](https://spxgc.tawk.help/article/spx-scoreboard)).

Sold separately is a pack of countdowns, clocks and timers in HTML and OGraf, each with "several
built-in visual, layout, and functionality options" - the option list is no longer reachable, since
the store URL 404s after the domain move ([store](https://spxgraphics.com/store/)).

### CasparCG

Ships no named behaviours at all, and that is the finding. `CG ADD` prepares, `CG PLAY` calls
`play`, `CG NEXT` calls `next`, `CG STOP` calls `stop`, and `CG INVOKE` calls any other function on
the global scope
([AMCP commands](https://chrisryanouellette.gitbook.io/casparcg-html-template-guide/amcp-commands-review)).
`CG INVOKE` is the interesting one: it is the only place in the classic broadcast stack where a
template declares a verb of its own, and it declares it by having a function with that name, which
no host can discover ahead of time. NoaCG's generated control layer is the answer to exactly that.

### vMix

The most precisely published operator vocabulary of any product here, because every button is also
an API function ([Shortcut Function Reference](https://www.vmix.com/help28/ShortcutFunctionReference.html)):

| Group | Functions |
|---|---|
| Text and image | `SetText`, `SetTextColour`, `SetTextVisible(On/Off)`, `SetColor`, `SetImage`, `SetImageVisible(On/Off)` |
| Title pages | `NextTitlePreset`, `PreviousTitlePreset`, `SelectTitlePreset`, `TitleBeginAnimation` |
| Countdown | `SetCountdown`, `StartCountdown`, `StopCountdown`, `PauseCountdown`, `SuspendCountdown`, `ChangeCountdown`, `AdjustCountdown` |
| Data rows | `DataSourceAutoNextOn/Off`, `DataSourceNextRow`, `DataSourcePreviousRow`, `DataSourceSelectRow`, `DataSourcePlay/Pause` |
| Lists | `NextItem`, `PreviousItem`, `ListAdd`, `ListRemove`, `ListRemoveAll`, `ListShuffle`, `ListShowHide` |

The countdown is authored in the Title editor: a duration, a stop or start time, a display format,
and a Reverse checkbox that counts up instead ([Title editor](https://www.vmix.com/help29/Title.html)).
Scoring is not a behaviour at all but a convention on top of text - the documented way to bump a
score is `SetText` with `+=1`, `+=2` or `-=1`
([keyboard scoreboards](https://www.vmix.com/knowledgebase/article.aspx/66/how-to-control-scoreboards-in-vmix-with-the-keyboard)).
That is arithmetic hidden in a string, and it is worth recording as the market's cheapest possible
answer to a stepper.

### Singular.live and uno

The composition-authoring half is in `docs/CONTROL_PANEL_RESEARCH.md` §3. What that page does not
cover is **uno**, the pre-built template layer: hundreds of ready overlays, each with its own
control app ([Control Applications](https://www.singular.live/control-applications)).

Two uno control apps have published button lists, both through search excerpts only, because the
support portal 403s to automated fetch. **uno Countdown**: Overlay ON/OFF, Timer Plus and Minus for
setting the value, Play and Reset for playback, and Countdown End Message ON/OFF. **uno Soccer
Scorebug**: three panels named Score, Clock and Setup, with Period Duration set in Setup, Play on
the Clock tab to start the first half, and a `(+)` beside each team.

Scorebugs exist per sport - soccer, tennis, badminton - which is the clearest evidence in this
survey that scoring RULES are handled by shipping one template per sport rather than by making
scoring configurable.

### Ross XPression

The named behaviour container is the **Widgets** panel: counters, countdowns and timers customised
inside a scene and driven from outside it, with Ross's own tutorial calling widgets "the right way"
to put a game clock on a scoreboard
([Clock and Timers Widget](https://www.rossvideo.com/resources/ross-university/using-the-xpression-clock-and-timers-widget/)).

Everything beyond a widget is **Visual Logic**, which Ross describes as a visual form of scripting
used for conditional animations and object properties
([Visual Logic and GPI triggers](https://rossvideo.community/discussion/xpression-visual-logic-gpi-triggers)).
That is the comparison that matters to us: XPression's answer to "what happens when the value
crosses a threshold" is node-graph scripting with conditionals - the expression language NoaCG has
ruled out.

Data arrives through **DataLinq** (text, XML, tables, Excel, ADODB, ODBC, RSS, "various scoreboard
vendors", NFL GSIS). The Sequencer is the operator's rundown, and 6.7 added a Countdown column to
it.

### Vizrt

The closest thing in the market to a declared vocabulary of behaviours, and it takes the form of
**Control plug-ins** a scene must carry before a template is controllable at all: Control Object,
plus Control Clock, Text, List, Bar, Chart, Image, Geom, Map, Action, **Hide on Empty** and **Hide
in Range** ([Control Object](https://docs.vizrt.com/viz-artist-guide/3.12/Control_Object.html)).

Two of those are behaviours rather than field types, and one is directly relevant: **Control Hide
in Range** switches visibility on a value range. That is a threshold test declared as a plug-in
PROPERTY rather than written as an expression, and it is the single best precedent in this survey
for a product that wants thresholds without a language.

The Trio clock is fully specified: Start At, Stop At, an Up/Down direction, and an on-air action
chosen from None, Set and start, Set and stop, Stop, Continue, Freeze, Unfreeze; live, the operator
can start, stop, continue, freeze and unfreeze
([Page Editor](https://documentation.vizrt.com/viz-trio-guide/4.1/Page_Editor.html)). Page playout
verbs are Take, Continue, Take Out, Take + Read Next, Cue, Pause - Continue existing precisely
because a template may contain stop points, which is the same idea as an SPX step.

In Viz Ticker a carousel message carries a **TTL**, and on expiry the configured action is Pool,
Remove or Inactive
([carousel](https://docs.vizrt.com/viz-ticker-guide/2.4/viztickerwizard_carousel_details_frame.html)).
A time-to-live with a declared expiry action is a timer transition by another name.

### Chyron

PRIME ships templates covering "scoreboards, clocks, lower thirds, over the shoulders, replay
transitions" ([PRIME for News](https://chyron.com/prime-live-production-platform-for-news/)).
**PRIME Scorebug** is a separate product with "client-specific choreography"
([announcement](https://www.sportsvideo.org/2026/05/21/chyron-announces-prime-scorebug-and-expanded-chyron-live-scorebug-capabilities/)),
and PRIME 5.3 adds master control panels for building "a one-to-one representation of a scoreboard
for a sports match" ([PRIME 5.3](https://info.chyron.com/prime-5-3-html-integration-automated-playout)).

The individual button names are not published, so **Chyron's operator verbs are unverified**. The
shape is clear enough: panels hand-built per production, which is MXMZ's answer rather than a
generated one.

### H2R Graphics

The closest indie comparable, and the most useful single product here, because both its type list
and its verbs are published.

Seventeen named graphic types ([graphic types](https://h2r.graphics/docs/graphics/)): Celebration,
Checklist, Credits, Icon with Message, Image, Image with Message, Lower Third, Lower Third
Animated, Message, Now Next Then, QR Code, Ticker, Time of Day, **Countdown Timer**, To Time of
Day, **Count Up Timer**, Webpage - plus Map, Telestrator, Test Pattern, Build, Custom HTML, and
**OGraf as a first-class graphic type** ([docs](https://h2r.graphics/docs/)). H2R is therefore an
OGraf host, which makes it a target our export already reaches.

The verbs, from the Companion module
([companion-module-h2r-graphics](https://github.com/bitfocus/companion-module-h2r-graphics)):
show/hide, add/remove/toggle on outputs, toggle cue, **start timer**, **pause timer**, **add/remove
time** (`HH:MM:SS`, `MM:SS` or seconds), **add to score**, add row, select row, Google Sheet
select-row and refresh, set % complete on a Progress graphic, set a Speaker Timer message, refresh
a Webpage graphic, clear Map pins, transition override, telestrator tools.

Two things stand out. **Add/remove time on a running clock** is a verb no other product here
exposes so plainly, and it is a real need. And **add to score** is a single verb with the team as a
parameter, rather than a pair per team.

### Streaming overlay tools

**Streamlabs** ships seventeen widgets, all behaviours in our sense because each reacts to an event
stream rather than to a field ([widgets](https://streamlabs.com/stream-widgets)): Alert Box, Chat
Box, Game Pulse, Stream Labels, Goals, Media Share, Stream Boss, The Jar, Viewer Count, Sponsor
Banner, Poll Widget, Emote Wall, Spin Wheel, Event List, Chat Highlight, Tip Ticker, End Credits.

**StreamElements** confirms Alert Box, Chat Box, Event List and Goal widgets, plus custom-coded
widgets when "the built-in widgets aren't enough" ([overlays](https://docs.streamelements.com/overlays)).
The full inventory is not enumerated anywhere readable; **treat it as partially verified**.

**OBS** itself ships no behaviours - it composites sources, and the behaviour arrives as a plugin
or a browser source. The representative example is the Scoreboard Overlay and Controller plugin:
home and guest increment and decrement by hotkey, a timer that counts down or up with pause and
reset, a **swap teams** function "perfect for halftime", and a show/hide toggle
([resource](https://obsproject.com/forum/resources/scoreboard-overlay-and-controller-plugin.1777/)).
Swap teams is worth stealing: one press that would otherwise be four edits.

### Audience and social products

**Viz Flowics** ships Polls, social comments and Rankings, plus a free HTML5 template library
([library](https://www.vizrt.com/news-articles/vizrt-reveals-free-library-of-html5-graphics-templates-for-viz-flowics-users/),
[poll widget](https://support.flowics.com/en/articles/8870615-setting-up-a-poll-widget-for-graphics)).
Its signature mechanic is **Flock-to-Unlock**: audience scoring drives an on-air progress bar and a
threshold unlocks content. That is a threshold behaviour with a bar, and it maps onto NoaCG's L4
interpolated-bar model (`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §12) with nothing left over.

**Tagboard** ships poll templates in Fullscreen, Lower Third and Tombstone layouts, Twitter poll
visualisation, and social posts ([design a poll](https://support.tagboard.com/knowledge-base/design-a-poll),
[social in graphics](https://support.tagboard.com/knowledge-base/social-in-graphics)). Its lower
thirds automatically cycle through headlines with a progression indicator drawn as a segmented bar
or a slide progress bar. Automatic cycling with a visible position indicator is a behaviour nobody
else here names.

### Production switchers with graphics attached

**LiveU Studio** adds a scoreboard from Applications as "Add Scoring", with a sport type, a
position, colours and a Column/Inline layout
([scoreboard](https://studiosupport.liveu.tv/hc/en-us/articles/17094653947803-Scoreboard)). The
sports and the operator controls are not enumerated; **unverified**.

**Livestream Studio** has a Graphics Store and three overlay tracks; no named behaviour beyond show
and hide appears
([overlay tracks](https://help.vimeo.com/hc/en-us/articles/31111800861713-Adding-Graphics-Overlay-Tracks)).

**Ecamm Live** has web widget overlays, countdowns and scrolling tickers among them
([web widgets](https://support.ecamm.com/en/articles/3897737-using-web-widget-overlays)); no
published inventory, **unverified**.

**MixEffect** is not a graphics product - it controls ATEM switchers
([docs](https://docs.mixeffect.app/configure/switcher-pages/panels-and-buttons/media-players)).
Listed only so the gap list does not treat it as a comparable.

### NewBlue Titler Live Sport

Scoreboard controllers for baseball, basketball, football, hockey, soccer and volleyball. Score
changes by typing a number or by increments of +1, +2 or +3; a real-time game clock, and a separate
play clock that can be deleted for a sport that has none. The controller can be opened in a browser
to hand control to a second person
([Scoreboard Tool](https://newbluefx.zendesk.com/hc/en-us/articles/208637346-Using-the-Scoreboard-Tool)).

### Feeds that replace the operator rather than serving one

Sportzcast sends clock, period and score from the venue controller to the score bug; an OCR clock
reads only the game clock off a camera feed
([Daktronics](https://www.daktronics.com/en-us/support/kb/000004609)). Scoreboard OCR pushes into
vMix by matching field names case-sensitively ([for vMix](https://scoreboard-ocr.com/vmix)). LIGR
goes furthest: an automation engine runs the broadcast with no graphics operator, and where a human
is needed it is a LiveScore app in which "any person, including the cameraman" presses a button
when an event occurs - a goal then fires a celebration, updates the scoreline, shows the scorer and
minute, and can trigger a sponsored overlay, in one timed sequence
([LIGR](https://www.ligrsystems.com/),
[automate live graphics](https://blog.ligrsystems.com/getting-started/step-six-automate-live-graphics)).

That composite is the strongest single argument in this survey for behaviours over fields. One
press produces four coordinated changes, and no amount of typing into boxes gets you there.

### OGraf reference graphics (EBU)

Nine examples ship in `v1/examples` ([ebu/ograf](https://github.com/ebu/ograf/tree/main/v1/examples)):
Bar Chart, Headline, L3rd Name, Minimal, OGraf Logo, Renderer Test, Responsive Lower Third,
**Scoreboard**, Weather.

The Scoreboard is the only one with behaviour, and its shape matters to us. Five steps used as
match phases - Pre-Match, Live, Half-Time, Second Half, Full-Time - advanced with
`playAction({delta: 1})` or jumped to with `playAction({goto})`; scoring is two **customActions**
with `schema: null`, `goal-home` and `goal-away`, each adding a point. The EBU's own reference
therefore splits exactly the way NoaCG does: a stepped path for the phases, plus named parameterless
verbs for the bumps.

## 3. What each recurring behaviour needs

For the top ten: the verbs the market converges on, the states, and what the artwork must contain.

**Countdown or count-up timer.** Verbs: start, pause, resume, reset, set duration, and - only vMix
and H2R - adjust a running clock by a delta. States: armed, running, paused, expired. The artwork
needs one text node for the figure and a duration that is authored or an operator field. An expiry
treatment is a fifth state in Vizrt and XPression and absent everywhere else.

**Score plus and minus per team.** Verbs: increment by a configurable step, decrement, set
directly, swap sides. Vendors split on granularity: SPX four buttons per team, NewBlue three, uno a
single `(+)`, H2R one verb with the team as a parameter. States: none - scoring is pure data, which
is why `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10 could verify a scoreboard with no code at all. The
artwork needs one numeric node per team.

**Ticker or crawl.** Verbs: pause, resume, next item, add, remove, clear, reorder; Vizrt adds a
per-item TTL with a declared expiry action. States: running, paused. The artwork needs a container
to scroll and a row template to repeat - the one item on this list whose binding problem is not
"which layer" but "which layer, repeated".

**Stepped reveal.** Verbs: take, continue, take out, and in Vizrt jump-to-step. States: one per
step, walked in order. This is NoaCG's default path and already the compatibility contract.

**Paged list or table.** Verbs: next row, previous row, select row, auto-advance on/off, add,
remove, reorder. States: none in most implementations, since the page index is data. The artwork
needs a fixed number of visible row slots.

**Game clock with a period.** The timer verbs plus next period and set period, and in Vizrt's case
an on-air action chosen from seven. The artwork needs a clock node and a period node.

**Progress bar toward a target.** Verbs: set current, set target, and in Flowics' case a threshold
that unlocks. States: below target, reached. The artwork needs a bar whose FULL length is drawn -
exactly the L4 model NoaCG built for vote bars.

**Poll or vote.** Verbs: open, close, show result, call the winner. States: voting, closed, result,
called. The artwork needs an options list, a bar or figure per option, and a badge.

**Social or chat queue.** Verbs: approve, add to queue, send to graphic, next, clear. The artwork
needs a text node, usually a media node, and an author node.

**Alert queue.** Verbs: trigger, skip, clear. States: idle, showing, dismissing, with a timer arc
back to idle.

## 4. What NoaCG covers, and the gaps

Checked against the shipped code rather than against the plan documents, which undersell it.

| Behaviour | Status |
|---|---|
| On air / off air | Covered, every template |
| Score plus and minus | Covered, and on imported artwork - both as plain number steppers (§10) and as the score behaviour (`importedDesign/scoreBehaviour.ts`) |
| Quiz lock and reveal | Covered (`types/answerBoard.ts`), attachable to imported artwork |
| Poll or vote | Covered (`types/livePoll.ts`), attachable, joined to the audience plane |
| Countdown with pause and resume | Covered as a CATALOG type (`types/clocks.ts`) - and as of 2026-09-05 attachable to imported artwork (`importedDesign/timerBehaviour.ts`) |
| Ticker | Covered as a catalog type (`types/ticker.ts`): pause, resume, skip |
| Two-sided speaking timer | Covered (`types/speakingTimer.ts`), and nobody else in this survey ships it |
| Stepped reveal | Covered by the default path |
| Progress bar toward a target | Half covered - the interpolated bar exists, no goal-meter type |
| Paged list or table | **Gap.** No next-page verb anywhere |
| Time of day clock | **Gap** as a behaviour |
| Count to a time of day | **Gap.** The catalog clock runtime can, but a timer ARROW's duration is authored, not read from a field |
| Adjust a running clock | **Gap**, filed: `docs/backlog/adjust-a-running-clock.md` |
| Credits roll with pause | **Gap** |
| Social or chat moderation queue | Partly covered by the audience plane; no graphic type with approve and send |
| Alert queue with auto-dismiss | **Gap** - `types/eventNotification.ts` is a design with no machine |
| Now/Next/Then, checklist, swap teams | **Gap** |

**The three biggest uncovered gaps**, ranked by how many competitors ship them and how often a real
show needs them:

1. **Paged lists and standings.** Six of seventeen products ship it, and it is the shape of every
   results board, league table and leaderboard. NoaCG has no verb for it at all.
2. **A clock the operator can correct on air.** Ten products ship a timer, two ship the correction.
   Everyone overruns.
3. **Credits with a speed control**, which the owner already ruled on
   (the retired owner rulings, credits, amended 2026-08-28) and which nothing has been built for.

## 5. Which gaps are reachable with no expression language

The rule is in root `AGENTS.md` and `docs/STATE_MACHINE_SCHEMA.md`: guarding is structural, a
transition fires only if the author drew that arrow, and there is no expression language ever.

**Reachable now, with mechanisms that already exist:**

- **Credits roll with pause and resume** - the shipped ticker's shape exactly: two states, two
  events, the scroll inside the running state.
- **Alert queue with auto-dismiss** - a timer arc from showing back to idle. Timer transitions are
  already in the model.
- **Now / Next / Then** - a parallel group with timer arcs between three states.
- **Checklist** - one `tick` event carrying the item as payload, the quiz's `select` mechanism. N
  items do not mean N events.
- **Swap teams** - one event exchanging two field values, no new concept.
- **Goal meter** - the L4 interpolated bar pointed at a different pair of numbers.
- **Possession, timeouts and period** - a two-state parallel group and number fields with steppers.

**Reachable only after one specific mechanism lands - a timer arrow whose duration comes from a
field** (already parked in `docs/CONTROL_PANEL_RESEARCH.md` row 7, which refuses the wrong fix for
the right reason): count to a time of day, operator-set vote windows, and adjusting a running
clock.

**Not reachable without something new, and worth saying plainly:**

- **Paged lists where the last page must grey the Next button.** Paging is easy - one state, a page
  number field, `nextPage` with `adjust: {page: 1}`. Greying at the last page is a comparison
  between two numbers, and structural guards cannot express it. Three honest ways out, none of them
  a language: model each page as a state (caps the page count at design time, which is what SPX
  steps already do); let Next wrap (needs a modulo, so it fails the same test); or add a declared
  **bounded counter** field kind that owns its own minimum and maximum and reports its own
  legality, the way `noacgTextOverflow()` already reports a value the design cannot hold. The third
  fits the house style, and it is a field kind rather than a language.
- **Sport scoring where one number rolls into another** - tennis games into sets, cricket overs.
  Every competitor solves this by shipping one template per sport, which is a content answer rather
  than a mechanism answer, and it is available to us too.
- **Anything conditioned on a value the operator typed** - Vizrt's Hide on Empty. As a declared
  field property it is fine; as a guard it is not.

The last two bullets point one way: the thing NoaCG is missing is a small vocabulary of
self-describing FIELD KINDS, not a language.

## 6. What this survey chose, and why

**The countdown timer**, built as `src/templates/importedDesign/timerBehaviour.ts` and recorded in
`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §13. Four reasons, in the order they carried weight:

1. **It is the highest-ranked behaviour NoaCG could not put on a student's own artwork.** Rank 2 in
   §1, ten of seventeen products - and rank 3, the score board, had shipped two days earlier.
2. **The owner's own list puts it first.** `docs/backlog/playout-logic-for-all-common-graphics.md`
   opens with "a clock or countdown that pauses, resumes and can be corrected mid-run", and its
   fifth item is "a timer with a limit that changes appearance as it runs out".
3. **Half of it already existed and was unreachable.** The shared clock runtime, the countdown
   field kind and a catalog type with a running/paused machine all shipped long ago; what was
   missing was the join to artwork somebody drew, which is the exact gap the current push exists to
   close.
4. **It was the only candidate that could tell us something new about the seam.** The score board
   had just shown that a behaviour can reuse another's paint; the countdown asks a different
   question - what DRIVES a repaint when nothing has changed but the wall clock - and the answer
   (the clock runtime's own paint hook) needed nothing added to `behaviour.ts`.

**What was considered and not chosen.** A ranking that reorders itself by score is the one the
owner called "amazing" (`docs/backlog/graphics-need-their-own-logic.md`) - and he parked it in the
same breath, and its paint is a kind nothing here has done: moving drawn layers rather than showing
them. A paged results board is the biggest gap in §4 and needs the bounded-counter field kind in
§5 before its Next button can be honest. A ticker's binding problem is "which layer, repeated",
which no picker in the mapping step can currently ask. All three are better second choices than
first ones, and each is now argued from this page rather than from scratch.
