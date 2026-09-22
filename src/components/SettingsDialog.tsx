import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadAiSettings, saveAiSettings } from '../ai/settings';
import { loadPrefs, savePrefs } from '../model/prefs';
import { EXPORT_TARGETS } from '../export/registry';
import { signOut, updatePassword } from '../backend/auth';
import { listAgentKeys, revokeAgentKey, type AgentKeySummary } from '../backend/agentAccess';
import {
  BRIDGE_DOWNLOAD_URL,
  loadPlayoutSettings,
  playoutConfigured,
  savePlayoutSettings,
  slotAddress,
  slotOf,
  testConnection,
  type PlayoutResult,
  type PlayoutSettings,
} from '../control/playoutLink';
import { useModalGate } from './spaceKey';
import { useAdvancedMode } from './useAdvancedMode';
import { useAuthState } from './auth/useAuthState';
import { useAuthUi } from './auth/authUi';
import { ACCOUNT_IS_FOR, NO_ACCOUNT_NEEDED } from './auth/accountCopy';
import AiProviderSettings from './AiProviderSettings';
import {
  ANALYTICS_CONSENT_EVENT,
  analyticsBlockedByBrowser,
  analyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from '../backend/events';

interface Props {
  onClose: () => void;
}

/**
 * Account/app settings (reached from the topbar account menu). Preferences are stored in
 * this browser; provider keys are held only by the server. Style defaults live where the
 * work happens so this dialog stays small on purpose.
 *
 * SHAPE (re-design/handoff.md §6, screen 6a): a fixed 820x620 sheet — section nav on the
 * left, one scrolling column of sections on the right. The nav JUMPS rather than switches:
 * every section stays mounted, which is what keeps a preference reachable by search, by
 * keyboard, and by a spec, and what stops the dialog resizing as sections change.
 */

/** The sections, in the order they are stacked. `id` doubles as the scroll anchor. */
const SECTIONS = [
  { id: 'account', nav: 'Account', caption: 'Account' },
  { id: 'ai', nav: 'AI', caption: 'AI' },
  { id: 'privacy', nav: 'Privacy', caption: 'Privacy' },
  { id: 'playout', nav: 'Playout', caption: 'Playout' },
  { id: 'workflow', nav: 'Workflow', caption: 'Workflow defaults' },
  { id: 'brand', nav: 'Brand & style', caption: 'Brand & style defaults' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * The Account section (docs/GOALS_ARCHIVE.md "Student release" step 9): email display, password
 * change, sign out — the essentials a student needs without leaving Settings. Renders NOTHING
 * offline (no backend, zero auth UI — e2e/auth.spec.ts pins the posture) and a sign-in door
 * when signed out. Password change needs only the live session (Supabase updateUser); the
 * forgotten-password path is the SignInDialog's reset link instead.
 */
function AccountSection({ onClose }: { onClose: () => void }) {
  const { backendConfigured, status, user } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Offline builds grow zero auth UI; while the stored session is still being read, showing
  // "Not signed in" would be a wrong claim, so the section waits.
  if (!backendConfigured || status === 'loading') return null;

  if (status === 'signed-out') {
    return (
      <div data-testid="settings-account">
        <p className="hint">Not signed in. {ACCOUNT_IS_FOR} {NO_ACCOUNT_NEEDED}</p>
        <button className="primary" onClick={() => { onClose(); openSignIn(); }}>Sign in</button>
      </div>
    );
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setNote('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setNote(null);
    const { error } = await updatePassword(password);
    setBusy(false);
    setNote(error ?? '✓ Password changed.');
    if (!error) {
      setPassword('');
      setConfirm('');
    }
  };

  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <div data-testid="settings-account">
      <div className="settings-identity">
        <span className="settings-avatar" aria-hidden="true">{initials}</span>
        <strong data-testid="account-email">{user?.email ?? 'Signed in'}</strong>
      </div>
      <form onSubmit={(e) => void changePassword(e)}>
        <label className="sr-label" htmlFor="account-new-pass">Change password</label>
        {/* One row, three cells: the two fields share the space and Save never wraps under
            them (handoff §6 — an input+button pair nests its own grid). */}
        <div className="dlg-pair dlg-pair--wide">
          <input
            id="account-new-pass"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            data-testid="account-password"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repeat it"
            aria-label="Repeat the new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            data-testid="account-password-confirm"
          />
          <button type="submit" disabled={busy || !password} data-testid="account-password-save">Save</button>
        </div>
      </form>
      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'} data-testid="account-note">{note}</p>}
      <AgentAccessSection />
    </div>
  );
}

/**
 * "Agent access" - the scoped keys a coding agent's CLI holds for this account
 * (docs/AGENT_SAVE.md): name, prefix, created, last used, and the one button that ends one. A key
 * is minted by `noacg login` in a terminal, never here; this list exists so the person can SEE
 * what may write into their library and stop it. Signed-in only (the section it lives in
 * already renders nothing offline).
 */
function AgentAccessSection() {
  const [keys, setKeys] = useState<AgentKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listAgentKeys()
      .then((list) => { if (live) setKeys(list); })
      .catch((e: unknown) => { if (live) { setKeys([]); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, []);

  const revoke = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await revokeAgentKey(id);
      setKeys((list) => (list ?? []).filter((k) => k.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'never');

  return (
    <div className="agent-keys" data-testid="agent-keys">
      <p className="dlg-caption">Agent access</p>
      <p className="hint">
        Keys a tool on your computer holds to save graphics into this library (<code>noacg login</code>).
        Each can only create graphics - never control a production, use AI or delete anything.
      </p>
      {keys === null && <p className="hint">Loading…</p>}
      {keys && keys.length === 0 && <p className="hint" data-testid="agent-keys-empty">No agent keys. Run <code>noacg login</code> in a terminal to create one.</p>}
      {keys && keys.length > 0 && (
        <ul className="agent-keys-list">
          {keys.map((k) => (
            <li key={k.id} className="agent-key-row" data-testid="agent-key-row">
              <span className="agent-key-name">{k.name}</span>
              <code className="agent-key-prefix">{k.prefix}</code>
              <span className="hint agent-key-meta">created {when(k.createdAt)} · last used {when(k.lastUsedAt)}</span>
              <button onClick={() => void revoke(k.id)} disabled={busyId === k.id} data-testid="agent-key-revoke">
                {busyId === k.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="status-bad" data-testid="agent-keys-error">{error}</p>}
    </div>
  );
}

/**
 * "Playout" - the one playout server this studio drives, through NoaCG Bridge (docs/BRIDGE.md).
 * App-wide and persisted, never per production: a studio has one playout box, and retyping it
 * per show is the friction this removes. NoaCG owns these settings; the Bridge is told its
 * target on every call and stores nothing.
 *
 * FEATURE-DETECTED, not gated. With no Bridge running the section is complete and explains what
 * to run - it must never look broken, because the CasparCG routes in
 * docs/PLAYOUT_INTEGRATION.md all still work without any of this.
 *
 * The diagnosis states come from control/playoutLink.ts and are shown as themselves. A single
 * generic red here would be the worst possible outcome: "the browser has not been given local
 * network permission", "the Bridge is not running", "the Bridge rejected the token" and "the
 * server did not answer" have nothing to do with each other, and most of them are the person's
 * own to fix.
 */
function PlayoutSection() {
  const [settings, setSettings] = useState(loadPlayoutSettings);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<PlayoutResult | null>(null);

  const set = (patch: Partial<PlayoutSettings>) => {
    savePlayoutSettings(patch);
    setSettings(loadPlayoutSettings());
    setResult(null); // a changed setting makes the last verdict stale, and a stale tick lies
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection(settings));
    } finally {
      setTesting(false);
    }
  };

  const configured = playoutConfigured(settings);
  const paired = Boolean(settings.agentToken.trim());

  return (
    <div data-testid="settings-playout">
      <p className="hint">
        Put a production on a CasparCG channel from its own page, and play the templates and clips
        already on the server, without the CasparCG Client. A browser cannot open the AMCP socket
        itself, so <strong>NoaCG Bridge</strong>, a small program on this machine, holds it.{' '}
        <a href={BRIDGE_DOWNLOAD_URL} data-testid="bridge-download">
          Download NoaCG Bridge
        </a>{' '}
        and double-click it; it opens a page that pairs this browser. Loading a production&rsquo;s
        output URL by hand keeps working exactly as before.
      </p>

      <div className="dlg-rows">
        <div className="dlg-row">
          <label htmlFor="bridge-url">NoaCG Bridge</label>
          <div className="dlg-pair">
            <input
              id="bridge-url"
              value={settings.agentUrl}
              onChange={(e) => set({ agentUrl: e.target.value })}
              placeholder="http://127.0.0.1:8899"
              spellCheck={false}
              data-testid="bridge-url"
            />
            <input
              type="password"
              value={settings.agentToken}
              onChange={(e) => set({ agentToken: e.target.value })}
              placeholder="Bridge token"
              aria-label="Bridge token"
              spellCheck={false}
              data-testid="bridge-token"
            />
          </div>
          <p className="dlg-hint" data-testid="bridge-paired" data-paired={paired ? 'yes' : 'no'}>
            {paired
              ? 'Paired. The token stays in this browser; the Bridge only ever listens on this machine.'
              : 'Not paired yet. Start NoaCG Bridge and open the link it prints; both boxes fill in by themselves.'}
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-host">CasparCG server</label>
          {/* Host and AMCP port are one address, so they share a row. */}
          <div className="dlg-pair">
            <input
              id="caspar-host"
              value={settings.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="127.0.0.1"
              spellCheck={false}
              data-testid="caspar-host"
            />
            <input
              type="number"
              min={1}
              max={65535}
              value={settings.amcpPort}
              onChange={(e) => set({ amcpPort: Number(e.target.value) || 0 })}
              aria-label="AMCP port"
              data-testid="caspar-amcp-port"
            />
          </div>
          <p className="dlg-hint">
            The machine running CasparCG on your studio network, and its AMCP port (5250 unless it
            was changed). It is reached from this machine only, never from the internet.
          </p>
        </div>

        <div className="dlg-row">
          <label htmlFor="caspar-channel">Channel and layer</label>
          <div className="dlg-pair">
            <input
              id="caspar-channel"
              type="number"
              min={1}
              value={settings.channel}
              onChange={(e) => set({ channel: Number(e.target.value) || 1 })}
              aria-label="Channel"
              data-testid="caspar-channel"
            />
            <input
              type="number"
              min={0}
              value={settings.layer}
              onChange={(e) => set({ layer: Number(e.target.value) || 0 })}
              aria-label="Layer"
              data-testid="caspar-layer"
            />
          </div>
          <p className="dlg-hint">
            Where NoaCG&rsquo;s own graphics go: CasparCG calls this{' '}
            <code>{slotAddress(slotOf(settings))}</code>. Server templates cued from a rundown take
            the next free layer above it, and clips play below it.
          </p>
        </div>
      </div>

      <div className="dlg-pair dlg-pair--wide">
        <button onClick={() => void test()} disabled={testing || !configured} data-testid="playout-test">
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {result && (
        <p
          className={result.state === 'ok' ? 'status-ok' : 'status-bad'}
          data-testid="playout-result"
          data-state={result.state}
        >
          {result.state === 'ok'
            ? `✓ Connected${result.version ? ` - CasparCG ${result.version}` : ''}`
            : result.detail}
        </p>
      )}
      <p className="dlg-hint">
        No connection? <code>noacg caspar status</code> in a terminal makes the same call without a
        browser, and says whether the problem is this page or the server. Chrome and Edge are the
        browsers this works in; Safari refuses a secure page reaching a local address outright, and
        there <code>noacg caspar play</code> airs a production with no browser at all.
      </p>
      <p className="dlg-hint">
        Which server versions work, what to put on a channel by hand, and how to play an exported
        file are in the{' '}
        <a href="/docs#casparcg" target="_blank" rel="noreferrer">
          CasparCG guide
        </a>
        .
      </p>
    </div>
  );
}

export default function SettingsDialog({ onClose }: Props) {
  useModalGate();
  const pressedOnBackdrop = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [ai, setAi] = useState(loadAiSettings);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [active, setActive] = useState<SectionId>('account');
  const [analytics, setAnalytics] = useState<AnalyticsConsent>(analyticsConsent);
  const { backendConfigured, status } = useAuthState();
  const signedIn = backendConfigured && status === 'signed-in';
  const browserBlocksAnalytics = analyticsBlockedByBrowser();

  useEffect(() => {
    const refresh = () => setAnalytics(analyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, refresh);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, refresh);
  }, []);

  const saveAi = (patch: Parameters<typeof saveAiSettings>[0]) => {
    saveAiSettings(patch);
    setAi(loadAiSettings());
  };
  const savePref = (patch: Parameters<typeof savePrefs>[0]) => {
    savePrefs(patch);
    setPrefs(loadPrefs());
  };

  // Which section the reader is in. Derived from the scroll position rather than from the
  // last nav click, so scrolling past a heading moves the mark the way the reader expects.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const line = el.scrollTop + el.offsetTop + 40;
      // Only sections that actually rendered are candidates — offline there is no Account
      // section, so falling back to SECTIONS[0] would mark a nav entry that is not there and
      // leave the real first entry unmarked.
      let current: SectionId | null = null;
      for (const section of SECTIONS) {
        const node = el.querySelector<HTMLElement>(`[data-section='${section.id}']`);
        if (!node) continue;
        if (current === null || node.offsetTop <= line) current = section.id;
      }
      if (current) setActive(current);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: SectionId) => {
    const el = scroller.current;
    const node = el?.querySelector<HTMLElement>(`[data-section='${id}']`);
    if (el && node) {
      el.scrollTo({ top: node.offsetTop - el.offsetTop, behavior: 'smooth' });
    }
    setActive(id);
  };

  // The Account section renders nothing offline, so its nav entry goes with it — a nav item
  // that jumps to an empty anchor is a broken control, not a disabled feature.
  const sections = SECTIONS.filter((s) =>
    !['account', 'privacy'].includes(s.id) || backendConfigured,
  );

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="wz-modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings">
        <div className="wz-header">
          <h2>Settings</h2>
          <p className="hint wz-header-sub">Preferences stay in this browser. Provider keys stay server-side.</p>
          <button className="gallery-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.map((section) => (
              <button
                key={section.id}
                className={active === section.id ? 'active' : ''}
                onClick={() => jump(section.id)}
                data-testid={`settings-nav-${section.id}`}
              >
                {section.nav}
              </button>
            ))}
            <div className="spacer" />
            {signedIn && (
              <button onClick={() => { void signOut(); onClose(); }} data-testid="account-sign-out">Sign out</button>
            )}
          </nav>

          <div className="settings-content" ref={scroller}>
            {backendConfigured && (
              <section data-section="account">
                <p className="dlg-caption">Account</p>
                <AccountSection onClose={onClose} />
              </section>
            )}

            <section data-section="ai">
              <p className="dlg-caption">AI</p>
              <AiProviderSettings settings={ai} onChange={saveAi} />
            </section>

            {backendConfigured && (
              <section data-section="privacy">
                <p className="dlg-caption">Privacy</p>
                <label className="dlg-check">
                  <input
                    type="checkbox"
                    checked={analytics === 'accepted' && !browserBlocksAnalytics}
                    disabled={browserBlocksAnalytics}
                    onChange={(event) => setAnalyticsConsent(event.target.checked)}
                    data-testid="analytics-toggle"
                  />
                  <span className="dlg-check-text">
                    <span className="dlg-check-title">Share product-improvement analytics</span>
                    <span className="dlg-check-desc">
                      Sends only visit, return, signup, creation, and export milestones with a
                      random browser identifier. No project content, prompts, advertising, campaign
                      parameters, or referring sites. Rows are removed after 90 days.
                    </span>
                  </span>
                </label>
                <p className="dlg-hint">
                  {browserBlocksAnalytics
                    ? 'Your browser privacy signal disables analytics.'
                    : analytics === 'accepted'
                      ? 'Allowed. Turn this off to stop collection and delete associated analytics rows.'
                      : 'Not allowed. No analytics identifier or milestones are stored by NoaCG.'}
                  {' '}<a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
                </p>
              </section>
            )}

            {/* Offline builds keep this: airing on a local CasparCG needs no account and no
                backend, so gating it on `backendConfigured` would remove a feature that works. */}
            <section data-section="playout">
              <p className="dlg-caption">Playout</p>
              <PlayoutSection />
            </section>

            <section data-section="workflow">
              <p className="dlg-caption">Workflow defaults</p>
              {/* The checkbox row, by the one rule (handoff §6): box first, title over
                  description, the whole label clickable. */}
              <label className="dlg-check">
                <input
                  type="checkbox"
                  checked={useAdvancedMode((s) => s.advanced)}
                  onChange={(event) => useAdvancedMode.getState().setAdvanced(event.target.checked)}
                  data-testid="advanced-mode-toggle"
                />
                <span className="dlg-check-text">
                  <span className="dlg-check-title">Advanced mode — show the code editor</span>
                  <span className="dlg-check-desc">
                    Off, the studio is wizard → production → playout. On, every “Open in the
                    editor” door returns: canvas, timeline, and code. Direct graphic links open
                    the editor either way.
                  </span>
                </span>
              </label>

              <div className="dlg-rows">
                <div className="dlg-row">
                  <label htmlFor="set-export-target">Export target</label>
                  <select
                    id="set-export-target"
                    value={prefs.defaultExportTarget || EXPORT_TARGETS[0].id}
                    onChange={(event) => savePref({ defaultExportTarget: event.target.value })}
                  >
                    {EXPORT_TARGETS.map((target) => (
                      <option key={target.id} value={target.id}>{target.label}</option>
                    ))}
                  </select>
                  <p className="dlg-hint">
                    Preselected in the Export tab — picking a target there updates this too.
                  </p>
                </div>
              </div>
              <p className="dlg-hint">
                On a school or corporate network that blocks parts of the app, the{' '}
                <a href="/app?diag=1" target="_blank" rel="noreferrer" data-testid="settings-diag-link">
                  connection check
                </a>{' '}
                shows what is blocked — screenshot it when reporting a problem.
              </p>
            </section>

            <section data-section="brand">
              <p className="dlg-caption">Brand &amp; style defaults</p>
              <p className="hint">
                Your visual defaults live where the work happens: the <strong>project brand</strong> is
                captured on every wizard Create (reapply it with the wizard&apos;s &quot;Use current
                project&apos;s colors &amp; typeface&quot; toggle), and named <strong>brand looks</strong> -
                palette + typeface, shareable as files - live under Home / Brand looks. Imported
                typefaces and logos travel inside each graphic and its export.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
