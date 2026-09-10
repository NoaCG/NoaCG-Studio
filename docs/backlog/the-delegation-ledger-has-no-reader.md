---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "Every count quoted off the delegation ledger has been re-derived by hand, by a different
  reader each time, from a collapse rule that exists only as prose in a script header."
needs-owner: none
---

# The delegation outcome ledger can be written but not read

**Filed:** 2026-09-10. **Source:** measurement, while making the 2026-09-09 harness verdict's
headline number reproducible.

## Why

`scripts/delegation-outcome.mjs` writes the ledger and nothing reads it. Its header documents the
collapse rule that turns lines into tasks - lines sharing a non-null `label` become one task, the
last line winning outright, the first line's timestamp kept, a null label standing alone - and
every reader so far has re-implemented that rule from the prose. Three have: the Codex delegation
that produced `docs/metrics/2026-09-09-harness-verdict-tables.md`, the session that wrote the
verdict beside it, and the session that made this file.

The cost is not theoretical. The verdict's headline count was correct and could not be reproduced,
because each reader silently chose a different window - a calendar day against a rolling
twenty-four hours - and the number was quoted with neither. That took a whole row to repair, and
the ledger is the evidence the effort trial and the quota decision both rest on, so it will be
read again.

The same gap is why the outcome vocabulary drifts on the way in. The one field that decides whether
a task should have been delegated at all, `specBytes`, is null on most lines, and nothing tells a
row that it is missing.

## What it would take

A read mode on the script that already owns the vocabulary. `node scripts/delegation-outcome.mjs
--report [--since <iso>] [--until <iso>] [--wave <id>]` printing the collapsed tasks with the
outcome and cause tallies, and echoing the window and the line count it read at the top of its own
output, so a document quoting it copies the anchor along with the number. The collapse belongs in
an exported function beside `legacyVerdict()` so the reader and the writer cannot disagree.

Two small things worth folding in, both measured on the 2026-09-10 night: a round `wallMs` (an
exact whole number of minutes) is a poll budget rather than an elapsed time and should print as
unverified, and a delegation line with a null `specBytes` should say so rather than print a blank.

## Evidence

- `scripts/delegation-outcome.mjs` - the collapse rule in the header, and seven exported functions
  of which none reads the file back.
- `docs/metrics/2026-09-09-harness-verdict.md`, under "How to re-derive the ledger numbers in this
  file" - the three windows over the same ledger, and what each one yields.
- `docs/HARNESS_ROUTING.md`, under "The delegation-first night, 2026-09-10" - the wall-clock and
  `specBytes` traps, with the lines that carry them.
