# Session E - the receipts tell the truth

**Branch** `claude/e-receipt-truth`, from `684e2bf2`. Three commits, two files of code plus one
owner-queue item. Landed through `/queue-merge`.

The receipts report is the frontier input every wave plan reads, and it was lying in two
directions at once. Both are fixed, and the second fix is deliberately built so it can only ever
ask a question.

## What the parser did, and what it does now

`parseFrontmatter` in `scripts/owner-receipts.mjs` treated a value that opened with a quote and
closed on a LATER line as a plain scalar. It kept the opening quote, applied the trailing-comment
strip to prose, and dropped every continuation line. Twelve values across ten receipts are written
that way, and all twelve printed truncated mid-sentence. The worst of it was the `note:` on an
`advanced` receipt: that field is the whole reason the `advanced` state exists, because it says
what STILL STANDS, and it was the half being cut.

A quoted scalar now runs to its closing quote, joining continuation lines with a single space the
way YAML folds them. Continuation lines must be indented, so an unclosed quote stops at the next
key instead of swallowing it. An escaped quote (`\"` in a double-quoted value, `''` in a single)
does not close the scalar and is read back as the character it means - the review caught that one,
and it was the same silent truncation in a new place.

The files were never wrong; the reader was. Nothing under `docs/backlog/` was touched.

The listing also stopped cutting quotes at 140 characters with an ellipsis. Quotes and notes wrap
on word boundaries at 100 columns with a hanging indent (`wrapAfter`), so nothing a planner steers
by ends mid-sentence. `compact` output is byte-identical to before, so the session-start hook that
slices twelve lines is unaffected.

## What I decided about the `#` strip

**Kept, and made audible.** ` # ...` at the end of an UNQUOTED value is a YAML comment and this
parser reads it as one, which is right for `state:` or `raised:` and would silently eat prose on a
field carrying the owner's words. It fires on nothing in the tree today (measured across every
receipt). Rather than break YAML for a case that does not exist, `parseFrontmatter` now reports
which keys lost text to it, and a prose field that loses text (`note:`, `asked:`, `found:`) gets a
note in the report telling the writer to quote the value. Silent loss became visible loss, and the
multi-line fix means quoting is now a working escape hatch.

## What I decided about the suspect heuristic

It ships, and everything about it is built so a false positive cannot do damage. It reads the
receipt's own distinctive words and looks for them in commit subjects on `main` raised after it.
That is a fact about WORDS, not about work, so it never changes a receipt's state, never runs
under `--check`, never fails a build, and the section says "a WORD MATCH, not a verdict. Nothing
here has been reclassified" before it names anything.

Tuning, measured over 1427 commits since 2026-08-20: words stemmed, four letters or longer, not a
stopword; half the receipt's distinctive words must match, at least two; scored by how RARE those
words are in the log, because `catalog` or `step` in a subject says nothing and `mapping` or
`taller` says something; and the commit that FILED the receipt is skipped, since it names the
receipt by construction.

At a score of 8 it flags **one** receipt today. I checked it and the two nearest misses by hand:

- **Flagged, and right.** `the-mapping-step-should-explain-and-offer-to-do-it` on `6824d306`
  (2026-09-06), which shipped hints under empty pickers, an unmatched-count notice and a Fill
  button while the receipt still reads `unstarted`. This is the case that nearly got planned twice.
- **7.9, quiet, and wrong.** `more-behaviours-than-poll-and-quiz` against a quiz-behaviour
  refactor. The ask is for more behaviour KINDS; the commit reworked the one we have.
- **6.8, quiet, and wrong.** `unique-first-catalog` against two commits sharing `first` and
  `catalog`, neither about a unique first design.

A gap of 1.5 over three examples is a guess and the code says so. Expect to move the number, and
prefer moving it UP: a quiet check that misses one is worth more than a loud one nobody reads.

## What is left

- **Settle the one flag.** Read `6824d306` against
  `docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md` and either close the receipt
  or set it `advanced` with a note naming what of the four asks is still missing. That is a
  judgement about what shipped, which is why this row would not make it.
- **Row D's branch (PR #146) converted eight receipt quotes to folded scalars to dodge this
  parser.** Those rewrites are now unnecessary. Reverting them is not urgent and was not touched
  here on purpose: a conflict under `docs/backlog/` would have bounced a landing already in the
  queue.
- The suspect check reads only `unstarted` receipts. An `advanced` one already carries a person's
  note, so guessing at it adds nothing - but if the shelf drifts again, that is the next place to
  look.

## Pointers

- `scripts/owner-receipts.mjs` - `parseFrontmatter` (the parser), `closesQuote` / `unquote` (the
  escape rules), `wrapAfter` (the wrapping), `SUSPECT_SCORE` and `suspectMatches` (the heuristic,
  with the tuning evidence in the comment above the constant).
- `scripts/owner-receipts.test.mjs` - 14 tests. Three of them fail on the old parser; I verified
  that by running the new file against `git show HEAD:scripts/owner-receipts.mjs`.
- `docs/acceptance/owner-queue/2026-09-08-your-own-words-print-whole.md` - the route for the owner.

## Verification

`npm run build` exit 0 (read from the build's own exit code, not a pipe).
`node --test scripts/owner-receipts.test.mjs` 14/14.
`node scripts/owner-receipts.mjs` read by eye: every quote whole, no line ending mid-sentence, no
stray quote character, no literal backslash.
`/check` run on the branch: **review: delegated** (3 findings, all confirmed and fixed - the
escaped-quote truncation, the missing unescape, and a stemmer that turned `names` into `nam`);
**simplify: inline** (the skill returned fan-out instructions rather than a result, so the pass was
done here; one finding, each commit subject tokenised once instead of once per receipt);
**verify: inline**, green. **taste: not applicable** - no product code changed and nothing here can
move what a graphic looks like.
