// Render job DTOs — the wire contract between the Export UI and the render API.
// PURE MODULE (no DOM, no import.meta): imported by src/render/client.ts (browser) and
// by the api/ functions (Node).

import type { RenderFormatId } from './manifest.js';

export type JobState =
  | 'pending'        // row created, executor not yet started
  | 'provisioning'   // executor starting (sandbox boot / npm ci — the slow honest phase)
  | 'rendering'      // frames being rendered
  | 'encoding'       // stitching / zipping
  | 'uploading'      // pushing the finished file to storage
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';       // output TTL passed, file deleted (row kept for accounting)

export const TERMINAL_STATES: JobState[] = ['complete', 'failed', 'cancelled', 'expired'];

export interface JobFrames {
  rendered: number;
  encoded: number;
  total: number;
}

export interface JobOutput {
  url: string;
  downloadUrl: string;
  bytes: number;
  contentType: string;
  /** ISO timestamp the file disappears. */
  expiresAt: string | null;
}

export interface JobError {
  code:
    | 'provision_error'
    | 'provision_failed'
    | 'render_failed'
    | 'upload_failed'
    | 'too_large'
    | 'timeout'
    | 'sandbox_lost'
    | 'internal';
  message: string;
}

/** GET /api/render/status response. */
export interface RenderJobStatus {
  jobId: string;
  state: JobState;
  percent: number;               // 0..100 across the whole job
  frames?: JobFrames;
  format: RenderFormatId;
  output?: JobOutput;
  error?: JobError;
}

/** POST /api/render/start 202 response. */
export interface StartRenderResponse {
  jobId: string;
  /** Authorizes status/cancel/file for THIS job only. Hold client-side, never stored raw. */
  jobToken: string;
  pollIntervalMs: number;
  totalFrames: number;
}

/** Error body for every non-2xx render API response. */
export interface RenderApiError {
  error: {
    code:
      | 'invalid'
      | 'too_large'
      | 'format_requires_signin'
      | 'limit_exceeded'
      | 'quota'
      | 'rate_limited'
      | 'concurrent'
      | 'busy'
      | 'duplicate'
      // An operation id already used for a different request (api/_lib/me/graphicSets.ts).
      | 'conflict'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'unavailable'
      | 'internal';
    message: string;
    /** limit_exceeded: the individual limit messages. */
    issues?: string[];
    /** duplicate: the already-running identical job. */
    existingJobId?: string;
  };
}
