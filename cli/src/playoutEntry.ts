// The entry of NoaCG-Bridge.exe: `noacg bridge` and nothing else, with Node inside.
//
// cli/scripts/build-bridge-exe.mjs bundles THIS file (never index.ts) into the single-file
// executable, so the exe carries the playout agent and its few dependencies and none of the
// authoring commands, the headless browser or the MCP server. It is the same code the npm
// package runs as `noacg bridge`: one helper, two ways to start it.
//
// A double-clicked exe has no terminal to fall back to: when it cannot start (the port is
// taken, the bind was refused) the reason is printed and the window is held open long enough
// to read it, instead of vanishing with the error.

import { runBridge } from './commands/bridge.js';
import { EXIT_USAGE, Out, parseArgs } from './output.js';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const out = new Out(args.flags.json === true);
  if (args.flags.help === true) {
    out.say('NoaCG Bridge - lets the NoaCG page in your browser drive a playout server on your studio network.');
    out.say('Options: --port 8899  --origin <NoaCG URL>  --no-open  --quiet  --new-token');
    return 0;
  }
  return runBridge({ ...args, _: ['bridge', ...args._] }, out);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`\nNoaCG Bridge could not start: ${e instanceof Error ? e.message : String(e)}\n`);
    process.stderr.write('This window closes in 30 seconds.\n');
    setTimeout(() => process.exit(EXIT_USAGE), 30_000);
  },
);
