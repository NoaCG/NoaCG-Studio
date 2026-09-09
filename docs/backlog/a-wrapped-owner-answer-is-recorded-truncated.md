# An owner answer that wraps onto a second line is written into the rulings with its second half gone

**Filed:** 2026-09-09. **Source:** the `/check` review of the handoff-drain branch, which read
`scripts/alignment-answers.mjs` as landed and found this; verified against the code before filing.

## Why

The alignment ledger's whole promise is that an answer the owner gives is never lost between the
weekly session and `docs/OWNER_RULINGS.md`. It loses the second line of one silently.

`scripts/alignment-answers.mjs:52` reads a field as `/^\*\*(Question|Answer):\*\*\s*(.*)$/` - the
remainder of that one line. A continuation line is neither a heading nor a field, so the parser
walks past it without a trace, and `rulingBlock` writes the truncated text into the rulings file.

The docs in this repo wrap at about 100 characters and the owner speaks in sentences, so a real
answer wraps. "Yes, until the students have used it, but drop the CasparCG half - that has stopped
mattering" becomes "Yes, until the students have used it, but drop the CasparCG half -" in the
permanent record. That is worse than losing the answer outright, because it reads as complete and
the half that survives is the half that agrees.

The same file states the principle it breaks, about the heading parse: "every doubtful case parses
rather than vanishes."

## What it would take

Accumulate continuation lines into the field until the next field or heading - a few lines in the
same loop, and it matches how anybody writing the block would expect it to behave.

**Two smaller things in the same file, worth taking in the same pass.** Ids are matched by
substring (`rulings.includes(entry.id)` at :117, and the same in `scripts/wave-plan-check.mjs:359`),
so `ALIGN-2026-09-15-1` reads as present when only `ALIGN-2026-09-15-10` is there; unreachable
under the current three-question cap, but the cap is prose and the id format allows any number, and
the failure is a question silently marked recorded forever. A word-boundary test costs nothing. And
the newest-wins dedupe at :109 keeps the first occurrence walking newest-first unconditionally, so
when a question is carried forward by copying its block - which the workflow tells the session to do,
with the id as the stable join - an answer written into the older copy loses to the newer empty one.
Preferring the answered occurrence is the safer tie-break.

## Evidence

- `scripts/alignment-answers.mjs:70` (`FIELD`), `:80` (the parse loop), `:135` (the dedupe), `:140`
  (the substring test); `scripts/wave-plan-check.mjs:375`. The line numbers moved on 2026-09-09,
  when the fourth defect below was fixed in the same file; the code they name is unchanged.
- Landed as PR #157, merge `b119dbdd`.
- The mechanism's purpose is stated in `.agent-workflows/orchestrator-week.md` and
  `docs/ROUTINES.md`. The fourth defect in the same shipment - `alignmentState` reading the
  checkout it runs in rather than the primary one, so it found no weekly file anywhere but the main
  tree - was fixed on 2026-09-09 by `scripts/primary-checkout.mjs` and `weeklyDir()`; its backlog
  item is gone with it, and the argument is in `git show 64ad2f68:docs/handoffs/2026-09-09-f-weekly-candidates.md`.
