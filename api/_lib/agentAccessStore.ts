// The AGENT ACCESS store: the service-role writes behind scoped agent keys (migration 0050) and
// the library INSERT the save door makes (docs/AGENT_SAVE.md).
//
// ONE interface, two implementations. The handlers (api/_lib/me/agentKeys.ts, graphics.ts) take
// the interface, never a client: that is what lets their whole decision surface - PKCE binding,
// expiry, single use, the shape guard, the insert-only rule - run under `node --test` with no
// network, exactly as adminAuth.test.ts pins the admin gate. The Supabase implementation is
// the thin part: six calls, two of them RPCs.
//
// WHY THE TWO LOOKUPS ARE RPCs (0050 `agent_code_consume`, `agent_key_resolve`) and not
// `.eq()` table reads: a PostgREST filter rides in the GET/PATCH query string, which the API
// gateway logs - the 0047 rule. A hash in a log is not a key, but a consumed code's hash and
// a live key's hash have no business in log retention either, and the RPC form also makes
// "mark used" / "stamp last-used" one atomic statement with the read.
//
// The service key never meets the browser: this module is under api/ and the key it reads has
// no VITE_ fallback (the same reasoning adminAuth.ts records).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GraphicDocBase } from '../../src/model/graphicDoc.js';
import type { DeliveredShow } from '../../src/model/productionDelivery.js';

