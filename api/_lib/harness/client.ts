// The NoaCG harness's client for Claude Managed Agents (docs/work-specs/noacg-harness/spec.md
// D8, D9, D11, sections 3.1 and 7.3): start one session per graphic with its brief and its
// budget, read where it is, collect the handed-in record, and delete everything afterwards.
//
// No route reaches this module yet. The bench (`benchmarks/harness/`, `scripts/harness-bench.mjs`)
// is its first caller; the product's server (H9) reuses it behind the engine interface, so what
// the bench measured is what students get. It takes the SDK as an argument (`ManagedAgentsApi`,
// the few calls it makes) so the bench and the tests can hand it a stub that replays the
// documented event and file shapes (`managedAgentsStub.ts`) and no test ever calls Anthropic.
//
// The shapes are the SDK's own types (@anthropic-ai/sdk, `client.beta.sessions` and
// `client.beta.files`, beta `managed-agents-2026-04-01`). Lib is ES2020 here: Vercel typechecks
// api/ with the root tsconfig (api/AGENTS.md), so nothing newer than ES2020 is used.

import type Anthropic from '@anthropic-ai/sdk';

type Session = Anthropic.Beta.Sessions.BetaManagedAgentsSession;
type SessionCreateParams = Anthropic.Beta.Sessions.SessionCreateParams;
type SessionEvent = Anthropic.Beta.Sessions.BetaManagedAgentsSessionEvent;
type StatusIdleEvent = Anthropic.Beta.Sessions.BetaManagedAgentsSessionStatusIdleEvent;
type EventSendParams = Anthropic.Beta.Sessions.EventSendParams;
type FileMetadata = Anthropic.Beta.BetaFileMetadata;

/** The beta every Managed Agents call carries; the files list needs it named (it filters by session). */
export const MANAGED_AGENTS_BETA = 'managed-agents-2026-04-01';
/** The library record `noacg record` writes to `/mnt/session/outputs/`, and the package zip beside it. */
export const RECORD_FILE = 'record.json';
export const RECORD_ZIP = 'record.zip';

/** The calls this client makes, as the SDK types them. A real `new Anthropic()` satisfies it. */
export interface ManagedAgentsApi {
  beta: {
    sessions: {
      create(params: SessionCreateParams): PromiseLike<Session>;
      retrieve(sessionId: string): PromiseLike<Session>;
      delete(sessionId: string): PromiseLike<unknown>;
      events: {
        list(sessionId: string, params?: { limit?: number }): AsyncIterable<SessionEvent>;
        send(sessionId: string, params: EventSendParams): PromiseLike<unknown>;
      };
    };
    files: {
      list(params: { scope_id: string; betas: string[] }): AsyncIterable<FileMetadata>;
      download(fileId: string): PromiseLike<{ arrayBuffer(): Promise<ArrayBuffer> }>;
      delete(fileId: string): PromiseLike<unknown>;
    };
  };
}

export interface StartRequest {
  /** The agent and the version the sync recorded (`agents/noacg-harness/claude-lock.*.json`). */
  agent: { id: string; version: number };
  environmentId: string;
  /** What the student typed. */
  brief: string;
  /** The registered type the student named, if any. */
  type?: string | null;
  /** The session's hard spend cap, in US cents. */
  budgetCents: number;
  /** Our run id, carried as session metadata so a sweep can find the run row. */
  runId: string;
  title?: string;
  /** Files mounted into the session (the CLI tarball while the verbs are unpublished). */
  files?: Array<{ fileId: string; mountPath: string }>;
}

/** The one user message a session starts with: the brief and the type, nothing of NoaCG's. */
export function briefMessage(brief: string, type?: string | null): string {
  const lines = [`Brief: ${brief.trim()}`];
  if (type) lines.push(`Graphic type: ${type} (the user chose it).`);
  return lines.join('\n');
}

/** The session create body. Exported so a test can pin exactly what crosses the boundary (AC-10). */
export function sessionCreateParams(req: StartRequest): SessionCreateParams {
  if (!Number.isInteger(req.budgetCents) || req.budgetCents <= 0) throw new Error(`budgetCents must be a positive whole number of cents, got ${req.budgetCents}`);
  return {
    agent: { type: 'agent', id: req.agent.id, version: req.agent.version },
    environment_id: req.environmentId,
    title: req.title ?? `noacg-harness ${req.runId}`,
    budget: { type: 'limit', max_list_cost: { amount: String(req.budgetCents), currency: 'USD' } },
    metadata: { run_id: req.runId },
    resources: (req.files ?? []).map((f) => ({ type: 'file' as const, file_id: f.fileId, mount_path: f.mountPath })),
    initial_events: [{ type: 'user.message', content: [{ type: 'text', text: briefMessage(req.brief, req.type) }] }],
  };
}

export async function startSession(api: ManagedAgentsApi, req: StartRequest): Promise<{ sessionId: string; status: Session['status'] }> {
  const session = await api.beta.sessions.create(sessionCreateParams(req));
  return { sessionId: session.id, status: session.status };
}

