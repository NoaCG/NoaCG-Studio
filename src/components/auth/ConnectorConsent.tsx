import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../../backend/config';
import {
  allowConnector,
  denyConnector,
  readConnectorRequest,
  type ConnectorRequest,
} from '../../backend/connectorAccess';
import { CONNECTOR_PERMISSIONS, PERMISSION_LABELS } from '../../entitlements/permissions';
import { useAuthState } from './useAuthState';
import SignInDialog from './SignInDialog';
import SignInPrompt from './SignInPrompt';
import BrandLogo from '../BrandLogo';

/**
 * The CONNECTOR consent page: `<site>/?authorization_id=<id>`, where Supabase Auth's OAuth server
 * sends a person whose chat client (Claude.ai, ChatGPT) is signing in to NoaCG
 * (docs/REMOTE_MCP_PLAN.md, key decision 2). It names the client and lists exactly what NoaCG lets
 * a connector do. Allow records that grant and approves the sign-in; Don't allow tells Auth no and
 * records nothing. Either way the browser goes where Auth says, back to the chat client.
 *
 * The same auth posture as the agent consent page beside it: no backend says so and grows no auth
 * UI; signed out shows the sign-in prompt with account creation leading; signed in shows the card.
 */
export default function ConnectorConsent({ params }: { params: URLSearchParams }) {
  const authorizationId = params.get('authorization_id') ?? '';
  const { backendConfigured, status } = useAuthState();

  useEffect(() => {
    document.title = 'NoaCG - connect an app';
  }, []);

  if (!isBackendConfigured() || !backendConfigured) {
    return (
      <Frame>
        <h1>Connecting an app needs an account backend</h1>
        <p className="hint" data-testid="connector-consent-offline">This NoaCG runs without accounts, so there is nothing to connect to.</p>
      </Frame>
    );
  }
  if (!authorizationId) {
    return (
      <Frame>
        <h1>This is not a valid sign-in request</h1>
        <p className="hint" data-testid="connector-consent-invalid">Nothing was allowed. Start again from the chat.</p>
      </Frame>
    );
  }
  if (status === 'loading') return <Frame><p className="hint">Checking your account…</p></Frame>;
  if (status === 'signed-out') {
    return (
      <Frame>
        <SignInPrompt
          feature="Connect an app to your NoaCG account?"
          reason="Sign in, or create an account, and this page will ask again."
          offerSignUp
        />
        <SignInDialog />
      </Frame>
    );
  }
  return (
    <Frame>
      <ConsentCard authorizationId={authorizationId} />
      <SignInDialog />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-consent-page" data-testid="connector-consent">
      <div className="agent-consent-card">
        <div className="agent-consent-brand"><BrandLogo /></div>
        {children}
      </div>
    </div>
  );
}

function ConsentCard({ authorizationId }: { authorizationId: string }) {
  const [request, setRequest] = useState<ConnectorRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    readConnectorRequest(authorizationId)
      .then((r) => {
        if (!live) return;
        // Approved before: Auth asks nothing more, so neither does this page.
        if (r.kind === 'redirect') window.location.replace(r.url);
        else setRequest(r);
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [authorizationId]);

  const answer = async (decide: (id: string) => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      window.location.replace(await decide(authorizationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!request || request.kind !== 'ask') {
    return error
      ? <><h1>This sign-in request cannot continue</h1><p className="status-bad" data-testid="connector-consent-error">{error}</p></>
      : <p className="hint">Reading the request…</p>;
  }

  return (
    <>
      <h1>Allow “{request.clientName}” to use your NoaCG account?</h1>
      <ul className="agent-consent-permissions" data-testid="connector-consent-permissions">
        {CONNECTOR_PERMISSIONS.map((key) => (
          <li key={key}>✓ {PERMISSION_LABELS[key]}</li>
        ))}
      </ul>
      <p className="hint">
        {request.returnsTo && <>Returns to <code>{request.returnsTo}</code>. </>}
        Revoke it any time in Settings → Account → Agent access.
      </p>
      {error && <p className="status-bad" data-testid="connector-consent-error">{error}</p>}
      <div className="agent-consent-actions">
        <button onClick={() => void answer(denyConnector)} disabled={busy} data-testid="connector-consent-deny">Don’t allow</button>
        <button className="primary" onClick={() => void answer(allowConnector)} disabled={busy} data-testid="connector-consent-allow">
          {busy ? 'Working…' : 'Allow'}
        </button>
      </div>
    </>
  );
}
