# Listing drafts, ready to send

Drafted 2026-10-02 against the manifests on `main` at version 0.7.0. Nothing here has been
submitted, and no manifest has been changed: the name is the owner's decision (`name.md`). Each
draft names the manifest fields it would change. The order to send them in, and what each costs,
is in the owner-queue item
([issue #808](https://github.com/NoaCG/NoaCG-Studio/issues/808)).

**Landed, 2026-10-02.** The owner kept `noacg` and chose the display name **NoaCG Broadcast
Graphics and Playout**. Sections 0 and 4 are now in the repository, and the manifests, the plugin
READMEs and `cli/server.json` are the source of truth wherever this file differs: the texts were
rewritten to show playout as well as making graphics, and the Codex display name is **NoaCG
Graphics and Playout**, because OpenAI's limit is 30 characters and the full name is 36. The
portal values in sections 1 and 3 are updated to match; sections 0 and 4 keep their first drafts
as the record of what was proposed.

## 0. The manifest changes every listing shares

These make the plugin findable by the words people type. Claude Code's Discover search reads
`name`, `displayName` and `description`; Codex's reads those and `keywords`
(`where-users-search.md`, 1.2 and 2.1). Manifests are hand-written; only `version` is stamped by
`cli/scripts/build-skill.mjs`, so the edits below do not touch the generator.

| File | Field | Today | Proposed |
|---|---|---|---|
| `cli/plugin/.claude-plugin/plugin.json` | `displayName` | absent | `NoaCG Broadcast Graphics` |
| same | `description` | "Make broadcast graphics for NoaCG Studio from Claude Code. The plugin entrance to the NoaCG CLI: ..." | see text A below |
| `.claude-plugin/marketplace.json`, entry `noacg` | `displayName` | absent | `NoaCG Broadcast Graphics` |
| same | `description` | "The plugin entrance to the NoaCG CLI: ..." | text A |
| `.claude-plugin/marketplace.json`, entry `noacg-mcp` | `displayName` | absent | `NoaCG MCP server` |
| `cli/plugin/.codex-plugin/plugin.json` | `interface.displayName` | `NoaCG` | `NoaCG Broadcast Graphics` (24 characters, limit 30) |
| same | `interface.shortDescription` | `Make broadcast graphics for NoaCG Studio` (40, over the limit of 30) | `Make live broadcast graphics` (28) |
| same | `interface.longDescription` | as today | text B below |
| same | `interface.composerIcon`, `interface.logo` | absent, required for Codex | `./assets/icon.png`, `./assets/logo.png`: copies of `public/noacg-icon-512.png` (512 x 512 PNG) placed in `cli/plugin/assets/` |
| same | `keywords` | 9 hyphenated terms | add `lower third`, `ticker`, `overlay`, `graphics` (Codex matches substrings, so `lower-third` does not match a typed "lower third") |
| same | `description` (required at the root in the Codex format) | "Make broadcast graphics for NoaCG Studio from Codex. ..." | text A without the command, which Codex does not get: text C |
| same | `interface.category` | `Developer Tools` | `Design` only if the OpenAI dashboard offers it (section 3); otherwise unchanged |
| `cli/plugin-mcp/.claude-plugin/plugin.json` | `displayName` | absent | `NoaCG MCP server` (the directory reads the folder's own manifest) |
| `cli/plugin/README.md` | first paragraph | starts "The plugin is one of three entrances to the NoaCG CLI" | open with text A's first sentence: the directory "shows your README as the listing's description" |
| `cli/plugin/README.md`, `cli/plugin-mcp/README.md` | new section | absent | "What it runs and what it sends", below |
| `cli/package.json` | `mcpName` | absent | `io.github.NoaCG/noacg` (section 4) |

The `assets/` path format follows the layout in `openai/plugins`; the portal's automated check
confirms it on upload (**UNCONFIRMED** until then). Two PNG files in the plugin folder are allowed
by Anthropic's checklist ("complete PNG, JPEG, GIF, and WebP images").

**Text A** (plugin and marketplace `description`, 309 characters):

> Make broadcast graphics for NoaCG Studio: lower thirds, scoreboards, tickers, bugs, countdowns
> and full-screen graphics you operate live and play out on CasparCG, OBS, vMix, SPX or any OGraf
> renderer. Adds the noacg-graphic skill and the /noacg:graphic command, and runs nothing until a
> graphic is being made.

**Text C** (Codex root `description`):

> Make broadcast graphics for NoaCG Studio: lower thirds, scoreboards, tickers, bugs, countdowns
> and full-screen graphics you operate live and play out on CasparCG, OBS, vMix, SPX or any OGraf
> renderer. Adds the noacg-graphic skill, and runs nothing until a graphic is being made.

**Text B** (Codex `longDescription`):

> Make a broadcast graphic the way you normally design: a lower third, a scoreboard, a ticker, a
> bug, a countdown or a full-screen graphic. The NoaCG CLI checks it and takes screenshots, and
> saves it into your NoaCG Studio library, ready to operate live from NoaCG's control panel and to
> play out on CasparCG, SPX, OBS, vMix, H2R, LiveOS or any OGraf renderer.

**A README section both plugin folders need** before a security scan reads them. The checklist
asks to "Describe in the README everything the plugin runs, sends, or fetches", and neither
`cli/plugin/README.md` nor `cli/plugin-mcp/README.md` says it today. Proposed text, from reading
`cli/src` (an agent confirms it against the running CLI before it lands):

> ## What it runs and what it sends
>
> The plugin runs the NoaCG CLI, `noacg`, or `npx -y @noacg/cli` when it is not installed, which
> downloads the package from the npm registry. Most commands open NoaCG's `/bridge` page from
> noacg.studio (or the deployment `NOACG_URL` names) in a headless browser on your machine and do
> their work there. `noacg login` opens NoaCG's consent page and keeps a scoped key on your machine
> that can only add graphics to your library. `noacg save` uploads the graphic you made to your own
> NoaCG Studio library. `noacg doctor`, and the MCP launcher once a day, read the latest version
> number from the npm registry. The playout commands, `noacg bridge` and `noacg caspar`, which the
> skill does not use to make a graphic, also connect to noacg.studio and to the CasparCG or OGraf
> servers you point them at. Privacy policy: https://noacg.studio/privacy.

## 1. Anthropic's directory: the `noacg` plugin

Sent from the owner's claude.ai account (Pro or higher) at https://claude.ai/directory/manage, after
GitHub is connected on claude.ai with an account that can push to `NoaCG/NoaCG-Studio`.

| Portal step | Field | Value |
|---|---|---|
| Submit new | What would you like to submit? | **Plugin bundle** |
| Source | Repository | `NoaCG/NoaCG-Studio` |
| Source | Plugin path | `cli/plugin` |
| Source | Branch or tag | leave empty (follows `main`) |
| Source | Validate | must show no **Blocking** finding; see the prediction in `where-users-search.md`, 1.4 |
| Listing details | (read from `plugin.json` and the README) | check that the name reads **NoaCG Broadcast Graphics and Playout**, the short description is the `description` in `cli/plugin/.claude-plugin/plugin.json`, and the long description (the README) opens with the same words |
| Data handling | Does the plugin read or store personal data? | **Yes, limited.** "The plugin stores nothing itself. The NoaCG CLI it runs keeps a scoped agent key on the user's machine after `noacg login`, and `noacg save` stores the graphic the user made, which can contain names typed into its fields, in the user's own NoaCG Studio library." |
| Data handling | Does it send data to services other than its declared connectors? | **Yes.** "It declares no connectors. The CLI talks to noacg.studio (the user's NoaCG deployment) to check, preview and save graphics, and to registry.npmjs.org to download the CLI and read its latest version. This is described in the plugin README." |
| Data handling | How long is data kept? | "The plugin keeps nothing. Saved graphics stay in the user's NoaCG library until the user deletes them; the agent key stays until `noacg logout` or until it is revoked in NoaCG Settings. See https://noacg.studio/privacy." |
| Data handling | Intended for people under 18? | **No** (recommended; the owner's call, since NoaCG is also used by school channels) |
| Compliance | Contact email | an address the owner reads for NoaCG |
| Compliance | Four acknowledgements | read and select (the owner's agreement, not an agent's) |
| Review and submit | How new versions reach the directory | **GitHub push webhook** (needs admin on the repository) |
| Review and submit | Auto-publish passing versions | on, so a release on `main` reaches users without a portal visit once a reviewer allows it |

Manifest fields this listing changes: section 0, Claude rows. The listing is permanent in the sense
that "the first organization to submit a given repository folder holds that listing", so submit
from the account that should own it long term.

## 2. Anthropic's directory: the `noacg-mcp` plugin (later)

The same portal, a second submission: Plugin path `cli/plugin-mcp`, the same data-handling answers
plus "The MCP server it starts runs the same CLI in one process". Expect two **Policy hold**
findings, both from `mcp-server.mjs`: an unpinned `npx` fallback inside a script a server runs, and
a JavaScript file run from a plugin in a subfolder. A hold is not a rejection; a reviewer reads the
version. Send it after `noacg` is live, so the first review is the simple one.

Manifest fields: `displayName` in `cli/plugin-mcp/.claude-plugin/plugin.json` and in its marketplace
entry, and the README section (section 0).

## 3. Codex and ChatGPT directory: the `noacg` plugin, skills only

Sent from the owner's OpenAI platform organisation at https://platform.openai.com/plugins, after
**individual or business verification** in the organisation's settings. Which of the two decides
whose name the listing shows ("publish under your name or a company name"); that is the owner's
call.

| Step | Value |
|---|---|
| Upload | a ZIP of the whole `cli/plugin/` folder, its contents at the ZIP root: `.codex-plugin/`, `skills/`, `assets/`, `README.md`, and also `.claude-plugin/` and `commands/`, which Codex does not read. If the automated check objects to those two, drop them from the ZIP (**UNCONFIRMED** either way). Every run of the CLI release workflow keeps this ZIP as the artifact `noacg-codex-plugin-<version>`: download it from the run's page. |
| Plugin type | skills only: no MCP configuration, no review cases, no video |
| Display name | NoaCG Graphics and Playout (OpenAI's limit is 30 characters; the full name is 36) |
| Short description | Make and play out graphics |
| Long description | `interface.longDescription` in `cli/plugin/.codex-plugin/plugin.json` |
| Category | **Design** if the dashboard offers it, otherwise **Developer Tools** (the manifest's `category` must match the dashboard title; the list is **UNCONFIRMED**) |
| Starter prompts | the three in the manifest today: "Make a football scoreboard for NoaCG", "Make a lower third for our evening news, for NoaCG", "Turn this graphic into a NoaCG graphic I can operate live" |
| Website, privacy, terms | https://noacg.studio, https://noacg.studio/privacy, https://noacg.studio/terms |
| Support URL | https://github.com/NoaCG/NoaCG-Studio/issues (optional for skills only) |
| Brand colour | `#F6A623` (2.02:1 against white, the minimum is 2:1) |

Manifest fields this listing changes: section 0, Codex rows. `noacg-mcp` cannot be listed here while
its server is local.

## 4. The official MCP Registry: the `noacg mcp` server

No account step if published from GitHub Actions; this draft is for the agent row that builds it,
and the owner only approves that the release carries it.

1. `cli/package.json` gains `"mcpName": "io.github.NoaCG/noacg"`, and a new `@noacg/cli` release
   ships it (the registry reads the exact version from npm).
2. `cli/server.json`, validated on 2026-10-02 against the 2025-12-11 schema with the version
   numbers as placeholders (description 85 characters, limit 100):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.NoaCG/noacg",
  "title": "NoaCG Broadcast Graphics",
  "description": "Make, check and save broadcast graphics (lower thirds, scoreboards) for NoaCG Studio.",
  "websiteUrl": "https://noacg.studio",
  "repository": {
    "url": "https://github.com/NoaCG/NoaCG-Studio",
    "source": "github",
    "subfolder": "cli"
  },
  "icons": [
    { "src": "https://noacg.studio/noacg-icon-512.png", "mimeType": "image/png", "sizes": ["512x512"] }
  ],
  "version": "0.8.0",
  "packages": [
    {
      "registryType": "npm",
      "registryBaseUrl": "https://registry.npmjs.org",
      "identifier": "@noacg/cli",
      "version": "0.8.0",
      "transport": { "type": "stdio" },
      "packageArguments": [{ "type": "positional", "value": "mcp" }],
      "environmentVariables": [
        {
          "name": "NOACG_URL",
          "description": "The NoaCG deployment to use. Defaults to https://noacg.studio.",
          "isRequired": false,
          "format": "string"
        },
        {
          "name": "NOACG_AGENT_KEY",
          "description": "A scoped agent key for saving graphics without noacg login, for CI.",
          "isRequired": false,
          "isSecret": true,
          "format": "string"
        }
      ]
    }
  ]
}
```

3. A step in `.github/workflows/release-cli.yml` after the npm publish, with `permissions:
   id-token: write`: `mcp-publisher login github-oidc`, then `mcp-publisher publish`. Both
   `version` fields are stamped from `cli/package.json` like the plugin manifests. The other route,
   `mcp-publisher login github` on a laptop, needs the owner's GitHub account to be an **Owner** of
   the `NoaCG` organisation.

Manifest fields: `cli/package.json` `mcpName`; the new `cli/server.json`.

## 5. GitHub's MCP registry (optional, after section 4)

GitHub's blog (2025-10-24) says to email partnerships@github.com once a server is in the MCP
Registry; GitHub's documentation does not confirm the route (**UNCONFIRMED**). It reaches VS Code
and Copilot users, not Claude Code or Codex. Draft, for the owner to send from his own address:

> Subject: MCP server for inclusion in the GitHub MCP Registry: io.github.NoaCG/noacg
>
> Hello,
>
> NoaCG Studio makes broadcast graphics (lower thirds, scoreboards, tickers) that play out on
> CasparCG, OBS, vMix and OGraf renderers. Its open-source CLI, `@noacg/cli` (Apache-2.0), runs a
> stdio MCP server with one tool for making, checking and saving those graphics. It is published in
> the MCP Registry as `io.github.NoaCG/noacg`, from https://github.com/NoaCG/NoaCG-Studio.
>
> Could it be included in the GitHub MCP Registry? I am happy to provide anything else you need.
>
> Thank you,
> [name], NoaCG Studio, https://noacg.studio

## 6. Anthropic's official marketplace

No draft: there is no submission route. Only an Anthropic partner contact can ask for a listing in
`claude-plugins-official`, and pull requests to it are closed automatically. If a partner contact
ever exists, the entry would take the shape of the existing external entries:

```json
{"name":"noacg","description":"<text A>","category":"design",
 "source":{"source":"git-subdir","url":"https://github.com/NoaCG/NoaCG-Studio.git","path":"cli/plugin","ref":"main","sha":"<commit>"},
 "homepage":"https://noacg.studio"}
```
