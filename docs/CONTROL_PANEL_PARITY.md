# Control-panel parity, per graphic type

**What this is:** the measured answer to `docs/AI_LITE_PLAN.md` §5 steps 1-2 - *does a catalog
graphic arrive with a working control panel?* - asked of a lower third and of one graphic of every
interactive type the catalog ships. Written 2026-08-09 from a driven browser, not from reading the
code.

**What it measures: the machine arrives from the graphic TYPE.** A type owns its states, events
and operator controls; AI picks the type and fills content and design, and the machine arrives
from the type registry. Nothing measured below asks a model for a state or an event, and §6 says
what that leaves for Lite to do.

**The rule this served has since changed, and the measurement has not.** "AI never authors a
state machine" (owner, 2026-08-08) was **superseded on 2026-08-27**: custom control panels are
open on every path, Lite and Pro included, gated rather than forbidden
(`docs/CONTROL_PANEL_ROAD.md` §9). Type-supplied machines stay the default and the cheap path -
everything below still holds - but "the model may not author one" is no longer why.

## 1. How it was measured

Five graphics, each **created through the real wizard** (Entry → Browse → search → design card →
Skip to finish → **Export it**, which is the door that saves to the library), then opened at
`#/control/<graphicId>` and driven: every field written and pushed with ⟳ Update, then ▶ Play,
then every event button in its declared order, then » Next twice, then ■ Stop, then a replay.
Headless Playwright against the dev server; the machine state was read from the page's own state
chip, and field values from the preview iframe's DOM.

| Design | Type | Category |
|---|---|---|
| lt11 House Strap | lower-third | `lower-third` |
| qz02 House Quiz | quiz-board | `quiz` |
| pl01 House Vote | live-poll | `poll` |
| sb03 House Score | scoreboard | `scoreboard` |
| gt05 House Countdown | countdown | `game-timer` |

The exploratory probes were temporary and are gone; what they found that is worth re-checking
forever became `e2e/control-panel-types.spec.ts` (§5.9).

## 2. The verdict

**Parity holds, structurally.** Every type's machine survived `variant.create()`, reached the
control page, produced its declared buttons with its declared labels, and greyed them by the
structural guard at every step of a real walk. Nothing needed per-type code and nothing was
missing from the transport. The state chip tracked every group, including the parallel ones.

**What is weak is the operator surface, not the machine.** Ten gaps are listed in §5; **four are
fixed here**. Two were defects that put a wrong picture on air with nobody doing anything wrong -
an empty selected-answer marked answer A as the contestant's pick (§5.0) and an event fired with
no entry selected aired an empty payload over the fields (§5.1). Two were the surface not saying
what it knows: the chip printed internal state ids (§5.2) and the events ignored the sections their
type declared (§5.6). What is left is led by the absence of any snap/recovery control the
production page already has (§5.3) and by a running countdown that cannot be corrected (§5.4).

Measured button legality, over the whole walk, matched the authored graph in every case - including
the two claims the model exists to make: after `lock` the quiz offers no `select` (the pick is
structurally final, not refused), and the scoreboard's flag, result and walk moved as three
independent pointers with no combined states.

## 3. What an operator can do, per type

Common to all five: named **entries** (add / duplicate / rename / delete / select-active, ★ make
default data), **▶ Play** the active entry, **⟳ Update** without re-animating, **» Next**, **■ Stop**,
a live scaled preview with a red ON AIR tally, a state chip, and a downloadable
`controlpanel.html` with the entries baked in. Editing an entry is always a draft: typing reaches
the graphic only on Update or Play.

### 3.1 Lower third - lt11 House Strap

- **Fields:** `f0` Name, `f1` Title (both text). Both reached the DOM through ⟳ Update.
- **Machine:** none persisted (the derived linear one is correct), `steps: 1`.
- **Events:** none - and that is right. **No lower third in the catalog carries an authored
  operator event** (pinned by `e2e/lite-parity.spec.ts`), so its control page is a transport and
  two boxes.
