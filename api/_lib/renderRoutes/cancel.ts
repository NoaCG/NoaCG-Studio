// POST /api/render/cancel — { jobId }, Bearer <jobToken>. Stops the executor and marks
// the job cancelled. Idempotent: cancelling a finished job just reports its final state.

import { apiError, bearerToken, json, methodGuard, readJson, secretMatches } from '../http.js';
import { getJobStore, isTerminal } from '../jobStore.js';
import { getExecutor } from '../executor.js';
import { endJob, toStatus } from '../reconcile.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    let jobId: string | undefined;
    try {
      ({ jobId } = await readJson<{ jobId?: string }>(req, 10_000));
    } catch {
      return apiError('invalid', 'bad request body', 400);
    }
    if (!jobId) return apiError('invalid', 'missing jobId', 400);

    const store = await getJobStore();
    const job = await store.get(jobId);
    if (!job || !secretMatches(bearerToken(req), job.jobTokenHash)) {
      return apiError('not_found', 'unknown job', 404);
    }
    if (isTerminal(job.state)) return json(toStatus(job));

    return json(toStatus(await endJob(job, { state: 'cancelled' }, store, await getExecutor())));
  },
};
