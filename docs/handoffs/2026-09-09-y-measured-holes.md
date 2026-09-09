# Y - the measurement mechanism had the disease it was built to cure

Branch `claude/y-measured-holes`, base `bce60a4b`, two commits (`66934684`, `c0ccac6b`).
Touches `scripts/gates.mjs`, `scripts/measured.mjs`, `scripts/gates-test-count.mjs`, their two test
files, the new `scripts/measured-receipt.mjs`, and a follow-up section in
`docs/metrics/2026-09-08-gates-that-measure-nothing.md`.

Row F landed the measurement mechanism on the night of 2026-09-08: a gate says how many things it
looked at, and a count of zero is a failure rather than a pass. Four review subagents then read it
and reported holes. None of the four had been verified by anybody, so the first job was to
disbelieve each one and reproduce it as a failing case before touching it. All four turned out to
be real, one of them worse than reported.

## The four claims

### 1. The tier hole - REPRODUCED AND FIXED

`runTests` refused an empty test list only when the tier's literal name was `build`. Every other
tier answered zero test files with a notice and exit 0, justified by a true fact about today's
`package.json` hardcoded as a string comparison. Reproduced by running the branch this way round:

```
$ node scripts/gates.mjs run --gate after-build --only tests
[gates] the after-build tier holds no test files.
EXIT=0
```

The factory tier takes that same branch and holds five browser test files today - the whole CI
factory job. One renamed header, one changed filter, and CI would have run nothing and said so in a
notice. That is the type-floor bug one tier over, in the mechanism written to catch type-floor.

Fixed by making the refusal a property of the population rather than of the name. `EMPTY_TIERS`
names the tier-and-kind pairs where zero is honest, each with a reason a reader can act on, exactly
like `measures: none - <why>`; `emptyPopulation` is the one reader, used by the runner for both
checks and test files. The audit holds the table to the repository from the other side: a runnable
tier with no test files is a problem unless the table exempts it, and an exemption that has stopped
being true is a problem too. That second half matters because the audit runs in the BUILD tier, so
an emptied factory tier now fails on the laptop instead of waiting for a CI job on another machine.

An empty CHECK population is deliberately not judged in the audit: the audit is itself a check in
the build tier, so a build tier holding no checks is a build in which that code never runs. The
runner owns that direction, and reaches it whether or not any check exists.

Negative tests: `runTests([], 'factory')` is 1, `runTests([], 'build')` is 1,
`runTests([], 'after-build')` is 0, plus both audit directions, in `scripts/measured.test.mjs`.

### 2. The two thresholds - REPRODUCED AND FIXED

The static audit wanted a `measures: none - <why>` reason of at least 20 characters;
`measuresNothing()` accepted any non-empty one. The code's own comment called it "the one reader of
the exemption, so the runner and the audit cannot disagree about who is exempt", and they did.
Reproduced with a single header:

```
header `// measures: none - x`
  measuresNothing(header)  -> true      (the runner exempts the gate from its receipt)
  auditGates(...)          -> 1 problem ("without a reason a reader can act on")
