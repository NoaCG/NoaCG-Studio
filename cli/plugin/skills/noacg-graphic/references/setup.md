# Local toolkit setup

This toolkit runs in Claude Code, local Codex or another local MCP client with filesystem
and process access. Ordinary Claude Chat cannot run the local CLI. Installing a skill does
not install Node, a browser, account credentials or a playout server.

1. Check `node --version`: the CLI requires Node 20 or newer. Install a supported Node release
   with npm if the command is missing. Building the distribution itself requires Node 24.
2. Install the reviewed CLI: `npm i -g @noacg/cli@0.10.0`. Check `noacg --version` before using
   an existing installation. It must match 0.10.0 for this package. Otherwise install that exact
   version or use `npx -y @noacg/cli@0.10.0 <command>` for each call. A newer CLI or plugin is
   a separate reviewed version; do not silently switch to npm's latest.
3. Run `noacg doctor`. Install system Chrome or Edge if it reports no browser. An explicit
   `NOACG_BROWSER` may name a supported Chromium executable. No browser is bundled.
4. Commands use https://noacg.studio by default. For a self-hosted deployment, explicitly set
   `NOACG_URL` to its origin and rerun doctor. Its `/bridge` page must serve the existing CLI
   protocol. Reachability or protocol failures are setup failures, not a validated graphic.
5. Author, inspect and validate a local package before saving. Use `noacg login` for browser
   consent, then `noacg whoami`. If consent is cancelled or a key is revoked, log in again or
   deliver the validated ZIP/offline pack. Do not read inherited credentials to bypass consent.

The optional MCP plugin runs the same CLI version. With no installation, or another version
installed, it uses pinned npx, which downloads from registry.npmjs.org and costs an extra process.
Explicit `NOACG_CLI` selects a development entry file, prints
an override notice and bypasses the version pin; a nonexistent override fails. Use this only
when deliberately testing a checkout, not as the directory setup path.

If organization policy denies installation or execution, ask its administrator for access or
hand off the files. Do not work around the policy. Live playout needs the user's separate
CasparCG/OBS/vMix or OGraf setup and operator action; installing this toolkit grants no authority
to connect hardware, publish or take a graphic on air.
