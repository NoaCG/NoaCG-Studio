# Pinned live controls: several graphics from one screen

Status: **agreed by the owner on 2026-10-24**, after the open decisions were answered one by one
the same day (recorded under "Owner decisions"). Agreement covers the design and its proposed
placement; it authorizes no implementation, no run row and no edit to the production-page
programme's ledger until the coordinator admits the row. Reconciled against main `5d518ae86`.

Parent, once admitted: [production-page](../production-page-refactor/spec.md) and its
[extension contract](../production-page-refactor/extensions.md), whose file ownership,
compatibility, evidence reuse, environment routing and stop rules would apply. The proposed
placement is a proposal ("Proposed placement in the run"); `extensions.md` is not edited here.

## Why

In a studio game show on 2026-10-23 the operator ran two graphics in one rundown: a quiz board
and a score banner. To add a point they clicked the score cue, pressed +1, then clicked back to
the quiz cue to pick the competitor's answer, lock and reveal. Every live control on the
production page belongs to the cue that is selected, so two graphics on air means switching
between them for every press. A live operator should never have to switch graphics to reach a
control.

The cause is in one place. The ⚡ GRAPHIC ACTIONS block and the ± LIVE NUMBERS block
(`src/components/home/CueActions.tsx`) are drawn for the selected cue's graphic only, and a press
acts on the cue live on that graphic's layer (`src/control/graphicVerbs.ts` `event`, `bump`,
through the `VerbSelection` the render drew). Nothing else is missing: the controls are already
declared by each graphic, already act at once, and already grey by the machine. What is missing
is a way to keep a second graphic's live controls on screen.

## Goal

An operator runs several graphics from one screen. Each graphic's live controls can be kept on
screen whatever cue is selected, act at once on that graphic's on-air cue, and are the same
buttons on the production page, the hosted control page, the exported controller and, through
E6, the Stream Deck. Prep controls and live controls are two regions of one page, so the next
question is typed while the score stays one press away. The single-graphic page is unchanged for
a production that pins nothing, except where a graphic's own declaration gains the one-press pick.

## Non-goals

