// POST /api/render/start — validate a render job, enforce tier limits and quotas, launch
// the executor DETACHED, answer 202 immediately. No function invocation ever waits for a
// render; progress flows through /api/render/status.

import { randomUUID } from 'node:crypto';
import { durationInFrames, RENDER_MANIFEST_VERSION, type RenderManifest } from '../../src/render/manifest.js';
import { jobTimeoutMs, RENDER_CONFIG, resolveTier, RENDER_LIMITS, validateRenderRequest } from '../../src/render/limits.js';
import type { StartRenderResponse } from '../../src/render/types.js';
import { apiError, bearerToken, ipHash, json, methodGuard, newSecret, readJson, sha256 } from '../_lib/http.js';
import { verifyUser } from '../_lib/auth.js';
import { getJobStore, type JobRecord } from '../_lib/jobStore.js';
import { getExecutor } from '../_lib/executor.js';
import { launchJob } from '../_lib/reconcile.js';
import { admitGlobally } from '../_lib/admission.js';
import { checkStartRateLimit } from '../_lib/rateLimit.js';
import { resolveUserEntitlement } from '../_lib/entitlements.js';
import { allows } from '../../src/entitlements/contract.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    // The burst gate goes FIRST — ahead of the body read, deliberately. Everything below
    // this line costs real work on behalf of the caller: up to a 4 MB body, a manifest
    // parse, an auth round trip, four ledger queries. A hammering client should reach
    // none of it.
    const flooding = checkStartRateLimit(req);
    if (flooding) {
      return apiError(
        'rate_limited',
        'Too many render requests from this network — wait a moment and try again.',
        429,
        {},
        { 'retry-after': String(flooding.retryAfterSec) },
      );
    }

    let manifest: RenderManifest;
    try {
      const body = await readJson<{ manifest?: RenderManifest }>(req, RENDER_CONFIG.manifestMaxBytes);
      if (!body?.manifest) return apiError('invalid', 'missing manifest', 400);
      manifest = body.manifest;
    } catch (err) {
      const code = (err as { code?: string }).code === 'too_large' ? 'too_large' : 'invalid';
      return apiError(code as 'too_large' | 'invalid', (err as Error).message, code === 'too_large' ? 413 : 400);
    }
    if (manifest.version !== RENDER_MANIFEST_VERSION) {
      // The only realistic sender of an old version is a stale open tab (manifests are
      // built at click time, never persisted).
      return apiError('invalid', `unsupported manifest version ${manifest.version} — reload the app`, 400);
    }
    if (manifest.kind === 'remotion') {
      if (typeof manifest.compiledJs !== 'string' || manifest.compiledJs.trim().length === 0) {
        return apiError('invalid', 'manifest has no compiled composition module', 400);
      }
      if (manifest.compiledJs.length > RENDER_CONFIG.compiledJsMaxBytes) {
        return apiError('too_large', 'compiled composition module too large', 413);
      }
      if (
        !Number.isFinite(manifest.durationInFrames) ||
        manifest.durationInFrames < 1 ||
        manifest.durationInFrames > 3600 * manifest.fps
      ) {
        return apiError('invalid', 'bad durationInFrames', 400);
      }
      if (
        manifest.inputProps !== undefined &&
        (typeof manifest.inputProps !== 'object' || manifest.inputProps === null || Array.isArray(manifest.inputProps))
      ) {
        return apiError('invalid', 'inputProps must be a JSON object', 400);
      }
    } else if (manifest.kind === 'hyperframes') {
      if (typeof manifest.documentHtml !== 'string' || manifest.documentHtml.length === 0) {
        return apiError('invalid', 'manifest has no document', 400);
      }
      if (
        !Number.isFinite(manifest.durationInFrames) ||
        manifest.durationInFrames < 1 ||
        manifest.durationInFrames > 3600 * manifest.fps
      ) {
        return apiError('invalid', 'bad durationInFrames', 400);
      }
    } else if (manifest.kind === 'html') {
      if (typeof manifest.documentHtml !== 'string' || manifest.documentHtml.length === 0) {
        return apiError('invalid', 'manifest has no document', 400);
      }
    } else {
      return apiError('invalid', 'unknown document kind', 400);
    }

    // Tier + authoritative limit re-check (client-side checks are UX only).
    //
    // The tier now comes from the ONE entitlement resolver rather than from "is there a user":
    // a plan, a temporary grant or a manual override can move it, and a suspended account
    // drops to the anonymous tier. With no plans configured the resolver returns exactly what
    // resolveTier(signedIn) always returned, so this is behaviour-neutral until someone
    // assigns a plan (docs/ADMIN.md, the neutrality rule).
    const user = await verifyUser(bearerToken(req));
    const entitlement = await resolveUserEntitlement(user?.userId ?? null);
    if (!allows(entitlement, 'render.cloud')) {
      return apiError('unauthorized', 'Cloud rendering is not available for this account.', 403);
    }
    const tier = resolveTier(Boolean(user), entitlement.renderTier.value);
    const issues = validateRenderRequest(manifest, tier, entitlement.renderFormats.value);
    if (issues.length > 0) {
      const signin = issues.find((i) => i.code === 'format-signin');
      if (signin) return apiError('format_requires_signin', signin.message, 403);
      return apiError('limit_exceeded', issues[0].message, 422, { issues: issues.map((i) => i.message) });
    }

    // Quotas. Duplicate detection runs FIRST: an accidental double-submit should point at
    // the already-running job (the client resumes polling it), not burn a quota answer.
    const store = await getJobStore();
    const ip = ipHash(req);
    const principal = user ? `user:${user.userId}` : `ip:${ip}`;
    const caps = RENDER_LIMITS[tier];
    const now = Date.now();
    const manifestHash = sha256(JSON.stringify(manifest));
    const dup = await store.findActiveDuplicate(principal, manifestHash);
    if (dup) {
      return apiError('duplicate', 'An identical render is already running.', 409, { existingJobId: dup.id });
    }
    if ((await store.countActive(principal)) >= caps.maxConcurrent) {
      return apiError('concurrent', `You already have ${caps.maxConcurrent} render(s) running — wait for them to finish.`, 409);
    }
    if ((await store.countRecent(principal, now - 3600_000)) >= caps.perHour) {
      return apiError('quota', `Hourly render limit reached (${caps.perHour}/h). Try again later.`, 429);
    }
    if ((await store.countRecent(principal, now - 86_400_000)) >= caps.perDay) {
      return apiError('quota', `Daily render limit reached (${caps.perDay}/day). Try again tomorrow.`, 429);
    }

    // The two per-job secrets: the browser's status/cancel token and the worker's
    // completion secret. Only their hashes are stored.
    const jobToken = newSecret();
    const workerSecret = newSecret();
    const totalFrames = durationInFrames(manifest);
    const job: JobRecord = {
      id: randomUUID(),
      principal,
      userId: user?.userId ?? null,
      ipHash: ip,
      tier,
      projectName: String(manifest.projectName || 'graphic').slice(0, 120),
      jobTokenHash: sha256(jobToken),
      workerSecretHash: sha256(workerSecret),
      state: 'pending',
      format: manifest.output.format,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      scale: manifest.scale,
      totalFrames,
      manifestHash,
      executorRef: null,
      deadlineAt: now + jobTimeoutMs(manifest) + RENDER_CONFIG.abandonedSlackMs,
      expiresAt: null,
      output: null,
      error: null,
      progress: null,
      createdAt: now,
      updatedAt: now,
    };
    await store.create(job);

    // Fleet admission, deliberately AFTER the insert: a stampede has to see itself (the
    // reasoning is in admission.ts). A refused job never launched, so its row goes away
    // rather than eating a slot in the caller's hourly/daily window.
    const busy = await admitGlobally(store, tier);
    if (busy) {
      await store.delete(job.id);
      return apiError('busy', busy.message, 503, {}, { 'retry-after': String(busy.retryAfterSec) });
    }

    const executor = await getExecutor();
    const launch = () => launchJob(job, manifest, { workerSecret }, store, executor);
    const markLaunchFailed = async (err: unknown) => {
      console.error('render start failed:', err);
      await store.update(
        job.id,
        { state: 'failed', error: { code: 'provision_error', message: 'Could not start the render service — try again in a minute.' } },
        { guardNonTerminal: true },
      );
    };

    if (executor.id === 'sandbox') {
      // Sandbox provisioning takes minutes — answer 202 now and launch in the background.
      // waitUntil keeps the function alive on Vercel; the Vite dev middleware has no such
      // API, but its process outlives requests anyway, so a plain floating promise works.
      const launching = launch().catch(markLaunchFailed);
      try {
        const { waitUntil } = await import('@vercel/functions');
        waitUntil(launching);
      } catch {
        void launching;
      }
    } else {
      // The local executor starts in milliseconds — launch inline so a broken setup
      // answers 503 instead of a job that silently fails.
      try {
        await launch();
      } catch (err) {
        await markLaunchFailed(err);
        return apiError('unavailable', 'Could not start the render service — try again in a minute.', 503);
      }
    }

    const resBody: StartRenderResponse = {
      jobId: job.id,
      jobToken,
      pollIntervalMs: RENDER_CONFIG.pollIntervalMs,
      totalFrames,
    };
    return json(resBody, 202);
  },
};
