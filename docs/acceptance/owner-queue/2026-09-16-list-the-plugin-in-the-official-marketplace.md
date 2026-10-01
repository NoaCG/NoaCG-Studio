---
kind: decision
date: 2026-09-16
needs: account
serves: now
---
# Get NoaCG found from inside Claude Code and Codex

Rewritten 2026-10-02 from the research in `docs/research/agent-marketplaces-2026-10-02/`. The
earlier plan, a pull request to Claude Code's official marketplace, is closed: Anthropic takes no
submissions there, and only a partner contact can ask for a listing. Two public directories are
open instead, one for Claude and one shared by Codex and ChatGPT. Both need your accounts.

**What this will not do.** A bare `claude plugin install noacg` on a fresh machine will still fail,
because Claude Code searches only the official marketplace by itself. The shortest path inside
Claude Code stays one command, `/plugin install noacg --marketplace NoaCG/NoaCG-Studio` (Claude Code
2.1.275 or later), and an agent moves the install guides to it. A Claude directory listing reaches
people who add it on claude.ai, and it then loads in their Claude Code too.

## 1. Decide the name (any time, costs nothing)

Recommended: keep **`noacg`** for the plugin, the CLI command and the MCP server, and show it as
**NoaCG Broadcast Graphics**, so a search for "broadcast", "lower third" or "CasparCG" finds it.
No plugin, MCP server or npm package uses the name; marks outside the US are unchecked. Runner-up: `noacg-graphics`, which renames a published plugin.
Reasons and clashes: `docs/research/agent-marketplaces-2026-10-02/name.md`. Answer with "keep noacg" or "noacg-graphics".

## 2. Before the name is decided: prepare the two accounts

These do not depend on the name, and the second may take days.

| Step | Where | Cost |
|---|---|---|
| a. Use a claude.ai account on Pro or higher that should own the listing for good (the first organisation to submit a folder holds it), and connect GitHub there with an account that can push to `NoaCG/NoaCG-Studio` and is an admin of it (for the update webhook) | claude.ai | the plan you already pay; free accounts cannot submit. No submission fee is stated |
| b. Verify the OpenAI platform organisation that should own the Codex listing. Choose **individual** (listed under your name) or **business** (listed under NoaCG Studio) | platform.openai.com, organisation settings | no fee stated; how long verification takes is not stated |

## 3. After the name: agents prepare everything (no account needed)

One agent row makes the manifest changes in
`docs/research/agent-marketplaces-2026-10-02/drafts.md`, section 0 (display name, descriptions,
Codex short description, icons), adds a "What it runs and what it sends" section to both plugin
READMEs, adds `mcpName` and `cli/server.json`, adds the MCP Registry publish step to the CLI release,
moves the install guides to the one-command form, and then releases the CLI. It costs one row and no
money. Submit nothing until it has landed: the directories read the live repository.

## 4. Your submissions, in this order

| # | What | Where | Draft | Time | Cost |
|---|---|---|---|---|---|
| 1 | The `noacg` plugin | claude.ai/directory/manage, **Plugin bundle**, path `cli/plugin` | `drafts.md`, section 1 | about 15 minutes; review time is not fixed | none beyond the plan |
| 2 | The `noacg` plugin, skills only | platform.openai.com/plugins, upload the ZIP an agent builds | `drafts.md`, section 3 | about 15 minutes; review feedback arrives by email | none stated |
| 3 | The `noacg-mcp` plugin, once 1 is live | claude.ai/directory/manage, path `cli/plugin-mcp` | `drafts.md`, section 2 | about 10 minutes; expect a reviewer hold | none beyond the plan |
| 4 | Optional: GitHub's MCP registry, once the agent has published to the MCP Registry | an email to partnerships@github.com | `drafts.md`, section 5 | 5 minutes | none |

The data-handling answers, the compliance acknowledgements and the developer identity are yours to
confirm, not an agent's. The MCP Registry needs nothing from you if it is published from the
release workflow, as `drafts.md`, section 4 proposes.
