---
kind: decision
date: 2026-09-16
needs: account
serves: now
---
# Get NoaCG found from inside Claude Code and Codex

Rewritten 2026-10-02 from the research in `docs/research/agent-marketplaces-2026-10-02/`, and again
the same day once the listing work landed. Anthropic's official marketplace takes no submissions,
so two public directories are the route, one for Claude and one shared by Codex and ChatGPT. Both
need your accounts. Everything an agent could do is done.

**What this will not do.** A bare `claude plugin install noacg` on a fresh machine will still fail,
because Claude Code searches only Anthropic's official marketplace by itself. The install guides now
lead with the one command a person types in a Claude Code session (2.1.275 or later):
`/plugin install noacg --marketplace NoaCG/NoaCG-Studio`.

## The name: closed

Your decision, 2026-10-02: keep **`noacg`** as the plugin, CLI and MCP server name, and show it
as **NoaCG Broadcast Graphics and Playout** wherever a field allows it, keeping every field within
its limit. OpenAI's directory allows 30 characters for a display name ("at most 30 characters",
developers.openai.com/plugins/deploy/submission) and the name is 36, so by your ruling the Codex
and ChatGPT display name is **NoaCG Graphics and Playout**. Every other listing field, and the MCP
Registry title, carries the full name.

## What landed (no step for you)

The manifests carry the name, descriptions that show playout as well as making graphics, an icon,
and the Codex fields OpenAI requires; both plugin READMEs say what the plugin runs and sends; the
CLI release publishes `noacg mcp` to the official MCP Registry by itself; the Codex upload ZIP is
kept with every release run. How each directory picks up a new version, from the sources:
`docs/research/agent-marketplaces-2026-10-02/updates.md`.

## Live since 0.7.0 (2026-10-02): you can start

0.7.0 is released, so the first version each directory scans already carries the new name and
metadata. Read back from the registries the same day:

- **npm**: `@noacg/cli@0.7.0` is `latest`, with a signed provenance statement linked to its
  release run, and `npx @noacg/cli@0.7.0 --version` answers 0.7.0.
- **MCP Registry**: `io.github.NoaCG/noacg` 0.7.0 is active and latest, titled NoaCG Broadcast
  Graphics and Playout, pointing at `@noacg/cli@0.7.0`. Step 8 is therefore open.
- **The Codex upload** for step 6 is the artifact `noacg-codex-plugin-0.7.0` on the 0.7.0 run of
  **Release CLI to npm** (tag `cli-v0.7.0`). GitHub deletes it on **2026-12-31**; after that, use
  the artifact of a later release.

## Your steps, once

In this order.

| # | What | Where | Values | Cost |
|---|---|---|---|---|
| 1 | Use a claude.ai account on Pro or higher that should own the Claude listing for good (the first organisation to submit a folder holds it), and connect GitHub there with an account that can push to `NoaCG/NoaCG-Studio` and is an admin of it | claude.ai | | the plan you already pay; free accounts cannot submit; no fee stated |
| 2 | Submit the `noacg` plugin: **Submit new**, **Plugin bundle**, repository `NoaCG/NoaCG-Studio`, path `cli/plugin`, branch left empty (it follows `main`), **Validate** | claude.ai/directory/manage | `drafts.md`, section 1 | about 15 minutes; review time is not fixed |
| 3 | Answer the data-handling questions and the four compliance acknowledgements; they are your statements, not an agent's | the same submission | `drafts.md`, section 1 | |
| 4 | On **Review and submit**: keep **GitHub push webhook**, turn on **Auto-publish passing versions**, submit, then press **Set up push updates** (needs repository admin) | the same submission | | |
| 5 | Verify the OpenAI platform organisation that should own the Codex listing: **individual** (your name) or **business** (NoaCG Studio) | platform.openai.com, organisation settings | | no fee stated; duration not stated |
| 6 | Download the artifact `noacg-codex-plugin-0.7.0` from the 0.7.0 run of **Release CLI to npm** (Actions tab), upload it as a new plugin, fill the listing, submit for review, and publish once approved | platform.openai.com/plugins | `drafts.md`, section 3 | about 15 minutes; feedback by email |
| 7 | Once step 2's listing is live: submit `noacg-mcp` the same way, path `cli/plugin-mcp`. Expect a reviewer hold on its launcher | claude.ai/directory/manage | `drafts.md`, section 2 | about 10 minutes |
| 8 | Optional (the MCP Registry has listed `io.github.NoaCG/noacg` since 0.7.0): ask GitHub to include it in its MCP registry (VS Code and Copilot, not Claude Code or Codex) | an email from your address to partnerships@github.com | `drafts.md`, section 5 | 5 minutes |

## Your steps, per version

| Directory | When | What |
|---|---|---|
| Anthropic's directory | every version that passes its checks, **for as long as** the plugin's **Auto-publish** row says "An Anthropic reviewer publishes each version" (the default; Anthropic changes it, not you) | open the plugin at claude.ai/directory/manage and press **Publish** |
| Anthropic's directory | a version **held for a reviewer** or failing the security scan | nothing until Anthropic's reviewer acts; send the finding to an agent if it asks for a fix |
| Codex and ChatGPT directory | when the skill or the listing text changed enough to matter (not every release: the CLI it runs always comes from npm) | download `noacg-codex-plugin-<version>` from that release's run, then **Upload plugin to make changes** on the existing plugin, resolve findings, submit, and publish once approved |
| MCP Registry | never | the release workflow publishes every version itself |
