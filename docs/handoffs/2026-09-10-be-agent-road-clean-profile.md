---
v: 2
kind: handoff
date: 2026-09-10
branch: claude/be-agent-road-clean-profile
row: BE
---
# BE - the agent road, re-run on a profile that had never seen it

**What this row owed.** §7 rows 6, 8 and 9 of `docs/DEMO_2026-09-25.md`, each backed by a dated
run, plus the owner's three answers of 2026-09-10 applied in the same commit.

**All three rows are closed and deleted.** The four install lines run on a clean profile and exit
0, the `noacg-mcp` split is verified on Codex, and the live save was walked against
`noacg.studio` with both stopwatches on it.

**Closing row 8 opened row 14**, and that is the part worth reading. Walking the save against
production rather than a dev server produced the numbers R2.5 was missing and TWO defects a green
spec cannot see: the link `noacg save` prints does not open the graphic on `noacg.studio`, and
`noacg login` hangs after it has already succeeded. Both are filed with their measurements.

## What was actually run, and what it does not prove

**The clean profile was a directory tree, not a Windows account.** `C:\noacg-be-clean` with
`USERPROFILE`, `APPDATA`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `npm_config_cache` and
`npm_config_prefix` all pointed into it. `GIT_CONFIG_GLOBAL` was deliberately left at the real
`.gitconfig`, since git identity is not part of what an install line proves. Node, npm, Chrome,
Edge and the two agent binaries were already on the machine and on `PATH`, so **this run says
nothing about a student installing those first.** The full table of what was reset, why, and the
timings is `docs/PROMISE_AUDIT.md`, "The clean-profile install run (row 23)". That section is the
source; `docs/DEMO_2026-09-25.md` B5 copies the five timings for a reader on a phone and says so,
so a re-run edits the audit first and the cell second.

**`APPDATA` is the trap, and it cost the first attempt.** `cli/src/config.ts` `configDir()` reads
`APPDATA` on Windows, never the home directory. Redirect only `USERPROFILE` and `noacg doctor`
happily reports the real machine's stored login key, which is exactly the thing a fresh-machine run
must not do. The first run printed `login  noacg_ak_8b18c7…`; the corrected one printed
`not logged in`. Anyone re-running this after a CLI bump must redirect `APPDATA` too.

**Two findings that were not stale dates.**

- **The version stamp disagrees with the registry.** `cli/package.json` and both plugin manifests
  on `main` are 0.3.1; `npm view @noacg/cli dist-tags` is `latest: 0.3.0`. So today's install is a
  plugin calling itself 0.3.1 that drives 0.3.0. Cosmetic, and publishing was explicitly out of
  scope for this row - `claude/ah-publish-0-3-1` and `claude/ae-cli-0-3-1` are the rows for it.
- **A stale global `@noacg/cli` wins over npx, forever and silently.** Filed as
  `docs/backlog/a-stale-global-cli-wins-over-npx-silently.md` with both measurements.
  `mcp-server.mjs` `resolveCli()` prefers an installed copy over npx on purpose, for startup cost,
  and walks `PATH` to find one. **This laptop carries a global 0.2.0**, and a stdio probe against
  it returned the old seven-tool shape; with that directory off `PATH` the npx fallback answered
  with 0.3.x's single `noacg` tool. The check people are pointed at cannot reveal it: `doctor`
  prints the version of the copy executing it, so a bare `noacg doctor` off the stale global would
  say 0.2.0 - but the docs prompt says `npx -y @noacg/cli doctor`, which fetches `latest` and
  reports that while the server keeps importing the global.

**`npm i -g @noacg/cli@latest` on this laptop is not done, on purpose.** Changing shared machine
state while other rows are measuring can corrupt their numbers with nothing to show for it. Whoever
picks up the backlog file should check `node scripts/e2e-runs.mjs` and the worktree activity first.
Before the 25th it must happen, because the owner drives an agent on his own screen at R2.3.

## The owner's three answers, applied

All three are in `docs/OWNER_RULINGS.md` under "2026-09-10 - three answers on the 25 September gap
list", quoted.

**Row 1, the Yle network screenshot: retired, not closed.** The row is gone, the beat's status cell
says off the ledger, and §7's preamble now carries the one carve-out that makes the table's own
derivation rule still checkable: a GAP whose cell says OFF THE LEDGER has no row. Without that
sentence, deleting row 1 while B0 is still a GAP would have quietly broken the invariant §8 exists
to protect.

