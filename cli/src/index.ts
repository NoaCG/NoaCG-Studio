#!/usr/bin/env node
// `noacg` - THE NoaCG CLI (docs/AGENT_CLI.md). One artifact, three entrances: this terminal,
// `noacg mcp` (the same verbs as an MCP server), and the Claude Code / Codex plugin, which
// bundles both with the noacg-graphic skill. There is no second implementation anywhere.
//
// An external coding agent's door into NoaCG: scaffold a graphic from a type or a field list,
// validate + bench it (and see it), inspect the operator surface it earns, package it, and -
// with a scoped agent key - save it straight into the user's library (docs/AGENT_SAVE.md). Every
// command drives the deployment's own /bridge page through a contained headless browser; nothing
// here re-implements the studio. `--json` on any command prints one JSON object on stdout for an
// agent to parse.

import { closeBrowser } from './browser.js';
import { cliVersion } from './config.js';
import { EXIT_OK, EXIT_USAGE, Out, parseArgs, type ParsedArgs } from './output.js';
import { runDoctor } from './commands/doctor.js';
import { runTypes } from './commands/types.js';
import { runScaffold } from './commands/scaffold.js';
import { runValidate } from './commands/validate.js';
import { runInspect } from './commands/inspect.js';
import { runScreenshot } from './commands/screenshot.js';
import { runPack } from './commands/pack.js';
import { runDocs } from './commands/docs.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import { runSave } from './commands/save.js';
import { runCaspar } from './commands/caspar.js';
import { runBridge } from './commands/bridge.js';
import { runMcp } from './mcp.js';

const USAGE = `noacg v${cliVersion()} - the NoaCG CLI: make broadcast graphics for NoaCG Studio.

This one tool has three entrances: this terminal, "noacg mcp" (the same verbs as one MCP tool,
for any MCP client), and the Claude Code / Codex plugin, whose noacg-graphic skill runs this
terminal (the optional noacg-mcp plugin adds the server). Same package either way.

Usage: noacg <command> [options]   (add --json to any command for machine-readable output)

  doctor                         What browser and which NoaCG deployment (NOACG_URL) will be used.
  types                          The graphic types NoaCG knows: fields, events, designs, neutral scaffold.
  scaffold --type <id> [--design <id>|neutral] [--name N] [--set key=value]... --out <dir>
  scaffold --fields "Label:kind[=value],..." [--name N] --out <dir>
  validate <dir|zip> [--no-bench] [--no-house-contract] [--screenshots <dir>]
  inspect <dir|zip>              The operator surface NoaCG derives from the graphic's own contract.
  screenshot <dir|zip> --state off|onair|stress [--data k=v]... --out <png>
  pack <dir|zip>... --name N [--save] [--out <file.noacgpack.json>] [--rundown <cues.json>] [--layer n]...
                                 Several graphics as one package: --save sends it to your NoaCG Home to Install.
  docs [contract|package|validator|control|design-notes]
  login [--name N] [--no-browser] [--key <noacg_ak_...>]
                                 Get a scoped agent key for this machine (opens the consent page).
  logout [--local]               Revoke and forget this machine's key.
  whoami                         Which key this machine holds, and whether it is still valid.
  save <dir|zip> [--name N] [--folder F] [--no-bench]
                                 Validate, then put the graphic in your NoaCG library.
  bridge [--port 8899] [--origin URL]... [--no-open] [--quiet]
                                 Run NoaCG Bridge: the local process that lets the NoaCG page
                                 drive a playout server (docs/BRIDGE.md). 127.0.0.1 only.
  caspar status|send|play|stop   Talk AMCP to a CasparCG server from the terminal, no browser.
  mcp                            Run as an MCP server over stdio: one tool, noacg, command = the verb.

Environment: NOACG_URL (default https://noacg.studio), NOACG_BROWSER (a Chromium executable),
             NOACG_AGENT_KEY (a key for CI - beats the stored one).
Exit codes: 0 clean, 1 findings / refused, 2 usage or IO error.`;

type Command = (args: ParsedArgs, out: Out) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  doctor: runDoctor,
  types: runTypes,
  scaffold: runScaffold,
  validate: runValidate,
  inspect: runInspect,
  screenshot: runScreenshot,
  pack: runPack,
  docs: runDocs,
  mcp: runMcp,
  login: runLogin,
  logout: runLogout,
  whoami: runWhoami,
  save: runSave,
  caspar: runCaspar,
  bridge: runBridge,
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const out = new Out(args.flags.json === true);
  const name = args._[0];
  if (args.flags.version === true || name === 'version') {
    out.result({ ok: true, version: cliVersion() });
    out.say(cliVersion());
    return EXIT_OK;
  }
  if (!name || args.flags.help === true || name === 'help') {
    out.say(USAGE);
    return name ? EXIT_OK : EXIT_USAGE;
  }
  const command = COMMANDS[name];
  if (!command) {
    out.say(`Unknown command "${name}".\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  try {
    return await command(args, out);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (out.json) out.result({ ok: false, error: message });
    out.log(`noacg: ${message}`);
    // Every failure that reaches here is exit 2. A UsageError is the argument grammar refusing;
    // anything else is IO or the bridge, which the documented contract also calls a 2 - only
    // findings and an explicit refusal are exit 1, and those return their own code above.
    return EXIT_USAGE;
  } finally {
    if (name !== 'mcp') await closeBrowser();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`noacg: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = EXIT_USAGE;
  },
);
