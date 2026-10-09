# How NoaCG operates a graphic (the control contract)

NoaCG derives every operator surface - the studio's control panel, the production page's cue
controls, the hosted control page, the exported `controlpanel.html` - from the graphic itself. No
category or template kind is ever consulted; a graphic NoaCG has never seen gets the panel its own
contract describes. `noacg inspect <dir>` prints exactly that panel.

## What becomes what

| In the graphic | On the operator panel |
|---|---|
| a `DataField` (`f0…`) | one INPUT - text, a line list (textarea), a number stepper, an image picker, a dropdown, a toggle, a colour; `hidden` fields show in the studio's Data panel, not on the operator page |
| the lifecycle | ⟳ Take (`play`), ✎ Update (`update`), » Next (`next`), ■ Out (`stop`), ■■ All out |
| an operator EVENT of the state machine (`NOACG_ANIM.machine`) | one ⚡ BUTTON, labelled/grouped by `machine.controls`; a payload names the fields the press sends, an adjust names a number field the press moves by a delta (a scoreboard's Goal A sends the event AND scoreA +1 together); buttons grey when the machine's current state has no arrow for that event |
| the machine's states | a state chip, a snap-to-state recovery picker |

A graphic with no explicit machine (most) gets the implicit one: its fields, the lifecycle verbs,
no ⚡ buttons - the correct, honest surface for a field-driven graphic. A graphic with actions
takes its machine from its TYPE (`noacg scaffold --type …`), or authors one under the three gates
(`references/contract.md` §5), and the machine travels INSIDE the template, so an exported control
page keeps its buttons with no registry to ask.

Rules that follow: **data updates never cause transitions** (typing a new score repaints a number
and moves nothing); **a state's WORD is a field, the state is not** (the machine says "live", the
broadcaster says what "live" is called); **every state is enterable by transition or by SNAP**;
reset is two operations (snap every group to its initial; reset data).

## Two markup conventions the control layer reads off your html

- **A match clock**: an element with class `<prefix>-clock` carrying `data-count="up"|"down"`
  and `data-start="MM:SS"`, driven by a clock field - the control layer offers clock recovery and
  re-seeds from the field (`src/control/matchClockWire.ts`). Only if your graphic has a running clock.
- **Two-sided boards**: field TITLES carrying an A/B side token ("Team A", "Score B") let the
  production page group the cue editor by side.

## The OGraf contract (the same surface, in the open standard's words)

When your graphic is read as an OGraf Graphic, the manifest states the same contract: `schema`
(one property per data key - the public state model), `customActions` (the operator's buttons,
each with an id, a name and a payload schema), `stepCount` (`0` plays in and out by itself, `1` one
step, `>1` multi-step, `-1` dynamic). NoaCG's control layer reads a THIRD-PARTY manifest into the
same inputs and buttons (`noacg inspect` on any OGraf package), and the Web Component interface
maps onto the lifecycle: `load({data})` -> update, `playAction` -> play/next, `updateAction` ->
update, `customAction({id, payload})` -> the machine event, `stopAction` -> stop. OGraf has no
state graph, so a third-party Graphic's buttons are all offered live; the Graphic decides.
