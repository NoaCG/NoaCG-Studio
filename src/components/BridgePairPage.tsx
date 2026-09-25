import { useMemo, useState } from 'react';
import BrandLogo from './BrandLogo';
import {
  isFirefox,
  localNetworkGateApplies,
  pairBridge,
  parseBridgePair,
  type PlayoutResult,
} from '../control/playoutLink';

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
          <code>127.0.0.1:{request.port}</code>. Open a production and press <strong>Playout</strong> in
          its header to fill in the CasparCG server, if you have not yet.
        </p>
        <div className="agent-consent-actions">
          <button className="primary" onClick={() => window.location.assign('/app#/home')} data-testid="bridge-pair-open">
            Open NoaCG
          </button>
        </div>
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
