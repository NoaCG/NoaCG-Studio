// The sync engine (Era 5.2). Local (localStorage) stays the live read/write path for the editor;
// the cloud is a background MIRROR. runSync() reconciles the two by comparing each record's
// client-controlled updatedAt (both providers derive it the same way, so a pushed record matches
// on both sides and never loops). reconcile() is a pure function — the whole merge policy in one
// testable place; runSync() is the thin impure orchestrator that applies the plan.
//
// Conflict policy: a record changed on BOTH sides since this device last synced is a true conflict
// (concurrent edits). Remote wins as canonical and the local edit is preserved as a
// "(conflicted copy)" — never a silent overwrite, because a user's graphics are irreplaceable.
// Otherwise it's plain last-write-wins by updatedAt. Deletes travel as tombstones (records with
// deleted=true) and win/lose by the same timestamp rule, so a delete propagates instead of the row
// resurrecting.
//
// Fault isolation: every record in the plan is applied independently — one failing put can never
// sink the pass, and the lastSyncedAt bookmark advances whenever the pass RAN TO COMPLETION. A
// frozen bookmark is worse than a failed record: it makes every later local edit look like a
// concurrent-edit conflict, and remote-wins then overwrites fresh work. What the bookmark can no
// longer vouch for is carried per record instead:
//   - pendingPush: keys whose push failed — their local edit never reached the cloud, so they
//     count as locally-changed regardless of the bookmark (a later remote edit is then a true
//     conflict, not a silent remote-wins overwrite).
//   - pendingConflict: keys whose "(conflicted copy)" could not be written — the overwriting pull
//     is skipped and the conflict branch is forced again next pass, until the copy materializes.
// Conflict copies are applied BEFORE the pulls that overwrite their originals, so a crash or
// failure mid-pass can never lose the only copy of a user's work.
//
// Denied puts: the cloud refuses a write it will never accept - the row id belongs to ANOTHER
// account (RLS), or this account may not write at all. Retrying cannot fix that, and neither may
// the engine "fix" it by re-minting the record under a fresh id: that is exactly how one
// account's graphics used to end up in another's cloud when a second person signed in on the
// same browser. Graphics are account-bound (model/accountScope.ts gives every account its own
// local library), so a denied record stays on this device, unshared, and is reported. A denied
// TOMBSTONE deletes nothing of ours in the cloud, so it is dropped silently (the 90-day purge
// removes it locally).

import { hasStorageSentinel } from './assets';
import { isPutDenied, isSingleton, type StorageProvider, type StoredRecord, type SyncKind } from './storage';
import { uuid } from '../model/id';
import { accountKey } from '../model/accountScope';

// 'packet' is retired (packages removed): the kind is gone from SyncKind, so those cloud rows
// are simply never fetched or pushed again - they stay inert, nothing is destroyed.
export const SYNC_KINDS: SyncKind[] = ['look', 'brand', 'project', 'show', 'video', 'graphic'];

/** Per account (model/accountScope.ts): each library carries its own bookmark and debts, so one
 *  account's history never shapes another's merges and survives the other signing in. */
const SYNC_META_KEY = 'spx-gfx-sync';
const EPOCH = '1970-01-01T00:00:00.000Z';

export interface SyncPlan {
  /** Local records to write to the cloud. */
  toRemote: StoredRecord[];
  /** Cloud records to write into the local store. */
  toLocal: StoredRecord[];
  /** Local records that lost a true conflict — duplicated as a "(conflicted copy)" by the orchestrator. */
  conflicts: StoredRecord[];
}

/** Per-record carry-over between passes — what the bookmark alone can no longer vouch for. */
export interface SyncPending {
  /** Record keys whose last push FAILED: treat as locally-changed regardless of the bookmark. */
  push?: Set<string>;
  /** Record keys whose "(conflicted copy)" is still owed: force the conflict branch again. */
  conflict?: Set<string>;
}

