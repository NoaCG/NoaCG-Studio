import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { before, test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { RenderManifest } from '../../src/render/manifest.js';
import type { JobRecord, JobStore } from './jobStore.js';
import { getJobStore } from './jobStore.js';
import { endJob, launchJob, reconcileJob } from './reconcile.js';
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
  async readFileToBuffer(): Promise<Buffer | null> {
    this.reads += 1;
    if (this.status !== 'running') throw new Error('sandbox_stopped');
    return this.progress === null ? null : Buffer.from(this.progress);
  }
  async stop(_opts?: { signal: AbortSignal }): Promise<void> {
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
  async stop(_opts?: { signal: AbortSignal }): Promise<void> {
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

// Vercel freezes a function once it has answered, so a stop still in flight at that point often
// never reaches the sandbox. The stop here takes a real timer tick, as a network call does.
class SlowStopSession extends FakeSession {
  async stop() {
    await new Promise((r) => setTimeout(r, 5));
    await super.stop();
  }
}

class UnreadableSession extends SlowStopSession {
  async readFileToBuffer(): Promise<Buffer | null> {
    throw new Error('unreachable');
  }
}

const endings = [
  {
    name: 'a completed job',
    session: () =>
      new SlowStopSession('running', JSON.stringify({ state: 'complete', progress: 1, blobUrl: 'https://blob.example/x.mp4' })),
    over: {},
    state: 'complete',
  },
  {
    name: 'a failed job',
    session: () => new SlowStopSession('running', JSON.stringify({ state: 'failed', progress: 0.5 })),
    over: {},
    state: 'failed',
  },
  {
    name: 'a job past its deadline',
    session: () => new UnreadableSession('running'),
    over: { deadlineAt: Date.now() - 1 },
    state: 'failed',
  },
];

for (const ending of endings) {
  test(`${ending.name} has its sandbox stopped before the status answer goes out`, async () => {
    const session = ending.session();
    const { deps } = fakeDeps(new FakeSandbox('sbx-test', session));
    const store = await memoryStore();
    const record = job(ending.over);
    await store.create(record);

    const after = await reconcileJob(record, store, new SandboxExecutor(deps));

    assert.equal(after.state, ending.state);
    assert.equal(session.stops, 1);
  });
}

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

// ── Issue #2026: a job ends while start() runs ──────────────────────────────

const secrets = { workerSecret: 'worker-secret' };

/** The store with every write failing, as when the ledger is unreachable. */
function failingWrites(store: JobStore): JobStore {
  const failing = Object.create(store) as JobStore;
  failing.update = async () => {
    throw new Error('render jobs update failed');
  };
  return failing;
}

/** A launch whose job is ended by `during` while the sandbox provisions. */
function launching(sandbox: FakeSandbox, during: () => Promise<unknown>): SandboxDeps {
  return {
    ...fakeDeps(sandbox).deps,
    async provision() {
      return { sandbox, addBundle: async () => void (await during()) };
    },
  };
}

const endingsDuringStart = [
  { name: 'a cancel', patch: { state: 'cancelled' } },
  { name: 'a deadline', patch: { state: 'failed', error: { code: 'sandbox_lost', message: 'lost' } } },
] as const;

for (const ending of endingsDuringStart) {
  test(`${ending.name} during start stops the sandbox start just returned`, async () => {
    const session = new FakeSession('running');
    const sandbox = new FakeSandbox('sbx-test', session);
    const store = await memoryStore();
    const record = job({ state: 'pending', executorRef: null });
    await store.create(record);
    const executor = new SandboxExecutor(
      launching(sandbox, () => store.update(record.id, ending.patch, { guardNonTerminal: true })),
    );

    await withBlobToken(() => launchJob(record, manifest, secrets, store, executor));

    assert.equal(session.stops, 1);
    const stored = await store.get(record.id);
    assert.equal(stored?.state, ending.patch.state);
    assert.equal(stored?.executorRef, null);
  });
}

test('a launch nothing interrupted records its ref and stops nothing', async () => {
  const session = new FakeSession('running');
  const store = await memoryStore();
  const record = job({ state: 'pending', executorRef: null });
  await store.create(record);
  const executor = new SandboxExecutor(fakeDeps(new FakeSandbox('sbx-test', session)).deps);

  await withBlobToken(() => launchJob(record, manifest, secrets, store, executor));

  assert.equal(session.stops, 0);
  const stored = await store.get(record.id);
  assert.equal(stored?.state, 'provisioning');
  assert.equal(stored?.executorRef, `${REF_PREFIX}sbx-test`);
});

test('a ledger write that throws after start still stops the sandbox', async () => {
  const session = new FakeSession('running');
  const store = await memoryStore();
  const record = job({ state: 'pending', executorRef: null });
  await store.create(record);
  const executor = new SandboxExecutor(fakeDeps(new FakeSandbox('sbx-test', session)).deps);

  await assert.rejects(withBlobToken(() => launchJob(record, manifest, secrets, failingWrites(store), executor)), /update failed/);

  assert.equal(session.stops, 1);
});

test('ending a job whose ledger write throws still stops the sandbox, and the error surfaces', async () => {
  const session = new FakeSession('running');
  const store = await memoryStore();
  const record = job();
  await store.create(record);
  const executor = new SandboxExecutor(fakeDeps(new FakeSandbox('sbx-test', session)).deps);

  await assert.rejects(endJob(record, { state: 'cancelled' }, failingWrites(store), executor), /update failed/);

  assert.equal(session.stops, 1);
  assert.equal((await store.get(record.id))?.state, 'provisioning');
});

test('a cancel that read the job before the launch wrote its ref still stops the sandbox', async () => {
  const session = new FakeSession('running');
  const store = await memoryStore();
  const record = job({ state: 'pending', executorRef: null });
  await store.create(record);
  const executor = new SandboxExecutor(fakeDeps(new FakeSandbox('sbx-test', session)).deps);

  const readByCancel = await store.get(record.id);
  await withBlobToken(() => launchJob(record, manifest, secrets, store, executor));
  const after = await endJob(readByCancel!, { state: 'cancelled' }, store, executor);

  assert.equal(after.state, 'cancelled');
  assert.equal(session.stops, 1);
});

// ── Issue #2026: a stop has a time limit ────────────────────────────────────

/** Never settles until the signal it was given aborts, as a hung Sandbox API does. */
function hang<T>(signal?: AbortSignal): Promise<T> {
  return new Promise<T>((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason));
  });
}

class HungStopSession extends FakeSession {
  async stop(opts?: { signal: AbortSignal }): Promise<void> {
    await hang(opts?.signal);
  }
}

/** Shorten the real timeout so a test need not wait for it, and report the limits asked for. */
function shortTimeouts(t: TestContext): number[] {
  const real = AbortSignal.timeout.bind(AbortSignal);
  const limits: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    limits.push(ms);
    return real(5);
  });
  t.mock.method(console, 'error', () => {});
  return limits;
}

