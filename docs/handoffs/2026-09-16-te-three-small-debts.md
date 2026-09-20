---
v: 2
kind: handoff
date: 2026-09-16
branch: claude/te-three-small-debts
row: TE
---
# TE - three small landed debts, and the 2026-09-16 handoff drain

**Done and queued.** Step 2 (the shared merge-driver helper) turned out to already be landed on
`main` before this branch started - no change was made there. Step 3 (the alignment-answers fix)
is landed. Step 4 (the eleven-handoff drain) is landed: all eleven deleted, every open item traced,
one citation repointed, five items with no existing home given a minimal backlog file rather than
left stranded.

## Step 2 - the shared merge-driver helper: already done

The recipe's premise was that `scripts/package-merge-driver.mjs` and
`scripts/contracts-merge-driver.mjs` each carried their own copy of `isInstalled`/`install`/
`registeredCommand` and needed one `registerMergeDriver()`-shaped helper between them. That work
already landed at `97714e64` ("Repair the package.json merge driver's registration, and share it
with contracts"), part of row SH's branch, merged into `main` before this branch's merge base
(`20d4b094`). `scripts/merge-driver-registration.mjs` exists, and both installers already import
`isInstalled`/`install`/`registeredCommand` from it (`scripts/package-merge-driver.mjs:59-61`,
`scripts/contracts-merge-driver.mjs:44-46`). I verified this by reading both files and their git
history rather than assuming the recipe was current - `docs/handoffs/2026-09-16-sh-package-driver-
cannot-rot.md` (now deleted, its content traced below) confirmed it explicitly: "Both drivers ended
up sharing one helper... the recipe treated as a stretch goal." **The recipe was written before
that landed and was not refreshed** - a planning gap, not a product judgement call, so I did not
invent new work here. Both test suites (`package-merge-driver.test.mjs`, `contracts-merge-driver
.test.mjs`, 54 tests combined) pass unchanged.

## Step 3 - alignmentState() treats a recorded id as answered

`scripts/alignment-answers.mjs`'s `alignmentState()` checked `docs/OWNER_RULINGS.md` for an id
only after routing an unanswered weekly entry to `open`. A question the owner settled in chat -
recorded straight into `OWNER_RULINGS.md` without anyone going back to fill in the weekly file's
own blank `**Answer:**` line - kept printing OPEN at every weekly session forever, exactly the
repeated-question cost the row prompt named. Fixed by checking `mentionsId(rulings, entry.id)`
first, before the `answered` branch, so the rulings file always wins.

Verified both ways, as the row prompt asked: `scripts/alignment-answers.test.mjs`, "an id already
in the rulings file reads as answered, even while the weekly Answer line is blank" - the id prints
under `open` before the ruling is recorded, and under `recorded` (never `open`) after. Full suite:
`node --test scripts/alignment-answers.test.mjs` reports 20 tests, 20 pass, 0 fail (19 pre-existing
plus this new one).

## Step 4 - the eleven-handoff drain

The plan's `## Handoffs` section in `.git/noacg-jobs/wave-plans/2026-09-16-night-wave-plan.local.md`
names exactly eleven files as `consumed` or `spent`:

`sa-link-opens-the-graphic`, `sc-two-space-modes`, `sd-one-page-indexes`, `si-what-an-account-is-
for`, `sj-stop-wait-reaches-the-row`, `es-browser-holder-convergence`, `sb-cli-exits-and-r25`,
`se-publish-and-retire-stale-cli`, `sg-growth-per-box`, `sk-what-october-needs`, `sh-package-
driver-cannot-rot` (all `docs/handoffs/2026-09-16-*.md` except `es`, dated 2026-09-16 too).

**All eleven are deleted.** For each, every open item traced to a landed commit, a live backlog
file, a live owner-queue item, or (for five items with no existing home) a new backlog finding
filed in this same commit:

| handoff | open item(s) | traced to |
|---|---|---|
| sa | gap-list row 14 (closed once 0.3.3 published) | the CLI rows R2.1/R2.4, both WORKS; `docs/backlog/noacg-login-hangs-after-it-has-already-succeeded.md` already deleted at `2987bd37` |
| sc | copy-gate blind spot; two taste questions | `docs/backlog/copy-gate-does-not-scan-generated-operator-surfaces.md`; `docs/acceptance/owner-queue/2026-09-16-sc-two-space-modes.md` |
| sd | printed sheet never proofed on paper | the sheets and their walk item were removed on 2026-09-20 with the rest of the teaching-session material |
| si | main work (landed); 3 deferred UI/copy fixes never filed | owner-queue `2026-09-16-si-what-an-account-is-for.md`; filed `docs/backlog/session-expired-reopen-shows-the-free-account-line.md`, `docs/backlog/auth-state-is-read-per-consumer-not-from-one-store.md`, `docs/backlog/no-wall-line-says-export-when-the-gate-is-a-cloud-render.md` |
| sj | none - "nothing blocking" | landed at `cebe51dd`; `scripts/stop-wait.mjs` MAX_REFUSALS/REFUSAL_WINDOW_MS confirmed present |
| es | coordinator must observe the landing; instruction-context-rot receipt | landed as `20d4b094`/`9e166c2c`; `docs/backlog/instruction-context-rot-after-spec-pilot.md` |
| sb | publish 0.3.3; login terminal watch; save-link-on-Home | 0.3.3 published (confirmed via `npm view`, row SE); owner-queue `2026-09-16-noacg-login-gives-the-terminal-back.md`; Home-link fixed, pinned by `deep-link-boot.spec.ts` |
| se | main work (landed); `doctor` not separately naming `resolveCli()` | owner-queue `2026-09-16-se-stale-global-cli-warns.md`; filed `docs/backlog/cli-doctor-does-not-name-what-resolvecli-would-resolve-to.md` |
| sg | rung 5 next; outline-row narrowing | `docs/TEXT_BOX_BINDING.md` "Growth, per box" (row TD is rung 5, running concurrently); owner-queue `2026-09-16-sg-growth-per-box.md` |
| sk | alignmentState deeper fix (this row's own); 2 owner-queue receipts misdate the class | fixed in this branch (step 3 above); filed `docs/backlog/two-owner-queue-receipts-misdate-the-20-october-class.md` (sk itself declined to edit the receipts - "not mine to rewrite" - so I didn't either; the decision is the queue owner's) |
| sh | none - "No open work on this item" | landed at `97714e64`; confirmed by reading `scripts/merge-driver-registration.mjs` directly (step 2 above) |

**Citations repointed:** grepped every deleted handoff's full and bare filename across the repo
(prose, paths and bare names). One live, non-deleted file cited a handoff directly -
`docs/handoffs/2026-09-10-be-agent-road-clean-profile.md:177` pointed at
`docs/handoffs/2026-09-16-sb-cli-exits-and-r25.md`; repointed to `docs/AGENT_CLI.md`, the 0.3.3
version-log entry, which carries the same fact and test pointer. Two other apparent hits
(`docs/acceptance/owner-queue/2026-09-05-you-can-see-whether-you-are-signed-in.md`,
`docs/backlog/teams-invite-join-code-and-what-a-new-member-sees.md`) were false positives on the
bare slug - both cite the still-live `docs/acceptance/owner-queue/2026-09-16-si-what-an-account-
is-for.md`, a different file in a different directory, not the deleted handoff. The two
`es-independent-review.md` evidence receipts name the branch `codex/es-browser-holder-convergence`
and "the dated ES handoff" in prose describing what they reviewed at the time - history, not a live
pointer needing the file to still exist, same as SH's own precedent for citations inside already-
landed handoffs.

## Why five items needed a new backlog file rather than just deletion

The row's instruction is explicit: "A file whose items you cannot all trace is NOT deleted." Five
open items (three in `si`, one each in `se` and `sk`) had been named precisely in their source
handoff but never filed anywhere durable - no backlog file, no owner-queue item, no commit. Rather
than leave three otherwise-fully-resolved, otherwise-drainable handoffs stranded over one loose
end each, I filed a minimal `kind: finding` backlog entry for each, in the exact format
`docs/backlog/README.md` and the existing corpus use, transcribing what the source handoff had
already decided (not inventing new judgement about priority or shape). `sk`'s item is the one
exception worth flagging on its own: the fix itself (editing two dated owner-queue receipts) is a
judgement call sk explicitly declined to make ("not mine to rewrite"), so the backlog file records
the finding without deciding the resolution - that stays the queue owner's call, same as before.

## Traps that exist in no repo file

- **The plan's "## Handoffs" list is the only authoritative source for which eleven files to
  drain** - do not infer the list from `git log` or from scanning `docs/handoffs/` for old dates;
  several other 2026-09-16 handoffs are marked `deferred` in the same section and must not be
  touched (`sf`, `h`, `hk`, `qd`, `qf`, `qj`, plus the whole 2026-09-09 through 2026-09-15 carry-
  forward list).
- **A bare-filename grep produces false positives across directories.** `docs/handoffs/` and
  `docs/acceptance/owner-queue/` both use the exact same dated slugs for related-but-distinct
  files (e.g. two different `2026-09-16-si-what-an-account-is-for.md`, one per directory). Grep
  the bare slug, then read every hit's full path before deciding it needs a repoint.
- **`npm run build`'s own test count moved between runs during this row** (1774/1776/1790 seen
  across different handoffs' verification sections) as other branches landed on `main` underneath
  this one; read the count from your own run, never from a quoted number in a handoff you are
  about to delete.

## Pointers

- The fix: `scripts/alignment-answers.mjs:202-211`, tested at
  `scripts/alignment-answers.test.mjs:252-264`.
- The already-landed helper: `scripts/merge-driver-registration.mjs`.
- The five new backlog files: `docs/backlog/session-expired-reopen-shows-the-free-account-line.md`,
  `docs/backlog/auth-state-is-read-per-consumer-not-from-one-store.md`,
  `docs/backlog/no-wall-line-says-export-when-the-gate-is-a-cloud-render.md`,
  `docs/backlog/cli-doctor-does-not-name-what-resolvecli-would-resolve-to.md`,
  `docs/backlog/two-owner-queue-receipts-misdate-the-20-october-class.md`.
- The repointed citation: `docs/handoffs/2026-09-10-be-agent-road-clean-profile.md:177`.
- Commit: `96eb3c63`. Check stamp: `review delegated`, `simplify inline`, `verify inline`, PASS.

## Check

`npm run build`: exit 0, 1790 tests / 1790 pass / 0 fail, read from the command's own exit code.
`review: delegated` (0 findings; scope-checked against `git diff --name-only 20d4b094..HEAD` plus
clean `git status --porcelain` - exact match, 8 files). `simplify: inline` - the skill returned
its 4-agent fan-out instructions, so the four angles were worked directly over the same 8-file
diff; nothing to fix, the change is a three-line reordering plus five backlog files in the
established format. `verify: inline` - build already green at this commit's sha, tree clean, no
product code (`src/`) touched so no e2e run needed. `taste: not applicable` - no graphic or UI
code changed.

Verdict stamp written after commit, at `96eb3c63`: `review delegated`, `simplify inline`, `verify
inline`, PASS.

## Queue

`npm run build` gate: green. `/check`: complete, stamped PASS. Queuing next.
