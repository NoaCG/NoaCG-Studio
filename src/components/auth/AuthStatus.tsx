import { useEffect, useRef, useState } from 'react';
import { signOut } from '../../backend/auth';
import { useAuthState } from './useAuthState';
import { useAuthUi } from './authUi';
import { useRouter } from '../../app/router';
import SettingsDialog from '../SettingsDialog';
import { ACCOUNT_IS_FOR } from './accountCopy';
import { DOWNLOADS_URL } from '../../downloads/links';

/**
 * Topbar account control. Renders nothing in offline / self-host mode (no backend, no login
 * UI — the 🏠 Home button next to it is the always-available door to saved work). In hosted
 * mode: signed out → a "Sign in" button opening the SignInDialog; signed in → the profile
 * button (first name + Google avatar or initials) opening the account menu (Home · Settings ·
 * Downloads · Sign out). The app itself is never gated — this is the only always-visible entry
 * point into an account.
 *
 * IT STATES WHICH STATE IT IS IN, not only what it offers (owner, 2026-09-04: "it looks exactly
 * like you would be logged in... there's no difference between being logged in or not"). Both
 * halves now carry a quiet word beside the control, because the two states used to differ only
 * by the shape of a small button, and SyncStatus - the other thing that could have said so -
 * renders NOTHING when a backend is configured and nobody is signed in. So the signed-out
 * topbar said nothing at all, and the person most at risk is the one who believes the opposite:
 * a student who works a whole session on a shared machine and learns at the end that none of it
 * synced. The signed-out title line names that cost in plain words rather than selling the
 * account.
 *
 * The offer itself is untouched: the button keeps its class and its accessible name "Sign in",
 * which is how e2e/configured/_helpers.ts and four specs recognise the signed-out topbar.
 */
export default function AuthStatus() {
  const { backendConfigured, status, user } = useAuthState();
  const openSignIn = useAuthUi((s) => s.openSignIn);
  const navigate = useRouter((s) => s.navigate);

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // The dropdown closes on an outside click or Escape (standard menu behavior).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!backendConfigured || status === 'loading') return null;

  if (status === 'signed-out') {
    // `.auth-anon` is a class of its own, NOT `.auth-status`: that one means "there is a
    // session" to the specs (e2e/configured/anonymous.spec.ts asserts it is absent when signed
    // out, and _helpers.ts waits for it as the proof a sign-in landed). Reusing it here would
    // have made both of them lie.
    return (
      <span className="auth-anon">
        <span
          className="auth-state"
          data-testid="auth-state"
          title="Your graphics are saved on this computer only. Sign in to keep them in your account."
        >
          Not signed in
        </span>
        <button className="auth-signin" onClick={() => openSignIn()} title={ACCOUNT_IS_FOR}>
          Sign in
        </button>
      </span>
    );
  }

  const email = user?.email ?? null;
  // Google accounts carry an avatar; email/password accounts get an initials chip.
  const meta = (user?.user_metadata ?? {}) as { avatar_url?: string; full_name?: string };
  const initials = (meta.full_name || email || '?')
    .trim()
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';

  // WHO, in words, beside the picture. An avatar alone answers "is somebody signed in?" only to
  // a reader who already knows what the empty slot looks like; the name answers it to everyone,
  // and on a shared machine it answers the more useful question of WHICH account. The full name
  // is one word here (a surname adds width and settles nothing), and an email falls back to its
  // local part for the same reason.
  const who = meta.full_name?.trim().split(/\s+/)[0] || email?.split('@')[0] || 'Signed in';

  // THE PROFILE BUTTON (owner, 2026-09-23: the small circle "is too subtle and easy to miss").
  // The name and the picture are ONE button now, drawn as a pill with a ▾ on a wide bar, so it
  // reads as the door to the account and its settings rather than as a status dot. Under the
  // 1480px step auth.css hides the name and the pill falls back to the round avatar alone, at
  // exactly its old size - that width ladder is measured and pinned
  // (e2e/configured/signed-in-ux.spec.ts), and a wider control there would push the bar over.
  return (
    <span className="auth-status" ref={wrapRef}>
      <button
        className="avatar-btn account-pill"
        onClick={() => setMenuOpen((o) => !o)}
        title={email ? `${email}. Account and settings` : 'Account and settings'}
        aria-label="Account and settings"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="account-button"
      >
        <span className="auth-state" data-testid="auth-state" title={email ?? undefined}>
          {who}
        </span>
        <span className="account-avatar">
          {meta.avatar_url ? (
            <img className="avatar-img" src={meta.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar-initial">{initials}</span>
          )}
        </span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div className="account-menu" role="menu" data-testid="account-menu">
          <div className="account-menu-head" title={email ?? undefined}>{email ?? 'Signed in'}</div>
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); navigate({ view: 'home', section: null }); }}
            data-testid="menu-home"
          >
            Home - your work
          </button>
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
            data-testid="menu-settings"
          >
            ⚙ Settings
          </button>
          {/* The two installable tools (NoaCG Bridge, the NoaCG CLI) have one public page; the
              account menu is where a signed-in person looks for "what else is there". */}
          <a role="menuitem" href={DOWNLOADS_URL} className="account-menu-link" data-testid="menu-downloads">
            Downloads - Bridge &amp; CLI
          </a>
          <div className="account-menu-sep" />
          <button role="menuitem" onClick={() => { setMenuOpen(false); void signOut(); }}>
            Sign out
          </button>
        </div>
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </span>
  );
}