**One judgement call worth knowing about.** The owner-action file
`2026-09-09-g-yle-network-diag-screenshot.md` asked the Yle contact for TWO things in one message:
the network screenshot, and which OGraf renderer they run. He answered only the first. Deleting the
file as instructed would have silently dropped the second, which A7 and
`2026-09-09-ag-an-imported-board-plays-in-somebody-elses-renderer.md` both depend on. So the
renderer question was re-filed on its own as
`docs/acceptance/owner-queue/2026-09-10-be-which-ograf-renderer-yle-runs.md` before the delete, and
both referring files were repointed. If he meant to drop that question too, deleting one file
undoes it.

**Rows 2, 3 and 10, the hardware rows: re-owned to him, not before the 25th.** Their who column
said "the 12th"; his "a few weeks at least" puts those ticks on or past the 25th itself. Each "if
it stays open" cell now says what the beat actually does with no box. Six other places in the file
still planned around the 12th - §0's rehearsal paragraph, §5's preamble, and the A3, A4, A5 and A6
status cells. Five were corrected in `406da881` and A5 in the check pass, which is also where §8
stopped claiming the owner's date bar covered row 13, the deck he asked to keep being reminded
about. The acceptance boxes themselves did not
move and are still unticked; what moved is who is expected to tick them and when.

**Row 13, the deck: unchanged, at his request.** He wants to keep being reminded.

**A3 gained the box it was asking for.** Its evidence column said no written tick for OBS existed
anywhere, which was true: `docs/STUDENT_RELEASE_ACCEPTANCE.md` §1 covered the CasparCG half of
cloud-playout step 7 and not the OBS half. §8.7a is now there, unticked.

## What is left, and why

**Row 8 is closed, and here is what it cost to close honestly.** The credentials were never the
blocker. The machine's one-browser-job rule was: another worktree ran two `configured` suites back
to back for over half an hour, and `node scripts/e2e-runs.mjs --wait` gave up at its 30 minute cap
having started nothing. Its give-up message is right and I should have read it sooner - **enqueue,
do not wait** (`node scripts/jobs.mjs add`). Everything after that ran as queue jobs, `j-0918`
through `j-0929`.

The numbers, all against `https://noacg.studio` with the published 0.3.0 through `npx`:

| what | time | exit |
|---|---|---|
| `noacg login --key` (store the scoped key) | 2.5 s | 0 |
| `noacg scaffold --type scoreboard --design neutral` | 4.6 s | 0 |
| **`noacg save` into the live library** | **9.3 s** | 0 |
| the graphic visible in the library after opening the printed link | 5.0 s | - |

R2.5 now says what can be claimed: 24.8 s for the seven local verbs plus 9.3 s for the cloud leg,
so "about forty seconds of tool time from an empty folder to a graphic in your library" - stated as
the two numbers, because they are two runs on two days. "Minutes to air" is an understatement for
this leg now rather than an unmeasured claim. The last hop, a production's output URL, still has no
time; that needs a published production and belongs to A1.

**Why the key came in through `--key` rather than the browser handoff, and why that is not a
shortcut.** The account half was done by the REAL consent page: job `j-0921` drove Allow on
production with its own loopback listener, `GET /callback` and `POST /complete` both arrived, the
state matched, and `POST /api/me/agent-keys` with `action: redeem` answered 201 with scopes
`["graphics:create"]`. So nothing about the account was faked; the measurement simply starts one
step later, using the CLI's own documented paste fallback, because `noacg login`'s browser handoff
hangs (below).

**Two defects, both filed, both invisible to the specs that cover them.**

- `docs/backlog/the-link-noacg-save-prints-does-not-open-the-graphic.md`. R2.4's beat says the link
  "opens at once", `save` prints "or at once on that link", and
  `e2e/configured/agent-access.spec.ts` asserts it and PASSES. On production the hash is `#/home`
  on the first sample and never becomes `#/graphic/<id>` - reproduced on a warm signed-in tab (25 s
  of polling) and a cold one (30 s, 61 s total). The graphic is there and renders correctly; only
  the routing promise is false. The spec passes because it drives a local dev server.
- `docs/backlog/noacg-login-hangs-after-it-has-already-succeeded.md`. `login` minted and stored the
  key and then sat for **923 s** without exiting and without printing anything, including its own
  300 s giving-up message. Killed by hand.

