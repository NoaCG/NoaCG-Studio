// The Vercel Sandbox executor — the hosted rendering backend. It uses @remotion/vercel
// only to PROVISION: createSandbox() spins up a Firecracker VM with Chrome + FFmpeg + the
// pinned @remotion/renderer + @vercel/blob, and addBundleToSandbox() uploads the prebuilt
// composition bundle (render-worker/bundle, built at deploy time) to
// /vercel/sandbox/remotion-bundle. The render itself runs through render-worker/
// sandbox-job.mjs, a detached command that reads the manifest from a FILE and renders
// programmatically with @remotion/renderer.
//
// Why NOT @remotion/vercel's renderMediaOnVercel: it passes inputProps as a single CLI
// argument, and our manifest embeds the whole self-contained document (inlined GSAP +
// assets) — well over the OS 128 KB single-argument limit (E2BIG). A file + in-process
// inputProps sidesteps that entirely, and one worker serves all five formats.
//
// Selected by RENDER_EXECUTOR=sandbox. @vercel/sandbox is pinned to the version
// @remotion/vercel is built against (its compiled code uses the sandboxId API).
//
// Because provisioning takes minutes, api/render/start launches this executor UNDER
// waitUntil after answering 202 — no request ever waits on a sandbox boot. Progress and
// the finished Blob URL flow back through a progress.json the worker writes in the sandbox.

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RENDER_FORMATS, type RenderManifest } from '../../src/render/manifest.js';
import { slug } from '../../src/model/slug.js';
import type { JobOutput } from '../../src/render/types.js';
import type { JobRecord } from './jobStore.js';
import type { ExecutorProgress, ExecutorStartResult, RenderExecutor } from './executor.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE_DIR = path.join(REPO_ROOT, 'render-worker', 'bundle');
const SANDBOX_DIR = '/vercel/sandbox/noacg-job';
const PROGRESS_PATH = `${SANDBOX_DIR}/progress.json`;

function blobToken(): string {
  const token = (process.env.BLOB_READ_WRITE_TOKEN ?? '').trim();
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is required for sandbox rendering');
  return token;
}

/** The job id is the unguessable path capability; the TTL cron bounds exposure. */
function blobPathFor(job: JobRecord): string {
  return `renders/${job.id}/${slug(job.projectName)}_${job.format}.${RENDER_FORMATS[job.format].ext}`;
}

interface ProgressFile extends ExecutorProgress {
  blobUrl?: string;
  contentType?: string;
}

export class SandboxExecutor implements RenderExecutor {
  id = 'sandbox' as const;

  async start(job: JobRecord, manifest: RenderManifest): Promise<ExecutorStartResult> {
    const { createSandbox, addBundleToSandbox } = await import('@remotion/vercel');
    const timeoutMs = Math.max(60_000, job.deadlineAt - Date.now());
    const sandbox = await createSandbox({ resources: { vcpus: 4 }, timeoutInMilliseconds: timeoutMs });
    await addBundleToSandbox({ sandbox, bundleDir: BUNDLE_DIR });

    const workerScript = readFileSync(path.join(REPO_ROOT, 'render-worker', 'sandbox-job.mjs'), 'utf8');
    await sandbox.writeFiles([
      { path: 'noacg-job/manifest.json', content: Buffer.from(JSON.stringify(manifest)) },
      { path: 'noacg-job/sandbox-job.mjs', content: Buffer.from(workerScript) },
    ]);
    await sandbox.runCommand({
      cmd: 'node',
      args: [`${SANDBOX_DIR}/sandbox-job.mjs`, `${SANDBOX_DIR}/manifest.json`, PROGRESS_PATH, blobPathFor(job)],
      env: { BLOB_READ_WRITE_TOKEN: blobToken() },
      detached: true,
    });
    return { executorRef: sandbox.sandboxId };
  }

  async readProgress(job: JobRecord): Promise<ExecutorProgress | null> {
    const sandboxId = job.executorRef;
    if (!sandboxId) return null;
    try {
      const { Sandbox } = await import('@vercel/sandbox');
      const sandbox = await Sandbox.get({ sandboxId });
      const buf = await sandbox.readFileToBuffer({ path: PROGRESS_PATH });
      if (!buf) return { state: 'provisioning', progress: 0 }; // worker not writing yet
      const p = JSON.parse(buf.toString('utf8')) as ProgressFile;
      if (p.state === 'complete' && p.blobUrl) {
        return { ...p, output: { url: p.blobUrl, bytes: p.outputBytes ?? 0, contentType: p.contentType ?? RENDER_FORMATS[job.format].mime } };
      }
      return p;
    } catch {
      return null; // sandbox unreachable — the reconciler's deadline logic decides
    }
  }

  async finalizeOutput(job: JobRecord): Promise<JobOutput | null> {
    const p = await this.readProgress(job);
    return p?.output
      ? { url: p.output.url, downloadUrl: p.output.url, bytes: p.output.bytes, contentType: p.output.contentType, expiresAt: null }
      : null;
  }

  async stop(job: JobRecord): Promise<void> {
    const sandboxId = job.executorRef;
    if (!sandboxId) return;
    try {
      const { Sandbox } = await import('@vercel/sandbox');
      const sandbox = await Sandbox.get({ sandboxId });
      await sandbox.stop();
    } catch {
      // already stopped/expired — stop is idempotent
    }
  }
}
