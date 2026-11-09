# Phase 3 evidence

The [closeout](../../../metrics/2026-11-08-codebase-health.md) is the AC-8 result. The source pin
is the exact Phase 2 merge `df5767458230558e9fdee158e663e9367e58f8e3`. Its
[independent acceptance receipt](https://github.com/NoaCG/NoaCG-Studio/pull/2288#issuecomment-6721248732)
covers the maintenance sample and records the reducer ownership correction. The
[production owner closeout](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6686105172)
remains the production authority, including the formal evidence gaps it records.

## Reproduce the arithmetic

Use a full Git checkout. Both pins are reachable, the repository is not shallow and no replace
refs were present. In the commands below, use the pinned `BASE` and `PIN` from the closeout
for November, or the matching baseline and pin from [October](measurements.json).

```sh
git log --first-parent --format='%H %ct' "$PIN"
git log --first-parent --full-history --diff-merges=first-parent --no-renames --numstat \
  --format='COMMIT %H %ct' "$BASE..$PIN"
git show "$BASE:$PATH_IN_REPO"
git show "$PIN:$PATH_IN_REPO"
```

Take the first ancestor on the chain at or before the 30-day start as the baseline. Filter the
committer timestamps to the documented windows. For each listed path, count unique commit IDs
with a numstat row, including zero-net edits. Use the union for each two-path lineage. Count
physical lines in the endpoint blobs with CRLF and lone CR normalized to LF, including blanks,
comments and a final unterminated line. The endpoint difference agrees with summed additions
minus deletions. An absent endpoint contributes zero for that path. The old path's temporary
one-line AI shim is a transition, and neither endpoint includes it.

For the AI move, run `git diff --find-copies --name-status 15b26a6c9^1 15b26a6c9 -- '*AiStep.tsx'`.
Git reports the 99% copy because the old path remains as a one-line re-export. Inspect its
removal at `9dfb0f25f`. For S8, run `git diff --find-renames --name-status 6e44a0abe^1 6e44a0abe`.
The S8 renames have 97% similarity for `kitPlan.ts` and 98% for `KitTray.tsx`. Use the
first-parent pairs in the [Phase 2 review](maintenance-review.md) for the ordinary cases.

For budget replay, set `OCT` to the October pin and `PIN` to the November pin.

```sh
git rev-list --first-parent --count "$OCT..$PIN"
git log --first-parent --full-history --diff-merges=first-parent --no-renames --numstat \
  --format='COMMIT %H' "$OCT..$PIN" -- scripts/file-budgets scripts/file-budgets.json \
  src/components/wizard/CreationWizard.tsx src/components/wizard/ai/AiStep.tsx
```

The eight integrations with rows are `2fea5f49b`, `8d48e2c5e`, `302d565be`, `9a06d3850`,
`fa4b26dcc`, `9679c72c5`, `20052b7e0` and `8beeab7ca`, in first-parent order. For each
and for the October starting tree, read both budget JSON files and the blobs named by their
`file` fields using `git show <sha>:<path>`. Compare physical lines with the corresponding
`lines` field. The other 642 integrations have identical inputs to their first parents.
At `fa4b26dcc` compare its first parent to the merge for the shell and `shell/walkLibrary.ts`,
then read [the PR's reason for that change](https://github.com/NoaCG/NoaCG-Studio/pull/2101).
This distinguishes observed patch work from rejected work invisible in main history.

## Scope and verification

The worker used a fresh local Codex context and its own branch worktree. The GitHub and resource
preflights passed. Pinned Git replay matched the October hotspot rows, the November counts and
move-adjusted totals, and the budget states above. The budget script also read the two expected
files and passed at the source pin. The S9 issue and pinned wizard evidence were checked for a
revisit. The [current CI/CD allocation](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6693962369)
exempts docs. [#2261](https://github.com/NoaCG/NoaCG-Studio/pull/2261) and the recovery checkpoint
`d67cbcdaa5aa270220c9711a81ba62ccb36faa1e` had disjoint file allocations.

Verification uses source, document and PR evidence. No new product, browser, hardware or
production checks were needed for this documentation phase. The pull request carries the
targeted gate and review results. Independent acceptance belongs to the landed revision.