**I got that second one wrong first, and the correction is the lesson.** I filed it as "the CLI
never received the code", because the captured output ended on "Waiting for you to allow access…".
Two mistakes stacked: my driver concatenated `stdout + stderr` and printed the last three lines, so
it showed only the tail of stderr, and `login` writes progress through `out.log()` which
`cli/src/output.ts` always sends to stderr while the success line goes to stdout. What disproved it
was cleanup: the Settings list showed a key named `noacg CLI on Legion-001`, created that day, "last
used never" - the default name `login` gives a key on this machine. Nothing else could have written
it, so the login had succeeded. The first file was deleted and rewritten rather than patched.

**What this row created on `noacg.studio`, and what is already cleaned up.** Two agent keys on the
E2E test account (`noacg_ak_769af3…` "BE probe" and `noacg_ak_d3143c…` "noacg CLI on Legion-001")
were **revoked through Settings -> Account -> Agent access, both 200, zero rows remaining**
(`j-0929`). **One graphic is still there and wants deleting by hand**: a scoreboard named **"BE"**
in the E2E account's library, `76de10ef-cce8-46ec-b6ca-a4f1a49f7ed9`. It is NOT in the owner's
library - saving into the throwaway test account was a deliberate choice over the row prompt's
suggestion, since it exercises production identically and is cleanable. `DELETE
/api/me/graphics/<id>` answered 404 from a page fetch, so the route wants a bearer token rather
than the session cookie; deleting it from the library UI is the quick way.

**The deck's speaker notes are now wrong and this row did not fix them.**
`docs/presentation-2026-09-25/make-deck.mjs` has four, and the built `.pptx` beside it carries
them all. **Line 179** points at `2026-09-09-g-yle-network-diag-screenshot.md`, which this change
deletes, and tells the presenter the screenshot is still an open owner item - reminding the owner
of the one thing he asked not to be reminded of. **Line 404** says B5 was last executed 2026-08-22
and 2026-08-27 with the Codex split unverified; **line 405** cites §7 rows 6 and 8, and this branch
closed rows 6, 8 and 9. **Line 464** says the renderer question rides in the same owner message as the network
screenshot; it is its own file now. That file belongs to the deck row
(`claude/aa-deck-repair` has a worktree), the generator refuses to overwrite the `.pptx` by design,
and the owner may hand-edit it - so touching it from here would have been the wrong kind of help.
**Whoever owns the deck next re-reads §7 before regenerating.**

**Row BH's CasparCG results are not in this file.** BH is driving the real 2.3.3 install on this
laptop this wave and its handoff will name status changes for A4, A6, §7 rows 2 and 10 and the
§8.7 acceptance line. This row minted `docs/DEMO_2026-09-25.md` and deliberately left those status
verdicts alone: rows 2 and 10 were re-owned in the who and consequence columns only, so BH's
evidence lands cleanly on top of them.

## The check, leg by leg

`review: delegated` (two passes). The first ran at `0402326f` and returned 14 findings; the second
at `dbb22cc4` returned 12 more, once the live-save work had landed. **Both were scope-checked**:
each reported merge base `77eeabc9` and the same file list `node scripts/review-request.mjs`
printed (10 files, then 13, plus the one deletion), which matches this worktree's diff. Every
finding was verified against the code or the cited file before acting, and all 26 were fixed. Two
were load-bearing rather than tidying: the claim that `noacg doctor` cannot reveal a stale global
install was wrong in four files, and the second pass caught this branch grading three beats on
evidence its own handoff contradicted.

`simplify: inline`. The simplify skill returned fan-out instructions rather than a result, which by
the workflow's four-branch rule means the pass did not run, so the leg was done in this context
over the prose angles: an overstated backlog title, one over-long line, and a sweep for statements
duplicated between files instead of cited. Three fixes.

`verify: inline`. `npm run build` exit 0 on every commit. `npm run test:e2e:affected` is not
applicable - no product code changed, and CI's E2E plan job skipped the shards for the same reason,
which I read off the job list rather than assumed (run 34460207857: Build, Factory gates, E2E plan
and CI gate green; the six E2E and Vercel jobs skipped). The live suite ran anyway, because this
row owed it: `e2e/configured/agent-access.spec.ts`, 1 passed in 26.2 s against the real backend.

`taste: not applicable`. Nothing in this change can move what a graphic looks like. The only
rendering this row saw was a scaffolded scoreboard in the live library, and it was correct.

The verdict stamp is written for tip `6527bde8` under the git common dir, at
`.git/noacg-jobs/checks/claude-be-agent-road-clean-profile.json`.

## Traps that exist in no repo file

- **The Bash tool refuses a `HOME` redirect from an isolated worktree**, because it cannot verify
  where git would then write. Correct guard, and the whole clean-profile leg has to run through
  PowerShell with `USERPROFILE` instead. On Windows that is the more accurate variable anyway.
