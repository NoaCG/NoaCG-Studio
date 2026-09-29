// The Supabase client factory (Era 5). Lazily created and cached — and ONLY when a backend is
// configured, so an offline / self-host build never even loads the Supabase library: the dynamic
// import below is code-split into its own chunk that is fetched only in hosted mode. Returns null
// in offline mode; every caller must handle null and degrade to the local-only path.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBackendConfig, isBackendConfigured } from './config';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * The shared Supabase client, or null when no backend is configured (offline mode).
 *
 * A FAILED load is not kept. The library arrives as its own chunk, and one 404 or dropped
 * connection on it used to become this module's answer for the life of the page: every later
 * caller got the same rejection, so an unattended /output renderer stayed dead until someone
 * reloaded it (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.6). The next caller now tries again.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    const pending = create();
    clientPromise = pending;
    pending.catch(() => {
      if (clientPromise === pending) clientPromise = null;
    });
  }
  return clientPromise;
}

async function create(): Promise<SupabaseClient | null> {
  const cfg = loadBackendConfig();
  if (!isBackendConfigured(cfg)) return null;
  // Code-split: the Supabase library is fetched only here, only in hosted mode.
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // completes the OAuth redirect when the page loads back
    },
  });
}