- A control panel builder with free placement of buttons and fields (owner's design 1). The
  control-panel road's gate for such a layout (`docs/CONTROL_PANEL_ROAD.md` §3) is unmet: ARRANGE
  plus this pin must first prove insufficient on a real show. A second cue or control system
  beside the production workflow is a standing non-goal (`docs/GOALS.md`).
- Combined controls, macros, sequences or conditions. Removed on 2026-10-02 and not restored.
- Pinning a cue (owner's design 2 as stated). The unit is the pool graphic; the rundown row is
  one of the two gestures that pin its graphic.
- Keyboard shortcuts for live controls (a key for +1 or Reveal). The verb keys and per-cue
  trigger keys stay as they are and keep acting on the selection. A key per live control must
  name a graphic, survive a layout change and never collide with cue keys or typing; it is a
  follow-up once the pinned block is in use, and the deck covers hands-on-hardware until then
  (owner, 2026-10-24).
- Rearranging the page (moving the rundown, placing the live region elsewhere). Live controls
  already sit under the monitors since 2026-10-02; anything beyond that is a per-device preference
  for a later request.
- A new Companion protocol or a second deck requalification. E6 carries the deck.
- Prep fields in a pinned block, a second cue editor, or any change to what Update sends.
- Operator identity, locking or per-operator permissions (`docs/GOALS.md` collaboration rule).

## Owner decisions (2026-10-24, one question each, with the recommendation taken)

1. **The unit that is pinned is the pool graphic** (its layer, whatever cue is live on it), never
   a cue. A quiz with twenty question cues has one Reveal. Removing or duplicating a cue changes
   nothing.
2. **An explicit pin**, set by the operator, saved in the production's control profile. Not an
   automatic block for every graphic on air: blocks never move under the hand as graphics go on
   and off air, and the choice reaches every operator page and the exported controller.
3. **A pinned block carries live controls only**: the ⚡ actions, the ± live numbers, the
   one-press pick buttons and the state chip. Prep fields belong to a cue, and the cue is what the
   selection chooses.
4. **Prep and live are two regions on one page**, not tabs: LIVE under the monitors, PREP below.
5. **The one-press pick rule is in scope**: an action whose payload is a field with a few fixed
   options draws those options as buttons (Select answer becomes A B C D), on every answer board.
   The question named the podium spotlight too; its payload turned out to be a number field, not
   a set of options, so it is reached only if its declaration changes. Ruled on 2026-10-02 (`docs/research/control-surfaces-review-2026-10-02/README.md`
   slice 6), never built. Lock stays the optional beat a design draws.
6. **The agent road proposes live controls**: one rule in the skill's contract, `noacg inspect`
   prints PREP and LIVE, `noacg validate` adds a non-blocking finding.
7. **Companion folds into E6**: no protocol addition here; E6's native target is the pool graphic
   and E6.2's presets offer the pinned graphics' live controls.
8. **Placement**: one new row after E7.2b and before E1.1 (proposal below).
9. **Shortcuts for live controls are a non-goal** of this spec.
10. **The word is "Pin live controls"** / "Unpin live controls" in the row menu, a pin glyph on
    the block head: ARRANGE already says "pinned" for a control lifted to the top of its block, so
    one word covers both.
11. **Pinning is authored on the production page only**, as ARRANGE is; the hosted page and the
    export read the published profile.

Standing owner requirements this spec inherits: controls are two kinds, prep and live, and live
controls act at once with no Update press; for quiz graphics the competitor's pick is a live
control; an agent proposes sensible live controls by itself; the current page must not get worse
for the people it serves; the production page stays maintainable through separate modules
(owner, 2026-10-24, the brief).

## The recommended design

### One sentence

A production pins pool graphics in its control profile; every operator surface draws a LIVE
region holding one live block per pinned graphic and then the selected graphic's block, each
block acting on its own graphic's on-air cue through the one dispatcher; PREP below it is the cue
editor as today.

### What the operator sees

```
┌ PREVIEW ─────────┐ ┌ PROGRAM ─────────┐
└──────────────────┘ └──────────────────┘
[⟳ TAKE] [Re-take] [✎ Update] [» Next] [■ Out]
LIVE
 ┌ 📌 Score banner · on air: Round 3 · ● Live ─────────────────┐
 │  Katri  − 12 +    Ben  − 9 +     ⚡ New game                  │
 └──────────────────────────────────────────────────────────────┘
 ┌ Quiz board · on air: Q7 · Question ───────────────── selected ┐
 │  Pick: [A] [B●] [C] [D]   ⚡ Lock it in   ⚡ Reveal correct    │
 └──────────────────────────────────────────────────────────────┘
PREP · EDITING PREVIEW CUE · Q8
 Question · Answer A · Answer B · Answer C · Answer D · Correct answer · ✎ Update
▸ ACTIVITY
```

- **LIVE** is a stack of blocks. Pinned graphics first, in the order they were pinned; then the
  selected cue's graphic, unless it is itself pinned, in which case its block in the stack is
  marked as the selected one and nothing is drawn twice. A production with no pins draws exactly
  today's one block.
- **A block's head** names the graphic, the cue live on its layer and the state chip
  (`machine-state-chip`, the fact the greying is judged against). The pin is a toggle on the head.
  Off air the block stays, greyed, with the chip reading "not on air" as today.
- **A block's body** is today's ⚡ block and ± live numbers for that graphic, arranged by the
  production's ARRANGE (pinned, sections, More) exactly as now, plus the one-press pick groups.
- **PREP** is the cue editor: the selected cue's setup fields, its ✎ Update, the data-row loader,
  the settings. Its head keeps today's words. A pick group's field is not drawn as a box here
  (the rule below); the active option shows on the live block instead. Every other field stays,
  a score's figure included, so a typed correction is still possible.
- **The second gesture** is the rundown row's ⋯ menu: "Pin live controls" pins the row's graphic
  and reads "Unpin live controls" while it is pinned. Both gestures write the same profile entry.
- **The hosted control page** draws the same LIVE stack from the published profile, above its cue
  editor, and the **exported production controller** draws it baked at export, exactly as ARRANGE
  travels today. On a phone the stack is part of the one scrolling column; the verb bar stays
  fixed at the bottom.

### What a press does

A press on a pinned block is `verbs.event` or `verbs.bump` with a selection built for THAT
graphic: the graphic, the cue live on its layer (`liveCue[graphic]`) as both `airCue` and
`editingCue`, `selectedLayerLive` from the live map. It reads payload values from that cue's
draft after the flush, patches the production tree for a bound field and waits behind the
previous bound press on the same graphic (`graphicVerbs.ts` `pressEvent`). Nothing here can act
on the selected cue, because the selection it is given is not the page's. The selected graphic's
block keeps the page's own selection, as now.

The existing verbs are not sufficient on their own, and this spec settles two gaps in L1 rather
than leaving them to E6 (second opinion, 2026-10-24, F1 and F2; both reproduced with held
promises):

- **A press names its instance and refuses a replacement.** Today `pressEvent` captures the
  selection, awaits the flush and sends on the graphic's layer with no check that the cue it was
  drawn for is still the one on air; a Take of another cue of that graphic during the wait
  receives the old cue's payload. Every live press (event, pick, bump, snap), from the page's own
  block, a pinned block or E6, captures the on-air cue id at the press and, after every wait
  (flush, the bound-press queue, the tree), compares it with `liveCue[graphic]`; a mismatch is
  refused with "the cue on <graphic> changed" in the activity log and nothing is sent. This is
  the same contract E6 states for its replacement case, implemented once in `src/control/`.
- **An increment counts from an authoritative base, serialized per graphic.** Today an unbound
  bump reads what air last confirmed (`p.aired`), so two presses within one round trip both
  write the same figure, and the cue is written before the send is accepted. The rule: presses
  on one graphic run one after another (the bound-press queue, extended to every live press of
  that graphic); an unbound bump or `adjust` counts from the last figure this page SENT for that
  field while a send is pending and from air otherwise; the cue is written only when the send is
  accepted, and a refused or failed send writes nothing and says so. A staged correction typed in
  PREP never becomes the next bump's base until Update has aired it. Two operators or two graphics
  moving one BOUND path are serialized by the tree's own patch road, not by this page; the spec
  does not claim more. The hosted page's `adjust` today reads the staging buffer; it adopts the
  same base rule.

### The control model: prep and live

The split is **derived from the declaration**, never authored per surface, with one rule already
in the code (`src/templates/types/graphicType.ts` `setupFields`): a field a declared control
writes (`set`, `adjust`, `add`, `remove`) or carries as the payload of an event off the default
path is **live state**; every other operator-visible field is **prep**. A default-path event's
payload stays prep (the quiz's answer key, a nominee reveal's winner): Continue walks it with no
panel at all, so the graphic must hold the value before air, and the press re-sends what the
operator can see.

Live controls are therefore: every declared ⚡ control, the ± stepper of every operator-visible
number field no event carries as payload, and the **one-press pick group**: an event off the
default path whose payload names exactly one `select` field with at most eight options, and
whose field no other control already `set`s, is drawn as its label and one button per option; a
press sets that field to the option and fires the event in one send, the same shape a `set` press
has today. The group is a rendering of that one `ArrangedControl`, so it keeps the control's
section, order, name, pin and More placement; there is no second bucket. Deciding it needs the
machine's default path, so the derivation takes the declaration (buttons, descriptors and
`pathEvents`), never descriptors alone: the quiz's Correct answer rides the default-path event
`judge` and is never a pick. The active option is drawn from what the layer was last sent
(`airedData`), so the block answers "which answer did the competitor choose".

What the rule leaves alone, by family: the quiz-show boards (qz13 to qz15) and the imported
switch, choice and survey recipes already declare one `set` control per option and gain no second
group; the podium's Spotlight and the competition boards' focus, highlight, round and champion
payloads are numbers or text and keep their field-then-button shape; the audience boards' Show
answer, Hold, Dismiss and queue actions, and the clocks' Pause and Resume, are live controls as
they are, and their question, answer and duration fields stay prep. Pinning removes the switching
to PRESS these controls; it does not remove the switching to TYPE a payload such as the podium's
index, which is the owner's chosen scope. Widening a rule is a change to that graphic's
declaration, not to this one.

**The hidden-choice format survives.** The classic answer board can take the contestant's answer
typed into Selected answer with nothing painted, lock it straight from the question (`sealed`),
and reveal the choice as its own beat (`answerBoard.ts`, the hidden-pick flow). Every pick button
fires `select`, which shows the choice at once, so the field must stay typeable: it moves under
the cue editor's ▸ Advanced disclosure, editable, with Lock and Reveal choice unchanged. The
visible one-press pick is the default gesture; the hidden flow is one disclosure away.

Live controls act at once, with the on-air cue's values, and never wait for Update; typing in
PREP stages, and stages only. That is today's doctrine (`docs/PLAYOUT_DASHBOARD.md` §7b, §7c)
restated for two graphics.

### How this relates to E1, E2 and E6, so nothing is designed twice

- **E1 and E2 (typed OGraf).** A foreign package's actions and steps are its live controls, read
  by the same generator (`ografContract.ts`); a pinned foreign graphic's block draws whatever E2
  gives the selected block, targeting the program instance only (E2's preview target is a
  selected-cue affair). E2's "retain ARRANGE, More and pinning" extends to pinned graphics: a
  pinned block of a foreign graphic needs no E2 change beyond that sentence.
- **E6 (declared actions through Companion).** E6 already carries capability IDs, argument
  descriptors, a target reference that is either the selection or a fixed cue/instance, press-ID
  deduplication, lease and snapshot checks and feedback. This spec asks E6 for exactly two things,
  recorded as a proposal for its text: (1) a native action's **target kind is the pool graphic**,
  resolved at the press to the cue live on its layer by the same function the pinned block uses
  (`liveSelection`), so "Reveal" on the deck means the quiz's current question whatever the
  selection; (2) **E6.2's presets** offer a section of the pinned graphics' live controls, each
  pick option as the event with its enum argument, with E6's allowed/applied/unknown feedback and
  a variable for the active option. One protocol bump and one deck requalification, in H0.2, as
  the programme already plans. H0's transport verbs are unchanged. **A pin is presentation, never
  command authority** (`docs/CONTROL_PANEL_ROAD.md` §3): pins populate presets, and E6 refuses an
  invocation for an invalid capability, target, instance, lease or state, never because the
  graphic was unpinned since the button was made. The instance check of "What a press does" is
  the same check E6's replacement contract names, so the two cannot disagree.

### The alternatives, and why not

| Design | Why not now |
|---|---|
| 1. A panel builder: pick graphics, drag buttons and fields into a custom panel | Free placement is a layout designer, the one the control-panel road gates behind proof that ARRANGE is insufficient (§3). It needs a saved layout format with missing-reference diagnostics, a narrow-panel story and a reversible fallback, and it is the shape of a second control system. Pinning gives the two-graphic show its controls with one boolean per graphic. Revisit if a production shows a task pinning cannot meet. |
| 2. Combine cues from the rundown into one control panel | The unit is wrong: a control belongs to a graphic's layer, and twenty question cues share one Reveal. The gesture survives (the row's menu pins the row's graphic); the record is per graphic. |
| 3. Pin a graphic's live controls on top of every panel | **Chosen.** Additive to the profile the surfaces already read, no new command path, follows the pool as graphics come and go, and travels to the hosted page and the export. |
| 4. Companion and Stream Deck as the aggregating surface | Right, and already E6's job. It does not replace the screen: the phone operator, the exported controller and a show without a deck need the same reach. |
| Automatic blocks for every on-air graphic (not in the brief) | Zero setup, but blocks appear and vanish as graphics go on and off air, which moves buttons under the hand mid-show and saves nothing per production. Declined by the owner; could return as an option if pins prove too much setup. |

### What comparable products do

Read on 2026-10-24 from vendor documentation; the named notes, with URLs and evidence grades, are
in the private competitor folder (`docs/private/competitors/MULTI_GRAPHIC_CONTROL_2026-10-24.md`,
main checkout only). Five patterns, and where NoaCG stands:

1. **The rundown is the panel.** Every graphic is a row with play, stop and continue; simultaneity
   comes from layers. SPX, the CasparCG client and the hosted overlay platforms' playlist panels
   work this way. NoaCG's rundown does too, and it is what made the operator switch rows: a row
   carries transport, not a graphic's buttons.
2. **A custom panel builder.** Broadcast control systems let an engineer compose take buttons and
   parameter fields that address any graphic by ID, saved as a file. Powerful, engineer-built,
   and the shape this spec declines for now.
3. **The deck aggregates.** vMix exposes per-title functions as shortcuts and lets Companion
   compose them with feedback; SPX exposes item IDs and template functions over REST; one lower
   third tool publishes every graphic as a dynamic show/hide preset. E6 is NoaCG's version.
4. **A fixed single-purpose panel per graphic type** (a score panel, a clock panel), one per
   overlay. NoaCG's generated block per graphic plays this role with no per-type code.
5. **Shared variables flowing into many graphics.** NoaCG's production data tree.

Two details carried into the acceptance: field text is explicit-Update by default everywhere,
with buttons and API calls immediate, which matches the prep/live split; and the only documented
removal semantics are an API error for an unknown graphic ID and a hardware button that keeps its
last look and says "unresolved", which is what AC-6 and E6's stale refusals already do.

## Derived decisions (revertible; each says how)

- **D1. The record is `ShowProfile.pinnedGraphics`**: an ordered list of pool graphic names,
  additive optional inside profile v1 (`src/model/profile.ts`), beside `arrange`. Reading drops a
  malformed list and keeps the rest; serializing writes it canonically; the validator refuses a
  name not in the pool at authoring. Deleting the profile clears pins with the arrangements: one
  profile, one delete. No version bump (`root/version-every-persisted-format-ship-breaking`). The
  cost, stated: a build from before this change that writes an arrangement drops the list, as any
  pre-field build does with an additive key; the same build renders the generated page, so a show
  run from it loses pins, never buttons. Revert: bump to v2 and make every older build read-only.
- **D2. Pinned blocks come first**, in pin order, then the selected graphic's block. Stable
  positions for the stable controls; the block that changes with the selection changes last.
  Revert: selected first.
- **D3 and D4** were the word and the authoring surface; both are owner decisions 10 and 11 now.
- **D5. The pick group's cap is eight options**; above it the control stays a button reading the
  field. Revert: the number.
- **D6. The phone draws the full stack** in its one scrolling column; no collapse. Revert: pinned
  blocks collapsed to their head row below 900px.
- **D7. A pinned graphic no longer in the pool draws nothing**, and its orphan entry is dropped
  by the next canonical write of the profile (a pin or an arrangement), without touching any other
  arrangement; the validator never refuses a write over it. A graphic re-added under the same name
  is pinned again by hand. Revert: keep the orphan until the profile is cleared.
- **D8. Only a pick group's field leaves the PREP boxes**, and only to the cue editor's ▸ Advanced
  disclosure, where it stays editable for the hidden-choice flow. Every other field, a score the
  +1 adjusts included, stays a box, because a typed correction is a prep gesture the operator still
  needs. PREP is today's cue-editor descriptor list with that one explicit exclusion; `setupFields`
  is the wizard's list and is not reused as the editor's filter. Update still sends the cue's full
  value set, so what Update airs does not change; a pick the machine refused is written nowhere, so
  it cannot reach air through a later Update. Revert: a read-out under ▸ Advanced.

## Maintainability plan

Behaviour lands in `src/control/` and the page composes it (the compiled rule
`components/playout-behaviour-production-page-lands-verb`). Planned files, not claims:

| Module | Owns | Tests |
|---|---|---|
| `src/control/liveControls.ts` (new, pure) | `liveSelection(graphic, cues, liveCue, selectedPlayout)` building a `VerbSelection` for one graphic; `liveBlocks(profile, pool, selected)` returning the ordered blocks with the selected mark and the dropped unknown names; `pickOptions(button, descriptors, pathEvents, allButtons)` for the one-press rule | `scripts/live-controls.test.mjs`, Node |
| `src/control/graphicVerbs.ts` | the instance check after every wait, the per-graphic press queue for every live press, the sent-figure base and write-on-acceptance | `scripts/graphic-verbs.test.mjs` with held promises |
| `src/model/profile.ts` | `pinnedGraphics` read, serialize (orphans dropped against the pool), validate | `scripts/control-profile.test.mjs` extended |
| `src/control/controlModel.ts` | `ArrangedControl.options` filled by the pick rule, so the three renderers draw the group inside the existing arrangement and cannot disagree on section, order, name, pin or More | the profile test, Node |
| `src/components/home/LiveControls.tsx` (new, props only) | the LIVE region: one `CueActions` per block under a block head with the pin toggle | `e2e/production-controls.spec.ts` |
| `src/components/home/CueActions.tsx` | gains the pick group row; otherwise unchanged | `e2e/live-actions-first.spec.ts` |
| `src/components/home/ProductionPage.tsx` | mounts `LiveControls` with the session's `air` and `aired` parts and the verbs; no new state beyond the profile write it already owns | the render-count spec `e2e/playout-air-contract.spec.ts` |
| `src/components/home/CueRundown.tsx` | the row menu item | `e2e/production-controls.spec.ts` |
| `src/components/home/CueEditor.tsx` | moves a pick group's field under ▸ Advanced (D8) | `e2e/quiz-live-consistency.spec.ts` |
| `src/components/HostedControlPage.tsx` | mounts the same `LiveControls` over its own live map | `e2e/configured/hosted-control-profile.spec.ts` |
| `src/control/productionControllerHtml.ts`, `src/export/showExport.ts` | the baked stack | the exported-controller case in `e2e/production-controls.spec.ts` |
| `cli/skill/noacg-graphic/references/contract.md`, `SKILL.md`, `cli/src/commands/inspect.ts`, `src/validation/validateTemplate.ts` | the rule, the PREP/LIVE print with its advisory line, the narrowed `controls-missing-live` finding | `cli/test/unit.test.mjs` with positive and negative fixtures, `cli/scripts/build-skill.mjs --check` |
| E6's files (`panelFeedback.ts`, `panelRelay.ts`, `companion-module/src/presets.ts`) | the graphic target kind and the pinned presets, in E6.1 and E6.2 | E6's own tests |

The LIVE stack subscribes to the `air` and `aired` parts and never to the draft (D12 of the
parent spec), so typing in PREP does not render the stack. ProductionPage grows by a mount, not
by behaviour.

## Preserved behaviour

For a production with no pins, every graphic's controls (events, labels, sections, legality and
the payload each press sends), the cue editor's fields and bands, the ⚡ block's height pinned by
`live-actions-first` for the duel score and the hockey scorebug, and the exported controller's
payload shapes are unchanged. What may change is chrome only: the LIVE region's framing, the
block head with its state chip and pin glyph, and the PREP head. A graphic that declares a pick
group (the classic answer boards, the imported quiz) changes exactly as AC-3 and AC-4 say,
profile or not, and nowhere else. TAKE on SPACE, the verb keys, per-cue trigger keys, the
two SPACE modes, the PVW/PGM pair, "nothing airs because it was typed", ARRANGE (pin, hide,
rename, More), Snap recovery, the ± live numbers' partial update and bound-field road, the
hosted staging buffer, the exported controller's offline relay, the panel lease and H0's verbs.
Update sends the full value set. No persisted identifier changes; no migration.

