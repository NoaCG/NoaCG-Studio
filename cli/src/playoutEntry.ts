// The entry of NoaCG-Bridge-<version>.exe: `noacg bridge` and nothing else, with Node inside.
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
import { measure } from './playout/audio/analyse.js';
import { audioTools } from './playout/audio/tools.js';
import { EXIT_USAGE, Out, parseArgs } from './output.js';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const out = new Out(args.flags.json === true);
  if (args.flags.help === true) {
    out.say('NoaCG Bridge - lets the NoaCG page in your browser drive a playout server on your studio network.');
    out.say('Options: --port 8899  --origin <NoaCG URL>  --vmix-port 8099  --no-open  --quiet  --new-token  --allow-public-osc');
    out.say('         --measure <file> [--in <seconds>] [--out <seconds>]  the loudness of a file as it airs on a stereo programme');
    return 0;
  }
  if (typeof args.flags.measure === 'string') return measureFile(args.flags.measure, args.flags.in, args.flags.out);
  return runBridge({ ...args, _: ['bridge', ...args._] }, out);
}

/**
 * `--measure <file>`: the integrated loudness and true peak this Bridge reads, the same reading
 * Normalize uses. For checking a recording of the programme in the studio.
 */
async function measureFile(file: string, from: unknown, to: unknown): Promise<number> {
  const tools = await audioTools();
  if (!tools) {
    process.stderr.write('This Bridge carries no audio reader.\n');
    return EXIT_USAGE;
  }
  const seconds = (v: unknown) => (typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const r = await measure(tools, file, { trimIn: seconds(from), trimOut: seconds(to) });
  if (r.kind === 'measured') process.stdout.write(`${r.integrated.toFixed(1)} LUFS integrated, ${r.truePeak.toFixed(1)} dBTP true peak, ${r.seconds.toFixed(2)} s (stereo programme)\n`);
  else if (r.kind === 'no-audio') process.stdout.write('No sound in this file.\n');
  else process.stdout.write(r.kind === 'silent' ? 'Silent: nothing above -70 LUFS.\n' : `Too short to measure: ${r.seconds.toFixed(2)} s (at least 0.4 s).\n`);
  return 0;
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