/** One record the pass could not apply. Surfaced in SyncStatus; retried next pass. */
export interface SyncFailure {
  kind: SyncKind;
  id: string;
  /** Human name from the record body (falls back to the id). */
  name: string;
  op: 'push' | 'pull' | 'conflict-copy';
  message: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  /** Per-record failures the pass survived. Empty on a clean pass. */
  failures: SyncFailure[];
}

// Looks/shows/graphics reconcile by id; singletons (brand, project) reconcile by KIND — there is at most
// one per user, and its id differs between local (a local uuid) and cloud (a per-user deterministic
// uuid), so matching by kind is what pairs them.
const recordKey = (r: StoredRecord) => (isSingleton(r.kind) ? r.kind : `${r.kind}:${r.id}`);

const recordName = (r: StoredRecord): string => {
  const n = (r.body as { name?: unknown } | null)?.name;
  return typeof n === 'string' && n ? n : r.id;
};

/**
 * Pure reconciliation. `since` is when this device last synced; a record whose BOTH sides changed
 * after it is a genuine concurrent-edit conflict. `pending` carries the per-record debts from
 * earlier passes (see SyncPending).
 */
export function reconcile(
  local: StoredRecord[],
  remote: StoredRecord[],
  since: string,
  pending?: SyncPending,
): SyncPlan {
  const plan: SyncPlan = { toRemote: [], toLocal: [], conflicts: [] };
  const L = new Map(local.map((r) => [recordKey(r), r]));
  const R = new Map(remote.map((r) => [recordKey(r), r]));

  // On the very first sync there is no baseline, so "changed since last sync" is meaningless —
  // EVERY real timestamp is after the epoch. Detecting conflicts then would flag every ordinary
  // divergence (e.g. an offline draft vs a newer cloud copy) as a concurrent edit and spawn a
  // spurious "(conflicted copy)". So on a first sync we use pure last-write-wins, no conflicts.
  const firstSync = since === EPOCH;

  for (const key of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(key);
    const r = R.get(key);
    if (l && !r) {
      plan.toRemote.push(l);
      continue;
    }
    if (r && !l) {
      plan.toLocal.push(r);
      continue;
    }
    if (!l || !r) continue;
    if (l.updatedAt === r.updatedAt) continue; // same version — already in sync

    // A record whose last push FAILED is locally-changed no matter what the bookmark says — its
    // edit never reached the cloud, so the bookmark can't vouch for it.
    const localChanged = l.updatedAt > since || pending?.push?.has(key) === true;
    const remoteChanged = r.updatedAt > since;
    // An owed "(conflicted copy)" forces the conflict branch again until the copy materializes.
    const owedCopy = pending?.conflict?.has(key) === true;

    // Singletons can't have a "(conflicted copy)" (there's only ever one), so they're always plain
    // last-write-wins — a concurrent edit just means the newer device wins.
    const bothChanged =
      !isSingleton(l.kind) && ((!firstSync && localChanged && remoteChanged) || owedCopy);
    if (bothChanged) {
      // True conflict: remote wins as canonical; keep the local edit as a copy (but never copy a
      // tombstone — a "conflicted copy" of a delete is meaningless, so the remote edit just wins).
      plan.toLocal.push(r);
      if (!l.deleted) plan.conflicts.push(l);
    } else if (l.updatedAt > r.updatedAt) {
      plan.toRemote.push(l);
    } else {
      plan.toLocal.push(r);
    }
  }
  return plan;
}

/** How many whole records one fetch asks for. Bodies average about 100 KB and reach 3 MB, so a
 *  batch stays a few megabytes, and a fresh device holding 160 graphics pays 8 requests, not 160. */
const FETCH_BATCH = 20;