function assertBounded(limits: number[]) {
  assert.ok(limits.length > 0);
  for (const ms of limits) assert.ok(ms > 0 && ms <= 30_000, `limit was ${ms} ms`);
}

class HungReadSession extends FakeSession {
  async readFileToBuffer(_file?: { path: string }, opts?: { signal: AbortSignal }): Promise<Buffer | null> {
    return hang<Buffer | null>(opts?.signal);
  }
}

const hungLookup: SandboxDeps = {
  ...fakeDeps(new FakeSandbox('sbx-test', new FakeSession('running'))).deps,
  get: (_name, signal) => hang<SandboxLike>(signal),
};

test('a hung progress read cannot hold up a status answer: the job waits for the next poll', { timeout: 2000 }, async (t) => {
  const limits = shortTimeouts(t);
  const store = await memoryStore();
  const record = job();
  await store.create(record);
  const { deps } = fakeDeps(new FakeSandbox('sbx-test', new HungReadSession('running')));

  const after = await reconcileJob(record, store, new SandboxExecutor(deps));

  assert.equal(after.state, 'provisioning');
  assertBounded(limits);
});

test('a hung lookup cannot hold up a progress read', { timeout: 2000 }, async (t) => {
  const limits = shortTimeouts(t);

  assert.equal(await new SandboxExecutor(hungLookup).readProgress(job()), null);

  assertBounded(limits);
});