- **Walk:** Play → `enter`; » Next inert (one step, no operator arrow); ■ Stop → `off`.
- **Missing:** nothing type-specific.
- **The honest caveat:** this is the cheapest possible test and it proves almost nothing about the
  types below. It was still worth running - it is the step that had never been run at all.

### 3.2 Quiz board - qz02 House Quiz

- **Fields:** `f0` question, `f1`-`f4` answers, `f5` correct answer, `f6` selected answer (both
  segmented A/B/C/D pickers), `f7` audience results. **All eight reached the DOM.**
- **Machine:** one group, eight states (`off`, `question`, `reveal`, `out`, plus the branches
  `selected`, `locked`, `sealed`, `audience`), `steps: 2`.
- **Events:** ⚡ Select answer · Lock it in · Reveal choice · Reveal correct · Show audience result.
- **Walk, measured:**
  `question` -(select)→ `selected` -(lock)→ `locked` -(judge)→ `reveal` -(audience)→ `audience`
  -(» Next)→ off air. Replay + » Next fires the walk's own `judge` arrow into `reveal`.
- **The guard, measured:** in `locked`, both `select` and `lock` are greyed - there is no `select`
  arrow leaving that state, so a late pick is impossible rather than refused. `Reveal choice` stays
  greyed on the whole visible-pick route (its only arrow leaves `sealed`).
- **The hidden-pick route** (type the contestant's answer, lock it unseen, reveal it as its own
  beat) is reachable and was walked: Lock from `question` enters `sealed`, where `Reveal choice`
  turns on and `Select answer` is greyed, and Reveal choice lands in `locked`. Two ways to be
  locked, and which one you are in never depends on how you got there.
- **The tally is honest:** no ON AIR badge before ▶ Play, one after it.
- **Missing:** nothing in the machine. The gaps are all in §5 - most sharply §5.1, because
  `Select answer` is the one button here that carries a payload.

### 3.3 Live vote - pl01 House Vote

- **Fields:** `f0` question, `f1` options (a multi-line "Label | count" editor - the whole vote is
  one field, not one per row), `f2` vote count, `f3` vote badge wording. All four reached the DOM.
- **Machine:** one group, six states (`off`, `enter`, `result`, `out`, branches `closed`,
  `called`), `steps: 2`.
- **Events:** ⚡ Close voting · Show result · Call the winner.
- **Walk, measured:** `enter` -(close)→ `closed` -(result)→ `result` -(call)→ `called`.
  `Call the winner` is greyed until the figures are on screen, which is the type's own claim.
- **Missing / to know:**
  - **The 20-second voting window is invisible and unreachable.** It is a `timer` arrow authored on
    the type (`VOTING_WINDOW`), so the board closes itself while the operator watches, with nothing
    on the page saying it will, and no way to set it per play. The type file states this as a known
    limit; the control page does not.
  - **`called` is a dead end for » Next.** The branch has no outgoing arrow, so after calling a
    winner the only way off air is ■ Stop. Pressing » Next does nothing and says nothing.

### 3.4 Scoreboard - sb03 House Score

- **Fields:** `f0`/`f2` team names (text), `f1`/`f3` scores (**number steppers** - a goal is one
  press, not a select-and-retype). All four reached the DOM.
- **Machine:** three groups - `main` (walk only), `flag` (none/shown), `result` (live/final).
- **Events:** ⚡ Goal A · Goal B · Clear flag · Full time. (Since 2026-08-23; the plain ⚡ Flag
  was retired when the owner, running a match live, pressed it twice expecting the score to move:
  a goal raises the flag AND carries that side's score +1 as its payload - the control's
  `adjust`, `docs/CONTROL_LAYER.md`.)