/**
 * The pulls with every SUMMARY replaced by its whole record, fetched a batch at a time so a pass
 * never asks the database for everything at once. This is still READING the remote side, so a
 * failed fetch fails the pass exactly as a failed list() does and the bookmark stays put: a pull
 * that failed after the bookmark moved could lose a remote edit to a later local one by plain
 * last-write-wins. A summary the backend no longer holds has nothing to pull and is dropped.
 */
async function withWholeRecords(remote: StorageProvider, pulls: StoredRecord[]): Promise<StoredRecord[]> {
  const byKind = new Map<SyncKind, StoredRecord[]>();
  for (const r of pulls) {
    if (!r.summary) continue;
    const records = byKind.get(r.kind) ?? [];
    records.push(r);
    byKind.set(r.kind, records);
  }
  if (byKind.size === 0) return pulls;
  if (!remote.getMany) throw new Error('This storage lists summaries but cannot fetch whole records.');
  const whole = new Map<string, StoredRecord>();
  for (const [kind, records] of byKind) {
    for (let i = 0; i < records.length; i += FETCH_BATCH) {
      const ids = records.slice(i, i + FETCH_BATCH).map((r) => r.id);
      for (const r of await remote.getMany(kind, ids)) whole.set(recordKey(r), r);
    }
  }
  return pulls.flatMap((r) => (r.summary ? (whole.get(recordKey(r)) ?? []) : [r]));
}

/**
 * Run one full sync pass between a local and a remote provider. Idempotent: a second run right
 * after finds every record equal and does nothing. Per-record failures never sink the pass — they
 * are collected into the result and carried in the pending sets (see the header).
 *
 * `onPlan` hears the plan as soon as both sides are listed, before a whole record is fetched: the
 * listing is quick and the fetch is the long part, so this is the earliest moment anyone can say
 * how much is on its way (Home does, on a first pass - syncController.ts).
 */
