# What each agent reported (condensed from its SESSION LOG)

Each session ended with a SESSION LOG: the noacg commands it ran and every point where the skill,
the CLI or the contract confused it, made it guess, or pushed its design. These are the agents'
own reports, condensed; the README checks each one that a finding rests on against a frame.

## Brief 1, news lower third (7.7 min, 11 commands, 2 validate rounds)

- `noacg --help` exited 2.
- No guidance for an optional line that collapses when empty; invented a class toggle in `update()`.
- The `lower-third` type has name and title only; unclear whether adding a field to a type scaffold
  is allowed (validate accepted it).
- §4 describes a plain-GSAP ANIMATION region; the scaffold already holds converted NOACG_ANIM data
  beside a ~1100-line interpreter. Edited the data; easy to touch the interpreter by mistake.
- "Zip the folder": folder or contents? Zipped contents, confirmed with `validate <zip>`.
- FONT_LICENSES.md lists 17 fonts, only `inter.woff2` ships; "in practice I was steered to Inter".
- Screenshots render transparent on white; could not judge the plate against dark video.
- A wrapped title leaves the plate at full width; the validator did not flag it; accepted.
- Unclear what language field titles should use; unclear whether a default is a sample or empty.

## Brief 2, hockey scorebug (20.5 min, ~25 commands, 4 validate rounds)

- The neutral scorebug scaffold draws colour fields as hex text, puts f5 in a span beside an empty
  `.scoreboard-clock`, and has football defaults; the working markup came from `sb05`.
- `bench-field-unpainted` on f5 is a false positive the catalog design shares; not documented.
- A `bench-stress` error on `#f5` did not show in `stress.png`; the message named the clock, the cause
  was long team names; cost one round.
- `screenshot --state` offers only off, onair, stress: power play, intermission and final needed a
  forked copy and a hand-written headless-Chrome harness.
- State `calls` fire on the first GSAP tick, not at dispatch; undocumented.
- §5d and §5b(5) advise against button-only states and for reported fields; the scorebug type ignores
  both; followed the type.
- No way to express "two minutes of game time"; the runtime dispatches `ppEnd` itself; unclear if a
  graphic may dispatch its own events.
- Keeping Goal enabled in every state needed a one-state self-loop group copied from the scoreboard.
- "Language labels are fields" added three word fields that clutter the operator page.
- `doctor`'s "skill 0.3.4 vs CLI 0.7.0" was confusing.

## Brief 3, gala title (6.8 min, ~30 commands incl. 16 probe scaffolds, 2 validate rounds)

- No way to get a serif: scaffolded 16 catalog designs blind until `card85` carried Playfair Display.
- The scaffold message reads as if the `graphic` prefix is fixed; renaming meant editing
  `NOACG_ANIM.root` and every layer selector by hand.
- Unclear which animation form is expected when starting from a scaffold.
- The ~24px preference pushed 20px tracked caps up "more than I would have".
- The 0.5-1.4 s entrance guidance compressed the ~1.9 s ceremonial build it wanted.
- "Normalized to the package layout" did not say what changed.
- No Windows-friendly zip route; placeholder versus sample default unclear.

## Brief 4, pub quiz (13.5 min, 17 commands, 4 validate rounds)

- No type fit: both quiz types assume a contestant; removing pick machinery and renumbering fields in
  a ~100 KB template.js by hand was error-prone.
- A second machine group is undocumented; learned from the interpreter how `play()`, initial states
  and snap treat it.
- "Data updates never cause transitions" versus §5b.5's reported fields: could not square them for
  the timer, so the timer is NoaCG-buttons-only.
- A clean run reports nothing about how many arrows the bench pressed.
- Reveal and timer frames cannot be rendered by the CLI; built a CDP harness.
- Stage fit shrank a stressed question to about 34px while legibility passed; undocumented.
- The scaffold CSS hard-codes colours the contract says not to; unclear whether extra `:root`
  variables reach the Style panel.
- `scaffold --help` prints global help; `--help` exits 2; the stale note reads like an error; chassis
  comments kept "Sticker Quiz" after `--name "Pub Quiz"`.
- Starting from a catalog design drew it toward that design's look.
