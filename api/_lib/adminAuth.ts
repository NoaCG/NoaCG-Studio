// Shared service client for entitlements, system settings and template visibility.
// The dashboard and its HTTP authorization gate were retired; these live readers remain.
import type { SupabaseClient } from '@supabase/supabase-js';

function serviceKey(): string {
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

function serviceUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
}

/** Whether server-side access resolution can read the hosted account data. */
export function adminConfigured(): boolean {
  return Boolean(serviceUrl() && serviceKey());
}

let cached: SupabaseClient | null = null;

/** Server-only service client. Callers own authorization; never expose it to the browser.
 *  The key deliberately has no VITE_ fallback. */
export async function adminDb(): Promise<SupabaseClient> {
  if (cached) return cached;
  const url = serviceUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('admin: SUPABASE_URL + SUPABASE_SECRET_KEY required');
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Test seam for live access-loader tests that vary the server environment. */
export function resetAdminDb(): void {
  cached = null;
}
