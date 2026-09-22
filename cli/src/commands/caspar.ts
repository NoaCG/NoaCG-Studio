// `noacg caspar` - AMCP from the terminal, with no browser in the loop (docs/BRIDGE.md §4).
//
// The route around every browser-side constraint: for Safari, for a locked-down browser, and
// for a machine where clicking a permission prompt is not going to happen. `status` is the
// first thing to run when the studio says a server is unreachable - it tells you whether the
// problem is between the browser and the Bridge, or between the Bridge and CasparCG.
//
// `caspar agent` was the first name of the local process; it is `noacg bridge` now, and the old
// name still runs it so a machine that learned the old command is not stranded.

import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, flagNumber, flagString, refuseStray, UsageError, type Out, type ParsedArgs } from '../output.js';
import { amcpSend, amcpQuote, layerAddress, type AmcpTarget } from '../playout/amcp.js';
import { DEFAULT_AMCP_PORT, DEFAULT_BRIDGE_PORT } from '../playout/server.js';
import { runBridge } from './bridge.js';

/**
 * The one command that is the whole live link for NoaCG's own graphics. From here every cue,
 * take, update and recovery flows through the durable command log the /output page already
 * follows - which is why there is no per-take CG traffic for them (docs/BRIDGE.md §2).
 */
export function playCommand(channel: number, layer: number, url: string): string {
  if (/[\r\n]/.test(url)) throw new UsageError('That output URL contains a newline and cannot go on an AMCP line.');
  return `PLAY ${layerAddress(channel, layer)} [HTML] ${amcpQuote(url)}`;
}

export function stopCommand(channel: number, layer: number): string {
  return `STOP ${layerAddress(channel, layer)}`;
}

function targetFromArgs(args: ParsedArgs): AmcpTarget {
  return {
    host: flagString(args, 'server') ?? flagString(args, 'amcp-host') ?? '127.0.0.1',
    port: flagNumber(args, 'amcp-port') ?? DEFAULT_AMCP_PORT,
    timeoutMs: flagNumber(args, 'timeout') ?? 4000,
  };
}

async function oneShot(args: ParsedArgs, out: Out, command: string): Promise<number> {
  const target = targetFromArgs(args);
  try {
    const reply = await amcpSend(target, command);
    const ok = reply.code >= 200 && reply.code < 300;
    out.result({ ok, target: `${target.host}:${target.port}`, command, ...reply });
    out.say(`${target.host}:${target.port} <<< ${command}`);
    out.say(`${target.host}:${target.port} >>> ${reply.status}`);
    for (const line of reply.lines) out.say(`    ${line}`);
    return ok ? EXIT_OK : EXIT_FINDINGS;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    out.result({ ok: false, target: `${target.host}:${target.port}`, command, error: message });
    out.say(`${target.host}:${target.port} - ${message}`);
    return EXIT_FINDINGS;
  }
}

const USAGE = `noacg caspar <status|send|play|stop|agent> [options]

  status [--server HOST] [--amcp-port ${DEFAULT_AMCP_PORT}]
         Round-trip a real AMCP VERSION. The first thing to run when Settings says unreachable.
  send   "<AMCP command>" [--server HOST] [--amcp-port ${DEFAULT_AMCP_PORT}]
  play   --url <output URL> [--channel 1] [--layer 20] [--server HOST]
         Put a production on a channel with no browser involved.
  stop   [--channel 1] [--layer 20] [--server HOST]
  agent  The old name of "noacg bridge" [--port ${DEFAULT_BRIDGE_PORT}] - runs it.`;

/**
 * Every `caspar` sub-command except `send` takes its arguments as flags, so a bare word here is
 * always a mistake - and the two that matter go to a live channel. `caspar play --url … 1 20`
 * reads as "channel 1, layer 20" and is not: the words are dropped, the command goes out on the
 * defaults, and a production lands on a layer the operator did not name. `send` is the exception
 * by design, because its words ARE the AMCP command.
 */
function refuseStrayCasparArgs(args: ParsedArgs, sub: string): void {
  refuseStray(`caspar ${sub}`, args._.slice(2), 'no argument');
}

export async function runCaspar(args: ParsedArgs, out: Out): Promise<number> {
  const sub = args._[1];
  switch (sub) {
    case 'agent':
      refuseStrayCasparArgs(args, sub);
      out.log('noacg caspar agent is now called "noacg bridge" - running that.');
      return runBridge({ ...args, _: ['bridge'] }, out);
    case 'status':
      refuseStrayCasparArgs(args, sub);
      return oneShot(args, out, 'VERSION');
    case 'send': {
      const command = args._.slice(2).join(' ').trim();
      if (!command) throw new UsageError('`noacg caspar send` needs an AMCP command, e.g. `noacg caspar send INFO`.');
      return oneShot(args, out, command);
    }
    case 'play': {
      refuseStrayCasparArgs(args, sub);
      const url = flagString(args, 'url');
      if (!url) throw new UsageError('`noacg caspar play` needs --url, the production\'s output URL.');
      return oneShot(args, out, playCommand(flagNumber(args, 'channel') ?? 1, flagNumber(args, 'layer') ?? 20, url));
    }
    case 'stop':
      refuseStrayCasparArgs(args, sub);
      return oneShot(args, out, stopCommand(flagNumber(args, 'channel') ?? 1, flagNumber(args, 'layer') ?? 20));
    default:
      out.say(USAGE);
      return EXIT_USAGE;
  }
}
