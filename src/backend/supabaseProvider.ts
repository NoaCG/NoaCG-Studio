// The cloud StorageProvider (Era 5.2): the `documents` table behind per-user RLS. Implements the
// same StorageProvider contract as LocalStorageProvider, so the sync engine treats both uniformly.
//
// Identity: packets/looks use their client-generated UUID as the row id — the SAME id locally and in
// the cloud, which is what lets the sync engine reconcile by id. user_id defaults to auth.uid() on
// insert; RLS restricts every row to its owner, so one user can never read or write another's rows.
//
// Assets (Era 5.2b): embedded fonts/images are externalized to the `user-assets` Storage bucket on
// put() and restored on get(), so cloud rows stay small (see assets.ts).
//
// list() returns SUMMARIES, not bodies. Reconciling reads each record's timestamp and nothing else,
// and every pass lists every kind, so a list that carried bodies downloaded the whole library each
// time: 19 MB of graphics and 9 MB of productions for one account on 2026-09-29, 4 to 18 seconds of
// database time per graphic list, a pass scheduled 2.5 s after every edit in every open tab. Those
// lists were timing out when the production database stopped answering and restarted (06:39-06:45
// UTC), and every Take sent in that window failed. The same summary query takes 45 ms and 23 KB
// against 666 ms and 19 MB for the bodies. getMany() fetches whole rows for what a pass pulls.
// Reading that one field from `body` still made Postgres open the stored document, so the summary
// reads `body_updated_at`, the copy a trigger keeps (migration 0107).

import type { SupabaseClient } from '@supabase/supabase-js';
import { NOT_ANSWERED, getSupabase, isNotAnswered } from './supabase';
import { bodyUpdatedAt, isSingleton, markPutDenied, toStoredRecord, type StorageProvider, type StoredRecord, type SyncKind } from './storage';
import { diff, storedMap, type PatchOp, type UnitMap } from './unitPatch';
import { noteWritten, partialWritesOn, unitPace } from './partialWrites';
import { externalizeAssets, rehydrateAssets, dataUrlToBlob, blobToDataUrl, classifyAssetRefusal } from './assets';
import { deterministicUuid } from '../model/id';

const TABLE = 'documents';
const BUCKET = 'user-assets';
const BODY_WARN_BYTES = 500_000; // after externalization a body should be small; warn if not

interface DocumentRow {
  id: string;
  kind: SyncKind;
  name: string;
  body: unknown;
  deleted: boolean;
}

/** A row as list() reads it: a copy of the body's own `updatedAt`, so the summary's version is
 *  derived by the same rule as a whole record's (`bodyUpdatedAt`), and never the server's write time. */
interface SummaryRow {
  id: string;
  deleted: boolean;
  updatedAt: unknown;
}

export interface SupabaseProviderOptions {
  /**
   * The account a write may land in, asked at the moment of each write. The sync engine passes
   * the account whose library the page loaded, so a pass that outlives a change of session -
   * another tab signing a different account in mid-pass - is refused instead of pushing one
   * account's documents into the other's cloud. Omitted, any signed-in account is accepted
   * (the deliberate upload of signed-out work, backend/accountLibrary.ts).
   */
  onlyInto?: () => string | null;
}

const recordBases = new Map<string, { rev: number; map: UnitMap }>();

/** The incremental listing's full re-read and its overlap (see `list`). */
const LISTING_FULL_EVERY_MS = 10 * 60_000;
const LISTING_OVERLAP_MS = 60_000;

/** Read a production record's stored map when its page opens (G4 section 1), so its first save is a
 *  patch without a read inside the edit. A map that is not for the row's revision is no base. */
export async function prefetchRecordBase(id: string): Promise<void> {
  if (recordBases.has(id) || !(await partialWritesOn())) return;
  const sb = await getSupabase();
  if (!sb) return;
  const base = await readRecordBase(sb, id);
  if (base && !recordBases.has(id)) recordBases.set(id, base);
}