- **Walk, measured:** a goal raises the flag and moves the score on one press, from either flag
  state (a second goal replays the flag - the self-arrow - and counts from the new figure);
  Clear flag takes the marker down and moves nothing; `Full time` is one-way and greys itself
  afterwards (a match does not un-finish); ■ Stop rests every group at its initial state, so
  `result` returns to `live`. Pinned by `e2e/production-controls.spec.ts` ("a scoreboard GOAL").
- **Missing:** no clock - deliberately. This type's four designs draw no clock, and the sports
  pack's own scorebug and match board carry the three-state clock group instead
  (`types/sportsBugs.ts`). An operator wanting a running clock needs one of those boards, and
  nothing on this page says so.

### 3.5 Countdown - gt05 House Countdown

- **Fields:** `f0` label (text), `f1` Timer (minutes) as a **number stepper**. Both reached the
  DOM - the duration lives in a `display:none` holder, so it is edited but never painted.
- **Machine:** two groups - `main` (walk only), `clock` (running/paused).
- **Events:** ⚡ Pause clock · Resume clock, mutually exclusive and greyed correctly from the first
  frame.
- **Missing:** see §5.4 - an edited duration does not re-anchor a clock that is already counting.

## 4. Where the surfaces disagree

Four surfaces render the same vocabulary. What the per-graphic page has that the others do not, and
the other way round:

