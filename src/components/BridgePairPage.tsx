import { useEffect, useMemo, useRef, useState } from 'react';
import BrandLogo from './BrandLogo';
import {
  connectServer,
  isFirefox,
  loadPlayoutSettings,
  localNetworkGateApplies,
  pairBridge,
  parseBridgePair,
  PLAYOUT_DEFAULTS,
  rememberedServers,
  savePlayoutSettings,
  serverAddress,
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
        <h1>Paired</h1>
        <p className="hint" data-testid="bridge-pair-done">
          This browser can now drive your playout server through NoaCG Bridge on{' '}
          <code>127.0.0.1:{request.port}</code>.
        </p>
        <ConnectStep />
      </Frame>
    );
  }

  return (
    <Frame>
      <h1>Pair this browser with NoaCG Bridge</h1>
      <p className="hint">
        NoaCG Bridge is running on this machine at <code>127.0.0.1:{request.port}</code>. Pairing
        lets this browser send playout commands through it - to CasparCG on your studio network,
        never past it. The code in this link works once, for two minutes.
      </p>
      {gated && (
        <p className="hint" data-testid="bridge-pair-permission-note">
          {isFirefox() ? (
            <>
              Firefox will ask whether {window.location.host} may{' '}
              <em>access other apps and services on this device</em> - that is NoaCG Bridge. Answer{' '}
              <strong>Allow</strong>. If Firefox asks again later, on another tab or on another
              day, it is set to forget site permissions; the{' '}
              <a href="/downloads#browsers" target="_blank" rel="noopener">
                browser notes
              </a>{' '}
              say which one setting stops that.
            </>
          ) : (
            <>
              Your browser will ask whether {window.location.host} may reach devices on your local
              network. Answer <strong>Allow</strong>; it asks once.
            </>
          )}
        </p>
      )}
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
 * THE NEXT STEP AFTER PAIRING (owner decisions 2026-09-30, docs/work-specs/bridge-casparcg-connect):
 * connect to the CasparCG server. The last server this studio connected to is tried at once -
 * NoaCG Bridge 0.7.0 remembers it on disk, so it survives a browser that forgets its storage - and
 * when it answers the page just says so. Otherwise its address is filled in and every server used
 * before is one click. Connecting is a VERSION call and nothing else: nothing goes on air from
 * here. Put on air stays in the production, where the operator sees what is on air.
 */
function ConnectStep() {
  const [servers, setServers] = useState<RememberedServer[] | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(PLAYOUT_DEFAULTS.amcpPort);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PlayoutResult | null>(null);
  const [connected, setConnected] = useState<{ server: RememberedServer; version?: string; remembered: boolean } | null>(null);
  const [changing, setChanging] = useState(false);
  // Once per pairing. StrictMode runs a mount's effect twice in development, and each run would be
  // one more VERSION on the server.
  const started = useRef(false);

  const connect = async (server: RememberedServer) => {
    setHost(server.host);
    setPort(server.port);
    setBusy(true);
    setFailure(null);
    try {
      const { result, servers: remembered } = await connectServer({ ...loadPlayoutSettings(), host: server.host, amcpPort: server.port });
      if (remembered) setServers(remembered);
      if (result.state !== 'ok') {
        setFailure(result);
        return;
      }
      savePlayoutSettings({ host: server.host, amcpPort: server.port });
      setConnected({ server, version: result.version, remembered: !!result.features?.includes('servers') });
      setChanging(false);
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

  const open = (
    <button
      className={connected && !changing ? 'primary' : ''}
      onClick={() => window.location.assign('/app#/home')}
      data-testid="bridge-pair-open"
    >
      Open NoaCG
    </button>
  );

  if (servers === null) {
    return (
      <p className="hint" data-testid="bridge-connect-checking">
        Looking for your CasparCG server…
      </p>
    );
  }

  if (connected && !changing) {
    return (
      <>
        <p className="status-ok" data-testid="bridge-connected">
          ✓ Connected to CasparCG{connected.version ? ` ${connected.version}` : ''} at {serverAddress(connected.server)}.
        </p>
        <p className="hint">
          {connected.remembered && 'NoaCG Bridge remembers this server, so it connects by itself the next time you pair. '}
          To put a production on air, open it and press <strong>Put on air</strong> in its Playout
          settings or its output links.
        </p>
        <div className="agent-consent-actions">
          <button onClick={() => setChanging(true)} data-testid="bridge-connect-change">
            Change server
          </button>
          {open}
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="bridge-connect-title">Connect to your CasparCG server</h2>
      <p className="hint">
        The computer running CasparCG on your studio network, and its AMCP port. Connecting only checks
        that CasparCG answers; nothing goes on air.
      </p>
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
        <button className="primary" type="submit" disabled={busy || !host.trim() || !port} data-testid="bridge-connect">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      {servers.length > 0 && (
        <div className="bridge-connect-recent" data-testid="bridge-connect-recent">
          <span className="hint">Used before:</span>
          {servers.map((server) => (
            <button key={`${server.host}:${server.port}`} onClick={() => void connect(server)} disabled={busy}>
              {serverAddress(server)}
            </button>
          ))}
        </div>
      )}
      {failure && (
        <p className="status-bad" data-testid="bridge-connect-error" data-state={failure.state}>
          {failure.detail}
        </p>
      )}
      <div className="agent-consent-actions">{open}</div>
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
