# Bring GOALS.md back inside its ~200-line budget, and gate it

**Filed:** 2026-09-01. **Source:** the weekly coherence pass (measurement), second round.

**Status 2026-09-01, same day: steps 1 and 2 DONE with the North Star ratification** - the file
was condensed to 212 lines (moved prose preserved verbatim in `GOALS_ARCHIVE.md` "Condensed out
of the live file (2026-09-01)", `COMPETITORS.md` and `docs/backlog/cli-roadmap.md`), and the
owner confirmed ~200 as the number, stated once in `GOALS.md`'s opening paragraph. **Step 3 (the
build gate reading the cap from that one place) remains open** - it is what keeps the file from
drifting back to 419.

`docs/GOALS.md` declares its own cap in its opening paragraph - *"Keep it under ~200 lines: a
roadmap nobody can read in one sitting steers nothing."* It is **419 lines**. Three other files
repeat the cap as if it held: root `AGENTS.md` ("GOALS.md stays under ~200 lines"), `docs/README.md`
in the row for `GOALS.md`, and `.agent-workflows/orchestrator.md`, which until this round listed the
cap among the STRUCTURAL defences against doc rot. Nothing measures it. Grepped `scripts/` and
`package.json` on 2026-09-01: there is no check.

## Why

The roadmap is half of the cold read - a session that has read root `AGENTS.md` and `GOALS.md` is
supposed to be able to say what the product is, what the push is, and what is parked. At 419 lines
that read is no longer one sitting, which is the failure the cap was written to prevent, and the
prose says the cap holds while the file demonstrates it does not. That is worse than having no cap:
a rule visibly ignored in the one file that states it teaches a reader that the rules here are
decorative, and the next rule they discount may be one that matters.

The previous round already moved 104 lines to `GOALS_ARCHIVE.md` and the file is still more than
twice its budget, so this is not a trim - it is a decision about what the roadmap is allowed to
hold, and that needs a session rather than a pass.

## What it would take

1. **Read the file against its own rule.** It holds only what is NOT done, so anything landed moves
   verbatim to `GOALS_ARCHIVE.md`. The likely bulk is in `## NEXT`, `## THEN` and `## Parking lot`,
   where parked items carry full rationale that belongs in the plan doc for that subject - the
   roadmap needs the item and the link, not the argument.
2. **Decide whether ~200 is still the right number** and say so once, in `GOALS.md`, with the other
   three mentions pointing at it rather than restating it. If the answer is that a roadmap for a
   product this size cannot be 200 lines, raise the number deliberately; do not leave it at 200 and
   miss it by 219.
3. **Gate it**, the way `scripts/check-docs-index.mjs` now gates the docs map: about fifteen lines
   failing the build when `docs/GOALS.md` exceeds the declared cap, with the cap read from one
   place. Without it the file drifts back, which is exactly what it did.

Do 1 and 2 before 3 - the gate cannot land while the file fails it.

## Evidence

Measured 2026-09-01 on `claude/a-coherence-round` after merging `main`: `wc -l docs/GOALS.md` =
419; the cap is stated in `docs/GOALS.md`'s opening paragraph and repeated in root `AGENTS.md`,
`docs/README.md` and `.agent-workflows/orchestrator.md`. The 2026-08-30 round's own commit
`79d01415` recorded the same defect at 460 lines and moved 104 lines of shipped work to
`GOALS_ARCHIVE.md` without closing the gap.

## Trend
- 2026-09-08: **284 lines** against the ~200 cap, up from 212 after the 2026-09-01 condense. The file drifted back by 72 lines in a week, which is precisely what step 3 exists to stop; steps 1 and 2 have now been done twice and held for days each time. Step 3 is no longer optional maintenance - it is the only part that has never been tried
