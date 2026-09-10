---
v: 2
kind: handoff
date: 2026-09-10
branch: claude/bd-drain-the-twelve
row: BD
---
# BD - the folder is empty again, and every item in it was traced first

**Done and queued.** `node scripts/handoff-drain.mjs` reports
`docs/handoffs/ holds no tracked handoff files - nothing to drain`, before this file puts one back.
Twelve files went. Every open item in them was checked against the working tree rather than taken
from its author's own "what is left" heading, and the five with no home are filed in
`docs/backlog/`. The twelve are recoverable in full at `git show 4f95444b:docs/handoffs/<name>`,
which is the tip they last existed on and the sha every new citation points at.

Three commits: `8c6bfa11` (the new and extended backlog files), `b88a6d9d` (the deletions),
`2f12fcbc` (the pre-merge review's eight fixes).

## The trace, one line per file

| handoff | open items | where they are now |
|---|---|---|
| `ab-reap-codex-delegation-tree` | pre-fix families out of reach; the session-start hook is silent about delegation families; `ram-reclaimer.md` describes half a problem | the first is CLOSED by AV's `adoptableBrokers`, which adopts an unrecorded finished broker (`scripts/codex-rescue.mjs`); the second is new `the-delegation-reaper-has-two-edges-left.md`; the third is a paragraph added to `ram-reclaimer.md` naming `orphaned-codex-delegation-tree` at `scripts/ram-reclaim.mjs:44` |
| `ac-harness-verdict` | the orchestrator-in-Codex ask; the effort question; two owner questions; six traps | `docs/backlog/orchestrator-runs-the-same-in-codex.md`, which AC updated; new `the-effort-trial-expires-on-a-ledger-that-cannot-settle-it.md`; `docs/acceptance/owner-queue/2026-09-09-the-honest-harness-verdict.md`, present; the traps split - the Codex startup banner is in `scripts/harness-capabilities.json` and the orchestrator backlog item, `tasklist /FI` is at `scripts/codex-rescue.mjs:162`, the guard shapes are in `machine-traps-that-belong-in-mistake-triggers.md`, `ALLOW_AI_MENTION` is in `scripts/hooks/guard-command.mjs` and the traps file, and the moving ledger is now a paragraph in the effort item |
| `ad-drain-the-folder` | none - its own trace table covered the previous eleven; two advisory notes | the "look here first if a deletion was wrong" note is advisory and is repeated below; the path-grep lesson is in `docs/HARNESS_ROUTING.md` where AD put it, and this row obeyed it |
| `ae-cli-0-3-1` | the neutral-scaffold bench; the review's fifth finding; the `stdout.columns` trap; the arity-table root cause | `docs/backlog/neutral-scaffolds-fail-their-own-stress-bench.md`, present and rewritten around measurements; the fifth finding is item 2 of new `cli-defects-a-review-found-after-its-branch-had-landed.md`, now measured properly; the pipe-width trap is enforced by `cli/src/commands/types.ts:39` and pinned by `cli/test/types-table.test.mjs`; the arity table is item 1 of the same new file |
| `ag-ograf-external-renderer` | no frames committed; the walk not re-run since the fix; the renderer not vendored; which renderer Yle brings; the job-cost mechanism; the rAF trap | the first three are **row BF's this wave** and are deliberately not filed; the Yle question is `docs/acceptance/owner-queue/2026-09-09-g-yle-network-diag-screenshot.md` §2, which already carries it; the job-cost mechanism is **row BC's, on `claude/ay-per-job-cost` / pull request 216** - a pointer went into `a-live-landing-starves-every-browser-job.md` instead of a new file, see the near-miss below; the rAF trap is `docs/OGRAF.md`, "Anything measuring MOTION in a hidden page is measuring the throttle" |
| `ah-publish-0-3-1` | the npm trusted-publisher fix; how to finish the publish; the loglevel finding; five findings about landed code | `docs/acceptance/owner-queue/2026-09-09-ah-npm-still-thinks-the-repository-is-yours.md`, which carries the route, the re-run instruction and the warning against dispatching against `main`; the session-side half is a new section in `the-release-path-cannot-say-why-a-publish-was-refused.md`; the loglevel fix is that file's item 1; the five findings are the new `cli-defects-…` file |
| `ak-teams-instructions` | TEAMS_PLAN stage 4; nine screen defects; the join-code alphabet | `docs/TEAMS_PLAN.md` §7 and the test comment in `e2e/docs.spec.ts` that says which assertions die with it; `docs/backlog/the-team-dialog-makes-you-guess-nine-times.md`, present; the alphabet is §3 of that same file |
| `aq-phantom-landing` | nothing, in its own words; `npm run learn`; a sentence for `night.md`; the corrected cause | the fix, the cause, the tick numbers and the cross-reference are at `scripts/wave-tick.mjs:154-171`, and six tests pin it; the two leftovers and the corrected cause are new `two-git-reads-a-second-apart-read-as-a-state-change.md` |
| `as-advisor-gate-red` | the gate's CI half; the suspended-owner finding; three unverified `cli/` claims; the migration trap | `docs/backlog/advisor-gate-runs-nowhere.md`, which also carries the migration trap at its lines 105-107; `docs/backlog/a-suspended-account-can-still-write-its-own-team.md`; the three claims are the Evidence section of the new `cli-defects-…` file, marked unverified, with one of them checked and found to name the right line |
| `at-flakes-nobody-sees` | no Monday report read yet; `red-main-issue.mjs` drops `reason`; the configured quarantine; three machine traps; the 180 s flake | the first two are new `the-red-main-alarm-still-cannot-name-what-it-could-not-name.md`; `docs/backlog/the-configured-suite-has-no-quarantine.md`, which AT unblocked in its own text; the traps are in `machine-traps-that-belong-in-mistake-triggers.md`; the flake is named below and NOT filed |
| `av-reap-at-delegation-end` | the exit-3 removal path; the `mcp.ts` name collision; `poll`'s job-less record; a null workspace | `docs/backlog/worktree-removal-reads-a-failed-reap-as-an-empty-directory.md`, which also gained the null-workspace shape because AV said it belonged there; the collision is item 3 of the new `cli-defects-…` file; `poll`'s record is the new `the-delegation-reaper-…` file |
| `aw-delegated-review-scope` | the fix is measured once; `needs-owner: harness`; four traps | both open items are in `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`, which is the receipt AW pointed at; the stamp trap is `docs/backlog/check-verdict-stamp-unwritable-from-isolated-worktree.md`; the guard shapes are in the machine-traps file; the `git()` trim is a comment in `scripts/review-request.mjs` at the point of temptation |

## The near-miss, which is the thing worth reading

**I wrote a backlog file for work another row was landing while I wrote it.** AG's job-cost finding
- `costOf()`'s comment says a job records its cost when it is queued and `addJob()` never writes one
- is real, and I re-derived it against `scripts/jobs-store.mjs` before filing
`a-browser-job-cannot-say-how-small-it-is.md`. Then I read this wave's own plan for a different
reason and found row BC adopting `claude/ay-per-job-cost`, whose `MINTS` line is "the job-cost
mechanism", with pull request 216 already open. I deleted the file and left a paragraph in
`a-live-landing-starves-every-browser-job.md` instead.

The collisions contract warns about a backlog item filed by a LIVE session. This is the same
failure from the other end: **a DRAIN reads a handoff written the night before, and the thing that
handoff wanted may already be somebody's row today.** Nothing in the drain procedure says to check
the current wave plan's `MINTS` column before filing, and it should - it is one read, and the
alternative is two rows building one mechanism. Filed nowhere yet, because the procedure lives in
`.agent-workflows/orchestrator/collisions.md` and that chain is at its byte ceiling
(`check:shared-instructions` reports the orchestrator core at 199/200 lines and the common path at
640/640, measured today). Whoever has budget there should add the sentence.

## Dropped as optional, named rather than filed

Following the precedent AD set, so the judgement can be reversed rather than guessed at.

- **`e2e/configured/production-links.spec.ts:20` timing out at 180 s and then passing in 8.7 s on
  retry.** AT called it "candidate AU's to understand" and deliberately did not quarantine it. It is
  not filed, because the instrument that would measure it - `scripts/ci-repeat-failures.mjs` and the
  per-spec annotations `scripts/configured-verdict.mjs` now emits - landed the same night and has
  never produced a report. Filing an item to investigate one flake, six days before the tool that
  finds flakes reports for the first time, manufactures a row. The first Monday report is
  2026-09-15; if that spec is on it, the item writes itself with evidence.
- **AC's "read Codex's startup banner rather than writing another sandbox probe."** It is already
  in `scripts/harness-capabilities.json` and in `docs/backlog/orchestrator-runs-the-same-in-codex.md`,
  and a third copy would be the thing this row exists to stop.
- **AG's generalisation that the rAF throttle applies to any Playwright page in a multi-page
  context, not only to a hidden browser pane.** `docs/OGRAF.md` says "Anything measuring MOTION in a
  hidden page is measuring the throttle", which covers it for anyone who reads that file. What is
  NOT covered is a spec author who never opens `docs/OGRAF.md` - a sentence in `e2e/AGENTS.md` would
  reach them, and I did not write it because no spec in the tree opens a second page today, so it
  would be a rule with no reader.

## Evidence and traps that exist in no repo file

- **The delegation was worth it and its VALUE was not the answer.** Codex (`gpt-5.6-sol`, high) took
  42 minutes on the citation sweep and returned 19 sites, every one of them either inside the twelve
  or a citation I had written myself minutes earlier. My own grep, run in parallel, found the same
  picture. The delegation's worth was the INDEPENDENCE - two chains reaching the same "nothing
  outside the folder cites these" - not the finding, and a sweep whose honest answer is zero is
  exactly the shape where one instrument cannot be believed on its own. Recorded on the ledger as
  `reviewed`.
- **Four prose sites name these rows and none needed repointing, which is not the same as none
  existing.** `.agent-workflows/check.md:119`, `scripts/review-request.mjs:22`,
  `docs/backlog/antigravity-cannot-grep-so-sweeps-routed-to-it-return-nothing.md:48` and
  `docs/backlog/the-release-path-cannot-say-why-a-publish-was-refused.md:3` all say "row AT" or
  "session AH". Each states its own fact and cites something durable beside it, so the row letter is
  attribution rather than a pointer. **That is the test to apply**, not "does the word 'handoff'
  appear": a citation needs repointing when the fact lives only in the file being deleted.
- **One live document was telling the owner something that had stopped being true.**
  `docs/acceptance/owner-queue/2026-09-09-ae-the-cli-one-version-better.md` said publishing 0.3.1
  needed nothing from him. AH's attempt that night proved otherwise, and AH's own owner item says so
  - but a person walking the queue meets these one at a time and would have read the older one as
  current. Corrected. **Owner-queue items go stale the way handoffs do, and a drain is the moment to
  notice**, because the evidence that they went stale is in the files being deleted.
- **The pre-merge review earned its place on a documentation branch, which I would not have
  predicted.** Eight findings, all real, all about factual claims in prose. Two were the kind that
  becomes a wasted row: the four verbs with the wrong stray-word advice are not all fixable the way
  my file prescribed, because `docs` and `inspect` read no flags at all; and the types table's
  overflow starts at a 27-character type id, not at the 19 my file implied - I ported the allocator
  and ran it to settle that. **A backlog file's content is claims about code, so it wants a code
  review, not a proofread.**
- **The delegation ledger moved under me.** I read 28 lines and four medium-effort rows, then
  recorded this row's own delegation, and the review read 29 and three. My "four" was wrong
  independently of that - the file's own table listed three. Timestamp any count taken off
  `~/.noacg/delegation-outcomes.jsonl`; AC recorded the same hazard the night before.

## The merge-order hold, overruled deliberately

`node scripts/merge-order.mjs --branch claude/bd-drain-the-twelve` returned **`hold`**: this branch
"renames or deletes 4 path(s) that `claude/ay-per-job-cost` also edits", naming three of the twelve
handoffs, and advised landing `claude/ba-ladder-frame-detach` first. I queued anyway. A merge
question is never the owner's, so here is the reasoning where he can revert it.

- **There is no measured conflict.** The same command's `--json` gives this branch
  `conflictsWith: []` and `imposed: 0`. `git merge-tree --write-tree origin/main` against this
  branch produced a tree and no conflicted paths.
- **The overlap is in another session's SCRATCH, not its work.** `merge-order.mjs:540` builds each
  branch's file set from `[...branch.files, ...branch.uncommitted]`. The committed diff of
  `claude/ay-per-job-cost` against `origin/main` is six files - `docs/JOB_RUNNER_PLAN.md`,
  `scripts/jobs-store.mjs`, `scripts/jobs-store.test.mjs`, `scripts/jobs.mjs`, its own owner-queue
  item and its own handoff - and **not one of the three it is said to collide on**. The overlap is
  entirely inside that worktree's 33 uncommitted files.
- **The advice is unactionable by construction.** Both branches involved are in the tool's own
  `notReady` list: `claude/ay-per-job-cost` for 33 uncommitted files and
  `claude/ba-ladder-frame-detach` likewise. Holding for either is waiting on something that cannot
  wake this session, which is the failure the row contract names by name.
- **The wave plan already allocated this.** Row BD's `MINTS` line is `docs/handoffs/ (the twelve
  deletions)`, which is the up-front allocation `.agent-workflows/orchestrator/collisions.md` asks
  for. Row BC's own prompt scopes it to four files, none of them a handoff, and ends "Nothing else
  on this branch."
- **And the queue's own rule covers the residue**: whichever lands second integrates `main`. If that
  worktree really is holding those files dirty, it meets the deletions when it takes `main` in,
  which is the normal rhythm rather than a failure.

**The reusable half**: `merge-order` counting uncommitted files as a branch's declared work makes a
live session look like it owns every file it happens to have touched. That is right for a shared
edit and wrong for a rename or delete, where it manufactures a hold against work nobody declared.
Not filed as a defect, because the tool is deliberately advisory and erring towards a hold is the
safe direction - but a reader who takes its verdict as binding will wait for nothing, and this is
the second such hold in two days (`.agent-workflows/queue-merge.md` carries the 2026-09-09 one).

## Anything that needs the owner

**Nothing from this row.** Two items that need him are unchanged and were already routed before I
started - the npm trusted publisher (`2026-09-09-ah-npm-still-thinks-the-repository-is-yours.md`,
`needs: account`) and the two harness questions on
`2026-09-09-the-honest-harness-verdict.md`. This row made the first of those findable from the CLI
release item too, which is the item he is more likely to open.

## The check

`check: review delegated, simplify inline, verify inline. taste: not applicable.`

- **`review: delegated`, and it SCOPE-CHECKED CLEAN.** Invoked with exactly what
  `node scripts/review-request.mjs` printed. It reported merge base `4f95444b` and the handed list of
  11 changed plus 13 deleted, which is exactly `git diff --name-only 4f95444b..HEAD` with a clean
  `git status --porcelain=v1`. Eight findings, every one verified against the source before acting,
  all eight fixed in `2f12fcbc`. Two were substantive (above); six were counts and line numbers. It
  also read 30-odd files outside the diff to check my claims against them, which is correct for this
  kind of change and is why it found what it found.
- **`simplify: inline`.** The skill returned fan-out instructions, which `.agent-workflows/check.md`
  phase 3 classes as not run, so the four angles were covered here. Reuse turned up the item I had
  missed - AB's third bullet about `ram-reclaimer.md`, now a paragraph in that file rather than a
  new one. Altitude turned up the sentence the `cli-defects-…` file needed: the five defects matter
  less than the fact that a finding about an ALREADY LANDED branch has no relay target and no
  default home, which is why three sessions each wrote theirs into a handoff. Simplification and
  efficiency found nothing to change in prose.
- **`verify: inline`.** `npm run build` exit 0, read from the build's own exit code rather than
  through a pipe, three times: over the new backlog files, over the deletions, and over the review's
  fixes. The version stamp read `claude/bd-drain-the-twelve@4f95444bad`, which is how I know it
  gated this branch and not the primary checkout. `node scripts/owner-receipts.mjs --check` green at
  41 receipts. `node scripts/handoff-drain.mjs` reports the folder empty. No e2e: no product code
  changed, and `node scripts/e2e-affected.mjs` maps nothing.
- **CI**, run `34444703328` on `b88a6d9d`, read job by job: Build, Factory gates, E2E plan and CI
  gate all success; the E2E shards, the catalog gate and Vercel skipped by CI's own plan job, which
  is correct for a documents-only diff. `Reviewed` failed, and that is the designed flow rather than
  a defect - its log says `no passing noacg/reviewed ... queue with npm run queue:merge, which posts
  the /check stamp`, and the stamp is written at the end of this workflow. The run for the tip
  `2f12fcbc` is read before this branch queues.
- **`taste: not applicable`.** The diff is backlog files, one owner-queue item and twelve deletions.
  Nothing in it can move what a graphic looks like.

## Pointers

- The twelve are at `git show 4f95444b:docs/handoffs/<name>` - that is the tip they last existed on,
  and every new backlog file cites them that way.
- Five new backlog files: `cli-defects-a-review-found-after-its-branch-had-landed.md`,
  `the-delegation-reaper-has-two-edges-left.md`,
  `the-red-main-alarm-still-cannot-name-what-it-could-not-name.md`,
  `the-effort-trial-expires-on-a-ledger-that-cannot-settle-it.md`,
  `two-git-reads-a-second-apart-read-as-a-state-change.md`.
- One rename: `three-machine-traps-belong-in-mistake-triggers.md` ->
  `machine-traps-that-belong-in-mistake-triggers.md`, because it now holds nine. Nothing cited the
  old slug; that was checked before the rename, not after.
- Four files gained a section rather than spawning a sibling: `ram-reclaimer.md`,
  `worktree-removal-reads-a-failed-reap-as-an-empty-directory.md`,
  `the-release-path-cannot-say-why-a-publish-was-refused.md`,
  `a-live-landing-starves-every-browser-job.md`.
- **Where I would look first if a deletion turns out to have been wrong**: `ac-harness-verdict`, and
  specifically its six traps. That file traced to five different places and a judgement about which
  were already covered; everything else traced to something I could point at.
- **One dated thing nobody is watching**: the medium-effort trial expires **2026-09-16**, six days
  out, and the ledger it names cannot settle it. That is the whole content of
  `the-effort-trial-expires-on-a-ledger-that-cannot-settle-it.md`, and it is the only item here with
  a clock on it.

## Safe to archive

Yes, once the queue lands it. Nothing uncommitted, the branch is pushed, and this file carries what
the next session needs.