## Acceptance

### AC-1: A pinned graphic's live controls stay on screen whatever cue is selected
On the production page, pin the score banner from its block head or its row's menu; select a quiz
cue. The score block is still drawn, first in LIVE, with its ± and ⚡ controls enabled while the
banner is on air; the quiz block follows it. Unpin from either gesture and it leaves. Reload: the
pin is still there. Scenario: a journey in `e2e/production-controls.spec.ts` at 1600×900.

### AC-2: A press on a pinned block acts on that graphic's on-air cue, at once, never on the selection
With the quiz cue selected and the score banner pinned and live: +1 on the banner's block sends
one partial update to the banner carrying the moved field, mirrored into the BANNER's live cue,
with no Update; an ⚡ press fires the event on the banner's layer with the banner's on-air values;
a bound field patches the tree. The quiz's selected cue is untouched. A Take of another cue of the
banner during a held flush makes the press refuse with its reason and send nothing; two +1 presses
inside one held round trip write 8 then 9, never 8 twice; a refused or failed send writes nothing
into the cue; a correction typed into the banner's cue but not yet aired is not the next bump's
base. Scenario: Node `scripts/graphic-verbs.test.mjs` with held promises for targeting,
replacement, rapid presses, failed sends and writeback, and `scripts/live-controls.test.mjs` for
`liveSelection`, including a press on a pinned graphic that is off air (refused, nothing sent);
one journey in `e2e/production-controls.spec.ts` reading PROGRAM and `data-plays` for the partial
send; one configured case with two operator pages adjusting the same shared path and the same
unbound figure (`e2e/configured/hosted-control-profile.spec.ts` or a sibling).

