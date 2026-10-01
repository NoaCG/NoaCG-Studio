# Where a Claude Code or Codex user searches, and how to be there

Read 2026-10-02. Quotes are verbatim from the source named beside them; the full source list is at
the end. **UNCONFIRMED** marks anything no official source states. "Observed" marks something read
out of a shipped binary or source file rather than out of documentation: it is true of that version
and can change without notice.

What NoaCG ships today (from the manifests in this repository, version 0.7.0 in the repo, 0.4.2 on
npm's `latest`):

| Piece | Where | Name |
|---|---|---|
| Skill plugin, no server | `cli/plugin/` (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`) | `noacg` |
| Optional MCP server plugin | `cli/plugin-mcp/` (`.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/mcp-server.mjs`) | `noacg-mcp` |
| Marketplace | `.claude-plugin/marketplace.json`, read by both Claude Code and Codex | `noacg-studio` |
| CLI and stdio MCP server | npm `@noacg/cli`, command `noacg`, server `noacg mcp` | `noacg` |

## 1. Claude Code

### 1.1 What a fresh install searches

- **One marketplace is added by itself, and only in an interactive session.** "Claude Code adds it
  the first time you start an interactive terminal session" (anthropic-marketplaces). That
  marketplace is `claude-plugins-official`. The community (`claude-community`) and demo
  (`claude-code-plugins`) marketplaces are added only by hand.
- **A bare name looks only in marketplaces already added.** `/plugin install <name>` "looks the
  name up in your marketplaces", and otherwise "you see `Plugin "<name>" not found in any
  marketplace`" (anthropic-marketplaces). The agent-door audit measured exactly this for `noacg`
  (`docs/AGENT_DOOR_AUDIT.md`, section 1).
- **One command can add a marketplace and install from it.** "To install a plugin from a marketplace
  you haven't added yet, run `/plugin install` in a Claude Code session and name the marketplace
  source with `--marketplace`. Requires Claude Code v2.1.275 or later" (install). For NoaCG:
  `/plugin install noacg --marketplace NoaCG/NoaCG-Studio`. Claude Code asks the user to confirm
  the new source first. It is a session command; the shell form `claude plugin install` has no
  `--marketplace` option (observed in `claude plugin install --help`, 2.1.283).
- **Anthropic's own advice to a CLI vendor** is to print the two commands from the installer: "have
  your installer or post-install message run or print the two commands a user needs" (publish).
- **The in-CLI install hint is closed to NoaCG.** A CLI can print a `<claude-code-hint />` that offers
  the plugin, but it "applies only if your plugin is listed in `claude-plugins-official` or another
  marketplace with one of Anthropic's official marketplace names" (cli-hints).

### 1.2 What the Discover search reads

The docs say only that the Discover tab "lists the plugins from your marketplaces, and you can type
to search" (install). Which fields it matches is not documented (**UNCONFIRMED** in docs).

Observed in the Claude Code 2.1.283 binary: the Discover filter is a case-insensitive substring
match on the marketplace entry's `name`, `displayName` and `description`, and on the marketplace's
name. It does **not** read `keywords`, `tags` or `category`. So for a user who has added the
marketplace, typing "broadcast" finds `noacg` today (its marketplace description says "broadcast
graphics"), while "lower third", "scoreboard", "CasparCG", "OBS" and "vMix" find nothing, because
those words are only in `keywords`.

### 1.3 The official marketplace takes no submissions

- "Anthropic's official marketplace, `claude-plugins-official`, doesn't take submissions through the
  directory portal. If you work with an Anthropic partner contact, ask them about an
  official-marketplace listing." (publish)
- Pull requests to `anthropics/claude-plugins-official` are closed by a workflow
  (`.github/workflows/close-external-prs.yml`) that says the repository "only accepts contributions
  from Anthropic team members" and links the directory submission page. The README still mentions a
  submission form for partners; the docs above are newer and more specific.
- **This changes the 2026-09-16 owner-queue item.** It assumed a pull request to that repository
  would make `claude plugin install noacg` work. That route is closed to us.

How comparable tools are listed there (verbatim from its `marketplace.json`, 315 entries, every
external entry pinned to a commit):

```json
{"name":"stripe","description":"Stripe development plugin for Claude","category":"development",
 "source":{"source":"git-subdir","url":"https://github.com/stripe/ai.git","path":"providers/claude/plugin","ref":"main","sha":"97b2164821c378f246c3903852057b36a8bd0296"},
 "homepage":"https://github.com/stripe/ai/tree/main/providers/claude/plugin"}
```

```json
{"name":"sentry","description":"Sentry error monitoring integration. Access error reports, analyze stack traces, search issues by fingerprint, and debug production errors directly from your development environment.","category":"monitoring",
 "source":{"source":"url","url":"https://github.com/getsentry/plugin-claude.git","sha":"73e53541d7af21672e27428c7067f4264b8a3d65"},
 "homepage":"https://github.com/getsentry/plugin-claude"}
```

The `design` category holds `canva`, `figma`, `adobe-for-creativity`, `miro`, `runway-api`,
`hyperframes` and `superdesign`. Each is named after its own brand. No plugin in the official
marketplace (315) or the community marketplace (2,283) is about broadcast graphics, CasparCG, OGraf,
vMix or OBS graphics. How each partner obtained its listing is not published (**UNCONFIRMED**).

### 1.4 Anthropic's directory: the route that is open

| Question | Answer and source |
|---|---|
| What it is | "Anthropic's catalog of plugins and connectors that people browse inside Claude, on the Customize page in claude.ai and the desktop app" (directory/publish). |
| How it reaches Claude Code | "A person who installs your plugin from the directory on claude.ai has it on their account, and Claude Code loads it as `<name>@synced`" (publish). |
| Where to submit | "the developer portal at claude.ai/directory/manage", **Submit new**, then **Plugin bundle** (plugins/submit). |
| Who can submit | "Pro, Max, Team, or Enterprise. Free accounts can't submit." On Team and Enterprise, an Owner (directory/publish). "There's no partner program to apply to first." |
| Cost | No fee is mentioned; the cost is the paid plan (**UNCONFIRMED** that there is none). |
| Source | A GitHub repository that "must be public before the listing goes live"; the portal checks that the connected GitHub account can push to it (plugins/submit). |
| One plugin each | "Each plugin folder is its own submission", so `noacg` and `noacg-mcp` are two submissions (plugins/submit). |
| Review | "every version gets automated validation and a security scan, and a person reviews a new listing before it goes live" (directory/publish). |
| Time | "Review time isn't fixed." (directory/publish) |
| Labels | "There's no separate application for the **Verified** label"; Anthropic decides during review (directory/publish). |
| Updates | The directory follows a branch or tag and rescans each new commit; a passing version is published by a reviewer by default, or automatically once a reviewer allows it (plugins/submit). |
| Policies | Anthropic Software Directory Terms and Software Directory Policy (support.claude.com articles 13145338 and 13145358). |

The checks the portal runs, applied to NoaCG's two plugin folders (plugins/pre-submission-checklist;
the results are predictions from reading the files, the portal's **Validate** has not been run):

| Check | `cli/plugin` (`noacg`) | `cli/plugin-mcp` (`noacg-mcp`) |
|---|---|---|
| Name: lowercase, digits, hyphens; not a reserved word such as `mcp` "as the whole name" | passes | passes (`mcp` is not the whole name) |
| "a name that no other organization's plugin uses" | no clash found (`name.md`) | no clash found |
| README of at least 40 words outside code blocks | 568 words in total | 433 words in total |
| `LICENSE` file or `license` in `plugin.json` | `license: Apache-2.0` | `license: Apache-2.0` |
| Every non-image file under 256 KiB, at most 512 files | 10 files, none over 256 KiB | 6 files |
| Launchers pinned, "such as `npx <package>@1.2.3`" (Blocks) | none in hooks or servers. The skill and README tell Claude to run `npx -y @noacg/cli` unpinned; the checklist says "A script that `SKILL.md` only tells Claude to run isn't part of this check" about held scripts, but does not say whether the pin rule reads skill text (**UNCONFIRMED**; the portal's **Validate** answers it) | `.mcp.json` runs a file, which is allowed |
| "Keep launchers and package installs out of each script that a hook or an MCP server runs" (held) | not applicable | **held for a reviewer**: `mcp-server.mjs` falls back to an unpinned `npx -y @noacg/cli mcp` |
| A non-shell file run by a server, from a plugin in a subfolder (held) | not applicable | **held**: `mcp-server.mjs` is JavaScript and the plugin is in a subfolder |
| Security scan: undisclosed network use | the README should say the CLI talks to `noacg.studio` and reads npm's `latest` | the same, plus the npm read in `npm-latest.mjs` |

So `noacg` should pass validation as it stands, unless the pin rule reads skill text; if it does,
the fix is to name an exact version in the skill's `npx` lines, which the skill's generator would
stamp like the manifest versions. `noacg-mcp` should be submittable but held for a
reviewer on two findings. The data-handling and compliance answers are drafted in `drafts.md`.

### 1.5 The community marketplace

`anthropics/claude-plugins-community` (marketplace name `claude-community`) is "a **read-only
mirror** ... synced **nightly** from Anthropic's internal review pipeline", and "Every plugin listed
here has been: Submitted via claude.ai, Passed automated security scanning, Been approved for
distribution". Pull requests "are closed automatically" (its README). A user still has to add it by
hand. Whether every approved directory plugin is mirrored there is **UNCONFIRMED**.

### 1.6 Connectors (MCP servers on their own)

- "Your server is remote and reachable over HTTPS ... A local server can't be submitted on its own;
  include it in a plugin instead" (connectors/building/submission).
- "the directory no longer accepts local MCP servers packaged as desktop extensions (MCPB)"
  (directory/publish).
- So the stdio `noacg mcp` server reaches the directory only inside the `noacg-mcp` plugin.

### 1.7 The MCP Registry

No Claude Code page mentions registry.modelcontextprotocol.io, and no `claude mcp` subcommand
searches anything. That Claude Code does not read it is **UNCONFIRMED**, but nothing says it does.

## 2. Codex

### 2.1 What Codex searches

- **One public catalog, shared with ChatGPT.** "Public plugins are published once to the universal
  plugin directory shared by ChatGPT and Codex. Local and repo marketplaces are separate authoring,
  testing, and team-distribution sources." (plugins/build/plugins)
- **Local marketplaces it reads**: `$REPO_ROOT/.agents/plugins/marketplace.json`,
  `$REPO_ROOT/.claude-plugin/marketplace.json` ("legacy support") and
  `~/.agents/plugins/marketplace.json` (plugins/build/plugins). NoaCG's root marketplace is the
  legacy path; it worked on 2026-08-27 (`docs/AGENT_CLI.md`).
- **Browsing**: in the CLI, `/plugins` opens "the plugin browser, which groups plugins by marketplace
  source with tabbed navigation"; in the app, the **Plugins** tab; "Plugins aren't available in the
  IDE extension" (learn.chatgpt.com/docs/plugins).
- **What the CLI search reads** (observed, `codex-rs/tui/src/chatwidget/plugin_catalog.rs` on
  `main`): display name, id, name, marketplace label, description and keywords, joined into one
  string. Unlike Claude Code, Codex does read `keywords`.
- Codex's reserved marketplace names are the `openai-*` family; `noacg-studio` is not reserved
  (observed, `codex-rs/core-plugins/src/marketplace_policy.rs`).

### 2.2 Getting into the directory

| Question | Answer and source |
|---|---|
| Where | platform.openai.com/plugins: upload a ZIP, resolve automated findings, submit for review (plugins/deploy/submission). |
| Who | "Organization owners can submit; other members need Apps Management Write"; and "Complete individual or business verification in organization settings to publish under your name or a company name" (plugins/deploy/submission). |
| Skills only | Allowed: "Your plugin can include MCP connections, skills, or both." Skills-only plugins skip the MCP test cases and the video (plugins/deploy/submission). |
| A local MCP server | Not as it is: "If your MCP server runs locally, deploy it to a public HTTPS URL. If you can't, reach out to your OpenAI contact for local MCP support." (plugins/build/plugins). `noacg-mcp` is out until then. |
| Not accepted | ZIPs with app references or lifecycle hooks (plugins/deploy/submission). NoaCG's plugin has neither. |
| Review | "Feedback from the review team is sent by email"; "Only one review can be active per plugin"; after approval "you choose when to publish" (plugins/deploy/submission). |
| Time and cost | Neither is stated (**UNCONFIRMED**). |

Field limits that matter for `cli/plugin/.codex-plugin/plugin.json` (plugins/deploy/submission):

| Field | Limit | NoaCG today |
|---|---|---|
| `name` | at most 64, lowercase, digits, single hyphens | `noacg`, passes |
| `interface.displayName` | at most 30 | `NoaCG`, passes |
| `interface.shortDescription` | "required, at most 30 characters" | `Make broadcast graphics for NoaCG Studio`, **40, fails** |
| `interface.longDescription` | at most 4000 | passes |
| `interface.developerName` | at most 80; "set automatically from your selected verified developer identity" | `NoaCG Studio` |
| `interface.category` | a dashboard category "such as Productivity or Developer Tools" | `Developer Tools` |
| `interface.capabilities` | required in the Codex format | `["Write"]` |
| `interface.defaultPrompt` | up to three, at most 128 characters | three, all short, passes |
| `interface.brandColor` | "#RRGGBB format, with at least 2:1 contrast against white" | `#F6A623` measures 2.02:1, passes narrowly |
| `interface.composerIcon`, `interface.logo` | "Required for Codex"; square, at least 48 px, PNG, JPEG, WebP or SVG, at most 5 MiB | **missing**. `public/noacg-icon-512.png` (512 x 512) is a candidate |
| `websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL` | "Required for MCP review"; skills-only does not need all four | three set, `supportURL` missing (not needed for skills only) |

The docs now prefer a root `plugin.json` with an `extensions.com.openai` block; "Existing
`.codex-plugin/plugin.json` files remain supported as a compatibility fallback" (plugins/build/plugins).
No change is needed for that.

### 2.3 Skills catalog

`openai/skills` "is deprecated", and the README sends authors to plugins instead. The way for a third
party's skill to be found in Codex is a skills-only plugin in the directory.

### 2.4 The MCP Registry

No Codex document or source file mentions the MCP Registry (a code search of `openai/codex` for
`registry.modelcontextprotocol.io` found nothing). That Codex does not read it is **UNCONFIRMED**.

## 3. The official MCP Registry

| Question | Answer and source |
|---|---|
| Status | "currently in preview. Breaking changes or data resets may occur before general availability" (registry docs, about). |
| Who reads it | "intended to be consumed primarily by downstream aggregators, such as MCP server marketplaces", and "not intended to be directly consumed by host applications" (about). |
| NoaCG there today | none: `/v0.1/servers?search=noacg` returns zero servers. |
| Search | the public `search` parameter matched substrings of server names only in the tests run for `name.md` ("ograf" matched "cronotacografo"). |
| Cost | none mentioned (**UNCONFIRMED** that it is free). |

Publishing an npm stdio server (registry docs: quickstart, package-types, authentication):

1. Add `"mcpName": "<server name>"` to the package's `package.json`. "The `mcpName` property
   **MUST** match the server name from `server.json`."
2. Publish that version to npm. The registry fetches the exact version and fails with "NPM package
   '%s' is missing required 'mcpName' field" otherwise (registry source,
   `internal/validators/registries/npm.go`). **So the first listing needs a new `@noacg/cli`
   release**; 0.4.2 on npm has no `mcpName`.
3. Write `server.json` (`mcp-publisher init`), log in, `mcp-publisher publish`.

A CLI whose server starts with an argument uses `packageArguments`, as the registry's own reference
shows for Snyk: `"packageArguments": [ { "type": "positional", "value": "mcp" } ]`
(generic-server-json reference).

Namespaces: `io.github.<user-or-org>/<name>` proven by GitHub, or `<reverse-domain>/<name>` proven by
DNS or HTTP. For a GitHub organisation through `mcp-publisher login github`, "you must be an
**Owner** of that organization". Publishing from GitHub Actions (`login github-oidc`, `permissions:
id-token: write`) grants the repository owner's namespace, here `io.github.NoaCG/*` (registry source,
`github_oidc.go`). Whether the lowercase `io.github.noacg` also matches is **UNCONFIRMED**; use the
exact case. The domain route for `noacg.studio` would be `studio.noacg/<name>` with a TXT record on
the apex: `noacg.studio. IN TXT "v=MCPv1; k=ed25519; p=<public key>"`.

Limits from the 2025-12-11 schema: `name` matches `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`;
`description` at most 100 characters; a version can be published once.

**GitHub's MCP registry** (github.com/mcp) is read by VS Code and Copilot. GitHub's launch post
(2025-09-16) said self-published servers "will automatically appear"; a later post (2025-10-24)
says to publish to the community registry first and then "email partnerships@github.com and request
for your server to be included". GitHub's documentation was not found to confirm either
(**UNCONFIRMED**). No documentation or source shows Claude Code or Codex reading it.

## 4. What this means

| Channel | Searched from inside | Open to NoaCG | Owner step | Agent work first |
|---|---|---|---|---|
| `claude-plugins-official` | Claude Code `/plugin` on every fresh install | No; partner contact only | none possible | none |
| Anthropic directory | claude.ai Customize; reaches Claude Code as `@synced` | Yes, `noacg` now; `noacg-mcp` held for review | submit from claude.ai/directory/manage | search words into `displayName` and `description` (optional, recommended) |
| `claude-community` | Claude Code, only after a user adds it | Follows the directory (**UNCONFIRMED**) | none | none |
| Codex / ChatGPT directory | Codex `/plugins`, the app's Plugins tab | Yes for `noacg`; no for `noacg-mcp` (stdio) | verify the OpenAI organisation, upload the ZIP | `shortDescription` to 30 characters, add `logo` and `composerIcon` |
| MCP Registry | neither tool, as far as anything documents | Yes | none if published from CI | `mcpName`, `server.json`, a release, a publish step |
| GitHub MCP registry | VS Code, Copilot | On request (**UNCONFIRMED**) | one email | the MCP Registry first |
| Own marketplace, one command | Claude Code 2.1.275+ | Already live | none | change the install line in the guides |

## Sources (all read 2026-10-02)

Anthropic:
- https://code.claude.com/docs/en/plugins/anthropic-marketplaces (anthropic-marketplaces)
- https://code.claude.com/docs/en/plugins/install (install)
- https://code.claude.com/docs/en/plugins/publish (publish)
- https://code.claude.com/docs/en/plugins/cli-hints (cli-hints)
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://code.claude.com/docs/en/plugins/troubleshooting
- https://code.claude.com/docs/en/mcp
- https://claude.com/docs/directory/publish (directory/publish)
- https://claude.com/docs/plugins/submit (plugins/submit)
- https://claude.com/docs/plugins/pre-submission-checklist (plugins/pre-submission-checklist)
- https://claude.com/docs/connectors/building/submission (connectors/building/submission)
- https://github.com/anthropics/claude-plugins-official (README, `.claude-plugin/marketplace.json`, `.github/workflows/close-external-prs.yml`)
- https://github.com/anthropics/claude-plugins-community (README, `.claude-plugin/marketplace.json`)
- The Claude Code 2.1.283 binary on this machine (Discover filter; `claude plugin install --help`)

OpenAI:
- https://learn.chatgpt.com/docs/plugins (redirected from developers.openai.com/codex/plugins)
- https://developers.openai.com/plugins/build/plugins (plugins/build/plugins)
- https://developers.openai.com/plugins/deploy/submission (plugins/deploy/submission)
- https://github.com/openai/plugins (README)
- https://github.com/openai/skills (README, deprecation notice)
- https://github.com/openai/codex, `codex-rs/tui/src/chatwidget/plugin_catalog.rs`, `codex-rs/core-plugins/src/marketplace_policy.rs`, `codex-rs/core-plugins/src/lib.rs`

MCP Registry and GitHub:
- https://github.com/modelcontextprotocol/registry, `docs/modelcontextprotocol-io/` (about, quickstart, package-types, authentication, github-actions, versioning), `docs/reference/server-json/generic-server-json.md`, `internal/validators/registries/npm.go`, `internal/api/handlers/v0/auth/github_oidc.go`
- https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
- https://registry.modelcontextprotocol.io/v0.1/servers?search=noacg
- https://github.blog/ai-and-ml/github-copilot/meet-the-github-mcp-registry-the-fastest-way-to-discover-mcp-servers/
- https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/
