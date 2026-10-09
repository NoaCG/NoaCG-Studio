# Agent Toolkit Phase 1: local distribution

Authority: owner request, 2026-10-03. Reference: research commit `2d45a17ff`.

## Why and goal

The local toolkit works, but directory review needs a small, self-contained repository and
reviewed dependency versions. Generate that distribution from the existing canonical skill,
plugin metadata and launcher. Package readiness precedes account setup, submission and approval.

## Decisions and boundaries

- Keep `noacg`, the approved Claude and Codex display names, and the lazy main plugin plus
  optional `noacg-mcp`. No editor, hosted MCP, OAuth, semantic operations or engine changes.
- Generate a distribution-only snapshot for `agent-toolkit-dist` in `NoaCG/NoaCG-Studio`.
  This branch has its own root commit and no application history. No second repository or
  hand-maintained skill. Release automation replaces its tree from the release commit.
- Generate separate Claude packages and a skills-only Codex upload. Keep the supported
  `.codex-plugin` format; a portable Agent Plugins overlay adds no needed capability in Phase 1.
- Use `cli/package.json` as the version authority for manifests, documented install pins and
  the MCP launcher. The launcher imports an installed CLI only at exactly that version; a missing
  or different one goes to npx with the exact pin (decided 2026-10-09: refusing left a user with a
  moved global CLI without a server). An explicit `NOACG_CLI` path remains a disclosed development
  override; a missing override fails instead of falling through.
- Each host gets an MCP entry it can start: Claude Code's `.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}`,
  which Codex does not expand, so the Codex manifest names `codex-mcp.json` (relative launcher,
  `cwd` at the plugin root). Checked against Codex 0.163.0-alpha.2 on 2026-10-09.
- Distribution includes only allowlisted manifests, skill/references, command, launcher, icons,
  READMEs and Apache licence material. npm dependencies and browsers remain separate downloads.
- Ordinary Claude Chat cannot run the local CLI. Local execution requires Claude Code, a local
  Codex environment or another local MCP client, Node and a supported Chromium browser.

## Acceptance criteria

1. `npm run toolkit:dist` generates all packages from a clean checkout using Node 24 and Git,
   without installing app dependencies. Repeated generation at the same commit produces the
   same ZIP hashes, sizes and file counts; provenance identifies that commit and source hashes.
2. Repository ZIP meets Claude repository limits; selected folders meet file/path/licence limits.
   Required files, component paths, pins, manifest metadata and generated skill parity are checked.
   Claude and Codex artifacts validate independently; unsupported Codex MCP is not uploaded.
3. Tests reject drift, omitted licence/reference, stale pins, invalid paths/manifests and size
   overages. ZIP contents extract correctly, and the release uploads those exact ZIPs.
4. Clean Claude and Codex profiles install the generated marketplace. Existing CLI scaffold,
   inspect, validation, capture and offline package/save handoff run from its pinned npm install.
   Actual account-backed save is separately recorded if consent is unavailable. Missing/stale
   installs and explicit overrides produce actionable diagnostics.
5. Release automation updates only the generated distribution branch after a successful npm/MCP
   release. Its provenance links to the source commit. Dry runs generate artifacts without pushing.
6. Submission drafts and the existing account checklist name the actual branch, folders and ZIPs,
   explain launcher review holds, and distinguish packaged/submitted/approved/published.
7. `/check` review, simplification and verification are recorded. Full build failures are investigated
   and reported as failures. Editor code stays untouched.

## Official requirements checked 2026-10-03

[Claude checklist](https://claude.com/docs/plugins/pre-submission-checklist): repository archive
under 50 MiB, unpacked under 256 MiB, fewer than 10,000 entries; plugin files under 5 MiB.
Use regular portable paths, no rewriting attributes, README and licence. Non-image/font files
over 256 KiB or more than 512 files trigger review. Exact package pins still require review;
scripts with package launchers and subfolder JavaScript launchers can also be held.

[OpenAI submission](https://developers.openai.com/plugins/deploy/submission) and
[package guide](https://developers.openai.com/plugins/build/plugins): supported Codex compatibility
manifest, skills and included relative assets; upload ZIP, resolve scans, submit, then publish
after approval. Skills/metadata updates need another ZIP. Local stdio MCP is not a hosted service.
Portal scans, identity/compliance and listing availability remain account work.