### AC-3: Prep and live are two regions, derived from the declaration
For the quiz: Question, the answer texts and Correct answer are fields in PREP; Selected answer is
a pick group in LIVE and an editable box under ▸ Advanced; Reveal correct still carries Correct
answer. For the score tracker: names and figures are fields in PREP, ± and the per-team +1/−1 in
LIVE. The quiz-show boards, the podium, the competition boards, the audience boards, the clocks
and the imported switch, choice and survey recipes keep every field and every control they have
today, with no second pick group. A graphic with no declared controls and no number fields has
an empty LIVE region and today's editor. Scenario: a Node test of the derivation over the
declarations of every family named here; one browser check of PREP and LIVE placement in
`e2e/quiz-live-consistency.spec.ts` and `e2e/production-controls.spec.ts`.

### AC-4: The pick is one press on every answer board
On a classic answer board (qz01 to qz12) and an imported SVG quiz, one press of "B" under Select
answer selects B on PROGRAM and the B button reads active; pressing C moves it; Lock it in and
Reveal correct are unchanged, Lock optional where the recipe says so. The hidden-choice flow still
works: a letter typed under ▸ Advanced, Lock it in from the question, Reveal choice, with nothing
painted before the reveal. The podium's Spotlight, whose payload is a number, keeps its button and
field. On a quiz show board (qz13 to qz15) nothing changes. Scenario: Node tests of `pickOptions`
over the declarations (the default-path exclusion, the option cap, a field another control
already sets); `e2e/quiz-live-consistency.spec.ts` extended with a classic board and an imported
quiz, the hidden-choice walk and the optional lock.

