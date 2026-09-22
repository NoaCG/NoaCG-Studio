// `noacg bridge` - NoaCG Bridge, the local process that lets the NoaCG page drive a playout
// server (docs/BRIDGE.md).
//
// WHY THIS EXISTS AT ALL: a browser has one socket primitive, `WebSocket`, and it is an HTTP
// Upgrade handshake, not a socket. Pointed at AMCP on 5250 the browser connects, sends a GET,
// CasparCG answers with an AMCP status line, and the handshake dies with
// ERR_INVALID_HTTP_RESPONSE. No server setting fixes that (measured 2026-08-24, Chromium 149),
// so the socket has to live in a local process - this one. It is a command in the CLI the
// project already ships, and the NoaCG-Bridge.exe download is this same command packaged with
// Node inside, so there is one helper and not a family of them.
//
// The Bridge runs on the OPERATOR's machine and binds 127.0.0.1 only. CasparCG may be anywhere
// on the studio LAN - only AMCP crosses it, exactly as the CasparCG Client does today. Binding
// 0.0.0.0 would turn any web page the operator visits into a remote for the playout box, so
// the command refuses to.

import { spawn } from 'node:child_process';
import { cliVersion, noacgUrl } from '../config.js';
import { EXIT_OK, flagBool, flagList, flagNumber, flagString, refuseStray, UsageError, type Out, type ParsedArgs } from '../output.js';
import { casparcgAdapter } from '../playout/adapters/casparcg.js';
import { PAIRING_TTL_MS, allowedOrigins, createBridgeServer, DEFAULT_BRIDGE_PORT, isLoopbackHost, type Pairing } from '../playout/server.js';
import { mintPairingCode, resolveToken } from '../playout/token.js';

/** The page that pairs a browser with this Bridge: a query route the studio renders instead of
 *  itself. The code is one-time and short-lived; the token never travels in a URL. */
export function pairingUrl(port: number, code: string): string {
  return `${noacgUrl()}/app?bridge=${port}&code=${encodeURIComponent(code)}`;
}

/** Open a URL in the default browser, per OS, without waiting on it. */
function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Printing the URL is the fallback, and it is printed regardless.
  }
}

export async function runBridge(args: ParsedArgs, out: Out): Promise<number> {
  refuseStray('bridge', args._.slice(1), 'no argument');
  const bind = flagString(args, 'host') ?? '127.0.0.1';
  if (!isLoopbackHost(bind)) {
    throw new UsageError(
      `Refusing to bind ${bind}. The Bridge holds a socket to your playout server, so a non-loopback bind would let any page on the network drive it. Use 127.0.0.1.`,
    );
  }
  const port = flagNumber(args, 'port') ?? DEFAULT_BRIDGE_PORT;
  const token = await resolveToken(flagString(args, 'token'), args.flags['new-token'] === true);
  const origins = allowedOrigins(flagList(args, 'origin'));
  const quiet = args.flags.quiet === true;
  const pairing: Pairing = { code: mintPairingCode(), expiresAt: Date.now() + PAIRING_TTL_MS, used: false };
  const server = createBridgeServer(
    { token, origins, adapters: [casparcgAdapter], version: cliVersion(), pairing },
    (line) => {
      if (!quiet) out.log(`[bridge] ${line}`);
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = `http://127.0.0.1:${port}`;
  const pairUrl = pairingUrl(port, pairing.code);
  out.result({ ok: true, address, token, origins, v: 2, pairUrl });
  out.say('');
  out.say(`  NoaCG Bridge ${cliVersion()} is running. Leave this window open.`);
  out.say('');
  out.say('  First time on this browser? Open this link within two minutes to pair it:');
  out.say(`    ${pairUrl}`);
  out.say('');
  out.say('  Already paired? Just open NoaCG. Settings -> Playout shows the Bridge as connected.');
  out.say(`  Bridge address    ${address}`);
  out.say(`  Allowed origins   ${origins.join(', ')} (plus any localhost port)`);
  out.say('  Press Ctrl+C to stop.');

  // The browser opens by default: the exe is double-clicked by somebody who should not have to
  // copy a link. `--no-open` for terminals and for a Bridge that starts with the machine.
  if (flagBool(args, 'open', true)) openInBrowser(pairUrl);

  // Run until killed. The Bridge is a foreground service, like a dev server.
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.close(() => resolve());
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
  return EXIT_OK;
}
