# b2-hockey-G builder report (condensed)

Opus subagent, 311k tokens, 117 tool calls, 23.6 min. Opened `design-notes.md` (and
`control.md`), not `critique.md`. Package `hockey-scorebug` from `scaffold --type scorebug
--design neutral`, with `sb05` scaffolded as a reference and deleted.

- What it says the guidelines changed: placed on the 120px safe-area inset; one accent colour
  (amber, POWER PLAY only); tabular digits on scores and clocks; long names capped with an
  ellipsis. It cites no type sizes or motion timings in its report.
- Look, by its account: one dark navy bar, team colour stripe, code and score per team; period
  word beside the 20:00 clock; a power-play strip slides out under the bar with the team's colour
  chip, code, POWER PLAY and its 2:00 clock; END 2ND / FINAL / FINAL OT.
- Operator surface: 12 actions (clock start/stop/reset, goal A/B, power play A/B/end, end of
  period, next period, resume play, final); inputs Team A/B, scores, Period (number), Clock, two
  colours; words and power-play length as hidden data sources.
- Validate: 0 errors, 2 warnings (`bench-field-unpainted` on Period and Clock, both repainted by
  the runtime).
- Friction it reported: the neutral scorebug scaffold's clock and hex-text colours (as b2-D); a
  `bench-stress` error naming #f4/#f5 with no detail, found by bisecting (bench stress values are
  longer than the stress frame shows); a re-take resets every group, so a running power play is
  cleared; action payloads bypass `update()`; the control panel re-stamps the clock to the
  exported 20:00, found by reading `controlpanel.html`; `inspect` does not print `set` payloads;
  `--at` units; once wrote a `validate --json` file one folder above its working folder (deleted).
