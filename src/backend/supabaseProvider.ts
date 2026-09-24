// The cloud StorageProvider (Era 5.2): the `documents` table behind per-user RLS. Implements the
// same StorageProvider contract as LocalStorageProvider, so the sync engine treats both uniformly.
//
// Identity: packets/looks use their client-generated UUID as the row id — the SAME id locally and in
// the cloud, which is what lets the sync engine reconcile by id. user_id defaults to auth.uid() on
// insert; RLS restricts every row to its owner, so one user can never read or write another's rows.
//
// Assets (Era 5.2b): embedded fonts/images are externalized to the `user-assets` Storage bucket on
// put() and restored on get(), so cloud rows stay small (see assets.ts). list() intentionally does
// NOT rehydrate — it returns cheap sentinel bodies, because the sync engine only needs each record's
// timestamp to reconcile; the full asset bytes are fetched via get() only for records actually pulled.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { isSingleton, markPutDenied, toStoredRecord, type StorageProvider, type StoredRecord, type SyncKind } from './storage';
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
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error('Not signed in.');
    return data.user.id;
  }

  async list(kind: SyncKind): Promise<StoredRecord[]> {
    const sb = await this.client();
    // RLS scopes this to the signed-in user's rows. Tombstones (deleted=true) are included so the
    // sync engine can propagate remote deletes. Bodies keep their Storage sentinels here (cheap).
    const { data, error } = await sb.from(TABLE).select('id, kind, name, body, deleted').eq('kind', kind);
    if (error) throw new Error(`Cloud list(${kind}) failed: ${error.message}`);
    const rows = (data ?? []) as DocumentRow[];
    return rows.map((row) => toStoredRecord(kind, row.id, row.body));
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
    const body = await rehydrateAssets(row.body, (key) => this.download(sb, key));
    return toStoredRecord(kind, row.id, body);
  }

  async put(record: StoredRecord): Promise<void> {
    const sb = await this.client();
    const uid = await this.uid(sb);
    if (this.options.onlyInto && this.options.onlyInto() !== uid) {
      throw new Error(`Cloud put(${record.kind}) refused: the signed-in account is not the one whose library is open.`);
    }
    // Move embedded fonts/images to Storage; the row's body keeps only small references.
    const body = await externalizeAssets(record.body, uid, (key, dataUrl) => this.upload(sb, key, dataUrl));
    warnIfLarge(record.kind, record.id, body);

    const srcName = (record.body as { name?: unknown }).name;
    // Singletons (brand, project) use a per-user deterministic id so there is exactly one row per
    // user per kind; packets/looks keep their own uuid. user_id is omitted: it defaults to
    // auth.uid() on insert, and RLS blocks updating another user's row. onConflict:'id' upserts.
    const rowId = isSingleton(record.kind) ? deterministicUuid(`${uid}:${record.kind}`) : record.id;
    const row = {
      id: rowId,
      kind: record.kind,
      name: typeof srcName === 'string' ? srcName : '',
      body,
      deleted: Boolean(record.deleted),
    };
    const { error } = await sb.from(TABLE).upsert(row, { onConflict: 'id' });
    if (error) {
      const err = new Error(`Cloud put(${record.kind}) failed: ${error.message}`);
      // 42501 = insufficient_privilege: RLS rejected the write — the row id is owned by another
      // account. Marked so the sync engine resolves it permanently instead of retrying forever.
      if (error.code === '42501' || /row-level security/i.test(error.message)) markPutDenied(err);
      throw err;
    }
  }

  /**
   * Coordinated tombstone purge: hard-delete this user's tombstone rows whose server write time is
   * older than `beforeIso`. Called after a sync so old deletes are dropped from BOTH sides (a
   * local-only purge would just be re-pulled). Uses the server updated_at column for the cutoff.
   */
  async purgeTombstones(beforeIso: string): Promise<number> {
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
    const { error } = await sb.from(TABLE).delete().eq('kind', kind).eq('id', id);
    if (error) throw new Error(`Cloud remove(${kind}) failed: ${error.message}`);
  }

  private async upload(sb: SupabaseClient, key: string, dataUrl: string): Promise<void> {
    if (this.uploaded.has(key)) return; // already uploaded this session (content-hash dedupe)
    // A file the cloud has already refused for its SIZE is refused for the same reason every pass,
    // and the key is a content hash - so the same bytes are never sent up the wire twice.
    const known = this.refused.get(key);
    if (known) throw new Error(`${known} - it stays on this device`);
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
    if (error || !data) return null;
    return blobToDataUrl(data);
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
