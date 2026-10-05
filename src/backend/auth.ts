// Auth (Era 5.1) — a thin, framework-agnostic wrapper over Supabase Auth: Google OAuth +
// email/password. Everything no-ops when no backend is configured, so the offline app never calls
// it. The invite-only gate is enforced SERVER-side (the enforce_allowlist hook, see
// supabase/migrations/0002_auth_allowlist.sql); this module just surfaces the resulting 403 to the
// user. The UI gate is UX only — RLS + the hook are the real security boundary.

import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { loadBackendConfig } from './config';
import { releaseLibrary } from './accountLibrary';
import { OUTPUT_DEFAULT_KEY, readOutputSetup, type ProductionOutputSetup } from '../model/outputSetup';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  expiresAt?: number;
}

/**
 * `getSession()` is not the local read it looks like: for a returning user whose access token
 * has expired, supabase-js refreshes it OVER THE NETWORK inside the call, with no timeout of
 * its own. On a network that silently black-holes `*.supabase.co` (corporate filtering - the
 * failure class a real demo hit) that promise hangs for the browser's own connect timeout, and
 * everything chained on it (sync status, entitlement, AI status) sits in 'loading' meanwhile.
 * So every boot-path read goes through this bounded wrapper: on timeout the caller proceeds
 * signed-out, and if the refresh does land later, onAuthStateChange corrects the state - the
 * subscription is already how every later change arrives.
 */
const SESSION_READ_TIMEOUT_MS = 6000;
async function readSessionBounded(
  sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>,
): Promise<Session | null> {
  try {
    const result = await Promise.race([
      sb.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS)),
    ]);
    return result ? result.data.session : null;
  } catch {
    return null;
  }
}

// Return to wherever the app itself is served from (/app hosted, /app.html raw self-host) —
// NOT the bare origin: that is the public landing page, which runs no Supabase client.
const OAUTH_REDIRECT =
  typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;

