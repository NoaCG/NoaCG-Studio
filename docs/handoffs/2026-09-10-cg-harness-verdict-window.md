# CG - the harness verdict says what it counted, and the night says what it bought

**Branch:** `claude/cg-harness-verdict-window`, queued. **Commits:** `7113f105` (the window and the
filter), `94a9f8e9` (the night's routing section), `2304a1ec` (main taken in), `3c8d37ce` (the
check's nine findings, and the backlog file), then this handoff. **Check stamp:** PASS - review
`delegated` 9/9 fixed, simplify `inline`, verify `inline`, taste not applicable. **The reviewed sha
is `3c8d37ce`**; the stamp was re-written at the branch tip afterwards, and the whole increment
after the review is this handoff file and the two lines of it you are reading. **CI:** run
34538468694 on `3c8d37ce` green - Build, Factory gates, E2E plan, all nine E2E subset shards, the
combined report and the CI gate. The shards ran because the branch took `main` in mid-check and
picked up row CC's product code; the commits after it are documentation only.

## What landed

**Part 1, the verdict's headline number.** `docs/metrics/2026-09-09-harness-verdict.md` said nine
delegated tasks in the last 24 hours, seven of them ours. The number is right and it could not be
reproduced, because "the last 24 hours" was never anchored: it counts the **UTC day 2026-09-09**,
read after the last of its lines was written at 20:32:21Z, while the measurement tables beside it
cut a **rolling 24 hours ending 2026-09-09T20:25:55.094Z**, which gives five tasks and four ours.
Both windows carry the same proportion, so nothing in the verdict moved. Every count now names its
window and its collapse rule; a new section at the end of that file, "How to re-derive the ledger
numbers in this file", tabulates the three windows in play with what each yields; and the word
"nine" no longer stands for both a count of Codex invocations and a count of ledger tasks. The
tables file gains the matching note that its accepted-rate row is over the whole ledger.

**Part 2, the night.** `docs/HARNESS_ROUTING.md` gains "The delegation-first night, 2026-09-10",
carrying what five rows measured about their delegates. Two routing-table rows moved: the second
Antigravity pool's, and a new one for rewriting copy for voice. The section names which rows it did
not touch and why.

## The rule the night earned, in one line

**A delegation-first instruction does not change which tasks are delegable.** CB and CE put the
volume in the WORK and paid; CC put the volume in the SPEC - 14.5 KB for three call sites - and
did not, on a class the routing table has refused since 2026-08-30. It was delegated anyway because
the night's instruction read as "delegate", and an instruction is not evidence.

## What the review caught, because it is the more useful half

`/check`'s delegated review returned nine findings on a documentation-only change and **all nine
were real**, which is the second night running that has happened on a docs row. Three matter
beyond this branch:

1. **I wrote a comparison backwards.** "More delegated tasks in one night than the ledger's first
   nine days held in total" - the night is 17 and the first nine days are 28. The same file I was
   fixing closes with "never write 'the last 24 hours' without an anchor", and I dropped the anchor
   in the paragraph that boasts about anchors. The lesson is narrow and real: **a row correcting a
   provenance defect is not immune to it**, and the only guard that worked was re-deriving my own
   sentences from the ledger rather than re-reading them.
2. **Ledger LINES are not units of work, and I counted them as if they were.** The landing rewrite
   read as "seven sections, 5 of 7 needed repair", which flatters it twice over. It is **five
   sections over seven calls, and every one of the five came back needing repair** - the two
   `unusable` rows are first attempts at two of those sections, both re-run under `-2` labels. That
   was on the exact table row a future session routes voice work from. **Any count off that ledger
   has to check whether a `-2` label is a retry before it calls a line a task**, and
   `scripts/delegation-outcome.mjs`'s collapse rule does not catch it, because a retry gets a new
   label on purpose.
3. **I let one 12-item batch make a standing rule.** The first draft said to PREFER the second
   Antigravity pool for judgement work, on 9 of 12 against 7. The same file records the 2026-09-02
   head-to-head going the other way on the same field, 1/3 against 2/3, and I had dropped that
   clause from the row while rewriting it. Two samples of n=3 and n=12 pointing opposite ways on
   different task shapes is not a ranking. The row now carries both and asks for **both pools on a
   batch that matters, read for their disagreements** - which is the one thing both measurements
   agree on, and free, because the pools bill separately.

## Evidence and traps that exist in no repo file

**The ledger moved twice while I read it, which is the trap the section warns about, demonstrating
itself.** I pinned the read at 22:03 UTC. Row CF's first line arrived at 22:23:13Z, twenty minutes
later, after every count in the section was taken. The section says so in its own text rather than
being re-counted, because re-counting only moves the staleness forward. **Anyone quoting that
section is quoting a 22:03 reading and the file says which.**

**Row BD's ledger line is inside the calendar-day window and outside the experiment.** It is a
06:18Z handoff sweep from the morning wave. The day is 18 tasks, the night is 17, and the two
numbers are three lines apart in the section for that reason.

**`wallMs` is not always elapsed time.** Three of the night's lines carry an exact whole number of
minutes - BD's 2,520,000 ms, CD's 480,000 and 300,000 - which are poll budgets written into the
field. BD's alone is 55 percent of the night's recorded wall clock, so a session summing that
column inherits a made-up majority. Odd millisecond counts are the measured ones.

**`specBytes` is the field that decides the whole delegable question and it is usually null.** CC's
14.5 KB - the single most useful routing number of the night - exists only in its handoff, because
its ledger line records no `specBytes` at all.

**The CE numbers in this section come from its handoff, which landed on `main` mid-check.** Its
branch had no handoff when this row started, so the first draft of the CE subsection was built from
the ledger's own notes alone. The two agreed, and the handoff was strictly richer, so it replaced
the weaker version.

## What is left

- **`docs/backlog/the-delegation-ledger-has-no-reader.md`**, filed by this row and the deepest
  thing it found. `scripts/delegation-outcome.mjs` writes the ledger and nothing reads it, so its
  collapse rule has been re-implemented by hand three times from a comment in its header - by the
  Codex delegation that made the tables, by the verdict's author, and by me. **That is the root
  cause of the defect this row was sent to fix**, and the repair here is a document that explains
  the windows rather than a command that prints them. A `--report` mode with `--since`/`--until`,
  echoing its window above its numbers, ends the class.
- **The 9-or-10 question inside CB's finding.** The his/not-his call was changed on 14 of 68, and
  how many ran in the dangerous direction is 9 by the row's handoff and 10 by its own per-batch
  ledger notes read one at a time. The notes are prose, not counts, so neither is checkable against
  the other. The section says 9 or 10 and names the spread rather than picking. Nothing turns on
  it; the finding is that the bias is one-directional.
- **Nothing is queued for the owner.** No owner-queue item was filed: nothing here is observable in
  the product, the route to this work is reading two files, and row CB owned the owner-queue drain
  the same night.

## Pointers

- `docs/metrics/2026-09-09-harness-verdict.md`, section "How to re-derive the ledger numbers in
  this file" - the three windows and the collapse rule.
- `docs/HARNESS_ROUTING.md`, section "The delegation-first night, 2026-09-10" - the night's
  evidence and the rows it moved. Read this file by NAMED section; it is appended to.
- `docs/backlog/the-delegation-ledger-has-no-reader.md` - the missing reader.
- The rows this section reads: `docs/handoffs/2026-09-10-cb-queue-drain-four-reasons.md`,
  `2026-09-10-cc-validate-project-format.md`, `2026-09-10-cd-orchestrator-in-codex.md`,
  `2026-09-10-ce-landing-page-finnish-plain.md`.

## Blocked / blocking

Nothing. CF was still running when this row finished and its evidence is not in the section; if it
recorded delegations worth routing on, they belong in a new dated section rather than in this one.
