# Being found from inside Claude Code and Codex (research, 2026-10-02)

**Correction, rechecked 2026-10-09:** the official
[platform support page](https://claude.com/docs/plugins/platform-support) documents
`/plugin directory` in Claude Code **2.1.287+**. The older 2.1.283 marketplace search
observations below do not describe current directory discovery. This repository's archive
(107.11 MiB) exceeds Claude's 50 MiB validation limit, and launcher pins need qualification,
so the Claude submission waits on [issue #842](https://github.com/NoaCG/NoaCG-Studio/issues/842).
The [2026-10-03 research](../agent-toolkit-2026-10-03.md#5-claude-distribution-strategy) has the
detail. The approved name is unchanged. Dated evidence below is kept for provenance.

RESEARCH, nothing submitted, posted or published. Every source was read on 2026-10-02. A claim no
official source confirmed is marked **UNCONFIRMED**.

The question: how a user on a fresh machine finds and installs NoaCG's plugin, MCP server or CLI by
searching inside Claude Code or Codex (`docs/GOALS.md`, outcome 2), and what the whole thing should
be called.

| File | What it holds |
|---|---|
| [`where-users-search.md`](where-users-search.md) | Every official marketplace, directory and registry each tool searches, what each requires, how it is reviewed, and how comparable tools got listed. |
| [`name.md`](name.md) | The recommended name, what users type, clashes with names, packages and marks, and the runner-up. |
| [`updates.md`](updates.md) | How each directory and registry picks up a new version, what the release feeds, and what still needs a person each time. |
| [`drafts.md`](drafts.md) | Each listing submission drafted complete for the owner to send, with the manifest fields each one changes. |
| [issue #808](https://github.com/NoaCG/NoaCG-Studio/issues/808) | The owner's steps, in order, with what each costs. |

## The answer in six lines

1. **No submission can make a bare `claude plugin install noacg` work on a fresh machine.** The only
   marketplace Claude Code adds by itself is `claude-plugins-official`, and it takes no submissions;
   only an Anthropic partner contact can ask for a listing there.
2. **The public route for Claude is Anthropic's directory** (claude.ai/directory/manage, a paid plan,
   no fee stated). Claude Code 2.1.287+ also has a directory browser, and account installs sync
   to Code. Claude Marketplace (claude.com/marketplace) is a website
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
