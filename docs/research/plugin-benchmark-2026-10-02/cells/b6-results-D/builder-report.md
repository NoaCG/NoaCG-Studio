# b6-results-D builder report (condensed)

Opus subagent, 214k tokens, 74 tool calls, 16.5 min. Package `ski-result-board` from
`scaffold --fields`; Oswald and Saira copied out of a throwaway `standings` scaffold.

- Look, by its account: a full-frame dark wash, the race name in large condensed type, an icy
  blue accent rule, alternating navy rows, gold/silver/bronze rank tiles for 1-3, tabular digits.
  On Take the heading rises, the rule wipes, the rows cascade about 0.11 s apart.
- Operator surface: Race, Label (live, TULOKSET or EPÄVIRALLISET TULOKSET), Results as one
  `Name | Club | Time` line per competitor, up to 8; ranks and gaps worked out from the times;
  DNF/DSQ/DNS shown without rank or gap; fewer lines make a shorter board. Event name as a hidden
  word source. No buttons.
- Validate: 0 errors, 0 warnings.
- Friction it reported: once, `validate` rewrote its hand-written definition to
  `"DataFields": []` under only a warning (could not reproduce; silent data loss if real);
  `standings` and `timing-tower` have no neutral scaffold and bring unwanted buttons, so it went
  typeless and hand-wrote row rendering, time parsing and gaps; the variable-row cascade needs the
  `dynamics` build entry, found only in scaffold comments and the `standings` code; fonts again;
  the stress frame does not lengthen rows drawn from a lines field; `--at` units; a sample-athlete
  default airs if nobody types over it.
