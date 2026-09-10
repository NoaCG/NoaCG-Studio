# A stale global `@noacg/cli` wins over npx forever, and nothing says so

**Filed:** 2026-09-10. **Source:** measurement, the clean-profile install run for
`docs/DEMO_2026-09-25.md` B5 (`docs/PROMISE_AUDIT.md`, "The clean-profile install run (row 23)").

## Why

`cli/plugin-mcp/mcp-server.mjs` `resolveCli()` prefers an installed `@noacg/cli` over the npx
fallback, walking `PATH` to find one. That preference is correct and deliberate: npx costs 1.5-4 s
and a resident launcher process in every session, which is the whole reason the launcher exists
(`docs/AGENT_CLI.md`, "What a session pays"). The defect is that the preference is permanent and
silent. A machine that ran `npm i -g @noacg/cli` once keeps that version for every future session,
however old it gets, and the one command anyone would run to check - `noacg doctor` - reports the
version **npx** resolved, not the one the MCP server will import. The two can differ by a year and
nothing anywhere says so.

This is not hypothetical and it is not only about strangers. **This laptop is the machine it is
true of**, and the owner drives an agent on his own screen at the 25 September session
(`docs/DEMO_2026-09-25.md` R2.3).

## What it would take

Two separable pieces, and the first is worth doing even if the second is refused.

1. **Say it.** The launcher already knows both numbers by the time it imports: the version it
   resolved, and the version stamped on the plugin manifest beside it. One stderr line when the
   resolved copy is older - the same channel that already prints the npx-fallback notice, so no new
   mechanism. Roughly the size of that existing notice.
2. **Decide whether `doctor` should report the MCP server's resolution too.** Today it answers for
   the terminal road only, which is honest for what it measures and misleading for what people use
   it to check. A second line naming what `resolveCli()` would pick, or an explicit statement that
   `doctor` speaks for the terminal road only.

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
