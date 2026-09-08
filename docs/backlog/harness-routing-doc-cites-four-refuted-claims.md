# HARNESS_ROUTING.md cites four capability claims a re-probe just measured false

**Filed:** 2026-09-09. **Source:** measurement (branch `claude/x-capability-reprobe`, handoff
`docs/handoffs/2026-09-09-x-capability-reprobe.md`).

## Why

A capability re-probe row ran every UNVERIFIED entry in `scripts/harness-capabilities.json`
against the installed builds (Claude Code 2.1.263, Codex 0.154.0-alpha.6, Antigravity 1.1.27) and
deleted five entries the probes refuted. Four of those five are cited in `docs/HARNESS_ROUTING.md`
as settled fact, and the prose there was not updated - deleting the JSON entry does not fix the
doc that quotes it. A reader of `HARNESS_ROUTING.md` today is reading claims a measurement just
disproved:

1. "Codex: there is no model choice, only effort" / "gpt-5.6-sol is the only model the ChatGPT
   subscription exposes" - `codex exec` with no `--model` now defaults to `gpt-6-astra` and
   succeeds, and `gpt-5.6-sol` also still succeeds. Two model ids work now, not one.
2. "claude --help offers --permission-mode and no --permission-prompts" - `--permission-prompts`
   is now a listed flag on 2.1.263.
3. "claude agents --json answers ... with pid, cwd and status" - the raw JSON carries pid, cwd,
   kind, startedAt, sessionId, but no status field at all on this build.
4. "A session launched by another session never receives its own subagents' completion
   notifications; they route to the launcher" - a background subagent spawned from a launched
   session delivered its completion notification directly to that session in a measured test on
   2.1.263.

Claim 4 is the one worth the most care: `.agent-workflows/check.md`'s phase-2 classification rule
explicitly builds on it ("In a session that was itself launched by another session, those
notifications route to the LAUNCHER and never arrive") to justify never waiting on a completion
notification inside `/check`. That premise is now measured false, at least on this build. Whether
the workflow's guidance should change, or whether the measurement was a one-off worth
re-confirming before touching a load-bearing workflow rule, is a judgement call - not a
find-and-replace.

## What it would take

Read `docs/HARNESS_ROUTING.md` end to end against the four claims above and the evidence in the
handoff, and rewrite the passages built on them. For claim 4 specifically, re-confirm the
notification-routing behavior once more (a single background subagent from a launched session,
same as the original probe) before deciding whether `.agent-workflows/check.md`'s phase-2 rule
changes, gets a caveat, or is left as a conservative fallback pending more evidence - one
measurement is not enough to rewrite a rule three sessions have already gotten wrong in three
different ways (2026-08-29, cited in `check.md` itself).

## Evidence

`docs/handoffs/2026-09-09-x-capability-reprobe.md` (the full probe table and commit message);
`scripts/harness-capabilities.json` (the four entries are gone, not just re-dated).
