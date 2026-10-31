import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { RenderManifest } from '../../src/render/manifest.js';
import type { JobRecord } from './jobStore.js';
import { getJobStore } from './jobStore.js';
import { reconcileJob } from './reconcile.js';
import {
  REF_PREFIX,
  SANDBOX_RUNTIME,
  SandboxExecutor,
  sandboxNameOf,
  type SandboxDeps,
  type SandboxLike,
  type SandboxSessionLike,
} from './executorSandbox.js';

// The 3.x SDK migration (issue #1752). A fake SDK records every call, so each test can prove
// what the executor did NOT do: resume a stopped sandbox, or look up a 1.x sandboxId.

class FakeSession implements SandboxSessionLike {
  reads = 0;
  stops = 0;
  constructor(public status: string, private progress: string | null = null) {}
  async readFileToBuffer() {
    this.reads += 1;
    if (this.status !== 'running') throw new Error('sandbox_stopped');
    return this.progress === null ? null : Buffer.from(this.progress);
  }
  async stop() {
    this.stops += 1;
    this.status = 'stopped';
  }
}

class FakeSandbox implements SandboxLike {
  persistent = true; // the 3.x default
  updates: { persistent: boolean }[] = [];
  commands: { cmd: string; detached: true }[] = [];
  sandboxStops = 0;
  /** Sandbox-level reads and commands are the calls that resume in 3.x; count them. */
  resumingCalls = 0;
  constructor(
    public name: string,
    public session: FakeSession,
    private honoursUpdate = true,
  ) {}
  runtime: string | undefined = SANDBOX_RUNTIME;
  currentSession() {
    return this.session;
  }
  async update(params: { persistent: boolean }) {
    this.updates.push(params);
    if (this.honoursUpdate) this.persistent = params.persistent;
  }
  async writeFiles() {
    this.resumingCalls += 1;
  }
  async runCommand(params: { cmd: string; detached: true }) {
    this.resumingCalls += 1;
    this.commands.push(params);
    return {};
  }
  async stop() {
    this.sandboxStops += 1;
  }
}

function fakeDeps(sandbox: FakeSandbox) {
  const calls = { provision: 0, get: [] as string[], addBundle: 0 };
  const deps: SandboxDeps = {
    async provision() {
      calls.provision += 1;
      return { sandbox, addBundle: async () => void (calls.addBundle += 1) };
    },
    async get(name) {
      calls.get.push(name);
      if (name !== sandbox.name) throw new Error('not_found');
      return sandbox;
    },
  };
  return { deps, calls };
}

function job(over: Partial<JobRecord> = {}): JobRecord {
  const now = Date.now();
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    principal: 'ip:test',
    userId: null,
    ipHash: 'test',
    tier: 'anonymous',
    projectName: 'Lower third',
    jobTokenHash: 'x',
    workerSecretHash: 'y',
    state: 'provisioning',
    format: 'mp4',
    width: 1920,
    height: 1080,
    fps: 25,
    scale: 1,
    totalFrames: 50,
    manifestHash: 'h',
    executorRef: `${REF_PREFIX}sbx-test`,
    deadlineAt: now + 600_000,
    expiresAt: null,
    output: null,
    error: null,
    progress: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const manifest = { projectName: 'Lower third' } as unknown as RenderManifest;

async function withBlobToken<T>(fn: () => Promise<T>): Promise<T> {
  const before = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = before;
  }
}

async function memoryStore() {
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return getJobStore();
}

before(() => {
  // start() reads the worker from <repo>/render-worker; the compiled test tree has none.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  if (!path.basename(root).startsWith('.tmp-api-runtime-')) return; // a real checkout has the worker
  const worker = path.join(root, 'render-worker', 'sandbox-job.mjs');
  mkdirSync(path.dirname(worker), { recursive: true });
  writeFileSync(worker, '// test stand-in\n');
});

// ── Risk 1: persistence and resume ──────────────────────────────────────────

test('start switches persistence off before any other call and returns a name ref', async () => {
  const sandbox = new FakeSandbox('sbx-test', new FakeSession('running'));
  const { deps, calls } = fakeDeps(sandbox);
  const { executorRef } = await withBlobToken(() => new SandboxExecutor(deps).start(job(), manifest));
  assert.deepEqual(sandbox.updates, [{ persistent: false }]);
  assert.equal(sandbox.persistent, false);
  assert.equal(calls.addBundle, 1);
  assert.equal(sandbox.commands.length, 1);
  assert.equal(sandbox.commands[0].detached, true);
  assert.equal(executorRef, `${REF_PREFIX}sbx-test`);
  assert.equal(sandboxNameOf(executorRef), 'sbx-test');
});

test('start stops the sandbox and fails when persistence could not be switched off', async () => {
  const sandbox = new FakeSandbox('sbx-test', new FakeSession('running'), false);
  const { deps, calls } = fakeDeps(sandbox);
  await assert.rejects(
    withBlobToken(() => new SandboxExecutor(deps).start(job(), manifest)),
    /still persistent/,
  );
  assert.equal(sandbox.sandboxStops, 1);
  assert.equal(calls.addBundle, 0);
  assert.equal(sandbox.commands.length, 0);
});

