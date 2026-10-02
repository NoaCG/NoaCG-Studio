# b1-news-D builder report (condensed; the builder's own words where quoted)

Opus subagent, 137k tokens, 33 tool calls, 4.1 min. Package `pu-lower-third` from
`scaffold --type lower-third --design neutral`, a third field added.

- Look, by its account: square-cornered deep navy panel, cold-blue full-height rule on the left,
  Inter; name 52px semi-bold white, title 30px grey-blue, location in tracked caps under a thin
  rule; panel width follows the text, a long title wraps and grows the panel upward. Calm motion:
  rule grows, panel wipes, lines rise in sequence.
- Fields: Name, Title or role, Location (empty by default; empty collapses the line and its rule).
  No buttons beyond Take / Update / Next / Out.
- Validate: 0 errors, 0 warnings; zip validates the same.
- Friction it reported: no lower-third type with a location line (extended the type rather than
  `--fields`, unsure which is meant); sample-name defaults versus the skill's "safe sample or empty"
  rule; `screenshot --at 0.6` read as 20 ms (needs `0.6s`, units undocumented); the stress frame
  fills the empty location so it never shows the collapsed layout. Two frictions were this
  benchmark's setup, not the product: the machine's command guard refused `--data` values with ä/ö
  after the `export` prefix, and the first `noacg.cmd` shim had a broken path (fixed after this
  cell; later cells used Bash anyway).
