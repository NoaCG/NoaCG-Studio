// The active render job's UI state (zustand, same shape discipline as auth/authUi.ts).
// One job per session (matches the tier concurrency caps). The {jobId, jobToken} pair is
// mirrored to sessionStorage so a reload resumes polling instead of orphaning the render;
// polling is serialized and stops at any terminal state.

import { create } from 'zustand';
import { cancelRender, fetchStatus, startRender, RenderRequestError } from './client';
import { RENDER_CONFIG } from './limits';
import type { RenderManifest } from './manifest';
import { TERMINAL_STATES, type RenderJobStatus } from './types';
import { accountKey } from '../model/accountScope';

const RESUME_KEY = 'noacg-render-job';

interface ResumeInfo {
  jobId: string;
  jobToken: string;
  projectName: string;
}

export interface RenderJobUi {
  job: (ResumeInfo & { status: RenderJobStatus | null }) | null;
  /** The last start() failure, for inline display. null while ok. */
  startError: { message: string; code: string } | null;
  busy: boolean;
  start(manifest: RenderManifest): Promise<void>;
  cancel(): Promise<void>;
  /** Forget the job (after download or on "render another"). Does not cancel. */
  clear(): void;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function saveResume(info: ResumeInfo | null) {
  try {
    if (info) sessionStorage.setItem(accountKey(RESUME_KEY), JSON.stringify(info));
    else sessionStorage.removeItem(accountKey(RESUME_KEY));
  } catch {
    // storage unavailable — polling still works for this page's lifetime
  }
}

function loadResume(): ResumeInfo | null {
  try {
    const raw = sessionStorage.getItem(accountKey(RESUME_KEY));
    return raw ? (JSON.parse(raw) as ResumeInfo) : null;
  } catch {
    return null;
  }
}

export const useRenderJob = create<RenderJobUi>((set, get) => {
  const poll = async () => {
    const job = get().job;
    if (!job) return;
    try {
      const status = await fetchStatus(job.jobId, job.jobToken);
      set({ job: { ...job, status } });
      if (TERMINAL_STATES.includes(status.state)) {
        stopPolling();
        return;
      }
    } catch (err) {
      if (err instanceof RenderRequestError && err.code === 'not_found') {
        // The job is gone server-side (dev-server restart, expiry) — stop honestly.
        stopPolling();
        set({ job: null });
        saveResume(null);
        return;
      }
      // transient network error — keep polling
    }
    pollTimer = setTimeout(poll, RENDER_CONFIG.pollIntervalMs);
  };

  const beginPolling = () => {
    stopPolling();
    pollTimer = setTimeout(poll, RENDER_CONFIG.pollIntervalMs);
  };

  // Resume a job from a previous page load in this tab.
  const resumed = loadResume();
  if (resumed) queueMicrotask(beginPolling);

  return {
    job: resumed ? { ...resumed, status: null } : null,
    startError: null,
    busy: false,

    async start(manifest) {
      if (get().busy || get().job) return;
      set({ busy: true, startError: null });
      try {
        const res = await startRender(manifest);
        const info: ResumeInfo = { jobId: res.jobId, jobToken: res.jobToken, projectName: manifest.projectName };
        saveResume(info);
        set({ job: { ...info, status: null }, busy: false });
        beginPolling();
      } catch (err) {
        const e = err instanceof RenderRequestError ? err : new RenderRequestError({ code: 'internal', message: String(err) });
        set({ busy: false, startError: { message: e.message, code: e.code } });
      }
    },

    async cancel() {
      const job = get().job;
      if (!job) return;
      stopPolling();
      try {
        const status = await cancelRender(job.jobId, job.jobToken);
        set({ job: { ...job, status } });
      } catch {
        set({ job: { ...job, status: job.status } });
      }
      saveResume(null);
    },

    clear() {
      stopPolling();
      saveResume(null);
      set({ job: null, startError: null });
    },
  };
});
