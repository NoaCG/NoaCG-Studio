# The name for the plugin, the MCP server and the CLI

Read 2026-10-02. This is a recommendation; the name is the owner's decision, and no manifest has been
changed.

## Recommendation: one name, `noacg`, with the job in the display name

| Piece | Identifier (permanent) | What users see |
|---|---|---|
| Skill plugin (Claude Code, Codex) | `noacg` | **NoaCG Broadcast Graphics** |
| Optional MCP server plugin | `noacg-mcp` | NoaCG MCP server |
| CLI | npm `@noacg/cli`, command `noacg` | `noacg` |
| MCP server inside the CLI | `noacg mcp`; MCP Registry name `io.github.NoaCG/noacg` | title "NoaCG Broadcast Graphics" |

Every identifier stays as it is today. What changes is the text the searches read: a display name
and descriptions that start with the words people type. `drafts.md` has the exact strings and the
fields they go in.

## What users type, and what each search reads

Two kinds of people search.

**Someone who has heard of NoaCG** types `noacg`. That finds the plugin in both tools, exactly and
alone: no plugin, MCP server or npm package uses the word, and the only other uses found are an
inactive code library and a junk domain (clash table below; marks outside the US are unchecked). Claude Code's
Discover filter and Codex's `/plugins` search are both substring matches, so `noa` finds it too.
`noa cg`, with a space, finds nothing in either; the display name cannot fix that and no search
tool offers aliases.

**Someone who has not** types the job: broadcast graphics, lower third, scoreboard, ticker, overlay,
CasparCG, OBS, vMix, OGraf. A name can carry one of those words at most. The searches read more than
the name:

| Search | Fields it matches | Source |
|---|---|---|
| Claude Code `/plugin` Discover | `name`, `displayName`, `description`, marketplace name; not `keywords` | observed in the 2.1.283 binary; the docs do not say |
| Codex `/plugins` | display name, id, name, marketplace label, description, `keywords` | observed in `openai/codex` source |
| Claude directory (claude.ai) | not documented | **UNCONFIRMED** |
| Codex and ChatGPT directory | not documented | **UNCONFIRMED** |
| MCP Registry `?search=` | substrings of the server name only, in every test run | observed against the live API |

So the words belong in `displayName` and `description`, which both tools read. In the MCP Registry
only the name is searched, but no documentation or source shows Claude Code or Codex reading the
registry (`where-users-search.md`, 1.7 and 2.4), so it is not worth
bending the name for it.

The neighbours point the same way. In the official marketplace's `design` category every plugin
is named after its own brand: `canva`, `figma`, `miro`, `adobe-for-creativity`, `runway-api`,
`hyperframes`, `superdesign`. Anthropic's
checklist asks for the same thing: "Build the name around your own distinctive product or project
name", and it holds for a reviewer "a name made only of generic words"
(claude.com/docs/plugins/pre-submission-checklist).

## Why not the alternatives

- **A generic slug** (`broadcast-graphics`, `lower-thirds`, `cg-graphics`). Held for a reviewer
  under the rule above, impossible to own, and indistinguishable from a category label. Someone
  already published and unpublished `broadcast-graphics-mcp` on npm on 2026-08-12, so generic
  names are contested.
- **A standard's or a product's name in the slug** (`ograf-*`, `casparcg-*`, `spx-*`, `obs-*`,
  `vmix-*`). These read as the official tool of a project we do not own. OGraf is the EBU's
  specification (github.com/ebu/ograf); CasparCG is the open-source server started by SVT
  (casparcg.com, github.com/CasparCG); the US "SPX" marks belong to SPX Corporation, an unrelated
  industrial company, and the graphics product is SPX-GC (github.com/TuomoKu/SPX-GC). Anthropic
  holds "Name matches a known brand" for review. These names belong in the description, as what
  NoaCG exports to.
- **A rename of any kind.** "Never change a published plugin's `name`. After a rename, users who
  already installed it lose the plugin" (code.claude.com/docs/en/plugins/publish). Claude Code has
  a `renames` map in the marketplace to migrate installs; whether Codex migrates them is
  **UNCONFIRMED**. The command `noacg` is in every guide, and `/noacg:graphic` takes its prefix from
  the plugin name.
- **Several names.** One stem keeps the three pieces recognisably one thing. The only suffix is
  `-mcp`, which tells the optional server apart from the plugin and is the word people use for it.

## Runner-up: `noacg-graphics`

The runner-up keeps the brand and adds the one word that says what it makes, so a name-only list
(the MCP Registry, a GitHub search, a skimmed install line) is self-explaining. It would make the
command `/noacg-graphics:graphic`, longer and repetitive, and it renames a published plugin: the
Claude marketplace `renames` map can migrate existing installs, Codex is unknown, and every guide
and doc changes. Choose it only if a slug that describes the product matters more than those costs.
It clashes with nothing found.

## Clashes checked

All read 2026-10-02.

| Name or term | Where | What it is | Risk | Source |
|---|---|---|---|---|
| `NoAcg` | GitHub `wuyu8512/NoAcg` | a .NET chat-bot library, last pushed 2021 | low: unrelated, inactive. "ACG" means anime, comics and games in Chinese shorthand | github.com/wuyu8512/NoAcg |
| `noacg.com` | domain | registered 2025-04-02; serves an obfuscated redirect, apparently spam | medium: a user who guesses `.com` lands on junk. Never print `noacg.com`; always `noacg.studio` | rdap.verisign.com |
| `noacg` (unscoped npm) | npm | free, but npm refuses to create it as "too similar to existing package nock" | none: `@noacg/cli` is ours and the command is still `noacg` | `docs/AGENT_CLI.md`, Distribution |
| `noacg`, `noacg-cli`, `noacg-mcp`, `@noacg/mcp` | npm | not published | none | `npm view` |
| `noacg`, `noacg-mcp`, `noa-cg` | PyPI | not published | none | pypi.org |
| NOACG, "NOA CG" | USPTO | no marks, live or dead | none found in the US | USPTO trademark search (tmsearch) |
| NOA | USPTO | live marks held by Kahua (SaaS, class 42), SMASH SAS (fitness streaming), NAMUR, SICE TECH | low for "NoaCG" as one word; real only if the brand were shortened to "Noa" | USPTO serials 99548075, 79449425, 79414702, 79368816 |
| NOA GmbH | company, Vienna | broadcast archive and digitisation (mediARC) | low: same industry, different field | noa-archive.com |
| NOACG in the EU or worldwide | EUIPO / TMview, WIPO Global Brand Database | not checked: TMview timed out, WIPO asked for a CAPTCHA, which was not attempted | **UNCONFIRMED** | tmdn.org, branddb.wipo.int |
| Claude plugins named like ours | `claude-plugins-official` (315), `claude-plugins-community` (2,283) | nothing named `noacg` and no broadcast-graphics plugin | none | their `marketplace.json` files |
| MCP servers named like ours | registry.modelcontextprotocol.io | none for noacg, casparcg, ograf, vmix or "lower third" | none | `/v0.1/servers?search=` |
| Broadcast-graphics agent tools | GitHub | an OGraf graphics skill (`heretorecord/ograf-graphics-skill`), an editor with its own MCP server named `ograf-editor` (`zerodensity/ograf-studio`), a WASP3D designer connector; vMix and OBS control servers (`mcp-vmix`, `obs-mcp` and others) | low for the name; they confirm that `ograf-*` and `obs-*` slugs are already in use | github.com, `npm search` |

A search of national registers outside the US, or a professional clearance, was not done (**UNCONFIRMED**). A
filing is the owner's call and costs money; nothing in this research needs one before listing.
