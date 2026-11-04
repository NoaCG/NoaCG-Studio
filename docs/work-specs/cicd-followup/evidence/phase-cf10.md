# Phase cf10: the test-removal check sees loop tests, and its exceptions expire (#1911)

Plan run #1967 (cicd-followup), phase cf10. Builder session on branch
`claude/plan-cicd-followup-cf10-build`, from `main` at 3ed797a6. Written 2026-11-04.

Acceptance:

- (a) "The test-removal check counts tests declared inside loops through reliable discovery or
  parsing, with a mutation-tested regression."
- (b) "Exceptions are owned, justified and time-limited, and an expired exception fails with an
  actionable message."

## Result

Both met. The check (`scripts/check-e2e-protection.mjs`, the `E2E protection check` step of
ci.yml's plan job) now counts runtime tests with Playwright's own discovery
(`playwright test --list`) at the merge base and at the head, instead of counting lines that begin
`test(`. Its exceptions, the `## Test maintenance` lines, now need a justification, the
accountable owner and an expiry at most 30 days ahead. A lapsed, undated or wrongly owned line
covers nothing, and the failure names the line, why it does not count and the line to write.

## (a) Tests declared in loops are counted

**How.** For each changed spec file the check runs `playwright test --list` under the config that
runs it (`playwright.config.ts`, `playwright.live.config.ts`, `playwright.catalog.config.ts`), once
in a temporary worktree at the merge base and once at the head, and compares the counts per file.
The plain `--list` output is read, not the JSON reporter, because the catalog config refuses any
`--reporter` (it would replace that config's scope guard). The listing's own `Total: N tests` line
must equal the sum of the lines read, so an output format the parser does not know is an error,
never a lower count.

- A change to a helper or fixture under `e2e/`, or to one of those three configs, can change what
  a spec declares without touching it (loop data in `e2e/_saveMatrix.ts`, a `testIgnore`). Then
  every spec is counted: 322 files, 21 to 27 seconds on this 4-CPU cloud machine (the head and
  base listings, and each config's, run in parallel).
- A rename inside `e2e/` compares the new file with the old one. A move into another suite (for
  example from `e2e/` into `e2e/configured/`) is a finding of its own, since it leaves this gate.
- A listing that fails, or a base the check cannot diff, fails the check. Before, an undiffable
  base passed with a warning.
- Loop data a spec imports from `src/` is not followed. That gap is filed as #2150 (P3), with the
  measured cost of the obvious fix.

**The case that started it.** On #1910's merge (23742966, base 23742966^1) the old checker prints
`OK - 1 changed spec file(s)` and exits 0. The new one, run on the same spec change (applied on top
of 23742966^1 with this branch's scripts, since that old base has no `ownerLogin` and the check
reads the owner at the base), prints
`e2e/editor-arrangement.spec.ts: 2 test(s) fewer than before (25 -> 23, counted by playwright --list)`
and exits 1. (#1910 is a reviewed maintenance change with its receipt in phase-ci08.md; the run here
uses today's entries, where it has none.)

**No false refusals in recent history.** Both checkers on the last 30 merges to main that touched a
spec file (from 20052b7e #2135 back to f5d6a7fe #2021): both pass all 30. The new one's counts
match each change (for example #2101: `import-svg-reimport.spec.ts` 13 -> 19; #2038:
`configured/svg-import-journey.spec.ts` 0 -> 1 under the live config).

**Regression and mutation testing.** `scripts/check-e2e-protection-loop.test.mjs` is the
black-box regression. It imports nothing from the checker. It builds a throwaway git repository
with a real Playwright config and spec, and runs the checker's command line as ci.yml does:

1. removing one case from a `for ... of [...]` loop fails the check (33 -> 32);
2. a current entry lets the same change through, and once that entry has expired the change fails
   with `does not count: it expired on 2026-11-10.`;
3. a move inside `e2e/` that drops a case fails, and a pure move passes;
4. a spec Playwright cannot load fails the check;
5. a case removed from loop data in an `e2e/_cases.ts` helper fails, with the spec untouched;
6. a move into `e2e/configured/` fails as a suite change;
7. an owner renamed in `growth-ceilings.json` in the same change does not count (the owner is read
   at the merge base);
8. a base that cannot be diffed fails.

`scripts/check-e2e-protection.test.mjs` holds the unit tests: the diff reader, the `--list` parser
and its total check, the config map (each config's `testDir` is read from the config file itself),
and the entry rules.

The same test files ran against the old checker and against each mutation of the new one, every
mutant in a scratch copy of the scripts it needs:

| Mutant | Result |
| --- | --- |
| M0 the old line-counting checker (from 23742966^1) | killed: the loop regression fails (the old checker exits 0) |
| M1 the Playwright count is ignored | killed |
| M2 the base count is the head count | killed |
| M3 `before > after` becomes `>=` | killed |
| M4 expiry not checked | killed |
| M5 owner not checked | killed |
| M6 30-day window not checked | killed |
| M7 undated legacy lines count | killed |
| M8 entries match by file name, not path (the old rule) | killed |
| M9 a failed listing is swallowed | killed |
| M10 the listing's `Total:` line not checked | killed |
| M11 justification not checked | killed |
| M12 a rename is not mapped to its old path | killed |
| M13 helpers and configs do not widen the count | killed |
| M14 a move into another suite is not a finding | killed |
| M15 an undiffable base passes | killed |
| M16 the owner is read from the head | killed |
| M17 `git diff --name-status` split on spaces | killed |

Each mutant was run on the final code. The harness copies `check-e2e-protection.mjs` with one
replacement, the scripts it imports and the three Playwright configs into a scratch folder, and
runs both test files there.

## (b) Exceptions are owned, justified and time-limited

An entry is one line under `## Test maintenance` in a work spec:

    - e2e/x.spec.ts: <what stays protected and by what; receipt>, owner miwco, expires 2026-11-30

- **Owned.** The owner must be `ownerLogin` in `scripts/growth-ceilings.json` (`miwco`, with the
  weekly owner session as backup coverage, #1951), read at the merge base. The check accepts no
  other name, and so it never needs to invent one.
- **Justified.** The text before `, owner` must say what stays protected and by what.
- **Time-limited.** It counts from today up to and including its expiry, and the expiry may be at
  most 30 days ahead: the same limit as a budget exception (`EXCEPTION_MAX_DAYS` in
  `scripts/e2e-capacity.mjs`). It matches its spec by full path, not by file name.
- **Expired.** A lapsed line stays on record (cf09 asked for this: an expired line kept on record
  must not fail the check, only a change that relies on it). A change that relies on it fails:

      ::error title=E2E protection::e2e/lapsed.spec.ts: 1 test(s) fewer than before (2 -> 1, counted by playwright --list). The entry for it in docs/work-specs/x/spec.md does not count: it expired on 2026-11-01. Restore the protection, or, if removing it is deliberate and reviewed, add a line under "## Test maintenance" in the pull request's work spec: "- e2e/lapsed.spec.ts: <what stays protected and by what; receipt>, owner miwco, expires <a date from 2026-11-04 to 2026-12-04>". A repair never writes this line (scripts/check-e2e-protection.mjs).

The 50 existing entries have no owner or expiry. They stay as the record of the landings they
covered and cover no later removal, which closes the second half of #1911 ("once a line names a
file, every later removal from that file passes, by anyone, forever"). No open pull request
removes a test (checked 2026-11-04: the three open PRs are #2134 and two Vercel bot PRs, none
touching `e2e/`), so nothing in flight relied on them.

## What changed

- `scripts/check-e2e-protection.mjs`: the count, the entry rules, the fail-closed paths.
- `scripts/check-e2e-protection.test.mjs`, `scripts/check-e2e-protection-loop.test.mjs`: the tests.
- `.github/workflows/ci.yml`, plan job: setup-node moves before the check. A new step asks the
  script whether it needs Playwright (`--needs-playwright`), and `node_modules` is restored only
  then. A change that touches no spec, e2e helper or config pays nothing. One that touches a spec
  pays the cache restore and two short listings. One that touches a helper or config pays the full
  count (21 to 27 seconds). The plan job is on the critical path, so this cost is stated, not hidden.
- The entry format in `docs/work-specs/README.md`, `docs/VERIFICATION.md` and the e2e-suite-budget
  spec (decision 4 and its `## Test maintenance` preamble).

No check, test, limit or budget is loosened, and no entry or exception is written. Test selection
is not changed: the check reads the diff and lists tests, but chooses nothing to run. So the
selector audit does not restart.

## Review

`/check` code review (medium) found ten issues on the first head. Fixed: shared loop data in e2e
helpers and config changes now widen the count; a move into another suite is a finding; a listed
count that cannot be placed fails, through the `Total:` cross-check; the owner is read from the
merge base; an undiffable base fails; `-M` is passed to both diffs; `--name-status` is split on
tabs only; ci.yml asks the script whether to restore `node_modules` instead of repeating its diff
logic in shell. Accepted with a reason: the base listing uses the head's `node_modules`. A
dependency change that breaks the base config's loading fails the check (fail closed), and it is
rare. Reported, not fixed: loop data from `src/` (#2150).

`/simplify` (four reviewers: reuse, simplification, efficiency, altitude). Applied: the head and
base listings and each config's listing run in parallel; one `git ls-tree` replaces a `cat-file`
per spec; deletions have one source (`--name-status -M`); an unused `text` field is gone; the
loop test has one `check` and one `commit` helper. Skipped, with the reason: importing
`EXCEPTION_MAX_DAYS` from `e2e-capacity.mjs` (that module loads the planner, and the
`--needs-playwright` step runs before `node_modules`), so `ENTRY_MAX_DAYS` stays a local 30 with
its source named; sharing `readMaintenance` with `readExceptions` (it would reshape unchanged code
in `e2e-capacity.mjs`); always counting every spec (21 to 27 seconds on every pull request's critical
path, against #2150's gap, which it would close; left to #2150); restoring `node_modules` on every
change.

## Phase notes

- **Previous verified main SHA:** 2d454124 (2d45412447ea, CI push run 41915626548 green), merged into
  this branch on 2026-11-04; the branch started from 3ed797a6 (run 41912103787 green).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It restores the line-counting
  check and the undated entries' old effect. No data or setting changes.
- **Decisions:**
  - Discovery, not parsing: Playwright's `--list` is the runner's own count, so it sees loops over
    imported data, `describe` blocks and parameterised arrays alike. A parser would have to
    evaluate loop bounds.
  - Plain `--list` output with the `Total:` cross-check, because the catalog config refuses
    `--reporter`.
  - The check stays in the plan job, so the gate wiring is unchanged. `node_modules` is restored
    only when the script says a count is needed.
  - The 30-day window reuses the budget exceptions' limit instead of inventing a new one. The
    owner comes from the same `growth-ceilings.json` field the alarms use.
  - Legacy entries are not migrated. Each covered one landing that has already happened. Giving
    them dates would be writing exceptions nobody needs.
- **Traps:**
  - `playwright.catalog.config.ts` throws on any `--reporter` argument.
  - With `--pass-with-no-tests`, a spec with no tests is simply absent from the listing, so a
    missing file must count as 0, and the `Total:` line is what proves the listing was read.
  - Git detects a moved file as a rename only above 50% similarity. A small edited spec reads as a
    delete plus an add, which the check also catches (as a deletion).
  - The repository's commit hook refuses `Co-Authored-By` trailers.
