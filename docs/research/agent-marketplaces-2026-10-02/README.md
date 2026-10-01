# Being found from inside Claude Code and Codex (research, 2026-10-02)

RESEARCH, nothing submitted, posted or published. Every source was read on 2026-10-02. A claim no
official source confirmed is marked **UNCONFIRMED**.

The question: how a user on a fresh machine finds and installs NoaCG's plugin, MCP server or CLI by
searching inside Claude Code or Codex (`docs/GOALS.md`, outcome 2), and what the whole thing should
be called.

| File | What it holds |
|---|---|
| [`where-users-search.md`](where-users-search.md) | Every official marketplace, directory and registry each tool searches, what each requires, how it is reviewed, and how comparable tools got listed. |
| [`name.md`](name.md) | The recommended name, what users type, clashes with names, packages and marks, and the runner-up. |
| [`drafts.md`](drafts.md) | Each listing submission drafted complete for the owner to send, with the manifest fields each one changes. |
| [`../../acceptance/owner-queue/2026-09-16-list-the-plugin-in-the-official-marketplace.md`](../../acceptance/owner-queue/2026-09-16-list-the-plugin-in-the-official-marketplace.md) | The owner's steps, in order, with what each costs. |

## The answer in six lines

1. **No submission can make a bare `claude plugin install noacg` work on a fresh machine.** The only
   marketplace Claude Code adds by itself is `claude-plugins-official`, and it takes no submissions;
   only an Anthropic partner contact can ask for a listing there.
2. **The public route for Claude is Anthropic's directory** (claude.ai/directory/manage, a paid plan,
   no fee stated). A listing reaches Claude Code through the user's claude.ai account, not through
   the `/plugin` search on a fresh install. Claude Marketplace (claude.com/marketplace) is a website
   for browsing with no submission of its own; whether a directory listing appears there is
   **UNCONFIRMED**.
3. **Codex has one public directory shared with ChatGPT** (platform.openai.com/plugins). The skills
   plugin `noacg` can be submitted today; the local MCP server `noacg-mcp` cannot, because public MCP
   plugins must point at an HTTPS server.
4. **The official MCP Registry** states no fee and an agent can do it, but no documentation or
   source shows Claude Code or Codex searching it (**UNCONFIRMED** that they never do). It feeds
   aggregators, VS Code and GitHub.
5. **The shortest install inside Claude Code today is one command**, available since Claude Code
   2.1.275: `/plugin install noacg --marketplace NoaCG/NoaCG-Studio`. No install guide uses it yet.
6. **Keep the name `noacg`** for the plugin, the CLI command and the MCP server, and put the words
   users search for (broadcast graphics, lower third, scoreboard, CasparCG, OBS, vMix) in the display
   name and description, which is what both tools' searches read. Runner-up: `noacg-graphics`.
