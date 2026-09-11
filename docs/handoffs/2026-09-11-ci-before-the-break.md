# 2026-09-11 - CI before the break: the revert rule, the flaky test, and the night's findings

Branch `claude/ci-before-the-break`. Commits `8e24159a` (revert rule), `5e0eb976` (contract walk),
`8d19c938` (four findings), `ffe867c2` + `4304b240` + `9aa23658` (deck corrections and the item
fold), `b5961d6b` (handoff drain), and the review fixes committed with this file.

## What is left, and why

- **A flaky Build now leaves main red, and that red blocks the NEXT landing's revert.** This is the
  price of the fix, found in review and not paid down here. A unit test has no quarantine, so a
  Build that fails and then passes its re-run keeps the gate red on purpose, and the red-main issue
  names it as a flaky test. But `lastVerdictBefore` then records that commit as a failure, and a
  genuine break in the landing after it is refused as "main was already red". The fix is for
  `lastVerdictBefore` to treat a run whose only failures were confirmed flakes as no verdict, which
  needs each run's job conclusions (`rerun: success`) and so an API call per walked run. Over a
  quiet break the next landing is usually green and closes the issue, so this was left for a row
  that can measure the cost.
- **The `rerun` job has never run.** It fires only on a push to main whose Build or Factory job
  failed, so no branch or pull-request run can reach it. `check-workflows.mjs` validates it, the
  unit tests pin the rule it feeds, and the first real main failure is its first run. Read that
  run's job list.
- **Only Build and Factory are re-run.** A failure in the catalog gate or the E2E plan gets no
  second run, so it never reverts; the issue says so. That is the conservative direction.
- **Commit `4304b240` is titled for the deck-item fold but also deletes the six handoffs**, because
  their deletions were already staged. The carried facts and repointed citations are in
  `b5961d6b`. The content is complete; only the split is misleading. Rewriting a pushed branch to
  fix a message was not worth the risk.

## The flake: reproduced as a mechanism, not naturally

"a conflicted generated contract is replaced by what the store currently renders" did NOT fail in
25 runs alone, nor in one full build-tier run. What reproduced it: a recursive `fs.watch` over the
checkout during that full run saw 139 transient paths under six `.tmp-api-runtime-*` directories
(`scripts/api-runtime-build.mjs` makes them at the repo root). The contract compiler walks the
whole checkout with `readdirSync` and did not skip them, so one vanishing between listing and
reading throws `ENOENT: scandir`, the compile exits 1, and the merge driver keeps git's conflicted
file - exactly the failed assertion, with a 19 s duration on CI against 12.5 s alone. Churning
`.tmp-` directories beside the real compiler killed it 2 times in 10; after the fix, 0 in 10 with a
`.tmp-` prefix and 0 in 10 with a plain one. CI's own failure discarded the driver's stderr, so the
ENOENT on CI itself is inferred, not read; the test now prints the driver's output if it ever
fails again.

The fix is in the compiler, not a temp dir for the test. The store's validation requires every
`fires:` mechanism to exist in the tree and to print its rule, so a hermetic copy would have to be
most of the repository. And the crash was the compiler's: `npm run contracts:compile` run while
tests are running would hit it too. `write()` also stops rewriting byte-identical files, so the
test no longer truncates contracts other tests read.

## Row CA's worktree is safe to clean

`C:\claude\NoaCG-Studio\.claude\worktrees\agent-ae47713a44213dee3` is clean, and
`claude/ca-deck-and-demo-doc` has no commit that `main` lacks: CA did not die, it came back and
landed the deck as pull request 250. This branch first rescued CA's files as an independent rebuild
(`deebb8ff`), then reverted that (`fc44a302`) when a peer session reported 250, and put its three
slide corrections (2, 3 and 5, which CA's rebuild had not touched and which still contradicted the
script) on top of CA's landed deck instead. `cleanup-worktrees` may take it.

## Evidence and traps that exist in no repo file

- **`git reset --keep` was refused by the auto-mode classifier** on an unpushed branch; `git revert`
  was the route that went through.
- **The commit-message hook blocks any message naming Codex or Claude**, including one about the
  delegation tooling itself; `ALLOW_AI_MENTION=1` in the command is its documented bypass.
- **LibreOffice is at `C:\Program Files\LibreOffice\program\soffice.exe` and PyMuPDF is
  importable**, so a deck is checked with no browser: `soffice --headless --convert-to pdf`, then
  `pymupdf` renders each page to PNG. `pdftoppm` is not installed.
- The owner-queue item for the deck is now one file,
  `docs/acceptance/owner-queue/2026-09-10-ca-the-deck-now-ends-at-our-own-player.md`.

## check

Stamped over the commit that carries this file. Scope from `review-request.mjs`: base `c7545327`,
34 files changed and 7 deleted, matched by this worktree's own diff (41 paths). **review: inline,
4 findings / 3 fixed** - the misplaced `logIdleSeconds` JSDoc, the re-run reason implying an
un-re-run job passed, and a consolidation entry breaking a count in `OWNER_QUEUE.md`; the fourth is
the flake-red limit above. **simplify: inline**, nothing changed; the `rerun` job's copy of the
Build and Factory steps was left because a shared action would edit the original jobs, and reading
failed jobs' logs on each poll was left because the logs are small. **verify: inline** - `npm run
build` exit 0, and CI on the pushed tip. **taste: not applicable** - nothing here moves what a
graphic looks like; the deck is a presentation and was checked by rendering every changed slide.

No owner receipt is served, and nothing here needs the owner.
