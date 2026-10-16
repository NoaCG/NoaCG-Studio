import { useEffect, useMemo, useState } from 'react';
import { isBackendConfigured } from '../../backend/config';
import {
  agentCallbackUrl,
  agentDenyUrl,
  beginAgentKey,
  parseAgentRequest,
  type AgentAccessRequest,
} from '../../backend/agentAccess';
import { PERMISSION_LABELS } from '../../entitlements/permissions';
import { useAuthState } from './useAuthState';
import SignInDialog from './SignInDialog';
import SignInPrompt from './SignInPrompt';
import BrandLogo from '../BrandLogo';

/**
 * The AGENT ACCESS consent page: `<app-url>?agent=<state>&port=<n>&name=<host>&challenge=<hex>`
 * (docs/AGENT_SAVE.md). A coding agent's CLI (`noacg login`) opened this in the user's browser
 * and is listening on 127.0.0.1:<port>. The page asks ONE question - allow "<name>" to create
 * graphics in your library? - mints a one-time code with the user's session, and hands it to
 * the loopback listener in the URL fragment. The key itself is minted by the CLI's redeem and
 * never passes through here.
 *
 * Three states, by the auth posture (root AGENTS.md): an OFFLINE build (no backend) says so
 * honestly and grows ZERO auth UI - no Sign in, no dialog (e2e/auth.spec.ts + agent-access.spec.ts
 * pin it); signed OUT shows the sign-in prompt WITH the create-account half leading, because the
 * person who arrives here from a terminal may have no account yet; signed IN shows the card.
 * A malformed request (a bad port, a missing challenge) is refused before anything else - the
 * page never guesses where to send a code.
 */
export default function AgentAccessConsent({ params }: { params: URLSearchParams }) {
  const request = useMemo(() => parseAgentRequest(params), [params]);
  const { backendConfigured, status } = useAuthState();

  if (!isBackendConfigured() || !backendConfigured) {
    return (
      <Frame>
        <h1>Agent access needs an account backend</h1>
        <p className="hint" data-testid="agent-consent-offline">
          This NoaCG runs without an account backend, so there is no library for a tool to save into
          from outside the studio. Zip the graphic package and import it through Home → Productions →
          Import, or point <code>NOACG_URL</code> at a deployment with accounts.
        </p>
      </Frame>
    );
  }

  if (!request) {
    return (
      <Frame>
        <h1>This is not a valid agent request</h1>
        <p className="hint" data-testid="agent-consent-invalid">
          The link is missing something a tool must send (its loopback port, its challenge). Nothing
          was granted. Run <code>noacg login</code> again and let it open the page itself.
        </p>
      </Frame>
    );
  }

  if (status === 'loading') return <Frame><p className="hint">Checking your account…</p></Frame>;

  if (status === 'signed-out') {
    return (
      <Frame>
        <SignInPrompt
          feature={`Allow “${request.name}” ${consentAsk(request)}?`}
          reason="Your library lives in your account. Sign in, or create one, and this page will ask again."
          offerSignUp
        />
        <SignInDialog />
      </Frame>
    );
  }

  return (
    <Frame>
      <ConsentCard request={request} />
      <SignInDialog />
    </Frame>
  );
}

/** What the title asks for: the library alone, or productions too when the tool asked for that line. */
function consentAsk(request: AgentAccessRequest): string {
  return request.permissions.includes('productions:create')
    ? 'to save graphics and productions to your NoaCG account'
    : 'to save graphics to your NoaCG library';
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-consent-page" data-testid="agent-consent">
      <div className="agent-consent-card">
        <div className="agent-consent-brand"><BrandLogo /></div>
        {children}
      </div>
    </div>
  );
}

function ConsentCard({ request }: { request: AgentAccessRequest }) {
  const { user } = useAuthState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'ask' | 'sent' | 'denied'>('ask');
  const callbackHost = `127.0.0.1:${request.port}`;

  // The loopback listener is where the code goes, and it is shown BEFORE the click, so the
  // person can read exactly which local port will receive it.
  useEffect(() => {
    document.title = 'NoaCG - agent access';
  }, []);

  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code } = await beginAgentKey(request);
      setState('sent');
      // The ONE place the code may go (backend/agentAccess.ts agentCallbackUrl): the user's
      // own machine, in the fragment, one shot. `replace` keeps this page out of Back.
      window.location.replace(agentCallbackUrl(request.port, code, request.state));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // "Don't allow": a CLI that takes a refusal is told at once, through the same loopback-only
  // door the code would have used; an older one is left to time out, as the page then says.
  const deny = () => {
    setState('denied');
    if (request.acceptsDeny) window.location.replace(agentDenyUrl(request.port, request.state));
  };

  if (state === 'denied') {
    return (
      <>
        <h1>Nothing was granted</h1>
        <p className="hint" data-testid="agent-consent-denied">
          “{request.name}” did not get access. You can close this tab; the tool will time out on its own.
        </p>
      </>
    );
  }

  if (state === 'sent') {
    return (
      <>
        <h1>Handing the code to the tool…</h1>
        <p className="hint" data-testid="agent-consent-sent">
          If this tab does not change, the tool on <code>{callbackHost}</code> has stopped waiting.
          Run <code>noacg login</code> again - this code is one-shot and dies in two minutes.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 data-testid="agent-consent-title">Allow “{request.name}” {consentAsk(request)}?</h1>
      <p className="hint">
        A tool on your computer is asking for a key that can only do this:
      </p>
      <ul className="agent-consent-permissions" data-testid="agent-consent-permissions">
        {request.permissions.map((key) => (
          <li key={key}>✓ {PERMISSION_LABELS[key]}</li>
        ))}
      </ul>
      <p className="hint">
        It cannot publish or play a production, use AI, read your other work, or delete anything.
        The key is yours to revoke at any time in Settings → Account → Agent access.
      </p>
      {/* WHICH ACCOUNT, on which deployment: what `noacg whoami` and every delivery receipt will
          name too (docs/AGENT_SAVE.md §9), so the user can see where the saves will go. */}
      <p className="hint" data-testid="agent-consent-account">
        Saves go to <strong>{user?.email ?? 'this account'}</strong> on <code>{window.location.host}</code>.
      </p>
      <p className="hint agent-consent-target">
        The code will be sent to <code>{callbackHost}</code> on this computer only.
      </p>
      {error && <p className="status-bad" data-testid="agent-consent-error">{error}</p>}
      <div className="agent-consent-actions">
        <button onClick={deny} disabled={busy} data-testid="agent-consent-deny">Don’t allow</button>
        <button className="primary" onClick={() => void allow()} disabled={busy} data-testid="agent-consent-allow">
          {busy ? 'Allowing…' : 'Allow'}
        </button>
      </div>
    </>
  );
}
