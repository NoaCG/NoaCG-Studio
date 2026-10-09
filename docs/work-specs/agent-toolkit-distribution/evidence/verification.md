# Verification

The structured receipt is [installed-workflow.json](installed-workflow.json). Nothing was
submitted, published or pushed, and no owner profile, setting or account was used.

## 2026-10-09: adopted onto main at CLI 0.9.0

The 2026-10-03 branch was brought onto main (CLI 0.9.0, the release workflow that publishes on a
version bump, the owner-queue file moved to issue #808). Changed on the way:

- **Launcher.** A different installed CLI version is no longer a refusal that leaves the session
  without a server: it is skipped, and npx runs the exact reviewed version, the same path as no
  installation. Rehearsed against a real stale global install (0.3.3).
- **Codex MCP.** Codex 0.163 does not expand `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json`; it ran
  `node <session dir>/${CLAUDE_PLUGIN_ROOT}/mcp-server.mjs` and failed with MODULE_NOT_FOUND.
  The Codex manifest now names `codex-mcp.json` (`./mcp-server.mjs`, `cwd: "."`), which Codex
  resolves against the plugin root. The 2026-10-03 rehearsal had seen the registration only.
- **`pack`** is in both MCP manifest descriptions; a test keeps them in step with `MCP_COMMANDS`.
- **CI.** `.github/workflows/toolkit-distribution.yml` runs the portal checks on the generated
  artifact for pull requests that touch its sources.

Checks run: `build-skill --check`, `check:toolkit`, the 22 distribution, launcher and branch
tests, `claude plugin validate --strict` on the marketplace and all four Claude plugin folders,
the branch dry run (archive 403,667 bytes), and the gates for the changed files.

Rehearsal, from the artifact generated at the commit in the receipt: isolated Claude Code
(`CLAUDE_CONFIG_DIR`) and Codex (`CODEX_HOME`, twice: the marketplace and the upload ZIP)
profiles under ignored `cli/dist/toolkit-profiles`, an empty npm cache and an empty key store.
Both hosts installed both plugins; Claude reported the server connected, Codex started it and
showed the skill to its model. The installed launcher then served an unfamiliar brief (a curling
scoreboard with ends and the hammer): scaffold, edit, validate with frames, inspect, a screenshot
after operator events, and an offline pack. Save refused without a login, as it should. The
frames were inspected: scores, END 2 and the hammer marker move with the buttons, and the stress
frame holds doubled names and three-digit figures.

Not rehearsed: a signed-in, model-driven session in either host, account-backed save, opening
the pack in the studio, the portal's own validation and scan, and the first branch push.

## 2026-10-03: first local build

Packages, tests and a rehearsal on CLI 0.8.1 with Claude Code 2.1.287 and Codex 0.162, recorded
in this file's history at commit c7f4fec13.
