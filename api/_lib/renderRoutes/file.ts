// GET /api/render/file?id=<jobId>&token=<jobToken> — streams a LOCAL executor's finished
// file (the dev loop and self-hosted local rendering). Sandbox outputs download straight
// from Blob and never pass through here. Token-gated like status; the token rides a query
// param because this URL is opened as a browser navigation (download), not a fetch.

import { readFileSync } from 'node:fs';
import { apiError, methodGuard, secretMatches } from '../http.js';
import { getJobStore } from '../jobStore.js';
import { localOutputPath } from '../executor.js';
import { RENDER_FORMATS } from '../../../src/render/manifest.js';
import { slug } from '../../../src/model/slug.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    if (!id) return apiError('invalid', 'missing id', 400);

    const store = await getJobStore();
    const job = await store.get(id);
    if (!job || !secretMatches(token, job.jobTokenHash)) {
      return apiError('not_found', 'unknown job', 404);
    }
    if (job.state !== 'complete' || !job.output?.url.startsWith('/api/render/file')) {
      return apiError('not_found', 'no local file for this job', 404);
    }

    try {
      const buf = readFileSync(localOutputPath(job));
      const info = RENDER_FORMATS[job.format];
      return new Response(new Uint8Array(buf), {
        headers: {
          'content-type': info.mime,
          'content-length': String(buf.byteLength),
          'content-disposition': `attachment; filename="${slug(job.projectName)}_${job.format}.${info.ext}"`,
          'cache-control': 'no-store',
        },
      });
    } catch {
      return apiError('not_found', 'file expired or removed', 404);
    }
  },
};