export async function runSync(
  local: StorageProvider,
  remote: StorageProvider,
  onPlan?: (plan: SyncPlan) => void,
): Promise<SyncResult> {
  const workspaceKey = accountKey(SYNC_META_KEY);
  const sameWorkspace = () => {
    if (accountKey(SYNC_META_KEY) !== workspaceKey) throw new Error('The account changed during saving. Pending work remains in its original workspace.');
  };
  const meta = loadSyncMeta();
  const arriving = !arrived(meta);
  // list() failures DO fail the whole pass: without both sides there is nothing to reconcile, and
  // the bookmark stays put (correct — nothing was applied).
  const localRecs = (await Promise.all(SYNC_KINDS.map((k) => local.list(k)))).flat();
  const remoteRecs = (await Promise.all(SYNC_KINDS.map((k) => remote.list(k)))).flat();

  const plan = reconcile(localRecs, remoteRecs, meta.lastSyncedAt, {
    push: new Set(meta.pendingPush),
    conflict: new Set(meta.pendingConflict),
  });
  onPlan?.(plan);
  // Before anything is applied: a summary is never written, and a fetch that fails must fail
  // the pass rather than one record (see withWholeRecords).
  plan.toLocal = await withWholeRecords(remote, plan.toLocal);
  sameWorkspace();

  const failures: SyncFailure[] = [];
  const pendingPush = new Set<string>();
  const pendingConflict = new Set<string>();
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  const fail = (op: SyncFailure['op'], r: StoredRecord, e: unknown): void => {
    failures.push({
      kind: r.kind,
      id: r.id,
      name: recordName(r),
      op,
      message: e instanceof Error ? e.message : String(e),
    });
  };
  const original = new Map(localRecs.map(r => [recordKey(r), JSON.stringify(r)]));
  const unchanged = async (r: StoredRecord): Promise<boolean> => {
    const current = await local.get(r.kind, r.id);
    sameWorkspace();
    if (JSON.stringify(current ?? undefined) === original.get(recordKey(r))) return true;
    pendingConflict.add(recordKey(r));
    fail('pull', r, new Error('Edited on this device while the cloud revision was arriving. Both revisions will be reconciled on the next pass.'));
    return false;
  };

  // 1. Conflict copies FIRST: duplicate the losing local edit before the pull overwrites it, so a
  //    failure (or a crash) mid-pass can never lose the only copy of a user's work.
  const skipPull = new Set<string>();
  for (const loser of plan.conflicts) {
    const copy = makeConflictCopy(loser);
    try {
      sameWorkspace();
      await local.put(copy);
      conflicts += 1;
    } catch (e) {
      // The copy never materialized — keep the original safe: skip the overwriting pull and
      // remember the debt so the next pass forces the conflict branch again.
      skipPull.add(recordKey(loser));
      pendingConflict.add(recordKey(loser));
      fail('conflict-copy', loser, e);
      continue;
    }
    // Push the copy best-effort; if it fails, next pass sees a local-only record and pushes it.
    try {
      sameWorkspace();
      await remote.put(copy);
    } catch (e) {
      fail('push', copy, e);
    }
  }

  // 2. Pull. A record whose body still holds a Storage sentinel is re-fetched via get(), so the
  //    provider can rehydrate its externalized assets; every other record is applied as fetched.
  //    Falls back to the fetched record if get() returns nothing. A failed pull just retries next
  //    pass — LWW re-derives it from the unchanged timestamps.
  //
  //    EVERYTHING FETCHED IS APPLIED IN ONE GO when the provider can (`putMany`). The local store
  //    keeps each kind as one list, so a put per record rewrites the whole library per record,
  //    and once most records stopped waiting on get() those rewrites ran back to back: a fresh
  //    sign-in to a 27 MB account held a copy of the library per record and crashed Chrome.
  const fetched: StoredRecord[] = [];
  for (const r of plan.toLocal) {
    if (skipPull.has(recordKey(r))) continue;
    if (local.putMany) {
      try {
        fetched.push(hasStorageSentinel(r.body) ? ((await remote.get(r.kind, r.id)) ?? r) : r);
      } catch (e) {
        fail('pull', r, e);
      }
      continue;
    }
    try {
      // Skipping get() when there is nothing to rehydrate (see hasStorageSentinel) is not a
      // micro-optimization: the loop is sequential and a fresh device pulls everything the
      // account holds. It was first done for TOMBSTONES alone: on a GitHub runner 2026-08-24
      // (run 32767300909), 141 of 155 pulls were tombstones, 207 ms each, 29.4 s in total, past
      // the 30 s the UI was waited on for. Live records paid the same way: on 2026-09-26 (run
      // 36252087565) a fresh sign-in to the hosted test account pulled 129 saved looks one request
      // each, 29 s, and seven specs failed waiting on the sync indicator. The cost grows with
      // everything an account keeps, so it is a user-facing defect, not only a slow test. The
      // same arithmetic is why summaries are fetched in batches (withWholeRecords).
      const full = hasStorageSentinel(r.body) ? ((await remote.get(r.kind, r.id)) ?? r) : r;
      if (!(await unchanged(r))) continue;
      await local.put(full);
      pulled += 1;
    } catch (e) {
      fail('pull', r, e);
    }
  }
  if (local.putMany && fetched.length > 0) {
    try {
      const safe: StoredRecord[] = [];
      for (const r of fetched) if (await unchanged(r)) safe.push(r);
      sameWorkspace();
      await local.putMany(safe);
      pulled += safe.length;
    } catch (e) {
      // Nothing is known to have landed, so every record is owed again; the next pass re-derives
      // them from the unchanged timestamps, as for any failed pull.
      for (const r of fetched) fail('pull', r, e);
    }
  }

  // 3. Push. A denied put (RLS) can never succeed by retrying. A denied tombstone deletes nothing
  //    of ours, so it is dropped; a denied live record stays local and is reported in words that
  //    say it was NOT copied anywhere (see the header for why it is never re-minted).
  for (const l of plan.toRemote) {
    try {
      sameWorkspace();
      await remote.put(l);
      pushed += 1;
    } catch (e) {
      if (isPutDenied(e) && l.deleted) continue; // a tombstone for a foreign row - nothing of ours to delete
      pendingPush.add(recordKey(l));
      fail(
        'push',
        l,
        isPutDenied(e)
          ? new Error('the cloud refused it for this account (it belongs to another account, or this account cannot save) - it stays on this device only')
          : e,
      );
    }
  }

  // The pass ran to completion, so the bookmark advances — per-record failures are carried in the
  // pending sets (rebuilt each pass from what actually failed), never by freezing the bookmark.
  sameWorkspace();
  saveSyncMeta({
    lastSyncedAt: new Date().toISOString(),
    pendingPush: [...pendingPush],
    pendingConflict: [...pendingConflict],
    pullsOwed: arriving && failures.some((f) => f.op === 'pull'),
  });
  return { pushed, pulled, conflicts, failures };
}

