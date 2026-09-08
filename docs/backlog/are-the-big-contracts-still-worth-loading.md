---
v: 2
source: owner
kind: ask
raised: 2026-09-07
state: advanced
note: "Three areas read under this question. src/components (68381ada): 44 rules kept, 4 claims
  false, 17 retired - eight of them pointers to the subdirectory contracts. src/ai (91166854),
  the area the owner named: 68 rules, nothing false, six sections describing subdirectories that
  each have their own contract. src/blocks: 69 rules, 3 claims false, 13 retired, six of those
  the file's own refactor history. Reports in
  docs/metrics/2026-09-07-{components,ai,blocks}-migrated.md. The ask still stands because the
  owner has not ruled on any of the 34 retirements; the rows do not wait for him, and nothing
  has been deleted."
asked: "make a note that we need to look at what instructions the ai harness and the big files
  have, because everything might not be that useful anymore"
---
# Read the big contracts for whether they are still WORTH loading, not just whether they are true

**Filed:** 2026-09-07, owner, while the contract migration was working through the largest areas.

## The ask, and why it is a different question from the one phase 2b answers

Phase 2b moves prose into the rule store and shrinks what a session loads. It has been treating
every paragraph as worth keeping - the job has been to preserve meaning, and the audit measures
exactly that: did anything the contract knew get lost.

**The owner is asking the opposite question.** Some of what these files say may no longer earn its
place. Not wrong - migrating a false claim is already caught, and three were caught - but stale in
a softer way: a rule about a mechanism nobody uses now, a trap that a gate has since made
impossible, guidance written for a model or a workflow that has been replaced. That never fails an
audit, because it is still true. It just is not worth anybody's first tokens.

**`src/ai` is the place he named and the next row anyway.** `src/ai/pro/harness/AGENTS.md` is now
the tightest chain in the repository at 91,026 bytes, and `src/ai/AGENTS.md` is 41,685 across 8
chains. It is also the area whose subject has moved fastest - model ids, tiers, price targets and
the harness itself have all been rebuilt since much of that text was written.

## What to actually do

Do this AS PART OF the migration row rather than as a separate pass - reading the file carefully is
the expensive step and the row pays for it once. For each paragraph, three outcomes rather than
two:

1. **Still binding** - becomes a rule, as now.
2. **False** - do not migrate it; report it with the code that disagrees. Three of these were found
   in `src/templates` and `src/components/wizard`.
3. **True but no longer worth loading** - name it in the report with WHY it is dead: the mechanism
   it describes is gone, a gate now enforces it so nobody needs to remember it, or it describes a
   decision nobody will face again. Do not delete it silently and do not migrate it either. The
   owner decides; the row ships without waiting.

The third bucket is the new one, and the report of what fell into it is the deliverable here - more
than the byte saving, because it is the only way to find out whether these files grew because the
product got more complicated or because nothing ever left them.

## What would make this measurable

`docs/METRICS.md` counts bytes and files. It cannot count "useful". The honest proxy after a few
areas is the RATIO: paragraphs that became rules, against paragraphs retired as no longer worth
loading. If that ratio is near 1 everywhere, these files are dense and the migration is the whole
answer. If a big area retires a third of itself, the corpus was carrying its own history and the
next question is what stops it doing that again.
