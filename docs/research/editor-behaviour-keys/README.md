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
| clock engine (`noacgClockReset`, `startMatchClock`, `stopMatchClock`, `resetMatchClock`) | entrance, clock states | the clock field's text, classes on the graphic root |
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
  `NOACG_BEHAVIOUR` table, every call on every cue and machine state is `noacgRepaint` or a clock
  engine call, no cue has measured motion (`dynamics`) or loops, and no machine state outside the
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
- **K5 Measured and moved geometry is the recipe's.** Position, scale and rotation keys are
  refused on a gauge, on a row a place rule moves (its stamped layers and the field its role
  compiled to), on a place rule's slot anchor, and on the anchor of a look the recipe draws for a
  row the designer left undrawn; and on any layer inside one of these or containing one inside
  the artwork, because a transform there changes what the recipe measures. Opacity stays free on
  them.
- **K6 Everything else is the user's.** Fields, readouts (the recipe writes only their text and
  ink), plates, groups and the box take keys on every property.
- **K7 An edit proves it stayed inside the user's part.** After any key edit (set, remove, turn
  off, move, ease) the data may differ from before only in tracks of layers and properties K4 to
  K6 leave free, on default-path cues, plus Out's own length where a key past its end lengthens
  it. Calls, the machine, the paint table, other cue lengths, spans, reveals and hides are byte
  for byte unchanged; otherwise the edit is refused whole and the document is unchanged.
- **K8 On air both run.** A keyed behaviour graphic plays the user's keys on their cue and the
  recipe's repaint, looks and pops as before; save and reopen keep both; the OGraf and SPX packages
  carry the key in `NOACG_ANIM`.

## Product choices this leaves open

The rule is narrow on purpose. Two choices remain the owner's, with alternatives in the PR:

1. **Keys on a machine moment** (motion when a quiz answer is picked, a team scores): today a key
   belongs only to the timeline's cues.
2. **A user key over a recipe look or measured geometry** (fading a flash in rather than having it
   cut on): today the recipe's look wins and the key is refused.
