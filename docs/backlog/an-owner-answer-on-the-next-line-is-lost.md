# An owner's answer typed on the line below the field is silently lost

**Filed:** 2026-09-08. **Source:** review of `claude/l-panel-that-never-grows`, on
`scripts/alignment-answers.mjs`.

## Why

`FIELD` (`scripts/alignment-answers.mjs:72`) captures only what follows `**Answer:**` on the SAME
line. The owner writing his answer on the next line - the natural thing to do for anything longer
than a few words - leaves `answer === ''`, so the question stays OPEN forever: it never becomes
`pending`, `wave-plan-check` never surfaces it, and the ruling is lost. An answer wrapped over two
lines is worse than lost: the first line is captured, and `rulingBlock()` writes that truncation
into `docs/OWNER_RULINGS.md` as though it were the whole ruling.

The file exists to stop exactly this - a ruling given and then forgotten - so the failure mode is
the one thing it may not do.

## What it would take

Accumulate continuation lines into the current field until the next `**Field:**`, blank-line-plus-
heading, or heading. A test in `scripts/alignment-answers.test.mjs` (or wherever its cases live)
with an answer on the following line and an answer wrapped over two lines.

## Evidence

`scripts/alignment-answers.mjs:60-76`, read 2026-09-08 on `main`.
