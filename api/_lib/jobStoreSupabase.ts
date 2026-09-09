// The durable production job ledger: table render_jobs (migration 0007), written ONLY
// with the Supabase secret from api functions. getJobStore() selects this store when a
// secret key is present (SUPABASE_SECRET_KEY or the legacy SUPABASE_SERVICE_ROLE_KEY);
// without it the in-memory store serves dev.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RenderFormatId } from '../../src/render/manifest.js';
import { storedRenderTier } from '../../src/render/limits.js';
import type { JobError, JobOutput, JobState } from '../../src/render/types.js';
import { TERMINAL_STATES } from '../../src/render/types.js';
import { supabaseSecretKey, type JobProgressSnapshot, type JobRecord, type JobStore } from './jobStore.js';

const TABLE = 'render_jobs';

interface JobRow {
  id: string;
  user_id: string | null;
  ip_hash: string;
  // The column is `text` (0007), so this is whatever is stored - not necessarily a tier this
  // build still has. fromRow() is what turns it back into a RenderTier.
  tier: string;
  project_name: string;
  job_token_hash: string;
  worker_secret_hash: string;
  status: JobState;
  format: RenderFormatId;
  width: number;
  height: number;
  fps: number;
  scale: number;
  total_frames: number;
  manifest_hash: string;
  executor_ref: string | null;
  deadline_at: string;
  expires_at: string | null;
  output: JobOutput | null;
  error: JobError | null;
  progress: JobProgressSnapshot | null;
  created_at: string;
  updated_at: string;
}

function toRow(job: JobRecord): JobRow {
  return {
    id: job.id,
    user_id: job.userId,
    ip_hash: job.ipHash,
    tier: job.tier,
    project_name: job.projectName,
    job_token_hash: job.jobTokenHash,
    worker_secret_hash: job.workerSecretHash,
    status: job.state,
    format: job.format,
    width: job.width,
    height: job.height,
    fps: job.fps,
    scale: job.scale,
    total_frames: job.totalFrames,
    manifest_hash: job.manifestHash,
    executor_ref: job.executorRef,
    deadline_at: new Date(job.deadlineAt).toISOString(),
    expires_at: job.expiresAt !== null ? new Date(job.expiresAt).toISOString() : null,
    output: job.output,
    error: job.error,
    progress: job.progress,
    created_at: new Date(job.createdAt).toISOString(),
    updated_at: new Date(job.updatedAt).toISOString(),
  };
}

