---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: >-
  a test whose fixture is a real script name asserts that script's classification, so another
  branch teaching `command-match.mjs` the name inverts the test with no line in common and no git
  conflict - and the two CI events disagree, which reads as flake (2026-09-10)
serves: NOW
size: small
touches: scripts/command-match.mjs
covered-by: scripts/jobs-store.test.mjs
needs-owner: none
---
# A fixture that names a real command inverts without a git conflict

**Filed:** 2026-09-10. **Source:** `claude/ay-per-job-cost`, which burned four landing jobs for
this and no other reason.

## Why

`command-match.mjs` is a classifier over command TEXT. Its answer for any given string is global
state: `SWEEP_SCRIPTS` is one alternation, and adding a name to it changes what that name costs
everywhere, all at once. Any test that puts a real script name in a fixture is therefore asserting
that script's classification, whether or not it means to.

Row AY's queue-cost tests used `node scripts/ograf-external-walk.mjs` as the stand-in for a command
the classifier CANNOT recognise. That was a reasonable choice on the day: it was the command that
motivated the change, and the repository genuinely did not have the script. Row AG then landed the
script and, in the same commit, added `ograf-external-walk` to `SWEEP_SCRIPTS` - the right call,
since it drives two servers and two pages. `costOf` for that string went from `COST.walk` (0.5) to
`COST.browser` (1), and four cases in `scripts/jobs-store.test.mjs` began asserting a battery's
price against a walk's.

Neither branch touched a line the other touched, so git merged them silently. The two changes are
individually correct and jointly wrong, which is the whole shape of the hazard: **the coupling runs
through a string, and git only conflicts on lines.**

What made it expensive was the second half. The same commit was green on its `push` run
(34420984127) and red on its `pull_request` run (34421030153) - same sha, same runner, opposite
verdicts, which is the signature of a flake and is not one. `actions/checkout` takes the branch
alone for a push event and the branch MERGED WITH THE BASE for a pull request. Only the second run
had a classifier that knew the name. Four landing jobs went into that gap - j-0903 to j-0906,
every one of them a land-watch pinned to `affa277a`.

## What shape of fixture is safe

The rule is short. **A fixture asserting a classifier's DEFAULT must name a string the classifier
cannot ever be taught**, and it must say so where a reader will look.

- A case about the unknown-command default names a script the repository does not have and will
  not gain - `node scripts/a-walk-this-repo-has-never-seen.mjs`. The name carries its own contract.
- A case about a REAL script's cost names that script on purpose, and then it is correct for it to
  fail when the script is reclassified. That failure belongs to whoever owns the script.
- Never let one fixture do both jobs. That is what happened here: a name chosen for its realism was
  load-bearing for its unrealism.
- Assert the premise in its own test, so the failure names itself. Row AY now does:
  `the walk fixture is a command the classifier does not recognise` fails first and its message
  says rename the fixture, do NOT re-price the mechanism.

## What it would take

The convention above is already applied on row AY, so this file exists for the two mechanisms that
would stop the next one, not for the fix.

1. **A check that no test fixture names a script in `SWEEP_SCRIPTS`.** Cheap and mechanical: walk
   the `*.test.mjs` files for `scripts/<name>.mjs` strings and cross-check them against the
   alternation. It has one honest exception, the tests that are ABOUT `command-match.mjs`, which
   can be listed. This catches the class, not the instance.
2. **Compare the two CI events before calling anything flaky.** A green `push` and a red
   `pull_request` on the same sha means the merge preview differs from the branch, every time -
   there is no other way to produce it. That is worth a line in whatever a session reads when a
   landing goes red, because the instinct on identical shas is to re-run.

The repo already says the first half of point 2 for humans: `root/let-pre-merge-gate-laptop-does`
warns that a clean `git merge main` is not proof the integration worked, because both sides were
verified against a tree that no longer exists. This row is that rule's evidence. What is missing is
anything that enforces it - the rule asks a session to re-run the integration plan from the fork
point, and nothing checks whether it did.

## Evidence

- Run 34420984127 (`push`, `affa277a`) success; run 34421030153 (`pull_request`, the same
  `affa277a`) failure. `.github/workflows/ci.yml` passes no `ref:` to `actions/checkout`, so the
  pull request run builds the merge of the branch with the base.
- Commit `2e348a9f` on `main` added both `scripts/ograf-external-walk.mjs` and its
  `SWEEP_SCRIPTS` entry.
- Re-derived on 2026-09-10 by pointing the fixture back at the real name: 4 pre-existing cases
  fail, plus the new premise guard, out of 88.
- `scripts/command-match.mjs:124-128` - the entry and its reasoning.
