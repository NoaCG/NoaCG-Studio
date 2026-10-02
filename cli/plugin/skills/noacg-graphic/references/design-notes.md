# NoaCG's design guidelines (OPT-IN - off by default)

Read and follow this only when the switch is on: the user asks for NoaCG's design guidelines or
the NoaCG look, passes `--guidelines` to `/noacg:graphic`, or their project instructions
(`CLAUDE.md`, `AGENTS.md`) contain `NoaCG design guidelines: on`. Otherwise the look is yours and
this file stays closed. These are guard rails for users who want them, the rules NoaCG's own
catalog designs follow; nothing here is checked by the validator beyond what `validator.md` lists.

- **The bar.** Every template should look like a paid MotionArray / Envato Elements asset, not a
  tutorial demo. Restraint where the content is serious; distinctiveness without decoration.
- **Reason from the brief, not from a house look.** A news strap, an esports ranking, an election
  result, a financial ticker, an entertainment card and a children's programme each earn
  DIFFERENT answers - density, weight, colour energy, motion speed. "Same layout, different
  colours" is a named failure.
- **Typography.** Name lines 44-92px at 600-800 weight (the upper half for flagship and
  entertainment shows, news straps in the lower half); heading-to-secondary ratio about
  1.8-2.2 : 1. Secondary text a viewer must read - a role line, "ON AIR", a sponsor wordmark - is
  at least 28px, and text read at a glance is weight 500 or heavier. Kickers and small labels
  that only introduce the line beside them ("HOSTED BY" before a name, a category tag) are 20-22px
  with 0.08-0.2em tracking. Nothing below 20px at 1080p (16px for a persistent corner
  bug). Thin grey on black does not read on air. Live numbers set in a face with even digits
  (`font-variant-numeric: tabular-nums`, lining figures) so a score does not jitter.
- **Colour.** One accent, used once and sharply; text at least 3.25:1 against what it actually
  sits on (a floor, not a target); secondary >= 60% white on dark panels; never accent text on an
  accent fill.
- **Shape and placement.** A strap spends WIDTH, never height; a lower third hugs its text; a
  board (a card, a score, a notice that is up all evening) keeps a fixed stage and wraps/shrinks
  inside it. 119-120px from the frame edge is the catalog's whole safe-area inset. A mark inside
  a container is centred in it; a mark between an accent line and text is optically balanced,
  not crowded; a package's mark is on every piece or none.
- **Motion.** Entrances with Out-direction eases (`power2.out`, `power3.out`, `expo.out`;
  `back.out` for a snappy pop); exits In-direction, 0.3-0.5 s, and FASTER than the entrance;
  staggers 60-250 ms; linear only for continuous travel (tickers, rolls, timers); bounce/elastic
  only when asked for playful. Entrance length follows the brief: straps, boards and alerts
  0.5-1.4 s in total (stream overlays at the low end, 1.0-1.4 s reads as deliberate broadcast
  pacing); a ceremonial title or opener may build longer when its tone asks for it, because the
  1.4 s ceiling was measured on straps and boards. Transform/opacity only - 60 fps is the
  contract. Never skew/rotate the element a timeline tweens; paint it on a `::before` layer.
- **Code.** The simplest clear code: direct HTML/CSS/JS, descriptive names, short comments that
  say WHY, rich but commented CSS, no frameworks, no build steps.

Families the catalog ships (for a graphic meant to sit beside them): `minimal` (hairline,
whitespace, type does the talking), `sport` (slabs, skew on a painted layer, volt accents),
`glass` (frosted panels, soft blur, rounded), `noacg` (the house look: void panels, one amber
accent, mono kicker), `editorial` (masthead serif, rules, print rhythm), `cinematic`.