- **Put a clean `CODEX_HOME` outside `%TEMP%`.** Codex refuses to create its PATH aliases under a
  temporary directory and warns loudly; the run still works, but the warning is an artifact of the
  profile's location and reads like a product defect. `C:\noacg-be-clean` avoids it.
- **The marketplace add clones the whole repository into the user's profile: 107 MB.** That is
  Claude Code's own behaviour for reading `.claude-plugin/marketplace.json`, not something this
  repo chose, and it happens for Codex too. Worth knowing before anyone is surprised by it in the
  room.
- **Test ids survive the production build.** `agent-consent`, `agent-consent-allow`, `auth-email`,
  `auth-pass`, `auth-status`, `wz-modal` and `gallery-close` are all present in
  `https://noacg.studio/assets/App-*.js`, so a browser walk can drive the deployed site by the same
  selectors the specs use. Checked by grepping the served bundle on 2026-09-10.
- **A deep link to a saved graphic is private.** Measuring "the link opens" in a fresh signed-out
  context measures a timeout, not a page. The subject is the tab that ran `noacg login`.
- **`noacg login` and every progress line go to STDERR**, through `out.log()`. Only the result goes
  to stdout. Script the CLI accordingly, and never diagnose it from a `2>&1` redirect, which hides
  which stream said what - that cost this row a wrong defect report.
- **The job runner shells through cmd**, so a `VAR=value command` prefix fails with "'VAR' is not
  recognized". Pass values as arguments.
- **Wait for a settings list to stop saying "Loading…" before counting rows.** Counting too early
  reported zero agent keys and nearly became a third defect report; the section actually loads in
  about 2 seconds and there were two keys in it.
- **`/api/me/agent-keys` and `/api/me/graphics/<id>` want a bearer token, not the session cookie.**
  A `fetch` from the signed-in page answers 401 and 404. The UI is the reliable route for cleanup,
  and it is what `e2e/configured/agent-access.spec.ts` drives too.
- **`noacg login --no-browser` prints the consent URL**, which is what makes the whole live leg
  scriptable at all: `https://noacg.studio/app?agent=<state>&port=<port>&name=…&challenge=…`, then
  it waits up to 300 s on a loopback listener. Verified 2026-09-10.
- **Do not reap node processes by age on this laptop.** I did it once to clean up a hung `npx`
  (`Get-Process node | Where StartTime -gt -30s | Stop-Process`) and it was luck that no other
  session had started one in that window - two live suites from another worktree were running at
  the time. Kill the PID you started, or use `node scripts/e2e-runs.mjs --kill-orphans`, which
  knows what belongs to whom.

## Nothing here needs the owner

No money, no account we do not hold, nothing published past `main`. The one thing waiting on him is
unchanged and was already his: `2026-09-10-be-which-ograf-renderer-yle-runs.md`, one message.

## The measurement that made row 14 solid instead of plausible

The first two runs behind the link defect did NOT isolate the variable, and the review was right to
say so. The passing spec does a full document load while signed in; my warm tab changed only the
hash of a page already running, and my cold tab signed in on the way, where landing on `#/home`
after an auth redirect is ordinary. Neither is what a person does.

So `j-0934` drove the third shape, which is the student's: signed in first, then the printed link
opened as a **full document load in a new tab of that same session**. The hashes it saw, in order:

```
["#/graphic/76de10ef-cce8-46ec-b6ca-a4f1a49f7ed9", "#/home"]
```

**The link arrives intact and the app throws it away.** That is a much better report than "it lands
on Home": it rules out the navigation shape, rules out the fragment being lost in transit, and
points at whatever replaces the hash on boot. The backlog file now carries that, and the
speculative third possibility it used to list - "the link is fine and I measured my own driving" -
is eliminated rather than left hanging.

Worth keeping as a habit: the finding survived being challenged, and got sharper for it. The
challenge cost one queued job.

## The three things to plan before the 25th

None is this row's to start and all three have a file.

1. `docs/backlog/the-link-noacg-save-prints-does-not-open-the-graphic.md` - §7 row 14, and the only
   one of the three that a room will see happen.
2. `docs/backlog/noacg-login-hangs-after-it-has-already-succeeded.md` - the terminal goes silent
   after a login that worked, on the one step of R2.4 that needs a human.
3. `docs/backlog/a-stale-global-cli-wins-over-npx-silently.md` - and separately, somebody should
   just run `npm i -g @noacg/cli@latest` on this laptop, checking
   `node scripts/e2e-runs.mjs` first.