/** A production record's stored map and revision, when the map describes that revision. */
async function readRecordBase(sb: SupabaseClient, id: string): Promise<{ rev: number; map: UnitMap } | null> {
  const { data, error } = await sb.from(TABLE).select('rev, body_units').eq('id', id).eq('kind', 'show').maybeSingle();
  if (error || !data) return null;
  const row = data as { rev?: unknown; body_units?: { rev?: unknown } | null };
  const map = storedMap(row.body_units);
  return map && typeof row.rev === 'number' && row.body_units?.rev === row.rev ? { rev: row.rev, map } : null;
}

export class SupabaseProvider implements StorageProvider {
  constructor(private readonly options: SupabaseProviderOptions = {}) {}

  /** Per-instance dedupe so the same asset (same hash → same key) uploads at most once a session. */
  private uploaded = new Set<string>();

  /** Keys Storage refused permanently (too large), with the reason - never re-sent this session. */
  private refused = new Map<string, string>();

  private async client(): Promise<SupabaseClient> {
    const sb = await getSupabase();
    if (!sb) throw new Error('Supabase is not configured.');
    return sb;
  }

  private async uid(sb: SupabaseClient): Promise<string> {
    // With parts on, the account is read from the session this tab holds, the token every write
    // carries and the row policy checks, rather than asked of the server before each save.
    if (await partialWritesOn()) {
      const held = (await sb.auth.getSession()).data.session?.user?.id;
      if (held) return held;
    }
    const { data, error } = await sb.auth.getUser();
    // A request that failed says nothing about the session. Saying "Not signed in" for it would
    // send somebody with a live session to sign in again.
    if (!data.user) throw new Error(error?.name === 'AuthRetryableFetchError' ? NOT_ANSWERED : 'Not signed in.');
    return data.user.id;
  }

  stoppedAnswering(error: unknown): boolean {
    return isNotAnswered(error);
  }

  /** One listing of every kind, shared by the lists of one sync pass while it is in flight
   *  (live-publishing G4 section 11: a pass listed each kind in its own request). With parts on it
   *  is also incremental: after a full listing, a pass reads only the rows the server changed since
   *  (`updated_at`, set by the server on every write, with a minute's overlap for a write that
   *  committed late), and merges them into the rows it holds. A full listing again every ten
   *  minutes, and after a purge, drops a row deleted outright and any row written with an old
   *  `updated_at`. */
  private listing: Promise<(SummaryRow & { kind: SyncKind })[] | null> | null = null;
  private known: { rows: Map<string, SummaryRow & { kind: SyncKind }>; since: string | null; fullAt: number; uid: string } | null = null;

  private async listAll(sb: SupabaseClient): Promise<(SummaryRow & { kind: SyncKind })[] | null> {
    type Row = SummaryRow & { kind: SyncKind; at?: string };
    const uid = await this.uid(sb);
    const held = this.known && this.known.uid === uid && Date.now() - this.known.fullAt < LISTING_FULL_EVERY_MS ? this.known : null;
    const from = held?.since ? new Date(Date.parse(held.since) - LISTING_OVERLAP_MS).toISOString() : null;
    let query = sb.from(TABLE).select('id, kind, deleted, updatedAt:body_updated_at, at:updated_at');
    if (held && from) query = query.gte('updated_at', from);
    const { data, error } = await query;
    if (error) return null;
    const rows = held ? held.rows : new Map<string, Row>();
    let since = held?.since ?? null;
    for (const row of (data ?? []) as unknown as Row[]) {
      const { at, ...summary } = row;
      rows.set(summary.id, summary);
      if (typeof at === 'string' && (since === null || Date.parse(at) > Date.parse(since))) since = at;
    }
    this.known = { rows, since, fullAt: held ? held.fullAt : Date.now(), uid };
    return [...rows.values()];
  }

