# Keys on a behaviour graphic (#1982)

An imported graphic with a behaviour (score, quiz, vote, countdown, credits and the rest) carries a
recipe: a state machine, calls on its cues, and a paint table (`NOACG_BEHAVIOUR`) that a shipped
runtime reads on air. Until this change the editor refused every key on such a graphic
(`sequenceAuthoringReason`, the R1.1c rule "calls/machine ownership ... refuse"), so a layer of a
behaviour graphic was a field and a placeable layer but never an animation target.

This note says which parts of a behaviour graphic the recipe owns, which a user key may own, and
how the editor proves the difference. The rule lives in `src/blocks/behaviourKeys.ts`; the editor
asks it through `src/blocks/editorAnimation.ts`.

## What a recipe writes on air

Measured on main at `c8708e12` from the wizard's output for the four-team scoreboard, the quiz
board and both credits fixtures, and read from `behaviourRuntime.ts` and `creditsRoll.ts`:

| Writer | When | What it writes |
| --- | --- | --- |
| `noacgRepaint` (every recipe state, the entrance cue and every recipe cue) | state entry, data write, clock tick | a look's `-on` class (display), a pop (`scale` tween) on a look that lands, a gauge's `width`, `d` or `scaleX`, a readout's text and `fill`, a place rule's `transform` attribute on a row and the field its role compiled to |
| clock engines (`noacgClockReset`; the match clock's `startMatchClock`, `stopMatchClock`, `resetMatchClock`; the countdown clock's `startClock`, `stopClock`, which `svg.ts` adds for a clock field) | entrance, Out, clock states | the clock field's text, classes on the graphic root |
| credits roll (`noacgCreditsRoll`, `stopCreditsRoll`) | Rolling, Out | rebuilds the credits text into a measured window, moves it by its measured height |
| the machine's off-path and parallel states | operator events | only the calls above; their own timelines carry no layer keys |
| the wizard's entrance preset | On air, Out | keys on `.imported-design-box`: ordinary keys, not the recipe's |

So the recipe owns a small, known set of (layer, property) pairs. Everything else on the artwork is
written by nobody but the user's own keys.

## Rules

Observable lines; `scripts/behaviour-keys.test.mjs` checks the pure rule and
`e2e/editor-fidelity-trim.spec.ts` the editor, playback, save, reopen and packages.

- **K1 The sequence opens only where every writer is known.** Keys are authorable on a graphic
  with a machine or calls only when it carries the behaviour paint runtime and a readable
  `NOACG_BEHAVIOUR` table, every call on every cue and machine state is one of exactly
  `noacgRepaint`, `noacgClockReset`, `startMatchClock`, `stopMatchClock`, `resetMatchClock`,
  `startClock` or `stopClock` (`KNOWN_CALLS`, pinned to the builders' names by the unit test), no cue has measured motion (`dynamics`) or loops, and no machine state outside the
  default path carries layer keys. Otherwise every key is refused whole, as before, and nothing
  changes. A catalog graphic's machine is unchanged by this rule.
- **K2 The credits roll keeps the whole sequence.** It rebuilds and measures the text it moves, so
  a key anywhere could change what it measures. Keys stay refused with a reason that names the
  credits roll.
- **K3 Keys belong to the timeline's own cues.** A key goes on a default-path cue (On air, a
  recipe cue such as Reveal, Out) and plays when that cue plays, as on any graphic. The machine's
  other states and its parallel groups are never written. Cue structure stays the recipe's: adding
  a cue, Set Out, layer bars (move, trim) and group pivots stay refused on a behaviour graphic.
- **K4 A look is the recipe's.** A layer the recipe shows and hides (stamped with a role a look
  rule names) takes no key on any property, with a reason that says the behaviour shows and hides
  it.
- **K5 Measured and moved geometry is the recipe's.** Only Opacity keys are allowed (every other
  track: position, scale, rotation, skew, a transform string, a filter, a clip is refused) on a
  gauge, on a row a place rule moves (its stamped layers and the field its role compiled to), on
  a place rule's slot anchor, and, where the recipe draws its own look for a row the designer left
  undrawn, on that look's anchor field and the group holding it (the runtime measures the anchor's
  fit panel, usually a sibling); and on any layer inside one of these or containing one inside the
  artwork. Rows and slot anchors are measured through every transform above them, so containment
  is exactly right for them; a gauge is measured in its own frame and needs less, but one rule is
  kept for all.
- **K6 Everything else is the user's.** Fields, readouts (the recipe writes only their text and
  ink), plates, groups and the box take keys on every property.
- **K7 An edit proves it stayed inside the user's part.** After any key edit (set, remove, turn
  off, move, ease) the data may differ from before only in tracks of layers and properties K4 to
  K6 leave free, on default-path cues, plus Out's own length where a key past its end lengthens
  it. Calls, the machine, the paint table, other cue lengths, spans, reveals and hides are byte
  for byte unchanged, and so are machine controls, measured motion, loops and the `NOACG_BEHAVIOUR`
  table outside the region. Freedom is checked on every element a changed track's selector
  matches. Otherwise the edit is refused whole and the document is unchanged.
- **K8 On air both run.** A keyed behaviour graphic plays the user's keys on their cue and the
  recipe's repaint, looks and pops as before; save and reopen keep both; the OGraf and SPX packages
  carry the key in `NOACG_ANIM`. A cue the machine re-enters by an operator edge (the quiz's
  judge and next arrows into Reveal, the puzzle's New into the entrance) replays its keys, as any
  cue entry does; snap settles the cues' keys with callbacks off, then runs the target state's
  calls, so the repaint lands after them.

## What changes for row 26

Row 26 of run #1850 pinned "a key on `#f2` of the four-team scoreboard is refused whole". `#f2`
is a score field the recipe only writes text into, so under K6 it now takes keys. The pinned
journey changes to: the key on `#f2` is accepted, the flash looks still paint on air, and the
refusal stays pinned on a look layer (`team.flash`) and on the whole credits sequence.

## Product choices this leaves open

The rule is narrow on purpose. Two choices remain the owner's:

1. **Keys on a machine moment** (motion when a quiz answer is picked, a team scores). Today a key
   belongs only to the timeline's cues.
   - (a) Keep keys on cues only (this change). Simple, and what every playout target already
     plays.
   - (b) Allow keys on a recipe state's own timeline (the quiz's Selected, the score's flag
     Shown), with K4 and K5 still applying. Needs a way to pick that state on the timeline.
   - (c) Keys on a parallel group's states as well (the score's flag and result groups).
2. **A user key over a recipe look** (fading a flash in rather than having it cut on). An Opacity
   key on a look would be technically safe (the recipe only switches it with a class and its pop
   only scales it), but a key on a cue would play when the cue plays, not when the look lands. So
   the real choice is a new trigger, not a lifted refusal:
   - (a) Keep looks refused (this change).
   - (b) A look entrance style per look (cut, fade, pop), set once on the look, that the runtime
     plays when it lands. The design consult recommends this one: it is what an operator expects
     every time the flash lands, and it never asks a user to tell cue keys from state landings.
   - (c) Keys on the look that play when it lands, which is 1(b) for looks. Not recommended: it
     exposes that cue keys and state landings run on different clocks.

## User-facing copy

Reviewed by the design-consult agent: one cause sentence and one consequence sentence ending in
"is preserved", never the word "behaviour". A look layer and the credits roll replace the whole
Transform panel with the reason (nothing on it applies); a layer whose geometry the recipe owns
does the same, and its Opacity key buttons stay in the same inspector beside it.