```

It is not academic: `type-floor.mjs`, `overflow-sweep.mjs` and `field-coverage.mjs` are invoked
straight from two workflows, where the audit never runs, so the weaker of the two readings was the
one in force for them.

Fixed with `measuresDeclaration(header)`, which returns `{ exempt, problem }` and is the only place
a `measures:` line is read. A malformed line or a thin reason now leaves `exempt` false, so the gate
still owes a receipt at run time AND fails the audit - the failure direction of a mechanism that
disbelieves passes has to be "still measured". The minimum reason length is one exported constant
(`REASON_MIN` in `measured.mjs`), used by `measured.optional`, by `measures: none` and by
`gate: none`, which had a third copy of the number 20.

### 3. The text scan - REPRODUCED, NARROWED, AND WHAT REMAINS OPEN IS WRITTEN DOWN

`judgeMeasurement` tested for the substring `measured.mjs` and a `measured(` anywhere in the file.
Three shapes were reported; all three passed the audit with zero problems, and I found a fourth
that is worse:

| what the gate contains | audit before |
| --- | --- |
| `if (false) measured(1, 'x')` | passes |
| `measured(items.length \|\| 1, 'items')` | passes |
| `// measured.mjs: we should call measured( ) here one day` - a comment, no import, no call | passes |

The third is the interesting one, because the code's comment reasoned that "an import is not a
call" and required both a mention and a call shape - and then a single sentence in a comment
satisfied both halves.

Narrowed: the scan now wants an actual import statement naming `measured.mjs` and a call written
outside a comment, and it refuses a count that cannot come out zero - a literal, `|| 1`, `?? 1`, a
floor at one. `?? 0` still passes, which is the honest form of the same reach.

**What remains open, deliberately.** A static scan cannot prove a call is REACHED.
`if (nothing) measured(items.length, 'items')` passes the audit and always will. The runner closes
half of it (a check that exits 0 leaving no receipt fails) but a check that reaches one of its
calls and skips another leaves a receipt and passes. So the rule refuses a gate that never reports;
it does not certify one that does. That limit is now written out over `judgeMeasurement`, where the
next reader meets it, and the old comment claiming the runner and the audit cannot disagree is
gone. There is a test asserting the unreachable call still passes, so the limit is on the record
rather than in somebody's memory.

Closing it properly would mean running each gate's `measured` calls under instrumentation - a
coverage run over the gate set. That is a bigger mechanism than this row, and it is not obviously
worth it: the receipts are printed next to each gate's name in the build log, so a gate that used
to say 502 and now says 1 is visible to a person reading the log.

### 4. The receipt format - REPRODUCED AND FIXED

Three files had to agree about a tab-separated format and each spelled the tab itself:
`measured.mjs`'s `record()` and `gates-test-count.mjs` wrote rows, `gates.mjs`'s `readReceipts`
split them. A subject containing a literal tab became a fourth column, and a row the reader drops
reads to the runner as a gate that measured nothing - the disease again, in the plumbing.

`scripts/measured-receipt.mjs` now owns the format: `receiptRow` for both writers, `appendReceipt`
for the helper, `parseReceipts` for the reader, and `RECEIPT_ENV` for the variable the file travels
through (the runner used to spell that string itself too). Subjects are collapsed to one line on
the way out, and a row that is not a receipt is dropped rather than guessed at, which fails the
gate rather than inventing a count.

### 5. And the tail

`judgeMeasurement` re-read every entry file that `discoverChecks` had already read and discarded.
The text is carried on the check record now, so the audit reads each gate once per build.

## The check

`review: delegated` - the code-review skill at level `high` returned four findings, all in this
branch's scope. Three were confirmed by reproduction and fixed in `c0ccac6b`:

- the bracket walk in `measuredArguments` ignored quoted brackets, so `measured(text.split('(').length, 'x')`
  ran past the end of the call and would have failed an honest gate with three lines of unrelated
  code quoted back at its author. An argument the walk cannot read with confidence is `null` now -
  still counted as a call, never judged as a fabricated count. This one is worth pausing on: the
  file's own comment reasons carefully about why a quote-tracking comment stripper would be fooled
  by a regex holding a quote, and then leaves the same class open in the walk twenty lines below.
- the staleness half of the tier table only ran over test files, so the `factory:checks` exemption
  could quietly stop being true. Both kinds are judged now, which is what the table's comment
  already claimed.
- the runner spelled `GATE_MEASURED_FILE` itself while exporting a constant for it.

The fourth was a dead pointer from the metrics doc to this handoff, which now exists.

`simplify: inline` - the skill returned fan-out instructions rather than a result, so the pass was
done here over its four angles. Three things changed: the third copy of the reason length became
`REASON_MIN`, the audit's tier loop lost an awkward key-mapping, and `judgeMeasurement` passes each
helper what its signature documents instead of pre-stripped text.

`verify: npm run build` green on the final state (exit 0 read directly, 102 test files, 1367
tests). No product code is in scope - the diff is `scripts/` and one doc - so `test:e2e:affected`
is not the gate here. `taste: not applicable`: nothing in this change can move what a graphic
looks like.

## What a reader should know next

- The real repository passes every new rule with no changes to any gate, so nothing here exposed a
  currently-green gate as blind. That is a genuine result rather than a tuned one: the rules were
  written first and the audit was run second.
- The fifth review finding, about `rulesetFacts` in `scripts/landing-ruleset.mjs` comparing every
  non-`required_status_checks` parameter with a bare `String(value)` so two different arrays both
  render `[object Object]` and drift reports clean, is the same species in row J's landed code. It
  was deliberately left to the backlog rather than folded in here - one row, one mechanism.
- This change reaches every sibling branch on its next merge of `main`. It only tightens: a gate
  that measures honestly is unaffected, and the two things that could newly fail a build are a tier
  whose gates have vanished and a count written as a constant or floored at one.