  async list(kind: SyncKind): Promise<StoredRecord[]> {
    const sb = await this.client();
    if (await partialWritesOn()) {
      if (!this.listing) {
        const rows = this.listAll(sb).finally(() => {
          // The lists of this pass have all asked by now (they start together): the next pass reads.
          if (this.listing === rows) this.listing = null;
        });
        this.listing = rows;
      }
      const all = await this.listing;
      if (all) {
        return all
          .filter((row) => row.kind === kind)
          .map((row) => ({ ...toStoredRecord(kind, row.id, { updatedAt: row.updatedAt, deleted: row.deleted }), summary: true as const }));
      }
      this.listing = null;
      this.known = null;
    }
    // RLS scopes this to the signed-in user's rows. Tombstones (deleted=true) are included so the
    // sync engine can propagate remote deletes.
    const summaries = (version: string) => sb.from(TABLE).select(`id, deleted, updatedAt:${version}`).eq('kind', kind);
    const first = await summaries('body_updated_at');
    // An instance that has not run 0107 has no such column, and reads the same value from the body.
    const { data, error } = first.error?.code === '42703' ? await summaries('body->updatedAt') : first;
    if (error) throw new Error(`Cloud list(${kind}) failed: ${error.message}`);
    const rows = (data ?? []) as unknown as SummaryRow[];
    return rows.map((row) => ({
      ...toStoredRecord(kind, row.id, { updatedAt: row.updatedAt, deleted: row.deleted }),
      summary: true as const,
    }));
  }

  async getMany(kind: SyncKind, ids: string[]): Promise<StoredRecord[]> {
    const sb = await this.client();
    const { data, error } = await sb.from(TABLE).select('id, kind, name, body, deleted').eq('kind', kind).in('id', ids);
    if (error) throw new Error(`Cloud get(${kind}) failed: ${error.message}`);
    // Not rehydrated: the engine restores a record's assets through get() as it applies it, one
    // record at a time, so a large pull never holds every asset at once.
    return ((data ?? []) as DocumentRow[]).map((row) => toStoredRecord(kind, row.id, row.body));
  }

