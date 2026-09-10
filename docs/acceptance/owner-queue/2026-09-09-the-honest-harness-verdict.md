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

**Two decisions are yours and I took neither.**

`~/.codex/config.toml` declares `mcp_servers.playwright` as `npx @playwright/mcp@latest`. Nothing
in this repository's Codex work uses a browser, and that one entry is about 175 MB of every leaked
fleet. Deleting it is your call, in your own configuration file.

Antigravity cannot search a repository, which is why a sweep sent to it tonight came back empty.
Granting `command(rg)` in `~/.gemini/antigravity-cli/settings.json` would fix it and would make the
harness useful for exactly the work it is otherwise good at. No session may widen the machine's
permission posture on its own argument, so it is filed rather than done
(`docs/backlog/antigravity-cannot-grep-so-sweeps-routed-to-it-return-nothing.md`). Until you say
otherwise we enumerate file lists by hand. Branch `claude/ac-harness-verdict`.

## Checked by an agent 2026-09-10, and NOT settled - one number does not reproduce

Everything structural in "what to look at" is there. Both worker-written files exist and each
carries exactly one editor's note. The judgement is the last section of `docs/HARNESS_ROUTING.md`.
`scripts/harness-capabilities.json` carries the re-probed observations, including
`codex-invocation-leaks-its-mcp-fleet`, with 24 entries dated 2026-09-09.

**The headline count does not reproduce from the ledger, and the discrepancy is not resolved.**
The verdict opens with "Of the nine delegated tasks on the outcome ledger in the last 24 hours,
seven failed on our own prompt or invocation and only two are evidence about the worker at all."
Reading `C:/Users/ahonemi/.noacg/delegation-outcomes.jsonl` directly - 29 lines, `at` timestamps,
the same 24 hours ending at the tables' own cut of 2026-09-09T20:25:55Z - gives **five** tasks in
that window, four with `cause: prompt` and one with `cause: worker`. Uncollapsed, so collapsing
by label could only reduce it further, never reach nine.

Four and one carries the same argument as seven and two: most failures are ours, and the worker
evidence is an anecdote rather than a rate. **So the conclusion is not in doubt and no money
decision changes.** What is in doubt is whether the verdict's window matches the tables' window,
whether "delegated tasks" there means ledger rows or invocations - the same document uses "nine"
for both in two different paragraphs - or whether rows landed after it was written. The ledger has
grown since; its newest row is dated 2026-09-10.

**This item stays open** because an agent settling it is supposed to have driven the thing and
agreed, and one of its four questions came out different. The cheap fix is for whoever wrote the
verdict to state the exact window and the exact filter beside the number, so it can be re-derived
rather than re-argued.
