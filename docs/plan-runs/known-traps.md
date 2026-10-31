# Known traps for plan-run workers

Every plan-run brief links this file instead of pasting it, so a trap is written once and cannot
drift between briefs. Read it in full before you start. A coordinator that meets a new trap, or
sees one go away, changes this file on `main` (a small docs PR); workers read it at their source
SHA. What is specific to one plan (a production switch that stays off, a key never to read) is in
that plan's brief, not here.

## Landing

- **The coordinator stamps, you do not.** In a plan run the coordinator posts the `noacg/reviewed`
  stamp and turns auto-merge on, after checking your gates. Run `/check` and the cloud path of
  `/queue-merge` up to an open PR with the worker gates below green on your reviewed head, then stop and put
  the PR and the reviewed SHA in your receipt. Never dispatch `cloud-queue-merge.yml` with a
  verdict or enable auto-merge yourself: the harness refuses that as self-approval for some
  sessions and not others, and one path for every PR is what keeps the run predictable.
- **Worker gates on your reviewed head:** CI gate, the Codex review finished and its
  findings handled (ask `@codex review` again after each fix push; Codex reviews only on open or
  on that request), and the configured-suite run you dispatched on that head finished green, not
  merely started. The coordinator verifies its `head_sha` equals your reviewed head. Reviewed
  itself is not a worker prerequisite: it may be pending or red until the coordinator stamps.
  After posting the pinned stamp the coordinator enables auto-merge with head checks before and
  after; GitHub still requires Reviewed and all required checks before admitting the PR. Recover
  an earlier Reviewed timeout through queue-merge, without delaying the auto-merge request.
- **Cloud GitHub access:** `gh`'s GraphQL commands (`gh pr view`, `gh pr merge`) are refused in
  cloud sessions. Use REST (`gh api`) or the GitHub tools, as the cloud path of `/queue-merge` says.
- Other plan-run PRs land meanwhile. If yours conflicts, merge `origin/main` into your branch;
  never rebase a pushed branch.

## The configured suite

- Dispatch it on your own branch: `configured-suite.yml` keeps one pending run per branch, so your
  dispatch no longer cancels another branch's. Never cancel a run you did not start.
- It is four shards and takes about 12 minutes. Wait for it in a background job, so a cloud machine
  is not reclaimed; if your container restarts, start that wait again.

## A red gate

- **Fails, then passes on the same commit:** a flake. It goes to the quarantine route in
  `.agent-workflows/queue-merge.md` plus an issue, never a re-run chase. One re-run is allowed only
  for an infrastructure death (a runner lost, a service down), after a PR comment saying so.
- **Fails outside what your change can reach:** run a control on `main` without your change (the
  same workflow on your PR's base). If the control fails the same way, or the failing part is out
  of your diff's reach, file it as its own issue with both runs, say so in the PR and your receipt,
  and let the coordinator decide; it may accept the PR with a written reason in the ledger. Never
  change the judge: no test, threshold, timeout or workflow edit to get past it.
- Quarantined specs are listed in `e2e/quarantine.json`; read it rather than a list in a brief.

## Branches and machines

- Push only your own branch. Never push a diagnostic branch: run diagnostics locally or with a
  workflow input on your own branch. A cloud session cannot delete a branch it pushed, so every
  extra branch stays behind.
- **Playwright browser mismatch (#1647):** the session-start hook links a missing pinned build
  (for example `chromium_headless_shell-1228`) to the image's build under `/opt/pw-browsers`. A
  session started from an older commit can still miss it: symlink the folder by hand, with no
  repository change. Never run `playwright install`.
- Keep each new e2e test within the per-test ceiling:
  `node scripts/check-e2e-protection.mjs --changed origin/main`.
- Never merge or push `main`, never touch another worktree, and leave nothing running.

## Docs and reconciliation phases

- Just before you queue, read again every issue and PR your docs cite and correct anything that
  changed since you started. Fixes land while docs phases run; a matrix written in the morning can
  be wrong by the evening.

## Production and credentials

- Never change production settings or data, never query a production database, and never read or
  print a key or credential. A runbook or receipt you write contains none either: the repository
  is public.
