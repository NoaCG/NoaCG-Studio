# b6-results-G builder report (condensed)

Opus subagent, 213k tokens, 66 tool calls, 11.3 min. Opened `design-notes.md`, not
`critique.md`. Package `ski-results` from `scaffold --fields`, typeless.

- What it says the guidelines set: the 120px inset (a fixed stage at top 120, left 180); one
  accent used once (gold on the winner's rank tile); 1.35 s entrance with a 70 ms row stagger and
  a 0.5 s exit; race name 76px to names 40px; a 28px floor (long text steps down to 28px, then
  wraps); tabular digits; transform and opacity animation only. One departure: the validator's
  24px preference beat the guideline's 20-22px kicker, so the kicker is 24px.
- Look, by its account: a semi-transparent deep navy backdrop over the whole frame; competition
  line above the race name; clubs and gaps in dimmed white; rows slide in one after another.
- Operator surface: Race and Results (`Name | Club | Time` per line); the competition line a
  hidden word source. No buttons. Ranks, ties, gaps, DNF/DSQ/DNS and Finnish time styles worked
  out by the graphic.
- Validate: 0 errors, 0 warnings.
- Friction it reported: `scaffold --fields` rejects `hidden` (as b3-D); validator (24px) and
  guidelines (20-22px kicker) disagree; the stress frame never stresses a lines field yet reports
  "Survives text twice as long PASS"; no way to pass multi-line `--data` (shell guard) or read
  data from a file; `--at` units; validate "normalized" `js/template.js` without saying what
  changed; snap reset clears inline styles (contract mentions it only for holders); the
  `noacgTextOverflow()` hook is documented only in a scaffold comment.