### AC-5: The pin travels with the production
Publish a production with a pinned graphic: the hosted control page draws the same LIVE stack and
its presses go through the same command log; the exported production controller draws the stack
baked at export and its presses carry the same payload shape; a second production-page tab on
the same production shows the pin after the record syncs; a value staged on the hosted page but
not yet aired does not become a pinned press's base on either page. Scenario:
`e2e/configured/hosted-control-profile.spec.ts`, the exported-controller case of
`e2e/production-controls.spec.ts`, `e2e/cross-tab.spec.ts`.

### AC-6: Removal, off-air and foreign-version cases say what they do
Remove a pinned graphic from the pool: no block, no error, no press possible; the next pin or
arrangement write drops the orphan entry and leaves every other arrangement as it was; the
validator refuses nothing over it. A pinned graphic off air draws greyed with "not on air". A
profile written by a newer build renders the generated page and refuses pin edits with the
existing read-only wording. Scenario: Node `scripts/control-profile.test.mjs` (normalization,
validation, the orphan drop, an unknown reference) and `scripts/live-controls.test.mjs`; one
journey case for the removal and the off-air block.

### AC-7: A production with no pins keeps its behaviour, payloads and geometry
For a profile-less production whose graphics declare no pick group (the score tracker, a lower
third, the duel score, the hockey scorebug): every control's event, label, section and legality,
the payload each press sends, the cue editor's fields and bands, and the ⚡ block's measured height
at 1600×900 are unchanged; the exported controller's generated control fragment and its payload
shapes are unchanged, with only the LIVE and PREP chrome allowed to differ. For every production
the render counts of `e2e/playout-air-contract.spec.ts` hold and typing in PREP renders no live
block. A profile-less quiz production changes only by the pick group and the ▸ Advanced move, as
AC-3 and AC-4 state. Scenario: the existing geometry, payload and render-count specs green on the
integrated tree; a Node comparison of the generated controls and payloads before and after,
recorded in evidence with the chrome difference named. Whole-file byte equality is not the gate.

