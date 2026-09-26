---
kind: decision
date: 2026-09-16
needs: account
serves: now
---
# List the NoaCG plugin in Claude Code's official marketplace?

**What happened.** The agent-door audit (`docs/AGENT_DOOR_AUDIT.md`) found that
`claude plugin install noacg` fails on a clean machine: Claude Code only searches marketplaces it
already knows, so `claude plugin marketplace add NoaCG/NoaCG-Studio` has to come first. Every
install guide leads with that line, and it works.

**Why it is yours.** Making the bare install command work means being listed in
`anthropics/claude-plugins-official`, which is a pull request to someone else's repository, made
from an account and in the organisation's name.

**The choice.** Submit a listing (an agent drafts the pull request for you to open from your
account), or keep the two-line install as it is. It serves the "fresh machine, published plugin"
target in `docs/GOALS.md` outcome 2.