  async get(kind: SyncKind, id: string): Promise<StoredRecord | null> {
    const sb = await this.client();
    const { data, error } = await sb
      .from(TABLE)
      .select('id, kind, name, body, deleted')
      .eq('kind', kind)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Cloud get(${kind}) failed: ${error.message}`);
    const row = data as DocumentRow | null;
    if (!row) return null;
    const body = await rehydrateAssets(row.body, (key) => this.download(sb, key), isNotAnswered);
    return toStoredRecord(kind, row.id, body);
  }

  /** Per production record: the unit map and revision of the body last written or read as stored
   *  (live-publishing G4 section 1), the base the next patch is built against. Shared by every
   *  provider of this page, so a base read when the production opened serves its first save. */
  private bases = recordBases;

  async put(record: StoredRecord): Promise<void> {
    const sb = await this.client();
    const uid = await this.uid(sb);
    if (this.options.onlyInto && this.options.onlyInto() !== uid) {
      throw new Error(`Cloud put(${record.kind}) refused: the signed-in account is not the one whose library is open.`);
    }
    // ONLY WHAT CHANGED (live-publishing G4 section 2): a live production record goes up as a patch
    // of the units that changed, against the revision its base describes. No base, or a base the
    // server no longer holds, and it goes up whole below, as before.
    const inParts = record.kind === 'show' && !record.deleted && (await partialWritesOn());
    let map: UnitMap | null = null;
    if (inParts) {
      const base = this.bases.get(record.id) ?? (await readRecordBase(sb, record.id));
      const built = await diff(base?.map ?? null, record.body as Record<string, unknown>, unitPace);
      map = built.map;
      if (base) {
        if (await this.patch(sb, uid, record, base.rev, built.ops, built.map)) return;
        this.bases.delete(record.id);
      }
    }
    // Move embedded fonts/images to Storage; the row's body keeps only small references.
    const body = await externalizeAssets(record.body, uid, (key, dataUrl) => this.upload(sb, key, dataUrl), false, inParts);
    warnIfLarge(record.kind, record.id, body);

    const srcName = (record.body as { name?: unknown }).name;
    // Singletons (brand, project) use a per-user deterministic id so there is exactly one row per
    // user per kind; packets/looks keep their own uuid. Pin user_id before awaiting uploads so
    // RLS rejects a session switch during this write. onConflict:'id' upserts.
    const rowId = isSingleton(record.kind) ? deterministicUuid(`${uid}:${record.kind}`) : record.id;
    const row = {
      id: rowId,
      user_id: uid,
      kind: record.kind,
      name: typeof srcName === 'string' ? srcName : '',
      body,
      deleted: Boolean(record.deleted),
    };
    // With parts on (0107, 0117 and 0119 are there), the answer confirms the stored version by its
    // `updatedAt` copy and says the revision stored, never sending the body back (G4 R6). Off, it is
    // read back as before this phase.
    const write = (columns: string) => sb.from(TABLE).upsert(row, { onConflict: 'id' }).select(columns).single();
    const { data: answered, error } = await write(inParts ? 'body_updated_at, rev' : 'body');
    const confirmed = !answered ? null : inParts ? (answered as { body_updated_at?: unknown; rev?: unknown }) : { body_updated_at: toStoredRecord(record.kind, record.id, (answered as { body?: unknown }).body).updatedAt };
    if (error) {
      const err = new Error(`Cloud put(${record.kind}) failed: ${error.message}`);
      // 42501 = insufficient_privilege: RLS rejected the write — the row id is owned by another
      // account. Marked so the sync engine resolves it permanently instead of retrying forever.
      if (error.code === '42501' || /row-level security/i.test(error.message)) markPutDenied(err);
      throw err;
    }
    const stored = confirmed as { body_updated_at?: unknown; rev?: unknown } | null;
    if (!stored || (inParts ? bodyUpdatedAt({ updatedAt: stored.body_updated_at }) : stored.body_updated_at) !== record.updatedAt) {
      throw new Error(`Cloud put(${record.kind}) did not confirm this revision. It remains pending on this device.`);
    }
    // The map of what was just stored, for this page's next patch and for other pages (a few kB,
    // sent only after a whole write).
    if (inParts && map && typeof stored.rev === 'number') {
      this.bases.set(record.id, { rev: stored.rev, map });
      noteWritten(record.id, stored.rev, record.updatedAt);
      void Promise.resolve(sb.rpc('documents_show_units_set', { p_id: record.id, p_rev: stored.rev, p_units: { m: map } })).catch(() => {});
    }
  }


  /** One patch save. True when it landed and confirmed this record; false when the base was
   *  replaced (the caller saves whole). A failure to reach the server throws, as a whole save's. */
  private async patch(sb: SupabaseClient, uid: string, record: StoredRecord, base: number, ops: PatchOp[], map: UnitMap): Promise<boolean> {
    // Only what goes up is externalized, so an unchanged graphic's images are not touched.
    const upload = (key: string, dataUrl: string) => this.upload(sb, key, dataUrl);
    const sent: PatchOp[] = [];
    for (const op of ops) {
      if ('set' in op) sent.push({ ...op, set: await externalizeAssets(op.set, uid, upload, false, true) });
      else if ('put' in op) {
        const put: { v: unknown; d: string }[] = [];
        for (const p of op.put) put.push({ v: await externalizeAssets(p.v, uid, upload, false, true), d: p.d });
        sent.push({ ...op, put });
      } else sent.push(op);
    }
    const { data, error } = await sb.rpc('documents_show_patch', { p_id: record.id, p_base: base, p_ops: sent });
    if (error) {
      const err = new Error(`Cloud put(${record.kind}) failed: ${error.message}`);
      if (error.code === '42501' || /row-level security/i.test(error.message)) markPutDenied(err);
      throw err;
    }
    const answer = (data ?? {}) as { replaced?: unknown; rev?: unknown; updated_at?: unknown; units?: unknown };
    if (answer.replaced === true || typeof answer.rev !== 'number') return false;
    if (bodyUpdatedAt({ updatedAt: answer.updated_at }) !== record.updatedAt) {
      throw new Error(`Cloud put(${record.kind}) did not confirm this revision. It remains pending on this device.`);
    }
    this.bases.set(record.id, { rev: answer.rev, map });
    noteWritten(record.id, answer.rev, record.updatedAt);
    // The server keeps the map from the patch when it held one for the base; otherwise it is sent
    // once, so another page can patch too.
    if (answer.units !== true) void Promise.resolve(sb.rpc('documents_show_units_set', { p_id: record.id, p_rev: answer.rev, p_units: { m: map } })).catch(() => {});
    return true;
  }

  /**
   * Coordinated tombstone purge: hard-delete this user's tombstone rows whose server write time is
   * older than `beforeIso`. Called after a sync so old deletes are dropped from BOTH sides (a
   * local-only purge would just be re-pulled). Uses the server updated_at column for the cutoff.
   */
  /** When this provider last purged: with parts on, at most hourly, as a pass follows every save. */
  private purgedAt = 0;

  async purgeTombstones(beforeIso: string): Promise<number> {
    if (await partialWritesOn()) {
      if (Date.now() - this.purgedAt < 3_600_000) return 0;
      this.purgedAt = Date.now();
      // A purged row leaves no trace an incremental listing can see: the next one reads in full.
      this.known = null;
    }
    const sb = await this.client();
    const { data, error } = await sb
      .from(TABLE)
      .delete()
      .eq('deleted', true)
      .lt('updated_at', beforeIso)
      .select('id');
    if (error) throw new Error(`Cloud purge failed: ${error.message}`);
    return data ? data.length : 0;
  }

  async remove(kind: SyncKind, id: string): Promise<void> {
    // Direct removal (not used by the sync engine, which propagates deletes as tombstone puts).
    const sb = await this.client();
    this.known = null; // a row gone outright: the next listing reads in full
    const { error } = await sb.from(TABLE).delete().eq('kind', kind).eq('id', id);
    if (error) throw new Error(`Cloud remove(${kind}) failed: ${error.message}`);
  }

  private async upload(sb: SupabaseClient, key: string, dataUrl: string): Promise<void> {
    if (this.uploaded.has(key)) return; // already uploaded this session (content-hash dedupe)
    // A file the cloud has already refused for its SIZE is refused for the same reason every pass,
    // and the key is a content hash - so the same bytes are never sent up the wire twice.
    const known = this.refused.get(key);
    if (known) throw new Error(`${known} - it stays on this device`);
    // EACH IMAGE ONCE (live-publishing G4 section 3, R7): the key names the content, so an object
    // Storage already holds is never sent again, whichever page load stored it.
    if (key.includes('/s256-')) {
      const held = await sb.storage.from(BUCKET).exists(key).catch(() => ({ data: false }));
      if (held.data === true) {
        this.uploaded.add(key);
        return;
      }
    }
    const blob = dataUrlToBlob(dataUrl);
    const { error } = await sb.storage.from(BUCKET).upload(key, blob, { contentType: blob.type, upsert: true });
    if (error) {
      const refusal = classifyAssetRefusal(error);
      if (refusal) {
        if (refusal.permanent) this.refused.set(key, refusal.reason);
        throw new Error(`${refusal.reason} - it stays on this device`);
      }
      throw new Error(`asset upload failed: ${error.message}`);
    }
    this.uploaded.add(key);
  }

  private async download(sb: SupabaseClient, key: string): Promise<string | null> {
    const { data, error } = await sb.storage.from(BUCKET).download(key);
    if (data) return blobToDataUrl(data);
    // Only an object that is really gone may read as blank (rehydrateAssets). A read that failed
    // fails the pull, or the blank would be saved here, read as Synced and pushed to every device.
    const { statusCode, message } = (error ?? {}) as { statusCode?: unknown; message?: unknown };
    if (String(statusCode) === '404' || /not found/i.test(String(message))) return null;
    throw new Error(`Cloud get(asset) failed: ${String(message ?? 'no answer')}`);
  }
}

function warnIfLarge(kind: string, id: string, body: unknown): void {
  try {
    const size = JSON.stringify(body).length;
    if (size > BODY_WARN_BYTES && typeof console !== 'undefined') {
      console.warn(`[sync] ${kind} ${id} body is ~${Math.round(size / 1024)}KB after externalization — unexpectedly large.`);
    }
  } catch {
    // Never block a sync on a size check.
  }
}
