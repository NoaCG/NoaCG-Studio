import { useEffect, useMemo, useRef, useState } from 'react';
import BrandLogo from './BrandLogo';
import CopyPairingLink from './CopyPairingLink';
import InfoLine from './InfoLine';
import RecentServers from './RecentServers';
import {
  connectServer,
  isFirefox,
  loadPlayoutSettings,
  localNetworkGateApplies,
  pairBridge,
  pairingLinkForAnotherBrowser,
  parseBridgePair,
  PLAYOUT_DEFAULTS,
  rememberedServers,
  serverAddress,
  slotAddress,
  slotOf,
  type PlayoutResult,
} from '../control/playoutLink';
import type { RememberedServer } from '../control/playoutProtocol';

/**
 * The BRIDGE PAIRING page: `<app-url>?bridge=<port>&code=<code>` (docs/BRIDGE.md §2). NoaCG
 * Bridge printed and opened this link on the operator's own machine; the code is one-time and
 * lives two minutes. One click exchanges it, over loopback, for the token this browser will use
 * from now on, and the token is remembered device-level with the rest of Settings -> Playout.
 * The token never travels in a URL.
 *
 * A query route rendered INSTEAD of the studio, like `?agent=`: it is a question, not a surface.
 * It needs no account and no backend - an offline studio pairs the same way. The click is
 * deliberate rather than automatic: on the hosted studio it is what makes the browser show its
 * local-network permission prompt, and a page that explains the prompt first is the whole point.
 *
 * SAYS ONLY WHAT IS NEEDED (docs/work-specs/studio-day-playout D8): one line per step with the rest
 * behind an info button, and on both steps a plain way to pair ANOTHER browser, which is a link
 * copied into it. Nothing here guesses which browser is the operator's.
 */
export default function BridgePairPage({ params }: { params: URLSearchParams }) {
  const request = useMemo(() => parseBridgePair(params), [params]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayoutResult | null>(null);
  const gated = request ? localNetworkGateApplies(window.location.origin, `http://127.0.0.1:${request.port}`) : false;

  const connect = async () => {
    if (!request) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await pairBridge(request));
    } finally {
      setBusy(false);
    }
  };

  if (!request) {
    return (
      <Frame>
        <h1>This is not a valid NoaCG Bridge link</h1>
        <p className="hint" data-testid="bridge-pair-invalid">
          The link is missing the port or the pairing code the Bridge prints. Nothing was changed.
          Start NoaCG Bridge again and let it open the page itself.
        </p>
      </Frame>
    );
  }

  if (result?.state === 'ok') {
    return (
      <Frame>
        <p className="status-ok bridge-paired-line" data-testid="bridge-pair-done">
          ✓ Paired with NoaCG Bridge on <code>127.0.0.1:{request.port}</code>.
        </p>
        <ConnectStep />
      </Frame>
    );
  }

  return (
    <Frame>
      <h1>Pair this browser with NoaCG Bridge</h1>
      <InfoLine
        label="About pairing"
        testId="bridge-pair-line"
        more={
          <>
            <p>
              NoaCG Bridge runs on this computer at <code>127.0.0.1:{request.port}</code>. Pairing lets
              this browser send playout commands through it, to CasparCG on your studio network and
              never past it. This link works once, within two minutes.
            </p>
            {gated && isFirefox() && (
              <p data-testid="bridge-pair-permission-note">
                If Firefox asks again later, on another tab or another day, it is set to forget site
                permissions. The{' '}
                <a href="/downloads#browsers" target="_blank" rel="noopener">
                  browser notes
                </a>{' '}
                name the one setting that stops that.
              </p>
            )}
          </>
        }
      >
        {!gated
          ? 'Press Pair to let this browser use NoaCG Bridge.'
          : isFirefox()
            ? 'Press Pair, then answer Allow when Firefox asks to access other apps and services on this device.'
            : 'Press Pair, then answer Allow when the browser asks about your local network.'}
      </InfoLine>
      <CopyPairingLink
        lead="Not the browser you use?"
        button="Copy this link"
        link={async () => window.location.href}
        testId="bridge-pair-copy"
      />
      {result && (
        <p className="status-bad" data-testid="bridge-pair-error" data-state={result.state}>
          {result.detail}
        </p>
      )}
      <div className="agent-consent-actions">
        <button onClick={() => window.location.assign('/app#/home')}>Not now</button>
        <button className="primary" onClick={() => void connect()} disabled={busy} data-testid="bridge-pair-connect">
          {busy ? 'Pairing…' : 'Pair this browser'}
        </button>
      </div>
    </Frame>
  );
}

/**
 * THE NEXT STEP AFTER PAIRING (owner decisions 2026-09-30 and 2026-10-01): the CasparCG server. The
 * last server this studio connected to is tried at once - NoaCG Bridge remembers it on disk, and
 * since 0.8.0 its channels too, so a browser that forgets its storage, a second browser and another
 * account all open with the same setup. The address stays in its box and "This computer" and every
 * server used before stay one press away, connected or not. Connecting is a VERSION call and nothing
 * else: nothing goes on air from here. Put on air stays in the production.
 */
