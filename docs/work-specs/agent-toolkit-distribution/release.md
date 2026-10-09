# Generate and update the toolkit distribution

From a clean source checkout, with Node 24 and Git installed:

```sh
npm run toolkit:dist
```

No dependency installation or editor/application build is required. Output is in
the system temporary folder, `noacg-toolkit/<source-commit>/` (never under `cli/`, whose `dist/`
ships in the npm package). Repeating the command at that commit verifies the same
output. A changed output is refused; choose a fresh directory with
`npm run toolkit:dist -- <empty-directory>`. The output is ignored, never a maintained source.

The directory contains independent Claude main/MCP and Codex main/local-MCP ZIPs, a repository
ZIP, unpacked equivalents and `measurements.json` with bytes, file/entry counts and SHA-256.
Only the Codex main ZIP is the OpenAI public-directory upload. Local stdio MCP is not a hosted
OpenAI integration. The repository tree has a marketplace and both plugin folders. Each package
contains source-commit provenance and canonical-source hashes. LF normalization and fixed ZIP
timestamps make output independent of checkout line endings and generation time. Measurements
record the Node/zlib versions; use that toolchain for byte-identical compressed output.

The source remains `cli/skill/noacg-graphic`, the plugin metadata/READMEs/command and launcher.
`cli/scripts/build-skill.mjs` keeps the skill copies, CLI pins, manifests and licences current.
`npm run check:toolkit` checks distribution shape and independent host metadata without writing
output. The build also runs its rejection/ZIP/launcher tests. On pull requests that touch
these sources, `.github/workflows/toolkit-distribution.yml` generates the distribution, measures
the branch archive and runs a pinned `claude plugin validate --strict` on every Claude folder.

## Release path

1. Make source changes and bump `cli/package.json` through the existing CLI release procedure.
   Synchronize its lockfile, write the changelog and run the existing CLI build/skill generator.
   All runtime CLI dependencies remain exact and lockfile-backed. `/check` and `/queue-merge`
   govern landing. The first generated packages pin the published CLI 0.9.0.
2. The existing release workflow builds/tests the CLI and generates these packages from that
   clean source commit. The `noacg-agent-toolkit-<version>` Actions artifact contains the actual
   ZIPs and measurements. Download it, extract the outer Actions archive, then upload the inner
   `noacg-codex-<version>.zip` to OpenAI. Retention is the repository's Actions retention setting.
   Regenerate from the source commit if an artifact expires.
3. After npm and MCP Registry publication succeed, a separate job with `contents: write` publishes
   the generated tree to **`agent-toolkit-dist` in the same repository**. Its initial commit has
   no parent from the app repository. Later parents contain only earlier distribution snapshots.
   A delayed source commit cannot replace a newer one; force-with-lease rejects a racing update.
   It never writes `main`. Dry runs upload packages and never publish this branch.
4. Claude submissions follow that branch, selecting `plugins/noacg` and, separately,
   `plugins/noacg-mcp`. Set up the push webhook in the portal. Reviewer-held updates still require
   review; auto-publication depends on the listing's actual policy. Codex skill/metadata updates
   require a new ZIP on the existing listing, followed by scans/review/publication.

Rehearse branch preparation without a push:

```sh
node cli/scripts/publish-toolkit-distribution.mjs
```

It creates a temporary distribution-only Git repository and reports its Git archive size,
source commit and generated commit. `--push` is reserved for the successful release job and
targets only the canonical HTTPS repository's `agent-toolkit-dist`. The branch is not created
by Phase 1 local rehearsal. The first real release after this workflow lands makes it available
for account submission. Never submit the full application branch to Claude.

The portal's security/schema scans and publisher/compliance checks remain authoritative.
Local checks cannot prove name availability, account rights, reviewer approval or directory search.
