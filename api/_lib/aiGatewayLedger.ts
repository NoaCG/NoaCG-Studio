// The content-free accounting ledger for the AI model gateway (/api/ai/generate).
//
// One row per gateway execution: who (user id when known, salted IP hash), which route,
// whose key, tokens, cost, and the outcome code. NEVER prompts, messages, images,
// generated output, or provider response bodies - the entry type has no field that could
// carry them. Writing is best-effort: a ledger failure must never fail a generation, and
// a deployment without Supabase (self-hosted, offline) simply keeps no ledger.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiGatewayRequestBody, AiProviderId, ModelResult } from '../../src/ai/modelTypes.js';
import { supabaseSecretKey } from './jobStore.js';

export interface GatewayLedgerEntry {
  /** 'pro-generate' when the caller tagged the NoaCG Pro surface; 'byo-generate' otherwise.
   *  The task CHECK constraint pins these values (migrations 0012 + 0025). */
  task: 'byo-generate' | 'pro-generate';
  userId: string | null;
  ipHash: string;
  keySource: 'byo' | 'managed';
  provider: AiProviderId;
  model: string;
  /** 'ok' or the AiGatewayErrorCode the request failed with. */
  outcome: string;
  attemptCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  providerCostUsd: number;
}

/** Build the row for one gateway execution. On failure the primary route is charged
 *  with zero usage - the gateway surfaces no per-route usage for failed attempts. */
export function gatewayLedgerEntry(input: {
  userId: string | null;
  ipHash: string;
  body: AiGatewayRequestBody;
  userKeys: Partial<Record<AiProviderId, string>>;
  result?: ModelResult;
  errorCode?: string;
}): GatewayLedgerEntry {
  const provider = input.result?.provider ?? input.body.route.provider;
  const usage = input.result?.usage;
  return {
    task: input.body.surface === 'pro' ? 'pro-generate' : 'byo-generate',
    userId: input.userId,
    ipHash: input.ipHash,
    keySource: input.userKeys[provider] ? 'byo' : 'managed',
    provider,
    model: input.result?.model ?? input.body.route.model,
    outcome: input.result ? 'ok' : input.errorCode ?? 'unavailable',
    attemptCount: input.result?.attempts.reduce((sum, item) => sum + item.attempts, 0) ?? 0,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    providerCostUsd: usage?.estimatedCost?.amount ?? usage?.requestFeeUsd ?? 0,
  };
}

export function gatewayLedgerConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey());
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, supabaseSecretKey(), { auth: { persistSession: false } });
  return client;
}

export async function recordGatewayRequest(entry: GatewayLedgerEntry): Promise<void> {
  if (!gatewayLedgerConfigured()) return;
  try {
    const { error } = await (await sb()).from('ai_gateway_requests').insert({
      task: entry.task,
      user_id: entry.userId,
      ip_hash: entry.ipHash,
      key_source: entry.keySource,
      provider: entry.provider,
      model: entry.model,
      outcome: entry.outcome,
      attempt_count: entry.attemptCount,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      cached_input_tokens: entry.cachedInputTokens,
      reasoning_tokens: entry.reasoningTokens,
      provider_cost_usd: entry.providerCostUsd,
    });
    if (error) console.warn('AI gateway ledger write failed:', error.message);
  } catch (error) {
    console.warn('AI gateway ledger write failed:', error instanceof Error ? error.message : error);
  }
}
