---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "`noacg types` prints 67 rows up to 354 characters wide, so the second verb a stranger runs
  arrives as wrapped mush in any terminal narrower than four screens"
size: small
touches: cli/src/commands/types.ts, cli/src/output.ts
---
# `noacg types` prints a table no terminal can show

**Filed:** 2026-09-09. **Source:** the time-to-air walk (docs/AGENT_CLI.md, "Time to air,
measured").

## Why

`types` is the second command in `cli/README.md`'s Use block and the first one that prints
anything a person has to read. Measured on the walk: 67 type rows, the widest line **354
characters**, several over 300. A terminal is 80 to 120 columns wide, so every long row wraps two
or three times and the columns stop lining up - the reader cannot tell where `fields` ends and
`events` begins, which is the entire information the table carries.

It is not broken for the agent path: `--json` is exact and that is what an agent reads. It is
broken for the person, and the person is the one deciding in the first minute whether this tool
is any good. That first minute is the whole subject of the walk.

## What it would take

`table()` in `cli/src/output.ts` pads every column to the widest cell and joins - no width
awareness anywhere, and it is shared with `inspect`, whose tables are narrow and fine. So the fix
belongs in `types`, not in the shared helper:

- read `process.stdout.columns` (fall back to ~100 when piped);
- give `type`, `events` and `neutral` their natural widths, then let `fields` and `designs` take
  what is left, eliding with `…` and a count (`+7 more`);
- say once, under the table, that `--json` carries the full lists.

The one design decision is which column to elide first. `fields` is the widest and the least
scannable in a table (`teamA:text scoreA:number …`); `designs` is a bare id list. Eliding both
proportionally is probably right, but the honest test is to run it at 80, 100 and 160 columns and
look.

## Evidence

Walked 2026-09-09 against this checkout's dev server:

```
$ noacg types | awk '{ print length }' | sort -rn | head -3
354
350
350
```

67 types, 75 lines of output, 1.7 s. The wide rows are the sports types, whose fields carry
`role` suffixes - `match-board` alone lists eleven fields with `(data)` roles.
