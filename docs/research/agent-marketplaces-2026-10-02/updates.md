# Distribution and directory updates

Updated 2026-10-03. The canonical toolkit lives in NoaCG-Studio. Phase 1 generates a small
repository tree and separate host ZIPs; no manually maintained second repository exists.
See [the generation/release procedure](../../work-specs/agent-toolkit-distribution/release.md).

| Destination | Update path |
|---|---|
| npm CLI / MCP Registry | Existing CLI release workflow and exact CLI version |
| Generated distribution branch | After successful publication, release automation updates agent-toolkit-dist from that source commit |
| Claude directory | Repository NoaCG/NoaCG-Studio, branch agent-toolkit-dist, separate plugins/noacg and plugins/noacg-mcp submissions; configure push webhook in the portal |
| OpenAI directory | Upload the inner noacg-codex-<version>.zip from noacg-agent-toolkit-<version>; skills/metadata updates require another upload and review/publication |

The release's dry run generates artifacts but never pushes the distribution branch. Artifact
retention follows repository settings; an expired ZIP can be regenerated from its source commit.
Provenance records the source commit and canonical-file hashes. Changing the CLI pin requires a
matching regenerated plugin. npm's latest is not an implicit dependency upgrade.

The first successful release after the Phase 1 workflow lands creates the remote distribution
branch. Account work must verify it exists before selecting it. This phase does not submit or
publish a listing. Claude reviewer holds/auto-publication policy and OpenAI scan/review outcomes
remain portal facts, not conclusions from local checks.

Sources checked 2026-10-03: [Claude submission](https://claude.com/docs/plugins/submit),
[Claude checklist](https://claude.com/docs/plugins/pre-submission-checklist),
[OpenAI submission](https://developers.openai.com/plugins/deploy/submission).
