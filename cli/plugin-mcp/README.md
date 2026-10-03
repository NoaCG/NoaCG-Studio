# NoaCG MCP server

Optional local companion to the noacg skill plugin. It exposes the existing NoaCG CLI as one
stdio MCP tool, noacg, with authoring, inspect, validate, screenshot, docs and save verbs.
It starts a process in every session where enabled. Keep the main plugin for the skill and
install this companion only when an always-on tool and warm browser are useful.

## Install and setup

From the generated distribution's repository directory:

~~~sh
claude plugin marketplace add ./
claude plugin install noacg@noacg-studio
claude plugin install noacg-mcp@noacg-studio
npm i -g @noacg/cli@0.9.0
noacg doctor
~~~

Node 20 or newer, npm, system Chrome or Edge and a reachable NoaCG deployment are required.
The launcher imports an installed CLI only when its package version exactly matches this
plugin's manifest. Otherwise it refuses with an exact install command. With no CLI installed,
it runs pinned npx to download @noacg/cli@0.9.0 from registry.npmjs.org. This fallback costs an
extra process. The pin follows cli/package.json; it never resolves npm's latest implicitly.

Explicit NOACG_CLI may name an existing absolute development entry file. This bypasses the pin
and prints a notice on stderr. A missing override fails. NOACG_URL selects a self-hosted deployment;
NOACG_BROWSER selects a supported Chromium executable. These are deliberate development/setup
choices, not extra bundled software. The main skill's references/setup.md explains diagnosis.

The Codex compatibility manifest is for local clients with stdio support. The directory upload
is skills-only and excludes this server. Ordinary Claude Chat cannot run this local server;
this is not a hosted MCP integration. Organization policy can prevent installation or execution.

## What it runs and sends

The server runs node on mcp-server.mjs, then the same reviewed CLI in-process. The missing-CLI
fallback imports npm's npx launcher, which downloads the pinned CLI and its dependencies.
No shell, inline program or floating package version is used. Claude's review rules may still
hold the subfolder JavaScript launcher, imports and package fallback for a reviewer. Passing
local checks does not mean the portal has approved it.

Authoring runs in a local headless browser loading the selected deployment's /bridge page.
Its context blocks other origins, /api/ requests and WebSockets. These calls do not upload the
graphic. Login opens browser consent and keeps a scoped key locally. Save and pack --save send
graphics, including field text, to that deployment. Saving does not publish, replace a production
or take anything on air. Revoked keys/cancelled consent need another login or an offline handoff.
Doctor may check npm for newer versions; the launcher itself performs no latest-version fetch.
Separate playout commands connect to servers explicitly selected by the user.

The CLI sends no usage telemetry. [Privacy](https://noacg.studio/privacy),
[terms](https://noacg.studio/terms), [support](https://github.com/NoaCG/NoaCG-Studio/issues).

Apache-2.0; see LICENSE, NOTICE and generated PROVENANCE.json. Source remains in the canonical
NoaCG-Studio repository. No CLI dependencies, browser, fonts or graphics engine are bundled.
