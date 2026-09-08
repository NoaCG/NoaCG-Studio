---
v: 2
source: derived
kind: finding
raised: 2026-09-05
state: unstarted
found: "claude auth status reports loggedIn: false, so headless workers do not exist on this
  machine and every row dies with the session that launched it"
needs-owner: harness
---
# The CLI is not logged in, so every worker dies with the session that launched it

**Filed:** 2026-09-08. **Source:** the 2026-09-05 CI-watch and review-next sessions (both handoffs
since drained; each carried this same item)

## Why
`claude auth status` reports `loggedIn: false`, so the Agent tool is the only launch path and a
row cannot outlive its launcher. That is the single point of failure behind the refill loop dying
at the first tick on two observed nights
(`.agent-workflows/orchestrator/incidents.md`). Logging in unlocks headless `claude -p` workers,
which `launch.md` and `routing.md` already name as the fallback and already gate on "auth verified
that day". It also blocks the planner and watcher A/B, and the Anthropic token count that
`docs/AGENT_CLI.md` still lists as open.

## What it would take
Two minutes at an interactive terminal, and only the owner can do it: `claude auth login` prints a
URL and then waits for a code PASTED into the terminal that started it, which a session's shell
has no stdin for. A session tried on 2026-09-05, got the URL, and the process ended on EOF without
a token. Then the test: re-check `claude auth status` a day later. If it held, headless workers
are a real option; if it expires daily, staying on the Agent tool loses nothing and this closes.
The known failure is silent expiry, so any wave using headless workers runs the status check the
same day.

## Evidence
`docs/ORCHESTRATOR_SIMPLIFICATION.md:53`; `docs/AGENT_CLI.md:341` and its "Still open" list;
`.agent-workflows/orchestrator/incidents.md` on the headless auth that died silently.