// Password recovery gets a route of its own rather than landing on whatever surface the request
// happened to be made from: `<app-url>?recovery=1`. That page boots a Supabase client, reads the
// token, and can SAY something when the link is expired. Before this, a reset link's only hope
// was that wherever it landed happened to run a client and happened to catch one event.
const RECOVERY_REDIRECT =
  typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?recovery=1`
    : undefined;

/** Start Google OAuth. On success the page redirects, so a resolved value with no error means
 * "redirecting"; an error means it never left. */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT },
  });
  return { error: error?.message ?? null };
}

/** Sign in with email + password (existing account). */
export async function signInWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/**
 * Create an account with email + password. Signup is open (migration 0006); the server-side
 * Before-User-Created hook is the switch if it ever needs to re-close to the allowlist — any
 * rejection message it returns surfaces here.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { error } = await sb.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  // Mark this as the USER's choice before the SIGNED_OUT event can land, so the session-expiry
  // prompt (syncController) never mistakes a deliberate sign-out for a dead session.
  deliberateSignOut = true;
  const sb = await getSupabase();
  await sb?.auth.signOut();
  // Graphics are account-bound: the page returns to the signed-out workspace, and the account's
  // library (with its own sync bookmark) waits on this device until it signs in again.
  await releaseLibrary();
}

/** Whether the most recent transition to signed-out was the user's own Sign out. Reading it
 *  CONSUMES it — the flag describes one transition, never a standing state. */
let deliberateSignOut = false;
export function consumeDeliberateSignOut(): boolean {
  const was = deliberateSignOut;
  deliberateSignOut = false;
  return was;
}

/**
 * Ask for a password-reset email. The link returns to the app's `?recovery=1` route, where
 * Supabase establishes a RECOVERY session and PasswordRecoveryPage offers the form.
 */
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_REDIRECT });
  return { error: error?.message ?? null };
}

/** Set a new password for the signed-in user (a normal session, or the recovery session the
 *  reset link establishes). */
export async function updatePassword(password: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'No backend configured.' };
  const { error } = await sb.auth.updateUser({ password });
  return { error: error?.message ?? null };
}

// THERE IS DELIBERATELY NO `onPasswordRecovery` HERE ANY MORE, and it should not come back.
// Supabase emits PASSWORD_RECOVERY from inside the client's own initialisation - the same step
// that reads the token out of the URL - and the event is queued and flushed once, never
// replayed to a later subscriber. So a listener registered from a React effect is racing a
// notification that has usually already gone out, and it loses silently: the reader arrives
// signed in with nothing on screen, which is the bug the owner walked twice on 2026-09-04.
// backend/recoveryLink.ts reads the arriving URL at module load instead. State beats a
// broadcast nobody was listening for.

/**
 * The current user's access token (JWT), or null. Used to authorize the metered AI gateway —
 * The AI gateway client attaches it as a Bearer header for managed server-key mode. Reads the live session so the client
 * refreshes an expired token first. Returns null offline / logged out, so self-hosters with their
 * own proxy (and no login) are unaffected.
 */
export async function getAccessToken(): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const session = await readSessionBounded(sb);
  return session?.access_token ?? null;
}

/** The signed-in account's id, or null - read the same bounded way as the access token. */
export async function getSignedInUserId(): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const session = await readSessionBounded(sb);
  return session && (!session.expires_at || session.expires_at * 1000 > Date.now()) ? session.user.id : null;
}

/**
 * Subscribe to auth state. Calls back once with the initial state (after reading the stored
 * session / completing an OAuth redirect), then on every change. Returns an unsubscribe fn. With
 * no backend it reports 'signed-in' so a misconfigured gate can never trap the user.
 */
export function subscribeAuth(cb: (state: AuthState) => void): () => void {
  let unsub = () => {};
  let cancelled = false;
  void (async () => {
    const sb = await getSupabase();
    if (cancelled) return;
    if (!sb) {
      cb({ status: 'signed-in', user: null });
      return;
    }
    let changed = false;
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      changed = true;
      cb(session ? { status: 'signed-in', user: session.user, expiresAt: session.expires_at ? session.expires_at * 1000 : undefined } : { status: 'signed-out', user: null });
    });
    unsub = () => sub.subscription.unsubscribe();
    const session = await readSessionBounded(sb);
    if (cancelled || changed) return;
    cb(session ? { status: 'signed-in', user: session.user, expiresAt: session.expires_at ? session.expires_at * 1000 : undefined } : { status: 'signed-out', user: null });
  })();
  return () => {
    cancelled = true;
    unsub();
  };
}

/** Account preference, never authorization. Read fresh metadata for cross-device defaults. */
export async function readDefaultOutput(userId: string): Promise<{ setup: ProductionOutputSetup | null; error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { setup: null, error: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const session = await readSessionBounded(sb);
    if (session?.user.id !== userId) return { setup: null, error: 'The signed-in account changed.' };
    const answer = await Promise.race([
      sb.auth.getUser(session.access_token),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS); }),
    ]);
    if (!answer || answer.error) return { setup: null, error: answer?.error?.message ?? 'Account default could not be checked.' };
    if (answer.data.user?.id !== userId || (await readSessionBounded(sb))?.user.id !== userId) return { setup: null, error: 'The signed-in account changed.' };
    const setup = readOutputSetup(answer.data.user.user_metadata[OUTPUT_DEFAULT_KEY]);
    return { setup: setup?.destinations.length ? setup : null, error: null };
  } catch (e) { return { setup: null, error: (e as Error).message }; }
  finally { clearTimeout(timer); }
}
export async function saveDefaultOutput(userId: string, setup: ProductionOutputSetup | null): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Sign in to save this default.' };
  const session = await readSessionBounded(sb);
  if (session?.user.id !== userId) return { error: 'Sign in to the same account to save this default.' };
  if (setup && !readOutputSetup(setup)?.destinations.length) return { error: 'Choose an output first.' };
  // Same Auth metadata endpoint as updateUser, bound to the captured owner's bearer. The SDK's
  // updateUser reads its session later under a lock, which could now belong to another account.
  const cfg = loadBackendConfig();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SESSION_READ_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.url}/auth/v1/user`, { method: 'PUT', headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { [OUTPUT_DEFAULT_KEY]: setup } }), signal: abort.signal });
    const answer = await response.json() as { id?: string; msg?: string; message?: string };
    if (!response.ok) return { error: answer.msg ?? answer.message ?? 'Account default could not be saved.' };
    if (answer.id !== userId || (await readSessionBounded(sb))?.user.id !== userId) return { error: 'The signed-in account changed. Check the default on that account.' };
    return { error: null };
  } catch (e) { return { error: (e as Error).name === 'AbortError' ? 'Saving the account default timed out. Try again.' : (e as Error).message }; }
  finally { clearTimeout(timer); }
}
