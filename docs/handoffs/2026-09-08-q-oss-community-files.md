# Q - the community files, re-gated

**Branch** `claude/oss-community-files` (PR #102, open since 2026-09-07 with auto-merge armed)
**Tip** `0447923a`
**Check** review: delegated | simplify: inline | verify: inline, build green | taste: not applicable

## What the failing run actually said

The stale red was real and its cause was exactly the one the plan named, though not in the job the
pull request page points at. Run
[34100940586](https://github.com/NoaCG/NoaCG-Studio/actions/runs/34100940586) shows `CI gate`
failing, but `CI gate` only aggregates: its log says `BUILD_RESULT: failure` and every other input
`success` or `skipped`. The failure is inside the **Build (typecheck + lint + bundle)** job, and
inside that job it is one gate:

    [gates] check:tree-shape: node scripts/check-tree-shape.mjs
      x unexpected top-level entry "CODE_OF_CONDUCT.md" (1 tracked file(s))
      x unexpected top-level entry "CONTRIBUTING.md" (1 tracked file(s))
      x unexpected top-level entry "SECURITY.md" (1 tracked file(s))
    [gates] check:tree-shape FAILED (exit 1, 0.0s)

That is the only `FAILED` line in the whole run. Typecheck, lint, the unit suites and the other
twenty-odd gates all passed; `Factory gates` passed as its own job. So nothing was wrong with the
three files - the root allowlist simply had not been told about them.

`37a7e2d4` added them to `ALLOWED_ROOT_ENTRIES` in `scripts/check-tree-shape.mjs` on the night of
2026-09-08, a day and a half after that run. **The gate did not need weakening and was not
weakened.** It now passes on this branch for the ordinary reason: the entries are declared, with a
comment beside them saying the repository root is the only location GitHub reads them from.

## What the merge brought in, and the generated-file trap

`git merge origin/main` took in 143 commits and resolved with **no conflicts**. The trap about a
generated file merging cleanly and still coming out wrong does not apply here, and I can show that
rather than assert it: after the merge, `git diff --stat origin/main HEAD` was exactly the three
new files and nothing else. The merged tree is byte-identical to main everywhere outside them, so
no generated region of either side could have been dropped. **No generator needed re-running.**

Note for whoever lands this: `main` has moved again since that merge (`origin/main` is now past
`b119dbdd`, which lands the alignment-answers work). This branch is behind it again. The merge
queue tests the combined state, so that is its job rather than something to chase.

## What I changed beyond re-gating

Three small things, all mine to decide:

**Cut a spec count from `CONTRIBUTING.md`.** It said "you do not have to run all 149". That was
exactly right on the day - `find e2e -name "*.spec.ts"` minus the two `testIgnore` directories is
149 today - and it would have gone quietly wrong the first time anybody added a spec. Nothing
gates a number like that, so it now names the whole suite.

**Added an owner-queue item**, `docs/acceptance/owner-queue/2026-09-08-the-three-community-files-github-expects.md`,
kind `walk-p`. This work is observable to a human, just on the GitHub repository page rather than
in the app, and the invariant asks for a route. The one sentence it wants from the owner is
whether `contact.noacg@gmail.com` is the right destination for a vulnerability report and a
conduct report; that address is already on the site, so it is not a new one, but those two files
now point strangers at it.

**Corrected that item after the review caught it.** I had written that the Community Standards
checklist would go "from three missing checks to none missing". It does not. GitHub also counts an
issue template and a pull request template, and `.github/` here holds only `actions/` and
`workflows/`. The owner would have followed the route and found two checks still red. It now says
five missing to two, and says that leaving templates out is deliberate - how strangers file things
is worth deciding on its own, not smuggling in behind three files that only state policy.

## The check, leg by leg

- **review: delegated.** The pass returned findings, so it ran. **Ten of its eleven findings are
  out of scope** and I did not act on them - see below. One was in scope, confirmed against the
  tree, and fixed: the Community Standards claim above.
- **simplify: inline.** The skill returned fan-out instructions rather than a result, so by the
  workflow's four-branch rule the leg had not run and I did it here. One finding, fixed: the
  owner-queue route promised "three things, all on that one page" and then sent the reader to
  Insights for the third. Nothing else in four markdown files needed it.
- **verify: inline.** `npm run build` exit 0, read from the build's own exit code. The version
  stamp reads `claude/oss-community-files@d500b65118`, which is what proves the build gated this
  branch and not `main`. No e2e: the branch changes four markdown documents and no product code.
- **taste: not applicable.** Nothing here can move what a graphic looks like.

Verdict stamp at `.git/noacg-jobs/checks/claude-oss-community-files.json`, `reviewedSha`
`0447923a`.

## For row F, and for whoever owns the routines docs

**Not a defect in the tree-shape gate.** F is sweeping gates that measure nothing; this one
measured exactly right. It refused three undeclared root entries, said in its own failure text how
to declare them, and passed the moment they were. It behaved well and needs nothing.

**But the review found eleven things, and ten are about files this branch never touched.** The
delegated review diffed against the stale local `main` ref (`03aa732d`) instead of `origin/main`,
so it read content that had *already landed*. That makes them findings about `main`, not about any
open branch, which is why they are here rather than fixed. The ones worth someone's attention:

- **`docs/ROUTINES.md:23` and `.agent-workflows/orchestrator-week.md:136` both justify a live rule
  with a retired mechanism.** The "routines report, sessions write" rule rests on `auto-merge.mjs`
  refusing a queued landing while `git status --porcelain` is dirty. That script was deleted in
  `0c679b36` and `contracts/retired.json` lists it as retired since 2026-09-06. The two files now
  corroborate each other on something false in both. `scripts/check-retired-names.mjs` cannot catch
  it because it deliberately skips `docs/`.
- **Two files claim "nothing in CI ever notices that a week passed"** as the reason the weekly
  session runs `check:freshness`. `.github/workflows/weekly-audit.yml` runs `0 6 * * 1` and calls
  the same three checks, filing a GitHub issue when red. The weekly session duplicates a job that
  exists, and the stated reason for adding it is wrong, so nobody will reconcile the duplication.
- **`docs/ROUTINES.md:28` tells a routine to work on a branch without saying where that branch
  lives**, and the only location the file names is the main checkout. Followed literally it walks
  into `root/never-occupy-checkout-holds-feature-branch`.
- Smaller: `ROUTINES.md:73` and `:28` contradict each other on which routine is "the only one that
  acts"; `orchestrator-week.md:19` names a Part D the file never defines; `:47` lists three causes
  for a `check:freshness` red when `package.json` gives it four; `:154` points at the orchestrator's
  section 5 for a row shape that is in section 1; and `docs/ORCHESTRATION_REVIEW.md:326` is the last
  live doc naming the retired `nightly-ci-morning-report`.

I have not verified those ten myself beyond reading the review's evidence, and they are somebody
else's files, so treat them as leads rather than confirmed defects.

## Pointers

- The gate that was red: `scripts/check-tree-shape.mjs`, `ALLOWED_ROOT_ENTRIES` around line 47.
- The failing run: <https://github.com/NoaCG/NoaCG-Studio/actions/runs/34100940586>
- The branch's own files: `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, unmodified),
  `CONTRIBUTING.md`, `SECURITY.md`, and the owner-queue item named above.