function fromRow(row: JobRow): JobRecord {
  const principal = row.user_id ? `user:${row.user_id}` : `ip:${row.ip_hash}`;
  return {
    id: row.id,
    principal,
    userId: row.user_id,
    ipHash: row.ip_hash,
    // A row written before migration 0055 still says 'paid'; storedRenderTier reads that as the
    // 'granted' caps it always meant. Anything else this build cannot name falls back to 'free',
    // which is the narrower of the two tiers a signed-in job can be on and never mislabels the
    // job as anonymous. The tier is read back to size the output TTL (api/_lib/reconcile.ts,
    // renderRoutes/complete.ts), so leaving it unrecognised would produce a NaN expiry.
    tier: storedRenderTier(row.tier) ?? 'free',
    projectName: row.project_name,
    jobTokenHash: row.job_token_hash,
    workerSecretHash: row.worker_secret_hash,
    state: row.status,
    format: row.format,
    width: row.width,
    height: row.height,
    fps: row.fps,
    scale: row.scale,
    totalFrames: row.total_frames,
    manifestHash: row.manifest_hash,
    executorRef: row.executor_ref,
    deadlineAt: Date.parse(row.deadline_at),
    expiresAt: row.expires_at !== null ? Date.parse(row.expires_at) : null,
    output: row.output,
    error: row.error,
    progress: row.progress,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/** 'user:<id>' | 'ip:<hash>' -> the column filter it means. */
function principalFilter(principal: string): { column: 'user_id' | 'ip_hash'; value: string } {
  const [kind, ...rest] = principal.split(':');
  const value = rest.join(':');
  return kind === 'user' ? { column: 'user_id', value } : { column: 'ip_hash', value };
}

function jobPatchToRow(patch: Partial<JobRecord>): Partial<JobRow> {
  const row: Partial<JobRow> = {};
  if (patch.state !== undefined) row.status = patch.state;
  if (patch.executorRef !== undefined) row.executor_ref = patch.executorRef;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt !== null ? new Date(patch.expiresAt).toISOString() : null;
  if (patch.output !== undefined) row.output = patch.output;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.progress !== undefined) row.progress = patch.progress;
  return row;
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  const secretKey = supabaseSecretKey();
  if (!url || !secretKey) throw new Error('render jobs: SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, secretKey, { auth: { persistSession: false } });
  return client;
}

export class SupabaseJobStore implements JobStore {
  async create(job: JobRecord): Promise<void> {
    const { error } = await (await sb()).from(TABLE).insert(toRow(job));
    if (error) throw new Error('render jobs insert failed: ' + error.message);
  }

  async get(id: string): Promise<JobRecord | null> {
    const { data, error } = await (await sb()).from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('render jobs select failed: ' + error.message);
    return data ? fromRow(data as JobRow) : null;
  }

  async update(id: string, patch: Partial<JobRecord>, opts?: { guardNonTerminal?: boolean }): Promise<JobRecord | null> {
    let query = (await sb()).from(TABLE).update(jobPatchToRow(patch)).eq('id', id);
    if (opts?.guardNonTerminal) query = query.not('status', 'in', `(${TERMINAL_STATES.join(',')})`);
    const { error } = await query;
    if (error) throw new Error('render jobs update failed: ' + error.message);
    return this.get(id); // the guarded update may have matched 0 rows — return current truth
  }

  async countRecent(principal: string, sinceMs: number): Promise<number> {
    const f = principalFilter(principal);
    const { count, error } = await (await sb())
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq(f.column, f.value)
      .gte('created_at', new Date(sinceMs).toISOString());
    if (error) throw new Error('render jobs count failed: ' + error.message);
    return count ?? 0;
  }

  async countActive(principal: string): Promise<number> {
    const f = principalFilter(principal);
    const { count, error } = await (await sb())
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq(f.column, f.value)
      .not('status', 'in', `(${TERMINAL_STATES.join(',')})`);
    if (error) throw new Error('render jobs count failed: ' + error.message);
    return count ?? 0;
  }

  async countActiveGlobal(): Promise<number> {
    const { count, error } = await (await sb())
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', `(${TERMINAL_STATES.join(',')})`);
    if (error) throw new Error('render jobs count failed: ' + error.message);
    return count ?? 0;
  }

  async delete(id: string): Promise<void> {
    const { error } = await (await sb()).from(TABLE).delete().eq('id', id);
    if (error) throw new Error('render jobs delete failed: ' + error.message);
  }

  async findActiveDuplicate(principal: string, manifestHash: string): Promise<JobRecord | null> {
    const f = principalFilter(principal);
    const { data, error } = await (await sb())
      .from(TABLE)
      .select('*')
      .eq(f.column, f.value)
      .eq('manifest_hash', manifestHash)
      .not('status', 'in', `(${TERMINAL_STATES.join(',')})`)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('render jobs select failed: ' + error.message);
    return data ? fromRow(data as JobRow) : null;
  }

  async listSweepable(nowMs: number): Promise<JobRecord[]> {
    const nowIso = new Date(nowMs).toISOString();
    const s = await sb();
    const [stale, expired] = await Promise.all([
      s.from(TABLE).select('*').not('status', 'in', `(${TERMINAL_STATES.join(',')})`).lt('deadline_at', nowIso).limit(200),
      s.from(TABLE).select('*').eq('status', 'complete').not('expires_at', 'is', null).lt('expires_at', nowIso).limit(200),
    ]);
    if (stale.error) throw new Error('render jobs sweep failed: ' + stale.error.message);
    if (expired.error) throw new Error('render jobs sweep failed: ' + expired.error.message);
    return [...(stale.data ?? []), ...(expired.data ?? [])].map((r) => fromRow(r as JobRow));
  }
}
