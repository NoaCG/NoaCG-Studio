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
// Selected by RENDER_EXECUTOR=sandbox. @vercel/sandbox is on the 3.x SDK, which changed three
// things this file depends on (issue #1752):
// - Sandboxes are persistent by default, and Sandbox-level reads and commands RESUME a stopped
//   one (a new billed VM). We switch persistence off as soon as createSandbox returns, and
//   every later look (progress, stop) goes through the current Session, which never resumes.
// - The 3.x default image is Ubuntu, but createSandbox installs with `sudo dnf`. It passes the
//   legacy `runtime: 'node24'`, which Vercel documents as Amazon Linux 2023 and still honours.
//   start() refuses any other runtime, and executorSandbox.test.ts pins Remotion's choice.
// - Sandboxes are looked up by name. executorRef is REF_PREFIX + name; a ref without the
//   prefix is a 1.x sandboxId from before the upgrade, which we never look up, so that job
//   fails through the reconciler's deadline path.
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

/** The runtime createSandbox asks for: Amazon Linux 2023, where its `dnf` install works. */
export const SANDBOX_RUNTIME = 'node24';
export const REF_PREFIX = 'sbx3:';

/** The sandbox name in a ref this executor wrote; null for a 1.x ref or none. */
export function sandboxNameOf(ref: string | null): string | null {
  return ref?.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) || null : null;
}

/** The slice of a 3.x Session used here. Session calls never resume a stopped sandbox. */
export interface SandboxSessionLike {
  readonly status: string;
  readFileToBuffer(file: { path: string }): Promise<Buffer | null>;
  stop(): Promise<unknown>;
}

/** The slice of a 3.x Sandbox used here. */
export interface SandboxLike {
  readonly name: string;
  readonly persistent: boolean;
  readonly runtime: string | undefined;
  currentSession(): SandboxSessionLike;
  update(params: { persistent: boolean }): Promise<void>;
  writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
  runCommand(params: { cmd: string; args: string[]; env: Record<string, string>; detached: true }): Promise<unknown>;
  stop(): Promise<unknown>;
}

export interface SandboxDeps {
  /** A provisioned sandbox, plus the step that uploads the composition bundle to it. */
  provision(timeoutInMilliseconds: number): Promise<{ sandbox: SandboxLike; addBundle(): Promise<void> }>;
  /** Look a sandbox up without resuming it. */
  get(name: string): Promise<SandboxLike>;
}

const sdkDeps: SandboxDeps = {
  async provision(timeoutInMilliseconds) {
    const { createSandbox, addBundleToSandbox } = await import('@remotion/vercel');
    const sandbox = await createSandbox({ resources: { vcpus: 4 }, timeoutInMilliseconds });
    return { sandbox, addBundle: () => addBundleToSandbox({ sandbox, bundleDir: BUNDLE_DIR }) };
  },
  async get(name) {
    const { Sandbox } = await import('@vercel/sandbox');
    return Sandbox.get({ name, resume: false });
  },
};

const ENDED = new Set(['stopping', 'stopped', 'failed', 'aborted']);

export class SandboxExecutor implements RenderExecutor {
  id = 'sandbox' as const;

  constructor(private readonly deps: SandboxDeps = sdkDeps) {}

  async start(job: JobRecord, manifest: RenderManifest): Promise<ExecutorStartResult> {
    const timeoutMs = Math.max(60_000, job.deadlineAt - Date.now());
    const { sandbox, addBundle } = await this.deps.provision(timeoutMs);
    try {
      await sandbox.update({ persistent: false });
      if (sandbox.persistent) throw new Error('sandbox is still persistent after update');
      if (sandbox.runtime !== SANDBOX_RUNTIME) {
        throw new Error(`sandbox runtime is ${sandbox.runtime ?? 'an image'}, expected ${SANDBOX_RUNTIME}`);
      }
      await addBundle();
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
    } catch (err) {
      await sandbox.stop().catch(() => {}); // a failed launch must not leave a billed VM running
      throw err;
    }
    return { executorRef: REF_PREFIX + sandbox.name };
  }

  /** The job's live session, or null when it has none (1.x ref, stopped, expired, gone). */
  private async liveSession(job: JobRecord): Promise<SandboxSessionLike | null> {
    const name = sandboxNameOf(job.executorRef);
    if (!name) return null;
    const session = (await this.deps.get(name)).currentSession();
    return ENDED.has(session.status) ? null : session;
  }

  async readProgress(job: JobRecord): Promise<ExecutorProgress | null> {
    try {
      const session = await this.liveSession(job);
      if (!session) return null;
      const buf = await session.readFileToBuffer({ path: PROGRESS_PATH });
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
    try {
      await (await this.liveSession(job))?.stop();
    } catch {
      // already stopped/expired — stop is idempotent
    }
  }
}