/** Duplicate a conflict loser under a fresh id + name so both edits survive. */
function makeConflictCopy(r: StoredRecord): StoredRecord {
  const id = uuid();
  const now = new Date().toISOString();
  const src = r.body as Record<string, unknown>;
  const name = typeof src.name === 'string' ? src.name : 'Untitled';
  const body: Record<string, unknown> = { ...src, id, updatedAt: now, deleted: false, name: `${name} (conflicted copy)` };
  // A show's hosted control page and browser-output URL belong to the ORIGINAL — a copy
  // carrying the same slug could publish over it. The copy starts unpublished.
  delete body.hostedSlug;
  delete body.outputSlug;
  // The audience capabilities belong to the original for the same reason: a copy carrying the
  // join slug would take submissions for a production nobody is operating.
  delete body.joinSlug;
  delete body.presenterSlug;
  delete body.publishedAt;
  return { kind: r.kind, id, updatedAt: now, deleted: false, body };
}

// ── sync metadata (per account library): the bookmark + the per-record pending sets ───────────────
// Additive optional fields on one localStorage JSON object — readers default what's missing, so
// no version/migration is needed (the schema-versioning pattern's additive rule).
interface SyncMeta {
  lastSyncedAt: string;
  pendingPush: string[];
  pendingConflict: string[];
  /** The library's first pass on this browser COMPLETED without landing its pulls (the local
   *  store refused them). The bookmark moved anyway, so this is what still says the library has
   *  not arrived (`libraryHasArrived`) until a later pass lands them. */
  pullsOwed: boolean;
}

function loadSyncMeta(): SyncMeta {
  try {
    const m = JSON.parse(localStorage.getItem(accountKey(SYNC_META_KEY)) ?? '{}') as Partial<SyncMeta>;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    return {
      lastSyncedAt: typeof m.lastSyncedAt === 'string' && m.lastSyncedAt ? m.lastSyncedAt : EPOCH,
      pendingPush: strings(m.pendingPush),
      pendingConflict: strings(m.pendingConflict),
      pullsOwed: m.pullsOwed === true,
    };
  } catch {
    return { lastSyncedAt: EPOCH, pendingPush: [], pendingConflict: [], pullsOwed: false };
  }
}

function saveSyncMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(accountKey(SYNC_META_KEY), JSON.stringify(meta));
  } catch {
    // Non-fatal — worst case the next sync re-checks records it already synced.
  }
}

function arrived(meta: SyncMeta): boolean {
  return meta.lastSyncedAt !== EPOCH && !meta.pullsOwed;
}

/** Has the library in use ARRIVED on this browser: a pass completed and landed what it pulled?
 *  Only a completed pass moves the bookmark off the epoch, so a pass that failed to list the cloud
 *  leaves this false, and so does one whose pulls the local store refused. */
export function libraryHasArrived(): boolean {
  return arrived(loadSyncMeta());
}
