// Server-side auth for the render API: verify a Supabase JWT into a user id.
// Verification goes through supabase.auth.getUser(token) — two lines, revocation-aware,
// key-rotation-proof (recommended over local JWKS verification; the request already
// makes Supabase round-trips for quota, so the extra ~50 ms is noise).
//
// No backend configured = every caller is anonymous — the render feature still works,
// gated formats simply stay locked.

export interface AuthedUser {
  userId: string;
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  // Vercel exposes env vars to functions verbatim; the VITE_ prefix only matters for
  // client baking, so the server reuses the same two vars (no duplication).
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return url && anonKey ? { url, anonKey } : null;
}

/** Managed paid services require a valid user when a hosted backend is configured. */
export function serverAuthConfigured(): boolean {
  return supabaseEnv() !== null;
}

/** The OAuth client a JWT was issued to, read from its payload WITHOUT verifying it, or null for
 *  a first-party session (no `client_id`) and for anything that is not a JWT. Only ever used to
 *  REFUSE or to choose the stricter path; a verified token is still required to be admitted. */
export function oauthClientOf(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { client_id?: unknown };
    return typeof claims.client_id === 'string' && claims.client_id ? claims.client_id : null;
  } catch {
    return null;
  }
}

/** Resolve a Bearer JWT to a user id; null = anonymous (absent/invalid token or no backend).
 *
 *  A token issued to an OAuth client (a chat client's connector, docs/REMOTE_MCP_PLAN.md) is
 *  REFUSED here: Supabase Auth answers getUser for it as for the user's own session, so without
 *  this every signed-in route would serve a connector as the user. Only the connector path
 *  admits such a token, verified locally (connectorAuth.ts) and only with a live grant. */
export async function verifyUser(token: string | null): Promise<AuthedUser | null> {
  if (!token || oauthClientOf(token)) return null;
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id };
  } catch {
    return null; // verification infrastructure down — fail closed to anonymous
  }
}