### AC-8: The deck reaches a pinned graphic's live controls (through E6)
Delivered by E6.1 and E6.2, requalified in H0.2: a native action targets its pool graphic and runs
through the same dispatcher as the block's button; E6.2's presets list the pinned graphics' live
controls, pick options included, with E6's feedback; a press while the graphic is off air, on a
replaced instance, with a stale lease or an unknown capability is refused with E6's reason, and
unpinning the graphic refuses nothing: a saved deck button keeps working while its capability is
valid. This spec records the requirement; E6's ledger records the pass. Scenario: E6's `e2e/configured/panel-graphic-actions.spec.ts` and module tests.

### AC-9: An agent proposes live controls by itself
The skill's contract names the rule (a value that changes on air gets a declared control; a value
typed before air is a prep field), and `noacg inspect` prints the derived panel as PREP and LIVE,
with one advisory line when LIVE holds nothing but the transport verbs. `noacg validate` reports
`controls-missing-live` as a non-blocking finding only on evidence of an unmet declared live
operation: an operator arrow in the machine with no `controls` entry, or a `set`/`adjust` naming a
field the graphic does not have. It never flags a number or few-option field merely for having
no control (a quiz show's Answers shown and a clock's duration are preparation by design, and
numbers already have their derived stepper). Whether an agent then proposes sensible controls is
judged in a novel-brief trial, not by a text test. Scenario: `cli/test/unit.test.mjs` with
positive fixtures (an arrow without a control) and negative ones (Answers shown, a clock
duration, a number with its stepper) and the PREP/LIVE print; `cli/scripts/build-skill.mjs
--check` passes; one novel-brief graphic in the next harness round inspected for its proposed
live controls, recorded as evidence.

