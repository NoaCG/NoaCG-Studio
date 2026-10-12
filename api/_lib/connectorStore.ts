// The CONNECTOR GRANT store: what a chat client's connector may do for a user (migration 0090,
// docs/REMOTE_MCP_PLAN.md key decision 3).
//
// The same shape as agentAccessStore.ts: one interface, a Supabase implementation over the
// service role, and an in-memory one so the handlers' whole decision surface runs under
// `node --test` with no network. The lookup that every connector call makes is an RPC
// (`connector_grant_resolve`) so it stamps last_used_at in the same statement and never puts its
// values in a logged query string.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConnectorGrantRow {
  id: string;
  userId: string;
  clientId: string;
  clientName: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface NewConnectorGrant {
  userId: string;
  clientId: string;
  clientName: string;
  permissions: string[];
}

export interface ConnectorStore {
  /** The live grant for this user and client (and the last-used stamp), null when none. */
  resolveGrant(userId: string, clientId: string): Promise<{ id: string; permissions: string[] } | null>;
  /** Record a grant. A live grant for the same user and client is returned as it is, with
   *  `created: false`. */
  createGrant(row: NewConnectorGrant): Promise<{ row: ConnectorGrantRow; created: boolean }>;
  /** End a grant. Used when the consent that followed it failed. */
  dropGrant(id: string): Promise<void>;
  /** The user's live grants, newest first. */
  listGrants(userId: string): Promise<ConnectorGrantRow[]>;
  /** Revoke one of the user's grants (idempotent). Its client id, or null when the user has no
   *  grant with this id. */
  revokeGrant(userId: string, id: string): Promise<{ clientId: string } | null>;
}

// ── the Supabase implementation ───────────────────────────────────────────────────────────

let cached: SupabaseClient | null = null;

async function db(): Promise<SupabaseClient> {
  if (cached) return cached;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('connector grants: SUPABASE_URL + SUPABASE_SECRET_KEY required');
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

interface GrantRowDb {
  id: string;
  user_id: string;
  client_id: string;
  client_name: string | null;
  permissions: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const COLUMNS = 'id, user_id, client_id, client_name, permissions, created_at, last_used_at, revoked_at';

function toRow(row: GrantRowDb): ConnectorGrantRow {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    clientName: row.client_name ?? '',
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function supabaseConnectorStore(): ConnectorStore {
  const liveGrant = async (userId: string, clientId: string): Promise<ConnectorGrantRow | null> => {
    const { data, error } = await (await db())
      .from('connector_grants')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRow(data as GrantRowDb) : null;
  };
  return {
    async resolveGrant(userId, clientId) {
      const { data, error } = await (await db()).rpc('connector_grant_resolve', { p_user_id: userId, p_client_id: clientId });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; permissions: string[] | null } | undefined;
      return row ? { id: row.id, permissions: row.permissions ?? [] } : null;
    },
    async createGrant(row) {
      const { data, error } = await (await db())
        .from('connector_grants')
        .insert({ user_id: row.userId, client_id: row.clientId, client_name: row.clientName, permissions: row.permissions })
        .select(COLUMNS)
        .single();
      if (!error) return { row: toRow(data as GrantRowDb), created: true };
      // 23505: a live grant for this client already exists (a second Allow); keep that one.
      const existing = error.code === '23505' ? await liveGrant(row.userId, row.clientId) : null;
      if (!existing) throw new Error(error.message);
      return { row: existing, created: false };
    },
    async dropGrant(id) {
      const { error } = await (await db()).from('connector_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async listGrants(userId) {
      const { data, error } = await (await db())
        .from('connector_grants')
        .select(COLUMNS)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as GrantRowDb[]).map(toRow);
    },
    async revokeGrant(userId, id) {
      const sb = await db();
      const { data, error } = await sb.from('connector_grants').select('client_id').eq('id', id).eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const { error: updateError } = await sb
        .from('connector_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .is('revoked_at', null);
      if (updateError) throw new Error(updateError.message);
      return { clientId: (data as { client_id: string }).client_id };
    },
  };
}

// ── an in-memory implementation (the test seam) ───────────────────────────────────────────

export interface MemoryConnectorStore extends ConnectorStore {
  grants: ConnectorGrantRow[];
}

export function memoryConnectorStore(now: () => string = () => new Date().toISOString()): MemoryConnectorStore {
  let counter = 0;
  const live = (userId: string, clientId: string) =>
    store.grants.find((g) => g.userId === userId && g.clientId === clientId && !g.revokedAt);
  const store: MemoryConnectorStore = {
    grants: [],
    async resolveGrant(userId, clientId) {
      const grant = live(userId, clientId);
      if (!grant) return null;
      grant.lastUsedAt = now();
      return { id: grant.id, permissions: grant.permissions };
    },
    async createGrant(row) {
      const existing = live(row.userId, row.clientId);
      if (existing) return { row: existing, created: false };
      counter += 1;
      const grant: ConnectorGrantRow = {
        id: `00000000-0000-4000-9000-${String(counter).padStart(12, '0')}`,
        ...row,
        permissions: [...row.permissions],
        createdAt: now(),
        lastUsedAt: null,
        revokedAt: null,
      };
      store.grants.push(grant);
      return { row: grant, created: true };
    },
    async dropGrant(id) {
      const grant = store.grants.find((g) => g.id === id);
      if (grant && !grant.revokedAt) grant.revokedAt = now();
    },
    async listGrants(userId) {
      return store.grants.filter((g) => g.userId === userId && !g.revokedAt).slice().reverse();
    },
    async revokeGrant(userId, id) {
      const grant = store.grants.find((g) => g.id === id && g.userId === userId);
      if (!grant) return null;
      if (!grant.revokedAt) grant.revokedAt = now();
      return { clientId: grant.clientId };
    },
  };
  return store;
}
