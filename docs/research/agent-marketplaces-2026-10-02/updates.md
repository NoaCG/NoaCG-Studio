# How each directory picks up a new version (research, 2026-10-02)

Every source below was read on 2026-10-02. Quotes are verbatim; **UNCONFIRMED** marks what no
official source states. The question: after a `@noacg/cli` release, what reaches each listing by
itself, and what needs the owner every time.

## The answer

| Channel | How a new version arrives | Review per version | Fed by the release | Person per version |
|---|---|---|---|---|
| Anthropic's directory (`noacg`, later `noacg-mcp`) | It follows a branch or tag in the repository, on a schedule and on a GitHub push webhook | Automated validation and security scan on every version; a person only when a version is held | Yes: the version bump lands on `main`, which the listing follows | **Publish** for each passing version, unless Anthropic's publish setting lets passing versions go live by themselves |
| Codex and ChatGPT directory (`noacg`) | A new ZIP uploaded on platform.openai.com/plugins | Each upload is a package version "with its own checks and review outcome" | Partly: the release run keeps the ZIP as an artifact | **Upload, review, publish**, whenever the skill or the listing text should change |
| Official MCP Registry (`io.github.NoaCG/noacg`) | A publish per version, from the release workflow | None documented; automated validation and the npm ownership check | Yes, fully | None |
| This repository's marketplace (`noacg-studio`) | Users' Claude Code and Codex read the repository | None | Yes: the version bump on `main` | None from us; each user updates, or turns on auto-update |

The CLI itself, which does all the work, updates without any listing: the skill runs
`npx -y @noacg/cli`, which takes npm's newest version, and `noacg doctor` and the MCP launcher say
when an installed copy is behind. A listing that lags therefore lags in its skill text and its
listing text, not in what the CLI can do.

## 1. Anthropic's directory

Source: https://claude.com/docs/plugins/submit ("Submit your plugin"), sections "Review and
submit", "Publish a passing version" and "Update a published plugin".

- **What it follows.** "Branch or tag (optional): the branch or tag that the directory follows for
  new versions ... Leave the field empty to follow the repository's default branch. A tag stays on
  its commit until you change the tag."
- **How it notices.** "The directory checks the tracked branch for new commits on a schedule. If
  you set up the GitHub push webhook, the directory also checks when you push, without waiting for
  the schedule." The webhook is offered after submitting, and "You need admin access to the
  repository on GitHub to set up the webhook."
- **Checks on every version.** "the directory scans the newest commit on the tracked branch or tag.
  Each scan validates the plugin against the directory's rules again and runs a security scan." A
  version then passes, is "Held for a reviewer", or does not pass.
- **Publishing.** "A version that passes every check isn't live until it's published." The publish
  setting is Anthropic's, shown in the plugin's **Auto-publish** row: "An Anthropic reviewer
  publishes each version" (the default: "For every version that passes, you select **Publish** and
  a reviewer publishes it"), "The reviewer publishes only the first version" (later passing
  versions "go live by themselves"), or "You publish the first version". The owner's own toggle,
  **Auto-publish passing versions**, "doesn't apply while a reviewer publishes each version".
- **What users keep meanwhile.** "The listing keeps serving the last published version until a new
  version is published, including when a new version doesn't pass or is held for a reviewer. If
  the security scan fails a new version, later versions also wait until an Anthropic reviewer
  clears the plugin."
- **Versions.** "If your `plugin.json` sets `version`, raise it with every release." NoaCG's
  manifests set it, stamped from `cli/package.json` by `cli/scripts/build-skill.mjs`, so it rises
  with every release. "its name and short description follow the version that's live".
- **Reaching Claude Code.** A directory plugin a user turned on loads as `<name>@synced`; "each
  time you start Claude Code, it syncs once in the background, downloading new and updated
  plugins" (https://code.claude.com/docs/en/plugins/loading, "Plugins synced from claude.ai").

**What NoaCG's release feeds:** the commit on `main` that bumps the version. With the webhook set
up the directory scans it on push; without it, at the next scheduled check. Whether the directory
also makes a new version of a commit on `main` that changes nothing in the plugin's folder is
**UNCONFIRMED**; the docs say only that it "reads and scans only that folder".

**What stays manual:** setting up the webhook once (repository admin), and **Publish** on every
passing version for as long as the plugin's Auto-publish row says a reviewer publishes each one.
Following a release tag instead of `main` would hold back unreleased skill text, but "release a new
version by changing the tag" makes every release a portal visit or a moved tag, so `main` is
recommended: the version only rises in the commit a release lands.

## 2. Codex and ChatGPT directory

Source: https://developers.openai.com/plugins/deploy/submission ("Plugin submission").