function ConnectStep() {
  const [servers, setServers] = useState<RememberedServer[] | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(PLAYOUT_DEFAULTS.amcpPort);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PlayoutResult | null>(null);
  const [connected, setConnected] = useState<{ server: RememberedServer; version?: string; setup: string | null } | null>(null);
  // Once per pairing. StrictMode runs a mount's effect twice in development, and each run would be
  // one more VERSION on the server.
  const started = useRef(false);

  const connect = async (server: RememberedServer) => {
    setHost(server.host);
    setPort(server.port);
    setBusy(true);
    setFailure(null);
    setConnected(null);
    try {
      const { result, servers: remembered, studio } = await connectServer({ ...loadPlayoutSettings(), host: server.host, amcpPort: server.port });
      if (remembered) setServers(remembered);
      if (result.state !== 'ok') {
        setFailure(result);
        return;
      }
      // With a Bridge that keeps the setup, say what came with the server, so a second browser sees
      // that its channels are already there.
      const now = loadPlayoutSettings();
      const setup = studio?.keeper === 'bridge' ? `${now.channels.length === 1 ? '1 channel' : `${now.channels.length} channels`}, NoaCG output on ${slotAddress(slotOf(now))}.` : null;
      setConnected({ server, version: result.version, setup });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const own = loadPlayoutSettings();
      const list = await rememberedServers(own);
      setServers(list);
      // The last server used: the Bridge's, else this browser's own once somebody has changed it.
      // The untouched default is nobody's choice, so it is offered as nothing rather than tried.
      const ownChosen = own.host !== PLAYOUT_DEFAULTS.host || own.amcpPort !== PLAYOUT_DEFAULTS.amcpPort;
      const last = list[0] ?? (ownChosen ? { host: own.host, port: own.amcpPort } : null);
      if (last) await connect(last);
    })();
  }, []);

  return (
    <>
      <InfoLine
        as="h1"
        className="bridge-step"
        label="About connecting to CasparCG"
        testId="bridge-connect-line"
        more={
          <p>
            The computer running CasparCG on your studio network, and its AMCP port (5250 unless it
            was changed). Connecting only checks that CasparCG answers: nothing goes on air. NoaCG
            Bridge remembers the server and its channels, so the next browser you pair connects by
            itself and opens with the same setup. To put a production on air, open it and press{' '}
            <strong>Put on air</strong> in its Playout panel.
          </p>
        }
      >
        Enter the IP address of your CasparCG server.
      </InfoLine>
      <form
        className="bridge-connect-form"
        onSubmit={(e) => {
          e.preventDefault();
          void connect({ host: host.trim(), port });
        }}
      >
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP address"
          aria-label="CasparCG server"
          spellCheck={false}
          data-testid="bridge-connect-host"
        />
        <input
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(e) => setPort(Number(e.target.value) || 0)}
          aria-label="AMCP port"
          data-testid="bridge-connect-port"
        />
        <button className={connected ? '' : 'primary'} type="submit" disabled={busy || !host.trim() || !port} data-testid="bridge-connect">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      <RecentServers
        servers={servers ?? []}
        current={connected?.server}
        onPick={(server) => void connect(server)}
        disabled={busy}
        testId="bridge-connect-recent"
      />
      {servers === null && (
        <p className="hint" data-testid="bridge-connect-checking">
          Looking for your CasparCG server…
        </p>
      )}
      {connected && (
        <p className="status-ok" data-testid="bridge-connected">
          ✓ Connected to CasparCG{connected.version ? ` ${connected.version}` : ''} at {serverAddress(connected.server)}.
          {connected.setup && <span data-testid="bridge-connected-setup"> {connected.setup}</span>}
        </p>
      )}
      {failure && (
        <p className="status-bad" data-testid="bridge-connect-error" data-state={failure.state}>
          {failure.detail}
        </p>
      )}
      <CopyPairingLink
        lead="Pairing another browser?"
        button="Copy a link for it"
        link={() => pairingLinkForAnotherBrowser(loadPlayoutSettings())}
        more={
          <p>
            Each browser pairs once, and so does each browser profile, which is how another account
            usually signs in on the same computer. A link works once, within two minutes. Pressing
            Enter in the NoaCG Bridge window makes one too.
          </p>
        }
        testId="bridge-another"
      />
      <div className="agent-consent-actions">
        <button className={connected ? 'primary' : ''} onClick={() => window.location.assign('/app#/home')} data-testid="bridge-pair-open">
          Open NoaCG
        </button>
      </div>
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-consent-page" data-testid="bridge-pair">
      <div className="agent-consent-card">
        <div className="agent-consent-brand">
          <BrandLogo />
        </div>
        {children}
      </div>
    </div>
  );
}
