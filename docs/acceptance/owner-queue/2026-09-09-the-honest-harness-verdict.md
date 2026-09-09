---
kind: agent
date: 2026-09-09
---
# The honest answer on Codex, Antigravity, and whether to pay for more quota

You asked for the honest truth about whether Codex can be used through the Claude Code
orchestrator, and whether Antigravity has any use or just fails every task. Both are answered
against measurements taken tonight between 20:20 and 20:35 UTC, not against impressions.

**Yes on Codex**, with one hard rule: a delegation can only write inside the directory the
launching session is standing in, plus the temp folder. Proved by two delegations four minutes
apart, one writing here and succeeding, one writing into another worktree and being refused.

**Yes on Antigravity**, which surprised me. Given a bounded spec it produced 63 numbers in one
sixty-second call, and the only ones it got wrong were the 13 my own spec told it to count from
the wrong field. It fails the tasks whose specs leave anything to be worked out, and every recent
failure on the ledger is attributed to our prompt, not the model.

**No on the quota, not yet.** Seven of the last nine delegated tasks failed on our own spec, so
capacity is not the limit. The document says what to fix first and what to re-read in a week.

**And Codex is not slow to start - it is heavy to leave running.** Your own Codex session tonight
was right: each invocation leaves about four node processes and 195 MB behind. That happens with
plain `codex exec` too, so it is not the orchestrator's wrapper.

## The route, under a minute

Open `docs/metrics/2026-09-09-harness-verdict.md` and read the section titled **"Read this part
first"**. It is four short paragraphs and it carries the whole decision. Each of the four
questions then has its own section below it with the measurements beside the claim.

**What to look at.** The two worker-written files beside it,
`docs/metrics/2026-09-09-harness-verdict-tables.md` and
`docs/metrics/2026-09-09-agy-spend-appendix.md`, are the raw evidence, each carrying an editor's
note where review changed something. The judgement is also appended to
`docs/HARNESS_ROUTING.md` as the last section, and the re-probed capability observations are in
`scripts/harness-capabilities.json`.

**One decision is yours and I did not take it.** `~/.codex/config.toml` declares
`mcp_servers.playwright` as `npx @playwright/mcp@latest`. Nothing in this repository's Codex work
uses a browser, and that one entry is about 175 MB of every leaked fleet. Deleting it is your
call, in your own configuration file. Branch `claude/ac-harness-verdict`.