### AC-10: The phone keeps the stack usable
At 375×812 the LIVE stack with two pinned graphics scrolls in the one column, every button is at
least 40px tall, no horizontal scroll appears, and the TAKE · Next · Out bar stays fixed.
Scenario: a viewport case in `e2e/hosted-control.spec.ts` or `e2e/production-controls.spec.ts`.

### AC-11: The two-graphic show runs from one screen, timed
The 2026-10-23 case: a quiz board and a score banner in one production. From a fresh page an
operator pins the banner, then for one question does pick, lock, reveal and +1 to the right
competitor without selecting another cue; the presses, the time between them, whether the task
completed, every error and every cue switch are recorded. A task of a trial kit (owner's decision D of 2026-10-20: kits never gate), and the dress
rehearsal's case in S. Scenario: `evidence/trial-kit.md` and the S receipt.

## Proposed placement in the production-page run

A proposal for the owner and the coordinator; `extensions.md` and the run's ledger are not
edited by this document.

- **One new row, "L1", between row 32 (E7.2b) and row 33 (E1.1)**, environment CA, gating
  AC-1 to AC-7, AC-9 and AC-10. Authority: this spec, once agreed.
- **Depends on** the baseline rows already passed: 14 (phase 3, `CueActions.tsx`), 22 (phase 12,
  the verbs, dispatch and view the block presses through), 23 (13b, the draft part the stack must
  not subscribe to) and 25 (phase 14). Row 25 passed on `dda88db`, so these hold.
- **Before E1.1 and E6.1** so that E6.1 types its native target against `liveSelection` and E2.1
  retains pinned graphics with ARRANGE; **after E7.2b** so the cue editor's read-only candidate
  fields (E7) are settled before the editor's prep rule lands. E4 and E5 do not touch these seams,
  so the row could also sit earlier, but the owner put the data rows first.
- **Native press safety is settled in L1**, not deferred: the instance check and the increment
  base of "What a press does" are L1's, so E6 inherits them.
- **Child obligations the coordinator reconciles when admitting L1:** E1 keeps the native/typed
  boundary (a pinned native block never carries a typed envelope); E2 explicitly tests pinned
  program-instance controls, their argument forms and instance replacement; E6 retains its
  snapshot, lease and capability checks and treats pins as preset material only.
- **E6.1 and E6.2** (rows 34 and 42) take AC-8 as part of their own gating text: the graphic
  target kind in E6.1, the pinned presets in E6.2's module and its trial kit's custom-button task.
- **E8.1a** adds the cross-feature case (a pinned foreign graphic from E3, a pinned graphic bound
  to a source from C1), **E8.2's kit** and **S's dress rehearsal** take AC-11.
- **File fence** for L1: the modules in "Maintainability plan" except E6's; the row's receipt
  records the exact list against the main of its day. No parallel writer on the page.
- **Rollback**: a pinned list is ignored on read and the generated page returns; no migration, no
  wire change.

## Second opinion, 2026-10-24: adopt with changes

An independent read-only review (run from a fresh session, two in-memory verb probes) agreed
the pinning design and the placement and found seven problems; this revision takes them all:

| Finding | What changed here |
|---|---|
| F1 A delayed press can control a replacement cue | "What a press does": the instance captured at the press and checked after every wait |
| F2 Queue reuse does not establish correct increments or writeback | the per-graphic queue for every live press, the sent-figure base, write-on-acceptance; AC-2, AC-5 |
| F3 Removing Selected answer removes the hidden-choice format | D8: the pick field moves under ▸ Advanced, editable; AC-3, AC-4 |
| F4 The derivation lacks the default path and the fourth bucket breaks ARRANGE precedence | `pickOptions` takes the declaration with `pathEvents`; the group is drawn inside the existing `ArrangedControl` |
| F5 Unpinning revokes a deck capability | pins are preset material only; AC-8 |
| F6 AC-7 contradicts the LIVE/PREP chrome | AC-7 and "Preserved behaviour" compare behaviour, payloads and geometry, not bytes |
| F7 The validate finding mistakes preparation for a missing control | AC-9: the finding fires only on an unmet declared live operation; an advisory line in `inspect` |

Two of these narrow an owner decision: decision 5's pick now keeps the field under ▸ Advanced
(F3), and decision 6's validate hint is narrower than first described (F7). Both are recorded
here for the owner to overturn.

## Open decisions for the owner

None open. The eleven questions of 2026-10-24 are answered above and the owner agreed the whole
the same day; D1 to D8 are implementation choices he may overturn later without reopening the
design. What waits is the coordinator's admission of the proposed row.

## Evidence

None yet. The row's receipts land under `evidence/` as the programme's procedure requires.
