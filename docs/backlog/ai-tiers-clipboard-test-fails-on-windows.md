# The install-block copy test fails on every local Windows run

**Filed:** 2026-09-24. **Source:** row H's affected e2e run (`docs/handoffs/2026-09-24-h-old-editor-live-walk.md`).

## Why

`e2e/ai-tiers.spec.ts`, "each install block copies its two lines whole, and says so", failed 4 of
4 times on this laptop (jobs j-1888 and j-1891) on a branch that does not touch the AI step. The
clipboard read back the first line with one extra trailing character. A local affected run is
therefore red for a reason unrelated to the change being checked, and every session that runs one
has to work out again that it is noise.

## What it would take

The product writes the exact string (`CLAUDE_CODE_INSTALL` in
`src/components/wizard/steps/ai/AgentRouteCard.tsx`, through `copyLink`). The likely cause is the
Windows system clipboard turning `\n` into `\r\n`. Confirm it by logging `JSON.stringify` of the
read text, then normalise line endings in the test's `clipboard()` helper with a comment saying
why, and check the Codex block's assertion in the same test.

## Evidence

- `node scripts/jobs.mjs log j-1891`: 2 of 2 repeats fail at `ai-tiers.spec.ts:140`, while
  `wizard-preview.spec.ts:518` (which failed once under full-suite load in j-1888) passes 2 of 2.