export interface AgentKeyRow {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface NewAuthCode {
  codeHash: string;
  userId: string;
  name: string;
  scopes: string[];
  challenge: string;
  expiresAt: string;
}

export interface ConsumedCode {
  userId: string;
  name: string;
  scopes: string[];
  challenge: string;
}

export interface NewAgentKey {
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
}

export interface ResolvedKey {
  id: string;
  userId: string;
  scopes: string[];
}

export interface AgentAccessStore {
  /** Write a one-time auth code row (hashed, bound to a PKCE challenge, with an expiry). */
  createCode(row: NewAuthCode): Promise<void>;
  /** Consume a code ATOMICALLY: returns its binding once, null for unknown / expired / used. */
  consumeCode(codeHash: string): Promise<ConsumedCode | null>;
  /** Opportunistic hygiene: drop codes whose expiry is older than `before` (ISO). Best effort. */
  purgeExpiredCodes(before: string): Promise<void>;
  /** Mint a key row. The plaintext never reaches this layer - only its hash and prefix. */
  createKey(row: NewAgentKey): Promise<AgentKeyRow>;
  /** A presented key's principal (and the last-used stamp), null for unknown / revoked. */
  resolveKey(keyHash: string): Promise<ResolvedKey | null>;
  /** One key row by id - for an agent key describing ITSELF (`noacg whoami`). */
  keyById(id: string): Promise<AgentKeyRow | null>;
  /** The user's live keys (revoked rows excluded), newest first. */
  listKeys(userId: string): Promise<AgentKeyRow[]>;
  /** Revoke one key the user owns. False when no live row matched. */
  revokeKey(userId: string, id: string): Promise<boolean>;
  /** INSERT a library record for the user - never an upsert (docs/AGENT_SAVE.md). */
  insertGraphic(userId: string, doc: GraphicDocBase): Promise<void>;
  /** How many packages are WAITING for the user to install (docs/AGENT_SAVE.md §7). */
  countWaitingPackages(userId: string): Promise<number>;
  /** INSERT a waiting package for the user; the server mints and returns its id. */
  insertPackage(userId: string, row: NewWaitingPackage): Promise<string>;
  /** Send a pack for review to Community packs as the user, through the database's one submit
   *  gate (`community_pack_submit_for`, migration 0087). Returns the submission's id; a refusal
   *  of that gate throws a `CommunityPackRefusal` carrying its sentence. */
  submitCommunityPack(userId: string, row: NewCommunityPack): Promise<string>;
  /** The account a user id is: its id and sign-in email, for the receipts and `whoami`. The email
   *  is null when the account has none (or the lookup found no user). */
  accountOf(userId: string): Promise<AccountIdentity>;
  /** Record what a write delivered (migration 0092). Called after the resource INSERT. */
  recordDelivery(row: NewDelivery): Promise<void>;
  /** The receipts of one operation or one resource, as `id` names either - the user's own, and
   *  only those `keyId` wrote when it is given (an agent key reads back nothing else). */
  findDeliveries(userId: string, id: string, keyId: string | null): Promise<DeliveryRow[]>;
  /** Whether a delivered resource is still there: the library record or the production a set
   *  delivered not deleted, or the package still waiting. */
  resourcePresent(userId: string, kind: DeliveryKind | 'production', id: string): Promise<boolean>;
  /** Whether the production Install made has been deleted since: its synced record is a tombstone.
   *  A production not yet synced (local-first) is not deleted - it is simply not up yet. */
  productionDeleted(userId: string, productionId: string): Promise<boolean>;
  /** Install (with the production it made) or dismiss (`productionId` null) a waiting package: its
   *  row goes and its receipt records the outcome, in one statement. False when the user had no
   *  such package waiting. */
  settlePackage(userId: string, packageId: string, productionId: string | null): Promise<boolean>;
  /** Deliver a set of library records as ONE operation (migration 0093, `agent_deliver_graphics`):
   *  the claim, every record and every receipt commit together or not at all. The same operation
   *  with the same payload hash and writer replays the first call's ids; anything else under that
   *  operation is a conflict and writes nothing. With a `production` (migration 0094,
   *  `agent_deliver_production`) the production record joins the same transaction, and every
   *  graphic's receipt names it. */
  deliverGraphicSet(set: NewGraphicSet): Promise<GraphicSetOutcome>;
}

/** A set of library records, ids already minted, in the order they were sent. */
export interface NewGraphicSet {
  userId: string;
  keyId: string | null;
  operationId: string;
  /** sha256 hex of the payload minus server-minted ids and timestamps (graphicSets.ts). */
  payloadHash: string;
  docs: GraphicDocBase[];
  /** The production the same delivery makes of them, id minted by the API (productionDelivery.ts). */
  production?: { id: string; name: string; body: DeliveredShow };
}

export interface GraphicSetOutcome {
  outcome: 'created' | 'replayed' | 'conflict';
  /** The library ids in the order the set was sent; empty on a conflict. */
  ids: string[];
  /** The production the delivery made, when it asked for one (a replay answers the first one's). */
  productionId?: string | null;
}

/** Which account a credential acts for. */
export interface AccountIdentity {
  id: string;
  email: string | null;
}

export type DeliveryKind = 'graphic' | 'package';
/** What the server RECORDED; the readback derives the current state from it (deliveryReceipt.ts). */
export type RecordedDeliveryState = 'saved' | 'pending_install' | 'installed' | 'dismissed';

export interface NewDelivery {
  operationId: string;
  userId: string;
  keyId: string | null;
  kind: DeliveryKind;
  resourceId: string;
  state: RecordedDeliveryState;
}

export interface DeliveryRow extends NewDelivery {
  productionId: string | null;
  /** The item's place in its set (0093); null for a single save. */
  position?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A pack an agent shares for review: its words and the `noacg-pack` file, with no cues. */
export interface NewCommunityPack {
  name: string;
  description: string;
  /** The name the pack is shown under, chosen by the user (spec D15). */
  author: string;
  pack: unknown;
}

/** The database has no set function yet (0093 not applied): the set door answers as absent. */
export class SetDoorUnavailable extends Error {}

/** The submit gate said no: the sentence is the database's own, written for the maker. */
export class CommunityPackRefusal extends Error {}

/** A graphics package waiting on the user's Productions page for Install. */
export interface NewWaitingPackage {
  name: string;
  description: string;
  graphicCount: number;
  /** Provenance, never proof - the tool that uploaded it: `noacg-cli` with its version, or
   *  `noacg-connector` with the chat client's OAuth client id and the grant it came through
   *  (docs/REMOTE_MCP_PLAN.md key decision 8). */
  origin: { tool: string; version?: string; client?: string; grant?: string };
  /** The pack file itself (`noacg-pack` v1), already narrowed by packageSaveShape. */
  body: unknown;
}

// ── configuration ─────────────────────────────────────────────────────────────────────────

function serviceUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
}

function serviceKey(): string {
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

/** True when this deployment can mint and honour agent keys at all. An offline or self-hosted
 *  instance with no Supabase configuration has no library to save into, and the routes answer
 *  with an honest "no account backend here" rather than a half-working flow. */
export function agentAccessConfigured(): boolean {
  return Boolean(serviceUrl() && serviceKey());
}

// ── the Supabase implementation ───────────────────────────────────────────────────────────

let cached: SupabaseClient | null = null;

/** The server's one service-role client (also the connector grant store's). */
export async function serviceRoleDb(): Promise<SupabaseClient> {
  if (cached) return cached;
  const url = serviceUrl();
  const key = serviceKey();
  if (!url || !key) throw new Error('agent access: SUPABASE_URL + SUPABASE_SECRET_KEY required');
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Test seam: drop the memoized client so a test can change the environment. */
export function resetAgentAccessDb(): void {
  cached = null;
}

interface KeyRowDb {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function toKeyRow(row: KeyRowDb): AgentKeyRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name ?? '',
    prefix: row.prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

const KEY_COLUMNS = 'id, user_id, name, prefix, scopes, created_at, last_used_at, revoked_at';

interface DeliveryRowDb {
  operation_id: string;
  user_id: string;
  key_id: string | null;
  kind: DeliveryKind;
  resource_id: string;
  state: RecordedDeliveryState;
  production_id: string | null;
  position?: number | null;
  created_at: string;
  updated_at: string;
}

// Every column, not a list: `position` arrived in 0093, and a readback that named it would fail on
// a database the migration has not reached yet.
const DELIVERY_COLUMNS = '*';

/** A set's rows share one timestamp (one transaction); their `position` orders them. */
function byDeliveryOrder(a: DeliveryRow, b: DeliveryRow): number {
  return a.createdAt.localeCompare(b.createdAt) || (a.position ?? 0) - (b.position ?? 0);
}

function toDeliveryRow(row: DeliveryRowDb): DeliveryRow {
  return {
    operationId: row.operation_id,
    userId: row.user_id,
    keyId: row.key_id,
    kind: row.kind,
    resourceId: row.resource_id,
    state: row.state,
    productionId: row.production_id,
    position: row.position ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function supabaseAgentAccessStore(): AgentAccessStore {
  return {
    async createCode(row) {
      const { error } = await (await serviceRoleDb()).from('agent_auth_codes').insert({
        code_hash: row.codeHash,
        user_id: row.userId,
        name: row.name,
        scopes: row.scopes,
        challenge: row.challenge,
        expires_at: row.expiresAt,
      });
      if (error) throw new Error(error.message);
    },
    async consumeCode(codeHash) {
      const { data, error } = await (await serviceRoleDb()).rpc('agent_code_consume', { p_code_hash: codeHash });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { user_id: string; name: string; scopes: string[] | null; challenge: string }
        | undefined;
      if (!row) return null;
      return { userId: row.user_id, name: row.name ?? '', scopes: row.scopes ?? [], challenge: row.challenge };
    },
    async purgeExpiredCodes(before) {
      // Best effort: hygiene must never fail a begin.
      try {
        await (await serviceRoleDb()).from('agent_auth_codes').delete().lt('expires_at', before);
      } catch {
        /* ignore */
      }
    },
    async createKey(row) {
      const { data, error } = await (await serviceRoleDb())
        .from('agent_keys')
        .insert({ user_id: row.userId, name: row.name, key_hash: row.keyHash, prefix: row.prefix, scopes: row.scopes })
        .select(KEY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toKeyRow(data as KeyRowDb);
    },
    async resolveKey(keyHash) {
      const { data, error } = await (await serviceRoleDb()).rpc('agent_key_resolve', { p_key_hash: keyHash });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; user_id: string; scopes: string[] | null } | undefined;
      if (!row) return null;
      return { id: row.id, userId: row.user_id, scopes: row.scopes ?? [] };
    },
    async keyById(id) {
      const { data, error } = await (await serviceRoleDb()).from('agent_keys').select(KEY_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toKeyRow(data as KeyRowDb) : null;
    },
    async listKeys(userId) {
      const { data, error } = await (await serviceRoleDb())
        .from('agent_keys')
        .select(KEY_COLUMNS)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as KeyRowDb[]).map(toKeyRow);
    },
    async revokeKey(userId, id) {
      const { data, error } = await (await serviceRoleDb())
        .from('agent_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select('id');
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    },
    async insertGraphic(userId, doc) {
      // INSERT, never upsert: a service-role upsert keyed on a client-chosen id could overwrite
      // another user's row, and the sync engine's LWW reads body.updatedAt - so the id is the
      // server's own (newGraphicDoc minted it) and a collision is an error, not a merge.
      const { error } = await (await serviceRoleDb()).from('documents').insert({
        id: doc.id,
        user_id: userId,
        kind: 'graphic',
        name: doc.name,
        body: doc,
        deleted: false,
      });
      if (error) throw new Error(error.message);
    },
    async countWaitingPackages(userId) {
      const { count, error } = await (await serviceRoleDb())
        .from('agent_packages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async submitCommunityPack(userId, row) {
      const { data, error } = await (await serviceRoleDb()).rpc('community_pack_submit_for', {
        p_uid: userId,
        p_name: row.name,
        p_description: row.description,
        p_author: row.author,
        p_pack: row.pack,
      });
      // P0001 is a `raise exception` inside the gate: a refusal meant for the maker, not a fault.
      if (error) throw error.code === 'P0001' ? new CommunityPackRefusal(error.message) : new Error(error.message);
      return String(data);
    },
    async accountOf(userId) {
      const { data, error } = await (await serviceRoleDb()).auth.admin.getUserById(userId);
      if (error) throw new Error(error.message);
      return { id: userId, email: data.user?.email ?? null };
    },
    async recordDelivery(row) {
      const { error } = await (await serviceRoleDb()).from('agent_deliveries').insert({
        operation_id: row.operationId,
        user_id: row.userId,
        key_id: row.keyId,
        kind: row.kind,
        resource_id: row.resourceId,
        state: row.state,
      });
      if (error) throw new Error(error.message);
    },
    async findDeliveries(userId, id, keyId) {
      // `id` is a uuid by the time it gets here (deliveries.ts refuses anything else), so it cannot
      // carry PostgREST filter syntax into the `or`.
      let query = (await serviceRoleDb())
        .from('agent_deliveries')
        .select(DELIVERY_COLUMNS)
        .eq('user_id', userId)
        .or(`operation_id.eq.${id},resource_id.eq.${id},production_id.eq.${id}`);
      if (keyId !== null) query = query.eq('key_id', keyId);
      const { data, error } = await query.order('created_at', { ascending: true }).limit(100);
      if (error) throw new Error(error.message);
      return ((data ?? []) as DeliveryRowDb[]).map(toDeliveryRow).sort(byDeliveryOrder);
    },
    async resourcePresent(userId, kind, id) {
      const db = await serviceRoleDb();
      const { data, error } =
        kind === 'package'
          ? await db.from('agent_packages').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
          : await db.from('documents').select('id').eq('id', id).eq('user_id', userId).eq('kind', kind === 'graphic' ? 'graphic' : 'show').eq('deleted', false).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async productionDeleted(userId, productionId) {
      const { data, error } = await (await serviceRoleDb())
        .from('documents')
        .select('id')
        .eq('id', productionId)
        .eq('user_id', userId)
        .eq('kind', 'show')
        .eq('deleted', true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async settlePackage(userId, packageId, productionId) {
      const { data, error } = await (await serviceRoleDb()).rpc('agent_package_settle', {
        p_user_id: userId,
        p_package_id: packageId,
        p_production_id: productionId,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async deliverGraphicSet(set) {
      // One RPC is one transaction: the claim, the records, the production and the receipts commit
      // together. A library-only set keeps the function it always had (0093).
      const args = {
        p_user_id: set.userId,
        p_key_id: set.keyId,
        p_operation_id: set.operationId,
        p_payload_hash: set.payloadHash,
        p_graphics: set.docs.map((doc) => ({ id: doc.id, name: doc.name, body: doc })),
      };
      const fn = set.production ? 'agent_deliver_production' : 'agent_deliver_graphics';
      const { data, error } = await (await serviceRoleDb()).rpc(fn, set.production ? { ...args, p_production: set.production } : args);
      // PGRST202: no such function - a database 0093 (or, for a production, 0094) has not reached
      // yet. Nothing was written.
      if (error) throw error.code === 'PGRST202' ? new SetDoorUnavailable(error.message) : new Error(error.message);
      const answer = (data ?? {}) as { outcome?: string; ids?: unknown; production?: unknown };
      if (answer.outcome !== 'created' && answer.outcome !== 'replayed' && answer.outcome !== 'conflict') {
        throw new Error(`${fn} answered ${JSON.stringify(data)}`);
      }
      return {
        outcome: answer.outcome,
        ids: Array.isArray(answer.ids) ? answer.ids.map(String) : [],
        ...(set.production ? { productionId: typeof answer.production === 'string' ? answer.production : null } : {}),
      };
    },
    async insertPackage(userId, row) {
      // INSERT, never upsert, and the id is the database's own - the same rule as insertGraphic.
      const { data, error } = await (await serviceRoleDb())
        .from('agent_packages')
        .insert({
          user_id: userId,
          name: row.name,
          description: row.description,
          graphic_count: row.graphicCount,
          origin: row.origin,
          body: row.body,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return (data as { id: string }).id;
    },
  };
}

// ── an in-memory implementation (the test seam) ───────────────────────────────────────────

export interface MemoryAgentAccessStore extends AgentAccessStore {
  codes: Array<NewAuthCode & { usedAt: string | null }>;
  keys: AgentKeyRow[];
  keyHashes: Map<string, string>;
  graphics: Array<{ userId: string; doc: GraphicDocBase }>;
  packages: Array<NewWaitingPackage & { id: string; userId: string }>;
  communityPacks: Array<NewCommunityPack & { id: string; userId: string }>;
  deliveries: DeliveryRow[];
  /** The sign-in email per user id; an unlisted user has none. */
  emails: Map<string, string>;
  /** Library records the user deleted since (`documents.deleted`). */
  deletedGraphics: Set<string>;
  /** Productions the user deleted since (a `show` tombstone). */
  deletedProductions: Set<string>;
  /** When set, every delivery record fails, as a missing table would. */
  failDeliveries: boolean;
  /** The set claims (0093 `agent_operations`), by `${userId}:${operationId}`. */
  operations: Map<string, { keyId: string | null; payloadHash: string }>;
  /** Failure injection: a set fails on its record at this index (0-based), as a failing INSERT
   *  would, and - like the one transaction it stands for - leaves nothing behind. */
  failSetAt: number | null;
  /** When set, the database has no set function yet (0093 not applied). */
  noSetFunction: boolean;
  /** Productions a set delivered (0094), as their `show` documents. */
  productions: Array<{ userId: string; id: string; name: string; body: DeliveredShow }>;
  /** When set, the database has no production function yet (0094 not applied). */
  noProductionFunction: boolean;
  /** When set, the next community submit is refused with this sentence, as the gate would. */
  refuseCommunityPack: string | null;
  /** The clock the store compares expiries against - a test advances it. */
  now: () => string;
}

/** The same contract over arrays, for unit tests. Its `now` is injectable so an expiry can be
 *  walked past without sleeping. */
export function memoryAgentAccessStore(now: () => string = () => new Date().toISOString()): MemoryAgentAccessStore {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
  const store: MemoryAgentAccessStore = {
    codes: [],
    keys: [],
    keyHashes: new Map(),
    graphics: [],
    packages: [],
    communityPacks: [],
    deliveries: [],
    emails: new Map(),
    deletedGraphics: new Set(),
    deletedProductions: new Set(),
    failDeliveries: false,
    operations: new Map(),
    failSetAt: null,
    noSetFunction: false,
    productions: [],
    noProductionFunction: false,
    refuseCommunityPack: null,
    now,
    async createCode(row) {
      store.codes.push({ ...row, usedAt: null });
    },
    async consumeCode(codeHash) {
      const row = store.codes.find((c) => c.codeHash === codeHash);
      if (!row || row.usedAt !== null || Date.parse(row.expiresAt) <= Date.parse(store.now())) return null;
      row.usedAt = store.now();
      return { userId: row.userId, name: row.name, scopes: row.scopes, challenge: row.challenge };
    },
    async purgeExpiredCodes(before) {
      store.codes = store.codes.filter((c) => Date.parse(c.expiresAt) >= Date.parse(before));
    },
    async createKey(row) {
      const key: AgentKeyRow = {
        id: nextId(),
        userId: row.userId,
        name: row.name,
        prefix: row.prefix,
        scopes: [...row.scopes],
        createdAt: store.now(),
        lastUsedAt: null,
        revokedAt: null,
      };
      store.keys.push(key);
      store.keyHashes.set(row.keyHash, key.id);
      return key;
    },
    async resolveKey(keyHash) {
      const id = store.keyHashes.get(keyHash);
      const key = id ? store.keys.find((k) => k.id === id) : undefined;
      if (!key || key.revokedAt) return null;
      key.lastUsedAt = store.now();
      return { id: key.id, userId: key.userId, scopes: key.scopes };
    },
    async keyById(id) {
      return store.keys.find((k) => k.id === id) ?? null;
    },
    async listKeys(userId) {
      return store.keys.filter((k) => k.userId === userId && !k.revokedAt).slice().reverse();
    },
    async revokeKey(userId, id) {
      const key = store.keys.find((k) => k.id === id && k.userId === userId && !k.revokedAt);
      if (!key) return false;
      key.revokedAt = store.now();
      return true;
    },
    async insertGraphic(userId, doc) {
      if (store.graphics.some((g) => g.doc.id === doc.id)) throw new Error('duplicate key value violates unique constraint');
      store.graphics.push({ userId, doc });
    },
    async countWaitingPackages(userId) {
      return store.packages.filter((p) => p.userId === userId).length;
    },
    async insertPackage(userId, row) {
      const id = nextId();
      store.packages.push({ ...row, id, userId });
      return id;
    },
    async accountOf(userId) {
      return { id: userId, email: store.emails.get(userId) ?? null };
    },
    async recordDelivery(row) {
      if (store.failDeliveries) throw new Error('relation "public.agent_deliveries" does not exist');
      store.deliveries.push({ ...row, productionId: null, createdAt: store.now(), updatedAt: store.now() });
    },
    async findDeliveries(userId, id, keyId) {
      return store.deliveries
        .filter((d) => d.userId === userId && (d.operationId === id || d.resourceId === id || d.productionId === id) && (keyId === null || d.keyId === keyId))
        .sort(byDeliveryOrder);
    },
    async resourcePresent(userId, kind, id) {
      if (kind === 'production') return store.productions.some((p) => p.userId === userId && p.id === id && !store.deletedProductions.has(id));
      return kind === 'graphic'
        ? store.graphics.some((g) => g.userId === userId && g.doc.id === id && !store.deletedGraphics.has(id))
        : store.packages.some((p) => p.userId === userId && p.id === id);
    },
    async productionDeleted(_userId, productionId) {
      return store.deletedProductions.has(productionId);
    },
    async settlePackage(userId, packageId, productionId) {
      const at = store.packages.findIndex((p) => p.id === packageId && p.userId === userId);
      if (at < 0) return false;
      store.packages.splice(at, 1);
      const state = productionId ? 'installed' : 'dismissed';
      const known = store.deliveries.find((d) => d.kind === 'package' && d.resourceId === packageId && d.userId === userId);
      if (known) Object.assign(known, { state, productionId, updatedAt: store.now() });
      else {
        store.deliveries.push({
          operationId: nextId(), userId, keyId: null, kind: 'package', resourceId: packageId, state, productionId,
          createdAt: store.now(), updatedAt: store.now(),
        });
      }
      return true;
    },
    async deliverGraphicSet(set) {
      if (store.noSetFunction) throw new SetDoorUnavailable('Could not find the function public.agent_deliver_graphics');
      if (set.production && store.noProductionFunction) throw new SetDoorUnavailable('Could not find the function public.agent_deliver_production');
      const madeFor = (rows: DeliveryRow[]): string | null => rows.find((d) => d.productionId)?.productionId ?? null;
      const claim = `${set.userId}:${set.operationId}`;
      const known = store.operations.get(claim);
      const ownRows = (): DeliveryRow[] =>
        store.deliveries
          .filter((d) => d.userId === set.userId && d.operationId === set.operationId && d.kind === 'graphic' && d.position != null)
          .sort(byDeliveryOrder);
      // An operation id a single save already used is not this set's (0093 says the same).
      if (!known && store.deliveries.some((d) => d.userId === set.userId && d.operationId === set.operationId)) return { outcome: 'conflict', ids: [] };
      if (known) {
        if (known.payloadHash !== set.payloadHash || known.keyId !== set.keyId) return { outcome: 'conflict', ids: [] };
        const rows = ownRows();
        // The same hash names the same request, so a production delivery's replay has its production.
        if (set.production && !madeFor(rows)) return { outcome: 'conflict', ids: [] };
        return { outcome: 'replayed', ids: rows.map((d) => d.resourceId), ...(set.production ? { productionId: madeFor(rows) } : {}) };
      }
      // Stage everything, then commit at once: a failure part way leaves the store untouched.
      const graphics: MemoryAgentAccessStore['graphics'] = [];
      const rows: DeliveryRow[] = [];
      set.docs.forEach((doc, position) => {
        if (store.failSetAt === position) throw new Error('injected: the insert of this record failed');
        if ([...store.graphics, ...graphics].some((g) => g.doc.id === doc.id)) throw new Error('duplicate key value violates unique constraint');
        graphics.push({ userId: set.userId, doc });
        rows.push({
          operationId: set.operationId, userId: set.userId, keyId: set.keyId, kind: 'graphic', resourceId: doc.id, state: 'saved',
          productionId: set.production?.id ?? null, position, createdAt: store.now(), updatedAt: store.now(),
        });
      });
      // The production's insert comes after the records', and fails the same way: nothing stays.
      if (set.production && store.failSetAt === set.docs.length) throw new Error('injected: the insert of the production failed');
      store.operations.set(claim, { keyId: set.keyId, payloadHash: set.payloadHash });
      store.graphics.push(...graphics);
      store.deliveries.push(...rows);
      if (set.production) store.productions.push({ userId: set.userId, ...set.production });
      return { outcome: 'created', ids: set.docs.map((d) => d.id), ...(set.production ? { productionId: set.production.id } : {}) };
    },
    async submitCommunityPack(userId, row) {
      if (store.refuseCommunityPack) throw new CommunityPackRefusal(store.refuseCommunityPack);
      const id = nextId();
      store.communityPacks.push({ ...row, id, userId });
      return id;
    },
  };
  return store;
}
