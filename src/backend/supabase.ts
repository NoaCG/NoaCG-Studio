// The Supabase client factory (Era 5). Lazily created and cached — and ONLY when a backend is
// configured, so an offline / self-host build never even loads the Supabase library: the dynamic
// import below is code-split into its own chunk that is fetched only in hosted mode. Returns null
// in offline mode; every caller must handle null and degrade to the local-only path.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBackendConfig, isBackendConfigured } from './config';
import { realtimeReconnectAfterMs } from './realtimeReconnect';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** The shared Supabase client, or null when no backend is configured (offline mode). */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) clientPromise = create();
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
    // The library's reconnect steps with jitter, so pages dropped together do not retry together.
    realtime: { reconnectAfterMs: (tries: number) => realtimeReconnectAfterMs(tries) },
  });
}