- **No feed.** "To update metadata, assets, or bundled skills, upload a new ZIP to the existing
  plugin. This creates a package version with its own checks and review outcome." The steps: "Open
  the existing plugin and select **Upload plugin to make changes**. Confirm the selected package
  version in **Metadata & Skills**. Review the new automated findings and resolve required issues.
  Complete the applicable review steps and publish the approved package version."
- **Only hosted MCP tools update by themselves**: "Changes to hosted tools are handled separately
  through MCP scans, so they don't require a package upload." NoaCG's listed plugin is skills only,
  so this does not apply.
- **Version.** "use an explicit semantic version for submission and updates." The Codex manifest's
  `version` is stamped like the others.
- **No API or CLI for uploading** is documented; the dashboard is the only route (no GitHub sync
  or webhook is mentioned anywhere on the page).
- **Field limits**, confirmed on the same page: `interface.displayName` "required, at most 30
  characters", `interface.shortDescription` "required, at most 30 characters". The full name, NoaCG
  Broadcast Graphics and Playout, is 36, so the Codex manifest says **NoaCG Graphics and Playout**
  (26): it keeps "Playout" and the brand and drops "Broadcast", which the description, the keywords
  and every other listing still carry. `cli/scripts/build-skill.mjs` now refuses a Codex manifest
  over any of these limits.
- How a Codex user who installed from the directory receives a newly published version is not
  documented (**UNCONFIRMED**).

**What NoaCG's release feeds:** the release workflow keeps `noacg-codex-plugin-<version>` as a run
artifact, the `cli/plugin/` folder with its contents at the root, which is the ZIP the dashboard
takes. **What stays manual, every time:** the upload, the review and the publish, from the owner's
verified OpenAI organisation. It is worth doing when the skill or the listing text changed, not for
every release: the CLI the skill runs comes from npm either way.

## 3. The official MCP Registry

Sources: https://github.com/modelcontextprotocol/registry, `docs/modelcontextprotocol-io/`
(github-actions, versioning, about) and `cmd/publisher/commands/` and
`internal/validators/registries/npm.go` in the same repository.

- **A publish per version.** "The version string **MUST** be unique for each publication of the
  server. Once published, the version string (and other metadata) cannot be changed."
- **No polling of npm** is documented: a version exists in the registry only once it is published
  there. The registry fetches the npm version at publish time and refuses a package whose
  `mcpName` does not match: "NPM package '%s' is missing required 'mcpName' field", and for a
  version npm does not serve yet, "A newly published release can take a moment to appear on the
  registry. Wait and retry".
- **Version alignment.** "For local servers, align the server version with the underlying package
  version in order to prevent confusion."
- **From CI with no secret.** The registry's GitHub Actions guide uses `mcp-publisher login
  github-oidc` with `permissions: id-token: write`, and the registry grants a workflow the
  namespace `io.github.<repository owner>/*` (`internal/api/handlers/v0/auth/github_oidc.go`).
  Registry tokens last five minutes (`internal/auth/jwt.go`).
- **Validation without publishing.** `mcp-publisher validate` posts the file to the registry's
  `/v0/validate` endpoint: schema and semantic rules, not npm ownership (tested on 2026-10-02: a
  `server.json` naming a published version without `mcpName` validated clean).
- **Who reads it.** "intended to be consumed primarily by downstream aggregators" (about). How
  often aggregators, or GitHub's MCP registry, re-read it is **UNCONFIRMED**.

**What NoaCG's release feeds:** everything. `.github/workflows/release-cli.yml` validates
`cli/server.json` and signs in before npm, publishes it after npm serves the version, and can
re-drive the registry step alone. **What stays manual:** nothing.

## 4. This repository's marketplace

Sources: https://code.claude.com/docs/en/plugins/install ("Keep plugins updated") and
https://code.claude.com/docs/en/plugins/loading ("Versions and updates").

- Claude Code turns auto-update on by default only for Anthropic's official marketplaces and
  marketplaces added from claude.ai; it is off "for every other marketplace, including the
  community marketplace, third-party marketplaces, and local development marketplaces". A user
  turns it on in `/plugin`, **Marketplaces**, **Enable auto-update**.
- "a manifest that pins `"version": "1.0.0"` keeps every user on the cached copy until its
  author changes the string", so users see a new version exactly when a release bumps it.
- The one-command install for a person in a session: "To install a plugin from a marketplace you
  haven't added yet, run `/plugin install` in a Claude Code session and name the marketplace source
  with `--marketplace`. Requires Claude Code v2.1.275 or later." Codex has no equivalent: `codex
  plugin add --marketplace` takes "Marketplace name to use when PLUGIN does not include
  @MARKETPLACE" (codex-cli 0.161 `--help`).

**What NoaCG's release feeds:** the bump on `main`. The install guides now say how to turn on
auto-update. **What stays manual:** each user's update or auto-update switch, which is theirs.
