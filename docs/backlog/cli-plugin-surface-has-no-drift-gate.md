# Nothing gates the CLI's plugin manifests or its two verb tables against drift

**Filed:** 2026-09-08. **Source:** the 2026-09-02 invisible-CLI session (handoff since drained)

## Why
The 0.3.0 split left two hand-kept surfaces with no gate. `claude plugin validate` passes on
`cli/plugin/`, `cli/plugin-mcp/` and the marketplace today because a session ran it by hand;
nothing re-runs it, and a broken manifest ships. Separately `MCP_COMMANDS` (`cli/src/mcp.ts:40`)
and the terminal's `COMMANDS` (`cli/src/index.ts:66`) are two literal lists of the same verb set:
`mcp.test.mjs` pins the MCP one, nothing ties them, so a verb added to one entrance is silently
missing from the other. That is exactly the class of bug the one-tool rewrite closed once.

## What it would take
The reason given for skipping both - "the CLI is not on CI" - is no longer true:
`.github/workflows/ci.yml:134` runs `npm --prefix cli ci`, then typecheck, build and test. So: a
unit assertion that the two tables have the same keys, and `claude plugin validate` over both
plugin directories plus the marketplace in the same job, or as a `check:` script if the CI runner
has no `claude` binary.

## Evidence
`cli/src/mcp.ts:40`, `cli/src/index.ts:66`, `.github/workflows/ci.yml:124-134`.
