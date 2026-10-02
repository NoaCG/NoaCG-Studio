# b2-hockey-D builder report (condensed)

Opus subagent, 220k tokens, 66 tool calls, 13.3 min. Package `hockey-scorebug` from
`scaffold --type scorebug --design neutral`, with markup ideas from `sb06` (scaffolded for
reference, then deleted).

- Look, by its account: one compact dark bar top-left inside the safe area; club-colour edge per
  team, abbreviation, score cell; period cell above the 20:00 clock; a power-play tab drops under
  the bar with team, POWER PLAY and its own clock; END 1ST / FINAL / FINAL OT words.
- Operator surface: 12 actions (clock start/stop/reset, goal A/B, power play A/B/end, next
  period, intermission, back, final); inputs Team A/B, scores, period number, clock, two colours;
  period names, END, FINAL, POWER PLAY and the penalty length as hidden word sources.
- Behaviour it checked with `screenshot --event --at`: power-play clock runs only with the game
  clock, ends at 0:00, on a power-play goal (not a shorthanded one), at Final.
- Validate: 0 errors, 4 warnings (three 20px labels it kept for a compact bug; the known
  `bench-field-unpainted` false positive on the clock, which the stock `sb06` design also raises).
- Friction it reported: the neutral scorebug scaffold puts the clock field in a plain span beside
  an empty `.scoreboard-clock`, so a design from the neutral spine ships a clock that never ticks;
  hit the bench's 24-arrow ceiling exactly with no readout of the count; `--at 2` read as 20 ms;
  the screenshot note "ppA did not move the machine" was wrong for a state that ended itself; a
  re-take mid-game desyncs the clock group (Take resets every group).
