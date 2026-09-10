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

**Rows 6 and 9 are closed and deleted.** All four install lines run on a clean profile and exit 0,
and the `noacg-mcp` split is verified on Codex, so the "not yet re-verified" hedge is gone from
`docs/AGENT_CLI.md`. **Row 8 is PARTLY closed** and stays in the table; what remains is named
below and is smaller than what it was.

Commits: `ee4a50b9` (the clean-profile run, the Codex split, the owner's three answers),
`406da881` (the remaining references to the 12th, and the stale-CLI backlog file).

## What was actually run, and what it does not prove

**The clean profile was a directory tree, not a Windows account.** `C:\noacg-be-clean` with
`USERPROFILE`, `APPDATA`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `npm_config_cache` and
`npm_config_prefix` all pointed into it. `GIT_CONFIG_GLOBAL` was deliberately left at the real
`.gitconfig`, since git identity is not part of what an install line proves. Node, npm, Chrome,
Edge and the two agent binaries were already on the machine and on `PATH`, so **this run says
nothing about a student installing those first.** The full table of what was reset, why, and the
timings is `docs/PROMISE_AUDIT.md`, "The clean-profile install run (row 23)" - that is now the one
place these dates live, and `docs/DEMO_2026-09-25.md` B5 points at it rather than repeating it.

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
  with 0.3.x's single `noacg` tool. `noacg doctor` cannot reveal this, because it reports the
  version npx resolved, not the one the MCP server will import.

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
it stays open" cell now says what the beat actually does with no box. Four other places in the file
still planned around the 12th - §0's rehearsal paragraph, §5's preamble, and the A3, A4 and A6
status cells - and all of them are corrected in `406da881`. The acceptance boxes themselves did not
move and are still unticked; what moved is who is expected to tick them and when.

**Row 13, the deck: unchanged, at his request.** He wants to keep being reminded.

**A3 gained the box it was asking for.** Its evidence column said no written tick for OBS existed
anywhere, which was true: `docs/STUDENT_RELEASE_ACCEPTANCE.md` §1 covered the CasparCG half of
cloud-playout step 7 and not the OBS half. §8.7a is now there, unticked.

## What is left, and why

**§7 row 8's second half.** `e2e/configured/agent-access.spec.ts` **ran and passed on 2026-09-10 in
18.9 s** against the real backend, which is the first time any file records when it last ran; that
is dated in R2.4. The other half - one live `noacg login` + `noacg save` against `noacg.studio`
with a stopwatch on the save and on the link - is described under "The live save" below.

**The deck's speaker notes are now wrong and this row did not fix them.**
`docs/presentation-2026-09-25/make-deck.mjs` line 404, and the built `.pptx` beside it, still say
B5 was last executed 2026-08-22 and 2026-08-27 with the Codex split unverified, and still call §7
rows 6 and 8 cheap to close. Rows 6 and 9 are gone. That file belongs to the deck row
(`claude/aa-deck-repair` has a worktree), the generator refuses to overwrite the `.pptx` by design,
and the owner may hand-edit it - so touching it from here would have been the wrong kind of help.
**Whoever owns the deck next re-reads §7 before regenerating.**

**Row BH's CasparCG results are not in this file.** BH is driving the real 2.3.3 install on this
laptop this wave and its handoff will name status changes for A4, A6, §7 rows 2 and 10 and the
§8.7 acceptance line. This row minted `docs/DEMO_2026-09-25.md` and deliberately left those status
verdicts alone: rows 2 and 10 were re-owned in the who and consequence columns only, so BH's
evidence lands cleanly on top of them.

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
