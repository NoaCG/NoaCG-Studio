// The status reconciler — the ONE place executor progress becomes job state. Used by the
// status endpoint on every poll and by the cleanup cron for unpolled jobs, so a job
// reaches an honest terminal state no matter which path looks at it first. All finalizing
// updates are guarded (no-op once terminal) — duplicate polls and late callbacks are safe.

import { RENDER_CONFIG } from '../../src/render/limits.js';
import type { RenderManifest } from '../../src/render/manifest.js';
import type { JobFrames, RenderJobStatus } from '../../src/render/types.js';
import type { RenderExecutor } from './executor.js';
import { isTerminal, type JobRecord, type JobStore } from './jobStore.js';

/** Overall percent for the UI: honest bands per stage. */
function percentOf(job: JobRecord): number {
  const p = job.progress;
  switch (job.state) {
    case 'pending': return 2;
    case 'provisioning': return 6;
    case 'rendering': return Math.round(10 + (p?.progress ?? 0) * 75);
    case 'encoding': return Math.round(85 + (p?.progress ?? 0) * 12);
    case 'uploading': return 98;
    case 'complete': return 100;
    default: return 0;
  }
}

export function toStatus(job: JobRecord): RenderJobStatus {
  const frames: JobFrames | undefined =
    job.progress?.totalFrames != null
      ? {
          rendered: job.progress.renderedFrames ?? 0,
          encoded: job.progress.encodedFrames ?? 0,
          total: job.progress.totalFrames,
        }
      : undefined;
  return {
    jobId: job.id,
    state: job.state,
    percent: percentOf(job),
    frames,
    format: job.format,
    output: job.output ?? undefined,
    error: job.error ?? undefined,
  };
}

/** Start the executor and record its handle. A job can end while start() runs, when nothing can
 *  stop the render yet because the handle is not stored. The guarded write then changes nothing
 *  and answers with the current row, so a row without this handle is what says to stop here. */
export async function launchJob(
  job: JobRecord,
  manifest: RenderManifest,
  secrets: { workerSecret: string },
  store: JobStore,
  executor: RenderExecutor,
): Promise<void> {
  const { executorRef, immediateOutput } = await executor.start(job, manifest, secrets);
  const expiresAt = Date.now() + RENDER_CONFIG.outputTtlMs[job.tier];
  let stored: JobRecord | null = null;
  try {
    stored = await store.update(
      job.id,
      immediateOutput
        ? {
            state: 'complete',
            executorRef,
            expiresAt,
            output: { ...immediateOutput, downloadUrl: immediateOutput.url, expiresAt: new Date(expiresAt).toISOString() },
          }
        : { state: 'provisioning', executorRef },
      { guardNonTerminal: true },
    );
  } finally {
    if (stored?.executorRef !== executorRef) await executor.stop({ ...job, executorRef });
  }
}

/** Mark a job ended, then stop its executor through the row the write returned. In this order, a
 *  launch finishing at the same moment cannot lose the handle: if its write came first the row
 *  holds the handle, and if it came second launchJob stops the render itself.
 *  The stop is awaited: Vercel freezes a function once it has answered, so a stop left floating
 *  often never reaches the sandbox, and the VM bills to its timeout. Idempotent, and never throws. */
export async function endJob(job: JobRecord, patch: Partial<JobRecord>, store: JobStore, executor: RenderExecutor): Promise<JobRecord> {
  const updated = await store.update(job.id, patch, { guardNonTerminal: true });
  await executor.stop(updated ?? job);
  return updated ?? job;
}

/** Pull the executor's latest truth into the store and return the fresh record. */
export async function reconcileJob(job: JobRecord, store: JobStore, executor: RenderExecutor): Promise<JobRecord> {
  if (isTerminal(job.state)) return job;
  const now = Date.now();

  const progress = await executor.readProgress(job);
  if (progress) {
    if (progress.state === 'complete') {
      const output = progress.output
        ? {
            url: progress.output.url,
            downloadUrl: progress.output.url,
            bytes: progress.output.bytes,
            contentType: progress.output.contentType,
            expiresAt: null,
          }
        : await executor.finalizeOutput(job);
      if (output) {
        const expiresAt = now + RENDER_CONFIG.outputTtlMs[job.tier];
        return endJob(
          job,
          {
            state: 'complete',
            output: { ...output, expiresAt: new Date(expiresAt).toISOString() },
            expiresAt,
            progress: { state: 'complete', progress: 1, ...framePart(progress) },
          },
          store,
          executor,
        );
      }
      // Worker claims complete but the file is unreadable — fall through to timeout logic.
    } else if (progress.state === 'failed') {
      return endJob(job, { state: 'failed', error: progress.error ?? { code: 'render_failed', message: 'render failed' } }, store, executor);
    } else {
      const updated = await store.update(
        job.id,
        { state: progress.state, progress: { state: progress.state, progress: progress.progress, ...framePart(progress) } },
        { guardNonTerminal: true },
      );
      return updated ?? job;
    }
  }

  // No readable progress: still booting (fine before the deadline) or lost.
  if (now > job.deadlineAt) {
    return endJob(
      job,
      {
        state: 'failed',
        error: {
          code: progress ? 'timeout' : 'sandbox_lost',
          message: 'The render timed out — try a shorter duration or a lower resolution.',
        },
      },
      store,
      executor,
    );
  }
  return job;
}

function framePart(p: { renderedFrames?: number; encodedFrames?: number; totalFrames?: number }) {
  return { renderedFrames: p.renderedFrames, encodedFrames: p.encodedFrames, totalFrames: p.totalFrames };
}