/** Where a session's work stands. `delivered` and `not-ready` have a record to collect. */
export type Completion =
  | { state: 'running' }
  | { state: 'delivered' }
  | { state: 'not-ready'; reason: 'budget_reached' | 'agent_not_ready' }
  | { state: 'failed'; reason: 'retries_exhausted' | 'refusal' | 'requires_action' | 'terminated' };

/**
 * The session's state from its status and its latest `session.status_idle`. Idle with `end_turn`
 * is the end of the work: the agent has no custom tools, the web tools are off and no workflow can
 * stay open behind an idle (D4), so nothing waits on us. `budget_reached` is the platform pausing
 * at the cap: not finished, the last record is the best validated version. A `requires_action`
 * cannot happen with that toolset and is treated as a failure if it ever does.
 */
export function completionOf(status: Session['status'], lastIdle: StatusIdleEvent | null): Completion {
  if (status === 'running' || status === 'rescheduling') return { state: 'running' };
  if (status === 'terminated') return lastIdle && lastIdle.stop_reason.type === 'end_turn' ? { state: 'delivered' } : { state: 'failed', reason: 'terminated' };
  if (!lastIdle) return { state: 'running' };
  switch (lastIdle.stop_reason.type) {
    case 'end_turn':
      return { state: 'delivered' };
    case 'budget_reached':
      return { state: 'not-ready', reason: 'budget_reached' };
    default:
      return { state: 'failed', reason: lastIdle.stop_reason.type };
  }
}

/** The session's settled list cost in US cents (`usage.list_cost`, the figure its budget meters). */
export function listCostCents(session: Pick<Session, 'usage'>): number {
  const cost = session.usage && session.usage.list_cost;
  if (!cost) return 0;
  if (cost.currency !== 'USD') throw new Error(`a list cost in ${cost.currency}, not USD`);
  const cents = Number(cost.amount);
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`list_cost.amount "${cost.amount}" is not a whole number of cents`);
  return cents;
}

/** What the student reads while the agent runs each `noacg` verb. */
const PROGRESS: Record<string, string> = {
  doctor: 'Getting ready',
  types: 'Choosing a starting point',
  scaffold: 'Designing',
  validate: 'Checking the graphic',
  screenshot: 'Looking at it',
  inspect: 'Checking the controls',
  coverage: 'Checking every state',
  record: 'Handing it in',
};

/** The plain progress line a `noacg` verb the agent ran stands for, or null. */
export function progressLine(event: SessionEvent): string | null {
  if (event.type !== 'agent.tool_use') return null;
  const command = typeof event.input.command === 'string' ? event.input.command : '';
  const verb = /(?:^|[\s;&|(])noacg\s+([a-z]+)/.exec(command);
  return (verb && PROGRESS[verb[1]]) || null;
}

/** The agent's own verdict on its hand-in, from its last message: the system prompt asks it to end
 *  with `DELIVERED` or `NOT READY: <why>`. A session that ends its turn saying it is not ready is
 *  not a delivery, whatever its stop reason. */
export function agentVerdict(lastMessage: string): { notReady: boolean; why: string | null } {
  const m = /NOT READY\s*:?\s*(.*)$/m.exec(lastMessage);
  return m ? { notReady: true, why: m[1].trim() || null } : { notReady: false, why: null };
}

export interface SessionReading {
  status: Session['status'];
  completion: Completion;
  costCents: number;
  /** The progress lines so far, oldest first, a repeat of the previous line left out. */
  progress: string[];
  /** Every `noacg` command the agent ran, in order: the trace the bench keeps. */
  commands: string[];
  /** The sources' digest each of those commands printed (`validate --json`, `coverage`, `record`). */
  digests: Array<{ command: string; digest: string | null }>;
  /** The digest of the last `validate` or `coverage` that printed one: the version last looked at. */
  lastReviewedDigest: string | null;
  /** The text of the agent's last message, where it says DELIVERED or NOT READY. */
  lastMessage: string;
  events: number;
}

const DIGEST = /sha256:[0-9a-f]{64}/;

/** The text of an event's content blocks. */
function textOf(content: ReadonlyArray<{ type: string; text?: string }> | undefined): string {
  return (content || []).map((block) => (block.type === 'text' ? block.text || '' : '')).join('\n');
}

/** One read of a session: its status, cost and the events so far. Safe to repeat. */
export async function readSession(api: ManagedAgentsApi, sessionId: string): Promise<SessionReading> {
  const session = await api.beta.sessions.retrieve(sessionId);
  let lastIdle: StatusIdleEvent | null = null;
  const progress: string[] = [];
  const commands: string[] = [];
  const digests: SessionReading['digests'] = [];
  const pending = new Map<string, number>();
  let events = 0;
  let lastMessage = '';
  for await (const event of api.beta.sessions.events.list(sessionId, { limit: 1000 })) {
    events++;
    if (event.type === 'session.status_idle') lastIdle = event;
    if (event.type === 'agent.message') lastMessage = textOf(event.content);
    if (event.type === 'agent.tool_use' && typeof event.input.command === 'string' && /\bnoacg\s/.test(event.input.command)) {
      commands.push(event.input.command);
      pending.set(event.id, digests.push({ command: event.input.command, digest: null }) - 1);
    }
    if (event.type === 'agent.tool_result' && pending.has(event.tool_use_id)) {
      const found = DIGEST.exec(textOf(event.content));
      digests[pending.get(event.tool_use_id) as number].digest = found ? found[0] : null;
    }
    const line = progressLine(event);
    if (line && progress[progress.length - 1] !== line) progress.push(line);
  }
  let lastReviewedDigest: string | null = null;
  for (const d of digests) if (d.digest && /\bnoacg\s+(validate|coverage)\b/.test(d.command)) lastReviewedDigest = d.digest;
  let completion = completionOf(session.status, lastIdle);
  if (completion.state === 'delivered' && agentVerdict(lastMessage).notReady) completion = { state: 'not-ready', reason: 'agent_not_ready' };
  return { status: session.status, completion, costCents: listCostCents(session), progress, commands, digests, lastReviewedDigest, lastMessage, events };
}

/** The session's status alone: what a poll needs, without paging through its whole history. */
export async function sessionStatus(api: ManagedAgentsApi, sessionId: string): Promise<Session['status']> {
  return (await api.beta.sessions.retrieve(sessionId)).status;
}

/** The files the session wrote to its outputs, as the Files API lists them by session. */
export async function listOutputs(api: ManagedAgentsApi, sessionId: string): Promise<FileMetadata[]> {
  const files: FileMetadata[] = [];
  for await (const f of api.beta.files.list({ scope_id: sessionId, betas: [MANAGED_AGENTS_BETA] })) files.push(f);
  return files;
}

export async function downloadFile(api: ManagedAgentsApi, fileId: string): Promise<Uint8Array> {
  const response = await api.beta.files.download(fileId);
  return new Uint8Array(await response.arrayBuffer());
}

/** The record and its zip among a session's outputs, if the agent handed one in. */
export function handIn(files: FileMetadata[]): { record: FileMetadata | null; zip: FileMetadata | null } {
  // The newest of that name: an agent records after every clean validate.
  const named = (name: string): FileMetadata | null =>
    files
      .filter((f) => f.filename === name || f.filename.endsWith(`/${name}`))
      .reduce<FileMetadata | null>((newest, f) => (!newest || f.created_at > newest.created_at ? f : newest), null);
  return { record: named(RECORD_FILE), zip: named(RECORD_ZIP) };
}

const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e ? (e as { status?: unknown }).status : undefined);

