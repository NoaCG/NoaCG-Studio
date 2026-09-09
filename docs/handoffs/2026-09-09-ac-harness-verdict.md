# Row AC - the harness verdict

**Branch:** `claude/ac-harness-verdict`, two commits, queued. **Gate:** `npm run build` green
twice, `npm run test:harness-usage` 88/88, CI run 34403134698 green on the first commit with
Build, Factory gates and CI gate all run and the E2E shards correctly skipped for a
documentation change. **check:** `review: delegated` (8 findings, 8 fixed),
`simplify: inline` (the skill returned fan-out instructions, so the leg ran here; 3 fixed),
`verify: inline`, `taste: not applicable`.

**The deliverable is `docs/metrics/2026-09-09-harness-verdict.md`.** Read its "Read this part
first" section; everything else in this file is what a next session needs and the document does
not carry.

## What is done, and what is not

Done: all four questions answered with measurements taken between 20:20 and 20:35 UTC, the
routing judgement appended to `docs/HARNESS_ROUTING.md`, two capability observations re-probed and
one minted, both worker artifacts kept and annotated, two ledger lines recorded, and the
`orchestrator-runs-the-same-in-codex` backlog item updated with what now constrains the test.

**Not done, deliberately: nobody ran the orchestrator inside Codex.** That is the owner's standing
ask from 2026-09-05 and it is still unstarted. I measured the delegation CHANNEL, which is a
different thing, and I did not delete the backlog item because I did not serve it. What I added
to it is the three facts that now shape how that test must be set up.

**Not done, and worth someone's time:** the effort question. The wrapper's medium trial expires
**2026-09-16** and the wrapper's own comment names the delegation ledger as what settles it. That
reading is not possible yet, because seven of the last nine rows measure our spec rather than the
worker. Somebody has to fix the spec discipline before either the effort trial or the quota
decision can be read.

## The one thing that needs the owner

`~/.codex/config.toml` declares `mcp_servers.playwright` as `npx @playwright/mcp@latest`. Nothing
in this repository's Codex work uses a browser, and that single entry is about 175 MB of every
leaked process fleet. It is his own configuration file on his own machine, so I did not touch it.
Everything else in this row was decided here.

## Evidence and traps that exist in no repo file

**Read Codex's startup banner before writing another sandbox probe.** Every `codex exec` prints
`sandbox: workspace-write [workdir, /tmp, $TMPDIR]`. That one line is the whole writable-root
answer, free, on every run. Two delegations were spent re-deriving what the tool announces
unprompted, which was worth doing once as confirmation and is not worth doing again.

**The error I made, because the next session will make it too.** I wrote that the delegation
channel injects `--effort high`. It injects `medium`. I read `.claude/commands/rescue.md`, which
had said `high` for the ten hours since `scripts/codex-rescue.mjs` changed. The code review caught
it. **Read the constant, not the prose** - and when the prose is wrong, fix it where it lives,
which is why `.claude/commands/rescue.md` is in this diff even though it was outside the row's
`TOUCHES`.

**The agy ledger's failure field is `ok`, not `status`.** Seven runs sit on that ledger with
`status: "SUCCESS"` and an empty response, recorded by the wrapper as `ok: false`. Counting by
`status` finds 4 failures where there are 11. My Antigravity spec said `status`, so the artifact
inherited the mistake. Anyone writing a spec against `~/.noacg/agy-usage.jsonl` should say `ok`.

**This harness refuses several shapes of Bash command in a worktree-isolated agent.** All of these
were refused and cost retries: `$(...)` command substitution near anything git-shaped, `$((...))`
arithmetic, a heredoc appended to a file with `>>` in a compound command, and `codex exec
--skip-git-repo-check` (the flag contains the word git). Use plain separate commands, and use
`Edit` rather than `cat >>` to append to a tracked file.

**`tasklist /FI` is rewritten by MSYS** into `C:/Program Files/Git/FI` and fails, exactly like the
`taskkill /PID` bug already documented in `scripts/codex-rescue.mjs`'s header. Do process work
through the PowerShell tool, not through Bash.

**The commit hook blocks any message mentioning Codex** unless `ALLOW_AI_MENTION=1` appears in the
command itself. Both commits here needed it, legitimately, because the change is about AI tooling.

**On reaping.** I killed the sixteen node processes belonging to my own four delegations, by pid,
after confirming each job was recorded complete. I deliberately left an earlier family alone: it
predated this session and its owner was not mine to guess. Their parents were live `codex.exe`
processes, not orphans, so a reaper that only chases dead parents will find nothing - one
`codex.exe` was holding four fleets at once.

**A caution about the delegation ledger.** It moves while you read it. Another session appended a
row at 20:27 UTC in the middle of my verification, and the two Antigravity appendices in this
change differ by one call for the same reason. Timestamp any scope you quote from it.

## Pointers

- The verdict: `docs/metrics/2026-09-09-harness-verdict.md`
- The judgement, for routing: the last section of `docs/HARNESS_ROUTING.md`
- The raw tables: `docs/metrics/2026-09-09-harness-verdict-tables.md` (Codex) and
  `docs/metrics/2026-09-09-agy-spend-appendix.md` (Antigravity), both with editor's notes
- The owner's route: `docs/acceptance/owner-queue/2026-09-09-the-honest-harness-verdict.md`
- The leak, being fixed elsewhere tonight: `claude/ab-reap-codex-delegation-tree`, and the
  observation `codex-invocation-leaks-its-mcp-fleet` in `scripts/harness-capabilities.json`
- Filed on the way past: `docs/backlog/agy-warns-about-a-grant-1-1-28-no-longer-needs.md`
