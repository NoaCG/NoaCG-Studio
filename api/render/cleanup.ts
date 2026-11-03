// GET /api/render/cleanup — the cron backstop (vercel.json crons; Bearer CRON_SECRET).
// Sweeps what the poll-driven reconciler missed: jobs whose browser went away (stopped,
// marked failed after their deadline) and expired outputs (blob deleted, row kept for
// accounting). Inline finalization in status/complete is the primary path — this only
// has to be eventually right.

import { apiError, json, methodGuard } from '../_lib/http.js';
import { getJobStore, isTerminal } from '../_lib/jobStore.js';
import { getExecutor } from '../_lib/executor.js';
import { deleteOutput } from '../_lib/outputStorage.js';
import { endJob } from '../_lib/reconcile.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const secret = (process.env.CRON_SECRET ?? '').trim();
    const auth = req.headers.get('authorization') ?? '';
    if (!secret || auth !== `Bearer ${secret}`) {
      return apiError('unauthorized', 'bad cron secret', 401);
    }

    const store = await getJobStore();
    const executor = await getExecutor();
    const now = Date.now();
    let timedOut = 0;
    let expired = 0;

    for (const job of await store.listSweepable(now)) {
      if (!isTerminal(job.state)) {
        // Past its deadline and never reported terminal — mark honestly and kill.
        await endJob(job, { state: 'failed', error: { code: 'timeout', message: 'The render timed out.' } }, store, executor);
        timedOut++;
      } else if (job.state === 'complete' && job.expiresAt !== null && now > job.expiresAt) {
        await deleteOutput(job);
        await store.update(job.id, { state: 'expired', output: null });
        expired++;
      }
    }

    return json({ ok: true, timedOut, expired });
  },
};