/** The call's result, or null when what it names is already gone (404); any other error throws. */
async function unless404<T>(call: PromiseLike<T>): Promise<T | null> {
  try {
    return await call;
  } catch (e) {
    if (statusOf(e) === 404) return null;
    throw e;
  }
}

/** True once the session answers not found: it, its events and its sandbox are gone. */
export async function sessionGone(api: ManagedAgentsApi, sessionId: string): Promise<boolean> {
  return (await unless404(api.beta.sessions.retrieve(sessionId))) === null;
}

export interface DisposeOptions {
  /** How long to wait for an interrupted session to go idle before deleting it. */
  waitMs?: number;
  /** Time between status reads while waiting. */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Stop a session that is still working: interrupt it and wait until it is idle, so its cost is
 * final before anyone reads it. Returns the session, or null when it is already gone.
 */
export async function settleSession(api: ManagedAgentsApi, sessionId: string, opts: DisposeOptions = {}): Promise<Session | null> {
  const sleep = opts.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const waitMs = opts.waitMs === undefined ? 60_000 : opts.waitMs;
  const pollMs = opts.pollMs === undefined ? 2_000 : opts.pollMs;
  let session = await unless404(api.beta.sessions.retrieve(sessionId));
  if (session && (session.status === 'running' || session.status === 'rescheduling')) {
    await api.beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }] });
    const until = Date.now() + waitMs;
    while (session.status === 'running' || session.status === 'rescheduling') {
      if (Date.now() > until) throw new Error(`session ${sessionId} was still ${session.status} ${waitMs} ms after the interrupt`);
      await sleep(pollMs);
      session = await api.beta.sessions.retrieve(sessionId);
    }
  }
  return session;
}

/**
 * Delete what a session left: its output files, then the session itself (with its events and
 * sandbox). A running session cannot be deleted, so it is settled first. Retry-safe: a session or
 * file already gone counts as deleted.
 */
export async function disposeSession(api: ManagedAgentsApi, sessionId: string, opts: DisposeOptions = {}): Promise<{ filesDeleted: number; sessionDeleted: boolean }> {
  const session = await settleSession(api, sessionId, opts);
  const deleted = await Promise.all((await listOutputs(api, sessionId)).map((f) => unless404(api.beta.files.delete(f.id))));
  if (session) await unless404(api.beta.sessions.delete(sessionId));
  return { filesDeleted: deleted.filter((d) => d !== null).length, sessionDeleted: true };
}