test('a hung stop cannot hold up the status answer that finishes a job', { timeout: 2000 }, async (t) => {
  const limits = shortTimeouts(t);
  const session = new HungStopSession(
    'running',
    JSON.stringify({ state: 'complete', progress: 1, blobUrl: 'https://blob.example/x.mp4' }),
  );
  const store = await memoryStore();
  const record = job();
  await store.create(record);

  const after = await reconcileJob(record, store, new SandboxExecutor(fakeDeps(new FakeSandbox('sbx-test', session)).deps));

  assert.equal(after.state, 'complete');
  assertBounded(limits);
});

test('a hung lookup is held to the same limit as the stop', { timeout: 2000 }, async (t) => {
  const limits = shortTimeouts(t);

  await new SandboxExecutor(hungLookup).stop(job());

  assertBounded(limits);
});

test('a hung stop after a failed launch cannot hold up the failure', { timeout: 2000 }, async (t) => {
  const limits = shortTimeouts(t);
  const sandbox = new FakeSandbox('sbx-test', new FakeSession('running'), false);
  sandbox.stop = async (opts?: { signal: AbortSignal }) => {
    sandbox.sandboxStops += 1;
    await hang(opts?.signal);
  };

  await assert.rejects(
    withBlobToken(() => new SandboxExecutor(fakeDeps(sandbox).deps).start(job(), manifest)),
    /still persistent/,
  );

  assert.equal(sandbox.sandboxStops, 1);
  assertBounded(limits);
});

// ── Issue #2026: what a stop that fails logs ────────────────────────────────

/** The fields of the SDK's APIError that the executor reads. */
function apiError(status: number, code?: string): Error {
  return Object.assign(new Error('from the Sandbox API'), { response: { status }, json: { error: { code } } });
}

class FailingStopSession extends FakeSession {
  constructor(private failure: Error) {
    super('running');
  }
  async stop(): Promise<void> {
    throw this.failure;
  }
}

const raceEndings = [
  { name: '404', err: apiError(404) },
  { name: '410', err: apiError(410) },
  { name: '422 sandbox_stopping', err: apiError(422, 'sandbox_stopping') },
];

for (const race of raceEndings) {
  test(`a ${race.name} from a stop that races the session's end logs nothing`, async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const { deps } = fakeDeps(new FakeSandbox('sbx-test', new FailingStopSession(race.err)));
    await new SandboxExecutor(deps).stop(job());
    assert.equal(logged.mock.callCount(), 0);
  });
}

test('a 404 from the lookup logs nothing: the sandbox is already gone', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const deps: SandboxDeps = {
    ...fakeDeps(new FakeSandbox('sbx-test', new FakeSession('running'))).deps,
    get: async () => {
      throw apiError(404);
    },
  };
  await new SandboxExecutor(deps).stop(job());
  assert.equal(logged.mock.callCount(), 0);
});

for (const failure of [
  { name: 'a 500', err: apiError(500), status: 500 },
  { name: 'a 422 for another reason', err: apiError(422, 'bad_request'), status: 422 },
  { name: 'a network error', err: new Error('fetch failed'), status: '' },
]) {
  test(`${failure.name} from a stop is logged, because the VM keeps billing`, async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const { deps } = fakeDeps(new FakeSandbox('sbx-test', new FailingStopSession(failure.err)));
    await new SandboxExecutor(deps).stop(job());
    assert.equal(logged.mock.callCount(), 1);
    assert.deepEqual(logged.mock.calls[0].arguments, ['sandbox stop failed:', failure.status, failure.err.message]);
  });
}

test('a stop that fails after a failed launch is logged, and the launch error still surfaces', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const sandbox = new FakeSandbox('sbx-test', new FakeSession('running'), false);
  sandbox.stop = async () => {
    throw apiError(500);
  };

  await assert.rejects(
    withBlobToken(() => new SandboxExecutor(fakeDeps(sandbox).deps).start(job(), manifest)),
    /still persistent/,
  );

  assert.equal(logged.mock.callCount(), 1);
});
