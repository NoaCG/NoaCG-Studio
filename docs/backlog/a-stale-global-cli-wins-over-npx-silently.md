# A stale global `@noacg/cli` wins over npx forever, and nothing says so

**Filed:** 2026-09-10. **Source:** measurement, the clean-profile install run for
`docs/DEMO_2026-09-25.md` B5 (`docs/PROMISE_AUDIT.md`, "The clean-profile install run (row 23)").

## Why

`cli/plugin-mcp/mcp-server.mjs` `resolveCli()` prefers an installed `@noacg/cli` over the npx
fallback, walking `PATH` to find one. That preference is correct and deliberate: npx costs 1.5-4 s
and a resident launcher process in every session, which is the whole reason the launcher exists
(`docs/AGENT_CLI.md`, "What a session pays"). The defect is that the preference is permanent and
silent. A machine that ran `npm i -g @noacg/cli` once keeps that version for every future session,
however old it gets.

**What hides it is which `doctor` people are told to run.** `doctor` prints `cliVersion()`, the
version of the copy executing it (`cli/src/commands/doctor.ts`), so a bare `noacg doctor` off a
stale global reports 0.2.0 and gives the game away. But the docs prompt at `/docs#agent-install`
and `docs/AGENT_CLI.md` both say `npx -y @noacg/cli doctor`, which fetches `latest` and reports
that instead, while the MCP server goes on importing the global. The check everyone is pointed at
is the one that cannot see the problem.

This is not hypothetical and it is not only about strangers. **This laptop is the machine it is
true of**, and the owner drives an agent on his own screen at the 25 September session
(`docs/DEMO_2026-09-25.md` R2.3).

## What it would take

Two separable pieces, and the first is worth doing even if the second is refused.

1. **Say it, and be careful what it is compared against.** `resolveCli()` returns a path today and
   reads no version at all, so the launcher would first have to read the resolved package's
   `package.json`. **Do not compare it with the plugin manifest's stamped version**: the manifest
   is stamped from `cli/package.json` at build time and runs ahead of the registry - 0.3.1 against
   npm `latest` 0.3.0 as this is filed - so that comparison would tell every correctly installed
   fresh machine that its CLI is stale. Compare against the registry's `latest`, cached, or against
   a floor the server actually needs. One stderr line on the channel that already carries the
   npx-fallback notice.
2. **Decide whether `doctor` should report the MCP server's resolution too.** Today it reports the
   version of the copy running it, which is honest for the terminal road and useless for the
   question people use it to answer, because the prompt tells them to run it under `npx`. A second
   line naming what `resolveCli()` would pick would answer both at once.

Running `npm i -g @noacg/cli@latest` on this laptop is the immediate fix for this machine and is
not the item; the item is that nobody would have found out. It was deliberately not run during the
2026-09-10 wave, because changing shared machine state while other rows are measuring can corrupt
their numbers silently - check `node scripts/e2e-runs.mjs` and the worktree activity first.

## Evidence

Measured 2026-09-10 by driving `cli/plugin-mcp/mcp-server.mjs` over stdio with `initialize` then
`tools/list`, `CLAUDE_PLUGIN_ROOT` pointed at the installed plugin directory:

- With the machine's global on `PATH` (`C:\Users\ahonemi\AppData\Roaming\npm\node_modules\@noacg\cli`,
  version **0.2.0**): `serverInfo.version` 0.2.0 and the old **seven-tool** shape
  (`noacg_types`, `noacg_scaffold`, `noacg_validate`, ...).
- With that directory removed from `PATH`: the launcher prints its npx-fallback notice and answers
  with 0.3.x's **single `noacg` tool**.

npm `latest` for `@noacg/cli` was 0.3.0 on the day; `cli/package.json` on `main` is 0.3.1, pending
a publish that is another row's work. `docs/AGENT_CLI.md` "Still open" carries the finding, and
`docs/DEMO_2026-09-25.md` R2.2 carries the demo-day consequence.