| | `#/control/<id>` | editor Rehearse | exported `controlpanel.html` | hosted / production page |
|---|---|---|---|---|
| Event buttons | yes | yes | yes | yes |
| Structural greying | yes | yes | yes | yes |
| Buttons grouped by section | yes | yes | yes | yes |
| State shown as | state NAME | state NAME | state NAME | state NAME |
| Snap to a state (recovery) | **no** | via the graph | recovery replay on reboot | **yes on both** since 2026-08-19 (`.pd-snap`, with a reset-visual-state option) - the hosted page had none, which is the wrong page to lack it: it is the one being operated away from the renderer |
| Buttons grouped by SECTION | yes | yes | yes | **yes on both** since 2026-08-19 - one grouper, `controlModel.ts arrangeControls`; the hosted page rendered a flat wall |
| Operator ACTIVITY log | – | – | its own feed | **yes on both** since 2026-08-19 - the hosted page already read every row to drive PROGRAM and discarded them |
| "Not on air yet" on an edited live cue | – | – | – | **yes on both** since 2026-08-19; the hosted baseline follows the WIRE, so somebody else's update clears it |
| A value TOO LONG for the design | yes | – | yes | **yes on both** since 2026-08-23 - one warning on every surface where a value is typed (`controlModel.ts` `overflowNote`), a summary at the top of the editor plus a mark on the box. The graphic reports it (`noacgTextOverflow()`, riding the machine-state answer); the copy is never cut and the artwork never reshaped to hide it (docs/SVG_IMPORT_PLAN.md §3). The editor's Rehearse tab is the one surface without it, deliberately: the designer is looking at the graphic full size |
| Load a production DATA row | – | – | – | in-app: matched LIVE; hosted: the same matcher's rows, resolved at PUBLISH time (`control/cueData.ts`) |
| Verb keys (P · SPACE · R · U · N · 0 · ↑↓) | – | – | yes | yes on both since 2026-08-18 - one keymap, `components/playoutKeys.ts` (the hosted page had none at all before, and its TAKE re-took a live cue instead of taking it off) |
| Two SPACE modes - the operator's checkbox (`docs/PLAYOUT_DASHBOARD.md` §2f) | – | – | yes - the decision's outcome table, the faces and the tooltip interpolated from `control/spaceMode.ts`; its own store on the relay's origin | **yes on both** since 2026-09-16 - one decision and one set of words, `control/spaceMode.ts`, one checkbox, `SpaceModeToggle.tsx`, `prefs.spaceMode` per browser. Default unchanged; the second mode previews on SPACE, airs on SPACE, and a live cue's SPACE takes it off onto PREVIEW. "On PREVIEW" is ONE cue on all three, held synchronously; the editor follows the selection on all three and only PREVIEW follows the staged cue. Cross-graphic staging is pinned on the exported controller (`production-controls.spec.ts`) and holds by construction on the React pages (one staged id); a cross-graphic walk of the React pages is not yet driven |
| Scroll model: a fixed shell, the CONTROL AREA the only scroller | – | – | yes | **yes on all three** since 2026-09-22 (owner's production test, `docs/PLAYOUT_DASHBOARD.md` §2) - the document never scrolls, the header, the stage head and the rail are fixed grid areas, and everything under the monitors sits in one scroller with `overscroll-behavior: contain`. Until then all three scrolled as a PAGE with those three held on it by `position: sticky`, and a trackpad's overscroll bounce moved them. The monitors still cap near 30vh, and `pointer-events: none` on every monitor iframe, which only the exported controller had. `e2e/playout-fixed-panes.spec.ts` drives the in-app page and the exported controller; the hosted page's DOM needs a backend, so it is held by this contract and by reading the diff |
| The STAGE HEAD: monitors + verb bar as one block, bar beside PROGRAM ≥1366px | – | – | yes | **yes on all three** since 2026-08-21 (owner read, `docs/PLAYOUT_DASHBOARD.md` §2) - the bar used to scroll away under the monitors on every one of them. Two verbs across with TAKE spanning; below 1366 it returns underneath. The monitor cap grows with the window from the 768px floor instead of a flat 26vh |
| The monitors' aspect ratio | – | – | the PRODUCTION's, baked at export | **the production's on both** since 2026-08-21 - the React surfaces used the PREVIEWED cue's, so selecting a differently shaped cue resized both monitors. The exported controller was right all along; this is the other two catching up to it |
| A match clock’s TIME ORIGIN | – | – | stamped by the page | stamped by the page (in-app) / derived from the row (`/output`) |
| Entries | authored here | – | baked in, read-only | read-only picker |
| Staged vs aired | Update/Play only | Live toggle | staged + ⟳ Take | staged + ⟳ Take |

## 5. The gaps, worst first

**5.0 An unset pick marked answer A as the contestant's. FIXED HERE.** `quizRow(letter)` resolved
its row with `'ABCD'.indexOf(String(letter || '').trim().toUpperCase())`, and **`indexOf('')` is 0**
- so an EMPTY selected-answer field, which is the field's own default because nobody has picked
yet, resolved to row A. Entering the `selected` state on a board with no pick typed therefore
marked the first answer, on air, with no operator action behind it and nothing on screen to tell it
from a real pick. Its own guard (`if (!row) return`, commented "nothing picked yet, or an unknown
letter") could never fire.

It is the worst thing found here because it needs nobody to do anything wrong, it is invisible
until air, and it reaches every surface - the control page, the editor's Rehearse tab, the exported
panel, the hosted page - through the template's own runtime. `src/templates/quiz/shared.ts` now
rejects the empty string before the lookup. The change moves the **js** pane of 12 quiz variants
and nothing else: `e2e/catalog-baseline.json` re-recorded (html and css byte-identical, the render
fingerprint unmoved, so the layout gates are untouched), `npm run test:e2e:catalog` green.

**5.1 An event's payload came from the active ENTRY, so with no entry it aired an empty value.**
**FIXED HERE.** The payload was built as `String(active?.values[key] ?? '')`. A freshly saved
graphic has **no entries** (`no-entries` is the page's own empty state), so pressing ⚡ Select answer
there sent `f6: ''` - which the machine applies, because the guard is about the EVENT, not about
the value. The pick was wiped rather than made; ⚡ Show audience result (`f7`) had the same shape.
It was the one defect on the list that silently produces a wrong picture on air, and no gate could
have caught it: an empty payload is a perfectly legal payload.

Now a payload key rides only when the active entry actually holds it, so with no entry the event
fires bare and the graphic keeps the values already on air - which is what the exported panel does
by construction, since its payload comes from field boxes that always hold a value. The button's
tooltip names the payload fields and says where they come from. Pinned by
`e2e/control-panel-types.spec.ts` ("an event fired with no entry selected keeps the values already
on air").

**5.2 The state chip printed internal state IDS, not the names the type authored. FIXED HERE.**
Measured chip text was `enter`, `question`, `sealed`, `main:enter · clock:running`, where the
machine carries `Enter`, `Question`, `Locked, choice hidden`, `Running`. The chip is the fact every
greyed button is justified against, so it is the one string on the surface that has to read as
English - and **three surfaces printed ids** (this page, the editor simulator's strip chip, the
exported panel) while two printed names, from two hand-rolled copies of the same three-line map.

There is one formatter now - `controlModel.ts` `formatMachineState` over `machineStateNames` - and
all five surfaces call it. `machineStateNames` is deliberately not `machineStateGroups`: that one
is the snap PICKER's list and is empty without an explicit machine on purpose, while NAMING has to
work for a machine-less graphic too, so it falls back to the derived machine (whose states are
named after the steps - a lower third now reads "Enter"). The exported panel ships without React,
so it carries the map baked in at export.

**5.3 There is no snap / recovery control at all.** The production page builds one out of
`machineStateGroups` (`.pd-snap`, a per-group state picker plus a `::reset` entry that snaps every
group to its initial - the VISUAL half of reset); the per-graphic page never calls that function.
"Every state is enterable two ways - by transition or by SNAP" (`docs/STATE_MACHINE_SCHEMA.md` §3)
is therefore false on this surface: an operator who lands in the wrong state has ■ Stop and a
replay, and there is no reset-visual-state separate from resetting data.

**What to build, decided 2026-08-09** (`docs/PLAYOUT_DASHBOARD.md` §8a, ruling 1): the approved
blueprints' PLACEMENT with §7b's SEMANTICS. So this surface grows **two** things, not one:

- the current state as a **labelled row in the field editor**, in the author's words, where the
  quiz frames draw their `QUIZ STATE` control - the operator should read where the graphic is
  without hunting for a chip;
- a **recovery** jump, labelled as recovery, riding with a re-send of the values (recovery is two
  operations). The production page's `.pd-snap` is the working example.

Jumping stays recovery on purpose: driving by picking from a list skips the arrows, and after
`lock` there is no `select` arrow at all - a late pick is impossible rather than refused. A free
state dropdown would make that guard cosmetic.

**5.4 A running countdown cannot be corrected - only restarted.** Measured: the clock shows 3:00 at
load, ⟳ Update with 7 minutes repaints it to 7:00 immediately, ▶ Play starts it at 6:59, ⚡ Pause
holds it (6:59 across two seconds) and ⚡ Resume continues it. So off air the duration is fully
operable. **While it is ticking it is not**: `gameTimers/shared.ts update()` guards the repaint with
`if (!clockTimer)`, deliberately, so a duration edit mid-round changes the hidden value and not the
digits, and the only way to apply it is ▶ Play - which restarts the round from the top. Compare
`shared/matchClock.ts`, which re-seeds from a CHANGED field value precisely so a live clock can be
corrected without losing where it is. This is a capability gap rather than a bug; the countdown
never got that treatment.

**5.5 Timer-driven transitions are invisible.** Measured: after ▶ Play the vote sat in `enter` and
the chip flipped to `closed` on its own between the 20 s and 22 s samples - the authored window,
armed when the entrance settled, exactly as the type says. The page shows nothing about it before
or after: no countdown, no "closing in", no way to set the window per play, and afterwards nothing
distinguishes "the operator closed it" from "it closed itself". Two shipped types close a real loop
on a timer (live vote, chat highlight) and a third (transition) clears itself; none of them can say
so on an operator surface.

The approved quiz blueprints go further than "say so": they carry a `TIMER (SEC)` **stepper as an
operator field**, i.e. a per-play window. **Decided 2026-08-09** (`docs/PLAYOUT_DASHBOARD.md` §8a,
ruling 2): **no second clock.** The delay authored on the arrow stays the one source of truth -
both timer types decline a per-play field in their own files for exactly that reason - and what
gets built instead is this gap as written: **an armed timer must be visible on the surface**, with
its remaining window, so "it closed itself" is never a surprise. Ending one early stays the manual
button that already exists. This is the open work item; §5.4 is its sibling on the countdown side.

**5.6 Event buttons were not grouped by section. FIXED HERE.** Measured: `.ctl-event-section` count
was **0** on the quiz's control page, while every other renderer honours the `section` the type
declares ("Answer", "Vote", "Flag", "Result", "Clock") - so a quiz put nine controls in one flat
row beside ▶ ⟳ » ■ with no grouping and no order cue. The events now sit BELOW the transport in
their declared sections (`.ctl-events`, the same block the Rehearse panel builds), operator-sized
like the row above them. The lifecycle row stays what it is: ▶ ⟳ » ■ are the four presses every
graphic has, an event is one only this graphic has. Browser-checked at 1280×720 - the stage gives
up the height and nothing clips or scrolls.

**5.7 A branch with no way out reads as a broken » Next.** The vote's `called` has no outgoing
arrow, so » Next is inert there. The button is neither greyed nor explained - unlike an event
button, the lifecycle row never greys.

**5.8 The page cannot say a graphic has no clock, no rows, no reveal.** The scoreboard type omits
its clock group on purpose; an operator reading a score strip with a Full-time button and no clock
has nothing telling them the timing lives on a different board.

**5.9 Nothing in the merge gate drove an interactive type's control page. CLOSED HERE.**
`e2e/control.spec.ts` covers the quiz through the EXPORTED panel and the editor tab, and
`e2e/lite-parity.spec.ts` compares the MODEL surface (field / event / group lists) - neither opens
`#/control/<id>` on a graphic that has a machine. `e2e/control-panel-types.spec.ts` now walks the
quiz (both routes), the live vote, the scoreboard and the countdown on that page, asserting the
state chip AND the full greying table after every press, plus the machine-less lower third and the
§5.1 regression. Its mapping is in `scripts/e2e-affected.mjs` under `src/control/`, the four type
files, and `src/components/home/`.

## 6. The recorded blocker: `validation/fieldPaint.ts` read one state — FIXED

`unreachableFields()` drove every text-bearing field to a sentinel and read the visible text
**once, at the settled default-path state**. A field a later operator event reveals therefore read
as unpainted, and a correct multi-state graphic failed.

It was not hypothetical on the types measured here. The quiz's `f7` **Audience results** is painted
only by `applyAudienceResult()`, on entry to the `audience` branch - three operator events past the
settled state. **Measured, by disabling the fix and re-running the spec:** the check reported
*"Field Audience results (f7) … reaches no pixels"* on an untouched catalog quiz. The vote's figures
and the quiz's selection marks have the same shape (`applySelection` in `selected`/`locked`).

The drive now asks the whole machine. After the settled reading it snaps through the machine's
other states and unions what each one shows. Three properties make that correct and cheap:

- **`noacgSnap` enters any state directly**, replaying its canonical path with callbacks
  suppressed - no event sequence to find, and a state no button-press can reach is still measured.
- **Because callbacks are suppressed**, a state whose look is a CALL paints nothing from the snap
  alone, so the data is re-driven after each one. That is the recovery sequence's own trailing
  `update()`, not a special case.
- **It stops as soon as every field has been seen**, so a correct graphic pays for one or two extra
  states rather than its whole graph. Only an EXPLICIT machine is walked - a derived one's states
  ARE the default path the caller already walked - so a single-step lower third costs nothing new,
  and the machine is put back where it was found so the bench's later phases measure what they did
  before.

`MAX_WALKED_STATES` (32) bounds a graph an author controls; the spec MEASURES the catalog's largest
machine against it rather than trusting the number, so the cap cannot quietly start truncating.
Pinned by three tests in `e2e/lite-field-paint.spec.ts`, including the mutation half (a field that
paints in NO state is still reported) - the guard was verified red before it was verified green.

**Lite is no longer blocked on this for the interactive categories.** What remains is §7.

## 7. What a Lite-generated interactive graphic would need on top

**Very little at the machine level, and the reason is structural.** Lite compiles through
`specToTemplate` → `variant.create(options)`, and for a typed design `create()` is the wrapper that
calls `attachMachine(type, …)` (`types/graphicType.ts:615`). The machine, its controls and its
labels therefore arrive with the template whatever asked for it - which is what makes
type-supplied behaviour the free path, and why it stays the default now that authored machines
are allowed under the gates.
`e2e/lite-parity.spec.ts` already pins that a Lite result and a hand-picked build have the same
fields, the same event buttons and the same state groups; today it pins that over six lower-third
chassis, where the claim is vacuous because none of them has an event.

What genuinely has to change to widen Lite into these categories, in order:

1. ~~**Widen the field-paint drive past one state** (§6).~~ **DONE** — it asks the whole machine now.
2. **Fix §5.1 before any interactive category ships.** A Lite quiz is exactly a graphic nobody has
   built entries for yet, so the first thing a student would press is the button that wipes the
   pick.
3. **`maxLines` truncates a typed design's content on the AI path only.** `specToTemplate` does
   `lines.slice(0, variant.maxLines)`, and a compiled quiz variant carries `maxLines: 1` (the type's
   capability) against **five** declared line-role fields. `create()` then pads the missing four
   with empty text - by design, for a one-line lower-third brief. So a Lite decision that declares
   any lines at all yields a board with a question and **four blank answers**, where the wizard,
   which passes all five `suggestedLines`, yields a full board. This is the largest concrete
   obstacle to a Lite quiz and it is nothing to do with the machine.
4. **Widen `LITE_CATALOG` and the decision schema per category.** The schema's `lines[].role`
   vocabulary is lower-third specific (`person-name`, `story-headline`, …); a quiz's roles are
   question/answer/correct-answer, a vote's are question/options/badge. This is content vocabulary,
   not machine vocabulary - it is a schema widening, not a new generation stage.
5. **Nothing else.** No machine stage, no events stage, no state authoring. If a type's intended
   operator behaviour is missing, the answer is to define it in the type registry, in code - not to
   ask a model.

## 8. Re-running this

```bash
node scripts/e2e-runs.mjs --wait && npx playwright test e2e/control-panel-types.spec.ts
```

Twelve tests, ~1 min. Adding a type: give it a `TypeCase` in that file - its buttons, the settled
chip, and the walk with the legality after every press. The list is the type's own claim about what
an operator may do, written where it can fail.

## 9. Also fixed on the way past

**A worktree e2e run queued 30 minutes behind itself.** `activeRuns({ exclude: me })` recognises a
run by the checkout in front of its `node_modules` - and a linked worktree with no node_modules of
its own runs the MAIN checkout's Playwright CLI, so its own run was attributed elsewhere, never
excluded, and `e2e/_offline-guard.ts` waited out its entire 30-minute cap before starting anyway.
Every run from such a worktree paid it, which is a heavy tax on the `:queued` form the root
AGENTS.md requires. The guard now also excludes its own process chain (`selfAndAncestors` in
`scripts/e2e-runs.mjs`) - ancestry is a fact about processes, which is what path-matching could not
supply. Unit-tested in `scripts/e2e-runs.test.mjs`.
