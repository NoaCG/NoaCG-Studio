// Server-side record of AI disclosure-notice acceptance for SIGNED-IN users
// (migration 0014_ai_consent.sql; anonymous acceptance lives client-side only).
// Reads and writes go through the Supabase secret key - the table has no client
// policies, so the browser can never forge or read another user's consent row.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSecretKey } from './jobStore.js';

export interface AiConsentRecord {
  noticeVersion: string;
  acceptedAt: string;
}

export function consentStoreConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey());
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const key = supabaseSecretKey();
  if (!url || !key) throw new Error('AI consent storage requires Supabase URL and secret key.');
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function readAiConsent(userId: string): Promise<AiConsentRecord | null> {
  const { data, error } = await (await sb())
    .from('ai_consents')
    .select('notice_version, accepted_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('AI consent lookup failed: ' + error.message);
  if (!data) return null;
  return {
    noticeVersion: String(data.notice_version),
    acceptedAt: String(data.accepted_at),
  };
}

export async function recordAiConsent(userId: string, noticeVersion: string): Promise<void> {
  const { error } = await (await sb())
    .from('ai_consents')
    .upsert(
      { user_id: userId, notice_version: noticeVersion, accepted_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error('AI consent record failed: ' + error.message);
}

/**
 * Has this signed-in user accepted the CURRENT notice? The consent boundary a server-side AI task
 * checks before it builds a request. Fails closed: no record, an older version, or a lookup that
 * throws (storage down, not configured) all answer no, so a failure to read consent never reads
 * as consent. `read` is injectable so tests need no database.
 */
export async function hasCurrentAiConsent(
  userId: string,
  noticeVersion: string,
  read: (userId: string) => Promise<AiConsentRecord | null> = readAiConsent,
): Promise<boolean> {
  try {
    return (await read(userId))?.noticeVersion === noticeVersion;
  } catch {
    return false;
  }
}