test('progress is read through the session, never a resuming Sandbox call', async () => {
  const session = new FakeSession('running', JSON.stringify({ state: 'rendering', progress: 0.5, totalFrames: 50 }));
  const sandbox = new FakeSandbox('sbx-test', session);
  const { deps } = fakeDeps(sandbox);
  const p = await new SandboxExecutor(deps).readProgress(job());
  assert.equal(p?.state, 'rendering');
  assert.equal(p?.progress, 0.5);
  assert.equal(session.reads, 1);
  assert.equal(sandbox.resumingCalls, 0);
});

test('a completed progress file carries the Blob URL as the output', async () => {
  const session = new FakeSession(
    'running',
    JSON.stringify({ state: 'complete', progress: 1, blobUrl: 'https://blob.example/renders/x.mp4', outputBytes: 1234 }),
  );
  const { deps } = fakeDeps(new FakeSandbox('sbx-test', session));
  const p = await new SandboxExecutor(deps).readProgress(job());
  assert.deepEqual(p?.output, { url: 'https://blob.example/renders/x.mp4', bytes: 1234, contentType: 'video/mp4' });
});

for (const status of ['stopped', 'stopping', 'failed', 'aborted']) {
  test(`polling a ${status} sandbox after expiry reads nothing and resumes nothing`, async () => {
    const session = new FakeSession(status, JSON.stringify({ state: 'rendering', progress: 0.9 }));
    const sandbox = new FakeSandbox('sbx-test', session);
    const { deps } = fakeDeps(sandbox);
    const executor = new SandboxExecutor(deps);
    const store = await memoryStore();
    const expired = job({ deadlineAt: Date.now() - 1 });
    await store.create(expired);

    const after = await reconcileJob(expired, store, executor);
    await new Promise((r) => setTimeout(r, 0)); // the reconciler's stop is fire-and-forget

    assert.equal(after.state, 'failed');
    assert.equal(after.error?.code, 'sandbox_lost');
    assert.equal(session.reads, 0, 'no file read on an ended session');
    assert.equal(session.stops, 0, 'no stop on an ended session');
    assert.equal(sandbox.resumingCalls, 0, 'no Sandbox-level call that could resume it');
  });
}

test('stop stops a running session, and a second stop is a no-op', async () => {
  const session = new FakeSession('running');
  const sandbox = new FakeSandbox('sbx-test', session);
  const { deps } = fakeDeps(sandbox);
  const executor = new SandboxExecutor(deps);
  await executor.stop(job());
  await executor.stop(job());
  assert.equal(session.stops, 1);
  assert.equal(sandbox.resumingCalls, 0);
});

// ── Risk 2: explicit provisioning ───────────────────────────────────────────

test('start refuses a sandbox that is not on the Amazon Linux node24 runtime', async () => {
  for (const runtime of [undefined, 'node22']) {
    const sandbox = new FakeSandbox('sbx-test', new FakeSession('running'));
    sandbox.runtime = runtime;
    const { deps, calls } = fakeDeps(sandbox);
    await assert.rejects(withBlobToken(() => new SandboxExecutor(deps).start(job(), manifest)), /expected node24/);
    assert.equal(sandbox.sandboxStops, 1);
    assert.equal(calls.addBundle, 0);
  }
});

test('the installed @remotion/vercel still provisions node24 and installs with dnf', () => {
  // start() relies on this pairing; a Remotion upgrade that changes either must be looked at.
  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve('@remotion/vercel/package.json'));
  const src = readFileSync(path.join(pkgDir, 'dist', 'esm', 'index.mjs'), 'utf8');
  const create = src.slice(src.indexOf('async function createSandbox('));
  assert.match(create.slice(0, 800), new RegExp(`runtime: "${SANDBOX_RUNTIME}"`));
  assert.match(src, /cmd: "sudo",\s*args: \[\s*"dnf"/);
});

// ── Risk 3: a 1.x sandboxId held across the deploy ──────────────────────────

test('a 1.x sandboxId is never looked up, and the job fails through the deadline path', async () => {
  const sandbox = new FakeSandbox('sbx_legacy1x', new FakeSession('running', '{"state":"rendering","progress":0.5}'));
  const { deps, calls } = fakeDeps(sandbox);
  const executor = new SandboxExecutor(deps);
  const store = await memoryStore();

  const live = job({ executorRef: 'sbx_legacy1x' });
  await store.create(live);
  assert.equal(await executor.readProgress(live), null);
  assert.equal((await reconcileJob(live, store, executor)).state, 'provisioning', 'before the deadline it waits');

  const expired = job({ executorRef: 'sbx_legacy1x', deadlineAt: Date.now() - 1 });
  await store.create(expired);
  const after = await reconcileJob(expired, store, executor);
  await executor.stop(expired);
  assert.equal(after.state, 'failed');
  assert.equal(after.error?.code, 'sandbox_lost');
  assert.deepEqual(calls.get, [], 'Sandbox.get was never called with a 1.x id');
});

test('sandboxNameOf accepts only this executor\'s refs', () => {
  assert.equal(sandboxNameOf(null), null);
  assert.equal(sandboxNameOf('sbx_abc'), null);
  assert.equal(sandboxNameOf(REF_PREFIX), null);
  assert.equal(sandboxNameOf(`${REF_PREFIX}abc`), 'abc');
});
