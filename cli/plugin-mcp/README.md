# The `noacg-mcp` plugin (Claude Code + Codex)

The NoaCG CLI as an **always-on MCP server**, packaged as a plugin so one command installs it. It
is optional. The `noacg` plugin next to it (`cli/plugin/`) carries the skill and the command and
runs no server. Its skill drives the same CLI from the terminal, and a session that is not about
NoaCG pays nothing for it. Install this one when you want the `noacg` tool present in every
session - a browser kept warm between calls, screenshots returned as images - or when your client
has no shell to run the CLI in.

What it costs, measured 2026-09-02 (`docs/AGENT_CLI.md`, "What a session pays"): one process of
about 37 MB private bytes for the life of every session, and about 590 tokens of tool schema in
every session's context. That is the whole reason it is a separate plugin.

| Piece | What it is |
|---|---|
| `.mcp.json` | The `noacg` MCP server: `node mcp-server.mjs`. One tool, `noacg`, whose `command` is the CLI verb (`types`, `scaffold`, `validate`, `inspect`, `screenshot`, `docs`, `save`) and whose other arguments are the verb's flags. The skill's references are also resources at `noacg://docs/<topic>`. |
| `mcp-server.mjs` | The launcher. It resolves `@noacg/cli` (`NOACG_CLI`, a normal resolve, then a global install found through the `noacg` shim on PATH) and `import`s it in the same process, so the server is ONE process rather than npx plus a child. With no installed copy it falls back to npx in-process and says so on stderr. |
| `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | The manifests. Their `version` is stamped from `cli/package.json` by `cli/scripts/build-skill.mjs`. |

## Install

In a Claude Code session (2.1.275 or later), each plugin is one command:

```text
/plugin install noacg --marketplace NoaCG/NoaCG-Studio
/plugin install noacg-mcp --marketplace NoaCG/NoaCG-Studio
```

From a terminal or a setup script:

```bash
claude plugin marketplace add NoaCG/NoaCG-Studio
claude plugin install noacg@noacg-studio        # the skill and the command
claude plugin install noacg-mcp@noacg-studio    # this server, if you want it
npm i -g @noacg/cli                             # one process instead of npx plus a child
```

From a checkout, for one session only: `claude --plugin-dir ./cli/plugin --plugin-dir ./cli/plugin-mcp`,
with `NOACG_CLI=<checkout>/cli/dist/index.js` to run the local build.

**Codex**: `codex plugin add noacg-mcp@noacg-studio` from the same marketplace. Codex copies a
plugin directory whole, `.mcp.json` included, and on 2026-08-27 that registered the combined
plugin's server without a line in `~/.codex/config.toml`; this split plugin, with its
`${CLAUDE_PLUGIN_ROOT}` launcher, has not been re-verified on Codex yet (`docs/AGENT_CLI.md`,
"What a session pays", still open).

**Any MCP client**, without the plugin: `noacg mcp` over stdio (`npx -y @noacg/cli mcp` with
nothing installed). A graphics project can also declare the server in its own `.mcp.json`, which
is the one way to have it in exactly the sessions that are about graphics and nowhere else.

## What it runs and what it sends

Checked against `noacg` 0.7.0 on 2026-10-02.

- **The plugin starts one process in every session where it is enabled**: `mcp-server.mjs`, which
  runs the NoaCG CLI as an MCP server over stdio. It uses the copy of `@noacg/cli` installed on
  your machine, or, with none installed, runs `npx -y @noacg/cli mcp`, which downloads the package
  from the npm registry (registry.npmjs.org). When it uses an installed copy, it reads the latest
  version number from the npm registry, at most once a day, and says on stderr when your copy is
  behind.
- **The `noacg` tool it serves runs the same CLI commands** as the terminal, with the same rules,
  below.
- **Making and checking a graphic stays on your machine.** `types`, `scaffold`, `validate`,
  `inspect`, `screenshot` and `pack` open NoaCG's `/bridge` page from https://noacg.studio, or from
  the deployment `NOACG_URL` names, in a headless Chrome or Edge on your machine, and do their work
  there. That browser may only load pages from that deployment, outside its `/api/`; every other
  request and every WebSocket is blocked, so the graphic under test cannot reach anything else.
  Nothing you make is uploaded by these commands.
- **`noacg login`** opens NoaCG's consent page in your browser and receives the answer on a
  `127.0.0.1` port. It keeps a key on your machine that can add graphics to your library and do
  nothing else: it cannot read your library, touch a production or delete anything. `noacg logout`
  revokes it, and so does NoaCG Settings. `noacg whoami` asks NoaCG whether the key still works.
- **`noacg save`**, and `noacg pack --save`, upload the graphic or package you made to your own
  NoaCG Studio library, with that key. A graphic can carry the names and text typed into its
  fields.
- **`noacg doctor`** reads the latest version number of `@noacg/cli` from the npm registry, at
  most once a day, to tell you when your copy is behind.
- **The playout commands**, `noacg bridge` and `noacg caspar`, which the skill does not use to make
  a graphic, connect to the CasparCG or OGraf servers you point them at. `noacg bridge` listens on
  `127.0.0.1` only, answers only the NoaCG pages you allow, and opens NoaCG in your browser to
  pair unless you pass `--no-open`.

The CLI contacts nothing else and sends no usage data. Privacy policy:
https://noacg.studio/privacy.
