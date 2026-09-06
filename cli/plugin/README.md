# The `noacg` plugin (Claude Code + Codex)

The plugin is one of three entrances to the **NoaCG CLI** (`@noacg/cli`, the command `noacg`) -
the others being the MCP server on its own and the plain terminal. It is the easiest one: it
brings the contract and the command with nothing to install first. Everything it runs is that
same npm package; there is no separate plugin implementation.

**It runs nothing until a graphic is being made.** The plugin is the skill and the command, and the
skill drives the CLI from the terminal (`noacg <command>`, or `npx -y @noacg/cli <command>` with
nothing installed). A session that never mentions NoaCG pays about 150 tokens of skill and
command descriptions and no process at all. The always-on MCP server is a separate, optional plugin
next door, `noacg-mcp` (`cli/plugin-mcp/`), because a server declared by a plugin starts in
EVERY session where the plugin is enabled and there is no way to make it start later
(`docs/AGENT_CLI.md`, "What a session pays", has the measurements).

One plugin directory, two manifests: `.claude-plugin/plugin.json` for Claude Code and
`.codex-plugin/plugin.json` for Codex. Both read the same `skills/noacg-graphic/`.

| Piece | What it is |
|---|---|
| `skills/noacg-graphic/` | **GENERATED** - a byte-identical copy of `cli/skill/noacg-graphic/` (the one source). Never edit here; edit the source and run `node cli/scripts/build-skill.mjs`. `npm run build` fails when this copy drifts. |
| `commands/graphic.md` | `/noacg:graphic <brief>` - make a NoaCG graphic (loads the skill, runs the loop). |
| `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | The manifests. Their `version` is stamped from `cli/package.json` by the same generator. |

The marketplace entry lives at the repository root (`.claude-plugin/marketplace.json`,
marketplace name `noacg-studio`), and it lists both plugins.

## Install

**Claude Code** (any machine):

```bash
claude plugin marketplace add NoaCG/NoaCG-Studio
claude plugin install noacg@noacg-studio
```

From a clone, `claude plugin marketplace add ./` reads the same root manifest. Either way the
marketplace is named `noacg-studio`, which is the `name` field in
`.claude-plugin/marketplace.json` rather than anything derived from the source.

Then `/noacg:graphic a football scoreboard for our school channel`, or just ask for a graphic
"for NoaCG" - the skill triggers on the description. The skill runs the CLI in the terminal:
`npx -y @noacg/cli <command>` works with nothing installed, and `npm i -g @noacg/cli` once makes
every call faster. Saving needs `noacg login` once (docs/AGENT_SAVE.md).

Want the `noacg` MCP tool in every session, with a browser kept warm between calls? Add the
optional server plugin: `claude plugin install noacg-mcp@noacg-studio` (`cli/plugin-mcp/README.md`
says what it costs).

From a checkout, for one session only: `claude --plugin-dir ./cli/plugin`.

**Codex**: `codex plugin` reads the SAME root `.claude-plugin/marketplace.json`, so the plugin
installs from the repository the same way (verified 2026-08-27 against `origin/main` and against a
local checkout):

```bash
codex plugin marketplace add NoaCG/NoaCG-Studio
codex plugin add noacg@noacg-studio
```

That copies the whole plugin directory into `~/.codex/plugins/cache/noacg-studio/noacg/<version>/`
- the skill and the command. `codex plugin add noacg-mcp@noacg-studio` adds the server the same
way, and `codex mcp list` then shows it without a line ever being written to `~/.codex/config.toml`.

On a Codex build without `codex plugin`, the old path still works: copy `skills/noacg-graphic/` to
`~/.codex/skills/noacg-graphic/` (Codex loads every `~/.codex/skills/*/SKILL.md`), and, if you
want the server, add it with `codex mcp add noacg -- npx -y @noacg/cli mcp`.

**Any MCP client**: `npx -y @noacg/cli mcp` over stdio - one tool, `noacg`, whose `command` is the
CLI verb; the skill's references are the server's resources (`noacg://docs/<topic>`).
